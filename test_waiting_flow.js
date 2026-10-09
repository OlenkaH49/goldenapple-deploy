// 无头验证「题目未就绪 → 等待页 → 题目就绪 → 进阅读页」的完整流转
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let timers = [];
function setTimeoutStub(fn, ms) { const t = { fn, ms }; timers.push(t); return t; }
function clearTimeoutStub(t) { const i = timers.findIndex(x => x === t); if (i >= 0) timers.splice(i, 1); }
function pendingTimers() { return timers.slice(); }
function fireAll() { const due = timers.slice(); timers = timers.filter(t => !due.includes(t)); due.forEach(t => t.fn()); }
const flush = () => new Promise(r => setImmediate(r));

// ---------- 通用 DOM 桩 ----------
function classListOf(initial) {
    const s = new Set(initial || []);
    return {
        add: (c) => s.add(c), remove: (c) => s.delete(c), contains: (c) => s.has(c),
        toggle: (c, f) => { if (f === undefined) { s.has(c) ? s.delete(c) : s.add(c); } else { f ? s.add(c) : s.delete(c); } return s.has(c); },
        _set: s,
    };
}
const registry = new Map();
const screens = ['startingPage', 'dashboardPage', 'uploadPage', 'loadingPage', 'readingPage', 'wordbookPage', 'summaryPage'];
function makeEl(id) {
    const el = {
        id: id || '',
        _attrs: {}, classList: classListOf(), style: {}, dataset: {},
        textContent: '', innerHTML: '', value: '', disabled: false,
        offsetHeight: 40, offsetWidth: 200, files: [],
        getAttribute(k) { return this._attrs[k] === undefined ? null : this._attrs[k]; },
        setAttribute(k, v) { this._attrs[k] = v; },
        removeAttribute(k) { delete this._attrs[k]; },
        contains(other) { return other === this; },
        closest() { return null; },
        querySelector() { return makeEl(); },
        querySelectorAll() { return []; },
        getBoundingClientRect() { return { left: 10, top: 100, bottom: 120, width: 200, height: 20 }; },
        appendChild() {}, remove() {}, addEventListener() {}, removeEventListener() {},
        focus() {}, blur() {}, click() {},
    };
    return el;
}
function getById(id) {
    if (!registry.has(id)) registry.set(id, makeEl(id));
    return registry.get(id);
}
screens.forEach(s => { const el = getById(s); el.classList = classListOf(['screen']); });
const documentStub = {
    getElementById: getById,
    querySelectorAll: (sel) => (sel === '.screen' ? screens.map(getById) : []),
    querySelector: () => null,
    addEventListener() {}, removeEventListener() {},
    createElement: () => makeEl(),
    body: makeEl(),
};
const windowStub = { addEventListener() {}, innerWidth: 1200, scrollTo() {}, location: { protocol: 'http:' }, prompt: () => 'x' };

// ---------- 可脚本化的后端响应 ----------
let statusQueue = [];
let fetchLog = [];
function makeResponse(data) {
    return { ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) };
}
const sandbox = {
    console,
    setTimeout: setTimeoutStub, clearTimeout: clearTimeoutStub, setImmediate: (fn) => fn(),
    document: documentStub, window: windowStub,
    localStorage: { getItem: () => 'test-pwd', setItem() {}, removeItem() {} },
    fetch: async (url, opts) => {
        fetchLog.push(String(url));
        if (String(url).includes('/api/upload-article')) return makeResponse({ success: true, articleId: 'upload_test_1' });
        if (String(url).includes('/api/article-status/')) {
            const next = statusQueue.shift();
            return makeResponse(next || { status: 'processing' });
        }
        return makeResponse({});
    },
    Math, Date, JSON, Promise, Object, Array, String, Number, Boolean, RegExp, Error, isNaN, parseInt, parseFloat, Map, Set,
    AbortController: class { constructor() { this.signal = {}; } abort() {} },
    toast: undefined,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const src = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const harness = `
globalThis.__t = {
  setAwaiting: (v) => { awaitingQuestionReady = v; },
  awaiting: () => awaitingQuestionReady,
  active: () => Array.from(document.querySelectorAll('.screen')).filter(s => s.classList.contains('active')).map(s => s.id),
  article: () => (currentArticle ? { id: currentArticle.id, wordsReady: currentArticle.wordsReady, sentencesReady: currentArticle.sentencesReady, questionsReady: currentArticle.questionsReady, questions: (currentArticle.questions||[]).length } : null),
  analyze: () => analyzeArticle(),
  setInputs: (content, title) => { document.getElementById('uploadContent').value = content; document.getElementById('uploadTitle').value = title; },
  pollFired: () => pendingTimersCount(),
};
function pendingTimersCount() { return 0; }
`;
// 需要访问外部 timers 计数 → 通过全局钩子注入
sandbox.__pendingCount = () => timers.length;
vm.runInContext(src + harness, sandbox, { filename: 'app.js' });

// ---------- 断言 ----------
let pass = 0, fail = 0;
const log = console.log;
function check(name, cond, extra) {
    if (cond) { pass++; log(`  PASS  ${name}`); }
    else { fail++; log(`  FAIL  ${name}${extra ? ' | ' + extra : ''}`); }
}
const t = sandbox.__t;
console.log = () => {};

(async () => {
    const LONG = 'A'.repeat(120) + ' This is a long enough article body for the upload check.';
    t.setInputs(LONG, '测试文章');

    // 预置后端返回序列：第1次 processing（都没好）→ 第2次 processing（释义好了）→ 第3次 题目就绪
    statusQueue = [
        { status: 'processing', words: null, wordsReady: false, sentences: null, sentencesReady: false, questions: null, questionsReady: false },
        { status: 'processing', words: { hello: '你好' }, wordsReady: true, sentences: null, sentencesReady: false, questions: null, questionsReady: false },
        { status: 'processing', words: { hello: '你好' }, wordsReady: true, sentences: [{ sentence: 'A.', translation: '甲。' }], sentencesReady: true, questions: [{ question: 'q1', options: ['a', 'b', 'c', 'd'], answer_index: 0 }], questionsReady: true },
    ];

    log('\n【场景1】上传后应停在等待页，而不是直接进阅读页');
    await t.analyze();
    await flush();
    log('  active =', t.active().join(','));
    check('当前在等待页（loadingPage active）', t.active().includes('loadingPage'));
    check('未进入阅读页', !t.active().includes('readingPage'));
    check('awaitingQuestionReady = true', t.awaiting() === true);
    check('currentArticle 已就绪（正文已在后台渲染好）', t.article() && t.article().id === 'upload_test_1');
    check('等待页显示了等待文案', String(getById('loadingTitle').textContent).includes('题目'), getById('loadingTitle').textContent);
    check('「使用基础题目」按钮默认隐藏', getById('useFallbackBtn').classList.contains('hidden'));

    log('\n【场景2】第 1 轮轮询（都未就绪）→ 仍停在等待页，进度条推进');
    fireAll(); await flush();
    log('  active =', t.active().join(','), '| 进度 =', getById('loadingProgress').textContent + '%');
    check('仍在等待页', t.active().includes('loadingPage') && !t.active().includes('readingPage'));

    log('\n【场景3】第 2 轮轮询（只有释义就绪）→ 仍停在等待页（题目才是进阅读页的闸门）');
    fireAll(); await flush();
    log('  active =', t.active().join(','), '| 进度 =', getById('loadingProgress').textContent + '%', '| 文案 =', getById('loadingMessage').textContent);
    check('仍停在等待页', t.active().includes('loadingPage') && !t.active().includes('readingPage'));
    check('等待文案提示已完成释义', String(getById('loadingMessage').textContent).includes('释义'), getById('loadingMessage').textContent);

    log('\n【场景4】第 3 轮轮询（题目就绪）→ 应自动进入阅读页');
    fireAll(); await flush();
    log('  active =', t.active().join(','));
    check('已进入阅读页', t.active().includes('readingPage'));
    check('等待页已退出', !t.active().includes('loadingPage'));
    check('awaitingQuestionReady 复位为 false', t.awaiting() === false);
    check('题目已回填到 currentArticle', t.article() && t.article().questionsReady && t.article().questions === 1, JSON.stringify(t.article()));
    check('进度条到 100%', String(getById('loadingProgress').textContent) === '100', getById('loadingProgress').textContent);

    log('\n【场景5】不在等待页时，enterReadingPage 不应乱切页');
    t.setAwaiting(false);
    showScreenToUpload();
    function showScreenToUpload() {
        screens.forEach(s => getById(s).classList.remove('active'));
        getById('uploadPage').classList.add('active');
    }
    vm.runInContext('enterReadingPage("手动调用（应被守卫拦下）")', sandbox);
    check('awaitingQuestionReady=false 时 enterReadingPage 被守卫拦下（未跳到阅读页）',
        getById('uploadPage').classList.contains('active') && !getById('readingPage').classList.contains('active'),
        'active=' + t.active().join(','));

    log('\n【场景6】题目未就绪但不小心调用了进入 → 仍应停在等待页（竞态守卫）');
    t.setAwaiting(true);
    getById('readingPage').classList.remove('active');
    getById('loadingPage').classList.add('active');
    vm.runInContext('enterReadingPage("正常调用（应放行）")', sandbox);
    check('awaitingQuestionReady=true 时 enterReadingPage 放行', getById('readingPage').classList.contains('active'));

    log(`\n结果：${pass} PASS / ${fail} FAIL`);
    process.exit(fail === 0 ? 0 : 1);
})().catch(e => { log('测试异常:', e); process.exit(1); });
