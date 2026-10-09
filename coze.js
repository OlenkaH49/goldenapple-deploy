/**
 * coze.js - Coze API 调用封装（纯函数，不含 HTTP 响应逻辑）
 *
 * 设计目的：让 server.js 的同步接口和 queue.js 的异步队列都能复用同一套 Coze 调用逻辑。
 * onProgress 为可选回调，用于 SSE 进度反馈；异步队列不传该参数。
 */

require('dotenv').config();

const dbOps = require('./db');

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-flash';

// GLM 配置（quiz / word_meaning 两个功能统一使用），缺失 Key 时整组回退 DeepSeek
const GLM_API_KEY = process.env.GLM_FLASH_API_KEY || '';
const GLM_BASE_URL = process.env.GLM_FLASH_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4';
const GLM_MODEL = process.env.GLM_FLASH_MODEL || 'glm-5.3-flash';

// 文章分析专用配置：主模型 GLM（ARTICLE_*），降级模型 DeepSeek（DEEPSEEK_*）
// 未配置 ARTICLE_* 时回退到旧 GLM_FLASH_*，保证向后兼容
const ARTICLE_API_KEY = process.env.ARTICLE_API_KEY || GLM_API_KEY || '';
const ARTICLE_BASE_URL = process.env.ARTICLE_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4';
const ARTICLE_MODEL = process.env.ARTICLE_MODEL || GLM_MODEL;
const ARTICLE_FALLBACK_MODEL = process.env.ARTICLE_FALLBACK_MODEL || DEEPSEEK_MODEL;

function resolveLLMConfig() {
    if (GLM_API_KEY) {
        return { apiKey: GLM_API_KEY, baseUrl: GLM_BASE_URL, model: GLM_MODEL };
    }
    return { apiKey: DEEPSEEK_API_KEY, baseUrl: DEEPSEEK_BASE_URL, model: DEEPSEEK_MODEL };
}

// 文章分析的字符数分级超时：≤5000 字等 1 分钟，>5000 字等 2 分钟（超时自动降级到下一模型）
function getArticleTimeoutMs(totalLen) {
    return totalLen <= 5000 ? 60000 : 120000;
}

// ==================== 多模型配置 ====================
// article：主 GLM + 降级 DeepSeek（按字符数超时切换）
// quiz / word_meaning：沿用 resolveLLMConfig（GLM 优先，缺失回退 DeepSeek）

const MODEL_CONFIGS = {
    article: {
        primary: { apiKey: ARTICLE_API_KEY, baseUrl: ARTICLE_BASE_URL, model: ARTICLE_MODEL },
        fallback: { apiKey: DEEPSEEK_API_KEY, baseUrl: DEEPSEEK_BASE_URL, model: ARTICLE_FALLBACK_MODEL }
    },
    quiz: resolveLLMConfig(),
    word_meaning: resolveLLMConfig()
};

// ==================== 固定 System Prompt（完全不变，利于上下文缓存命中，勿改） ====================

// ==================== 句子翻译任务 Prompt（只拆分 + 翻译，输出 sentenceList） ====================

// GLM 专用长 Prompt（较长，触发上下文缓存命中）
const SYSTEM_PROMPT_SENTENCE_GLM = [
    '你是一个专业的英语教学助手，负责把英语文章拆分为句子并翻译。',
    '',
    '【任务规则】',
    '1. 按语义拆分句子：将用户提供的文章内容，按照语义和标点符号，拆分成独立的、完整的英文句子。请特别注意：',
    '   - 句子以英文句号（.）、问号（?）、感叹号（!）结尾。',
    '   - 忽略特殊符号（如 [xxx] 或 [xxx.Com]）内部的标点符号，这些符号不应作为句子分隔的依据。',
    '   - 如果遇到因特殊符号导致的不完整句子，请将其与相邻部分合并，确保每个句子都是语义完整的。',
    '2. 翻译句子：为拆分出的每个英文句子提供准确、流畅的中文翻译。',
    '',
    '【输出格式】',
    '请严格按照以下 JSON 格式返回，不要添加任何额外的文字或代码块标记：',
    '{',
    '  "sentenceList": [',
    '    {"sentence": "英文句子原文", "translation": "中文翻译"}',
    '  ]',
    '}'
].join('\n');

// DeepSeek 专用短 Prompt（前缀固定，仅替换文章内容）
const SYSTEM_PROMPT_SENTENCE_DEEPSEEK = [
    '你是初中英语学习助手。请按语义将文章拆分为完整英文句子（忽略 [xxx] 等特殊符号内部的标点），并为每个句子提供准确流畅的中文翻译。',
    '只输出 JSON，不要多余文字。格式：',
    '{"sentenceList":[{"sentence":"原文","translation":"中文"}]}'
].join('\n');

// ==================== 单词释义任务 Prompt（拆分句子标定 sentenceIndex + 提取单词 + 释义） ====================

// GLM 专用长 Prompt（较长，触发上下文缓存命中）
const SYSTEM_PROMPT_WORD_GLM = [
    '你是一个专业的英语教学助手，负责从英语文章中提取单词并给出中文释义。',
    '',
    '【任务规则】',
    '1. 先按语义拆分句子：将文章按语义和标点拆分成完整句子，用于给单词标定句子序号。',
    '   - 句子以英文句号（.）、问号（?）、感叹号（!）结尾。',
    '   - 忽略特殊符号（如 [xxx] 或 [xxx.Com]）内部的标点符号。',
    '   - 不完整句子与相邻部分合并，保证语义完整。',
    '2. 提取单词：从每个句子中提取所有单词，并给出中文释义。',
    '   - 不需要跳过任何词（包括 the、a、is、are、students 等基础词）。',
    '   - 唯一跳过的条件：该词已在 user prompt 列出的「已有释义的单词」列表里（已有释义）。',
    '   - 其他所有词都要提取并生成中文释义，不留空。',
    '3. 标记语境：为每个提取出的单词标注它在全文中的句子序号 sentenceIndex（从 0 开始计数）。',
    '',
    '【输出格式】',
    '请严格按照以下 JSON 格式返回，不要添加任何额外的文字或代码块标记：',
    '{',
    '  "sentenceList": [',
    '    {"sentence": "英文句子原文"}',
    '  ],',
    '  "wordList": [',
    '    {"word": "单词", "meaning": "中文释义", "isAcademic": false, "sentenceIndex": 0}',
    '  ]',
    '}'
].join('\n');

// DeepSeek 专用短 Prompt（前缀固定，仅替换文章内容）
const SYSTEM_PROMPT_WORD_DEEPSEEK = [
    '你是初中英语学习助手。请先按语义将文章拆分为完整句子（忽略 [xxx] 等特殊符号内部的标点），然后提取句中所有单词（不需要跳过任何词，包括 the/a/an/is/are/students 等基础词；唯一跳过 user prompt 列出的「已有释义的单词」），对每个词给出中文释义 meaning（不留空）、是否学术词 isAcademic、以及全局句子序号 sentenceIndex（从 0 开始）。',
    '只输出 JSON，不要多余文字。格式：',
    '{"sentenceList":[{"sentence":"原文"}],"wordList":[{"word":"","meaning":"","isAcademic":false,"sentenceIndex":0}]}'
].join('\n');

const SYSTEM_PROMPT_QUIZ = [
    '你是初中英语阅读理解出题老师。根据文章生成 4-5 道阅读理解题（类型：MAIN IDEA / DETAIL / INFERENCE / VOCABULARY），每题 4 个选项（A/B/C/D），给出正确答案 answer、解析 explanation。',
    '只输出 JSON，不要多余文字。格式：',
    '{"questions":[{"type":"DETAIL","question":"...","options":["A","B","C","D"],"answer":"B","explanation":"..."}],"total_questions":4}'
].join('\n');

const SYSTEM_PROMPT_WORD_MEANING = [
    '你是英语助教。对每个单词结合给定语境句子，给出准确的中文释义 definition，并判断是否为学术词 isAcademic。',
    '只输出 JSON 数组，不要多余文字。格式：',
    '[{"word":"","context":"","definition":"","isAcademic":false}]'
].join('\n');

// 句子翻译任务：根据模型选择 System Prompt
function getSentenceSystemPrompt(model) {
    return /glm/i.test(model || '') ? SYSTEM_PROMPT_SENTENCE_GLM : SYSTEM_PROMPT_SENTENCE_DEEPSEEK;
}

// 单词释义任务：根据模型选择 System Prompt
function getWordSystemPrompt(model) {
    return /glm/i.test(model || '') ? SYSTEM_PROMPT_WORD_GLM : SYSTEM_PROMPT_WORD_DEEPSEEK;
}

function getArticlePromptType(model) {
    return /glm/i.test(model || '') ? 'GLM（长 Prompt，触发上下文缓存）' : 'DeepSeek（短 Prompt，前缀固定）';
}

// 构建单批文章的 User Prompt（GLM 与 DeepSeek 模板略有差异）
function buildArticleUserPrompt(model, text, title, cachedWords) {
    const isGLM = /glm/i.test(model || '');
    const safeTitle = title || '用户上传文章';
    const body = text || '';
    let prompt;
    if (isGLM) {
        prompt = `请处理以下文章内容：\n文章标题：${safeTitle}\n文章内容：\n${body}`;
    } else {
        prompt = `标题：${safeTitle}\n\n文章内容：\n${body}`;
    }
    // 把「已有释义的词」拼进 user prompt，供 AI 唯一跳过（不再跳过 the/a/is 等基础词）
    const cachedList = Array.isArray(cachedWords) ? cachedWords.filter(Boolean) : [];
    if (cachedList.length > 0) {
        prompt += `\n\n【已有释义的单词（请跳过这些词，不要重复提取，其余所有词都要提取）】\n${cachedList.join(', ')}`;
    }
    return prompt;
}

// 启动时打印一次固定的 System Prompt，便于确认完全固定（利于缓存命中）
console.log('🔒 [System Prompt] 已固定为常量（利于上下文缓存命中）：');
console.log('── 句子翻译（GLM 长 Prompt）──');
console.log(SYSTEM_PROMPT_SENTENCE_GLM);
console.log('── 句子翻译（DeepSeek 短 Prompt）──');
console.log(SYSTEM_PROMPT_SENTENCE_DEEPSEEK);
console.log('── 单词释义（GLM 长 Prompt）──');
console.log(SYSTEM_PROMPT_WORD_GLM);
console.log('── 单词释义（DeepSeek 短 Prompt）──');
console.log(SYSTEM_PROMPT_WORD_DEEPSEEK);
console.log('── quiz_generator ──');
console.log(SYSTEM_PROMPT_QUIZ);
console.log('── word_meaning_generator ──');
console.log(SYSTEM_PROMPT_WORD_MEANING);
console.log('────────────────────────────');

// ==================== DeepSeek API 调用工具 ====================

const fetch = require('node-fetch');
const crypto = require('crypto');

// 判断错误是否可重试：5xx / 429 / 网络&超时（无 status）可重试；其余 4xx（鉴权/参数）立即失败
function isRetryableDeepSeekError(err) {
    if (!err) return false;
    const msg = String(err.message || err);
    if (/返回\s*429/.test(msg)) return true;      // 限流
    if (/返回\s*5\d\d/.test(msg)) return true;    // 服务端错误
    if (/返回\s*4\d\d/.test(msg)) return false;   // 客户端错误（401/400…）不重试
    return true;                                   // 无 status 的网络错误 / 超时默认可重试
}

// 归类 LLM 失败原因，便于日志快速定位「为什么触发重试」
function llmErrorReason(err) {
    if (!err) return '未知错误';
    const msg = String(err.message || err);
    if (/timeout|timed\s*out|ETIMEDOUT|ESOCKETTIMEDOUT|abort|超时/i.test(msg)) return '超时';
    if (/返回\s*429/.test(msg)) return '限流(429)';
    if (/返回\s*5\d\d/.test(msg)) return '服务端错误(5xx)';
    if (/返回\s*4\d\d/.test(msg)) return '客户端错误(4xx)';
    if (/内容为空/.test(msg)) return '返回内容为空';
    return '网络/其他错误';
}

// 提取缓存命中信息：兼容 GLM（usage.prompt_tokens_details.cached_tokens）与 DeepSeek（prompt_cache_hit/miss_tokens）
function extractCacheInfo(usage) {
    if (!usage) return null;
    // GLM/智谱：缓存命中的 token 数放在 prompt_tokens_details.cached_tokens
    const pd = usage.prompt_tokens_details;
    if (pd && pd.cached_tokens != null) {
        const cached = Number(pd.cached_tokens) || 0;
        const total = Number(usage.prompt_tokens) || 0;
        return { cached_tokens: cached, prompt_tokens: total, hit_rate: total > 0 ? Math.round((cached / total) * 100) + '%' : '0%' };
    }
    // DeepSeek：prompt_cache_hit_tokens / prompt_cache_miss_tokens
    const hit = Number(usage.prompt_cache_hit_tokens) || 0;
    const miss = Number(usage.prompt_cache_miss_tokens) || 0;
    const total = hit + miss;
    return { hit_tokens: hit, miss_tokens: miss, hit_rate: total > 0 ? Math.round((hit / total) * 100) + '%' : '0%' };
}

// 统一调用 LLM chat/completions（OpenAI 兼容，支撑多模型/多 API）：超时 + 指数退避重试 + 错误日志 + 缓存命中日志
async function callLLM({ apiKey, baseUrl, model, messages, timeoutMs = 600000, tag = '', maxRetries = 2 }) {
    const endpoint = (baseUrl || '').replace(/\/+$/, '') + '/chat/completions';
    console.log(`🤖 [${tag}] 调用模型 | model: ${model} | baseUrl: ${baseUrl}`);
    const sysMsg = Array.isArray(messages) ? messages.find(m => m && m.role === 'system') : null;
    console.log(`🔑 [${tag}] System Prompt 哈希: ${sysMsg && sysMsg.content ? crypto.createHash('sha256').update(sysMsg.content).digest('hex').slice(0, 16) : 'N/A'} | 长度: ${sysMsg && sysMsg.content ? sysMsg.content.length : 0}`);

    // 诊断日志：0-40ms 立刻失败通常是「请求没发出去」，打印关键调用信息定位根因
    const keyPreview = (typeof apiKey === 'string' && apiKey.length > 0)
        ? apiKey.slice(0, 5) + '…(长度' + apiKey.length + ')'
        : '(空/未读取)';
    console.log(`🔧 [${tag}] 调用诊断 | baseUrl: ${baseUrl || '(空)'} | model: ${model || '(空)'} | apiKey: ${keyPreview} | fetch类型: ${typeof fetch} | timeoutMs: ${timeoutMs} | endpoint: ${endpoint}`);

    // 诊断：messages 结构概览（角色 + content 长度 + 前 200 字预览），用于对比 article/quiz 请求体差异
    if (Array.isArray(messages)) {
        console.log(`🧩 [${tag}] messages 概览 | 条数: ${messages.length} | maxRetries: ${maxRetries}`);
        messages.forEach((m, i) => {
            const c = m && m.content;
            const clen = typeof c === 'string' ? c.length : '非字符串(类型=' + typeof c + ')';
            const preview = typeof c === 'string' ? c.slice(0, 200) : String(c);
            console.log(`🧩 [${tag}]   [${i}] role=${m && m.role} | content长度=${clen} | 预览: ${preview.replace(/\n/g, '\\n')}`);
        });
    } else {
        console.log(`🧩 [${tag}] messages 异常 | 不是数组，type=${typeof messages}`);
    }

    let lastErr = null;
    // 关键修复：maxRetries 语义为「额外重试次数」=0 时仍必须执行至少 1 次。
    // 之前 article 路径传 maxRetries:0 导致 for 循环一次都不执行，直接 throw 而根本没发请求（0-40ms 失败），故 Math.max(1, maxRetries) 保证至少跑一次。
    for (let attempt = 0; attempt < Math.max(1, maxRetries); attempt++) {
        const startAt = Date.now();
        try {
            // node-fetch v2 的 timeout 必须是数字，字符串会导致立刻失败（0-49ms 内报错）
            const timeoutMsNum = Number(timeoutMs) || 600000;
            const headers = {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            };
            // 安全序列化：检测循环引用 / undefined / 非法值，避免 JSON.stringify 静默丢字段或直接抛错
            let requestBody;
            try {
                requestBody = JSON.stringify({ model, messages });
            } catch (stringifyErr) {
                console.error(`🔥 [${tag}] JSON.stringify 请求体失败（可能存在循环引用/非法值）: ${stringifyErr && stringifyErr.message ? stringifyErr.message : String(stringifyErr)}`);
                throw stringifyErr;
            }
            // 请求体过长时截断（messages 里 content 可能很大），仅用于日志排查参数格式
            const bodyPreview = requestBody.length > 800 ? requestBody.slice(0, 800) + '…(截断)' : requestBody;
            console.log(`📤 [${tag}] 发起请求参数 | ${JSON.stringify({ method: 'POST', headers, body: bodyPreview })}`);
            console.log(`⏱️ [${tag}] timeout 检查 | 原始值: ${timeoutMs}（类型 ${typeof timeoutMs}）→ 实际传入: ${timeoutMsNum}（number）`);

            const response = await fetch(endpoint, {
                method: 'POST',
                headers,
                body: requestBody,
                timeout: timeoutMsNum
            });
            const elapsed = Date.now() - startAt;
            console.log(`📥 [${tag}] 收到响应 | status: ${response.status} | ok: ${response.ok} | 耗时: ${elapsed}ms`);
            if (!response.ok) {
                const errText = await response.text();
                const err = new Error(`[${tag}] LLM API 返回 ${response.status}: ${errText.substring(0, 300)}`);
                if (attempt + 1 < maxRetries && isRetryableDeepSeekError(err)) {
                    lastErr = err;
                    const backoff = 1000 * Math.pow(2, attempt); // 1s → 2s → 4s
                    console.warn(`⏳ [${tag}] 第 ${attempt + 1}/${maxRetries} 次失败（原因=${llmErrorReason(err)} | 本次耗时=${Date.now() - startAt}ms），${backoff}ms 后重试: ${err.message}`);
                    await new Promise(r => setTimeout(r, backoff));
                    continue;
                }
                throw err;
            }
            const json = await response.json();
            const content = json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
            if (!content) throw new Error(`[${tag}] LLM 返回内容为空`);
            const usage = json && json.usage ? json.usage : null;
            if (usage) {
                console.log(`🗂️ [${tag}] 缓存命中: ${JSON.stringify(extractCacheInfo(usage))} | 原始 usage: ${JSON.stringify(usage)}`);
            }
            return { content, elapsed, usage };
        } catch (err) {
            lastErr = err;
            // 健壮处理：err 可能不是 Error 对象（如 throw 字符串），确保 message 与 stack 始终可读
            const errMsg = (err && err.message) ? err.message : String(err);
            const errStack = (err && err.stack) ? err.stack : `(无 stack，原始错误类型=${typeof err}，值=${String(err)})`;
            if (attempt + 1 < maxRetries && isRetryableDeepSeekError(err)) {
                const backoff = 1000 * Math.pow(2, attempt);
                console.warn(`⏳ [${tag}] 第 ${attempt + 1}/${maxRetries} 次失败（原因=${llmErrorReason(err)} | 本次耗时=${Date.now() - startAt}ms），${backoff}ms 后重试: ${errMsg}`);
                await new Promise(r => setTimeout(r, backoff));
                continue;
            }
            console.error(`❌ [${tag}] LLM 调用失败 | 原因=${llmErrorReason(err)} | 耗时: ${Date.now() - startAt}ms | 错误类型: ${typeof err} | 错误: ${errMsg}`);
            console.error(`🧾 [${tag}] 错误堆栈:\n${errStack}`);
            throw err;
        }
    }
    throw lastErr || new Error(`[${tag}] LLM 调用失败`);
}

// 从模型输出中提取 JSON（兼容 ```json 围栏 / 前后多余文本）
function extractJSON(content) {
    const s = (content || '').trim();
    const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const body = fenced ? fenced[1] : s;
    const m = body.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    return m ? m[0] : body;
}

// ==================== 单词工具函数 ====================

function extractWords(article) {
    const matches = article.match(/[A-Za-z]+(?:-[A-Za-z]+)*/g) || [];
    const unique = [...new Set(matches.map(w => w.toLowerCase()))];
    return unique;
}

function splitCachedUncached(words, cacheMap) {
    // cacheMap: { word: meaning } 对象（来自 word_cache 表）
    const cached = [];
    const uncached = [];
    for (const word of words) {
        if (cacheMap[word]) {
            cached.push(word);
        } else {
            uncached.push(word);
        }
    }
    return { cached, uncached };
}

function mergeWordData(cachedWords, cacheMap, newWordList) {
    const merged = {};
    for (const word of cachedWords) {
        if (cacheMap[word]) merged[word] = cacheMap[word];
    }
    if (newWordList && typeof newWordList === 'object') {
        for (const [word, meaning] of Object.entries(newWordList)) {
            merged[word.toLowerCase()] = meaning;
        }
    }
    return merged;
}

// 把释义统一转成字符串（数字/对象/数组都兜底）
function stringifyMeaning(d) {
    if (d == null) return '';
    if (typeof d === 'string') return d.trim();
    return JSON.stringify(d);
}

/**
 * 把 Coze 返回的 wordList 各种可能结构统一成 { 单词小写: 释义字符串 } 扁平对象
 * 兼容：{word: meaning} / {word: {definition, ...}} / [{word, definition}] /
 *       [["word", "释义"]] / ["word1", "word2", ...]
 */
function normalizeWordList(wordList) {
    const result = {};
    if (!wordList || typeof wordList !== 'object') return result;

    // 数组形式
    if (Array.isArray(wordList)) {
        wordList.forEach(function(item) {
            if (!item) return;
            if (typeof item === 'string') {
                result[item.toLowerCase().trim()] = '';
                return;
            }
            if (Array.isArray(item)) {
                const w = (item[0] == null ? '' : String(item[0])).trim();
                if (w) result[w.toLowerCase()] = stringifyMeaning(item[1]);
                return;
            }
            if (typeof item === 'object') {
                const w = (item.word || item.term || item.name || item.english || '').toString().trim();
                if (!w) return;
                const d = item.definition || item.meaning || item.translation || item.zh || item.chinese || item.value || item.text;
                result[w.toLowerCase()] = stringifyMeaning(d);
            }
        });
        return result;
    }

    // 对象形式：{ word: meaning } 或 { word: {definition, ...} }
    for (const [rawKey, val] of Object.entries(wordList)) {
        const key = rawKey.toLowerCase().trim();
        if (!key) continue;
        if (val == null) {
            result[key] = '';
        } else if (typeof val === 'string' || typeof val === 'number') {
            result[key] = stringifyMeaning(val);
        } else if (typeof val === 'object') {
            const d = val.definition || val.meaning || val.translation || val.zh || val.chinese || val.value || val.text;
            result[key] = stringifyMeaning(d);
        }
    }
    return result;
}

/**
 * 从 Coze 返回结果里抽取「单词 + 语境 + 释义」列表，供写入 word_context 语境库
 * 兼容：parsed.wordContextList / parsed.contextWords / parsed.context_words（数组）
 *       以及 wordList 条目里自带 sentence/context 字段的情况
 * 返回 [{word, context, definition, part_of_speech}]
 */
function extractWordContextList(parsed) {
    if (!parsed || typeof parsed !== 'object') return [];
    let source = parsed.wordContextList || parsed.contextWords || parsed.context_words || null;

    // 没有显式语境列表时，尝试从 wordList 原样数组/对象里挖带 sentence 的条目
    if (!Array.isArray(source)) {
        const wl = parsed.wordList || parsed.words || parsed.vocabulary;
        if (Array.isArray(wl)) source = wl;
        else if (wl && typeof wl === 'object') source = Object.entries(wl);
        else source = [];
    }

    const list = [];
    for (const item of source) {
        if (!item) continue;
        let word, context, definition, partOfSpeech;
        if (Array.isArray(item)) {
            // [word, definition] 或 [word, {definition, context}]
            word = item[0];
            const sec = item[1];
            if (sec && typeof sec === 'object') {
                context = sec.context || sec.sentence;
                definition = sec.definition || sec.meaning || sec.translation || sec.zh;
                partOfSpeech = sec.part_of_speech;
            } else {
                definition = sec;
            }
        } else if (typeof item === 'object') {
            word = item.word || item.term || item.english;
            context = item.context || item.sentence;
            definition = item.definition || item.meaning || item.translation || item.zh || item.chinese || item.value;
            partOfSpeech = item.part_of_speech;
        }
        if (!word) continue;
        const ctx = (context || '').toString().trim();
        if (!ctx) continue; // 没有语境的条目无法写入语境库，跳过
        const def = stringifyMeaning(definition);
        if (!def) continue;
        list.push({ word: String(word).toLowerCase(), context: ctx, definition: def, part_of_speech: partOfSpeech || null });
    }
    return list;
}

/**
 * 根据新结构 wordList（元素含 sentenceIndex）+ sentenceList 生成语境库数据
 *   wordList: [{word, meaning, isAcademic, sentenceIndex}, ...]
 *   sentenceList: [{sentence, translation}, ...]
 * 每个词的 context = sentenceList[word.sentenceIndex].sentence
 * 过滤：word + context 在 word_context 里已有释义（definition 有值）→ 跳过，不重复写入
 * 返回 [{word, context, definition, part_of_speech}]
 */
function buildWordContextFromSentenceIndex(wordList, sentenceList) {
    const result = [];
    if (!Array.isArray(wordList)) return result;
    const sentences = Array.isArray(sentenceList) ? sentenceList : [];

    const allWords = [];             // 原始 wordList 里能取到 word 的所有词
    const filteredByContext = [];    // 已在 word_context 里存在（word + context + definition 有值）→ 跳过
    const keptWords = [];

    for (const w of wordList) {
        if (!w || typeof w !== 'object') continue;
        const word = (w.word || w.term || w.english || '').toString().toLowerCase().trim();
        // definition 可能为空（meaning 未生成），仍写入 word_context，后续由 word_meaning_generator 补全
        const def = stringifyMeaning(w.definition || w.meaning || w.translation || w.zh || w.chinese || w.value);
        if (!word) continue;

        allWords.push(word);

        const idx = w.sentenceIndex;
        const sentObj = (typeof idx === 'number' && idx >= 0 && idx < sentences.length) ? sentences[idx] : null;
        const ctx = (sentObj ? (sentObj.sentence || sentObj.original || sentObj.text || sentObj.english || '') : '').toString().trim();
        if (!ctx) continue;

        // 过滤：word 一样、context 一样、definition 已有值 → 跳过
        if (dbOps.getWordContext(word, ctx)) {
            filteredByContext.push(word);
            continue;
        }

        keptWords.push(word);
        result.push({ word: word, context: ctx, definition: def, part_of_speech: w.part_of_speech || null });
    }

    console.log(`🔍 [wordList] 原始 wordList: ${allWords.length} 个词 | ${JSON.stringify(allWords)}`);
    if (filteredByContext.length > 0) {
        console.log(`🚫 [wordList] 被过滤的词: ${JSON.stringify(filteredByContext)}`);
        console.log(`🚫 [wordList] 过滤原因: 已在 word_context 里存在（word + context 匹配，definition 有值）`);
    }
    console.log(`✅ [wordList] 保留的词: ${keptWords.length} 个 | ${JSON.stringify(keptWords)}`);

    return result;
}

// ==================== Mock 数据（未配置 Coze 时使用） ====================

function generateMockWordList(article) {
    const commonWords = ['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'to', 'of', 'in', 'and'];
    const allWords = article.toLowerCase().match(/[a-zA-Z'-]+/g) || [];
    const wordList = {};
    allWords.forEach(word => {
        if (word.length >= 4 && !commonWords.includes(word) && !wordList[word]) {
            if (Object.keys(wordList).length >= 25) return;
            wordList[word] = `[${word}] 的中文释义`;
        }
    });
    return wordList;
}

function generateMockSentenceList(article) {
    const sentences = article.split(/[.!?]+/).filter(s => s.trim().length >= 10);
    return sentences.slice(0, 20).map(s => ({
        original: s.trim(),
        translation: `[模拟翻译] ${s.trim().substring(0, 30)}...`
    }));
}

function generateMockResult(article, title) {
    return {
        title: title || '用户上传文章',
        description: '用户上传的英语学习文章（模拟数据）',
        level: article.length > 3000 ? 'high' : 'middle',
        levelLabel: article.length > 3000 ? '高中' : '初中',
        article: article,
        wordList: generateMockWordList(article),
        sentenceList: generateMockSentenceList(article),
        questions: [
            { type: 'MAIN IDEA', question: 'What is the main idea of this article?',
              options: ['To introduce the topic', 'To argue a point', 'To tell a story', 'To describe something'],
              answer_index: 0 },
            { type: 'DETAIL', question: 'According to the article, which statement is true?',
              options: ['Option A', 'Option B', 'Option C', 'Option D'], answer_index: 0 },
            { type: 'INFERENCE', question: 'What can we infer from the passage?',
              options: ['Inference A', 'Inference B', 'Inference C', 'Inference D'], answer_index: 0 }
        ]
    };
}

// ==================== 按长度分档拆批工具 ====================

// 文章分档阈值（字符数）
const CHUNK_MAX_CHARS = 20000;      // >20000 分批
const CHUNK_FALLBACK_CHARS = 5000;   // 整篇调用失败后，自动分批重试用的更小阈值
// 超时/中断类失败后强制细分的小批阈值：把「一次要吐全文所有词」的任务拆小，降低单次响应时长，
// 这是唯一能救「短文也超时」的手段（短文按 CHUNK_FALLBACK_CHARS=5000 拆出来还是 1 批，等于没拆）
const CHUNK_TIMEOUT_RETRY_CHARS = parseInt(process.env.CHUNK_TIMEOUT_RETRY_CHARS || '1200', 10);

// 判断是不是「超时/中断/网络」类失败（这类错误换模型往往也一样超时 → 必须先减负）
function isTimeoutLikeError(err) {
    if (!err) return false;
    const msg = String(err.message || err);
    return /timeout|timed\s*out|ETIMEDOUT|ESOCKETTIMEDOUT|ECONNRESET|abort|socket hang up|超时/i.test(msg);
}

/**
 * 强制把文章劈成至少 minChunks 批（按句子边界，不切碎句子）。
 * 用于「超时细分」兜底：短文按字符阈值拆不出多批时（例如 800 字的文章 vs 1200 的上限），
 * 仍然按句子数均分，让每次请求的响应体变小 —— 否则短文超时无药可救。
 */
function forceSplitIntoChunks(article, minChunks) {
    const text = (article || '').trim();
    if (!text) return [text];
    const want = Math.max(2, minChunks || 2);
    const sentences = splitBySentenceBoundary(text);
    if (sentences.length < want) return [text];   // 连句子都不够拆，只能整篇
    const out = [];
    const per = Math.ceil(sentences.length / want);
    for (let i = 0; i < sentences.length; i += per) {
        out.push(sentences.slice(i, i + per).join(' '));
    }
    return out.length > 1 ? out : [text];
}

// 按句子边界切分文本（保留句尾标点），用于超长段落的二次拆分
function splitBySentenceBoundary(text) {
    const s = (text || '').trim();
    if (!s) return [];
    const parts = s.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
    return (parts || [s]).map(x => x.trim()).filter(Boolean);
}

// 把文章拆成若干批：先按段落，超长段落再按句子，单段/单句超长则硬截断；保证不在句子中间切开
function splitArticleIntoChunks(article, maxLen) {
    const text = (article || '').trim();
    const limit = maxLen > 0 ? maxLen : CHUNK_MAX_CHARS;
    if (text.length <= limit) return [text];

    const paragraphs = text.split(/\n+/).map(p => p.trim()).filter(Boolean);

    // 候选片段：段落；超长段落按句子拆成多个片段
    const segments = [];
    for (const p of paragraphs) {
        if (p.length <= limit) {
            segments.push(p);
        } else {
            for (const seg of splitBySentenceBoundary(p)) segments.push(seg);
        }
    }

    // 贪心聚合片段，逐批塞满 limit（不切开单个片段）
    const chunks = [];
    let cur = '';
    for (let seg of segments) {
        // 极端情况：单个片段（如无标点长句）仍超长 → 硬截断
        while (seg.length > limit) {
            if (cur) { chunks.push(cur); cur = ''; }
            chunks.push(seg.substring(0, limit));
            seg = seg.substring(limit);
        }
        if (!seg) continue;
        if (cur && (cur.length + seg.length + 1) > limit) {
            chunks.push(cur);
            cur = seg;
        } else {
            cur = cur ? cur + '\n' + seg : seg;
        }
    }
    if (cur) chunks.push(cur);
    return chunks.length ? chunks : [text];
}

// ==================== Coze API 调用 ====================

// 句子翻译任务：单批调用 AI，返回 { sentenceList }
// 判断一段文本「是否含有足够的英文」。
// 用途：区分「模型返回空 = 失败」与「本批本来就不是英文（例如用户粘贴了中文），返回空是合理的」，
// 避免把合法的空结果也判成失败、把文章误标成 partial。
function hasEnoughEnglish(text, min) {
    const n = (String(text || '').match(/[A-Za-z]/g) || []).length;
    return n >= (min === undefined ? 20 : min);
}

// 句子翻译任务：单批调用 AI，只取 sentenceList
async function callSentenceBatch(chunkText, system, llmConfig, title, timeoutMs) {
    const user = buildArticleUserPrompt(llmConfig.model, chunkText, title, []);
    const { content } = await callLLM({
        ...llmConfig,
        messages: [
            { role: 'system', content: system },
            { role: 'user', content: user }
        ],
        tag: '句子翻译',
        timeoutMs: timeoutMs,
        maxRetries: 0   // 不内部重试：重试交给模型降级链（GLM→DeepSeek→兜底）
    });
    let parsed = null;
    let parseErr = null;
    try {
        parsed = JSON.parse(extractJSON(content));
    } catch (e) {
        parseErr = e;
        console.warn(`⚠️ [句子翻译] JSON 解析失败:`, e.message, '| 原始:', content.substring(0, 200));
    }
    const list = (parsed && Array.isArray(parsed.sentenceList)) ? parsed.sentenceList : null;

    // ⚠️ 2026-10-08 修复「假装成功」（用户报障：日志显示句子翻译成功，浮层却「暂无翻译」）
    //   这里原来无论解析成功失败都 `return { sentenceList: [] }`，把**失败伪装成成功**：
    //     callSentenceBatch → 空数组 → processSentenceBatches 记「成功」→ analyzeSentencesWithCoze
    //     打「✅ 成功 | 句子: 0」→ queue 落 status='completed' + sentences=[] + sentences_error=NULL。
    //   结果：题目正常生成（看起来一切正常），但整篇一个译文都没有，用户只能看到「暂无翻译」，
    //   而且**没有任何重试入口**，因为它连 partial 都不是。
    //   常见触发：模型答非所问（返回解释性文字）、响应被截断（长文/超时截断，JSON 不闭合）。
    //   现在一律抛错 → 走既有的模型降级链（GLM→DeepSeek）；全失败则文章落 partial，
    //   前端给出「重试」入口 —— 失败必须可见，不允许静默。
    if (!list) {
        let why;
        if (parseErr) {
            why = `JSON 解析失败（${parseErr.message}）`;
        } else if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            why = `响应不是 JSON 对象（实际类型=${Array.isArray(parsed) ? 'array' : typeof parsed}）`;
        } else {
            why = `响应缺少 sentenceList 字段（实际字段=${Object.keys(parsed).join(',') || '无'}）`;
        }
        const err = new Error(`句子翻译响应不可用：${why} | 原始响应前 200 字：${String(content).slice(0, 200)}`);
        err.sentenceParseFailure = true;
        throw err;
    }
    // 解析成功但一句都没拆出来：本批有英文却 0 句 → 同样是失败（空数组对上层毫无价值）
    if (list.length === 0 && hasEnoughEnglish(chunkText)) {
        const err = new Error(`句子翻译返回空列表：本批 ${String(chunkText).length} 字符却 0 句`
            + ` | 原始响应前 200 字：${String(content).slice(0, 200)}`);
        err.sentenceParseFailure = true;
        throw err;
    }
    return { sentenceList: list };
}

// 句子翻译任务：逐批合并 sentenceList
async function processSentenceBatches(chunks, system, llmConfig, title, timeoutMs, onProgress) {
    const sentenceList = [];
    const total = chunks.length;
    let successCount = 0;
    const overallStartAt = Date.now();
    for (let i = 0; i < total; i++) {
        const batchStartAt = Date.now();
        try {
            const parsed = await callSentenceBatch(chunks[i], system, llmConfig, title, timeoutMs);
            const sents = (parsed && Array.isArray(parsed.sentenceList)) ? parsed.sentenceList : [];
            for (const s of sents) {
                if (!s || typeof s !== 'object') continue;
                sentenceList.push({
                    sentence: (s.sentence || s.original || s.text || s.english || '').toString(),
                    translation: (s.translation || '').toString().trim()
                });
            }
            successCount++;
            console.log(`📦 [句子翻译] 第 ${i + 1}/${total} 批 | 句数: ${sents.length} | 耗时: ${Date.now() - batchStartAt}ms | 成功`);
        } catch (err) {
            console.log(`📦 [句子翻译] 第 ${i + 1}/${total} 批失败: ${err.message}`);
            throw err;  // 抛给上层做模型降级
        }
        if (onProgress) {
            const pct = 30 + Math.round(((i + 1) / total) * 45);
            onProgress(Math.min(pct, 75), 'AI 正在翻译句子...');
        }
    }
    console.log(`📊 [句子翻译] 结束 | 总耗时: ${Date.now() - overallStartAt}ms | 总批次: ${total} | 成功: ${successCount}`);
    // ⚠️ 最后一道断言（2026-10-08）：正文非空、批次都「成功」过，却一句都没合并出来 ——
    //    这在业务上不可能是正确结果，绝不能当作成功返回（否则就是 completed + sentences=[]）。
    if (sentenceList.length === 0 && hasEnoughEnglish(chunks.join(''))) {
        throw new Error(`句子翻译全部批次返回空（${total} 批 / 共 ${chunks.join('').length} 字符）→ 判定失败`);
    }
    return { sentenceList };
}

// 句子翻译任务：≤20000 整篇，>20000 分批；整篇失败自动更小批次重试
async function runSentenceBatchesWithFallback(article, title, llmConfig, system, timeoutMs, onProgress) {
    let chunks = splitArticleIntoChunks(article, CHUNK_MAX_CHARS);
    const strategy = chunks.length === 1 ? '整篇' : '分批';
    console.log(`📏 [句子翻译] 分档判断 | 文章长度: ${(article || '').length} 字符 | 策略: ${strategy} | 批数: ${chunks.length}`);
    if (strategy === '整篇') {
        let firstErr = null;
        try {
            return await processSentenceBatches(chunks, system, llmConfig, title, timeoutMs, onProgress);
        } catch (err) {
            firstErr = err;
            console.warn(`⚠️ [句子翻译] 整篇调用失败（${isTimeoutLikeError(err) ? '超时类' : '其他'}），自动分批重试 | 错误: ${err.message}`);
        }
        // 超时类失败：必须减负，按更小的批次重来（短文同样生效）
        const retryLimit = isTimeoutLikeError(firstErr) ? CHUNK_TIMEOUT_RETRY_CHARS : CHUNK_FALLBACK_CHARS;
        chunks = splitArticleIntoChunks(article, retryLimit);
        if (chunks.length === 1 && isTimeoutLikeError(firstErr)) {
            // 按字符阈值还拆不开（文章本身就短）→ 按句子边界强制劈成 2 批，让单次响应更小
            chunks = forceSplitIntoChunks(article, 2);
        }
        if (chunks.length === 1) throw firstErr;
        console.log(`🔻 [句子翻译] 细分重试 | 批大小: ${retryLimit} 字符 → ${chunks.length} 批`);
        return await processSentenceBatches(chunks, system, llmConfig, title, timeoutMs, onProgress);
    }
    return await processSentenceBatches(chunks, system, llmConfig, title, timeoutMs, onProgress);
}

// 单词释义任务：单批调用 AI，返回 { sentenceList, wordList }（sentenceList 仅用于标定 sentenceIndex 对齐）
async function callWordBatch(chunkText, system, llmConfig, title, cachedWords, timeoutMs) {
    const user = buildArticleUserPrompt(llmConfig.model, chunkText, title, cachedWords);
    const { content } = await callLLM({
        ...llmConfig,
        messages: [
            { role: 'system', content: system },
            { role: 'user', content: user }
        ],
        tag: '单词释义',
        timeoutMs: timeoutMs,
        maxRetries: 0
    });
    let parsed = null;
    try {
        parsed = JSON.parse(extractJSON(content));
    } catch (e) {
        console.warn(`⚠️ [单词释义] JSON 解析失败:`, e.message, '| 原始:', content.substring(0, 200));
    }
    return {
        sentenceList: (parsed && Array.isArray(parsed.sentenceList)) ? parsed.sentenceList : [],
        wordList: (parsed && Array.isArray(parsed.wordList)) ? parsed.wordList : []
    };
}

// 单词释义任务：逐批合并 wordList（sentenceIndex 全局化，按本批句数累加偏移）
async function processWordBatches(chunks, system, llmConfig, title, cachedWords, timeoutMs, onProgress) {
    const rawWordList = [];
    const total = chunks.length;
    let sentenceOffset = 0;
    let successCount = 0;
    const overallStartAt = Date.now();
    for (let i = 0; i < total; i++) {
        const batchStartAt = Date.now();
        try {
            const parsed = await callWordBatch(chunks[i], system, llmConfig, title, cachedWords, timeoutMs);
            const words = (parsed && Array.isArray(parsed.wordList)) ? parsed.wordList : [];
            for (const w of words) {
                if (!w || typeof w !== 'object') continue;
                const word = (w.word || w.term || w.english || '').toString().trim();
                if (!word) continue;
                const rawIdx = w.sentenceIndex;
                const idxNum = (typeof rawIdx === 'number') ? rawIdx : Number(rawIdx);
                rawWordList.push({
                    word: word,
                    meaning: stringifyMeaning(w.meaning || w.definition || w.translation || w.zh || w.chinese || w.value),
                    isAcademic: !!(w.isAcademic || w.is_academic),
                    sentenceIndex: (Number.isFinite(idxNum) ? idxNum : 0) + sentenceOffset
                });
            }
            // 偏移按本批返回句数累加，保证与句子翻译任务的 sentenceList 对齐
            const batchSentences = (parsed && Array.isArray(parsed.sentenceList)) ? parsed.sentenceList.length : 0;
            sentenceOffset += batchSentences;
            successCount++;
            console.log(`📦 [单词释义] 第 ${i + 1}/${total} 批 | 词数: ${words.length} | 句数: ${batchSentences} | 耗时: ${Date.now() - batchStartAt}ms | 成功`);
        } catch (err) {
            console.log(`📦 [单词释义] 第 ${i + 1}/${total} 批失败: ${err.message}`);
            throw err;
        }
        if (onProgress) {
            const pct = 30 + Math.round(((i + 1) / total) * 45);
            onProgress(Math.min(pct, 75), 'AI 正在提取单词释义...');
        }
    }
    console.log(`📊 [单词释义] 结束 | 总耗时: ${Date.now() - overallStartAt}ms | 总批次: ${total} | 成功: ${successCount}`);
    return { rawWordList };
}

// 单词释义任务：≤20000 整篇，>20000 分批；整篇失败自动更小批次重试
async function runWordBatchesWithFallback(article, title, llmConfig, system, cachedWords, timeoutMs, onProgress) {
    let chunks = splitArticleIntoChunks(article, CHUNK_MAX_CHARS);
    const strategy = chunks.length === 1 ? '整篇' : '分批';
    console.log(`📏 [单词释义] 分档判断 | 文章长度: ${(article || '').length} 字符 | 策略: ${strategy} | 批数: ${chunks.length}`);
    if (strategy === '整篇') {
        let firstErr = null;
        try {
            return await processWordBatches(chunks, system, llmConfig, title, cachedWords, timeoutMs, onProgress);
        } catch (err) {
            firstErr = err;
            console.warn(`⚠️ [单词释义] 整篇调用失败（${isTimeoutLikeError(err) ? '超时类' : '其他'}），自动分批重试 | 错误: ${err.message}`);
        }
        // 单词任务的响应体最大（全文所有词 + 句），最容易超时。
        // 超时类失败必须减负：按 CHUNK_TIMEOUT_RETRY_CHARS 细分，短文也照样拆开 —— 这是唯一有效手段。
        const retryLimit = isTimeoutLikeError(firstErr) ? CHUNK_TIMEOUT_RETRY_CHARS : CHUNK_FALLBACK_CHARS;
        chunks = splitArticleIntoChunks(article, retryLimit);
        if (chunks.length === 1 && isTimeoutLikeError(firstErr)) {
            // 按字符阈值还拆不开（文章本身就短）→ 按句子边界强制劈成 2 批，让单次响应更小
            chunks = forceSplitIntoChunks(article, 2);
        }
        if (chunks.length === 1) throw firstErr;
        console.log(`🔻 [单词释义] 细分重试 | 批大小: ${retryLimit} 字符 → ${chunks.length} 批（每批响应更小，避免再次超时）`);
        return await processWordBatches(chunks, system, llmConfig, title, cachedWords, timeoutMs, onProgress);
    }
    return await processWordBatches(chunks, system, llmConfig, title, cachedWords, timeoutMs, onProgress);
}

// ==================== 模型健康熔断（2026-09-30） ====================
// 线上问题：GLM 与 DeepSeek 是「同一份请求、各自 60s 超时」串行执行。单词释义任务要输出全文
// 每个词的释义，负载最重 → GLM 超时 60s，再换 DeepSeek 又超时 60s，一共白等 2 分钟才失败
// （DB 里 created_at → updated_at 正好差 2 分钟就是这个原因）。
// 这里给每个模型记健康度：连续失败到阈值 → 冷却期内直接跳过它，只用还健康的那一个，
// 不再每个任务都先白等一次已知超时的模型。
const MODEL_HEALTH_COOLDOWN_MS = Math.max(0, parseInt(process.env.MODEL_HEALTH_COOLDOWN_MS || '300000', 10));
const MODEL_HEALTH_FAIL_THRESHOLD = Math.max(1, parseInt(process.env.MODEL_HEALTH_FAIL_THRESHOLD || '2', 10));
const modelHealthMap = new Map();   // model 名 → { fails, openUntil, lastReason, lastFailAt, lastOkAt, totalFails, totalOk }

function modelHealthKey(cfg) {
    return (cfg && cfg.model) ? String(cfg.model) : '(未配置)';
}

function isModelCoolingDown(cfg) {
    const h = modelHealthMap.get(modelHealthKey(cfg));
    if (!h || !h.openUntil) return false;
    if (Date.now() >= h.openUntil) {
        // 冷却结束：复位，给它一次机会
        h.openUntil = 0;
        h.fails = 0;
        console.log(`🩺 [模型健康] ${modelHealthKey(cfg)} 冷却结束，恢复参与降级链`);
        return false;
    }
    return true;
}

function noteModelFailure(cfg, err) {
    const key = modelHealthKey(cfg);
    const h = modelHealthMap.get(key) || { fails: 0, openUntil: 0, lastReason: null, lastFailAt: 0, lastOkAt: 0, totalFails: 0, totalOk: 0 };
    h.fails += 1;
    h.totalFails += 1;
    h.lastFailAt = Date.now();
    h.lastReason = llmErrorReason(err);
    if (h.fails >= MODEL_HEALTH_FAIL_THRESHOLD && MODEL_HEALTH_COOLDOWN_MS > 0) {
        h.openUntil = Date.now() + MODEL_HEALTH_COOLDOWN_MS;
        console.warn(`🩺 [模型健康] ${key} 连续失败 ${h.fails} 次（原因=${h.lastReason}）→ 熔断 ${Math.round(MODEL_HEALTH_COOLDOWN_MS / 1000)}s，期间跳过该模型（不再白等它的超时）`);
    }
    modelHealthMap.set(key, h);
}

function noteModelSuccess(cfg) {
    const key = modelHealthKey(cfg);
    const h = modelHealthMap.get(key) || { fails: 0, openUntil: 0, lastReason: null, lastFailAt: 0, lastOkAt: 0, totalFails: 0, totalOk: 0 };
    h.fails = 0;
    h.openUntil = 0;
    h.totalOk += 1;
    h.lastOkAt = Date.now();
    modelHealthMap.set(key, h);
}

function getModelHealth() {
    const out = {};
    // 先把降级链里的模型都列出来（健康但从未失败过的模型也要能在 /health 里看到「正常」）
    [MODEL_CONFIGS.article.primary, MODEL_CONFIGS.article.fallback].forEach(function (cfg) {
        const key = modelHealthKey(cfg);
        if (!out[key]) {
            out[key] = { configured: !!cfg.apiKey, coolingDown: false, remainingMs: 0, consecutiveFails: 0, totalFails: 0, totalOk: 0, lastReason: null };
        }
    });
    modelHealthMap.forEach(function (h, k) {
        out[k] = {
            configured: !!(out[k] && out[k].configured),
            coolingDown: h.openUntil > Date.now(),
            remainingMs: Math.max(0, h.openUntil - Date.now()),
            consecutiveFails: h.fails,
            totalFails: h.totalFails,
            totalOk: h.totalOk,
            lastReason: h.lastReason
        };
    });
    return out;
}

function resetModelHealth() {
    const before = getModelHealth();
    modelHealthMap.clear();
    console.log('🩺 [模型健康] 已手动复位');
    return before;
}

// 模型降级链执行器：GLM 主 → DeepSeek 降级，全失败抛错（每个任务独立降级）
// 会跳过「无 Key」与「冷却中」的模型；若全部都在冷却中，则退回完整链路（避免永久不调用）
async function runWithModelFallback(runModel) {
    const chain = [MODEL_CONFIGS.article.primary, MODEL_CONFIGS.article.fallback];
    const chainNames = ['GLM(主模型)', 'DeepSeek(降级模型)'];
    const withKey = [];
    for (let i = 0; i < chain.length; i++) {
        if (!chain[i].apiKey) {
            console.warn(`⏭️ 降级链 ${chainNames[i]} 无 API Key，跳过`);
            continue;
        }
        withKey.push(i);
    }
    const healthy = withKey.filter(i => !isModelCoolingDown(chain[i]));
    const order = healthy.length ? healthy : withKey;
    if (healthy.length < withKey.length) {
        console.warn(`🩺 模型熔断生效：跳过 ${withKey.filter(i => !healthy.includes(i)).map(i => chainNames[i]).join('、')}（冷却中）→ 本轮只用 ${order.map(i => chainNames[i]).join(' → ')}`);
    }
    if (!order.length) throw new Error('未配置任何可用的文章分析模型（ARTICLE_API_KEY / DEEPSEEK_API_KEY 均为空）');

    let lastErr = null;
    for (let k = 0; k < order.length; k++) {
        const i = order[k];
        const cfg = chain[i];
        const attemptStartAt = Date.now();
        try {
            const result = await runModel(cfg);
            noteModelSuccess(cfg);
            return { result, model: cfg.model, elapsed: Date.now() - attemptStartAt };
        } catch (err) {
            lastErr = err;
            noteModelFailure(cfg, err);
            console.warn(`🔄 模型降级 | ${cfg.model} 失败(原因=${llmErrorReason(err)} | 本次耗时=${Date.now() - attemptStartAt}ms)${k < order.length - 1 ? ' → 切换 ' + chainNames[order[k + 1]] : ' → 进入降级方案'}`);
        }
    }
    throw lastErr || new Error('GLM 与 DeepSeek 均失败');
}

/**
 * 句子翻译任务：输入文章，输出 sentenceList（句子 + 翻译）
 * 独立降级：GLM → DeepSeek → 兜底（模拟句子）
 */
async function analyzeSentencesWithCoze(article, title, onProgress) {
    const totalLen = (article || '').length;
    const timeoutMs = getArticleTimeoutMs(totalLen);
    const requestStartAt = Date.now();

    const hasAnyKey = !!(MODEL_CONFIGS.article.primary.apiKey || MODEL_CONFIGS.article.fallback.apiKey);
    if (!hasAnyKey) {
        console.warn('⚠️ [句子翻译] 未配置 API Key，返回模拟句子');
        if (onProgress) onProgress(20, '正在处理...');
        await new Promise(r => setTimeout(r, 300));
        return { sentenceList: generateMockSentenceList(article) };
    }

    console.log(`📏 [句子翻译] 启动 | 文章长度: ${totalLen} | 超时: ${timeoutMs / 1000} 秒${totalLen > 5000 ? '（>5000：2分钟）' : '（≤5000：1分钟）'}`);
    try {
        const { result, model, elapsed } = await runWithModelFallback((cfg) => {
            const system = getSentenceSystemPrompt(cfg.model);
            const promptType = getArticlePromptType(cfg.model);
            console.log(`🧭 [句子翻译] 使用模型: ${cfg.model} | Prompt 类型: ${promptType} | baseUrl: ${cfg.baseUrl}`);
            return runSentenceBatchesWithFallback(article, title, cfg, system, timeoutMs, onProgress);
        });
        console.log(`✅ [句子翻译] 成功 | 模型: ${model} | 耗时: ${elapsed}ms | 句子: ${(result.sentenceList || []).length}`);
        return result;
    } catch (err) {
        console.error(`❌ [句子翻译] 全部模型失败 | 总耗时: ${Date.now() - requestStartAt}ms | ${err.message}`);
        throw err;
    }
}

/**
 * 单词释义任务：输入文章 + cached_words，输出 wordList（单词 + 释义 + sentenceIndex）
 * 独立降级：GLM → DeepSeek → 兜底（空，缓存释义兜底）
 */
async function analyzeWordsWithCoze(article, title, cachedWords, onProgress) {
    const totalLen = (article || '').length;
    const timeoutMs = getArticleTimeoutMs(totalLen);
    const requestStartAt = Date.now();

    // 缓存优先：统计已缓存词（有释义的词 AI 会跳过），打印命中率
    const allWords = extractWords(article);
    const cachedWordSet = new Set(Array.isArray(cachedWords) ? cachedWords : []);
    const cachedHits = allWords.filter(w => cachedWordSet.has(w)).length;
    console.log(`🗂️ [单词释义][缓存优先] 唯一词: ${allWords.length} | 已缓存(跳过AI): ${cachedHits} | 需AI: ${allWords.length - cachedHits}`);

    const hasAnyKey = !!(MODEL_CONFIGS.article.primary.apiKey || MODEL_CONFIGS.article.fallback.apiKey);
    if (!hasAnyKey) {
        console.warn('⚠️ [单词释义] 未配置 API Key，返回空（缓存释义兜底）');
        return { wordList: {}, rawWordList: [] };
    }

    console.log(`📏 [单词释义] 启动 | 文章长度: ${totalLen} | 超时: ${timeoutMs / 1000} 秒`);
    try {
        const { result, model, elapsed } = await runWithModelFallback((cfg) => {
            const system = getWordSystemPrompt(cfg.model);
            const promptType = getArticlePromptType(cfg.model);
            console.log(`🧭 [单词释义] 使用模型: ${cfg.model} | Prompt 类型: ${promptType} | baseUrl: ${cfg.baseUrl}`);
            return runWordBatchesWithFallback(article, title, cfg, system, cachedWords, timeoutMs, onProgress);
        });
        const rawWordList = (result && result.rawWordList) || [];
        const wordList = normalizeWordList(rawWordList);
        console.log(`✅ [单词释义] 成功 | 模型: ${model} | 耗时: ${elapsed}ms | 提取词: ${rawWordList.length}`);
        return { wordList, rawWordList };
    } catch (err) {
        console.error(`❌ [单词释义] 全部模型失败 | 总耗时: ${Date.now() - requestStartAt}ms | ${err.message}`);
        throw err;
    }
}

/**
 * 兼容旧调用：并行跑「句子翻译 + 单词释义」两个任务再合并为旧返回结构
 * 供 SSE 同步路径（server.js /api/analyze）复用，避免重复改造
 */
async function analyzeArticleWithCoze(article, title, cachedWords, onProgress) {
    const requestStartAt = Date.now();
    const hasAnyKey = !!(MODEL_CONFIGS.article.primary.apiKey || MODEL_CONFIGS.article.fallback.apiKey);
    if (!hasAnyKey) {
        console.warn('⚠️ 未配置 ARTICLE_API_KEY / DEEPSEEK_API_KEY，使用模拟数据返回');
        if (onProgress) onProgress(80, '正在处理 AI 返回结果...');
        await new Promise(r => setTimeout(r, 500));
        return generateMockResult(article, title);
    }

    const [sentenceRes, wordRes] = await Promise.allSettled([
        analyzeSentencesWithCoze(article, title, onProgress),
        analyzeWordsWithCoze(article, title, cachedWords, onProgress)
    ]);
    const sentenceFailed = sentenceRes.status === 'rejected';
    const wordFailed = wordRes.status === 'rejected';
    if (sentenceFailed && wordFailed) {
        const reason = sentenceRes.reason || wordRes.reason;
        const msg = (reason && reason.message) || String(reason) || '句子翻译与单词释义均失败';
        console.error(`❌ [article_word_analyzer] 句子+单词均失败:`, msg);
        throw (reason instanceof Error ? reason : new Error(msg));
    }
    const sentenceList = sentenceFailed ? [] : (sentenceRes.value.sentenceList || []);
    const wordResult = wordFailed ? { wordList: {}, rawWordList: [] } : wordRes.value;
    const wordList = wordResult.wordList || {};
    const wordContextList = buildWordContextFromSentenceIndex(wordResult.rawWordList || [], sentenceList);
    console.log(`✅ [article_word_analyzer] 完成（兼容合并）| 总耗时: ${Date.now() - requestStartAt}ms | 句子: ${sentenceList.length} | 词: ${Object.keys(wordList).length}`);
    return {
        title: title || '用户上传文章',
        description: '用户上传的英语文章',
        level: article.length > 3000 ? 'high' : 'middle',
        levelLabel: article.length > 3000 ? '高中' : '初中',
        article: article,
        wordList: wordList,
        wordContextList: wordContextList,
        sentenceList: sentenceList,
        questions: []
    };
}

/**
 * 调用 quiz_generator 工作流生成题目（与 article_word_analyzer 并行调用）
 * @param {string} content - 文章正文
 * @param {string} title - 文章标题
 * @param {number} questionCount - 题目数量
 * @returns {Promise<object>} { questions, total_questions, success }
 */
async function generateQuestionsWithCoze(content, title, questionCount) {
    const hasAnyKey = !!(MODEL_CONFIGS.article.primary.apiKey || MODEL_CONFIGS.article.fallback.apiKey);
    if (!hasAnyKey) {
        console.warn('⚠️  未配置 GLM_FLASH_API_KEY / DEEPSEEK_API_KEY，跳过 quiz_generator');
        return { questions: [], total_questions: 0, success: false };
    }

    const contentToSend = (content || '').substring(0, 8000);
    console.log(`📏 [quiz_generator] 原文长度: ${(content || '').length} 字符 | 发送长度: ${contentToSend.length} 字符 | ${(content || '').length === contentToSend.length ? '未截断' : '已截断'}`);

    const requestStartAt = Date.now();
    console.log(`🚀 [quiz_generator] 开始调用 LLM | 请求开始时间: ${new Date(requestStartAt).toISOString()} | question_count: ${questionCount || 4}`);

    try {
        // 走 GLM → DeepSeek 模型降级链（与句子翻译/单词释义同一套）。
        // 旧实现只用单个模型、且把「解析失败」吞成 success:true —— 模型答非所问时没人兜底。
        const { result, model, elapsed } = await runWithModelFallback(
            (cfg) => runQuizOnce(cfg, contentToSend, title)
        );
        console.log(`✅ [quiz_generator] 调用成功 | 模型: ${model} | 耗时: ${elapsed}ms | 返回题数: ${result.questions.length}`);
        return { questions: result.questions, total_questions: result.questions.length, success: true };
    } catch (err) {
        const elapsed = Date.now() - requestStartAt;
        console.error(`❌ [quiz_generator] 全部模型失败 | 总耗时: ${elapsed}ms | 错误: ${err.message}`);
        throw err;
    }
}

/**
 * 单模型跑一次 quiz_generator：调用 → 打印**完整原始返回** → 解析 → 校验。
 * 任何一步不通过都抛错（交给模型降级链重试），绝不返回「0 题的 success」。
 *
 * 2026-10-08 重写背景（用户报「题目生成返回 0 题 → 无可用题目，使用降级题目」）：
 *   旧实现在 JSON 解析失败时只打一句 warn，然后 `rawQuestions = []` → 返回 0 题 + success:true。
 *   后果不只是「题目没了」：queue 静默换成降级题，前端按题目里的 isFallback 标记进入
 *   「降级划选答题模式」(fallbackQuizActive=true)，而该模式会**顺带禁用正文单词的拖拽收藏**
 *   —— 用户看到的第二个毛病（不能拖拽收藏）就是这么来的。
 */
async function runQuizOnce(cfg, contentToSend, title) {
    console.log(`🧭 [quiz_generator] 使用模型: ${cfg.model} | baseUrl: ${cfg.baseUrl}`);

    const { content: answer, elapsed } = await callLLM({
        apiKey: cfg.apiKey,
        baseUrl: cfg.baseUrl,
        model: cfg.model,
        messages: [
            { role: 'system', content: SYSTEM_PROMPT_QUIZ },
            { role: 'user', content: `标题：${title || '用户上传文章'}\n\n文章内容：\n${contentToSend}` }
        ],
        tag: 'quiz_generator'
    });

    // ★ 用户明确要求：把 quiz_generator 的**完整返回**打出来，
    //   这样才能一眼分辨「AI 没返回」还是「返回了但解析失败」。
    const raw = String(answer == null ? '' : answer);
    const PREVIEW = 4000;
    console.log(`📨 [quiz_generator] 原始返回 | 模型=${cfg.model} | 耗时=${elapsed}ms | 长度=${raw.length} 字符`);
    console.log('📨 [quiz_generator] ── 原始返回全文 开始 ──\n'
        + (raw.length > PREVIEW ? raw.slice(0, PREVIEW) + `\n…（其余 ${raw.length - PREVIEW} 字符已省略）` : raw)
        + '\n📨 [quiz_generator] ── 原始返回全文 结束 ──');

    if (!raw.trim()) {
        const e = new Error(`quiz_generator 返回空内容（AI 没返回任何内容）| 模型=${cfg.model}`);
        e.quizEmpty = true;
        throw e;
    }

    let data = null;
    let parseErr = null;
    try { data = JSON.parse(extractJSON(raw)); } catch (e) { parseErr = e; }

    if (data == null || typeof data !== 'object') {
        const why = parseErr
            ? `JSON 解析失败（${parseErr.message}）`
            : '响应不是 JSON';
        const e = new Error(`quiz_generator 响应不可用：${why} | 模型=${cfg.model} | 原始前 200 字：${raw.slice(0, 200)}`);
        e.quizParseFailure = true;
        throw e;
    }

    // 兼容：模型偶尔直接返回数组（题目列表）而不是 { questions: [...] }
    let rawQuestions;
    if (Array.isArray(data)) {
        console.warn('⚠️ [quiz_generator] 响应是数组而非 { questions: [...] } → 按题目列表兼容处理');
        rawQuestions = data;
    } else {
        rawQuestions = Array.isArray(data.questions) ? data.questions : [];
    }
    const fieldList = Array.isArray(data) ? '(数组)' : Object.keys(data).join(', ');
    console.log(`🧾 [quiz_generator] 解析结果 | 顶层字段=[${fieldList}] | questions 条数=${rawQuestions.length}`
        + ` | total_questions=${(data && data.total_questions !== undefined && !Array.isArray(data)) ? data.total_questions : '(无)'}`);

    if (rawQuestions.length === 0) {
        const e = new Error(`quiz_generator 返回 0 题（响应 ${raw.length} 字符，顶层字段=[${fieldList}]，questions 为空）| 模型=${cfg.model}`);
        e.quizEmpty = true;
        throw e;
    }

    // 打印每道题的 question 与 answer 字段，便于确认答案是否全 A
    console.log('📝 [quiz_generator] 逐题 question / answer:');
    rawQuestions.forEach((q, i) => {
        if (!q || typeof q !== 'object') { console.warn(`   ${i + 1}. ⚠️ 不是对象：${JSON.stringify(q).slice(0, 80)}`); return; }
        const text = q.question || q.text || '';
        const ans = (q.answer !== undefined && q.answer !== null)
            ? q.answer
            : (q.answer_index !== undefined ? String.fromCharCode(65 + Number(q.answer_index)) : '(无)');
        console.log(`   ${i + 1}. ${text} → answer: ${ans}`);
    });

    const questions = normalizeQuestions(rawQuestions);

    // 归一化后再兜一道：题干全空的题目对用户毫无价值，等同于 0 题
    const usable = questions.filter(q => String((q && q.question) || '').trim());
    if (usable.length === 0) {
        const e = new Error(`quiz_generator 返回 ${rawQuestions.length} 条但题干全为空（question/text 缺失）→ 判定失败 | 模型=${cfg.model}`);
        e.quizEmpty = true;
        throw e;
    }
    if (usable.length < questions.length) {
        console.warn(`⚠️ [quiz_generator] ${questions.length - usable.length} 条题目题干为空，已丢弃（保留 ${usable.length} 条）`);
    }

    return { questions: usable };
}

// ---- L3（AI 兜底释义）超时策略 ----
// 点词是「在线交互」路径：用户点一下，必须在可接受的时间内出结果或明确失败。
// callLLM 的默认 timeout 是 600s、maxRetries 是 2 —— 那对批量分析合适，对点词就是「卡死」。
// 实测（2026-09-30）：GLM glm-5.3-flash 单词释义单次往返约 4s，偶发 12s+（含 reasoning）。
// 故这里单独收紧：默认 20s 超时、只试 1 次（失败就让前端用本地释义兜底，不再叠加等待）。
const WORD_MEANING_TIMEOUT_MS = Math.max(3000, Number(process.env.COZE_WORD_MEANING_TIMEOUT_MS) || 20000);
const WORD_MEANING_MAX_RETRIES = Math.max(1, Number(process.env.COZE_WORD_MEANING_MAX_RETRIES) || 1);

/**
 * 批量调用 word_meaning_generator 工作流补全语境释义
 * @param {string[]} wordList - 单词数组
 * @param {string[]} contextList - 与 wordList 一一对应的语境句子数组
 * @returns {Promise<object[]>} [{word, context, definition, isAcademic}]；未配置或失败返回 []
 */
async function generateWordMeaningsWithCoze(wordList, contextList) {
    if (!MODEL_CONFIGS.word_meaning.apiKey) {
        console.warn('⚠️  未配置 GLM_FLASH_API_KEY / DEEPSEEK_API_KEY，跳过语境释义补全');
        return [];
    }
    if (!Array.isArray(wordList) || wordList.length === 0) return [];

    const contextArr = Array.isArray(contextList) ? contextList : [];
    console.log(`🔗 批量调用 word_meaning_generator (LLM): 单词数=${wordList.length} | 超时=${WORD_MEANING_TIMEOUT_MS}ms | 最多尝试 ${WORD_MEANING_MAX_RETRIES} 次`);

    const userPrompt = wordList.map((w, i) => `${w} | ${contextArr[i] || ''}`).join('\n');
    const llmStartAt = Date.now();

    try {
        const { content } = await callLLM({
            ...MODEL_CONFIGS.word_meaning,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT_WORD_MEANING },
                { role: 'user', content: userPrompt }
            ],
            // 点词是「在线交互」场景：必须给一个能兜住的最长等待，不能沿用 callLLM 默认的 600s
            timeoutMs: WORD_MEANING_TIMEOUT_MS,
            maxRetries: WORD_MEANING_MAX_RETRIES,
            tag: 'word_meaning_generator'
        });
        console.log(`⏱️ [word_meaning_generator] LLM 往返耗时 ${Date.now() - llmStartAt}ms`);

        let data = null;
        try {
            data = JSON.parse(extractJSON(content));
        } catch (e) {
            console.warn('⚠️ word_meaning_generator JSON 解析失败:', e.message);
            data = null;
        }
        if (!data || typeof data !== 'object') return [];

        const outList = Array.isArray(data) ? data : (data.wordList || data.wordlist || data.words || []);
        if (!Array.isArray(outList)) return [];

        const result = [];
        for (const item of outList) {
            if (!item || typeof item !== 'object') continue;
            const w = (item.word || '').toString().toLowerCase().trim();
            const ctx = (item.context || '').toString().trim();
            const def = (item.definition || item.meaning || '').toString().trim();
            if (!w || !def) continue;
            result.push({ word: w, context: ctx, definition: def, isAcademic: !!(item.isAcademic || item.is_academic) });
        }
        console.log('✅ word_meaning_generator 返回', result.length, '条释义', `| 总耗时 ${Date.now() - llmStartAt}ms`);
        return result;
    } catch (err) {
        console.error(`❌ word_meaning_generator 异常 | 耗时 ${Date.now() - llmStartAt}ms | ${err.message}`);
        return [];
    }
}

function parseAIResponse(answer, fallbackArticle, fallbackTitle) {
    let jsonStr = answer.trim();
    const jsonMatch = answer.match(/\{[\s\S]*\}/);
    if (jsonMatch) jsonStr = jsonMatch[0];

    try {
        const parsed = JSON.parse(jsonStr);
        console.log('📄 Coze 返回顶层字段:', Object.keys(parsed).join(', '));
        const sentenceList = parsed.sentenceList || parsed.sentences || parsed.translations || [];
        const rawWordList = parsed.wordList || parsed.wordlist || parsed.words || parsed.vocabulary || null;

        let normalizedWordList, wordContextList;
        if (Array.isArray(rawWordList)) {
            // 新结构：wordList 数组（元素含 sentenceIndex），用 sentenceIndex 关联 sentenceList
            console.log('🔍 Coze 返回 wordList 数组：', rawWordList.length, '词；sentenceList ', sentenceList.length, '句；首词=', JSON.stringify(rawWordList[0]));
            normalizedWordList = normalizeWordList(rawWordList);
            wordContextList = buildWordContextFromSentenceIndex(rawWordList, sentenceList);
        } else {
            console.log('🔍 Coze 返回 wordList 原始结构:',
                rawWordList === null ? 'null'
                    : Array.isArray(rawWordList) ? `数组(${rawWordList.length}项) 首项=${JSON.stringify(rawWordList[0])}`
                    : `对象(${Object.keys(rawWordList).length}键) 样例键=${JSON.stringify(Object.keys(rawWordList).slice(0, 5))}`);
            normalizedWordList = normalizeWordList(rawWordList || {});
            wordContextList = extractWordContextList(parsed);
        }
        console.log('🔍 归一化后 wordList 前 5 条:', JSON.stringify(Object.entries(normalizedWordList).slice(0, 5)));
        console.log('🔍 wordContextList 条数:', wordContextList.length, '首条=', JSON.stringify(wordContextList[0] || null));
        return {
            title: parsed.title || fallbackTitle || '用户上传文章',
            description: parsed.description || parsed.summary || '用户上传的英语文章',
            level: parsed.level || 'middle',
            levelLabel: parsed.levelLabel || getLevelLabel(parsed.level),
            article: parsed.article || fallbackArticle,
            wordList: normalizedWordList,
            wordContextList: wordContextList,
            sentenceList: sentenceList,
            questions: normalizeQuestions(parsed.questions || parsed.quiz || [])
        };
    } catch (e) {
        console.warn('⚠️  JSON 解析失败，使用正则提取:', e.message);
        const wordList = {};
        const wordPattern = /["']?([a-zA-Z\s'-]+)["']?\s*[:：]\s*["']([^"']+)["']/g;
        let match;
        while ((match = wordPattern.exec(answer)) !== null) {
            const word = match[1].trim().toLowerCase();
            if (word.length >= 3 && word.length <= 30) wordList[word] = match[2];
        }
        return {
            title: fallbackTitle || '用户上传文章',
            description: '用户上传的英语文章',
            level: 'middle',
            levelLabel: '自定义',
            article: fallbackArticle,
            wordList: Object.keys(wordList).length > 0 ? wordList : generateMockWordList(fallbackArticle),
            wordContextList: [],
            sentenceList: generateMockSentenceList(fallbackArticle),
            questions: []
        };
    }
}

// 统一 questions 格式：options 为数组，answer_index 为数字
function normalizeQuestions(questions) {
    if (!Array.isArray(questions)) return [];
    return questions.map(q => {
        // 兼容 options 为对象 {A,B,C,D} 的情况
        let options = q.options;
        if (options && typeof options === 'object' && !Array.isArray(options)) {
            const keys = Object.keys(options).sort();
            options = keys.map(k => options[k]);
        }

        // 正确答案统一转成 0-based 下标。
        // Coze 返回的是 answer 字段（"A"/"B"/"C"/"D" 或数字），不是 answer_index，
        // 之前只在 options 为对象时才转，导致 options 为数组时 answer_index 全为 0（前端全显示 A）。
        let answerIndex = q.answer_index;
        if (typeof answerIndex !== 'number') {
            if (typeof q.answer === 'number') {
                answerIndex = q.answer;
            } else if (typeof q.answer === 'string' && q.answer.trim() !== '') {
                const s = q.answer.trim();
                const ch = s.toUpperCase().charCodeAt(0);
                if (ch >= 65 && ch <= 90) {
                    answerIndex = ch - 65; // 'A'→0, 'B'→1 ...
                } else if (/^\d+$/.test(s)) {
                    answerIndex = parseInt(s, 10);
                }
            }
        }

        return {
            type: q.type || 'DETAIL',
            question: q.question || q.text || '',
            options: Array.isArray(options) ? options : [],
            answer_index: typeof answerIndex === 'number' ? answerIndex : 0,
            explanation: q.explanation || ''
        };
    });
}

function getLevelLabel(level) {
    const labels = { 'middle': '初中', 'high': '高中', 'a2': 'A2', 'b1': 'B1', 'c1': 'C1' };
    return labels[level] || '自定义';
}

function isCozeConfigured() {
    return !!(MODEL_CONFIGS.article.primary.apiKey || MODEL_CONFIGS.article.fallback.apiKey);
}

// ====================================================================================
// ==================== Coze 知识库（Knowledge Base）接入 ==============================
// ====================================================================================
/**
 * 用途（2026-09-28 起：知识库改为【手动同步】+ L1 改为【工作流检索】）：
 *   1) 在线查词 L1：lookupWordWithLayers() 第一层 → searchKnowledgeBase()
 *      → 调 Coze 工作流 word_context_search（POST /v1/workflow/run），由工作流内部检索知识库
 *   2) 导出 CSV：export_csv.js → buildWordContextCsv()
 *   3) 查询对账：sync_to_knowledge.js --verify → searchKnowledgeBase()
 *   4) 自动上传：uploadToKnowledgeBase() / probeContentMode() / prune...()     ← 已停用（见下方 ⛔ 区块）
 *      改为人工：跑 export_csv.js 导出 → 在 Coze 控制台手动上传 CSV → 再跑
 *      `node sync_to_knowledge.js --mark-synced` 让本地待同步计数归零。
 *
 * 为什么 L1 不再直连知识库 HTTP 接口（2026-09-28 变更）：
 *   `POST /open_api/knowledge/document/search` 在 api.coze.cn 上是「网关级 404」——该路径根本不存在，
 *   官方文档里也没有这个接口。结果是每点一次词都要白跑一趟（70~115ms）再回落到 L2/L3。
 *   改为调用「word_context_search 工作流」后：
 *     · 权限点从「知识库 document.* 」变成「工作流 workflow.run」；
 *     · 知识库的检索参数（top_k / 阈值 / 语义 or 全文）由工作流内部决定，代码侧只管传 query。
 *
 * 配置（.env）：
 *   COZE_KB_ID                  知识库 ID（仅用于日志/诊断；工作流形态下不参与调用）
 *   COZE_KB_API_KEY             Coze 个人令牌 PAT（需具备 workflow.run 权限点）
 *   COZE_KB_BASE_URL            API 域名，默认 https://api.coze.cn
 *   COZE_KB_SEARCH_WORKFLOW_ID  word_context_search 工作流的 ID  ← L1 的核心开关，不填则跳过 L1
 * 可选调优项见下方 KB_* 常量。
 */

const KB_ID = (process.env.COZE_KB_ID || '').trim();
// 令牌：优先 COZE_KB_API_KEY；缺省回落到通用的 COZE_API_TOKEN（两者常是同一个 PAT）
const KB_API_KEY = (process.env.COZE_KB_API_KEY || process.env.COZE_API_TOKEN || '').trim();
// 容错：.env 里写成 "COZE_KB_BASE_URL= https://api.coze.cn"（等号后带空格）也能正常工作
const KB_BASE_URL = (process.env.COZE_KB_BASE_URL || 'https://api.coze.cn').trim().replace(/\/+$/, '');

// ---- L1 检索形态：Coze 工作流（2026-09-28 起）----
const KB_SEARCH_WORKFLOW_ID = (process.env.COZE_KB_SEARCH_WORKFLOW_ID || '').trim();
const KB_WORKFLOW_PATH = process.env.COZE_KB_WORKFLOW_PATH || '/v1/workflow/run';
// 工作流「开始节点」里接收查询的入参名。默认 query；若你的工作流入参叫 input/q 等，改这里即可
const KB_WORKFLOW_QUERY_PARAM = process.env.COZE_KB_WORKFLOW_QUERY_PARAM || 'query';
// 可选：含数据库节点 / 变量节点的工作流必须关联智能体，此时填 Bot ID
const KB_WORKFLOW_BOT_ID = (process.env.COZE_KB_WORKFLOW_BOT_ID || '').trim();
// 工作流单次调用超时。官方说明：非流式接口 90 秒内无响应会被网关断开，默认 30s 已足够宽松
const KB_WORKFLOW_TIMEOUT_MS = Number(process.env.COZE_KB_WORKFLOW_TIMEOUT_MS) || 30000;

// ---- L1 query 形态（2026-09-29 实测后新增）----
// 背景：工作流恒返回 3 条（入参 top_k 不生效，是节点里写死的），而 word_context 里
// 同一句 context 被该句所有词共享 → 拿「词 + 整句」去查，top-3 常被同句的「兄弟词」占满，
// 目标词反被挤掉。实测 20 词样本（2026-09-29）：
//     只用 word 单独  = 16/20 (80%)，平均 506ms
//     word,context   =  5/20 (25%)，平均 712ms
//     两者仅 3/20 重叠 → 串行两轮达 18/20 (90%)，平均约 649ms（第二轮只在第一轮未中时才打）
// 取值：
//   two_step（默认）先 word 单独，未中再试 word,context —— 命中率最高
//   word            只打 word 单独 —— 延迟最低
//   legacy          沿用老的「word + 空格 + context」单轮 —— 兼容旧行为
const KB_QUERY_MODE = (process.env.COZE_KB_QUERY_MODE || 'two_step').toLowerCase();

// ⛔ 已废弃（2026-09-28）：L1 改用工作流后，直连知识库的检索路径不再使用。
//    保留此行仅为留档 —— 若哪天要退回「直连知识库」形态，放开注释并把 searchKnowledgeBase 里的调用换回来。
// const KB_SEARCH_PATH = process.env.COZE_KB_SEARCH_PATH || '/open_api/knowledge/document/search';

const KB_CREATE_PATH = process.env.COZE_KB_CREATE_PATH || '/open_api/knowledge/document/create';
// ---- 上传接口形态（style）----
// 'v1'       POST {BASE}/v1/datasets/{dataset_id}/documents   body = { documents: [{ name, content, file_type }] }
// 'open_api' POST {BASE}/open_api/knowledge/document/create   body = { dataset_id, format_type, chunk_strategy, document_bases[].source_info.file_base64 }
const KB_UPLOAD_STYLE = (process.env.COZE_KB_UPLOAD_STYLE || 'v1').toLowerCase();
// v1 形态的路径模板，{dataset_id} 会被替换。若你的控制台给出的路径不同，改 .env 即可，不用动代码
const KB_DOCUMENTS_PATH_TEMPLATE = process.env.COZE_KB_DOCUMENTS_PATH || '/v1/datasets/{dataset_id}/documents';
// 列出 / 删除知识库文档（仅用于清理自动同步产生的旧文档）
const KB_LIST_PATH = process.env.COZE_KB_LIST_PATH || '/open_api/knowledge/document/list';
const KB_DELETE_PATH = process.env.COZE_KB_DELETE_PATH || '/open_api/knowledge/document/delete';
// content 字段的编码方式：text（明文）/ base64 / auto（先探测，结果由调用方持久化）
const KB_CONTENT_MODE = (process.env.COZE_KB_CONTENT_MODE || 'auto').toLowerCase();
// 自动同步文档的命名前缀。清理时【只】允许删除这两个前缀的文档，其他文档一律不碰
const KB_AUTO_DOC_PREFIX = process.env.COZE_KB_AUTO_DOC_PREFIX || 'word_context_auto_';
const KB_PROBE_DOC_PREFIX = '__kb_probe_';
const KB_TIMEOUT_MS = Number(process.env.COZE_KB_TIMEOUT_MS) || 15000;            // 旧直连形态的检索超时（留档）
const KB_UPLOAD_TIMEOUT_MS = Number(process.env.COZE_KB_UPLOAD_TIMEOUT_MS) || 120000; // 上传超时（文件较大）
const KB_MAX_RETRIES = Math.max(1, Number(process.env.COZE_KB_MAX_RETRIES) || 3); // 含首次调用（工作流调用也用这个）
// ⚠️ 以下三项是「旧的直连知识库」形态才需要的召回参数；改成工作流后这些值由工作流内部决定，
//    代码不再读取它们。保留声明仅为留档 / 供 listKnowledgeDocuments 等诊断路径参考。
const KB_TOP_K = Number(process.env.COZE_KB_TOP_K) || 5;                          // 召回切片数 1-20
const KB_SCORE_THRESHOLD = process.env.COZE_KB_SCORE_THRESHOLD !== undefined
    ? Number(process.env.COZE_KB_SCORE_THRESHOLD) : 0.2;                          // 相关度阈值 0-1
const KB_QUERY_TYPE = Number(process.env.COZE_KB_QUERY_TYPE) || 0;                // 0 混合 / 1 语义 / 2 全文
// Coze 本地文件仅支持 pdf/txt/doc/docx，故 CSV 内容以 txt 形式上传
const KB_FILE_TYPE = process.env.COZE_KB_FILE_TYPE || 'txt';

const kbSleep = (ms) => new Promise(r => setTimeout(r, ms));
const kbKeyPreview = KB_API_KEY ? (KB_API_KEY.slice(0, 6) + '…(长度' + KB_API_KEY.length + ')') : '(空/未读取)';

console.log(`📚 [知识库] 配置检查 | COZE_KB_ID: ${KB_ID || '(未配置)'} | 令牌: ${kbKeyPreview} | BASE_URL: ${KB_BASE_URL}`);
if (KB_SEARCH_WORKFLOW_ID) {
    console.log(`📚 [知识库] L1 检索形态: 工作流 | POST ${KB_WORKFLOW_PATH} | workflow_id=${KB_SEARCH_WORKFLOW_ID} | 入参名=${KB_WORKFLOW_QUERY_PARAM} | 超时=${KB_WORKFLOW_TIMEOUT_MS}ms | 最多 ${KB_MAX_RETRIES} 次${KB_WORKFLOW_BOT_ID ? ` | bot_id=${KB_WORKFLOW_BOT_ID}` : ''}`);
    console.log(`📚 [知识库] L1 query 形态: ${KB_QUERY_MODE}${KB_QUERY_MODE === 'two_step' ? '（先用 word 单独，未中再试 word,context —— 实测命中率 20%→80%）' : KB_QUERY_MODE === 'word' ? '（只打 word 单独，延迟最低）' : '（沿用旧的「词 + 空格 + 句」单轮）'}`);
} else {
    console.warn('⚠️ [知识库] L1 检索未启用：缺少 COZE_KB_SEARCH_WORKFLOW_ID（在 .env 里填 word_context_search 工作流 ID）→ 点词将直接从 L2 语境库开始');
}
console.log(`📚 [知识库] 同步模式: 手动（node export_csv.js 导出 → 控制台手动上传 CSV）| 代码内的自动上传已停用`);

// L1 检索是否就绪。工作流形态下：工作流 ID + 令牌 + BASE_URL，三者缺一不可。
// （不再要求 COZE_KB_ID —— 那只是知识库 ID，工作流内部自己绑定知识库，调用侧用不到它）
function isKnowledgeBaseConfigured() {
    return !!(KB_SEARCH_WORKFLOW_ID && KB_API_KEY && KB_BASE_URL);
}

// 知识库错误归类，便于日志快速定位
function kbErrorReason(err) {
    if (!err) return '未知错误';
    const msg = String(err.message || err);
    // AbortController 主动中止（单次运行超时）——与网络超时区分开，便于排查
    if (/abort/i.test(msg) && !/network\s*timeout/i.test(msg)) return '已中止(运行超时/取消)';
    if (/timeout|timed\s*out|ETIMEDOUT|ESOCKETTIMEDOUT|超时/i.test(msg)) return '超时';
    if (/业务错误/.test(msg)) return '业务错误(参数/权限/额度)';
    if (/返回\s*429/.test(msg)) return '限流(429)';
    if (/返回\s*5\d\d/.test(msg)) return '服务端错误(5xx)';
    if (/返回\s*4\d\d/.test(msg)) return '客户端错误(4xx)';
    if (/不是合法 JSON/.test(msg)) return '响应解析失败';
    return '网络/其他错误';
}

// 可重试判定：429 / 5xx / 网络超时可重试；4xx、业务错误码、主动中止立即失败
function isRetryableKbError(err) {
    const msg = String((err && err.message) || err);
    // 外层已经判定「本次运行超时」并 abort 了，重试只会白白耗掉时间窗
    if (/abort/i.test(msg) && !/network\s*timeout/i.test(msg)) return false;
    if (/业务错误|不是合法 JSON/.test(msg)) return false;
    if (/返回\s*429/.test(msg)) return true;
    if (/返回\s*5\d\d/.test(msg)) return true;
    if (/返回\s*4\d\d/.test(msg)) return false;
    return true;
}

/**
 * 统一调用 Coze 知识库 OpenAPI：超时 + 指数退避重试 + 详细调用日志
 * 不抛异常，统一返回 { ok, status, data, error, elapsed, attempts }
 */
async function callCozeKnowledgeApi({ path, body, tag = '知识库', timeoutMs = KB_TIMEOUT_MS, maxRetries = KB_MAX_RETRIES, signal }) {
    // 注意：这里只校验「令牌 + BASE_URL」，不校验 isKnowledgeBaseConfigured()。
    // 后者现在代表「L1 检索工作流是否就绪」，而本函数用于直连知识库 OpenAPI（如诊断用的列文档）。
    if (!KB_API_KEY || !KB_BASE_URL) {
        console.warn(`⚠️ [${tag}] 令牌或 BASE_URL 未配置（需要 COZE_KB_API_KEY / COZE_KB_BASE_URL），本次跳过`);
        return { ok: false, error: '未配置令牌 / BASE_URL（COZE_KB_API_KEY、COZE_KB_BASE_URL）', attempts: 0 };
    }
    const url = KB_BASE_URL + path;
    const attempts = Math.max(1, Number(maxRetries) || 1);
    const timeoutMsNum = Number(timeoutMs) || KB_TIMEOUT_MS;

    console.log(`📚 [${tag}] 发起调用 | ${url} | kb_id: ${KB_ID} | token: ${kbKeyPreview} | timeout: ${timeoutMsNum}ms | 最多尝试: ${attempts} 次`);

    let lastErr = null;
    for (let attempt = 0; attempt < attempts; attempt++) {
        const startAt = Date.now();
        try {
            const reqBody = JSON.stringify(body);
            const preview = reqBody.length > 1200 ? reqBody.slice(0, 1200) + `…(截断，总长 ${reqBody.length})` : reqBody;
            console.log(`📤 [${tag}] 第 ${attempt + 1}/${attempts} 次请求体 | ${preview}`);

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${KB_API_KEY}`,
                    'Content-Type': 'application/json',
                    'Agw-Js-Conv': 'str'   // 官方要求：避免大整数 ID 精度丢失
                },
                body: reqBody,
                timeout: timeoutMsNum,
                signal                 // 单次运行的硬超时（AbortController）透传，让在途请求真正结束
            });
            const elapsed = Date.now() - startAt;
            const text = await response.text();
            console.log(`📥 [${tag}] 收到响应 | status: ${response.status} | ok: ${response.ok} | 耗时: ${elapsed}ms | 体积: ${text.length} 字节`);

            if (!response.ok) throw new Error(`返回 ${response.status}: ${text.substring(0, 300)}`);

            let data = null;
            try {
                data = JSON.parse(text);
            } catch (e) {
                throw new Error(`不是合法 JSON: ${text.substring(0, 200)}`);
            }
            // Coze 业务错误码：code 非 0 视为失败
            if (data && data.code !== undefined && Number(data.code) !== 0) {
                throw new Error(`业务错误 code=${data.code} msg=${data.msg || '(无)'}`);
            }
            const logid = (data && data.detail && data.detail.logid) || 'N/A';
            console.log(`✅ [${tag}] 调用成功 | 耗时: ${elapsed}ms | logid: ${logid}`);
            return { ok: true, status: response.status, data, elapsed, attempts: attempt + 1 };
        } catch (err) {
            lastErr = err;
            const reason = kbErrorReason(err);
            const errMsg = (err && err.message) ? err.message : String(err);
            const usedMs = Date.now() - startAt;
            if (attempt + 1 < attempts && isRetryableKbError(err)) {
                const backoff = 1000 * Math.pow(2, attempt); // 1s → 2s → 4s
                console.warn(`⏳ [${tag}] 第 ${attempt + 1}/${attempts} 次失败（原因=${reason} | 耗时=${usedMs}ms），${backoff}ms 后重试: ${errMsg}`);
                await kbSleep(backoff);
                continue;
            }
            console.error(`❌ [${tag}] 调用失败 | 原因=${reason} | 已尝试 ${attempt + 1}/${attempts} 次 | 耗时=${usedMs}ms | 错误: ${errMsg}`);
            break;
        }
    }
    return { ok: false, error: (lastErr && lastErr.message) || String(lastErr), attempts };
}

// ==================== Coze 工作流调用（L1 检索专用） ====================

// 常见业务错误码 → 人话提示。命中时直接打进日志，省得每次去翻官方文档。
const KB_WORKFLOW_CODE_HINTS = {
    4000: '请求参数错误（检查入参名/类型是否与工作流「开始节点」一致；入参名由 COZE_KB_WORKFLOW_QUERY_PARAM 决定）',
    4009: '工作流执行失败（打开 debug_url 看是哪个节点报错）',
    4100: '鉴权失败（PAT 无效/过期，或与工作流不在同一空间）',
    4101: '无权限（PAT 缺少 workflow.run 权限点，或未被授权访问该空间/工作流）',
    4102: '入参类型不匹配（开始节点要求 string 却传了对象等）',
    // 实测（2026-09-28）：workflow_id 不存在时，接口返回的是 4200 + "Workflow not found"，不是 4201
    4200: '工作流不存在或未发布（核对 workflow_id；且必须在 Coze 控制台「发布」过才能通过 API 执行）',
    4201: '工作流不存在（COZE_KB_SEARCH_WORKFLOW_ID 填错了）',
    // 实测（2026-09-30）：账户额度/免费额度耗尽时，工作流接口返回 200 + code 4028，
    // data 为空。这不是代码/配置问题，重试也解决不了 —— 只能充值或等额度刷新。
    4028: 'Coze 账户额度不足（免费额度/余额已耗尽）→ 需要充值或等额度刷新；在此之前 L1 会持续失败，点词自动走 L2 语境库 / L3 AI',
    6003: '该能力仅付费版套餐可用',
};
function kbWorkflowCodeHint(code) {
    return KB_WORKFLOW_CODE_HINTS[Number(code)] || '';
}

// ---- L1 熔断（circuit breaker）----
// 背景（2026-09-30）：账户额度耗尽（4028）/ 权限不对（4100/4101）/ 工作流没发布（4200/4201）
// 这类错误「重试、换 query 形态都无解」。若不做熔断，每一次点词都会：
//   · 白白打 2 轮工作流（two_step 两轮都失败，约 300ms 纯浪费）；
//   · 在日志里刷两屏同样的报错，把真正有用的信息淹掉。
// 命中这些错误码即「开路」一段时间，期间 L1 直接跳过（统计里记 circuit），
// 到点自动「半开」重试一次；只要有一次成功就立即「合路」恢复正常。
const KB_FATAL_CODES = new Set([4028, 4100, 4101, 4200, 4201, 6003]);
const KB_CIRCUIT_COOLDOWN_MS = Math.max(5000, Number(process.env.COZE_KB_CIRCUIT_COOLDOWN_MS) || 10 * 60 * 1000);

const kbCircuit = {
    openUntil: 0,      // 开路的截止时间戳（0 = 合路）
    code: null,        // 触发熔断的业务错误码
    msg: '',           // 触发时的原始错误信息
    openedAt: 0,       // 首次开路时间
    trips: 0,          // 累计开路次数（排查用）
    lastSkipLogAt: 0,  // 上次打印「已熔断，跳过」的时间（避免每次点词都刷屏）
};

function isKbCircuitOpen() {
    return kbCircuit.openUntil > Date.now();
}

function kbCircuitState() {
    return {
        open: isKbCircuitOpen(),
        code: kbCircuit.code,
        error: kbCircuit.msg,
        hint: kbCircuit.code ? kbWorkflowCodeHint(kbCircuit.code) : '',
        cooldownMs: KB_CIRCUIT_COOLDOWN_MS,
        remainingMs: Math.max(0, kbCircuit.openUntil - Date.now()),
        trips: kbCircuit.trips,
    };
}

// 命中「重试无解」的错误码 → 开路
function openKbCircuit(code, msg) {
    const c = Number(code);
    if (!KB_FATAL_CODES.has(c)) return false;
    const firstTime = !isKbCircuitOpen();
    kbCircuit.openUntil = Date.now() + KB_CIRCUIT_COOLDOWN_MS;
    kbCircuit.code = c;
    kbCircuit.msg = msg || '';
    if (!kbCircuit.openedAt) kbCircuit.openedAt = Date.now();
    kbCircuit.trips++;
    const hint = kbWorkflowCodeHint(c);
    console.error(`🛑 [知识库-L1] 熔断开路 | code=${c}${hint ? ' ← ' + hint : ''} | 冷却 ${Math.round(KB_CIRCUIT_COOLDOWN_MS / 1000)}s 内不再调用 L1（点词直接走 L2/L3）`);
    console.error(`🛑 [知识库-L1] 触发熔断的原始错误: ${kbCircuit.msg}`);
    if (firstTime) console.error('🛑 [知识库-L1] 提示：该错误多为「账户额度/权限/工作流未发布」，代码侧重试与换 query 形态都无效，请先到 Coze 控制台处理');
    return true;
}

// 调用成功 → 立刻合路，恢复正常检索
function closeKbCircuit(reason) {
    if (kbCircuit.openUntil === 0 && kbCircuit.code === null) return;
    console.log(`✅ [知识库-L1] 熔断合路（${reason || '调用成功'}）→ L1 恢复正常检索`);
    kbCircuit.openUntil = 0;
    kbCircuit.code = null;
    kbCircuit.msg = '';
    kbCircuit.openedAt = 0;
}

// 手动复位（排障用：修好额度/权限后不必等冷却）
function resetKbCircuit() {
    const was = kbCircuitState();
    closeKbCircuit('手动复位');
    return was;
}

if (KB_SEARCH_WORKFLOW_ID) {
    console.log(`📚 [知识库] L1 熔断保护: 命中额度/权限/未发布类错误码（${[...KB_FATAL_CODES].join('/')}）即冷却 ${Math.round(KB_CIRCUIT_COOLDOWN_MS / 1000)}s，期间不调用 L1（可用 COZE_KB_CIRCUIT_COOLDOWN_MS 调整）`);
}

console.log(`🩺 [模型健康] 降级链: ${MODEL_CONFIGS.article.primary.model || '(未配置)'}(主) → ${MODEL_CONFIGS.article.fallback.model || '(未配置)'}(降级) | 连续失败 ${MODEL_HEALTH_FAIL_THRESHOLD} 次即熔断 ${Math.round(MODEL_HEALTH_COOLDOWN_MS / 1000)}s（可用 MODEL_HEALTH_COOLDOWN_MS / MODEL_HEALTH_FAIL_THRESHOLD 调整）`);
console.log(`🩺 [模型健康] 超时细分: 整篇调用超时/中断后按 ${CHUNK_TIMEOUT_RETRY_CHARS} 字符细分重试（短文同样生效，可用 CHUNK_TIMEOUT_RETRY_CHARS 调整）`);

/**
 * 调用 Coze 工作流：POST {BASE}/v1/workflow/run，超时 + 指数退避重试 + 详细日志。
 *
 * 返回值里的 data 是「已解析好的工作流输出对象」：官方响应里 data 是 JSON 序列化字符串
 * （如 "{\"word\":\"apple\",\"definition\":\"苹果\"}"），这里顺手 JSON.parse 成对象；
 * 解析失败（部分工作流返回纯文本）时 data 为 null、dataRaw 保留原始字符串。
 * 不抛异常，统一返回 { ok, data, dataRaw, raw, error, errorCode, hint, elapsed, attempts, executeId, debugUrl, cost }
 */
async function callCozeWorkflow({ workflowId, parameters, tag = '工作流', timeoutMs = KB_WORKFLOW_TIMEOUT_MS, maxRetries = KB_MAX_RETRIES, signal, botId = KB_WORKFLOW_BOT_ID }) {
    const wid = String(workflowId || '').trim();
    if (!wid) {
        console.warn(`⚠️ [${tag}] 未配置 workflow_id（COZE_KB_SEARCH_WORKFLOW_ID），本次跳过`);
        return { ok: false, data: null, dataRaw: null, raw: null, error: '未配置工作流 ID（COZE_KB_SEARCH_WORKFLOW_ID）', attempts: 0 };
    }
    if (!KB_API_KEY || !KB_BASE_URL) {
        console.warn(`⚠️ [${tag}] 令牌或 BASE_URL 未配置（COZE_KB_API_KEY / COZE_KB_BASE_URL），本次跳过`);
        return { ok: false, data: null, dataRaw: null, raw: null, error: '未配置令牌 / BASE_URL', attempts: 0 };
    }

    const url = KB_BASE_URL + KB_WORKFLOW_PATH;
    const attempts = Math.max(1, Number(maxRetries) || 1);
    const timeoutMsNum = Number(timeoutMs) || KB_WORKFLOW_TIMEOUT_MS;
    const body = { workflow_id: wid, parameters: parameters || {} };
    // 含数据库节点 / 变量节点的工作流必须关联智能体，否则执行会失败
    if (botId) body.bot_id = botId;

    console.log(`🧩 [${tag}] 发起工作流调用 | ${url} | workflow_id=${wid} | 超时=${timeoutMsNum}ms | 最多尝试 ${attempts} 次`);
    console.log(`📤 [${tag}] 入参 | ${JSON.stringify(body.parameters)}`);

    let lastErr = null;
    let lastCode = null;
    for (let attempt = 0; attempt < attempts; attempt++) {
        const startAt = Date.now();
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${KB_API_KEY}`,
                    'Content-Type': 'application/json',
                    'Agw-Js-Conv': 'str'
                },
                body: JSON.stringify(body),
                timeout: timeoutMsNum,
                signal
            });
            const elapsed = Date.now() - startAt;
            const text = await response.text();
            console.log(`📥 [${tag}] 收到响应 | status: ${response.status} | ok: ${response.ok} | 耗时: ${elapsed}ms | 体积: ${text.length} 字节`);

            let data = null;
            let parseErr = null;
            try { data = JSON.parse(text); } catch (e) { parseErr = e; }

            // HTTP 层失败也要把 body 里的 code/msg 带出来 —— Coze 的鉴权/权限错误就是 4xx + JSON body
            if (!response.ok) {
                const code = data ? data.code : null;
                const msg = (data && data.msg) || text.slice(0, 200);
                lastCode = code;
                throw new Error(`返回 ${response.status}: code=${code === undefined || code === null ? 'N/A' : code} msg=${msg}`);
            }
            if (parseErr) throw new Error(`不是合法 JSON: ${text.substring(0, 200)}`);
            if (data && data.code !== undefined && Number(data.code) !== 0) {
                lastCode = data.code;
                // 错误码释义统一由「失败分支」打印一次，避免 error 串里再重复一遍
                throw new Error(`业务错误 code=${data.code} msg=${data.msg || '(无)'}`);
            }

            // data 是 JSON 序列化字符串（也可能直接是对象/数组），统一解析成对象
            const rawData = data ? data.data : null;
            let parsed = null;
            if (rawData !== null && rawData !== undefined) {
                if (typeof rawData === 'object') {
                    parsed = rawData;
                } else {
                    const s = String(rawData).trim();
                    if (s) { try { parsed = JSON.parse(s); } catch (e) { parsed = null; } }
                }
            }

            const logid = (data && data.detail && data.detail.logid) || 'N/A';
            const useMs = (data && data.usage && data.usage.token_count) || null;
            console.log(`✅ [${tag}] 工作流执行成功 | 耗时: ${elapsed}ms | execute_id=${(data && data.execute_id) || 'N/A'} | cost=${(data && data.cost) || 'N/A'}${useMs !== null ? ` | tokens=${useMs}` : ''} | logid=${logid}`);
            if (data && data.debug_url) console.log(`🛠️ [${tag}] debug_url（7 天有效，可看每个节点的输入输出）: ${data.debug_url}`);
            if (parsed === null && rawData !== null && rawData !== undefined) {
                console.log(`📦 [${tag}] data 不是 JSON，按原文处理 | 预览: ${String(rawData).slice(0, 200)}`);
            }
            // 调用真的成功了 → 立刻合路（覆盖「额度已恢复 / 工作流已发布」的情形）
            closeKbCircuit(`${tag} 调用成功`);
            return {
                ok: true,
                status: response.status,
                data: parsed,
                dataRaw: rawData === undefined ? null : rawData,
                raw: data,
                elapsed,
                attempts: attempt + 1,
                executeId: (data && data.execute_id) || null,
                debugUrl: (data && data.debug_url) || null,
                cost: (data && data.cost) || null,
                error: null
            };
        } catch (err) {
            lastErr = err;
            const reason = kbErrorReason(err);
            const errMsg = (err && err.message) ? err.message : String(err);
            const usedMs = Date.now() - startAt;
            if (attempt + 1 < attempts && isRetryableKbError(err)) {
                const backoff = 1000 * Math.pow(2, attempt); // 1s → 2s → 4s
                console.warn(`⏳ [${tag}] 第 ${attempt + 1}/${attempts} 次失败（原因=${reason} | 耗时=${usedMs}ms），${backoff}ms 后重试: ${errMsg}`);
                await kbSleep(backoff);
                continue;
            }
            console.error(`❌ [${tag}] 工作流调用失败 | 原因=${reason} | 已尝试 ${attempt + 1}/${attempts} 次 | 耗时=${usedMs}ms | 错误: ${errMsg}`);
            // 额度/权限/未发布这类「重试无解」的错误 → 开路，避免后续点词继续白打
            if (lastCode !== null && lastCode !== undefined) {
                const hint = kbWorkflowCodeHint(lastCode);
                if (hint) console.error(`💡 [${tag}] 错误码 ${lastCode} 释义: ${hint}`);
                openKbCircuit(lastCode, errMsg);
            }
            break;
        }
    }
    return {
        ok: false,
        status: null,
        data: null,
        dataRaw: null,
        raw: null,
        error: (lastErr && lastErr.message) || String(lastErr),
        errorCode: lastCode,
        hint: kbWorkflowCodeHint(lastCode),
        attempts
    };
}

// 从知识库响应中抽取切片数组（兼容 data.items / items / documents / chunks / list）
function extractKbItems(data) {
    if (!data) return [];
    const d = data.data || data;
    if (Array.isArray(d)) return d;
    const candidates = [d.items, d.documents, d.chunks, d.list, d.records];
    for (const c of candidates) {
        if (Array.isArray(c)) return c;
    }
    return [];
}

// 归一化知识库切片：{ slice, score, source }
function normalizeKbHits(data) {
    return extractKbItems(data).map(it => {
        if (typeof it === 'string') return { slice: it, score: null, source: '' };
        const meta = it.meta || it.metadata || {};
        let score = null;
        if (it.score !== undefined && it.score !== null) score = Number(it.score);
        else if (it.similarity !== undefined && it.similarity !== null) score = Number(it.similarity);
        return {
            slice: String(it.slice || it.content || it.text || it.chunk || it.document || it.segment || it.paragraph || ''),
            score: Number.isFinite(score) ? score : null,
            source: meta.slice_source || it.source || it.doc_name || it.document_name || ''
        };
    }).filter(h => h.slice);
}

// ==================== 知识库结果「精确筛选」 ====================
// 背景：知识库检索是「召回」——一次可能返回好几条切片，其中包含与查询词无关的词。
// 这里做一步硬筛选：解析 outputList[].output 里的 JSON，只保留 word 字段
// 与当前查询词完全一致的那一条，其余不匹配的词一律丢弃。

// 归一化单词：去首尾引号/空白 + 转小写（知识库一般存小写，查询词可能是句中的大写形式）
function normalizeKbWord(v) {
    return String(v == null ? '' : v).replace(/^["'“”\s]+|["'“”\s]+$/g, '').trim().toLowerCase();
}

// 从记录里取释义（兼容 definition / meaning / def / 释义）
function kbRecordDefinition(rec) {
    if (!rec || typeof rec !== 'object') return '';
    const v = rec.definition !== undefined ? rec.definition
        : rec.meaning !== undefined ? rec.meaning
            : rec.def !== undefined ? rec.def
                : rec['释义'];
    return v == null ? '' : String(v).trim();
}

// 从记录里取词性（兼容 part_of_speech / partOfSpeech / pos / 词性）
function kbRecordPos(rec) {
    if (!rec || typeof rec !== 'object') return null;
    const v = rec.part_of_speech !== undefined ? rec.part_of_speech
        : rec.partOfSpeech !== undefined ? rec.partOfSpeech
            : rec.pos !== undefined ? rec.pos
                : rec['词性'];
    return v == null || v === '' ? null : String(v).trim();
}

// 从记录里取语境句子
function kbRecordContext(rec) {
    if (!rec || typeof rec !== 'object') return '';
    const v = rec.context !== undefined ? rec.context
        : rec.sentence !== undefined ? rec.sentence
            : rec.sentenceText !== undefined ? rec.sentenceText
                : rec['语境'];
    return v == null ? '' : String(v);
}

/**
 * 解析一个 output 字段：可能是 JSON 字符串（含 ```json 围栏）、已解析对象，或 JSON 数组。
 * @returns {object|array|null}
 */
function parseKbOutputRecord(raw) {
    if (raw == null) return null;
    if (typeof raw === 'object') return raw;
    const s = String(raw).trim();
    if (!s) return null;
    for (const cand of [s, extractJSON(s)]) {
        if (!cand) continue;
        try {
            const obj = JSON.parse(cand);
            if (obj && typeof obj === 'object') return obj;
        } catch (e) { /* 换下一种形态再试 */ }
    }
    return null;
}

// 需要向下展开的包裹字段：outputList[].output 是主路径，其余为兼容形态
const KB_RECORD_WRAPPER_KEYS = [
    'outputList', 'output_list', 'outputs', 'output', 'items', 'records',
    'results', 'list', 'documents', 'chunks', 'data', 'slice', 'content', 'text', 'messages', 'answer'
];

/**
 * 深度收集「带 word 字段」的候选记录。
 * 会遍历 outputList → 每一项的 output → 解析其中的 JSON，拿到 {word, definition, ...}。
 * 深度上限 6 层 + 对象去重，避免异常嵌套导致死循环。
 */
function collectKbWordRecords(node, out = [], depth = 0, seen = new Set()) {
    if (node == null || depth > 6) return out;

    // 字符串：尝试当 JSON 解析后继续向下找
    if (typeof node === 'string') {
        const parsed = parseKbOutputRecord(node);
        if (parsed) collectKbWordRecords(parsed, out, depth + 1, seen);
        return out;
    }
    if (typeof node !== 'object') return out;
    if (seen.has(node)) return out;
    seen.add(node);

    if (Array.isArray(node)) {
        for (const item of node) collectKbWordRecords(item, out, depth + 1, seen);
        return out;
    }

    // 自身就是一条记录
    if (node.word !== undefined && node.word !== null) out.push(node);

    for (const key of KB_RECORD_WRAPPER_KEYS) {
        if (node[key] !== undefined) collectKbWordRecords(node[key], out, depth + 1, seen);
    }
    return out;
}

/**
 * 精确筛选：从知识库响应里挑出 word 与查询词完全一致的那一条记录。
 * 匹配规则：忽略首尾引号/空白与大小写（查询词常常是句中的大写形式）。
 * 同一词出现多条时，按「语境完全一致 → 语境前缀一致 → 第一条」取一条。
 * @param {object} data    知识库原始响应（含 outputList 或 items）
 * @param {string} word    当前查询词
 * @param {string} context 当前语境（可选，用于多条同词时择优）
 * @returns {{mode:'json'|'none', total:number, matched:number, record:object|null, records:object[], matchedWords:string[], discarded:string[]}}
 */
function pickExactWordRecord(data, word, context = '') {
    const empty = { mode: 'none', total: 0, matched: 0, record: null, records: [], matchedWords: [], discarded: [] };
    const target = normalizeKbWord(word);
    if (!target) return empty;

    const records = collectKbWordRecords(data, []);
    if (records.length === 0) return empty;

    const ctx = normalizeCtx(context);
    const hitRecs = [];
    const discardedSet = new Set();
    for (const rec of records) {
        const w = normalizeKbWord(rec.word);
        if (w && w === target) hitRecs.push(rec);
        else if (w) discardedSet.add(w);   // 记录在案：这些词不匹配，将被丢弃
    }

    let record = null;
    if (hitRecs.length > 0) {
        const withDef = hitRecs.filter(r => kbRecordDefinition(r));
        const pool = withDef.length > 0 ? withDef : hitRecs;
        if (ctx) {
            const head = ctx.slice(0, 60);
            record = pool.find(r => normalizeCtx(kbRecordContext(r)) === ctx)
                || pool.find(r => {
                    const c = normalizeCtx(kbRecordContext(r));
                    return !!c && (c.startsWith(head) || head.startsWith(c.slice(0, 60)));
                })
                || pool[0];
        } else {
            record = pool[0];
        }
    }

    return {
        mode: 'json',
        total: records.length,
        matched: hitRecs.length,
        record,
        records,
        matchedWords: [...new Set(hitRecs.map(r => normalizeKbWord(r.word)))],
        discarded: [...discardedSet]
    };
}

// 把筛选出的记录还原成一条 CSV 行（复用既有切片解析与日志格式）
function kbRecordToSliceLine(rec) {
    return [
        csvEscape(rec.word),
        csvEscape(kbRecordContext(rec)),
        csvEscape(kbRecordDefinition(rec)),
        csvEscape(kbRecordPos(rec) || '')
    ].join(',');
}

// ==================== 工作流输出兜底：纯文本 / CSV 行 ====================
// 有些工作流的「结束节点」会直接把检索到的内容当文本吐出来（例如 "word","context","definition" 这样一行一条），
// 而不是规范的结构化字段。这种输出拿不到 word 字段，精确筛选会落空，
// 于是这里把文本行转成「切片」，交给 parseDefinitionFromSlice 逐行严格匹配（只取 word 相等那一行）。
const KB_TEXT_FIELD_KEYS = ['output', 'outputs', 'text', 'content', 'result', 'answer', 'data', 'slice', 'message', 'msg'];

function collectKbTextBlobs(node, out = [], depth = 0) {
    if (node == null || depth > 4) return out;
    if (typeof node === 'string') { if (node.trim()) out.push(node); return out; }
    if (typeof node !== 'object') return out;
    if (Array.isArray(node)) { for (const it of node) collectKbTextBlobs(it, out, depth + 1); return out; }
    for (const k of KB_TEXT_FIELD_KEYS) {
        if (node[k] !== undefined) collectKbTextBlobs(node[k], out, depth + 1);
    }
    return out;
}

function deriveKbSlicesFromText(node) {
    const slices = [];
    const seen = new Set();
    for (const blob of collectKbTextBlobs(node)) {
        for (const line of String(blob).split(/\r?\n/)) {
            const t = line.trim();
            // 只认「含逗号、首字段非空」的行；跳过 JSON 片段，避免把结构化内容误当 CSV
            if (!t || t.indexOf(',') < 0 || /^[[{]/.test(t)) continue;
            if (!parseCsvLine(t)[0]) continue;
            if (seen.has(t)) continue;
            seen.add(t);
            slices.push({ slice: t, score: null, source: 'workflow-text' });
        }
    }
    return slices;
}

/**
 * 检索知识库（三层查询第一层）
 *
 * 2026-09-28 起：不再直连知识库 HTTP 接口，改为调用 Coze 工作流 word_context_search
 *   POST {BASE}/v1/workflow/run   body = { workflow_id, parameters: { query } }
 * 工作流的输出（data 字段）会被当成「知识库响应」一样处理 —— 精确筛选逻辑完全复用。
 *
 * @param {string} query 查询内容（一般是「单词 + 语境句子」）
 * @param {object} opts  { word, context, tag, timeoutMs, maxRetries, signal }
 *                       word / context 供「精确筛选」使用（只保留 word 完全匹配的那一条）
 * @returns {Promise<{success:boolean, hits:Array, hitsAll:Array, exact:object|null, raw:object|null, error?:string, errorCode?:any, via:string, elapsed:number}>}
 *
 * 注意：这是「单轮」实现 —— 只打一次工作流。对外的 searchKnowledgeBase 是它的
 * 多轮包装（见下方 buildKbQueryAttempts / searchKnowledgeBase），按表现更好的
 * query 形态依次重试。内部调用请优先用对外那层。
 */
async function searchKnowledgeBaseOnce(query, opts = {}) {
    const q = (query == null ? '' : String(query)).trim();
    const tag = opts.tag || '知识库检索';
    const startedAt = Date.now();
    const empty = (error, extra = {}) => ({ success: false, hits: [], hitsAll: [], exact: null, raw: null, error, via: 'workflow', elapsed: Date.now() - startedAt, ...extra });

    if (!q) {
        console.warn(`⚠️ [${tag}] query 为空，直接返回未命中`);
        return empty('query 为空');
    }
    if (!isKnowledgeBaseConfigured()) {
        console.warn(`⚠️ [${tag}] L1 检索工作流未配置（COZE_KB_SEARCH_WORKFLOW_ID / COZE_KB_API_KEY / COZE_KB_BASE_URL），本层跳过`);
        return empty('未配置 L1 检索工作流');
    }
    // 熔断期内不调用（额度耗尽 / 权限错 / 未发布 —— 重试无解，白打只会拖慢点词、刷满日志）
    if (isKbCircuitOpen()) {
        const st = kbCircuitState();
        const now = Date.now();
        if (now - kbCircuit.lastSkipLogAt > 30000) {
            kbCircuit.lastSkipLogAt = now;
            console.warn(`🛑 [${tag}] L1 处于熔断冷却期（code=${st.code} | 剩余 ${Math.round(st.remainingMs / 1000)}s | 累计开路 ${st.trips} 次），本次直接跳过 → 走 L2/L3`);
        }
        // 计数统一由外层 searchKnowledgeBase 记录，这里不重复累加（否则一次检索会被算两次）
        return empty(`L1 熔断中（code=${st.code}，${Math.round(st.remainingMs / 1000)}s 后自动重试）`, { circuitOpen: true, errorCode: st.code, hint: st.hint, elapsed: Date.now() - startedAt });
    }

    // ---------- 调 word_context_search 工作流 ----------
    const wfRes = await callCozeWorkflow({
        workflowId: KB_SEARCH_WORKFLOW_ID,
        parameters: { [KB_WORKFLOW_QUERY_PARAM]: q },
        tag,
        timeoutMs: opts.timeoutMs || KB_WORKFLOW_TIMEOUT_MS,
        maxRetries: opts.maxRetries || KB_MAX_RETRIES,
        signal: opts.signal
    });
    const elapsed = Date.now() - startedAt;

    if (!wfRes.ok) {
        return empty(wfRes.error, { errorCode: wfRes.errorCode || null, hint: wfRes.hint || '', elapsed });
    }

    // 工作流输出 → 统一按「知识库响应」解析：JSON 记录、数组、嵌套 output 都能吃下
    const kbData = (wfRes.data !== null && wfRes.data !== undefined) ? wfRes.data : wfRes.dataRaw;
    const hits = normalizeKbHits(kbData);

    // ---------- 精确筛选：只留 word 字段与查询词完全匹配的那一条 ----------
    // 未显式传 word 时，退回「query 的第一个词」，保证该函数单独调用时也具备筛选能力
    const targetWord = opts.word || q.split(/\s+/)[0] || '';
    const audit = pickExactWordRecord(kbData, targetWord, opts.context || '');

    // 兜底：没有结构化记录时，尝试把工作流输出里的文本行当切片（见 deriveKbSlicesFromText）
    const textSlices = (audit.mode === 'none' && hits.length === 0) ? deriveKbSlicesFromText(kbData) : [];
    const recallHits = hits.length > 0 ? hits : textSlices;

    // hitsAll：原始召回，便于排查「召回对了却被筛掉」。
    // JSON 记录模式（outputList）下切片为空，改用解析出的候选记录还原成切片行。
    const hitsAll = audit.mode === 'json'
        ? audit.records.map(rec => ({ slice: kbRecordToSliceLine(rec), score: null, source: rec.source || rec.doc_name || rec.document_name || '' }))
        : recallHits;

    console.log(`🎯 [${tag}] 工作流返回 | query="${q.slice(0, 100)}" | 解析出 ${audit.total} 条 JSON 记录 / ${hits.length} 条切片${textSlices.length ? ` / ${textSlices.length} 条文本行` : ''} | 耗时: ${elapsed}ms`);
    recallHits.slice(0, 3).forEach((h, i) => {
        console.log(`   ├─ ${i + 1}. score=${h.score} | 来源=${h.source || 'N/A'} | ${h.slice.slice(0, 120).replace(/\r?\n/g, ' ⏎ ')}`);
    });
    console.log(`🔍 [${tag}] 精确筛选 | 目标词="${targetWord}" | 候选记录 ${audit.total} 条 | word 完全匹配 ${audit.matched} 条`);

    let exact = null;
    let finalHits = recallHits;

    if (audit.mode === 'json') {
        const rec = audit.record;
        const def = rec ? kbRecordDefinition(rec) : '';
        const discPreview = audit.discarded.slice(0, 8).join(' / ');
        if (rec && def) {
            const rawScore = rec.score !== undefined && rec.score !== null ? Number(rec.score) : null;
            exact = {
                word: normalizeKbWord(rec.word),
                definition: def,
                partOfSpeech: kbRecordPos(rec),
                context: kbRecordContext(rec),
                score: Number.isFinite(rawScore) ? rawScore : (hits.length ? hits[0].score : null)
            };
            // 只返回这一条：其余不匹配词的切片一律丢弃
            finalHits = [{ slice: kbRecordToSliceLine(rec), score: exact.score, source: rec.source || rec.doc_name || rec.document_name || '' }];
            console.log(`✅ [${tag}] 精确筛选取用 | word=${exact.word} | 词性=${exact.partOfSpeech || 'N/A'} | 释义="${def.slice(0, 60)}" | 已丢弃 ${audit.discarded.length} 个不匹配的词${audit.discarded.length ? `（${discPreview}${audit.discarded.length > 8 ? ' …' : ''}）` : ''}`);
        } else {
            finalHits = [];
            const why = rec ? '该条没有 definition 字段' : `没有一条 word 完全等于 "${targetWord}"`;
            console.warn(`⚠️ [${tag}] 精确筛选未命中：${why} | 候选词: ${discPreview || '无'} | 本层按未命中处理，不返回其他词的释义`);
        }
    } else if (recallHits.length > 0) {
        console.log(`🔍 [${tag}] 精确筛选 | 工作流未返回带 word 的 JSON 记录，改用文本行逐行严格匹配（仅取 word 相等那一行）`);
    } else {
        console.log(`➖ [${tag}] 工作流没有返回可解析的检索结果（无 JSON 记录、无切片、无可识别的文本行）`);
    }

    return { success: true, hits: finalHits, hitsAll, exact, raw: wfRes.raw, via: 'workflow', elapsed };
}

/**
 * 构造 L1 要依次尝试的 query 形态（顺序即优先级）。
 *
 * 为什么需要多轮 —— 2026-09-29 对真实工作流 + 真实知识库实测（20 词样本）：
 *   只用 word 单独       命中 16/20 = 80%，平均 506ms
 *   word,context（逗号） 命中  5/20 = 25%，平均 712ms
 *   两者仅 3/20 重叠 → 串行两轮合并命中 18/20 = 90%
 * 机制：word_context 里同一句 context 被该句所有词共享，而工作流恒返回 3 条
 *      （入参 top_k 不生效，节点里写死）→ 用「词 + 整句」查，top-3 常被同句的
 *      「兄弟词」占满，目标词反被挤出去。换 query 形态能跳出这个局部最优。
 *
 * @param {string} word     查询词
 * @param {string} context  语境句子
 * @param {string} rawQuery 调用方原始传入的 query（legacy 模式与无 word 时使用）
 * @returns {Array<{q:string,label:string}>}
 */
function buildKbQueryAttempts(word, context, rawQuery) {
    const w = String(word || '').trim();
    const c = String(context || '').trim();
    const list = [];
    const push = (q, label) => {
        const s = String(q == null ? '' : q).trim();
        if (s && !list.some(a => a.q === s)) list.push({ q: s, label });
    };

    if (KB_QUERY_MODE === 'legacy') {
        push(rawQuery || (c ? `${w} ${c}` : w), 'legacy(词+句)');
        return list;
    }
    if (!w) {
        // 没给 word（纯自由文本查询）：只能用原始 query
        push(rawQuery, '原始 query');
        return list;
    }

    push(w, 'word 单独');                                            // 主形态
    if (KB_QUERY_MODE !== 'word' && c) push(`${w},${c}`, 'word,context');  // 备形态
    return list;
}

/**
 * 检索知识库（三层查询第一层）——多轮包装
 *
 * 依次用 buildKbQueryAttempts 给出的 query 形态调用工作流，任一轮「精确筛选」出
 * 目标词即立即返回（后续轮不再打）；全轮未中则返回最后一轮的原始召回，供
 * lookupWordWithLayers 判为 L1 未命中并回落 L2。
 *
 * 多轮只在第一轮未中时才发生 → 命中时仍是单次调用（≈506ms），未中时约 1.2s。
 *
 * @returns {Promise<{success:boolean, hits:Array, hitsAll:Array, exact:object|null, raw:object|null,
 *                    error?:string, via:string, elapsed:number, calls:number, queryForm:string, perAttempt:Array}>}
 */
async function searchKnowledgeBase(query, opts = {}) {
    const tag = opts.tag || '知识库检索';
    const startedAt = Date.now();
    const targetWord = opts.word || String(query == null ? '' : query).trim().split(/\s+/)[0] || '';
    const attempts = buildKbQueryAttempts(opts.word, opts.context, String(query == null ? '' : query).trim());

    if (!attempts.length) {
        console.warn(`⚠️ [${tag}] 没有可用的 query，直接返回未命中`);
        return { success: false, hits: [], hitsAll: [], exact: null, raw: null, error: 'query 为空', via: 'workflow', elapsed: 0, calls: 0, queryForm: null, perAttempt: [] };
    }
    // 提前拦一次，避免多轮各自重复打印「未配置」告警
    if (!isKnowledgeBaseConfigured()) {
        console.warn(`⚠️ [${tag}] L1 检索工作流未配置（COZE_KB_SEARCH_WORKFLOW_ID / COZE_KB_API_KEY / COZE_KB_BASE_URL），本层跳过`);
        return { success: false, hits: [], hitsAll: [], exact: null, raw: null, error: '未配置 L1 检索工作流', via: 'workflow', elapsed: 0, calls: 0, queryForm: null, perAttempt: [] };
    }
    // 熔断冷却期内：一轮都不打（否则 two_step 会连打两轮，两轮都是同一个必败的错误码）
    if (isKbCircuitOpen()) {
        const st = kbCircuitState();
        const now = Date.now();
        if (now - kbCircuit.lastSkipLogAt > 30000) {
            kbCircuit.lastSkipLogAt = now;
            console.warn(`🛑 [${tag}] L1 处于熔断冷却期（code=${st.code} | 剩余 ${Math.round(st.remainingMs / 1000)}s | 累计开路 ${st.trips} 次），${attempts.length} 轮全部跳过 → 走 L2/L3`);
        }
        return {
            success: false, hits: [], hitsAll: [], exact: null, raw: null,
            error: `L1 熔断中（code=${st.code}，${Math.round(st.remainingMs / 1000)}s 后自动重试）`,
            errorCode: st.code, hint: st.hint, circuitOpen: true,
            via: 'workflow', elapsed: 0, calls: 0, queryForm: null, perAttempt: []
        };
    }

    const perAttempt = [];
    let last = null;

    for (let i = 0; i < attempts.length; i++) {
        const { q, label } = attempts[i];
        const subTag = attempts.length > 1 ? `${tag}·第${i + 1}轮(${label})` : tag;
        const res = await searchKnowledgeBaseOnce(q, { ...opts, tag: subTag });

        perAttempt.push({ label, query: q, exact: res.exact ? res.exact.word : null, hits: (res.hitsAll || []).length, ok: res.success, circuit: !!res.circuitOpen, elapsed: res.elapsed });
        last = { res, q, label };

        if (res.exact) {
            if (attempts.length > 1) {
                console.log(`🎯 [${tag}] L1 多轮检索命中于第 ${i + 1}/${attempts.length} 轮（${label}）| 累计耗时 ${Date.now() - startedAt}ms`);
            }
            break;
        }
        if (i < attempts.length - 1) {
            console.log(`↩️ [${tag}] 第 ${i + 1} 轮（${label}）未筛出「${targetWord}」，换下一种 query 形态重试…`);
        }
    }

    const { res, q, label } = last;
    const elapsed = Date.now() - startedAt;
    // calls = 真正发出去的 HTTP 调用次数（被熔断跳过的轮次不计）——统计里的「实际调用」要配得上这个名字
    const calls = perAttempt.filter(a => !a.circuit).length;
    const skipped = perAttempt.length - calls;
    console.log(`📊 [${tag}] L1 多轮检索结束 | 目标词="${targetWord}" | 走完 ${perAttempt.length}/${attempts.length} 轮（实际调用 ${calls} 次${skipped ? `，熔断跳过 ${skipped} 次` : ''}）| 采用形态=${label} | 结果=${res.exact ? '命中' : '未命中'} | 总耗时 ${elapsed}ms`);

    return { ...res, elapsed, calls, queryForm: label, queryString: q, perAttempt };
}

// CSV 单元格转义（统一走这里，避免各处手写引号不一致）
function csvEscape(value) {
    // 换行会让「一条记录 = 一行」的假设失效（也影响知识库按行分段），统一压成空格
    const s = String(value == null ? '' : value).replace(/\r?\n/g, ' ');
    return '"' + s.replace(/"/g, '""') + '"';
}

// 解析一行 CSV（支持引号包裹与 "" 转义）
function parseCsvLine(line) {
    const fields = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"') {
                if (line[i + 1] === '"') { cur += '"'; i++; }
                else inQuotes = false;
            } else cur += ch;
        } else if (ch === '"') {
            inQuotes = true;
        } else if (ch === ',') {
            fields.push(cur); cur = '';
        } else {
            cur += ch;
        }
    }
    fields.push(cur);
    return fields.map(f => f.trim());
}

// 把 [{word, context, definition, part_of_speech}] 数组转成 CSV 文本
// 固定 4 列：词性放最后一列，空值也输出空串 —— 保证列位稳定，
// 读侧 parseDefinitionFromSlice 把 fields[3] 当可选词性，所以旧的 3 列切片依然能正常解析。
function buildWordContextCsv(rows) {
    const list = Array.isArray(rows) ? rows : [];
    const lines = ['word,context,definition,part_of_speech'];
    for (const r of list) {
        if (!r) continue;
        const word = r.word == null ? '' : String(r.word);
        if (!word) continue;
        const pos = r.part_of_speech == null ? '' : String(r.part_of_speech);
        lines.push([csvEscape(word), csvEscape(r.context), csvEscape(r.definition), csvEscape(pos)].join(','));
    }
    return lines.join('\n');
}

// ====================================================================================
// ⛔ 已停用（2026-09-28 起知识库改为「手动同步」）：以下「上传 / content 编码探测 / 文档清理」
//    整块代码不再生效，保留注释以便随时恢复。
//
//    手动同步流程：
//      1) node export_csv.js                        导出全量 word_context.csv
//      2) 在 Coze 控制台手动上传该 CSV 到知识库
//      3) node sync_to_knowledge.js --mark-synced   标记本地「已同步」，让待同步计数归零
//
//    恢复自动同步的办法：删掉本区块内各行开头的 `// ` 前缀，
//    并恢复文件底部 module.exports 里被注释掉的键。
// ====================================================================================
// /**
//  * 归一化上传入参
//  * data 支持四种形态：
//  *   1) [{word, context, definition, part_of_speech}]  数组 → 自动转 CSV
//  *   2) CSV 字符串
//  *   3) { name, csv } / { name, content }
//  *   4) { name, filePath }（读本地文件）
//  * @returns {{tag, startedAt, opts, csvText, count, defaultName, error}}
//  */
// function normalizeUploadPayload(data, opts = {}) {
//     const tag = opts.tag || '知识库上传';
//     const startedAt = Date.now();
//     let csvText = '';
//     let defaultName = '';
//     let count = 0;
//     let error = null;
//
//     if (typeof data === 'string') {
//         csvText = data;
//     } else if (Array.isArray(data)) {
//         csvText = buildWordContextCsv(data);
//         count = data.filter(r => r && r.word).length;
//     } else if (data && typeof data === 'object') {
//         if (data.csv || data.content) {
//             csvText = data.csv || data.content;
//             count = Number(data.count) || 0;
//         } else if (data.filePath) {
//             try {
//                 csvText = require('fs').readFileSync(data.filePath, 'utf8');
//             } catch (e) {
//                 console.error(`❌ [${tag}] 读取文件失败: ${data.filePath} | ${e.message}`);
//                 error = '读取文件失败: ' + e.message;
//             }
//         }
//         defaultName = data.name || '';
//     }
//
//     csvText = (csvText || '').toString();
//     if (!error && !csvText.trim()) error = '数据为空';
//     if (!error && !count) {
//         // 粗略统计行数（减去表头）
//         const lineCount = csvText.split('\n').filter(l => l.trim()).length;
//         count = Math.max(0, lineCount - 1);
//     }
//     return { tag, startedAt, opts, csvText, count, defaultName, error };
// }
//
// /**
//  * 上传数据到知识库（同步脚本调用）
//  * 按 opts.style（默认 COZE_KB_UPLOAD_STYLE）分派到两套接口：
//  *   'v1'        POST {BASE}/v1/datasets/{dataset_id}/documents   body = { documents: [{ name, content, file_type }] }
//  *   'open_api'  POST {BASE}/open_api/knowledge/document/create   body = { dataset_id, format_type, chunk_strategy, document_bases[].source_info.file_base64 }
//  * @param {object} opts { style, contentMode, name, timeoutMs, maxRetries, chunkStrategy, dryRun, signal, tag }
//  * @returns {Promise<{success:boolean, count:number, name:string, chars:number, contentMode?:string, documentInfos:Array, error?:string, elapsed:number}>}
//  */
// async function uploadToKnowledgeBase(data, opts = {}) {
//     const ctx = normalizeUploadPayload(data, opts);
//     const { tag, startedAt, csvText, count, defaultName } = ctx;
//
//     if (ctx.error) {
//         console.warn(`⚠️ [${tag}] 没有可上传的数据，跳过（${ctx.error}）`);
//         return { success: false, count: 0, name: defaultName, chars: 0, documentInfos: [], error: ctx.error, elapsed: Date.now() - startedAt };
//     }
//
//     // dry-run：不调用接口，只回报将要发送的内容（也便于在未配 .env 时先验证导出）
//     if (opts.dryRun) {
//         if (!isKnowledgeBaseConfigured()) {
//             console.warn(`⚠️ [${tag}] dry-run：知识库未配置（COZE_KB_ID / COZE_KB_API_KEY / COZE_KB_BASE_URL），正式同步会失败`);
//         }
//         const mode = opts.contentMode || KB_CONTENT_MODE;
//         console.log(`🧪 [${tag}] dry-run 模式：不实际调用接口 | 待上传 ${count} 条 | ${csvText.length} 字符 | 文件名: ${defaultName || '(未指定)'} | content 模式: ${mode}`);
//         console.log(`🧪 [${tag}] content 预览（前 200 字符，⏎ 表示换行）: ${csvText.slice(0, 200).replace(/\r?\n/g, ' ⏎ ')}`);
//         return { success: true, count, name: defaultName, chars: csvText.length, contentMode: mode, documentInfos: [], dryRun: true, elapsed: Date.now() - startedAt };
//     }
//     if (!isKnowledgeBaseConfigured()) {
//         console.warn(`⚠️ [${tag}] 知识库未配置，跳过上传（数据未丢失，配置好 .env 后可重跑）`);
//         return { success: false, count, name: defaultName, chars: csvText.length, documentInfos: [], error: '知识库未配置', elapsed: Date.now() - startedAt };
//     }
//
//     const style = String(opts.style || KB_UPLOAD_STYLE || 'v1').toLowerCase();
//     if (style === 'open_api' || style === 'legacy') return uploadViaOpenApi(ctx);
//     return uploadViaV1(ctx);
// }
//
// /**
//  * 官方形态：POST /open_api/knowledge/document/create（本地文件走 base64）
//  */
// async function uploadViaOpenApi(ctx) {
//     const { tag, csvText, count, defaultName, opts, startedAt } = ctx;
//
//     // ---- 2. 组装官方请求体（本地文件走 base64） ----
//     const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14); // YYYYMMDDHHmmss
//     // 注意：Coze 本地文件仅支持 pdf/txt/doc/docx，故用 .txt 承载 CSV 文本
//     const docName = defaultName || `word_context_sync_${stamp}.${KB_FILE_TYPE}`;
//     const base64 = Buffer.from(csvText, 'utf8').toString('base64');
//     const chunkStrategy = opts.chunkStrategy || {
//         chunk_type: 1,            // 自定义分段
//         separator: '\n',          // 一行一条记录 → 每个切片就是一条「word,context,definition」
//         max_tokens: 200,
//         remove_extra_spaces: false,
//         remove_urls_emails: false
//     };
//     const body = {
//         dataset_id: KB_ID,
//         format_type: 0,           // 0：文本知识库
//         chunk_strategy: chunkStrategy,
//         document_bases: [{
//             name: docName,
//             source_info: {
//                 file_base64: base64,
//                 file_type: KB_FILE_TYPE,
//                 document_source: 0  // 0：本地文件
//             }
//         }]
//     };
//
//     console.log(`📦 [${tag}] 准备上传 | 文件名: ${docName} | 记录数: ${count} | 字符数: ${csvText.length} | base64 大小: ${base64.length} 字节 | 分段: 按行(separator="\\n")`);
//
//     // ---- 3. 调用接口（大文件给更长超时） ----
//     const timeoutMs = opts.timeoutMs || (csvText.length > 200000 ? KB_UPLOAD_TIMEOUT_MS : Math.max(KB_UPLOAD_TIMEOUT_MS, 60000));
//     const res = await callCozeKnowledgeApi({
//         path: KB_CREATE_PATH,
//         body,
//         tag,
//         timeoutMs,
//         maxRetries: opts.maxRetries || KB_MAX_RETRIES,
//         signal: opts.signal
//     });
//     const elapsed = Date.now() - startedAt;
//
//     if (!res.ok) {
//         console.error(`❌ [${tag}] 上传失败 | ${count} 条未同步 | 错误: ${res.error}`);
//         return { success: false, count, name: docName, chars: csvText.length, documentInfos: [], error: res.error, elapsed };
//     }
//
//     const documentInfos = (res.data && (res.data.document_infos || (res.data.data && res.data.data.document_infos))) || [];
//     documentInfos.forEach((d, i) => {
//         console.log(`   ├─ [${i + 1}] ${d.name} | document_id: ${d.document_id} | 状态: ${d.status === 1 ? '处理完毕' : d.status === 0 ? '处理中' : '失败(' + d.status + ')'} | 分段数: ${d.slice_count} | 字符数: ${d.char_count}`);
//     });
//     console.log(`✅ [${tag}] 上传成功 | ${count} 条 | 文件: ${docName} | 耗时: ${elapsed}ms | 返回 document_infos: ${documentInfos.length} 个`);
//     return { success: true, count, name: docName, chars: csvText.length, documentInfos, raw: res.data, elapsed };
// }

// ==================== v1 上传形态 + content 编码探测 + 文档清理（已停用，见上方说明） ====================

// 把 CSV 文本按 contentMode 转成要放进 content 字段的字符串
// function encodeKbContent(csvText, contentMode) {
//     const raw = String(csvText == null ? '' : csvText);
//     if (String(contentMode).toLowerCase() === 'base64') {
//         return Buffer.from(raw, 'utf8').toString('base64');   // UTF-8 字节 → base64，中文安全
//     }
//     return raw;   // 明文：不添加 BOM（BOM 会污染第一个切片，破坏 word 匹配）
// }

// 从各种返回形态里抽取 document_infos
function extractDocumentInfos(data) {
    if (!data) return [];
    const d = data.data || data;
    const list = d.document_infos || d.documentInfos || (d.data && (d.data.document_infos || d.data.documentInfos));
    return Array.isArray(list) ? list : [];
}

// /**
//  * v1 形态：POST {BASE}/v1/datasets/{dataset_id}/documents
//  * body = { documents: [{ name, content, file_type: 'txt' }] }
//  * content 按 contentMode 决定是明文还是 base64（由 probeContentMode 探测后持久化）
//  */
// async function uploadViaV1(ctx) {
//     const { tag, csvText, count, defaultName, opts, startedAt } = ctx;
//     const contentMode = String(opts.contentMode || KB_CONTENT_MODE || 'text').toLowerCase() === 'base64' ? 'base64' : 'text';
//
//     const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);   // YYYYMMDDHHmmss
//     const docName = defaultName || `${KB_AUTO_DOC_PREFIX}${stamp}.${KB_FILE_TYPE}`;
//     const content = encodeKbContent(csvText, contentMode);
//     const path = KB_DOCUMENTS_PATH_TEMPLATE.replace('{dataset_id}', encodeURIComponent(KB_ID));
//     const body = {
//         documents: [{
//             name: docName,
//             content,
//             file_type: KB_FILE_TYPE
//         }]
//     };
//
//     console.log(`📦 [${tag}] 准备上传(v1) | POST ${path} | 文件名: ${docName} | 记录数: ${count} | CSV ${csvText.length} 字符 | content ${content.length} 字符 | 模式: ${contentMode}`);
//
//     const res = await callCozeKnowledgeApi({
//         path,
//         body,
//         tag,
//         timeoutMs: opts.timeoutMs || (content.length > 200000 ? KB_UPLOAD_TIMEOUT_MS : Math.max(KB_UPLOAD_TIMEOUT_MS, 60000)),
//         maxRetries: opts.maxRetries || KB_MAX_RETRIES,
//         signal: opts.signal
//     });
//     const elapsed = Date.now() - startedAt;
//
//     if (!res.ok) {
//         console.error(`❌ [${tag}] 上传失败(v1) | ${count} 条未同步 | 模式: ${contentMode} | 错误: ${res.error}`);
//         return { success: false, count, name: docName, chars: csvText.length, contentMode, documentInfos: [], error: res.error, elapsed };
//     }
//
//     const documentInfos = extractDocumentInfos(res.data);
//     documentInfos.forEach((d, i) => {
//         const st = d.status === 1 || d.status === '1' ? '处理完毕' : (d.status === 0 || d.status === '0' ? '处理中' : `状态(${d.status})`);
//         console.log(`   ├─ [${i + 1}] ${d.name || docName} | document_id: ${d.document_id || d.id || 'N/A'} | ${st} | 分段数: ${d.slice_count ?? 'N/A'}`);
//     });
//     if (documentInfos.length === 0) {
//         console.log(`   ├─ 响应里没有 document_infos，原始响应: ${JSON.stringify(res.data).slice(0, 200)}`);
//     }
//     console.log(`✅ [${tag}] 上传成功(v1) | ${count} 条 | 文件: ${docName} | 模式: ${contentMode} | 耗时: ${elapsed}ms`);
//     return { success: true, count, name: docName, chars: csvText.length, contentMode, documentInfos, raw: res.data, elapsed };
// }
//
// 判断一段回读到的文本是否「像 base64 字面量」（用于识别编码猜错）
// function looksLikeBase64Literal(s) {
//     const t = String(s || '').trim();
//     return t.length >= 40 && /^[A-Za-z0-9+/=\s]+$/.test(t) && !/[\u4e00-\u9fa5]/.test(t);
// }
//
// /**
//  * 探测 content 该传明文还是 base64。
//  * 思路：用极小样本按 text 试传 → 回查知识库 → 看中文是否正常、是否被当成 base64 字面量 → 必要时改试 base64。
//  * 结果由调用方持久化（state.upload.contentMode），后续不再探测。
//  * @param {object} opts { signal, timeoutMs, maxRetries, tag }
//  * @returns {Promise<{contentMode:'text'|'base64', probed:boolean, evidence:string, docName:string, error?:string}>}
//  */
// async function probeContentMode(opts = {}) {
//     const tag = opts.tag || '知识库编码探测';
//     // 每次探测都用【唯一的】标记词：知识库里可能残留上一次探测的记录，
//     // 如果用固定词，残留记录会让本次「上传失败」也被误判成成功。
//     const probeWord = `${KB_PROBE_DOC_PREFIX}w${Date.now()}`;
//     const probeDefinition = '探测';
//     const probeCsv = buildWordContextCsv([{ word: probeWord, context: 'probe context', definition: probeDefinition, part_of_speech: '' }]);
//     const stamp = Date.now();
//     const docName = `${KB_PROBE_DOC_PREFIX}${stamp}.${KB_FILE_TYPE}`;
//
//     console.log(`🔬 [${tag}] 开始探测 content 编码（先按 text 试）| 标记词 ${probeWord} | 样本 ${probeCsv.length} 字符 | 文件名: ${docName}`);
//
//     const attempt = async (mode) => {
//         const res = await uploadToKnowledgeBase(
//             { name: docName, csv: probeCsv, contentMode: mode },
//             { style: 'v1', contentMode: mode, tag: `${tag}-${mode}`, timeoutMs: opts.timeoutMs, maxRetries: opts.maxRetries, signal: opts.signal }
//         );
//         if (!res.success) return { ok: false, why: `上传失败: ${res.error}` };
//         // 建档是异步的，轮询回查（最多 ~45s）
//         const deadline = Date.now() + 45000;
//         let polls = 0;
//         while (Date.now() < deadline) {
//             await kbSleep(3000);
//             polls++;
//             const kb = await searchKnowledgeBase(probeWord, { tag: `${tag}-回查`, word: probeWord, topK: 10 });
//             if (!kb.success) return { ok: false, why: `回查失败: ${kb.error}` };
//
//             // 正向判定：必须来自「word 与本次标记词精确匹配」的那一条，才敢算成功
//             const exactDef = (kb.exact && kb.exact.word === probeWord.toLowerCase() && kb.exact.definition)
//                 ? String(kb.exact.definition) : '';
//             if (exactDef.includes(probeDefinition)) {
//                 return { ok: true, why: `回查按 word 精确匹配到中文释义「${probeDefinition}」` };
//             }
//
//             const recalls = kb.hitsAll || [];
//             // 负向判定 1：没有精确匹配，但召回切片里出现 base64 字面量
//             // → 说明服务端把 base64 当明文存了，应改传 base64
//             if (!exactDef && recalls.some(h => looksLikeBase64Literal(h.slice))) {
//                 return { ok: false, why: '回查只在切片里读到 base64 字面量，说明该改传 base64' };
//             }
//             // 负向判定 2：连续两次都拿不到任何可解析记录
//             // → 编码不对时服务端多半把内容解成了乱码，什么都解析不出来。
//             //   没必要为此白等满 45 秒，早点回退到另一种编码。
//             if (!exactDef && recalls.length === 0 && polls >= 2) {
//                 return { ok: false, why: '连续两次回查都没有可解析记录（内容大概率未被正常索引，编码不对）' };
//             }
//         }
//         return { ok: false, why: '回查超时，未拿到可判定的切片' };
//     };
//
//     const asText = await attempt('text');
//     if (asText.ok) {
//         console.log(`✅ [${tag}] 判定 content 用【明文 text】| 证据: ${asText.why}`);
//         return { contentMode: 'text', probed: true, evidence: asText.why, docName };
//     }
//     console.warn(`⚠️ [${tag}] 明文试传未通过（${asText.why}），改试 base64`);
//
//     const asBase64 = await attempt('base64');
//     if (asBase64.ok) {
//         console.log(`✅ [${tag}] 判定 content 用【base64】| 证据: ${asBase64.why}`);
//         return { contentMode: 'base64', probed: true, evidence: asBase64.why, docName };
//     }
//
//     // 两种都拿不到结论 → 回退 base64（与官方文档 file_base64 的语义一致，最保守）
//     const evidence = `明文: ${asText.why}；base64: ${asBase64.why}`;
//     console.warn(`⚠️ [${tag}] 两次探测都未拿到结论，保守回退 base64 | ${evidence}`);
//     return { contentMode: 'base64', probed: false, evidence, docName, error: evidence };
// }

/** 列出知识库文档（用于清理） */
async function listKnowledgeDocuments(opts = {}) {
    const tag = opts.tag || '知识库文档列表';
    const size = Math.min(100, Math.max(1, Number(opts.size) || 100));
    const res = await callCozeKnowledgeApi({
        path: KB_LIST_PATH,
        body: { dataset_id: KB_ID, page: Number(opts.page) || 0, size },
        tag,
        timeoutMs: opts.timeoutMs || KB_TIMEOUT_MS,
        maxRetries: opts.maxRetries || KB_MAX_RETRIES,
        signal: opts.signal
    });
    if (!res.ok) return { success: false, documents: [], error: res.error };
    const list = extractDocumentInfos(res.data);
    return { success: true, documents: list };
}

// /** 删除知识库文档 */
// async function deleteKnowledgeDocuments(documentIds, opts = {}) {
//     const tag = opts.tag || '知识库文档删除';
//     const ids = (Array.isArray(documentIds) ? documentIds : [documentIds]).filter(v => v != null && v !== '');
//     if (ids.length === 0) return { success: true, deleted: 0 };
//     const res = await callCozeKnowledgeApi({
//         path: KB_DELETE_PATH,
//         body: { dataset_id: KB_ID, document_ids: ids },
//         tag,
//         timeoutMs: opts.timeoutMs || KB_TIMEOUT_MS,
//         maxRetries: opts.maxRetries || KB_MAX_RETRIES,
//         signal: opts.signal
//     });
//     if (!res.ok) return { success: false, deleted: 0, error: res.error };
//     return { success: true, deleted: ids.length, raw: res.data };
// }
//
// /**
//  * 清理自动同步产生的旧文档，把知识库文件数压到 maxDocs 以内。
//  *
//  * ⚠️ 安全红线：只允许删除 name 以 KB_AUTO_DOC_PREFIX / KB_PROBE_DOC_PREFIX 开头的文档。
//  *    你手动上传的业务资料永远不会被碰。
//  * ⚠️ list / delete 接口在你所在的平台上可能不存在 → 失败只告警，绝不影响同步本身。
//  * @returns {Promise<{success:boolean, kept:number, deleted:number, skipped:boolean, error?:string}>}
//  */
// async function pruneAutoKnowledgeDocuments(maxDocs = 100, opts = {}) {
//     const tag = opts.tag || '知识库清理';
//     const limit = Math.max(1, Number(maxDocs) || 100);
//     const listed = await listKnowledgeDocuments({ tag, size: 100, signal: opts.signal });
//     if (!listed.success) {
//         console.warn(`⚠️ [${tag}] 无法列出知识库文档，跳过清理（不影响同步）| 错误: ${listed.error}`);
//         return { success: false, kept: 0, deleted: 0, skipped: true, error: listed.error };
//     }
//
//     const all = listed.documents || [];
//     const isOurs = (d) => {
//         const n = String((d && (d.name || d.document_name)) || '');
//         return n.startsWith(KB_AUTO_DOC_PREFIX) || n.startsWith(KB_PROBE_DOC_PREFIX);
//     };
//     const ours = all.filter(isOurs);
//     const others = all.length - ours.length;
//
//     console.log(`🧹 [${tag}] 知识库共 ${all.length} 个文档 | 自动同步 ${ours.length} 个 | 其他（不碰）${others} 个 | 上限 ${limit}`);
//
//     if (ours.length <= limit) {
//         console.log(`🧹 [${tag}] 自动同步文档数 ${ours.length} ≤ 上限 ${limit}，无需清理`);
//         return { success: true, kept: ours.length, deleted: 0, skipped: false, total: all.length };
//     }
//
//     // 最旧的先删（用 create_time/update_time 排序，缺失就按数组顺序即最旧在前）
//     const sorted = [...ours].sort((a, b) => {
//         const ta = Number(a.create_time || a.update_time || 0);
//         const tb = Number(b.create_time || b.update_time || 0);
//         if (ta && tb && ta !== tb) return ta - tb;
//         return 0;
//     });
//     const toDelete = sorted.slice(0, ours.length - limit);
//     const ids = toDelete.map(d => d.document_id || d.id).filter(v => v != null);
//     if (ids.length === 0) {
//         console.warn(`⚠️ [${tag}] 需要删除 ${toDelete.length} 个旧文档，但响应里没有 document_id，跳过清理`);
//         return { success: false, kept: ours.length, deleted: 0, skipped: true, error: '缺少 document_id' };
//     }
//
//     const names = toDelete.map(d => d.name || d.document_name || '?').slice(0, 5).join(', ');
//     console.log(`🗑️ [${tag}] 准备删除 ${ids.length} 个最旧的自动同步文档: ${names}${toDelete.length > 5 ? ' …' : ''}`);
//     const del = await deleteKnowledgeDocuments(ids, { tag, signal: opts.signal });
//     if (!del.success) {
//         console.warn(`⚠️ [${tag}] 删除失败，跳过清理（不影响同步）| 错误: ${del.error}`);
//         return { success: false, kept: ours.length, deleted: 0, skipped: true, error: del.error };
//     }
//     console.log(`✅ [${tag}] 已清理 ${del.deleted} 个旧文档 | 自动同步文档剩余 ${ours.length - del.deleted} 个`);
//     return { success: true, kept: ours.length - del.deleted, deleted: del.deleted, skipped: false, total: all.length };
// }

// ==================== 三层查询（用户点词 → 释义） ====================

// 各层命中计数（进程内累计），用于打印命中率
const lookupStats = {
    total: 0,       // 总查询次数
    kb: 0,          // L1 知识库命中
    context: 0,     // L2 word_context 命中
    ai: 0,          // L3 AI 生成命中
    cache: 0,       // 兼容层：通用词库命中
    miss: 0,        // 三层全未命中
    aiSaved: 0,     // L3 生成后成功回写 word_context 的条数
    layerErrors: 0, // 层级调用异常次数
    // ---- 词典层（2026-10-05 新增）----
    // 与上面的「主释义来源」不冲突：词典层是正交的，每次查询都会查一次，
    // 无论最后主释义取自哪一层，dictHits 都会 +1。所以它的命中率是「词典覆盖率」，不是「抢了多少生意」。
    dictHits: 0,        // 本地词典查到了该词
    dictMisses: 0,      // 本地词典没收录
    dictionaryLayer: 0, // 词典作为「主释义来源」的次数（语境释义为空、只有词典命中时）
    // ---- L1 工作流调用明细（2026-09-28 新增）----
    // L1 改成工作流后，「命中率」要从两个角度看：工作流本身调通了没、以及筛出了匹配的词没。
    kbCalls: 0,     // 实际发起的工作流调用次数（多轮重试时会计多次）
    kbLookups: 0,   // L1 检索次数（一次检索可能打多轮）
    kbMulti: 0,     // 需要打到第二轮才命中的检索次数（衡量多轮策略的价值）
    kbHits: 0,      // 工作流调用成功 且 精确筛选命中
    kbMisses: 0,    // 工作流调用成功 但 没筛出匹配记录（属于正常未命中）
    kbErrors: 0,    // 工作流调用失败（超时/权限/未发布等）
    kbSkipped: 0,   // 未配置工作流，L1 被跳过
    kbDisabled: 0,  // 联网层未开启（默认只走本地），L1 被跳过 —— 与 kbSkipped（配置缺失）区分开
    kbCircuit: 0,   // 因熔断（额度/权限/未发布）被主动跳过，未发起任何调用
    kbElapsedMs: 0  // 工作流耗时累计（算平均耗时用）
};

function hitRate(n) {
    return lookupStats.total > 0 ? (Math.round((n / lookupStats.total) * 1000) / 10) + '%' : '0%';
}

function layerLabelOf(layer) {
    return ({ dictionary: '词典层-本地词典', kb: 'L1-知识库', context: 'L2-语境库', ai: 'L3-AI生成', cache: '兼容层-通用词库', none: '未命中' })[layer] || layer;
}

// 语境比对用的归一化（忽略大小写/多余空白/首尾标点）
function normalizeCtx(s) {
    return String(s || '').replace(/\s+/g, ' ').replace(/^["'“”\s]+|["'“”\s]+$/g, '').trim().toLowerCase();
}

/**
 * 从知识库返回的切片里解析出「该词 + 该语境」对应的释义
 * 切片内容形如 CSV 行： "word","context","definition"（可能一个切片含多行）
 * @returns {{definition:string, matchedContext:string, matchType:string}|null}
 */
function parseDefinitionFromSlice(slice, word, context) {
    const w = String(word || '').trim().toLowerCase();
    const ctx = normalizeCtx(context);
    if (!slice || !w) return null;

    let best = null;
    const lines = String(slice).split(/\r?\n/);
    for (const line of lines) {
        if (!line.trim()) continue;
        // 跳过表头
        if (/^"?word"?\s*,\s*"?context"?/i.test(line.trim())) continue;
        const fields = parseCsvLine(line);
        if (fields.length < 3) continue;
        if (fields[0].toLowerCase() !== w) continue;
        const definition = (fields[2] || '').trim();
        if (!definition) continue;
        const partOfSpeech = (fields[3] || '').trim() || null;   // 可选第 4 列：词性

        const sliceCtx = normalizeCtx(fields[1]);
        if (!ctx) { best = { definition, partOfSpeech, matchedContext: fields[1], matchType: 'word-only' }; continue; }
        if (sliceCtx === ctx) return { definition, partOfSpeech, matchedContext: fields[1], matchType: 'exact' };
        // 长句前缀一致（知识库切片可能截断/两端略有差异）
        const head = ctx.slice(0, 60);
        if (sliceCtx && head && (sliceCtx.startsWith(head) || head.startsWith(sliceCtx.slice(0, 60)))) {
            if (!best) best = { definition, partOfSpeech, matchedContext: fields[1], matchType: 'prefix' };
        }
    }
    return best;
}

/**
 * 把「回写」这类副作用排到本轮事件循环之后再执行，避免拖慢用户请求的响应。
 *
 * 为什么需要：better-sqlite3 是同步 API，写操作会在调用点阻塞整个事件循环；
 * 而 server.js 与同步脚本是两个进程共用同一个库文件，一旦另一边正持写锁，
 * 这里就得干等（busy_timeout 最长 5 秒）。AI 都已经把释义算出来了，
 * 没理由让用户为「写一条缓存」再等这么久——所以先把结果返回，写库用 setImmediate 延后。
 *
 * 代价：若下一次点击同一「词 + 语境」时写入还没落库，会再走一次第三层。
 * 但 setImmediate 在本轮事件循环末尾就会执行，实际窗口只有毫秒级，可以忽略。
 *
 * @param {string} label 日志前缀（失败时能看出是哪一次回写）
 * @param {Function} fn  同步的回写函数
 */
function scheduleWriteBack(label, fn) {
    setImmediate(() => {
        try {
            fn();
        } catch (e) {
            console.error(`⚠️ [异步回写] ${label} 失败: ${(e && e.message) ? e.message : e}`);
        }
    });
}

/**
 * ==================== 词性标签归一（2026-10-06） ====================
 * 词性在整条链路上有三种写法，前端只认「国内教材常见」的那一种：
 *   · ECDICT `pos` 字段是**机器格式**：`adj:100/n:50`（带权重、用 / 分隔）
 *   · `word_context.part_of_speech` / AI 产出：`a` / `ad` / `adj` / `形容词` 混着来
 *   · 老式英汉词典的释义文本以 `a.`(=adjective) / `ad.`(=adverb) 打头
 * 学生看到 `a. 小的` 会以为是什么奇怪的缩写（用户实测反馈），所以统一成 `adj.` / `adv.`。
 */

// `part_of_speech` 字段（不带点、可能带权重）→ 标准标签
const POS_LABEL_MAP = {
    a: 'adj', ad: 'adv', adj: 'adj', adv: 'adv',
    n: 'n', v: 'v', vi: 'vi', vt: 'vt', aux: 'aux',
    prep: 'prep', conj: 'conj', pron: 'pron', num: 'num',
    art: 'art', int: 'interj', interj: 'interj', abbr: 'abbr'
};

/**
 * 归一 `part_of_speech`：`adj:100` → `adj`；`a` → `adj`；`ad` → `adv`；`形容词` 原样返回。
 * @returns {string|null}
 */
function normalizePosLabel(pos) {
    const raw = String(pos == null ? '' : pos).trim();
    if (!raw) return null;
    // 机器格式 `adj:100/n:50` → 取第一个标签、丢掉权重；AI 偶尔会带点号（`a.`）也一并去掉
    const first = raw.split('/')[0].split(':')[0].trim().toLowerCase().replace(/\.$/, '');
    if (!first) return null;
    return POS_LABEL_MAP[first] || first;
}

/**
 * 归一「释义文本行首的词性缩写」：`a. 小的` → `adj. 小的`。
 * 直接复用 db.js 的实现（同一套白名单规则，避免两处漂移）。
 */
function normalizeDefinitionPos(text) {
    return dbOps.normalizePosAbbr(text);
}

/**
 * 语境比对键（归一化）：小写 → 去掉站标 `[xxx]` → 去掉所有非字母字符 → 去掉全部空白。
 * 与前端 `squashSentence` 同一套规则（两处必须一致，否则又会出现「前端能对上、后端对不上」）。
 */
function squashContextKey(s) {
    return String(s == null ? '' : s)
        .toLowerCase()
        .replace(/\[[^\]]*\]/g, ' ')
        // ⚠️ 必须保留 0-9！2026-10-08 修：原来写的是 [^a-z\s]（把数字也当标点删掉），
        // 于是「只差数字」的两句会归一到同一个 key → 匹配到**别的句子的语境释义**。
        // 实测代价：test_api_layers 的探针语境 `QA-PROBE-<时间戳>-local-miss-...` 里
        // 时间戳被抹平 → 本轮「应该 miss 去联网」的查询命中了历史探针行（0ms、source=context），
        // 断言「联网耗时 > 本地」直接失败。真实场景同理会串句：'I have 2 apples.' 与
        // 'I have 5 apples.' 归一化后完全相同。数字是**内容**，不是标点，不能吞。
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, '');
}

/**
 * 语境库查询（2026-10-08）：**精确匹配优先，失败后按归一化键兜底**。
 *
 * 背景：用户反馈「收藏的是词典释义，不是联网深查的释义」。根因之一是
 * `getWordContext` 要求 `word + context` 逐字符相等 —— 而正文 DOM 里的句子与
 * 写库时的句子常因空格/标点/站标不同而 miss，于是语境释义明明在库里却取不出来，
 * 一路掉到词典层，把 part-time 的「兼职的」丢成 part 的「n. 部分, 局部…」。
 *
 * @returns {{row: object, matchType: 'exact'|'normalized'}|null}
 */
function findWordContextRow(word, ctx, opts) {
    const lower = String(word || '').toLowerCase().trim();
    const text = String(ctx || '').trim();
    if (!lower || !text) return null;
    try {
        const exact = dbOps.getWordContext(lower, text);
        if (exact && exact.definition) return { row: exact, matchType: 'exact' };
    } catch (e) {
        console.warn(`📖 [语境库] 精确匹配查询失败 word=${lower}: ${e.message}`);
    }
    const key = squashContextKey(text);
    if (!key) return null;
    // 归一化兜底：只在该词自己的候选行里比，代价可控（带 LIMIT）
    let candidates = [];
    try {
        candidates = dbOps.getWordContextCandidates(lower, (opts && opts.limit) || 200);
    } catch (e) {
        console.warn(`📖 [语境库] 候选查询失败 word=${lower}: ${e.message}`);
        return null;
    }
    for (const c of candidates) {
        if (squashContextKey(c.context) === key) return { row: c, matchType: 'normalized' };
    }
    return null;
}

/**
 * 同步、纯本地的「兜底释义」：词典层首义 → 语境库(word+context) → 通用词库。
 *
 * 用途：**批量补释义**（收藏列表 / 单词本 / 任何"已经存过释义、但可能存空了"的历史数据）。
 * 刻意不联网、不写库、不碰 LLM —— 那些是 lookupWordWithLayers 的职责。
 * 用户实测问题：35 条收藏里 25 条 `definition='暂无释义'`（拖拽路径写死），
 * 列表接口用这个函数把释义补回来。
 *
 * @param {string} word
 * @param {string} [context] 句子原文（用来命中 word_context；精确不成会走归一化兜底）
 * @returns {{meaning: string|null, source: 'context'|'dictionary'|'cache'|null, partOfSpeech: string|null}}
 */
function resolveLocalMeaning(word, context) {
    const lower = String(word || '').trim().toLowerCase();
    const empty = { meaning: null, source: null, partOfSpeech: null };
    if (!lower) return empty;

    const ctx = String(context || '').trim();
    if (ctx) {
        // 走统一的语境库查询（精确 → 归一化兜底），避免这里跟 lookupWordWithLayers 两套逻辑漂移
        const found = findWordContextRow(lower, ctx);
        if (found && found.row && found.row.definition) {
            return {
                meaning: normalizeDefinitionPos(found.row.definition),
                partOfSpeech: normalizePosLabel(found.row.part_of_speech),
                source: 'context'
            };
        }
    }

    try {
        const dict = dbOps.getDictionaryEntry(lower);
        if (dict && dict.translationLines && dict.translationLines.length) {
            return { meaning: dict.translationLines[0], partOfSpeech: null, source: 'dictionary' };
        }
    } catch (e) {
        console.warn(`📖 [本地兜底释义] 词典层查询失败 word=${lower}: ${e.message}`);
    }

    try {
        const defs = dbOps.getWordDefinitions(lower);
        if (defs.length > 0 && defs[0].definition) {
            return {
                meaning: normalizeDefinitionPos(defs[0].definition),
                partOfSpeech: normalizePosLabel(defs[0].part_of_speech),
                source: 'cache'
            };
        }
    } catch (e) {
        console.warn(`📖 [本地兜底释义] 通用词库查询失败 word=${lower}: ${e.message}`);
    }

    return empty;
}

// ==================== 粘连词拆分（2026-10-07） ====================
//
// 背景：文章正文常出现「词间空格丢失」——PDF 抽取 / OCR / 复制粘贴都会产生
//   `rapiddevelopment`（rapid + development）、`thinkprivate`（think + private）、
//   `ofordinary`（of + ordinary）。这种词点上去词典必然查不到，用户只看到「未收录」。
// 需求（用户 2026-10-07）：先查合并词的释义；查不到就拆成若干真词，各自给释义，
//   卡片上按「合并 → 分开」逐行展示。
//
// 实现：**用本地 ECDICT 当词表做动态规划分词**，纯离线（不联网、不耗 Coze 额度）。
//   ① 把该词所有长度 ≥2 的子串批量查一次词典（长度 15 时约 105 个子串，一次 SQL）；
//   ② DP：dp[i] = 前 i 个字母的最优切分，目标 = Σ(词长²) 最大，硬约束「每一段都必须能在词典里查到」；
//   ③ 无合法切分 → parts 为空（宁可不说，也绝不乱拆）。
//
// 为什么是「词长平方和」：天然偏向长词 —— rapiddevelopment 拆成 rapid + development，
//   而不是 rapid + develop + ment（后者本来也不合法）。再用词频做 tie-break，
//   把 privatecars 拆成 private + cars，而不是 priv + atecars。

const GLUE_MIN_PART_LEN = 2;      // 单段最短 2 个字母（`a` / `i` 这种太容易误拆）
const GLUE_MAX_WORD_LEN = 30;     // 输入上限：正常「掉空格」的粘连词不会这么长，更长的拆出来也不可信
const GLUE_MAX_SUBSTR = 900;      // 子串数上限；超长粘连串直接放弃
const GLUE_LONG_PART_LEN = 4;     // ≥ 4 个字母的段直接算「可信」，不看词频

/**
 * 判断一段切分结果是不是「可信的真词」。
 * ECDICT 有 36.5 万条，其中混了不少两条三字母的冷僻缩写（`bc` / `aa` / `yt`…），
 * 不加过滤会把 `rapiddevelopment` 拆成 `ra` + `pid` + `development` 这种垃圾。
 * 规则：段长 ≥ 4 一律可信；短段必须带「被真实语料用过」的信号（词频 / 柯林斯 / 牛津）。
 */
function isTrustedGluePart(entry, len) {
    if (!entry) return false;
    if (len >= GLUE_LONG_PART_LEN) return true;
    return (entry.bnc > 0) || (entry.frq > 0) || (entry.collins > 0) || (entry.oxford === 1);
}

/**
 * 词的「常用度」打分（越大越常用）。
 * ⚠️ ECDICT 的 `bnc` / `frq` 是**排名**（1 = 最常用），不是次数 ——
 * 直接拿它当词频用会**反过来**奖励生僻词：实测 `themore` 会被拆成 `them + ore`
 * （them 的 BNC 排名 46212、ore 8191，而 the 是 1、more 是 74）。
 * 所以这里取 `1/排名` 再相加（两个语料库排名都算，缺失的记 0）。
 */
function gluePartFrequency(entry) {
    let s = 0;
    if (entry && entry.bnc > 0) s += 1 / entry.bnc;
    if (entry && entry.frq > 0) s += 1 / entry.frq;
    return s;
}

/**
 * 词典分词：把粘连词拆成若干「词典里真实存在」的词。
 * @param {string} word 粘连词（大小写不敏感）
 * @param {{minPartLen?:number, maxSubstr?:number}} [opts]
 * @returns {{word, merged:{word, entry}, isGlued, parts:Array<{word, entry}>, method, elapsedMs, candidates}}
 */
function segmentGluedWord(word, opts = {}) {
    const t0 = Date.now();
    const raw = String(word || '').trim().toLowerCase();
    const out = {
        word: raw,
        merged: { word: raw, entry: null },
        isGlued: false,
        parts: [],
        method: 'none',
        elapsedMs: 0
    };
    if (!raw) { out.elapsedMs = Date.now() - t0; return out; }

    // ① 合并词本身先查一次（用户要求：先查合并词，查不到才拆）
    try {
        out.merged.entry = dbOps.getDictionaryEntry(raw);
    } catch (e) {
        console.warn(`🧩 [拆词] 查合并词失败 word=${raw}: ${e.message}`);
    }
    if (out.merged.entry) {
        out.elapsedMs = Date.now() - t0;
        console.log(`🧩 [拆词] "${raw}" 词典已收录（${(out.merged.entry.translationLines || []).length} 义项）→ 不需要拆`);
        return out;
    }

    // ② 只有「纯字母 + 长度够拆成两段」的词才值得继续
    const minLen = opts.minPartLen || GLUE_MIN_PART_LEN;
    const maxLen = opts.maxWordLen || GLUE_MAX_WORD_LEN;
    if (!/^[a-z]+$/.test(raw) || raw.length < minLen * 2) {
        out.elapsedMs = Date.now() - t0;
        console.log(`🧩 [拆词] "${raw}" 不是「纯字母且长度 ≥ ${minLen * 2}」→ 不拆`);
        return out;
    }
    if (raw.length > maxLen) {
        out.elapsedMs = Date.now() - t0;
        console.log(`🧩 [拆词] "${raw}" 长度 ${raw.length} 超过上限 ${maxLen} → 不拆`
            + '（正常掉空格的粘连词不会有这么长；再长基本都是噪声，拆了也是误导）');
        return out;
    }

    // ③ 收集所有长度 ≥ minLen 的子串，一次性批量查词典
    const subs = [];
    for (let i = 0; i < raw.length; i++) {
        for (let len = minLen; i + len <= raw.length; len++) subs.push(raw.slice(i, i + len));
    }
    const uniq = Array.from(new Set(subs));
    const maxSubstr = opts.maxSubstr || GLUE_MAX_SUBSTR;
    if (uniq.length > maxSubstr) {
        out.elapsedMs = Date.now() - t0;
        console.warn(`🧩 [拆词] "${raw}" 子串数 ${uniq.length} 超上限 ${maxSubstr} → 放弃（太长的粘连串拆出来也不可信）`);
        return out;
    }

    let dict = {};
    try {
        dict = dbOps.getDictionaryEntries(uniq) || {};
    } catch (e) {
        console.warn(`🧩 [拆词] 批量查子串失败 word=${raw}: ${e.message}`);
        out.elapsedMs = Date.now() - t0;
        return out;
    }

    // ④ DP：最大化 Σ(词长²)；同分时比「常用度」（Σ 1/排名，见 gluePartFrequency）
    const n = raw.length;
    const NEG = -Infinity;
    const score = new Array(n + 1).fill(NEG);
    const freqSum = new Array(n + 1).fill(0);
    const from = new Array(n + 1).fill(-1);
    score[0] = 0;
    for (let i = 1; i <= n; i++) {
        for (let len = minLen; len <= i; len++) {
            const j = i - len;
            if (score[j] === NEG) continue;
            const seg = raw.slice(j, i);
            const entry = dict[seg];
            if (!isTrustedGluePart(entry, len)) continue;
            const cand = score[j] + len * len;
            const candF = freqSum[j] + gluePartFrequency(entry);
            if (cand > score[i] || (cand === score[i] && candF > freqSum[i])) {
                score[i] = cand;
                freqSum[i] = candF;
                from[i] = j;
            }
        }
    }
    if (from[n] === -1) {
        out.elapsedMs = Date.now() - t0;
        console.log(`🧩 [拆词] "${raw}" 无「每段都在词典里」的合法切分 → 不拆（耗时 ${out.elapsedMs}ms）`);
        return out;
    }

    const parts = [];
    for (let i = n; i > 0; i = from[i]) {
        const w = raw.slice(from[i], i);
        parts.unshift({ word: w, entry: dict[w] });
    }
    if (parts.length < 2) {
        out.elapsedMs = Date.now() - t0;
        console.log(`🧩 [拆词] "${raw}" 只切出 1 段 → 视为不需要拆`);
        return out;
    }

    out.isGlued = true;
    out.parts = parts;
    out.method = 'dict-dp';
    out.elapsedMs = Date.now() - t0;
    console.log(`🧩 [拆词] "${raw}" → ${parts.map(p => p.word).join(' + ')}`
        + `（${out.method} | 子串 ${uniq.length} 个 | 耗时 ${out.elapsedMs}ms）`);
    return out;
}

/**
 * AI 拆词兜底（**默认不启用**，只有调用方显式传 ai=1 才走）。
 *
 * 为什么保留它：词典分词依赖「拆出来的每一段都单独收录在 ECDICT」，
 *   `Tomwentto` 这种「专名 + 粘连」的组合拆不出来（大小写信息在入库时已丢）。
 * 为什么默认关：Coze 额度按用户决策不充值，整条点词主路径必须保持 0 联网。
 * 拿到 AI 结果后**仍然逐段回查词典**，只保留真的能查到释义的段 —— AI 只负责切位置，不负责编词。
 */
async function splitGluedWordWithAI(word, opts = {}) {
    const raw = String(word || '').trim().toLowerCase();
    const t0 = Date.now();
    const out = { word: raw, isGlued: false, parts: [], method: 'none', elapsedMs: 0, aiSummary: null };
    if (!raw || !/^[a-z]+$/.test(raw)) { out.elapsedMs = Date.now() - t0; return out; }

    const cfg = resolveLLMConfig();
    if (!cfg.apiKey) {
        console.warn('⚠️ [拆词-AI] 未配置 LLM Key → 跳过');
        out.elapsedMs = Date.now() - t0;
        return out;
    }

    const system = '你是英语分词助手。用户给你一个「因空格丢失而粘连」的英文串，'
        + '请把它切回原本的单词序列。只输出 JSON，不要解释。';
    const user = `粘连串：${raw}\n`
        + '请按原本的词边界切开，输出：{"words":["word1","word2",...]}。'
        + '若无法确定，输出 {"words":[]}。要求：每段都必须是真实存在的英文单词，段数 2~4。';

    try {
        const { content } = await callLLM({
            ...cfg,
            messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
            tag: '拆词',
            timeoutMs: opts.timeoutMs || 20000,
            maxRetries: 0
        });
        let parsed = null;
        try { parsed = JSON.parse(extractJSON(content)); } catch (e) { /* 交给下面判空 */ }
        const words = (parsed && Array.isArray(parsed.words)) ? parsed.words : [];
        out.aiSummary = content ? String(content).slice(0, 200) : null;

        const parts = [];
        for (const w of words.slice(0, 4)) {
            const seg = String(w || '').trim().toLowerCase();
            if (!seg || !/^[a-z]+$/.test(seg)) continue;
            parts.push({ word: seg, entry: dbOps.getDictionaryEntry(seg) });   // 回查词典，查不到 entry=null
        }
        // 至少两段、且整体拼起来等于原串（防止 AI 顺手改词）
        const joined = parts.map(p => p.word).join('');
        if (parts.length >= 2 && joined === raw && parts.some(p => p.entry)) {
            out.isGlued = true;
            out.parts = parts;
            out.method = 'ai-assist';
            console.log(`🤖 [拆词-AI] "${raw}" → ${parts.map(p => p.word + (p.entry ? '' : '(无释义)')).join(' + ')}`
                + `（${Date.now() - t0}ms）`);
        } else {
            console.warn(`🤖 [拆词-AI] "${raw}" 结果不可用（段数=${parts.length}，拼回="${joined}"）→ 丢弃`);
        }
    } catch (e) {
        console.warn(`🤖 [拆词-AI] 失败: ${e.message}`);
    }
    out.elapsedMs = Date.now() - t0;
    return out;
}

/**
 * 对外统一入口：拆粘连词。先本地词典分词；`opts.allowAI=true` 时再退到 AI。
 * @returns {Promise<{word, merged, isGlued, parts, method, elapsedMs}>}
 */
async function splitGluedWord(word, opts = {}) {
    const local = segmentGluedWord(word, opts);
    if (local.isGlued || !opts.allowAI) return local;
    const ai = await splitGluedWordWithAI(word, opts);
    if (ai.isGlued) {
        console.log(`🧩 [拆词] "${word}" 本地拆不出 → AI 兜底成功`);
        return { ...ai, merged: local.merged };
    }
    console.log(`🧩 [拆词] "${word}" 本地与 AI 都拆不出 → 返回「未拆」`);
    return local;
}

/**
 * 三层查询：点词取释义
 *   L1 Coze 工作流 word_context_search（传 word + context）→ 命中直接返回
 *   L2 本地 word_context 表（word + context）
 *   L3 AI 生成（word_meaning_generator）→ 生成后写入 word_context（本轮回写，下次走 L2/L1）
 * 额外兼容层：通用词库 word_cache（保证前端旧行为不退化）
 * @param {string} word 单词
 * @param {string} context 语境句子
 * @param {object} opts { articleId, enableAI }
 * @returns {Promise<{success, word, context, definition, source, layer, layers, hitScore, elapsed, stats}>}
 */
async function lookupWordWithLayers(word, context, opts = {}) {
    const rawWord = String(word || '').trim();
    const lower = rawWord.toLowerCase();
    const ctx = String(context || '').trim();
    const startedAt = Date.now();
    if (!rawWord) {
        return { success: false, error: '缺少 word', layer: 'none', layers: [] };
    }

    lookupStats.total++;
    const layers = [];
    let definition = null;          // 主释义（给旧前端 / definitions 数组用的那一条）
    let contextDefinition = null;   // 语境释义（L1 知识库 / L2 语境库 / L3 AI 产出）
    let contextSource = null;       // 语境释义来自哪一层
    let source = 'none';
    let layer = 'none';
    let hitScore = null;
    let partOfSpeech = null;

    // ---------- 词典层：本地字典库（同步、无网络、不依赖 Coze） ----------
    // 这一层和「语境释义」是正交的，不参与命中层级竞争 —— 无论语境释义查没查到，
    // 词典都要查：前者回答「在这句话里什么意思」，后者回答「这个词总共有哪些意思」。
    // 放在最前面是因为它极便宜（实测单次点查 ~20µs），先拿到手就能兜住语义空档。
    const dictStartAt = Date.now();
    const dictionaryEntry = dbOps.getDictionaryEntry(lower);
    const dictElapsed = Date.now() - dictStartAt;
    if (dictionaryEntry) {
        lookupStats.dictHits++;
        layers.push({
            layer: 'dictionary',
            hit: true,
            word: dictionaryEntry.word,
            translationLines: dictionaryEntry.translationLines.length,
            definitionLines: dictionaryEntry.definitionLines.length,
            viaLemma: dictionaryEntry.lemma && dictionaryEntry.lemma !== lower ? dictionaryEntry.lemma : null,
            elapsed: dictElapsed
        });
        console.log(`📖 [三层查询-词典层] 本地词典命中 | word=${lower}${dictionaryEntry.lemma && dictionaryEntry.lemma !== lower ? `（原形 ${dictionaryEntry.lemma}）` : ''} | 中文义项 ${dictionaryEntry.translationLines.length} 条 | 英文释义 ${dictionaryEntry.definitionLines.length} 条 | 音标=${dictionaryEntry.phoneticPretty || '无'} | 词频 bnc=${dictionaryEntry.bnc}/frq=${dictionaryEntry.frq} | 耗时=${dictElapsed}ms`);
    } else {
        lookupStats.dictMisses++;
        layers.push({ layer: 'dictionary', hit: false, elapsed: dictElapsed });
        if (dbOps.getDictionaryStats().ready) {
            console.log(`📖 [三层查询-词典层] 本地词典未收录 | word=${lower} | 耗时=${dictElapsed}ms`);
        }
    }

    // ---------- 语境层（本地优先）：word_context 语境库 ----------
    // 顺序说明（2026-10-05 调整）：
    //   以前是「L1 知识库 → L2 语境库 → L3 AI」，即每次点词都先打一次 Coze 工作流。
    //   但 Coze 知识库里的内容本来就是 word_context 的云端副本（由 export_csv.js 上传），
    //   所以「词 + 语境」能精确命中时，L2 一定能命中、而且只要 ~1ms；先打 L1 纯属白等
    //   （实测每次冷词白付 0.3~1.2 秒）。现在改成**本地层全部走完，还没结果才联网**。
    // 因此下面把 L2 提到了 L1 前面；L1 见「联网层」那一段。命中层级命名保持 kb/context 不变，
    // 只是顺序反了 —— 日志里的层级编号（L1/L2）沿用历史叫法，别被数字顺序误导。
    if (!contextDefinition && ctx) {
        // 精确匹配 → 归一化兜底（2026-10-08）：正文句子与写库句子常因空格/标点/站标不同而
        // 精确 miss；只认精确的话，语境释义明明在库里也会被跳过，一路掉到词典层
        // （用户现象：part-time 收藏成 part 的「n. 部分, 局部…」）。见 findWordContextRow。
        const found = findWordContextRow(lower, ctx);
        const row = found ? found.row : null;
        const hit = !!(row && row.definition);
        const matchType = found ? found.matchType : null;
        layers.push({ layer: 'context', hit, matchType, definition: hit ? row.definition : null });
        if (hit) {
            contextDefinition = normalizeDefinitionPos(row.definition);
            contextSource = 'context';
            partOfSpeech = normalizePosLabel(row.part_of_speech);
            source = 'context';
            layer = 'context';
            console.log(`🥈 [三层查询-L2] 语境库命中（本地${matchType === 'normalized' ? '，靠归一化兜底匹配' : ''}）`
                + ` | word=${lower} | id=${row.id} | 释义="${contextDefinition.slice(0, 40)}"`);
        } else {
            console.log(`➖ [三层查询-L2] 语境库未命中（精确 + 归一化都没匹配上）→ 交给联网层（若已开启）`
                + ` | word=${lower} | context长度=${ctx.length}`);
        }
    } else if (!contextDefinition) {
        layers.push({ layer: 'context', hit: false, skipped: true, error: '无 context' });
        console.log('➖ [三层查询-L2] 未传语境，跳过');
    }

    // ---------- 联网层：Coze 知识库工作流 + AI 生成（默认关闭，显式开启才走） ----------
    // 默认关闭的理由：本地词典层已经能给出完整释义，L2 命中只要 ~1ms，
    // 而联网层要付「工作流往返 0.3~1.2s」或「LLM 往返 4~13s」。
    // 前端的做法是先用本地结果即时出卡，卡片里放一个「联网深查」按钮，
    // 用户真需要更准的语境释义时点一下，带 ?ai=1 再打一次 —— 这时才值得为精度等一会儿。
    const enableRemote = opts.enableRemote === true || opts.enableAI === true;
    if (!contextDefinition && !enableRemote) {
        lookupStats.kbDisabled++;
        layers.push({ layer: 'kb', hit: false, skipped: true, error: '联网层未开启（本地层已足够，可在前端点「联网深查」）' });
        console.log(`➖ [三层查询-L1] 联网深查未开启（默认只走本地词典 + 语境库）→ 跳过 | word=${lower}`);
    }

    // ---------- 第一层：Coze 工作流 word_context_search（联网，可选） ----------
    if (!contextDefinition && enableRemote && isKnowledgeBaseConfigured()) {
        const query = ctx ? `${rawWord} ${ctx}` : rawWord;
        const kbRes = await searchKnowledgeBase(query, {
            tag: '三层查询-L1',
            word: rawWord,          // 精确筛选：只保留 word 与查询词完全一致的记录
            context: ctx
        });
        // 注：失败/熔断跳过/命中 的计数统一在下方明细分支里做，避免重复累加
        let kbParsed = null;
        if (kbRes.success && kbRes.exact && kbRes.exact.definition) {
            // 精确筛选命中（工作流输出里的 JSON 记录）
            kbParsed = {
                definition: kbRes.exact.definition,
                partOfSpeech: kbRes.exact.partOfSpeech || null,
                matchedContext: kbRes.exact.context || '',
                matchType: 'exact-word',
                kbScore: kbRes.exact.score
            };
        } else if (kbRes.success) {
            // 兜底：切片模式（CSV 行），parseDefinitionFromSlice 同样只认 word 相等的行
            for (const hit of kbRes.hits) {
                const parsed = parseDefinitionFromSlice(hit.slice, rawWord, ctx);
                if (parsed) { kbParsed = { ...parsed, kbScore: hit.score }; break; }
            }
        }
        layers.push({ layer: 'kb', hit: !!kbParsed, hitScore: kbParsed ? kbParsed.kbScore : null, matchType: kbParsed ? kbParsed.matchType : null, queryForm: kbRes.queryForm || null, error: kbRes.error || null, elapsed: kbRes.elapsed });
        // L1 工作流调用明细：调用次数 / 命中 / 未命中 / 失败 / 纯粹熔断跳过 / 耗时
        lookupStats.kbLookups++;
        lookupStats.kbCalls += kbRes.calls || 0;
        lookupStats.kbElapsedMs += kbRes.elapsed || 0;
        if ((kbRes.calls || 1) > 1 && kbParsed) lookupStats.kbMulti++;
        // 本次检索里是否有「真的发出去并失败」的轮次（区别于「因为熔断压根没发」）
        const hadRealAttemptError = (kbRes.perAttempt || []).some(a => a.ok === false && !a.circuit);
        // 互斥归类：命中 > 真实失败 > 纯熔断跳过 > 正常未命中
        // （首次触发熔断的那一次会同时有「真实失败」和「次轮被跳过」，归到「失败」更贴近事实：这次确实是失败的）
        if (kbParsed) {
            lookupStats.kbHits++;
        } else if (hadRealAttemptError) {
            lookupStats.kbErrors++;
            lookupStats.layerErrors++;
        } else if (kbRes.circuitOpen) {
            lookupStats.kbCircuit++;        // 纯粹因为熔断冷却而没调用
        } else {
            lookupStats.kbMisses++;
        }
        if (kbParsed) {
            contextDefinition = normalizeDefinitionPos(kbParsed.definition);
            contextSource = 'kb';
            hitScore = kbParsed.kbScore;
            partOfSpeech = normalizePosLabel(kbParsed.partOfSpeech);
            source = 'context';
            layer = 'kb';
            console.log(`🥇 [三层查询-L1] 工作流命中 | word=${lower} | 采用形态=${kbRes.queryForm || '-'} | 实际调用=${kbRes.calls || 0} 次 | 匹配方式=${kbParsed.matchType} | 相关度=${kbParsed.kbScore} | 释义="${kbParsed.definition.slice(0, 40)}" | 耗时=${kbRes.elapsed}ms`);
        } else if (hadRealAttemptError) {
            // 有轮次真的发出去了并失败 —— 把完整错误码与建议一次性打全，省得去翻别的日志
            const circ = isKbCircuitOpen() ? kbCircuitState() : null;
            console.error(`❌ [三层查询-L1] 工作流调用失败明细 | word=${lower} | 形态=${kbRes.queryForm || '-'} | 实际调用=${kbRes.calls || 0} 次 | code=${kbRes.errorCode || 'N/A'}${circ ? ` | 熔断根因=${circ.error} | 冷却剩余 ${Math.round(circ.remainingMs / 1000)}s` : ''}${kbRes.hint ? `\n   └─ 处理建议: ${kbRes.hint}` : ''}`);
            console.error(`   └─ 本次 L2 语境库已经查过（未命中）才轮到 L1；若 code=4028/4100/4101/4200 属熔断类，后续点词在冷却期内会直接走 L2/L3`);
        } else if (kbRes.circuitOpen) {
            console.warn(`🛑 [三层查询-L1] 熔断跳过（未发起调用，code=${kbRes.errorCode}）→ 联网层未命中 | 原因: ${kbRes.error}${kbRes.hint ? ` | 处理建议: ${kbRes.hint}` : ''}`);
        } else {
            console.log(`➖ [三层查询-L1] 工作流未命中（实际调用 ${kbRes.calls || 0} 次，最后一轮返回 ${kbRes.hitsAll ? kbRes.hitsAll.length : 0} 条候选，精确筛选后无匹配）→ L2 语境库也已查过（未命中），本次确实无解 | 耗时=${kbRes.elapsed}ms${kbRes.error ? ` | 错误: ${kbRes.error}` : ''}`);
        }
    } else if (!contextDefinition && enableRemote) {
        // 走到这里说明「开了联网深查，但工作流没配」
        lookupStats.kbSkipped++;
        layers.push({ layer: 'kb', hit: false, skipped: true, error: 'L1 检索工作流未配置' });
        console.log('➖ [三层查询-L1] 检索工作流未配置（缺 COZE_KB_SEARCH_WORKFLOW_ID），跳过');
    }

    // ---------- 第三层：AI 生成 + 回写（联网，可选） ----------
    // 默认关闭：词典层已经能给出完整释义，AI 这一步（实测 LLM 往返 4~13s）不该在每次点词时默认发生。
    // 前端的做法是先用词典 + 语境库即时出卡，卡片里放一个「AI 生成语境释义」按钮，
    // 用户真需要「这个词在这句话里到底什么意思」时点一下，带 ?ai=1 再打一次这个接口。
    if (!contextDefinition && enableRemote) {
        const l3StartAt = Date.now();
        try {
            console.log(`🥉 [三层查询-L3] 调用 AI 生成释义 | word=${lower} | 超时上限=${WORD_MEANING_TIMEOUT_MS}ms | context="${ctx.slice(0, 60)}"`);
            const generated = await generateWordMeaningsWithCoze([lower], [ctx]);
            const l3Ms = Date.now() - l3StartAt;
            const first = Array.isArray(generated) ? generated.find(g => g && g.definition) : null;
            if (first) {
                contextDefinition = normalizeDefinitionPos(first.definition);
                contextSource = 'ai';
                partOfSpeech = normalizePosLabel(first.part_of_speech);
                source = 'ai';
                layer = 'ai';
                // 回写是「副作用」，不能挡住用户点击：
                // 释义已经在手，先把响应发出去，两条写库操作打包排到本轮事件循环之后。
                // 快照成局部常量，避免后续 definition 被兼容层改写时影响这次回写。
                const aiDefinition = contextDefinition;
                const aiPos = first.part_of_speech || null;
                // 回写本身是同步 SQLite 写 + 排到本轮事件循环之后执行；
                // 打上「距请求开始多少毫秒」，日志里一眼能看出它确实发生在响应之后（证明没阻塞用户点击）
                const requestStartAt = startedAt;
                scheduleWriteBack(`L3 回写 | word=${lower}`, () => {
                    const sinceReq = Date.now() - requestStartAt;
                    // 回写 word_context：下一轮同样「词 + 语境」就能命中第二层
                    if (ctx) {
                        const saved = dbOps.saveWordContext(lower, ctx, aiDefinition, aiPos, opts.articleId || null);
                        if (saved) {
                            lookupStats.aiSaved++;
                            console.log(`🧠 [三层查询-L3] 已回写 word_context | word=${lower} | id=${saved.id} | 发生在响应之后 ${sinceReq}ms（异步，未阻塞点击）`);
                        } else {
                            console.log(`🧠 [三层查询-L3] word_context 已存在同词同语境释义，跳过写入 | word=${lower} | +${sinceReq}ms`);
                        }
                    }
                    // 同时补一份通用词库，保证「不带语境」查词也有结果
                    if (!dbOps.getWordFromCache(lower)) {
                        dbOps.addWordDefinition(lower, aiDefinition, aiPos);
                        console.log(`🧠 [三层查询-L3] 已补写通用词库 word_cache | word=${lower} | +${sinceReq}ms`);
                    }
                });
                console.log(`⚡ [三层查询-L3] 释义已就绪（LLM 往返 ${l3Ms}ms），回写已排入异步队列（不阻塞本次响应）| word=${lower}`);
            } else {
                console.log(`➖ [三层查询-L3] AI 未返回有效释义 | 耗时=${l3Ms}ms`);
            }
            layers.push({ layer: 'ai', hit: !!first });
        } catch (e) {
            lookupStats.layerErrors++;
            console.error(`❌ [三层查询-L3] AI 生成失败: ${e.message}`);
            layers.push({ layer: 'ai', hit: false, error: e.message });
        }
    } else if (!contextDefinition) {
        layers.push({ layer: 'ai', hit: false, skipped: true, error: enableRemote ? 'AI 已开启但未调用' : '联网层未开启（本地层已足够）' });
        console.log(`➖ [三层查询-L3] AI 未调用（按需触发，本次 enableRemote=${enableRemote}）| word=${lower} | 已有词典释义=${dictionaryEntry ? '有' : '无'}`);
    }

    // ---------- 兼容层：通用词库 ----------
    // 只在「连语境释义都没有」时才兜底 —— 词典层已经给出完整释义的话，
    // 再拿 word_cache 里当年 AI 写的一条通用释义没有意义（而且会盖掉更好的结果）。
    if (!contextDefinition) {
        const defs = dbOps.getWordDefinitions(lower);
        if (defs.length > 0) {
            contextDefinition = normalizeDefinitionPos(defs[0].definition);
            contextSource = 'cache';
            partOfSpeech = normalizePosLabel(defs[0].part_of_speech);
            source = 'cache';
            layer = 'cache';
            console.log(`🔁 [三层查询-兼容层] 通用词库命中 | word=${lower} | 释义="${String(contextDefinition).slice(0, 40)}"`);
        }
        layers.push({ layer: 'cache', hit: !!contextDefinition });
    }

    // ---------- 主释义：语境优先，其次词典首义 ----------
    // 前端的新结构是「语境释义 + 其他释义列表」两栏并列，`definition` 只是给旧前端
    // / definitions 数组用的单条兜底，取「语境释义 > 词典第一条中文义项」。
    const dictFirstLine = dictionaryEntry && dictionaryEntry.translationLines.length
        ? dictionaryEntry.translationLines[0]
        : null;
    definition = contextDefinition || dictFirstLine || null;
    if (!contextDefinition && dictFirstLine) {
        // 词典独中：主释义来自词典，但 contexts 那一栏是空的（前端会提示可点按钮生成语境释义）
        source = 'dictionary';
        layer = 'dictionary';
    }
    if (!partOfSpeech && dictionaryEntry && dictionaryEntry.pos) {
        // ECDICT 这里是机器格式 `adj:100/n:50`，直接吐给前端会出现 `(adj:100)` 这种东西
        partOfSpeech = normalizePosLabel(dictionaryEntry.pos);
    }

    // ---------- 计数与日志 ----------
    if (layer === 'kb') lookupStats.kb++;
    else if (layer === 'context') lookupStats.context++;
    else if (layer === 'ai') lookupStats.ai++;
    else if (layer === 'dictionary') lookupStats.dictionaryLayer++;
    else if (layer === 'cache') lookupStats.cache++;
    if (!definition) lookupStats.miss++;

    const elapsed = Date.now() - startedAt;
    console.log(`🔎 [三层查询] word="${lower}" | 主释义来源=${layerLabelOf(layer)} | 语境释义=${contextDefinition ? `有(${contextSource})` : '无'}${
        dictionaryEntry ? ` | 词典释义=有(${dictionaryEntry.translationLines.length} 义项)` : ' | 词典释义=无'}`);
    console.log(`   └─ 释义="${definition ? String(definition).slice(0, 40) : '(无)'}" | 总耗时=${elapsed}ms（词典层 ${dictElapsed}ms）`);
    console.log(`📈 [三层查询][命中率] 累计 ${lookupStats.total} 次 | 词典层 ${lookupStats.dictHits}(${hitRate(lookupStats.dictHits)}) | L1工作流 ${lookupStats.kb}(${hitRate(lookupStats.kb)}) | L2语境库 ${lookupStats.context}(${hitRate(lookupStats.context)}) | L3 AI ${lookupStats.ai}(${hitRate(lookupStats.ai)}) | 兼容词库 ${lookupStats.cache}(${hitRate(lookupStats.cache)}) | 未命中 ${lookupStats.miss}(${hitRate(lookupStats.miss)}) | L3回写(异步计数，本行可能滞后 1 次) ${lookupStats.aiSaved} | 层级异常 ${lookupStats.layerErrors}`);
    console.log(`   └─ [L1 工作流明细] 检索 ${lookupStats.kbLookups} 次 / 实际调用 ${lookupStats.kbCalls} 次 | 命中 ${lookupStats.kbHits}（其中靠第二轮才中 ${lookupStats.kbMulti} 次）| 未命中 ${lookupStats.kbMisses} | 失败 ${lookupStats.kbErrors} | 熔断跳过 ${lookupStats.kbCircuit} | 跳过(未配置) ${lookupStats.kbSkipped} | 平均耗时 ${lookupStats.kbLookups ? Math.round(lookupStats.kbElapsedMs / lookupStats.kbLookups) : 0}ms/次检索`);
    if (isKbCircuitOpen()) {
        const st = kbCircuitState();
        console.warn(`   └─ [L1 熔断] 正在冷却 | code=${st.code} | 剩余 ${Math.round(st.remainingMs / 1000)}s | 累计开路 ${st.trips} 次${st.hint ? ` | ${st.hint}` : ''}`);
    }

    return {
        success: !!definition,
        word: lower,
        context: ctx,
        // 新结构：语境释义（可为 null，表示「本句还没生成过」）
        contextDefinition,
        contextSource,              // kb | context | ai | cache | null
        // 词典层：完整释义（音标 / 中文多义项 / 英文释义 / 词性 / 星级 / 考试标签 / 词形变化）
        dictionary: dictionaryEntry,
        // 兼容旧前端
        definition,
        partOfSpeech,
        part_of_speech: partOfSpeech,
        source,
        layer,
        layers,
        hitScore,
        elapsed,
        dictElapsedMs: dictElapsed,
        stats: getLookupStats()
    };
}

// 读取三层查询命中统计（供 /api/kb/stats 使用）
function getLookupStats() {
    const s = lookupStats;
    return {
        total: s.total,
        layers: {
            dictionary: { count: s.dictionaryLayer, rate: hitRate(s.dictionaryLayer) },  // 词典作为主释义来源
            kb: { count: s.kb, rate: hitRate(s.kb) },
            context: { count: s.context, rate: hitRate(s.context) },
            ai: { count: s.ai, rate: hitRate(s.ai) },
            cache: { count: s.cache, rate: hitRate(s.cache) },
            miss: { count: s.miss, rate: hitRate(s.miss) }
        },
        // L1 工作流自己的调用情况（和上面的「命中层级」是两回事：这里看的是工作流调通没、筛出词没）
        kbWorkflow: {
            lookups: s.kbLookups,                                   // L1 检索次数
            calls: s.kbCalls,                                       // 实际工作流调用次数（多轮重试会 > lookups）
            multiRoundHits: s.kbMulti,                              // 打到第二轮才命中的次数
            hits: s.kbHits,
            misses: s.kbMisses,
            errors: s.kbErrors,
            circuitSkips: s.kbCircuit,                              // 因熔断被跳过、未发起调用的次数
            skipped: s.kbSkipped,
            disabled: s.kbDisabled,                                 // 联网层未开启而跳过的次数（默认路径下会一直涨）
            hitRate: s.kbLookups > 0 ? (Math.round((s.kbHits / s.kbLookups) * 1000) / 10) + '%' : '0%',
            avgMs: s.kbLookups > 0 ? Math.round(s.kbElapsedMs / s.kbLookups) : 0,
            circuit: kbCircuitState()                               // 熔断当前状态（是否开路 / 错误码 / 剩余冷却时间）
        },
        // 词典层（本地 ECDICT）：覆盖率与它在「主释义来源」里出场的次数
        dictionaryLayer: {
            asPrimary: s.dictionaryLayer,                           // 词典作为主释义来源的次数（语境释义为空时）
            hits: s.dictHits,
            misses: s.dictMisses,
            coverage: s.total > 0 ? (Math.round((s.dictHits / s.total) * 1000) / 10) + '%' : '0%'
        },
        aiSaved: s.aiSaved,
        layerErrors: s.layerErrors
    };
}

module.exports = {
    // 三个独立任务
    analyzeSentencesWithCoze,
    // 2026-10-08：队列侧要用同一个「是否含足够英文」判据，避免两处口径不一致
    hasEnoughEnglish,
    analyzeWordsWithCoze,
    generateQuestionsWithCoze,
    // 兼容旧调用（SSE 同步路径）
    analyzeArticleWithCoze,
    generateWordMeaningsWithCoze,
    parseAIResponse,
    normalizeQuestions,
    isCozeConfigured,
    // 工具函数
    extractWords,
    splitCachedUncached,
    mergeWordData,
    extractWordContextList,
    buildWordContextFromSentenceIndex,
    // mock
    generateMockResult,
    generateMockWordList,
    generateMockSentenceList,
    getLevelLabel,
    // Coze 知识库（手动同步 + 三层查询）
    isKnowledgeBaseConfigured,
    searchKnowledgeBase,          // L1：多轮调 word_context_search 工作流检索（用户点词第一层）
    searchKnowledgeBaseOnce,      // L1 单轮版（只打一次工作流），供排障/对比用
    buildKbQueryAttempts,         // 构造 L1 的 query 形态序列（供排障复盘）
    callCozeWorkflow,             // 通用工作流调用（超时 + 重试 + data 解析），供排障/复用
    lookupWordWithLayers,         // 查词：本地词典层 + 语境释义（L1 工作流 → L2 word_context → L3 AI 按需开启）
    resolveLocalMeaning,          // 同步、纯本地的兜底释义（词典首义 → 语境库 → 通用词库）：批量补释义用
    // 粘连词拆分（PDF/OCR 掉空格：rapiddevelopment → rapid + development）
    segmentGluedWord,             // 纯本地词典分词（动态规划），同步、不联网
    splitGluedWordWithAI,         // AI 兜底拆词（默认不启用，需显式调用）
    splitGluedWord,               // 对外统一入口：本地优先，allowAI=true 时才退到 AI
    isTrustedGluePart,            // 切分可信度判定（字典噪声过滤），供测试用
    normalizePosLabel,            // `a`/`ad`/`adj:100` → `adj`/`adv`（前端只认这套标签）
    normalizeDefinitionPos,       // 释义文本行首词性缩写归一：`a. 小的` → `adj. 小的`
    scheduleWriteBack,            // 回写副作用延后执行（不阻塞用户点击响应）
    getLookupStats,
    // L1 熔断（额度/权限/未发布 这类重试无解的错误 → 冷却期内跳过 L1）
    getKbCircuitState: kbCircuitState,
    resetKbCircuit,               // 手动复位（修好额度/权限后不必等冷却）
    // 模型健康熔断（GLM / DeepSeek 连续失败 → 冷却期内只用健康的那个，不再白等超时）
    getModelHealth,               // 当前各模型健康度（排障用）
    resetModelHealth,             // 手动复位模型熔断
    // 内部函数只读暴露（仅供 test_model_fallback.js 回归使用，业务代码请勿依赖）
    __diag: {
        isTimeoutLikeError,       // 超时/中断类错误判定
        splitArticleIntoChunks,   // 按长度拆批（验证「超时细分」对短文也生效）
        forceSplitIntoChunks,     // 按句边界强制劈批（短文超时的兜底）
        getModelHealth,
        resetModelHealth
    },
    // ⛔ 已停用（手动同步模式）：自动上传 / content 编码探测 / 文档删除清理
    // 需要恢复时，去掉下面几行的 `//` 前缀，并同步还原 coze.js 里的 ⛔ 代码块
    // uploadToKnowledgeBase,
    // probeContentMode,
    // deleteKnowledgeDocuments,
    // pruneAutoKnowledgeDocuments,
    // encodeKbContent,
    // 只读诊断：列出手动上传后的知识库文档（不写、不删）
    // ⚠️ 需要 PAT 具备「知识库 document.list」权限；改成工作流后 L1 已不需要该权限
    listKnowledgeDocuments,
    KB_AUTO_DOC_PREFIX,
    KB_PROBE_DOC_PREFIX,
    // 知识库工具函数（供 sync_to_knowledge.js 复用）
    buildWordContextCsv,
    csvEscape,
    parseCsvLine,
    parseDefinitionFromSlice,
    // 知识库「精确筛选」工具（工作流输出 → 带 word 的 JSON 记录 → word 完全匹配）
    pickExactWordRecord,
    collectKbWordRecords,
    // 配置（只读暴露）
    config: {
        COZE_BOT_ID: MODEL_CONFIGS.article.primary.model,
        COZE_KB_ID: KB_ID,
        COZE_KB_BASE_URL: KB_BASE_URL,
        // ---- L1 检索（工作流形态，2026-09-28 起）----
        COZE_KB_SEARCH_WORKFLOW_ID: KB_SEARCH_WORKFLOW_ID,
        COZE_KB_WORKFLOW_PATH: KB_WORKFLOW_PATH,
        COZE_KB_WORKFLOW_QUERY_PARAM: KB_WORKFLOW_QUERY_PARAM,
        COZE_KB_WORKFLOW_BOT_ID: KB_WORKFLOW_BOT_ID || null,
        COZE_KB_WORKFLOW_TIMEOUT_MS: KB_WORKFLOW_TIMEOUT_MS,
        COZE_KB_QUERY_MODE: KB_QUERY_MODE,
        COZE_KB_CIRCUIT_COOLDOWN_MS: KB_CIRCUIT_COOLDOWN_MS,
        COZE_WORD_MEANING_TIMEOUT_MS: WORD_MEANING_TIMEOUT_MS,
        COZE_WORD_MEANING_MAX_RETRIES: WORD_MEANING_MAX_RETRIES,
        // COZE_KB_SEARCH_PATH 已废弃：L1 不再直连 /open_api/knowledge/document/search（该路径是网关 404）
        // ⚠️ 以下各项服务于已停用的「自动上传」，仅作留档，手动同步模式下无实际作用
        COZE_KB_CREATE_PATH: KB_CREATE_PATH,
        COZE_KB_UPLOAD_STYLE: KB_UPLOAD_STYLE,
        COZE_KB_DOCUMENTS_PATH: KB_DOCUMENTS_PATH_TEMPLATE,
        COZE_KB_LIST_PATH: KB_LIST_PATH,
        COZE_KB_DELETE_PATH: KB_DELETE_PATH,
        COZE_KB_CONTENT_MODE: KB_CONTENT_MODE,
        COZE_KB_AUTO_DOC_PREFIX: KB_AUTO_DOC_PREFIX,
        COZE_KB_TOP_K: KB_TOP_K,
        COZE_KB_SCORE_THRESHOLD: KB_SCORE_THRESHOLD
    }
};
