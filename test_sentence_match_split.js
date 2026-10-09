/**
 * 回归：问题一（句子译文取不到）+ 问题二（粘连词拆分）
 *
 * 问题一「句子翻译成功（17 句）但浮层显示『暂无翻译』」有**两层**根因，本文件两层都守：
 *   ① 列表刷新把已加载的详情冲成空壳（mergeServerListItem 必须保住 sentences/words/questions）；
 *   ② 正文因 PDF 掉空格与后端 sentenceList 逐字不等（squashSentence 必须让它们相等）；
 *   另外守「浮层显示时按 idx 重新取译文」与「译文为空时给出可排查的原因」。
 *
 * 问题二「粘贴导致词粘连」：
 *   本地词典分词（coze.segmentGluedWord）必须把 rapiddevelopment 拆成 rapid + development，
 *   且**不能乱拆**（真实单词 / 乱码 / 短词都不拆）；HTTP 接口与卡片分区 HTML 也要接上。
 *
 * 运行：node test_sentence_match_split.js
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

process.env.ACCESS_PASSWORD = '';
process.env.PORT = process.env.PORT || '49915';

let pass = 0, fail = 0;
function check(name, cond, extra) {
    if (cond) { pass++; console.log(`  PASS  ${name}`); }
    else { fail++; console.log(`  FAIL  ${name}${extra !== undefined ? '  ← ' + JSON.stringify(extra) : ''}`); }
}

// ==================== 一、前端纯逻辑（vm + 极简 DOM 打桩，抄 test_word_card.js 的骨架） ====================

function classListOf() {
    const s = new Set();
    return {
        add: (c) => s.add(c), remove: (c) => s.delete(c), contains: (c) => s.has(c),
        toggle: (c, f) => { f ? s.add(c) : s.delete(c); return s.has(c); }
    };
}
function makeEl(tag) {
    const el = {
        tagName: (tag || 'div').toUpperCase(), id: '', _attrs: {}, _style: {},
        classList: classListOf(), dataset: {}, value: '', disabled: false,
        offsetHeight: 40, offsetWidth: 200, isConnected: true, _children: [], innerHTML: '',
        get style() { return this._style; },
        getAttribute(k) { return this._attrs[k] === undefined ? null : this._attrs[k]; },
        setAttribute(k, v) { this._attrs[k] = v; },
        removeAttribute(k) { delete this._attrs[k]; },
        contains(o) { return o === this; },
        closest() { return null; },
        querySelector() { return null; },
        querySelectorAll() { return []; },
        getBoundingClientRect() { return { left: 10, top: 100, bottom: 120, width: 200, height: 20 }; },
        appendChild(c) { this._children.push(c); return c; },
        removeChild(c) { return c; },
        remove() { this._removed = true; },
        addEventListener() {}, removeEventListener() {},
        focus() {}, click() {}, blur() {}, insertBefore(c) { return c; },
    };
    let tc = '';
    // textContent → innerHTML 镜像：app.js 的 escapeHtml() 正是靠 createElement + textContent → innerHTML
    Object.defineProperty(el, 'textContent', {
        get() { return tc; },
        set(v) {
            tc = v == null ? '' : String(v);
            el.innerHTML = tc.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        },
        configurable: true,
    });
    return el;
}
const registry = new Map();
function getById(id) { if (!registry.has(id)) registry.set(id, makeEl()); return registry.get(id); }
['startingPage', 'dashboardPage', 'uploadPage', 'loadingPage', 'readingPage', 'wordbookPage', 'summaryPage']
    .forEach(s => getById(s).classList.add('screen'));

const sandbox = {
    console,
    setTimeout: (fn) => 0, clearTimeout: () => {}, setImmediate,
    document: {
        getElementById: getById,
        querySelectorAll: (sel) => (sel === '.screen' ? [...registry.values()].filter(e => e.classList.contains('screen')) : []),
        querySelector: () => null,
        addEventListener() {}, removeEventListener() {},
        createElement: (t) => makeEl(t),
        body: makeEl('body')
    },
    window: { addEventListener() {}, innerWidth: 1440, scrollTo() {}, location: { protocol: 'http:' }, prompt: () => 'x' },
    // 释义锁（2026-10-07）：默认是「猜词模式（锁上）」，会把释义/译文藏起来。
    // 本文件测的是查看模式下「正文掉空格仍能匹配上译文」「词卡拆分释义」这些既有能力，
    // 所以显式播种 guessMode='off'（猜词模式的行为在 test_guess_lock.js 里单独测）。
    localStorage: (function () {
        const store = { accessPassword: 'pwd', guessMode: 'off' };
        return {
            getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
            setItem: (k, v) => { store[k] = String(v); },
            removeItem: (k) => { delete store[k]; },
        };
    })(),
    fetch: async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '{}' }),
    Math, Date, JSON, Promise, Object, Array, String, Number, Boolean, RegExp, Error,
    isNaN, parseInt, parseFloat, Map, Set, Infinity,
    AbortController: class { constructor() { this.signal = {}; } abort() {} }
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const src = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
vm.runInContext(src + `
globalThis.__t = {
  mergeServerListItem: (a, b) => mergeServerListItem(a, b),
  shouldFetchArticleDetail: (a) => shouldFetchArticleDetail(a),
  squashSentence: (s) => squashSentence(s),
  sentenceMatches: (a, b) => sentenceMatches(a, b),
  describeMatchFailure: (t, s) => describeMatchFailure(t, s),
  buildGlueSplitSectionHtml: (split, w) => buildGlueSplitSectionHtml(split, w),
  buildSentenceList: () => buildSentenceList(),
  setArticle: (a) => { currentArticle = a; },
  articles: () => ARTICLES,
};
`, sandbox, { filename: 'app.js' });
const T = sandbox.__t;

console.log('\n【一 列表刷新不得冲掉已加载的详情（问题一根因 ①）】');
{
    const loaded = {
        id: 'upload_x', title: '旧标题', status: 'completed', detailLoaded: true,
        sentences: [{ sentence: 'A.', translation: '甲。' }],
        words: { a: '一个' }, questions: [{ q: 1 }],
        wordsReady: true, sentencesReady: true, questionsReady: true,
        serverHasSentences: true
    };
    const light = {
        id: 'upload_x', title: '新标题', status: 'completed', detailLoaded: false,
        sentences: [], words: {}, questions: [], serverHasSentences: true, article: '正文'
    };
    const merged = T.mergeServerListItem(loaded, light);
    check('详情已加载 → sentences 保住', merged.sentences.length === 1, merged.sentences);
    check('详情已加载 → words 保住', Object.keys(merged.words).length === 1);
    check('详情已加载 → questions 保住', merged.questions.length === 1);
    check('详情已加载 → detailLoaded 保持 true', merged.detailLoaded === true);
    check('详情已加载 → 就绪标记不丢', merged.wordsReady === true && merged.sentencesReady === true && merged.questionsReady === true);
    check('轻量字段仍被更新（标题）', merged.title === '新标题', merged.title);
    check('轻量字段仍被更新（正文）', merged.article === '正文');

    const shell = { id: 'upload_y', detailLoaded: false, sentences: [], words: {}, questions: [] };
    const m2 = T.mergeServerListItem(shell, { id: 'upload_y', title: 'T', detailLoaded: false, sentences: [], serverHasSentences: false });
    check('未加载详情时不伪造详情', m2.detailLoaded === false);

    const m3 = T.mergeServerListItem(
        { id: 'z', detailLoaded: true, sentences: [], words: {}, questions: [], serverHasSentences: false },
        { id: 'z', detailLoaded: false, sentences: [], serverHasSentences: true });
    check('serverHasSentences 取「或」（不丢已知信息）', m3.serverHasSentences === true);
}

console.log('\n【二 补拉详情的闸门必须可重试（问题一根因 ① 的放大器）】');
{
    check('已加载详情 → 不再拉', T.shouldFetchArticleDetail({ id: 'a', detailLoaded: true }) === false);
    check('从未加载 → 要拉', T.shouldFetchArticleDetail({ id: 'b', detailLoaded: false }) === true);
    check('空对象 → 不拉（防 NPE）', T.shouldFetchArticleDetail(null) === false);
}

console.log('\n【三 空格 / 标点差异不再导致匹配失败（问题一根因 ②）】');
{
    const part = 'With the rapiddevelopment of Chinese economic and the improvement of living standards ofordinary people, more and more private cars are on road.';
    const sent = 'With the rapid development of Chinese economic and the improvement of living standards of ordinary people, more and more private cars are on road.';
    check('词间空格丢失（rapiddevelopment）→ 仍匹配', T.sentenceMatches(part, sent) === true);

    check('弯引号 vs 直引号 → 匹配',
        T.sentenceMatches("It’s not only a personal thing", "It's not only a personal thing") === true);
    check('站点标记 [LunWenJia.Com] 被忽略 → 匹配',
        T.sentenceMatches('[LunWenJia.Com] Some people think so.', 'Some people think so.') === true);
    check('粘连 + 无标点差异混合 → 匹配',
        T.sentenceMatches('First of all, themore private cars, the more traffic jams.', 'First of all, the more private cars, the more traffic jams.') === true);

    check('完全不同的句子 → 不匹配（防误配）',
        T.sentenceMatches('The cat sat on the mat.', 'The dog ran across the field quickly.') === false);
    check('短词不误配（"the" 不能匹配任意句子）',
        T.sentenceMatches('the', 'The dog ran across the field quickly.') === false);
    check('空句子 → 不匹配', T.sentenceMatches('hello world', '') === false);

    const why = T.describeMatchFailure(part, [{ sentence: 'totally different sentence here' }, { sentence: sent }]);
    check('匹配失败诊断包含「最接近的是 idx=」', /最接近的是 idx=\d+/.test(why), why);
    check('匹配失败诊断包含字母数', /去空格后 \d+ 字母/.test(why), why);
}

console.log('\n【四 悬停译文取「最新值」而不是排期时的旧值（问题一根因 ③）】');
{
    check('squashSentence 去掉全部空白',
        T.squashSentence('A  rapid   development!') === 'arapiddevelopment',
        T.squashSentence('A  rapid   development!'));

    T.setArticle({ id: 'art', article: 'One. Two.', sentences: [{ sentence: 'One.', translation: '一。' }], detailLoaded: true });
    check('有 sentences → 直接使用真译文', T.buildSentenceList()[0].translation === '一。');

    T.setArticle({
        id: 'art2', article: 'One. Two.', sentences: [], detailLoaded: false,
        serverHasSentences: true
    });
    const fb = T.buildSentenceList();
    check('sentences 为空 → 本地切句兜底（译文留空）', fb.length === 2 && fb[0].translation === '', fb);
    check('兜底的句子带 sentence 原文（浮层至少能显示英文）', !!fb[0].sentence);
}

console.log('\n【五 拆分释义区块的渲染（问题二）】');
{
    check('未拆开 → 不渲染任何内容', T.buildGlueSplitSectionHtml({ isGlued: false, parts: [] }, 'x') === '');
    const html = T.buildGlueSplitSectionHtml({
        isGlued: true, method: 'dict-dp',
        merged: { word: 'rapiddevelopment', entry: null },
        parts: [
            { word: 'rapid', entry: { translationLines: ['adj. 迅速的', 'n. 急流'] } },
            { word: 'development', entry: { translationLines: ['n. 发展'] } }
        ]
    }, 'rapiddevelopment');
    check('包含「拆分释义」标题', html.indexOf('拆分释义') >= 0);
    check('包含「合并」标签', html.indexOf('合并') >= 0);
    check('合并词一行也显示（用户要求）', html.indexOf('rapiddevelopment') >= 0);
    check('包含两行「分开」', (html.match(/分开/g) || []).length === 2);
    check('rapid 的义项出现', html.indexOf('adj. 迅速的') >= 0);
    check('development 的义项出现', html.indexOf('n. 发展') >= 0);
    check('合并词未收录时如实说明', html.indexOf('词典未收录') >= 0);
    check('标注了拆分方式（本地词典分词）', html.indexOf('本地词典分词') >= 0);

    const html2 = T.buildGlueSplitSectionHtml({
        isGlued: true, method: 'ai-assist',
        merged: { word: 'x', entry: { translationLines: ['n. X'] } },
        parts: [{ word: 'a', entry: null, fallbackMeaning: '兜底义' }]
    }, 'x');
    check('合并词有释义时也渲染出来', html2.indexOf('n. X') >= 0);
    check('分开段无词典条目时用兜底义', html2.indexOf('兜底义') >= 0);
    check('AI 拆分方式有标注', html2.indexOf('AI 辅助拆分') >= 0);
}

console.log('\n【六 前端接线自检（防「改了后端忘了接线」）】');
{
    check('openWordCard 里触发拆词', /requestGlueSplit\(word, sentence, x, y\)/.test(src));
    check('showWordCard 渲染拆分区块', /buildGlueSplitSectionHtml\(glueSplit, word\)/.test(src));
    check('有「AI 拆词」按钮', /wc-btn-glue-ai/.test(src));
    check('拆词结果只重绘「仍在看的同一张卡」', /currentWordCardKey !== wordCardKeyOf\(word, sentence\)/.test(src));
    check('requestGlueSplit 命中缓存不重复请求', /if \(glueSplitCache\[key\]\)/.test(src));
    check('默认不带 ai=1（只有用户点按钮才带）', /o\.allowAI \? '\?ai=1' : ''/.test(src));
    check('列表合并不再直接用 Object.assign 覆盖', !/ARTICLES\[i\] = Object\.assign\(\{\}, ARTICLES\[i\], a\)/.test(src));
    check('loadArticleDetail 失败时复位 articleDetailAsked', /delete articleDetailAsked\[id\]/.test(src));
    const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    check('index.html 引用的 app.js 指纹已更新', /app\.js\?v=\d{8}_\d+/.test(html));
}

// ==================== 七、后端：词典分词拆粘连词 ====================

(async () => {
    const coze = require('./coze');

    console.log('\n【七 本地词典分词（问题二核心）】');
    const expectSplit = {
        rapiddevelopment: ['rapid', 'development'],
        thinkprivate: ['think', 'private'],
        ofordinary: ['of', 'ordinary'],
        shouldput: ['should', 'put'],
        themore: ['the', 'more'],          // 词频反转 bug 的守卫：曾拆成 them + ore
        itwill: ['it', 'will'],
        privatecars: ['private', 'cars'],
        automobileindustry: ['automobile', 'industry']
    };
    for (const [w, want] of Object.entries(expectSplit)) {
        const r = coze.segmentGluedWord(w);
        check(`"${w}" → ${want.join(' + ')}`,
            r.isGlued && r.parts.map(p => p.word).join('+') === want.join('+'),
            r.isGlued ? r.parts.map(p => p.word) : '(未拆)');
        check(`"${w}" 每一段都查到词典条目`, r.parts.every(p => !!p.entry));
    }

    console.log('\n【八 不能乱拆（误拆防护）】');
    for (const w of ['development', 'government', 'environmentalists', 'hello', 'university']) {
        const r = coze.segmentGluedWord(w);
        check(`真实单词 "${w}" 不拆`, r.isGlued === false && !!r.merged.entry, r.parts.map(p => p.word));
    }
    const junk = coze.segmentGluedWord('zxqwvbn');
    check('乱码串不拆', junk.isGlued === false);
    const short1 = coze.segmentGluedWord('cat');
    check('短词不拆', short1.isGlued === false);
    const nonAlpha = coze.segmentGluedWord('well-known');
    check('含非字母的串不拆', nonAlpha.isGlued === false);
    const long1 = coze.segmentGluedWord('a'.repeat(60));
    check('超长串直接放弃（不卡死）', long1.isGlued === false);

    console.log('\n【九 HTTP 接口 /api/glue-word】');
    require('./server');
    const BASE = `http://127.0.0.1:${process.env.PORT}`;
    await new Promise(r => setTimeout(r, 1600));

    const t0 = Date.now();
    const r1 = await (await fetch(`${BASE}/api/glue-word/rapiddevelopment`)).json();
    check('接口：rapiddevelopment 被拆开', r1.isGlued === true && r1.method === 'dict-dp', r1);
    check('接口：parts 含 rapid / development',
        r1.parts.map(p => p.word).join('+') === 'rapid+development', r1.parts.map(p => p.word));
    check('接口：每段回传了中文义项', r1.parts.every(p => (p.entry && p.entry.translationLines || []).length > 0));
    check('接口：响应足够快（本地词典，无网络）', Date.now() - t0 < 2000, Date.now() - t0 + 'ms');
    check('接口：merged.found=false（合并词未收录）', r1.merged.found === false);

    const r2 = await (await fetch(`${BASE}/api/glue-word/development`)).json();
    check('接口：真实单词不拆且 merged.found=true', r2.isGlued === false && r2.merged.found === true, r2);

    const r3 = await fetch(`${BASE}/api/glue-word/${'x'.repeat(41)}`);
    check('接口：超长词返回 400', r3.status === 400, r3.status);

    const r4 = await (await fetch(`${BASE}/api/glue-word/zxqwvbn`)).json();
    check('接口：拆不出时 parts 为空且不报错', r4.isGlued === false && Array.isArray(r4.parts) && r4.parts.length === 0, r4);

    console.log(`\n===== 结果：${pass} PASS / ${fail} FAIL =====`);
    process.exit(fail === 0 ? 0 : 1);
})().catch(e => {
    console.error('测试异常:', e);
    process.exit(1);
});
