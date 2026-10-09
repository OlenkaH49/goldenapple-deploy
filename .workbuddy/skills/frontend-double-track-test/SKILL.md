---
name: frontend-double-track-test
description: 为「金苹果之旅」前端（app.js / index.html）新增或修改功能时，按「无头 DOM 打桩 + playwright 真浏览器」双轨补测试并跑全量回归。触发词：改 app.js、改前端、加前端功能、前端改动、补前端测试、跑前端回归、浏览器验证、截图验证、词卡、句子浮层、释义锁、猜词模式。
agent_created: true
---

# 前端双轨测试（金苹果之旅）

改动 `app.js` / `index.html` 后**必须**走完这套流程。理由：这个项目的 bug 几乎全是「逻辑对了但渲染错了」
或「真实数据形状和假设不一样」，单轨测试抓不到。

## 何时用

- 任何 `app.js` / `index.html` 的功能新增、修复、重构。
- 用户说「改前端」「加个 XX 交互」「浏览器验证一下」「补测试再保证回归」。

## 双轨分工（别只做一边）

| 轨道 | 用什么 | 验什么 | 跑法 |
|---|---|---|---|
| ① 无头打桩 | 极简 DOM 替身 + `vm.runInContext(app.js)` | 逻辑分支、竞态、有没有多排计时器、状态机 | `npm run test:card` / `npm run test:guess` |
| ② 真浏览器 | playwright-core + 本机 Edge + 真后端 | 真 DOM 查询能否命中、真点击/真输入、真鼠标悬停、CSS 可见性 | `NODE_PATH=<workspace>/node_modules node test_word_card_browser.js` |

- 现有无头文件：`test_word_card.js`（查看模式完整释义卡）、`test_guess_lock.js`（猜词模式）、
  `test_sentence_hover.js`（句子悬停）、`test_sentence_match_split.js`、`test_sentence_retry.js`、
  `test_sentence_missing.js`（译文状态 missing/failed + 前后端 sentenceList 对比）、
  `test_backfill_and_partial.js`、`test_sentence_empty_guard.js`（后端「空成功」守卫，见同名 skill）、
  `test_quiz_empty_guard.js`（题目生成的同类守卫 + 连带禁用拖拽的因果断言）。
- 真浏览器文件只有一个：`test_word_card_browser.js`，**按【①②…㉖】分节**，新功能在末尾追加一节，
  插在 `console.log("\n【⑪ 收尾】")` 之前。**分节号只增不改**（改动历史分节会让「哪节测什么」失去记忆）。
  已有分节：①②词卡基础 · ③④字典/语境两栏 · ⑤⑥预取与竞态 · ⑦收藏释义不写死「暂无释义」 ·
  ⑧⑨⑩… · ⑮释义锁/猜词 · ⑯译文 missing/failed + 重试 · ⑰降级划选模式下拖拽仍可用 ·
  ⑱收藏释义优先级（本句语境 > 文章词表 > 词典首义） · ⑲收藏→待分类→分类→总结页 ·
  ⑳上传中文章（analyzing）不谎报「还没生成译文」+ 终态回填 · ㉑轮询不得在题目就绪时提前收工 ·
  ㉒收藏统计口径（阅读页=本文 / 结算页=本会话）+ 默认查看模式 · ㉓总结页收藏词卡片排版（splitMeaningNote） ·
  ㉔首页快捷操作：学习词汇 / 复习单词 / 每日挑战（练习屏 + 苹果奖励） ·
  ㉕刷新不丢页（真 `page.reload()`）+ 浏览器返回键不退出应用（真 `history.back()`） ·
  ㉖「🤖 AI 翻译」文案 + 「取消收藏」两入口（词卡 / 收藏列表，真点真发 DELETE）。
- **验证「异步竞态类」修复，用脚本化接口响应**（比等真 AI 便宜且确定）：
  `page.evaluate` 里存下原函数再替换，按「第 N 次调用」返回不同结果，就能精确复现线上时序：
  `window.__origApiGet = apiGet; let tick = 0; apiGet = async (p) => { if (String(p).startsWith('/api/article-status/')) { tick++; return tick===1 ? 题目就绪但译文空 : (tick===2 ? 仍空 : 终态带译文); } return window.__origApiGet(p); };`
  然后 `await sleep(拍数 × 轮询间隔 + 余量)` 断言最终状态；`finally` 里务必还原 `apiGet`。
  这样能直接证明「旧代码第 1 拍就 return（tick 恒为 1）」，是回归护栏而不是实现复述。
- **交互类功能（拖拽/悬停/长按）必须真鼠标驱动**（`page.mouse.move/down/up`），
  别用 `dispatchEvent` 伪造 —— 本项目拖拽走 **pointer events**（`pointerdown/move/up`，不是 HTML5 `dragstart`），
  合成事件与真事件在 `pointerType` / `clientX` 上行为不同，测不出真问题。
  排查"某个交互没反应"时，最快的办法是在页面里包裹目标函数数调用次数：
  `page.evaluate(() => { window.__t={}; const w=(n,k)=>{const o=window[n]; window[n]=function(){window.__t[k]=(window.__t[k]||0)+1; return o.apply(this,arguments);};}; w('onSpanPointerDown','pd'); w('onSpanPointerMove','pm'); })`
  —— 「pd 有、pm 没有」直接说明**入口被守卫提前 return 了**，接着去 grep 那个函数开头的 early return。
- **真浏览器测试里凡是会真调 Coze 的接口，必须用 `page.route` 打桩**（例：
  `await page.route('**/api/retry-sentences/**', r => r.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ ok: true, started: true }) }))`），
  跑完 `await page.unroute(...)`。用户明确「不充值、省额度」，测试烧额度是不可接受的。
- **别在测试里依赖真库里某篇具体文章**（用户随时可能删）。要「正常样本」就自己插一篇
  `qa_ok_probe`，`finally` 里删掉。
- **🔴 全局字典表绝不许裸删（真丢过数据）**：`word_cache` / `word_context` / `dictionary` 是**全局共享**的
  （不区分文章），里面的词是真语料。想让「第②层」存一条假释义时，**不能** `DELETE FROM word_cache WHERE word='真实词'`
  —— 第一版就是这么写的，把 `part-time` 真实的「兼职的」删了，跑完才发现兼容层退化。
  规则：动手删之前先问「这个 `id`/`word` 是不是**我这次造的**？」
  · `articles` / `user_words` 用专属 `qa_<功能>_probe` id → 随便删（本来就是自己造的）；
  · 全局字典表 → **先 `SELECT` 快照 → 再改 → `finally` 里 DELETE 本节的 + 原样 INSERT 回快照**
    （附属列如 `is_academic` 别丢），并在 finally 里 `check()` 断言行数还原。

## 步骤

1. **先读现有测试的桩**（`test_word_card.js` 头部 ~120 行），**整段照抄** DOM 替身 / 定时器替身 / fetch 替身，
   不要自己另写一套 —— 桩的语义差异会让新测试和老测试互相矛盾。
2. 新无头测试文件命名 `test_<功能>.js`，末尾统一 `log(\`\n结果：${pass} PASS / ${fail} FAIL\`)` +
   `process.exit(fail === 0 ? 0 : 1)`，并加进 `package.json` 的 `scripts`（`test:<名>`）。
3. 在 `test_word_card_browser.js` 末尾追加一节真浏览器断言：
   自造样本文章（id 用 `qa_<功能>_probe`，`try/finally` 里 `DELETE FROM articles WHERE id = ?`，
   同时 `DELETE FROM user_words WHERE article_id = ?`），跑完在真库确认 **0 条 `qa_` 残留**。
   每节至少留一张 `test_screenshot_<功能>.png` 并用 Read 工具**肉眼核对**（浅色主题、字色可读、元素真的出现）。
   ⚠️ **截图前先 `await sleep(500)`**：`.screen { animation: fadeIn 0.3s }`，`showScreen()` 之后立刻
   `page.screenshot()` 会拍到**半透明**的过渡帧（图看着「洗白发虚」就是这个），肉眼核对会误判成样式没生效。
   词卡同理：淡入 + 重定位动画约 0.35s，`showWordCard` 后直接截会拍到 `opacity:0` / 半路的卡片。
   ⚠️ **截图必须拍到「目标元素本身」，为此要先确认它真的在当前激活的屏里、且在视口内** ——
   仅靠 `querySelector` 断言存在是**不够**的，踩过三次（每次断言全绿、图里却什么都没有）：
   1. 上一节结尾已 `history.back()` 回主界面 → 目标元素挂在**未激活**的 `.screen` 里 →
      拍出来是主界面。截图前先 `showScreen('readingPage')`。
   2. `showWordCard(wordData, x, y)` 的 **x/y 是独立参数**，把 `_x/_y` 塞进 wordData →
      `positionWordCard` 拿到 `NaN` → `style.left/top` 写成 `"NaNpx"`（无效）→ 卡片落到正文下方（视口外）。
      重绘路径（`showWordCard(base, base._x, base._y)`）才用 wordData 里的 `_x/_y`，别混。
   3. 首次引导气泡 `.drag-guide-bubble` 钉在左下角，会压住左下角的目标元素（看着像「列表被挡」）。
      关掉它要在**触发它的那次 `showScreen` 之前**写 `localStorage.hasDroppedWord='true'` ——
      `showDragGuideIfNeeded()` 是**同步读**这个键决定要不要注册「500ms 后建气泡」的定时器，晚设拦不住。
   判断「真可见」看 `getComputedStyle(el).opacity` + `rect` 是否落在视口内；**别只看 `offsetParent`**
   （`position:fixed` 元素恒为 `null`，会误判成「不可见」）。
4. 真浏览器断言要覆盖「可见性」，不只是「存在」：如 `!el.classList.contains('hidden')`、
   `el.textContent` 真的含目标文本、`getComputedStyle` 的 display 不为 none。
   排版类还可以断言**几何关系**（比类名更硬）：`wordRect` 与 `meaningRect` 不重叠 → 说明真换行了；
   两张卡片 `rect` 互不重叠、`card.width < container.width` → 说明真是一词一卡而不是挤成一行。
   ⚠️ **在 `page.evaluate` 里存/还页面全局**（app.js 顶层 `let`，如 `sessionCollectedList`，**不在 `window` 上**）：
   Node 侧写 `let tmp` 再把 evaluate 的赋值「存回来」是**无效的**（那些赋值落在页面全局）。
   要挂到 `window.__tmp`，`finally` 里再取回。
5. **升指纹**：`index.html` 里 `app.js?v=YYYYMMDD_N` 递增 —— 这是唯一让用户浏览器丢掉旧 app.js 的机制。
   测试里不要硬编码指纹值，用正则 `\d{8}_\d+` 断言「像个指纹」即可（否则每次升指纹都要改测试）。
6. 跑全量回归（下面清单），全绿才算完成。
7. **动到「切屏 / 会话 / 返回」相关代码时**（`showScreen` / `DOMContentLoaded` / 新增屏），
   必须同时跑 `npm run test:nav` 与浏览器回归的【㉕】——这两类 bug 打桩测不出来，
   靠真 `page.reload()` + 真 `history.back()` 才验得到。

## ★ 两个必踩的坑（照抄解决，别再排查一遍）

1. **无头桩必须播种 `accessPassword`**：`const lsStore = { accessPassword: 'pwd' };`
   不播种 → `request()` 卡在 `ensureAccessPassword()`（等一个永不 resolve 的密码弹窗）→
   **后台请求永远不 resolve**。现象是「请求已发出但词典一直没到」，极易误判成业务 bug（本轮真花了时间）。
2. **断言「请求已发出」要放在 `await flush()` 之后**（`flush = () => new Promise(r => setImmediate(r))`）：
   `fetchWordDefinitions` 是 async，`openWordCard()` 同步返回时 `fetch` 还没真发出去。
3. **新写无头测试时，“DOM 桩”必须整段照抄 `test_guess_lock.js`，一个字都别省** —— 尤其是
   `makeEl()` 里那段 `Object.defineProperty(el, 'textContent', { set(v){ … el.innerHTML = 转义 } })`。
   `app.js` 的 `escapeHtml()` 实现是 `div.textContent = s; return div.innerHTML`，
   桩里若把 `innerHTML` 当普通属性写（`innerHTML: ''`），**`escapeHtml` 会恒返回空串** →
   渲染出来的 HTML 里所有文本都是空的 → 十几条断言连锁 FAIL，看起来像产品崩了，其实是桩没搭对。
   同理 `getById(id)` 里要 `el.id = id`，否则 `activeScreens()` 之类的映射全是空串。
   （2026-10-09 新增 `test_quick_actions.js` 时两条都踩了，排查花了半轮。）

## 其它桩上的硬要求

- 桩的 `querySelector` 语义**照抄真实 DOM**：只有当 `owner.innerHTML` 里真的出现该 class 才返回元素。
  否则卡片 HTML 拼错（class 少一个字母）也会被判通过 —— 这是打桩最容易失去价值的地方。
- 无头测试里把 `console.log = () => {}` 静音后，**结果行要用 `log(...)`**（事先存下的原 console.log）打印。
- 猜词模式（释义锁）自 **2026-10-08 起产品默认是「查看模式」**（只有显式 `guessMode='on'` 才锁上）。
  测「查看模式」的老测试仍可播种 `guessMode:'off'` 求稳，但**别再依赖「默认即猜词」这个旧契约**；
  要测猜词模式就显式 `localStorage.setItem('guessMode','on')`。
- 别用 `sleep` 等真实网络；用 `await flush()` 推微任务。

## 用户说「XX 功能没了」时：第一件事是 grep 调用点（死代码判据）

前端「功能消失」类报障（入口不见了、点了没反应、流程被跳过），**先别读 UI/算法**，按这个顺序：

1. **grep 那个功能的函数名，看有没有调用点**：
   `Grep "finishReading" app.js index.html` —— 实测实例：`finishReading()`（打开「待分类」整理面板）
   **只有定义、零调用** → 就是死代码，根因确认，5 秒解决。
   > 重构/删按钮时最容易留下「函数还在、入口没了」的状态；UI 里搜不到那个 `onclick=`，功能就等于被删了。
2. **grep 入口元素 id**：`Grep "pendingEntryBtn|sortPanelMask" index.html app.js` ——
   面板 DOM 还在但没有任何按钮指向它 → 同样是「入口被删」。
3. **顺着主流程找出「谁顶替了它」**：本例是 `finishLearning()` 直接 `showScreen('summaryPage')`
   把「待分类→分类」整步跳过 —— 用户描述「单词直接进了总结页」正是这个。
   修法不是删总结页，而是**在主流程里插入那一步**（有待分类 → 先开面板；面板关闭再续跑结算，
   用一个 `let summaryAfterSort = false` 标志在 `closeSortPanel()` 里续跳）。
4. **入口计数必须挂在「状态变更处」刷新**，不能只在关闭面板时刷。
   踩坑实例：`sortWordAction()` 把词标成 mastered 后**没调 `updateCollectBadge()`**，
   导致「已掌握了、待分类计数还挂着 1」——被测试 【⑲】 抓出来。
   规则：把入口计数刷新收敛到**一个** `updateCollectBadge()`，然后所有会改 `status`/收藏集合的地方都调它。
5. **顺带检查自动弹面板的入口会不会误触发**：右侧收集区既是拖拽落点、又是点击入口，
   拖完松手浏览器可能派发 click → 刚收藏完就弹面板、打断阅读。
   用一个时间戳守卫（`window.__lastCollectAt` + 600ms 窗口）吞掉那一下。

## 用户报「数字不对」时：**先查口径，再查算法**（2026-10-08 实测）

实测报障：「截图显示『去分类 40』『1/121 words』，可我只收藏了几个词」。
根因不是算错，是**两个数字用了两种口径**：一个读全局（`userData.collectedWords` 全部 pending，
真机 43 → 显示 40），一个读会话级全局数组（`collectedWords`，切文章清空 / 跨文章累计）。
数据库本身完全正确（`user_words` 56 行、无重复行）。

排查套路：
1. **先查库拿真值**：`SELECT article_id, COUNT(*) ... GROUP BY article_id` +
   `GROUP BY article_id,word,sentence HAVING COUNT(*)>1`（先排除「数据真的重复了」）。
   库是对的 → 问题 100% 在前端「读哪个数组」。
2. **把页面上每个数字的「分子来源」列出来**，逐个数它是本文 / 本会话 / 全部。
   ⇒ 一旦发现同一屏里混口径（本文分子 + 全局分母之类），这就是根因，**不用去看业务算法**。
3. **定铁律并收敛函数**：本项目把收藏统计收敛到
   `collectedRowsOfArticle / collectedWordSetOfArticle / pendingCountOfArticle /
   pendingCountAll / sessionPendingWords`，并在注释里写明「阅读页=本文 / 结算页=本会话 / 单词本=全部」。
   新增任何计数显示前先问属于哪一栏。
4. **测试要断言「隔离」而不只是「等于某个数」**：造两篇文章的收藏行，
   断言 A 的页面上**看不到 B 的词**（`!/\b(epsilon|zeta)\b/` 之类），
   并断言数字 ≠ 全局总数。只断言「等于 2」的话，口径写错成全局也可能恰好蒙对。
   ⚠️ 边界匹配别偷懒：`/epsilon|zeta|eta/` 会被 `beta` 里的 `eta` 误命中 →
   用 `/(?:^|[^a-z])(epsilon|zeta|eta)(?:[^a-z]|$)/i`。

## 用户报「排版糊成一团 / 全挤在一行」时：先查**类名到底有没有 CSS**（2026-10-09 实测）

实测报障：总结页「收藏的单词」显示成
`determines · 决定；确定（determine 的第三人称单数） possibilities · 可能性（复数）`，全挤在一行读不了。
根因两步，**都不是「CSS 写错了」，是根本没写**：
1. `renderSummary()` 用的是 `<div class="word-tag">词 · 释义</div>` ——
   **`.word-tag` 在整个 index.html 里没有任何定义**（`grep -c '.word-tag' index.html` = 0），
   于是它就是一个默认 `display:block` 的裸 div，分隔全靠字符串里的 `·`。
2. 容器 `#summaryCollectedList` 的 class 是 `.word-list` → `display:flex; flex-wrap:wrap`，
   于是这些裸 div 被**横排**成一个长条 → 视觉上「糊成一片」。

排查套路（30 秒定位，不必读业务逻辑）：
1. `grep -n "class=\"" <渲染函数>` 找出渲染用的类名；
2. **逐个** `grep -n "\.<类名>" index.html` 看有没有 CSS 定义 —— 没有定义的那个就是元凶；
3. 再看容器类：`flex` 横排 + 子项无样式 ≈ 必糊。`grep` 一下这个容器类还有没有别处用
   （本项目 `.word-list` 只有一处用 → 可以放心整类替换）。
4. 改法：**换掉容器类**（`word-list` → `summary-word-grid`，`display:grid`），
   **不要给新类叠加旧类** —— `.word-list{display:flex}` 和 `.summary-word-grid{display:grid}`
   同优先级（都是 0,1,0），谁后定义谁赢，靠顺序取胜太脆。
5. 渲染结构按「信息分层」拆：词 / 释义 / 括号备注各占一行（`sw-word` / `sw-meaning` / `sw-note`），
   括号备注用小字号灰字。释义里的尾部括注可**纯展示拆分**，不改数据：
   `^(.*\S)\s*[（(]([^（()）]*)[）)]\s*$`（前面必须还有非空内容，
   否则「整条就是括号」的释义会被吞空）。
6. 测试断**几何**而不是断类名：`meaningRect.top >= wordRect.bottom - 2`（真换行）、
   两卡 `rect` 不重叠、`card.width < container.width`（真是一词一卡）、
   `getComputedStyle(container).display === 'grid'`。

## 「后端日志成功、界面却没有」的另一类根因：**轮询提前收工 + 引用分叉**（2026-10-08 实测）

上传链路里 释义 / 译文 / 题目 是**三个并行工作流**（`queue.js` 的 `Promise.allSettled`），
完成顺序不确定。踩过的坑有两条，**必须一起查**：

1. **谁在等？轮询在「第一件事就绪」时是不是就 `return` 了？**
   旧 `pollArticleProgress` 在 `questionsReady` 那一刻 `return` 结束轮询 —— quiz 常常最先完成，
   于是「题目就绪 → 进阅读页 → 轮询结束」，**20 秒后句子翻译成功却没有任何人在听**。
   判据：DB 里 `status='completed'` 且 `sentences` 有 19 句（数据完全正常），
   但前端 `currentArticle.sentences` 是空的 → **不是数据问题，是「结果没人接收」**。
   修法：进阅读页只代表「可以开始读了」，轮询要**继续在后台守着**（本项目叫 quiet 阶段），
   直到文章落到终态（completed/partial/failed）再一次性回填 + 原地重绘。
   同时把终态回填收敛成**唯一入口** `applyTerminalStatus()` —— 之前 `partial` 是轮询里的独立分支，
   再抽一条并行守护（`backfillArticleUntilTerminal`）时就会出现「两条路只有一条会回填」，
   而**静默丢数据永远比报错更难查**。
2. **两处变量是不是指向同一个对象？**
   `loadArticleDetail` 里 `ARTICLES[i] = full` 是**替换成新对象**，而 `currentArticle` 只是一个旧引用。
   一旦有代码在这中间拉过一次详情（例：悬停时 `showSentenceHoverPanel` 的「详情缺失就补拉」自愈），
   就会出现「回填写进了 ARTICLES 里的新对象，渲染读的却是 currentArticle 旧对象」→ 译文永远不显示。
   规则：**凡是 `ARTICLES[i] = <新对象>`，紧接着必须 `if (currentArticle && currentArticle.id === id) currentArticle = <新对象>`**；
   回填函数里再加一道「同 id 不同对象 → 重新指向权威对象」的兜底断言（并 `console.warn` 出来，别静默修）。
3. **顺带修掉「状态谎报」**：上传中的文章 `sentences=[]` 会被误判成「本来就没有译文（missing）」，
   于是浮层写「这篇还没有生成译文」，还会指路到一个**没显示的**按钮。
   做法：给文章加 `analyzing` 标记（= 三个 `*Ready` 未全真），`articleTranslationState()` 里
   `if (a.analyzing) return 'loading'`（文案「译文还在加载中」），并且**终态时必须清掉这个标记**。
   `detailLoaded` 同理：**不能无条件写 true**（上传时是 deferEnter，详情字段还是空壳），
   否则 `shouldFetchArticleDetail()` 恒 false，自愈路径被永久挡住。

## 用户报「前端不显示/数据不对」时：先证伪，别改算法

这个项目的 bug 大多**不在算法里，在数据与加载链里**。用户说「后端日志说成功了，界面却没有」时，
按下面顺序走，做完第 1 步往往就能排除一半方向：

1. **数据驱动跑一遍被测逻辑**：临时脚本用 `vm.runInContext` 载入 `app.js`，导出相关纯函数
   （如 `sentenceMatches`），对真库每篇跑一遍统计命中率。
   实测「句子翻译成功但浮层暂无翻译」这个 case：148 个片段命中 146 → **匹配逻辑没问题，立刻停手**。
2. **对比接口返回与 DB 存储**：起一个临时端口 `require('./server')`，`fetch` 接口，逐字段比对。
3. **真浏览器逐篇跑一遍**：写个临时 playwright 脚本遍历真库所有文章做同一动作，看是个别坏还是全坏。
4. **全库扫数据找「不可能工作」的行**。本项目的一个实例：
   `SELECT ... WHERE status='completed' AND (sentences='[]' OR sentences IS NULL)`。
   ⚠️ 临时诊断脚本命名 `_diag_*_tmp.js` 或 `_diag_*.js`，**跑完必须删掉**。
5. **第 4 步找到的「坏数据」不要一口咬定是「历史存量」**。用户驳回「存量文章」时的实例：
   这些文章**全是用户自己上传的**，而且题目生成成功 —— 说明上传链路里失败被伪装成了成功，
   漏洞**今天仍活着**，下次上传还会复现。
   判据：坏数据只要呈现「同一批任务里别的产物都正常、只有这一项缺」，就说明是**管线问题**而非历史遗留，
   必须继续往上游追（→ 换用 `silent-empty-success-guard` 那个 skill 的方法）。
   ※ 一个反向经验：`created_at` 早 ≠ 是存量；用户也记不清上传日期，**别拿日期当结论**，
   要拿「同类数据是否还会再产生」当结论。

## 用户报「刷新被打回登录页 / 返回键直接退出」时：查**会话持久化 + History API**（2026-10-09 实测）

两条症状几乎总是同一个根因：**SPA 从不往浏览器历史里写东西，也不记自己停在哪一屏**。
先跑这两条 grep 定性，比读代码快：

```bash
grep -rn "history\.\|pushState\|popstate" app.js index.html   # 空 → 返回键必然直接出站
grep -rn "localStorage.setItem\|sessionStorage" app.js         # 没有「当前屏」→ 刷新必然回首页
```

- **刷新恢复**要连用户身份一起恢复。本项目 `let userData` 每次载入是空对象，而
  `getUsername()` 直接读它 → 不恢复 `gaUserData` 的话，刷新后所有请求带的
  `x-username` 会变成默认用户（**隐藏的串号 bug**，用户往往只报「被登出」）。
- **恢复屏不能只切 class**：阅读页要重绘文章（要 `articleId`）、单词本要重算、练习页状态在内存里
  （刷新就没了 → 退回主界面）。所以只恢复**稳定屏**，临时屏一律退主界面。
- 会话恢复**不走 `startApp()`**，所以 `startApp()` 里的副作用（打卡、拉收藏）必须自己补一份。
- **历史必须有「根条目 + 同屏副本」两条**：浏览器在**最根那条历史**上按返回会直接离开本站，
  **且不触发 popstate**，没有任何拦截机会。副本给了一次「再按一次才退出」的缓冲。
  由此根屏守卫的判据是「**当前已经在根屏**」，而不是「depth 到头了」——
  否则「从子页退回根屏」会被误拦，根屏永远回不去。
- **下标 ≠ depth**：条目 0/1 是根 + 根副本，depth `d` 对应条目下标 `d+1`，
  回退差值是 `pushedScreens.length - idx - 1`。
- 点应用内的「← 返回」要**真回退**（`history.go(-delta)`）而不是 push 新条目，
  否则用户再按浏览器返回键会「前进」回刚离开的那页 —— 正是用户抱怨的那种「返回不对劲」。
- 「开始旅程 / 登录完成」进主界面用 **replace** 而非 push，把欢迎页就地改写掉，
  否则返回键会再看到一次欢迎页（用户眼里 = 被登出）。

测试要点：
- 无头桩的假 History 要**真能前进/后退**，栈外要标记 `exited = true`（= 离开本站），
  否则测不出「到底退没退出」。**桩不会派发 `DOMContentLoaded`** → `popstate` 监听注册不上，
  要在测试桥里手动注册一次，否则 `fakeHistory.back()` 完全没有响应（看起来像功能没生效）。
- 真浏览器侧：`page.reload()` 验刷新恢复；`page.evaluate(() => history.back())` 验返回键
  （比 `page.goBack()` 稳，同文档跳转不会被 Playwright 的导航等待卡住）。
  用「reload 前往页面里塞一个 `window.__aliveProbe`，返回后还在」来证明**页面没被卸载重载**
  （即真的是应用内切屏，而不是又进了一次站）。

## 全量回归清单

```
test_sentence_empty_guard 20 · test_sentence_missing 39 · test_guess_lock 93 · test_word_card 43
test_sentence_hover 16 · test_backfill_and_partial 58 · test_sentence_retry 62
test_sentence_match_split 79 · test_article_cleanup 37 · test_api_layers 76
test_queue_word_fallback 8 · test_model_fallback 23 · test_waiting_flow 16 · test_quiz_empty_guard 16
test_quick_actions 69 · test_navigation 45 · test_word_card_browser 322
```

（数字会随功能增长而变化，这里只是「有哪些文件」的备忘。）

- 系统 node 优先用 `C:\Users\Administrator\.workbuddy\binaries\node\versions\22.22.2-3\node.exe`。
- `test_integration.js` 需要外部服务在 3000 端口（`/health`），属**按需手动脚本**、不在回归清单里。
- 真浏览器测试要 `NODE_PATH=C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules`，
  用 `chromium.launch({ channel: 'msedge', headless: true })` 复用本机 Edge（只装库不下载浏览器）。
- ⚠️ **「静默跳过」陷阱**：`test_word_card_browser.js` 在 `require('playwright-core')` 失败时
  只打印一行「⏭ 跳过」然后 `process.exit(0)` —— **退出码是 0，看着像通过，其实一条没跑**。
  漏了 `NODE_PATH` 就会踩到。**跑完别只看退出码，要看有没有 PASS 行 / 结果行**；
  凡是「缺依赖就跳过」的测试，退出码 0 ≠ 通过。

## 收尾（别漏）

1. 追加到 `.workbuddy/memory/YYYY-MM-DD.md`（append-only）：改了什么、踩了什么坑、测试数字、指纹变化。
2. 长期约定写进 `.workbuddy/memory/MEMORY.md`。
3. `present_files` 把交付物（截图 + 改过的源码）给用户看。
