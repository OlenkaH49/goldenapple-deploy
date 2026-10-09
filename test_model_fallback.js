/**
 * test_model_fallback.js —— 模型降级链 / 熔断 / 超时细分 回归测试（2026-09-30 新增）
 *
 * 用一个本地假 LLM 服务验证：
 *   ① 主模型（GLM）失败 → 自动降级到 DeepSeek，任务整体仍成功
 *   ② 主模型连续失败到阈值 → 熔断冷却，之后不再白打主模型（请求数不再增长）
 *   ③ 冷却期内 getModelHealth() 能看到该模型 coolingDown
 *   ④ isTimeoutLikeError 对超时类错误的判定
 *   ⑤ 超时细分：短文在「超时重试」阈值下也能被拆成多批（这是修「短文也超时」的关键）
 *
 * 运行：node test_model_fallback.js
 */
const http = require('http');
const path = require('path');

let pass = 0, fail = 0;
function check(name, cond, extra) {
    if (cond) { pass++; console.log(`  PASS  ${name}`); }
    else { fail++; console.log(`  FAIL  ${name}${extra !== undefined ? ' | 实际: ' + extra : ''}`); }
}

const hits = { glm: 0, ds: 0 };

function startFakeLLM() {
    return new Promise(resolve => {
        const srv = http.createServer((req, res) => {
            let body = '';
            req.on('data', c => body += c);
            req.on('end', () => {
                let model = '';
                try { model = JSON.parse(body).model; } catch (e) {}
                if (String(model).indexOf('glm') !== -1) {
                    hits.glm++;
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'fake glm 500（模拟主模型故障）' }));
                    return;
                }
                hits.ds++;
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    choices: [{ message: { content: JSON.stringify({
                        sentenceList: [{ sentence: 'The cat sat on the mat.' }],
                        wordList: [{ word: 'cat', meaning: '猫', isAcademic: false, sentenceIndex: 0 }]
                    }) } }],
                    usage: {}
                }));
            });
        });
        srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
    });
}

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
    process.env.MODEL_HEALTH_FAIL_THRESHOLD = '2';
    process.env.MODEL_HEALTH_COOLDOWN_MS = '600000';

    const coze = require(path.join(__dirname, 'coze.js'));
    const article = 'The cat sat on the mat. It was very happy. ' + 'A quick brown fox jumps over the lazy dog. '.repeat(6);

    console.log('\n【①】主模型失败 → 降级到备用模型，任务仍成功');
    const r1 = await coze.analyzeWordsWithCoze(article, '测试', []);
    check('任务成功返回', !!r1 && Object.keys(r1.wordList || {}).length > 0, JSON.stringify(r1 && r1.wordList));
    check('主模型被调用过', hits.glm >= 1, hits.glm);
    check('备用模型被调用过（发生了降级）', hits.ds >= 1, hits.ds);
    const h1 = coze.getModelHealth()['glm-test-model'];
    check('主模型记了 1 次失败', h1 && h1.consecutiveFails === 1, JSON.stringify(h1));
    check('备用模型健康（失败数归零）', (coze.getModelHealth()['ds-test-model'] || {}).consecutiveFails === 0, JSON.stringify(coze.getModelHealth()['ds-test-model']));

    console.log('\n【②】主模型连续失败到阈值 → 熔断，冷却期内不再打它');
    await coze.analyzeWordsWithCoze(article, '测试', []);   // 第 2 次失败 → 触发熔断
    const glmHitsBefore = hits.glm;
    const h2 = coze.getModelHealth()['glm-test-model'];
    check('主模型已达阈值并进入冷却', h2 && h2.consecutiveFails >= 2, JSON.stringify(h2));
    check('冷却状态可见（coolingDown=true）', h2 && h2.coolingDown === true, JSON.stringify(h2));
    check('冷却剩余时间 > 0', h2 && h2.remainingMs > 0, JSON.stringify(h2));

    const r3 = await coze.analyzeWordsWithCoze(article, '测试', []);
    check('熔断后任务依旧成功（只用备用模型）', !!r3 && Object.keys(r3.wordList || {}).length > 0);
    check('冷却期内没有再请求主模型', hits.glm === glmHitsBefore, `熔断前 ${glmHitsBefore} → 之后 ${hits.glm}`);
    check('备用模型被正常调用', hits.ds >= 3, hits.ds);

    console.log('\n【③】手动复位模型熔断');
    coze.resetModelHealth();
    const afterReset = coze.getModelHealth();
    check('复位后没有任何模型处于冷却', Object.values(afterReset).every(h => !h.coolingDown), JSON.stringify(afterReset));
    check('复位后连续失败计数归零', Object.values(afterReset).every(h => h.consecutiveFails === 0), JSON.stringify(afterReset));
    check('降级链里的模型都被列出来（/health 可见）', Object.keys(afterReset).length >= 2, JSON.stringify(Object.keys(afterReset)));

    console.log('\n【④】超时类错误判定 + 超时细分（短文也要能拆）');
    const diag = coze.__diag || {};
    if (typeof diag.isTimeoutLikeError === 'function') {
        check('识别 timeout', diag.isTimeoutLikeError(new Error('request timeout')) === true);
        check('识别 ETIMEDOUT', diag.isTimeoutLikeError(new Error('connect ETIMEDOUT 1.2.3.4:443')) === true);
        check('识别 abort', diag.isTimeoutLikeError(new Error('The operation was aborted')) === true);
        check('识别中文「超时」', diag.isTimeoutLikeError(new Error('LLM API 请求超时')) === true);
        check('不把 4xx 当超时', diag.isTimeoutLikeError(new Error('LLM API 返回 401: unauthorized')) === false);
    } else {
        fail++; console.log('  FAIL  coze.__diag.isTimeoutLikeError 未导出');
    }
    if (typeof diag.splitArticleIntoChunks === 'function') {
        const single = diag.splitArticleIntoChunks(article, 50000);
        check('阈值足够大时不拆', single.length === 1, `批数=${single.length}`);
        const byChar = diag.splitArticleIntoChunks(article, 1200);
        console.log(`   （按 1200 字符拆：${byChar.length} 批；文章共 ${article.length} 字符）`);
        const forced = diag.forceSplitIntoChunks(article, 2);
        check('短文也能被「按句边界强制劈批」拆成 ≥2 批（短文超时的兜底）', forced.length >= 2, `批数=${forced.length}`);
        check('劈批不打碎句子（每批都以句末标点结束）',
            forced.every(c => /[.!?]$/.test(c.trim())), JSON.stringify(forced.map(c => c.slice(-12))));
        check('劈批后内容无丢失（拼起来含全部句子）',
            article.split(/\s+/).filter(Boolean).length === forced.join(' ').split(/\s+/).filter(Boolean).length,
            `${article.split(/\s+/).filter(Boolean).length} vs ${forced.join(' ').split(/\s+/).filter(Boolean).length}`);
    } else {
        fail++; console.log('  FAIL  coze.__diag.splitArticleIntoChunks 未导出');
    }

    srv.close();
    console.log(`\n结果：${pass} PASS / ${fail} FAIL`);
    process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('测试异常:', e); process.exit(1); });
