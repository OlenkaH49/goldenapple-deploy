// 无头验证「译文不可用的三种情形」与「前后端 sentenceList 对比」（2026-10-08 新增）
//
// 起因（用户报的两个问题）：
//   ① 词卡上多了一句「自己对照一下就好，不判对错」—— 用户要求删掉（用户自己知道）
//   ② 「日志显示句子翻译成功，但浮层显示《暂无翻译》」
//
// 问题②真正的根因（用真库数据 + 真浏览器逐篇复现后定位）：
//   真库里有一批 **status='completed' 但 sentences=[] 且 sentences_error=null** 的上传文章
//   （实测 6 篇，正文 700~123316 字，译文却是 0 句）—— 这是早期「句子翻译失败被静默写成
//   completed」留下的存量数据。前端过去把它们和「预置文章本来就没译文」混为一谈，
//   悬停只显示「（暂无翻译）」，**既没有提示条也没有重试入口**，用户无从知道能修。
//
// 本文件守四件事：
//   A articleTranslationState() 的判定矩阵（ok/failed/missing/preset/loading/none）
//   B 提示条与重试按钮在 failed / missing 两种状态下都必须出现，且文案不同
//   C 悬停浮层的占位文案随状态变化（failed →「不可用」；missing →「还没有生成译文」；
//     analyzing →「还在加载中」；preset → 保持「（暂无翻译）」）
//     ★ 2026-10-08：浮层里**不再**出现「点正文上方的『重试』」——提示条不保证每篇都展开，
//       文字指路会指向一个看不见的按钮（用户报的问题二）。重试入口由提示条自己承担。
//   D logSentenceListComparison 真的把「前端 sentenceList」与「后端 sentenceList」并排打出来，
//     并在「后端有译文但前端一句没拿到」时给出「问题在加载链路、不是匹配」的结论
const fs = require('fs');
const vm = require('vm');
const path = require('path');

// ==================== 极简 DOM 打桩（与 test_word_card.js 同款） ====================
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
        offsetHeight: 40, offsetWidth: 200, isConnected: true, _children: [],
        get style() { return this._style; },
        getAttribute(k) { return this._attrs[k] === undefined ? null : this._attrs[k]; },
        setAttribute(k, v) { this._attrs[k] = v; },
        removeAttribute(k) { delete this._attrs[k]; },
        contains(other) { return other === this; },
        closest() { return null; },
        querySelector(sel) {
            const cls = String(sel).replace(/^\./, '');
            const classes = (String(this.innerHTML || '').match(/class="([^"]*)"/g) || [])
                .map(s => s.replace(/^class="/, '').replace(/"$/, ''))
                .reduce((acc, s) => acc.concat(s.split(/\s+/).filter(Boolean)), []);
            if (classes.indexOf(cls) < 0) return null;
            if (!this._qcache[sel]) { const c = makeEl(); c.parentNode = this; this._qcache[sel] = c; }
            return this._qcache[sel];
        },
        querySelectorAll() { return []; },
        getBoundingClientRect() { return { left: 10, top: 100, bottom: 120, width: 200, height: 20 }; },
        appendChild(c) { this._children.push(c); c.parentNode = this; return c; },
        removeChild(c) { this._children = this._children.filter(x => x !== c); return c; },
        remove() { this._removed = true; },
        addEventListener() {}, removeEventListener() {},
        focus() {}, click() {}, blur() {}, insertBefore(c) { return c; },
    };
    let tc = '';
    Object.defineProperty(el, 'textContent', {
        get() { return tc; },
        set(v) { tc = v == null ? '' : String(v); el.innerHTML = tc; },
        configurable: true,
    });
    return el;
}
const registry = new Map();
function getById(id) { if (!registry.has(id)) registry.set(id, makeEl()); return registry.get(id); }
['startingPage', 'dashboardPage', 'uploadPage', 'loadingPage', 'readingPage', 'wordbookPage', 'summaryPage']
    .forEach(s => getById(s).classList.add('screen'));
getById('sentenceHoverPanel').innerHTML =
    '<div class="shp-origin"></div><div class="shp-translation"></div><button class="shp-reveal hidden" id="shpRevealBtn">🔓 看翻译</button>';
// 提示条初始是 hidden（与 index.html 一致）
getById('sentenceFailNotice').classList.add('hidden');

const documentStub = {
    getElementById: getById,
    querySelectorAll: (sel) => (sel === '.screen' ? [...registry.values()].filter(e => e.classList.contains('screen')) : []),
    querySelector: () => null,
    addEventListener() {}, removeEventListener() {},
    createElement: (t) => makeEl(t),
    body: makeEl('body'),
};

const timerQueue = [];
function fakeSetTimeout(fn, ms) { timerQueue.push({ fn, ms }); return timerQueue.length; }
function fakeClearTimeout(id) { if (id > 0 && timerQueue[id - 1]) timerQueue[id - 1] = null; }

// ---- fetch 打桩：可切换「后端详情」的返回 ----
let backendDetail = { id: 'x', sentences: [] };
const fetched = [];
const lsStore = { accessPassword: 'pwd', guessMode: 'off' };

const sandbox = {
    console,
    setTimeout: fakeSetTimeout, clearTimeout: fakeClearTimeout, setImmediate,
    document: documentStub,
    window: { addEventListener() {}, innerWidth: 1200, scrollTo() {}, location: { protocol: 'http:' }, prompt: () => 'x' },
    localStorage: {
        getItem: (k) => (Object.prototype.hasOwnProperty.call(lsStore, k) ? lsStore[k] : null),
        setItem: (k, v) => { lsStore[k] = String(v); }, removeItem: (k) => { delete lsStore[k]; },
    },
    fetch: async (url) => {
        fetched.push(String(url));
        const u = String(url);
        let data = {};
        if (u.indexOf('/api/article/') >= 0) data = backendDetail;
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
  setArticle: (a) => { currentArticle = a; ARTICLES.length = 0; if (a) ARTICLES.push(a); },
  state: () => articleTranslationState(),
  sync: () => syncSentenceFailedNotice(),
  hover: (s, tr) => showSentenceHoverPanel(s, tr, null, 0),
  hoverTrans: () => {
    const p = document.getElementById('sentenceHoverPanel');
    const el = p.querySelector('.shp-translation');
    return el ? el.textContent : null;
  },
  noticeHidden: () => document.getElementById('sentenceFailNotice').classList.contains('hidden'),
  noticeText: () => document.getElementById('sentenceFailNoticeText').textContent,
  retryBtnText: () => document.getElementById('sentenceRetryBtn').textContent,
  retryBtnDisabled: () => document.getElementById('sentenceRetryBtn').disabled,
  cmp: (note) => logSentenceListComparison(note),
  listLen: () => buildSentenceList().length,
};
`, sandbox, { filename: 'app.js' });

let pass = 0, fail = 0;
const log = console.log;
function check(name, cond, extra) {
    if (cond) { pass++; log(`  PASS  ${name}`); }
    else { fail++; log(`  FAIL  ${name}${extra !== undefined ? '  ← ' + JSON.stringify(extra) : ''}`); }
}
const t = sandbox.__t;
const flush = () => new Promise(r => setImmediate(r));
const SENT = 'The rapid development of the city brings more jobs.';
const TR = '城市的快速发展带来了更多的就业机会。';

(async () => {
    console.log = () => {};

    // ============================================================
    log('\n【A 译文状态判定矩阵：这是全前端唯一的判定处】');
    // ============================================================
    const base = { id: 'a', article: SENT, source: 'upload', status: 'completed', detailLoaded: true, sentences: [] };
    t.setArticle(Object.assign({}, base));                                   check('★ completed+空译文+上传来源 → missing（本轮新增的判定）', t.state() === 'missing', t.state());
    t.setArticle(Object.assign({}, base, { detailLoaded: false }));          check('completed+空+未加载详情 → loading（不能把「还没加载」误报成「缺失」）', t.state() === 'loading', t.state());
    // ★ 2026-10-08 问题一根因：新上传文章在生成期间 sentences 恒为 []，
    //   没有 analyzing 这道闸时会掉进 missing → 浮层谎报「这篇还没有生成译文」。
    t.setArticle(Object.assign({}, base, { analyzing: true, detailLoaded: false })); check('★ 文章仍在生成中（analyzing）→ loading，绝不报 missing', t.state() === 'loading', t.state());
    t.setArticle(Object.assign({}, base, { analyzing: true, detailLoaded: true }));  check('★ 即使 detailLoaded 被判 true，只要还在生成中就必须是 loading', t.state() === 'loading', t.state());
    t.setArticle(Object.assign({}, base, { sentences: [{ sentence: SENT, translation: TR }] }));
    check('有译文 → ok', t.state() === 'ok', t.state());
    t.setArticle(Object.assign({}, base, { status: 'partial' }));            check('partial → failed', t.state() === 'failed', t.state());
    t.setArticle(Object.assign({}, base, { sentencesError: '工作流失败' })); check('带 sentencesError → failed（优先于 status）', t.state() === 'failed', t.state());
    t.setArticle(Object.assign({}, base));                                   check('★ completed+空译文+上传来源 → missing', t.state() === 'missing', t.state());
    t.setArticle(Object.assign({}, base, { source: 'preset' }));             check('预置文章无译文 → preset（不是 missing，不该给重试）', t.state() === 'preset', t.state());
    t.setArticle(null);                                                      check('无 currentArticle → none', t.state() === 'none', t.state());

    // ============================================================
    log('\n【B 提示条 + 重试按钮：missing 也必须有入口】');
    // ============================================================
    t.setArticle(Object.assign({}, base, { sentences: [{ sentence: SENT, translation: TR }] }));
    t.sync();
    check('ok → 提示条隐藏', t.noticeHidden() === true);
    t.setArticle(Object.assign({}, base, { status: 'partial', sentencesError: 'Coze 超时' }));
    t.sync();
    check('failed → 提示条显示', t.noticeHidden() === false);
    check('failed → 文案「句子翻译暂时不可用」', t.noticeText() === '句子翻译暂时不可用', t.noticeText());
    check('failed → 重试按钮可点', t.retryBtnDisabled() === false && t.retryBtnText().indexOf('重试') >= 0);
    t.setArticle(Object.assign({}, base));   // completed + 空译文 + upload
    t.sync();
    check('★ missing → 提示条也必须显示（过去完全没有入口）', t.noticeHidden() === false);
    check('★ missing → 文案是「这篇还没有生成译文」而不是「暂时不可用」', t.noticeText() === '这篇还没有生成译文', t.noticeText());
    check('★ missing → 重试按钮可点', t.retryBtnDisabled() === false && t.retryBtnText() === '重试', t.retryBtnText());
    t.setArticle(Object.assign({}, base, { source: 'preset' }));
    t.sync();
    check('preset → 提示条隐藏（预置文章本来就没有译文，不该提示失败）', t.noticeHidden() === true);
    t.setArticle(Object.assign({}, base, { detailLoaded: false }));
    t.sync();
    check('loading → 提示条隐藏（详情没到，先不下结论）', t.noticeHidden() === true);

    // ============================================================
    log('\n【C 悬停浮层占位文案随状态变化】');
    // ============================================================
    t.setArticle(Object.assign({}, base, { status: 'partial', sentencesError: 'Coze 超时' }));
    t.hover(SENT, '');
    // 2026-10-08 用户要求：浮层里**不再**写「点正文上方的『重试』」——
    // 提示条不保证每篇都展开，文字指路会指向一个看不见的按钮。浮层只如实说状态，
    // 重试入口由正文上方那条提示条（真实存在的按钮）承担。
    check('failed → 浮层说「不可用」，且不指向不存在的「重试」按钮',
        /不可用/.test(t.hoverTrans()) && t.hoverTrans().indexOf('重试') < 0, t.hoverTrans());
    t.setArticle(Object.assign({}, base));
    t.hover(SENT, '');
    check('★ missing → 浮层说「还没有生成译文」，且不指向「重试」',
        /还没有生成译文/.test(t.hoverTrans()) && t.hoverTrans().indexOf('重试') < 0, t.hoverTrans());
    check('★ missing → 不再只显示干巴巴的「（暂无翻译）」', t.hoverTrans().trim() !== '（暂无翻译）', t.hoverTrans());
    // 文章仍在生成中（analyzing）→ 只能说「加载中」，绝不能下「没有译文」的结论
    t.setArticle(Object.assign({}, base, { analyzing: true, detailLoaded: false }));
    t.hover(SENT, '');
    check('★ 生成中（analyzing）→ 浮层说「还在加载中」，**不是**「还没生成译文」',
        /加载中/.test(t.hoverTrans()) && t.hoverTrans().indexOf('还没') < 0, t.hoverTrans());
    t.setArticle(Object.assign({}, base, { source: 'preset' }));
    t.hover(SENT, '');
    check('preset → 保持「（暂无翻译）」（本来就该如此）', t.hoverTrans().trim() === '（暂无翻译）', t.hoverTrans());
    t.setArticle(Object.assign({}, base, { sentences: [{ sentence: SENT, translation: TR }] }));
    t.hover(SENT, TR);
    check('ok → 浮层正常显示译文', t.hoverTrans() === TR, t.hoverTrans());

    // ============================================================
    log('\n【D 前后端 sentenceList 对比（用户明确要求的排查手段）】');
    // ============================================================
    const logLines = [];
    const原Log = log;
    // D-1 后端有译文、前端一句都没拿到 → 必须指出「问题在加载链路，不是匹配」
    const realLog = console.log;
    console.log = (...a) => { logLines.push(a.join(' ')); };
    const warnLines = [];
    const realWarn = console.warn;
    console.warn = (...a) => { warnLines.push(a.join(' ')); };

    backendDetail = { id: 'cmp1', status: 'completed', hasSentences: true, sentencesError: null, sentences: [{ sentence: SENT, translation: TR }] };
    t.setArticle({ id: 'cmp1', article: SENT, source: 'upload', status: 'completed', detailLoaded: true, sentences: [] });
    let r = await t.cmp('单测');
    const all1 = logLines.concat(warnLines).join('\n');
    check('打印了「前端：buildSentenceList()」一行', /前端：buildSentenceList\(\)=\d+ 句/.test(all1), null);
    check('打印了「后端：/api/article/」一行', /后端：\/api\/article\//.test(all1), null);
    check('打印了前端正文节点数', /\.article-sentence=\d+ 个/.test(all1), null);
    check('★ 结论正确：后端有译文而前端没有 → 指向加载链路而非匹配', /后端有 \d+ 句译文，前端一句都没拿到/.test(all1) && /不是句子匹配/.test(all1), null);
    check('返回了可比对的数字摘要', r && r.backWithTr === 1 && r.frontWithTr === 0 && r.back === 1, r);

    // D-2 后端也没有译文 → 必须指出「从未成功 + sentences_error 为空 = 存量静默降级」
    logLines.length = 0; warnLines.length = 0;
    backendDetail = { id: 'cmp2', status: 'completed', hasSentences: false, sentencesError: null, sentences: [] };
    t.setArticle({ id: 'cmp2', article: SENT, source: 'upload', status: 'completed', detailLoaded: true, sentences: [] });
    await t.cmp('单测');
    const all2 = logLines.concat(warnLines).join('\n');
    check('★ 结论正确：后端也没有译文 → 指出「从未成功」', /后端也没有译文/.test(all2) && /从未成功/.test(all2), null);
    check('指出了 sentences_error 为空 = 静默降级时期的存量数据', /静默降级/.test(all2), null);
    check('指出了应给出「重试」入口', /重试/.test(all2), null);
    check('条数不一致被明确指出', /条数不一致：前端 1 句 vs 后端 0 句/.test(all2), null);

    // D-3 两边齐备 → 报告一致，不误报
    logLines.length = 0; warnLines.length = 0;
    backendDetail = { id: 'cmp3', status: 'completed', hasSentences: true, sentencesError: null, sentences: [{ sentence: SENT, translation: TR }] };
    t.setArticle({ id: 'cmp3', article: SENT, source: 'upload', status: 'completed', detailLoaded: true, sentences: [{ sentence: SENT, translation: TR }] });
    await t.cmp('单测');
    const all3 = logLines.concat(warnLines).join('\n');
    // ④ 那条「页面没有 .article-sentence 节点」的告警是桩的产物（桩的 querySelectorAll 恒返回 []），
    //   与本用例要验的「两份 sentenceList 是否一致」无关，所以只在剔除该行后断言没有 ❌ 误报。
    const core3 = logLines.concat(warnLines).filter(l => l.indexOf('节点') < 0).join('\n');
    check('条数一致被确认', /条数一致/.test(all3), null);
    check('逐条英文一致被确认', /逐条英文原文一致/.test(all3), null);
    check('译文齐备被确认（核心判定无 ❌ 误报）', /译文齐备/.test(all3) && core3.indexOf('❌') < 0, core3.slice(-200));

    console.log = realLog; console.warn = realWarn;

    // ============================================================
    log('\n【E 词卡不再出现「自己对照一下就好，不判对错」】');
    // ============================================================
    const srcText = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
    // 只允许 console.log 里出现（那是给排查用的说明文字），不允许出现在任何 HTML 字符串里
    const htmlHits = (srcText.match(/['"`][^'"`]*自己对照一下就好[^'"`]*['"`]/g) || []);
    check('app.js 里没有任何「自己对照一下就好，不判对错」的界面文案', htmlHits.length === 0, htmlHits);

    check('本轮全部通过', fail === 0, `${fail} FAIL`);
    log(`\n结果：${pass} PASS / ${fail} FAIL`);
    process.exit(fail === 0 ? 0 : 1);
})().catch(e => { log('测试异常:', (e && e.stack) || e); process.exit(1); });
