/* ==========================================================================
   Error · 音乐播放器（SillyTavern 第三方扩展）
   界面：统一浅粉单色 · 可爱少女风；底部 Dock 三页（主页=歌词 / 播放器=一起听 / 设置=接音乐 APP）。
   歌源：本地文件（存 IndexedDB）+ 直链 URL + 网易云（需自建 NeteaseCloudMusicApi）；
   播放内核用 HTML5 Audio。
   ========================================================================== */

const extensionName = 'error';
const VERSION = '1.4.5'; // 面板标题旁展示，更新时与 manifest.json 同步

// ---------------- 图标（线性极简） ----------------
const ICONS = {
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
    prev: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zM20 6l-9 6 9 6z"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 6h2v12h-2zM4 6l9 6-9 6z"/></svg>',
    loopList: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3l3 3-3 3"/><path d="M4 6h13a3 3 0 0 1 3 3v1"/><path d="M7 21l-3-3 3-3"/><path d="M20 18H7a3 3 0 0 1-3-3v-1"/></svg>',
    loopOne: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3l3 3-3 3"/><path d="M4 6h13a3 3 0 0 1 3 3v1"/><path d="M7 21l-3-3 3-3"/><path d="M20 18H7a3 3 0 0 1-3-3v-1"/><text x="11.4" y="13" font-size="7" stroke="none" fill="currentColor" font-family="sans-serif">1</text></svg>',
    shuffle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h3l9 12h6"/><path d="M21 6h-3l-4.5 6"/><path d="M3 18h3l1.8-2.4"/><path d="M17 3l3 3-3 3"/><path d="M17 15l3 3-3 3"/></svg>',
    volume: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    music: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 18.5a3 3 0 1 1-2-2.83V6.6L18 4v10.5a3 3 0 1 1-2-2.83V7.6L9 9.3z"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1.5 1.5"/><path d="M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1.5-1.5"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>',
    player: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14a8 8 0 0 1 16 0"/><rect x="3" y="14" width="4" height="7" rx="2"/><rect x="17" y="14" width="4" height="7" rx="2"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    qr: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM19 14h2v3h-2zM14 19h3v2h-3zM19 19h2v2h-2z"/></svg>',
    cloud: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18h10a4 4 0 0 0 .7-7.94A5.5 5.5 0 0 0 7.1 8.5 4.5 4.5 0 0 0 7 18z"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-3.6 3.6-6 8-6s8 2.4 8 6v1H4z"/></svg>',
};

// ---------------- 状态 ----------------
const LOOP_MODES = [
    { key: 'list', title: '列表循环', icon: 'loopList' },
    { key: 'one', title: '单曲循环', icon: 'loopOne' },
    { key: 'shuffle', title: '随机播放', icon: 'shuffle' },
];

let settings = {
    songs: [],          // { id, title, artist, source: 'url'|'local'|'netease', url?, fileId?, ncmId?, cover?, duration? }
    currentIndex: -1,
    loopMode: 'list',
    volume: 0.8,
    neteaseApi: '',     // 网易云 API 地址（NeteaseCloudMusicApi），如 http://127.0.0.1:3000
    neteaseLoggedIn: false,
    neteaseCookie: '',  // 网易云 MUSIC_U cookie（可信设备登录，绕开机房 IP 的风控）
    duoLore: null,          // 用户自定义氛围文案数组；null=用内置默认
    duoCharAvatar: '',      // 自定义角色头像（dataURL，空=用酒馆角色头像）
    duoUserAvatar: '',      // 自定义你的头像（dataURL，空=用酒馆用户头像）
};

const ncm = {
    results: [],        // 搜索结果缓存
    lyricLines: [],     // 当前歌词 [{time, text}]
    lyricTrans: [],     // 翻译 [{time, text}]
    lyricCur: -1,       // 当前高亮歌词行，避免重复滚动
    qrKey: '',
    qrTimer: null,
};

let audio = new Audio();
let playing = false;
let currentObjectUrl = null; // 本地文件播放时的 object URL，切换时 revoke

// ---------------- 一起听（双头像 + 内置氛围对话） ----------------
const DUO_DEFAULT_LORE = [
    '一起听歌的感觉真好', '耳机分你一半', '这首歌好有感觉', '前奏一响就沦陷了',
    '♪ 好听到想循环', '和喜欢的人听喜欢的歌', '这一刻想按下暂停', '循环一整天都不腻',
    '今晚的 BGM 就交给你了', '嘘，用心听', '想把这句歌词唱给你', '有点上头了',
];

let duoPersonas = null;   // 延迟加载 personas.js 拿 user_avatar
let duoLoreTimer = null;  // 播放时轮换氛围文案

function duoContext() {
    try {
        return (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) ? SillyTavern.getContext() : null;
    } catch (e) { return null; }
}

function duoLoreLines() {
    const arr = Array.isArray(settings.duoLore) ? settings.duoLore.filter(x => String(x).trim()) : DUO_DEFAULT_LORE;
    return arr.length ? arr : DUO_DEFAULT_LORE;
}

function duoPickLine(exclude) {
    const lines = duoLoreLines();
    if (lines.length === 1) return lines[0];
    let line = lines[Math.floor(Math.random() * lines.length)];
    if (exclude != null && lines.length > 1) {
        let guard = 0;
        while (line === exclude && guard++ < 10) line = lines[Math.floor(Math.random() * lines.length)];
    }
    return line;
}

async function duoUserAvatar() {
    try {
        if (!duoPersonas) duoPersonas = await import('../../../personas.js');
        const ua = duoPersonas && duoPersonas.user_avatar;
        const ctx = duoContext();
        if (ua && ctx && ctx.getThumbnailUrl) return ctx.getThumbnailUrl('avatar', ua);
        return ua || '';
    } catch (e) { return ''; }
}

function duoCharAvatar() {
    const ctx = duoContext();
    if (!ctx) return '';
    const ch = ctx.characters && ctx.characters[ctx.characterId];
    if (ch && ch.avatar && ch.avatar !== 'none') {
        try { return ctx.getThumbnailUrl('avatar', ch.avatar); } catch (e) {}
    }
    return '';
}

function duoSetAvatar(imgEl, url) {
    if (!imgEl || !imgEl.length) return;
    if (url) {
        imgEl.attr('src', url).show();
        imgEl.off('error').on('error', () => imgEl.hide());
    } else {
        imgEl.hide();
    }
}

function renderDuoChat() {
    const panel = $('#st-error');
    if (!panel.length) return;
    const charLine = duoPickLine();
    panel.find('.err__duo-bubble--char .err__duo-bubble-text').text(charLine);
    panel.find('.err__duo-bubble--user .err__duo-bubble-text').text(duoPickLine(charLine));
}

function renderDuo() {
    const panel = $('#st-error');
    if (!panel.length) return;
    const ctx = duoContext();
    panel.find('.err__duo-name--char').text((ctx && ctx.name2) || '');
    panel.find('.err__duo-name--user').text((ctx && ctx.name1) || '你');
    duoSetAvatar(panel.find('.err__duo-img--char'), settings.duoCharAvatar || duoCharAvatar());
    const userImg = panel.find('.err__duo-img--user');
    if (settings.duoUserAvatar) duoSetAvatar(userImg, settings.duoUserAvatar);
    else duoUserAvatar().then(ua => duoSetAvatar(userImg, ua));
    // 自定义头像时显示「重置」小按钮
    panel.find('.err__duo-reset--char').toggle(!!settings.duoCharAvatar);
    panel.find('.err__duo-reset--user').toggle(!!settings.duoUserAvatar);
    renderDuoChat();
}

function duoStartLoreFlow() {
    if (duoLoreTimer) return;
    duoLoreTimer = setInterval(() => { if (playing) renderDuoChat(); }, 16000);
}

// 头像上传：等比缩到 maxSize，转 dataURL 存进 settings
function duoResizeImage(file, maxSize) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
            const w = Math.max(1, Math.round(img.width * scale));
            const h = Math.max(1, Math.round(img.height * scale));
            const c = document.createElement('canvas');
            c.width = w; c.height = h;
            c.getContext('2d').drawImage(img, 0, 0, w, h);
            URL.revokeObjectURL(url);
            resolve(c.toDataURL('image/png'));
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load')); };
        img.src = url;
    });
}

function duoPickAvatar(which) {
    const input = $('<input type="file" accept="image/*">');
    input.on('change', async function () {
        const file = this.files && this.files[0];
        if (!file) return;
        try {
            const dataUrl = await duoResizeImage(file, 160);
            if (which === 'char') settings.duoCharAvatar = dataUrl;
            else settings.duoUserAvatar = dataUrl;
            saveSettings();
            renderDuo();
        } catch (e) { toastr.error('图片处理失败'); }
    });
    input.trigger('click');
}

function duoResetAvatar(which) {
    if (which === 'char') settings.duoCharAvatar = '';
    else settings.duoUserAvatar = '';
    saveSettings();
    renderDuo();
}

// ---------------- 工具 ----------------
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function fmtDur(sec) {
    if (sec == null || !isFinite(sec) || sec < 0) return '--:--';
    sec = Math.floor(sec);
    const m = Math.floor(sec / 60), s = sec % 60;
    return (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);
}

const LS_KEY = 'st-error-music';
function saveSettings() { try { localStorage.setItem(LS_KEY, JSON.stringify(settings)); } catch (e) {} }
function loadSettings() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) {
            const p = JSON.parse(raw);
            settings = Object.assign(settings, p);
            if (!Array.isArray(settings.songs)) settings.songs = [];
        }
    } catch (e) { settings.songs = []; }
}

// ---------------- IndexedDB（本地音频文件持久化） ----------------
const DB_NAME = 'st-error-music';
const DB_STORE = 'files';
function idbOpen() {
    return new Promise((res, rej) => {
        if (!('indexedDB' in window)) return rej(new Error('no idb'));
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
        };
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
    });
}
async function idbPut(id, blob) {
    const db = await idbOpen();
    return new Promise((res, rej) => {
        const tx = db.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).put(blob, id);
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
    });
}
async function idbGet(id) {
    const db = await idbOpen();
    return new Promise((res, rej) => {
        const tx = db.transaction(DB_STORE, 'readonly');
        const rq = tx.objectStore(DB_STORE).get(id);
        rq.onsuccess = () => res(rq.result || null);
        rq.onerror = () => rej(rq.error);
    });
}
async function idbDel(id) {
    try {
        const db = await idbOpen();
        return new Promise((res, rej) => {
            const tx = db.transaction(DB_STORE, 'readwrite');
            tx.objectStore(DB_STORE).delete(id);
            tx.oncomplete = () => res();
            tx.onerror = () => rej(tx.error);
        });
    } catch (e) {}
}

// ---------------- 歌源（source adapter） ----------------
// 每个歌源只需实现 resolve(song) → 可播放地址；新增平台（QQ/酷狗等）在此注册即可
const NCM_OUTER = (id) => `https://music.163.com/song/media/outer/url?id=${id}.mp3`;

const SOURCES = {
    url: {
        resolve: async (s) => s.url,
    },
    local: {
        errorMsg: '读取本地文件失败',
        resolve: async (s) => {
            const blob = await idbGet(s.fileId);
            if (!blob) { toastr.warning('本地文件不存在，已跳过'); return null; }
            currentObjectUrl = URL.createObjectURL(blob);
            return currentObjectUrl;
        },
    },
    netease: {
        errorMsg: '解析网易云播放地址失败',
        resolve: async (s) => {
            // 没配 API：走公开外链（免登录，仅限免费/有版权的歌）
            if (!settings.neteaseApi) return NCM_OUTER(s.ncmId);
            // 签名链接有时效，5 分钟内复用缓存
            if (!s.resolvedUrl || !s.resolvedAt || (Date.now() - s.resolvedAt) > 5 * 60 * 1000) {
                const url = await ncmResolveUrl(s.ncmId);
                if (!url) { toastr.warning('这首歌没有可用播放链接（可能无版权或未登录）'); return null; }
                s.resolvedUrl = url;
                s.resolvedAt = Date.now();
            }
            return s.resolvedUrl;
        },
    },
};

// 从粘贴内容里识别网易云歌曲 ID：纯数字，或含 id=xxx / /song/xxx 的链接
function parseNeteaseInput(text) {
    text = (text || '').trim();
    if (/^\d{4,}$/.test(text)) return text;
    if (!/163\.com|163cn\.tv/i.test(text)) return null;
    const m = text.match(/[?&#]id=(\d+)/) || text.match(/\/song\/(\d+)/);
    return m ? m[1] : null;
}

// ---------------- 播放内核 ----------------
function currentSong() { return settings.songs[settings.currentIndex]; }

async function playIndex(i) {
    const n = settings.songs.length;
    if (!n) return;
    if (i < 0) i = 0;
    if (i >= n) i = n - 1;
    settings.currentIndex = i;
    const s = settings.songs[i];
    saveSettings();
    // 切歌先清空歌词；netease 曲目会在播放成功后重新加载
    ncm.lyricLines = [];
    ncm.lyricTrans = [];
    renderLyric();

    // 释放上一个本地文件的 object URL
    if (currentObjectUrl) { URL.revokeObjectURL(currentObjectUrl); currentObjectUrl = null; }

    const adapter = SOURCES[s.source] || SOURCES.url;
    let src;
    try {
        src = await adapter.resolve(s);
    } catch (e) { toastr.error(adapter.errorMsg || '解析播放地址失败'); return; }
    if (!src) return;

    try {
        audio.src = src;
        await audio.play();
        if (s.source === 'netease' && settings.neteaseApi) ncmLoadLyric(s.ncmId);
        renderDuoChat();
        duoStartLoreFlow();
    } catch (e) {
        toastr.warning('播放失败：' + (s.title || s.url));
    }
}

function togglePlay() {
    if (!settings.songs.length) return;
    if (playing) audio.pause();
    else if (audio.src) audio.play().catch(() => {});
    else playIndex(settings.currentIndex < 0 ? 0 : settings.currentIndex);
}

function playPrev() {
    if (!settings.songs.length) return;
    const n = settings.songs.length;
    let i = settings.currentIndex;
    if (i < 0) i = 0; else i = (i - 1 + n) % n;
    playIndex(i);
}

function playNext() {
    if (!settings.songs.length) return;
    const n = settings.songs.length;
    if (settings.loopMode === 'shuffle' && n > 1) {
        let j = settings.currentIndex;
        while (j === settings.currentIndex) j = Math.floor(Math.random() * n);
        playIndex(j);
    } else {
        playIndex((settings.currentIndex + 1) % n);
    }
}

function onEnded() {
    const n = settings.songs.length;
    if (!n) return;
    if (settings.loopMode === 'one') { playIndex(settings.currentIndex); }
    else playNext(); // list / shuffle 都走这里
}

function cycleLoopMode() {
    const idx = LOOP_MODES.findIndex(m => m.key === settings.loopMode);
    settings.loopMode = LOOP_MODES[(idx + 1) % LOOP_MODES.length].key;
    saveSettings();
    renderControls();
}

function setVolume(v) {
    settings.volume = Math.max(0, Math.min(1, v));
    audio.volume = settings.volume;
    saveSettings();
    $('#st-error .err__vol-input').val(Math.round(settings.volume * 100)).css('--seek', Math.round(settings.volume * 100) + '%');
}

// ---------------- 歌单操作 ----------------
async function addNeteaseById(ncmId) {
    let idx = settings.songs.findIndex(s => s.source === 'netease' && String(s.ncmId) === String(ncmId));
    if (idx >= 0) { toastr.info('这首歌已在列表里'); return; }
    let title = '网易云 #' + ncmId, artist = '', cover = '', duration = null;
    // 配了 API 就顺手取歌名；没配则用占位名（外链无需 API 也能播）
    if (settings.neteaseApi) {
        try {
            const d = await ncmFetch(`/song/detail?ids=${ncmId}`);
            const t = d && d.songs && d.songs[0];
            if (t) {
                title = t.name;
                artist = (t.ar || []).map(a => a.name).join(' / ');
                cover = (t.al && t.al.picUrl) || '';
                duration = (t.dt || 0) / 1000;
            }
        } catch (e) {}
    }
    settings.songs.push({ id: uid(), title, artist, cover, duration, source: 'netease', ncmId });
    saveSettings();
    renderAll();
}

async function addUrlSong(url, title) {
    url = (url || '').trim();
    if (!url) return;
    const ncmId = parseNeteaseInput(url);
    if (ncmId) return addNeteaseById(ncmId);
    title = (title || '').trim() || url.split('/').pop().split('?')[0].replace(/\.[a-z0-9]+$/i, '') || '未命名';
    settings.songs.push({ id: uid(), title, artist: '', source: 'url', url, duration: null });
    saveSettings();
    renderAll();
}

async function addLocalFiles(files) {
    for (const f of files) {
        const id = uid();
        try {
            await idbPut(id, f);
        } catch (e) {
            toastr.error('保存本地文件失败（浏览器可能不支持 IndexedDB）');
            continue;
        }
        const name = f.name.replace(/\.[a-z0-9]+$/i, '');
        settings.songs.push({ id, title: name, artist: '', source: 'local', fileId: id, duration: null });
    }
    saveSettings();
    renderAll();
}

async function removeSong(id) {
    const idx = settings.songs.findIndex(s => s.id === id);
    if (idx < 0) return;
    const s = settings.songs[idx];
    const wasCurrent = idx === settings.currentIndex;

    if (s.source === 'local') await idbDel(s.fileId);

    settings.songs.splice(idx, 1);
    if (wasCurrent) {
        if (currentObjectUrl) { URL.revokeObjectURL(currentObjectUrl); currentObjectUrl = null; }
        audio.pause();
        audio.removeAttribute('src');
        playing = false;
        if (settings.songs.length) {
            settings.currentIndex = Math.min(idx, settings.songs.length - 1);
            playIndex(settings.currentIndex);
        } else {
            settings.currentIndex = -1;
        }
    } else if (idx < settings.currentIndex) {
        settings.currentIndex -= 1;
    }
    saveSettings();
    renderAll();
}

// ---------------- 网易云（NeteaseCloudMusicApi） ----------------
async function ncmFetch(path) {
    const base = (settings.neteaseApi || '').replace(/\/+$/, '');
    if (!base) { toastr.warning('请先配置网易云 API 地址（点旁边的齿轮）'); return null; }
    let url = base + path;
    // 已填 MUSIC_U 就带上，让 API 以登录态请求（绕开机房 IP 对扫码登录的风控）
    if (settings.neteaseCookie) {
        url += (path.includes('?') ? '&' : '?') + 'cookie=' + encodeURIComponent('MUSIC_U=' + settings.neteaseCookie.trim());
    }
    const res = await fetch(url, { credentials: 'omit' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
}

async function ncmSearch(keyword) {
    keyword = (keyword || '').trim();
    if (!keyword) return;
    const el = $('#st-error .err__ncm-results');
    if (el.length) el.html('<div class="err__ncm-hint">搜索中…</div>');
    try {
        const d = await ncmFetch(`/search?keywords=${encodeURIComponent(keyword)}&limit=30&type=1`);
        const songs = (d && d.result && d.result.songs) || [];
        ncm.results = songs.map(s => ({
            id: s.id,
            name: s.name,
            artist: (s.ar || s.artists || []).map(a => a.name).join(' / '),
            cover: ((s.al || s.album || {}).picUrl) || '',
            duration: (s.dt || s.duration || 0) / 1000,
        }));
        renderNcmResults();
    } catch (e) {
        if (el.length) el.html('<div class="err__ncm-hint">搜索失败，请检查 API 地址</div>');
    }
}

function renderNcmResults() {
    const el = $('#st-error .err__ncm-results');
    if (!el.length) return;
    el.empty();
    if (!ncm.results.length) { el.append('<div class="err__ncm-hint">没有结果</div>'); return; }
    ncm.results.forEach(s => {
        const thumb = s.cover
            ? `<span class="err__ncm-thumb" style="background-image:url('${s.cover.replace(/'/g, "\\'")}')"></span>`
            : `<span class="err__ncm-thumb err__ncm-thumb--none">${ICONS.music}</span>`;
        el.append(`<div class="err__ncm-row" data-id="${s.id}">
            ${thumb}
            <div class="err__ncm-meta">
                <div class="err__ncm-name">${escapeHtml(s.name)}</div>
                <div class="err__ncm-artist">${escapeHtml(s.artist || '未知艺术家')}</div>
            </div>
            <span class="err__ncm-dur">${fmtDur(s.duration)}</span>
        </div>`);
    });
}

async function ncmResolveUrl(songId) {
    for (const level of ['exhigh', 'standard']) {
        const d = await ncmFetch(`/song/url/v1?id=${songId}&level=${level}`);
        const list = (d && d.data) || [];
        const url = list[0] && list[0].url;
        if (url) return url;
    }
    return null;
}

async function ncmPlaySong(song) {
    let idx = settings.songs.findIndex(s => s.source === 'netease' && s.ncmId === song.id);
    if (idx < 0) {
        settings.songs.push({
            id: uid(),
            title: song.name,
            artist: song.artist,
            cover: song.cover,
            duration: song.duration,
            source: 'netease',
            ncmId: song.id,
        });
        idx = settings.songs.length - 1;
        saveSettings();
    }
    renderAll();
    await playIndex(idx);
}

// —— 歌词 ——
function parseLrc(lrc) {
    const lines = [];
    (lrc || '').split(/\r?\n/).forEach(raw => {
        const m = raw.match(/\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\](.*)/);
        if (!m) return;
        const frac = m[3] || '0';
        const div = frac.length === 3 ? 1000 : frac.length === 2 ? 100 : frac.length === 1 ? 10 : 1;
        lines.push({ time: (+m[1]) * 60 + (+m[2]) + (+frac) / div, text: m[4].trim() });
    });
    lines.sort((a, b) => a.time - b.time);
    return lines;
}

async function ncmLoadLyric(songId) {
    try {
        const d = await ncmFetch(`/lyric?id=${songId}`);
        ncm.lyricLines = parseLrc(d && d.lrc && d.lrc.lyric);
        ncm.lyricTrans = parseLrc(d && d.tlyric && d.tlyric.lyric);
    } catch (e) {
        ncm.lyricLines = []; ncm.lyricTrans = [];
    }
    renderLyric();
}

function renderLyric() {
    const el = $('#st-error .err__lrc');
    if (!el.length) return;
    ncm.lyricCur = -1;
    el.empty();
    if (!ncm.lyricLines.length) {
        el.html('<div class="err__lrc-empty"><span class="err__lrc-empty-t">暂无歌词</span><span class="err__lrc-empty-s">在「设置」接入网易云并播放有歌词的歌，即可在这里看歌词</span></div>');
        return;
    }
    const trans = ncm.lyricTrans || [];
    ncm.lyricLines.forEach((ln, i) => {
        let t = '';
        for (const tr of trans) { if (tr.time <= ln.time) t = tr.text; else break; }
        el.append(`<div class="err__lrc-line" data-i="${i}"><span class="err__lrc-text">${escapeHtml(ln.text || '…')}</span>${t ? `<span class="err__lrc-sub">${escapeHtml(t)}</span>` : ''}</div>`);
    });
    updateLyricTime(audio.currentTime || 0);
}

function updateLyricTime(t) {
    const el = $('#st-error .err__lrc');
    if (!el.length || !ncm.lyricLines.length) return;
    let idx = -1;
    for (let i = 0; i < ncm.lyricLines.length; i++) {
        if (ncm.lyricLines[i].time <= t) idx = i; else break;
    }
    if (idx < 0) idx = 0;
    if (idx === ncm.lyricCur) return;
    ncm.lyricCur = idx;
    el.find('.err__lrc-line').removeClass('is-cur');
    const cur = el.find(`.err__lrc-line[data-i="${idx}"]`);
    if (!cur.length) return;
    cur.addClass('is-cur');
    const box = el.get(0);
    const target = cur.get(0).offsetTop - box.clientHeight / 2 + cur.get(0).offsetHeight / 2;
    box.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
}

// —— 扫码登录 ——
async function ncmLogin() {
    const modal = $('#st-error .err__qr-modal');
    if (!modal.length) return;
    const statusEl = modal.find('.err__qr-status');
    const imgEl = modal.find('.err__qr-img');
    modal.show();
    imgEl.attr('src', '').hide();
    statusEl.text('正在获取二维码…');
    try {
        const k = await ncmFetch(`/login/qr/key?timestamp=${Date.now()}`);
        if (!k) { modal.hide(); return; }
        const key = (k.data && k.data.unikey) || k.unikey || k.data;
        if (!key) { statusEl.text('获取二维码失败'); return; }
        ncm.qrKey = key;

        const c = await ncmFetch(`/login/qr/create?key=${encodeURIComponent(key)}&qrimg=true&timestamp=${Date.now()}`);
        const qrimg = (c && c.data && c.data.qrimg) || '';
        if (!qrimg) { statusEl.text('生成二维码失败'); return; }
        // 部分版本返回的 qrimg 已带 data: 前缀，未带的才补上
        const src = qrimg.startsWith('data:') ? qrimg : 'data:image/png;base64,' + qrimg;
        imgEl.attr('src', src).show();
        statusEl.text('请用网易云音乐 App 扫码登录');

        clearInterval(ncm.qrTimer);
        ncm.qrTimer = setInterval(ncmQrPoll, 3000);
    } catch (e) {
        statusEl.text('连接 API 失败，请检查地址');
    }
}

async function ncmQrPoll() {
    if (!ncm.qrKey) return;
    try {
        const s = await ncmFetch(`/login/qr/check?key=${encodeURIComponent(ncm.qrKey)}&timestamp=${Date.now()}`);
        const code = s && s.code;
        const modal = $('#st-error .err__qr-modal');
        const statusEl = modal.find('.err__qr-status');
        const imgEl = modal.find('.err__qr-img');
        if (code === 803) {
            clearInterval(ncm.qrTimer); ncm.qrTimer = null;
            settings.neteaseLoggedIn = true;
            saveSettings();
            syncNcmLoginUi();
            statusEl.text('登录成功：' + (s.nickname || '网易云'));
            toastr.success('网易云登录成功');
            setTimeout(ncmQrClose, 1200);
        } else if (code === 800) {
            clearInterval(ncm.qrTimer); ncm.qrTimer = null;
            statusEl.text('二维码已过期，请重新扫码');
            imgEl.hide();
        } else if (code === 802) {
            statusEl.text('已扫码，请在手机上确认');
        } else if (code === 801) {
            statusEl.text('等待扫码…');
        }
    } catch (e) { /* 网络抖动忽略，下轮再试 */ }
}

function ncmQrClose() {
    clearInterval(ncm.qrTimer); ncm.qrTimer = null;
    ncm.qrKey = '';
    const modal = $('#st-error .err__qr-modal');
    if (modal.length) modal.hide();
}

function syncNcmLoginUi() {
    const btn = $('#st-error .err__ncm-login');
    if (!btn.length) return;
    const logged = !!settings.neteaseLoggedIn || !!settings.neteaseCookie;
    btn.toggleClass('is-logged', logged)
       .attr('title', logged ? '网易云已登录（扫码或 Cookie）' : '扫码登录网易云');
}

// ---------------- 渲染 ----------------
function renderControls() {
    const panel = $('#st-error');
    if (!panel.length) return;
    const m = LOOP_MODES.find(x => x.key === settings.loopMode) || LOOP_MODES[0];
    panel.find('.err__loop').attr('title', m.title).html(ICONS[m.icon]);
    panel.find('.err__play-toggle').html(playing ? ICONS.pause : ICONS.play);
    panel.find('.err__duo').toggleClass('is-playing', playing);
}

function renderNow() {
    const panel = $('#st-error');
    if (!panel.length) return;
    const s = currentSong();
    const titleEl = panel.find('.err__now-title');
    const artistEl = panel.find('.err__now-artist');
    if (s) {
        titleEl.text(s.title);
        artistEl.text(s.artist || '未知艺术家');
        panel.find('.err__home-title').text(s.title);
        panel.find('.err__home-artist').text(s.artist || '未知艺术家');
        panel.find('.err__now-time').text(fmtDur(audio.currentTime || 0));
        panel.find('.err__now-dur').text(fmtDur(s.duration));
    } else {
        titleEl.text('未在播放');
        artistEl.text('添加歌曲开始播放');
        panel.find('.err__home-title').text('未在播放');
        panel.find('.err__home-artist').text('添加歌曲开始播放');
        panel.find('.err__now-time').text('00:00');
        panel.find('.err__now-dur').text('--:--');
    }
}

function renderList() {
    const panel = $('#st-error');
    if (!panel.length) return;
    const list = panel.find('.err__list');
    list.empty();
    if (!settings.songs.length) {
        list.append(`<div class="err__empty">
            <div class="err__empty-icon">${ICONS.music}</div>
            <div class="err__empty-title">歌单还是空的</div>
            <div class="err__empty-sub">粘贴音频直链，或选择本地音频文件加入</div>
        </div>`);
        return;
    }
    settings.songs.forEach((s, i) => {
        const isCur = i === settings.currentIndex;
        const isPlaying = isCur && playing;
        const idxHtml = isPlaying
            ? '<span class="err__eq"><i></i><i></i><i></i></span>'
            : `<span class="err__row-idx">${String(i + 1).padStart(2, '0')}</span>`;
        list.append(`<div class="err__row ${isCur ? 'is-current' : ''}" data-id="${s.id}">
            <span class="err__row-idxwrap">${idxHtml}</span>
            <div class="err__row-main">
                <div class="err__row-title">${escapeHtml(s.title)}</div>
                <div class="err__row-artist">${escapeHtml(s.artist || '未知艺术家')}</div>
            </div>
            <span class="err__row-src err__row-src--${s.source}">${s.source === 'local' ? ICONS.folder : s.source === 'netease' ? ICONS.cloud : ICONS.link}</span>
            <span class="err__row-dur">${fmtDur(s.duration)}</span>
            <button type="button" class="err__row-del" data-id="${s.id}" title="删除">${ICONS.trash}</button>
        </div>`);
    });
}

function renderAll() {
    renderList();
    renderNow();
    renderLyric();
    renderControls();
    renderDuo();
    const panel = $('#st-error');
    if (panel.length) panel.find('.err__count').text(settings.songs.length + ' 首');
}

// ---------------- 面板 ----------------
function switchPage(name) {
    const panel = $('#st-error');
    if (!panel.length) return;
    panel.find('.err__page').removeClass('is-on').filter(`[data-page="${name}"]`).addClass('is-on');
    panel.find('.err__dock-btn').removeClass('is-on').filter(`[data-page="${name}"]`).addClass('is-on');
}

function buildPanel() {
    if ($('#st-error').length) return;
    const html = `    <div id="st-error" class="err" style="display:none">
      <div class="err__head">
        <div class="err__brand">
          <span class="err__title">Error</span>
          <span class="err__version">v${VERSION}</span>
        </div>
        <button type="button" class="err__close" title="关闭">${ICONS.close}</button>
      </div>

      <div class="err__body">
        <!-- 主页：歌词 -->
        <section class="err__page" data-page="home">
          <div class="err__home-now">
            <div class="err__home-title">未在播放</div>
            <div class="err__home-artist">添加歌曲开始播放</div>
          </div>
          <div class="err__lrc"></div>
        </section>

        <!-- 播放器：一起听 -->
        <section class="err__page is-on" data-page="player">
          <div class="err__stage">
            <div class="err__duo">
              <div class="err__duo-chat">
                <div class="err__duo-bubble err__duo-bubble--char"><span class="err__duo-bubble-text">一起听…</span></div>
                <div class="err__duo-bubble err__duo-bubble--user"><span class="err__duo-bubble-text">一起听…</span></div>
              </div>
              <div class="err__duo-avatars">
                <div class="err__duo-person err__duo-person--char">
                  <span class="err__duo-avatar" title="点击更换头像">
                    <span class="err__duo-avatar-fallback">${ICONS.user}</span>
                    <img class="err__duo-img err__duo-img--char" alt="" style="display:none">
                    <button type="button" class="err__duo-reset err__duo-reset--char" title="恢复默认头像" style="display:none">${ICONS.close}</button>
                  </span>
                  <span class="err__duo-name err__duo-name--char"></span>
                </div>
                <div class="err__duo-link" aria-hidden="true">
                  <svg class="err__ecg" viewBox="0 0 96 44" preserveAspectRatio="none">
                    <path class="err__ecg-base" d="M0 22 H6 L8 17 L10 22 H13 L15 26 L18 4 L21 26 L23 22 H26 L28 16 L30 22 H32 H38 L40 17 L42 22 H45 L47 26 L50 4 L53 26 L55 22 H58 L60 16 L62 22 H64 H70 L72 17 L74 22 H77 L79 26 L82 4 L85 26 L87 22 H90 L92 16 L94 22 H96"/>
                    <path class="err__ecg-pulse" d="M0 22 H6 L8 17 L10 22 H13 L15 26 L18 4 L21 26 L23 22 H26 L28 16 L30 22 H32 H38 L40 17 L42 22 H45 L47 26 L50 4 L53 26 L55 22 H58 L60 16 L62 22 H64 H70 L72 17 L74 22 H77 L79 26 L82 4 L85 26 L87 22 H90 L92 16 L94 22 H96"/>
                  </svg>
                </div>
                <div class="err__duo-person err__duo-person--user">
                  <span class="err__duo-avatar" title="点击更换头像">
                    <span class="err__duo-avatar-fallback">${ICONS.user}</span>
                    <img class="err__duo-img err__duo-img--user" alt="" style="display:none">
                    <button type="button" class="err__duo-reset err__duo-reset--user" title="恢复默认头像" style="display:none">${ICONS.close}</button>
                  </span>
                  <span class="err__duo-name err__duo-name--user">你</span>
                </div>
              </div>
              <button type="button" class="err__duo-lore-btn" title="编辑氛围文案">${ICONS.gear} 氛围文案</button>
            </div>
            <div class="err__now">
              <div class="err__now-title">未在播放</div>
              <div class="err__now-artist">添加歌曲开始播放</div>
            </div>
            <div class="err__progress">
              <span class="err__now-time">00:00</span>
              <input type="range" class="err__seek" min="0" max="0" step="0.1" value="0">
              <span class="err__now-dur">--:--</span>
            </div>
            <div class="err__controls">
              <button type="button" class="err__ctrl err__loop" title="列表循环">${ICONS.loopList}</button>
              <button type="button" class="err__ctrl err__prev" title="上一首">${ICONS.prev}</button>
              <button type="button" class="err__ctrl err__play-toggle" title="播放/暂停">${ICONS.play}</button>
              <button type="button" class="err__ctrl err__next" title="下一首">${ICONS.next}</button>
              <div class="err__vol">
                <span class="err__vol-icon">${ICONS.volume}</span>
                <input type="range" class="err__vol-input" min="0" max="100" step="1" value="80">
              </div>
            </div>
          </div>
        </section>

        <!-- 设置：接音乐 APP -->
        <section class="err__page" data-page="settings">
          <div class="err__set">
            <div class="err__set-head">
              <span class="err__label">接音乐 APP</span>
              <span class="err__set-hint">搜索 / 扫码登录 / API</span>
            </div>
            <div class="err__ncm">
              <div class="err__ncm-bar">
                <input type="text" class="err__ncm-input" placeholder="搜索网易云歌曲">
                <button type="button" class="err__ncm-search" title="搜索">${ICONS.search}</button>
                <button type="button" class="err__ncm-login" title="扫码登录网易云">${ICONS.qr}</button>
                <button type="button" class="err__ncm-gear" title="API 设置">${ICONS.gear}</button>
              </div>
              <div class="err__ncm-settings" style="display:none">
                <input type="text" class="err__ncm-api" placeholder="网易云 API 地址，如 http://127.0.0.1:3000">
                <input type="text" class="err__ncm-cookie" placeholder="MUSIC_U cookie（可选，绕开机房 IP 风控）">
                <button type="button" class="err__ncm-save">保存</button>
              </div>
              <div class="err__ncm-results"></div>
            </div>
            <div class="err__set-head err__set-head--add">
              <span class="err__label">添加歌曲</span>
            </div>
            <div class="err__add-row">
              <input type="text" class="err__url-input" placeholder="粘贴网易云歌曲链接/ID，或音频直链">
              <button type="button" class="err__add-url" title="添加直链">${ICONS.plus}</button>
              <button type="button" class="err__add-local" title="添加本地文件">${ICONS.folder}</button>
            </div>
            <input type="file" class="err__file-input" accept="audio/*" multiple hidden>
            <div class="err__set-head err__set-head--list">
              <span class="err__label">歌单</span>
              <span class="err__count">0 首</span>
            </div>
            <div class="err__list"></div>
          </div>
        </section>
      </div>

      <div class="err__dock">
        <button type="button" class="err__dock-btn" data-page="home" title="主页">${ICONS.home}<span>主页</span></button>
        <button type="button" class="err__dock-btn is-on" data-page="player" title="播放器">${ICONS.player}<span>播放器</span></button>
        <button type="button" class="err__dock-btn" data-page="settings" title="设置">${ICONS.gear}<span>设置</span></button>
      </div>

      <div class="err__qr-modal" style="display:none">
        <div class="err__qr-box">
          <div class="err__qr-head">
            <span>扫码登录网易云</span>
            <button type="button" class="err__qr-close" title="关闭">${ICONS.close}</button>
          </div>
          <img class="err__qr-img" alt="二维码" style="display:none">
          <div class="err__qr-status"></div>
        </div>
      </div>

      <div class="err__lore-modal" style="display:none">
        <div class="err__lore-box">
          <div class="err__lore-head">
            <span>氛围文案</span>
            <button type="button" class="err__lore-close" title="关闭">${ICONS.close}</button>
          </div>
          <div class="err__lore-hint">一行一条，播放时会随机取用；留空则使用内置默认。</div>
          <textarea class="err__lore-input" rows="12" spellcheck="false"></textarea>
          <div class="err__lore-actions">
            <button type="button" class="err__lore-reset">恢复默认</button>
            <button type="button" class="err__lore-save">保存</button>
          </div>
        </div>
      </div>
    </div>`;
    $('body').append(html);
    bindPanelEvents();
}

function bindPanelEvents() {
    const panel = $('#st-error');

    panel.find('.err__ncm-api').val(settings.neteaseApi || '');
    syncNcmLoginUi();

    // 底部 Dock 三页切换
    panel.find('.err__dock-btn').on('click', function () { switchPage($(this).data('page')); });

    panel.find('.err__close').on('click', () => togglePanel(false));
    panel.find('.err__play-toggle').on('click', togglePlay);
    panel.find('.err__prev').on('click', playPrev);
    panel.find('.err__next').on('click', playNext);
    panel.find('.err__loop').on('click', cycleLoopMode);

    // 列表点击：点行播放、点删除移除
    panel.find('.err__list').on('click', '.err__row', function (e) {
        if ($(e.target).closest('.err__row-del').length) return;
        const id = $(this).data('id');
        const i = settings.songs.findIndex(s => s.id === id);
        if (i >= 0) playIndex(i);
    });
    panel.find('.err__list').on('click', '.err__row-del', function (e) {
        e.stopPropagation();
        removeSong($(this).data('id'));
    });

    // 添加直链
    panel.find('.err__add-url').on('click', () => {
        const input = panel.find('.err__url-input');
        addUrlSong(input.val());
        input.val('');
    });
    panel.find('.err__url-input').on('keydown', (e) => {
        if (e.key === 'Enter') {
            const input = panel.find('.err__url-input');
            addUrlSong(input.val());
            input.val('');
        }
    });

    // 本地文件
    panel.find('.err__add-local').on('click', () => panel.find('.err__file-input').trigger('click'));
    panel.find('.err__file-input').on('change', function () {
        if (this.files && this.files.length) addLocalFiles(Array.from(this.files));
        this.value = '';
    });

    // 网易云
    panel.find('.err__ncm-search').on('click', () => ncmSearch(panel.find('.err__ncm-input').val()));
    panel.find('.err__ncm-input').on('keydown', (e) => { if (e.key === 'Enter') ncmSearch(panel.find('.err__ncm-input').val()); });
    panel.find('.err__ncm-gear').on('click', () => {
        const settingsRow = panel.find('.err__ncm-settings');
        panel.find('.err__ncm-api').val(settings.neteaseApi || '');
        panel.find('.err__ncm-cookie').val(settings.neteaseCookie || '');
        settingsRow.toggle();
    });
    panel.find('.err__ncm-save').on('click', () => {
        settings.neteaseApi = panel.find('.err__ncm-api').val().trim();
        settings.neteaseCookie = panel.find('.err__ncm-cookie').val().trim();
        saveSettings();
        panel.find('.err__ncm-settings').hide();
        syncNcmLoginUi();
        toastr.success('网易云设置已保存');
    });
    panel.find('.err__ncm-login').on('click', ncmLogin);
    panel.find('.err__ncm-results').on('click', '.err__ncm-row', function () {
        const song = ncm.results.find(s => String(s.id) === String($(this).data('id')));
        if (song) ncmPlaySong(song);
    });
    panel.find('.err__qr-close').on('click', ncmQrClose);
    panel.find('.err__qr-modal').on('click', function (e) { if (e.target === this) ncmQrClose(); });

    // 一起听：点头像换头像、点重置恢复默认
    panel.find('.err__duo-avatar').on('click', function () {
        duoPickAvatar($(this).closest('.err__duo-person').hasClass('err__duo-person--char') ? 'char' : 'user');
    });
    panel.find('.err__duo-reset').on('click', function (e) {
        e.stopPropagation();
        duoResetAvatar($(this).hasClass('err__duo-reset--char') ? 'char' : 'user');
    });

    // 一起听：氛围文案编辑
    panel.find('.err__duo-lore-btn').on('click', function () {
        panel.find('.err__lore-input').val(duoLoreLines().join('\n'));
        panel.find('.err__lore-modal').show();
    });
    panel.find('.err__lore-close').on('click', () => panel.find('.err__lore-modal').hide());
    panel.find('.err__lore-modal').on('click', function (e) { if (e.target === this) $(this).hide(); });
    panel.find('.err__lore-save').on('click', function () {
        const lines = panel.find('.err__lore-input').val().split('\n').map(s => s.trim()).filter(Boolean);
        settings.duoLore = lines.length ? lines : null;
        saveSettings();
        panel.find('.err__lore-modal').hide();
        renderDuoChat();
        toastr.success('氛围文案已保存');
    });
    panel.find('.err__lore-reset').on('click', function () {
        settings.duoLore = null;
        saveSettings();
        panel.find('.err__lore-input').val(DUO_DEFAULT_LORE.join('\n'));
        renderDuoChat();
        toastr.success('已恢复默认文案');
    });

    // 进度 / 音量
    let seeking = false;
    panel.find('.err__seek').on('input', function () { seeking = true; const m = parseFloat(this.max) || 0; $(this).css('--seek', (m ? this.value / m * 100 : 0) + '%'); });
    panel.find('.err__seek').on('change', function () {
        const v = parseFloat(this.value);
        if (isFinite(v) && audio.duration) { audio.currentTime = v; }
        seeking = false;
    });
    panel.find('.err__vol-input').on('input', function () { $(this).css('--seek', this.value + '%'); setVolume(parseInt(this.value, 10) / 100); });

    // 点击进度条区域不冒泡到面板
    panel.find('.err__progress').on('click', (e) => e.stopPropagation());
}

function fitPanelToViewport() {
    // 面板由 CSS 固定铺满全屏，这里只清除可能残留的内联定位。
    const panel = $('#st-error');
    if (!panel.length) return;
    panel.css({ top: '', bottom: '', left: '', right: '', width: '', maxWidth: '', maxHeight: '' });
}

function togglePanel(force) {
    const panel = $('#st-error');
    if (!panel.length) return;
    const show = force === undefined ? !panel.is(':visible') : force;
    if (show) {
        fitPanelToViewport();
        panel.show();
        renderAll();
    } else {
        panel.hide();
    }
    // 打开面板时给 body 打标记，用于移动端恢复触摸滚动（ST 移动端给 body 设了 touch-action:none）
    document.body.classList.toggle('st-error-open', show);
}

// ---------------- 顶栏按钮 ----------------
function buildButton() {
    // 与酒馆顶栏其它按钮同构：.drawer 包裹 + .drawer-icon 图标，
    // 这样能正确参与顶栏按钮群的 flex 布局，而不是被挤到右上角。
    const btn = $(`
        <div id="st-error-button" class="drawer" title="音乐播放器" tabindex="0" role="button">
            <div class="drawer-icon fa-solid fa-music fa-fw closedIcon interactable" title="音乐播放器" data-i18n="[title]Music player"></div>
        </div>`);
    btn.on('click', () => togglePanel());
    // 插入顶栏按钮群：排在 AI 配置按钮后面，与其它按钮同排；找不到再逐级回退
    const anchor = $('#ai-config-button');
    if (anchor.length) anchor.after(btn);
    else {
        const holder = $('#top-settings-holder');
        if (holder.length) holder.append(btn);
        else {
            const menu = $('#extensionsMenu');
            if (menu.length) menu.append(btn);
            else $('body').append(btn);
        }
    }
}

// ---------------- 初始化 ----------------
jQuery(async () => {
    loadSettings();
    audio.volume = settings.volume;
    buildButton();
    buildPanel();

    // 音频事件
    audio.addEventListener('play', () => { playing = true; renderControls(); renderNow(); });
    audio.addEventListener('pause', () => { playing = false; renderControls(); renderNow(); });
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('timeupdate', () => {
        const p = $('#st-error');
        if (!p.length || !p.is(':visible')) return;
        const d = audio.duration;
        if (isFinite(d) && d > 0) {
            p.find('.err__seek').attr('max', d).val(audio.currentTime).css('--seek', (audio.currentTime / d * 100) + '%');
        }
        p.find('.err__now-time').text(fmtDur(audio.currentTime));
        updateLyricTime(audio.currentTime);
    });
    audio.addEventListener('loadedmetadata', () => {
        const s = currentSong();
        const d = audio.duration;
        if (s && isFinite(d) && d > 0) { s.duration = d; saveSettings(); }
        renderNow();
    });
    audio.addEventListener('error', () => {
        if (!audio.src) return;
        toastr.error('播放出错：' + (currentSong() ? currentSong().title : '未知'));
    });

    $(window).on('resize.st-error', fitPanelToViewport);
    $(window).on('orientationchange.st-error', () => setTimeout(fitPanelToViewport, 300));
});

// ST 自动更新扩展后会调用 manifest.hooks.update 指向的这个函数（此时新代码已 git pull 到磁盘），
// 在这里刷新页面以加载新版本，无需手动刷新。
export function reloadOnUpdate() {
    toastr.info('Error 音乐播放器已更新，正在刷新页面以应用新版本...', undefined, { timeOut: 1500 });
    setTimeout(() => location.reload(), 1500);
}
