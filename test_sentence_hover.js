// 无头验证「句子翻译悬停」的触发逻辑（最小 DOM 桩 + 可控定时器）
// 目的：复现线上 bug 并证明修复有效
//   旧行为：① 每次 mousemove 都重置 3s 计时 → 鼠标轻微抖动就永远不触发
//           ② 上一句浮层还 visible 时进入下一句，直接被 return 掉 → 必须「移动两下再停下」
const fs = require('fs');
const vm = require('vm');
const path = require('path');

// ---------- 可控定时器 ----------
let timers = [];
let seq = 0;
let createdCount = 0;   // 累计创建过的计时器数量（用来探测「是否在反复重置计时」）
function setTimeoutStub(fn, ms) { const t = { id: ++seq, fn, ms }; timers.push(t); createdCount++; return t; }
function clearTimeoutStub(t) { const i = timers.findIndex(x => x === t); if (i >= 0) timers.splice(i, 1); }
function pending() { return timers.slice(); }
function fireAll() { const due = timers.slice(); timers = timers.filter(t => !due.includes(t)); due.forEach(t => t.fn()); }

// ---------- 最小 DOM 桩 ----------
function classListOf() {
    const s = new Set();
    return {
        add: (c) => s.add(c),
        remove: (c) => s.delete(c),
        contains: (c) => s.has(c),
        toggle: (c, f) => { if (f === undefined) { s.has(c) ? s.delete(c) : s.add(c); } else { f ? s.add(c) : s.delete(c); } return s.has(c); },
        _set: s,
    };
}
function makeEl(attrs, extra) {
    const el = Object.assign({
        _attrs: Object.assign({}, attrs || {}),
        classList: classListOf(),
        style: {},
        offsetHeight: 40,
        offsetWidth: 200,
        textContent: '',
        getAttribute(k) { return this._attrs[k] === undefined ? null : this._attrs[k]; },
        setAttribute(k, v) { this._attrs[k] = v; },
        removeAttribute(k) { delete this._attrs[k]; },
        contains(other) { return other === this; },
        getBoundingClientRect() { return { left: 10, top: 100, bottom: 120, width: 200, height: 20 }; },
        appendChild() {}, remove() {}, addEventListener() {}, removeEventListener() {},
    }, extra || {});
    el.closest = (sel) => (sel === '.article-sentence' ? (el._isSentence ? el : null) : null);
    return el;
}

const shpOrigin = makeEl();
const shpTranslation = makeEl();
const panel = makeEl();
panel.querySelector = (sel) => (sel === '.shp-origin' ? shpOrigin : sel === '.shp-translation' ? shpTranslation : null);

const firstLine = makeEl({ 'data-sentence-idx': '0' }); firstLine._isSentence = true;
const secondLine = makeEl({ 'data-sentence-idx': '1' }); secondLine._isSentence = true;

const documentStub = {
    getElementById: (id) => (id === 'sentenceHoverPanel' ? panel : null),
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener() {}, removeEventListener() {},
    createElement: () => makeEl(),
    body: makeEl(),
};
const windowStub = { addEventListener() {}, innerWidth: 1200, scrollTo() {}, location: { protocol: 'http:' } };

const sandbox = {
    console,
    setTimeout: setTimeoutStub,
    clearTimeout: clearTimeoutStub,
    setImmediate: (fn) => fn(),
    document: documentStub,
    window: windowStub,
    // 释义锁（2026-10-07）：默认「猜词模式（锁上）」会让悬停浮层只显示「先猜一猜」，
    // 本文件断言的是查看模式下能直接看到译文，所以显式播种 guessMode='off'。
    localStorage: (function () {
        const store = { accessPassword: 'pwd', guessMode: 'off' };
        return {
            getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
            setItem: (k, v) => { store[k] = String(v); },
            removeItem: (k) => { delete store[k]; },
        };
    })(),
    fetch: () => Promise.reject(new Error('no network in test')),
    Math, Date, JSON, Promise, Object, Array, String, Number, Boolean, RegExp, Error, isNaN, parseInt, parseFloat,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const src = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
// 追加测试钩子：暴露内部状态与需要用到的函数
const harness = `
globalThis.__t = {
  setArticle: (a) => { currentArticle = a; },
  state: () => ({ armed: sentenceHoverArmedIdx, visible: sentenceHoverVisibleIdx, timer: !!sentenceHoverTimer, panelVisible: !!(getSentenceHoverPanel() && getSentenceHoverPanel().classList.contains('visible')) }),
  mouseOver: (el) => onSentenceMouseOver({ target: el, relatedTarget: null }),
  mouseMove: (el) => onSentenceMouseMove({ target: el, relatedTarget: null }),
  mouseOut: (el, toEl) => onSentenceMouseOut({ target: el, relatedTarget: toEl || null }),
  delay: SENTENCE_HOVER_DELAY_MS,
  list: () => buildSentenceList(),
};
`;
vm.runInContext(src + harness, sandbox, { filename: 'app.js' });

// ---------- 断言 ----------
let pass = 0, fail = 0;
function check(name, cond, extra) {
    if (cond) { pass++; console.log(`  PASS  ${name}`); }
    else { fail++; console.log(`  FAIL  ${name}${extra ? ' | ' + extra : ''}`); }
}
const t = sandbox.__t;
const log = console.log;
console.log = () => {};   // 静音 app.js 的调试日志

t.setArticle({
    article: 'First sentence here. Second sentence here.',
    sentences: [
        { sentence: 'First sentence here.', translation: '第一句。' },
        { sentence: 'Second sentence here.', translation: '第二句。' },
    ],
});
check('sentenceList 规范化正确', t.list().length === 2 && t.list()[1].translation === '第二句。');

log('\n【场景1】进入句子后不动，计时到点应弹浮层');
t.mouseOver(firstLine);
check('mouseover 即排期（armed=0）', t.state().armed === 0, JSON.stringify(t.state()));
check('只挂了 1 个计时器', pending().length === 1, '实际 ' + pending().length);
fireAll();
check('计时到点后浮层可见且 idx=0', t.state().panelVisible && t.state().visible === 0, JSON.stringify(t.state()));
check('浮层内容为该句译文', shpTranslation.textContent === '第一句。', shpTranslation.textContent);

log('\n【场景2】同句内反复 mousemove，不应重置计时（旧 bug ①）');
t.mouseOut(firstLine, null);
t.mouseOver(firstLine);
fireAll();  // 让上一轮结束
// 重新进入并连续 move 5 次
t.mouseOver(firstLine);
const createdBefore = createdCount;
for (let i = 0; i < 5; i++) t.mouseMove(firstLine);
const createdAfter = createdCount;
check('同句内 5 次 mousemove 没有反复重置计时（计时器创建次数不增长）',
    createdAfter === createdBefore,
    `旧实现会 clearTimeout+setTimeout ${5} 次 → 创建 ${createdAfter - createdBefore} 个新计时器，剩余等待被无限推迟`);
check('同句内只有 1 个待触发计时器', pending().length === 1, '实际 ' + pending().length);
const armedBefore = t.state().armed;
check('计时期间 armed 保持为 0', armedBefore === 0);
fireAll();
check('多次移动后仍按时弹出', t.state().panelVisible && t.state().visible === 0);

log('\n【场景3】上一句浮层还显示时进入下一句，应立刻为下一句重新排期（旧 bug ②）');
check('此刻浮层仍显示 idx=0', t.state().panelVisible && t.state().visible === 0);
t.mouseOut(firstLine, secondLine);   // 离开句子0 去往句子1
t.mouseOver(secondLine);             // 进入句子1
check('进入句子1 后已排期（不为 null）', t.state().armed === 1, JSON.stringify(t.state()));
check('旧浮层已被收掉', !t.state().panelVisible);
fireAll();
check('计时到点后展示句子1 的译文', t.state().panelVisible && t.state().visible === 1, JSON.stringify(t.state()));
check('浮层内容切换为第二句译文', shpTranslation.textContent === '第二句。', shpTranslation.textContent);

log('\n【场景4】鼠标快速划过句子（计时未到就离开）→ 不应弹浮层');
t.mouseOut(secondLine, null);
t.mouseOver(secondLine);
t.mouseOut(secondLine, null);       // 计时未到就走
check('离开后计时被清除', t.state().armed === null && pending().every(x => x.fn), 'armed=' + t.state().armed);
fireAll();                          // 触发关闭倒计时
fireAll();
check('未弹浮层（sentenceHoverEl 已清空）', !t.state().panelVisible, JSON.stringify(t.state()));

log(`\n结果：${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
