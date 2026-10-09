/**
 * queue.js - 进程内轻量异步任务队列
 *
 * 替代 Bull + Redis 方案：
 * - 用 Map 存任务状态，Node 进程内调度（setImmediate + setTimeout）
 * - 不依赖 Redis，零安装；进程重启时队列内存丢失，
 *   但文章 status 持久化在 articles 表（重启后可重新入队 pending/processing 的）
 * - 重试策略：最多 3 次，指数退避（5s → 10s → 20s）
 *
 * 处理流程（对应需求第二部分）：
 *   1. 接收 { articleId, content, userId }
 *   2. 调用 analyzeArticleWithCoze（提取单词→查缓存→调 Coze）
 *   3. saveWordsToCache（新单词存入 word_cache 表）
 *   4. 更新 articles，存 questions + sentences
 *   5. 失败则 status='failed'，重试；超过次数保持 failed
 *
 * 文章最终状态（2026-10-06 起三态）：
 *   completed —— 三个工作流全成功（questions + sentences 都是真结果）
 *   partial   —— **句子翻译失败**，但单词释义 / 题目成功。errors 记在 articles.sentences_error。
 *                以前这种情形会被写成 completed + sentences=[]，用户完全感知不到译文丢了（静默降级）。
 *   failed    —— 三个工作流全失败（或重试耗尽），前端切基础模式。
 *
 * 只重跑句子翻译（2026-10-07）：
 *   partial 文章在阅读页出现「句子翻译暂时不可用 [重试]」按钮 → POST /api/retry-sentences/:id
 *   → queue.startSentenceRetry() 只调 analyzeSentencesWithCoze，成功翻 completed、失败保持 partial。
 */

const dbOps = require('./db');
const coze = require('./coze');
const { generateFallbackQuestions } = require('./fallback');

const MAX_RETRIES = parseInt(process.env.QUEUE_MAX_RETRIES || '3', 10);
const BASE_BACKOFF_MS = 5000;  // 指数退避起步：5秒

// 进程内任务状态表：articleId → { status, retries, error, startedAt }
const taskMap = new Map();

/**
 * 加入队列（立即返回，后台处理）
 * @param {object} job - { articleId, content, userId, title }
 * @returns {{ articleId, status: 'pending' }}
 */
function enqueue(job) {
    const { articleId } = job;

    // 幂等性：同一文章 ID 已在内存表中（处理中/等重试），直接返回当前状态，不重复跑工作流
    const existing = taskMap.get(articleId);
    if (existing) {
        console.log(`⏭️ [队列] 重复请求，跳过：articleId=${articleId}（当前状态=${existing.status}）`);
        return { articleId, status: existing.status };
    }

    taskMap.set(articleId, {
        status: 'pending',
        retries: 0,
        error: null,
        startedAt: Date.now(),
        // 部分结果字段：三个任务谁先完成谁先写入，前端轮询逐步渲染
        questionsReady: false,
        questions: null,
        wordsReady: false,
        words: null,
        sentencesReady: false,
        sentences: null,
        // 句子翻译失败标记（2026-10-06）：不再静默降级成 completed，前端据此提示「译文生成失败」
        sentencesFailed: false,
        sentencesError: null,
        finishOrder: []
    });
    // 异步处理，不阻塞调用方
    setImmediate(() => processWithRetry(job, 0));
    return { articleId, status: 'pending' };
}

/**
 * 查询队列状态
 */
function getQueueStatus(articleId) {
    return taskMap.get(articleId) || null;
}

/**
 * 判断 Coze 错误是否为「不可重试」的致命错误（额度不足/鉴权等 4xxx 客户端错误）
 * 这类错误重试无意义，应立刻失败并让前端降级。
 */
function isFatalCozeError(err) {
    if (!err) return false;
    const message = (err && err.message) ? err.message : String(err);
    return /code=4\d{3}/.test(message) || /额度|quota|insufficient|4028/i.test(message);
}

/**
 * 带重试的处理函数
 */
async function processWithRetry(job, attempt) {
    const { articleId } = job;
    const task = taskMap.get(articleId) || { status: 'pending', retries: 0 };

    try {
        task.status = 'processing';
        task.retries = attempt;
        taskMap.set(articleId, task);

        const result = await processArticle(job);

        // 句子翻译失败 → 文章落 status='partial'。这里必须用**不同**的日志级别与文案，
        // 否则「部分成功」和「完全成功」在日志里长得一模一样，排查时又会变成新的静默降级。
        if (result && result.status === 'partial') {
            console.warn(`⚠️ 队列任务部分完成: articleId=${articleId} | 句子翻译失败（译文缺失，文章已标 partial）| 原因=${result.sentencesError || '未知'}`);
        } else {
            console.log(`✅ 队列任务完成: articleId=${articleId}`);
        }
        // 任务完成，从内存表中移除（防止同一文章被重复处理 + 避免表无限增长）
        taskMap.delete(articleId);

    } catch (err) {
        console.error(`❌ 队列任务失败 (attempt ${attempt + 1}/${MAX_RETRIES}): articleId=${articleId}`, err.message);

        // Coze 不可用（额度不足等致命错误）：立即标记失败，不重试，让前端马上降级
        if (err && err.fatal) {
            task.status = 'failed';
            task.error = err.message;
            taskMap.set(articleId, task);
            dbOps.updateArticleStatus(articleId, 'failed');
            console.error(`💥 队列任务失败（Coze 不可用，不重试）: articleId=${articleId}`);
            taskMap.delete(articleId);  // 任务结束，从内存表中移除
            return;
        }

        if (attempt + 1 < MAX_RETRIES) {
            // 指数退避：5s, 10s, 20s...
            const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt);
            task.status = 'retrying';
            task.error = err.message;
            taskMap.set(articleId, task);
            console.log(`⏳ ${backoff / 1000}s 后重试...`);
            setTimeout(() => processWithRetry(job, attempt + 1), backoff);
        } else {
            // 达到最大重试次数，标记为 failed
            task.status = 'failed';
            task.error = err.message;
            taskMap.set(articleId, task);
            dbOps.updateArticleStatus(articleId, 'failed');
            console.error(`💥 队列任务最终失败: articleId=${articleId}`);
            taskMap.delete(articleId);  // 任务结束，从内存表中移除
        }
    }
}

/**
 * 实际处理逻辑（调用 Coze + 缓存 + 更新文章）
 */
async function processArticle(job) {
    const { articleId, content, userId, title } = job;

    // 1. 标记为 processing
    dbOps.updateArticleStatus(articleId, 'processing');

    // 2. 提取单词 + 查缓存（单词释义任务的缓存优先）
    const allWords = coze.extractWords(content);
    const cacheMap = dbOps.getWordMeaningFromCache(allWords);
    const { cached, uncached } = coze.splitCachedUncached(allWords, cacheMap);

    console.log(`📖 [队列] 文章 ${articleId} 共 ${allWords.length} 词 | 缓存 ${cached.length} | 新词 ${uncached.length}`);

    // 初始化部分结果字段（三个任务谁先完成谁先返回）
    const baseTask = taskMap.get(articleId) || {};
    baseTask.questionsReady = false;
    baseTask.questions = null;
    baseTask.wordsReady = false;
    baseTask.words = null;
    baseTask.sentencesReady = false;
    baseTask.sentences = null;
    baseTask.sentencesFailed = false;
    baseTask.sentencesError = null;
    baseTask.finishOrder = [];
    taskMap.set(articleId, baseTask);

    // 记录三个任务的完成顺序（谁先完成谁先落盘到 taskMap）
    let finishSeq = 0;
    function recordFinish(name) {
        finishSeq += 1;
        const t = taskMap.get(articleId) || baseTask;
        t.finishOrder.push(name);
        taskMap.set(articleId, t);
        return finishSeq;
    }

    // 3. 三个独立任务并行：句子翻译 / 单词释义 / 题目生成，互不阻塞
    // ⚠️ 2026-10-08 兜底（最后一道防线）：把「正文非空、却 0 句译文」强制转成失败。
    //   上游 coze.js 已经不再把解析失败伪装成成功，但这里再拦一次，保证**任何**未来改动
    //   都不可能再写出 status='completed' + sentences=[] + sentences_error=NULL 这种
    //   「看起来一切正常、实际没有译文」的文章（用户报障的正是这一种：题目生成成功、
    //   日志显示句子翻译成功，但整篇一个译文都没有）。
    const sentencePromise = coze.analyzeSentencesWithCoze(content, title).then(function (sRes) {
        const list = (sRes && sRes.sentenceList) || [];
        // 判据与 coze.js 保持一致：只有「正文确实含英文」时，0 句才算失败
        // （用户粘贴纯中文时，句子翻译任务返回空是合理的，不该把文章误标成 partial）
        const judge = typeof coze.hasEnoughEnglish === 'function'
            ? coze.hasEnoughEnglish
            : (t => ((String(t || '').match(/[A-Za-z]/g) || []).length) >= 20);
        if (list.length === 0 && judge(content)) {
            const e = new Error(`句子翻译返回 0 句（正文 ${String(content).length} 字符）→ 判定为失败，避免静默降级`);
            e.sentenceEmpty = true;
            throw e;
        }
        return sRes;
    });
    const wordPromise = coze.analyzeWordsWithCoze(content, title, cached);
    const quizPromise = coze.generateQuestionsWithCoze(content, title, 4);

    // 3.a 句子翻译一完成就落盘 sentences
    sentencePromise.then(function (sRes) {
        const sentences = (sRes && sRes.sentenceList) || [];
        const t = taskMap.get(articleId) || baseTask;
        t.sentences = sentences;
        t.sentencesReady = true;
        taskMap.set(articleId, t);
        const seq = recordFinish('句子翻译');
        console.log(`✅ [并行] 第${seq}个完成：句子翻译（句子=${sentences.length}）`);
        return sRes;
    }).catch(function (reason) {
        // 2026-10-06 修复「静默降级」：这里原来只打一行 console.error 就完事了，
        // 最终文章照样被写成 status='completed'、sentences=[]，前端与用户都以为分析成功、
        // 只是「这篇文章恰好没有译文」—— 失败被彻底吞掉。
        // 现在把失败原因**记进内存任务表**，最终落库时把文章标成 partial。
        const message = (reason && reason.message) || String(reason) || '句子翻译失败';
        const t = taskMap.get(articleId) || baseTask;
        t.sentencesFailed = true;
        t.sentencesError = message;
        taskMap.set(articleId, t);
        const seq = recordFinish('句子翻译(失败)');
        console.error(`❌ [并行] 第${seq}个结束：句子翻译 失败 → 文章将标记为 partial（不再静默降级为 completed）| 原因: ${message}`);
    });

    // 3.b 单词释义一完成就落盘 words（合并缓存）
    wordPromise.then(function (wRes) {
        const wordList = (wRes && wRes.wordList) || {};
        const mergedWords = coze.mergeWordData(cached, cacheMap, wordList);
        const t = taskMap.get(articleId) || baseTask;
        t.words = mergedWords;
        t.wordsReady = true;
        taskMap.set(articleId, t);
        const seq = recordFinish('单词释义');
        console.log(`✅ [并行] 第${seq}个完成：单词释义（单词=${Object.keys(mergedWords).length}）`);
        return wRes;
    }).catch(function (reason) {
        // 2026-09-30 修复：单词释义失败时，也必须给出「可用的兜底词库」并把 wordsReady 置 true。
        // 否则 queueStatus.wordsReady 永远 false → 前端 currentArticle.wordsReady 永远 false →
        // 旧版 handleWordSpanClick 会直接把点词拦掉（只弹「释义生成中」），用户看到的就是
        // 「点词不出卡」。现在用 word_cache 里已有的通用释义兜底，至少保证点词能出释义。
        const t = taskMap.get(articleId) || baseTask;
        if (t.words === null || t.words === undefined) {
            t.words = cacheMap || {};
            t.wordsReady = true;
            console.warn(`🩹 [并行] 单词释义失败 → 用缓存通用释义兜底（${Object.keys(cacheMap || {}).length} 词），wordsReady=true（前端不再拦截点词）`);
        }
        taskMap.set(articleId, t);
        const seq = recordFinish('单词释义(失败)');
        console.error(`❌ [并行] 第${seq}个结束：单词释义 失败:`, (reason && reason.message) || reason);
    });

    // 3.c 题目生成一完成就落盘 questions
    quizPromise.then(function (quizRes) {
        const questions = quizRes.questions || [];
        const t = taskMap.get(articleId) || baseTask;
        t.questions = questions;
        t.questionsReady = true;
        taskMap.set(articleId, t);
        const seq = recordFinish('quiz_generator');
        console.log(`✅ [并行] 第${seq}个完成：quiz_generator（题目=${questions.length}）`);
        return quizRes;
    }).catch(function (reason) {
        const seq = recordFinish('quiz_generator(失败)');
        console.error(`❌ [并行] 第${seq}个结束：quiz_generator 失败:`, (reason && reason.message) || reason);
    });

    const [sentenceRes, wordRes, quizRes] = await Promise.allSettled([sentencePromise, wordPromise, quizPromise]);

    const sentenceFailed = sentenceRes.status === 'rejected';
    const wordFailed = wordRes.status === 'rejected';
    const quizFailed = quizRes.status === 'rejected';

    // 3.0 三个任务全失败 = Coze 完全不可用，走降级（立即失败，前端切基础模式）
    if (sentenceFailed && wordFailed && quizFailed) {
        const reason = sentenceRes.reason || wordRes.reason || quizRes.reason;
        const message = (reason && reason.message) || String(reason) || '三个工作流均失败';
        console.error('❌ [队列] 三个工作流均失败:', message);
        const err = new Error(message);
        err.fatal = isFatalCozeError(sentenceRes.reason) || isFatalCozeError(wordRes.reason) || isFatalCozeError(quizRes.reason);
        throw err;
    }

    // 3.1 单词释义结果：保存 word_cache 通用词库
    if (!wordFailed) {
        const wRes = wordRes.value;
        const wordList = wRes.wordList || {};
        console.log(`📦 [队列] 即将写入 word_cache 的单词数=${Object.keys(wordList).length}，前5条=${JSON.stringify(Object.entries(wordList).slice(0, 5))}`);
        const added = dbOps.saveWordsToCache(wordList);
        if (added > 0) console.log(`💾 [队列] 单词释义 实际新增 ${added} 个单词到 word_cache`);
    } else {
        console.error('❌ [队列] 单词释义 失败（缓存释义兜底）:', (wordRes.reason && wordRes.reason.message) || wordRes.reason);
    }

    // 句子翻译失败的**明确错误原因**：一路带到 updateArticleQuestions，落到 articles.sentences_error，
    // 前端轮询 / 详情接口都能读到 → 用户看到的是「译文生成失败」，而不是「这篇文章没有译文」。
    const sentencesErrorMessage = sentenceFailed
        ? ((sentenceRes.reason && sentenceRes.reason.message) || String(sentenceRes.reason) || '句子翻译工作流失败')
        : null;
    if (sentenceFailed) {
        console.error(`❌ [队列] 句子翻译失败（不静默降级）: articleId=${articleId} | 原因: ${sentencesErrorMessage}`
            + ` | 后续：status='partial'，sentences 落空，前端将提示「句子翻译失败」并走本地切句兜底`);
    }

    // 3.2 句子 + 单词就绪时，用 sentenceIndex 关联语境写 word_context
    const sentences = sentenceFailed ? [] : (sentenceRes.value.sentenceList || []);
    const rawWordList = wordFailed ? [] : (wordRes.value.rawWordList || []);
    if (sentences.length > 0 && rawWordList.length > 0) {
        const wordContextList = coze.buildWordContextFromSentenceIndex(rawWordList, sentences);
        if (wordContextList.length > 0) console.log(`🧠 [队列] wordContextList 首条（context 来自 sentenceIndex 关联）:`, JSON.stringify(wordContextList[0]));
        const ctxAdded = dbOps.saveWordContextList(wordContextList, articleId);
        if (ctxAdded > 0) console.log(`🧠 [队列] 写入 word_context 语境库 ${ctxAdded} 条`);

        // 扫描「当前文章」内 definition 为空的词，批量调用 word_meaning_generator 补全
        try {
            const emptyWords = dbOps.getWordContextEmptyDefinitions(articleId);
            if (emptyWords.length > 0) {
                const wl = emptyWords.map(e => e.word);
                const cl = emptyWords.map(e => e.context);
                const filled = await coze.generateWordMeaningsWithCoze(wl, cl);
                let filledCount = 0;
                // 大模型可能乱序返回，按 word + context 匹配回填（不再按索引，避免跨语境混淆）
                for (const f of filled) {
                    if (f && f.word && f.context && f.definition) {
                        filledCount += dbOps.updateWordContextDefinitionByWordAndContext(f.word, f.context, articleId, f.definition);
                    }
                }
                if (filledCount > 0) console.log(`🧠 [队列] word_meaning_generator 按 word + context 补全 ${filledCount} 个空释义到 word_context`);
            }
        } catch (e) {
            console.error('❌ [队列] word_meaning_generator 补全失败:', e.message);
        }
    }

    // 3.3 quiz_generator 结果（questions）
    let questions = [];
    if (!quizFailed) {
        questions = quizRes.value.questions || [];
        console.log(`📝 [队列] quiz_generator 返回 ${questions.length} 题`);
    } else {
        console.error('❌ [队列] quiz_generator 失败:', (quizRes.reason && quizRes.reason.message) || quizRes.reason);
    }
    // 兜底：无题目时用通用降级题
    if (questions.length === 0) {
        const why = quizFailed
            ? ((quizRes.reason && quizRes.reason.message) || String(quizRes.reason) || 'quiz_generator 工作流失败')
            : 'quiz_generator 正常返回但题目数为 0';
        questions = generateFallbackQuestions(content);
        console.warn(`🩹 [队列] 无可用题目 → 使用降级题目（${questions.length} 道）| 原因: ${why}`);
        // ⚠️ 这条日志是「题目没了」和「拖拽收藏没了」两件事的因果连线，别删：
        //    降级题带 isFallback/answerMode='selection' → 前端进入「降级划选答题模式」
        //    → fallbackQuizActive=true → 正文单词拖拽收藏被禁用（app.js onSpanPointerDown）。
        console.warn('🩹 [队列] 影响面：前端会进入「降级划选答题模式」，该模式下正文单词的拖拽收藏会被禁用（正文划选让位给作答）');
    }

    // 4. 合并：最终 words = 缓存 + 单词释义结果（单词释义失败则只用缓存释义）
    const mergedWords = wordFailed
        ? cacheMap
        : coze.mergeWordData(cached, cacheMap, wordRes.value.wordList || {});

    // 5. 更新 articles 表：句子翻译失败 → status='partial'（部分成功），否则 'completed'
    //    partial 语义 = 「单词释义 / 阅读理解题都成功了，只有句子翻译失败」。
    //    不用 'failed'：failed 在前端会触发「AI 服务不可用，已切换到基础模式」的整篇降级提示，
    //    而这里题目和释义都是真结果，只是译文缺失 —— 把两者的用户预期混在一起是错的。
    const finalStatus = sentenceFailed ? 'partial' : 'completed';
    dbOps.updateArticleQuestions(articleId, questions, sentences, {
        status: finalStatus,
        sentencesError: sentencesErrorMessage
    });
    console.log(`💾 [队列] articles 状态落库：articleId=${articleId} | status=${finalStatus}`
        + ` | 题目 ${questions.length} 道 | 译文 ${sentences.length} 句`
        + (sentenceFailed ? ` | sentences_error="${sentencesErrorMessage}"` : ''));

    // 同步最终合并后的题目到 taskMap（降级/回退后可能和 quiz_generator 原始结果不同）
    const finalTask = taskMap.get(articleId) || baseTask;
    finalTask.questions = questions;
    finalTask.questionsReady = true;
    finalTask.sentencesFailed = !!sentenceFailed;
    finalTask.sentencesError = sentencesErrorMessage;
    taskMap.set(articleId, finalTask);

    // 打印三个任务的最终完成顺序（谁先完成谁先返回给前端）
    console.log(`🏁 [队列] 三任务完成顺序：${finalTask.finishOrder.join(' → ')}`);

    return {
        words: mergedWords,
        questions: questions,
        sentences: sentences,
        status: finalStatus,
        sentencesFailed: !!sentenceFailed,
        sentencesError: sentencesErrorMessage
    };
}

// ==================== 只重跑「句子翻译」（2026-10-07 新增）====================
//
// 场景：文章 status='partial'（单词释义 + 题目都成功，只有句子翻译挂了），
//       用户在阅读页看到「⚠️ 句子翻译暂时不可用」，点「重试」。
//
// 为什么单独开一条路径，而不是重新 enqueue 整篇：
//   1. **不白烧额度**（用户已明确不充值 Coze）：重跑整篇会把已经跑好的单词释义、
//      题目工作流再花一次钱，而它们的结果本来就是好的。
//   2. **不破坏已有好结果**：重跑整篇会用新结果覆盖旧结果，新结果可能更差
//      （比如题目重新生成后变少），用户点了「重试译文」却把题目弄坏了，是明确的体验回归。
//   3. 用户诉求原文就是「只重跑『句子翻译』任务」。
//
// 落库策略（关键）：**重试期间 DB 的 status 一直保持 partial 不变**，
//   只有拿到最终结果才一次性翻成 completed 或把新的失败原因写回 partial。
//   这样进程中途崩掉，文章仍是 partial（可再次重试），不会卡在 processing 死等。

const sentenceRetryMap = new Map();   // articleId → { startedAt, promise }

/** 该文章此刻是否正在「只重跑句子翻译」 */
function isRetryingSentences(articleId) {
    return sentenceRetryMap.has(articleId);
}

/** 真正干活：只调句子翻译工作流 → 落库 */
async function runSentenceRetry(articleId) {
    const article = dbOps.getArticleById(articleId);
    if (!article) {
        const e = new Error('文章不存在');
        e.code = 'NOT_FOUND';
        throw e;
    }

    const t0 = Date.now();
    const prevSentences = Array.isArray(article.sentences) ? article.sentences : [];
    console.log(`🔁 [队列·重试] 开始只重跑句子翻译 | articleId=${articleId} | 当前状态=${article.status}`
        + ` | 正文 ${(article.content || '').length} 字 | 标题="${article.title || ''}"`
        + ` | 重试前译文 ${prevSentences.length} 句`);

    try {
        const res = await coze.analyzeSentencesWithCoze(article.content, article.title);
        const sentences = (res && res.sentenceList) || [];
        // 返回 0 句等于没拿到译文 —— 对用户而言仍然是「失败」，不能把 status 翻成 completed
        // 否则又变成一次静默降级（status 说成功、界面却没译文）。
        if (sentences.length === 0) {
            throw new Error('句子翻译工作流返回 0 句（视为失败）');
        }

        const changed = dbOps.updateArticleSentences(articleId, sentences, {
            status: 'completed',
            sentencesError: null
        });
        console.log(`✅ [队列·重试] 成功 | articleId=${articleId} | 译文 ${sentences.length} 句 | 改动 ${changed} 行`
            + ` | 耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s → status=completed（sentences_error 已清空）`);
        console.log(`ℹ️ [队列·重试] 本次只补译文：题目 / 单词释义保持原值（未跑 word / quiz 工作流，不消耗额度）`);

        return {
            articleId,
            ok: true,
            status: 'completed',
            sentences,
            sentencesError: null,
            elapsedMs: Date.now() - t0
        };
    } catch (err) {
        const message = (err && err.message) || String(err) || '句子翻译重试失败';
        // 失败：保持 partial，只把**新的**失败原因写回去。
        // 保留原有 sentences（正常情况下是 []）而不是硬写 []，避免误删已有数据。
        dbOps.updateArticleSentences(articleId, prevSentences, {
            status: 'partial',
            sentencesError: message
        });
        console.error(`❌ [队列·重试] 失败 | articleId=${articleId} | 原因: ${message}`
            + ` | 耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s → 文章保持 partial（sentences_error 已更新）`);

        return {
            articleId,
            ok: false,
            status: 'partial',
            sentences: prevSentences,
            sentencesError: message,
            elapsedMs: Date.now() - t0
        };
    }
}

/**
 * 启动一次「只重跑句子翻译」（立即返回，不阻塞 HTTP 请求）。
 * 同一篇文章并发调用只会真正跑一次（复用同一个 Promise）。
 *
 * @returns {{started:boolean, reason?:string, promise?:Promise}}
 */
function startSentenceRetry(articleId) {
    if (sentenceRetryMap.has(articleId)) {
        console.log(`⏭️ [队列·重试] articleId=${articleId} 已有重试在跑，复用同一次请求（不重复烧额度）`);
        return { started: false, reason: 'already_retrying', promise: sentenceRetryMap.get(articleId).promise };
    }
    // 整篇分析还在跑（taskMap 里还有活跃任务）→ 不允许并发重试，等它自己落库
    const active = taskMap.get(articleId);
    if (active && active.status !== 'failed') {
        console.log(`⏭️ [队列·重试] articleId=${articleId} 整篇分析仍在进行中（status=${active.status}）→ 拒绝并发重试`);
        return { started: false, reason: 'article_processing' };
    }

    const promise = runSentenceRetry(articleId)
        .catch(function (fatalErr) {
            // runSentenceRetry 内部已经把业务失败转成返回值；走到这里只可能是「文章不存在」这类致命错误
            console.error(`💥 [队列·重试] 异常终止: articleId=${articleId} | ${(fatalErr && fatalErr.message) || fatalErr}`);
            return { articleId, ok: false, status: 'partial', sentences: [], sentencesError: (fatalErr && fatalErr.message) || '重试异常终止' };
        })
        .finally(function () {
            sentenceRetryMap.delete(articleId);
            console.log(`🏁 [队列·重试] 结束，已从重试表移除：articleId=${articleId}`);
        });

    sentenceRetryMap.set(articleId, { startedAt: Date.now(), promise });
    return { started: true, promise };
}

/**
 * 等待式重试（测试 / 需要同步结果的调用方用）。
 * @returns {Promise<{articleId, ok, status, sentences, sentencesError, elapsedMs}>}
 */
async function retrySentences(articleId) {
    const r = startSentenceRetry(articleId);
    if (r.promise) return r.promise;
    return { articleId, ok: false, status: 'partial', sentences: [], sentencesError: '重试未能启动（' + (r.reason || '未知原因') + '）' };
}

/**
 * 重启后恢复：把数据库中状态为 'processing' 的文章重新入队
 * （pending 的不自动入队，等前端再次请求；processing 的是上次中断的）
 */
function recoverInterrupted() {
    // 默认不恢复中断任务（避免重启后旧任务重复跑）；仅当 ENABLE_TASK_RECOVERY=true 时才恢复
    const recoveryEnabled = String(process.env.ENABLE_TASK_RECOVERY || '').toLowerCase() === 'true';
    if (!recoveryEnabled) {
        console.log('⏭️ [队列] ENABLE_TASK_RECOVERY 未开启（false），跳过中断任务恢复');
        return 0;
    }

    const { db } = dbOps;
    const rows = db.prepare(`SELECT id, content, user_id FROM articles WHERE status = 'processing'`).all();
    for (const row of rows) {
        console.log(`🔄 恢复中断任务: ${row.id}`);
        enqueue({ articleId: row.id, content: row.content, userId: row.user_id, title: row.title });
    }
    return rows.length;
}

module.exports = {
    enqueue,
    getQueueStatus,
    processArticle,
    recoverInterrupted,
    // 只重跑句子翻译（2026-10-07）
    retrySentences,          // 等待式：Promise<{ok,status,sentences,sentencesError}>
    startSentenceRetry,      // 立即返回：{started,reason,promise}
    isRetryingSentences      // 是否正在重试（供 /api/article-status 透出）
};
