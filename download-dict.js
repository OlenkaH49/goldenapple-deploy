#!/usr/bin/env node
/**
 * download-dict.js — 构建期下载 ECDICT 词典库到 data/dictionary.db
 *
 * 为什么需要这个脚本：
 *   词典库 dictionary.db 约 58MB，**不适合提交进 git**（GitHub 对 >50MB 的文件会告警、
 *   >100MB 直接拒绝）。但它是「点词显示完整释义」「拆粘连词」等功能的数据基础。
 *   折中方案（用户 2026-10-09 拍板）：把 dictionary.db 作为 **GitHub Release 资产**发布，
 *   构建时（npm install 之后）自动下载解压到 DICTIONARY_PATH。
 *
 * 触发方式：
 *   ① 自动：package.json 的 `postinstall` —— 每次 npm install / npm ci 后跑一次
 *   ② 手动：npm run dict:download      （已存在且校验通过则跳过）
 *           npm run dict:download -- --force   （强制重下）
 *
 * 设计红线（部署安全，务必保持）：
 *   - **幂等**：目标文件已存在且校验通过 → 直接跳过，绝不重复下载 58MB。
 *   - **失败不阻断构建**：下载/校验任何环节出错都只打警告并 `exit 0`
 *     → 词典层自动降级（点词只剩语境释义 + AI），但服务照常起来。
 *     想要「失败即失败」可在 CI 里加 `--strict`。
 *   - **原子替换**：先下到 `<目标>.download`，校验通过才 rename，避免留下半个坏库。
 *     运行期 db.js 是以 `readonly: true` 打开它的，半截文件会直接让服务起不来。
 *   - **不依赖网络库**：只用 Node 内置 https/http（跨 Node 版本稳定，无需额外依赖）。
 *
 * 环境变量：
 *   DICTIONARY_DOWNLOAD_URL         下载地址（GitHub Release 直链）。不填则跳过。
 *   DICTIONARY_PATH                 目标路径（与 db.js 同一套解析规则），默认 ./data/dictionary.db
 *   SKIP_DICT_DOWNLOAD=1            跳过本次下载（离线构建 / CI 用）
 *   DICTIONARY_DOWNLOAD_TIMEOUT_MS  超时毫秒，默认 600000（10 分钟）
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// ---------------------------------------------------------------------------
// 目标路径：与 db.js 的 resolveDataPath(['DICTIONARY_PATH'], './data/dictionary.db') 保持一致。
// 这里刻意不 require('./db')：那个模块一加载就会建/开数据库连接，
// 在 postinstall 阶段（可能还没数据库、甚至还没挂磁盘）不该发生这种副作用。
// ---------------------------------------------------------------------------
const ROOT = __dirname;
const RAW_DICT_PATH = (process.env.DICTIONARY_PATH && String(process.env.DICTIONARY_PATH).trim())
    || './data/dictionary.db';
const DICT_PATH = path.isAbsolute(RAW_DICT_PATH) ? RAW_DICT_PATH : path.join(ROOT, RAW_DICT_PATH);

// GitHub Release 资产的直链。留空 → 脚本会打印提示并跳过（不报错）。
// 真要开箱即用，把下面这行替换成你的地址，或在部署平台配 DICTIONARY_DOWNLOAD_URL。
const DEFAULT_DICT_URL = '';

const URL_FROM_ENV = (process.env.DICTIONARY_DOWNLOAD_URL || '').trim();
const DICT_URL = URL_FROM_ENV || DEFAULT_DICT_URL;

const TIMEOUT_MS = Math.max(10000, Number(process.env.DICTIONARY_DOWNLOAD_TIMEOUT_MS) || 600000);
const SKIP = String(process.env.SKIP_DICT_DOWNLOAD || '') === '1';

const argv = process.argv.slice(2);
const FORCE = argv.includes('--force');
const STRICT = argv.includes('--strict');

const LOG_PREFIX = '📖 [词典下载]';

function log(msg) { console.log(`${LOG_PREFIX} ${msg}`); }
function warn(msg) { console.warn(`${LOG_PREFIX} ⚠️  ${msg}`); }

/** 结束：默认永远 exit 0（绝不阻断 npm install）；--strict 时按 code 退出 */
function done(code, note) {
    if (note) (code === 0 ? log : warn)(note);
    process.exit(STRICT ? code : 0);
}

/** 人类可读体积 */
function mb(bytes) { return (bytes / 1024 / 1024).toFixed(1) + ' MB'; }

/**
 * 校验一个 SQLite 文件是不是「能用的词典库」。
 * 优先用 better-sqlite3 真实打开（最可靠）；它不可用时退回「体积 + 文件头」粗校验。
 * @returns {{ok: boolean, detail: string}}
 */
function verifyDictFile(file) {
    if (!fs.existsSync(file)) return { ok: false, detail: '文件不存在' };
    const size = fs.statSync(file).size;
    if (size < 1 * 1024 * 1024) return { ok: false, detail: `体积异常（${mb(size)}，疑似半截文件或错误页）` };

    // 文件头必须是 SQLite 的魔数（排除下成了 HTML 错误页 / 重定向页）
    try {
        const fd = fs.openSync(file, 'r');
        const head = Buffer.alloc(16);
        fs.readSync(fd, head, 0, 16, 0);
        fs.closeSync(fd);
        if (head.toString('utf8', 0, 15) !== 'SQLite format 3') {
            return { ok: false, detail: '文件头不是 SQLite 格式（可能下到了 HTML 错误页）' };
        }
    } catch (e) {
        return { ok: false, detail: `读取文件头失败: ${e.message}` };
    }

    // 精确校验：表结构与词条数
    let Database = null;
    try { Database = require('better-sqlite3'); } catch (e) { /* 退回粗校验 */ }
    if (!Database) {
        return { ok: true, detail: `${mb(size)}（仅做了体积 + 文件头校验，better-sqlite3 暂不可用）` };
    }
    let conn = null;
    try {
        conn = new Database(file, { readonly: true, fileMustExist: true });
        const hasTable = conn.prepare(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='dictionary' LIMIT 1"
        ).get();
        if (!hasTable) return { ok: false, detail: '缺少 dictionary 表' };
        const count = conn.prepare('SELECT COUNT(*) AS c FROM dictionary').get().c;
        if (!count || count < 1000) return { ok: false, detail: `词条数异常（${count}）` };
        return { ok: true, detail: `${count} 词条 / ${mb(size)}` };
    } catch (e) {
        return { ok: false, detail: `SQLite 打开失败: ${e.message}` };
    } finally {
        if (conn) { try { conn.close(); } catch (e) { /* 忽略 */ } }
    }
}

/**
 * 下载 URL → 目标文件（跟随重定向，带进度日志与总超时）。
 * @returns {Promise<void>}
 */
function download(url, dest, redirectsLeft) {
    return new Promise((resolve, reject) => {
        if (redirectsLeft < 0) return reject(new Error('重定向次数过多（>5）'));

        const client = url.startsWith('http://') ? http : https;
        const req = client.get(url, {
            headers: {
                // GitHub Release 资产会 302 到 objects.githubusercontent.com；带上 UA 更稳
                'User-Agent': 'golden-apple-journey/dict-download',
                'Accept': 'application/octet-stream'
            }
        }, (res) => {
            // 重定向
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume();   // 丢掉响应体，避免连接挂着
                const next = new URL(res.headers.location, url).toString();
                log(`跟随重定向 ${res.statusCode} → ${next.slice(0, 90)}${next.length > 90 ? '…' : ''}`);
                return download(next, dest, redirectsLeft - 1).then(resolve, reject);
            }
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`HTTP ${res.statusCode} ${res.statusMessage || ''}`));
            }

            const total = Number(res.headers['content-length']) || 0;
            let received = 0;
            let lastLoggedPct = -10;
            const startedAt = Date.now();

            const ws = fs.createWriteStream(dest);
            ws.on('error', reject);
            res.on('error', reject);

            res.on('data', (chunk) => {
                received += chunk.length;
                if (total > 0) {
                    const pct = Math.floor(received / total * 100);
                    if (pct >= lastLoggedPct + 10) {          // 每 10% 打一条，别刷屏
                        lastLoggedPct = pct;
                        log(`下载中… ${pct}%（${mb(received)} / ${mb(total)}）`);
                    }
                } else if (received % (8 * 1024 * 1024) < chunk.length) {
                    log(`下载中… 已接收 ${mb(received)}（服务器未给 content-length）`);
                }
            });

            res.pipe(ws);
            ws.on('finish', () => {
                const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
                const speed = secs > 0 ? (received / 1024 / 1024 / Number(secs)).toFixed(1) : '?';
                log(`下载完成：${mb(received)}，用时 ${secs}s（约 ${speed} MB/s）`);
                resolve();
            });
        });

        req.on('error', reject);
        req.setTimeout(TIMEOUT_MS, () => {
            req.destroy(new Error(`下载超时（${TIMEOUT_MS} ms）`));
        });
    });
}

async function main() {
    log(`目标文件: ${DICT_PATH}`);

    if (SKIP) return done(0, 'SKIP_DICT_DOWNLOAD=1 → 跳过词典下载');

    // ---- 幂等：已存在且校验通过就跳过（这是构建速度的关键）----
    if (fs.existsSync(DICT_PATH) && !FORCE) {
        const v = verifyDictFile(DICT_PATH);
        if (v.ok) return done(0, `已存在且校验通过（${v.detail}）→ 跳过下载`);
        warn(`已存在的文件校验不通过（${v.detail}）→ 将重新下载`);
    }

    if (!DICT_URL) {
        return done(0, '未配置下载地址（DICTIONARY_DOWNLOAD_URL），跳过。\n'
            + '           词典层将不可用（点词只剩语境释义 + AI），其余功能不受影响。\n'
            + '           启用方式：把 dictionary.db 传到 GitHub Release，'
            + '然后在部署平台配置 DICTIONARY_DOWNLOAD_URL=<Release 资产直链>');
    }
    log(`下载地址: ${DICT_URL}`);

    // 确保目标目录存在（部署时 /data 卷可能刚挂上）
    const dir = path.dirname(DICT_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        log(`目录不存在，已创建: ${dir}`);
    }

    const tmp = DICT_PATH + '.download';
    try {
        if (fs.existsSync(tmp)) fs.rmSync(tmp, { force: true });
    } catch (e) { /* 忽略 */ }

    await download(DICT_URL, tmp, 5);

    // ---- 校验通过才替换（原子 rename），避免留下坏库让服务起不来 ----
    const v = verifyDictFile(tmp);
    if (!v.ok) {
        try { fs.rmSync(tmp, { force: true }); } catch (e) { /* 忽略 */ }
        return done(1, `下载的文件校验不通过（${v.detail}）→ 已丢弃临时文件，词典层降级`);
    }

    if (fs.existsSync(DICT_PATH)) {
        try {
            fs.rmSync(DICT_PATH, { force: true });   // Windows 上 rename 不能覆盖已存在文件
        } catch (e) {
            return done(1, `无法替换旧文件 ${DICT_PATH}（${e.code || e.message}）—— 服务可能在占用它`);
        }
    }
    fs.renameSync(tmp, DICT_PATH);
    done(0, `✅ 就绪：${v.detail}`);
}

main().catch((e) => {
    // 关键：任何异常都不拖垮 npm install（部署平台把它当构建失败就整套挂了）
    warn(`下载失败: ${(e && e.message) || e} → 词典层降级（点词只剩语境释义 + AI），服务可正常启动`);
    const tmp = DICT_PATH + '.download';
    try { if (fs.existsSync(tmp)) fs.rmSync(tmp, { force: true }); } catch (_) { /* 忽略 */ }
    process.exit(STRICT ? 1 : 0);
});
