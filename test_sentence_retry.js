/**
 * test_sentence_retry.js - 「partial 文章重试句子翻译」回归测试（2026-10-07）
 *
 * 需求回顾：
 *   文章 status='partial' 时前端显示「⚠️ 句子翻译暂时不可用 [重试]」；
 *   点「重试」→ POST /api/retry-sentences/:articleId → **只重跑句子翻译**；
 *   成功 → status=completed；失败 → 保持 partial。
 *
 * 覆盖：
 *   【A】db.updateArticleSentences 契约：只动 sentences/status/sentences_error，
 *        **绝不碰 questions**（这是本功能最容易踩的坑：复用 updateArticleQuestions 会把题目清成 NULL）
 *   【B】queue.retrySentences 成功路径：coze 返回真译文 → status=completed + sentences_error 清空
 *   【C】queue.retrySentences 失败路径：coze reject → 保持 partial + 新原因写回
 *   【D】失败路径不得吞掉题目 / 正文（部分成功语义）
 *   【E】coze 返回 0 句 → 视为失败（不能又变成一次静默降级）
 *   【F】并发幂等：同一篇并发重试只打一次 Coze
 *   【G】HTTP：POST /api/retry-sentences/:id
 *        · 正常 → 202 + status=retrying，轮询后变 completed
 *        · 已有译文 → alreadyDone，且**不再调用 Coze**（省额度）
 *        · 整篇分析中（pending/processing）→ 409
 *        · 文章不存在 → 404
 *   【H】/api/article-status/:id 在 partial 时透出 sentencesRetrying
 *   【I】前端接线静态自检（DOM 按钮 / 重试函数 / 轮询分支 / 指纹）
 *
 * ⚠️ 在**临时副本**上跑（DATABASE_PATH 指向复制出来的 app.db），绝不碰 data/app.db。
 *    样本全部自造（qa_* 前缀），不依赖真库现状。
 *
 * 运行：node test_sentence_retry.js
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

let pass = 0, fail = 0;
function check(name, ok, extra) {
    if (ok) { pass++; console.log(`  PASS  ${name}`); }
    else { fail++; console.log(`  FAIL  ${name}${extra !== undefined ? ' | ' + JSON.stringify(extra) : ''}`); }
}

const SRC_DB = path.join(__dirname, 'data', 'app.db');
const TMP_DB = path.join(__dirname, 'data', `.app.test-retry-${process.pid}.db`);
const PORT = 49875;
const BASE = `http://127.0.0.1:${PORT}`;
const TAG = `qr${process.pid}`;

(async () => {
    console.log('========================================');
    console.log('🧪 partial 文章「重试句子翻译」回归测试（临时副本 + 自造样本）');

    if (!fs.existsSync(SRC_DB)) {
        console.log('  ⏭  未找到 data/app.db，跳过（首次运行？）');
        process.exit(0);
    }

    // WAL 有未落盘内容时 fs.copyFile 会拷出旧快照 → 必须用 backup API
    const src = new Database(SRC_DB, { readonly: true });
    await src.backup(TMP_DB);
    src.close();
    console.log(`🩺 已复制测试靶库 → ${path.basename(TMP_DB)}`);

    // ⚠️ 必须在 require('./db') / require('./server') 之前设置
    process.env.DATABASE_PATH = TMP_DB;
    process.env.ACCESS_PASSWORD = '';
    process.env.PORT = String(PORT);

    const dbOps = require('./db');
    const coze = require('./coze');
    const queue = require('./queue');
    require('./server');
    const db = dbOps.db;

    const cleanupTmp = () => {
        try { db.close(); } catch (_) {}
        for (const f of [TMP_DB, TMP_DB + '-wal', TMP_DB + '-shm']) {
            try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {}
        }
    };

    const get = async (p) => { const r = await fetch(BASE + p); return { status: r.status, body: await r.json() }; };
    const post = async (p, body) => {
        const r = await fetch(BASE + p, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body || {})
        });
        return { status: r.status, body: await r.json() };
    };
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    /** 轮询直到文章状态不再是「重试中」（或超时） */
    async function waitFinal(id, maxMs) {
        const t0 = Date.now();
        while (Date.now() - t0 < (maxMs || 8000)) {
            const st = await get(`/api/article-status/${id}`);
            if (st.body.status === 'completed' && (st.body.sentences || []).length > 0) return st.body;
            if (st.body.status === 'partial' && !st.body.sentencesRetrying) return st.body;
            await sleep(120);
        }
        return (await get(`/api/article-status/${id}`)).body;
    }

    const rowOf = (id) => db.prepare('SELECT status, sentences, questions, sentences_error FROM articles WHERE id = ?').get(id);

    try {
        for (let i = 0; i < 50; i++) {
            try { const r = await fetch(BASE + '/health'); if (r.ok) break; } catch (_) {}
            await sleep(100);
        }

        const userId = dbOps.getOrCreateUser(`qa-retry-user-${TAG}`).id;
        const QA_Q = JSON.stringify([{ id: 'qa-q1' }, { id: 'qa-q2' }, { id: 'qa-q3' }]);
        const QA_CONTENT = 'Retry me. This article lost its translations. Everything else is fine.';

        function seedPartial(id) {
            dbOps.insertArticle({
                id, user_id: userId, title: `QA retry ${id}`, content: QA_CONTENT,
                source: 'upload', status: 'pending'
            });
            // 模拟「单词/题目成功、句子翻译失败」的落库形态
            db.prepare(`UPDATE articles SET questions = ?, sentences = '[]', status = 'partial',
                        sentences_error = ? WHERE id = ?`).run(QA_Q, 'QA: 初次句子翻译失败', id);
        }

        // 打桩 Coze 句子工作流
        const origSentences = coze.analyzeSentencesWithCoze;
        let sentenceCalls = 0;
        let sentenceImpl = async () => ({ sentenceList: [] });

        coze.analyzeSentencesWithCoze = async function () {
            sentenceCalls++;
            return sentenceImpl.apply(this, arguments);
        };

        // ============================================================
        console.log('\n===== 【A】db.updateArticleSentences 契约（绝不碰 questions）=====');
        // ============================================================
        const artA = `qa_retry_a_${TAG}`;
        seedPartial(artA);

        const changed = dbOps.updateArticleSentences(artA, [{ sentence: 'Hi', translation: '你好' }], { status: 'completed', sentencesError: null });
        const rowA = rowOf(artA);
        check('A1 返回值 = 改动行数 1', changed === 1, changed);
        check('A2 sentences 被写入', rowA.sentences === JSON.stringify([{ sentence: 'Hi', translation: '你好' }]), rowA.sentences);
        check('A3 status 变 completed', rowA.status === 'completed', rowA.status);
        check('A4 sentences_error 被清空为 NULL', rowA.sentences_error === null, rowA.sentences_error);
        check('A5 ★ questions 原样保留（没被清成 NULL）', rowA.questions === QA_Q, rowA.questions);

        // 失败形态
        dbOps.updateArticleSentences(artA, [], { status: 'partial', sentencesError: 'QA: 又挂了' });
        const rowA2 = rowOf(artA);
        check('A6 失败形态：status=partial + 新原因落库', rowA2.status === 'partial' && rowA2.sentences_error === 'QA: 又挂了', rowA2);
        check('A7 ★ 失败形态下 questions 依旧保留', rowA2.questions === QA_Q, rowA2.questions);
        check('A8 默认 status 仍是 completed（老语义兼容）', (() => {
            dbOps.updateArticleSentences(artA, [{ sentence: 'x', translation: 'x' }]);
            return rowOf(artA).status === 'completed';
        })());

        // ============================================================
        console.log('\n===== 【B/C/D/E】queue.retrySentences =====');
        // ============================================================

        // ---- B 成功 ----
        const artB = `qa_retry_b_${TAG}`;
        seedPartial(artB);
        sentenceCalls = 0;
        sentenceImpl = async () => ({ sentenceList: [
            { sentence: 'Retry me.', translation: '重试我。' },
            { sentence: 'Everything else is fine.', translation: '其它一切正常。' }
        ] });
        const resB = await queue.retrySentences(artB);
        const rowB = rowOf(artB);
        check('B1 返回 ok=true / status=completed', resB.ok === true && resB.status === 'completed', { ok: resB.ok, s: resB.status });
        check('B2 返回 2 句译文', (resB.sentences || []).length === 2, (resB.sentences || []).length);
        check('B3 库里 status=completed', rowB.status === 'completed', rowB.status);
        check('B4 库里 sentences 是真译文', /重试我/.test(String(rowB.sentences)), rowB.sentences);
        check('B5 库里 sentences_error 已清空', rowB.sentences_error === null, rowB.sentences_error);
        check('B6 ★ 题目未被破坏', rowB.questions === QA_Q, rowB.questions);
        check('B7 只调了 1 次句子工作流（没重跑整篇）', sentenceCalls === 1, sentenceCalls);

        // ---- C 失败 ----
        const artC = `qa_retry_c_${TAG}`;
        seedPartial(artC);
        sentenceCalls = 0;
        sentenceImpl = async () => { throw new Error('QA: Coze 句子翻译 500'); };
        const resC = await queue.retrySentences(artC);
        const rowC = rowOf(artC);
        check('C1 返回 ok=false 且**仍是** partial', resC.ok === false && resC.status === 'partial', { ok: resC.ok, s: resC.status });
        check('C2 库里保持 partial', rowC.status === 'partial', rowC.status);
        check('C3 sentences_error 更新为**新的**失败原因', /QA: Coze 句子翻译 500/.test(String(rowC.sentences_error)), rowC.sentences_error);
        check('C4 ★ 题目依旧保留（失败不能连累题目）', rowC.questions === QA_Q, rowC.questions);
        check('C5 只调了 1 次句子工作流', sentenceCalls === 1, sentenceCalls);

        // ---- D 失败时不得破坏正文 ----
        const contentD = dbOps.getArticleById(artC).content;
        check('D1 失败后正文未被改动', contentD === QA_CONTENT, String(contentD).slice(0, 40));

        // ---- E 返回 0 句 = 失败（不许又变成静默降级）----
        const artE = `qa_retry_e_${TAG}`;
        seedPartial(artE);
        sentenceImpl = async () => ({ sentenceList: [] });
        const resE = await queue.retrySentences(artE);
        const rowE = rowOf(artE);
        check('E1 返回 0 句 → ok=false', resE.ok === false, resE.ok);
        check('E2 返回 0 句 → 仍是 partial（不能标 completed）', rowE.status === 'partial', rowE.status);
        check('E3 返回 0 句 → 原因写明「0 句」', /0 句/.test(String(rowE.sentences_error)), rowE.sentences_error);

        // ============================================================
        console.log('\n===== 【F】并发幂等：只打一次 Coze =====');
        // ============================================================
        const artF = `qa_retry_f_${TAG}`;
        seedPartial(artF);
        sentenceCalls = 0;
        sentenceImpl = async () => {
            await sleep(250);   // 模拟慢工作流，制造并发窗口
            return { sentenceList: [{ sentence: 'Retry me.', translation: '重试我。' }] };
        };
        const [f1, f2, f3] = await Promise.all([
            queue.retrySentences(artF), queue.retrySentences(artF), queue.retrySentences(artF)
        ]);
        check('F1 三次并发调用只打了 1 次 Coze（省额度）', sentenceCalls === 1, sentenceCalls);
        check('F2 三个调用都拿到成功结果', f1.ok && f2.ok && f3.ok, [f1.ok, f2.ok, f3.ok]);
        check('F3 结束后重试表已清空（可再次重试）', queue.isRetryingSentences(artF) === false);

        // ============================================================
        console.log('\n===== 【G】HTTP POST /api/retry-sentences/:id =====');
        // ============================================================
        const artG = `qa_retry_g_${TAG}`;
        seedPartial(artG);
        sentenceCalls = 0;
        sentenceImpl = async () => {
            await sleep(200);
            return { sentenceList: [{ sentence: 'Retry me.', translation: '重试我。' }, { sentence: 'Everything else is fine.', translation: '其它一切正常。' }] };
        };

        const g1 = await post(`/api/retry-sentences/${artG}`, {});
        check('G1 正常重试 → HTTP 202', g1.status === 202, { code: g1.status, body: g1.body });
        check('G2 响应 status=retrying', g1.body.status === 'retrying', g1.body.status);
        check('G3 立即返回期间文章仍是 partial（DB 不在中途乱改状态）', rowOf(artG).status === 'partial', rowOf(artG).status);

        const gFinal = await waitFinal(artG, 8000);
        check('G4 轮询后 status=completed', gFinal.status === 'completed', gFinal.status);
        check('G5 轮询后拿到 2 句译文', (gFinal.sentences || []).length === 2, (gFinal.sentences || []).length);
        check('G6 只打了 1 次 Coze', sentenceCalls === 1, sentenceCalls);
        check('G7 ★ 题目没被重试弄丢', rowOf(artG).questions === QA_Q, rowOf(artG).questions);

        // 幂等：已经是 completed 且有译文 → alreadyDone，且不再调 Coze
        sentenceCalls = 0;
        const g2 = await post(`/api/retry-sentences/${artG}`, {});
        check('G8 已有译文 → HTTP 200 + alreadyDone', g2.status === 200 && g2.body.alreadyDone === true, { code: g2.status, b: g2.body });
        check('G9 已有译文 → **不再调用 Coze**（省额度）', sentenceCalls === 0, sentenceCalls);

        // 整篇分析中 → 409
        const artG2 = `qa_retry_g2_${TAG}`;
        dbOps.insertArticle({ id: artG2, user_id: userId, title: `QA processing ${TAG}`, content: QA_CONTENT, source: 'upload', status: 'processing' });
        const g3 = await post(`/api/retry-sentences/${artG2}`, {});
        check('G10 status=processing → HTTP 409（拒绝并发插一脚）', g3.status === 409, { code: g3.status, b: g3.body });
        check('G11 processing 文章的状态未被本次请求改动', rowOf(artG2).status === 'processing', rowOf(artG2).status);

        // 不存在 → 404
        const g4 = await post(`/api/retry-sentences/qa_not_exist_${TAG}`, {});
        check('G12 文章不存在 → HTTP 404', g4.status === 404, g4.status);

        // 失败重试走 HTTP：保持 partial
        const artG3 = `qa_retry_g3_${TAG}`;
        seedPartial(artG3);
        sentenceImpl = async () => { throw new Error('QA: HTTP 重试失败'); };
        const g5 = await post(`/api/retry-sentences/${artG3}`, {});
        check('G13 失败重试仍返回 202（异步）', g5.status === 202, g5.status);
        const g3Final = await waitFinal(artG3, 8000);
        check('G14 失败重试后仍是 partial', g3Final.status === 'partial', g3Final.status);
        check('G15 失败原因已更新', /QA: HTTP 重试失败/.test(String(g3Final.sentencesError)), g3Final.sentencesError);
        check('G16 失败后题目仍在', rowOf(artG3).questions === QA_Q, rowOf(artG3).questions);

        // ============================================================
        console.log('\n===== 【H】/api/article-status 透出 sentencesRetrying =====');
        // ============================================================
        const artH = `qa_retry_h_${TAG}`;
        seedPartial(artH);
        sentenceImpl = async () => { await sleep(600); return { sentenceList: [{ sentence: 'Retry me.', translation: '重试我。' }] }; };
        const h0 = await post(`/api/retry-sentences/${artH}`, {});
        check('H1 启动重试 → 202', h0.status === 202, h0.status);
        const hMid = await get(`/api/article-status/${artH}`);
        check('H2 重试中：status 仍是 partial', hMid.body.status === 'partial', hMid.body.status);
        check('H3 重试中：sentencesRetrying=true（前端据此继续等）', hMid.body.sentencesRetrying === true, hMid.body.sentencesRetrying);
        check('H4 queue.isRetryingSentences 同步为 true', queue.isRetryingSentences(artH) === true);
        await waitFinal(artH, 8000);
        const hEnd = await get(`/api/article-status/${artH}`);
        check('H5 结束后 status=completed', hEnd.body.status === 'completed', hEnd.body.status);
        check('H6 结束后 queue.isRetryingSentences=false', queue.isRetryingSentences(artH) === false);

        // completed 分支也带 sentencesRetrying=false（前端可无条件读）
        check('H7 completed 响应也带 sentencesRetrying=false', hEnd.body.sentencesRetrying === false, hEnd.body.sentencesRetrying);

        coze.analyzeSentencesWithCoze = origSentences;

        // ============================================================
        console.log('\n===== 【I】前端接线静态自检 =====');
        // ============================================================
        const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
        const js = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
        const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
        const qjs = fs.readFileSync(path.join(__dirname, 'queue.js'), 'utf8');

        check('I1 index.html 有重试按钮节点 #sentenceRetryBtn', /id="sentenceRetryBtn"/.test(html));
        check('I2 按钮绑定 retrySentenceTranslation()', /onclick="retrySentenceTranslation\(\)"/.test(html));
        check('I3 app.js 定义 retrySentenceTranslation', /function retrySentenceTranslation/.test(js));
        check('I4 app.js 定义 pollSentenceRetry（202 异步 → 靠轮询收结果）', /function pollSentenceRetry/.test(js));
        check('I5 app.js 重试轮询区分 sentencesRetrying（否则分不清「还在跑」和「又失败」）', /sentencesRetrying/.test(js));
        check('I6 app.js 调用重试接口路径正确', /\/api\/retry-sentences\//.test(js));
        check('I7 app.js 成功后会重绘正文让译文挂上去', /renderArticleWithTranslations\(\)/.test(js));
        check('I8 server.js 有 POST /api/retry-sentences/:id 路由', /app\.post\('\/api\/retry-sentences\/:id'/.test(srv));
        check('I9 server.js 重试用 202（异步）+ 409（分析中）', /status\(202\)/.test(srv) && /status\(409\)/.test(srv));
        check('I10 queue.js 导出 retrySentences / startSentenceRetry / isRetryingSentences',
            /retrySentences/.test(qjs) && /startSentenceRetry/.test(qjs) && /isRetryingSentences/.test(qjs));
        check('I11 queue.js 只调 analyzeSentencesWithCoze（不重跑 word/quiz）',
            /const res = await coze\.analyzeSentencesWithCoze\(article\.content, article\.title\)/.test(qjs));
        check('I12 index.html 指纹已更新', /app\.js\?v=\d{8}_\d+/.test(html));

        console.log('\n========================================');
        console.log(`🏁 结果：${pass} PASS / ${fail} FAIL`);
    } catch (e) {
        console.error('❌ 测试未预期异常：', e && e.stack ? e.stack : e);
        fail++;
    } finally {
        cleanupTmp();
        console.log('🧹 已清理临时靶库');
    }

    process.exit(fail === 0 ? 0 : 1);
})();
