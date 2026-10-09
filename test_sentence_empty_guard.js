/**
 * test_sentence_empty_guard.js —— 「句子翻译假装成功」回归测试（2026-10-08 新增）
 *
 * 【用户报障】新上传的文章：日志显示「句子翻译成功」、题目正常生成，
 *            但浮层悬停显示「暂无翻译」。根因不在前端匹配，而在**后端把失败伪装成成功**：
 *
 *   callSentenceBatch 解析 JSON 失败时 return { sentenceList: [] }  ← 吞掉错误
 *     → processSentenceBatches 记「第 1/1 批 | 句数: 0 | 成功」
 *     → analyzeSentencesWithCoze 打「✅ 成功 | 句子: 0」
 *     → queue 落 status='completed' + sentences=[] + sentences_error=NULL
 *   ⇒ 文章看起来一切正常（题目都在），却整篇没有译文，而且**连 partial 都不是、没有重试入口**。
 *
 *   常见触发：模型答非所问（返回解释性文字）、响应被截断（JSON 不闭合）。
 *
 * 本测试锁定两层守卫：
 *   A. coze 层（真 coze.js + 假 LLM 服务）：解析失败 / 缺字段 / 空列表 → **必须抛错**；
 *      正常返回 → 照常成功；纯中文批 → 空列表不算失败。
 *   B. queue 层（打桩 coze）：即使上层"成功"返回 0 句，文章也必须落 partial（绝不能 completed）。
 *
 * 运行：node test_sentence_empty_guard.js
 */
const http = require('http');
const path = require('path');

let pass = 0, fail = 0;
function check(name, cond, extra) {
    if (cond) { pass++; console.log(`  PASS  ${name}`); }
    else { fail++; console.log(`  FAIL  ${name}${extra !== undefined ? ' | 实际: ' + extra : ''}`); }
}

// ---------------------------------------------------------------- 假 LLM 服务
let responseMode = 'valid';
const MODES = {
    valid: () => JSON.stringify({
        sentenceList: [
            { sentence: 'The cat sat on the mat.', translation: '猫坐在垫子上。' },
            { sentence: 'It was very happy.', translation: '它非常开心。' }
        ]
    }),
    prose: () => '抱歉，我无法处理这篇文本。',
    truncated: () => '{"sentenceList": [{"sentence": "The cat sat on the mat.", "translation": "猫坐在垫子上。"}',
    noField: () => JSON.stringify({ sentences: [{ sentence: 'x', translation: 'y' }] }),
    emptyList: () => JSON.stringify({ sentenceList: [] }),
    notObject: () => JSON.stringify([{ sentence: 'x', translation: 'y' }])
};

function startFakeLLM() {
    return new Promise(resolve => {
        const srv = http.createServer((req, res) => {
            let body = '';
            req.on('data', c => body += c);
            req.on('end', () => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ choices: [{ message: { content: MODES[responseMode]() } }], usage: {} }));
            });
        });
        srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
    });
}

const EN_ARTICLE = 'The cat sat on the mat. It was very happy. The dog ran away quickly.';
const ZH_ARTICLE = '这是一篇中文文章，它不应该被当成英文文章处理。';

(async () => {
    const { srv, port } = await startFakeLLM();
    const fakeBase = `http://127.0.0.1:${port}/v1`;
    // 必须在 require('./coze') 之前设好（dotenv 不覆盖已存在的环境变量）
    process.env.ARTICLE_API_KEY = 'test-key';
    process.env.ARTICLE_BASE_URL = fakeBase;
    process.env.ARTICLE_MODEL = 'glm-test-model';
    process.env.DEEPSEEK_API_KEY = 'test-key';
    process.env.DEEPSEEK_BASE_URL = fakeBase;
    process.env.ARTICLE_FALLBACK_MODEL = 'ds-test-model';
    process.env.MODEL_HEALTH_FAIL_THRESHOLD = '9999';   // 关掉熔断干扰

    const coze = require(path.join(__dirname, 'coze.js'));

    // ============================================================
    console.log('\n【A】coze 层：解析失败 / 缺字段 / 空列表，必须抛错（不能再"假装成功"）');
    // ============================================================

    responseMode = 'valid';
    const okRes = await coze.analyzeSentencesWithCoze(EN_ARTICLE, '测试');
    check('A1 正常 JSON → 成功返回 2 句', (okRes.sentenceList || []).length === 2, (okRes.sentenceList || []).length);

    async function expectThrow(label, mode, article, keyword) {
        responseMode = mode;
        try {
            const r = await coze.analyzeSentencesWithCoze(article, '测试');
            check(label, false, `**没有抛错**，返回了 ${(r.sentenceList || []).length} 句（这就是静默降级）`);
        } catch (e) {
            const msg = (e && e.message) || String(e);
            check(label, msg.indexOf(keyword) !== -1, msg.slice(0, 150));
        }
    }

    await expectThrow('A2 模型答非所问（纯文字，非 JSON）→ 抛错', 'prose', EN_ARTICLE, 'JSON 解析失败');
    await expectThrow('A3 响应被截断（JSON 不闭合）→ 抛错', 'truncated', EN_ARTICLE, 'JSON 解析失败');
    await expectThrow('A4 解析成功但缺 sentenceList 字段 → 抛错', 'noField', EN_ARTICLE, '缺少 sentenceList');
    await expectThrow('A5 解析成功但 sentenceList 为空 → 抛错', 'emptyList', EN_ARTICLE, '空列表');
    await expectThrow('A6 响应是数组不是对象 → 抛错', 'notObject', EN_ARTICLE, '不是 JSON 对象');
    await expectThrow('A7 本批有英文却 0 句 → 抛错（空数组对上层无价值）', 'emptyList', EN_ARTICLE, '空列表');

    // 纯中文：0 句是合理的，不能误判成失败
    responseMode = 'emptyList';
    const zhRes = await coze.analyzeSentencesWithCoze(ZH_ARTICLE, '测试');
    check('A8 纯中文文章返回空列表 → **不抛错**（合法的空结果，不该把文章误标 partial）',
        Array.isArray(zhRes.sentenceList) && zhRes.sentenceList.length === 0, JSON.stringify(zhRes.sentenceList));
    check('A9 hasEnoughEnglish 判据可用且已导出（队列层与 coze 层同一口径）',
        typeof coze.hasEnoughEnglish === 'function'
        && coze.hasEnoughEnglish(EN_ARTICLE) === true
        && coze.hasEnoughEnglish(ZH_ARTICLE) === false);

    srv.close();

    // ============================================================
    console.log('\n【B】queue 层：即使上层"成功"返回 0 句，文章也必须落 partial（不能 completed）');
    // ============================================================
    const dbOps = require(path.join(__dirname, 'db.js'));
    const user = dbOps.getOrCreateDefaultUser ? dbOps.getOrCreateDefaultUser() : null;
    const uid = user ? user.id : 1;
    const CONTENT = [
        'The cat sat on the mat and looked at the beautiful garden.',
        'A quick brown fox jumps over the lazy dog near the river.',
        'Students often read books in the quiet library after school.'
    ].join('\n\n');
    const STUB_QUESTIONS = [{ type: 'DETAIL', question: 'q', options: ['A', 'B', 'C', 'D'], answer: 'A' }];
    const STUB_SENTS = [
        { sentence: 'The cat sat on the mat and looked at the beautiful garden.', translation: '猫坐在垫子上，看着美丽的花园。' },
        { sentence: 'A quick brown fox jumps over the lazy dog near the river.', translation: '一只敏捷的棕色狐狸在河边跳过懒狗。' },
        { sentence: 'Students often read books in the quiet library after school.', translation: '学生们放学后常在安静的图书馆里读书。' }
    ];

    coze.generateQuestionsWithCoze = () => Promise.resolve({ questions: STUB_QUESTIONS, total_questions: 1, success: true });
    coze.analyzeWordsWithCoze = () => Promise.resolve({ wordList: { cat: '猫' }, rawWordList: [{ word: 'cat', meaning: '猫', sentenceIndex: 0 }] });

    const queue = require(path.join(__dirname, 'queue.js'));

    function makeArticle(id, title) {
        dbOps.insertArticle({
            id: id, user_id: uid, title: title, description: '自动化测试',
            content: CONTENT, source: 'upload', level: 'middle', level_label: '初中',
            status: 'pending', questions: [], sentences: []
        });
    }
    // 注意：队列会把「句子语境」写进 word_context（article_id 指向本测试文章），
    // 删文章时必须一起删，否则会留下悬空 article_id（test_article_cleanup.js 会报红）。
    const cleanup = ids => {
        const ph = ids.map(() => '?').join(',');
        try { dbOps.db.prepare(`DELETE FROM word_context WHERE article_id IN (${ph})`).run(...ids); } catch (e) {}
        try { dbOps.db.prepare(`DELETE FROM user_words WHERE article_id IN (${ph})`).run(...ids); } catch (e) {}
        try { dbOps.db.prepare(`DELETE FROM articles WHERE id IN (${ph})`).run(...ids); } catch (e) {}
    };

    const ID_EMPTY = 'qa_sentempty_' + Date.now();
    const ID_REJECT = 'qa_sentrej_' + Date.now();
    const ID_OK = 'qa_sentok_' + Date.now();
    const ALL = [ID_EMPTY, ID_REJECT, ID_OK];

    try {
        // B1：上层"成功"返回 0 句（旧 coze.js 的行为）→ 队列必须拦下
        makeArticle(ID_EMPTY, '测试：句子翻译成功但 0 句');
        coze.analyzeSentencesWithCoze = () => Promise.resolve({ sentenceList: [] });
        await queue.processArticle({ articleId: ID_EMPTY, content: CONTENT, userId: uid, title: '测试：句子翻译成功但 0 句' });
        const a1 = dbOps.getArticleById(ID_EMPTY);
        console.log('   落库结果 =', JSON.stringify({ status: a1.status, sentences: (a1.sentences || []).length, err: String(a1.sentences_error || '').slice(0, 60), questions: (a1.questions || []).length }));
        check('B1 文章状态是 partial（**绝不能是 completed**）', a1 && a1.status === 'partial', a1 && a1.status);
        check('B2 sentences 为空', Array.isArray(a1.sentences) && a1.sentences.length === 0, a1 && a1.sentences && a1.sentences.length);
        check('B3 sentences_error 有明确原因（含「0 句」）', /0 句/.test(String(a1.sentences_error || '')), a1 && a1.sentences_error);
        check('B4 题目照常落库（partial 只代表译文挂了，不影响题目）', (a1.questions || []).length === STUB_QUESTIONS.length, a1 && (a1.questions || []).length);
        const st1 = queue.getQueueStatus(ID_EMPTY);
        check('B5 内存任务表里标了 sentencesFailed', !!(st1 && st1.sentencesFailed === true), st1 && st1.sentencesFailed);

        // B2：上层直接抛错（coze 层新行为）→ 同样 partial
        makeArticle(ID_REJECT, '测试：句子翻译抛错');
        coze.analyzeSentencesWithCoze = () => Promise.reject(new Error('句子翻译响应不可用：JSON 解析失败（mock）'));
        await queue.processArticle({ articleId: ID_REJECT, content: CONTENT, userId: uid, title: '测试：句子翻译抛错' });
        const a2 = dbOps.getArticleById(ID_REJECT);
        check('B6 抛错路径 → status=partial', a2 && a2.status === 'partial', a2 && a2.status);
        check('B7 抛错原因写进 sentences_error', /JSON 解析失败/.test(String(a2.sentences_error || '')), a2 && a2.sentences_error);
        check('B8 抛错路径题目也照常落库', (a2.questions || []).length === STUB_QUESTIONS.length, a2 && (a2.questions || []).length);

        // B3：正常返回 → completed（守卫不能误伤正常路径）
        makeArticle(ID_OK, '测试：句子翻译正常');
        coze.analyzeSentencesWithCoze = () => Promise.resolve({ sentenceList: STUB_SENTS });
        await queue.processArticle({ articleId: ID_OK, content: CONTENT, userId: uid, title: '测试：句子翻译正常' });
        const a3 = dbOps.getArticleById(ID_OK);
        check('B9 正常 3 句 → status=completed（守卫不误伤）', a3 && a3.status === 'completed', a3 && a3.status);
        check('B10 正常路径 sentences 落库 3 句', (a3.sentences || []).length === 3, a3 && (a3.sentences || []).length);
        check('B11 正常路径 sentences_error 为空', !a3.sentences_error, a3 && a3.sentences_error);
    } finally {
        cleanup(ALL);
        console.log('\n（已清理测试文章）');
    }

    console.log(`\n结果：${pass} PASS / ${fail} FAIL`);
    process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.log('测试异常:', (e && e.stack) || e); process.exit(1); });
