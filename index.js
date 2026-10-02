import { extension_settings } from '../../../extensions.js';
import {
    chat,
    characters,
    this_chid,
    event_types,
    eventSource,
    saveSettingsDebounced,
    setExtensionPrompt,
    extension_prompt_types,
    chat_metadata,
    saveChatDebounced,
} from '../../../../script.js';
import { getContext } from '../../../st-context.js';
import { getTokenCountAsync } from '../../../tokenizers.js';
import { power_user } from '../../../power-user.js';

const extensionName = 'error';

const WARN_THRESHOLD = 0.8; // 上下文占用超过 80% 弹窗提醒

// —— 时间插件配置 ——
const TIME_CARD_POSITION = extension_prompt_types.IN_CHAT; // 1：注入到聊天里，靠近结尾
const TIME_CARD_DEPTH = 1;                                 // 深度 1，太深模型会忽略
const DEFAULT_ADVANCE_MINUTES = 5;                         // AI 没输出时间块时，每轮兜底推进 5 分钟
const START_DAY = 1;
const START_MINUTE = 480; // 08:00

const TIME_BLOCK_RE = /<time>([^<]+)<\/time>/i;

// 中文相对时间词表（分钟偏移）
const RELATIVE_TIME = {
    '昨天': -1440, '今天': 0, '明天': 1440,
    '前天': -2880, '后天': 2880,
    '刚刚': -5, '刚才': -10, '不久前': -60,
    '前几天': -4320, '上周': -10080, '上个月': -43200, '去年': -525600,
};

// ---------------- 状态 ----------------
let settings = null;         // 当前角色的数据（上下文功能用的全局扩展设置，这里暂时只存时间开关）
let activeChar = '';         // 当前绑定角色显示名
let isExtracting = false;    // 时间提取进行中（防并发，保留给手动「立即提取」）
let isRealGeneration = false;// 当前是否在进行真实剧情生成（排除 quiet 调用污染上下文统计）
let contextTokens = 0;
let contextMax = 0;
let contextUpdatedAt = 0;

// 旧版酒馆没有 GENERATE_AFTER_COMBINE_PROMPTS 事件；没有时上下文统计退化为估算聊天文本
const HAS_AFTER_COMBINE = !!(event_types && event_types.GENERATE_AFTER_COMBINE_PROMPTS);

// ---------------- 时间轴数据模型（存 chat_metadata，每聊天独立，不串档） ----------------
function freshTimeState() {
    return {
        version: 1,
        clock: { day: START_DAY, minuteOfDay: START_MINUTE, dayLength: 1440, paused: false },
        events: [],    // [{ id, day, minuteOfDay, turn, messageId, summary, location, importance }]
        conflicts: [], // 相对时间冲突警告 [{ id, text, day }]
    };
}

function getTimeState() {
    if (!chat_metadata || typeof chat_metadata !== 'object') return freshTimeState();
    let s = chat_metadata[extensionName];
    if (!s || typeof s !== 'object') {
        s = freshTimeState();
        chat_metadata[extensionName] = s;
    } else {
        if (!s.clock || typeof s.clock !== 'object') s.clock = freshTimeState().clock;
        if (typeof s.clock.day !== 'number') s.clock.day = START_DAY;
        if (typeof s.clock.minuteOfDay !== 'number') s.clock.minuteOfDay = START_MINUTE;
        if (typeof s.clock.dayLength !== 'number') s.clock.dayLength = 1440;
        if (s.clock.paused === undefined) s.clock.paused = false;
        if (!Array.isArray(s.events)) s.events = [];
        if (!Array.isArray(s.conflicts)) s.conflicts = [];
        s.version = 1;
    }
    return s;
}

function saveChat() { saveChatDebounced(); }

// ---------------- 工具 ----------------
function pad(n) { return String(n).padStart(2, '0'); }
function fmtHM(minuteOfDay) {
    const m = ((minuteOfDay % 1440) + 1440) % 1440;
    return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}
function fmtDaytime(day, minuteOfDay) {
    return `第${day}天 ${fmtHM(minuteOfDay)}`;
}
function periodOfDay(minuteOfDay) {
    const m = ((minuteOfDay % 1440) + 1440) % 1440;
    if (m < 300) return '深夜';
    if (m < 480) return '清晨';
    if (m < 660) return '上午';
    if (m < 780) return '中午';
    if (m < 1080) return '下午';
    if (m < 1200) return '傍晚';
    return '夜晚';
}
function fmtElapsed(minutes) {
    minutes = Math.max(0, Math.round(minutes));
    if (minutes < 60) return minutes + '分钟';
    if (minutes < 1440) return Math.floor(minutes / 60) + '小时' + (minutes % 60 ? (minutes % 60) + '分' : '');
    const d = Math.floor(minutes / 1440);
    const h = Math.floor((minutes % 1440) / 60);
    return d + '天' + (h ? h + '小时' : '');
}
function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtNow(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---------------- 时钟推进 / 解析 ----------------
function advanceClock(clock, minutes) {
    const dayLength = clock.dayLength || 1440;
    const total = (clock.minuteOfDay || 0) + minutes;
    clock.day = (clock.day || START_DAY) + Math.floor(total / dayLength);
    clock.minuteOfDay = ((total % dayLength) + dayLength) % dayLength;
}

// 解析 AI 输出的时间块：<time>第27天 06:50 | +10m | 北境营地</time>
function parseTimeBlock(text) {
    if (typeof text !== 'string') return null;
    const m = text.match(TIME_BLOCK_RE);
    if (!m) return null;
    const raw = m[1].trim();
    const parts = raw.split('|').map(s => s.trim()).filter(Boolean);
    const seg1 = parts[0] || '';

    let day = null, minuteOfDay = null;
    const dayMatch = seg1.match(/第\s*(\d+)\s*天/);
    if (dayMatch) day = parseInt(dayMatch[1], 10);
    const timeMatch = seg1.match(/(\d{1,2}):(\d{2})/);
    if (timeMatch) minuteOfDay = parseInt(timeMatch[1], 10) * 60 + parseInt(timeMatch[2], 10);

    let deltaMinutes = null;
    const deltaMatch = raw.match(/\+(\d+)\s*(天|d|h|m)/i);
    if (deltaMatch) {
        const v = parseInt(deltaMatch[1], 10);
        const u = deltaMatch[2].toLowerCase();
        deltaMinutes = (u === '天' || u === 'd') ? v * 1440 : (u === 'h' ? v * 60 : v);
    }

    let location = '';
    if (parts.length >= 3) location = parts[2];
    else if (parts.length === 2 && !deltaMatch) location = parts[1];

    return { day, minuteOfDay, deltaMinutes, location, raw };
}

// 应用解析结果推进时钟
function applyParsed(clock, parsed) {
    if (!parsed) { advanceClock(clock, DEFAULT_ADVANCE_MINUTES); return; }
    if (parsed.day != null && parsed.minuteOfDay != null) {
        clock.day = parsed.day;
        clock.minuteOfDay = parsed.minuteOfDay;
    } else if (parsed.deltaMinutes != null) {
        advanceClock(clock, parsed.deltaMinutes);
    } else if (parsed.day != null) {
        clock.day = parsed.day;
    } else if (parsed.minuteOfDay != null) {
        clock.minuteOfDay = parsed.minuteOfDay;
    } else {
        advanceClock(clock, DEFAULT_ADVANCE_MINUTES);
    }
}

// ---------------- 时间卡（每轮注入） ----------------
function buildTimeCard(state) {
    const c = state.clock;
    const lines = [];
    lines.push('【权威时间轴】');
    lines.push(`当前世界时间：${fmtDaytime(c.day, c.minuteOfDay)}（${periodOfDay(c.minuteOfDay)}）` + (c.paused ? '【时间已暂停】' : ''));

    // 上次场景结束 + 经过时长
    const lastEvent = state.events[state.events.length - 1];
    if (lastEvent) {
        const elapsed = (c.day - lastEvent.day) * c.dayLength + (c.minuteOfDay - lastEvent.minuteOfDay);
        lines.push(`上次场景结束：${fmtDaytime(lastEvent.day, lastEvent.minuteOfDay)}${elapsed > 0 ? `（已过 ${fmtElapsed(elapsed)}）` : ''}`);
    }

    // 最近事件（最多 3 条，避免上下文膨胀）
    const recent = state.events.slice(-3).reverse();
    if (recent.length) {
        lines.push('最近事件：');
        for (const e of recent) {
            const loc = e.location ? ` · ${e.location}` : '';
            const sum = e.summary ? ` ${e.summary}` : '';
            lines.push(`- ${fmtDaytime(e.day, e.minuteOfDay)}${loc}${sum}`);
        }
    }

    lines.push('');
    lines.push('规则：');
    lines.push('1. 引用过去的事件必须用绝对时间（第X天），禁止把超过1天前的事称为「昨天」。');
    lines.push('2. 不确定时写「第X天」或「数日前」。');
    lines.push('3. 回复开头输出时间块：<time>第X天 HH:MM | +时长 | 地点</time>；只是推进时间就写如 <time>+5m</time>。');
    lines.push('4. 若与时间轴冲突，以本时间轴为准。');

    return lines.join('\n');
}

function updateTimeInjection() {
    const state = getTimeState();
    const card = buildTimeCard(state);
    setExtensionPrompt('error_time', card, TIME_CARD_POSITION, TIME_CARD_DEPTH);
}

// ---------------- 相对时间校验（专治「昨天」） ----------------
function validateRelativeTimes(text, state) {
    if (typeof text !== 'string') return;
    for (const [word, offset] of Object.entries(RELATIVE_TIME)) {
        if (!text.includes(word)) continue;
        const implied = state.clock.day + offset / 1440;
        const already = state.conflicts.some(x => x.text === word && x.day === implied);
        if (already) continue;
        state.conflicts.push({
            id: 'c' + Date.now() + Math.random(),
            text: word,
            day: implied,
            msg: `AI 使用了「${word}」，对应绝对时间 ≈ 第${Math.round(implied)}天，请核对是否与事件日志一致`,
        });
    }
    if (state.conflicts.length > 20) state.conflicts = state.conflicts.slice(-20);
}

// ---------------- 消息绑定 / 时间线重建 ----------------
function boundTime(m) {
    const t = m && m.extra && m.extra[extensionName];
    return (t && typeof t.day === 'number') ? t : null;
}
function bindTime(m, clock, turn) {
    if (!m || !m.extra || typeof m.extra !== 'object') m.extra = {};
    m.extra[extensionName] = { day: clock.day, minuteOfDay: clock.minuteOfDay, turn };
}

// 从某条消息开始往前重放，重建时间线（编辑/删除/swipe 后回滚）
function rebuildTimeline(fromIndex = 0) {
    const state = getTimeState();
    const dayLength = state.clock.dayLength || 1440;

    if (fromIndex <= 0) {
        state.clock.day = START_DAY;
        state.clock.minuteOfDay = START_MINUTE;
        state.events = [];
    } else {
        const prev = chat[fromIndex - 1];
        const pt = boundTime(prev);
        if (pt) { state.clock.day = pt.day; state.clock.minuteOfDay = pt.minuteOfDay; }
    }

    for (let i = fromIndex; i < chat.length; i++) {
        const m = chat[i];
        if (!m || m.is_system) continue;
        if (m.is_user) {
            bindTime(m, state.clock, i);
            continue;
        }
        // AI 消息：解析时间块推进
        const before = { day: state.clock.day, minuteOfDay: state.clock.minuteOfDay };
        applyParsed(state.clock, parseTimeBlock(m.mes));
        bindTime(m, state.clock, i);
        // 记录事件（轻量：地点 + 短摘要）
        const parsed = parseTimeBlock(m.mes);
        const loc = parsed && parsed.location ? parsed.location : '';
        const summary = (m.mes || '').replace(TIME_BLOCK_RE, '').trim().slice(0, 40);
        state.events.push({
            id: 'e' + i + '_' + Date.now(),
            day: state.clock.day,
            minuteOfDay: state.clock.minuteOfDay,
            turn: i,
            messageId: m.mesId,
            location: loc,
            summary,
            importance: 0,
        });
        void before;
    }
    state.conflicts = state.conflicts.filter(c => false); // 重建后冲突重算（见 validateAll）
    validateAll();
    saveChat();
}

function validateAll() {
    const state = getTimeState();
    state.conflicts = [];
    const last = chat[chat.length - 1];
    if (last && !last.is_user && !last.is_system) validateRelativeTimes(last.mes, state);
}

// ---------------- 时间 UI 渲染 ----------------
function renderTime() {
    const state = getTimeState();
    const el = $('#error_container .st-err__clock');
    if (el.length) {
        el.html(`${fmtDaytime(state.clock.day, state.clock.minuteOfDay)}<span class="st-err__clock-per">${periodOfDay(state.clock.minuteOfDay)}</span>`);
        el.toggleClass('is-paused', !!state.clock.paused);
    }

    // 事件日志
    const log = $('#error_container .st-err__events');
    if (log.length) {
        if (!state.events.length) {
            log.html('<div class="st-err__empty">暂无事件。AI 每轮回复后会自动记录时间节点。</div>');
        } else {
            const items = state.events.slice(-30).reverse().map(e => {
                const loc = e.location ? `<span class="st-err__ev-loc">${escapeHtml(e.location)}</span>` : '';
                const sum = e.summary ? `<span class="st-err__ev-sum">${escapeHtml(e.summary)}</span>` : '';
                return `<div class="st-err__ev"><span class="st-err__ev-t">${fmtDaytime(e.day, e.minuteOfDay)}</span>${loc}${sum}</div>`;
            });
            log.html(items.join(''));
        }
    }

    // 冲突警告
    const conflicts = $('#error_container .st-err__conflicts');
    if (conflicts.length) {
        if (!state.conflicts.length) {
            conflicts.html('');
        } else {
            conflicts.html(state.conflicts.map(c => `<div class="st-err__conflict">⚠ ${escapeHtml(c.msg)}</div>`).join(''));
        }
    }
}

// ---------------- 上下文用量监控（保留） ----------------
async function refreshContextUsage(promptText, label) {
    if (typeof promptText !== 'string' || !promptText) return;
    try {
        const tokens = await getTokenCountAsync(promptText, power_user.token_padding);
        contextTokens = tokens;
        contextMax = Number(getContext().maxContext) || 0;
        contextUpdatedAt = Date.now();
        renderContext();
        checkContextWarn();
        setStatus('上下文已统计' + (label ? '（' + label + '）' : '') + '：' + tokens + ' tokens');
    } catch (e) {
        console.error('[Error] 上下文统计失败：', e);
        setStatus('上下文统计失败，请按 F12 查看控制台错误');
    }
}

function countChatText() {
    if (!Array.isArray(chat)) return;
    const text = chat.map(m => (m && typeof m.mes === 'string' ? m.mes : '')).join('\n');
    if (text.trim()) refreshContextUsage(text, '聊天文本估算');
}

function checkContextWarn() {
    if (!contextMax) return;
    const ratio = contextTokens / contextMax;
    if (ratio >= WARN_THRESHOLD) {
        toastr.warning(
            '上下文用量已达 ' + Math.round(ratio * 100) + '%（' + contextTokens + ' / ' + contextMax + ' tokens），接近上限，模型可能开始遗忘早期内容。',
            undefined, { timeOut: 6000 },
        );
    }
}

function setStatus(text) {
    const el = $('#error_container .st-err__status');
    if (el.length) el.text(text);
}

function renderContext() {
    const box = $('#error_container .st-err__context');
    if (!box.length) return;
    if (!contextMax || !contextUpdatedAt) {
        box.html('<div class="st-err__empty">暂无数据。发送一条消息后自动统计（也可点下方「立即统计」）。</div>');
        return;
    }
    const ratio = contextMax ? Math.min(1, contextTokens / contextMax) : 0;
    const pct = Math.round((contextTokens / contextMax) * 100);
    const color = ratio >= 0.9 ? '#d9534f' : (ratio >= WARN_THRESHOLD ? '#f0ad4e' : '#4caf50');
    box.html(`
        <div class="st-err__stat">
            <span class="st-err__stat-num">${contextTokens}</span>
            <span class="st-err__stat-sep">/</span>
            <span class="st-err__stat-max">${contextMax}</span>
            <span class="st-err__stat-unit">tokens</span>
            <span class="st-err__stat-pct" style="color:${color}">${pct}%</span>
        </div>
        <div class="st-err__bar"><div class="st-err__bar-fill" style="width:${Math.round(ratio * 100)}%;background:${color}"></div></div>
        <div class="st-err__stat-time">最近统计：${fmtNow(contextUpdatedAt)}</div>
    `);
}

function renderCharBinding() {
    const el = $('#error_container .st-err__char');
    if (el.length) el.text(activeChar ? ('绑定角色：' + activeChar) : '未绑定角色');
}

// ---------------- 设置面板 ----------------
function buildSettingsPanel() {
    if ($('#error_container').length) return;
    const html = `
    <div id="error_container" class="extension_container">
      <div class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
          <b>Error</b>
          <span class="st-err__char"></span>
          <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content" style="display:none">
          <div class="st-err__tabs">
            <button type="button" class="st-err__tab is-active" data-tab="context">上下文</button>
            <button type="button" class="st-err__tab" data-tab="time">时间</button>
          </div>

          <div class="st-err__pane" data-pane="context">
            <div class="st-err__label">上下文用量</div>
            <div class="st-err__context"></div>
            <button type="button" class="st-err__time-extract st-err__ctx-count">立即统计</button>
            <div class="st-err__hint">每次生成后自动统计当前 prompt 占用的 token；超过 ${Math.round(WARN_THRESHOLD * 100)}% 会弹窗提醒，防止上下文溢出导致模型失忆。</div>
          </div>

          <div class="st-err__pane" data-pane="time" style="display:none">
            <div class="st-err__toolbar">
              <span class="st-err__label">当前时间</span>
              <label class="st-err__switch"><input type="checkbox" class="st-err__time-toggle"><span class="st-err__switch-slider"></span></label>
              <span class="st-err__hint-inline">自动追踪</span>
            </div>
            <div class="st-err__clock"></div>

            <div class="st-err__adv-row">
              <button type="button" class="st-err__adv" data-min="5">+5m</button>
              <button type="button" class="st-err__adv" data-min="10">+10m</button>
              <button type="button" class="st-err__adv" data-min="60">+1h</button>
              <button type="button" class="st-err__adv" data-min="1440">+1d</button>
            </div>

            <div class="st-err__add-row">
              <input type="text" class="st-err__time-input" placeholder="手动设置：第27天 06:40">
              <button type="button" class="st-err__time-save">设定</button>
            </div>

            <div class="st-err__label st-err__mt">事件日志</div>
            <div class="st-err__events"></div>

            <div class="st-err__conflicts"></div>
            <div class="st-err__hint">AI 每轮回复开头输出 <code>&lt;time&gt;</code> 块后，插件解析并推进时间轴；未输出则每轮兜底 +5 分钟。相对时间（昨天/前天…）会自动换算成第X天并提示核对。</div>
          </div>

          <div class="st-err__status"></div>
        </div>
      </div>
    </div>`;
    $('#extensions_settings').append(html);
    bindPanelEvents();
}

function bindPanelEvents() {
    const panel = $('#error_container');

    panel.find('.st-err__tab').on('click', function () {
        const name = $(this).data('tab');
        panel.find('.st-err__tab').removeClass('is-active');
        $(this).addClass('is-active');
        panel.find('.st-err__pane').hide();
        panel.find(`.st-err__pane[data-pane="${name}"]`).show();
    });

    // 自动追踪开关
    panel.find('.st-err__time-toggle').on('change', function () {
        const state = getTimeState();
        state.clock.paused = !this.checked;
        saveChat();
        updateTimeInjection();
        renderTime();
    });

    // 推进按钮
    panel.find('.st-err__adv').on('click', function () {
        const mins = parseInt($(this).data('min'), 10) || 0;
        const state = getTimeState();
        if (state.clock.paused) { toastr.warning('时间已暂停，请先打开自动追踪'); return; }
        advanceClock(state.clock, mins);
        const last = chat[chat.length - 1];
        if (last) bindTime(last, state.clock, chat.length - 1);
        saveChat();
        updateTimeInjection();
        renderTime();
        setStatus('时间推进 +' + fmtElapsed(mins) + ' → ' + fmtDaytime(state.clock.day, state.clock.minuteOfDay));
    });

    // 手动设定时间
    const setTime = () => {
        const input = panel.find('.st-err__time-input');
        const v = (input.val() || '').trim();
        if (!v) { toastr.warning('请输入时间，如：第27天 06:40'); return; }
        const dayM = v.match(/(\d+)\s*天/);
        const timeM = v.match(/(\d{1,2}):(\d{2})/);
        if (!dayM && !timeM) { toastr.warning('格式不对，试试：第27天 06:40'); return; }
        const state = getTimeState();
        if (dayM) state.clock.day = parseInt(dayM[1], 10);
        if (timeM) state.clock.minuteOfDay = parseInt(timeM[1], 10) * 60 + parseInt(timeM[2], 10);
        const last = chat[chat.length - 1];
        if (last) bindTime(last, state.clock, chat.length - 1);
        saveChat();
        updateTimeInjection();
        renderTime();
        setStatus('已设定时间：' + fmtDaytime(state.clock.day, state.clock.minuteOfDay));
        input.val('');
        toastr.success('已设定时间');
    };
    panel.find('.st-err__time-save').on('click', setTime);
    panel.find('.st-err__time-input').on('keydown', (e) => { if (e.key === 'Enter') setTime(); });

    // 立即统计上下文
    panel.on('click', '.st-err__ctx-count', countChatText);
}

// ---------------- 斜杠命令（旧版酒馆注册失败也不影响主功能） ----------------
async function registerSlashCommands() {
    try {
        const [{ parser }, { SlashCommand }] = await Promise.all([
            import('../../../slash-commands.js'),
            import('../../../slash-commands/SlashCommand.js'),
        ]);

        const cmd = (name, help, cb) => parser.addCommandObject(SlashCommand.fromProps({ name, callback: cb, helpString: help }));

        cmd('time', '查看当前剧情时间', async () => {
            const s = getTimeState();
            const r = fmtDaytime(s.clock.day, s.clock.minuteOfDay) + (s.clock.paused ? '（已暂停）' : '');
            toastr.info(r);
            return r;
        });

        cmd('timeset', '设定剧情时间：/timeset 第27天 06:40', async (_a, text) => {
            const s = getTimeState();
            const t = String(text || '').trim();
            const dayM = t.match(/(\d+)\s*天/);
            const timeM = t.match(/(\d{1,2}):(\d{2})/);
            if (!dayM && !timeM) { toastr.error('格式：/timeset 第27天 06:40'); return ''; }
            if (dayM) s.clock.day = parseInt(dayM[1], 10);
            if (timeM) s.clock.minuteOfDay = parseInt(timeM[1], 10) * 60 + parseInt(timeM[2], 10);
            saveChat(); updateTimeInjection(); renderTime();
            return fmtDaytime(s.clock.day, s.clock.minuteOfDay);
        });

        cmd('timeadv', '推进时间：/timeadv +10m | +1h | +1d', async (_a, text) => {
            const s = getTimeState();
            const t = String(text || '').trim();
            const m = t.match(/(\d+)\s*(天|d|h|m)/i);
            if (!m) { toastr.error('格式：/timeadv +10m'); return ''; }
            const v = parseInt(m[1], 10);
            const u = m[2].toLowerCase();
            const mins = (u === '天' || u === 'd') ? v * 1440 : (u === 'h' ? v * 60 : v);
            advanceClock(s.clock, mins);
            saveChat(); updateTimeInjection(); renderTime();
            return fmtDaytime(s.clock.day, s.clock.minuteOfDay);
        });

        console.log('[Error] 斜杠命令已注册：/time /timeset /timeadv');
    } catch (e) {
        console.warn('[Error] 斜杠命令注册失败（酒馆版本可能较旧），已跳过：', e);
    }
}

// ---------------- 初始化 ----------------
jQuery(async () => {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    activeChar = this_chid !== undefined && characters && characters[this_chid] && characters[this_chid].name ? String(characters[this_chid].name) : '';

    buildSettingsPanel();
    updateTimeInjection();
    registerSlashCommands();

    // —— 时间追踪：解析 AI 自己的 <time> 块，推进时钟 ——
    eventSource.on(event_types.MESSAGE_RECEIVED, () => {
        setTimeout(() => {
            rebuildTimeline(chat.length >= 2 ? chat.length - 2 : 0);
            updateTimeInjection();
            renderTime();
            setStatus('已推进时间 → ' + fmtDaytime(getTimeState().clock.day, getTimeState().clock.minuteOfDay));
        }, 150);
    });
    eventSource.on(event_types.MESSAGE_SENT, () => {
        const last = chat[chat.length - 1];
        if (last && last.is_user) bindTime(last, getTimeState().clock, chat.length - 1);
        saveChat();
    });
    eventSource.on(event_types.MESSAGE_EDITED, () => { rebuildTimeline(0); updateTimeInjection(); renderTime(); });
    eventSource.on(event_types.MESSAGE_SWIPED, () => { rebuildTimeline(0); updateTimeInjection(); renderTime(); });
    eventSource.on(event_types.MESSAGE_DELETED, () => { rebuildTimeline(0); updateTimeInjection(); renderTime(); });

    // 每轮生成前刷新时间卡注入（捕捉手动推进后的最新状态）
    eventSource.on(event_types.GENERATION_AFTER_COMMANDS, () => {
        updateTimeInjection();
    });

    // 切换聊天/角色：重建时间线
    eventSource.on(event_types.CHAT_CHANGED, () => {
        setTimeout(() => {
            activeChar = this_chid !== undefined && characters && characters[this_chid] && characters[this_chid].name ? String(characters[this_chid].name) : '';
            rebuildTimeline(0);
            updateTimeInjection();
            renderTime();
            renderContext();
            renderCharBinding();
        }, 150);
    });

    // —— 上下文统计 ——
    eventSource.on(event_types.GENERATION_ENDED, () => {
        isRealGeneration = false;
        if (!HAS_AFTER_COMBINE) countChatText();
    });
    if (HAS_AFTER_COMBINE) {
        if (event_types.GENERATION_STARTED) {
            eventSource.on(event_types.GENERATION_STARTED, () => { isRealGeneration = true; });
        }
        eventSource.on(event_types.GENERATE_AFTER_COMBINE_PROMPTS, (data) => {
            if (!isRealGeneration) return;
            const p = data && data.prompt;
            if (typeof p === 'string' && p) refreshContextUsage(p, '精确 prompt');
        });
    }

    renderTime();
    renderContext();
    renderCharBinding();
    setStatus('已加载，监听生成事件中…' + (HAS_AFTER_COMBINE ? '（精确统计）' : '（聊天文本估算）'));
    console.log('[Error] 插件已加载', { HAS_AFTER_COMBINE });
});

// ST 自动更新后调用，刷新页面以应用新版本
export function reloadOnUpdate() {
    toastr.info('Error 已更新，正在刷新页面以应用新版本...', undefined, { timeOut: 1500 });
    setTimeout(() => location.reload(), 1500);
}
