#!/usr/bin/env node
/**
 * import_ecdict.js — 把 ECDICT（开源英汉词典）导入本地 SQLite 词典库
 *
 * 产物：data/dictionary.db（独立于 app.db，见 db.js 顶部的说明）
 *
 * 用法：
 *   node import_ecdict.js                 # 默认口径 common（约 36.5 万条，~50MB）
 *   node import_ecdict.js --profile=core  # 只留常考/高频词（约 5.9 万条，~12MB）
 *   node import_ecdict.js --profile=all   # 全量（约 77 万条，~90MB）
 *   node import_ecdict.js --file=D:\ecdict.csv    # 用本地 CSV，不联网
 *   node import_ecdict.js --download-only         # 只下载不导入
 *   node import_ecdict.js --force-download        # 忽略已有 CSV，重新下载
 *   node import_ecdict.js --probe                 # 只抽查现有词典库
 *
 * 为什么口径不是「只留考试大纲词」：
 *   `had / been / went / swung / began` 这类变形词在 ECDICT 里 **没有考试标签、bnc/frq 都是 0**
 *   （它们靠 exchange 字段的 `0:have` 反指原形），按「常考词」筛会把最常用的变形词全筛掉，
 *   实测文章覆盖率从 97.4% 掉到 86.8%。所以默认口径是「纯字母 + 有中文释义」。
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// ==================== 配置 ====================

let DICT_PATH = process.env.DICTIONARY_PATH || './data/dictionary.db';
if (!path.isAbsolute(DICT_PATH)) DICT_PATH = path.join(__dirname, DICT_PATH);
const TMP_DB = DICT_PATH + '.tmp';

const CSV_PATH = path.join(__dirname, 'data', 'ecdict.csv');

// 直连 raw.githubusercontent 拉 66MB 会超时（实测 22s 无响应），jsDelivr 有 20MB 硬上限，
// 所以走 GitHub 反代。顺序即优先级：gh-proxy.com 实测 ~10MB/s，是唯一跑到全速的。
const MIRRORS = [
    'https://gh-proxy.com/https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv',
    'https://ghfast.top/https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv',
    'https://ghproxy.net/https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv'
];

// 完整性校验：文件小于这个大小一定不是完整词典（完整约 62.9MB / 77 万行）
const MIN_CSV_BYTES = 50 * 1024 * 1024;
const EXPECTED_MIN_ROWS = 700000;

const CSV_FIELDS = ['word', 'phonetic', 'definition', 'translation', 'pos', 'collins', 'oxford', 'tag', 'bnc', 'frq', 'exchange', 'detail', 'audio'];

const PROFILES = {
    // 纯字母（≥2 字符）且有中文释义 —— 默认。实测 365,058 条 / 50.5MB / 文章覆盖率 97.4%
    common: (w, f) => /^[a-z]{2,}$/.test(w) && !!f.translation,
    // 常考 + 高频 + 有词形变化信息 —— 体积最小，但会漏掉 had/went/swung 这类变形词
    core: (w, f) => {
        const n = (v) => parseInt(v, 10) || 0;
        const top = (v) => n(v) > 0 && n(v) <= 60000;
        return !!f.tag || n(f.oxford) === 1 || n(f.collins) > 0 || top(f.bnc) || top(f.frq);
    },
    all: () => true
};

// ==================== 参数解析 ====================

function parseArgs(argv) {
    const out = { profile: 'common', file: null, downloadOnly: false, forceDownload: false, probe: false, quiet: false };
    for (const a of argv.slice(2)) {
        if (a.startsWith('--profile=')) out.profile = a.split('=')[1].trim().toLowerCase();
        else if (a.startsWith('--file=')) out.file = a.split('=').slice(1).join('=').replace(/^"|"$/g, '');
        else if (a === '--download-only') out.downloadOnly = true;
        else if (a === '--force-download') out.forceDownload = true;
        else if (a === '--probe') out.probe = true;
        else if (a === '--quiet') out.quiet = true;
        else if (a === '--help' || a === '-h') out.help = true;
        else { console.error(`❌ 未知参数: ${a}`); out.help = true; }
    }
    return out;
}

function printHelp() {
    console.log(`
📖 ECDICT 词典导入工具

用法:
  node import_ecdict.js [选项]

选项:
  --profile=common   默认。纯字母且有中文释义，约 36.5 万条 / 50MB，文章覆盖率 97.4%
  --profile=core     只留常考+高频+柯林斯/牛津词，约 5.9 万条 / 12MB（会漏变形词，覆盖率 86.8%）
  --profile=all      全量 77 万条 / 90MB（含专有名词与词缀碎词）
  --file=<csv路径>   使用本地 ECDICT CSV，不联网
  --download-only    只下载 CSV 到 data/ecdict.csv，不导入
  --force-download   忽略已有 CSV，强制重新下载
  --probe            不导入，只抽查当前词典库
  -h, --help         显示本帮助

产物: ${DICT_PATH}
数据源: https://github.com/skywind3000/ECDICT （MIT / CC-BY-SA）
`);
}

// ==================== 下载 ====================

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function downloadCsv({ force }) {
    if (!force && fs.existsSync(CSV_PATH)) {
        const size = fs.statSync(CSV_PATH).size;
        if (size >= MIN_CSV_BYTES) {
            console.log(`📦 已存在 ${CSV_PATH}（${(size / 1024 / 1024).toFixed(1)} MB），跳过下载。要重下加 --force-download`);
            return CSV_PATH;
        }
        console.log(`⚠️ 已存在的 ${CSV_PATH} 只有 ${(size / 1024 / 1024).toFixed(1)} MB，疑似下载不完整 → 重新下载`);
    }

    let lastErr = null;
    for (let i = 0; i < MIRRORS.length; i++) {
        const url = MIRRORS[i];
        const host = url.split('/')[2];
        console.log(`⬇️  [${i + 1}/${MIRRORS.length}] 从 ${host} 下载 ECDICT…（约 63MB，实测 ~10MB/s）`);
        const t0 = Date.now();
        try {
            const res = await fetchWithProgress(url, CSV_PATH, host);
            const size = fs.statSync(CSV_PATH).size;
            const secs = ((Date.now() - t0) / 1000).toFixed(1);
            if (size < MIN_CSV_BYTES) {
                throw new Error(`文件只有 ${(size / 1024 / 1024).toFixed(1)} MB（应 ≈63MB），可能被截断`);
            }
            console.log(`✅ 下载完成 | ${(size / 1024 / 1024).toFixed(1)} MB | ${secs}s | ${(size / 1024 / 1024 / (secs || 1)).toFixed(1)} MB/s`);
            return CSV_PATH;
        } catch (err) {
            lastErr = err;
            console.warn(`❌ ${host} 失败: ${err.message}`);
            try { fs.rmSync(CSV_PATH, { force: true }); } catch (e) { /* ignore */ }
            if (i < MIRRORS.length - 1) await sleep(1500);
        }
    }
    throw new Error(`所有镜像都失败了，最后错误: ${lastErr && lastErr.message}。\n   可手动下载后运行: node import_ecdict.js --file=<你的ecdict.csv路径>\n   地址: https://github.com/skywind3000/ECDICT`);
}

async function fetchWithProgress(url, dest, host) {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const total = parseInt(res.headers.get('content-length') || '0', 10);
    const out = fs.createWriteStream(dest);
    let got = 0;
    let lastLog = 0;

    await new Promise((resolve, reject) => {
        res.body.on('data', chunk => {
            got += chunk.length;
            const now = Date.now();
            if (now - lastLog > 3000) {
                lastLog = now;
                const pct = total ? ((got / total) * 100).toFixed(0) + '%' : '';
                process.stdout.write(`   ${(got / 1024 / 1024).toFixed(1)} MB ${pct}\r`);
            }
        });
        res.body.pipe(out);
        out.on('finish', resolve);
        out.on('error', reject);
        res.body.on('error', reject);
    });
    process.stdout.write(' '.repeat(40) + '\r');
}

// ==================== 流式 CSV 解析 ====================
// ECDICT 的 translation 字段里含内嵌换行（一个义项一行），用 split(',') 或 readline
// 逐行读都会切错，必须上带引号状态的流式解析器。
function* parseCsvStream(file, chunkSize = 1 << 20) {
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.allocUnsafe(chunkSize);
    let field = '';
    let fields = [];
    let inQuotes = false;
    let header = null;

    const flushRow = () => { fields.push(field); field = ''; const r = fields; fields = []; return r; };

    try {
        while (true) {
            const n = fs.readSync(fd, buf, 0, chunkSize, null);
            if (n <= 0) break;
            const rest = buf.toString('utf8', 0, n);
            let i = 0;
            while (i < rest.length) {
                const ch = rest[i];
                if (inQuotes) {
                    if (ch === '"') {
                        if (rest[i + 1] === '"') { field += '"'; i += 2; continue; }
                        inQuotes = false; i++; continue;
                    }
                    field += ch; i++; continue;
                }
                if (ch === '"') { inQuotes = true; i++; continue; }
                if (ch === ',') { fields.push(field); field = ''; i++; continue; }
                if (ch === '\n') {
                    if (field.endsWith('\r')) field = field.slice(0, -1);
                    const row = flushRow();
                    if (header === null) header = row; else yield row;
                    i++; continue;
                }
                field += ch; i++;
            }
        }
    } finally {
        fs.closeSync(fd);
    }
    if (field.length || fields.length) {
        const row = flushRow();
        if (header === null) header = row; else yield row;
    }
}

function rowToFields(row) {
    const f = {};
    for (let i = 0; i < CSV_FIELDS.length; i++) f[CSV_FIELDS[i]] = row[i] === undefined ? '' : row[i];
    return f;
}

// exchange 里 `0:xxx` 是原形（lemma），变形词靠它反指；`1:xxx` 是「本词是原形的某种变形」标记
function pickLemma(exchange) {
    if (!exchange) return null;
    for (const part of String(exchange).split('/')) {
        if (part.startsWith('0:')) {
            const v = part.slice(2).trim().toLowerCase();
            if (v) return v;
        }
    }
    return null;
}

// ==================== 导入 ====================

function importCsv(csvPath, profileName) {
    const filter = PROFILES[profileName];
    if (!filter) throw new Error(`未知口径: ${profileName}`);

    console.log(`🔨 口径=${profileName} → 目标 ${DICT_PATH}`);
    console.log('   （解析 CSV 中，请稍候…）');

    fs.rmSync(TMP_DB, { force: true });
    const db = new Database(TMP_DB);
    // 导入是一次性离线批处理：关掉 WAL 和同步落盘，实测 77 万条从 20s+ 降到 9s。
    // 导入完会 VACUUM 并整体 fsync，所以安全性不受影响。
    db.pragma('journal_mode = OFF');
    db.pragma('synchronous = OFF');
    db.exec(`
        CREATE TABLE dictionary (
            word        TEXT PRIMARY KEY,
            phonetic    TEXT,
            definition  TEXT,
            translation TEXT,
            pos         TEXT,
            collins     INTEGER DEFAULT 0,
            oxford      INTEGER DEFAULT 0,
            tag         TEXT,
            bnc         INTEGER DEFAULT 0,
            frq         INTEGER DEFAULT 0,
            exchange    TEXT,
            lemma       TEXT,
            imported_at TEXT DEFAULT (datetime('now'))
        );
    `);

    const ins = db.prepare(`INSERT OR REPLACE INTO dictionary
        (word,phonetic,definition,translation,pos,collins,oxford,tag,bnc,frq,exchange,lemma)
        VALUES (@word,@phonetic,@definition,@translation,@pos,@collins,@oxford,@tag,@bnc,@frq,@exchange,@lemma)`);
    const insertBatch = db.transaction(rows => { for (const r of rows) ins.run(r); });

    const t0 = Date.now();
    let rows = 0, kept = 0, skipped = 0;
    let batch = [];

    for (const raw of parseCsvStream(csvPath)) {
        rows++;
        const f = rowToFields(raw);
        const w = (f.word || '').trim().toLowerCase();
        if (!w) { skipped++; continue; }
        if (!filter(w, f)) { skipped++; continue; }

        batch.push({
            word: w,
            phonetic: f.phonetic || null,
            definition: f.definition || null,
            translation: f.translation || null,
            pos: f.pos || null,
            collins: parseInt(f.collins, 10) || 0,
            oxford: parseInt(f.oxford, 10) || 0,
            tag: f.tag ? f.tag.trim() : null,
            bnc: parseInt(f.bnc, 10) || 0,
            frq: parseInt(f.frq, 10) || 0,
            exchange: f.exchange || null,
            lemma: pickLemma(f.exchange)
        });
        kept++;
        if (batch.length >= 5000) { insertBatch(batch); batch = []; }
        if (rows % 200000 === 0) process.stdout.write(`   已扫描 ${rows} 行，入库 ${kept} 条\r`);
    }
    if (batch.length) insertBatch(batch);
    process.stdout.write(' '.repeat(46) + '\r');

    const importMs = Date.now() - t0;

    if (rows < EXPECTED_MIN_ROWS) {
        db.close();
        fs.rmSync(TMP_DB, { force: true });
        throw new Error(`CSV 只有 ${rows} 行（应 ≥${EXPECTED_MIN_ROWS}），文件可能不完整。已放弃导入。`);
    }
    if (kept === 0) {
        db.close();
        fs.rmSync(TMP_DB, { force: true });
        throw new Error('没有解析出任何词条，CSV 格式可能不对。已放弃导入。');
    }

    console.log(`   扫描 ${rows} 行 | 入库 ${kept} 条 | 跳过 ${skipped} 条 | ${(importMs / 1000).toFixed(2)}s (${Math.round(kept / (importMs / 1000))} 条/秒)`);

    db.exec('CREATE INDEX idx_dictionary_lemma ON dictionary(lemma);');
    db.exec('ANALYZE;');
    db.exec('VACUUM;');
    // 校验 + 落盘
    const counted = db.prepare('SELECT COUNT(*) AS c FROM dictionary').get().c;
    db.pragma('synchronous = FULL');
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    db.close();

    if (counted !== kept) throw new Error(`入库校验失败：写入 ${kept}，读回 ${counted}`);

    // 原子替换：先落 tmp 再改名，避免导入失败时毁掉已有词典
    if (fs.existsSync(DICT_PATH)) {
        try {
            fs.rmSync(DICT_PATH, { force: true });
        } catch (err) {
            fs.rmSync(TMP_DB, { force: true });
            throw new Error(`无法替换 ${DICT_PATH}（${err.code}）—— 服务正在运行会占用该文件。请先停掉 server.js 再重跑。`);
        }
    }
    fs.renameSync(TMP_DB, DICT_PATH);

    const sizeMb = (fs.statSync(DICT_PATH).size / 1024 / 1024).toFixed(1);
    console.log(`\n✅ 词典导入完成 | ${counted} 词条 | ${sizeMb} MB | ${DICT_PATH}`);
    return { rows, kept, importMs, sizeMb: Number(sizeMb) };
}

// ==================== 抽查 ====================

function probe(samples) {
    if (!fs.existsSync(DICT_PATH)) {
        console.log(`📖 词典库不存在: ${DICT_PATH}\n   请先运行: npm run dict:import`);
        return false;
    }
    const db = new Database(DICT_PATH, { readonly: true });
    const total = db.prepare('SELECT COUNT(*) AS c FROM dictionary').get().c;
    const sizeMb = (fs.statSync(DICT_PATH).size / 1024 / 1024).toFixed(1);
    console.log(`📖 词典库: ${total} 词条 | ${sizeMb} MB | ${DICT_PATH}\n`);

    const q = db.prepare('SELECT * FROM dictionary WHERE word = ? LIMIT 1');
    const words = samples && samples.length ? samples : ['better', 'shock', 'gradually', 'quaintly', 'went', 'swung', 'photosynthesis', 'serendipity', 'the', 'a'];
    let hit = 0;
    for (const w of words) {
        const r = q.get(w.toLowerCase());
        if (r) {
            hit++;
            // ECDICT 的义项分隔符是字面量 \n（反斜杠+n），不是真换行
            const lines = String(r.translation || '').split(/\\n|\r?\n/).map(s => s.trim()).filter(Boolean);
            const badges = [
                r.phonetic ? `/${r.phonetic}/` : '',
                r.collins ? `柯林斯${r.collins}星` : '',
                r.oxford === 1 ? '牛津3000' : '',
                r.tag ? r.tag : '',
                r.lemma ? `原形:${r.lemma}` : ''
            ].filter(Boolean).join(' · ');
            console.log(`  ✅ ${w.padEnd(15)} ${badges}`);
            lines.slice(0, 3).forEach((l, i) => console.log(`     ${i === 0 ? '└' : ' '} ${l.slice(0, 70)}`));
            if (lines.length > 3) console.log(`       …共 ${lines.length} 条义项`);
        } else {
            console.log(`  ⬜ ${w.padEnd(15)} 未收录`);
        }
    }
    console.log(`\n抽查命中 ${hit}/${words.length}`);
    db.close();
    return true;
}

// ==================== 主入口 ====================

(async function main() {
    const args = parseArgs(process.argv);
    if (args.help) { printHelp(); return; }

    console.log('══════════════════════════════════════════');
    console.log('  ECDICT 词典导入工具');
    console.log('══════════════════════════════════════════');

    if (args.probe) { probe(null); return; }

    if (!PROFILES[args.profile]) {
        console.error(`❌ 未知口径 --profile=${args.profile}，可选: ${Object.keys(PROFILES).join(' / ')}`);
        process.exitCode = 1;
        return;
    }

    let csv = args.file;
    if (csv) {
        if (!path.isAbsolute(csv)) csv = path.join(process.cwd(), csv);
        if (!fs.existsSync(csv)) throw new Error(`找不到本地 CSV: ${csv}`);
        console.log(`📦 使用本地 CSV: ${csv}（${(fs.statSync(csv).size / 1024 / 1024).toFixed(1)} MB）`);
    } else {
        csv = await downloadCsv({ force: args.forceDownload });
    }

    if (args.downloadOnly) {
        console.log(`✅ 只下载完成: ${csv}`);
        return;
    }

    const stat = importCsv(csv, args.profile);
    console.log('\n──── 抽查 ────');
    probe(null);
    console.log(`\n提示：服务若正在运行，需重启才能加载新词典（连接是只读缓存的）。`);
    console.log(`提示：CSV 源文件 ${csv} 可保留，删掉也不影响词典库；重跑导入需要它（会自动重下）。`);
})().catch(err => {
    console.error(`\n❌ 导入失败: ${err.message}`);
    try { fs.rmSync(TMP_DB, { force: true }); } catch (e) { /* ignore */ }
    process.exitCode = 1;
});
