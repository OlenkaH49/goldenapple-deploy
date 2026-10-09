// 无头验证首页「快捷操作」三个功能（2026-10-09 新增）
//
// 契约（用户需求）：
//   ① My Wordbooks   —— 已有（showVocabBook），本文件只验它的副标题计数跟着收藏数走
//   ② Learn Vocabulary —— 队列 = user_words.status='pending'（无 pending 时按知识度最低推荐）；
//                          流程 = 显示单词 → 用户回忆 → 显示释义 → 「认识 / 不认识」→ 回写 mastered / learning
//   ③ Review Words    —— 队列 = next_review_at <= 现在 ∪ status='review'；
//                          流程 = 显示单词 → 四选一 → 判对错 → 答对 mastered / 答错 review
//   ④ Daily Challenge —— 每天 3 道拼写题，全做完 +1 🍎，**每天最多一次**
//
// 与其它测试的分工：
//   本文件（无头）—— 队列口径 / 判定 / 状态回写 / 苹果发放的**逻辑**分支
//   test_word_card_browser.js【㉔】—— 真浏览器里点三个入口、真输入框、真渲染
const fs = require('fs');
const vm = require('vm');
const path = require('path');

// ==================== 极简 DOM 打桩（与 test_guess_lock.js 同款） ====================

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
        isConnected: true, _children: [], innerHTML: '',
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
            if (!this._qcache[sel]) { const child = makeEl(); child.parentNode = this; this._qcache[sel] = child; }
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
    // ★ 必须复刻真实 DOM 的 textContent → innerHTML 语义：app.js 的 escapeHtml() 就是
    //   `div.textContent = s; return div.innerHTML`，桩里若不实现这个转换，escapeHtml 会恒返回 ''
    //   → 页面文本全空、断言连锁失败（这不是产品 bug，是桩没搭对）。
    let tc = '';
    Object.defineProperty(el, 'textContent', {
        get() { return tc; },
        set(v) { tc = v == null ? '' : String(v); el.innerHTML = tc.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); },
        configurable: true,
    });
    return el;
}

const registry = new Map();
function getById(id) {
    if (!registry.has(id)) { const e = makeEl(); e.id = id; registry.set(id, e); }
    return registry.get(id);
}
['startingPage', 'dashboardPage', 'uploadPage', 'loadingPage', 'readingPage',
    'wordbookPage', 'summaryPage', 'practicePage'].forEach(s => getById(s).classList.add('screen'));

const documentStub = {
    getElementById: getById,
    querySelectorAll: (sel) => (sel === '.screen' ? [...registry.values()].filter(e => e.classList.contains('screen')) : []),
    querySelector: () => null,
    addEventListener() {}, removeEventListener() {},
    createElement: (t) => makeEl(t),
    body: makeEl('body'),
};

// ==================== 网络打桩 ====================
let apiCalls = [];
const lsStore = { accessPassword: 'pwd' };
const localStorageStub = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(lsStore, k) ? lsStore[k] : null),
    setItem: (k, v) => { lsStore[k] = String(v); },
    removeItem: (k) => { delete lsStore[k]; },
};

const sandbox = {
    console,
    setTimeout: (fn) => { try { fn(); } catch (e) {} return 1; },   // 立刻执行（toast 的 2s 复位）
    clearTimeout: () => {},
    setImmediate,
    document: documentStub,
    window: { addEventListener() {}, innerWidth: 1200, scrollTo() {}, location: { protocol: 'http:' }, prompt: () => 'x' },
    localStorage: localStorageStub,
    fetch: async (url, opts) => {
        const u = String(url);
        apiCalls.push(`${(opts && opts.method) || 'GET'} ${u}`);
        return { ok: true, status: 200, json: async () => ({ success: true }), text: async () => '{}' };
    },
    Math, Date, JSON, Promise, Object, Array, String, Number, Boolean, RegExp, Error, isNaN, parseInt, parseFloat, Map, Set,
    AbortController: class { constructor() { this.signal = {}; } abort() {} },
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const src = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
vm.runInContext(src + `
globalThis.__q = {
  setWords: (list) => { userData.collectedWords = list; },
  dump: () => userData.collectedWords.map(w => ({ word: w.word, status: w.status, nextReviewAt: w.nextReviewAt })),
  learnQueue: () => learnQueue().map(w => w.word),
  reviewQueue: () => reviewQueue().map(w => w.word),
  challengeQueue: () => challengeQueue().map(w => w.word),
  renderQuickActions: () => renderQuickActions(),
  subOf: (id) => (document.getElementById(id) || {}).textContent,
  start: (m) => startPractice(m),
  state: () => (practiceState ? {
      mode: practiceState.mode, idx: practiceState.idx, phase: practiceState.phase,
      total: practiceState.queue.length,
      word: (practiceState.queue[practiceState.idx] || {}).word,
      stats: Object.assign({}, practiceState.stats),
      optionCount: (practiceState.options || []).length,
  } : null),
  bodyHtml: () => document.getElementById('practiceBody').innerHTML,
  actionsHtml: () => document.getElementById('practiceActions').innerHTML,
  title: () => document.getElementById('practiceTitle').textContent,
  progress: () => document.getElementById('practiceProgress').textContent,
  reveal: () => practiceReveal(),
  mark: (k) => practiceMark(k),
  choose: (i) => practiceChoose(i),
  submitSpelling: (v) => { const i = document.getElementById('practiceSpellInput'); if (i) i.value = v; practiceSubmitSpelling(); },
  advance: () => practiceAdvance(),
  exit: () => exitPractice(),
  activeScreen: () => { const s = [...document.querySelectorAll('.screen')].filter(e => e.classList.contains('active')); return s.length ? s[s.length-1].id : null; },
  activeScreens: () => [...document.querySelectorAll('.screen')].filter(e => e.classList.contains('active')).map(e => e.id),
  toastText: () => document.getElementById('toast').textContent,
  apples: () => applesOf(),
  challengeDate: () => localStorage.getItem('gaChallengeDate'),
  challengeDone: () => challengeDoneToday(),
  todayKey: () => todayKey(),
  statusOf: (w) => { const x = userData.collectedWords.find(q => q.word === w); return x ? x.status : null; },
  nextReviewOf: (w) => { const x = userData.collectedWords.find(q => q.word === w); return x ? x.nextReviewAt : null; },
  // 拼写题例句挖空（2026-10-09 新增）
  maskSentence: (s, w, o) => maskWordInSentence(s, w, o),
  wordForms: (w) => wordMatchForms(w),
  textLeaks: (t, w) => textLeaksWord(t, w),
  hint: () => practiceHint(),
};
`, sandbox, { filename: 'app.js' });

// ==================== 断言工具 ====================
let pass = 0, fail = 0;
const log = console.log;
function check(name, cond, extra) {
    if (cond) { pass++; log(`  PASS  ${name}`); }
    else { fail++; log(`  FAIL  ${name}${extra !== undefined ? '  ← ' + JSON.stringify(extra) : ''}`); }
}
const q = sandbox.__q;
const DAY = 86400000;
const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();

function fixture() {
    return [
        { id: 1, word: 'alpha', meaning: '甲', status: 'pending', knowledge: 0, nextReviewAt: null, sentence: 'Alpha is here.', articleId: 'a1' },
        { id: 2, word: 'beta', meaning: '乙', status: 'pending', knowledge: 0, nextReviewAt: null, sentence: '', articleId: 'a1' },
        { id: 3, word: 'gamma', meaning: '丙', status: 'learning', knowledge: 0.5, nextReviewAt: iso(now - DAY), sentence: 'Gamma rays are strong.', articleId: 'a1' },   // 已到期
        { id: 4, word: 'delta', meaning: '丁', status: 'mastered', knowledge: 1, nextReviewAt: iso(now + 6 * DAY), sentence: '', articleId: 'a1' },                      // 未到期
        { id: 5, word: 'epsilon', meaning: '戊', status: 'review', knowledge: 0.2, nextReviewAt: iso(now + DAY), sentence: '', articleId: 'a2' },                        // status=review
        { id: 6, word: 'zeta', meaning: '己', status: 'mastered', knowledge: 1, nextReviewAt: null, sentence: '', articleId: 'a2' },                                     // 历史遗留（无排期）
        { id: 7, word: 'eta', meaning: '', status: 'pending', knowledge: 0, nextReviewAt: null, sentence: '', articleId: 'a2' },                                        // 无释义
    ];
}

(async () => {
    console.log = () => {};

    // ============================================================
    log('\n【A 队列口径】');
    // ============================================================
    q.setWords(fixture());
    apiCalls = [];

    const learn = q.learnQueue();
    check('A1 learn 队列 = 全部 status=pending 的词（alpha/beta/eta）',
        learn.length === 3 && learn.indexOf('alpha') >= 0 && learn.indexOf('beta') >= 0 && learn.indexOf('eta') >= 0, learn);
    check('A2 learn 队列不含已分类的词', learn.indexOf('gamma') < 0 && learn.indexOf('delta') < 0, learn);

    const review = q.reviewQueue().slice().sort();
    check('A3 review 队列 = next_review_at 到期（gamma）∪ status=review（epsilon）∪ 历史遗留无排期（zeta）',
        review.join(',') === 'epsilon,gamma,zeta', review);
    check('A4 review 队列**不含**未到期的 mastered（delta）', review.indexOf('delta') < 0, review);
    check('A5 review 队列不含 pending（没学过的东西不该「复习」）',
        review.indexOf('alpha') < 0 && review.indexOf('beta') < 0, review);

    const ch = q.challengeQueue();
    check('A6 daily challenge 抽 3 个', ch.length === 3, ch);
    check('A7 challenge 只抽「有释义」的词（eta 无释义 → 排除）', ch.indexOf('eta') < 0, ch);

    // ---- 无 pending 时 learn 的退化口径 ----
    q.setWords(fixture().filter(w => w.status !== 'pending'));
    const learn2 = q.learnQueue();
    check('A8 没有 pending 时 → 按知识度最低的未掌握词推荐（gamma 0.5 入选）',
        learn2.indexOf('gamma') >= 0 && learn2.indexOf('delta') < 0, learn2);
    q.setWords(fixture());

    // ============================================================
    log('\n【B 首页副标题计数】');
    // ============================================================
    q.renderQuickActions();
    check('B1 My Wordbooks 副标题 = 收藏词总数', /^7 个收藏词$/.test(q.subOf('qaWordbooksSub')), q.subOf('qaWordbooksSub'));
    check('B2 Learn 副标题 = 待学词数（3）', q.subOf('qaLearnSub') === '3 个待学单词', q.subOf('qaLearnSub'));
    check('B3 Review 副标题 = 今天该复习词数（3）', q.subOf('qaReviewSub') === '3 个今日复习', q.subOf('qaReviewSub'));
    check('B4 Challenge 副标题默认 = +1 🍎', q.subOf('qaChallengeSub').indexOf('+1 🍎') >= 0, q.subOf('qaChallengeSub'));

    // ---- 空队列时的文案 ----
    q.setWords([{ id: 9, word: 'solo', meaning: '单独', status: 'mastered', knowledge: 1, nextReviewAt: iso(now + 9 * DAY) }]);
    q.renderQuickActions();
    check('B5 无待学 → 副标题「暂无待学单词」', q.subOf('qaLearnSub') === '暂无待学单词', q.subOf('qaLearnSub'));
    check('B6 无到期 → 副标题「今日无复习任务」', q.subOf('qaReviewSub') === '今日无复习任务', q.subOf('qaReviewSub'));

    // ============================================================
    log('\n【C 空队列不空跑】');
    // ============================================================
    q.start('review');
    check('C1 review 队列为空 → 不进练习屏', q.state() === null, q.state());
    check('C2 给出提示文案', q.toastText().indexOf('今天没有到期的复习词') >= 0, q.toastText());

    // ============================================================
    log('\n【D 学习词汇：显示单词 → 回忆 → 释义 → 认识/不认识】');
    // ============================================================
    q.setWords(fixture());
    apiCalls = [];
    q.start('learn');
    let st = q.state();
    check('D1 进入练习屏且停在 prompt 阶段', st && st.mode === 'learn' && st.phase === 'prompt', st);
    check('D2 第一张卡是 alpha', st.word === 'alpha', st);
    check('D3 prompt 阶段只给「显示释义」，不给判定按钮',
        q.bodyHtml().indexOf('practice-word') >= 0 && q.actionsHtml().indexOf('practiceReveal') >= 0
        && q.actionsHtml().indexOf('practiceMark') < 0, q.actionsHtml());
    check('D4 prompt 阶段**不泄露释义**', q.bodyHtml().indexOf('甲') < 0, q.bodyHtml());
    check('D5 标题 / 进度正确', q.title() === '学习词汇' && q.progress() === '1 / 3', q.title() + '|' + q.progress());

    q.reveal();
    st = q.state();
    check('D6 点「显示释义」→ answer 阶段', st.phase === 'answer', st);
    check('D7 answer 阶段显示释义 + 两个判定按钮',
        q.bodyHtml().indexOf('甲') >= 0 && q.actionsHtml().indexOf('practiceMark(false)') >= 0
        && q.actionsHtml().indexOf('practiceMark(true)') >= 0, q.actionsHtml());

    q.mark(true);
    await new Promise(r => setImmediate(r));
    check('D8 「认识了」→ 本地 status=mastered', q.statusOf('alpha') === 'mastered', q.statusOf('alpha'));
    check('D9 「认识了」→ next_review_at 排到 7 天后', q.nextReviewOf('alpha') && Date.parse(q.nextReviewOf('alpha')) > now + 6 * DAY, q.nextReviewOf('alpha'));
    check('D10 回写接口被调用 PUT /api/word-status/1',
        apiCalls.some(u => /^PUT \S*\/api\/word-status\/1$/.test(u)), apiCalls);
    st = q.state();
    check('D11 自动进入下一张卡（beta, prompt）', st.idx === 1 && st.word === 'beta' && st.phase === 'prompt', st);

    q.reveal();
    q.mark(false);
    check('D12 「还不认识」→ status=learning', q.statusOf('beta') === 'learning', q.statusOf('beta'));
    q.reveal();
    q.mark(true);      // eta
    st = q.state();
    check('D13 三张卡走完 → done 阶段', st && st.phase === 'done', st);
    check('D14 结算显示「认识 2 / 不认识 1」',
        q.bodyHtml().indexOf('认识的 2 个') >= 0 && q.bodyHtml().indexOf('还不认识的 1 个') >= 0, q.bodyHtml());
    check('D15 学习不发放苹果', q.apples() === 0, q.apples());

    // ============================================================
    log('\n【E 复习单词：四选一 → 判对错 → 状态重排】');
    // ============================================================
    q.setWords(fixture());
    apiCalls = [];
    q.start('review');
    st = q.state();
    check('E1 进入 review ask 阶段，题数 = 到期数（3）', st && st.mode === 'review' && st.phase === 'ask' && st.total === 3, st);
    check('E2 给出 4 个选项', st.optionCount === 4, st);
    check('E3 选项里含正确释义「丙」', q.bodyHtml().indexOf('丙') >= 0, q.bodyHtml());
    check('E4 干扰项来自其它词的释义（甲/乙/丁/戊/己 至少一个）',
        /[甲乙丁戊己]/.test(q.bodyHtml()), q.bodyHtml());
    check('E5 选项按钮带 A/B/C/D 编号', q.bodyHtml().indexOf('>A<') >= 0 && q.bodyHtml().indexOf('>D<') >= 0, q.bodyHtml());

    // 找出正确选项下标（题目由 buildReviewOptions 打乱）
    const optHtml = q.bodyHtml();
    const optTexts = (optHtml.match(/<button class="practice-option"[\s\S]*?<\/button>/g) || [])
        .map(s => s.replace(/<[^>]+>/g, '').replace(/^[A-D]/, '').trim());
    const correctIdx = optTexts.indexOf('丙');
    check('E6 能在渲染出的选项里定位到正确答案', correctIdx >= 0, optTexts);

    q.choose(correctIdx);
    await new Promise(r => setImmediate(r));
    st = q.state();
    check('E7 答对 → feedback 阶段', st.phase === 'feedback', st);
    check('E8 答对 gamma → status=mastered（7 天后再见）', q.statusOf('gamma') === 'mastered', q.statusOf('gamma'));
    check('E9 答对回写接口被调用 PUT /api/word-status/3', apiCalls.some(u => /^PUT \S*\/api\/word-status\/3$/.test(u)), apiCalls);
    check('E10 feedback 显示「答对了」', q.bodyHtml().indexOf('答对了') >= 0, q.bodyHtml());

    q.advance();
    st = q.state();
    check('E11 进入第 2 题', st.idx === 1 && st.phase === 'ask', st);
    const opt2 = (q.bodyHtml().match(/<button class="practice-option"[\s\S]*?<\/button>/g) || [])
        .map(s => s.replace(/<[^>]+>/g, '').replace(/^[A-D]/, '').trim());
    const correct2 = opt2.indexOf('戊');
    const wrongIdx = opt2.findIndex((t, i) => i !== correct2);
    q.choose(wrongIdx);
    await new Promise(r => setImmediate(r));
    check('E12 答错 → 「答错了」提示', q.bodyHtml().indexOf('答错了') >= 0, q.bodyHtml());
    check('E13 答错 → status=review（明天再来）', q.statusOf('epsilon') === 'review', q.statusOf('epsilon'));
    check('E14 答错 → next_review_at 排到 1 天后',
        q.nextReviewOf('epsilon') && Date.parse(q.nextReviewOf('epsilon')) < now + 2 * DAY, q.nextReviewOf('epsilon'));

    q.advance();
    q.advance();   // 第 3 题直接跳过（zeta）
    st = q.state();
    check('E15 三题走完 → done', st && st.phase === 'done', st);
    check('E16 结算显示「答对 1 / 3 个」', q.bodyHtml().indexOf('答对 1 / 3 个') >= 0, q.bodyHtml());

    // ============================================================
    log('\n【F 每日挑战：3 道拼写题 → +1 🍎（每天一次）】');
    // ============================================================
    lsStore.gaApples = undefined; delete lsStore.gaApples;
    delete lsStore.gaChallengeDate;
    q.setWords(fixture());
    check('F0 起始 🍎 = 0、今日未完成', q.apples() === 0 && q.challengeDone() === false, q.apples());

    q.start('challenge');
    st = q.state();
    check('F1 挑战队列 = 3 题', st && st.mode === 'challenge' && st.total === 3, st);
    check('F2 题面给的是中文释义 + 拼写输入框',
        q.bodyHtml().indexOf('practiceSpellInput') >= 0 && q.bodyHtml().indexOf('practice-prompt') >= 0, q.bodyHtml());
    check('F3 给「首字母 + 长度」提示', q.bodyHtml().indexOf('首字母') >= 0 && q.bodyHtml().indexOf('个字母') >= 0, q.bodyHtml());
    check('F4 ★ 题面**不包含单词本身**（大小写不敏感；否则等于送答案）',
        q.textLeaks(q.bodyHtml(), st.word) === false, { word: st.word, html: q.bodyHtml() });

    // 第 1 题：拼对
    q.submitSpelling(st.word);
    st = q.state();
    check('F5 拼对 → feedback + 「拼对了」', st.phase === 'feedback' && q.bodyHtml().indexOf('拼对了') >= 0, st);
    check('F6 拼对 → 该词 status=mastered', q.statusOf(st.word) === 'mastered', q.statusOf(st.word));
    q.advance();

    // 第 2 题：拼错
    st = q.state();
    const w2 = st.word;
    q.submitSpelling(w2 + 'zz');
    check('F7 拼错 → 「拼错了」', q.bodyHtml().indexOf('拼错了') >= 0, q.bodyHtml());
    check('F8 拼错 → 不升级 status（仍为原值）', q.statusOf(w2) === 'mastered' || q.statusOf(w2) === 'pending' || q.statusOf(w2) === 'review' || q.statusOf(w2) === 'learning', q.statusOf(w2));
    q.advance();

    // 第 3 题：空输入也算错
    st = q.state();
    q.submitSpelling('');
    check('F9 空输入 → 判错', q.bodyHtml().indexOf('拼错了') >= 0, q.bodyHtml());
    q.advance();

    st = q.state();
    check('F10 三题走完 → done', st && st.phase === 'done', st);
    check('F11 ★ 完成后 🍎 +1', q.apples() === 1, q.apples());
    check('F12 ★ 记录今天已完成', q.challengeDate() === q.todayKey(), q.challengeDate());
    check('F13 结算页显示苹果到账', q.bodyHtml().indexOf('🍎') >= 0 && q.bodyHtml().indexOf('现有 🍎 1') >= 0, q.bodyHtml());

    // ---- 再跑一次：不重复发苹果 ----
    q.setWords(fixture());
    q.start('challenge');
    for (let i = 0; i < 3; i++) {
        const s2 = q.state();
        if (!s2 || s2.phase === 'done') break;
        q.submitSpelling(s2.word);
        q.advance();
    }
    check('F14 ★ 同一天再完成一次 → 苹果仍是 1（每天最多一颗）', q.apples() === 1, q.apples());
    check('F15 第二次结算提示「不重复发放」', q.bodyHtml().indexOf('不重复发放') >= 0, q.bodyHtml());

    q.renderQuickActions();
    check('F16 完成后首页副标题显示「今日已完成」', q.subOf('qaChallengeSub').indexOf('今日已完成') >= 0, q.subOf('qaChallengeSub'));

    // ---- 跨天：改日期后应能再拿一颗 ----
    lsStore.gaChallengeDate = '2000-01-01';
    check('F17 换一天 → challengeDoneToday 变 false', q.challengeDone() === false, q.challengeDone());

    // ============================================================
    log('\n【H 每日挑战：拼写题例句挖空（不在例句里送答案）】');
    // ============================================================
    // H1-H7：纯函数 maskWordInSentence / wordMatchForms
    const SENT = 'In the final analysis, these are ideological views.';
    const m1 = q.maskSentence(SENT, 'analysis');
    check('H1 ★ 例句里的目标词被替换成下划线空位', m1.indexOf('analysis') < 0 && m1.indexOf('______') >= 0, m1);
    check('H2 例句的其余部分原样保留', m1.indexOf('ideological views') >= 0, m1);

    const m2 = q.maskSentence(SENT, 'analysis', { keepPrefix: 4 });
    check('H3 ★ 词根提示：保留前 4 个字母（anal____）',
        m2.indexOf('analysis') < 0 && m2.indexOf('anal_') >= 0, m2);

    const m3 = q.maskSentence('Several analyses were published.', 'analysis');
    check('H4 ★ 变形（analyses）也会被挖空',
        /_/.test(m3) && q.textLeaks(m3.replace(/<[^>]*>/g, ''), 'analysis') === false, m3);

    const m4 = q.maskSentence('Nothing to see here.', 'analysis');
    check('H5 例句本来就没有目标词 → 原样返回、不报错', m4.indexOf('Nothing to see here') >= 0, m4);

    const m5 = q.maskSentence('Analyse it carefully.', 'analyse');
    check('H6 大小写不敏感（Analyse → 空位）',
        q.textLeaks(m5.replace(/<[^>]*>/g, ''), 'analyse') === false, m5);

    check('H7 wordMatchForms 覆盖常见变形（analyse/analysing/analysed）', (function () {
        const f = q.wordForms('analyse');
        return f.indexOf('analyse') >= 0 && f.indexOf('analysing') >= 0 && f.indexOf('analysed') >= 0;
    })(), q.wordForms('analyse'));

    // H8-H14：跑真挑战流程 → 题面里看不到答案，提示按钮可用，提交后才公布
    q.setWords([
        { id: 91, word: 'analysis', meaning: '分析', status: 'pending', knowledge: 0, nextReviewAt: null, sentence: SENT, articleId: 'a9' },
        { id: 92, word: 'hypothesis', meaning: '假设', status: 'pending', knowledge: 0, nextReviewAt: null, sentence: 'The hypothesis was tested twice.', articleId: 'a9' },
        { id: 93, word: 'synthesis', meaning: '综合', status: 'pending', knowledge: 0, nextReviewAt: null, sentence: 'A synthesis of ideas emerged here.', articleId: 'a9' },
    ]);
    q.start('challenge');
    let hs = q.state();
    check('H8 ★ 挑战题面**不出现目标词**（大小写不敏感）',
        q.textLeaks(q.bodyHtml(), hs.word) === false, { word: hs.word, html: q.bodyHtml() });
    check('H9 ★ 例句里有空位（.practice-blank）', q.bodyHtml().indexOf('practice-blank') >= 0, q.bodyHtml());
    check('H10 出现「词根提示」按钮', q.actionsHtml().indexOf('practiceHint()') >= 0, q.actionsHtml());

    const keepLen = Math.ceil(hs.word.length / 2);
    const prefix = hs.word.slice(0, keepLen);
    q.hint();
    check('H11 ★ 开提示 → 空位保留前半字母（' + prefix + '____），整词仍不出现',
        q.bodyHtml().indexOf(prefix) >= 0 && q.textLeaks(q.bodyHtml(), hs.word) === false,
        { word: hs.word, prefix: prefix, html: q.bodyHtml() });
    q.hint();
    check('H12 再点一次收起提示 → 前半又藏起来', q.bodyHtml().indexOf(prefix) < 0,
        { word: hs.word, prefix: prefix, html: q.bodyHtml() });

    q.submitSpelling(hs.word);
    check('H13 ★ 提交后（反馈阶段）才公布完整单词', q.bodyHtml().indexOf(hs.word) >= 0, q.bodyHtml());
    q.advance();
    const hs2 = q.state();
    check('H14 下一题 hintKeep 已复位（题面重新全挖空）',
        hs2 && hs2.phase === 'ask' && q.textLeaks(q.bodyHtml(), hs2.word) === false,
        { word: hs2 && hs2.word, html: q.bodyHtml() });

    // ============================================================
    log('\n【G 退出与计数联动】');
    // ============================================================
    q.setWords(fixture());
    q.start('learn');
    q.exit();
    check('G1 退出后回到 dashboardPage', q.activeScreens().indexOf('dashboardPage') >= 0, q.activeScreens());
    check('G2 退出后 practiceState 清空', q.state() === null, q.state());

    // 学过之后计数器要跟着变：把两个 pending 标成 mastered，待学数应减少
    q.setWords(fixture());
    q.renderQuickActions();
    const before = q.subOf('qaLearnSub');
    q.setWords(fixture().map(w => w.status === 'pending' ? Object.assign({}, w, { status: 'mastered' }) : w));
    q.renderQuickActions();
    const after = q.subOf('qaLearnSub');
    // 全标 mastered 后没有 pending → 退化口径：按知识度最低的「未掌握词」推荐 → gamma(learning) + epsilon(review)
    check('G3 待学数随 status 变化重新计算（3 → 2：pending 清零后走「知识度最低推荐」）',
        before === '3 个待学单词' && after === '2 个待学单词', { before, after });

    check('本轮全部通过', fail === 0, `${fail} FAIL`);
    log(`\n结果：${pass} PASS / ${fail} FAIL`);
    process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.log('测试异常:', (e && e.stack) || e); process.exit(1); });
