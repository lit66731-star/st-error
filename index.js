import { extension_settings } from '../../../extensions.js';
import {
    chat,
    characters,
    this_chid,
    event_types,
    eventSource,
    generateRaw,
    saveSettingsDebounced,
    setExtensionPrompt,
    extension_prompt_types,
} from '../../../../script.js';
import { getContext } from '../../../st-context.js';
import { getTokenCountAsync } from '../../../tokenizers.js';
import { power_user } from '../../../power-user.js';

const extensionName = 'error';

const WARN_THRESHOLD = 0.8; // 上下文占用超过 80% 弹窗提醒

const defaultSettings = {
    chars: {},   // { [角色唯一键]: 该角色的时间数据 }
};

let globalSettings = null;   // 顶层设置（按角色唯一键分组）
let settings = null;         // 当前角色的数据
let activeChar = '';         // 当前绑定角色显示名
let activeCharKey = '';      // 当前绑定角色唯一键
let isExtracting = false;    // 时间提取进行中（防并发）
let isRealGeneration = false;// 当前是否在进行真实剧情生成（用于排除 quiet 调用污染上下文统计）
let contextTokens = 0;       // 最近一次真实生成的 prompt token 数
let contextMax = 0;          // 配置的最大上下文
let contextUpdatedAt = 0;    // 最近一次统计时间戳

// ---------------- 设置 ----------------
function freshCharSettings() {
    return {
        storyTime: '',        // 当前剧情时间（年/月/日 周几 几时几分）
        timeEnabled: true,    // 自动追踪时间开关
    };
}

function normalizeCharSettings(cs) {
    if (!cs || typeof cs !== 'object') cs = {};
    if (typeof cs.storyTime !== 'string') cs.storyTime = '';
    if (cs.timeEnabled === undefined) cs.timeEnabled = true;
    return cs;
}

function currentCharName() {
    if (this_chid !== undefined && characters && characters[this_chid] && characters[this_chid].name) {
        return String(characters[this_chid].name);
    }
    return '';
}

// 与 Serendipity 一致：avatar 是角色卡唯一标识，无头像退回 name
function currentCharKey() {
    if (this_chid !== undefined && characters && characters[this_chid]) {
        const c = characters[this_chid];
        if (c.avatar && c.avatar !== 'none') return 'avatar::' + c.avatar;
        if (c.name) return 'name::' + c.name;
    }
    return '';
}

function charData(key) {
    if (!globalSettings.chars[key]) globalSettings.chars[key] = freshCharSettings();
    return normalizeCharSettings(globalSettings.chars[key]);
}

function activateCharacter() {
    activeChar = currentCharName();
    activeCharKey = currentCharKey();
    settings = charData(activeCharKey);
}

function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    const s = extension_settings[extensionName];
    if (!s.chars || typeof s.chars !== 'object' || Array.isArray(s.chars)) s.chars = {};
    return s;
}
function saveSettings() { saveSettingsDebounced(); }
function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function pad(n) { return String(n).padStart(2, '0'); }
function fmtTime(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---------------- 时间注入（双重保险） ----------------
// 恒定注入当前剧情时间到 prompt 最顶端，与记忆插件的记忆总结相互独立：
// 即使记忆插件总结失败/滞后，AI 每轮也始终读到一个时间锚点。
function updateTimeInjection() {
    const t = settings.timeEnabled && settings.storyTime ? settings.storyTime.trim() : '';
    setExtensionPrompt(
        'error_time',
        t ? '[Error 剧情时间]\n当前剧情时间：' + t + '。请在后续回复中严格沿用这一时间线；除非剧情明确推进了时间，否则不要自行改变日期或时间。' : '',
        extension_prompt_types.BEFORE_PROMPT,
        0,
    );
}

// 取最近一轮对话：最后一条 AI 回复 + 它前面最近的用户消息
function lastRound() {
    if (!Array.isArray(chat)) return null;
    const msgs = chat.filter(m => m && typeof m.mes === 'string' && m.mes.trim() && !m.is_system);
    if (msgs.length < 2) return null;
    const last = msgs[msgs.length - 1];
    if (last.is_user) return null;
    let userMsg = null;
    for (let i = msgs.length - 2; i >= 0; i--) {
        if (msgs[i].is_user) { userMsg = msgs[i]; break; }
    }
    if (!userMsg) return null;
    return { userMsg, charMsg: last };
}

// 每轮 AI 回复后，独立地做一次极轻量的时间提取（只问时间，一句话）
async function extractTimeLastRound() {
    activateCharacter();
    if (!settings.timeEnabled || isExtracting) return;
    const pair = lastRound();
    if (!pair) return;
    isExtracting = true;
    try {
        const anchor = settings.storyTime
            ? '上一次剧情时间：' + settings.storyTime + '。若本段对话没有明确推进时间，请沿用这个时间；若剧情明确推进了，请给出推进后的具体时间。'
            : '请根据本段对话判断当前的剧情时间（年/月/日 周几 几时几分）。';
        const systemPrompt = [
            '你是剧情时间追踪助手。只根据下面这段对话判断当前的剧情时间，只输出时间本身（年/月/日 周几 几时几分），不要输出任何解释或客套。若确实无法判断，只输出「未知」。',
            '',
            anchor,
        ].join('\n');
        const prompt = pair.userMsg.name + '：' + pair.userMsg.mes + '\n\n' + pair.charMsg.name + '：' + pair.charMsg.mes;
        const result = await generateRaw({ prompt, systemPrompt });
        const t = (result || '').trim();
        // 没识别到（未知/空）就沿用上一次，绝不倒退或丢失时间
        if (t && t !== '未知') {
            settings.storyTime = t;
            saveSettings();
            updateTimeInjection();
            renderTime();
        }
    } catch (e) {
        console.error('[Error] 剧情时间提取失败：', e);
    } finally {
        isExtracting = false;
    }
}

// ---------------- 上下文用量监控 ----------------
// 异步统计（不阻塞生成）。用 token_padding 与酒馆内部保持一致。
async function refreshContextUsage(promptText) {
    if (typeof promptText !== 'string' || !promptText) return;
    try {
        const tokens = await getTokenCountAsync(promptText, power_user.token_padding);
        contextTokens = tokens;
        contextMax = Number(getContext().maxContext) || 0;
        contextUpdatedAt = Date.now();
        renderContext();
        checkContextWarn();
    } catch (e) {
        console.error('[Error] 上下文统计失败：', e);
    }
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

// ---------------- 渲染 ----------------
function renderContext() {
    const box = $('#error_container .st-err__context');
    if (!box.length) return;
    if (!contextMax || !contextUpdatedAt) {
        box.html('<div class="st-err__empty">暂无数据。发送一条消息后自动统计。</div>');
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
        <div class="st-err__stat-time">最近统计：${fmtTime(contextUpdatedAt)}</div>
    `);
}

function renderTime() {
    const el = $('#error_container .st-err__time-display');
    if (el.length) el.text(settings.storyTime || '（尚未追踪到剧情时间，发送一条消息后自动提取）');
    const toggle = $('#error_container .st-err__time-toggle');
    if (toggle.length) toggle.prop('checked', !!settings.timeEnabled);
}

function renderCharBinding() {
    const el = $('#error_container .st-err__char');
    if (el.length) el.text(activeChar ? ('绑定角色：' + activeChar) : '未绑定角色');
}

// ---------------- 设置面板（注入到酒馆「扩展程序」抽屉 #extensions_settings） ----------------
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
            <div class="st-err__hint">每次生成后自动统计当前 prompt 占用的 token；超过 ${Math.round(WARN_THRESHOLD * 100)}% 会弹窗提醒，防止上下文溢出导致模型失忆。</div>
          </div>

          <div class="st-err__pane" data-pane="time" style="display:none">
            <div class="st-err__toolbar">
              <span class="st-err__label">自动追踪时间</span>
              <label class="st-err__switch"><input type="checkbox" class="st-err__time-toggle"><span class="st-err__switch-slider"></span></label>
            </div>
            <div class="st-err__time-display"></div>
            <div class="st-err__add-row">
              <input type="text" class="st-err__time-input" placeholder="手动设置时间，如 2026年10月3日 周五 下午3点">
              <button type="button" class="st-err__time-save">更新</button>
            </div>
            <button type="button" class="st-err__time-extract">立即提取本段时间</button>
            <div class="st-err__hint">剧情时间会恒定注入正文，作为「双重保险」——即使记忆插件总结失败，AI 也知道当前时间。自动提取每轮做一次极轻量的模型调用；没识别到就沿用上一次。</div>
          </div>
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

    // 时间开关
    panel.find('.st-err__time-toggle').on('change', function () {
        settings.timeEnabled = this.checked;
        saveSettings();
        updateTimeInjection();
    });

    // 手动更新时间
    const saveTime = () => {
        const input = panel.find('.st-err__time-input');
        const v = (input.val() || '').trim();
        if (!v) { toastr.warning('请输入时间'); return; }
        settings.storyTime = v;
        saveSettings();
        updateTimeInjection();
        renderTime();
        input.val('');
        toastr.success('已更新时间');
    };
    panel.find('.st-err__time-save').on('click', saveTime);
    panel.find('.st-err__time-input').on('keydown', (e) => { if (e.key === 'Enter') saveTime(); });

    // 立即提取
    panel.on('click', '.st-err__time-extract', extractTimeLastRound);
}

// ---------------- 初始化 ----------------
jQuery(async () => {
    globalSettings = loadSettings();
    activateCharacter();
    buildSettingsPanel();

    updateTimeInjection();

    // 上下文统计：真实生成开始时置标记；生成后统计 prompt token（排除 quiet/原始调用）
    eventSource.on(event_types.GENERATION_STARTED, () => { isRealGeneration = true; });
    eventSource.on(event_types.GENERATE_AFTER_COMBINE_PROMPTS, (data) => {
        if (!isRealGeneration) return;
        const p = data && data.prompt;
        if (typeof p === 'string' && p) refreshContextUsage(p);
    });
    eventSource.on(event_types.GENERATION_ENDED, () => {
        isRealGeneration = false;
        // 每轮 AI 回复后，独立提取一次剧情时间（双重保险）
        setTimeout(() => extractTimeLastRound(), 200);
    });

    // 切换聊天/角色后：绑定到该角色数据并刷新
    eventSource.on(event_types.CHAT_CHANGED, () => {
        setTimeout(() => {
            activateCharacter();
            updateTimeInjection();
            renderTime();
            renderContext();
            renderCharBinding();
        }, 150);
    });

    renderTime();
    renderContext();
    renderCharBinding();
});

// ST 自动更新后调用，刷新页面以应用新版本
export function reloadOnUpdate() {
    toastr.info('Error 已更新，正在刷新页面以应用新版本...', undefined, { timeOut: 1500 });
    setTimeout(() => location.reload(), 1500);
}
