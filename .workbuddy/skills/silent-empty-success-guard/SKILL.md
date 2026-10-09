---
name: silent-empty-success-guard
description: 排查并根治「日志说成功、界面却没数据」这类静默失败（LLM/工作流返回不可解析内容时被当成成功，落库成"看起来正常"的记录）。触发词：日志成功但界面没有、暂无翻译、暂无释义、静默降级、静默失败、解析失败被吞、空结果、sentenceList 为空、completed 但数据为空、LLM 返回非 JSON。
agent_created: true
---

# 「空成功」守卫：把静默失败变成可见失败

## 症状（用户原话长这样）

- 「日志显示 XX 成功，但界面显示『暂无』/没数据」
- 「同一个任务里别的产物都正常（题目、释义都在），只有这一项缺」
- 落库记录 `status='completed'`、对应的数据字段是空数组/null、错误字段也是 null

**关键判据**：坏数据只要满足「同一批任务里别的产物都正常、只有这一项缺」→ 这是**管线问题**，
不是历史遗留数据，下次还会复现。别用 `created_at` 早晚来下结论。

## 根因模式（一句话）

> 解析函数在失败分支 `return {字段: 默认值}` 而不是 `throw` —— **把失败伪装成成功**。

典型三层连坐：

```
callXxxBatch()           // JSON 解析失败 → console.warn 一句 → return { list: [] }   ← 病根
  → processXxxBatches()  // list 为空也照记「成功」，successCount++
                          // 日志：📦 第 1/1 批 | 条数: 0 | 成功
  → analyzeXxxWithCoze() // 日志：✅ 成功 | 条目: 0
  → queue 落库            // status='completed' + 数据=[] + 错误=NULL
```

常见触发：**模型答非所问**（返回解释性文字 / 额度不足的提示语）、**响应被截断**（JSON 不闭合）、
**200 但响应体是错误对象**（`choices` 缺失）。

## 本项目的两处实例（同一个模式）

| 层 | 病根 | 用户看到 |
|---|---|---|
| `coze.js callSentenceBatch` | 解析失败 `return { sentenceList: [] }` | 「日志说句子翻译成功，但浮层暂无翻译」 |
| `coze.js generateQuestionsWithCoze` | 解析失败 `data=null` → `rawQuestions=[]` → **`success:true` + 0 题** | 「题目生成返回 0 题 → 无可用题目，使用降级题目」 |

⚠️ 两个坑长得一模一样：**`JSON.parse` 失败后只 `console.warn` 一句就继续往下走**。
在 `coze.js` 里搜 `JSON.parse(extractJSON(` 就能一次找齐所有同类风险点。

## 连带损伤：一个静默空成功会毁掉一个**毫不相关**的功能

这是最容易被漏掉、也最值得先查的一环。实例（2026-10-08）：

```
quiz 解析失败 → 0 题（假装成功）
  → queue 落 generateFallbackQuestions 的降级题（带 isFallback:true / answerMode:'selection'）
  → 前端按题目标记进入「降级划选答题模式」→ fallbackQuizActive = true
  → app.js onSpanPointerDown 里写死 `if (fallbackQuizActive) return;`
  ⇒ 正文单词拖拽收藏**整个失效**。用户报的是「拖拽坏了」，根子在题目生成。
```

**教训**：用户报「A 功能坏了」时，先 grep A 的守卫/前置条件（本项目：
`grep -n "if (.*Active) return"`、`grep -n "return;.*//.*禁用"`），
**不要顺着用户给的方向查**——他说的 `dragstart` 根本没绑定（本项目用的是 pointer events），
顺着查只会白费时间。判断"是不是同一个根因"最快的方法：看那个 flag 由什么赋值。

## 排查步骤（顺序别换）

1. **假 LLM 复现，先拿到"这就是它"的铁证**（最省时的一步，几分钟）。
   起一个本地 `http` 服务当假 LLM，按开关返回不同响应体，然后调真实的那层函数：

   ```js
   const MODES = {
       valid:     () => JSON.stringify({ sentenceList: [{ sentence: 'x', translation: 'y' }] }),
       prose:     () => '抱歉，我无法处理这篇文本。',                      // 答非所问
       truncated: () => '{"sentenceList": [{"sentence": "x",',            // 截断
       noField:   () => JSON.stringify({ items: [] }),                    // 字段名不对
       emptyList: () => JSON.stringify({ sentenceList: [] })              // 合法 JSON 但空
   };
   // 必须在 require('./coze') 之前设好环境变量（dotenv 不覆盖已存在的值）
   process.env.ARTICLE_API_KEY='k'; process.env.ARTICLE_BASE_URL=fakeBase;
   process.env.ARTICLE_MODEL='glm-test';
   process.env.DEEPSEEK_API_KEY='k'; process.env.DEEPSEEK_BASE_URL=fakeBase;  // 降级也要能打中假服务
   process.env.MODEL_HEALTH_FAIL_THRESHOLD='9999';   // 关掉熔断，否则后续用例被"冷却"短路
   ```
   ⚠️ 若某条用例要断言**成功**，把它放在失败用例**之前**（熔断/降级状态会污染后续）。

2. **定位到具体是哪一层吞了错**：从落库那行往上读，找 `return {...默认值...}` 的分支。
   本项目实例：`coze.js` 的 `callSentenceBatch` 里 `catch (e) { console.warn(...) }` 之后
   `return { sentenceList: parsed ? parsed.sentenceList : [] }`。

3. **修两层，别只修一层**（缺一层早晚回归）：
   - **解析层（内）**：解析失败 / 缺字段 / 空列表 → `throw`，**带原始响应前 200 字**。
     抛出的错会走既有的「模型降级链」，这是设计意图（重试交给降级链，不是本地重试）。
   - **落库层（外）**：拿到结果后加断言 —— 「输入非空、输出却为空 → 判失败」，
     强制 `status='partial'` + 写错误原因，让前端有「重试」入口。

4. **加白名单，否则会误伤合法空结果**。实例：用户粘贴**纯中文**文章时，句子翻译返回空是合理的，
   不该把文章标成 partial。判据要精确：

   ```js
   function hasEnoughEnglish(text, min = 20) {          // 与调用方共用同一判据，避免两处口径漂移
       return ((String(text || '').match(/[A-Za-z]/g) || []).length) >= min;
   }
   ```
   并 `module.exports` 出去，让外层用**同一个**判据（本项目 queue.js 就是这么复用的）。

5. **错误文案要能自证**：把「哪一层失败 + 为什么 + 原始响应片段」写进 `Error.message`，
   它会一路落到 `sentences_error` / 前端提示里。日志里 `❌` 与 `✅` 必须严格对应真实结果 ——
   **"句数: 0 | 成功" 这种自相矛盾的日志本身就是 bug**，顺手改掉。

## 测试（两层各留一条永久回归）

`test_sentence_empty_guard.js`（句子翻译）与 `test_quiz_empty_guard.js`（题目）结构可直接照抄：

- **A 段（真模块 + 假 LLM）**：prose / truncated / noField / notObject / emptyList → 全部断言 `rejects`，
  且断言错误消息含可辨识关键词（`JSON 解析失败` / `缺少 sentenceList` / `不是 JSON 对象` / `空列表`）；
  再断言「纯中文 → 不抛错」和「正常 JSON → 成功」。
  ⚠️ 断言**成功**的用例要放在失败用例**之前**（熔断/降级状态会污染后续）。
  题目那条还要补：`questions: []`（空数组）与「有题目但题干全空」都必须抛错 ——
  `normalizeQuestions` 会保留题干为空的项，只看 `length` 会漏判。
- **B 段（打桩 coze + 真 queue + 真 db）**：直接 `coze.analyzeSentencesWithCoze = () => Promise.resolve({sentenceList: []})`
  模拟旧行为，断言文章落 **`partial`**（绝不能 `completed`）、`sentences_error` 非空、
  **其它产物（questions）照常落库**；再补一条「正常 3 句 → completed」防守卫误伤。
  题目那条反过来断言：quiz 抛错时**仍要落降级题**，并且日志里必须出现「无可用题目」+ 真实原因
  + 「会禁用正文拖拽收藏」这条因果（用 `console.warn` 劫持捕获，**下次一眼定位**）。
- 造的文章 id 形如 `qa_*`，`finally` 里**同时删 `articles` / `word_context` / `user_words`** ——
  队列会写 `word_context`（带 `article_id`），只删 articles 会留悬空行，
  被 `test_article_cleanup.js` 的「无悬空 article_id」断言抓住报红（本轮真踩了）。
- 前端连带损伤（拖拽）另在 `test_word_card_browser.js` 的**【⑰】**段做真浏览器回归：
  自造一篇带降级题的文章 → 断言 `fallbackQuizActive===true` → 真鼠标拖拽 → 断言落库，
  再断言「拖拽之后普通点词仍能弹卡」（防 `spanJustDragged` 泄漏）。

## 善后：已受影响的文章

漏洞修好后，**坏数据不会自愈**。写一个默认干跑、`--yes` 才真跑的补数脚本：
筛选条件 `数据为空 AND 非预置 AND 内容含英文 AND status<>'failed'`，
打印清单 + 原失败原因，`--yes` 时用队列现成的 `retrySentences(id)` 逐篇补。
真实例：`repair_missing_sentences.js`。
⚠️ 每篇都真调一次工作流会消耗额度 —— **默认必须干跑**，并在输出里明确提示。
