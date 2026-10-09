const d = require('./db');
const rows = d.db.prepare('SELECT id, word FROM word_context').all();
const stat = { total: rows.length, quoted: 0, spaced: 0, clean: 0, withDef: 0 };
const samples = { quoted: [], spaced: [], other: [] };
const defRows = d.db.prepare("SELECT id FROM word_context WHERE definition IS NOT NULL AND definition <> ''").all().map(r => r.id);
const defSet = new Set(defRows);
for (const r of rows) {
    const w = r.word;
    const clean = /^[a-z][a-z'-]*$/.test(w);
    if (clean) stat.clean++;
    if (/^["'“”]|["'“”]$/.test(w)) { stat.quoted++; if (samples.quoted.length < 5) samples.quoted.push(w); }
    else if (/\s/.test(w)) { stat.spaced++; if (samples.spaced.length < 5) samples.spaced.push(w); }
    else if (!clean && samples.other.length < 5) samples.other.push(w);
}
stat.withDef = defRows.length;
console.log('word_context 共', stat.total, '行；其中有释义的', stat.withDef, '行');
console.log('  word 带引号        :', stat.quoted, JSON.stringify(samples.quoted));
console.log('  word 含空白        :', stat.spaced, JSON.stringify(samples.spaced));
console.log('  其它非规范         :', JSON.stringify(samples.other));
console.log('  规范（可直接点词命中）:', stat.clean);

// 关键：前端点词传的是不带引号的 critics，能不能命中？
const probe = ['critics', 'had', 'kinds', 'angel', 'the'];
console.log('\n模拟前端点词（不带引号）查 L2 语境库：');
for (const w of probe) {
    const hit = d.db.prepare("SELECT id FROM word_context WHERE word = ? AND definition IS NOT NULL AND definition <> '' LIMIT 1").get(w);
    const hitQ = d.db.prepare("SELECT id FROM word_context WHERE word = ? AND definition IS NOT NULL AND definition <> '' LIMIT 1").get('"' + w + '"');
    console.log(`  ${w.padEnd(10)} 不带引号命中=${hit ? 'Y' : 'N'}   带引号命中=${hitQ ? 'Y' : 'N'}`);
}

// word_cache 是否也有同样问题
const cRows = d.db.prepare('SELECT word FROM word_cache').all();
const cQuoted = cRows.filter(r => /^["'“”]|["'“”]$/.test(r.word)).length;
console.log(`\nword_cache 共 ${cRows.length} 行，word 带引号 ${cQuoted} 行`);
