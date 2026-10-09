/**
 * test_article_cleanup.js - 文章去重清理的回归测试
 *
 * 这是**破坏性逻辑**（会删文章、会改收藏的 article_id），所以要在**临时副本**上跑真实删除，
 * 绝不碰 data/app.db。db.js 支持 `DATABASE_PATH` 环境变量 → 复制一份 app.db 当靶子，
 * require('./db') 之前先把 DATABASE_PATH 指过去。
 *
 * ⚠️ 测试**自己造样本**，不依赖真库"恰好有重复"。
 *    （2026-10-06 第一次清完后真库已零重复，依赖真库数据的写法当场失效 —— 这是教训。）
 *
 * 核心断言（对应「收藏一条不丢」这个承诺）：
 *   ① 只删该删的：命中的重复被删，仅「前缀/后缀不同」的文章必须原样保留
 *   ② 预置文章（source='preset'）数量不变，且能被选为「保留」、其重复项被删
 *   ③ 保留规则：有译文优先于"更新但无译文"；全组无译文时保留最新
 *   ④ 没有悬空 article_id（user_words / word_context 都没有）
 *   ⑤ **收藏「内容」零丢失**：DISTINCT(user_id, word, sentence) 的数量前后完全相等
 *      （改挂不动这个三元组；合并删掉的是一条完全相同的三元组）
 *   ⑥ 撞唯一键时按「进度深 > 释义实 > 收藏早」合并，合并后不丢释义、不降级
 *   ⑦ 幂等：再跑一次删 0 篇；演练模式（dryRun）不改库
 *
 * 运行：node test_article_cleanup.js
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
const TMP_DB = path.join(__dirname, 'data', `.app.test-cleanup-${process.pid}.db`);

(async () => {
    console.log('========================================');
    console.log('🧪 文章去重清理回归测试（临时副本 + 自造样本，真实执行删除）');

    if (!fs.existsSync(SRC_DB)) {
        console.log('  ⏭  未找到 data/app.db，跳过（首次运行？）');
        process.exit(0);
    }

    // ---------- 复制一份真库当靶子（SQLite backup：WAL 有未落盘内容时 fs.copyFile 会拷出旧快照）----------
    const src = new Database(SRC_DB, { readonly: true });
    await src.backup(TMP_DB);
    src.close();
    console.log(`🩺 已复制测试靶库 → ${path.basename(TMP_DB)}`);

    // ⚠️ 必须在 require('./db') 之前设置
    process.env.DATABASE_PATH = TMP_DB;
    const dbOps = require('./db');
    const db = dbOps.db;

    const cleanupTmp = () => {
        for (const f of [TMP_DB, TMP_DB + '-wal', TMP_DB + '-shm']) {
            try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {}
        }
    };
    process.on('exit', cleanupTmp);

    try {
        // ================= ①②③ 纯函数单测 =================
        console.log('\n【① 标题归一化 normalizeArticleTitleKey】');
        check('去首尾空白 + 压连续空白',
            dbOps.normalizeArticleTitleKey('  A   B  ') === 'a b',
            dbOps.normalizeArticleTitleKey('  A   B  '));
        check('弯撇号 ’ 与直引号 \' 视为同一标题',
            dbOps.normalizeArticleTitleKey('Angel Clare’s') === dbOps.normalizeArticleTitleKey("Angel Clare's"),
            [dbOps.normalizeArticleTitleKey('Angel Clare’s'), dbOps.normalizeArticleTitleKey("Angel Clare's")]);
        check('大小写不敏感',
            dbOps.normalizeArticleTitleKey('TESS') === dbOps.normalizeArticleTitleKey('tess'));
        check('❗不做前缀匹配：`...in Tess` 与 `...in Tess of` 必须算两篇',
            dbOps.normalizeArticleTitleKey('Analysis in Tess') !== dbOps.normalizeArticleTitleKey('Analysis in Tess of'));
        check('空/ null 标题 → 空键（不参与分组）',
            dbOps.normalizeArticleTitleKey(null) === '' && dbOps.normalizeArticleTitleKey('   ') === '');

        console.log('\n【② 保留取舍 compareArticleForKeep】');
        const mk = (o) => Object.assign({ id: 'x', title: 't', source: 'upload', sentences: [], created_at: '2026-01-01 00:00:00', updated_at: '2026-01-01 00:00:00' }, o);
        const withTrans = mk({ id: 'a', sentences: [{ translation: '译' }] });
        const noTrans = mk({ id: 'b', updated_at: '2026-09-01 00:00:00' });   // 更新但没译文
        check('❗有译文优先于「更新但无译文」',
            dbOps.compareArticleForKeep(withTrans, noTrans) < 0);
        check('都有译文时 → updated_at 新的优先',
            dbOps.compareArticleForKeep(mk({ id: 'new', updated_at: '2026-09-02 00:00:00' }), mk({ id: 'old', updated_at: '2026-09-01 00:00:00' })) < 0);
        check('预置文章优先于上传文章（红线：预置不可被顶掉）',
            dbOps.compareArticleForKeep(mk({ id: 'p', source: 'preset' }), mk({ id: 'u', sentences: [{ translation: '译' }] })) < 0);
        check('articleHasTranslation 兼容 zh / chinese / cn 字段',
            dbOps.articleHasTranslation({ sentences: [{ zh: '中' }] }) &&
            dbOps.articleHasTranslation({ sentences: [{ chinese: '中' }] }) &&
            dbOps.articleHasTranslation({ sentences: [{ cn: '中' }] }));
        check('articleHasTranslation：空数组 / null / 坏 JSON 一律算没有',
            !dbOps.articleHasTranslation({ sentences: [] }) &&
            !dbOps.articleHasTranslation({ sentences: null }) &&
            !dbOps.articleHasTranslation({ sentences: '{坏的' }));

        console.log('\n【③ 收藏合并取舍 pickUserWordWinner】');
        const fw = (o) => Object.assign({ id: 1, user_id: 1, word: 'w', definition: '暂无释义', status: 'pending', knowledge: 0, collected_at: '2026-01-02T00:00:00Z' }, o);
        check('❗学习进度深的胜出（mastered 不能被打回 pending）',
            dbOps.pickUserWordWinner(fw({ id: 1, status: 'pending' }), fw({ id: 2, status: 'mastered' })).id === 2);
        check('状态并列 → 释义更实的胜出',
            dbOps.pickUserWordWinner(fw({ id: 1, definition: '暂无释义' }), fw({ id: 2, definition: 'adj. 小的' })).id === 2);
        check('状态与释义都并列 → 收藏更早的胜出',
            dbOps.pickUserWordWinner(fw({ id: 1, collected_at: '2026-01-05T00:00:00Z' }), fw({ id: 2, collected_at: '2026-01-01T00:00:00Z' })).id === 2);

        // ================= ④ 造样本 =================
        console.log('\n【④ 自造样本并真实执行清理】');

        // 靶库基线：**先量一次「真实数据里本来就有多少重复」**再插样本。
        // 为什么必须这么做（2026-10-07 踩到）：早先这里写死 EXPECT_DELETED=4，一旦真实库里
        // 多出一组同名文章（例如用户测试时又上传了一篇标题同为「用户上传文章」的文章），
        // 清理就会多删 1 篇，测试立刻变红 —— 但被测代码其实完全正确。
        // 断言必须只对「自造样本」负责，不能替真实数据的状态背书。
        const baseReport = dbOps.cleanupDuplicateArticles({ dryRun: true, log: false });
        const BASE_DELETED = baseReport.deleted;
        if (BASE_DELETED > 0) {
            console.log(`🩺 靶库真实数据里本来就有 ${BASE_DELETED} 篇待删（标题重复）→ 预期总数 = ${BASE_DELETED} + 4（自造样本）`);
        }

        // 需要一个真实 user（user_words.user_id 有外键指向 users）
        let uid = (db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get() || {}).id;
        if (!uid) {
            uid = db.prepare("INSERT INTO users (name) VALUES ('qa-temp-user')").run().lastInsertRowid;
        }

        const insArticle = db.prepare(`
            INSERT INTO articles (id, user_id, title, description, content, source, level, level_label, word_count, status, questions, sentences, created_at, updated_at)
            VALUES (@id, @user_id, @title, '', @content, @source, 'beginner', '初级', 1, 'completed', '[]', @sentences, @created_at, @updated_at)
        `);
        const insFav = db.prepare(`
            INSERT INTO user_words (user_id, word, definition, sentence, article_id, paragraph_index, sentence_index, status, knowledge, collected_at, next_review_at)
            VALUES (@user_id, @word, @definition, @sentence, @article_id, 0, 0, @status, @knowledge, @collected_at, NULL)
        `);
        const seed = db.transaction(() => {
            // 组 1：三篇同标题（含空白/大小写差异）—— 有一篇带译文且最新 → 应保留 qa_dup_3
            insArticle.run({ id: 'qa_dup_1', user_id: uid, title: 'QA Dup Title', content: 'c1', source: 'upload', sentences: JSON.stringify([{ sentence: 's', translation: '译1' }]), created_at: '2026-01-01 00:00:00', updated_at: '2026-01-01 00:00:00' });
            insArticle.run({ id: 'qa_dup_2', user_id: uid, title: 'qa  dup   title ', content: 'c2', source: 'upload', sentences: '[]', created_at: '2026-02-01 00:00:00', updated_at: '2026-02-01 00:00:00' });
            insArticle.run({ id: 'qa_dup_3', user_id: uid, title: 'QA DUP TITLE', content: 'c3', source: 'upload', sentences: JSON.stringify([{ sentence: 's', translation: '译3' }]), created_at: '2026-03-01 00:00:00', updated_at: '2026-03-01 00:00:00' });

            // 组 2：全组都没有译文 + 其中一篇是预置 → 预置必胜，其余全删
            insArticle.run({ id: 'qa_nt_1', user_id: uid, title: 'QA NoTrans Group', content: 'n1', source: 'upload', sentences: '[]', created_at: '2026-01-01 00:00:00', updated_at: '2026-01-01 00:00:00' });
            insArticle.run({ id: 'qa_nt_2', user_id: uid, title: 'QA NoTrans Group', content: 'n2', source: 'upload', sentences: '[]', created_at: '2026-05-01 00:00:00', updated_at: '2026-05-01 00:00:00' });
            insArticle.run({ id: 'qa_nt_3', user_id: uid, title: 'QA NoTrans Group', content: 'n3', source: 'preset', sentences: '[]', created_at: '2026-01-15 00:00:00', updated_at: '2026-01-15 00:00:00' });

            // 组 3：只差一个后缀 —— 绝不能被当成同一篇（前缀/模糊匹配红线）
            insArticle.run({ id: 'qa_pfx_1', user_id: uid, title: 'QA Prefix in Tess', content: 'p1', source: 'upload', sentences: JSON.stringify([{ translation: '译' }]), created_at: '2026-01-01 00:00:00', updated_at: '2026-01-01 00:00:00' });
            insArticle.run({ id: 'qa_pfx_2', user_id: uid, title: 'QA Prefix in Tess of', content: 'p2', source: 'upload', sentences: JSON.stringify([{ translation: '译' }]), created_at: '2026-01-01 00:00:00', updated_at: '2026-01-01 00:00:00' });

            // 收藏：源行（将被删的文章上）
            insFav.run({ user_id: uid, word: 'migrated_alpha', definition: 'n. 甲', sentence: 'S-A', article_id: 'qa_dup_1', status: 'learning', knowledge: 0.5, collected_at: '2026-01-03T00:00:00Z' });
            insFav.run({ user_id: uid, word: 'migrated_beta', definition: 'v. 乙', sentence: 'S-B', article_id: 'qa_dup_2', status: 'pending', knowledge: 0, collected_at: '2026-01-04T00:00:00Z' });
            // 冲突样本：保留文章上已有一条同 (user_id,word,sentence) 的收藏，且更弱（pending + 占位释义）
            insFav.run({ user_id: uid, word: 'migrated_alpha', definition: '暂无释义', sentence: 'S-A', article_id: 'qa_dup_3', status: 'pending', knowledge: 0, collected_at: '2026-01-09T00:00:00Z' });
            // 收藏落在「预置必胜」组的被删文章上 → 应迁移到 qa_nt_3
            insFav.run({ user_id: uid, word: 'migrated_gamma', definition: 'adj. 丙', sentence: 'S-C', article_id: 'qa_nt_1', status: 'mastered', knowledge: 1, collected_at: '2026-01-05T00:00:00Z' });
        });
        seed();

        const cnt = (sql) => db.prepare(sql).get().c;
        const before = {
            articles: cnt('SELECT COUNT(*) c FROM articles'),
            preset: cnt("SELECT COUNT(*) c FROM articles WHERE source='preset'"),
            favs: cnt('SELECT COUNT(*) c FROM user_words'),
            triples: cnt('SELECT COUNT(*) c FROM (SELECT DISTINCT user_id, word, sentence FROM user_words)')
        };
        console.log(`🩺 靶库基线（含自造样本）：文章 ${before.articles}（预置 ${before.preset}）| 收藏 ${before.favs} | 收藏三元组 ${before.triples}`);

        // 预期：自造样本里 组1 删 2（qa_dup_1/2）、组2 删 2（qa_nt_1/2）、组3 删 0 → 共 4 篇；
        // 再加上靶库真实数据本来就有的重复（BASE_DELETED）。
        const EXPECT_DELETED = BASE_DELETED + 4;
        // 只针对「自造样本」的硬断言：真实数据多出来的那几篇不能算进这 4 篇里
        const EXPECTED_SAMPLE_DELETED = 4;

        const report = dbOps.cleanupDuplicateArticles({ dryRun: false, log: false });
        check('真实执行返回 dryRun=false', report.dryRun === false);
        check(`删除篇数 = 预期 ${EXPECT_DELETED}（真实库基线 ${BASE_DELETED} + 自造样本 ${EXPECTED_SAMPLE_DELETED}）`,
            report.deleted === EXPECT_DELETED, { deleted: report.deleted, BASE_DELETED, EXPECTED_SAMPLE_DELETED });
        check('自造样本的 4 篇确实都被删了（不依赖真实数据状态）',
            report.deleted >= EXPECTED_SAMPLE_DELETED, report.deleted);
        check('收藏迁移 ≥ 3 条（3 条源收藏都来自被删文章）', report.favoritesMigrated + report.favoritesMerged >= 3, report);

        // ================= ⑤ 结果断言 =================
        const exists = (id) => !!db.prepare('SELECT 1 FROM articles WHERE id=?').get(id);
        const after = {
            articles: cnt('SELECT COUNT(*) c FROM articles'),
            preset: cnt("SELECT COUNT(*) c FROM articles WHERE source='preset'"),
            favs: cnt('SELECT COUNT(*) c FROM user_words'),
            triples: cnt('SELECT COUNT(*) c FROM (SELECT DISTINCT user_id, word, sentence FROM user_words)'),
            orphans: cnt('SELECT COUNT(*) c FROM user_words uw LEFT JOIN articles a ON uw.article_id = a.id WHERE a.id IS NULL'),
            ctxOrphans: cnt('SELECT COUNT(*) c FROM word_context wc LEFT JOIN articles a ON wc.article_id = a.id WHERE wc.article_id IS NOT NULL AND a.id IS NULL')
        };
        console.log(`🩺 执行后：文章 ${after.articles}（预置 ${after.preset}）| 收藏 ${after.favs} | 收藏三元组 ${after.triples}`);
        console.log(`🩺 报告：删除 ${report.deleted} 篇 | 收藏迁移 ${report.favoritesMigrated} 条 | 合并去重 ${report.favoritesMerged} 条`);

        console.log('\n【⑤ 结果断言】');
        check('① 文章数 = 原数 - 删除数', after.articles === before.articles - report.deleted, { after: after.articles, expect: before.articles - report.deleted });
        check('② 预置文章数量不变（红线）', after.preset === before.preset, { after: after.preset, before: before.preset });
        check('② 预置文章被选为保留者且存在（qa_nt_3）', exists('qa_nt_3'));
        check('③ 有译文且最新的一篇被保留（qa_dup_3）', exists('qa_dup_3'));
        check('③ 该组另外两篇已删除', !exists('qa_dup_1') && !exists('qa_dup_2'));
        check('③ 预置组的两个上传重复项已删除', !exists('qa_nt_1') && !exists('qa_nt_2'));
        check('❗仅差后缀的两篇都活着（前缀/模糊匹配红线未被突破）', exists('qa_pfx_1') && exists('qa_pfx_2'));
        check('④ 无悬空 user_words.article_id', after.orphans === 0, after.orphans);
        check('④ 无悬空 word_context.article_id', after.ctxOrphans === 0, after.ctxOrphans);
        check('⑤ ❗收藏内容零丢失：DISTINCT(user_id,word,sentence) 前后相等', after.triples === before.triples, { after: after.triples, before: before.triples });
        check('⑤ 收藏行数差额 = 撞键合并去重数', after.favs === before.favs - report.favoritesMerged, { after: after.favs, before: before.favs, merged: report.favoritesMerged });

        // ⑥ 合并后的那一行应该是「更深的进度 + 更实的释义」
        const mergedRow = db.prepare('SELECT * FROM user_words WHERE user_id=? AND word=? AND sentence=?').get(uid, 'migrated_alpha', 'S-A');
        console.log('🩺 合并后的 migrated_alpha →', JSON.stringify({ status: mergedRow && mergedRow.status, definition: mergedRow && mergedRow.definition, article_id: mergedRow && mergedRow.article_id }));
        check('⑥ 合并保留了①条（唯一键不冲突、内容不重复）',
            db.prepare('SELECT COUNT(*) c FROM user_words WHERE user_id=? AND word=? AND sentence=?').get(uid, 'migrated_alpha', 'S-A').c === 1);
        check('⑥ 合并后进度取更深的一侧（learning > pending）', mergedRow.status === 'learning', mergedRow.status);
        check('⑥ 合并后释义取更实的一侧（不能留「暂无释义」）', mergedRow.definition === 'n. 甲', mergedRow.definition);
        check('⑥ 合并后已改挂到保留文章 qa_dup_3', mergedRow.article_id === 'qa_dup_3', mergedRow.article_id);
        const gamma = db.prepare('SELECT * FROM user_words WHERE user_id=? AND word=?').get(uid, 'migrated_gamma');
        check('⑥ 落在预置组被删文章上的收藏已迁移到 qa_nt_3', gamma && gamma.article_id === 'qa_nt_3', gamma && gamma.article_id);
        check('⑥ 迁移不改学习进度（mastered 保持 mastered）', gamma && gamma.status === 'mastered', gamma && gamma.status);

        // ⑦ 幂等 + 演练
        console.log('\n【⑥ 幂等性与演练模式】');
        const report2 = dbOps.cleanupDuplicateArticles({ dryRun: false, log: false });
        check('第二次执行删除 0 篇（幂等）', report2.deleted === 0, report2.deleted);

        const snapBefore = cnt('SELECT COUNT(*) c FROM articles');
        const repDry = dbOps.cleanupDuplicateArticles({ dryRun: true, log: false });
        const snapAfter = cnt('SELECT COUNT(*) c FROM articles');
        check('dryRun 不改库（文章数不变）', snapBefore === snapAfter, { snapBefore, snapAfter });
        check('dryRun 报告标记 dryRun=true', repDry.dryRun === true);

        // 清掉本次自己造的行，避免靶库残留（靶库文件稍后整体删除，这里只是保持整洁）
        db.prepare("DELETE FROM user_words WHERE word IN ('migrated_alpha','migrated_beta','migrated_gamma')").run();
        db.prepare("DELETE FROM articles WHERE id LIKE 'qa_%'").run();

    } catch (e) {
        fail++;
        console.error('❌ 测试异常:', e && e.stack ? e.stack : e);
    }

    console.log(`\n结果：${pass} PASS / ${fail} FAIL`);
    // 必须先关连接再删文件：Windows 上连接没关时 unlink 会 EBUSY，临时靶库就留在磁盘上了
    try { db.close(); } catch (_) {}
    cleanupTmp();
    process.exit(fail === 0 ? 0 : 1);
})();
