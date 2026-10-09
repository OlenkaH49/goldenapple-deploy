/**
 * db.js - SQLite 数据库连接与操作
 *
 * 架构说明：
 * - 用 SQLite 替代 PostgreSQL（零安装，单文件），表结构与 PG 版本对齐，日后可平滑迁移。
 * - articles.id 用 TEXT PRIMARY KEY（兼容前端 'article_001' 等字符串 id），
 *   而非自增整数——否则前端 openArticle('article_001') 会失效。
 * - 其余表（users/learning_records/user_words.id）用 INTEGER 自增主键。
 * - JSONB 在 SQLite 中用 TEXT 存 JSON 字符串，读写时 JSON.parse/stringify。
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

/**
 * 解析「数据文件」路径（2026-10-09 部署改造）。
 *
 * 优先级：envKeys 里**第一个有值**的环境变量 → defaultRelPath（相对项目根目录）。
 *
 * 为什么支持多个键：Render / Railway 等平台习惯用简洁的 `DB_PATH`，
 * 而本仓库历史上一直用 `DATABASE_PATH`（4 个测试脚本靠它把连接指向临时靶库，
 * 见 test_article_cleanup.js / test_backfill_and_partial.js / test_sentence_retry.js）。
 * 两个都必须认，否则要么部署配不上、要么测试全挂。
 *
 * @param {string[]} envKeys        按优先级排列的环境变量名
 * @param {string}   defaultRelPath 都没配时的默认相对路径
 * @returns {{path: string, source: string}} path=绝对路径；source=命中的变量名或 'default'
 */
function resolveDataPath(envKeys, defaultRelPath) {
    let raw = null;
    let source = 'default';
    for (const key of envKeys) {
        const v = process.env[key];
        if (v && String(v).trim()) { raw = String(v).trim(); source = key; break; }
    }
    if (!raw) raw = defaultRelPath;
    const abs = path.isAbsolute(raw) ? raw : path.join(__dirname, raw);
    return { path: abs, source };
}

const _dbPathInfo = resolveDataPath(['DB_PATH', 'DATABASE_PATH'], './data/app.db');
const DB_PATH = _dbPathInfo.path;
const DB_PATH_SOURCE = _dbPathInfo.source;
console.log(`🗄️  [数据库] app.db 路径: ${DB_PATH}  [来源: ${DB_PATH_SOURCE === 'default' ? '默认值（未配置 DB_PATH / DATABASE_PATH）' : '环境变量 ' + DB_PATH_SOURCE}]`);

// 确保目录存在。
// ⚠️ 部署提示：容器平台（Render / Railway）的文件系统是**临时**的，重新部署即清空。
//    必须把持久化磁盘（Volume / Disk）挂到 DB_PATH 所在目录（如 /data），
//    并把 DB_PATH 指向磁盘内的文件（如 /data/app.db），否则每次部署数据全丢。
const dbDir = path.dirname(DB_PATH);
try {
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
        console.log(`📁 [数据库] 目录不存在，已自动创建: ${dbDir}`);
    }
} catch (e) {
    console.error(`❌ [数据库] 无法创建数据目录: ${dbDir}（${e.code || e.message}）`);
    console.error('   若部署在 Render / Railway：请确认已把持久化磁盘（Volume）挂载到该目录，');
    console.error('   并把环境变量 DB_PATH 指向磁盘内的文件（例如 /data/app.db）。');
    throw e;   // fail fast：宁可直接崩，也不要静默跑在一个「每次部署都会丢数据」的临时盘上
}

// 创建连接
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');      // 提升并发读写性能
db.pragma('foreign_keys = ON');        // 开启外键约束
// 写锁竞争时的等待时间：server.js 与 sync_to_knowledge.js 是两个进程同写一个库，
// 与 better-sqlite3 的默认值一致，这里显式写出来表明意图（同步脚本的写操作还会额外走 withBusyRetry）
db.pragma('busy_timeout = 5000');

// ==================== 词典库（独立文件） ====================
// 为什么单独一个文件而不是放进 app.db：
//   ① dictionary 是「可整体替换的参考数据集」（重跑 import_ecdict.js 就全量重建），
//      而 app.db 装的是不可再生的用户数据（收藏/打卡/文章）。混在一起会让「重建词典」
//      变成在用户库上跑一个大事务，还会把 app.db 从 2MB 撑到 50MB+，备份/搬运都变重。
//   ② 拆开后词典连接可以按只读打开，服务进程物理上不可能改坏词典。
//   ③ 两个文件各自加锁，词典的点查不会和文章写入抢 app.db 的写锁。
// 导入：new Database() 写 → 见 import_ecdict.js；运行期：readonly 打开 → 见 getDictDb()。
const _dictPathInfo = resolveDataPath(['DICTIONARY_PATH'], './data/dictionary.db');
const DICT_PATH = _dictPathInfo.path;
const DICT_PATH_SOURCE = _dictPathInfo.source;

// ==================== 建表 ====================

function initDB() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            level TEXT DEFAULT 'A2',
            streak INTEGER DEFAULT 0,
            last_active TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS articles (
            id TEXT PRIMARY KEY,
            user_id INTEGER,
            title TEXT,
            description TEXT,
            content TEXT,
            source TEXT DEFAULT 'upload',
            level TEXT,
            level_label TEXT,
            word_count INTEGER DEFAULT 0,
            status TEXT DEFAULT 'pending',
            questions TEXT,
            sentences TEXT,
            -- 句子翻译失败时的错误原因（NULL = 没失败）。
            -- status='partial' 表示「单词/题目成功、句子翻译失败」，前端据此提示用户。
            sentences_error TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS user_words (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            word TEXT NOT NULL,
            definition TEXT,
            sentence TEXT,
            article_id TEXT,
            paragraph_index INTEGER DEFAULT 0,
            sentence_index INTEGER DEFAULT 0,
            status TEXT DEFAULT 'pending',
            knowledge REAL DEFAULT 0,
            collected_at TEXT,
            next_review_at TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (article_id) REFERENCES articles(id),
            UNIQUE (user_id, word, article_id, sentence)
        );

        CREATE TABLE IF NOT EXISTS learning_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            date TEXT,
            words_learned INTEGER DEFAULT 0,
            quiz_score INTEGER,
            time_spent INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS word_cache (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            word TEXT NOT NULL,
            definition TEXT,
            part_of_speech TEXT,
            is_academic INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS word_context (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            word TEXT NOT NULL,
            context TEXT,
            definition TEXT,
            part_of_speech TEXT,
            article_id TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            -- 以下 3 列服务于「知识库增量同步」，与 SQLite 的 ALTER TABLE 保持一致：
            -- 都不设 DEFAULT（ADD COLUMN 只接受常量默认值），时间由应用层显式写入
            updated_at TEXT,
            kb_synced_at TEXT,
            kb_synced_definition TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_word_cache_word ON word_cache(word);
        CREATE INDEX IF NOT EXISTS idx_word_context_word ON word_context(word);
        -- 点词查释义的热路径是 WHERE word = ? AND context = ?（L2 语境库检索）：
        -- 复合索引一次定位到「该词该语境」这一段，避免「先用 word 索引捞回该词的全部语境、
        -- 再逐行比对 context」——一个高频词可能对应上百条语境，那样每点一次都要白扫上百行。
        CREATE INDEX IF NOT EXISTS idx_word_context_word_context ON word_context(word, context);
        CREATE INDEX IF NOT EXISTS idx_word_context_article ON word_context(article_id);
        CREATE INDEX IF NOT EXISTS idx_user_words_user ON user_words(user_id);
        CREATE INDEX IF NOT EXISTS idx_user_words_status ON user_words(status);
        CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
        CREATE INDEX IF NOT EXISTS idx_learning_user_date ON learning_records(user_id, date);
    `);
    migrateWordCacheSchema();
    migrateWordContextSchema();
    migrateWordContextSyncSchema();
    migrateArticleErrorSchema();
    console.log(`🗄️  数据库初始化完成: ${DB_PATH}  [来源: ${DB_PATH_SOURCE === 'default' ? '默认值' : '环境变量 ' + DB_PATH_SOURCE}]`);
}

/**
 * 迁移 word_cache 表结构（支持同一单词多条释义）
 * 旧结构：word TEXT PRIMARY KEY, meaning TEXT
 * 新结构：id 自增主键 + word/definition/part_of_speech，word 可重复
 * 迁移时把旧 meaning 当作 definition 保留，part_of_speech 置空
 */
function migrateWordCacheSchema() {
    const cols = db.prepare('PRAGMA table_info(word_cache)').all();
    const names = cols.map(c => c.name);
    // 已为新结构（有 definition、无 meaning）则无需迁移
    if (names.includes('definition') && !names.includes('meaning')) return;

    const oldRows = db.prepare('SELECT word, meaning, is_academic FROM word_cache').all();

    db.exec('DROP TABLE word_cache;');
    db.exec(`
        CREATE TABLE word_cache (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            word TEXT NOT NULL,
            definition TEXT,
            part_of_speech TEXT,
            is_academic INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_word_cache_word ON word_cache(word);
    `);

    const ins = db.prepare('INSERT INTO word_cache (word, definition, part_of_speech, is_academic) VALUES (?, ?, ?, ?)');
    const tx = db.transaction((rows) => {
        for (const r of rows) {
            ins.run(r.word, r.meaning, null, r.is_academic || 0);
        }
    });
    tx(oldRows);
    if (oldRows.length > 0) console.log(`🔧 迁移 word_cache 表结构（支持多释义），保留 ${oldRows.length} 条词条`);
}

/**
 * 迁移 word_context 表结构：新增 article_id 列（用于按文章扫描空释义）
 */
function migrateWordContextSchema() {
    const cols = db.prepare('PRAGMA table_info(word_context)').all();
    const names = cols.map(c => c.name);
    if (names.includes('article_id')) return;
    db.exec('ALTER TABLE word_context ADD COLUMN article_id TEXT;');
    console.log('🔧 迁移 word_context 表结构（新增 article_id 列）');
}

/**
 * 迁移 word_context 表结构：为「知识库增量同步」补 3 个辅助列
 *   updated_at           最近一次释义变更时间（原表只有 created_at，而补全释义时它不会变）
 *   kb_synced_at         最近一次成功同步到知识库的时间（NULL = 从未同步过）
 *   kb_synced_definition 同步到知识库时的释义快照（与当前 definition 不等 → 需要重传）
 *
 * 两个必须注意的点：
 * 1) SQLite 的 ALTER TABLE ADD COLUMN 只接受**常量**默认值。写成 DEFAULT (datetime('now'))
 *    会直接报 "Cannot add a column with non-constant default"，所以这里只加可空列，
 *    时间由应用层显式写入，存量行的初始值靠下面的 UPDATE 回填。
 * 2) server.js 与 sync_to_knowledge.js 是两个进程，都会跑 bootstrap，
 *    「查列 → ALTER」是 check-then-act 竞态，第二个进程会撞 duplicate column，必须吞掉。
 */
function migrateWordContextSyncSchema() {
    const names = db.prepare('PRAGMA table_info(word_context)').all().map(c => c.name);
    const wanted = [['updated_at', 'TEXT'], ['kb_synced_at', 'TEXT'], ['kb_synced_definition', 'TEXT']];
    let added = 0;
    for (const [name, type] of wanted) {
        if (names.includes(name)) continue;
        try {
            db.exec(`ALTER TABLE word_context ADD COLUMN ${name} ${type};`);
            added++;
        } catch (e) {
            if (!/duplicate column name/i.test(e.message)) throw e;   // 并发下另一个进程刚好加过
        }
    }
    // 存量行用 created_at 作为初始 updated_at——它们是「历史行」，不该被当成刚变更
    db.prepare(`UPDATE word_context SET updated_at = COALESCE(created_at, datetime('now')) WHERE updated_at IS NULL`).run();
    db.exec('CREATE INDEX IF NOT EXISTS idx_word_context_updated ON word_context(updated_at);');
    if (added > 0) console.log(`🔧 迁移 word_context 表结构（新增 ${added} 个知识库同步辅助列）`);
}

/**
 * 迁移 articles 表结构：新增 sentences_error 列（2026-10-06）。
 *
 * 背景：句子翻译失败时，queue.js 原来「悄悄」把 status 写成 completed、sentences 写成 []，
 * 前端完全无感 —— 用户看到的是「这篇文章没有译文」，而不是「译文生成失败了」。
 * 现在失败会写 status='partial' + 本列的错误原因，前端才能如实提示。
 *
 * 与 word_context 的 3 个辅助列同款注意点：ALTER TABLE ADD COLUMN 只接受常量默认值，
 * 所以只加可空列；server.js / sync_to_knowledge.js 两个进程都会 bootstrap，
 * 「查列 → ALTER」是 check-then-act 竞态，必须吞掉 duplicate column。
 */
function migrateArticleErrorSchema() {
    const names = db.prepare('PRAGMA table_info(articles)').all().map(c => c.name);
    if (names.includes('sentences_error')) return;
    try {
        db.exec('ALTER TABLE articles ADD COLUMN sentences_error TEXT;');
        console.log('🔧 迁移 articles 表结构（新增 sentences_error 列 —— 记录句子翻译失败原因）');
    } catch (e) {
        if (!/duplicate column name/i.test(e.message)) throw e;   // 并发下另一个进程刚好加过
    }
}

// ==================== 用户相关 ====================

function getOrCreateUser(username) {
    if (!username) username = process.env.DEFAULT_USERNAME || 'golden-apple-user';
    const existing = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (existing) return existing;

    const info = db.prepare('INSERT INTO users (username) VALUES (?)').run(username);
    console.log(`👤 创建用户: ${username} (id=${info.lastInsertRowid})`);
    return db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
}

function updateUserStreak(userId, streak, lastActive) {
    db.prepare(`UPDATE users SET streak = ?, last_active = ? WHERE id = ?`)
      .run(streak, lastActive, userId);
}

function updateUserLevel(userId, level) {
    db.prepare('UPDATE users SET level = ? WHERE id = ?').run(level, userId);
}

// ==================== 文章相关 ====================

function insertArticle(article) {
    // article: { id, user_id, title, description, content, source, level, level_label, status, questions, sentences }
    db.prepare(`
        INSERT OR IGNORE INTO articles
        (id, user_id, title, description, content, source, level, level_label, word_count, status, questions, sentences)
        VALUES (@id, @user_id, @title, @description, @content, @source, @level, @level_label, @word_count, @status, @questions, @sentences)
    `).run({
        id: article.id,
        user_id: article.user_id || null,
        title: article.title || '',
        description: article.description || '',
        content: article.content || '',
        source: article.source || 'upload',
        level: article.level || null,
        level_label: article.level_label || null,
        word_count: article.word_count || countWords(article.content),
        status: article.status || 'pending',
        questions: article.questions ? JSON.stringify(article.questions) : null,
        sentences: article.sentences ? JSON.stringify(article.sentences) : null
    });
}

function getArticleById(id) {
    const row = db.prepare('SELECT * FROM articles WHERE id = ?').get(id);
    if (!row) return null;
    return deserializeArticle(row);
}

function updateArticleStatus(id, status) {
    db.prepare(`UPDATE articles SET status = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(status, id);
}

/**
 * 写入文章的 questions / sentences，并落最终状态。
 *
 * @param {object} [opts] { status?: 'completed'|'partial', sentencesError?: string|null }
 *
 * 为什么要把 status 参数化（2026-10-06）：
 *   原来这里写死 `status = 'completed'`，于是句子翻译失败时（sentences 落成 []）
 *   文章照样被标成「完成」—— **静默降级**，前端与用户都察觉不到译文其实没生成。
 *   现在调用方可以显式传 'partial'，并把失败原因写进 sentences_error。
 *   默认值仍是 'completed'，保证其它调用方（历史脚本）行为不变。
 *
 * 注意 `sentences ? ... : null` 的短路：传 `[]` 是**真值**，会把已有译文清成 `[]`，
 * 这正是「翻译失败」时想要的效果（库里不再留着上一次的旧译文冒充本轮的成果）。
 */
function updateArticleQuestions(id, questions, sentences, opts) {
    const o = opts || {};
    const status = o.status || 'completed';
    const sentencesError = (o.sentencesError == null || o.sentencesError === '')
        ? null
        : String(o.sentencesError);
    db.prepare(`UPDATE articles SET questions = ?, sentences = ?, status = ?, sentences_error = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(
          questions ? JSON.stringify(questions) : null,
          sentences ? JSON.stringify(sentences) : null,
          status,
          sentencesError,
          id
      );
}

/**
 * 只更新文章译文（2026-10-07 新增）—— 供「只重跑句子翻译」使用。
 *
 * ⚠️ 为什么不能复用 updateArticleQuestions：
 *   那个函数会**同时重写 questions**（`SET questions = ?`）。重试句子翻译时题目根本没变，
 *   如果传 undefined 就会把已经生成好的题目清成 NULL —— 用户点一次「重试」反而把题目弄丢了。
 *   所以这里只碰 sentences / status / sentences_error / updated_at，正文、题目、释义原样保留。
 *
 * @param {string} id
 * @param {Array}  sentences 句子译文数组（失败时传 []）
 * @param {{status?:string, sentencesError?:string}} [opts] status 缺省仍是 'completed'（兼容老语义）
 * @returns {number} 实际改动的行数（0 = 文章不存在）
 */
function updateArticleSentences(id, sentences, opts) {
    const o = opts || {};
    const status = o.status || 'completed';
    const sentencesError = (o.sentencesError == null || o.sentencesError === '')
        ? null
        : String(o.sentencesError);
    const info = db.prepare(`UPDATE articles SET sentences = ?, status = ?, sentences_error = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(
          sentences ? JSON.stringify(sentences) : null,
          status,
          sentencesError,
          id
      );
    return info.changes;
}

function listArticles() {
    const rows = db.prepare('SELECT * FROM articles ORDER BY created_at ASC').all();
    return rows.map(deserializeArticle);
}

/**
 * 文章分页查询（2026-10-06 新增）—— 供前端「文章列表按需加载」使用。
 *
 * 为什么不在 listArticles() 之后 slice：
 *   那是全量 `SELECT *`（含 content/questions/sentences）。这里在 SQL 层分页，
 *   并且**只取列表真要用的列**——sentences 根本不取（是否已有译文用 LENGTH 判断即可），
 *   正文/译文/释义/题目全都留给 getArticleById 按需提供。
 *
 * 排序 = 「预置优先 + 新的在前」：
 *   预置 6 篇的 created_at 最早（2026-08-26），若单纯 `created_at DESC`，
 *   它们会被 60+ 篇上传文章挤到最后一页，用户要点 7 次「加载更多」才能见到——
 *   这跟「预置文章走本地切句降级方案」的目标直接冲突。所以 presets 恒排最前。
 *
 * `id DESC` 不是装饰：
 *   created_at 只精确到秒，同一秒并列时若只按时间排序，LIMIT/OFFSET 翻页会出现
 *   **重复行或漏行**（分页的经典坑）。加 id 做第二排序键才能保证 page 之间不重叠。
 */
function listArticlesPaged(opts) {
    opts = opts || {};
    const pageSize = Math.min(100, Math.max(1, parseInt(opts.pageSize, 10) || 10));
    const status = (opts.status && opts.status !== 'all') ? String(opts.status) : null;

    const where = status ? 'WHERE status = ?' : '';
    const args = status ? [status] : [];

    const total = db.prepare('SELECT COUNT(*) AS c FROM articles ' + where).get(...args).c;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(Math.max(1, parseInt(opts.page, 10) || 1), totalPages);

    const rows = db.prepare(`
        SELECT id, user_id, title, description, content, source, level, level_label,
               word_count, status, questions, sentences_error, created_at, updated_at,
               LENGTH(COALESCE(sentences, '')) AS sentences_length
        FROM articles
        ${where}
        ORDER BY CASE WHEN source = 'preset' THEN 0 ELSE 1 END, created_at DESC, id DESC
        LIMIT ? OFFSET ?
    `).all(...args, pageSize, (page - 1) * pageSize);

    return { total, totalPages, page, pageSize, rows };
}

// ==================== 文章去重清理（2026-10-06） ====================
//
// 背景：反复上传同一篇内容会产生几十条重复行（实测 73 篇里有 47 篇是重复），
// 前端「文章列表」被撑爆、分页也失去意义。
//
// 清理策略（用户 2026-10-06 拍板）：
//   ① 按标题分组；② 每组保留「最新且带译文」的一篇；
//   ③ 把被删文章上的收藏迁移到保留文章（**先迁后删，收藏一条不丢**）；④ 删文章。
//
// 三条安全红线：
//   - `source='preset'` 的文章**永不删除**：前端 BUILTIN_ARTICLES 离线兜底直接引用它们的 id。
//   - 标题只做「轻归一化」（空白 / 引号 / 大小写），**绝不做前缀或模糊匹配**。
//     实测 `The Analysis of Angel Clare's Tragedy in Tess`（被截断）与 `...in Tess of`
//     只差一个 `of`，模糊匹配会把两篇内容不同的文章并成一组误删。
//   - `user_words` 上有 `UNIQUE(user_id, word, article_id, sentence)`，
//     迁移时必然可能撞键，所以重挂之前先查重、撞键就走「合并」（详见 pickUserWordWinner）。

/**
 * 标题归一化 —— **只用于「判断两篇文章是不是同一篇」的分组键**，不改库里的原始标题。
 * 处理三类「看起来一样、实际不等」的重复来源：首尾与连续空白、弯引号 vs 直引号、大小写。
 */
function normalizeArticleTitleKey(title) {
    return String(title == null ? '' : title)
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[\u2018\u2019\u02BC\u2032]/g, "'")   // ’ ‘ ´ ′ → '
        .replace(/[\u201C\u201D\u2033]/g, '"')          // “ ” ″ → "
        .toLowerCase();
}

/** sentences 里是否有真译文（兼容 translation / zh / chinese / cn 四种字段命名） */
function articleHasTranslation(row) {
    if (!row) return false;
    let arr = row.sentences;
    if (typeof arr === 'string') {
        try { arr = JSON.parse(arr); } catch (e) { return false; }
    }
    if (!Array.isArray(arr)) return false;
    return arr.some(s => s && (s.translation || s.zh || s.chinese || s.cn));
}

/** 收藏释义是否「真的可用」：空串和已知占位文案都算没有（与 server.js / app.js 的口径一致） */
const USER_WORD_PLACEHOLDER_MEANINGS = new Set(['', '暂无释义', '释义补全中', '释义补全中…']);
function isRealUserWordDefinition(def) {
    const s = String(def == null ? '' : def).trim();
    return !!s && !USER_WORD_PLACEHOLDER_MEANINGS.has(s);
}

const USER_WORD_STATUS_RANK = { mastered: 4, learning: 3, review: 2, pending: 1 };

/**
 * 两条收藏撞了唯一键时，决定「谁留下」：
 *   ① 学习进度更深的（mastered > learning > review > pending）—— 不能把已掌握的降级回 pending；
 *   ② 并列时释义更实的（真释义 > 「暂无释义」占位）；
 *   ③ 再并列时收藏更早的 —— 保留最早的学习起点（同日同秒则 id 小的）。
 */
function pickUserWordWinner(a, b) {
    const ra = USER_WORD_STATUS_RANK[a.status] || 0;
    const rb = USER_WORD_STATUS_RANK[b.status] || 0;
    if (ra !== rb) return ra > rb ? a : b;

    const da = isRealUserWordDefinition(a.definition) ? 1 : 0;
    const db2 = isRealUserWordDefinition(b.definition) ? 1 : 0;
    if (da !== db2) return da > db2 ? a : b;

    const ca = String(a.collected_at || '');
    const cb = String(b.collected_at || '');
    if (ca !== cb) return ca < cb ? a : b;
    return a.id <= b.id ? a : b;
}

/**
 * 「保留哪一篇」的比较器：预置优先 → 有译文优先 → updated_at 新 → created_at 新 → id 大。
 * 逐级比较而不是单看时间：一篇「昨天传到一半失败」的新文章不该顶掉「前天传成功带译文」的那篇。
 */
function compareArticleForKeep(x, y) {
    const px = x.source === 'preset' ? 0 : 1;
    const py = y.source === 'preset' ? 0 : 1;
    if (px !== py) return px - py;

    const tx = articleHasTranslation(x) ? 0 : 1;
    const ty = articleHasTranslation(y) ? 0 : 1;
    if (tx !== ty) return tx - ty;

    const ux = String(x.updated_at || ''), uy = String(y.updated_at || '');
    if (ux !== uy) return uy.localeCompare(ux);

    const cx = String(x.created_at || ''), cy = String(y.created_at || '');
    if (cx !== cy) return cy.localeCompare(cx);

    return String(y.id).localeCompare(String(x.id));
}

/**
 * 清理重复文章（按标题分组 → 保留最新且带译文的一篇 → 迁移收藏 → 删文章）。
 *
 * @param {{dryRun?: boolean, log?: boolean}} [opts]
 *        dryRun 默认 **true**（只演算 + 回滚，不动库）；必须显式传 `{ dryRun: false }` 才真删。
 *        log 默认 true，打印每个分组的明细与总计。
 * @returns {{
 *   dryRun: boolean, groups: number, kept: number, deleted: number,
 *   favoritesMigrated: number, favoritesMerged: number,
 *   wordContextRepointed: number, remainingArticles: number,
 *   details: Array<object>
 * }}
 *
 * 事务语义：整轮包在一个 SAVEPOINT 里 —— 要么全部生效、要么全部回滚，
 * 不会出现「收藏迁了一半、文章还没删」的中间态。演练模式走**同一段代码**，
 * 只是最后 `ROLLBACK TO` 而不是 `RELEASE`，所以演练数字就是真实执行的数字。
 */
function cleanupDuplicateArticles(opts) {
    opts = opts || {};
    const dryRun = opts.dryRun !== false;
    const log = opts.log !== false;

    const all = db.prepare(`
        SELECT id, title, source, status, sentences, created_at, updated_at
        FROM articles
    `).all();

    // ---- ① 分组：无标题的文章不参与去重（免得把一堆 '' 硬凑成一组）----
    const groups = new Map();
    for (const a of all) {
        const key = normalizeArticleTitleKey(a.title);
        if (!key) continue;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(a);
    }

    // ---- ② 定计划 ----
    const plan = [];
    for (const [key, list] of groups) {
        if (list.length < 2) continue;
        const sorted = list.slice().sort(compareArticleForKeep);
        const keep = sorted[0];
        // 预置文章永不删除（红线，见本节注释）
        const drops = sorted.slice(1).filter(a => a.source !== 'preset');
        if (!drops.length) continue;
        plan.push({ key, keep, drops });
    }

    const report = {
        dryRun,
        groups: plan.length,
        kept: 0,
        deleted: 0,
        favoritesMigrated: 0,
        favoritesMerged: 0,
        wordContextRepointed: 0,
        remainingArticles: all.length,
        details: []
    };

    if (!plan.length) {
        if (log) {
            console.log('🧹 [文章去重] 未发现重复标题的文章，无需清理。');
        }
        return report;
    }

    // 预编译语句（放事务外，循环里复用）
    const stmtSelectFavs = db.prepare('SELECT * FROM user_words WHERE article_id = ?');
    const stmtFindTwin = db.prepare(`
        SELECT * FROM user_words
        WHERE user_id = ? AND word = ? AND article_id = ? AND sentence IS ?
        LIMIT 1
    `);
    const stmtRepointFav = db.prepare('UPDATE user_words SET article_id = ? WHERE id = ?');
    const stmtMergeFav = db.prepare(`
        UPDATE user_words
        SET article_id = @article_id, definition = @definition, status = @status,
            knowledge = @knowledge, collected_at = @collected_at, next_review_at = @next_review_at,
            paragraph_index = @paragraph_index, sentence_index = @sentence_index
        WHERE id = @id
    `);
    const stmtDeleteFav = db.prepare('DELETE FROM user_words WHERE id = ?');
    const stmtRepointCtx = db.prepare('UPDATE word_context SET article_id = ? WHERE article_id = ?');
    const stmtDeleteArticle = db.prepare('DELETE FROM articles WHERE id = ?');

    const runAll = () => {
        for (const group of plan) {
            const keep = group.keep;
            const detail = {
                title: keep.title,
                keepId: keep.id,
                keepHasTranslation: articleHasTranslation(keep),
                deletedIds: [],
                favoritesMigrated: 0,
                favoritesMerged: 0,
                wordContextRepointed: 0
            };

            for (const drop of group.drops) {
                // (a) 迁移收藏：有孪生就合并，没有就重挂 article_id
                for (const src of stmtSelectFavs.all(drop.id)) {
                    const twin = stmtFindTwin.get(src.user_id, src.word, keep.id, src.sentence);
                    if (!twin) {
                        stmtRepointFav.run(keep.id, src.id);
                        detail.favoritesMigrated++;
                        report.favoritesMigrated++;
                        continue;
                    }
                    const winner = pickUserWordWinner(src, twin);
                    const loser = winner.id === src.id ? twin : src;
                    // 释义取「更实的那个」，避免合并后反倒被占位文案盖住
                    const mergedDefinition = isRealUserWordDefinition(src.definition)
                        ? src.definition
                        : (isRealUserWordDefinition(twin.definition) ? twin.definition
                            : (winner.definition || loser.definition));
                    const mergedCollectedAt = String(src.collected_at || '') && String(twin.collected_at || '')
                        ? (String(src.collected_at) < String(twin.collected_at) ? src.collected_at : twin.collected_at)
                        : (winner.collected_at || loser.collected_at);

                    // ⚠️ 顺序至关重要：**必须先删 loser，再更新 winner**。
                    //    若 winner 是「源行」（被删文章上的那条），更新它 = 把它改挂到 keep 上，
                    //    而此刻 keep 上那条孪生行还在 → 直接撞 UNIQUE(user_id, word, article_id, sentence)。
                    //    （这个 bug 在真实数据里恰好没暴露：那次 winner 是孪生行。是自造样本的
                    //      `qa_dup_*` 用例把它逼出来的 —— 即测试存在的意义。）
                    stmtDeleteFav.run(loser.id);
                    stmtMergeFav.run({
                        article_id: keep.id,
                        definition: mergedDefinition,
                        status: winner.status || 'pending',
                        knowledge: winner.knowledge !== undefined && winner.knowledge !== null ? winner.knowledge : 0,
                        collected_at: mergedCollectedAt,
                        next_review_at: winner.next_review_at || null,
                        paragraph_index: winner.paragraph_index || 0,
                        sentence_index: winner.sentence_index || 0,
                        id: winner.id
                    });
                    detail.favoritesMerged++;
                    report.favoritesMerged++;
                }

                // (b) word_context 的 article_id 改挂到保留文章
                //     （该表没有指向 articles 的外键，不改也能删，但会留下悬空 id 无从追溯）
                const ctxInfo = stmtRepointCtx.run(keep.id, drop.id);
                detail.wordContextRepointed += ctxInfo.changes;
                report.wordContextRepointed += ctxInfo.changes;

                // (c) 此时该文章已无 user_words 引用，删除不会撞外键
                stmtDeleteArticle.run(drop.id);
                detail.deletedIds.push(drop.id);
                report.deleted++;
            }

            report.kept++;
            report.details.push(detail);
        }
    };

    // SAVEPOINT 而不是 BEGIN：允许本函数被别的事务包着调用，且演练模式能真回滚
    db.exec('SAVEPOINT article_dedup');
    try {
        runAll();
        if (dryRun) {
            db.exec('ROLLBACK TO article_dedup');
        }
        db.exec('RELEASE article_dedup');
    } catch (e) {
        try { db.exec('ROLLBACK TO article_dedup'); db.exec('RELEASE article_dedup'); } catch (_) { /* 忽略回滚异常，抛原始错 */ }
        throw e;
    }

    report.remainingArticles = all.length - report.deleted;

    if (log) {
        console.log('🧹 ========== 文章去重清理（' + (dryRun ? '演练模式 · 未改动数据库' : '已执行 · 已提交') + '）==========');
        for (const d of report.details) {
            console.log(`🧹 [文章去重] 保留《${String(d.title || '').slice(0, 40)}》→ ${d.keepId}`
                + `${d.keepHasTranslation ? '（含译文）' : '（⚠️ 无译文）'}`
                + ` | 删除 ${d.deletedIds.length} 篇 | 收藏迁移 ${d.favoritesMigrated} 条`
                + `${d.favoritesMerged ? ` + 合并去重 ${d.favoritesMerged} 条` : ''}`
                + ` | word_context 改挂 ${d.wordContextRepointed} 条`);
        }
        console.log('🧹 [文章去重] ————— 汇总 —————');
        console.log(`🧹 [文章去重] 重复分组 ${report.groups} 组，每组保留 1 篇（共保留 ${report.kept} 篇）`);
        console.log(`🧹 [文章去重] 删除文章 ${report.deleted} 篇 | 文章总数 ${all.length} → ${report.remainingArticles} 篇`);
        console.log(`🧹 [文章去重] 收藏迁移 ${report.favoritesMigrated} 条，其中撞唯一键合并去重 ${report.favoritesMerged} 条（收藏总数不因迁移减少）`);
        console.log(`🧹 [文章去重] word_context 改挂 ${report.wordContextRepointed} 条`);
        if (dryRun) {
            console.log('🧹 [文章去重] ⚠️ 以上仅为演练，事务已回滚，数据库未做任何改动。加 `--apply` 才真正执行。');
        }
    }

    return report;
}

function deserializeArticle(row) {
    return {
        ...row,
        questions: row.questions ? JSON.parse(row.questions) : [],
        sentences: row.sentences ? JSON.parse(row.sentences) : []
    };
}

function countWords(text) {
    if (!text) return 0;
    const matches = text.match(/[A-Za-z]+(?:-[A-Za-z]+)*/g);
    return matches ? matches.length : 0;
}

// ==================== user_words 相关 ====================

function insertUserWord(w) {
    // w: { user_id, word, definition, sentence, article_id, paragraph_index, sentence_index, status, knowledge, collected_at, next_review_at }
    try {
        const info = db.prepare(`
            INSERT INTO user_words
            (user_id, word, definition, sentence, article_id, paragraph_index, sentence_index, status, knowledge, collected_at, next_review_at)
            VALUES (@user_id, @word, @definition, @sentence, @article_id, @paragraph_index, @sentence_index, @status, @knowledge, @collected_at, @next_review_at)
        `).run({
            user_id: w.user_id,
            word: w.word,
            definition: w.definition || null,
            sentence: w.sentence || null,
            article_id: w.article_id || null,
            paragraph_index: w.paragraph_index || 0,
            sentence_index: w.sentence_index || 0,
            status: w.status || 'pending',
            knowledge: w.knowledge !== undefined ? w.knowledge : 0,
            collected_at: w.collected_at || new Date().toISOString(),
            next_review_at: w.next_review_at || null
        });
        return { success: true, id: info.lastInsertRowid };
    } catch (e) {
        // 唯一约束冲突说明已收藏
        if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return { success: false, reason: 'duplicate' };
        }
        throw e;
    }
}

function isWordCollectedInSentence(userId, word, articleId, sentence) {
    const row = db.prepare(`
        SELECT 1 FROM user_words
        WHERE user_id = ? AND word = ? AND article_id = ? AND sentence = ? LIMIT 1
    `).get(userId, word, articleId, sentence);
    return !!row;
}

function getUserWords(userId, status) {
    if (status && status !== 'all') {
        return db.prepare('SELECT * FROM user_words WHERE user_id = ? AND status = ? ORDER BY collected_at DESC')
                 .all(userId, status);
    }
    return db.prepare('SELECT * FROM user_words WHERE user_id = ? ORDER BY collected_at DESC').all(userId);
}

function updateUserWordStatus(id, status, knowledge) {
    const nextReview = computeNextReview(status);
    db.prepare(`UPDATE user_words SET status = ?, knowledge = ?, next_review_at = ? WHERE id = ?`)
      .run(status, knowledge !== undefined ? knowledge : knowledgeByStatus(status), nextReview, id);
}

// 取消收藏（2026-10-09 新增）：按条件删 user_words 行。
//   - 只接受 user_id + word（必填）做锚点，article_id / sentence 可选收窄。
//   - 传了 sentence → 只删「本句」那一条（词卡里取消收藏走这条）。
//   - 只传 articleId → 删该词在这篇文章下的**全部**行（收藏列表按词去重展示，取消要删干净，
//     否则同一词在别的句子里还留着，列表/计数看着像没删掉）。
//   - 两者都不传 → 删该用户该词的**全部**行（跨文章的彻底移除，暂未在 UI 暴露，接口留口子）。
// word 用 COLLATE NOCASE 匹配：收藏列表按「小写去重」展示一个 chip，取消时大小写变体要一起删干净，
// 否则列表看着像没删掉（列表侧去重只看小写，删除侧若区分大小写就会漏行）。
// 返回值 deleted = 真正删掉的行数。
function deleteUserWords(userId, word, articleId, sentence) {
    if (!userId || !word) return { success: false, deleted: 0, reason: 'missing-anchor' };
    let sql = 'DELETE FROM user_words WHERE user_id = ? AND word = ? COLLATE NOCASE';
    const args = [userId, word];
    if (articleId) { sql += ' AND article_id = ?'; args.push(articleId); }
    if (sentence) { sql += ' AND sentence = ?'; args.push(sentence); }
    const info = db.prepare(sql).run(...args);
    return { success: true, deleted: info.changes };
}

// 按主键删除单行（校验 user_id 归属，防止越权删别人的词）
function deleteUserWordById(id, userId) {
    const info = db.prepare('DELETE FROM user_words WHERE id = ? AND user_id = ?').run(id, userId);
    return { success: info.changes > 0, deleted: info.changes };
}

function knowledgeByStatus(status) {
    return { 'mastered': 1, 'learning': 0.5, 'review': 0.2, 'pending': 0 }[status] || 0;
}

function computeNextReview(status) {
    // 艾宾浩斯复习间隔（简化）：需复习=1天，学习中=3天，已掌握=7天
    if (status === 'review') {
        const d = new Date(); d.setDate(d.getDate() + 1);
        return d.toISOString();
    }
    if (status === 'learning') {
        const d = new Date(); d.setDate(d.getDate() + 3);
        return d.toISOString();
    }
    if (status === 'mastered') {
        const d = new Date(); d.setDate(d.getDate() + 7);
        return d.toISOString();
    }
    return null;
}

// ==================== user_words 占位释义回填（2026-10-06） ====================
//
// 背景：`user_words.definition` 是「收藏那一刻」写进去的**快照**。历史上拖拽收藏的代码路径
// 写死了 `words[word] || '暂无释义'`，实测 34 条收藏里 24 条存的就是字面量「暂无释义」。
// 列表接口虽然已经能现场兜底补释义（server.js /api/user-words），但库里那份脏数据一直留着：
// 一旦导出 CSV / 做统计 / 前端某条路径直接读 definition，看到的还是「暂无释义」。
//
// 本函数做**一次性回填**，取值优先级由用户拍板：
//   ① dictionary（ECDICT 词典库，全量、不依赖文章）—— 取首个中文义项
//   ② word_context（语境库，word + 收藏时的那句话）—— 这个语境下的释义更贴原文
//   ③ 都查不到 → 写**空串**（明确按用户要求「不写『暂无释义』」，前端会显示占位并允许手动补）
//
// 安全设计：
//   - dryRun 默认 **true**：走**同一段写入代码**，最后 `ROLLBACK TO` 而不是 `RELEASE`，
//     所以演练出来的数字就是真实执行的数字（与 cleanupDuplicateArticles 同款）。
//   - 只动「占位/空」的行；已有真释义的行**一律不碰**（不覆盖用户/AI 写得更好的释义）。
//   - 词典查询在另一条只读连接上做，放在 SAVEPOINT 之外，不占 app.db 的写锁时间。

/**
 * @param {{dryRun?: boolean, log?: boolean, sample?: number}} [opts]
 * @returns {{
 *   dryRun: boolean, scanned: number, candidates: number,
 *   filledFromDictionary: number, filledFromContext: number, filled: number,
 *   cleared: number, changed: number, details: Array<object>
 * }}
 */
function backfillUserWordDefinitions(opts) {
    opts = opts || {};
    const dryRun = opts.dryRun !== false;
    const log = opts.log !== false;
    const sampleSize = Math.max(0, parseInt(opts.sample, 10) || 8);

    const all = db.prepare('SELECT id, user_id, word, definition, sentence, article_id FROM user_words ORDER BY id').all();
    const candidates = all.filter(r => !isRealUserWordDefinition(r.definition));

    // 第一步：只读解析（不写库），把每条要写成什么先算出来
    const plan = [];
    for (const r of candidates) {
        const lower = String(r.word || '').trim().toLowerCase();
        let definition = null;
        let source = null;

        // ① 词典层（优先）
        if (lower) {
            try {
                const dict = getDictionaryEntry(lower);
                if (dict && Array.isArray(dict.translationLines) && dict.translationLines.length > 0) {
                    definition = dict.translationLines[0];
                    source = 'dictionary';
                }
            } catch (e) {
                console.warn(`📖 [回填释义] 词典层查询失败 word=${lower}: ${e.message}`);
            }
        }

        // ② 语境库（词典查不到才走）
        if (!definition && lower) {
            try {
                const ctxRow = getWordContext(lower, r.sentence);
                if (ctxRow && ctxRow.definition) {
                    definition = normalizePosAbbr(ctxRow.definition);
                    source = 'word_context';
                }
            } catch (e) {
                console.warn(`📖 [回填释义] 语境库查询失败 word=${lower}: ${e.message}`);
            }
        }

        plan.push({
            id: r.id,
            word: r.word,
            before: r.definition == null ? '' : String(r.definition),
            after: definition || '',            // ③ 都查不到 → 空串（不写「暂无释义」）
            source: source || 'none'
        });
    }

    const report = {
        dryRun,
        scanned: all.length,
        // candidates = 「definition 不是真释义」的行（含字面量「暂无释义」与已经是空串的）。
        // 空串行也算候选，是因为它仍可能被词典/语境库补上 —— 只是若两层都没命中，它就是终态。
        candidates: candidates.length,
        alreadyEmpty: plan.filter(p => p.before === '').length,
        filledFromDictionary: plan.filter(p => p.source === 'dictionary').length,
        filledFromContext: plan.filter(p => p.source === 'word_context').length,
        filled: 0,
        cleared: 0,
        changed: 0,
        details: plan
    };
    report.filled = report.filledFromDictionary + report.filledFromContext;
    report.cleared = plan.filter(p => p.source === 'none').length;

    // 第二步：写入（演练走同一段代码 + 回滚）
    const stmt = db.prepare('UPDATE user_words SET definition = ? WHERE id = ?');
    db.exec('SAVEPOINT user_word_backfill');
    try {
        for (const p of plan) {
            if (p.before === p.after) continue;      // 本来就是空 → 无需改写，避免无意义的 updated 噪音
            stmt.run(p.after, p.id);
            report.changed++;
        }
        if (dryRun) db.exec('ROLLBACK TO user_word_backfill');
        else db.exec('RELEASE user_word_backfill');
    } catch (e) {
        db.exec('ROLLBACK TO user_word_backfill');
        throw e;
    }

    if (log) {
        console.log('📖 [回填释义] ————— user_words 占位释义回填 —————');
        console.log(`📖 [回填释义] 扫描 ${report.scanned} 条收藏，其中 definition 非真释义（空/占位）${report.candidates} 条`
            + `${report.alreadyEmpty ? `（含本来就是空串的 ${report.alreadyEmpty} 条）` : ''}`);
        console.log(`📖 [回填释义] 词典层命中 ${report.filledFromDictionary} 条 | 语境库命中 ${report.filledFromContext} 条 → 共回填真释义 ${report.filled} 条`);
        console.log(`📖 [回填释义] 两层都查不到 ${report.cleared} 条 → 写**空串**（按约定不写「暂无释义」，留待前端兜底/手动补）`);
        console.log(`📖 [回填释义] 实际改写 ${report.changed} 行（值没变的行跳过，所以幂等：再跑一次应为 0）${dryRun ? '｜演练：事务已回滚，数据库未改动' : ''}`);

        const shown = plan.slice(0, sampleSize);
        if (shown.length > 0) {
            console.log(`📖 [回填释义] 样例（前 ${shown.length} 条）：`);
            for (const p of shown) {
                const label = p.source === 'none' ? '（两层都未命中 → 空）' : `[${p.source}]`;
                console.log(`📖 [回填释义]   #${p.id} ${p.word}: 「${p.before}」→ ${label} 「${p.after}」`);
            }
        }
        if (plan.length > shown.length) {
            console.log(`📖 [回填释义]   …另有 ${plan.length - shown.length} 条，未逐条打印`);
        }
    }

    return report;
}

// ==================== word_cache 相关 ====================

function getWordFromCache(word) {
    const row = db.prepare('SELECT * FROM word_cache WHERE word = ?').get(word.toLowerCase());
    return row || null;
}

function getCachedWordsList(words) {
    if (!words || words.length === 0) return [];
    const placeholders = words.map(() => '?').join(',');
    return db.prepare(`SELECT word, definition FROM word_cache WHERE word IN (${placeholders})`).all(...words);
}

function saveWordsToCache(wordList) {
    // wordList: { word: meaning } 对象；同一单词同释义去重后插入
    if (!wordList || typeof wordList !== 'object') return 0;
    let added = 0;
    const existsStmt = db.prepare('SELECT 1 FROM word_cache WHERE word = ? AND definition = ? LIMIT 1');
    const stmt = db.prepare('INSERT INTO word_cache (word, definition, part_of_speech, is_academic) VALUES (?, ?, ?, 0)');
    const tx = db.transaction((entries) => {
        for (const [word, meaning] of entries) {
            const key = word.toLowerCase();
            const val = typeof meaning === 'string' ? meaning : JSON.stringify(meaning);
            if (existsStmt.get(key, val)) continue;
            stmt.run(key, val, null);
            added++;
        }
    });
    tx(Object.entries(wordList));
    return added;
}

function getWordMeaningFromCache(words) {
    // 返回 { word: definition } 对象（取第一条释义，兼容文章单词展示）
    const rows = getCachedWordsList(words);
    const result = {};
    for (const r of rows) result[r.word] = r.definition;
    return result;
}

function getWordDefinitions(word) {
    // 返回该单词的所有释义 [{ definition, part_of_speech }]
    return db.prepare('SELECT definition, part_of_speech FROM word_cache WHERE word = ? ORDER BY id').all(word.toLowerCase());
}

function addWordDefinition(word, definition, partOfSpeech) {
    const key = word.toLowerCase();
    const info = db.prepare('INSERT INTO word_cache (word, definition, part_of_speech, is_academic) VALUES (?, ?, ?, 0)')
        .run(key, definition, partOfSpeech || null);
    return { id: info.lastInsertRowid, word: key, definition: definition, part_of_speech: partOfSpeech || null };
}

// ==================== word_context 相关（RAG 语境库） ====================

// 检索：word + 当前句子（语境）命中则返回该语境下的释义（跳过 definition 为空的占位行）
function getWordContext(word, context) {
    if (!context) return null;
    const key = word.toLowerCase().trim();
    const ctx = String(context).trim();
    if (!key || !ctx) return null;
    return db.prepare('SELECT * FROM word_context WHERE word = ? AND context = ? AND definition IS NOT NULL AND definition <> \'\' ORDER BY id DESC LIMIT 1')
        .get(key, ctx) || null;
}

/**
 * 取该词的全部候选语境行 —— 只给「精确匹配失败后的归一化兜底比对」用（2026-10-08）。
 *
 * 为什么需要：`getWordContext` 要求 `word + context` **逐字符相等**才命中，
 * 而正文里的句子与当年写进库的句子常因「空格/标点/站标 [xxx]」不同而匹配不上
 * （本项目已踩过同类坑：前端 `sentenceMatches` 靠 `squashSentence` 才做到 17/17）。
 * 收藏释义要优先取「本句语境释义」，这条兜底直接决定能不能取到。
 *
 * 代价可控：只在 `word` 内、`definition` 非空的行里比，且带 LIMIT（默认 200，上限 2000）。
 * 只在精确匹配 miss 之后才调用，热路径（精确命中）零影响。
 */
function getWordContextCandidates(word, limit) {
    const key = String(word || '').toLowerCase().trim();
    if (!key) return [];
    const n = Math.max(1, Math.min(Number(limit) || 200, 2000));
    return db.prepare(`
        SELECT id, word, context, definition, part_of_speech, article_id
        FROM word_context
        WHERE word = ? AND definition IS NOT NULL AND definition <> ''
        ORDER BY id DESC LIMIT ?
    `).all(key, n);
}

// 保存一条语境释义（同一 word + context + definition + article_id 去重；definition 允许为空占位，后续补全）
function saveWordContext(word, context, definition, partOfSpeech, articleId) {
    const key = word.toLowerCase().trim();
    const ctx = String(context || '').trim();
    const def = (definition == null ? '' : String(definition)).trim();
    const aid = articleId ? String(articleId) : null;
    if (!key || !ctx) return null;
    const exists = db.prepare('SELECT 1 FROM word_context WHERE word = ? AND context = ? AND definition = ? AND IFNULL(article_id, \'\') = ? LIMIT 1')
        .get(key, ctx, def, aid || '');
    if (exists) return null;
    const info = db.prepare(`INSERT INTO word_context (word, context, definition, part_of_speech, article_id, updated_at)
                             VALUES (?, ?, ?, ?, ?, datetime('now'))`)
        .run(key, ctx, def, partOfSpeech || null, aid);
    return { id: info.lastInsertRowid, word: key, context: ctx, definition: def, part_of_speech: partOfSpeech || null, article_id: aid };
}

// 扫描 word_context 中 definition 为空的词（去重），返回 [{word, context}]；传 articleId 则只扫该文章
function getWordContextEmptyDefinitions(articleId) {
    if (articleId) {
        return db.prepare(`
            SELECT DISTINCT word, context FROM word_context
            WHERE (definition IS NULL OR definition = '') AND article_id = ?
            ORDER BY id
        `).all(String(articleId));
    }
    return db.prepare(`
        SELECT DISTINCT word, context FROM word_context
        WHERE definition IS NULL OR definition = ''
        ORDER BY id
    `).all();
}

// 按 word + context（+ 文章）补全空释义：同一词在不同语境下释义不同，需一并匹配，避免混淆
function updateWordContextDefinitionByWordAndContext(word, context, articleId, definition, partOfSpeech) {
    const key = word.toLowerCase().trim();
    const ctx = String(context || '').trim();
    const def = (definition == null ? '' : String(definition)).trim();
    if (!key || !ctx || !def) return 0;
    let info;
    if (articleId) {
        info = db.prepare(`
            UPDATE word_context SET definition = ?, part_of_speech = ?, updated_at = datetime('now')
            WHERE word = ? AND context = ? AND article_id = ? AND (definition IS NULL OR definition = '')
        `).run(def, partOfSpeech || null, key, ctx, String(articleId));
    } else {
        info = db.prepare(`
            UPDATE word_context SET definition = ?, part_of_speech = ?, updated_at = datetime('now')
            WHERE word = ? AND context = ? AND article_id IS NULL AND (definition IS NULL OR definition = '')
        `).run(def, partOfSpeech || null, key, ctx);
    }
    return info.changes;
}

// 批量保存语境释义（list: [{word, context, definition, part_of_speech}]）
function saveWordContextList(list, articleId) {
    if (!Array.isArray(list) || list.length === 0) return 0;
    let added = 0;
    const tx = db.transaction((items) => {
        for (const item of items) {
            if (!item || !item.word) continue;
            if (saveWordContext(item.word, item.context, item.definition, item.part_of_speech, articleId)) added++;
        }
    });
    tx(list);
    return added;
}

// ==================== word_context ↔ 知识库同步（增量候选 / 已上传标记） ====================

// better-sqlite3 是同步 API，退避只能同步阻塞睡（Atomics.wait 在 Node 主线程可用）
const _sleepBuf = new Int32Array(new SharedArrayBuffer(4));
function sleepSync(ms) {
    try { Atomics.wait(_sleepBuf, 0, 0, ms); } catch (e) { /* 极端环境下退化为不睡 */ }
}

function isBusyError(e) {
    const code = String((e && e.code) || '');
    const msg = String((e && e.message) || e);
    return /SQLITE_BUSY|SQLITE_LOCKED/i.test(code) || /database is locked|SQLITE_BUSY|SQLITE_LOCKED/i.test(msg);
}

/**
 * 写操作遇到 SQLITE_BUSY / SQLITE_LOCKED 时退避重试（100ms → 200ms → 400ms）
 * server.js 与同步脚本并发写同一个库时用得上；纯 SELECT 在 WAL 下不需要。
 * ⚠️ 只能包「短、纯同步」的操作，绝不能把 await 网络请求放进来。
 */
function withBusyRetry(fn, tries = 4) {
    const max = Math.max(1, Number(tries) || 1);
    let lastErr = null;
    for (let i = 0; i < max; i++) {
        try {
            return fn();
        } catch (e) {
            if (!isBusyError(e)) throw e;
            lastErr = e;
            if (i + 1 >= max) break;
            sleepSync(100 * Math.pow(2, i));
        }
    }
    throw lastErr;
}

// 增量判据（内容级，不依赖时钟）：
//   1) 从未同步过（kb_synced_at IS NULL）—— 覆盖新词，以及「原先空释义占位、后来被补全」的行
//   2) 或释义变了（kb_synced_definition <> definition）
// 用内容判据而不是时间判据，是因为 created_at 不随更新变化、updated_at 只有秒级精度，
// 严格 > 比较会在同秒并列时漏行；内容比较天然幂等、不会漏。
const UNSYNCED_WHERE = `
    definition IS NOT NULL AND definition <> ''
    AND (kb_synced_at IS NULL OR kb_synced_definition IS NULL OR kb_synced_definition <> definition)`;

/** 需要同步到知识库的记录（增量候选），按 id 升序 */
function getUnsyncedWordContext(limit) {
    const n = Number(limit) || 0;
    const sql = `SELECT id, word, context, definition, part_of_speech, updated_at
                 FROM word_context WHERE ${UNSYNCED_WHERE} ORDER BY id ASC` + (n ? ' LIMIT ?' : '');
    return n ? db.prepare(sql).all(n) : db.prepare(sql).all();
}

/** 全量快照用：取最近 N 条（先按 id 倒序取，再翻回升序） */
function getRecentWordContext(limit) {
    const n = Number(limit) || 0;
    if (!n) {
        return db.prepare(`SELECT id, word, context, definition, part_of_speech, updated_at
                           FROM word_context WHERE definition IS NOT NULL AND definition <> ''
                           ORDER BY id ASC`).all();
    }
    return db.prepare(`SELECT * FROM (
            SELECT id, word, context, definition, part_of_speech, updated_at
            FROM word_context WHERE definition IS NOT NULL AND definition <> ''
            ORDER BY id DESC LIMIT ?
        ) ORDER BY id ASC`).all(n);
}

/** 有效记录总数 */
function countWordContext() {
    return db.prepare("SELECT COUNT(*) AS c FROM word_context WHERE definition IS NOT NULL AND definition <> ''").get().c;
}

/** 待同步（增量候选）总数 */
function countUnsyncedWordContext() {
    return db.prepare(`SELECT COUNT(*) AS c FROM word_context WHERE ${UNSYNCED_WHERE}`).get().c;
}

/**
 * 批量标记「已同步到知识库」（上传成功后调用）
 * ⚠️ 单事务、纯同步，绝不能包含 await：上传超时可达 120s，
 *    一旦在事务里等网络，写锁会持有多达数分钟，把 server.js 的写入打成 SQLITE_BUSY。
 * @param {Array<{id:number, definition:string}>} rows
 * @returns {number} 实际标记的条数
 */
function markWordContextSynced(rows) {
    const list = Array.isArray(rows) ? rows.filter(r => r && r.id != null) : [];
    if (list.length === 0) return 0;
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');   // 与 datetime('now') 同格式(UTC)
    const stmt = db.prepare('UPDATE word_context SET kb_synced_at = ?, kb_synced_definition = ? WHERE id = ?');
    const tx = db.transaction((items) => {
        let n = 0;
        for (const r of items) n += stmt.run(now, r.definition == null ? '' : String(r.definition), r.id).changes;
        return n;
    });
    return tx(list);
}

/**
 * 首次引导：把现有全部有效记录标记为「已同步」
 * 用于「知识库此前已通过 --full 上传过全量数据」的场景，
 * 否则第一次增量同步会把整库重传一遍。
 */
function seedAllWordContextSynced() {
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    return db.prepare(`UPDATE word_context SET kb_synced_at = ?, kb_synced_definition = definition
                       WHERE definition IS NOT NULL AND definition <> ''`).run(now).changes;
}

/** KPI：已同步 / 未同步 计数（给 /api/kb/stats 用） */
function getWordContextSyncStats() {
    const total = countWordContext();
    const pending = countUnsyncedWordContext();
    return { total, pending, synced: total - pending };
}

// ==================== learning_records 相关 ====================

function recordLearning(userId, date, wordsLearned, quizScore, timeSpent) {
    db.prepare(`
        INSERT INTO learning_records (user_id, date, words_learned, quiz_score, time_spent)
        VALUES (?, ?, ?, ?, ?)
    `).run(userId, date, wordsLearned || 0, quizScore || null, timeSpent || 0);
}

// ==================== 迁移逻辑 ====================

function migratePresetArticles() {
    const presetPath = path.join(__dirname, 'data', 'reading_materials.json');
    if (!fs.existsSync(presetPath)) {
        console.warn('⚠️  预置文章文件不存在，跳过迁移:', presetPath);
        return;
    }
    const articles = JSON.parse(fs.readFileSync(presetPath, 'utf-8'));
    const defaultUser = getOrCreateUser(null);
    let inserted = 0;
    for (const a of articles) {
        const exists = getArticleById(a.id);
        if (exists) continue;
        insertArticle({
            id: a.id,
            user_id: defaultUser.id,
            title: a.title,
            description: a.description || '',
            content: a.article,
            source: 'preset',
            level: a.level,
            level_label: a.levelLabel,
            status: 'completed',
            questions: a.questions || [],
            sentences: a.sentences || a.sentenceList || []
        });
        inserted++;
    }
    if (inserted > 0) console.log(`📚 迁移 ${inserted} 篇预置文章到 articles 表`);
}

function migrateWordCacheJson() {
    const jsonPath = path.join(__dirname, 'word_cache.json');
    if (!fs.existsSync(jsonPath)) return;  // 旧 JSON 不存在，跳过
    try {
        const cache = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        let added = 0;
        for (const [word, val] of Object.entries(cache)) {
            const meaning = typeof val === 'string' ? val : (val.meaning || JSON.stringify(val));
            const isAcademic = typeof val === 'object' ? (val.isAcademic ? 1 : 0) : 0;
            const info = db.prepare('INSERT OR IGNORE INTO word_cache (word, definition, part_of_speech, is_academic) VALUES (?, ?, ?, ?)')
                           .run(word.toLowerCase(), meaning, null, isAcademic);
            if (info.changes > 0) added++;
        }
        if (added > 0) console.log(`💾 迁移 ${added} 个单词从 word_cache.json 到 word_cache 表`);
    } catch (e) {
        console.warn('⚠️  迁移 word_cache.json 失败:', e.message);
    }
}

/**
 * 迁移前端的 localStorage 数据（由前端通过 /api/migrate 接口上传）
 * 入参：collectedWords 数组（对象），username
 */
function migrateLocalCollectedWords(userId, collectedWords) {
    if (!collectedWords || collectedWords.length === 0) return 0;
    let added = 0;
    for (const w of collectedWords) {
        const result = insertUserWord({
            user_id: userId,
            word: w.word,
            definition: w.meaning || w.definition || null,
            sentence: w.sentence || null,
            article_id: w.articleId || null,
            paragraph_index: w.paragraphIndex || 0,
            sentence_index: w.sentenceIndex || 0,
            status: w.status || 'pending',
            knowledge: w.knowledge !== undefined ? w.knowledge : 0,
            collected_at: w.collectedAt || new Date().toISOString()
        });
        if (result.success) added++;
    }
    console.log(`📥 迁移 ${added} 个本地收藏单词到 user_words 表`);
    return added;
}

// ==================== dictionary 相关（ECDICT 词典库，独立文件） ====================
//
// 与 word_context 的分工：
//   word_context —— 「这个词在这句话里是什么意思」，只有文章里出现过的语境才有
//   dictionary   —— 「这个词总共有哪些意思」，全量词典，不依赖任何文章
// 点词时两者同时查、并列展示：语境释义优先，词典释义作为「其他释义」补充。

let dictDb = null;
let dictDbState = 'unprobed';   // unprobed | ready | missing | broken

/**
 * 懒加载词典库连接（只读）。
 * 词典文件缺失时返回 null，并且只告警一次 —— 这样「没导词典」不影响其它功能，
 * 点词会自然降级到 word_context / AI 两层。
 */
function getDictDb() {
    if (dictDb) return dictDb;
    if (dictDbState !== 'unprobed') return null;

    try {
        if (!fs.existsSync(DICT_PATH)) {
            dictDbState = 'missing';
            console.warn(`📖 [词典库] 未找到 ${DICT_PATH} —— 点词只能给语境释义。请运行: npm run dict:import`);
            return null;
        }
        const conn = new Database(DICT_PATH, { readonly: true, fileMustExist: true });
        conn.pragma('busy_timeout = 3000');
        const hasTable = conn.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='dictionary' LIMIT 1").get();
        if (!hasTable) {
            conn.close();
            dictDbState = 'broken';
            console.warn(`📖 [词典库] ${DICT_PATH} 里没有 dictionary 表（文件损坏或导入了半个）—— 请重跑: npm run dict:import`);
            return null;
        }
        const count = conn.prepare('SELECT COUNT(*) AS c FROM dictionary').get().c;
        dictDb = conn;
        dictDbState = 'ready';
        console.log(`📖 [词典库] 已加载 ${count} 词条 → ${DICT_PATH}`);
        return dictDb;
    } catch (err) {
        dictDbState = 'broken';
        console.warn(`📖 [词典库] 打开失败（${err.message}）—— 点词降级到语境释义。请重跑: npm run dict:import`);
        return null;
    }
}

// ECDICT 的 exchange 字段编码：类型 → 中文说明
const EXCHANGE_TYPES = {
    p: '过去式',
    d: '过去分词',
    i: '现在分词',
    '3': '第三人称单数',
    r: '比较级',
    t: '最高级',
    s: '复数'
};

/**
 * 把 exchange 字符串解析成词形变化数组
 * 例：`p:went/d:gone/3:goes/i:going/0:go/1:p` → [{type:'p',label:'过去式',value:'went'}, ...]
 * 「0:」是原形、「1:」是原形的变换形式标记，都不是词形变化本身，故排除。
 */
function parseExchange(exchange) {
    if (!exchange) return [];
    const out = [];
    for (const part of String(exchange).split('/')) {
        const i = part.indexOf(':');
        if (i <= 0) continue;
        const type = part.slice(0, i).trim();
        const value = part.slice(i + 1).trim();
        if (!EXCHANGE_TYPES[type] || !value) continue;
        out.push({ type, label: EXCHANGE_TYPES[type], value });
    }
    return out;
}

/**
 * ECDICT 音标是老式 ASCII/IPA 混写（如 `'betә`），做一次保守转写让它能正常显示。
 * 只做「一对一无歧义」的替换，不改动音素本身：
 *   ' → ˈ 主重音    , → ˌ 次重音    ә(U+04D9 西里尔字母) → ə(U+0259 IPA)    : → ː 长音
 * 注意：ECDICT 以英式音标为主，`better` 是 `ˈbetə` 而非美式 `ˈbetər`，这是数据本身如此，不是 bug。
 */
function prettyPhonetic(phonetic) {
    if (!phonetic) return null;
    return String(phonetic)
        .replace(/'/g, 'ˈ')
        .replace(/,/g, 'ˌ')
        .replace(/ә/g, 'ə')
        .replace(/:/g, 'ː')
        .trim() || null;
}

// ECDICT 的中文义项以「词性缩写」打头（`a. 小的，很少的` / `ad. 很快地` / `n. 猫`）。
// 其中 `a.` 是 adjective、`ad.` 是 adverb —— 这是老式英汉词典的写法，
// 但国内教材 / 现代词典普遍用 `adj.` / `adv.`，直接显示 `a. 小的` 会让学生看不懂。
// 这里做**只改行首那一个词性标记**的保守归一：后面的正文一个字都不动。
// 必须要求标记后面紧跟空格或整行结束 —— 否则会把单词本身（如 `a` 这个词条、`art. 艺术`）误伤。
const POS_ABBR_MAP = {
    'a.': 'adj.', 'adj.': 'adj.',
    'ad.': 'adv.', 'adv.': 'adv.',
    'n.': 'n.', 'v.': 'v.',
    'vi.': 'vi.', 'vt.': 'vt.', 'aux.': 'aux.',
    'prep.': 'prep.', 'conj.': 'conj.', 'pron.': 'pron.',
    'num.': 'num.', 'art.': 'art.',
    'int.': 'interj.', 'interj.': 'interj.',
    'abbr.': 'abbr.', 'pl.': 'pl.', 'auxiliary': 'aux.'
};

function normalizePosAbbr(line) {
    const s = String(line == null ? '' : line);
    // 行首：一串字母 + 可选的句点，后面必须是空格或行尾
    const m = s.match(/^\s*([A-Za-z]+\.?)(?=\s|$)/);
    if (!m) return s;
    const raw = m[1].toLowerCase();
    const key = raw.endsWith('.') ? raw : raw + '.';
    const mapped = POS_ABBR_MAP[key];
    if (!mapped || mapped === m[1]) return s;
    return mapped + s.slice(m[1].length);
}

/**
 * 把 DB 行整理成前端直接能渲染的结构。
 * translation / definition 都是「一行一个义项」，前端按行渲染成列表，所以这里先拆好。
 *
 * ⚠️ ECDICT 的义项分隔符是 **字面量 `\n`**（反斜杠 + n 两个字符，hex 5c 6e），
 * 不是真的换行符 —— 用 `split('\n')` 拆会得到一整条，必须按 /\\n/ 拆。
 * 这里同时兼容真换行（\r?\n），防止以后换数据源踩坑。
 */
function parseDictionaryRow(row) {
    if (!row) return null;
    const splitLines = (s) => String(s || '')
        .split(/\\n|\r?\n/)
        .map(x => x.trim())
        .map(normalizePosAbbr)     // `a. 小的` → `adj. 小的`（只动行首词性标记）
        .filter(Boolean);
    const translation = row.translation || '';
    const definition = row.definition || '';
    const forms = parseExchange(row.exchange);
    return {
        word: row.word,
        phonetic: row.phonetic || null,
        phoneticPretty: prettyPhonetic(row.phonetic),
        // 中文释义：拆行后的数组 + 原文（前端想自己处理也能拿到）
        translation: translation || null,
        translationLines: splitLines(translation),
        definition: definition || null,
        definitionLines: splitLines(definition),
        pos: row.pos || null,
        collins: row.collins || 0,
        oxford: row.oxford || 0,
        tag: row.tag ? row.tag.trim() : null,
        tagList: row.tag ? row.tag.trim().split(/\s+/).filter(Boolean) : [],
        bnc: row.bnc || 0,
        frq: row.frq || 0,
        exchange: row.exchange || null,
        forms,
        lemma: row.lemma || null
    };
}

// ==================== 词典兜底：撇号 / 缩写 / 所有格 ====================
// 实测 ECDICT **一条含撇号的词条都没有**（`LIKE '%''%'` = 0 行），
// 于是 don't / isn't / o'clock / what's 这些初中最高频的词点上去全是「未收录」。
// 这张表把常见缩写映射到「展开写法 + 该用哪个实词的词条」，
// 命中后就展示「＝ do not」+ do 的完整释义，而不是干巴巴一句「本地词典未收录该词」。
// head 必须是词典里确定收录的词（单字母 I 未收录，所以 I'm 取 am、I'll 取 will）。
const CONTRACTIONS = {
    "don't": { expand: 'do not', head: 'do' },
    "doesn't": { expand: 'does not', head: 'do' },
    "didn't": { expand: 'did not', head: 'do' },
    "isn't": { expand: 'is not', head: 'be' },
    "aren't": { expand: 'are not', head: 'be' },
    "wasn't": { expand: 'was not', head: 'be' },
    "weren't": { expand: 'were not', head: 'be' },
    "can't": { expand: 'cannot', head: 'can' },
    "cannot": { expand: '', head: 'can' },
    "couldn't": { expand: 'could not', head: 'could' },
    "won't": { expand: 'will not', head: 'will' },
    "wouldn't": { expand: 'would not', head: 'would' },
    "shouldn't": { expand: 'should not', head: 'should' },
    "mustn't": { expand: 'must not', head: 'must' },
    "hasn't": { expand: 'has not', head: 'have' },
    "haven't": { expand: 'have not', head: 'have' },
    "hadn't": { expand: 'had not', head: 'have' },
    "it's": { expand: 'it is', head: 'it' },
    "that's": { expand: 'that is', head: 'that' },
    "there's": { expand: 'there is', head: 'there' },
    "what's": { expand: 'what is', head: 'what' },
    "who's": { expand: 'who is', head: 'who' },
    "where's": { expand: 'where is', head: 'where' },
    "he's": { expand: 'he is', head: 'he' },
    "she's": { expand: 'she is', head: 'she' },
    "they're": { expand: 'they are', head: 'they' },
    "we're": { expand: 'we are', head: 'we' },
    "you're": { expand: 'you are', head: 'you' },
    "i'm": { expand: 'I am', head: 'am' },
    "i've": { expand: 'I have', head: 'have' },
    "i'll": { expand: 'I will', head: 'will' },
    "i'd": { expand: 'I would', head: 'would' },
    "let's": { expand: 'let us', head: 'let' },
    "o'clock": { expand: 'of the clock', head: 'clock' }
};

/** 查缩写表（先按原样、再按弯引号归一化后的样子） */
function lookupContraction(key) {
    if (CONTRACTIONS[key]) return CONTRACTIONS[key];
    if (/[’‘]/.test(key)) {
        const straight = key.replace(/[’‘]/g, "'");
        if (CONTRACTIONS[straight]) return CONTRACTIONS[straight];
    }
    return null;
}

// 点查语句缓存（better-sqlite3 的 prepare 有开销，热路径必须复用）
let _dictStmts = null;
function dictStmts() {
    const conn = getDictDb();
    if (!conn) return null;
    if (!_dictStmts) {
        _dictStmts = {
            byWord: conn.prepare('SELECT * FROM dictionary WHERE word = ? LIMIT 1'),
            byLemma: conn.prepare('SELECT * FROM dictionary WHERE lemma = ? AND bnc > 0 ORDER BY bnc LIMIT 1')
        };
    }
    return _dictStmts;
}

/**
 * 查一个词的全部释义。
 * @param {string} word
 * @param {{withLemma?: boolean}} [opts] withLemma=false 时不做原形补全（默认做）
 * @returns {object|null} parseDictionaryRow 的结果；词典未导入 / 查不到 → null
 */
function getDictionaryEntry(word, opts = {}) {
    const stmts = dictStmts();
    if (!stmts) return null;
    const key = String(word || '').trim().toLowerCase();
    if (!key) return null;

    try {
        let row = stmts.byWord.get(key);
        let via = null;          // 命中的是哪种兜底（排查 / 前端可提示）
        let contraction = null;  // 缩写展开式，如 don't → do not

        // 兜底一：弯引号归一化（文章正文里常是 ’ U+2019，词典里只会是 ' U+0027）
        if (!row && /[’‘]/.test(key)) {
            const straight = key.replace(/[’‘]/g, "'");
            row = stmts.byWord.get(straight);
            if (row) via = 'apostrophe';
        }

        // 兜底二：缩写展开（词典里 0 条含撇号词条 → don't / isn't / o'clock 本来全都查不到）
        if (!row) {
            const c = lookupContraction(key);
            if (c) {
                const base = stmts.byWord.get(c.head);
                if (base) {
                    row = base;
                    via = 'contraction';
                    contraction = c.expand || null;
                }
            }
        }

        // 兜底三：所有格（student's / students' / James' → student / student / james）
        if (!row && /['’]s?$/.test(key)) {
            const base = key.replace(/['’]s?$/, '');
            if (base && base !== key) {
                row = stmts.byWord.get(base);
                if (row) via = 'possessive';
            }
        }

        // 兜底四：去掉所有撇号再试（rock'n'roll → rocknroll）
        if (!row && /['’]/.test(key)) {
            const stripped = key.replace(/['’]/g, '');
            if (stripped) {
                row = stmts.byWord.get(stripped);
                if (row) via = 'apostrophe-stripped';
            }
        }

        // 兜底五：连字符词取首段（well-known → well）
        if (!row && key.includes('-')) {
            const head = key.split('-').filter(Boolean)[0];
            if (head && head !== key) {
                row = stmts.byWord.get(head);
                if (row) via = 'hyphen-head';
            }
        }
        if (!row) return null;

        const parsed = parseDictionaryRow(row);
        // 记下这次是靠兜底命中的：前端可以据此提示「这个词是从 student's 找到的」
        if (parsed) {
            parsed.query = key;
            parsed.via = via;                  // null = 直接命中
            parsed.contraction = contraction;  // 'do not' / 'I am' / ...
        }

        // 变形词补全：点 went 时，除了 went 自己的释义，再把原形 go 的完整词条挂上，
        // 前端可以显示「原形 go → 更多释义」。只在原形存在且不是它自己时才做。
        // 缩写兜底（via=contraction）不打原形 —— 那会把 have 的变形表挂到 is 上面，纯噪音。
        if (parsed && opts.withLemma !== false && parsed.lemma && parsed.lemma !== parsed.word && !contraction) {
            const lr = stmts.byWord.get(parsed.lemma);
            if (lr) parsed.lemmaEntry = parseDictionaryRow(lr);
        }
        return parsed;
    } catch (err) {
        console.warn(`📖 [词典库] 查询失败 word=${key}: ${err.message}`);
        return null;
    }
}

/**
 * 批量查词（预取用）。一次 SQL 拿完，避免 N 次往返。
 * @param {string[]} words
 * @returns {Object<string, object>} { word: parseDictionaryRow(...) }
 */
function getDictionaryEntries(words) {
    const out = {};
    if (!Array.isArray(words) || words.length === 0) return out;
    const stmts = dictStmts();
    if (!stmts) return out;

    const keys = Array.from(new Set(words.map(w => String(w || '').trim().toLowerCase()).filter(Boolean)));
    if (keys.length === 0) return out;
    const conn = getDictDb();

    try {
        // SQLite 变量上限（默认 32766），留足余量分片
        const CHUNK = 500;
        for (let i = 0; i < keys.length; i += CHUNK) {
            const slice = keys.slice(i, i + CHUNK);
            const ph = slice.map(() => '?').join(',');
            const rows = conn.prepare(`SELECT * FROM dictionary WHERE word IN (${ph})`).all(...slice);
            for (const r of rows) {
                const parsed = parseDictionaryRow(r);
                if (parsed.lemma && parsed.lemma !== parsed.word) {
                    const lr = stmts.byWord.get(parsed.lemma);
                    if (lr) parsed.lemmaEntry = parseDictionaryRow(lr);
                }
                out[r.word] = parsed;
            }
        }
        // 少数没命中的（带撇号 / 连字符的词）走单查，量很小
        for (const k of keys) {
            if (!out[k]) {
                const one = getDictionaryEntry(k);
                if (one) out[k] = one;
            }
        }
        return out;
    } catch (err) {
        console.warn(`📖 [词典库] 批量查询失败: ${err.message}`);
        return out;
    }
}

// 保留接口：按原形反查（供排障 / 后续词形归一化用）
function getDictionaryByLemma(lemma) {
    const stmts = dictStmts();
    if (!stmts) return null;
    const key = String(lemma || '').trim().toLowerCase();
    if (!key) return null;
    try {
        return parseDictionaryRow(stmts.byLemma.get(key)) || null;
    } catch (err) {
        return null;
    }
}

function countDictionary() {
    const conn = getDictDb();
    if (!conn) return 0;
    try {
        return conn.prepare('SELECT COUNT(*) AS c FROM dictionary').get().c;
    } catch (err) {
        return 0;
    }
}

/**
 * 词典库运行状态（供 /health、/api/dictionary/stats 用）
 */
function getDictionaryStats() {
    const conn = getDictDb();
    let fileSizeMb = 0;
    try { if (fs.existsSync(DICT_PATH)) fileSizeMb = Math.round(fs.statSync(DICT_PATH).size / 1024 / 1024 * 10) / 10; } catch (err) { /* 忽略 */ }

    if (!conn) {
        return { ready: false, state: dictDbState, path: DICT_PATH, entries: 0, fileSizeMb };
    }
    try {
        const row = conn.prepare(`SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN translation IS NOT NULL AND translation <> '' THEN 1 ELSE 0 END) AS withTranslation,
            SUM(CASE WHEN phonetic IS NOT NULL AND phonetic <> '' THEN 1 ELSE 0 END) AS withPhonetic,
            SUM(CASE WHEN tag IS NOT NULL AND tag <> '' THEN 1 ELSE 0 END) AS tagged,
            SUM(CASE WHEN oxford = 1 THEN 1 ELSE 0 END) AS oxford3000,
            SUM(CASE WHEN collins > 0 THEN 1 ELSE 0 END) AS withCollins
            FROM dictionary`).get();
        return {
            ready: true,
            state: 'ready',
            path: DICT_PATH,
            entries: row.total,
            withTranslation: row.withTranslation,
            withPhonetic: row.withPhonetic,
            tagged: row.tagged,
            oxford3000: row.oxford3000,
            withCollins: row.withCollins,
            fileSizeMb
        };
    } catch (err) {
        return { ready: false, state: 'broken', path: DICT_PATH, entries: 0, fileSizeMb, error: err.message };
    }
}

// ==================== 启动初始化 ====================

function bootstrap() {
    initDB();
    migrateWordCacheJson();
    migratePresetArticles();
    // 确保默认用户存在
    getOrCreateUser(null);
    console.log(`📊 当前数据: 文章 ${listArticles().length} 篇, 单词缓存 ${db.prepare('SELECT COUNT(*) as c FROM word_cache').get().c} 个`);
    // 词典库状态：没导入只告警不报错（点词会降级到语境释义 / AI）
    const dict = getDictionaryStats();
    console.log(`📖 [词典库] 路径: ${DICT_PATH}  [来源: ${DICT_PATH_SOURCE === 'default' ? '默认值（未配置 DICTIONARY_PATH）' : '环境变量 ' + DICT_PATH_SOURCE}]`);
    if (dict.ready) {
        console.log(`📖 词典库: ${dict.entries} 词条 | ${dict.fileSizeMb} MB | 含音标 ${dict.withPhonetic} | 含中文释义 ${dict.withTranslation}`);
    } else {
        console.warn(`📖 词典库未就绪（${dict.state}）—— 只有语境释义。导入: npm run dict:import`);
    }
}

module.exports = {
    db,
    bootstrap,
    // 数据文件路径（部署时可配置：DB_PATH / DATABASE_PATH / DICTIONARY_PATH）
    DB_PATH,                // app.db 的绝对路径（server.js 启动日志 / 维护脚本备份用）
    DB_PATH_SOURCE,         // 'DB_PATH' | 'DATABASE_PATH' | 'default'
    DICT_PATH_SOURCE,       // 'DICTIONARY_PATH' | 'default'
    resolveDataPath,        // 单测/脚本复用：按优先级解析 env 路径
    // dictionary（ECDICT 词典库，独立文件 data/dictionary.db）
    DICT_PATH,
    getDictDb,
    getDictionaryEntry,
    getDictionaryEntries,
    getDictionaryByLemma,
    countDictionary,
    getDictionaryStats,
    parseDictionaryRow,     // 单测用：验证 translation 拆行 / exchange 解析
    parseExchange,
    prettyPhonetic,
    normalizePosAbbr,       // `a. 小的` → `adj. 小的`；单测用
    // 用户
    getOrCreateUser,
    updateUserStreak,
    updateUserLevel,
    // 文章
    insertArticle,
    getArticleById,
    updateArticleStatus,
    updateArticleQuestions,
    updateArticleSentences,   // 只重跑句子翻译用：只改 sentences/status/sentences_error，绝不动 questions
    listArticles,
    listArticlesPaged,
    countWords,
    // 文章去重清理（2026-10-06）
    cleanupDuplicateArticles,
    normalizeArticleTitleKey,   // 单测用：验证标题分组键
    articleHasTranslation,
    compareArticleForKeep,      // 单测用：验证「保留哪一篇」的取舍顺序
    pickUserWordWinner,         // 单测用：验证收藏合并时谁留谁走
    // user_words
    insertUserWord,
    isWordCollectedInSentence,
    getUserWords,
    updateUserWordStatus,
    deleteUserWords,        // 取消收藏（按 user_id + word [+ article_id] [+ sentence]）
    deleteUserWordById,     // 取消收藏（按主键，带 user_id 归属校验）
    knowledgeByStatus,
    backfillUserWordDefinitions,   // 一次性回填占位释义（dictionary 优先 → word_context → 空串）
    isRealUserWordDefinition,      // 单测用：判断释义是不是「真释义」
    // word_cache
    getWordFromCache,
    getCachedWordsList,
    saveWordsToCache,
    getWordMeaningFromCache,
    getWordDefinitions,
    addWordDefinition,
    // word_context（RAG 语境库）
    getWordContext,
    getWordContextCandidates,
    saveWordContext,
    saveWordContextList,
    getWordContextEmptyDefinitions,
    updateWordContextDefinitionByWordAndContext,
    // word_context ↔ 知识库同步
    getUnsyncedWordContext,
    getRecentWordContext,
    countWordContext,
    countUnsyncedWordContext,
    markWordContextSynced,
    seedAllWordContextSynced,
    getWordContextSyncStats,
    withBusyRetry,
    // learning_records
    recordLearning,
    // 迁移
    migratePresetArticles,
    migrateWordCacheJson,
    migrateLocalCollectedWords
};
