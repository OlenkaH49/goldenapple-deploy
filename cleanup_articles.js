/**
 * cleanup_articles.js - 清理重复文章（按标题去重 + 收藏迁移）
 *
 * 反复上传同一篇内容会在 articles 表里堆出几十条重复行（实测 73 篇里 47 篇是重复）。
 * 本脚本按标题分组，每组保留「最新且带译文」的一篇，**先把被删文章上的收藏迁移到保留文章，
 * 再删文章** —— 所以收藏一条都不会丢。
 *
 * 用法：
 *   node cleanup_articles.js              ← 演练（默认）：只演算并打印计划，事务回滚，不动库
 *   node cleanup_articles.js --apply      ← 真正执行（先自动备份 data/app.db）
 *   node cleanup_articles.js --apply --no-backup   ← 执行但不备份（不推荐）
 *
 * 也可以走 npm：
 *   npm run cleanup:articles
 *   npm run cleanup:articles:apply
 *
 * ⚠️ 红线（写死在 db.cleanupDuplicateArticles 里，这里改不了也不该改）：
 *   - `source='preset'` 的文章永不删除；
 *   - 标题只做轻归一化，绝不做前缀/模糊匹配。
 */

const fs = require('fs');
const path = require('path');
const dbOps = require('./db');

const argv = process.argv.slice(2);
const apply = argv.includes('--apply');
const noBackup = argv.includes('--no-backup');
// 跟随 db.js 的路径解析（DB_PATH → DATABASE_PATH → ./data/app.db），
// 不写死 './data/app.db' —— 否则在 DB_PATH=/data/app.db 的部署环境里会备份到一个不存在的文件。
const DB_PATH = dbOps.DB_PATH;
const DB_DIR = path.dirname(DB_PATH);

function backupDb() {
    if (!fs.existsSync(DB_PATH)) {
        console.log(`🗂️  [备份] 未找到 ${DB_PATH}，跳过备份（首次运行？）`);
        return Promise.resolve(null);
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = path.join(DB_DIR, `app.db.bak-${stamp}`);
    // ⚠️ 不能用 fs.copyFileSync：
    //    库跑在 WAL 模式下，最新写入可能还留在 app.db-wal 里没并回主文件
    //    （实测 app.db-wal 有 3.5 MB，主文件却停在一周前）——直接拷主文件会备份出一个「旧快照」。
    //    SQLite 的 backup API 会做一致性快照，且允许并发写。
    return dbOps.db.backup(dest).then(() => {
        const kb = (fs.statSync(dest).size / 1024).toFixed(0);
        console.log(`🗂️  [备份] 已备份（SQLite 一致性快照）→ ${path.relative(__dirname, dest)}（${kb} KB）`);
        return dest;
    });
}

console.log('========================================');
console.log('🧹 文章去重清理（按标题分组 → 保留最新且带译文 → 迁移收藏 → 删文章）');
console.log(`🧹 模式：${apply ? '真实执行（会写库）' : '演练（只演算，不写库）'}`);

dbOps.bootstrap();

main().catch((e) => {
    console.error('❌ [文章去重] 未预期异常：', e && e.stack ? e.stack : e);
    process.exit(1);
});

async function main() {
    // 执行前先拍一张基线快照，执行后对比，用数字自证「收藏没丢」
    const before = {
        articles: dbOps.db.prepare('SELECT COUNT(*) c FROM articles').get().c,
        preset: dbOps.db.prepare("SELECT COUNT(*) c FROM articles WHERE source='preset'").get().c,
        userWords: dbOps.db.prepare('SELECT COUNT(*) c FROM user_words').get().c,
        wcWithArticle: dbOps.db.prepare('SELECT COUNT(*) c FROM word_context WHERE article_id IS NOT NULL').get().c
    };
    console.log(`🧹 基线：文章 ${before.articles} 篇（其中预置 ${before.preset} 篇）| 收藏 ${before.userWords} 条 | word_context 带 article_id ${before.wcWithArticle} 条`);
    console.log('========================================');

    if (apply && !noBackup) {
        await backupDb();
    }

    let report;
    try {
        report = dbOps.cleanupDuplicateArticles({ dryRun: !apply, log: true });
    } catch (e) {
        console.error('❌ [文章去重] 执行失败，事务已回滚，数据库未被改动：', e.message);
        process.exit(1);
    }

    // ---------- 执行后校验 ----------
    const after = {
        articles: dbOps.db.prepare('SELECT COUNT(*) c FROM articles').get().c,
        preset: dbOps.db.prepare("SELECT COUNT(*) c FROM articles WHERE source='preset'").get().c,
        userWords: dbOps.db.prepare('SELECT COUNT(*) c FROM user_words').get().c,
        orphans: dbOps.db.prepare('SELECT COUNT(*) c FROM user_words uw LEFT JOIN articles a ON uw.article_id = a.id WHERE a.id IS NULL').get().c,
        wcOrphans: dbOps.db.prepare('SELECT COUNT(*) c FROM word_context wc LEFT JOIN articles a ON wc.article_id = a.id WHERE wc.article_id IS NOT NULL AND a.id IS NULL').get().c,
        dupGroups: (() => {
            const rows = dbOps.db.prepare('SELECT title FROM articles').all();
            const m = new Map();
            for (const r of rows) {
                const k = dbOps.normalizeArticleTitleKey(r.title);
                if (!k) continue;
                m.set(k, (m.get(k) || 0) + 1);
            }
            return Array.from(m.values()).filter(n => n > 1).length;
        })()
    };

    console.log('========================================');
    console.log('🧾 [校验]');
    if (!apply) {
        // 演练模式事务已回滚，库根本没变 —— 这里的比对没有意义，只会误报
        console.log('🧾   演练模式下数据库未被修改，跳过「执行后」比对。');
        console.log('🧾   当前基线：文章 ' + before.articles + ' 篇（预置 ' + before.preset + ' 篇）| 收藏 ' + before.userWords + ' 条'
            + ' | 悬空引用 收藏 ' + after.orphans + ' 条 / word_context ' + after.wcOrphans + ' 条');
        console.log('🧾   预计执行后：文章 ' + report.remainingArticles + ' 篇 | 收藏 ' + (before.userWords - report.favoritesMerged) + ' 条'
            + '（合并去重 ' + report.favoritesMerged + ' 条）| 重复分组 0 组');
    } else {
        console.log(`🧾   文章数     ${before.articles} → ${after.articles}  ${after.articles === report.remainingArticles ? '✅' : '❌ 与脚本报告(' + report.remainingArticles + ')不符'}（删除 ${report.deleted} 篇）`);
        console.log(`🧾   预置文章   ${before.preset} → ${after.preset}  ${before.preset === after.preset ? '✅ 未被误删' : '❌ 有预置文章被删，需立即用备份恢复'}`);
        console.log(`🧾   收藏数     ${before.userWords} → ${after.userWords}  ${after.userWords === before.userWords - report.favoritesMerged ? '✅ 未丢失（差额全部是撞键合并去重）' : '❌ 收藏数量异常，需立即用备份恢复'}（撞键合并去重 ${report.favoritesMerged} 条）`);
        console.log(`🧾   悬空引用   收藏 ${after.orphans} 条 / word_context ${after.wcOrphans} 条  ${after.orphans === 0 && after.wcOrphans === 0 ? '✅ 无悬空' : '❌ 存在悬空 article_id'}`);
        console.log(`🧾   重复分组   剩余 ${after.dupGroups} 组  ${after.dupGroups === 0 ? '✅ 已清零' : '⚠️ 仍有重复'}`);
    }

    if (!apply) {
        console.log('========================================');
        console.log('🧪 这是演练，数据库**未被修改**。确认上面计划无误后，执行：');
        console.log('🧪   node cleanup_articles.js --apply');
        process.exit(0);
    }

    console.log('========================================');
    console.log(`✅ 清理完成：删除 ${report.deleted} 篇重复文章，迁移收藏 ${report.favoritesMigrated} 条（另合并去重 ${report.favoritesMerged} 条），word_context 改挂 ${report.wordContextRepointed} 条。`);
}
