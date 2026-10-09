/**
 * server.js - 金苹果之旅 后端服务（企业级架构版）
 *
 * 架构：
 *   db.js       → SQLite 数据库（替代 PostgreSQL，零安装）
 *   coze.js     → Coze API 调用纯函数（同步接口 + 异步队列复用）
 *                 另有：Coze 知识库【检索】接入（L1 = 调 word_context_search 工作流）+ 三层查词
 *                 2026-09-28：L1 从「直连知识库 HTTP 接口」改为「调工作流 /v1/workflow/run」
 *   queue.js    → 进程内轻量异步队列（替代 Bull+Redis，含重试退避）
 *   fallback.js → AI 失败时的降级题目生成器
 *   export_csv.js → 手动导出 word_context.csv（手动同步第 ① 步）
 *   sync_to_knowledge.js → 手动同步辅助：导出 / 统计 / 标记已同步 / 只读对账
 *                  （2026-09-28 起知识库改为手动同步，代码内的定时上传已停用）
 *
 * 接口总览：
 *   GET  /                          首页
 *   GET  /health                    健康检查（含知识库配置状态）
 *   GET  /api/articles              文章列表（分页 ?page=&pageSize=&status=&withContent=，
 *                                   2026-10-06 起返回 {items,page,total,hasMore} 而非裸数组）
 *   GET  /api/article/:id           获取单篇文章（含正文/译文/释义/题目，列表页按需调用）
 *   GET  /api/article-status/:id    查询文章处理状态（异步轮询用）
 *   POST /api/upload-article         异步上传文章（入队，立即返回 pending）
 *   POST /api/analyze                SSE 同步分析（保留兼容旧前端）
 *   POST /api/word-meaning          查词（word_cache 表）
 *   GET  /api/words/:word           查词（本地词典层 + 语境释义；?ai=1 才走 AI）
 *   GET  /api/dictionary/:word      查词典层原始词条（不涉及语境）
 *   GET  /api/glue-word/:word       拆粘连词（rapiddevelopment → rapid + development；?ai=1 才允许 AI 兜底）
 *   POST /api/dictionary/batch      批量查词典（前端进阅读页时一次性预取本文所有词）
 *   GET  /api/dictionary/stats      词典库状态（词条数 / 体积 / 是否就绪）
 *   GET  /api/kb/stats              知识库配置 + 各层命中率（排查用）
 *   GET  /api/user-words            获取用户收藏单词（按 status 筛选）
 *   POST /api/collect-word          拖拽收藏（存入 user_words 表）
 *   PUT  /api/word-status/:id        更新单词分类状态
 *   POST /api/check-in              连续打卡（更新 users.streak）
 *   POST /api/learning-record       记录学习数据
 *   POST /api/migrate                迁移 localStorage 数据到 DB
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const dbOps = require('./db');
const coze = require('./coze');
const queue = require('./queue');
const { generateFallbackQuestions } = require('./fallback');

const app = express();

// ---- 端口（2026-10-09 部署改造）----
// Render / Railway 等平台**动态分配**端口，只通过环境变量 PORT 告知应用；
// 写死 3000 会导致服务起来但平台探活失败（No open ports detected）。
// Number() 兜一层：PORT 被配成非数字（如 'abc'）时不要传出 NaN → 回落到 3000。
// 注意 0 也会回落到 3000（0 在 Node 里 = 随机端口，不是我们想要的语义）。
const PORT = Number(process.env.PORT) || 3000;
const PORT_FROM_ENV = !!(process.env.PORT && String(process.env.PORT).trim());
// listen 不指定 host → 默认监听所有网卡（0.0.0.0/::），正是容器平台需要的，不要改成 127.0.0.1。

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ==================== 静态资源防护（2026-10-09 部署加固）====================
// 原来 `express.static(__dirname)` 把**整个项目根目录**暴露到公网，实测：
//   GET /data/app.db  → 200，直接下载整个用户数据库（用户 / 收藏 / 文章）
//   GET /coze.js      → 200，后端源码
//   GET /.env         → 404 ✅（express.static 默认忽略 dotfiles，这条本来就安全）
// 这里在静态中间件**之前**拦掉「绝不该被浏览器直接取」的路径。
// ⚠️ 不能一刀切禁 `.js` —— `/app.js` 就是前端主脚本，必须放行；所以用精确黑名单。
const BLOCKED_STATIC_PREFIXES = ['/data', '/node_modules', '/.git'];
function isBlockedStaticPath(rawPath) {
    const pathname = String(rawPath || '/').split('?')[0].split('#')[0];
    if (BLOCKED_STATIC_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'))) return true;
    // SQLite 数据库文件与备份（app.db / app.db-wal / app.db-shm / app.db.bak-2026-...）
    if (/\.(db|sqlite|sqlite3)(-wal|-shm)?$/i.test(pathname)) return true;
    if (/\.bak-[0-9A-Za-z:.\-]+$/i.test(pathname)) return true;
    // 后端源码 / 工程文件 / 测试脚本（前端只依赖 index.html、app.js 与根目录 *.svg）
    if (/^\/(server|db|coze|queue|fallback|seed|export_csv|sync_to_knowledge|import_ecdict|download-dict)\.js$/i.test(pathname)) return true;
    if (/^\/(package(-lock)?\.json|docker-compose\.ya?ml|\.gitignore)$/i.test(pathname)) return true;
    if (/^\/test_[\w.-]*\.js$/i.test(pathname)) return true;
    return false;
}
app.use(function (req, res, next) {
    if (isBlockedStaticPath(req.path)) {
        console.warn(`🛡️ [静态防护] 拦截静态请求: ${req.method} ${req.originalUrl}`);
        return res.status(404).type('text/plain').send('Not Found');
    }
    next();
});

app.use(express.static(path.join(__dirname)));

// ==================== 访问密码鉴权 ====================
// 密码从环境变量 ACCESS_PASSWORD 读取；未配置则不校验（便于开发）
const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || '';

if (ACCESS_PASSWORD) {
    console.log(`🔐 访问密码已读取 (长度 ${ACCESS_PASSWORD.length})`);
} else {
    console.warn('⚠️ 未读取到 ACCESS_PASSWORD，/api 接口将不校验密码');
}

function requireAccessPassword(req, res, next) {
    const provided = req.headers['x-access-password'] || '';
    // 调试日志：打印收到的密码与期望密码（上线前请删除或脱敏）
    console.log(`🔐 [鉴权] ${req.method} ${req.originalUrl} | 收到: "${provided || '(空)'}" | 期望: "${ACCESS_PASSWORD || '(未配置)'}" | 匹配: ${provided === ACCESS_PASSWORD}`);
    if (!ACCESS_PASSWORD) return next();
    if (provided === ACCESS_PASSWORD) return next();
    return res.status(401).json({ error: '访问密码错误或缺失', code: 'UNAUTHORIZED' });
}

app.use('/api', requireAccessPassword);

// ==================== 工具函数 ====================

/**
 * 从请求中解析用户身份
 * 优先级：x-username header → body.username → 默认用户
 */
function getUserIdFromReq(req) {
    const username = req.headers['x-username'] || (req.body && req.body.username) || null;
    const user = dbOps.getOrCreateUser(username);
    return user.id;
}

// ==================== 启动初始化 ====================
dbOps.bootstrap();
const recovered = queue.recoverInterrupted();
if (recovered > 0) console.log(`🔄 恢复 ${recovered} 个中断任务`);

// ==================== 基础路由 ====================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        cozeConfigured: coze.isCozeConfigured(),
        cozeBotId: coze.config.COZE_BOT_ID || '未配置',
        // L1 检索是否就绪（2026-09-28 起 = word_context_search 工作流是否配置）
        knowledgeBaseConfigured: coze.isKnowledgeBaseConfigured(),
        knowledgeBaseId: coze.config.COZE_KB_ID || '未配置',
        searchWorkflowId: coze.config.COZE_KB_SEARCH_WORKFLOW_ID || '未配置',
        searchWorkflowPath: coze.config.COZE_KB_WORKFLOW_PATH,
        searchQueryMode: coze.config.COZE_KB_QUERY_MODE,
        // L1 熔断状态：open=true 表示 L1 因额度/权限/未发布被暂时跳过（点词走 L2/L3）
        kbCircuit: coze.getKbCircuitState(),
        // 模型健康：GLM / DeepSeek 谁在冷却中（连续超时会自动熔断，改用另一个）
        modelHealth: typeof coze.getModelHealth === 'function' ? coze.getModelHealth() : null,
        // 词典层：本地 ECDICT 词典库是否就绪（ready=false 时点词只有语境释义）
        dictionary: dbOps.getDictionaryStats(),
        port: PORT,
        portFromEnv: PORT_FROM_ENV,
        // 实际使用的数据库路径（部署后在 /health 里一眼确认 Volume 有没有生效）
        dbPath: dbOps.DB_PATH,
        dbPathSource: dbOps.DB_PATH_SOURCE,
        dictPath: dbOps.DICT_PATH,
        database: 'SQLite（app.db 用户数据 + dictionary.db 词典，两个独立文件）',
        queue: '进程内轻量队列'
    });
});

// 手动复位 L1 熔断（修好 Coze 额度/权限/工作流发布后，不必等冷却，直接调一次即可恢复）
app.get('/api/kb/reset-circuit', (req, res) => {
    const before = coze.resetKbCircuit();
    res.json({ ok: true, before, after: coze.getKbCircuitState() });
});

// 手动复位模型熔断（某个模型误判冷却时用）
app.get('/api/model/reset-health', (req, res) => {
    const before = typeof coze.resetModelHealth === 'function' ? coze.resetModelHealth() : null;
    res.json({ ok: true, before, after: typeof coze.getModelHealth === 'function' ? coze.getModelHealth() : null });
});

// 校验访问密码：正确返回 200，错误由 requireAccessPassword 中间件返回 401（前端弹窗用）
app.get('/api/verify-password', (req, res) => {
    res.json({ ok: true });
});

// ==================== 文章相关接口 ====================

// 列出所有文章（从数据库）
/**
 * 文章列表 —— 分页版（2026-10-06 改造）。
 *
 * 契约变化：原来返回**裸数组**（全量 73 篇一次性给），现在返回
 *   { page, pageSize, total, totalPages, hasMore, items }
 * items 只带「列表真要用的字段」（title/description/content/source/created_at + 计数），
 * **不带 sentences / words / questions** —— 那三样体积最大，改由 /api/article/:id 按需提供。
 *
 * 为什么这么做：前端原来把 6 篇预置文章硬编码在 app.js 里，用户上传的文章刷新就没了。
 * 改成走服务端后，必须顺手解决「一次拉全量」的存储/带宽压力：分页 + 按需详情。
 *
 * 排序见 dbOps.listArticlesPaged（预置优先 + created_at DESC + id DESC）。
 */
app.get('/api/articles', (req, res) => {
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 10;
    const status = req.query.status || 'all';
    const withContent = req.query.withContent !== '0';   // 默认带正文：点开要能立刻渲染，不用等详情

    const paged = dbOps.listArticlesPaged({ page, pageSize, status });

    const items = paged.rows.map(a => {
        let questionCount = 0;
        try { questionCount = a.questions ? JSON.parse(a.questions).length : 0; } catch (e) { questionCount = 0; }
        const item = {
            id: a.id,
            title: a.title,
            description: a.description,
            level: a.level,
            levelLabel: a.level_label,
            source: a.source,
            status: a.status,
            wordCount: a.word_count,
            questionCount: questionCount,
            // '[]' 的字符长度正好是 2 → 大于 2 才算真的存了译文。前端据此决定要不要顺手拉详情。
            hasSentences: (a.sentences_length || 0) > 2,
            // 'partial' = 句子翻译失败（单词/题目成功），列表里可以标一个「译文缺失」角标
            sentencesError: a.sentences_error || null,
            createdAt: a.created_at
        };
        if (withContent) item.content = a.content || '';
        return item;
    });

    const withTrans = items.filter(i => i.hasSentences).length;
    const partialCount = items.filter(i => i.status === 'partial').length;
    console.log(`📚 [articles] 分页请求 page=${page} pageSize=${pageSize} status=${status} withContent=${withContent}`
        + ` → 返回第 ${paged.page}/${paged.totalPages} 页 | 本页 ${items.length} 篇 | 共 ${paged.total} 篇`
        + ` | 本页已有译文 ${withTrans} 篇（其余前端走本地切句兜底）`
        + (partialCount ? ` | 其中 ${partialCount} 篇为 partial（句子翻译失败）` : ''));

    res.json({
        page: paged.page,
        pageSize: paged.pageSize,
        total: paged.total,
        totalPages: paged.totalPages,
        hasMore: paged.page < paged.totalPages,
        items: items
    });
});

// 获取单篇文章（含 content/words/questions）
app.get('/api/article/:id', (req, res) => {
    const article = dbOps.getArticleById(req.params.id);
    if (!article) {
        return res.status(404).json({ error: '文章不存在' });
    }

    // 文章的 words 来自 word_cache 表（按文章内容提取）
    const allWords = coze.extractWords(article.content || '');
    const wordMeanings = dbOps.getWordMeaningFromCache(allWords);

    res.json({
        id: article.id,
        title: article.title,
        description: article.description,
        level: article.level,
        levelLabel: article.level_label,
        article: article.content,
        words: wordMeanings,
        sentences: article.sentences || [],
        questions: article.questions || [],
        status: article.status,
        source: article.source,
        // status='partial' 时非空：句子翻译失败原因。前端阅读页据此提示「译文生成失败」。
        sentencesError: article.sentences_error || null,
        hasSentences: (article.sentences || []).length > 0
    });
});

// 查询文章处理状态（前端轮询用）
app.get('/api/article-status/:id', (req, res) => {
    const article = dbOps.getArticleById(req.params.id);
    if (!article) {
        return res.status(404).json({ error: '文章不存在', status: 'not_found' });
    }

    // 诊断日志：每次轮询打印 DB 状态 vs 队列状态，便于排查「队列完成但前端仍在轮询」
    const _qStatus = queue.getQueueStatus(req.params.id);
    console.log(`📡 [article-status] id=${req.params.id} | DB状态=${article.status} | 队列状态=${_qStatus ? _qStatus.status : '无队列记录'} | 重试=${_qStatus ? _qStatus.retries : 0}`);

    // 已完成：返回文章内容 + questions
    if (article.status === 'completed') {
        const allWords = coze.extractWords(article.content || '');
        const wordMeanings = dbOps.getWordMeaningFromCache(allWords);
        return res.json({
            status: 'completed',
            articleId: article.id,
            title: article.title,
            content: article.content,
            level: article.level,
            levelLabel: article.level_label,
            words: wordMeanings,
        sentences: article.sentences || [],
        questions: article.questions || [],
        isFallback: false,
        // 句子翻译失败原因（历史数据都是 null；只有「部分完成」的文章才有值）
        sentencesError: article.sentences_error || null,
        // ★ 必须取真实值，不能写死 false（2026-10-08）：
        //   「重试译文」对**存量文章**（status='completed' 但 sentences=[]，早期静默降级留下的一批）
        //   同样允许重跑，而重跑期间 DB 的 status 一直是 completed、sentences 也一直是 []。
        //   前端轮询就是靠这个字段区分「还在跑」和「跑完了但仍然是空」——
        //   写死 false 会让前端把「正在重试」误判成「非预期状态」并立刻停止等待，
        //   表现为「点了重试什么都不发生」。
        sentencesRetrying: queue.isRetryingSentences(req.params.id)
    });
    }

    // 部分完成（2026-10-06 新增）：单词释义 / 阅读理解题成功，但**句子翻译失败**。
    //
    // 这个分支必须存在，不能只改 queue.js：
    //   若落到下面的 pending/processing 分支，前端会以为任务还在跑、一路轮询到 5 分钟超时才罢休，
    //   而且永远等不到「进入阅读页」——把静默降级换成了更糟的「卡住」，是明确的回归。
    // 语义上接近 completed（题目/释义都是真结果），所以带上 isFallback=false + 一个 partial 标记，
    // 前端按「可阅读，但译文缺失」提示。
    if (article.status === 'partial') {
        const allWords = coze.extractWords(article.content || '');
        const wordMeanings = dbOps.getWordMeaningFromCache(allWords);
        const why = article.sentences_error || '句子翻译工作流失败';
        // 是否正在「只重跑句子翻译」（2026-10-07）：前端点「重试」后靠这个字段区分
        // 「还在跑，继续等」和「又失败了，别再等了」——两者 DB status 都是 partial。
        const retrying = queue.isRetryingSentences(req.params.id);
        console.warn(`⚠️ [article-status] id=${req.params.id} 状态=partial（句子翻译失败，译文缺失）| 原因: ${why}`
            + (retrying ? ' | 🔁 译文重试进行中' : ''));
        return res.json({
            status: 'partial',
            articleId: article.id,
            title: article.title,
            content: article.content,
            level: article.level,
            levelLabel: article.level_label,
            words: wordMeanings,
            sentences: article.sentences || [],
            questions: article.questions || [],
            isFallback: false,
            partial: true,
            sentencesFailed: true,
            sentencesRetrying: retrying,
            sentencesError: why
        });
    }

    // 失败：调用降级函数生成基础题目
    if (article.status === 'failed') {
        const fallbackQuestions = generateFallbackQuestions(article.content || '');
        const allWords = coze.extractWords(article.content || '');
        const wordMeanings = dbOps.getWordMeaningFromCache(allWords);
        const queueStatus = queue.getQueueStatus(article.id);
        return res.json({
            status: 'failed',
            articleId: article.id,
            title: article.title,
            content: article.content,
            level: article.level,
            levelLabel: article.level_label,
            words: wordMeanings,
            sentences: article.sentences || [],
            questions: fallbackQuestions,
            isFallback: true,
            error: queueStatus ? queueStatus.error : 'AI 分析失败，已使用降级题目'
        });
    }

    // pending 或 processing：返回 processing + 已就绪的部分结果（谁先完成谁先返回给前端）
    const queueStatus = queue.getQueueStatus(article.id);
    return res.json({
        status: 'processing',
        articleId: article.id,
        title: article.title,
        content: article.content,
        level: article.level,
        levelLabel: article.level_label,
        queueStatus: queueStatus ? queueStatus.status : article.status,
        retries: queueStatus ? queueStatus.retries : 0,
        // 单词释义工作流部分结果（单词 + 释义 + sentenceIndex）
        words: queueStatus ? (queueStatus.words || null) : null,
        wordsReady: queueStatus ? !!queueStatus.wordsReady : false,
        // 句子翻译工作流部分结果（句子 + 翻译）
        sentences: queueStatus ? (queueStatus.sentences || null) : null,
        sentencesReady: queueStatus ? !!queueStatus.sentencesReady : false,
        // 句子翻译在工作流里就已经挂了（还未落库）→ 轮询期间即可提前告知前端
        sentencesFailed: queueStatus ? !!queueStatus.sentencesFailed : false,
        sentencesError: queueStatus ? (queueStatus.sentencesError || null) : null,
        // 题目工作流部分结果（quiz_generator）
        questions: queueStatus ? (queueStatus.questions || null) : null,
        questionsReady: queueStatus ? !!queueStatus.questionsReady : false
    });
});

// 强制使用降级题目（前端 30 秒超时后点击「使用基础题目」按钮调用）
// 不更新文章 status（Coze 后台可能仍在重试），只返回降级题目供前端临时使用
app.post('/api/article-fallback/:id', (req, res) => {
    const article = dbOps.getArticleById(req.params.id);
    if (!article) {
        return res.status(404).json({ error: '文章不存在' });
    }
    const fallbackQuestions = generateFallbackQuestions(article.content || '');
    const allWords = coze.extractWords(article.content || '');
    const wordMeanings = dbOps.getWordMeaningFromCache(allWords);
    console.log(`🩹 降级题目: articleId=${article.id} | ${fallbackQuestions.length} 题`);
    res.json({
        status: 'failed',
        articleId: article.id,
        title: article.title,
        content: article.content,
        level: article.level,
        levelLabel: article.level_label,
        words: wordMeanings,
        sentences: article.sentences || [],
        questions: fallbackQuestions,
        isFallback: true
    });
});

// ==================== 只重跑「句子翻译」（2026-10-07 新增）====================
//
// 前端阅读页在 status='partial' 时显示「⚠️ 句子翻译暂时不可用 [重试]」，点按钮调这里。
//
// 契约：**立即返回 202**，后台异步跑，前端轮询 /api/article-status/:id 拿结果。
// 为什么不做成同步等结果：句子翻译工作流单次可能几十秒（长文章 timeout 更久），
// 一个挂着几十秒的 HTTP 请求既容易被中间层掐断，用户也只会看到按钮转圈。
//
// 只重跑句子翻译、不重跑整篇 —— 详见 queue.startSentenceRetry 的注释（省额度 + 不覆盖已有好结果）。
app.post('/api/retry-sentences/:id', (req, res) => {
    const articleId = req.params.id;
    const article = dbOps.getArticleById(articleId);
    if (!article) {
        console.warn(`⚠️ [重试译文] 文章不存在: ${articleId}`);
        return res.status(404).json({ ok: false, error: '文章不存在' });
    }

    const existingSentences = Array.isArray(article.sentences) ? article.sentences : [];

    // 幂等：已经有译文且状态不是 partial → 不重复调 Coze（省额度），直接告诉前端「已经好了」
    if (article.status === 'completed' && existingSentences.length > 0) {
        console.log(`⏭️ [重试译文] ${articleId} 已是 completed 且有 ${existingSentences.length} 句译文 → 直接返回，不重复调用`);
        return res.json({
            ok: true,
            alreadyDone: true,
            articleId,
            status: 'completed',
            sentences: existingSentences,
            sentencesError: null,
            message: '该文章译文已存在，无需重试'
        });
    }

    // 整篇分析还在跑（pending / processing）→ 让它自己落库，别并发插一脚
    if (article.status === 'pending' || article.status === 'processing') {
        console.warn(`⏭️ [重试译文] ${articleId} 仍在整篇分析中（status=${article.status}）→ 拒绝重试`);
        return res.status(409).json({
            ok: false,
            articleId,
            status: article.status,
            error: '文章仍在分析中，请等待分析结束后再重试译文'
        });
    }

    const r = queue.startSentenceRetry(articleId);
    if (!r.started) {
        // 已经在重试了 → 幂等返回 202，前端继续轮询即可
        console.log(`⏭️ [重试译文] ${articleId} 已有重试在跑（${r.reason}）→ 返回 202，前端继续轮询`);
        return res.status(202).json({
            ok: true,
            articleId,
            status: 'retrying',
            alreadyRunning: true,
            message: '译文重试已在进行中'
        });
    }

    console.log(`🔁 [重试译文] 已启动 | articleId=${articleId} | 当前状态=${article.status}`
        + ` | 已有译文 ${existingSentences.length} 句 | 失败原因="${article.sentences_error || '（无）'}"`);

    res.status(202).json({
        ok: true,
        articleId,
        status: 'retrying',
        message: '已开始重新生成句子翻译，请稍候'
    });
});

// 异步上传文章（入队，立即返回）
app.post('/api/upload-article', (req, res) => {
    const { content, title, username } = req.body;

    if (!content || content.trim().length === 0) {
        return res.status(400).json({ error: '文章内容不能为空' });
    }

    const userId = getUserIdFromReq(req);
    // 生成文章 ID：upload_<timestamp>
    const articleId = `upload_${Date.now()}`;

    // 插入 articles 表，status='pending'
    dbOps.insertArticle({
        id: articleId,
        user_id: userId,
        title: title || '用户上传文章',
        description: '用户上传的英语文章',
        content: content,
        source: 'upload',
        level: content.length > 3000 ? 'high' : 'middle',
        level_label: content.length > 3000 ? '高中' : '初中',
        status: 'pending',
        questions: [],
        sentences: []
    });

    // 加入队列（立即返回，后台处理）
    queue.enqueue({ articleId, content, userId, title });

    console.log(`📤 异步上传: articleId=${articleId} | ${content.length} 字符`);

    res.json({
        success: true,
        articleId,
        status: 'pending',
        message: '文章已提交，AI 正在后台分析'
    });
});

// SSE 同步分析接口（保留兼容旧前端 callAnalyzeAPI）
app.post('/api/analyze', async (req, res) => {
    const { article, title } = req.body;

    if (!article || article.trim().length === 0) {
        return res.status(400).json({ error: '文章内容不能为空' });
    }

    const taskId = Date.now().toString();

    res.writeHead(200, {
        'Content-Type': 'application/json',
        'Transfer-Encoding': 'chunked'
    });

    try {
        // 提取单词 + 查缓存
        res.write(`data: ${JSON.stringify({ taskId, progress: 15, status: 'processing', message: '正在提取单词并查询缓存...' })}\n\n`);

        const allWords = coze.extractWords(article);
        const cacheMap = dbOps.getWordMeaningFromCache(allWords);
        const { cached, uncached } = coze.splitCachedUncached(allWords, cacheMap);

        console.log(`📖 文章共 ${allWords.length} 个唯一单词 | 缓存命中 ${cached.length} | 未缓存 ${uncached.length}`);

        res.write(`data: ${JSON.stringify({ taskId, progress: 30, status: 'processing', message: 'AI 正在并行分析文章和生成题目...' })}\n\n`);

        // 并行调用两个 workflow（article_word_analyzer + quiz_generator）
        // 一个失败不影响另一个（Promise.allSettled）
        const [articleRes, quizRes] = await Promise.allSettled([
            coze.analyzeArticleWithCoze(article, title, cached, (progress, message) => {
                res.write(`data: ${JSON.stringify({ taskId, progress, status: 'processing', message })}\n\n`);
            }),
            coze.generateQuestionsWithCoze(article, title, 4)
        ]);

        // article_word_analyzer 结果（wordList + sentenceList + 可能的 questions）
        let articleData = null;
        let addedCount = 0;
        if (articleRes.status === 'fulfilled') {
            articleData = articleRes.value;
            const newWordList = articleData.wordList || {};
            console.log(`📦 [server] 即将写入 word_cache 的单词数=${Object.keys(newWordList).length}，前5条=${JSON.stringify(Object.entries(newWordList).slice(0, 5))}`);
            addedCount = dbOps.saveWordsToCache(newWordList);
            console.log(`💾 article_word_analyzer 实际新增 ${addedCount} 个单词到缓存表`);

            const wordContextList = articleData.wordContextList || [];
            const ctxAdded = dbOps.saveWordContextList(wordContextList);
            if (ctxAdded > 0) console.log(`🧠 [server] 写入 word_context 语境库 ${ctxAdded} 条`);

            // 扫描 definition 为空的词，批量调用 word_meaning_generator 补全
            // SSE 同步路径无 articleId，按 word 匹配回填（article_id 为空的记录）
            try {
                const emptyWords = dbOps.getWordContextEmptyDefinitions();
                if (emptyWords.length > 0) {
                    const wl = emptyWords.map(e => e.word);
                    const cl = emptyWords.map(e => e.context);
                    const filled = await coze.generateWordMeaningsWithCoze(wl, cl);
                    let filledCount = 0;
                    // 大模型可能乱序返回，按 word + context 匹配回填（不再按索引，避免跨语境混淆）
                    for (const f of filled) {
                        if (f && f.word && f.context && f.definition) {
                            filledCount += dbOps.updateWordContextDefinitionByWordAndContext(f.word, f.context, null, f.definition);
                        }
                    }
                    if (filledCount > 0) console.log(`🧠 [server] word_meaning_generator 按 word + context 补全 ${filledCount} 个空释义到 word_context`);
                }
            } catch (e) {
                console.error('❌ [server] word_meaning_generator 补全失败:', e.message);
            }
        } else {
            console.error('❌ article_word_analyzer 失败:', (articleRes.reason && articleRes.reason.message) || articleRes.reason);
        }

        // quiz_generator 结果（questions）
        let questions = [];
        let quizFromGenerator = false;
        if (quizRes.status === 'fulfilled') {
            questions = quizRes.value.questions || [];
            quizFromGenerator = true;
            console.log(`📝 quiz_generator 返回 ${questions.length} 题`);
        } else {
            console.error('❌ quiz_generator 失败:', (quizRes.reason && quizRes.reason.message) || quizRes.reason);
        }

        // 合并：quiz 失败则回退用 article_word_analyzer 的 questions（若有）
        if (questions.length === 0 && articleData && articleData.questions && articleData.questions.length > 0) {
            questions = articleData.questions;
            console.log('📝 quiz_generator 失败，回退用 article_word_analyzer 的题目');
        }
        // 两者都失败：用 fallback 降级题目（保证用户有题做）
        if (questions.length === 0) {
            questions = generateFallbackQuestions(article);
            console.log('🩹 两个工作流都失败，使用降级题目');
        }

        const mergedWords = articleData
            ? coze.mergeWordData(cached, cacheMap, articleData.wordList || {})
            : cacheMap;
        const sentences = articleData ? (articleData.sentenceList || []) : [];

        res.write(`data: ${JSON.stringify({
            taskId,
            progress: 100,
            status: 'completed',
            message: '分析完成！',
            data: {
                title: (articleData && articleData.title) || title || '用户上传文章',
                description: (articleData && articleData.description) || '用户上传的英语文章',
                level: (articleData && articleData.level) || 'middle',
                levelLabel: (articleData && articleData.levelLabel) || '自定义',
                article: (articleData && articleData.article) || article,
                words: mergedWords,
                sentences: sentences,
                questions: questions,
                fromCache: false,
                cachedCount: cached.length,
                newCount: addedCount,
                quizFromGenerator: quizFromGenerator
            }
        })}\n\n`);
        res.end();
    } catch (error) {
        console.error('分析失败:', error);
        res.write(`data: ${JSON.stringify({
            taskId,
            progress: 0,
            status: 'failed',
            message: '分析失败: ' + (error.message || '未知错误')
        })}\n\n`);
        res.end();
    }
});

// ==================== 单词相关接口 ====================

// 查词（从 word_cache 表）
app.post('/api/word-meaning', (req, res) => {
    const { word } = req.body;
    if (!word) return res.status(400).json({ error: '缺少 word 参数' });

    const row = dbOps.getWordFromCache(word);
    if (row) {
        return res.json({ word: row.word, meaning: row.definition, found: true });
    }
    res.json({ word: word.toLowerCase(), meaning: null, found: false });
});

// 获取某单词的释义
//   词典层：本地 ECDICT 词典库（同步、无网络）→ 返回该词的「所有释义」+ 音标/词性/星级/考试标签
//   语境释义：① Coze 知识库 → ② word_context 语境库 → ③ AI 生成并回写（默认关闭，见下）
// 响应同时给两栏：contextDefinition（语境释义，可能为 null）+ dictionary（完整释义）
// 参数：?context=当前句子（建议传，否则没有语境释义）、&ai=1（开启第三层 AI，按需）
//
// 为什么 AI 改成「默认关闭、显式开启」：
//   词典层已经能给出完整释义，而 L3 走 LLM 实测往返 4~13 秒。默认开着等于每次点冷词
//   都拖一个十几秒的长请求。前端改成先即时出卡（词典 + 已有语境库），卡片里放
//   「AI 生成语境释义」按钮，用户真要看「这句话里什么意思」时带 ?ai=1 再打一次。
app.get('/api/words/:word', async (req, res) => {
    const word = (req.params.word || '').trim();
    if (!word) return res.status(400).json({ error: '缺少 word 参数' });

    const context = (req.query.context || '').trim();
    // 联网深查开关：?ai=1 或 ?remote=1 才走网络（L1 知识库工作流 + L3 AI 生成）。
    // 不传 = 只查本地（词典 + 语境库），响应稳定在几毫秒。
    const enableRemote = req.query.ai === '1' || req.query.ai === 'true'
        || req.query.remote === '1' || req.query.remote === 'true';

    try {
        const r = await coze.lookupWordWithLayers(word, context, {
            enableRemote,
            articleId: req.query.articleId || null
        });
        return res.json({
            success: true,
            word: r.word,
            context: context,
            // —— 语境释义（本句里的意思）——
            contextDefinition: r.contextDefinition || null,
            contextSource: r.contextSource || null,   // kb | context | ai | cache | null
            // —— 完整释义（词典层）——
            dictionary: r.dictionary || null,
            // —— 兼容旧前端 ——
            source: r.source,           // dictionary | context | ai | cache | none
            layer: r.layer,             // 主释义来源：dictionary | kb | context | ai | cache | none
            hitScore: r.hitScore,
            elapsedMs: r.elapsed,
            dictElapsedMs: r.dictElapsedMs,
            definitions: r.definition
                ? [{ definition: r.definition, part_of_speech: r.partOfSpeech || null }]
                : []
        });
    } catch (e) {
        console.error(`❌ [words] 查词异常 | word=${word} | ${e.message}`);
        // 兜底：退回「词典层 → 语境库 → 通用词库」，保证接口始终可用
        const lower = word.toLowerCase();
        const dictEntry = dbOps.getDictionaryEntry(lower);
        if (context) {
            const ctxRow = dbOps.getWordContext(lower, context);
            if (ctxRow) {
                return res.json({
                    success: true, word: lower, context: context, source: 'context', layer: 'context',
                    contextDefinition: ctxRow.definition, contextSource: 'context',
                    dictionary: dictEntry,
                    definitions: [{ definition: ctxRow.definition, part_of_speech: ctxRow.part_of_speech }],
                    fallback: true
                });
            }
        }
        const definitions = dbOps.getWordDefinitions(lower);
        return res.json({
            success: true, word: lower, context: context, layer: dictEntry ? 'dictionary' : 'cache',
            source: dictEntry ? 'dictionary' : (definitions.length > 0 ? 'cache' : 'none'),
            contextDefinition: null, contextSource: null,
            dictionary: dictEntry,
            definitions: definitions,
            fallback: true
        });
    }
});

// 知识库配置状态 + 三层查询命中率（排查「哪一层在扛」用）
app.get('/api/kb/stats', (req, res) => {
    // 本地计数（零 API 成本）。知识库文档数需要调接口，刻意不放在这里，避免拖慢该路由。
    let sync = { total: 0, pending: 0, synced: 0 };
    try {
        sync = dbOps.getWordContextSyncStats();
    } catch (e) {
        console.warn(`⚠️ 读取同步统计失败: ${e.message}`);
    }
    res.json({
        syncMode: 'manual',                     // 知识库同步方式：手动（跑 export_csv.js + 控制台上传 CSV）
        manualFlow: [
            'node export_csv.js',
            'Coze 控制台手动上传 word_context.csv（文件类型选 txt）',
            'node sync_to_knowledge.js --mark-synced'
        ],
        configured: coze.isKnowledgeBaseConfigured(),
        kbId: coze.config.COZE_KB_ID || null,
        baseUrl: coze.config.COZE_KB_BASE_URL,
        // L1 检索 = 调 word_context_search 工作流（POST /v1/workflow/run）
        // 旧的直连路径 /open_api/knowledge/document/search 是网关 404，已废弃（COZE_KB_SEARCH_PATH 不再使用）
        searchVia: 'workflow',
        searchWorkflowId: coze.config.COZE_KB_SEARCH_WORKFLOW_ID || null,
        searchWorkflowPath: coze.config.COZE_KB_WORKFLOW_PATH,
        searchWorkflowQueryParam: coze.config.COZE_KB_WORKFLOW_QUERY_PARAM,
        searchWorkflowTimeoutMs: coze.config.COZE_KB_WORKFLOW_TIMEOUT_MS,
        sync,                                   // word_context 有效/已同步/待同步
        lookup: coze.getLookupStats()           // 含 lookup.kbWorkflow：L1 工作流的 调用/命中/未命中/失败
    });
});

// ==================== 词典层（本地 ECDICT 词典库） ====================

// 词典库状态：词条数、含音标/释义数、文件体积、是否就绪
// 注意：这条必须定义在 /api/dictionary/:word 之前，否则 "stats" 会被当成一个单词吃掉
app.get('/api/dictionary/stats', (req, res) => {
    const stats = dbOps.getDictionaryStats();
    if (!stats.ready) {
        return res.json({
            success: false,
            ready: false,
            state: stats.state,     // missing（没导入）| broken（文件坏了）
            path: stats.path,
            hint: '运行 npm run dict:import 导入 ECDICT 词典（约 36.5 万词条 / 58MB）'
        });
    }
    res.json({ success: true, ...stats });
});

// 批量查词：给前端「进阅读页时一次性预取本文所有词」用。
// 一次 SQL 拿完，避免每个词一次 HTTP 往返 —— 点词时前端就能 0 网络即时出卡。
// body: { words: ["shock", "gradually", ...] }
app.post('/api/dictionary/batch', (req, res) => {
    const words = Array.isArray(req.body && req.body.words) ? req.body.words : null;
    if (!words || words.length === 0) {
        return res.status(400).json({ error: '缺少 words 数组' });
    }
    if (words.length > 2000) {
        return res.status(400).json({ error: `一次最多查 2000 个词（收到 ${words.length}）` });
    }
    const t0 = Date.now();
    const map = dbOps.getDictionaryEntries(words);
    const elapsed = Date.now() - t0;
    const hit = Object.keys(map).length;
    console.log(`📖 [dictionary/batch] 请求 ${words.length} 个词 | 命中 ${hit} | 缺失 ${words.length - hit} | 耗时 ${elapsed}ms`);
    res.json({
        success: true,
        requested: words.length,
        hit,
        miss: words.length - hit,
        elapsedMs: elapsed,
        entries: map            // { word: {phonetic, translationLines, ...} }
    });
});

// 查单个词的词典释义（不涉及语境，纯词典层；排障与调试用）
app.get('/api/dictionary/:word', (req, res) => {
    const word = (req.params.word || '').trim();
    if (!word) return res.status(400).json({ error: '缺少 word 参数' });
    const t0 = Date.now();
    const entry = dbOps.getDictionaryEntry(word);
    res.json({
        success: !!entry,
        word: word.toLowerCase(),
        elapsedMs: Date.now() - t0,
        entry: entry || null,
        hint: entry ? undefined : '本地词典未收录该词（可能是拼写变体、专有名词或缩写）'
    });
});

// 粘连词拆分（2026-10-07）：rapiddevelopment → rapid + development
//
// 背景：文章正文常因 PDF/OCR 抽取丢空格，产生 rapiddevelopment / thinkprivate 这类粘连词，
// 点上去词典必然查不到。需求：先查合并词，查不到就拆成若干真词，各自给释义。
// 实现全在 coze.segmentGluedWord（用本地 ECDICT 当词表做动态规划分词），**默认 0 联网、0 额度**；
// ?ai=1 时才允许退到 AI 兜底（前端只有用户主动点「AI 拆词」才会带这个参数）。
app.get('/api/glue-word/:word', async (req, res) => {
    const word = (req.params.word || '').trim();
    if (!word) return res.status(400).json({ error: '缺少 word 参数' });
    if (word.length > 40) return res.status(400).json({ error: `词太长（${word.length} 字符，上限 40）` });

    const allowAI = req.query.ai === '1' || req.query.ai === 'true';
    const t0 = Date.now();
    try {
        const r = allowAI
            ? await coze.splitGluedWord(word, { allowAI: true })
            : coze.segmentGluedWord(word);

        // 只回传前端要用的字段，别把整条词典记录（英文释义/词形表等）塞进响应
        const slim = (entry) => entry ? {
            word: entry.word,
            phoneticPretty: entry.phoneticPretty || null,
            translationLines: entry.translationLines || [],
            pos: entry.pos || null,
            collins: entry.collins || 0,
            oxford: entry.oxford || 0,
            tagList: entry.tagList || [],
            lemma: entry.lemma || null,
            bnc: entry.bnc || 0
        } : null;

        const payload = {
            success: true,
            word: r.word || word.toLowerCase(),
            isGlued: !!r.isGlued,
            method: r.method,
            elapsedMs: Date.now() - t0,
            merged: {
                word: (r.merged && r.merged.word) || word.toLowerCase(),
                found: !!(r.merged && r.merged.entry),
                entry: slim(r.merged && r.merged.entry)
            },
            parts: (r.parts || []).map(p => ({
                word: p.word,
                found: !!p.entry,
                entry: slim(p.entry),
                // 拆出来的每一段也走一遍「本地兜底释义」，词典没有时还能从 word_context / word_cache 拿
                fallbackMeaning: p.entry ? null : (coze.resolveLocalMeaning(p.word).meaning || null)
            }))
        };

        if (payload.isGlued) {
            console.log(`🧩 [glue-word] "${payload.word}" → ${payload.parts.map(p => p.word).join(' + ')}`
                + `（${payload.method} | ${payload.elapsedMs}ms | ai=${allowAI}）`);
        } else {
            console.log(`🧩 [glue-word] "${payload.word}" 未拆开（合并词${payload.merged.found ? '已收录' : '未收录'}`
                + ` | ${payload.elapsedMs}ms | ai=${allowAI}）`);
        }
        res.json(payload);
    } catch (e) {
        console.error(`❌ [glue-word] "${word}" 失败: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

// 新增一条释义（不覆盖已有释义）；带 context 时同时写入语境库
app.post('/api/words', (req, res) => {
    const { word, definition, part_of_speech, context } = req.body;
    if (!word || !definition || !definition.trim()) {
        return res.status(400).json({ error: '缺少 word 或 definition' });
    }

    const result = dbOps.addWordDefinition(word, definition.trim(), part_of_speech || null);
    let contextSaved = null;
    if (context && context.trim()) {
        contextSaved = dbOps.saveWordContext(word, context, definition.trim(), part_of_speech || null);
    }
    res.json({
        success: true,
        word: result.word,
        definition: result.definition,
        part_of_speech: result.part_of_speech,
        context_saved: !!contextSaved
    });
});

// 批量查词
app.post('/api/word-meanings', (req, res) => {
    const { words } = req.body;
    if (!Array.isArray(words)) return res.status(400).json({ error: 'words 必须是数组' });
    const map = dbOps.getWordMeaningFromCache(words);
    res.json(map);
});

// ==================== user_words 接口（拖拽收藏 + 分类 + 单词本） ====================

// 获取用户收藏单词（按 status 筛选）
app.get('/api/user-words', (req, res) => {
    const userId = getUserIdFromReq(req);
    const status = req.query.status || 'all';
    const rows = dbOps.getUserWords(userId, status);

    // 释义兜底（2026-10-06）：user_words.definition 是「收藏那一刻」写进去的快照，
    // 历史上拖拽路径写死了 '暂无释义'（实测 35 条里 25 条中招），列表于是全显示「暂无释义」。
    // 这里对「空 / 暂无释义」的行用本地三层（词典层首义 → 语境库 → 通用词库）现场补一个，
    // 并额外带上 dictionary（音标 + 全部义项），前端单词本可以直接渲染完整释义。
    let patched = 0;
    const out = rows.map(r => {
        const stored = (r.definition || '').trim();
        const needsFill = !stored || stored === '暂无释义';
        let meaning = stored;
        let meaningSource = stored ? 'stored' : null;
        let dictionary = null;

        if (needsFill) {
            const local = coze.resolveLocalMeaning(r.word, r.sentence);
            if (local.meaning) {
                meaning = local.meaning;
                meaningSource = local.source;
                patched++;
            } else {
                meaning = '';           // 真的查不到 → 给空串，前端显示「暂无释义」占位并允许手动补
                meaningSource = null;
            }
        }
        try {
            dictionary = dbOps.getDictionaryEntry(r.word);
        } catch (e) {
            dictionary = null;
        }

        return {
            id: r.id,
            word: r.word,
            definition: r.definition,      // 原样保留（排查数据质量用）
            meaning,                       // 前端直接渲染这个
            meaningSource,                 // stored | dictionary | context | cache | null
            dictionary,                    // 音标 / 中文义项 / 英文释义 / 词性 / 星级
            sentence: r.sentence,
            articleId: r.article_id,
            paragraphIndex: r.paragraph_index,
            sentenceIndex: r.sentence_index,
            status: r.status,
            knowledge: r.knowledge,
            collectedAt: r.collected_at,
            nextReviewAt: r.next_review_at
        };
    });

    console.log(`📚 [user-words] user=${userId} status=${status} | 返回 ${out.length} 条 | 释义兜底补全 ${patched} 条（原 definition 为空/暂无释义）`);
    res.json(out);
});

// 判断某句中单词是否已收藏
app.get('/api/word-collected', (req, res) => {
    const userId = getUserIdFromReq(req);
    const { word, articleId, sentence } = req.query;
    if (!word || !articleId || !sentence) {
        return res.status(400).json({ error: '缺少 word/articleId/sentence' });
    }
    const collected = dbOps.isWordCollectedInSentence(userId, word, articleId, sentence);
    res.json({ collected });
});

// 拖拽收藏（存入 user_words 表）
app.post('/api/collect-word', (req, res) => {
    const userId = getUserIdFromReq(req);
    const { word, meaning, sentence, articleId, paragraphIndex, sentenceIndex } = req.body;

    if (!word) return res.status(400).json({ error: '缺少 word' });

    // 用 user_id + word + article_id + sentence 四字段组合判断
    if (articleId && sentence && dbOps.isWordCollectedInSentence(userId, word, articleId, sentence)) {
        return res.json({ success: false, reason: 'duplicate', message: '本句中已收藏过这个词' });
    }

    const result = dbOps.insertUserWord({
        user_id: userId,
        word: word,
        definition: meaning || null,
        sentence: sentence || null,
        article_id: articleId || null,
        paragraph_index: paragraphIndex || 0,
        sentence_index: sentenceIndex || 0,
        status: 'pending',
        knowledge: 0
    });

    if (result.success) {
        res.json({ success: true, id: result.id, message: '收藏成功！待分类 +1' });
    } else {
        res.json({ success: false, reason: result.reason, message: '本句中已收藏过这个词' });
    }
});

// 取消收藏（2026-10-09 新增）：从 user_words 删除
//   参数（query 或 body 均可）：
//     id                     —— 直接按主键删（带 user_id 归属校验）
//     word（必填，除非给了 id）
//     articleId（可选）       —— 给了就限定在这篇文章
//     sentence（可选）        —— 给了就只删「本句」那一条；只给 articleId 则删该词在本篇的全部行
//   返回 { success, deleted }，deleted 为真正删除的行数（0 说明本来就没收藏）。
app.delete('/api/collect-word', (req, res) => {
    const userId = getUserIdFromReq(req);
    const src = Object.assign({}, req.query, req.body || {});
    const { id, word, articleId, sentence } = src;

    if (id !== undefined && id !== null && id !== '') {
        const numId = parseInt(id, 10);
        if (!Number.isFinite(numId)) return res.status(400).json({ error: 'id 非法' });
        const r = dbOps.deleteUserWordById(numId, userId);
        console.log(`🗑️ [取消收藏] by id=${numId} user=${userId} → deleted=${r.deleted}`);
        return res.json({ success: true, deleted: r.deleted });
    }

    if (!word) return res.status(400).json({ error: '缺少 word（或 id）' });
    const r = dbOps.deleteUserWords(userId, word, articleId || null, sentence || null);
    console.log(`🗑️ [取消收藏] word="${word}" article=${articleId || '（全部）'} sentence=${sentence ? '限定本句' : '（不限）'} user=${userId} → deleted=${r.deleted}`);
    res.json({ success: true, deleted: r.deleted, word: word });
});

// 更新单词分类状态（已掌握/学习中/需复习）
app.put('/api/word-status/:id', (req, res) => {
    const wordId = parseInt(req.params.id, 10);
    const { status, knowledge } = req.body;

    if (!['pending', 'learning', 'mastered', 'review'].includes(status)) {
        return res.status(400).json({ error: 'status 取值非法' });
    }

    dbOps.updateUserWordStatus(wordId, status, knowledge);
    res.json({ success: true, id: wordId, status });
});

// ==================== 用户 & 打卡接口 ====================

// 连续打卡（更新 users.streak 和 last_active）
app.post('/api/check-in', (req, res) => {
    const userId = getUserIdFromReq(req);
    const today = new Date().toDateString();
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);

    const user = dbOps.getOrCreateUser(req.headers['x-username'] || req.body.username);
    let streak = user.streak || 0;

    if (user.last_active !== today) {
        streak = (user.last_active === yesterday.toDateString()) ? streak + 1 : 1;
        dbOps.updateUserStreak(userId, streak, today);
    }

    res.json({ success: true, streak, lastActive: today, level: user.level });
});

// 更新用户等级
app.put('/api/user-level', (req, res) => {
    const userId = getUserIdFromReq(req);
    const { level } = req.body;
    dbOps.updateUserLevel(userId, level);
    res.json({ success: true, level });
});

// ==================== 学习记录接口 ====================

app.post('/api/learning-record', (req, res) => {
    const userId = getUserIdFromReq(req);
    const { date, wordsLearned, quizScore, timeSpent } = req.body;
    dbOps.recordLearning(userId, date || new Date().toDateString(), wordsLearned, quizScore, timeSpent);
    res.json({ success: true });
});

// ==================== 数据迁移接口 ====================

// 迁移 localStorage 数据到 DB（前端首次连接时调用）
app.post('/api/migrate', (req, res) => {
    const userId = getUserIdFromReq(req);
    const { collectedWords, streak, lastDate, level, userName } = req.body;

    let result = { userId, migrated: {} };

    // 迁移收藏单词
    if (Array.isArray(collectedWords) && collectedWords.length > 0) {
        const added = dbOps.migrateLocalCollectedWords(userId, collectedWords);
        result.migrated.collectedWords = added;
    }

    // 迁移打卡数据
    if (typeof streak === 'number') {
        dbOps.updateUserStreak(userId, streak, lastDate || new Date().toDateString());
        result.migrated.streak = streak;
    }

    // 迁移等级
    if (level) {
        dbOps.updateUserLevel(userId, level);
        result.migrated.level = level;
    }

    console.log(`📥 用户 ${userId} 数据迁移完成:`, result.migrated);
    res.json(result);
});

// ==================== 启动 ====================

app.listen(PORT, () => {
    console.log('\n🍎 金苹果之旅 - 后端服务启动成功！（企业级架构版）');
    console.log('========================================');
    console.log(`🔌 端口:      ${PORT}  [来源: ${PORT_FROM_ENV ? '环境变量 PORT' : '默认值 3000（环境变量 PORT 未设置）'}]`);
    console.log(`📍 访问地址:  http://localhost:${PORT}`);
    console.log(`📦 静态目录:  ${__dirname}`);
    console.log(`🗄️  数据库:    SQLite (${dbOps.DB_PATH})  [来源: ${dbOps.DB_PATH_SOURCE === 'default' ? '默认值' : '环境变量 ' + dbOps.DB_PATH_SOURCE}]`);
    console.log(`🧩 词典库:    ${dbOps.DICT_PATH}`);
    const _dict = dbOps.getDictionaryStats();
    console.log(`📖 词典库:    ${_dict.ready ? `✅ ${_dict.entries} 词条 / ${_dict.fileSizeMb} MB` : `⚠️  未导入（npm run dict:download 或 npm run dict:import）`}`);
    console.log(`🔄 异步队列:  进程内轻量队列 (重试 ${process.env.QUEUE_MAX_RETRIES || 3} 次)`);
    console.log(`🤖 Coze:      ${coze.isCozeConfigured() ? '✅ 已配置' : '⚠️  未配置 (.env)'}`);
    console.log(`🩺 健康检查:  http://localhost:${PORT}/health`);
    console.log('========================================\n');
});
