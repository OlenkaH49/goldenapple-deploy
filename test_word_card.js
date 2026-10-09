// 无头验证「词典式」词卡（2026-10-05 重写）
// 契约：
//   · 卡片两栏 —— 「当前语境释义」（本句里的意思）在上、「其他释义」（词典全部义项）在下
//   · 进阅读页预取本文所有词的词典释义 → 点词同步出卡，0 网络
//   · 后台再打一次「只查本地」的接口核对精确本句释义（不联网）
//   · 卡片里**没有**「本句翻译」按钮（2026-10-05 移除：释义没查到给句子翻译没意义）
//     —— 句子翻译改由「悬停原句 3 秒 → 浮层」这条主动触发路径承担，本文件只守「不再长回来」
const fs = require('fs');
const vm = require('vm');
const path = require('path');

// ==================== 极简 DOM 打桩 ====================

function classListOf() {
    const s = new Set();
    return {
        add: (c) => s.add(c), remove: (c) => s.delete(c), contains: (c) => s.has(c),
        toggle: (c, f) => { if (f === undefined) { s.has(c) ? s.delete(c) : s.add(c); } else { f ? s.add(c) : s.delete(c); } return s.has(c); },
        _set: s
    };
}

function makeEl(tag) {
    const el = {
        tagName: (tag || 'div').toUpperCase(), id: '', _attrs: {}, _style: {}, _qcache: {},
        classList: classListOf(), dataset: {}, value: '', disabled: false, checked: false,
        offsetHeight: 40, offsetWidth: 200, offsetLeft: 10, offsetTop: 100,
        isConnected: true,             // hideWordCard 等会检查卡片是否还在树上
        _children: [],
        get style() { return this._style; },
        getAttribute(k) { return this._attrs[k] === undefined ? null : this._attrs[k]; },
        setAttribute(k, v) { this._attrs[k] = v; },
        removeAttribute(k) { delete this._attrs[k]; },
        contains(other) { return other === this; },
        closest() { return null; },
        // 每个 owner 上同一选择器返回「同一个」元素，这样 style.display 的改动会被观测到。
        // 关键：只有当 owner.innerHTML 里**真的**有这个 class 才返回元素，否则返回 null ——
        // 这是真实 DOM 的语义。如果卡片 HTML 写坏了（标签没闭合 / class 拼错），
        // 这里会返回 null，测试就能抓到；否则替身 DOM 会把坏 HTML 也判成通过。
        querySelector(sel) {
            const cls = String(sel).replace(/^\./, '');
            const owner = this;
            const classes = (String(owner.innerHTML || '').match(/class="([^"]*)"/g) || [])
                .map(s => s.replace(/^class="/, '').replace(/"$/, ''))
                .reduce((acc, s) => acc.concat(s.split(/\s+/).filter(Boolean)), []);
            if (classes.indexOf(cls) < 0) return null;   // 元素压根不存在 → 与真实 DOM 一致
            if (!this._qcache[sel]) {
                const child = makeEl();
                child.parentNode = this;
                this._qcache[sel] = child;
            }
            return this._qcache[sel];
        },
        querySelectorAll() { return []; },
        getBoundingClientRect() { return { left: 10, top: 100, bottom: 120, width: 200, height: 20 }; },
        appendChild(c) { this._children.push(c); c.parentNode = this; return c; },
        removeChild(c) { this._children = this._children.filter(x => x !== c); return c; },
        remove() { this._removed = true; if (this.parentNode) this.parentNode.removeChild(this); },
        addEventListener() {}, removeEventListener() {},
        focus() {}, click() {}, blur() {}, insertBefore(c) { return c; },
    };
    // textContent → innerHTML 镜像：escapeHtml() 依赖这个语义
    let tc = '';
    Object.defineProperty(el, 'textContent', {
        get() { return tc; },
        set(v) { tc = v == null ? '' : String(v); el.innerHTML = tc.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); },
        configurable: true,
    });
    return el;
}

const registry = new Map();
function getById(id) { if (!registry.has(id)) registry.set(id, makeEl()); return registry.get(id); }
['startingPage', 'dashboardPage', 'uploadPage', 'loadingPage', 'readingPage', 'wordbookPage', 'summaryPage']
    .forEach(s => getById(s).classList.add('screen'));

const documentStub = {
    getElementById: getById,
    querySelectorAll: (sel) => (sel === '.screen' ? [...registry.values()].filter(e => e.classList.contains('screen')) : []),
    querySelector: () => null,
    addEventListener() {}, removeEventListener() {},
    createElement: (t) => makeEl(t),
    body: makeEl('body'),
};

// ==================== 可控的定时器（用来断言卡片不再排 3 秒计时器） ====================
const timerQueue = [];
function fakeSetTimeout(fn, ms) { timerQueue.push({ fn, ms }); return timerQueue.length; }
function fakeClearTimeout(id) { if (id > 0 && timerQueue[id - 1]) timerQueue[id - 1] = null; }
const pendingTimers = (ms) => timerQueue.filter(t => t && (ms === undefined || t.ms === ms));

// ==================== 网络打桩 ====================
let apiCalls = [];
let hangWords = false;               // true = /api/words/* 永不返回（模拟后台核对还在路上）
let respond = () => ({});

const sandbox = {
    console,
    setTimeout: fakeSetTimeout,
    clearTimeout: fakeClearTimeout,
    setImmediate,
    document: documentStub,
    window: { addEventListener() {}, innerWidth: 1200, scrollTo() {}, location: { protocol: 'http:' }, prompt: () => 'x' },
    // 释义锁（2026-10-07）：产品默认是「猜词模式（锁上）」——点词只会看到猜测框、看不到释义。
    // 本文件测的是**查看模式**下那张完整释义卡片，所以显式播种 guessMode='off'。
    // 猜词模式自身的行为由 test_guess_lock.js 负责（两边都不削弱）。
    // 同时给一个「真能读写的内存版 localStorage」：解锁相关的代码会往回写。
    localStorage: (function () {
        const store = { accessPassword: 'pwd', guessMode: 'off' };
        return {
            getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
            setItem: (k, v) => { store[k] = String(v); },
            removeItem: (k) => { delete store[k]; },
        };
    })(),
    fetch: async (url, opts) => {
        const u = String(url);
        apiCalls.push(`${(opts && opts.method) || 'GET'} ${u}`);
        if (hangWords && u.includes('/api/words/')) return new Promise(() => {});
        const data = respond(u, opts) || {};
        return { ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) };
    },
    Math, Date, JSON, Promise, Object, Array, String, Number, Boolean, RegExp, Error, isNaN, parseInt, parseFloat, Map, Set,
    AbortController: class { constructor() { this.signal = {}; } abort() {} },
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const src = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
vm.runInContext(src + `
globalThis.__t = {
  setArticle: (a) => { currentArticle = a; },
  cardHtml: () => (currentWordCard ? currentWordCard.innerHTML : null),
  cardExists: () => !!currentWordCard,
  hasPending: () => !!(currentWordCard && /wc-pending/.test(currentWordCard.innerHTML)),
  ctxDefOnCard: () => (currentWordCard ? currentWordCard.getAttribute('data-ctx-def') : null),
  hasSentenceBtn: () => !!(currentWordCard && currentWordCard.querySelector('.wc-btn-sentence')),
  hasSentenceTransBox: () => !!(currentWordCard && currentWordCard.querySelector('.wc-st-box')),
  clear: () => hideWordCard(),
  open: (w, s) => openWordCard(w, s, w, 10, 10),
  prefetch: () => prefetchDictionaryForArticle(),
  prefetchPending: () => dictionaryPrefetchPending,
  dictCache: () => dictionaryCache,
  dictOf: (w) => dictionaryOf(w),
};
`, sandbox, { filename: 'app.js' });

// ==================== 断言工具 ====================
let pass = 0, fail = 0;
const log = console.log;
function check(name, cond, extra) {
    if (cond) { pass++; log(`  PASS  ${name}`); }
    else { fail++; log(`  FAIL  ${name}${extra ? '  ← ' + extra : ''}`); }
}
const t = sandbox.__t;
const flush = () => new Promise(r => setImmediate(r));

// 一份够真实的词典条目（结构照抄 db.js parseDictionaryRow 的输出）
function dictEntry(word) {
    return {
        word: word,
        lemma: null,
        phonetic: "'betə",
        phoneticPretty: 'ˈbetə',
        translationLines: ['adj. 更好的；较好的', 'adv. 更好地；更', 'n. 较好的人'],
        definitionLines: ['comparative of good'],
        pos: 'adj:100',
        collins: 5,
        oxford: 1,
        tagList: ['zk', 'gk', 'cet4'],
        bnc: 1234,
        frq: 2345,
        forms: [{ label: '原级', value: 'good' }],
    };
}

(async () => {
    console.log = () => {};

    // ============================================================
    log('\n【场景1】词典预取 + 文章释义都就绪 → 点词「同步」出卡，两栏齐全');
    // ============================================================
    timerQueue.length = 0;
    respond = (u) => u.includes('/api/dictionary/batch')
        ? { success: true, entries: { better: dictEntry('better') } }
        : {};
    t.setArticle({ id: 'a1', article: 'This one is better than that one.', words: { better: '更好的' }, sentences: [], questions: [] });
    t.clear();
    apiCalls = [];
    t.prefetch();
    await flush(); await flush();
    check('进阅读页发起了一次批量预取', apiCalls.some(c => c.startsWith('POST') && c.includes('/api/dictionary/batch')), apiCalls.join(' , '));
    check('预取结果灌进了本地缓存', !!t.dictOf('better'));
    check('预取结束标记已复位', t.prefetchPending() === false);

    let resolveWords = null;
    respond = (u) => {
        if (u.includes('/api/words/better')) return new Promise(r => { resolveWords = () => r({ success: true, contextDefinition: '（语境）更好的', contextSource: 'context', dictionary: dictEntry('better') }); });
        return {};
    };
    t.open('better', 'This one is better than that.');
    const htmlSync = t.cardHtml();
    check('openWordCard 返回时卡片已存在（同步出卡，没等网络）', !!htmlSync);
    check('同步卡片已含音标', !!htmlSync && htmlSync.indexOf('/ˈbetə/') >= 0);
    check('同步卡片已含「当前语境释义」栏', !!htmlSync && htmlSync.indexOf('当前语境释义') >= 0);
    check('同步卡片已含「其他释义」栏', !!htmlSync && htmlSync.indexOf('其他释义') >= 0);
    check('「当前语境释义」排在「其他释义」之前', !!htmlSync && htmlSync.indexOf('当前语境释义') < htmlSync.indexOf('其他释义'));
    check('同步卡片带上了文章里的释义', !!htmlSync && htmlSync.indexOf('更好的') >= 0);
    check('同步卡片列出了词典多个义项', !!htmlSync && htmlSync.indexOf('较好的') >= 0 && htmlSync.indexOf('较好的人') >= 0);
    check('同步卡片显示「正在核对本句释义…」', t.hasPending() === true);
    check('卡片里没有「本句翻译」按钮（已删除）', t.hasSentenceBtn() === false);
    check('卡片里没有「本句翻译」的译文盒子（已删除）', t.hasSentenceTransBox() === false);

    await flush(); await flush();   // 让异步请求真的发出去，拿到它的 resolve 句柄
    check('后台核对请求已发出，且不带 ai=1（默认不联网）',
        apiCalls.some(c => c.includes('/api/words/better') && c.indexOf('ai=1') < 0), apiCalls.join(' , '));
    if (resolveWords) resolveWords();
    await flush(); await flush();
    const htmlAfter = t.cardHtml();
    check('后台核对完成后卡片换成精确本句释义', !!htmlAfter && htmlAfter.indexOf('（语境）更好的') >= 0);
    check('核对完成后「正在核对」提示消失', t.hasPending() === false);
    check('语境释义被记进 data-ctx-def（重绘不丢）', decodeURIComponent(t.ctxDefOnCard() || '') === '（语境）更好的');
    check('后台刷新后卡片里依然没有「本句翻译」按钮', t.hasSentenceBtn() === false);

    // ============================================================
    log('\n【场景2】点一个「词典没收录、本句也没释义」的冷词 → 卡片干净、不排任何计时器');
    // ============================================================
    timerQueue.length = 0;
    hangWords = true;
    t.setArticle({ id: 'a2', article: 'A zzq appeared.', words: {}, sentences: [], questions: [] });
    t.clear();
    t.open('zzq', 'A zzq appeared.');
    check('卡片同步弹出来了（零网络也能出卡）', t.cardExists() === true);
    check('词典未收录 → 提示「本地词典未收录该词」', (t.cardHtml() || '').indexOf('本地词典未收录该词') >= 0);
    check('本句释义未回来 → 显示「正在查询本句释义…」', t.hasPending() === true);
    check('冷词也不放「本句翻译」按钮（逻辑已删除）', t.hasSentenceBtn() === false);
    check('冷词也不放译文盒子（逻辑已删除）', t.hasSentenceTransBox() === false);
    check('没有排入任何 3 秒计时器', pendingTimers(3000).length === 0,
        `待触发 3000ms 定时器 ${pendingTimers(3000).length} 个`);

    // ============================================================
    log('\n【场景3】后台核对明确返回「什么都没有」→ 重绘后依然没有按钮，只留「联网深查」入口');
    // ============================================================
    timerQueue.length = 0;
    hangWords = false;
    respond = () => ({ success: true, contextDefinition: null, contextSource: null, dictionary: null, definitions: [] });
    t.setArticle({ id: 'a3', article: 'A qqxx appeared.', words: {}, sentences: [], questions: [] });
    t.clear();
    t.open('qqxx', 'A qqxx appeared.');
    check('刚出卡时依然不排 3 秒计时器', pendingTimers(3000).length === 0);
    await flush(); await flush();
    check('后台返回后仍然不排 3 秒计时器', pendingTimers(3000).length === 0);
    check('后台返回后依然没有「本句翻译」按钮', t.hasSentenceBtn() === false);
    check('「正在查询本句释义…」已收起', t.hasPending() === false);
    // 2026-10-09：按钮文案由「🔎 联网深查本句释义」改为「🤖 AI 翻译」。
    // 断言改按**类名**（wc-btn-remote）判定 —— 它才是稳定的内部标识，文案随时可能再改。
    check('卡片仍保留「AI 翻译」入口（.wc-btn-remote）', (t.cardHtml() || '').indexOf('wc-btn-remote') >= 0);
    check('「AI 翻译」文案已生效', (t.cardHtml() || '').indexOf('🤖 AI 翻译') >= 0);

    // ============================================================
    log('\n【场景4】文章里的释义要能兜住：后台没给语境释义时不能越刷新越少');
    // ============================================================
    timerQueue.length = 0;
    respond = () => ({ success: true, contextDefinition: null, contextSource: null, dictionary: dictEntry('shock'), definitions: [] });
    t.setArticle({ id: 'a4', article: 'The news was a shock.', words: { shock: '震动；冲击' }, sentences: [], questions: [] });
    t.clear();
    t.open('shock', 'The news was a shock.');
    check('同步卡片带文章释义', (t.cardHtml() || '').indexOf('震动；冲击') >= 0);
    await flush(); await flush();
    const htmlKeep = t.cardHtml() || '';
    check('后台只回了词典、没回语境 → 文章释义仍在（没被冲掉）', htmlKeep.indexOf('震动；冲击') >= 0);
    check('词典独中时也吃到了词典义项', htmlKeep.indexOf('较好的') >= 0);
    check('词典独中 → 卡片里也没有「本句翻译」按钮', t.hasSentenceBtn() === false);

    // ============================================================
    log('\n【场景5】同一篇文章只预取一次');
    // ============================================================
    apiCalls = [];
    respond = (u) => u.includes('/api/dictionary/batch') ? { success: true, entries: { abc: dictEntry('abc') } } : {};
    t.setArticle({ id: 'a5', article: 'abc def', words: { abc: 1 }, sentences: [], questions: [] });
    t.prefetch();
    await flush(); await flush();
    const firstCount = apiCalls.length;
    t.prefetch();
    await flush(); await flush();
    check('重复调用不会重复打接口', apiCalls.length === firstCount, `第一次 ${firstCount} 次，第二次后 ${apiCalls.length} 次`);
    check('换文章后会重新预取（新词的词典条目进入缓存）', !!t.dictOf('abc'));

    // ============================================================
    log('\n【场景6】用户已点了别的词 → 旧请求回来不能覆盖当前卡片');
    // ============================================================
    const resolvers = {};
    respond = (u) => {
        const m = u.match(/\/api\/words\/([^?&]+)/);
        const w = m && decodeURIComponent(m[1]);
        return new Promise(r => { resolvers[w] = () => r({ success: true, contextDefinition: '【' + w + '】的语境释义', contextSource: 'context', dictionary: null }); });
    };
    t.setArticle({ id: 'a6', article: 'first second', words: {}, sentences: [], questions: [] });
    t.clear();
    t.open('first', 'First sentence here.');
    await flush(); await flush();                 // first 的请求已发出并挂起
    check('第一个词的后台请求已挂起', typeof resolvers['first'] === 'function');
    t.open('second', 'Second sentence here.');
    await flush(); await flush();                 // second 的请求也发出并挂起
    if (resolvers['first']) resolvers['first'](); // 旧请求现在才回来
    await flush(); await flush();
    check('旧词请求回来时被丢弃（卡片还在等新词）', (t.cardHtml() || '').indexOf('【first】') < 0);
    if (resolvers['second']) resolvers['second']();
    await flush(); await flush();
    check('新词请求回来正常刷新卡片', (t.cardHtml() || '').indexOf('【second】的语境释义') >= 0);

    // ============================================================
    log('\n【场景7】关掉卡片：全程不留 3 秒计时器，也不会冒出「本句翻译」按钮');
    // ============================================================
    timerQueue.length = 0;
    hangWords = true;
    t.open('ghost', 'A ghost sentence.');
    check('出卡全程不排 3 秒计时器', pendingTimers(3000).length === 0);
    check('这张冷词卡里也没有「本句翻译」按钮', t.hasSentenceBtn() === false);
    t.clear();
    check('关卡片后仍无 3 秒计时器残留', pendingTimers(3000).length === 0);
    check('关卡片后卡片已从页面移除', t.cardExists() === false);
    hangWords = false;

    log(`\n结果：${pass} PASS / ${fail} FAIL`);
    process.exit(fail === 0 ? 0 : 1);
})().catch(e => { log('测试异常:', e && e.stack || e); process.exit(1); });
