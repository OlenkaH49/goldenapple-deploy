// 无头验证「释义锁（猜词模式）」（2026-10-07 新增）
//
// 契约（用户需求）：
//   ① 全局锁：★2026-10-08 起默认「查看模式」★（用户要求「新文章先看内容，想猜再手动切」），
//      顶部开关可切成「猜词模式」，选择存 localStorage 并**全局**沿用（用户手动设置）
//   ② 点词：未解锁 → 只给「先猜一猜」输入框；提交后并排显示「你的猜测 / 正确释义 / 其他释义」，**不判对错**
//   ③ 句子：未解锁 → 浮层给「🤔 先猜一猜这句话的意思」+「🔓 看翻译」按钮
//   ④ 独立记忆：解锁过的词/句下次直接显示（localStorage）
//   ⑤ ★最重要★ 锁只影响「显示」，不影响「加载」—— 后端请求照发、释义照备好，解锁是纯本地重绘、零网络
//
// 与 test_word_card.js 的分工：
//   test_word_card.js  —— 查看模式（guessMode='off'）下那张完整释义卡
//   test_guess_lock.js —— 猜词模式本身的全部行为（本文件；场景0 之后会显式切到猜词模式）
//   test_word_card_browser.js【⑮】—— 真浏览器里点开关 / 真点提交按钮的端到端
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
        offsetHeight: 40, offsetWidth: 200, offsetLeft: 10, offsetTop: 100,
        isConnected: true,
        _children: [],
        get style() { return this._style; },
        getAttribute(k) { return this._attrs[k] === undefined ? null : this._attrs[k]; },
        setAttribute(k, v) { this._attrs[k] = v; },
        removeAttribute(k) { delete this._attrs[k]; },
        contains(other) { return other === this; },
        closest() { return null; },
        // 只有当 owner.innerHTML 里真的出现该 class 才返回元素（与真实 DOM 语义一致）——
        // 卡片 HTML 拼错 / class 少写一个字母，这里返回 null，断言立刻抓得到。
        querySelector(sel) {
            const cls = String(sel).replace(/^\./, '');
            const owner = this;
            const classes = (String(owner.innerHTML || '').match(/class="([^"]*)"/g) || [])
                .map(s => s.replace(/^class="/, '').replace(/"$/, ''))
                .reduce((acc, s) => acc.concat(s.split(/\s+/).filter(Boolean)), []);
            if (classes.indexOf(cls) < 0) return null;
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

// 悬停浮层的真实结构（index.html 里有这三个子节点；打桩要照抄，否则 querySelector 返回 null）
getById('sentenceHoverPanel').innerHTML =
    '<div class="shp-origin"></div><div class="shp-translation"></div><button class="shp-reveal hidden" id="shpRevealBtn">🔓 看翻译</button>';
// 顶部开关（DOMContentLoaded 才会同步文案；这里预置好，避免 syncGuessLockButton 找不到节点）
getById('guessLockBtn').innerHTML = '🔓 查看模式';

const documentStub = {
    getElementById: getById,
    querySelectorAll: (sel) => (sel === '.screen' ? [...registry.values()].filter(e => e.classList.contains('screen')) : []),
    querySelector: () => null,
    addEventListener() {}, removeEventListener() {},
    createElement: (t) => makeEl(t),
    body: makeEl('body'),
};

// ==================== 可控定时器 ====================
const timerQueue = [];
function fakeSetTimeout(fn, ms) { timerQueue.push({ fn, ms }); return timerQueue.length; }
function fakeClearTimeout(id) { if (id > 0 && timerQueue[id - 1]) timerQueue[id - 1] = null; }

// ==================== 网络打桩 ====================
let apiCalls = [];
let respond = () => ({});

// 可观测的内存版 localStorage。
//   accessPassword 预置好（否则 request() 会停在「弹密码框」那步，后台请求永远不 resolve）；
//   **guessMode / unlockedWords / unlockedSentences 一律留空** —— 空值正是要验的「产品默认」：
//   2026-10-08 起默认 = **查看模式**（用户要求新文章先看内容）。
const lsStore = { accessPassword: 'pwd' };
const localStorageStub = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(lsStore, k) ? lsStore[k] : null),
    setItem: (k, v) => { lsStore[k] = String(v); },
    removeItem: (k) => { delete lsStore[k]; },
};

const sandbox = {
    console,
    setTimeout: fakeSetTimeout,
    clearTimeout: fakeClearTimeout,
    setImmediate,
    document: documentStub,
    window: { addEventListener() {}, innerWidth: 1200, scrollTo() {}, location: { protocol: 'http:' }, prompt: () => 'x' },
    localStorage: localStorageStub,
    fetch: async (url, opts) => {
        const u = String(url);
        apiCalls.push(`${(opts && opts.method) || 'GET'} ${u}`);
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
  clear: () => hideWordCard(),
  open: (w, s) => openWordCard(w, s, w, 10, 10),
  submit: (w, s, g) => submitGuess(w, s, w, g, 10, 10),
  reveal: (w, s) => revealWordMeaning('直接看释义', w, s, w, 10, 10),
  mode: () => guessMode,
  setMode: (m) => setGuessMode(m),
  toggle: () => toggleGuessLock(),
  unlockedWords: () => unlockedWords.slice(),
  unlockedSentences: () => unlockedSentences.slice(),
  isMeaningRevealed: (w) => isMeaningRevealed(w),
  isSentenceRevealed: (s) => isSentenceRevealed(s),
  sentenceLockKey: (s) => sentenceLockKey(s),
  guessView: () => (currentWordCardData ? currentWordCardData.__guessView : null),
  cardRef: () => currentWordCard,
  cardDataHasDict: () => !!(currentWordCardData && currentWordCardData.dictionary
      && currentWordCardData.dictionary.translationLines && currentWordCardData.dictionary.translationLines.length),
  showHover: (s, tr, idx) => showSentenceHoverPanel(s, tr, null, idx),
  hoverTranslation: () => {
    const p = document.getElementById('sentenceHoverPanel');
    const el = p.querySelector('.shp-translation');
    return el ? el.textContent : null;
  },
  hoverRevealHidden: () => {
    const p = document.getElementById('sentenceHoverPanel');
    const el = p.querySelector('.shp-reveal');
    return el ? el.classList.contains('hidden') : null;
  },
  clickReveal: () => onSentenceRevealClick({ stopPropagation(){} }),
  loadState: () => loadGuessLockState(),
  maxUnlock: () => GUESS_UNLOCK_MAX,
  lockButtonText: () => document.getElementById('guessLockBtn').textContent,
  lockButtonOn: () => document.getElementById('guessLockBtn').classList.contains('lock-on'),
  syncButton: () => syncGuessLockButton(),
};
`, sandbox, { filename: 'app.js' });

// ==================== 断言工具 ====================
let pass = 0, fail = 0;
const log = console.log;
function check(name, cond, extra) {
    if (cond) { pass++; log(`  PASS  ${name}`); }
    else { fail++; log(`  FAIL  ${name}${extra !== undefined ? '  ← ' + JSON.stringify(extra) : ''}`); }
}
const t = sandbox.__t;
const flush = () => new Promise(r => setImmediate(r));

function dictEntry(word) {
    return {
        word: word, lemma: null, phonetic: "'betə", phoneticPretty: 'ˈbetə',
        translationLines: ['adj. 更好的；较好的', 'adv. 更好地；更', 'n. 较好的人'],
        definitionLines: ['comparative of good'], pos: 'adj:100',
        collins: 5, oxford: 1, tagList: ['zk', 'gk', 'cet4'], bnc: 1234, frq: 2345,
        forms: [{ label: '原级', value: 'good' }],
    };
}

(async () => {
    console.log = () => {};

    // ============================================================
    log('\n【场景0】冷启动：localStorage 为空 → 默认「查看模式」（2026-10-08 改）');
    // ============================================================
    check('★ 默认 guessMode=false（空 localStorage = 查看模式，不锁）', t.mode() === false, t.mode());
    t.syncButton();
    check('顶部开关文案=「🔓 查看模式」', t.lockButtonText() === '🔓 查看模式', t.lockButtonText());
    check('顶部开关**不带** lock-on 高亮类', t.lockButtonOn() === false);
    check('未解锁任何词句', t.unlockedWords().length === 0 && t.unlockedSentences().length === 0);
    check('查看模式下 isMeaningRevealed("better")=true（直接显示）', t.isMeaningRevealed('better') === true);
    check('查看模式下 isSentenceRevealed(任意句)=true（直接显示）', t.isSentenceRevealed('This is a test sentence.') === true);
    // 下面 1~9 场景验的是「猜词模式」本身，所以这里显式把开关拨过去（= 用户手动设置，会落盘）
    t.setMode('on');
    check('手动切到猜词模式 → guessMode=true', t.mode() === true);
    check('手动设置落盘 localStorage.guessMode="on"（全局沿用）', lsStore.guessMode === 'on', lsStore.guessMode);
    check('猜词模式下 isMeaningRevealed("better")=false（锁上）', t.isMeaningRevealed('better') === false);
    check('猜词模式下 isSentenceRevealed(任意句)=false（锁上）', t.isSentenceRevealed('This is a test sentence.') === false);

    // ============================================================
    log('\n【场景1】★核心契约★ 锁只挡「显示」，不挡「加载」—— 点词后请求照发、释义已在内存');
    // ============================================================
    respond = (u) => u.includes('/api/words/better')
        ? { success: true, contextDefinition: '（语境）更好的', contextSource: 'context', dictionary: dictEntry('better') }
        : {};
    t.setArticle({ id: 'g1', article: 'This one is better than that.', words: { better: '更好的' }, sentences: [], questions: [] });
    t.clear();
    apiCalls = [];
    t.open('better', 'This one is better than that.');
    check('点词后卡片同步弹出（零网络阻塞）', t.cardExists() === true);
    check('形态判定为 guess（未解锁）', t.guessView() === 'guess', t.guessView());
    check('刚出卡时不画释义（先猜）', (t.cardHtml() || '').indexOf('当前语境释义') < 0);
    const refBefore = t.cardRef();
    await flush(); await flush();
    check('后台核对请求**照发**（锁不拦加载）',
        apiCalls.some(c => c.includes('/api/words/better')), apiCalls.join(' , '));
    check('后台结果回来后仍停在 guess 形态（不把释义画出来）', t.guessView() === 'guess', t.guessView());
    // ★回归锚点★：猜词形态下后台精修必须「只更新内存、不重建卡片」——
    // 否则后台结果一回来就重建输入框，用户刚点开就打的字会丢焦点/丢光标。
    check('猜词形态下后台精修不重建卡片（输入框不失焦）', t.cardRef() === refBefore);
    check('后台精修的释义已悄悄备进内存（解锁时秒出、零网络）', t.cardDataHasDict() === true);

    // ============================================================
    log('\n【场景2】猜测框形态：释义/音标/徽章/动作区一个字都不该画');
    // ============================================================
    const gHtml = t.cardHtml() || '';
    check('有「🤔 先猜一猜」表单', gHtml.indexOf('先猜一猜') >= 0);
    check('有猜测输入框 .wc-guess-input', gHtml.indexOf('wc-guess-input') >= 0);
    check('有「提交」按钮', gHtml.indexOf('wc-btn-guess-submit') >= 0);
    check('有「直接看释义」跳过按钮', gHtml.indexOf('wc-btn-guess-reveal') >= 0);
    // 2026-10-09 用户要求：删掉「猜不出来也没关系，点『直接看释义』跳过」这句多余提示
    check('不再有「猜不出来也没关系」提示（用户要求删除）', gHtml.indexOf('猜不出来也没关系') < 0);
    check('不再有「跳过」提示文案', gHtml.indexOf('』跳过') < 0 && gHtml.indexOf('」跳过') < 0);
    check('句子原文仍显示（猜词要有语境）', gHtml.indexOf('This one is better than that.') >= 0);
    check('未画「当前语境释义」栏', gHtml.indexOf('当前语境释义') < 0);
    check('未画「其他释义」栏', gHtml.indexOf('其他释义') < 0);
    check('未画音标 /ˈbetə/', gHtml.indexOf('/ˈbetə/') < 0);
    check('未画词典义项（较好的 / 较好的人）', gHtml.indexOf('较好的') < 0 && gHtml.indexOf('较好的人') < 0);
    check('未画徽章（牛津3000 / 柯林斯）', gHtml.indexOf('牛津') < 0 && gHtml.indexOf('柯林斯') < 0);
    check('未画「标记」按钮（锁定期间不给绕过锁的近路）', gHtml.indexOf('wc-btn-highlight') < 0);
    check('未画「收藏」按钮', gHtml.indexOf('wc-btn-collect') < 0);
    check('未画「取消收藏」按钮（锁定期间同样不给收藏入口）', gHtml.indexOf('wc-btn-uncollect') < 0);
    check('未画「自行输入释义」入口', gHtml.indexOf('wc-btn-add-meaning') < 0);

    // ============================================================
    log('\n【场景3】点「提交」→ echo 形态：并列展示「你的猜测 / 正确释义 / 其他释义」，不判对错');
    // ============================================================
    t.submit('better', 'This one is better than that.', '更好的');
    const eHtml = t.cardHtml() || '';
    check('形态切换为 echo', t.guessView() === 'echo', t.guessView());
    check('画出了「你的猜测」', eHtml.indexOf('你的猜测') >= 0);
    check('回显了用户的猜测文本「更好的」', eHtml.indexOf('更好的') >= 0);
    check('画出了「📍 正确释义」', eHtml.indexOf('正确释义') >= 0);
    check('画出了「📚 其他释义」', eHtml.indexOf('其他释义') >= 0);
    check('「你的猜测」排在「正确释义」之前', eHtml.indexOf('你的猜测') < eHtml.indexOf('正确释义'));
    check('「正确释义」排在「其他释义」之前', eHtml.indexOf('正确释义') < eHtml.indexOf('其他释义'));
    check('★不判对错★：没有任何 ✔/✘ 判定标记', !/[✔✘✅❌]/.test(eHtml));
    // 2026-10-08 用户要求：删掉「自己对照一下就好，不判对错」这句提示（用户自己知道，不用教）
    check('★ 不再出现「自己对照一下就好」这句提示（用户要求删除）', eHtml.indexOf('自己对照一下就好') < 0);
    check('★ 也不再出现「不判对错」字样', eHtml.indexOf('不判对错') < 0);
    check('「你的猜测」与「正确释义」直接相邻（中间不再插提示句）',
        eHtml.indexOf('你的猜测') >= 0 && eHtml.indexOf('正确释义') >= 0);
    check('提交后画出了释义（语境「更好的」）', eHtml.indexOf('更好的') >= 0);
    check('提交后画出了词典义项', eHtml.indexOf('较好的') >= 0 && eHtml.indexOf('较好的人') >= 0);
    check('提交后动作区恢复（标记/收藏回归）', eHtml.indexOf('wc-btn-highlight') >= 0);
    check('单词写入 unlockedWords', t.unlockedWords().indexOf('better') >= 0, t.unlockedWords());
    check('unlockedWords 已落盘到 localStorage', (lsStore.unlockedWords || '').indexOf('better') >= 0, lsStore.unlockedWords);

    // ============================================================
    log('\n【场景4】已解锁的词再次点开 → 直接是完整释义卡（不再让用户猜）');
    // ============================================================
    respond = (u) => u.includes('/api/words/')
        ? { success: true, contextDefinition: '（语境）更好的', contextSource: 'context', dictionary: dictEntry('better') }
        : {};
    t.clear();
    t.open('better', 'This one is better than that.');
    check('形态直接是 full', t.guessView() === 'full', t.guessView());
    check('没有猜测框了', (t.cardHtml() || '').indexOf('wc-guess-input') < 0);
    check('直接画「当前语境释义」栏', (t.cardHtml() || '').indexOf('当前语境释义') >= 0);
    await flush(); await flush();   // 后台核对把词典补上（真实路径：预取/核对后词典才到）
    const fHtml = t.cardHtml() || '';
    check('直接画「其他释义」栏', fHtml.indexOf('其他释义') >= 0);
    check('直接画音标', fHtml.indexOf('ˈbetə') >= 0, fHtml.slice(0, 120));
    check('直接画词典义项', fHtml.indexOf('较好的') >= 0);

    // ============================================================
    log('\n【场景5】「直接看释义」跳过猜测 → 解锁 + full（不产生猜测回显）');
    // ============================================================
    t.clear();
    t.open('student', 'The student is here.');
    check('新词仍是 guess 形态', t.guessView() === 'guess');
    t.reveal('student', 'The student is here.');
    const rHtml = t.cardHtml() || '';
    check('点「直接看释义」后形态为 full（不是 echo）', t.guessView() === 'full', t.guessView());
    check('不显示「你的猜测」回显', rHtml.indexOf('你的猜测') < 0);
    check('student 写入 unlockedWords', t.unlockedWords().indexOf('student') >= 0);

    // ============================================================
    log('\n【场景6】全局开关：切到「查看模式」→ 所有词/句直接显示，选择落盘');
    // ============================================================
    t.setMode('off');
    check('guessMode 变为 false', t.mode() === false);
    check('localStorage.guessMode="off"', lsStore.guessMode === 'off', lsStore.guessMode);
    check('查看模式下 isMeaningRevealed=全部 true', t.isMeaningRevealed('从未点过的词zzz') === true);
    check('查看模式下 isSentenceRevealed=全部 true', t.isSentenceRevealed('never seen sentence') === true);
    t.syncButton();
    check('开关文案切到「🔓 查看模式」', t.lockButtonText() === '🔓 查看模式', t.lockButtonText());
    check('lock-on 高亮已去掉', t.lockButtonOn() === false);
    t.clear();
    t.open('better', 'This one is better than that.');
    check('查看模式下点词 → full（且不必已解锁）', t.guessView() === 'full', t.guessView());

    // 再切回来：已解锁的词仍免猜，没解锁的重新锁上
    t.setMode('on');
    check('切回猜词模式，guessMode=true', t.mode() === true);
    check('已解锁的 better 仍免猜', t.isMeaningRevealed('better') === true);
    check('没解锁过的词重新锁上', t.isMeaningRevealed('unknownword') === false);

    // ============================================================
    log('\n【场景7】句子锁：未解锁 → 浮层只给「先猜一猜」+「看翻译」按钮，译文一个中文字都不露');
    // ============================================================
    const SENT = 'With the rapid development of economy, more cars are on the road.';
    const TRANS = '随着经济的快速发展，道路上的车越来越多。';
    t.setArticle({
        id: 'g2', article: SENT, words: {}, questions: [],
        sentences: [{ sentence: SENT, translation: TRANS }],
    });
    t.showHover(SENT, TRANS, 0);
    const hT = t.hoverTranslation();
    check('浮层译文位置显示「先猜一猜这句话的意思」', /先猜一猜/.test(hT || ''), hT);
    check('★译文没被显示★（中文译文不出现）', (hT || '').indexOf('随着经济') < 0, hT);
    check('「🔓 看翻译」按钮显示出来（hidden 已移除）', t.hoverRevealHidden() === false);

    // 点「看翻译」→ 解锁 + 原地显示译文（零网络）
    apiCalls = [];
    t.clickReveal();
    const hT2 = t.hoverTranslation();
    check('点「看翻译」后浮层显示真译文', (hT2 || '').indexOf('随着经济') >= 0, hT2);
    check('「看翻译」按钮收起（hidden 加回）', t.hoverRevealHidden() === true);
    check('★解锁是纯本地：没有发出任何网络请求★', apiCalls.length === 0, apiCalls);
    check('句子写入 unlockedSentences', t.unlockedSentences().length === 1, t.unlockedSentences());
    check('unlockedSentences 已落盘', !!lsStore.unlockedSentences, lsStore.unlockedSentences);

    // ============================================================
    log('\n【场景8】句子 key 归一化：同句标点/大小写/空格差异不应重复上锁');
    // ============================================================
    const k1 = t.sentenceLockKey(SENT);
    const k2 = t.sentenceLockKey('  ' + SENT.toUpperCase().replace(',', ' , ') + '  ');
    check('归一化后 key 一致（多空格 + 大写 + 标点变化不影响）', k1 === k2, { k1, k2 });
    check('归一化后的句子判定为已解锁', t.isSentenceRevealed(SENT.toUpperCase()) === true);

    // ============================================================
    log('\n【场景9】查看模式下句子直接给译文（不再要求先猜）');
    // ============================================================
    const SENT2 = 'Another completely fresh sentence about weather.';
    const TRANS2 = '另一句关于天气的全新句子。';
    t.setArticle({ id: 'g3', article: SENT2, words: {}, questions: [], sentences: [{ sentence: SENT2, translation: TRANS2 }] });
    t.setMode('off');
    t.showHover(SENT2, TRANS2, 0);
    check('查看模式：浮层直接显示译文', (t.hoverTranslation() || '').indexOf('天气') >= 0, t.hoverTranslation());
    check('查看模式：「看翻译」按钮隐藏', t.hoverRevealHidden() === true);
    t.setMode('on');

    // ============================================================
    log('\n【场景10】脏数据 / 边界容错（无痕模式、被写坏的值都不能把功能带崩）');
    // ============================================================
    // 10-a unlockedWords 是坏 JSON → 当空表，不抛异常
    lsStore.unlockedWords = '{ this is not json';
    t.loadState();
    check('坏 JSON 的 unlockedWords → 当空表处理', t.unlockedWords().length === 0, t.unlockedWords());
    // 10-b guessMode 写成脏值 → 只认 'on'，其它一律当「查看模式」（默认行为必须稳定）
    lsStore.guessMode = 'ONNN';
    t.loadState();
    check('脏值 guessMode 一律当「查看模式」（只有显式 on 才锁上）', t.mode() === false, lsStore.guessMode);
    // 10-b2 显式 'off' / 缺省 → 都是查看模式；显式 'on' → 猜词模式（全局沿用契约）
    lsStore.guessMode = 'off'; t.loadState();
    check('显式 off → 查看模式', t.mode() === false);
    delete lsStore.guessMode; t.loadState();
    check('缺省（null）→ 默认查看模式', t.mode() === false);
    lsStore.guessMode = 'on'; t.loadState();
    check('显式 on → 猜词模式（用户手动设置会被沿用）', t.mode() === true);
    // 10-c 列表里有重复项 / null / 空串 → 规整去重（重复项只留一份，空值丢弃）
    lsStore.unlockedWords = JSON.stringify(['better', 'better', '', null, 'student', 'better']);
    t.loadState();
    check('重复/空项被规整（去重保序，空值丢弃）',
        JSON.stringify(t.unlockedWords()) === JSON.stringify(['better', 'student']), t.unlockedWords());
    // 10-d localStorage.setItem 抛异常（无痕模式）→ 不把异常抛给「点词」这个核心流程
    const origSet = localStorageStub.setItem;
    localStorageStub.setItem = () => { throw new Error('QuotaExceededError (simulated private mode)'); };
    let threw = false;
    try {
        t.clear();
        t.open('brandnewword', 'A brandnewword appeared.');
        t.submit('brandnewword', 'A brandnewword appeared.', '猜测');
    } catch (e) { threw = true; }
    check('localStorage 写入失败时「点词→提交」仍不抛异常（功能不受影响）', threw === false);
    check('写入失败时内存里的解锁仍然生效', t.unlockedWords().indexOf('brandnewword') >= 0);
    localStorageStub.setItem = origSet;
    // 10-e 上限淘汰：超过 GUESS_UNLOCK_MAX 丢最旧
    const max = t.maxUnlock();
    const big = [];
    for (let i = 0; i < max + 5; i++) big.push('w' + i);
    lsStore.unlockedWords = JSON.stringify(big);
    t.loadState();
    t.submit('newcomer', 'A newcomer appeared.', 'x');
    const uw = t.unlockedWords();
    check(`解锁列表被限制在 ${max} 条以内`, uw.length <= max, uw.length);
    check('超限时淘汰的是最旧的（w0 已不在）', uw.indexOf('w0') < 0);
    check('最新解锁的仍在表里', uw.indexOf('newcomer') >= 0);

    // 末尾用 check() 报一次总结果，好让「结果」行走 log（console.log 已被静音）
    check('本轮全部通过', fail === 0, `${fail} FAIL`);
    log(`\n结果：${pass} PASS / ${fail} FAIL`);
    process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.log('测试异常:', (e && e.stack) || e); process.exit(1); });
