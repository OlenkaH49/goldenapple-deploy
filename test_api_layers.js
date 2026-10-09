/**
 * 接口层验证：在同一个进程里起服务 + 打接口，不后台常驻（避免被敏感保护拦）
 * 覆盖：/health、/api/dictionary/stats、/api/dictionary/:word、/api/dictionary/batch、/api/words/:word（本地/联网两档）
 */
process.env.ACCESS_PASSWORD = '';
process.env.PORT = '49873';

const dbOps = require('./db');
require('./server');

const BASE = 'http://127.0.0.1:49873';
let pass = 0, fail = 0;
function check(name, cond, extra) {
    if (cond) { pass++; console.log(`  PASS  ${name}`); }
    else { fail++; console.log(`  FAIL  ${name}${extra !== undefined ? ' | ' + JSON.stringify(extra) : ''}`); }
}
const get = async (p) => { const r = await fetch(BASE + p); return { status: r.status, body: await r.json() }; };
const post = async (p, b) => { const r = await fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, body: await r.json() }; };

// 找一组「词典里有、但 word_context / word_cache 里都没有」的词 + 本轮唯一语境，验证「词典独中」。
// 语境里必须带时间戳：上一轮跑 ?ai=1 时 AI 会把释义回写进 word_context / word_cache，
// 用固定语境的话下一轮这个「新样本」就变成旧样本了（测试自污染）。
//
// 但「固定候选列表」同样会被污染：AI 回写的是「词」级别（word_cache 不区分语境），
// 只要某轮 ?ai=1 碰过 serendipity，它的 word_cache 行就永久存在，之后所有轮次都选不中。
// 实测 12 个固定候选已经被全部写脏 → 采样失败。所以这里改成两级兜底：
//   ① 先试固定候选（命中时确定性好、词也体面）；
//   ② 固定候选全脏时，从 ECDICT 里随机捞「生僻词」（collins/oxford/tag 全空 = 不在考试词表，
//      AI 回写几乎不可能碰到），再排除 word_cache / word_context 里已有的，取第一个干净的。
// 这样无论被污染多少次都能拿到样本，且无需 DELETE 任何真实数据。
const RUN_TAG = `QA-PROBE-${Date.now()}`;
function findDictOnlyPair() {
    const cacheStmt = dbOps.db.prepare('SELECT 1 FROM word_cache WHERE word = ? LIMIT 1');
    const isClean = (w, ctx) => !dbOps.getWordContext(w, ctx) && !cacheStmt.get(w);

    const cands = ['serendipity', 'photosynthesis', 'turbulence', 'ponderous', 'intricate',
        'withstand', 'alter', 'quaintly', 'briskly', 'versatile', 'nuance', 'resilient'];
    for (const w of cands) {
        const ctx = `${RUN_TAG}-${w}-never-used-in-any-article.`;
        const entry = dbOps.getDictionaryEntry(w);
        if (entry && isClean(w, ctx)) return { word: w, context: ctx, entry };
    }

    // ② 动态兜底：ECDICT 里 5~11 个纯小写字母的生僻词，随机捞 200 个筛到干净为止
    try {
        const dictConn = dbOps.getDictDb();
        if (dictConn) {
            const rows = dictConn.prepare(`
                SELECT word FROM dictionary
                WHERE collins = 0 AND oxford = 0 AND (tag IS NULL OR tag = '')
                  AND translation IS NOT NULL AND translation <> ''
                  AND word GLOB '[a-z]*' AND word NOT GLOB '*[^a-z]*'
                  AND LENGTH(word) BETWEEN 5 AND 11
                ORDER BY RANDOM() LIMIT 200`).all();
            for (const r of rows) {
                const w = r.word;
                const ctx = `${RUN_TAG}-${w}-never-used-in-any-article.`;
                const entry = dbOps.getDictionaryEntry(w);
                if (entry && isClean(w, ctx)) {
                    console.log(`        （固定候选全被 AI 回写污染，改用 ECDICT 随机生僻词：${w}）`);
                    return { word: w, context: ctx, entry };
                }
            }
        }
    } catch (e) {
        console.log(`        （动态采样失败：${e.message}）`);
    }
    return null;
}

(async () => {
    await new Promise(r => setTimeout(r, 1500));

    console.log('\n【① /health】');
    const h = await get('/health');
    check('health 200', h.status === 200);
    check('health.dictionary.ready=true', h.body.dictionary && h.body.dictionary.ready === true, h.body.dictionary && h.body.dictionary.ready);
    check('health.dictionary.entries > 300000', h.body.dictionary && h.body.dictionary.entries > 300000, h.body.dictionary && h.body.dictionary.entries);

    console.log('\n【② /api/dictionary/stats】');
    const st = await get('/api/dictionary/stats');
    check('stats 200 且 ready', st.status === 200 && st.body.ready === true);
    check('含音标词条数 > 100000', st.body.withPhonetic > 100000, st.body.withPhonetic);
    check('含考试标签词条数 > 10000', st.body.tagged > 10000, st.body.tagged);
    check('中文释义覆盖 100%', st.body.withTranslation === st.body.entries, { withTranslation: st.body.withTranslation, entries: st.body.entries });
    console.log(`        词条 ${st.body.entries} | ${st.body.fileSizeMb} MB | 牛津3000 ${st.body.oxford3000} | 柯林斯 ${st.body.withCollins}`);

    console.log('\n【③ /api/dictionary/:word（纯词典层）】');
    const d1 = await get('/api/dictionary/better');
    check('better 命中', d1.body.success === true);
    check('better 有音标', !!(d1.body.entry && d1.body.entry.phonetic), d1.body.entry && d1.body.entry.phonetic);
    check('better 音标已转写为 IPA', d1.body.entry && d1.body.entry.phoneticPretty === 'ˈbetə', d1.body.entry && d1.body.entry.phoneticPretty);
    check('better 中文义项 >= 2 条（字面量反斜杠n 已正确拆行）', d1.body.entry && d1.body.entry.translationLines.length >= 2, d1.body.entry && d1.body.entry.translationLines);
    check('better 英文释义已拆行', d1.body.entry && d1.body.entry.definitionLines.length >= 3, d1.body.entry && d1.body.entry.definitionLines.length);
    check('better 柯林斯 5 星', d1.body.entry && d1.body.entry.collins === 5);
    check('better 牛津3000', d1.body.entry && d1.body.entry.oxford === 1);
    check('better 考试标签含 gk', d1.body.entry && d1.body.entry.tagList.includes('gk'), d1.body.entry && d1.body.entry.tagList);
    check('better 原形 good', d1.body.entry && d1.body.entry.lemma === 'good');
    check('better 词形变化已解析', d1.body.entry && d1.body.entry.forms.length > 0, d1.body.entry && d1.body.entry.forms);
    check('better 点查耗时 < 50ms', d1.body.elapsedMs < 50, d1.body.elapsedMs);
    console.log(`        耗时 ${d1.body.elapsedMs}ms | 音标 /${d1.body.entry.phoneticPretty}/ | 义项 ${d1.body.entry.translationLines.length} 条 | 标签 ${d1.body.entry.tagList.join('/')}`);

    const d2 = await get('/api/dictionary/zzznotaword');
    check('不存在的词 success=false', d2.body.success === false);

    // ECDICT 里 0 条含撇号的词条 → don't / isn't / o'clock 这类初中高频词必须靠兜底表接住
    console.log('\n【③b 撇号兜底（缩写 / 所有格 / 弯引号）】');
    const c1 = await get('/api/dictionary/don%27t');
    check("don't 靠缩写表命中", c1.body.success === true && c1.body.entry.via === 'contraction', c1.body.entry && c1.body.entry.via);
    check("don't 给出展开式 do not", c1.body.entry && c1.body.entry.contraction === 'do not', c1.body.entry && c1.body.entry.contraction);
    check("don't 挂上 do 的释义", c1.body.entry && c1.body.entry.word === 'do' && c1.body.entry.translationLines.length > 0);
    const c2 = await get('/api/dictionary/o%27clock');
    check("o'clock 靠缩写表命中", c2.body.success === true && c2.body.entry.via === 'contraction', c2.body.entry && c2.body.entry.via);
    const c3 = await get('/api/dictionary/student%27s');
    check("student's 靠所有格剥离命中 student", c3.body.success === true && c3.body.entry.via === 'possessive' && c3.body.entry.word === 'student', c3.body.entry && { via: c3.body.entry.via, w: c3.body.entry.word });
    const c4 = await get('/api/dictionary/don%E2%80%99t');   // don’t（弯引号 U+2019）
    check("don’t（弯引号）与 don't 等效", c4.body.success === true && c4.body.entry.contraction === 'do not', c4.body.entry && c4.body.entry.contraction);

    console.log('\n【④ /api/dictionary/batch（预取）】');
    const words = ['shock', 'gradually', 'ponderous', 'quaintly', 'briskly', 'the', 'went', 'zzznotaword'];
    const b = await post('/api/dictionary/batch', { words });
    check('batch 200', b.status === 200);
    check('batch 命中 7/8（只漏自造词）', b.body.hit === 7, { hit: b.body.hit, miss: b.body.miss });
    check('batch 返回 entries 对象', b.body.entries && typeof b.body.entries === 'object');
    check('went 带原形词条 go', !!(b.body.entries.went && b.body.entries.went.lemmaEntry && b.body.entries.went.lemmaEntry.word === 'go'));
    check('batch 耗时 < 100ms', b.body.elapsedMs < 100, b.body.elapsedMs);
    console.log(`        请求 ${b.body.requested} 词 | 命中 ${b.body.hit} | 耗时 ${b.body.elapsedMs}ms`);
    const b2 = await post('/api/dictionary/batch', { words: [] });
    check('空数组返回 400', b2.status === 400);
    const b3 = await post('/api/dictionary/batch', { words: new Array(2001).fill('a') });
    check('超 2000 词返回 400', b3.status === 400);

    console.log('\n【⑤ /api/words/:word — 默认只查本地：词典独中（不联网）】');
    const pair = findDictOnlyPair();
    check('找到「词典有、语境库无」的样本词', !!pair, pair && pair.word);
    if (pair) {
        const w1 = await get(`/api/words/${pair.word}?context=${encodeURIComponent(pair.context)}`);
        check('words 200', w1.status === 200);
        // 注意：采样词可能是 ECDICT 里的生僻词，而 36.5 万条里只有约 52% 带音标 ——
        // 生僻词尤其容易没有。所以这里只要求「dictionary 结构完整」，音标单独用常见词覆盖。
        check('返回 dictionary 对象（含 phonetic / translationLines 两个字段）',
            !!w1.body.dictionary && typeof w1.body.dictionary === 'object'
            && 'phonetic' in w1.body.dictionary && Array.isArray(w1.body.dictionary.translationLines),
            w1.body.dictionary && { phonetic: w1.body.dictionary.phonetic, lines: (w1.body.dictionary.translationLines || []).length });
        const wCommon = await get('/api/words/beautiful');
        check('常见词的 phonetic 非空（证明音标确实会返回，不是整条都空）',
            !!(wCommon.body.dictionary && wCommon.body.dictionary.phonetic),
            wCommon.body.dictionary && wCommon.body.dictionary.phonetic);
        check('dictionary 有中文义项', w1.body.dictionary && w1.body.dictionary.translationLines.length > 0, w1.body.dictionary && w1.body.dictionary.translationLines);
        check('layer=dictionary（词典独中）', w1.body.layer === 'dictionary', { layer: w1.body.layer, contextDefinition: w1.body.contextDefinition });
        check('contextDefinition=null（本句没生成过）', w1.body.contextDefinition === null, w1.body.contextDefinition);
        check('contextSource=null', w1.body.contextSource === null, w1.body.contextSource);
        check('旧前端兼容字段 definitions 非空', Array.isArray(w1.body.definitions) && w1.body.definitions.length === 1);
        check('默认不联网：服务端耗时 < 100ms', w1.body.elapsedMs < 100, w1.body.elapsedMs);
        console.log(`        词=${pair.word} | layer=${w1.body.layer} | 词典义项 ${w1.body.dictionary.translationLines.join(' / ')}`);
        console.log(`        服务端耗时 ${w1.body.elapsedMs}ms（词典层 ${w1.body.dictElapsedMs}ms）`);
    }

    console.log('\n【⑥ /api/words/:word — 语境库命中：语境释义优先，同时返回词典】');
    const row = dbOps.db.prepare("SELECT word, context, definition FROM word_context WHERE definition IS NOT NULL AND definition <> '' LIMIT 1").get();
    if (row) {
        const w2 = await get(`/api/words/${encodeURIComponent(row.word)}?context=${encodeURIComponent(row.context)}`);
        check('contextDefinition 有值', !!w2.body.contextDefinition, w2.body.contextDefinition);
        check('contextSource=context（本地语境库，不是 kb）', w2.body.contextSource === 'context', w2.body.contextSource);
        check('主释义取语境释义', w2.body.layer === 'context', w2.body.layer);
        check('同时仍返回 dictionary（两栏并列）', !!w2.body.dictionary, !!w2.body.dictionary);
        check('definitions[0] = 语境释义（旧前端兼容）', w2.body.definitions[0].definition === row.definition);
        check('本地命中耗时 < 100ms', w2.body.elapsedMs < 100, w2.body.elapsedMs);
        console.log(`        词=${row.word} | 语境释义="${String(row.definition).slice(0, 30)}" | 同时返回词典=${!!w2.body.dictionary} | 耗时 ${w2.body.elapsedMs}ms`);
    } else {
        console.log('        （库中无可用 word_context 样本，跳过）');
    }

    console.log('\n【⑦ /api/words/:word?ai=1 — 联网深查（按钮路径）】');
    if (pair) {
        const t0 = Date.now();
        const w3 = await get(`/api/words/${pair.word}?context=${encodeURIComponent(pair.context)}&ai=1`);
        const wall = Date.now() - t0;
        check('ai=1 仍然返回词典层', !!(w3.body.dictionary));
        check('ai=1 确实走了联网（端到端 > 本地默认）', wall > 100, wall);
        console.log(`        layer=${w3.body.layer} | contextSource=${w3.body.contextSource} | 端到端 ${wall}ms`);
        console.log(`        语境释义=${w3.body.contextDefinition ? String(w3.body.contextDefinition).slice(0, 50) : '(联网也没拿到)'}`);
    }

    console.log('\n【⑧ 统计口径】');
    const stats = await get('/api/kb/stats');
    const lk = stats.body.lookup;
    check('lookup.layers.dictionary 存在', !!(lk && lk.layers && lk.layers.dictionary));
    check('lookup.dictionaryLayer 存在', !!(lk && lk.dictionaryLayer));
    check('dictHits 覆盖了本次的词典查询', lk && lk.dictionaryLayer.hits >= 3, lk && lk.dictionaryLayer);
    check('联网层默认跳过计数 kbDisabled > 0', !!(lk && lk.kbWorkflow && lk.kbWorkflow.disabled > 0), lk && lk.kbWorkflow);
    console.log(`        词典层 ${JSON.stringify(lk.dictionaryLayer)}`);
    console.log(`        L1 工作流 ${JSON.stringify({ calls: lk.kbWorkflow.calls, hits: lk.kbWorkflow.hits, errors: lk.kbWorkflow.errors, disabled: lk.kbWorkflow.disabled })}`);

    console.log('\n【⑨ /api/words/:word?ai=1 — 本地未命中时联网层兜底】');
    // 取一条「规范单词」的 word_context（跳过带引号/多词的脏行），配一个没出现在任何文章里的假语境：
    // L2 必然未命中，于是该由联网层接住。联网层可能是 L1 知识库（额度可用时）
    // 也可能是 L3 AI（额度被熔断时）—— 两种情况都必须给出语境释义，这是不变式。
    const kbWordRow = dbOps.db.prepare(`SELECT word FROM word_context
        WHERE definition IS NOT NULL AND definition <> ''
          AND word = LOWER(word) AND word NOT LIKE '% %'
        LIMIT 1`).get();
    if (kbWordRow) {
        const fakeCtx = `${RUN_TAG}-local-miss-should-fall-to-remote.`;
        const w4 = await get(`/api/words/${encodeURIComponent(kbWordRow.word)}?context=${encodeURIComponent(fakeCtx)}&ai=1`);
        check('联网后拿到语境释义', !!w4.body.contextDefinition, w4.body.contextDefinition);
        // 联网层可能处于「降级」：Coze 免费额度耗尽（熔断 4028）时 L1 直接失败，
        // LLM 超时（本机到 bigmodel.cn 20s 超时）时 L3 也失败，最终由「兼容层-通用词库」接住，
        // contextSource 会是 cache。这是可解释的环境降级，不该判 FAIL —— 但必须真的出过网，
        // 用下一行「联网耗时 > 本地 × 10」来守。联网层健康时仍严格要求 kb/ai。
        const kbStat = await get('/api/kb/stats');
        const circ = kbStat.body && kbStat.body.lookup && kbStat.body.lookup.kbWorkflow
            && kbStat.body.lookup.kbWorkflow.circuit;
        const degraded = !!(circ && (circ.open === true || circ.trips > 0));
        const src = w4.body.contextSource;
        if (degraded) {
            check(`联网层降级中（L1 熔断 ${circ.trips} 次，code=${circ.code || '-'}）→ 允许兼容层兜底`, !!w4.body.contextDefinition && ['kb', 'ai', 'cache'].indexOf(src) >= 0, src);
        } else {
            check('contextSource 是联网来源（kb 或 ai）', src === 'kb' || src === 'ai', src);
        }
        check('主释义来源与 contextSource 一致', w4.body.layer === w4.body.contextSource, { layer: w4.body.layer, contextSource: w4.body.contextSource });
        // 本地同一对「词+语境」只要 1ms，联网至少是几十倍 —— 用耗时证明这轮真的出了网
        const localProbe = await get(`/api/words/${encodeURIComponent(kbWordRow.word)}?context=${encodeURIComponent(fakeCtx)}`);
        check('联网耗时显著大于本地（证明真出了网）', w4.body.elapsedMs > localProbe.body.elapsedMs * 10, { remote: w4.body.elapsedMs, local: localProbe.body.elapsedMs });
        console.log(`        词=${kbWordRow.word} | contextSource=${w4.body.contextSource} | layer=${w4.body.layer} | 联网 ${w4.body.elapsedMs}ms vs 本地 ${localProbe.body.elapsedMs}ms`);
        console.log(`        语境释义=${String(w4.body.contextDefinition).slice(0, 50)}`);
    }

    console.log('\n【⑩ 本地优先的收益（关键回归）】');
    // 这条断言守住本次最重要的改动：默认路径绝不能碰网络。
    // 以前 L1 排在 L2 前面，每个冷词都要先等 1~1.4 秒打完两轮工作流才轮到 1ms 的本地语境库。
    const localTimes = [];
    for (const w of ['shock', 'gradually', 'critics', 'structure']) {
        const t = await get(`/api/words/${w}?context=${encodeURIComponent('A number of critics had many kinds of interpretations.')}`);
        localTimes.push(t.body.elapsedMs);
        check(`${w} 本地查询 < 100ms`, t.body.elapsedMs < 100, t.body.elapsedMs);
    }
    console.log(`        4 次本地查询耗时: ${localTimes.join(' / ')} ms`);

    console.log('\n【⑪ 文章列表分页（2026-10-06 新契约）】');
    const articlesSampleId = 'article_001';   // 预置文章，DB 里必然存在
    // 契约从「裸数组」改成 { items, page, pageSize, total, totalPages, hasMore }
    const p1 = await get('/api/articles?page=1&pageSize=10');
    check('返回分页对象而不是裸数组', p1.status === 200 && p1.body && Array.isArray(p1.body.items),
        p1.body && Object.keys(p1.body));
    const b1 = p1.body;
    check('分页元信息齐全',
        b1.page === 1 && b1.pageSize === 10 && typeof b1.total === 'number'
        && typeof b1.totalPages === 'number' && typeof b1.hasMore === 'boolean',
        { page: b1.page, pageSize: b1.pageSize, total: b1.total, totalPages: b1.totalPages, hasMore: b1.hasMore });
    check('本页条数不超过 pageSize', b1.items.length <= 10, b1.items.length);
    check('列表项带必要字段（title/content/source/createdAt/level）',
        b1.items.every(i => 'title' in i && 'content' in i && 'source' in i && 'createdAt' in i && 'level' in i));
    check('列表项**不含**体积大的详情字段（sentences/words/questions）',
        b1.items.every(i => !('sentences' in i) && !('words' in i) && !('questions' in i)),
        Object.keys(b1.items[0] || {}));
    check('预置文章排在首页最前（预置优先，否则它们会被挤到最后一页）',
        !!b1.items[0] && b1.items[0].source === 'preset',
        b1.items[0] && { id: b1.items[0].id, source: b1.items[0].source });

    const p2 = await get('/api/articles?page=2&pageSize=10');
    const ids1 = b1.items.map(i => i.id), ids2 = (p2.body.items || []).map(i => i.id);
    const dup = ids1.filter(id => ids2.indexOf(id) >= 0);
    check('第 1、2 页之间没有重复行（created_at 同秒并列也不串页）', dup.length === 0, dup);

    // 逐页翻到底：总数对得上、无重复、无遗漏
    const seen = [];
    let pg = 1, guard = 0;
    while (guard++ < 50) {
        const r = await get(`/api/articles?page=${pg}&pageSize=10`);
        seen.push(...(r.body.items || []).map(i => i.id));
        if (!r.body.hasMore) break;
        pg++;
    }
    check('逐页翻完 = total 篇，且无重复无遗漏（分页不丢行）',
        seen.length === b1.total && new Set(seen).size === b1.total,
        { 翻到: seen.length, total: b1.total, 去重后: new Set(seen).size, 页数: pg });

    const pf = await get('/api/articles?page=999&pageSize=10');
    check('越界页码被夹到最后一页（不返回空页也不报错）',
        pf.status === 200 && pf.body.items.length > 0 && pf.body.page <= pf.body.totalPages,
        { page: pf.body.page, totalPages: pf.body.totalPages, n: pf.body.items.length });

    const noContent = await get('/api/articles?page=1&pageSize=3&withContent=0');
    check('withContent=0 → 列表不带正文（省流量开关生效）',
        noContent.body.items.every(i => !('content' in i)));
    const withContent = await get('/api/articles?page=1&pageSize=3');
    check('默认带正文（前端点开要能立刻渲染，不用等详情）',
        withContent.body.items.every(i => 'content' in i));

    const stOnly = await get('/api/articles?page=1&pageSize=50&status=completed');
    check('status 过滤生效（只返回 completed）',
        stOnly.body.items.every(i => i.status === 'completed'),
        { total: stOnly.body.total, 本页: stOnly.body.items.length });
    check('status 过滤后 total 小于全量 total',
        stOnly.body.total < b1.total, { 过滤后: stOnly.body.total, 全量: b1.total });

    console.log('\n【⑫ 单篇详情仍然完整（分页后按需加载的源头）】');
    const detail = await get(`/api/article/${encodeURIComponent(articlesSampleId)}`);
    check('详情接口返回 article/words/sentences/questions 四件套',
        detail.status === 200 && 'article' in detail.body && 'words' in detail.body
        && Array.isArray(detail.body.sentences) && Array.isArray(detail.body.questions),
        Object.keys(detail.body || {}));
    console.log(`        ${articlesSampleId}: 正文 ${String(detail.body.article || '').length} 字 |`
        + ` 译文 ${detail.body.sentences.length} 句 | 词表 ${Object.keys(detail.body.words || {}).length} 个 |`
        + ` 题目 ${detail.body.questions.length} 道`);

    // ==================== 自清理（2026-10-08 加，别删） ====================
    // 本文件为了造「词典独中」样本，会带 `?ai=1` 打联网层 → L3 AI 会把释义回写成
    // `word_context` 行，语境正是 `QA-PROBE-<时间戳>-...`。这些行**必须删**，因为：
    //   ① 它们会被 `word_context.csv` 导出、进而污染 Coze 知识库；
    //   ② 曾经 `squashContextKey()` 把数字当标点抹掉，导致所有探针语境归一到同一个 key
    //      → 下一轮「本该 miss 去联网」的查询命中历史探针行（0ms、source=context），
    //      断言「联网耗时 > 本地」直接失败。实测真库里攒了 41 行。
    // 删除范围**只认探针前缀**（`QA-PROBE-%`），绝不碰真实语境行。
    try {
        const del = dbOps.db.prepare("DELETE FROM word_context WHERE context LIKE 'QA-PROBE-%'").run();
        if (del.changes) console.log(`  ↩ 清理探针语境行 ${del.changes} 条（context LIKE 'QA-PROBE-%'）`);
    } catch (e) {
        console.log('  ⚠️ 探针语境清理失败：' + ((e && e.message) || e));
    }

    console.log(`\n结果：${pass} PASS / ${fail} FAIL`);
    process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('测试异常:', e); process.exit(1); });
