// 测 L1 知识库当前覆盖面：拿库里真实的「词 + 语境」去问工作流，看能不能取回来
const d = require('./db');
const coze = require('./coze');

(async () => {
    const rows = d.db.prepare(`SELECT word, context, definition FROM word_context
        WHERE definition IS NOT NULL AND definition <> ''
          AND word = LOWER(word) AND word NOT LIKE '% %' AND word NOT GLOB '*[^a-z''-]*'
        LIMIT 12`).all();
    console.log(`从库里取 ${rows.length} 条「词+语境」样本去问 L1 工作流：\n`);
    let hit = 0, ms = 0;
    for (const r of rows) {
        const t0 = Date.now();
        const res = await coze.searchKnowledgeBase(`${r.word} ${r.context}`, { tag: 'KB覆盖探针', word: r.word, context: r.context });
        const took = Date.now() - t0;
        ms += took;
        const ok = !!(res.exact && res.exact.definition);
        if (ok) hit++;
        console.log(`  ${ok ? '✅' : '⬜'} ${r.word.padEnd(16)} calls=${res.calls} 候选=${(res.hitsAll || []).length} ${took}ms`);
        if (ok) console.log(`      库内: ${String(r.definition).slice(0, 40)}`);
        if (ok) console.log(`      云端: ${String(res.exact.definition).slice(0, 40)}`);
    }
    console.log(`\nL1 命中 ${hit}/${rows.length} | 平均 ${Math.round(ms / rows.length)}ms/次`);
    console.log(`\n本地 L2 对同样这 ${rows.length} 条的命中率（对照）：`);
    let l2 = 0;
    for (const r of rows) if (d.getWordContext(r.word, r.context)) l2++;
    console.log(`  L2 命中 ${l2}/${rows.length}`);
})().catch(e => { console.error('异常', e.message); process.exit(1); });
