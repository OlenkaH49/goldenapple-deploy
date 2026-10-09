/**
 * export_csv.js - 手动导出 word_context 为 word_context.csv（供人工核对 / 手工上传到 Coze 知识库）
 *
 * 这是「手动同步」流程的第 ① 步：
 *   ① node export_csv.js                        ← 本文件
 *   ② 在 Coze 控制台 → 知识库 → 添加文档，上传 word_context.csv（文件类型选 txt）
 *   ③ node sync_to_knowledge.js --mark-synced   标记本地「已同步」，待同步计数归零
 *
 * 注意：CSV 的列定义与转义统一由 coze.buildWordContextCsv 负责，不要在这里另写一套，
 * 否则「4 列表头」和「单元格内换行压成空格」这两条约定会漂移。
 * 导出内容为「全部有效记录」（definition 非空的），UTF-8 且不带 BOM —— 带 BOM 会让知识库
 * 把首列 word 读成 "\uFEFFword"，检索时匹配不上。
 */
const fs = require('fs');
const path = require('path');
const dbOps = require('./db');
const coze = require('./coze');

const OUT_PATH = path.join(__dirname, 'word_context.csv');

console.log('========================================');
console.log('📝 导出 word_context 全量 CSV（手动同步第 ① 步）');

dbOps.bootstrap();

// 0 = 不限制，取全部有效记录（definition 非空）
const rows = dbOps.getRecentWordContext(0);
const csv = coze.buildWordContextCsv(rows);

fs.writeFileSync(OUT_PATH, csv, 'utf8');

const sizeKb = (fs.statSync(OUT_PATH).size / 1024).toFixed(1);
const lines = csv.split('\n');
const header = lines[0];
// 数据行数应与记录数一致；不一致说明有记录被 csv 生成器跳过了（word 为空的脏数据）
const dataLines = lines.length - 1;

console.log(`   ✅ 导出成功：${rows.length} 条 → ${OUT_PATH}`);
console.log(`   📦 文件大小：${sizeKb} KB（${csv.length} 字符，UTF-8 无 BOM）`);
console.log(`   🏷️  表头：${header}`);
if (rows.length > 0) {
    console.log(`   📄 示例：${lines[1].slice(0, 140)}`);
}
if (dataLines !== rows.length) {
    console.log(`   ⚠️ 数据行 ${dataLines} 条 ≠ 记录 ${rows.length} 条：有 word 为空的脏数据被跳过，请检查 word_context`);
}
if (rows.length === 0) {
    console.log('   ⚠️ 没有任何有效记录（definition 非空），先让用户点词生成释义再导出');
}

// 待同步提示：本地记录了「上次上传的是哪一版释义」，可用于判断是否需要重新上传
try {
    const s = dbOps.getWordContextSyncStats();
    console.log(`   📊 本地标记：有效 ${s.total} 条 | 已同步 ${s.synced} 条 | 待同步 ${s.pending} 条`);
} catch (e) {
    console.log(`   ⚠️ 读取同步统计失败（不影响导出）: ${e.message}`);
}

if (!coze.isKnowledgeBaseConfigured()) {
    console.log('   ⚠️ L1 检索未就绪（缺 COZE_KB_SEARCH_WORKFLOW_ID）——上传是手动的，但线上查词的第一层会直接被跳过');
}

console.log('----------------------------------------');
console.log('下一步：');
console.log('   ② Coze 控制台 → 知识库 → 添加文档，上传 word_context.csv（文件类型选 txt）');
console.log('   ③ node sync_to_knowledge.js --mark-synced   让本地「待同步」计数归零');
console.log('   ⚠️ 官方限制：单个知识库最多 300 个文件，别把整库拆成几百个文件传');
console.log('========================================');
