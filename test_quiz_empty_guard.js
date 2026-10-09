/**
 * test_quiz_empty_guard.js —— 「题目生成假装成功 / 顺带禁用拖拽」回归测试（2026-10-08 新增）
 *
 * 【用户报障 · 两个症状，一条因果链】
 *   症状一：题目生成返回 0 题 → 日志「无可用题目，使用降级题目」。
 *   症状二：正文单词拖拽收藏失效（「这次改完」）。
 *
 *   根因：coze.js 的 generateQuestionsWithCoze 在 JSON 解析失败时只打一句 warn，
 *         然后 rawQuestions = [] → 返回 **0 题 + success:true**（把失败伪装成成功）。
 *         → queue.js 静默换成 generateFallbackQuestions 的降级题（isFallback/answerMode='selection'）
 *         → app.js 按题目里的标记进入「降级划选答题模式」fallbackQuizActive=true
 *         → 而 onSpanPointerDown 当时写死 `if (fallbackQuizActive) return;`
 *         ⇒ 正文单词一按就返回，用户感知就是「拖拽坏了」。题目没了和拖拽没了是同一条链。
 *
 * 本测试锁定：
 *   A. coze 层（真 coze.js + 假 LLM）：答非所问 / 截断 / 缺 questions / 空数组 / 题干全空
 *      → **必须抛错**（绝不能再返回 0 题的 success）；正常 JSON → 照常成功。
 *   B. queue 层（打桩 coze）：quiz 抛错时仍要落到降级题，并且日志里必须写明
 *      「原因 + 会进入降级划选模式、禁用正文拖拽」这条因果，方便下次一眼定位。
 *   C. 反向回归：quiz 成功后落库的题目**不带** isFallback → 前端不会进降级模式
 *      （这条是「拖拽恢复」的保证）。
 *
 * 运行：node test_quiz_empty_guard.js
 */
const http = require('http');
const path = require('path');

let pass = 0, fail = 0;
function check(name, cond, extra) {
    if (cond) { pass++; console.log(`  PASS  ${name}`); }
    else { fail++; console.log(`  FAIL  ${name}${extra !== undefined ? ' | 实际: ' + JSON.stringify(extra) : ''}`); }
}

// ---------------------------------------------------------------- 假 LLM 服务
let responseMode = 'valid';
const MODES = {
    valid: () => JSON.stringify({
        questions: [
            { type: 'MAIN IDEA', question: 'What is the passage mainly about?', options: ['A', 'B', 'C', 'D'], answer: 'A', explanation: 'x' },
            { type: 'DETAIL', question: 'Where does the cat sit?', options: ['A', 'B', 'C', 'D'], answer: 'B', explanation: 'y' }
        ],
        total_questions: 2
    }),
    prose: () => '抱歉，我无法处理这篇文本。',
    truncated: () => '{"questions": [{"type": "DETAIL", "question": "Where does the cat sit?", "options": ["A", "B"',
    noField: () => JSON.stringify({ items: [{ question: 'x' }], total_questions: 1 }),
    emptyArray: () => JSON.stringify({ questions: [], total_questions: 0 }),
    emptyText: () => JSON.stringify({ questions: [{ type: 'DETAIL', options: ['A', 'B', 'C', 'D'] }], total_questions: 1 }),
    bareArray: () => JSON.stringify([{ type: 'DETAIL', question: 'Bare array question?', options: ['A', 'B', 'C', 'D'], answer: 'A' }])
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

const ARTICLE = 'The cat sat on the mat. It was very happy. The dog ran away quickly. The garden was full of flowers.';

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
    console.log('\n【A】coze 层：题目返回不可用时必须抛错（不能再"0 题的 success"）');
    // ============================================================

    responseMode = 'valid';
    const okRes = await coze.generateQuestionsWithCoze(ARTICLE, '测试', 4);
    check('A1 正常 JSON → success 且 2 题', okRes.success === true && okRes.questions.length === 2, { s: okRes.success, n: okRes.questions.length });
    check('A2 归一化后 answer_index 已转成 0-based 数字',
        okRes.questions.every(q => typeof q.answer_index === 'number'), okRes.questions.map(q => q.answer_index));

    async function expectThrow(label, mode, keyword) {
        responseMode = mode;
        try {
            const r = await coze.generateQuestionsWithCoze(ARTICLE, '测试', 4);
            check(label, false, `**没有抛错**，返回 ${r.questions.length} 题 / success=${r.success}（这就是静默降级）`);
        } catch (e) {
            const msg = (e && e.message) || String(e);
            check(label, msg.indexOf(keyword) !== -1, msg.slice(0, 160));
        }
    }

    await expectThrow('A3 模型答非所问（纯文字非 JSON）→ 抛错', 'prose', 'JSON 解析失败');
    await expectThrow('A4 响应被截断（JSON 不闭合）→ 抛错', 'truncated', 'JSON 解析失败');
    await expectThrow('A5 解析成功但缺 questions 字段 → 抛错', 'noField', '返回 0 题');
    await expectThrow('A6 questions 是空数组 → 抛错（0 题对上层毫无价值）', 'emptyArray', '返回 0 题');
    await expectThrow('A7 有题目但题干全为空 → 抛错', 'emptyText', '题干全为空');

    // 兼容：模型直接返回数组（历史行为），应当被接受而不是报错
    responseMode = 'bareArray';
    const bare = await coze.generateQuestionsWithCoze(ARTICLE, '测试', 4);
    check('A8 响应是纯数组（兼容老形态）→ 仍能成功解析 1 题',
        bare.questions.length === 1 && /Bare array/.test(bare.questions[0].question), bare.questions.map(q => q.question));

    srv.close();

    // ============================================================
    console.log('\n【B】queue 层：quiz 失败 → 降级题要落库，且日志写明「原因 + 会禁用拖拽」的因果');
    // ============================================================
    const dbOps = require(path.join(__dirname, 'db.js'));
    const user = dbOps.getOrCreateDefaultUser ? dbOps.getOrCreateDefaultUser() : null;
    const uid = user ? user.id : 1;
    const CONTENT = [
        'The cat sat on the mat and looked at the beautiful garden.',
        'A quick brown fox jumps over the lazy dog near the river.',
        'Students often read books in the quiet library after school.'
    ].join('\n\n');
    const STUB_SENTS = [
        { sentence: 'The cat sat on the mat and looked at the beautiful garden.', translation: '猫坐在垫子上，看着美丽的花园。' },
        { sentence: 'A quick brown fox jumps over the lazy dog near the river.', translation: '一只敏捷的棕色狐狸在河边跳过懒狗。' },
        { sentence: 'Students often read books in the quiet library after school.', translation: '学生们放学后常在安静的图书馆里读书。' }
    ];
    const GOOD_QUESTIONS = [
        { type: 'DETAIL', question: 'Where did the cat sit?', options: ['A', 'B', 'C', 'D'], answer_index: 0 },
        { type: 'MAIN IDEA', question: 'What is the passage about?', options: ['A', 'B', 'C', 'D'], answer_index: 1 }
    ];

    coze.analyzeSentencesWithCoze = () => Promise.resolve({ sentenceList: STUB_SENTS });
    coze.analyzeWordsWithCoze = () => Promise.resolve({ wordList: { cat: '猫' }, rawWordList: [{ word: 'cat', meaning: '猫', sentenceIndex: 0 }] });

    const queue = require(path.join(__dirname, 'queue.js'));

    function makeArticle(id, title) {
        dbOps.insertArticle({
            id: id, user_id: uid, title: title, description: '自动化测试',
            content: CONTENT, source: 'upload', level: 'middle', level_label: '初中',
            status: 'pending', questions: [], sentences: []
        });
    }
    // 队列会把句子语境写进 word_context（article_id 指向本测试文章），删文章时必须一起删，
    // 否则留下悬空 article_id（test_article_cleanup.js 会报红）。
    const cleanup = ids => {
        const ph = ids.map(() => '?').join(',');
        try { dbOps.db.prepare(`DELETE FROM word_context WHERE article_id IN (${ph})`).run(...ids); } catch (e) {}
        try { dbOps.db.prepare(`DELETE FROM user_words WHERE article_id IN (${ph})`).run(...ids); } catch (e) {}
        try { dbOps.db.prepare(`DELETE FROM articles WHERE id IN (${ph})`).run(...ids); } catch (e) {}
    };

    const ID_FAIL = 'qa_quizfail_' + Date.now();
    const ID_OK = 'qa_quizok_' + Date.now();
    const ALL = [ID_FAIL, ID_OK];

    // 捕获 console.warn，验证因果日志真的打出来了
    const warns = [];
    const origWarn = console.warn;
    console.warn = (...a) => { warns.push(a.map(String).join(' ')); origWarn(...a); };

    try {
        // B1：quiz 抛错（新行为）→ 落降级题 + 日志写明因果
        makeArticle(ID_FAIL, '测试：quiz 抛错 → 降级题');
        coze.generateQuestionsWithCoze = () => Promise.reject(new Error('quiz_generator 返回 0 题（响应 12 字符，questions 为空）| 模型=glm-test-model'));
        await queue.processArticle({ articleId: ID_FAIL, content: CONTENT, userId: uid, title: '测试：quiz 抛错 → 降级题' });
        const a1 = dbOps.getArticleById(ID_FAIL);
        const q1 = a1.questions || [];
        console.log('   落库题目 =', JSON.stringify(q1.slice(0, 1)));
        check('B1 quiz 抛错后文章仍拿到降级题（保证用户有题可做）', q1.length > 0, q1.length);
        check('B2 降级题带 isFallback/answerMode 标记（前端据此进降级划选模式）',
            q1.some(x => x && (x.isFallback === true || x.answerMode === 'selection')), q1.map(x => !!x.isFallback));
        check('B3 日志写明「无可用题目」', warns.some(w => /无可用题目/.test(w)));
        check('B4 日志带上真实原因（quiz 的报错文本）', warns.some(w => /返回 0 题/.test(w)));
        check('B5 日志写明「会禁用正文拖拽收藏」这条因果（下次一眼定位）',
            warns.some(w => /拖拽收藏会被禁用/.test(w)), warns.filter(w => /拖拽/.test(w)).slice(0, 2));

        // B2：quiz 正常返回 → 题目原样落库且**不带**降级标记（即不会进降级模式）
        makeArticle(ID_OK, '测试：quiz 正常 → 真题目');
        coze.generateQuestionsWithCoze = () => Promise.resolve({ questions: GOOD_QUESTIONS, total_questions: 2, success: true });
        await queue.processArticle({ articleId: ID_OK, content: CONTENT, userId: uid, title: '测试：quiz 正常 → 真题目' });
        const a2 = dbOps.getArticleById(ID_OK);
        const q2 = a2.questions || [];
        check('B6 quiz 成功 → 题目数正确落库', q2.length === GOOD_QUESTIONS.length, q2.length);
        check('B7 ★真题目不带 isFallback → 前端不会进降级划选模式（拖拽因此不再被禁）',
            !q2.some(x => x && (x.isFallback === true || x.answerMode === 'selection')), q2);
        check('B8 真题目文本未被降级题覆盖', /Where did the cat sit\?/.test(JSON.stringify(q2)), JSON.stringify(q2).slice(0, 120));
    } finally {
        console.warn = origWarn;
        cleanup(ALL);
        console.log('\n（已清理测试文章）');
    }

    console.log(`\n结果：${pass} PASS / ${fail} FAIL`);
    process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.log('测试异常:', (e && e.stack) || e); process.exit(1); });
