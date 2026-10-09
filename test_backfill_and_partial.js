/**
 * test_backfill_and_partial.js - 本轮两项改动的回归测试
 *
 * 覆盖：
 *   【点 1】user_words 占位释义一次性回填
 *     · 取值优先级：dictionary 优先 → word_context → 都没有写**空串**（不写「暂无释义」）
 *     · 已有真释义的行**绝不覆盖**
 *     · dryRun 不写库；apply 后占位清零；再跑一次 changed=0（幂等）
 *     · report 数字与库里真实变化一致
 *   【点 2】句子翻译失败不再静默降级
 *     · updateArticleQuestions 支持 status='partial' + sentences_error；默认仍是 completed
 *     · queue.processArticle 在句子翻译 reject 时落 status='partial'，并把原因写进 sentences_error
 *     · 三个工作流全失败仍走 failed 路径（抛出 fatal 错误，不被 partial 逻辑吞掉）
 *     · 接口能透出：/api/article-status/:id 返回 partial + sentencesFailed + sentencesError；
 *       /api/article/:id、/api/articles 带 sentencesError
 *
 * ⚠️ 在**临时副本**上跑（DATABASE_PATH 指向复制出来的 app.db），绝不碰 data/app.db。
 *    样本**自己造**，不依赖真库"恰好有多少条占位释义"。
 *
 * 运行：node test_backfill_and_partial.js
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
const TMP_DB = path.join(__dirname, 'data', `.app.test-backfill-${process.pid}.db`);
const PORT = 49874;
const BASE = `http://127.0.0.1:${PORT}`;
const TAG = `qa${process.pid}`;

(async () => {
    console.log('========================================');
    console.log('🧪 占位释义回填 + 文章 partial 状态 回归测试（临时副本 + 自造样本）');

    if (!fs.existsSync(SRC_DB)) {
        console.log('  ⏭  未找到 data/app.db，跳过（首次运行？）');
        process.exit(0);
    }

    // ---------- 复制真库当靶子（WAL 有未落盘内容时 fs.copyFile 会拷出旧快照 → 用 backup API）----------
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

    try {
        // 等待服务起来
        for (let i = 0; i < 50; i++) {
            try { const r = await fetch(BASE + '/health'); if (r.ok) break; } catch (_) {}
            await new Promise(res => setTimeout(res, 100));
        }

        // ============================================================
        console.log('\n===== 【点 1】user_words 占位释义回填 =====');
        // ============================================================

        const userId = dbOps.getOrCreateUser(`qa-backfill-user-${TAG}`).id;

        // ---- 自造样本 ----
        // ① 词典有、语境库没有：挑一个 ECDICT 确定收录的常用词
        const dictWord = 'beautiful';
        const dictEntry = dbOps.getDictionaryEntry(dictWord);
        const expectedDict = (dictEntry && dictEntry.translationLines[0]) || null;

        // ② 只有语境库有：现造一个「词典查不到」的假词 + 专属语境，再写一条 word_context
        const ctxWord = `zqxctx${TAG}`;
        const ctxSentence = `QA context sentence for ${ctxWord} (${Date.now()}).`;
        dbOps.saveWordContext(ctxWord, ctxSentence, '语境释义QA（仅语境库有）', 'n.', null);

        // ③ 两层都没有
        const nowhereWord = `zqxnohit${TAG}`;

        // ④ 已有真释义：绝不能被覆盖
        const keepWord = `zqxkeep${TAG}`;
        const KEEP_DEF = '真释义QA（必须原样保留）';

        const seed = [
            { id: 's1', word: dictWord, definition: '暂无释义', sentence: 'She is beautiful.' },
            { id: 's2', word: ctxWord, definition: '暂无释义', sentence: ctxSentence },
            { id: 's3', word: nowhereWord, definition: '暂无释义', sentence: `Nobody knows ${nowhereWord}.` },
            { id: 's4', word: keepWord, definition: KEEP_DEF, sentence: `Keep ${keepWord} intact.` }
        ];
        const ins = db.prepare(`INSERT INTO user_words
            (user_id, word, definition, sentence, article_id, paragraph_index, sentence_index, status, knowledge, collected_at)
            VALUES (?, ?, ?, ?, NULL, 0, 0, 'pending', 0, datetime('now'))`);
        const sampleIds = {};
        for (const s of seed) sampleIds[s.id] = ins.run(userId, s.word, s.definition, s.sentence).lastInsertRowid;

        const defOf = (id) => db.prepare('SELECT definition FROM user_words WHERE id = ?').get(id).definition;
        const allDefs = () => db.prepare('SELECT definition FROM user_words').all()
            .map(r => String(r.definition == null ? '' : r.definition).trim());
        /** 字面量占位（「暂无释义」这类脏数据）——回填后必须清零 */
        const literalCount = () => allDefs().filter(d => ['暂无释义', '释义补全中', '释义补全中…'].indexOf(d) >= 0).length;
        /** 空串 —— 允许作为「两层都查不到」的终态 */
        const emptyCount = () => allDefs().filter(d => d === '').length;

        console.log(`  · 样本：词典词=${dictWord}（期望「${expectedDict}」）| 仅语境库=${ctxWord} | 两层无=${nowhereWord} | 真释义=${keepWord}`);
        check('词典层样本可用（ECDICT 有 beautiful 的中文义项）', !!expectedDict, dictEntry ? dictEntry.translationLines : null);

        const phBefore = literalCount();
        const emptyBefore = emptyCount();
        const totalBefore = db.prepare('SELECT COUNT(*) c FROM user_words').get().c;

        // ---- dryRun：不写库 ----
        const dry = dbOps.backfillUserWordDefinitions({ dryRun: true, log: false });
        check('dryRun：占位释义数量不变', literalCount() === phBefore, { before: phBefore, after: literalCount() });
        check('dryRun：样本行未被改写', defOf(sampleIds.s1) === '暂无释义', defOf(sampleIds.s1));
        check('dryRun：report.dryRun = true', dry.dryRun === true);
        check('dryRun：仍然算出了计划（changed > 0）', dry.changed > 0, dry.changed);

        // ---- apply ----
        const rep = dbOps.backfillUserWordDefinitions({ dryRun: false, log: true });

        check('apply：词典层命中的行写入真释义', defOf(sampleIds.s1) === expectedDict, { got: defOf(sampleIds.s1), want: expectedDict });
        check('apply：仅语境库有的行写入语境释义', defOf(sampleIds.s2) === '语境释义QA（仅语境库有）', defOf(sampleIds.s2));
        check('apply：两层都查不到 → 写空串', String(defOf(sampleIds.s3)) === '', JSON.stringify(defOf(sampleIds.s3)));
        check('apply：查不到时不写「暂无释义」', defOf(sampleIds.s3) !== '暂无释义', defOf(sampleIds.s3));
        check('apply：已有真释义的行**未被覆盖**', defOf(sampleIds.s4) === KEEP_DEF, defOf(sampleIds.s4));
        check('apply：全表字面量占位清零（不再有「暂无释义」）', literalCount() === 0, literalCount());
        check('apply：两层都查不到的样本成为空串，成为终态', emptyCount() >= emptyBefore + 1, { before: emptyBefore, after: emptyCount() });
        check('apply：没有任何 definition 仍是「暂无释义」',
            db.prepare("SELECT COUNT(*) c FROM user_words WHERE definition = '暂无释义'").get().c === 0);
        check('apply：收藏行数未增删（只改 definition）',
            db.prepare('SELECT COUNT(*) c FROM user_words').get().c === totalBefore,
            { before: totalBefore, after: db.prepare('SELECT COUNT(*) c FROM user_words').get().c });

        // ---- report 一致性 ----
        check('report：filled = 词典命中 + 语境库命中',
            rep.filled === rep.filledFromDictionary + rep.filledFromContext,
            { filled: rep.filled, d: rep.filledFromDictionary, c: rep.filledFromContext });
        check('report：词典层至少命中 1 条（我们的样本 s1）', rep.filledFromDictionary >= 1, rep.filledFromDictionary);
        check('report：语境库至少命中 1 条（我们的样本 s2）', rep.filledFromContext >= 1, rep.filledFromContext);
        check('report：cleared 至少 1 条（我们的样本 s3）', rep.cleared >= 1, rep.cleared);
        check('report：candidates = 字面量占位 + 原本就空的行',
            rep.candidates === phBefore + emptyBefore,
            { candidates: rep.candidates, phBefore, emptyBefore });
        check('report：alreadyEmpty 与实际相符', rep.alreadyEmpty === emptyBefore, { reported: rep.alreadyEmpty, actual: emptyBefore });
        check('report：changed ≤ candidates（本来就空的行会被跳过）', rep.changed <= rep.candidates, { changed: rep.changed, candidates: rep.candidates });
        check('report：details 逐条给出 before→after 与来源',
            Array.isArray(rep.details) && rep.details.length === rep.candidates
            && rep.details.every(d => 'before' in d && 'after' in d && 'source' in d),
            rep.details && rep.details.length);

        // ---- 幂等 ----
        const rep2 = dbOps.backfillUserWordDefinitions({ dryRun: false, log: false });
        check('幂等：再跑一次 changed=0、filled=0（空串终态不会被反复改写）',
            rep2.changed === 0 && rep2.filled === 0, { changed: rep2.changed, filled: rep2.filled });
        check('幂等：词典样本释义保持不变', defOf(sampleIds.s1) === expectedDict, defOf(sampleIds.s1));

        // ============================================================
        console.log('\n===== 【点 2】句子翻译失败 → status=partial =====');
        // ============================================================

        // ---- 2.1 dbOps.updateArticleQuestions 的契约 ----
        const qaArt = `qa_partial_${TAG}`;
        dbOps.insertArticle({ id: qaArt, user_id: userId, title: `QA partial article ${TAG}`, content: 'QA content for partial status.', source: 'upload', status: 'pending' });

        dbOps.updateArticleQuestions(qaArt, [{ q: 1 }], [], { status: 'partial', sentencesError: 'QA: 句子翻译工作流超时' });
        const row1 = db.prepare('SELECT status, sentences, sentences_error FROM articles WHERE id = ?').get(qaArt);
        check('updateArticleQuestions(opts)：status 落 partial', row1.status === 'partial', row1.status);
        check('updateArticleQuestions(opts)：sentences 落空数组 []', row1.sentences === '[]', row1.sentences);
        check('updateArticleQuestions(opts)：sentences_error 落在库里', row1.sentences_error === 'QA: 句子翻译工作流超时', row1.sentences_error);

        // 默认行为不变（不传 opts → completed）
        const qaArt2 = `qa_completed_${TAG}`;
        dbOps.insertArticle({ id: qaArt2, user_id: userId, title: `QA completed article ${TAG}`, content: 'QA content for completed status.', source: 'upload', status: 'pending' });
        dbOps.updateArticleQuestions(qaArt2, [{ q: 2 }], [{ sentence: 'Hi', translation: '你好' }]);
        const row2 = db.prepare('SELECT status, sentences_error FROM articles WHERE id = ?').get(qaArt2);
        check('updateArticleQuestions 默认仍是 completed（老调用方不受影响）', row2.status === 'completed', row2.status);
        check('updateArticleQuestions 默认 sentences_error 为 NULL', row2.sentences_error === null, row2.sentences_error);

        // 重新成功 → 错误原因必须被清掉
        dbOps.updateArticleQuestions(qaArt, [{ q: 1 }], [{ sentence: 'Hi', translation: '你好' }], { status: 'completed', sentencesError: null });
        const row1b = db.prepare('SELECT status, sentences_error FROM articles WHERE id = ?').get(qaArt);
        check('重新成功时：status 回 completed 且 sentences_error 被清空', row1b.status === 'completed' && row1b.sentences_error === null, row1b);
        // 复原成 partial 供后面的接口断言用
        dbOps.updateArticleQuestions(qaArt, [{ q: 1 }], [], { status: 'partial', sentencesError: 'QA: 句子翻译工作流超时' });

        // ---- 2.2 queue.processArticle 端到端（打桩 Coze，不联网）----
        const origSentences = coze.analyzeSentencesWithCoze;
        const origWords = coze.analyzeWordsWithCoze;
        const origQuiz = coze.generateQuestionsWithCoze;

        const qaQueueArt = `qa_queue_${TAG}`;
        dbOps.insertArticle({ id: qaQueueArt, user_id: userId, title: `QA queue article ${TAG}`, content: 'The quick brown fox jumps over the lazy dog.', source: 'upload', status: 'pending' });

        // 只有句子翻译失败
        coze.analyzeSentencesWithCoze = async () => { throw new Error('QA: Coze 句子翻译 500'); };
        coze.analyzeWordsWithCoze = async () => ({ wordList: { quick: '快的' }, rawWordList: [] });
        coze.generateQuestionsWithCoze = async () => ({ questions: [{ id: 'q1' }] });

        const res = await queue.processArticle({ articleId: qaQueueArt, content: 'The quick brown fox jumps over the lazy dog.', userId, title: 'QA' });
        const qRow = db.prepare('SELECT status, sentences, questions, sentences_error FROM articles WHERE id = ?').get(qaQueueArt);
        check('processArticle：返回 status=partial', res && res.status === 'partial', res && res.status);
        check('processArticle：库里 status=partial（不再是静默 completed）', qRow.status === 'partial', qRow.status);
        check('processArticle：sentences_error 记录了失败原因', /QA: Coze 句子翻译 500/.test(String(qRow.sentences_error)), qRow.sentences_error);
        check('processArticle：sentences 落空数组', qRow.sentences === '[]', qRow.sentences);
        check('processArticle：题目仍然保留（部分成功，不是整篇失败）', JSON.parse(qRow.questions || '[]').length === 1, qRow.questions);
        check('processArticle：内存任务表标记 sentencesFailed', (() => {
            const t = queue.getQueueStatus(qaQueueArt);
            return !!t && t.sentencesFailed === true && /QA:/.test(String(t.sentencesError));
        })(), queue.getQueueStatus(qaQueueArt));

        // 三个工作流全失败：仍必须是 failed 路径（不能被 partial 逻辑吞掉）
        const qaAllFailArt = `qa_allfail_${TAG}`;
        dbOps.insertArticle({ id: qaAllFailArt, user_id: userId, title: `QA allfail ${TAG}`, content: 'QA allfail content here.', source: 'upload', status: 'pending' });
        coze.analyzeSentencesWithCoze = async () => { throw new Error('code=4028 额度不足'); };
        coze.analyzeWordsWithCoze = async () => { throw new Error('code=4028 额度不足'); };
        coze.generateQuestionsWithCoze = async () => { throw new Error('code=4028 额度不足'); };
        let threw = null;
        try { await queue.processArticle({ articleId: qaAllFailArt, content: 'QA allfail content here.', userId, title: 'QA' }); }
        catch (e) { threw = e; }
        const afRow = db.prepare('SELECT status FROM articles WHERE id = ?').get(qaAllFailArt);
        check('三工作流全失败 → processArticle 抛出（交给 processWithRetry 标 failed）', !!threw, threw && threw.message);
        check('三工作流全失败 → 错误被识别为 fatal（不重试，前端切基础模式）', !!(threw && threw.fatal === true), threw && threw.fatal);
        check('三工作流全失败 → 未被误标 partial/completed', afRow.status === 'processing', afRow.status);

        // 还原打桩，避免影响后续（本进程内无其它调用）
        coze.analyzeSentencesWithCoze = origSentences;
        coze.analyzeWordsWithCoze = origWords;
        coze.generateQuestionsWithCoze = origQuiz;

        // ---- 2.3 接口层透出 ----
        const st = await get(`/api/article-status/${qaArt}`);
        check('/api/article-status：partial 文章返回 status=partial（不再落进 processing 分支）', st.body.status === 'partial', st.body.status);
        check('/api/article-status：带 partial / sentencesFailed 标记', st.body.partial === true && st.body.sentencesFailed === true, { p: st.body.partial, f: st.body.sentencesFailed });
        check('/api/article-status：带 sentencesError 文案', /QA: 句子翻译工作流超时/.test(String(st.body.sentencesError)), st.body.sentencesError);
        check('/api/article-status：题目仍返回（用户能正常做题）', Array.isArray(st.body.questions) && st.body.questions.length === 1, st.body.questions);

        const detail = await get(`/api/article/${qaArt}`);
        check('/api/article/:id：透出 sentencesError', /QA: 句子翻译工作流超时/.test(String(detail.body.sentencesError)), detail.body.sentencesError);
        check('/api/article/:id：hasSentences=false', detail.body.hasSentences === false, detail.body.hasSentences);
        check('/api/article/:id：status=partial', detail.body.status === 'partial', detail.body.status);

        const list = await get('/api/articles?page=1&pageSize=50&withContent=0');
        const item = (list.body.items || []).find(i => i.id === qaArt);
        check('/api/articles：列表带上 partial 文章', !!item, (list.body.items || []).map(i => i.id).slice(0, 5));
        check('/api/articles：列表项带 status=partial 与 sentencesError', !!item && item.status === 'partial' && /QA:/.test(String(item.sentencesError)), item && { s: item.status, e: item.sentencesError });

        // completed 文章不应带 sentencesError
        const listOk = (list.body.items || []).find(i => i.id === qaArt2);
        check('/api/articles：completed 文章不带 sentencesError', !!listOk && !listOk.sentencesError, listOk && listOk.sentencesError);

        // ---- 2.4 前端接线（静态）：DOM 节点 / 提示函数 / 轮询分支缺一不可 ----
        console.log('\n  · 前端接线自检（静态）：');
        const fsx = require('fs');
        const html = fsx.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
        const js = fsx.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
        const srv = fsx.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

        check('index.html 有 #sentenceFailNotice 节点 + 文案节点', /id="sentenceFailNotice"/.test(html) && /id="sentenceFailNoticeText"/.test(html));
        check('index.html 引用的 app.js 指纹已更新（bust 浏览器缓存）', /app\.js\?v=\d{8}_\d+/.test(html));
        check('app.js 定义 showSentenceFailedNotice / syncSentenceFailedNotice', /function showSentenceFailedNotice/.test(js) && /function syncSentenceFailedNotice/.test(js));
        // 2026-10-08 重构：completed/partial/failed 三种终态收敛到 applyTerminalStatus 一处回填
        //（原来 partial 是轮询里的独立分支；抽出来后 shared 一份，避免「只有一条路会被回填」的老毛病）
        check('app.js 有「终态」统一回填入口 applyTerminalStatus（completed/partial/failed 一次落库）',
            /function applyTerminalStatus/.test(js)
            && /st !== 'completed' && st !== 'partial' && st !== 'failed'/.test(js)
            && /st === 'partial'/.test(js));
        check('app.js 轮询在终态后仍可能转后台补拉（不会在题目就绪时提前收工）',
            /quiet = true/.test(js) && /backfillArticleUntilTerminal/.test(js)
            && /阶段=\$\{quiet \? '后台补拉' : '等待题目'\}/.test(js));
        check('app.js renderArticle 会同步提示条（切文章时重判）', /syncSentenceFailedNotice\(\);\s*\n\s*const fbNotice/.test(js));
        check('app.js 详情/列表映射透传 sentencesError', /sentencesError: a\.sentencesError/.test(js) && /sentencesError: d\.sentencesError/.test(js));
        check('server.js 有 partial 分支（不能只改 queue.js）', /article\.status === 'partial'/.test(srv));
        check('server.js 已移除「写死 completed」的错觉 —— 详情接口透出 sentencesError', /sentencesError: article\.sentences_error/.test(srv));

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
