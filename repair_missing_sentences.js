/**
 * repair_missing_sentences.js —— 批量补全「有正文、却一句译文都没有」的文章
 *
 * 背景（2026-10-08）：coze.js 曾把「模型解析失败」伪装成成功，导致这类文章落
 *   status='completed' + sentences=[] + sentences_error=NULL —— 题目都在、日志也说成功，
 *   但整篇没有译文，用户悬停只能看到「暂无翻译」，且没有重试入口。
 * 该漏洞已修（见 test_sentence_empty_guard.js），但**已受影响的文章仍需补一次译文**。
 *
 * ⚠️ 每篇都会真调一次句子翻译工作流（消耗额度）。所以默认只**干跑列清单**，不动任何数据。
 *
 * 用法：
 *   node repair_missing_sentences.js              # 干跑：只列出待修文章（零消耗）
 *   node repair_missing_sentences.js --yes        # 逐篇补译文（会消耗额度）
 *   node repair_missing_sentences.js --yes --limit=2
 */
const dbOps = require('./db.js');
const queue = require('./queue.js');

const args = process.argv.slice(2);
const RUN = args.indexOf('--yes') !== -1;
const limitArg = args.find(a => a.indexOf('--limit=') === 0);
const LIMIT = limitArg ? Math.max(1, parseInt(limitArg.split('=')[1], 10) || 1) : 0;

// 「含足够英文」判据与 coze/queue 保持一致
function hasEnoughEnglish(text) {
    return ((String(text || '').match(/[A-Za-z]/g) || []).length) >= 20;
}

(async () => {
    const all = dbOps.db.prepare(
        "SELECT id, title, status, source, sentences, sentences_error, content, created_at FROM articles ORDER BY created_at DESC"
    ).all();

    const targets = all.filter(a => {
        let n = 0;
        try { n = JSON.parse(a.sentences || '[]').length; } catch (e) { n = 0; }
        if (n > 0) return false;                       // 已有译文 → 不用管
        if (a.source === 'preset') return false;       // 预置文章本来就不做句子翻译
        if (a.status === 'failed') return false;       // 整篇分析都失败（题目也是降级题）→ 走「重新分析」，不属本脚本范围
        if (!hasEnoughEnglish(a.content)) return false; // 纯中文/无英文 → 本来就没有可翻的句子
        return true;
    });

    console.log(`\n📋 待补译文的文章 = ${targets.length} 篇（有英文正文，但 sentences 为空、且非预置）`);
    targets.forEach((a, i) => {
        const chars = String(a.content || '').length;
        console.log(`  ${i + 1}. ${a.id}`);
        console.log(`     status=${a.status} | source=${a.source} | 正文 ${chars} 字 | 创建于 ${a.created_at}`);
        console.log(`     标题: ${String(a.title || '').slice(0, 60)}`);
        console.log(`     原失败原因: ${a.sentences_error || '（无 —— 正是"静默降级"留下的：当时被当成成功了）'}`);
    });

    if (!RUN) {
        console.log('\n（干跑：未改动任何数据）');
        console.log('要真正补译文，请执行： node repair_missing_sentences.js --yes');
        console.log('⚠️ 每篇都会真调一次句子翻译工作流，会消耗 AI 额度；也可直接在页面上点该文章的「重试」按钮逐篇补。');
        process.exit(0);
    }

    const list = LIMIT ? targets.slice(0, LIMIT) : targets;
    if (list.length === 0) { console.log('\n没有需要补的文章。'); process.exit(0); }

    console.log(`\n🚀 开始逐篇补译文（共 ${list.length} 篇，会消耗额度）…\n`);
    let ok = 0, bad = 0;
    for (const a of list) {
        console.log(`──────── ${a.id} ────────`);
        try {
            const r = await queue.retrySentences(a.id);
            if (r && r.ok) {
                ok++;
                console.log(`✅ ${a.id} | 补到 ${(r.sentences || []).length} 句译文 → status=completed`);
            } else {
                bad++;
                console.log(`❌ ${a.id} | 仍失败（文章保持 partial，可在页面上再点「重试」）| 原因: ${(r && r.sentencesError) || '未知'}`);
            }
        } catch (e) {
            bad++;
            console.log(`❌ ${a.id} | 异常: ${(e && e.message) || e}`);
        }
    }
    console.log(`\n📊 完成：成功 ${ok} 篇 / 失败 ${bad} 篇`);
    process.exit(bad === 0 ? 0 : 1);
})().catch(e => { console.error('脚本异常:', (e && e.stack) || e); process.exit(1); });
