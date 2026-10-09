# 金苹果之旅：Coze 工作流迁移到 DeepSeek API 改造方案

## 1. 摘要

将 `coze.js` 内 3 个 AI 调用函数从 Coze 工作流（`POST /v1/workflow/run`）改为直接调用 DeepSeek Chat Completions（`POST https://api.deepseek.com/v1/chat/completions`，模型 `deepseek-flash`）。

- 只改两个文件：`coze.js`（核心改造）和 `.env`（修正密钥变量名拼写）。
- `server.js`、`queue.js`、`app.js` 一律不改。
- 3 个函数的外部签名、返回结构、错误语义完全保持，`server.js`/`queue.js` 的调用方无需任何改动。
- 用 `node-fetch`（项目已装 `v2.7.0`）发起请求，保留错误处理、超时；**新增调用层内部重试**（指数退避），并保留队列层重试，补日志。

## 2. 现状分析

- [coze.js](file:///c:/Users/Administrator/Desktop/初中背单词 - 部署/coze.js) 当前流程：把整篇文章整体发给 Coze 工作流，工作流内部完成「拆句→翻译→提词→出题」，`coze.js` 用 `parseAIResponse()` 把返回的 JSON 字符串解析成 `server.js`/`queue.js` 需要的结构（`{title, description, level, levelLabel, article, wordList, wordContextList, sentenceList, questions}`）。
- 迁移后，Coze 工作流的「拆句/翻译/提词」逻辑需要由 `coze.js` 自己实现（本地拆句 + 分批调用 DeepSeek），这正是本次改造的主要工作量。
- 关键发现：`parseAIResponse()` 已支持「`wordList` 为数组（元素含 `sentenceIndex`）+ `sentenceList` 数组」的新结构（[coze.js](file:///c:/Users/Administrator/Desktop/初中背单词 - 部署/coze.js) 第 531-543 行），会自动走 `normalizeWordList()` + `buildWordContextFromSentenceIndex()`。因此新逻辑可以直接复用，无需重写解析层。
- 3 个函数的调用方契约（不能破坏）：
  - `analyzeArticleWithCoze(article, title, cachedWords, onProgress)` → 返回 `parseAIResponse` 的结果，`server.js`/`queue.js` 读取 `wordList`(扁平对象)、`sentenceList`、`wordContextList`、`questions`、`title/description/level/levelLabel/article`。
  - `generateQuestionsWithCoze(content, title, questionCount)` → 返回 `{ questions, total_questions, success }`。
  - `generateWordMeaningsWithCoze(wordList, contextList)` → 返回 `[{word, context, definition, isAcademic}]`。
- `.env` 第 39 行当前为 `DEEPSEEK_API_kEY = sk-…`（变量名大小写拼错 + 等号两侧有空格），导致 `process.env.DEEPSEEK_API_KEY` 读不到，需修正。

## 3. 改造方案

### 3.1 `.env`（第 39 行）

把

```
DEEPSEEK_API_kEY = sk-27fd59dd0fae4a0bae6be5b32ce0af69
```

改为

```
DEEPSEEK_API_KEY=sk-27fd59dd0fae4a0bae6be5b32ce0af69
```

（去掉空格，`kEY` → `KEY`。）

### 3.2 `coze.js` 配置区（第 8-19 行）

- 删除或不再使用 `COZE_API_TOKEN / COZE_BOT_ID / COZE_WORKFLOW_ID / COZE_QUIZ_WORKFLOW_ID / COZE_WORD_WORKFLOW_ID / COZE_USER_ID` 这些 Coze 环境变量常量。
- 新增：

```js
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_MODEL = 'deepseek-flash';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
```

- 保留 `isCozeConfigured()` 与 `config` 的导出**名字**（`server.js` 的 `/health` 与启动日志读取它们，不能改名），仅改语义：
  - `isCozeConfigured()`：改为 `return !!DEEPSEEK_API_KEY;`
  - `config`：改为 `{ COZE_BOT_ID: DEEPSEEK_MODEL, COZE_API_URL: DEEPSEEK_API_URL, DEEPSEEK_MODEL, DEEPSEEK_API_URL }`（`COZE_BOT_ID` 字段保留仅为兼容 `server.js` 的 `coze.config.COZE_BOT_ID` 读取，值填模型名用于展示）。

### 3.3 新增通用调用工具（`coze.js` 内部）

新增两个辅助函数（不导出，避免影响 `server.js`）：

```js
const fetch = require('node-fetch'); // 顶部声明一次即可

// 判断错误是否可重试：5xx / 429 / 网络&超时（无 status）可重试；其余 4xx（鉴权/参数）立即失败
function isRetryableDeepSeekError(err) {
    if (!err) return false;
    const msg = String(err.message || err);
    if (/返回\s*429/.test(msg)) return true;      // 限流
    if (/返回\s*5\d\d/.test(msg)) return true;    // 服务端错误
    if (/返回\s*4\d\d/.test(msg)) return false;   // 客户端错误（401/400…）不重试
    return true;                                   // 无 status 的网络错误 / 超时默认可重试
}

// 统一调用 DeepSeek chat/completions：超时 + 指数退避重试 + 错误日志 + 异常抛出
async function callDeepSeek(messages, { timeoutMs = 600000, tag = '', maxRetries = 3 } = {}) {
    let lastErr = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const startAt = Date.now();
        try {
            const response = await fetch(DEEPSEEK_API_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ model: DEEPSEEK_MODEL, messages }),
                timeout: timeoutMs
            });
            const elapsed = Date.now() - startAt;
            if (!response.ok) {
                const errText = await response.text();
                const err = new Error(`[${tag}] DeepSeek API 返回 ${response.status}: ${errText.substring(0, 300)}`);
                if (attempt + 1 < maxRetries && isRetryableDeepSeekError(err)) {
                    lastErr = err;
                    const backoff = 1000 * Math.pow(2, attempt); // 1s → 2s → 4s
                    console.warn(`⏳ [${tag}] 第 ${attempt + 1}/${maxRetries} 次失败，${backoff}ms 后重试: ${err.message}`);
                    await new Promise(r => setTimeout(r, backoff));
                    continue;
                }
                throw err;
            }
            const json = await response.json();
            const content = json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
            if (!content) throw new Error(`[${tag}] DeepSeek 返回内容为空`);
            return { content, elapsed };
        } catch (err) {
            lastErr = err;
            if (attempt + 1 < maxRetries && isRetryableDeepSeekError(err)) {
                const backoff = 1000 * Math.pow(2, attempt);
                console.warn(`⏳ [${tag}] 第 ${attempt + 1}/${maxRetries} 次失败，${backoff}ms 后重试: ${err.message}`);
                await new Promise(r => setTimeout(r, backoff));
                continue;
            }
            console.error(`❌ [${tag}] DeepSeek 调用失败 | 耗时: ${Date.now() - startAt}ms | 错误: ${err.message}`);
            throw err;
        }
    }
    throw lastErr || new Error(`[${tag}] DeepSeek 调用失败`);
}

// 从模型输出中提取 JSON（兼容 ```json 围栏 / 前后多余文本）
function extractJSON(content) {
    const s = (content || '').trim();
    const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const body = fenced ? fenced[1] : s;
    const m = body.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    return m ? m[0] : body;
}
```

- 超时统一 600s（长文章分批后单批较小，但仍给足余量；分析 / 出题 / 释义补全统一 600s，不再用原 300s/120s）。
- **重试策略**：单次调用最多 3 次尝试（即失败后重试 2 次），指数退避 1s → 2s → 4s；仅对 5xx / 429 / 网络&超时重试，4xx（鉴权失败、参数错误）立即抛出、不重试（避免对鉴权错误空转）。3 个函数共用此策略，无需各自实现。

### 3.4 改造 `analyzeArticleWithCoze`（第 265-355 行）

保留函数名、签名、`onProgress` 进度回调、未配置时的 mock 兜底（把 `!COZE_API_TOKEN || !COZE_WORKFLOW_ID` 改为 `!DEEPSEEK_API_KEY`）。

新的内部逻辑：

1. **本地拆句**（替换原先「整段发给 Coze」）：
   ```js
   const paragraphs = (article || '').split(/\n+/).map(p => p.trim()).filter(Boolean);
   const sentences = [];
   for (const p of paragraphs) {
       const parts = p.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
       for (const s of parts) sentences.push(s);
   }
   ```
2. **每批 5 句**：
   ```js
   const BATCH_SIZE = 5;
   const batches = [];
   for (let i = 0; i < sentences.length; i += BATCH_SIZE) batches.push({ start: i, items: sentences.slice(i, i + BATCH_SIZE) });
   ```
3. **逐批调用 DeepSeek**（`onProgress` 就绪后，按已完成批次推进进度百分比；批间可用 `await` 顺序执行，避免并发触发限流）：
   - System 提示词：
     ```
     你是初中英语学习助手。对给出的每个英语句子：1) 翻译成中文；2) 提取句中值得学习的单词/短语（跳过 the/a/an/is/are/was/were/be/of/in/and 等最基础词），给出中文释义、是否学术词 isAcademic、以及该句在全文中的全局句子序号 sentenceIndex。
     只输出 JSON，不要多余文字。格式：
     {"sentenceList":[{"sentence":"原文","translation":"中文"}],"wordList":[{"word":"","meaning":"","isAcademic":false,"sentenceIndex":0}]}
     ```
   - User 提示词（携带全局起始序号，保证 `sentenceIndex` 为全文绝对序号）：
     ```
     以下是文章中的句子，全局序号从 ${batch.start} 开始（每行前的数字即全局 sentenceIndex）：
     ${batch.items.map((s, i) => `${batch.start + i}: ${s}`).join('\n')}
     ```
   - 解析每批返回：`extractJSON` → `JSON.parse`，收集该批的 `sentenceList`（按 `sentence` 文本回填 `translation`）与 `wordList`（`sentenceIndex` 已是全局值）。
4. **合并所有批次**为最终中间结构（与用户指定的返回格式一致）：
   ```js
   const combined = {
       sentenceList,  // [{sentence, translation}]，sentence 用本地切分结果，translation 来自模型
       wordList,      // [{word, meaning, isAcademic, sentenceIndex}]
       total_sentences: sentenceList.length,
       total_words: wordList.length
   };
   ```
5. **复用现有解析层**：`return parseAIResponse(JSON.stringify(combined), article, title);`。

   原因：`parseAIResponse` 已支持「`wordList` 数组（含 `sentenceIndex`）+ `sentenceList` 数组」，会自动产出 `server.js`/`queue.js` 需要的 `wordList`(扁平对象)、`wordContextList`、`questions` 等。`total_sentences/total_words` 仅作信息字段，调用方不使用，不影响契约。

保留/平移原日志（开调用日志、`📏` 长度日志换成本地拆句统计、`✅` 成功日志含耗时、`❌` 失败日志），并新增「第 i/n 批：x 句」级别日志便于排查。

### 3.5 改造 `generateQuestionsWithCoze`（第 364-445 行）

保留函数名、签名、返回结构 `{ questions, total_questions, success }`、未配置返回 `{questions:[], total_questions:0, success:false}`。

- System 提示词：
  ```
  你是初中英语阅读理解出题老师。根据文章生成 4-5 道阅读理解题（类型：MAIN IDEA / DETAIL / INFERENCE / VOCABULARY），每题 4 个选项（A/B/C/D），给出正确答案 answer、解析 explanation。
  只输出 JSON，不要多余文字。格式：
  {"questions":[{"type":"DETAIL","question":"...","options":["A","B","C","D"],"answer":"B","explanation":"..."}],"total_questions":4}
  ```
- User 提示词：文章 `content`（必要时截断，如超长取前 ~8000 字符）与标题 `title`。
- 解析：`extractJSON` → `JSON.parse` → 取 `questions`（数组）与 `total_questions`。
- 调用现有 `normalizeQuestions(rawQuestions)` 把 `answer`("A"/数字) 转成 `answer_index`、`options` 统一为数组（复用现有逻辑，避免重写答案下标换算）。
- 保留「逐题打印 question/answer」诊断日志与 `✅/❌` 日志，字符串 `quiz_generator` 标签不变。

### 3.6 改造 `generateWordMeaningsWithCoze`（第 453-517 行）

保留函数名、签名、返回 `[{word, context, definition, isAcademic}]`、未配置/空输入返回 `[]`。

- System 提示词：
  ```
  你是英语助教。对每个单词结合给定语境句子，给出准确的中文释义 definition，并判断是否为学术词 isAcademic。
  只输出 JSON 数组，不要多余文字。格式：
  [{"word":"","context":"","definition":"","isAcademic":false}]
  ```
- User 提示词：给出「单词 / 语境」配对列表（`wordList` 与 `contextList` 一一对应）：
  ```
  ${wordList.map((w, i) => `${w} | ${contextList[i] || ''}`).join('\n')}
  ```
- 解析：`extractJSON` → `JSON.parse`（期望数组）→ 逐条清洗成 `{word(小写), context(trim), definition(trim), isAcademic:!!}`，跳过缺少 `word` 或缺 `definition` 的条目（沿用现状兜底）。
- 保留 `✅/❌` 日志（`word_meaning_generator` 标签不变）。

### 3.7 `module.exports`（第 628-647 行）

- 导出名保持不变（`analyzeArticleWithCoze`/`generateQuestionsWithCoze`/`generateWordMeaningsWithCoze`/`parseAIResponse`/`normalizeQuestions`/`isCozeConfigured`/工具函数/mock 函数）。
- `config` 按 3.2 改为 DeepSeek 值（保留 `COZE_BOT_ID` 键）。

## 4. 假设与决策

- **`.env` 修正**：按用户选择，同时修正 `.env` 的变量名（仅此一处对 `.env` 的改动），`coze.js` 只读标准名 `DEEPSEEK_API_KEY`。
- **函数名与外层返回不变**：`server.js`/`queue.js` 按名调用这 3 个函数，因此不改名、不改返回结构；用户所述的 `{sentenceList, wordList, total_sentences, total_words}` 是 `article_word_analyzer` 的**中间/模型层**结构，最终经 `parseAIResponse` 转成既有外层结构。
- **重试（双层）**：新增调用层内部重试——`callDeepSeek` 单次最多 3 次尝试（即失败后重试 2 次）、指数退避 1s→2s→4s，仅对 5xx/429/网络&超时重试，4xx 立即抛出；重试耗尽仍失败则抛错，触发 `queue.js` 的 `MAX_RETRIES` 整篇退避重试（第二层）。
- **超时**：统一 600s，覆盖较长文章的分批分析场景。
- **并发策略**：批间顺序执行（`await`），避免短时间大量并发触发限流；文章分析与出题仍由调用方 `Promise.allSettled` 并行（不变）。
- **模型编解码**：DeepSeek 返回为 OpenAI 兼容的 `choices[0].message.content`，其中为 JSON；用 `extractJSON` 兜底 markdown 围栏/多余文本。

## 5. 验证步骤

1. 启动前自检：`node -e "require('dotenv').config(); console.log(process.env.DEEPSEEK_API_KEY)"` 确认密钥可读取且非空。
2. `npm start` 启动，确认启动日志 `🤖 Coze:` 显示已配置，`/health` 返回 `cozeConfigured: true`、`cozeBotId` 为 `deepseek-flash`（日志标签文案沿用，不影响功能）。
3. 用 [test_coze_workflow.js](file:///c:/Users/Administrator/Desktop/初中背单词 - 部署/test_coze_workflow.js) 上传一篇文章，观察控制台：
   - `analyzeArticleWithCoze` 分批日志（第 i/n 批）与最终「解析后 wordList 条数 / wordContextList 条数」；
   - `quiz_generator` 返回 4-5 题且 `answer` 不再全 A（`answer_index` 正确）；
   - `word_meaning_generator` 能补全空释义。
4. 轮询至 `status=completed`，确认：题目数 ≥4、单词数为非空、`sentences` 返回正常。
5. 错误/重试场景：
   - 错误密钥（4xx）：确认 `callDeepSeek` **不重试**、立即抛错 → `queue.js` 层面失败 → 最终 `status=failed` → 前端降级（`isFallback`）。
   - 临时断网或 5xx：确认控制台出现 `⏳ ... 第 1/3 次失败，Xms 后重试` → 指数退避（1s/2s/4s）→ 恢复后成功，或耗尽 3 次后抛错。
6. 回归确认未改动 `server.js`/`queue.js`/`app.js`（`git diff --stat` 仅出现 `coze.js` 与 `.env`）。

## 6. 不做的事

- 不改 `server.js`、`queue.js`、`app.js`、`db.js`、`fallback.js`。
- 不改 `coze.js` 内 `parseAIResponse`/`normalizeQuestions`/`normalizeWordList`/`buildWordContextFromSentenceIndex`/`extractWordContextList`/mock 函数逻辑（仅按需调整其中 console.log 文案 Coze→DeepSeek，属日志，不改行为）。
- 不新增 Coze 相关冗余代码；删除已无引用的 Coze 环境变量常量。