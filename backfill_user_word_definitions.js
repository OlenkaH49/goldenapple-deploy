/**
 * backfill_user_word_definitions.js - 一次性回填 user_words 里的「占位释义」
 *
 * 背景：`user_words.definition` 是收藏那一刻写进去的快照。历史上拖拽收藏的代码路径
 * 写死了 `words[word] || '暂无释义'`，于是库里有一批 definition 就是字面量「暂无释义」。
 * 列表接口虽然能现场兜底（server.js /api/user-words），但脏数据本身一直留着 ——
 * 导出 CSV / 做统计 / 任何直接读 definition 的地方看到的都还是「暂无释义」。
 *
 * 本脚本做**一次性回填**，取值优先级（用户拍板）：
 *   ① dictionary（ECDICT 词典库）→ 首个中文义项
 *   ② word_context（语境库，word + 收藏时的那句话）→ 该语境下的释义
 *   ③ 都查不到 → 写**空串**（不写「暂无释义」）
 *
 * 用法：
 *   node backfill_user_word_definitions.js             ← 演练（默认）：只演算，事务回滚，不动库
 *   node backfill_user_word_definitions.js --apply     ← 真正执行（先自动备份 data/app.db）
 *   node backfill_user_word_definitions.js --apply --no-backup   ← 执行但不备份（不推荐）
 *
 * 也可以走 npm：
 *   npm run backfill:userwords
 *   npm run backfill:userwords:apply
 */

const fs = require('fs');
const path = require('path');
const dbOps = require('./db');

const argv = process.argv.slice(2);
const apply = argv.includes('--apply');
const noBackup = argv.includes('--no-backup');
// 跟随 db.js 的路径解析（DB_PATH → DATABASE_PATH → ./data/app.db），不写死路径。
const DB_PATH = dbOps.DB_PATH;
const DB_DIR = path.dirname(DB_PATH);

/** 与 server.js / db.js 口径一致的「占位释义」集合 */
const PLACEHOLDERS = ['', '暂无释义', '释义补全中', '释义补全中…'];
function isPlaceholder(def) {
    return PLACEHOLDERS.indexOf(String(def == null ? '' : def).trim()) >= 0;
}

function countPlaceholders() {
    const rows = dbOps.db.prepare('SELECT definition FROM user_words').all();
    let n = 0;
    for (const r of rows) if (isPlaceholder(r.definition)) n++;
    return n;
}

function backupDb() {
    if (!fs.existsSync(DB_PATH)) {
        console.log(`🗂️  [备份] 未找到 ${DB_PATH}，跳过备份（首次运行？）`);
        return Promise.resolve(null);
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = path.join(DB_DIR, `app.db.bak-${stamp}`);
    // ⚠️ 不能用 fs.copyFileSync：库跑在 WAL 模式下，最新写入可能还留在 app.db-wal 里没并回主文件，
    //    直接拷主文件会备份出一个「旧快照」。SQLite 的 backup API 做一致性快照且允许并发写。
    return dbOps.db.backup(dest).then(() => {
        const kb = (fs.statSync(dest).size / 1024).toFixed(0);
        console.log(`🗂️  [备份] 已备份（SQLite 一致性快照）→ ${path.relative(__dirname, dest)}（${kb} KB）`);
        return dest;
    });
}

console.log('========================================');
console.log('📖 user_words 占位释义回填（dictionary 优先 → word_context → 空串）');
console.log(`📖 模式：${apply ? '真实执行（会写库）' : '演练（只演算，不写库）'}`);

dbOps.bootstrap();

main().catch((e) => {
    console.error('❌ [回填释义] 未预期异常：', e && e.stack ? e.stack : e);
    process.exit(1);
});

async function main() {
    const before = {
        total: dbOps.db.prepare('SELECT COUNT(*) c FROM user_words').get().c,
        placeholder: countPlaceholders()
    };
    console.log(`📖 基线：收藏共 ${before.total} 条，其中占位释义 ${before.placeholder} 条`);
    console.log('========================================');

    if (before.placeholder === 0) {
        console.log('📖 没有需要回填的行（占位释义 0 条），无需执行。');
        process.exit(0);
    }

    if (apply && !noBackup) {
        await backupDb();
    }

    let report;
    try {
        report = dbOps.backfillUserWordDefinitions({ dryRun: !apply, log: true });
    } catch (e) {
        console.error('❌ [回填释义] 执行失败，事务已回滚，数据库未被改动：', e.message);
        process.exit(1);
    }

    console.log('========================================');
    console.log('🧾 [校验]');
    const afterPlaceholder = countPlaceholders();

    if (!apply) {
        // 演练模式事务已回滚，库没变 —— 比对只会误报，改为打印「预计结果」
        console.log('🧾   演练模式下数据库未被修改，跳过「执行后」比对。');
        console.log(`🧾   当前占位释义 ${before.placeholder} 条（未变）`);
        console.log(`🧾   预计执行后：回填 ${report.filled} 条（词典 ${report.filledFromDictionary} / 语境库 ${report.filledFromContext}）`
            + ` | 两层都未命中写空串 ${report.cleared} 条 | 占位释义 ${before.placeholder} → 0 条`);
        console.log('========================================');
        console.log('🧪 这是演练，数据库**未被修改**。确认无误后执行：');
        console.log('🧪   node backfill_user_word_definitions.js --apply');
        process.exit(0);
    }

    const filledOk = report.filledFromDictionary + report.filledFromContext === report.filled;
    console.log(`🧾   改写行数     ${report.changed} 行  ${report.changed === report.filled + report.cleared ? '✅' : '❌ 与预期不符'}`);
    console.log(`🧾   占位释义     ${before.placeholder} → ${afterPlaceholder}  ${afterPlaceholder === 0 ? '✅ 已清零（不再有字面量「暂无释义」）' : '⚠️ 仍有残留'}`);
    console.log(`🧾   回填真释义   ${report.filled} 条（词典 ${report.filledFromDictionary} + 语境库 ${report.filledFromContext}）${filledOk ? ' ✅' : ' ❌'}`);
    console.log(`🧾   留空         ${report.cleared} 条（两层都未命中 → 空串，按约定不写「暂无释义」）`);
    console.log(`🧾   收藏总数     ${before.total} 条（只改 definition，未增删任何行）`);
    console.log('========================================');
    console.log(`✅ 回填完成：改写 ${report.changed} 行，其中真释义 ${report.filled} 条、留空 ${report.cleared} 条。`);
}
