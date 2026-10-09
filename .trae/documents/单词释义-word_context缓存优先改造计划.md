# 单词释义流程优化计划（保守版）：只用「word_context 未命中的词」请求 AI

> 修订说明：上一版计划改动过大（把 AI 输入改成列表式、删掉 `buildWordContextFromSentenceIndex`、动 db.js、重写批处理函数），不符合「修改 coze.js、queue.js + 保留现有功能」。本版收敛为**最小改动**：不重写 AI 输入结构，只把「跳过哪些词」的依据从 `word_cache` 换成 `word_context`，并把单词任务改为等句子翻译完成后再执行。

## 1. 目标

1. 句子翻译 + 题目生成继续并行；单词释义**等句子翻译完成后**再执行（拿到语境 context）。
2. 以 **word + context** 为粒度查 `word_context`：命中的词直接作为「缓存释义」返回、且不传给 AI；未命中的才让 AI 生成释义。
3. 合并 `word_context 释义 + AI 释义` 返回给前端；缓存词先返回，AI 新词异步补充。
4. 「已有释义」的来源改为 **仅 word_context**（不再用 word_cache 判断跳过）。
5. 加日志：打印「缓存词数」「新词数」。
6. 保留现有 AI 整篇文本输入结构、`buildWordContextFromSentenceIndex`、word_meaning_generator 兜底等既有功能。

## 2. 现状分析（关键代码定位）

- 三任务并行：[queue.js](file:///c:/Users/Administrator/Desktop/初中背单词 - 部署/queue.js) `processArticle`：`sentencePromise / wordPromise / quizPromise` 三者 `Promise.allSettled` 并行（单词 L169-170）。
- 单词入口：[coze.js](file:///c:/Users/Administrator/Desktop/初中背单词 - 部署/coze.js) `analyzeWordsWithCoze(article, title, cachedWords, onProgress)`（L842）——目前 `cachedWords` 来自 word_cache，作为 AI 的「已有释义跳过列表」；AI 仍以整篇文本为输入，自拆句 + 摘词 + sentenceIndex。
  - 批处理：`callWordBatch`(L696) / `processWordBatches`(L721) / `runWordBatchesWithFallback`(L764)，`cachedWords` 一路透传给 `buildArticleUserPrompt`(L147) 作为跳过词列表。
  - 语境写入：`buildWordContextFromSentenceIndex`(L479) 用 `rawWordList.sentenceIndex` 关联句子任务 `sentenceList` 生成 `{word, context, definition}`。
- DB 侧：[db.js](file:///c:/Users/Administrator/Desktop/初中背单词 - 部署/db.js) `getWordContext(word, context)`(L386) 精确按 `word + context` 查非空释义（已有，可直接复用，无需改 db.js）。
- SSE 同步路径：[server.js](file:///c:/Users/Administrator/Desktop/初中背单词 - 部署/server.js) `/api/analyze`(L316) 调 `coze.analyzeArticleWithCoze(...)`（兼容函数 L881），其对外契约不变即可，server.js **无需改**。

## 3. 方案设计

### 3.1 流水线改序（仅 queue.js）

```
sentencePromise = analyzeSentencesWithCoze(content, title)          // 并行
quizPromise     = generateQuestionsWithCoze(content, title, 4)      // 并行
wordPromise     = sentencePromise.then(sRes =>
                     analyzeWordsWithCoze(content, title, (sRes && sRes.sentenceList) || [], onCached)
                 )                                                  // 单词等句子完成后再开始
await Promise.allSettled([sentencePromise, quizPromise, wordPromise])
```

- 三个 `.then/.catch` 落盘与 `recordFinish` 完成顺序日志沿用现有结构，仅 `wordPromise` 由「直接调用」改为「挂在 sentence 之后」。
- 句子失败 → `wordPromise` 随之 reject；记录日志「句子翻译失败，跳过单词释义」。

### 3.2 改写 `analyzeWordsWithCoze`（仅 coze.js）

新签名：

```js
async function analyzeWordsWithCoze(article, title, sentenceList, onCached)
```

内部步骤：

1. `allWords = extractWords(article)`（日志用总词数）。
2. `pairs = buildWordContextPairs(sentenceList)`（新增）：遍历句子，逐句 `extractWords(sentence)` 得 `{word, context: 该句原文, sentenceIndex}`，按 `word + context` 去重，word 小写。
3. 逐 pair 调 `dbOps.getWordContext(word, context)`（现有导出，无需改 db.js），切出：
   - `cachedPairs`（命中，definition 非空）
   - `newPairs`（未命中）
4. `cachedWordList = {词小写: 第一条释义}`（扁平，供前台快速展示）。
5. 打印：`缓存词数 = cachedPairs.length`、`新词数 = newPairs.length`、`总词数 = allWords.length`。
6. 调 `onCached(cachedWordList, cachedCount, newCount)`（可选），供 queue 先落缓存词。
7. 跳过列表改为 **cachedPairs 的 word 集合**（词级），作为 `cachedWords` 传给现有 `runWordBatchesWithFallback(...)` → AI 只对未命中词生成释义（AI 输出体量随之下降）。
8. AI 返回 → `rawWordList`（新词）→ `aiWordList = normalizeWordList(rawWordList)`。
9. `wordList = { ...cachedWordList, ...aiWordList }`（合并缓存 + AI）。
10. 返回 `{ wordList, rawWordList, cachedWordList, cachedCount, newCount }`（`rawWordList` 仍为「新词」，供 `buildWordContextFromSentenceIndex` 写入语境库，逻辑不变）。

> 无 API Key 时的兜底逻辑保持现状：返回 `{ wordList: cachedWordList, rawWordList: [] , ...}`，`newPairs` 交由 word_meaning_generator 补全链路兜底。

### 3.3 兼容路径 `analyzeArticleWithCoze`（仅 coze.js）

保持对外契约不变（入参 `(article, title, cachedWords, onProgress)`，出参含 `wordList / wordContextList / sentenceList / questions:[]`），内部改为：

1. `await analyzeSentencesWithCoze(...)` 先拿 `sentenceList`。
2. `await analyzeWordsWithCoze(article, title, sentenceList)` 拿 `wordList / rawWordList`。
3. 拼装旧结构返回；`cachedWords` 入参标记为**忽略**（已改用 word_context）。

### 3.4 落盘与显示（仅 queue.js）

- `onCached`：把 `cachedWordList` 写入 `task.words`、`wordsReady=true`，实现「缓存词先显示」。
- `wordPromise.then`：用返回的 `wordList`（已含缓存 + 新词）写 `task.words`、`wordsReady=true`，AI 完成后覆盖/补充。
- 持久化（沿用现有调用）：
  - `saveWordsToCache(wordList)`（合并后的完整词表；此写法保持「完成后按通用词库展示」一致，server.js completed 分支无需改）。
  - `buildWordContextFromSentenceIndex(rawWordList, sentenceList)` → `saveWordContextList(...)`（仅新词写语境库，逻辑不变）。
  - word_meaning_generator 空释义补全保留。
- 移除 queue.js word 路径对 `getWordMeaningFromCache / splitCachedUncached / cached / cacheMap` 的使用（不再用 word_cache 判断跳过）。

## 4. 涉及文件与改动清单

| 文件 | 改动 |
|------|------|
| [coze.js](file:///c:/Users/Administrator/Desktop/初中背单词 - 部署/coze.js) | 新增 `buildWordContextPairs`；改写 `analyzeWordsWithCoze`（改签名 + 内部查 word_context + 合并）；更新 `analyzeArticleWithCoze` 为句子→单词顺序。旧的批处理函数与单词 Prompt **保持不变**。 |
| [queue.js](file:///c:/Users/Administrator/Desktop/初中背单词 - 部署/queue.js) | `processArticle` 改序（句子+题目并行 → 单词等句子）；单词落盘用新返回结构；新增 `onCached` 缓存词先行落盘；`saveWordsToCache(wordList)` + `buildWordContextFromSentenceIndex(rawWordList, sentences)` 沿用；移除 word_cache 跳过判断。 |
| [db.js](file:///c:/Users/Administrator/Desktop/初中背单词 - 部署/db.js) | **无需改**（复用 `getWordContext` 逐词查询；若后续批量词量大可再加 `getWordContexts` 批量接口，非必需）。 |
| [server.js](file:///c:/Users/Administrator/Desktop/初中背单词 - 部署/server.js) | **无需改**（`analyzeArticleWithCoze` 契约不变）。 |

## 5. 可行性 & 取舍（需你知悉）

1. **word + context 精确匹配对「全新文章」收益有限**：`word_context` 是「词 + 该句原文」粒度，若文章句子与历史句子不同则几乎无命中，仍会把多数词（含 the/a/is 基础词）交给 AI。收益主要体现在**重复/相似句子、同一篇重试/恢复、已预热句式**。这符合你「仅 word_context」的选择；若想对全新文章也显著减量，需额外引入词级缓存（会回到 word_cache 语义）。
2. **总耗时略升**：单词由「与句子并行」改为「等句子」，端到端比全并行稍慢；用「缓存词先返回 + AI 补充」缓解体感。
3. **word_cache 仍写、但不再作为跳过依据**：`saveWordsToCache` 保留以维持前台通用展示；「是否跳过」只看 word_context。若要连 word_cache 写入也停，需另改 server.js completed 展示，请说明。

## 6. 假设与决策

- 匹配粒度 = **word + context（精确句子原文）**（按你的答复）。
- 「已有释义」来源 = **仅 word_context**（按你的答复）；word_cache 保留「写入/通用展示」。
- `sentenceList` 由句子翻译任务产出，作为单词 context 的唯一来源。
- AI 仍以整篇文本为输入、只用「默认跳过已有释义词」的既有机制削减输出，不新造列表式输入。

## 7. 验证步骤

1. `node --check` 校验 `coze.js / queue.js / server.js`。
2. 上传一篇与历史句子有重叠的文章：日志出现 `缓存词数 > 0`、`新词数` 明显小于总词数，AI 单词输出体量下降。
3. 上传一篇全新文章：确认句子+题目并行、单词在句子完成后执行、`onCached` 先落缓存词、AI 补充后 `words` 合并完整、`word_context` 正确写入新词语境。
4. 触发一次单词失败：确认前端仍能拿到「缓存词」与句子/题目，页面不卡。
5. 走 SSE `/api/analyze`：确认返回结构与改造前一致，前端不受影响。