/**
 * test_integration.js - 端到端集成测试
 * 模拟前端完整调用链路：异步上传 → 轮询状态 → 收藏 → 分类 → 读单词本
 * 运行：node test_integration.js
 */

const fetch = require('node-fetch');
const BASE = 'http://localhost:3000';
const USERNAME = 'test-user-' + Date.now();

async function apiGet(path) {
    const r = await fetch(BASE + path, { headers: { 'x-username': USERNAME } });
    return r.json();
}
async function apiPost(path, body) {
    const r = await fetch(BASE + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-username': USERNAME },
        body: JSON.stringify(body || {})
    });
    return r.json();
}
async function apiPut(path, body) {
    const r = await fetch(BASE + path, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-username': USERNAME },
        body: JSON.stringify(body || {})
    });
    return r.json();
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
    console.log('🧪 集成测试开始（用户: ' + USERNAME + '）\n');

    // 1. 健康检查
    console.log('1️⃣  健康检查...');
    const health = await apiGet('/health');
    console.log('   ', JSON.stringify(health));

    // 2. 打卡
    console.log('\n2️⃣  打卡...');
    const checkIn = await apiPost('/api/check-in', {});
    console.log('   ', JSON.stringify(checkIn));

    // 3. 读取预置文章列表
    console.log('\n3️⃣  读取文章列表...');
    // 2026-10-06：/api/articles 改为分页契约 { items, page, total, totalPages, hasMore }
    const artRes = await apiGet('/api/articles?page=1&pageSize=5');
    const articles = (artRes && artRes.items) || [];
    console.log('   第', artRes.page, '/', artRes.totalPages, '页 | 共', artRes.total, '篇 | 本页',
        articles.length, '篇 | 还有更多:', artRes.hasMore);
    console.log('   第一篇:', articles[0] && articles[0].title,
        '(题数:', (articles[0] && articles[0].questionCount) + ')',
        '| 含译文:', articles[0] && articles[0].hasSentences);

    // 4. 收藏单词（模拟拖拽收藏）
    console.log('\n4️⃣  拖拽收藏 vacation...');
    const collect = await apiPost('/api/collect-word', {
        word: 'vacation',
        meaning: '假期',
        sentence: 'Last summer, my family and I went on a trip to the beach.',
        articleId: 'article_001',
        paragraphIndex: 0,
        sentenceIndex: 0
    });
    console.log('   ', JSON.stringify(collect));

    // 5. 读待分类单词
    console.log('\n5️⃣  读取待分类单词...');
    const pending = await apiGet('/api/user-words?status=pending');
    console.log('   待分类', pending.length, '个');
    if (pending[0]) console.log('   第一个:', pending[0].word, '| id:', pending[0].id);

    // 6. 分类（mastered）
    if (pending[0]) {
        console.log('\n6️⃣  分类为已掌握...');
        const classify = await apiPut('/api/word-status/' + pending[0].id, { status: 'mastered', knowledge: 1 });
        console.log('   ', JSON.stringify(classify));

        // 验证分类结果
        const mastered = await apiGet('/api/user-words?status=mastered');
        const target = mastered.find(w => w.id === pending[0].id);
        console.log('   验证: status=' + (target ? target.status : '?') + ', knowledge=' + (target ? target.knowledge : '?') + ', nextReview=' + (target ? target.nextReviewAt : '?'));

        // 7. 重复收藏同一句子（应被唯一约束拦截）
        console.log('\n7️⃣  重复收藏同句（应失败）...');
        const dup = await apiPost('/api/collect-word', {
            word: 'vacation', meaning: '假期',
            sentence: 'Last summer, my family and I went on a trip to the beach.',
            articleId: 'article_001', paragraphIndex: 0, sentenceIndex: 0
        });
        console.log('   ', JSON.stringify(dup));

        // 8. 同单词不同句子（应成功）
        console.log('\n8️⃣  同单词不同句子收藏（应成功）...');
        const diff = await apiPost('/api/collect-word', {
            word: 'vacation', meaning: '假期',
            sentence: 'It was one of the best vacations I\'ve ever had.',
            articleId: 'article_001', paragraphIndex: 0, sentenceIndex: 5
        });
        console.log('   ', JSON.stringify(diff));
    }

    // 9. 异步上传文章（会触发 Coze，可能慢/失败）
    console.log('\n9️⃣  异步上传文章...');
    const upload = await apiPost('/api/upload-article', {
        content: 'The sun rises in the east and sets in the west. This is a simple sentence for testing. The cat sat on the mat. Birds fly in the sky.',
        title: '集成测试文章'
    });
    console.log('   上传结果:', JSON.stringify(upload));
    const articleId = upload.articleId;

    if (articleId) {
        console.log('   开始轮询状态...');
        let finalStatus = null;
        for (let i = 0; i < 30; i++) {
            await sleep(2000);
            const st = await apiGet('/api/article-status/' + articleId);
            console.log('   第' + (i + 1) + '次轮询: status=' + st.status + (st.queueStatus ? ' (queue=' + st.queueStatus + ', retries=' + st.retries + ')' : ''));
            if (st.status === 'completed' || st.status === 'failed') {
                finalStatus = st;
                break;
            }
        }
        if (finalStatus) {
            console.log('\n   ✅ 最终状态: ' + finalStatus.status);
            console.log('   题目数: ' + (finalStatus.questions ? finalStatus.questions.length : 0));
            console.log('   降级题目: ' + (finalStatus.isFallback ? '是' : '否'));
            if (finalStatus.questions && finalStatus.questions[0]) {
                console.log('   示例题目: ' + finalStatus.questions[0].question);
            }
        } else {
            console.log('\n   ⚠️ 轮询超时（Coze 可能仍在处理或重试中）');
        }
    }

    console.log('\n✅ 集成测试完成');
}

main().catch(e => {
    console.error('❌ 测试失败:', e.message);
    process.exit(1);
});
