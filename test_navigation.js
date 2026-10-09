// 无头验证「刷新不丢页 + 返回键不退出应用」（2026-10-09 新增）
//
// 用户报的两个问题：
//   ① 刷新页面会被打回欢迎页（用户口中的「登录页」），而不是停在原页面
//   ② 按浏览器的返回键会直接退出应用，而不是回到上一页
//
// 契约：
//   A 会话写入   —— 每次 showScreen 都把「当前屏」写进 **sessionStorage**.gaSession；阅读页额外记 articleId
//   B 历史压栈   —— 根条目 depth=0；每切一屏 push 一条 depth+1；**同一屏重复渲染不重复压栈**
//   C 返回键     —— depth>=1 的历史回退 → 在应用内切回目标屏（**不离开本站**）
//   D 根守卫     —— 退到根屏（depth 0）时第一次返回被拦下（提示「再按一次返回即可退出」），
//                   2.5 秒内再按一次才真正放行退出
//   E 刷新恢复   —— 会话里是稳定屏就还原它；临时屏（等待页/总结页/练习页）退回主界面
//   F 身份恢复   —— 刷新后 getUserName 仍是原用户（否则 x-username 会变成默认用户）；
//                   **不恢复 localStorage 里的 collectedWords**（以服务端为准），且 migrated=true 防重复迁移
//   I 会话介质   —— 会话必须写在 sessionStorage（标签页级）：刷新保留、新标签/重开浏览器 = 全新访问
//                   （回到欢迎页）；localStorage 里的旧 gaSession 一律被忽略（2026-10-09 修「首访被劫持到阅读页」）
const fs = require('fs');
const vm = require('vm');
const path = require('path');

// ==================== 极简 DOM 打桩（与 test_quick_actions.js 同款） ====================

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
        querySelector() { return null; },
        querySelectorAll() { return []; },
        getBoundingClientRect() { return { left: 10, top: 100, bottom: 120, width: 200, height: 20 }; },
        appendChild(c) { this._children.push(c); c.parentNode = this; return c; },
        removeChild(c) { this._children = this._children.filter(x => x !== c); return c; },
        remove() { this._removed = true; },
        addEventListener() {}, removeEventListener() {},
        focus() {}, click() {}, blur() {}, insertBefore(c) { return c; },
    };
    // 必须复刻真实 DOM 的 textContent → innerHTML 语义（app.js 的 escapeHtml 靠它）
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

function activeScreenIds() {
    return [...registry.values()]
        .filter(e => e.classList.contains('screen') && e.classList.contains('active'))
        .map(e => e.id);
}

const documentStub = {
    getElementById: getById,
    querySelectorAll: (sel) => (sel === '.screen' ? [...registry.values()].filter(e => e.classList.contains('screen')) : []),
    querySelector: () => null,
    addEventListener() {}, removeEventListener() {},
    createElement: (t) => makeEl(t),
    body: makeEl('body'),
};

// ==================== 假 History（真的能前进/后退，并在越界时标记「离开本站」） ====================
function makeFakeHistory() {
    const h = {
        _stack: [], _idx: -1, state: null, length: 0,
        exited: false,          // 后退越界 = 相当于离开了这个网站
        _listeners: [],
        pushState(state, title, url) {
            this._stack = this._stack.slice(0, this._idx + 1);
            this._stack.push({ state, url });
            this._idx = this._stack.length - 1;
            this.state = state; this.length = this._stack.length;
        },
        replaceState(state, title, url) {
            if (this._idx < 0) { this._stack.push({ state, url }); this._idx = 0; }
            else { this._stack[this._idx] = { state, url }; }
            this.state = state; this.length = this._stack.length;
        },
        back() { this.go(-1); },
        go(delta) {
            const ni = this._idx + delta;
            if (ni < 0) { this.exited = true; return; }   // 栈外 → 离开本站
            this._idx = ni;
            this.state = this._stack[ni].state;
            this._listeners.forEach(fn => fn({ state: this.state }));
        },
    };
    return h;
}
const fakeHistory = makeFakeHistory();

// ==================== 网络 / 存储打桩 ====================
let apiCalls = [];
const lsStore = { accessPassword: 'pwd' };
const localStorageStub = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(lsStore, k) ? lsStore[k] : null),
    setItem: (k, v) => { lsStore[k] = String(v); },
    removeItem: (k) => { delete lsStore[k]; },
};

// 会话现在写在 sessionStorage（标签页级）。这里单独一个 store，
// 方便测「新标签页 = 全新会话 → 回去欢迎页」这条语义。
const ssStore = {};
const sessionStorageStub = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(ssStore, k) ? ssStore[k] : null),
    setItem: (k, v) => { ssStore[k] = String(v); },
    removeItem: (k) => { delete ssStore[k]; },
};

const sandbox = {
    console,
    setTimeout: (fn) => { try { fn(); } catch (e) {} return 1; },
    clearTimeout: () => {},
    setImmediate,
    document: documentStub,
    window: {
        addEventListener(type, fn) { if (type === 'popstate') fakeHistory._listeners.push(fn); },
        innerWidth: 1200, scrollTo() {},
        location: { protocol: 'http:', origin: 'http://localhost:3000' },
        prompt: () => 'x',
        history: fakeHistory,
    },
    localStorage: localStorageStub,
    sessionStorage: sessionStorageStub,
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
globalThis.__nav = {
  showScreen, bootHistory, onPopState, readSession, patchSession, clearSession,
  restoreScreenFromSession, restoreUserIdentity, getUsername, toast: (m) => toast(m),
  resetHistory: () => { historyBooted = false; currentHistoryScreen = ''; lastScreenId = ''; },
  // 无头环境不会派发 DOMContentLoaded → 手动补一次 popstate 注册（真实浏览器由它自己注册）
  installPopState: () => window.addEventListener('popstate', onPopState),
  setScreenEls: () => {},
  setCurrentArticle: (id) => { currentArticle = id ? { id: id } : null; },
  lastScreen: () => lastScreenId,
  currentHistoryScreen: () => currentHistoryScreen,
  historyState: () => window.history.state,
  historyLen: () => window.history.length,
  historyExited: () => !!window.history.exited,
  clearExited: () => { window.history.exited = false; },
  setStarted: (v) => patchSession({ started: !!v }),
  // 会话介质相关（2026-10-09）：暴露给 I 组断言
  sessionStoreOk: () => !!sessionStore(),
  wantsFreshStart: () => wantsFreshStart(),
  SESSION_KEY: SESSION_KEY,
};
`, sandbox);
const nav = sandbox.__nav;
nav.installPopState();   // 真实浏览器由 DOMContentLoaded 注册；无头环境手动补

// ==================== 断言小工具 ====================
let pass = 0, fail = 0;
const failures = [];
function check(name, cond, extra) {
    if (cond) { pass++; console.log('  ✅ ' + name); }
    else {
        fail++; failures.push(name);
        console.log('  ❌ ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : ''));
    }
}
function resetLs() {
    Object.keys(lsStore).forEach(k => { if (k !== 'accessPassword') delete lsStore[k]; });
    Object.keys(ssStore).forEach(k => { delete ssStore[k]; });
}
function resetHistory() {
    fakeHistory._stack = []; fakeHistory._idx = -1; fakeHistory.state = null;
    fakeHistory.length = 0; fakeHistory.exited = false;
    nav.resetHistory();
}
function activeIds() { return activeScreenIds(); }

console.log('\n================ 会话保持 + 浏览器历史（返回键） ================');

// ---------------------------------------------------------------- A 会话写入
console.log('\n【A 会话写入】');
resetLs(); resetHistory();
nav.clearSession();
nav.showScreen('dashboardPage');
check('A1 showScreen 后 gaSession.screen = 当前屏', nav.readSession().screen === 'dashboardPage', nav.readSession());
check('A2 gaSession 带时间戳 at', typeof nav.readSession().at === 'number', nav.readSession());
nav.setCurrentArticle('upload_123');
nav.showScreen('readingPage');
check('A3 阅读页额外记录 articleId', nav.readSession().articleId === 'upload_123', nav.readSession());
check('A4 切屏后 screen 同步更新', nav.readSession().screen === 'readingPage', nav.readSession());
nav.setCurrentArticle(null);

// ---------------------------------------------------------------- B 历史压栈
console.log('\n【B 历史压栈规则】');
resetLs(); resetHistory();
nav.bootHistory('startingPage');
check('B1 根条目 depth = 0', nav.historyState().gaDepth === 0, nav.historyState());
check('B2 根条目记录屏幕名', nav.historyState().gaScreen === 'startingPage', nav.historyState());
check('B3 初始化后有 2 条历史（根条目 + 守卫副本）', nav.historyLen() === 2, nav.historyLen());
nav.showScreen('uploadPage');
check('B4 切屏 push 一条 depth = 1', nav.historyState().gaDepth === 1 && nav.historyState().gaScreen === 'uploadPage', nav.historyState());
check('B5 历史长度 +1', nav.historyLen() === 3, nav.historyLen());
nav.showScreen('uploadPage');
check('B6 同一屏重复渲染不再压栈（长度不变）', nav.historyLen() === 3, nav.historyLen());
nav.showScreen('wordbookPage');
check('B7 再切屏继续压栈 depth = 2', nav.historyState().gaDepth === 2, nav.historyState());
nav.showScreen('dashboardPage', { fromHistory: true });
check('B8 fromHistory 的切换不压栈', nav.historyLen() === 4, nav.historyLen());

// B9/B10：点「开始旅程」走的是 replace（把欢迎页就地改写成主界面）——返回键不该再看到欢迎页
resetLs(); resetHistory();
nav.bootHistory('startingPage');
nav.showScreen('startingPage', { fromHistory: true });
nav.showScreen('dashboardPage', { replace: true });     // = startApp() 的跳转方式
check('B9 开始旅程后当前条目变成主界面且仍是根（depth 0）',
    nav.historyState().gaScreen === 'dashboardPage' && nav.historyState().gaDepth === 0, nav.historyState());
check('B10 欢迎页被就地改写，没有多出一条可返回的历史', nav.historyLen() === 2, nav.historyLen());
nav.showScreen('uploadPage');
fakeHistory.back();                                     // 返回 → 应回主界面，而不是欢迎页
check('B11 返回键回到主界面（不会退回欢迎页/登录页）', activeIds().indexOf('dashboardPage') >= 0, activeIds());

// ---------------------------------------------------------------- C 返回键：应用内回退，不退出
console.log('\n【C 返回键 → 应用内回退】');
resetLs(); resetHistory();
nav.bootHistory('startingPage');         // [根0, 根0副本]
nav.showScreen('startingPage', { fromHistory: true });
nav.showScreen('uploadPage');            // depth 1
nav.showScreen('wordbookPage');          // depth 2
check('C0 起始在最上层（wordbookPage）', activeIds().indexOf('wordbookPage') >= 0, activeIds());
fakeHistory.back();                      // → uploadPage
check('C1 返回键退到上一屏 uploadPage', activeIds().indexOf('uploadPage') >= 0, activeIds());
check('C2 返回键没有离开本站', nav.historyExited() === false, nav.historyExited());
check('C3 返回后 lastScreenId 同步', nav.lastScreen() === 'uploadPage', nav.lastScreen());
fakeHistory.back();                      // → startingPage（根屏）
check('C4 再返回退到根屏 startingPage', activeIds().indexOf('startingPage') >= 0, activeIds());
check('C5 仍未离开本站', nav.historyExited() === false, nav.historyExited());

// ---------------------------------------------------------------- D 根守卫：再按一次才退出
console.log('\n【D 根屏守卫：再按一次返回才退出】');
resetLs(); resetHistory();
nav.bootHistory('startingPage');
nav.showScreen('startingPage', { fromHistory: true });
nav.showScreen('uploadPage');            // depth 1
fakeHistory.back();                      // → 根屏
check('D0 已退到根屏且未退出', activeIds().indexOf('startingPage') >= 0 && nav.historyExited() === false, activeIds());
const lenAtRoot = nav.historyLen();
check('D1 停留在根屏（退到根条目）', nav.lastScreen() === 'startingPage', nav.lastScreen());
nav.clearExited();
fakeHistory.back();                      // 根屏再返回 → 拦下 + 提示
check('D2 根屏首次返回不退出应用', nav.historyExited() === false, nav.historyExited());
check('D3 给出「再按一次」提示', String(documentStub.getElementById('toast').textContent).indexOf('再按一次') >= 0,
    documentStub.getElementById('toast').textContent);
check('D4 拦截时不制造多余历史条目', nav.historyLen() === lenAtRoot, { before: lenAtRoot, after: nav.historyLen() });
check('D5 仍停留在根屏', activeIds().indexOf('startingPage') >= 0, activeIds());
fakeHistory.back();                      // 再按一次 → 真正出栈
check('D6 再按一次才放行退出应用', nav.historyExited() === true, nav.historyExited());

// ---------------------------------------------------------------- E 刷新恢复
console.log('\n【E 刷新后恢复停留页】');
resetLs(); resetHistory();
nav.bootHistory('dashboardPage');
nav.showScreen('uploadPage', { fromHistory: true });
nav.restoreScreenFromSession({ screen: 'uploadPage' });
check('E1 会话是上传页 → 还原到上传页', activeIds().indexOf('uploadPage') >= 0, activeIds());
nav.showScreen('startingPage', { fromHistory: true });
nav.restoreScreenFromSession({ screen: 'summaryPage' });
check('E2 会话是临时屏（总结页）→ 退回主界面', activeIds().indexOf('dashboardPage') >= 0, activeIds());
check('E3 临时屏不会被恢复成错误页面', activeIds().indexOf('summaryPage') < 0, activeIds());
nav.showScreen('startingPage', { fromHistory: true });
nav.restoreScreenFromSession({});
check('E4 会话里没有 screen → 退回主界面', activeIds().indexOf('dashboardPage') >= 0, activeIds());

// ---------------------------------------------------------------- F 身份恢复
console.log('\n【F 刷新后恢复用户身份】');
resetLs();
lsStore.gaUserData = JSON.stringify({
    userName: '小明', level: 'B1', streak: 7, lastDate: 'x',
    collectedWords: [{ word: 'alpha', status: 'pending' }], migrated: false
});
nav.restoreUserIdentity();
check('F1 恢复 userName（getUsername 不再退回默认用户）', nav.getUsername() === '小明', nav.getUsername());
const dump = vm.runInContext('({ level: userData.level, streak: userData.streak, n: userData.collectedWords.length, migrated: userData.migrated })', sandbox);
check('F3 恢复 level / streak', dump.level === 'B1' && dump.streak === 7, dump);
check('F4 不恢复 collectedWords（以服务端为准，避免把缓存当成本地数据迁移）', dump.n === 0, dump);
check('F5 标记 migrated，防止把服务端数据又 POST 回 /api/migrate', dump.migrated === true, dump);

// ---------------------------------------------------------------- G 边界：未初始化历史时不写坏任何东西
console.log('\n【G 边界：未 bootHistory 时不影响功能】');
resetLs(); resetHistory();
nav.showScreen('dashboardPage');
check('G1 未初始化历史时 showScreen 不压栈', nav.historyLen() === 0, nav.historyLen());
check('G2 会话仍然照写', nav.readSession().screen === 'dashboardPage', nav.readSession());

// ---------------------------------------------------------------- H 应用内「返回」按钮不制造重复条目
console.log('\n【H 应用内返回与浏览器返回键语义一致】');
resetLs(); resetHistory();
nav.bootHistory('dashboardPage');                 // [根0, 根0副本]
nav.showScreen('dashboardPage', { fromHistory: true });
nav.showScreen('wordbookPage');                   // depth 1
const lenAtWordbook = nav.historyLen();
nav.showScreen('dashboardPage');                  // 相当于点「← 返回」
check('H1 点「返回」回主界面后历史长度不变（不重复压栈）', nav.historyLen() === lenAtWordbook, { before: lenAtWordbook, after: nav.historyLen() });
check('H2 已回到主界面', activeIds().indexOf('dashboardPage') >= 0, activeIds());
check('H3 本地栈已回退（depth 0）', nav.historyState().gaDepth === 0, nav.historyState());
fakeHistory.back();
check('H4 ★ 此时再按浏览器返回键不会「前进」回单词本', activeIds().indexOf('wordbookPage') < 0, activeIds());
check('H5 且仍未退出应用', nav.historyExited() === false, nav.historyExited());

// 前进到「已经访问过」的屏（上传 → 欢迎 → 回上传）应该回退而不是新压一条
resetLs(); resetHistory();
nav.bootHistory('dashboardPage');
nav.showScreen('dashboardPage', { fromHistory: true });
nav.showScreen('uploadPage');                     // depth 1
nav.showScreen('startingPage');                   // depth 2
const lenBeforeJumpBack = nav.historyLen();
nav.showScreen('uploadPage');                     // 回到已经在栈里的上传页
check('H6 回到已访问过的屏 → 不新增历史条目', nav.historyLen() === lenBeforeJumpBack, { before: lenBeforeJumpBack, after: nav.historyLen() });
check('H7 已回退到上传页（且历史条目指向上传页）',
    activeIds().indexOf('uploadPage') >= 0 && nav.historyState().gaScreen === 'uploadPage',
    { active: activeIds(), state: nav.historyState() });

// ---------------------------------------------------------------- I 会话介质：标签页级
console.log('\n【I 会话介质：sessionStorage 标签页级（修「首访被劫持到阅读页」）】');
resetLs(); resetHistory();
check('I0 会话存储介质可用（sessionStorage）', nav.sessionStoreOk() === true, nav.sessionStoreOk());
nav.clearSession();
nav.patchSession({ started: true, screen: 'readingPage', articleId: 'article_001' });
check('I1 会话写进 sessionStorage 后读得到',
    nav.readSession().started === true && nav.readSession().screen === 'readingPage', nav.readSession());
check('I2 没有写进 localStorage（不再永久记住）', lsStore[nav.SESSION_KEY] === undefined, lsStore[nav.SESSION_KEY]);

// 模拟「老版本留下的永久会话」：localStorage 里塞一条，readSession 必须视而不见
lsStore[nav.SESSION_KEY] = JSON.stringify({ started: true, screen: 'readingPage', articleId: 'old_article' });
nav.clearSession();                                   // 清掉本标签页的会话
check('I3 localStorage 里的旧 gaSession 不再生效（正是它跳过了欢迎页）',
    !nav.readSession().started && nav.readSession().screen === undefined, nav.readSession());

// 模拟「新开标签页 / 重开浏览器」：sessionStorage 清空 → 全新访问 → 应回欢迎页
delete lsStore[nav.SESSION_KEY];
check('I4 ★ 新标签页（会话为空）→ readSession 为空 = 首访走欢迎页',
    Object.keys(nav.readSession()).length === 0, nav.readSession());

// fresh 兜底开关
nav.patchSession({ started: true, screen: 'readingPage' });
sandbox.window.location.search = '?fresh=1';
check('I5 ?fresh=1 → 要求全新开始', nav.wantsFreshStart() === true, nav.wantsFreshStart());
sandbox.window.location.search = '';
sandbox.window.location.hash = '#fresh';
check('I6 #fresh → 要求全新开始', nav.wantsFreshStart() === true, nav.wantsFreshStart());
sandbox.window.location.hash = '';
check('I7 无 fresh 标记 → 不强制（保留刷新还原）', nav.wantsFreshStart() === false, nav.wantsFreshStart());

// ==================== 结果 ====================
console.log('\n========================================');
console.log('🏁 结果：' + pass + ' PASS / ' + fail + ' FAIL');
if (failures.length) console.log('失败项：\n  - ' + failures.join('\n  - '));
process.exit(fail ? 1 : 0);
