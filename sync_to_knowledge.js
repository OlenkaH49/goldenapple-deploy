/**
 * sync_to_knowledge.js - 金苹果之旅｜word_context 语境库 → Coze 知识库
 *
 * ⚠️ 2026-09-28 起：知识库同步改为【手动模式】，本文件里的定时同步 / 攒批上传 / 编码探测 /
 *    文档清理逻辑（node-cron、AbortController 硬超时、上传重试…）已全部注释掉，不再生效。
 *    保留注释仅为将来可恢复，代码块位置见文件下半部分「已停用」小节。
 *
 * 手动同步三步：
 *   ① node export_csv.js                        导出全量 word_context.csv（4 列，UTF-8 无 BOM）
 *   ② 在 Coze 控制台手动上传该 CSV 到知识库      文件类型选 txt（Coze 不支持直接传 csv）
 *   ③ node sync_to_knowledge.js --mark-synced   标记本地「已同步」，待同步计数归零
 *
 * 本文件现在只做「不联网的本地辅助」+「只读对账」：
 *   node sync_to_knowledge.js              打印上面的流程指引 + 本地统计（默认行为）
 *   node sync_to_knowledge.js --export     导出全量 CSV（等价于 node export_csv.js）
 *   node sync_to_knowledge.js --stats      只读本地统计：有效 / 已同步 / 待同步（不联网）
 *   node sync_to_knowledge.js --mark-synced  手动上传完成后打「已同步」标记
 *   node sync_to_knowledge.js --verify [N] 随机抽 N 个词调 L1 检索工作流真实对账（只读，会联网）
 *   node sync_to_knowledge.js --help       查看全部选项
 *
 * 查词链路（不受本次改动影响，仍在 server.js / coze.js 里）：
 *   L1 word_context_search 工作流  →  L2 word_context 本地语境库  →  L3 AI 生成并回写 L2
 *   （2026-09-28：L1 从「直连知识库 HTTP 接口」改为「调工作流 POST /v1/workflow/run」）
 *
 * 为什么当初要攒批——Coze 官方硬限制（docs.coze.cn/guides/knowledge_limits）：
 *   文本知识库最多 300 个文件、分段总数最多 10000、单个 txt ≤ 5MB。
 *   手动上传时同样要留意：别把整库拆成几百个文件传上去。
 *
 * 相关 .env：
 *   COZE_KB_ID / COZE_KB_API_KEY / COZE_KB_BASE_URL   知识库凭据（L1 检索需 PAT 具备 workflow.run 权限）
 *   COZE_KB_SEARCH_WORKFLOW_ID                        word_context_search 工作流 ID（L1 的核心开关）
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const coze = require('./coze');
const dbOps = require('./db');

const BASE_DIR = __dirname;
const DATA_DIR = path.join(BASE_DIR, 'data');
const FULL_CSV_PATH = path.join(BASE_DIR, 'word_context.csv');          // 全量 CSV（与 export_csv.js 保持一致）
// const BATCH_CSV_PATH = path.join(DATA_DIR, 'kb_sync_batch.csv');     // ⛔ 已停用：自动同步时代的「本批上传 CSV」
const STATE_PATH = path.join(DATA_DIR, 'kb_sync_state.json');           // 同步状态（手动模式只记录「已标记时间」）

// ====================================================================================
// ⛔ 已停用（2026-09-28）：从下面这行开始的整块，是原「自动同步」实现
//    （node-cron 定时 → 增量候选 → 攒批 → 编码探测 → 上传 Coze → 打标记 → 推位点 → 清理旧文档）。
//    保留为注释，仅为将来能完整恢复，不再参与运行。
//
//    恢复办法：去掉本区块各行开头的 `// ` 前缀，并同步还原：
//      · coze.js 里被注释的上传 / 编码探测 / 文档清理代码块
//      · coze.js 底部 module.exports 里被注释掉的键
//      · 本文件 printHelp() / main() 里对应的选项分发
// ====================================================================================

// const CRON_EXPR = process.env.COZE_KB_SYNC_CRON || '*/5 * * * *';
// const CRON_TZ = process.env.COZE_KB_SYNC_CRON_TIMEZONE || 'Asia/Shanghai';
// const SYNC_LIMIT = Number(process.env.COZE_KB_SYNC_LIMIT) || 20000;               // 单批上限
// const BATCH_MIN = Math.max(1, Number(process.env.COZE_KB_SYNC_BATCH_MIN) || 50);  // 攒批阈值
// const MAX_LAG_MIN = Math.max(1, Number(process.env.COZE_KB_SYNC_MAX_LAG_MIN) || 60); // 最长滞后
// const MAX_DOCS = Math.max(1, Number(process.env.COZE_KB_SYNC_MAX_DOCS) || 100);   // KB 文件数上限
// const RUN_TIMEOUT_MS = Math.max(5000, Number(process.env.COZE_KB_SYNC_RUN_TIMEOUT_MS) || 270000);
// const PRUNE_ENABLED = String(process.env.COZE_KB_PRUNE || '1') !== '0';
// const PROBE_MAX_TRIES = Math.max(1, Number(process.env.COZE_KB_SYNC_PROBE_TRIES) || 3);
// 这三个一起构成「接口指纹」：一旦变了就重新探测 content 编码
// const ENDPOINT_VERSION = [
//     coze.config.COZE_KB_UPLOAD_STYLE,
//     coze.config.COZE_KB_DOCUMENTS_PATH,
//     coze.config.COZE_KB_BASE_URL
// ].join('|');

// ==================== 工具函数 ====================

// SQLite datetime('now') 使用 UTC 的 'YYYY-MM-DD HH:MM:SS' 格式，这里保持一致（已停用，自动流程专用）
// function sqliteNow() {
//     return new Date().toISOString().slice(0, 19).replace('T', ' ');
// }

function log(msg) {
    console.log(`[${new Date().toLocaleString('zh-CN', { hour12: false })}] ${msg}`);
}

// 日志里预览内容：把换行显示成 ⏎，避免刷屏
function preview(text, n = 200) {
    return String(text == null ? '' : text).slice(0, n).replace(/\r?\n/g, ' ⏎ ');
}

function readState() {
    try {
        if (!fs.existsSync(STATE_PATH)) return {};
        return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) || {};
    } catch (e) {
        log(`⚠️ 读取同步状态失败（按首次处理）: ${e.message}`);
        return {};
    }
}

function writeState(state) {
    try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
        return true;
    } catch (e) {
        log(`⚠️ 写入同步状态失败: ${e.message}`);
        return false;
    }
}

// 当前活跃的 run 序号：只有最新的 run 才有资格写状态，
// 这样「被硬超时打断、但还在后台跑的旧 run」不会覆盖新 run 的位点。
// let activeEpoch = 0;
//
// /**
//  * 提交状态前的双重校验：
//  *   1) epoch 是否仍然有效（没有更新的 run 开始）
//  *   2) 是否已经超过本次运行的 deadline（超时后不能推进位点）
//  * 不满足就不写 —— 位点不推进意味着这批数据下轮会重传（幂等，不会丢）
//  */
// function commitState(epoch, deadline, patch) {
//     if (epoch !== activeEpoch) {
//         log('⚠️ 本次运行已被更新的运行取代，跳过状态写入');
//         return false;
//     }
//     if (Date.now() > deadline) {
//         log('⚠️ 本次运行已超时，跳过状态写入（位点不推进，下轮重试同一批）');
//         return false;
//     }
//     const state = readState();
//     return writeState({ ...state, ...patch });
// }

/** 写 CSV 文件（转义统一由 coze.csvEscape 处理） */
function writeCsvFile(filePath, rows) {
    const csv = coze.buildWordContextCsv(rows);
    fs.writeFileSync(filePath, csv, 'utf8');
    return csv;
}

// /**
//  * 带硬超时地跑一次 runSync。
//  * 为什么必须自己做：node-cron 4.6 的 executeTimeout 只对 background/fork 任务生效，
//  * inline 任务没有超时；而原来的 `running` 标志一旦遇到「卡死的请求」会永久为 true，
//  * 后续所有 tick 静默跳过，知识库从此不再更新。这里用 AbortController 让在途请求真正结束。
//  */
// async function runSyncGuarded(opts = {}) {
//     const epoch = ++activeEpoch;
//     const deadline = Date.now() + RUN_TIMEOUT_MS;
//     const ac = new AbortController();
//     let timedOut = false;
//     const timer = setTimeout(() => {
//         timedOut = true;
//         ac.abort();
//     }, RUN_TIMEOUT_MS);
//
//     const startedAt = Date.now();
//     try {
//         const result = await runSync({ ...opts, signal: ac.signal, epoch, deadline });
//         return result;
//     } catch (e) {
//         log(`❌ 同步异常: ${e && e.message ? e.message : e}`);
//         return { success: false, error: String(e && e.message ? e.message : e), elapsed: Date.now() - startedAt };
//     } finally {
//         clearTimeout(timer);
//         if (timedOut) log(`⏱️ 单次运行超过硬超时 ${RUN_TIMEOUT_MS}ms，已中止在途请求（位点未推进，下轮会重试）`);
//     }
// }

// ==================== 同步主流程（已停用） ====================
//
// /**
//  * 执行一次同步
//  * @param {object} opts { full, dryRun, force, contentMode, signal, epoch, deadline }
//  * @returns {Promise<{success:boolean, exported:number, uploaded:number, skipped:boolean, reason?:string, error?:string, elapsed:number}>}
//  */
// async function runSync(opts = {}) {
//     const startedAt = Date.now();
//     const epoch = opts.epoch == null ? ++activeEpoch : opts.epoch;
//     const deadline = opts.deadline == null ? Date.now() + RUN_TIMEOUT_MS : opts.deadline;
//     const signal = opts.signal;
//     const state = readState();
//     const uploadState = { ...(state.upload || {}) };
//
//     log('========================================');
//     log(`🔄 开始同步 word_context → Coze 知识库 | 模式: ${opts.full ? '全量快照' : '增量'}${opts.dryRun ? ' | dry-run（不调用接口）' : ''}`);
//     log(`🔧 知识库: ${coze.isKnowledgeBaseConfigured() ? '✅ 已配置' : '⚠️ 未配置（COZE_KB_ID / COZE_KB_API_KEY）'} | 上传形态: ${coze.config.COZE_KB_UPLOAD_STYLE} | content 模式: ${uploadState.contentMode || coze.config.COZE_KB_CONTENT_MODE}`);
//
//     // ---- 1) 取候选 ----
//     let rows = [];
//     let totalValid = 0;
//     let pendingTotal = 0;
//     try {
//         totalValid = dbOps.countWordContext();
//         pendingTotal = dbOps.countUnsyncedWordContext();
//         rows = opts.full ? dbOps.getRecentWordContext(SYNC_LIMIT) : dbOps.getUnsyncedWordContext(SYNC_LIMIT);
//     } catch (e) {
//         log(`❌ 读取 word_context 失败: ${e.message}`);
//         return { success: false, exported: 0, uploaded: 0, skipped: true, error: e.message, elapsed: Date.now() - startedAt };
//     }
//     log(`📊 word_context 有效 ${totalValid} 条 | 待同步 ${pendingTotal} 条 | 本次候选 ${rows.length} 条`);
//
//     // ---- 2) 导出全量 CSV（始终写，便于人工核对/复用） ----
//     try {
//         writeCsvFile(FULL_CSV_PATH, opts.full ? rows : dbOps.getRecentWordContext(SYNC_LIMIT));
//         log(`📝 已导出 CSV（4 列）: ${FULL_CSV_PATH}`);
//     } catch (e) {
//         log(`⚠️ 导出 CSV 失败: ${e.message}`);
//     }
//
//     // ---- 3) 没有候选 → 直接结束 ----
//     if (rows.length === 0) {
//         log('✅ 没有待同步记录（增量候选为空），本次不上传');
//         if (!opts.dryRun) {
//             commitState(epoch, deadline, { lastRunAt: new Date().toISOString(), totalRows: totalValid, lastCount: 0, lastPending: 0 });
//         }
//         return { success: true, exported: 0, uploaded: 0, skipped: true, reason: 'no-candidates', elapsed: Date.now() - startedAt };
//     }
//
//     // ---- 4) 攒批判定（定时触发的增量才需要；手动执行/全量/dry-run 一律立即上传） ----
//     if (!opts.full && !opts.force && !opts.dryRun) {
//         const pendingSince = state.pendingSince || new Date().toISOString();
//         const lagMin = (Date.now() - new Date(pendingSince).getTime()) / 60000;
//         const enoughCount = rows.length >= BATCH_MIN;
//         const enoughLag = lagMin >= MAX_LAG_MIN;
//         if (!enoughCount && !enoughLag) {
//             const waitMin = Math.max(0, MAX_LAG_MIN - lagMin);
//             log(`⏳ 攒批中：候选 ${rows.length}/${BATCH_MIN} 条 | 已滞后 ${lagMin.toFixed(1)}/${MAX_LAG_MIN} 分钟 | 最迟约 ${waitMin.toFixed(1)} 分钟后上传`);
//             commitState(epoch, deadline, {
//                 pendingSince,
//                 lastRunAt: new Date().toISOString(),
//                 totalRows: totalValid,
//                 lastCount: 0,
//                 lastPending: rows.length
//             });
//             return { success: true, exported: rows.length, uploaded: 0, skipped: true, reason: 'batching', elapsed: Date.now() - startedAt };
//         }
//         log(`🚀 达到上传条件：${enoughCount ? `候选 ${rows.length} 条 ≥ ${BATCH_MIN}` : `已滞后 ${lagMin.toFixed(1)} 分钟 ≥ ${MAX_LAG_MIN}`}`);
//     }
//
//     // ---- 5) 截断 + 导出本次上传的 CSV ----
//     let batch = rows;
//     if (rows.length > SYNC_LIMIT) {
//         batch = rows.slice(0, SYNC_LIMIT);
//         log(`✂️ 候选 ${rows.length} 条超过单批上限 ${SYNC_LIMIT}，本次只传前 ${batch.length} 条，剩余 ${rows.length - batch.length} 条下次继续`);
//     }
//     let batchCsv = '';
//     try {
//         batchCsv = writeCsvFile(BATCH_CSV_PATH, batch);
//         log(`📝 已导出本次上传 CSV: ${BATCH_CSV_PATH}（${batch.length} 条 / ${batchCsv.length} 字符）`);
//     } catch (e) {
//         log(`⚠️ 导出本次上传 CSV 失败: ${e.message}`);
//     }
//     if (!batchCsv) batchCsv = coze.buildWordContextCsv(batch);
//
//     // ---- 6) dry-run：只打印将要发送的内容，不调用接口、不打标记、不推进位点 ----
//     if (opts.dryRun) {
//         const modeHint = opts.contentMode || uploadState.contentMode
//             || (coze.config.COZE_KB_CONTENT_MODE === 'auto' ? 'auto(首次运行时会自动探测)' : coze.config.COZE_KB_CONTENT_MODE);
//         log(`🧪 dry-run：本次将上传 ${batch.length} 条 | CSV ${batchCsv.length} 字符 | 上传形态 ${coze.config.COZE_KB_UPLOAD_STYLE} | content 模式 ${modeHint}`);
//         log(`🧪 content 预览（前 200 字符，⏎ = 换行）: ${preview(batchCsv)}`);
//         log(`🧪 干跑结束：未调用接口、未打「已同步」标记、未推进位点`);
//         return { success: true, exported: rows.length, uploaded: 0, skipped: true, reason: 'dry-run', elapsed: Date.now() - startedAt };
//     }
//
//     // ---- 7) 确定 content 编码（没探测过就先探测） ----
//     let contentMode = opts.contentMode || uploadState.contentMode || null;
//     if (!contentMode) {
//         const cfgMode = String(coze.config.COZE_KB_CONTENT_MODE || 'auto').toLowerCase();
//         if (cfgMode === 'text' || cfgMode === 'base64') {
//             contentMode = cfgMode;
//             log(`🔧 content 模式由配置指定: ${contentMode}`);
//         } else {
//             const probeTriesBefore = Number(uploadState.probeTries) || 0;
//             log(`🔬 尚未确定 content 编码，先做探测（第 ${probeTriesBefore + 1} 次）| 本轮不污染真实批次`);
//             const probe = await coze.probeContentMode({ tag: '编码探测', signal });
//             const probeTries = probe.probed ? 0 : probeTriesBefore + 1;
//             commitState(epoch, deadline, {
//                 upload: {
//                     ...uploadState,
//                     style: coze.config.COZE_KB_UPLOAD_STYLE,
//                     contentMode: probe.probed ? probe.contentMode : null,
//                     probedAt: new Date().toISOString(),
//                     probeEvidence: probe.evidence,
//                     probeTries,
//                     endpointVersion: ENDPOINT_VERSION
//                 }
//             });
//             if (!probe.probed) {
//                 if (probeTries < PROBE_MAX_TRIES) {
//                     log(`⚠️ 探测未能验证（${probe.evidence}）| 已失败 ${probeTries}/${PROBE_MAX_TRIES} 次，本轮不上传真实批次，下轮重试`);
//                     log(`   💡 也可以直接在 .env 里指定 COZE_KB_CONTENT_MODE=text 或 =base64 跳过探测`);
//                     return { success: false, exported: rows.length, uploaded: 0, skipped: true, reason: 'probe-failed', error: probe.evidence, elapsed: Date.now() - startedAt };
//                 }
//                 log(`⚠️ 探测已连续失败 ${probeTries} 次，为避免同步彻底停摆，本次按保守值 ${probe.contentMode} 继续上传（如内容异常请手动指定 COZE_KB_CONTENT_MODE）`);
//             }
//             contentMode = probe.contentMode;
//         }
//     }
//
//     // ---- 8) 上传 ----
//     const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
//     const ext = process.env.COZE_KB_FILE_TYPE || 'txt';
//     const docName = `${coze.KB_AUTO_DOC_PREFIX}${stamp}.${ext}`;
//     const res = await coze.uploadToKnowledgeBase(
//         { name: docName, csv: batchCsv, count: batch.length },
//         { style: coze.config.COZE_KB_UPLOAD_STYLE, contentMode, signal, tag: '同步上传' }
//     );
//
//     if (!res.success) {
//         log(`❌ 同步失败 | 本次 ${batch.length} 条未同步 | 模式: ${contentMode} | 错误: ${res.error}`);
//         log(`   已保留状态：位点未推进、未打「已同步」标记，下轮会自动重传同一批`);
//         return { success: false, exported: rows.length, uploaded: 0, skipped: false, error: res.error, elapsed: Date.now() - startedAt };
//     }
//
//     // ---- 9) 打「已同步」标记（短事务 + SQLITE_BUSY 退避重试） ----
//     // ⚠️ 绝不能把上传调用包进事务：上传超时可达 120s，持写锁会把 server.js 的写入打成 SQLITE_BUSY
//     let marked = 0;
//     try {
//         marked = dbOps.withBusyRetry(() => dbOps.markWordContextSynced(batch));
//         log(`🏷️ 已标记 ${marked}/${batch.length} 条为「已同步知识库」`);
//     } catch (e) {
//         log(`❌ 标记「已同步」失败: ${e.message}`);
//         log(`   这批数据下轮会被重传（内容幂等，不会丢数据，只是多占一次上传）`);
//     }
//
//     // ---- 10) 推进位点 ----
//     const nextUploadState = {
//         ...uploadState,
//         style: coze.config.COZE_KB_UPLOAD_STYLE,
//         contentMode,
//         endpointVersion: ENDPOINT_VERSION,
//         lastDocumentName: res.name,
//         lastDocumentId: (res.documentInfos && res.documentInfos[0] && (res.documentInfos[0].document_id || res.documentInfos[0].id)) || null
//     };
//     commitState(epoch, deadline, {
//         lastSyncAt: sqliteNow(),
//         lastCount: batch.length,
//         totalRows: totalValid,
//         lastRunAt: new Date().toISOString(),
//         lastFileName: res.name,
//         pendingSince: null,
//         lastPending: Math.max(0, pendingTotal - batch.length),
//         upload: nextUploadState
//     });
//
//     // ---- 11) 清理旧文档，把 KB 文件数压到上限内 ----
//     if (PRUNE_ENABLED) {
//         try {
//             const pr = await coze.pruneAutoKnowledgeDocuments(MAX_DOCS, { tag: '知识库清理', signal });
//             if (pr.success) {
//                 log(`🧹 清理结果：自动同步文档 ${pr.kept} 个（上限 ${MAX_DOCS}）| 本次删除 ${pr.deleted} 个 | KB 文档总数 ${pr.total ?? '未知'}`);
//                 commitState(epoch, deadline, { upload: { ...readState().upload, filesInKb: pr.kept } });
//             }
//         } catch (e) {
//             log(`⚠️ 清理异常（不影响本次同步）: ${e.message}`);
//         }
//     } else {
//         log('🧹 已按 COZE_KB_PRUNE=0 跳过清理');
//     }
//
//     const remaining = rows.length - batch.length;
//     log('----------------------------------------');
//     log(`✅ 同步完成 | 本次上传 ${batch.length} 条 | 全库有效 ${totalValid} 条 | 耗时 ${Date.now() - startedAt}ms${remaining > 0 ? ` | 剩余 ${remaining} 条待下次` : ''}`);
//     log('========================================');
//     return { success: true, exported: rows.length, uploaded: batch.length, skipped: false, contentMode, elapsed: Date.now() - startedAt };
// }

// ==================== 定时调度 node-cron（已停用） ====================
//
// function startCron() {
//     let cron;
//     try {
//         cron = require('node-cron');
//     } catch (e) {
//         log('❌ 未安装 node-cron，无法启用定时任务。请执行: npm install node-cron');
//         process.exit(1);
//     }
//     if (!cron.validate(CRON_EXPR)) {
//         log(`❌ cron 表达式非法: "${CRON_EXPR}"（示例: "*/5 * * * *" 表示每 5 分钟）`);
//         process.exit(1);
//     }
//
//     log(`⏰ 已启用定时同步 | cron: "${CRON_EXPR}" | 时区: ${CRON_TZ}（系统时区 ${Intl.DateTimeFormat().resolvedOptions().timeZone}）`);
//     log(`   攒批阈值 ${BATCH_MIN} 条 / 最长滞后 ${MAX_LAG_MIN} 分钟 / 单次硬超时 ${RUN_TIMEOUT_MS}ms / KB 文档上限 ${MAX_DOCS} 个`);
//
//     let running = false;   // 双保险：noOverlap 之外再挡一层
//     const handler = async () => {
//         if (running) {
//             log('⚠️ 上一次同步仍在进行，本次跳过');
//             return;
//         }
//         running = true;
//         try {
//             await runSyncGuarded({ full: false });
//         } catch (e) {
//             log(`❌ 定时同步异常: ${e && e.message ? e.message : e}`);
//         } finally {
//             running = false;   // 无论如何都会归位（runSyncGuarded 内部已保证超时会 settle）
//         }
//     };
//
//     try {
//         const task = cron.schedule(CRON_EXPR, handler, { noOverlap: true, timezone: CRON_TZ });
//         if (task && typeof task.on === 'function') {
//             try { task.on('execution:overlap', () => log('⚠️ [cron] 上一次执行尚未结束，本次触发被 noOverlap 跳过')); } catch (e) { /* 事件名随版本差异，忽略 */ }
//             try { task.on('execution:missed', () => log('⚠️ [cron] 有一次触发被错过（进程繁忙）')); } catch (e) { /* 同上 */ }
//             try { task.on('execution:failed', (err) => log(`❌ [cron] 执行失败: ${err && err.message ? err.message : err}`)); } catch (e) { /* 同上 */ }
//         }
//     } catch (e) {
//         // 万一该版本不支持 options，退化为经典用法（仍受 running 保护）
//         log(`⚠️ 调度选项不被支持（${e.message}），回退到基础调度`);
//         cron.schedule(CRON_EXPR, handler);
//     }
// }

// ==================== 子命令 ====================

// /** 首次引导：把现有记录标记为已同步（信任知识库此前已通过 --full 上传过全量） */
// function cmdSeedMarkers() {
//     const epoch = ++activeEpoch;
//     log('========================================');
//     log('🌱 首次引导（--seed-markers）');
//     log(`   这会把 word_context 里现有的全部有效记录标记为「已同步知识库」，`);
//     log(`   前提是知识库已经通过 --full 上传过这批数据，否则它们不会被同步。`);
//     const before = dbOps.countUnsyncedWordContext();
//     const n = dbOps.withBusyRetry(() => dbOps.seedAllWordContextSynced());
//     commitState(epoch, Infinity, {
//         markersSeededAt: new Date().toISOString(),
//         totalRows: dbOps.countWordContext(),
//         lastPending: dbOps.countUnsyncedWordContext()
//     });
//     log(`✅ 已标记 ${n} 条（标记前待同步 ${before} 条 → 现在 ${dbOps.countUnsyncedWordContext()} 条）`);
//     log(`   之后跑 sync 就只会同步「新增」和「释义变更」的记录`);
//     log('========================================');
//     return { success: true, marked: n };
// }

// /** 只探测 content 编码并落盘 */
// async function cmdProbe() {
//     const epoch = ++activeEpoch;
//     log('========================================');
//     log('🔬 content 编码探测（text / base64）');
//     if (!coze.isKnowledgeBaseConfigured()) {
//         log('❌ 知识库未配置（COZE_KB_ID / COZE_KB_API_KEY），无法探测');
//         return { success: false };
//     }
//     const probe = await coze.probeContentMode({ tag: '编码探测' });
//     const state = readState();
//     writeState({
//         ...state,
//         upload: {
//             ...(state.upload || {}),
//             style: coze.config.COZE_KB_UPLOAD_STYLE,
//             contentMode: probe.contentMode,
//             probedAt: new Date().toISOString(),
//             probeEvidence: probe.evidence,
//             probeTries: probe.probed ? 0 : (Number(state.upload && state.upload.probeTries) || 0) + 1,
//             endpointVersion: ENDPOINT_VERSION
//         }
//     });
//     log(`📌 结论: content 模式 = ${probe.contentMode}${probe.probed ? '（已验证）' : '（未验证，保守回退）'}`);
//     log(`   证据: ${probe.evidence}`);
//     log(`   已写入 ${STATE_PATH} 的 upload.contentMode，后续同步不再重复探测`);
//     log('========================================');
//     return { success: true, contentMode: probe.contentMode, probed: probe.probed };
// }

// /** 只看统计，不调上传接口 */
// async function cmdStats() {
//     log('========================================');
//     const s = dbOps.getWordContextSyncStats();
//     log(`📊 word_context：有效 ${s.total} 条 | 已同步 ${s.synced} 条 | 待同步 ${s.pending} 条`);
//     const st = readState();
//     log(`🔧 上传形态 ${coze.config.COZE_KB_UPLOAD_STYLE} | content 模式 ${(st.upload && st.upload.contentMode) || coze.config.COZE_KB_CONTENT_MODE} | 知识库 ${coze.isKnowledgeBaseConfigured() ? '已配置' : '未配置'}`);
//     if (st.lastSyncAt) log(`🕒 上次成功同步: ${st.lastSyncAt} (UTC) | 本次 ${st.lastCount || 0} 条 | 位点文件: ${STATE_PATH}`);
//     if (st.pendingSince) log(`⏳ 攒批中（最早候选进入队列: ${st.pendingSince}）`);
//     if (st.markersSeededAt) log(`🌱 首次引导标记时间: ${st.markersSeededAt}`);
//     if (coze.isKnowledgeBaseConfigured()) {
//         const listed = await coze.listKnowledgeDocuments({ tag: '统计-文档列表' });
//         if (listed.success) {
//             const isOurs = d => {
//                 const n = String((d && (d.name || d.document_name)) || '');
//                 return n.startsWith(coze.KB_AUTO_DOC_PREFIX) || n.startsWith(coze.KB_PROBE_DOC_PREFIX);
//             };
//             const ours = listed.documents.filter(isOurs).length;
//             log(`📁 知识库文档 ${listed.documents.length} 个（本页）| 自动同步 ${ours} 个 | 其他 ${listed.documents.length - ours} 个（不会被动）`);
//             log(`   ⚠️ 官方上限：单知识库最多 300 个文件、分段总数最多 10000`);
//         } else {
//             log(`⚠️ 无法列出知识库文档（不影响同步）: ${listed.error}`);
//         }
//     }
//     log('========================================');
//     return { success: true, ...s };
// }

/** 抽样真实检索对账：验证「知识库里确实能查到、且中文正常（没乱码）」 */
async function cmdVerify(limit) {
    const n = Math.max(1, Number(limit) || 5);
    log('========================================');
    log(`🔎 抽样对账：随机取 ${n} 个词，逐个调 L1 检索工作流（word_context_search）验证`);
    if (!coze.isKnowledgeBaseConfigured()) {
        log('❌ L1 检索工作流未配置（缺 COZE_KB_SEARCH_WORKFLOW_ID），无法对账');
        log('   请在 .env 里填 COZE_KB_SEARCH_WORKFLOW_ID=<word_context_search 工作流 ID>');
        return { success: false };
    }
    const rows = dbOps.db.prepare(`
        SELECT word, context, definition FROM word_context
        WHERE definition IS NOT NULL AND definition <> ''
        ORDER BY RANDOM() LIMIT ?`).all(n);

    let hit = 0;
    let failed = 0;
    for (const r of rows) {
        const kb = await coze.searchKnowledgeBase(`${r.word} ${r.context || ''}`.trim(), {
            tag: '对账检索', word: r.word, context: r.context || ''
        });
        const exact = kb.success && kb.exact;
        const ok = !!(exact && exact.word === String(r.word).toLowerCase() && exact.definition);
        const garbled = ok && /^[A-Za-z0-9+/=]{40,}$/.test(String(exact.definition).trim());
        if (!kb.success) failed++;
        if (ok && !garbled) hit++;
        log(`   ${ok ? (garbled ? '⚠️' : '✅') : '❌'} ${r.word} | 库内="${r.definition}" | 知识库="${exact ? exact.definition : '(未命中)'}"${garbled ? ' ← 疑似乱码/base64' : ''}${kb.success ? '' : ` ← 工作流调用失败: ${kb.error}`}`);
    }
    const rate = rows.length ? Math.round((hit / rows.length) * 1000) / 10 : 0;
    log(`📈 对账结果：${hit}/${rows.length} 命中（${rate}%）${failed ? ` | 工作流调用失败 ${failed} 次` : ''}`);
    if (failed === rows.length && rows.length > 0) {
        log('   💡 全部调用失败：看上面每行的错误信息 —— 常见是 4200(工作流未发布) / 4101(PAT 缺 workflow.run 权限) / 4000(入参名不对)');
    } else if (hit === 0 && rows.length > 0) {
        log('   💡 全部未命中：可能知识库还在建立索引（刚手动上传的话等 1-2 分钟再试），或上传的不是 word_context.csv');
    }
    log('========================================');
    return { success: true, total: rows.length, hit, failed };
}

// /** 只做清理 */
// async function cmdPrune() {
//     log('========================================');
//     log(`🧹 清理知识库中自动同步产生的旧文档（只删前缀 ${coze.KB_AUTO_DOC_PREFIX} / ${coze.KB_PROBE_DOC_PREFIX} 开头的，其他文档一律不碰）`);
//     if (!coze.isKnowledgeBaseConfigured()) {
//         log('❌ 知识库未配置，无法清理');
//         return { success: false };
//     }
//     const pr = await coze.pruneAutoKnowledgeDocuments(MAX_DOCS, { tag: '知识库清理' });
//     commitState(++activeEpoch, Infinity, { upload: { ...(readState().upload || {}), filesInKb: pr.kept } });
//     log(`📌 结果: 保留 ${pr.kept} 个 | 删除 ${pr.deleted} 个 | ${pr.skipped ? '已跳过' : '完成'}`);
//     if (pr.error) log(`   原因: ${pr.error}`);
//     log('========================================');
//     return pr;
// }

// ==================== 手动同步命令 ====================

/** 无参数运行：打印手动同步流程 + 本地统计。不联网、不写数据 —— 纯指引 */
function cmdGuide() {
    const s = dbOps.getWordContextSyncStats();
    const csvExists = fs.existsSync(FULL_CSV_PATH);
    const stt = csvExists ? fs.statSync(FULL_CSV_PATH) : null;

    log('========================================');
    log('📖 知识库同步 = 手动模式（代码里的自动上传已停用）');
    log('----------------------------------------');
    log('手动同步三步：');
    log('   ① 导出 CSV   node export_csv.js');
    log(`   ② 上传       打开 Coze 控制台 → 知识库 → 添加文档，上传 ${path.basename(FULL_CSV_PATH)}（文件类型选 txt）`);
    log('   ③ 标记已同步 node sync_to_knowledge.js --mark-synced');
    log('----------------------------------------');
    log(`📊 本地 word_context：有效 ${s.total} 条 | 已同步 ${s.synced} 条 | 待同步 ${s.pending} 条`);
    log(csvExists
        ? `📄 全量 CSV：${FULL_CSV_PATH} | ${(stt.size / 1024).toFixed(1)} KB | 导出于 ${new Date(stt.mtimeMs).toLocaleString('zh-CN', { hour12: false })}`
        : `📄 全量 CSV：尚未导出（先跑 node export_csv.js）`);
    if (s.pending > 0) {
        log(`💡 有 ${s.pending} 条标记为「待同步」：重新导出 → 手动上传 → --mark-synced`);
    } else if (s.total > 0) {
        log('✅ 按本地标记，全部有效记录都已同步到知识库');
    }
    const st = readState();
    if (st.markersSeededAt) log(`🕒 上次 --mark-synced：${st.markersSeededAt}`);
    log('----------------------------------------');
    log('其他命令：--export / --stats / --mark-synced / --verify [N] / --help');
    log('========================================');
    return { success: true, ...s };
}

/** 只读本地统计（不联网） */
function cmdStats() {
    const s = dbOps.getWordContextSyncStats();
    const st = readState();
    log('========================================');
    log('📊 知识库同步状态（手动模式）');
    log(`   本地 word_context：有效 ${s.total} 条 | 已同步 ${s.synced} 条 | 待同步 ${s.pending} 条`);
    const wfId = coze.config.COZE_KB_SEARCH_WORKFLOW_ID;
    log(`   L1 检索：${coze.isKnowledgeBaseConfigured() ? '✅ 工作流已就绪' : '⚠️ 未就绪'}` +
        ` | 形态=${coze.config.COZE_KB_WORKFLOW_PATH} | workflow_id=${wfId || '(未填 COZE_KB_SEARCH_WORKFLOW_ID)'}` +
        ` | query 形态=${coze.config.COZE_KB_QUERY_MODE}`);
    if (!wfId) log('      💡 在 .env 补一行 COZE_KB_SEARCH_WORKFLOW_ID=<word_context_search 工作流 ID> 即可启用 L1');
    if (fs.existsSync(FULL_CSV_PATH)) {
        const stt = fs.statSync(FULL_CSV_PATH);
        log(`   导出的 CSV：${FULL_CSV_PATH} | ${(stt.size / 1024).toFixed(1)} KB | ${new Date(stt.mtimeMs).toLocaleString('zh-CN', { hour12: false })}`);
    } else {
        log('   导出的 CSV：尚未导出（跑 node export_csv.js）');
    }
    if (st.markersSeededAt) log(`   上次 --mark-synced：${st.markersSeededAt}`);
    if (s.pending > 0) log(`   ⚠️ 有 ${s.pending} 条在本地标记为「未同步」；若已手动上传过，跑 --mark-synced 归零`);
    log('========================================');
    return { success: true, ...s };
}

/** 导出全量 CSV（与 node export_csv.js 等价），不联网 */
function cmdExport() {
    log('========================================');
    log('📝 导出 word_context 全量 CSV（不联网、不上传）');
    let rows = [];
    try {
        rows = dbOps.getRecentWordContext(0);   // 0 = 不限制，取全部有效记录
    } catch (e) {
        log(`❌ 读取 word_context 失败: ${e.message}`);
        return { success: false, exported: 0, error: e.message };
    }
    try {
        const csv = writeCsvFile(FULL_CSV_PATH, rows);
        const size = fs.statSync(FULL_CSV_PATH).size;
        log(`   ✅ 共 ${rows.length} 条 → ${FULL_CSV_PATH}（${(size / 1024).toFixed(1)} KB，${csv.length} 字符）`);
        log(`   表头: ${csv.split('\n')[0]}`);
        if (rows.length) log(`   示例: ${preview(csv.split('\n')[1], 140)}`);
    } catch (e) {
        log(`❌ 写入 CSV 失败: ${e.message}`);
        return { success: false, exported: 0, error: e.message };
    }
    log('   下一步：Coze 控制台 → 知识库 → 添加文档 → 上传这个 CSV（文件类型选 txt）');
    log('   上传完成后跑：node sync_to_knowledge.js --mark-synced');
    log('========================================');
    return { success: true, exported: rows.length };
}

/**
 * 手动上传完成后调用：把当前全部有效记录标记为「已同步」。
 * 标记后「待同步」归零；之后有新增词、或某条释义被 AI 补全/修改时，
 * 它会被重新判定为待同步，提醒你再导出上传一次。
 * 语义：kb_synced_definition 存的是「当时上传的那版释义」，内容一变即失效。
 */
function cmdMarkSynced() {
    log('========================================');
    log('🏷️  标记「已同步知识库」（手动上传之后跑）');
    log(`   前提：知识库里确实已经有这份数据（刚上传的 ${path.basename(FULL_CSV_PATH)}）`);
    const before = dbOps.countUnsyncedWordContext();
    const total = dbOps.countWordContext();
    let n = 0;
    try {
        n = dbOps.withBusyRetry(() => dbOps.seedAllWordContextSynced());
    } catch (e) {
        log(`❌ 标记失败: ${e.message}`);
        return { success: false, marked: 0, error: e.message };
    }
    writeState({ ...readState(), markersSeededAt: new Date().toISOString(), totalRows: total, lastPending: 0 });
    log(`   ✅ 已标记 ${n} 条（待同步 ${before} 条 → ${dbOps.countUnsyncedWordContext()} 条）`);
    log('   之后「新增词 / 释义变更」的记录会重新出现在待同步里，看到就该再导出上传一次');
    log('========================================');
    return { success: true, marked: n };
}

// ==================== 入口 ====================

function printHelp() {
    console.log(`
用法: node sync_to_knowledge.js [选项]

  知识库同步 = 手动模式（代码里的定时 / 自动上传已停用）

  手动同步三步：
    ① node export_csv.js                        导出全量 word_context.csv（4 列）
    ② Coze 控制台手动上传该 CSV 到知识库         文件类型选 txt
    ③ node sync_to_knowledge.js --mark-synced   标记本地「已同步」，待同步计数归零

  选项
    （无选项）       打印上面的流程指引 + 本地统计（默认行为，不联网）
    --export         导出全量 CSV（等价于 node export_csv.js，不联网）
    --stats          只读本地统计：有效 / 已同步 / 待同步（不联网）
    --mark-synced    手动上传完成后，把全部有效记录标记为「已同步」
    --seed-markers   --mark-synced 的旧名字，等价
    --verify [N]     随机抽 N 个词（默认 5）调 L1 检索工作流真实对账（只读，会联网）
    --help           显示帮助

  已停用的选项（自动同步时代遗留，现在会提示并退出）：
    --daemon  --full  --dry-run  --force  --no-now  --probe  --prune
    恢复自动同步：还原 coze.js 与 sync_to_knowledge.js 里被注释的代码块

  关键环境变量：
    COZE_KB_ID / COZE_KB_API_KEY / COZE_KB_BASE_URL   知识库凭据（L1 检索需 PAT 具备 workflow.run 权限）
    COZE_KB_SEARCH_WORKFLOW_ID                        word_context_search 工作流 ID ← L1 的核心开关
    COZE_KB_WORKFLOW_QUERY_PARAM=query                工作流开始节点的入参名（默认 query）
    COZE_KB_WORKFLOW_TIMEOUT_MS=30000                 工作流单次调用超时
    COZE_KB_QUERY_MODE=two_step                       L1 的 query 形态（见下）
       two_step（默认）先用 word 单独查，未中再试 word,context —— 实测命中率 20%→80%，平均 647ms
       word            只打一轮 word 单独 —— 延迟最低（约 500ms），命中率约 80%
       legacy          沿用旧的「词 + 空格 + 句」单轮 —— 实测只有 20%，仅作回退
     为什么：工作流恒返回 3 条（入参 top_k 不生效），而同一句 context 被该句所有词共享，
     用「词 + 整句」查时 top-3 常被同句的「兄弟词」占满。换 query 形态能跳出这个局部最优。
  已废弃（L1 不再直连知识库 HTTP 接口）：
    COZE_KB_SEARCH_PATH  COZE_KB_TOP_K  COZE_KB_SCORE_THRESHOLD  COZE_KB_QUERY_TYPE
`);
}

async function main() {
    const args = process.argv.slice(2);
    const has = (f) => args.includes(f);
    const valueOf = (f, def) => {
        const i = args.indexOf(f);
        return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def;
    };

    if (has('--help') || has('-h')) { printHelp(); return; }

    // 已停用的自动同步选项：明确告知，而不是静默什么都不做
    const LEGACY_FLAGS = ['--daemon', '--full', '--dry-run', '--force', '--no-now', '--probe', '--prune'];
    const usedLegacy = LEGACY_FLAGS.filter(f => has(f));
    if (usedLegacy.length) {
        log('========================================');
        log(`⛔ 已停用的选项: ${usedLegacy.join(' ')}`);
        log('   知识库同步已改为「手动同步」，代码里的定时 / 自动上传逻辑已停用。');
        log('   请改用：node export_csv.js  →（Coze 控制台手动上传 CSV）→  node sync_to_knowledge.js --mark-synced');
        log('   查看全部可用选项：node sync_to_knowledge.js --help');
        log('========================================');
        return;
    }

    // 确保表结构存在（首次运行也能读到 word_context 的 kb_synced_* 列）
    dbOps.bootstrap();

    if (has('--export')) { process.exit(cmdExport().success ? 0 : 1); }
    if (has('--stats')) { process.exit(cmdStats().success ? 0 : 1); }
    if (has('--mark-synced') || has('--seed-markers') || has('--seed')) { process.exit(cmdMarkSynced().success ? 0 : 1); }
    if (has('--verify')) { process.exit((await cmdVerify(valueOf('--verify', 5))).success ? 0 : 1); }

    // 无参数 = 打印手动同步流程 + 本地统计
    process.exit(cmdGuide().success ? 0 : 1);
}

main().catch((e) => {
    console.error(`❌ 同步脚本异常退出: ${e && e.stack ? e.stack : e}`);
    process.exit(1);
});
