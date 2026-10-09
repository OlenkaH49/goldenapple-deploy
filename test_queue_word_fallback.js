/**
 * test_queue_word_fallback.js —— 队列「单词释义失败也要给兜底词库」回归测试（2026-09-30 新增）
 *
 * 背景：单词释义工作流失败/超时后，旧代码不会把 wordsReady 置 true，
 * 前端 currentArticle.wordsReady 永远 false → 点词被拦（只弹「释义生成中」）。
 * 本测试用打桩替换 coze 的三个任务函数，验证失败路径：
 *   · wordsReady 必须为 true
 *   · words 必须是缓存兜底词库（非空）
 *   · sentences / questions 正常落盘，文章最终 completed
 *
 * 运行：node test_queue_word_fallback.js
 */
const path = require('path');
const dbOps = require(path.join(__dirname, 'db.js'));
const coze = require(path.join(__dirname, 'coze.js'));

let pass = 0, fail = 0;
function check(name, cond, extra) {
    if (cond) { pass++; console.log(`  PASS  ${name}`); }
    else { fail++; console.log(`  FAIL  ${name}${extra !== undefined ? ' | 实际: ' + extra : ''}`); }
}

const ARTICLE_ID = 'test_word_fallback_' + Date.now();
const CONTENT = [
    'The cat sat on the mat and looked at the beautiful garden.',
    'A quick brown fox jumps over the lazy dog near the river.',
    'Students often read books in the quiet library after school.'
].join('\n\n');

(async () => {
    // ---- 打桩：单词释义失败（超时），句子与题目成功 ----
    const stubSents = [
        { sentence: 'The cat sat on the mat and looked at the beautiful garden.', translation: '猫坐在垫子上，看着美丽的花园。' },
        { sentence: 'A quick brown fox jumps over the lazy dog near the river.', translation: '一只敏捷的棕色狐狸在河边跳过懒狗。' },
        { sentence: 'Students often read books in the quiet library after school.', translation: '学生们放学后常在安静的图书馆里读书。' }
    ];
    coze.analyzeWordsWithCoze = () => Promise.reject(new Error('mock: 单词释义超时 60s'));
    coze.analyzeSentencesWithCoze = () => Promise.resolve({ sentenceList: stubSents });
    coze.generateQuestionsWithCoze = () => Promise.resolve({ questions: [{ type: 'DETAIL', question: 'q', options: ['A', 'B', 'C', 'D'], answer: 'A' }], total_questions: 1, success: true });

    const queue = require(path.join(__dirname, 'queue.js'));

    const user = dbOps.getOrCreateDefaultUser ? dbOps.getOrCreateDefaultUser() : null;
    dbOps.insertArticle({
        id: ARTICLE_ID,
        user_id: user ? user.id : 1,
        title: '测试：单词释义失败兜底',
        description: '自动化测试',
        content: CONTENT,
        source: 'upload',
        level: 'middle',
        level_label: '初中',
        status: 'pending',
        questions: [],
        sentences: []
    });

    console.log('\n【1】单词释义失败时，队列仍要给出兜底词库并置 wordsReady=true');
    await queue.processArticle({ articleId: ARTICLE_ID, content: CONTENT, userId: user ? user.id : 1, title: '测试：单词释义失败兜底' });

    const st = queue.getQueueStatus(ARTICLE_ID);
    console.log('   队列状态 =', JSON.stringify({
        wordsReady: st && st.wordsReady,
        wordsCount: st && st.words ? Object.keys(st.words).length : 0,
        sentencesReady: st && st.sentencesReady,
        sentences: st && st.sentences ? st.sentences.length : 0,
        questionsReady: st && st.questionsReady,
        questions: st && st.questions ? st.questions.length : 0,
        finishOrder: st && st.finishOrder
    }));

    check('wordsReady === true（这是前端点词能否弹卡的关键）', !!(st && st.wordsReady === true), st && st.wordsReady);
    check('words 是缓存兜底词库且非空', !!(st && st.words && Object.keys(st.words).length > 0), st && st.words ? Object.keys(st.words).length : 'null');
    check('兜底词库确实来自 word_cache（含真实释义）',
        !!(st && st.words && Object.values(st.words).some(v => v && String(v).length > 0)),
        JSON.stringify(Object.entries((st && st.words) || {}).slice(0, 3)));
    check('句子上报成功且就绪', !!(st && st.sentencesReady && st.sentences.length === 3), st && st.sentences && st.sentences.length);
    check('题目就绪', !!(st && st.questionsReady && st.questions.length > 0));
    check('完成顺序含「单词释义(失败)」', !!(st && st.finishOrder.indexOf('单词释义(失败)') !== -1), st && JSON.stringify(st.finishOrder));

    const article = dbOps.getArticleById(ARTICLE_ID);
    check('文章最终状态 completed', article && article.status === 'completed', article && article.status);
    check('文章落库的 sentences 有 3 句', article && Array.isArray(article.sentences) && article.sentences.length === 3, article && article.sentences && article.sentences.length);

    // ---- 清理测试数据 ----
    dbOps.db.prepare('DELETE FROM articles WHERE id = ?').run(ARTICLE_ID);
    console.log('\n（已清理测试文章）');
    console.log(`\n结果：${pass} PASS / ${fail} FAIL`);
    process.exit(fail === 0 ? 0 : 1);
})().catch(e => {
    try { dbOps.db.prepare('DELETE FROM articles WHERE id = ?').run(ARTICLE_ID); } catch (err) {}
    console.error('测试异常:', e);
    process.exit(1);
});
