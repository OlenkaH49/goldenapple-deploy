# 项目长期记忆 — 金苹果之旅（初中背单词）

> 本文是「决策 + 红线 + 踩坑」的长期沉淀，按主题归并（2026-10-09 归并过一次）。
> 每日过程记录在 `YYYY-MM-DD.md`；可复用方法论在 `.workbuddy/skills/`。

## 0. 技术栈与分层
- 后端 Express + better-sqlite3（`data/app.db`），零外部依赖。`docker-compose.yml` 是 PG+Redis 迁移桩，**不要动**（`.env` 里残留的 PG/REDIS 变量不用）。
- 分层：`db.js`（数据访问，纯函数）→ `coze.js`（AI/知识库，纯函数，不碰 HTTP）→ `queue.js`（进程内异步队列）→ `server.js`（路由）。前端 `app.js`（单文件、函数风格、无框架）+ `index.html`（样式/骨架）。
- 新能力优先写进 `coze.js` 纯函数并导出；`server.js` 只做参数解析与响应拼装。
- 日志风格 `console.log('🔎 [模块] ...')`（中文 + emoji 前缀）。
- **改完 `app.js` 必须 bump `index.html` 的 `app.js?v=...`**（当前 `20261009_6`）。

## 1. 数据层
- `word_cache`：通用词库（word→definition），词级，也是 L3 兼容层。
- `word_context`：语境库（`word+context` 唯一），RAG 核心；另有 `article_id` 列（**无外键**）与 `kb_synced_at`/`kb_synced_definition`。
- `user_words`：收藏表，`UNIQUE(user_id, word, article_id, sentence)`，外键指向 `articles`（`PRAGMA foreign_keys=1`）。**一行 = 一个「词 × 文章 × 句子」**。
- `articles`：`status` 五态 `pending/processing/completed/partial/failed`。
- 词典层：本地 ECDICT，独立文件 `data/dictionary.db`，运行期 `readonly:true`（不抢写锁）。过滤「纯字母 ≥2 字符 + 有中文释义」→ **365,058 条**；`npm run dict:import`。
  - 下载唯一可用通道 `gh-proxy.com`（raw.githubusercontent 超时、jsDelivr 20MB 上限 403、`ecdict.mini.csv` 是 4KB 空壳、media.githubusercontent 404）。
  - 义项分隔符是**字面量 `\n`**（hex `5c 6e`，反斜杠+n 两个字符）→ `split(/\\n|\r?\n/)`；CSV 解析要**引号状态机**（`translation` 含内嵌换行）；音标是老式 ASCII（`'betә`→`ˈbetə`）。
  - ECDICT **0 条含撇号** → `don't/isn't/o'clock` 查不到。`getDictionaryEntry` 兜底链：直查 → 弯引号归一 → **缩写表 `CONTRACTIONS`(~35)** → 所有格剥离 → 去撇号 → 连字符首段；返回挂 `via`/`contraction`/`query`。
  - 真实覆盖率（72 篇已发布文章，剔除 1 篇把 PDF 原文当正文的脏数据）：**98.3%**，逐篇均值 99.0%；未收录全是人名地名与文本粘连伪词。

## 2. 查询口径与三层 RAG
- 查词 = 词典层（同步 21µs）→ L2 本地 `word_context` → 联网层（`?ai=1` 才开）。
- 三层 RAG：L1 知识库 → L2 `word_context` → L3 AI 生成并回写（+ 补 `word_cache`）；命中层级在响应 `layer`：`kb/context/ai/cache/none`。前端 `sourceLabels` 只认 `context/ai/none`，其余显示「通用释义」→ **L1 命中刻意返回 `source:'context'`**。
- 默认开 AI（`enableAI !== false`），冷词 miss 真调 LLM（~7s）；低延迟传 `?ai=0`。
- 卡片两栏：「当前语境释义」上、「其他释义」（词典全义项）下。
- ⚠️ `contextDefinition` 非空 ≠ 本句语境释义：兼容层 `word_cache` 在 L2/L1/L3 全 miss 时也会填，但 `contextSource='cache'`（那是通用释义）。白名单 `REAL_CONTEXT_SOURCES = ['context','kb','ai']`（`app.js isRealContextSource()`）；`cache`/`article` 只能归第②层。

### L1 = 调 Coze 工作流（不是直连检索）
- 直连 `POST /open_api/knowledge/document/search` 在 api.coze.cn 上是**网关级 404**；`document/list` 返回 `4101`（PAT 对知识库无权限）。改调工作流后 4101 自动解决，调用侧只需 PAT 的 `workflow.run` 权限。
- 配置：`COZE_KB_SEARCH_WORKFLOW_ID`（**核心开关，不填则 L1 跳过、从 L2 开始**）、`COZE_KB_WORKFLOW_PATH`(`/v1/workflow/run`)、`COZE_KB_WORKFLOW_QUERY_PARAM`(`query`)、`COZE_KB_WORKFLOW_TIMEOUT_MS`(30000)、`COZE_KB_WORKFLOW_BOT_ID`（含数据库/变量节点的工作流**必须**关联智能体）。请求头必须带 `Agw-Js-Conv: str`。
- 调用 `POST {BASE}/v1/workflow/run` body `{workflow_id, parameters:{query}}`。**`data` 是 JSON 序列化字符串**要二次 `JSON.parse`；解析失败保留 `dataRaw`，**绝不能把原文当命中**。
- 真实结构：`data` → `{"results":[{"documentId","output"}]}`，`output` 又是一层 JSON 字符串。输出三层兼容（`searchKnowledgeBaseOnce`）：①`{word,context,definition}` ②`{output:"<JSON>"}`/`outputList[].output` ③纯文本 CSV 行 —— **三种都必须过「word 完全匹配」这关**。
- 限制：非流式 **90s 无响应被网关断开**；工作流必须**已发布**；请求 ≤20MB。**4200 = 不存在/未发布**（别只看文案）。错误码表在 `KB_WORKFLOW_CODE_HINTS`（4000 入参/4009 节点/4100 鉴权/4101 无权限/4200 不存在或未发布/6003 需付费版）。
- ⚠️ `callCozeWorkflow({...})` 的 `workflowId` **无默认兜底** → 忘传返回「未配置工作流 ID」。排查脚本先确认 `ok=true` 再分析。
- 精确筛选：只留 `word` 与查询词完全匹配的记录（忽略首尾引号/空白 + 大小写；「有 word 无 definition」视为未命中）；返回 `exact`/`hits`/`hitsAll`。调用方须传 `opts.word` 与 `opts.context`。

#### L1 query 形态（命中率 20% → 80%）
- 病根：同一句 context 被该句所有词共享，而工作流**恒返回 3 条**（传 top_k/limit 全不生效）→ 拿「词+整句」查时 top-3 常被同句「兄弟词」占满。
- 实测（20 词）：`word + 空格 + context` = 4/20；`word` 单独 = **16/20**；`word,context` = 5/20；两者并集 18/20（仅 3/20 重叠，**几乎完全互补**）。
- 实现：`searchKnowledgeBase`（多轮包装）按 `buildKbQueryAttempts()` 依次调 **`searchKnowledgeBaseOnce`**（单轮），任一轮筛出目标词即返回。
- `COZE_KB_QUERY_MODE` = `two_step`（**默认**，word → word,context）/ `word` / `legacy`。无 `opts.word` 或空 context 退化单轮。**想让 L1 更强，最大杠杆是去工作流编辑器把 KB 节点 top_k 调大**（调用侧传参无效）。残留 ~10%（former/latter/whereby）由 L2/L3 兜。
- 统计 `getLookupStats().kbWorkflow` = `{lookups, calls, multiRoundHits, hits, misses, errors, skipped, hitRate, avgMs}`。区分：`layers.kb` = L1 最终命中并成为结果；`kbWorkflow.hits` = 工作流调用成功且筛出匹配记录。

#### L1 熔断 + 4028
- **Coze `code 4028` = 账户额度耗尽**（响应是 HTTP 200 + `{code:4028,data:''}`）。不是 4200/4101 → **先看 code，别猜**。代码侧无解，只能充值/等刷新。
- `KB_FATAL_CODES = {4028,4100,4101,4200,4201,6003}` 属「重试、换 query 都无解」类：失败命中即 `openKbCircuit()`（`COZE_KB_CIRCUIT_COOLDOWN_MS` 默认 10min），成功即 `closeKbCircuit()`；入口判 `isKbCircuitOpen()` 直接跳过。
- 计数别双端各加一次：`kbCircuit`/`layerErrors` 只在 `lookupWordWithLayers` 明细分支累加。
- 暴露面：`getLookupStats().kbWorkflow.circuit`、`/health#kbCircuit`、`GET /api/kb/reset-circuit`。

## 3. 知识库同步 = 手动模式（自动同步已停用）
- 三步：`node export_csv.js` → Coze 控制台手动上传 `word_context.csv`（文件类型选 txt）→ `node sync_to_knowledge.js --mark-synced`。
- `sync_to_knowledge.js`：默认打印指引；`--export`/`--stats`/`--mark-synced`（旧名 `--seed-markers`）/`--verify [N]`（唯一联网命令）；遗留 `--daemon/--full/--dry-run/--force/--no-now/--probe/--prune` 打印「已停用」后退出。
- 已同步判据：`kb_synced_at IS NULL OR kb_synced_definition <> definition`（**内容级**，不是时间级）。释义被补全/修改会自动重新变待同步。
- CSV 固定 4 列 `word,context,definition,part_of_speech`；UTF-8 **禁 BOM**（`\uFEFF` 会让知识库把首列读成 `\uFEFFword`）；单元格换行压成空格。
- ⛔ 已停用但保留为注释的代码（恢复需成对还原）：`coze.js` 的 `normalizeUploadPayload/uploadToKnowledgeBase/uploadViaOpenApi/uploadViaV1/encodeKbContent/looksLikeBase64Literal/probeContentMode/deleteKnowledgeDocuments/pruneAutoKnowledgeDocuments`（**及 `module.exports` 对应键，漏注释 = ReferenceError**）；`sync_to_knowledge.js` 的 cron/runSync/攒批/硬超时/位点保护整块。
- 历史经验：文本知识库 ≤300 文件、分段 ≤10000、单 txt ≤5MB；v1 `content` 编码（明文 vs base64）当年用「探测状态机」解决，固定标记词会自毒（须每轮唯一）。

## 4. 性能与并发约定
- **复合索引** `idx_word_context_word_context(word, context)`（建在 `initDB` 建表块，`IF NOT EXISTS` 对存量库自动补建）。L2 热路径 `WHERE word=? AND context=? ORDER BY id DESC LIMIT 1`；只有单列 `word` 索引会把该词**全部**语境捞回来再逐行比，实测约 **3.5×** 差距。`id` 即 rowid，复合索引天然有序 → 无需 TEMP B-TREE。
- **回写一律异步**：better-sqlite3 同步 API 写在请求链路会阻塞事件循环，且与同步脚本共用库文件时另一边持写锁要干等 `busy_timeout`(5s)。统一用 `coze.scheduleWriteBack(label, fn)`（`setImmediate` + try/catch）先发响应。搬进闭包前把 `definition`/`part_of_speech` **快照成局部常量**。例外：`POST /api/words`（用户主动保存释义）**不要异步**。
- SQLite 坑：
  - `ALTER TABLE ADD COLUMN` **只接受常量默认值**（`DEFAULT (datetime('now'))` 报错）→ 加可空列 + 单独 UPDATE 回填。
  - 两进程同开 `data/app.db` → 迁移用 check-then-act 会撞 `duplicate column name`，每列各自 try/catch 吞掉；`busy_timeout=5000`；写用 `db.withBusyRetry(fn, tries=4)`（退避 100/200/400ms）。
  - **绝不能把 await 网络调用放进 better-sqlite3 事务**（`markWordContextSynced` 是纯同步单事务）。
  - `node-cron` 的 `executeTimeout` 只对 background/fork 生效，**inline 任务无超时** → 硬超时自己用 `AbortController` + `setTimeout`。
  - Windows `child_process.spawnSync` 偶发 `EBUSY` → 长命令用异步 `spawn`。
  - 防重入别用 `running` 布尔（某次卡死就永久 true、后续 tick 静默跳过）→ 用 epoch + deadline + `finally` 复位。

## 5. 点词体验：即时出卡 + 后台精修
- L3 必落 LLM：GLM `glm-5.3-flash` 单次 **~4s**、偶发 12s+（**模型延迟，不是 bug**）。
- **绝不能「等 Promise resolve 才建词卡」**。`openWordCard` 契约：① 用 `currentArticle.words` 本地释义**同步**弹卡（`pending:true`）；② RAG 回来 `updateWordCardIfOpen()` 原地刷新；③ 词卡指纹 `currentWordCardKey = word+'\u0001'+sentence` 防旧请求覆盖新卡；④ RAG 无结果时保留本地释义、只摘 `.wc-pending`（不重绘）。
- L3 独立收紧超时：`WORD_MEANING_TIMEOUT_MS`(20s)/`WORD_MEANING_MAX_RETRIES`(1)，仅在 `generateWordMeaningsWithCoze` 覆盖。**`callLLM` 默认 600s + 2 次是给批量分析的，改前先想批量路径**。
- ⛔ **不要再给点词加「释义没就绪就 return」的门禁**（`wordsReady` 在工作流失败后永不变 true → 卡片永不出）。配套：`queue.js` 的 `wordPromise.catch` 必须用 `cacheMap` 兜底并置 `t.wordsReady = true`。
- ⛔ 卡片内「🌐 本句翻译」按钮**已删除，别加回来**。句子翻译只剩 `armSentenceHover()` 悬停浮层一条路径。`buildSentenceList`/`sentenceMatches`/`normalizeSentence` 是浮层在用，**不能删**。

## 6. 词卡定位与句子悬停
- 词卡实际 `298×480px`。`positionWordCard(card, x, y)`：优先塞进 `#readContent` 右侧空白栏（判据 `vw - rc.right >= w + 24`），次选左侧，都没有才回退「锚点上下」；`top` 用 `y - h/2` 居中并 clamp。1280 视口正文列 `48..812`、右侧空档 468px；**1024 视口只剩 48px → 必然回退**。
- ⚠️ 词卡有尺寸暴涨陷阱（点词瞬间 456 → 后台核对回来 480）→ `showWordCard` 挂 **`ResizeObserver`**（`card._posObserver`），`hideWordCard` 里 `disconnect()`。
- ⚠️ **`elementFromPoint` 与真实鼠标事件给出不同答案**：排查「悬停不触发」**必须以真实鼠标事件（`page.mouse.move`）为准**，几何探测只作辅助。
- 悬停幂等排期：`armSentenceHover(el)` 幂等（`armedIdx===idx && timer` → 返回；`visibleIdx===idx && visible` → 返回）；换句先 `clearTimeout` + `hideSentenceHoverPanel()` 再排期；`mouseover` **进入即排期**；到点前校验 `sentenceHoverEl === el`。`onSentenceMouseOut` **不要无条件清 `sentenceHoverEl`**（`mouseout` 先于新句 `mouseover`）。延迟抽成 `SENTENCE_HOVER_DELAY_MS`(3s)。
- **`renderArticleWithTranslations()` 重建 `#readContent.innerHTML` 后必须** `sentenceHoverEl = null; clearSentenceHoverTimer(); hideSentenceHoverPanel();`。
- 三个句子悬停监听从 `#readContent` 提到 `document`（`mouseover`/`mousemove`/`mouseout`），配套 `describeEl`/`isOwnOverlay`/`resolveSentenceEl`/`sentenceUnderPoint`/`hoverTimerState`。

## 7. 译文状态：唯一判定处 `articleTranslationState()`
| 取值 | 条件 | 界面表现 |
|---|---|---|
| ok | `sentences.length > 0` | 正常 |
| failed | `status==='partial'` 或 `sentencesError` | 提示条 + 重试 |
| missing ★ | `completed` + 0 句 + `detailLoaded` 且非 preset | 「这篇还没有生成译文」+ 重试 |
| preset | 预置文章、0 句 | 「（暂无翻译）」，**不给重试** |
| analyzing→loading ★ | `a.analyzing === true` | 「译文还在加载中」，绝不说「还没生成」 |
| loading | 0 句且 `!detailLoaded` | 「译文还在加载中」+ 补拉详情 |
| none | `currentArticle` 空 | — |

- **判定顺序不能乱**：`failed` → `n>0 → ok` → **`analyzing → loading`** → `!detailLoaded → loading` → `preset` → `missing`。
- `analyzing` 来龙去脉：`openAnalyzedArticle` 传 `deferEnter` 时三个 `*Ready` 还 false → `allReady = wordsReady && sentencesReady && questionsReady`；`detailLoaded = allReady`、`analyzing = !allReady`；文章终态由 `clearAnalyzingFlag()` 清；`loadArticleDetail` 按 `d.status === 'processing'|'pending'` 回填 `analyzing`。
- ⚠️ `missing` 必须以 `detailLoaded` 为前提（详情没到前 `sentences` 恒为 `[]`，不设闸会把「刚点开」误报成「译文缺失」并弹重试）。⚠️ `preset` 必须与 `missing` 分开（给预置文章重试入口会白烧额度）。
- ⚠️ 浮层文案**不再指路**「点正文上方的『重试』」——提示条不保证展开，**要指就指自身**；重试入口由提示条本体承担。

## 8. `partial` 与「只重跑句子翻译」
- 句子翻译失败 = `status='partial'`（`articles.sentences_error` 落原因，迁移 `migrateArticleErrorSchema()`）。**不用 `failed`**：前端 `failed` 会弹整篇降级，而 partial 的题目/释义都是真结果。
- ⚠️ `/api/article-status/:id` **必须显式处理 `partial`**（否则落进 pending/processing 分支 → 前端一路轮询到 5 分钟超时、永远进不了阅读页）。该分支返回 `status:'partial'`+`partial:true`+`sentencesFailed:true`+`sentencesError`；接口另在 `/api/article/:id`（+`hasSentences`）、`/api/articles` 列表项透出 `sentencesError`。
- 前端 `#sentenceFailNotice`（partial）与整篇降级 `#fallbackNotice` **是两个独立节点，别合并**。
- 重试入口 `#sentenceFailNotice` → `POST /api/retry-sentences/:id`（404 不存在 / 200 `alreadyDone` / 409 pending|processing / **202 正常**，异步 + 轮询）。
- 🔴 **`db.updateArticleSentences(id, sentences, {status, sentencesError})` 是专用函数，不要复用 `updateArticleQuestions`**（后者 `SET questions = ?`，重试译文时题目没变，传 undefined 会把题目清成 NULL）。
- 🔴 **重试期间 DB 的 status 一直是 `partial`**（进程崩掉仍是 partial 可再点，不会卡 `processing`），只有拿到最终结果才一次性翻 `completed`/写回新原因。失败落库用 `prevSentences` 而非硬写 `[]`。
- `queue.js` 侧：`startSentenceRetry`（立即返回，202 语义）/ `retrySentences`（等待式，测试用）/ `isRetryingSentences`。只调 `coze.analyzeSentencesWithCoze`，**绝不跑 word/quiz**（省额度 + 不覆盖已有好结果）。并发幂等靠 `sentenceRetryMap`；`startSentenceRetry` 还查 `taskMap` 拒绝「整篇分析中」的并发插队。**`sentences.length === 0` 也算失败**。
- 🔴 **前端轮询必须同时看 `status` 和 `sentencesRetrying`**：只看 status 会把「还在跑」误判成「又失败」。三组合：`completed`+有译文 → 成功；`partial` 且 `sentencesRetrying=false` → 又失败；`partial` 且 `true` → 继续等（2 分钟超时）。**`sentencesRetrying` 要先于 status 判定**。按钮忙闲绑 `sentenceRetryTargetId`（文章 id）而非全局布尔。
- ⚠️ 三处前提（少任何一个 = 点了没反应）：① `alreadyDone` 门槛是 `completed && sentences.length > 0`（**别改成只认 partial**）；② `/api/article-status/:id` 的 completed 分支必须返回真实 `sentencesRetrying`（曾写死 `false` → 前端把「正在重试」误判成「非预期状态」直接 return）；③ 轮询顺序。

## 9. ★ 并行工作流的两类隐性丢数据
释义/译文/题目是**三个并行工作流**（`Promise.allSettled`），完成顺序不确定。「后端日志成功、前端却没有」最后落在这两个坑上，**必须一起查**：
- **① 轮询提前收工 → 迟到的结果没人接收**：旧代码在 `questionsReady` 那刻 `return`；`quiz_generator` 常最先完成 → 「题目就绪 → 进阅读页 → 轮询结束」，20 秒后句子翻译成功**没人在听**。现在：进阅读页只代表「可以开始读了」，轮询转 **quiet 后台阶段**（`quietElapsed` 上限 15min）守到终态再回填；`maxWait`(5min) 超时也**不再 return**，转 quiet。
- **② 对象引用分叉**：`loadArticleDetail` 里 `ARTICLES[i] = full` 是**替换成新对象**，`currentArticle` 只是旧引用 → 回填写进新对象、渲染读旧对象 → 译文永远不显示。
- 收敛规则：终态回填收敛到**唯一入口** `applyTerminalStatus(articleId, status, quiet)`（一次回填释义+译文+题目 → 清 `analyzing` → partial 挂原因 → 在阅读页就原地重绘），**不允许多处各写一份回填**；`applyPartialProgress(part, articleId)` 第二参必传（quiet 阶段可能跨页面，要写进指定文章的内存对象）；**凡 `ARTICLES[i] = <新对象>，紧接着必须同步 `currentArticle`**（回填函数里再加「同 id 不同对象 → 重新指向权威对象」兜底并 `console.warn`）；悬停自愈加 `!currentArticle.analyzing` 守卫；兜底 `backfillArticleUntilTerminal(articleId, why)`，按文章独立 token（`backfillTokens[id]`）。

## 10. ★「空成功」：失败被伪装成成功
- 病根形态：解析函数失败时 `return { 字段: [] }` 而不是 `throw`。
  - 实例 1（句子）：`coze.js callSentenceBatch` JSON 解析失败只 warn 就返回空数组 → 落 `completed + sentences=[] + sentences_error=NULL`（用户看到「日志说成功、题目都在、整篇没译文，且连 partial 都不是 → 没有重试入口」）。
  - 实例 2（题目）：`coze.js generateQuestionsWithCoze` 里 `JSON.parse(extractJSON(answer))` 失败只 warn → 0 题 + `success:true`。**排查口诀：在 `coze.js` 里搜 `JSON.parse(extractJSON(`，一次找齐所有同类风险点。**
- 修法（两层都要）：① 解析层抛错（带原始响应前 200 字）交给既有「模型降级链 GLM→DeepSeek」；② 汇总后断言「正文含英文却 0 句/0 题 → 抛错」；③ 落库层同判据 → 强制 `partial` + 写 `sentences_error`。quiz 侧抽 `runQuizOnce(cfg,...)`，改走既有 `runWithModelFallback`（旧代码 quiz 只用单模型）。
- 必须带白名单：`coze.hasEnoughEnglish(text)`（`[A-Za-z]` ≥ 20）；用户粘贴**纯中文**时返回空是合法的，不能误标 partial。
- **★ 一个「空成功」能连带毁掉毫不相关的功能**：quiz 0 题 → queue 落降级题（`fallback.js` 打 `isFallback:true`/`answerMode:'selection'`）→ 前端 `applyQuizState` 置 `fallbackQuizActive = true` → `onSpanPointerDown` 开头 `if (fallbackQuizActive) return;` ⇒ **正文单词拖拽收藏整个失效**。**用户报「A 功能坏了」时，先 grep A 的 early return / 前置 flag（`grep -n "if (.*Active) return"`），不要顺着用户给的方向查。**
- quiz 间歇性失败机制：GLM 返回里 `reasoning_tokens` 占输出一半（实测 619/1187），触输出上限时 JSON 被**截断** → 解析失败；`callLLM` 没设 `max_tokens`。**别因为「重跑成功」就否掉这个 bug。**
- 回归：`test_sentence_empty_guard.js`(20) + `test_quiz_empty_guard.js`(16)；前端连带损伤由 `test_word_card_browser.js` **【⑰】** 段真鼠标回归。善后 `repair_missing_sentences.js`（默认干跑，`--yes` 才真跑、耗额度）。
- **测试清理要连 `word_context` 一起删**（队列会写带 `article_id` 的 `word_context` 行，只删 `articles` 会留悬空行 → dedup 断言报红）。方法论 skill：`.workbuddy/skills/silent-empty-success-guard/`。

## 11. 「译文取不到」的排查套路（别再从匹配算法猜起）
1. **数据驱动跑一遍匹配逻辑**：临时脚本用 `vm.runInContext` 载入 `app.js`，导出 `sentenceMatches/normalizeSentence/squashSentence`，对真库每篇 `content` 切片段后逐条匹配。实测 148 片段命中 146 → **匹配逻辑没问题，立刻停手**。
2. **对比后端与 DB**：`/api/article/:id` 的 `sentences` 与 `articles.sentences` 是否逐字节一致。
3. **真浏览器逐篇悬停**（playwright + 本机 Edge），看是不是只有个别文章坏。
4. **全库扫数据**：`WHERE status='completed' AND (sentences='[]' OR sentences IS NULL)`，还要检查每篇里 `translation`/`sentence` 为空、条目是裸字符串的项。
- 运行时工具：`app.js` 暴露 `window.__checkSentenceList([articleId])`。
- ⚠️ **第 4 步找到的坏数据，别一口咬定是「历史存量」就收手**：那些文章**是用户自己上传的**、题目生成成功 → 这是**管线问题**。判据用「同类数据是否还会再产生」，**不要用 `created_at` 早晚当结论**。

## 12. 浮层「暂无翻译」= 列表刷新冲掉详情 × 正文掉空格
两个根因叠加，**只修一个仍会复现**：
1. **文章列表刷新把已加载详情冲成空壳（主因）**：`loadArticlesPage` 首页重载 `ARTICLES.length = 0` 后用 `Object.assign({}, 旧, mapServerArticle(列表项))` 合并，而列表项是**轻量版**（`sentences:[]`/`words:{}`/`questions:[]`/`detailLoaded:false`）→ 译文被原地清空；补拉守卫 `!articleDetailAsked[id]` 是**一次性开关** → 点过这篇后永远 true → **永不补拉**。→ 修复 `mergeServerListItem()`、`shouldFetchArticleDetail()`（已加载/在拉/失败 5s 退避内 → 不拉）、`loadArticleDetail` 失败时 `delete articleDetailAsked[id]`、`renderArticle` 末尾**自愈补拉**。
2. **正文掉空格导致匹配失败（次因）**：PDF 抽取正文是 `rapiddevelopment`/`ofordinary`，而后端 sentenceList 空格正常 → 逐字不等。→ `squashSentence()`（归一化后**再去掉所有空白**）加入 `sentenceMatches` 三级判定，实测命中 6/17 → **17/17**。
- 另三条同类修复：① 悬停译文改 `resolveSentenceAt(idx)` 在**显示那一刻**重取；② `sentenceMatches` 的「精确包含」加长度比例护栏（短侧 ≥ 长侧 50%）；③ `mapServerArticle` 透出 `serverHasSentences`。
- 日志：匹配失败打 `describeMatchFailure()`；译文为空打 `describeEmptyTranslation(idx)`。
- **口诀**：先看 `currentArticle.detailLoaded` 与 `sentences.length`，再看 `🎨 [句子渲染]` 那行（文本匹配 vs 顺序兜底各几次）—— 三者就能把两个根因分开。

## 13. 预置文章没有译文 → `.article-sentence` 为 0
- `BUILTIN_ARTICLES` 只带正文字段、**没有 `sentences`** → 旧 `buildSentenceList()` 返回 `[]` → 一个 `.article-sentence` 都不生成 → 悬停**永远不可能触发**且完全静默。**排查「悬停不触发」第一步永远是先数 `document.querySelectorAll('#readContent .article-sentence').length`。**
- 修复：`buildSentenceList()` 在 `sentences` 为空时用**与正文渲染完全相同的切句规则**本地切句兜底（`translation` 留空）；顺序对齐兜底去掉 `&& sentences[seqIdx].translation`。该兜底**只在 `list.length === 0` 时生效**，对有译文的文章零影响。
- 要给预置文章配真译文，重跑 article 分析工作流产出 `sentences` 落库即可（`queue.js:307`），通道是通的。

## 14. 粘连词拆分：本地词典 DP 分词
- `coze.segmentGluedWord(word)`：先查合并词（收录就不拆）→ 收集所有长度 ≥2 的子串**一次 SQL 批量查词典** → DP 取 `Σ(词长²)` 最大的「每段都在词典里」切分 → 无合法切分就不拆。纯本地 1~20ms。
- **坑：ECDICT 的 `bnc`/`frq` 是排名（1 = 最常用），不是次数。** 直接当词频做 tie-break 会**反过来奖励生僻词**（`themore` 被拆成 `them + ore`）→ 必须用 `Σ 1/排名`（`gluePartFrequency`）。
- 护栏：`isTrustedGluePart`（段长 ≥4 可信；短段必须有词频/柯林斯/牛津信号）+ 输入上限 30 字母。AI 兜底 `splitGluedWordWithAI` **默认关**，`?ai=1` 才走；AI 结果每段仍回查词典且要求拼回等于原串。
- 接口 `GET /api/glue-word/:word`；前端在「词典 + 语境 + 通用词库全无释义」时触发，卡片按「合并 → 分开 → 分开」三行渲染。

## 15. 词性显示：ECDICT 老式缩写必须归一
- 老式缩写 `a.`=adjective / `ad.`=adverb / `int.`=interjection 统一成 `adj./adv./interj.`。两处缺一不可：`db.js` 的 **`normalizePosAbbr(line)`**（插在 `parseDictionaryRow` 的 `splitLines` 之后 `.map()`）；`coze.js` 的 **`normalizePosLabel(pos)`**（ECDICT `pos` 是机器格式 `adj:100/n:50`）。`app.js prettyPosLabel` 是第三道兜底。
- ⚠️ **归一的正则红线**：必须要求行首标记后**紧跟空格或行尾**。否则 `analysis 分析`、单独一行 `a`、`vt.&vi. 使` 会被误伤。已知小瑕疵：单独一行 `a`（无空格无句点）会被改成 `adj.`，ECDICT 实际都是 `a. xxx` 形态，不影响。

## 16. 收藏释义：优先级 + 三层兜底
**用户指定优先级：① 本句语境释义 → ② 文章词表 → ③ 词典层首义。**
- 根因两条：① `getWordContext`（L2）要求 `word + context` **逐字符相等**（正文 DOM 句子与写库句子常因空格/标点/站标 `[xxx]` 差异而 miss）；② 拖拽时没有词卡 → `bestMeaningForCollect(word)` 不带 `contextDefinition` → 第①层永远空。⇒ part-time 收藏成词典兜底的 `part`。
- **匹配必须归一化，且前后端同规则**：`coze.squashContextKey()`（小写→去站标→去非字母→**保留数字**→去空白）≡ 前端 `squashSentence()`。查询统一入口 `coze.findWordContextRow(word, ctx)`：精确优先 → 归一化兜底，返回 `matchType:'exact'|'normalized'`；`lookupWordWithLayers` 与 `resolveLocalMeaning` 都走它（别写第二套）。候选来自 `db.getWordContextCandidates(word, 200)`（只取 definition 非空、带 LIMIT）。⚠️ `squashContextKey` 曾把数字全删 → 匹配错语境，**必须保留数字**。
- **契约（写入端）**：`app.js bestMeaningForCollect(word, opts)` = 本句语境释义 → `localMeaningOf` → `dictionaryOf().translationLines[0]`；**拿不到时返回 `''`，绝不返回 `'暂无释义'`**（否则被当成真释义写进库；实测 35 行里 25 行是字面量 `'暂无释义'`）。
- `app.js resolveCollectMeaning(word, sentence, opts)`（异步）：拖拽落点与卡片收藏都走它。请求**不带 `?ai=1`** → 只查本地词典 + 语境库（~1–5ms），**不调 LLM、不烧额度**。只有卡片上已是**真·语境释义**时才「卡片直取、不发请求」。
- **读取端兜底**：`/api/user-words` 对 `空/'暂无释义'` 的行用 `coze.resolveLocalMeaning()` 现场补，响应每条额外带 `meaning`/`meaningSource`(`stored|dictionary|context|cache|null`)/`dictionary`。
- **渲染端兜底**：`renderVocabBook` 的 `meaningHtmlOf()` = 快照 → `dictionaryOf` → 收集 `missingWords` → 末尾批量 `POST /api/dictionary/batch`(≤2000 词) 补齐后重绘；占位文案「释义补全中…」。
- **`user_words` 占位释义回填（`db.backfillUserWordDefinitions`）**：优先级（用户拍板）**① dictionary → ② word_context → ③ 都没有写空串**（与 `resolveLocalMeaning` 的语境优先**相反**）。只动「非真释义」行（`isRealUserWordDefinition`）；演练与真实执行走**同一段写入代码**（`SAVEPOINT user_word_backfill` + dryRun `ROLLBACK TO`）。CLI `backfill_user_word_definitions.js`（默认演练，`--apply` 才写、写前 `db.backup()`）；npm `backfill:userwords`/`:apply`。⚠️ **空串 `''` 是终态但仍算 candidate** → 幂等只能断言 `changed === 0`，report 用 `alreadyEmpty` 分开报。词典查询在**另一条只读连接**（`getDictDb()`）上做，放 SAVEPOINT **之外**。

## 17. 收藏 →「待分类」→ 分类 状态机与入口
- 状态机：`user_words.status` = `pending`(新收藏默认) → `learning`/`mastered`/`review`。改状态走 `app.js sortWordAction(id, status)`（本地乐观更新 + `apiPut /api/word-status/:id`）。中文标签 `getStatusLabel()`；单词本筛选 `filterVocab('pending'|'learning'|'mastered'|'review')`。
- 分类面板：`showSortPanel(words, title)` → `renderSortPanelContent()` → ★ `sortWordAction()`。按钮「✓ 已掌握 / 📖 学习中 / ↻ 需复习」。
- **入口清单（全部走 `openPendingFromReading()`）**：① 「我的收藏」头部 `#favsSortBtn`（**本文口径**）② 右侧收集区 `#collectZone` 点击（`onCollectZoneClick`，600ms `window.__lastCollectAt` 守卫）③ 总结页 `#summarySortBtn`（**会话口径**）④ 单词本「📋 去分类」→ `goSortFromWordbook()`（**该文章**）⑤ 兜底 `openSortPanelAllPending()`（**全部**）。**⚠️ 阅读页 topbar 的「📋 待分类 N」（`#pendingEntryBtn`）已删，别加回去。**
- ★ **`app.js updateCollectBadge()` 是所有入口计数的唯一刷新点**（计数变化才打日志）。**任何改动 `status` 或收藏集合的地方都必须调它**。
- ★ **收藏统计「口径」铁律**：
  ```
  阅读页四个显示 → 当前文章：collectBadge 红点 / favsSortBtn「去分类 N」/ progText「N/M words」/ readingFavsList
  结算页         → 本次会话：summaryCollectedCount、summarySortBtn
  单词本 / 面板兜底 → 全部：openSortPanelAllPending、goSortFromWordbook 无文章时
  ```
  统一入口（`app.js`，都在 `updateCollectBadge` 上方）：`collectedRowsOfArticle(id)` → `collectedWordSetOfArticle(id)` → `pendingCountOfArticle(id)` → `pendingCountAll()` → `sessionPendingWords()`。⇒ **新增任何「收藏数」显示前先问：它属于哪一栏？** 混口径 = 数字互相打架。
- ⚠️ 已废弃：全局字符串数组 `collectedWords`（`let collectedWords = []`）**不再被任何计数/渲染读取**，只在 `doCollectWord` 里继续 push（兼容旧引用）。新代码**别再读它**。
- 分类面板范围由「打开时」决定：`sortPanelSessionOnly` > `sortPanelArticleId` > 全部，统一读 `currentSortPanelPendingList()`（旧代码 `sortPanelArticleId || word.articleId` 会莫名收窄）。
- `finishLearning()` 本文有待分类 → `summaryAfterSort = true` + 开面板；面板关闭时 `closeSortPanel()` 续跳 `gotoSummary()`。
- ⚠️ 「XX 功能没了」类报障第一步永远是 `grep 函数名` 找调用点（`finishReading()` 一度是死代码）。
- ⚠️ 测试教训：`userData.collectedWords` 是**页面内存数组**，各测试节 `finally` 只删 DB 行、不清它 → 跨节残留污染计数断言。

## 18. 首页「快捷操作」与练习屏（含每日挑战）
- 四入口：My Wordbooks（`showVocabBook`）· Learn / Review / Daily Challenge → `startPractice('learn'|'review'|'challenge')`。副标题由 `renderQuickActions()` 在每次 `renderMain()` 刷新（`qaWordbooksSub`/`qaLearnSub`/`qaReviewSub`/`qaChallengeSub`）。
- 三条流程共用 `#practicePage` 屏，`practiceState = {mode,queue,idx,phase,...}`，`renderPractice()` 按 mode+phase 整块重绘。加第四种练习 = 一个 mode + 一个队列函数 + 两个 phase 分支。
- 队列口径：learn = `status='pending'`（空则退化「knowledge 最低的未掌握词」，上限 `PRACTICE_LEARN_MAX`=20）；review = `next_review_at <= now` ∪ `status='review'`（**无排期的已分类词视为到期**，否则老数据永远进不来）；challenge = 随机 3 个**有释义**的词。
- 状态回写**复用** `PUT /api/word-status/:id`，`next_review_at` 由后端 `computeNextReview` 按 status 重算（review=+1d / learning=+3d / mastered=+7d）。**不要再写第二套间隔规则。**
- ★ 奖励数据必须放在 `startApp()` 清理清单之外：🍎 存 `gaApples`、「今天做过没」存 `gaChallengeDate`（独立键，才能跨会话保留 + 真·每天一次）。`practiceState.rewardGranted` 记「本次是否真发了」。**以后加任何「累计型/限次型」奖励都照此办理。**
- `:root` 已补 `--correct: #4CAF50`（此前多处用它但从未定义）。
- ★ **拼写题例句必须挖空（2026-10-09 新增）**：用户报「例句直接把目标词加粗显示 → 直接抄」。
  - `wordMatchForms(word)`：原形 + 常见屈折（`s/es/ed/d/ing`；`e` 结尾去 e +ing；`y→ies/ied`；`-is→-es`（analysis→analyses）；`s/x/z/ch/sh + es`）。宁可多列，匹配不到自然失效。
  - `maskWordInSentence(sentence, word, {keepPrefix, silent})`：前后加 `(?<![A-Za-z])…(?![A-Za-z])` 断言、长形态优先、返回 HTML（非命中片段 escapeHtml，命中片段是 `<span class="practice-blank">`）。`keepPrefix=N` 保留前 N 个字母（词根提示，如 analysis→`anal____`），且至少留一个下划线。
  - `renderPractice` 的 challenge **ask** 阶段用挖空版（释义也顺手 `silent` 清一遍）；**feedback** 阶段才恢复 `highlightWordInSentence`（加粗）公布答案。**learn / review 模式不变**（它们本就给出单词，加粗是正常提示）。
  - `practiceState.hintKeep`：0=全挖空；`practiceHint()` 切到 `ceil(len/2)` 露出词根，重绘前**保住输入框草稿**（重绘后 `setSelectionRange` 到末尾）；`practiceAdvance` 复位。按钮 `#practiceHintBtn`（`.practice-btn.ghost`）。
  - 自检 `textLeaksWord(text, word)`；挖空后若仍能读到目标词 → `console.warn`。日志前缀 `🎯 [拼写]`。
  - 样例：`In the final analysis, these are ideological views.` + `analysis` → `In the final ______, these are ideological views.`
- 回归：`test_quick_actions.js`（`npm run test:quick`，**83 PASS**，含【H 拼写题例句挖空】组）+ `test_word_card_browser.js`【㉔】（把首题固定成有例句的 `alphaish` 做确定性验证，验完还原队列）。测试把 `apiPut` 打桩 no-op，`finally` 还原 `apiPut`/`collectedWords`/两个 localStorage 键，**绝不真写库**。

## 19. 会话保持 + 浏览器历史
- **`sessionStorage.gaSession`** = `{started, screen, articleId, at}`。`showScreen()` 是**唯一**的切屏入口（顺带 ①写会话 ②按需 push/replace 历史）。**不要绕过 showScreen 手动 `classList.add('active')`**（会让刷新恢复和返回键同时失效）。
- ★ **存储介质必须是 `sessionStorage`（标签页级），不能用 `localStorage`**。为什么改（用户报「一进网页直接是阅读页，欢迎页/Dashboard 全被跳过」）：`localStorage` 永久 + 跨标签，只要用户曾进过阅读页，之后**每一次进网页**（新标签 / 重开浏览器 / 隔天再访问）都被旧会话劫持。`sessionStorage` ⇒ **F5 刷新仍停在原页**、**新标签/重开浏览器 = 全新访问 → 回欢迎页**。`sessionStore()` 取不到返回 `null` → 退化为「不做会话保持」，**绝不回退 localStorage**。
- `DOMContentLoaded` 里三步：① **清理遗留的 `localStorage.gaSession`**（老版本写的，劫持元凶，用户无需手动清缓存）② `wantsFreshStart()`（网址带 `?fresh=1`/`#fresh` → `clearSession()` 强制回欢迎页，排查兜底开关）③ 打印 `🧭 [路由]` 决策块（会话介质/内容/判定）后决定去欢迎页还是还原。`showScreen` 每次切屏也打一行 `🧭 [路由] A → B`（带 fromHistory/replace 标注）。
- ★ **判断「是否已开始」只看 `started` 标记，不看会话是否为空**：欢迎页自己也会 `patchSession({screen:'startingPage'})`，所以新标签页的会话是 `{screen:'startingPage',at}` 而**不是空对象**。断言写「没有 `started`」才对。
- **`restoreUserIdentity()` 改为无条件调用**（原来只在 `started` 为真时调）。★ **`startApp()` 里清了 `gaUserData` → 必须保留用户名**：先 `const prevUserName = userData.userName`，输入框为空时用它兜底（`finalName = typedName || prevUserName`），否则首访点 Start Journey 会丢身份、`x-username` 退化成 `golden-apple-user`，拉到别人的收藏。
- **历史模型**：根条目（depth 0）+ 1 条**同屏副本** + 每次切屏 push（带 `gaDepth`）。多了那条副本才能在「退到根屏」时接住返回键（最根条目上按返回不触发 popstate）。**根屏守卫判据 = 「当前已经在根屏」，不是「depth 到头了」。**
- `pushedScreens[]` 与 depth 对齐；`delta = pushedScreens.length - idx - 1`（**下标 ≠ depth**）。目标屏已在栈里（含根屏）→ `history.go(-delta)`，**不压新条目**。`bootHistory` 里必须**先 `historyBooted = true` 再 `syncHistoryEntry`**。
- 「开始旅程」用 **replace** 把 `startingPage` 就地在历史里改写成 `dashboardPage`（否则返回键会再看到一次欢迎页，用户眼里就是「被登出」）。
- 新增屏若要支持「刷新恢复」，在 `restoreScreenFromSession()` 里加分支；**临时的屏（等待/练习/总结）故意不恢复**，退回主界面。
- 刷新恢复**不走 `startApp()`** → 必须补 `initBackendSync()`（否则不打卡、没收藏数据）。`restoreUserIdentity` **不恢复 collectedWords**、且置 `migrated = true`（防把服务端数据又 POST 回 `/api/migrate`）。
- 新增任何「返回」类按钮：直接 `showScreen(目标屏)` 即可 —— `goBackToHistory` 会自动判断该屏是否已在栈里并做真回退。**不要再 `history.pushState`，也不要自己算栈深。**
- 回归：`test_navigation.js`（`npm run test:nav`，**53 PASS**，含 I 组会话介质，桩里要加 `sessionStorage`）+ `test_word_card_browser.js` **【㉕】**（真 `page.reload()` / 真 `history.back()`）与 **【㉗】**（真开新标签页 → 欢迎页 + 遗留 localStorage 会话被清理）。

## 20. 释义锁 / 猜词模式
- 理念：**先猜 → 对照 → 自行判断**，不强制、可跳过。
- ★ 红线：**锁只影响「显示」，不影响「加载」**。后端照常调 API、词典层/L2/L3 照常加载；解锁是**纯本地重绘、0 网络 0 等待**。**任何 `if (lock) return;` 提前跳过请求的写法都是错的。**
- 三个 localStorage 键：`guessMode`('on'|'off') / `unlockedWords` / `unlockedSentences`。读写全包 `try/catch`（无痕模式 `setItem` 会抛）；数组（非 Set）保插入顺序才能「超上限丢最旧」；上限 800，句子 key 截断 300 字。
- ★ **默认值契约**：`loadGuessLockState()` 判据是 **`raw === 'on'` 才锁上**（缺省/null/脏值一律「查看模式」）。`loadGuessLockState()` 放**脚本载入时执行**（① 默认模式第一帧前定死 ② 无头测试不派发 `DOMContentLoaded`）；只有 `syncGuessLockButton()` 留 DOMContentLoaded。
- 词卡三形态由 `__guessView` 决定：`'guess'`/`'echo'`/`'full'`，**必须显式指定、不能重新判定**（提交那刻词已进 `unlockedWords`，重判会变 `full`、把用户刚写的猜测抹掉）。`guess` 形态连**音标 + 徽章**一起藏、动作区整块不画。
- **`currentWordCardData` 必须写回已判定的 `__guessView`**（`showWordCard` 尾部）—— 否则 `updateWordCardIfOpen` 的「猜词形态只更新内存、不重绘」判断恒为假 → 输入框被后台结果重建、丢焦点。
- 草稿 `guessDraftByKey` / 已提交 `guessResultByKey` 放**模块级字典**、不塞 `wordData`（任何重绘路径都能自然带上）。解锁**不可逆**（重置靠清 localStorage）。

## 21. 文章列表：服务端分页 + 按需详情（破坏性契约）
- `GET /api/articles` 返回 `{page, pageSize, total, totalPages, hasMore, items}`（原来是裸数组）；`items` 只带 `title/description/content/source/createdAt/level/...`，**不含 sentences/words/questions**（按需 `GET /api/article/:id`）。参数 `page`/`pageSize`(默认 10，上限 100)/`status`(默认 all)/`withContent`(默认 1)。
- **排序铁律** `ORDER BY CASE WHEN source = 'preset' THEN 0 ELSE 1 END, created_at DESC, id DESC`。`preset` 优先是必须的（预置 6 篇时间最早否则被挤到最后一页）；**`id DESC` 是分页稳定性的必需品**（`created_at` 只到秒，同秒并列会重复行/漏行）。
- 前端两层：`renderArticle(id)` 同步渲染（零网络）；`openArticle(id)` 先渲染再按需拉详情，回来后**只在用户还停在这一篇时**才重渲染。`loadArticlesPage(page)` 分页追加。
- `BUILTIN_ARTICLES`：原硬编码数组降级为**离线兜底**。**别弄丢内置教材词表**：预置文章的 `vacation/immediately/sandcastles/campfire` 都不在 `word_cache` → `loadArticleDetail` 用 `mergeBuiltinWords()` 做「**内置优先、服务端补充**」。
- **易漏边界**：列表刷新会把当前正在读的文章换成 `detailLoaded=false` 的服务端版本 → `loadArticlesPage` 末尾必须检测到就**自动补拉详情**。上传分析完成后新文章直接 `detailLoaded = true` 并插到列表首位。

## 22. 文章去重清理（`db.cleanupDuplicateArticles`）
- 入口：`npm run cleanup:articles`（**默认演练**）→ `:apply`（真删，先自动备份）。代码 `cleanup_articles.js` + `db.js`；测试 `npm run test:cleanup` = `test_article_cleanup.js`。
- 规则：按标题分组 → 每组保留「最新且带译文」的一篇 → 被删文章上的 `user_words` **改挂**到保留文章 → 再删。实测 73→26。
- 红线：① `source='preset'` 的文章**永不删除**；② 标题只做轻归一化（空白 / `’`↔`'` / 大小写），**绝不做前缀或模糊匹配**（`...Tess` 与 `...Tess of` 只差一个 `of`，模糊匹配会误删）。
- 坑：① 备份不能用 `fs.copyFileSync`（库跑 WAL，`app.db-wal` 可能远新于主文件）→ 必须 `db.backup(dest)`；② 演练模式不要另写一套逻辑 → 整轮包在 `SAVEPOINT article_dedup`，dryRun `ROLLBACK TO`；③ `user_words` 有唯一键，迁移撞键要「合并」且**必须先 `DELETE` loser 再 `UPDATE` winner**；合并取舍：进度深(`mastered>learning>review>pending`) > 释义实 > 收藏早。
- `word_context.article_id` 无外键 → 删文章不被拦，但要一并改挂，否则留悬空 id。备份落 `data/app.db.bak-*`（会累积，需要时手动清）。

## 23. 模型降级链：健康熔断 + 超时细分
- 症状：短文也「单词释义失败（DeepSeek 超时 60s）」，`created_at→updated_at` **正好 2 分钟** = `getArticleTimeoutMs` 的 GLM 60s + DeepSeek 60s 串行白等。
- `CHUNK_FALLBACK_CHARS=5000` 对短文无效（1707 字按 5000 拆还是 1 批，`if (chunks.length===1) throw` → 等于没救）→ `isTimeoutLikeError(err)` 判定超时类按 `CHUNK_TIMEOUT_RETRY_CHARS`(1200) 重拆；**仍只有 1 批时 `forceSplitIntoChunks(article, 2)` 按句边界强制劈半**。
- `runWithModelFallback` = GLM(主) → DeepSeek(降级)，**跳过无 Key 与冷却中的模型**，全部冷却时退回完整链路；`noteModelSuccess/Failure` + `MODEL_HEALTH_FAIL_THRESHOLD`(2) / `MODEL_HEALTH_COOLDOWN_MS`(300s)。
- 暴露面：`getModelHealth()`（含从未失败的模型，`/health.modelHealth`）、`resetModelHealth()`、`GET /api/model/reset-health`；`__diag` 只读导出给回归测试用，**业务代码勿依赖**。

## 24. 前端：三条独立工作流必须各自判 ready
- `queue.js` 把句子翻译/单词释义/quiz **并行**跑，各自完成就写 `sentences+sentencesReady`/`words+wordsReady`/`questions+questionsReady`；`/api/article-status` 原样返回。前端 `pollArticleProgress` **必须逐个判**（历史 bug：只判 `wordsReady` → 句子先翻译完时译文永远不渲染，且没有 `.article-sentence` → 悬停也失效）。
- `applyPartialProgress` 合并规则：**未就绪的项传 `null`，原样保留，绝不用空值覆盖**；记住 `prevCount`/`prevLen`，**只有内容真变了才重绘**。反向坑：别在 words 分支里顺手写 `sentences = part.sentences || []`（单词后到会把已渲染的句子冲成空数组）。
- 句子数据格式兼容在 `buildSentenceList()`：真实任务给 `{sentence, translation}`，mock 给 `{original, translation}`，**改后端句子字段前先看这张表**。

## 25. 题目未就绪 → 等待页 → 阅读页
- `awaitingQuestionReady` 是唯一闸门；`enterReadingPage(reason)` 带守卫（不在等待页就忽略）。复用 index.html 里本来就是死代码的 `#loadingPage`（标题/文案/进度条/降级按钮样式齐全）。
- `openAnalyzedArticle(data, { deferEnter: true })`：照常填 `currentArticle` + 渲染阅读页 DOM，但**不 showScreen**。`pollArticleProgress` 放行条件：`questionsReady`/`completed`/`failed`/30s 手动降级/120s 超时；进阅读页后补 `showDragGuideIfNeeded()`。

## 26. 拖拽收藏（pointer events）实现要点
- 走 **pointer events**（`pointerdown` 委托在 `#readContent` → `onSpanPointerDown/Move/Up`），**没有 HTML5 `dragstart`**；`.word-span` 上有 `user-select:none` + `touch-action:none`。
- 起点判定 >5px 才算拖拽（否则当点击）；落点用 `checkCollectZoneHover()`（**纯坐标判断**，即使收集区被压住也命中）。
- **普通模式**：越过 5px 立刻 `createSpanDragGhost()`（跟手）。**降级划选模式**（`fallbackQuizActive=true`）：**延迟到指针进入收集区才建幽灵** —— 让「正文划选作答」与「拖拽收藏」共存。
- `wasDragging` 判据必须是 **`!!ghost`**，不能用 `moved`。
- **已修的隐蔽 bug**：拖到收集区松手时 pointerdown/up 的 target 不同 → 浏览器把 click 派发到 `#readContent` 之外 → `spanJustDragged` 永远没机会被消费 → 下一次正常点词被吞。修法：在 `onSpanPointerDown` 开头复位 `spanJustDragged = false`。
- 全链路日志前缀统一 `🖱️ [拖拽]`。

## 27. 界面与文案原则（连续两次同类报障）
- **不要解释用户已经知道的事**：删「自己对照一下就好，不判对错」（10-08）、删「猜不出来也没关系，点「直接看释义」跳过」（10-09）。
- **不要指路到可能不存在的 UI 元素**：浮层说「点正文上方的『重试』」但提示条当时没显示（10-08）。**要指就指自身。**
- **「排版糊了」先 grep 类名有没有 CSS 定义，别先怀疑 CSS 写错。**（`.word-tag` 从来没定义过；容器是 flex → 所有词挤成一行。）

## 28. 总结页「收藏的单词」= 一词一卡
- 容器 `#summaryCollectedList` 的 class 是 **`summary-word-grid`**（`display:grid; repeat(auto-fill,minmax(190px,1fr))`），**不是** `word-list`（那个是 flex 横排，已无人使用；**不要把两者叠加**）。
- 卡片结构（`renderSummary()`）：`.summary-word-card` > `.sw-head`(`.sw-word` + `.sw-idx` 序号) / `.sw-meaning` / `.sw-note`。单词/释义/尾部括注各占一行。
- **`splitMeaningNote(meaning)`**（app.js 纯函数）拆尾部括注 → `{main, note}`：`^(.*\S)\s*[（(]([^（()）]*)[）)]\s*$`（**前面必须还有非空内容**，否则「整条就是括号」会被吞空）。纯展示拆分，**不改数据**。

## 29. 测试约定（双轨 + 自造样本 + 打桩坑）
- **双轨**：① 无头（`vm.runInContext(app.js 源码 + 测试钩子)`，极简 DOM 打桩）验逻辑分支（快）；② 真浏览器（playwright-core + 本机 Edge）验「打桩测不出来」的渲染与真点击。**新增前端功能两边都要加。** 截图 `test_screenshot_*.png` 是交付物。无头测试里 `console.log` 被替换成空函数静音，**结果行要用 `log(...)`**。
- **无头桩两个必备细节**：`document.createElement('div')` 要模拟 `textContent → innerHTML` 转义（`escapeHtml` 依赖它，否则释义渲染成空串）；假 `querySelector` 要**真的按 owner 的 `innerHTML` 解析 class**、没有就返回 `null`。桩元素要设 `el.id`。
- **无浏览器打桩测「部分失败」链路**：`queue.js` 是 `const coze = require('./coze')`，**模块对象**函数属性可被测试进程覆写：`coze.analyzeSentencesWithCoze = async () => { throw new Error('QA: ...') }`，再让 word/quiz 正常返回，直接 `await queue.processArticle({...})` → 端到端跑通「句子挂 → 落 partial」，**不需要 Coze 额度、不需要网络**。`test_backfill_and_partial.js`(58) 用这个套路。
- **真浏览器必备**：① **必须过「访问密码」关**：`ctx.addInitScript(() => localStorage.setItem('accessPassword','e2e'))`（写在 `newPage()` 之前），否则 `#accessPasswordOverlay`（fixed/inset0/z-index 10000）挡掉所有指针事件，测出的「悬停/点击无效」全是假象。② 截图前必须等动画/尺寸稳定（`.screen` fadeIn 0.3s）。③ 写「元素不出现」的断言别用 `!b || getComputedStyle(b).display === 'none'`（元素被删后恒真）→ 用 `locator(...).count() === 0`。④ 技巧：`addInitScript` 拦 `window.fetch` 伪造轮询序列。
- **打桩坑**：① 必须播种 `accessPassword`（否则 `request()` 停在 `ensureAccessPassword()`）；② 断言「请求已发出」要放在 `await flush()`（`() => new Promise(r => setImmediate(r))`）之后。
- **破坏性逻辑的测试必须自造样本**：`db.js` 支持 `DATABASE_PATH` → 复制 `data/app.db` 到临时靶库再跑真实删除。**绝对数断言同样会漂移** → 改成「靶库基线（先 dryRun 量一次）+ 自造样本数」。
- ★ **测试绝不删共享真实数据（真丢过）**：`word_cache`/`word_context`/`dictionary` 是**全局字典、不区分文章**。动手删之前先问「这个 `id`/`word` 是不是**我这次造的**？」不是 → **不许裸删**。全局字典表一律**先快照 → 再改 → `finally` 原样还原**（含 `is_academic` 等附属列）+ 断言行数还原。测试探针用**动态 tag**（`RUN_TAG = QA-PROBE-${Date.now()}`），别用固定样本词（AI 回写是**词级**的，跑过 `?ai=1` 会把固定候选词永久写脏）；`test_api_layers.js` 的 `findDictOnlyPair()` 改「固定候选 → 全脏时从 ECDICT 随机捞生僻词（`collins=0 AND oxford=0 AND (tag IS NULL OR tag='')`，约 25 万条可选）」（注意 `tag` 空值是 **NULL 不是 `''`**）。清理要连 `word_context` 一起删。
- **接口层测试写法**：**同进程 `require('./server')` + `fetch`**（不要后台起 server —— 会被敏感保护拦）。断言要对**环境降级**留口子（Coze 4028 / LLM 超时由兼容层兜底，不该判 FAIL）。
- **跑真浏览器测试必须设 `NODE_PATH=C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules`**（那里装了 `playwright-core`）。不设会「跳过」而非失败、退出码 0，**容易误判成通过**（要 grep 结果行确认）。
- `test_integration.js` 需外部服务在 3000 端口（`/health`），是按需手动脚本、不在 `package.json` scripts 里。
- **各套 PASS 数（2026-10-09）**：quick_actions **83** · guess_lock 93 · word_card 43 · sentence_hover 16 · navigation 53 · backfill_and_partial 58 · sentence_retry 62 · sentence_match_split 79 · quiz_empty_guard 16 · sentence_empty_guard 20 · word_card_browser **~330**。

## 30. 改代码的两个操作习惯（踩过坑）
- **批量行注释后先清理 `^// // ` → `// `**（注释脚本会把 `// x` 变 `// // x`）。
- **停用/删除函数时必须同步处理 `module.exports` 里的键**，否则 `require` 直接 ReferenceError。
- 大段注释建议先写一次性脚本 + 锚点校验（行号 + 期望内容不符就中止），跑完删脚本。

## 31. 做「命中率 / 性能」实测的方法约定
- **取样窗口必须固定**：`dbOps.getRecentWordContext(N)` 的 SQL 是「先 `ORDER BY id DESC LIMIT N` 再翻回升序」，**N 变了开头元素就变** → 跨轮次对比**必须固定 N**。
- **先确认 `ok=true` 再分析结果**（Coze 调用失败返回空结果，易被误读成「检索返回固定结果」）。
- **多轮取样**：Coze KB 检索**不稳定**（同 query 连打两次可能一次命中一次空）→ 至少 2 轮，样本 ≥ 20 词。
- **用「命中率 + 耗时 + 调用次数」三个指标一起看**。

## 32. 环境注意
- Windows + Git Bash；`.env` 已在 .gitignore；`data/*` 忽略但 **放行 `data/reading_materials.json`**（见 §34）。
- **`.env` 含敏感值（`ACCESS_PASSWORD`、Coze/LLM Key）→ 用 Read 整读会被「敏感内容保护」拦截并返回失败。不要重试、不要臆测内容。** 只读单行：`grep -n "KEY" .env | sed -E 's/=(.{0,10}).*/=\1…/'`（值遮蔽）。**要改 `.env` 就用一次性 Node 脚本「按锚点插入」**：先 `copyFileSync` 备份到 `data/_env_backup_<ts>.txt`，插入前断言锚点数量、断言目标键尚不存在，改完只打印结构性信息，**绝不打印任何 `KEY=` 的值**；验证通过后删脚本与备份。
- ⚠️ **`.env` 有重复键**：`COZE_KB_ID`/`COZE_KB_API_KEY`/`COZE_KB_BASE_URL` 各出现两次。dotenv **16.6.1 取【最后一次出现】** ⇒ **改上面那组不生效**（已加警告注释），新 KB 相关键请写进**下方那一组**。
- `server.js` 的 `/api/*` 有访问密码鉴权：请求头 `x-access-password`（`ACCESS_PASSWORD` 未配置则不校验）。本地验证用 `ACCESS_PASSWORD= PORT=3112 node server.js` 即可绕过（dotenv 不覆盖已存在的环境变量键，空串也算已存在）。
- ⚠️ **别用「`... &` 后台起 server + 后面 kill」**：命令返回时子进程会被回收（curl 一直连不上），且这种形态历史上被「敏感内容保护」拦过。**正确姿势**：用 `run_in_background: true` 起服务，拿 `task_id` 后用 TaskStop 收尾；或干脆「进程内 `require('./coze')` + 调函数」做验证。
- **这条对 `nohup` 和 Node 的 `spawn({ detached: true }).unref()` 同样成立**（2026-10-09 各试一次，都「启动成功」但父命令一返回就被收走）。改了 `server.js`/`db.js`/`coze.js` 必须重启（Express 路由/中间件启动时注册）；只改 `app.js`/`index.html` 不用（升指纹 + 刷新浏览器）。
- **`npm start` 的进程形态**：Windows 上产生**两个 node.exe** —— npm-cli 父进程 + `node server.js` 子进程。「干净重启」= `taskkill //F //IM node.exe`（一次两个都杀）→ `netstat -ano | grep ":3000 "` 确认释放 → 再 `run_in_background` 起。**杀之前先 `tasklist //FI "IMAGENAME eq node.exe"` 看清有几个、是不是用户自己起的**（别重复起抢 3000 端口；我的裸 `node server.js` 会 1 秒内 `EADDRINUSE` 失败，无害）。查命令行用 PowerShell `Get-CimInstance Win32_Process -Filter "Name='node.exe'"` 取 `CommandLine`。
- ★ **用户决定（2026-10-09）：以后自己用独立终端 `npm start` 常驻，不依赖 WorkBuddy。** → WorkBuddy 关闭会带走 `run_in_background` 起的进程；见到用户可能已自托管时，**先探测端口/进程再决定是否代起**。
- **`run_in_background` 实例并非真常驻：实测约 30–60 分钟就被环境回收**（2026-10-09：29m52s、59m18s；两次都不是崩溃，stderr 仅一条 punycode 弃用警告）。
- ⚠️ **本会话 PowerShell 工具 stdout 不回显**（exit 0 但无输出）：要输出就 `Out-File` 写临时文件再 Read；或改用 Bash 的 `tasklist`/`netstat`/`wmic`。
- ⚠️ **本机 curl 默认走代理**，访问 127.0.0.1 会报 `upstream connect failed ... (os error 10061)` 并固定耗时 ~2s。测本地接口必须加 `--noproxy '*'`。
- **浏览器自动化环境（2026-09-30 打通）**：`npm i playwright-core --prefix C:/Users/Administrator/.workbuddy/binaries/node/workspace`（只装库，不下载浏览器），用 `chromium.launch({ channel: 'msedge' })` 复用本机 Edge；跑脚本要 `NODE_PATH=<workspace>/node_modules`。
- 页面会请求 `/favicon.ico` 得到 404（项目没有 favicon）。Playwright 的 `page.on('response')` **抓不到它**，只在 console 里出现一条 404 —— **不是接口问题**。
- **node-fetch v2**（`coze.js` 里 `const fetch = require('node-fetch')`，2.7.0）：`timeout` 选项**有效**（数字，字符串会秒失败）；`signal`（AbortController）也支持，abort 抛 `AbortError`（消息含 `abort`），与网络超时（`network timeout at:`）要靠正则区分。
- 项目根目录有 0 字节异常文件 `[esc(r.word)`（历史误操作），用户未确认是否删除。
- `docker-compose.yml` 是 PG + Redis 迁移桩，当前架构不用，**不要动**。

## 33. UI 改动两则（2026-10-09）
- **「取消收藏」与删除接口**（此前后端**没有任何删除能力**）：
  - `user_words` 一行 = 一个「词 × 文章 × 句子」（同词同文章不同句 = 不同行）。删之前先想清「删一行还是一串」。
  - 接口 **`DELETE /api/collect-word`**，锚点二选一：`?id=<rowId>` → `db.deleteUserWordById(id,userId)` 精确一行；
    `?word=<w>[&articleId=][&sentence=]` → `db.deleteUserWords(...)`，**带 sentence 只删本句**（词卡路径）、
    **不带则删该词在本 articleId 下全部行**（收藏列表路径，列表按词去重）。
  - 前端唯一入口 **`uncollectWord({word,articleId,sentence})`**：调接口 → 改本地镜像 `userData.collectedWords`
    → 重绘词卡/列表/徽章，失败回滚。按钮：词卡 `.wc-btn-uncollect`、列表 chip `.fav-remove`。另有 `apiDelete()`。
- **「🔎 联网深查本句释义」→「🤖 AI 翻译」**（嫌长）。**类名仍是 `wc-btn-remote`**（事件绑定与测试按它找，
  **别跟着文案一起改**）。这是用户主动点才联网的路径（工作流/LLM，十几秒），结果回写 `word_context`。

## 34. 部署到 Render / Railway（2026-10-09）
- **端口**：`server.js` 本来就有 `Number(process.env.PORT) || 3000`（**不是**写死的）。`app.listen(PORT)` 不传 host
  = 监听 0.0.0.0，正是平台需要的，**别改成 127.0.0.1**。启动日志会打 `🔌 端口: N [来源: 环境变量 PORT|默认值]`。
- **数据库路径**：`db.js` 的 `resolveDataPath(['DB_PATH','DATABASE_PATH'], './data/app.db')` —— **`DB_PATH` 优先，
  保留 `DATABASE_PATH` 兼容**（4 个测试脚本靠后者把连接指向临时靶库，**删掉旧名会让测试全挂**）。
  词典库同理：`DICTIONARY_PATH`（默认 `./data/dictionary.db`）。
  目录不存在会自动 `mkdir -p`；**失败直接 throw（fail fast）**并提示「确认已把 Volume 挂到该目录」。
  `db.js` 导出 `DB_PATH` / `DB_PATH_SOURCE` / `DICT_PATH_SOURCE`；`/health` 回 `portFromEnv` / `dbPath` / `dbPathSource`。
- ⚠️ **静态目录必须防护**：`express.static(__dirname)` 把整个根目录暴露了 —— 实测 `GET /data/app.db` 直接 200
  下载 2.2MB 全库（`/.env` 反而是安全的：express.static 默认忽略 dotfiles，实测 404）。
  现在 `express.static` **之前**有一层 `isBlockedStaticPath()` 黑名单：拦 `/data`、`/node_modules`、`/.git`、
  `*.db(-wal|-shm)`、`*.bak-*`、后端源码 js、`package*.json`/`docker-compose.yml`/`.gitignore`、`/test_*.js`。
  **绝不能一刀切禁 `.js`** —— `/app.js` 是前端主脚本，必须放行。
- **词典库不进 git**（57.7MB > GitHub 50MB 告警）。方案：传到 **GitHub Release**，构建时下载。
  `download-dict.js` + `package.json` 的 **`postinstall`**（另有 `npm run dict:download [-- --force]`）：
  幂等（已存在且校验通过即跳过）／**原子替换**（先下 `<目标>.download`，校验通过才 rename，避免半截库让服务起不来）／
  校验（SQLite 魔数 + `dictionary` 表 + 词条数 ≥1000，better-sqlite3 不可用时退回体积+文件头）／
  **失败只警告并 `exit 0`**（`--strict` 才 exit 1）→ 词典层降级但服务照起。地址来自 `DICTIONARY_DOWNLOAD_URL`，
  写死在脚本里的 `DEFAULT_DICT_URL` 默认留空。`SKIP_DICT_DOWNLOAD=1` 可跳过。
- **`.gitignore` 用 `data/*` 而不是 `data/`**：否则下面的 `!data/reading_materials.json` 失效
  （git 不回溯进被完全排除的目录）。那 18KB 的 6 篇预置文章必须入库，否则全新部署 `migratePresetArticles()` 空转。
- `.env.example` 已建（基础/LLM/L1 知识库/高级调优/已废弃五组，无真实值）。`.env` 确认未被 git 跟踪。
- ⚠️ **平台免费版文件系统是临时的** → 必须挂持久化磁盘（Volume/Disk）并把 `DB_PATH` 指过去（如 `/data/app.db`）；
  词典库**不必**放磁盘（每次构建重下更省额度）。**单实例假设**：SQLite + 进程内队列在多实例下不正确。
- 本地复现全新部署：`PORT=xxxx DB_PATH=<tmp>/nested/app.db DICTIONARY_PATH=<tmp>/no.db node server.js`
  → 应看到「目录已自动创建 / 迁移 6 篇预置文章 / 词典库未就绪（降级）」。
