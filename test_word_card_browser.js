/**
 * 浏览器端到端验证「词典式」词卡（真实 Chromium/Edge + 真实后端 + 真实 DOM/CSS）
 *
 * 与 test_word_card.js 的分工：
 *   test_word_card.js         —— 无头、DOM 打桩，快，验逻辑分支（竞态、预取去重、无计时器）
 *   test_word_card_browser.js —— 真浏览器，验「打桩测不出来」的部分：
 *                                · 真实 DOM 查询真的能找到 .wc-phonetic / .wc-dict
 *                                · 「本句翻译」按钮已删除：全程不存在该元素（真等 3.6 秒也不冒出来）
 *                                · 卡片里两栏的真实渲染顺序
 *                                · 与真实后端（/api/dictionary/batch、/api/words/:word）联通
 *                                · 页面无未捕获 JS 异常
 *
 * 运行：需要 playwright-core（装在 managed node workspace，复用本机 Edge，不下载浏览器）
 *   NODE_PATH=<workspace>/node_modules node test_word_card_browser.js
 * 缺 playwright-core / Edge 时自动跳过（退出码 0），不阻塞其他测试。
 */
process.env.ACCESS_PASSWORD = '';
process.env.PORT = '49911';

const path = require('path');

let chromium;
try {
    ({ chromium } = require('playwright-core'));
} catch (e) {
    console.log('⏭  跳过：未安装 playwright-core（npm i playwright-core --prefix <workspace>）');
    process.exit(0);
}

require('./server');       // 同进程起服务，端口 49911
const dbOps = require('./db');   // 直接查库/造探针数据（问题一、问题二的断言用）

const BASE = 'http://127.0.0.1:49911';
const SHOT = path.join(__dirname, 'test_screenshot_wordcard.png');
let pass = 0, fail = 0;
function check(name, cond, extra) {
    if (cond) { pass++; console.log(`  PASS  ${name}`); }
    else { fail++; console.log(`  FAIL  ${name}${extra !== undefined ? '  ← ' + JSON.stringify(extra) : ''}`); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
    await sleep(1200);   // 等服务 listen

    let browser;
    try {
        browser = await chromium.launch({ channel: 'msedge', headless: true });
    } catch (e) {
        console.log(`⏭  跳过：无法启动本机 Edge（${e.message.split('\n')[0]}）`);
        process.exit(0);
    }

    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    // 免掉访问密码弹窗（后端 ACCESS_PASSWORD='' 时本就不校验，这里只是别让弹层挡住 UI）
    // 释义锁（2026-10-07）：产品默认「猜词模式（锁上）」→ 点词只给猜测框。
    // 本文件整体测的是查看模式下的既有能力，所以统一播种 guessMode='off'；
    // 猜词模式自身在后面【⑮】里单独把开关切过去测。
    await ctx.addInitScript(() => {
        try {
            localStorage.setItem('accessPassword', 'e2e');
            localStorage.setItem('guessMode', 'off');
        } catch (e) {}
    });

    const page = await ctx.newPage();
    const pageErrors = [];
    const dictCalls = [];
    page.on('pageerror', (e) => pageErrors.push(String(e && e.message || e)));
    page.on('response', (r) => { if (r.url().includes('/api/dictionary/')) dictCalls.push(r.url().replace(BASE, '')); });

    console.log('\n【① 加载页面 → 进入阅读页（article_001）】');
    await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.openArticle === 'function', { timeout: 15000 });
    check('index.html 加载完成且 app.js 已执行', true);
    check('未抓到未捕获的 JS 异常', pageErrors.length === 0, pageErrors);

    await page.evaluate(() => openArticle('article_001'));
    check('已切到阅读页', await page.evaluate(() => document.getElementById('readingPage').classList.contains('active')));
    check('正文已渲染出可点的单词 span', await page.evaluate(() => document.querySelectorAll('#readContent .word-span').length > 50),
        await page.evaluate(() => document.querySelectorAll('#readContent .word-span').length));

    // 等词典预取回来（进阅读页时那一次批量请求）
    await page.waitForFunction(
        () => typeof dictionaryPrefetchArticleId !== 'undefined'
            && dictionaryPrefetchArticleId === 'article_001'
            && dictionaryPrefetchPending === false,
        { timeout: 20000 });
    const cached = await page.evaluate(() => Object.keys(dictionaryCache).length);
    check('进阅读页批量预取了本文所有词的词典释义', cached > 50, cached);
    check('预取走的是 POST /api/dictionary/batch', dictCalls.some(u => u.includes('/api/dictionary/batch')), dictCalls);
    // 关键：正文里「点得动但不在 AI 重点词表里」的词也必须预先缓存好，否则点下去要先等一次请求
    check('不在文章词表里、但正文里点得动的词也已预取（brightly）',
        await page.evaluate(() => !!dictionaryCache['brightly']));

    // 【①-b】2026-10-06 改造：文章列表不再是 app.js 里的硬编码，而是从 /api/articles 分页拉。
    // 这段是这条改造的回归锚点 —— 丢了它，将来谁把加载逻辑改回去都没人发现。
    console.log('\n【①-b 文章列表来自服务端分页（2026-10-06 改造）】');
    await page.waitForFunction(() => typeof articlesFromServer !== 'undefined' && articlesFromServer === true,
        { timeout: 20000 }).catch(() => {});
    const artState = await page.evaluate(() => ({
        fromServer: articlesFromServer,
        page: articlesPage,
        hasMore: articlesHasMore,
        total: articlesTotal,
        inMemory: ARTICLES.length,
        pageSize: ARTICLES_PAGE_SIZE,
        firstSource: ARTICLES[0] && ARTICLES[0].source,
        loadMoreBtn: !!document.getElementById('articleLoadMoreBtn')
    }));
    check('文章列表确实从服务端加载（articlesFromServer=true）', artState.fromServer === true, artState);
    check('首屏只拉第一页（内存篇数 = pageSize，而不是把 70+ 篇全灌进来）',
        artState.inMemory <= artState.pageSize, artState);
    check('服务端总数 > 内存篇数（证明真的在分页，没退化成全量）',
        artState.total > artState.inMemory, artState);
    check('hasMore=true → 选择器末尾有「加载更多」入口',
        artState.hasMore === true && artState.loadMoreBtn === true, artState);
    check('首页第一项是预置文章（预置优先排序，预置的降级方案才用得上）',
        artState.firstSource === 'preset', artState);

    const beforeLen = artState.inMemory;
    await page.evaluate(() => loadMoreArticles());
    const afterMore = await page.evaluate(() => ({ inMemory: ARTICLES.length, page: articlesPage }));
    check('「加载更多」把第 2 页真的追加进来了（内存篇数增加）',
        afterMore.inMemory > beforeLen, { beforeLen, afterMore });

    // 详情是「按需」的。这里顺带守住一个容易漏的边界：
    // 列表刷新会把当前正在读的文章换成「未加载详情」的服务端版本 ——
    // loadArticlesPage 必须自己把详情补回来，不然用户得再点一次才有译文/释义/题目。
    await page.waitForFunction(() => {
        const a = ARTICLES.find(x => x.id === 'article_001');
        return !!(a && a.detailLoaded);
    }, { timeout: 15000 }).catch(() => {});
    const detailState = await page.evaluate(() => {
        const a = ARTICLES.find(x => x.id === 'article_001');
        return { found: !!a, detailLoaded: !!(a && a.detailLoaded), hasArticle: !!(a && a.article && a.article.length > 100) };
    });
    check('点击 / 打开后文章详情已按需补齐（detailLoaded=true）', detailState.found && detailState.detailLoaded === true, detailState);
    check('按需补齐后正文是可用的（不是空串）', detailState.hasArticle === true, detailState);

    console.log('\n【② 点一个「文章里有释义」的词 → 两栏齐全】');
    await page.evaluate(() => openWordCard('beautiful', 'the sky was a beautiful blue', 'beautiful', 640, 360));
    const card = page.locator('.word-card');
    await card.waitFor({ state: 'visible', timeout: 5000 });
    check('卡片弹出', await card.count() === 1);
    check('卡片标题是点击的那个词', (await page.locator('.word-card .wc-word').textContent()).trim() === 'beautiful');
    check('真实 DOM 里存在音标节点 .wc-phonetic', await page.locator('.word-card .wc-phonetic').count() === 1);
    const phon = (await page.locator('.word-card .wc-phonetic').textContent()).trim();
    check('音标已是 IPA（含重音符号）', /[ˈˌ]/.test(phon), phon);
    check('真实 DOM 里存在「当前语境释义」节点 .wc-context', await page.locator('.word-card .wc-context').count() === 1);
    check('真实 DOM 里存在「其他释义」节点 .wc-dict', await page.locator('.word-card .wc-dict').count() === 1);

    // 顺序：语境栏必须在词典栏之前（真实 DOM 文档序，不是字符串猜测）
    const orderOk = await page.evaluate(() => {
        const c = document.querySelector('.word-card .wc-context');
        const d = document.querySelector('.word-card .wc-dict');
        // DOCUMENT_POSITION_FOLLOWING = 4：d 在 c 之后
        return !!(c.compareDocumentPosition(d) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    check('「当前语境释义」在文档流里排在「其他释义」之前', orderOk);

    check('语境释义显示文章里的「美丽的」', (await page.locator('.word-card .wc-context').textContent()).includes('美丽的'),
        (await page.locator('.word-card .wc-context').textContent()).slice(0, 60));
    const dictText = await page.locator('.word-card .wc-dict').textContent();
    check('其他释义列出了词典义项', dictText.includes('美丽') || dictText.includes('漂亮'), dictText.slice(0, 90));
    check('词典栏标了标题「其他释义」', dictText.includes('其他释义'));

    // 「联网深查」按钮的出现条件：来源是 文章释义/通用释义/什么都没有 时才给
    // （已经是 本句释义 / 知识库 / AI 生成 就不必再查）。这里按卡片上真实记录的来源校验一致性。
    const ctxSrc = await page.evaluate(() => {
        const c = document.querySelector('.word-card');
        return c ? c.getAttribute('data-ctx-src') : null;
    });
    const hasRemote = await page.locator('.word-card .wc-btn-remote').count() === 1;
    const remoteExpected = !ctxSrc || ctxSrc === 'article' || ctxSrc === 'cache';
    check(`「联网深查」按钮与语境来源(${ctxSrc || '无'})一致`, hasRemote === remoteExpected, { ctxSrc, hasRemote, remoteExpected });

    // 直接把这条规则在每个来源上钉死（不依赖文章数据恰好命中哪种来源）
    const remoteRule = await page.evaluate(() => {
        const has = (src, pending) => buildContextSectionHtml({ contextDefinition: 'x', contextSource: src, contextPending: !!pending }).indexOf('wc-btn-remote') >= 0;
        return {
            context: has('context'), kb: has('kb'), ai: has('ai'),
            article: has('article'), cache: has('cache'), pending: has('article', true),
            none: buildContextSectionHtml({ contextDefinition: null, contextSource: null, contextPending: false }).indexOf('wc-btn-remote') >= 0
        };
    });
    check('本句释义/知识库/AI 命中 → 不再给「联网深查」', !remoteRule.context && !remoteRule.kb && !remoteRule.ai, remoteRule);
    check('文章释义/通用释义 → 给「联网深查」', remoteRule.article && remoteRule.cache, remoteRule);
    check('释义还没回来 → 暂时不给「联网深查」', !remoteRule.pending, remoteRule);
    check('完全没有语境释义 → 给「联网深查」', remoteRule.none, remoteRule);

    check('卡片里不存在「本句翻译」按钮（2026-10-05 已删除）',
        await page.locator('.word-card .wc-btn-sentence').count() === 0);
    check('卡片里不存在「本句翻译」的译文盒子',
        await page.locator('.word-card .wc-st-box').count() === 0);

    // 卡片有 `animation: fadeIn 0.2s`，动画未跑完时 opacity < 1（截图会显得半透明）。
    // 这里等它归位：既是断言（防止将来漏加 forwards 导致卡片永久半透明），也让截图是干净的。
    await page.waitForFunction(
        () => getComputedStyle(document.querySelector('.word-card')).opacity === '1',
        { timeout: 3000 }).catch(() => {});
    check('入场动画结束后卡片完全不透明（opacity=1）',
        await page.evaluate(() => getComputedStyle(document.querySelector('.word-card')).opacity) === '1');
    await page.screenshot({ path: SHOT });
    console.log(`        截图已保存：${path.basename(SHOT)}`);

    console.log('\n【③ 点一个「文章里没释义、词典里有」的词 → 词典独中，且同步出卡】');
    // 同步拿一次 HTML：证明「没有等任何网络请求」卡片就已经有词典义项了
    const syncHtml = await page.evaluate(() => {
        openWordCard('brightly', 'the sun was shining brightly', 'brightly', 640, 360);
        const c = document.querySelector('.word-card');
        return c ? c.innerHTML : '';
    });
    check('同步出卡的 HTML 里就已经有词典义项（零网络）',
        syncHtml.includes('明亮') && !syncHtml.includes('本地词典未收录该词'), syncHtml.slice(0, 140));
    await page.waitForFunction(() => !!document.querySelector('.word-card .wc-dict'), { timeout: 8000 });
    const d3 = await page.locator('.word-card .wc-dict').textContent();
    check('词典独中：其他释义有内容', d3.includes('明亮') || d3.includes('光亮') || d3.length > 20, d3.slice(0, 90));
    check('没有语境释义 → 给出「联网深查」入口（真实 DOM 里能找到按钮）', await page.locator('.word-card .wc-btn-remote').count() === 1);
    check('词典独中时卡片里也没有「本句翻译」按钮',
        await page.locator('.word-card .wc-btn-sentence').count() === 0);

    console.log('\n【④ 词典也查不到的冷词 → 卡片干净，只留「联网深查」入口】');
    // 直接打开一个词典/语境都没有的自造词，模拟「点了个冷词」
    await page.evaluate(() => openWordCard('quuxly', 'A quuxly sentence appears here.', 'quuxly', 640, 360));
    await page.waitForFunction(() => !!document.querySelector('.word-card .wc-dict'), { timeout: 8000 });
    check('卡片提示「本地词典未收录该词」', (await page.locator('.word-card .wc-dict').textContent()).includes('本地词典未收录'),
        (await page.locator('.word-card .wc-dict').textContent()).slice(0, 60));
    // 本地接口只要 ~1ms 就回来 → 结果就是「确定查不到」，旧逻辑会在这里放按钮；现在应该什么都没有
    await sleep(1200);
    check('冷词确定查不到 → 卡片里没有「本句翻译」按钮',
        await page.locator('.word-card .wc-btn-sentence').count() === 0);
    check('冷词确定查不到 → 卡片里没有译文盒子',
        await page.locator('.word-card .wc-st-box').count() === 0);
    check('冷词仍保留「联网深查」入口',
        await page.locator('.word-card .wc-btn-remote').count() === 1);
    check('保留下来的「悬停句子 3 秒 → 浮层」入口仍在（DOM + 函数都在）',
        await page.evaluate(() => !!document.getElementById('sentenceHoverPanel')
            && typeof showSentenceHoverPanel === 'function'
            && typeof armSentenceHover === 'function'
            && SENTENCE_HOVER_DELAY_MS === 3000));

    console.log('\n【⑤ 后台核对卡住 6 秒不返回 → 等满 3.6 秒也不会冒出按钮（真等一遍）】');
    // 把 /api/words/* 拖慢，稳定复现「后台还没回来」的那段窗口（旧逻辑会在 3 秒时放按钮）
    await page.route('**/api/words/**', async (route) => {
        await new Promise(r => setTimeout(r, 6000));
        try { await route.continue(); } catch (e) { /* 已 unroute */ }
    });
    await page.evaluate(() => openWordCard('zzslow', 'A zzslow sentence appears here.', 'zzslow', 640, 360));
    await sleep(800);
    check('释义还没回来 → 依然没有「本句翻译」按钮',
        await page.locator('.word-card .wc-btn-sentence').count() === 0);
    check('此时卡片正显示「正在查询本句释义…」（后台确实还挂着）',
        await page.locator('.word-card .wc-pending').count() >= 1);
    await sleep(2800);   // 累计 ~3.6s → 旧逻辑的 3 秒计时必然已到点
    check('超过旧的 3 秒阈值 → 按钮仍然不存在（逻辑确已删除）',
        await page.locator('.word-card .wc-btn-sentence').count() === 0);
    await page.unroute('**/api/words/**');

    console.log('\n【⑥ 卡片的滚动保护（词典义项很长时不能顶出屏幕）】');
    await page.evaluate(() => openWordCard('better', 'This one is better.', 'better', 640, 360));
    await page.waitForFunction(() => !!document.querySelector('.word-card .wc-dict'), { timeout: 8000 });
    const geo = await page.evaluate(() => {
        const c = document.querySelector('.word-card');
        const r = c.getBoundingClientRect();
        const cs = getComputedStyle(c);
        return { top: r.top, bottom: r.bottom, h: r.height, vh: window.innerHeight, overflowY: cs.overflowY, maxH: cs.maxHeight };
    });
    check('卡片高度被限制在视口内（max-height 生效）', geo.h <= geo.vh * 0.75 + 2, geo);
    check('卡片自身可滚动（overflow-y: auto）', geo.overflowY === 'auto', geo.overflowY);

    // ==================================================================================
    // 2026-10-06：用户反馈的三个问题的回归锚点
    // ==================================================================================

    console.log('\n【⑦ 问题一：收藏释义不再写死「暂无释义」】');
    const bm = await page.evaluate(() => ({
        ctxFirst: bestMeaningForCollect('beautiful', { contextDefinition: '美丽的' }),
        dictFallback: bestMeaningForCollect('brightly'),
        cold: bestMeaningForCollect('quuxly'),
        placeholderGuard: bestMeaningForCollect('beautiful', { contextDefinition: '暂无释义' })
    }));
    check('有本句语境释义 → 优先用语境释义', bm.ctxFirst === '美丽的', bm);
    check('语境库没有 → 回落到词典层首义（不再是「暂无释义」）',
        !!bm.dictFallback && bm.dictFallback !== '暂无释义', bm.dictFallback);
    check('冷词确实查不到 → 返回空串（不能写死「暂无释义」污染数据）', bm.cold === '', bm.cold);
    check('contextDefinition 是「暂无释义」→ 跳过它、回落到下一个来源（不会被当成真释义）',
        bm.placeholderGuard !== '暂无释义' && bm.placeholderGuard === '美丽的', bm.placeholderGuard);
    const bmAllPlaceholder = await page.evaluate(() => bestMeaningForCollect('quuxly', { contextDefinition: '暂无释义' }));
    check('所有来源都拿不到（且传进来的是「暂无释义」）→ 空串', bmAllPlaceholder === '', bmAllPlaceholder);

    // 后端兜底：造一条与历史脏数据一模一样的行（definition = '暂无释义'），看接口是否现场补全
    const PROBE_USER = 'e2e-meaning-probe';
    const probeUser = dbOps.getOrCreateUser(PROBE_USER);
    dbOps.db.prepare('DELETE FROM user_words WHERE user_id = ?').run(probeUser.id);   // 清掉上次残留
    dbOps.insertUserWord({
        user_id: probeUser.id, word: 'brightly', definition: '暂无释义',
        sentence: 'The sun was shining brightly.', article_id: 'article_001',
        paragraph_index: 0, sentence_index: 0, status: 'pending', knowledge: 0
    });
    dbOps.insertUserWord({
        user_id: probeUser.id, word: 'zzzznope', definition: '暂无释义',
        sentence: 'Nothing here.', article_id: 'article_001',
        paragraph_index: 0, sentence_index: 1, status: 'pending', knowledge: 0
    });
    const uwRes = await fetch(`${BASE}/api/user-words`, { headers: { 'x-username': PROBE_USER } });
    const uw = await uwRes.json();
    const uwRow = uw.find(w => w.word === 'brightly');
    const uwCold = uw.find(w => w.word === 'zzzznope');
    check('/api/user-words 返回数组', Array.isArray(uw) && uw.length === 2, Array.isArray(uw) ? uw.length : typeof uw);
    check('脏 definition=「暂无释义」的行被现场补出真释义',
        !!uwRow && !!uwRow.meaning && uwRow.meaning !== '暂无释义', uwRow && uwRow.meaning);
    check('补全时给出 meaningSource（可追溯来自哪一层）',
        !!uwRow && ['dictionary', 'context', 'cache'].indexOf(uwRow.meaningSource) >= 0, uwRow && uwRow.meaningSource);
    check('补全的同时带上 dictionary（音标 + 全部义项）',
        !!(uwRow && uwRow.dictionary && uwRow.dictionary.phonetic), uwRow && uwRow.dictionary && uwRow.dictionary.phonetic);
    check('原 definition 字段原样保留（排查数据质量用）', !!uwRow && uwRow.definition === '暂无释义');
    check('真的查不到的词给空串 + meaningSource=null（不编造）',
        !!uwCold && uwCold.meaning === '' && uwCold.meaningSource === null,
        uwCold && { meaning: uwCold.meaning, meaningSource: uwCold.meaningSource });
    dbOps.db.prepare('DELETE FROM user_words WHERE user_id = ?').run(probeUser.id);   // 清理探针数据

    console.log('\n【⑧ 问题二：词性缩写 a. → adj.（ECDICT 老式缩写归一）】');
    const pretty = await page.evaluate(() => ({
        a: prettyPosLabel('a'), ad: prettyPosLabel('ad'),
        adjWeighted: prettyPosLabel('adj:100'), cn: prettyPosLabel('形容词'), nul: prettyPosLabel(null)
    }));
    check('prettyPosLabel(a) → adj', pretty.a === 'adj', pretty);
    check('prettyPosLabel(ad) → adv', pretty.ad === 'adv', pretty);
    check('prettyPosLabel(adj:100) → adj（ECDICT 机器格式也要归一）', pretty.adjWeighted === 'adj', pretty);
    check('prettyPosLabel(null) → 空串（不显示 undefined）', pretty.nul === '', pretty);

    // 词典层原始数据（用户截图里的 little，ECDICT 原文是 a.）
    const little = dbOps.getDictionaryEntry('little');
    const littleLines = little ? little.translationLines : [];
    check('词典层 little 的义项里出现 adj.（不再是行首 a.）',
        littleLines.some(l => /^adj\./.test(l)), littleLines.slice(0, 3));
    check('词典层 little 的义项里没有残留行首 a. / ad.',
        !littleLines.some(l => /^a\.\s/.test(l) || /^ad\.\s/.test(l)), littleLines.slice(0, 3));
    const littleApi = await (await fetch(`${BASE}/api/dictionary/little`)).json();
    check('接口 /api/dictionary/little 也返回归一后的词性',
        !!(littleApi.entry && littleApi.entry.translationLines
            && littleApi.entry.translationLines.some(l => /^adj\./.test(l))),
        littleApi.entry && littleApi.entry.translationLines.slice(0, 3));

    console.log('\n【⑨ 问题三：预置文章也有可悬停的句子（无译文时本地切句兜底）】');
    // 最底层根因：app.js 顶部预置文章只有 `article` 正文、没有 sentences 数组，
    // 旧实现下 `.article-sentence` 一个都生成不出来 → 悬停 3 秒永远不可能触发（静默失效）。
    const sentStat = await page.evaluate(() => ({
        inReadContent: document.querySelectorAll('#readContent .article-sentence').length,
        withIdx: document.querySelectorAll('#readContent .article-sentence[data-sentence-idx]').length,
        articleSentences: (currentArticle && currentArticle.sentences || []).length
    }));
    check('预置文章正文已渲染出可悬停的 .article-sentence 节点', sentStat.inReadContent > 0, sentStat);
    check('每个可悬停句都带 data-sentence-idx（浮层按索引取译文）',
        sentStat.withIdx === sentStat.inReadContent, sentStat);
    check('这里确实是「没有译文数据」的预置文章（兜底路径被真实触发）',
        sentStat.articleSentences === 0, sentStat);

    console.log('\n【⑩ 问题三：词卡让开正文列 + 悬停 3 秒真的弹出浮层】');
    await page.evaluate(() => openWordCard('beautiful', 'the sky was a beautiful blue', 'beautiful', 640, 360));
    await page.waitForFunction(() => !!document.querySelector('.word-card'), { timeout: 5000 });
    await sleep(1000);   // 等后台核对回来、卡片高度稳定（ResizeObserver 会重定位）
    const geo2 = await page.evaluate(() => {
        const c = document.querySelector('.word-card');
        const rc = document.getElementById('readContent');
        const a = c.getBoundingClientRect(), b = rc.getBoundingClientRect();
        return {
            card: { l: Math.round(a.left), r: Math.round(a.right), w: Math.round(a.width), h: Math.round(a.height) },
            read: { l: Math.round(b.left), r: Math.round(b.right) },
            rightRoom: Math.round(window.innerWidth - b.right),
            vw: window.innerWidth,
            overlapX: Math.round(Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)))
        };
    });
    check('正文列右侧有足够空档放得下词卡（1280 视口）',
        geo2.rightRoom >= geo2.card.w, geo2);
    check('词卡落在正文列右侧，与正文零水平重叠（不再压住句子）', geo2.overlapX === 0, geo2);

    // 真实鼠标：挪到正文句子上停 3.4 秒 → 浮层必须出现（旧实现：被词卡吃掉事件 / 抖动重置计时，永远不弹）
    const hoverPt = await page.evaluate(() => {
        const rc = document.getElementById('readContent');
        const node = rc.querySelectorAll('.article-sentence')[2] || rc.querySelector('.article-sentence');
        const r = node.getBoundingClientRect();
        return { x: Math.round(r.left + Math.min(120, r.width / 2)), y: Math.round((r.top + r.bottom) / 2) };
    });
    await page.mouse.move(5, 5);
    await sleep(150);
    await page.mouse.move(hoverPt.x, hoverPt.y);
    await sleep(1000);
    check('悬停 1 秒：浮层还没弹（确认延迟=3s 生效，不是立刻就弹）',
        await page.evaluate(() => !document.getElementById('sentenceHoverPanel').classList.contains('visible')));
    await sleep(2600);   // 累计约 3.6s
    const hover2 = await page.evaluate(() => {
        const p = document.getElementById('sentenceHoverPanel');
        return { visible: p.classList.contains('visible'), translation: (p.querySelector('.shp-translation') || {}).textContent || '' };
    });
    check('悬停满 3 秒 → 译文浮层出现（问题三的核心回归锚点）', hover2.visible === true, hover2);
    check('浮层里有内容（有译文显示译文，无译文显示「暂无翻译」而不是空白）',
        hover2.translation.trim().length > 0, hover2.translation);
    check('浮层出现时词卡已让位（两者互斥，不互相遮挡）',
        await page.evaluate(() => !document.querySelector('.word-card')));

    // 【⑩-b】有真译文的真实文章：浮层必须显示真中文译文。
    // 为什么必须单独测这条：上一轮回归只用了 article_001（预置、`sentences=[]`），
    // 走的是「本地切句兜底 + （暂无翻译）」，**「有译文」这条路径从没被端到端验证过** →
    // 一度误判成「所有文章都没有译文」。文章 id 不写死，直接从库里找第一篇带 translation 的。
    console.log('\n【⑩-b 有真译文的文章：悬停浮层显示真中文译文】');
    let realArticleId = null;
    try {
        for (const r of dbOps.db.prepare('SELECT id, sentences FROM articles').all()) {
            let arr = [];
            try { arr = r.sentences ? JSON.parse(r.sentences.toString()) : []; } catch (e) { arr = []; }
            if (Array.isArray(arr) && arr.some(s => s && (s.translation || s.zh || s.chinese || s.cn))) {
                realArticleId = r.id;
                break;
            }
        }
    } catch (e) { realArticleId = null; }
    check('库里能找到一篇真带译文的文章（不是只有预置那 6 篇）', !!realArticleId, realArticleId);

    if (realArticleId) {
        const realArt = await page.evaluate(async (id) => {
            const d = await (await fetch('/api/article/' + id)).json();
            ARTICLES.unshift({
                id: d.id, title: d.title, description: d.description, level: d.level,
                levelLabel: d.levelLabel, article: d.article, words: d.words, sentences: d.sentences
            });
            openArticle(d.id);
            await new Promise(r => setTimeout(r, 800));
            const nodes = [...document.querySelectorAll('#readContent .article-sentence')];
            return {
                id: d.id,
                serverSentences: (d.sentences || []).length,
                nodes: nodes.length,
                firstExpect: (d.sentences && d.sentences[0] && d.sentences[0].translation) || ''
            };
        }, realArticleId);
        check('真实译文文章：DOM 里生成了 .article-sentence 节点', realArt.nodes > 0, realArt);

        const pt = await page.evaluate(() => {
            const n = document.querySelector('#readContent .article-sentence');
            const r = n.getBoundingClientRect();
            return { x: Math.round(r.left + Math.min(60, r.width / 2)), y: Math.round((r.top + r.bottom) / 2) };
        });
        await page.mouse.move(5, 5);
        await sleep(150);
        await page.mouse.move(pt.x, pt.y);
        await sleep(3400);
        const hov = await page.evaluate(() => {
            const p = document.getElementById('sentenceHoverPanel');
            return {
                visible: p.classList.contains('visible'),
                origin: (p.querySelector('.shp-origin') || {}).textContent || '',
                translation: (p.querySelector('.shp-translation') || {}).textContent || ''
            };
        });
        check('有译文文章：悬停 3 秒浮层出现', hov.visible === true, hov);
        check('有译文文章：浮层显示真中文译文（不是「（暂无翻译）」）',
            hov.translation.trim().length > 0 && hov.translation.indexOf('暂无翻译') < 0
            && /[\u4e00-\u9fa5]/.test(hov.translation), hov);
    }

    // 【⑫】partial 文章的「兜底 UI + 重试句子翻译」（2026-10-07 新增）
    // 为什么必须在真浏览器里测：需求本身就是 UI 需求（提示条 + 按钮要真的看得见、点得动、
    // 点完要真的收起），DOM 打桩测不出「节点在不在、CSS 有没有把它藏起来」。
    console.log('\n【⑫ partial 文章的兜底 UI 与「重试句子翻译」】');
    const coze = require('./coze');
    const ORIG_SENT = coze.analyzeSentencesWithCoze;
    const UI_ART = 'qa_ui_retry_' + process.pid;
    const UI_USER = dbOps.getOrCreateUser('e2e-retry-probe');
    const UI_QUESTIONS = [
        { type: 'detail', question: 'What do dogs do every night?', options: ['Guard the house', 'Sleep', 'Run', 'Swim'], answer_index: 0, explanation: '文中说 guard the house every night' },
        { type: 'main-idea', question: 'What is the passage about?', options: ['Dogs', 'Cats', 'Birds', 'Fish'], answer_index: 0, explanation: '' }
    ];
    const UI_CONTENT = 'Dogs are loyal. They guard the house every night. Children love to play with them.';

    try {
        dbOps.db.prepare('DELETE FROM articles WHERE id = ?').run(UI_ART);   // 清掉上次残留
        dbOps.insertArticle({
            id: UI_ART, user_id: UI_USER.id, title: 'QA partial UI probe', description: 'QA',
            content: UI_CONTENT, source: 'upload', status: 'pending',
            questions: UI_QUESTIONS, sentences: []
        });
        // 造出「单词/题目成功、只有句子翻译失败」的落库形态
        dbOps.db.prepare("UPDATE articles SET status='partial', sentences='[]', sentences_error=? WHERE id=?")
            .run('QA: 初次句子翻译失败', UI_ART);

        // 打桩句子工作流：点「重试」时返回固定译文 → 不联网、不耗 Coze 额度
        let retryCalls = 0;
        coze.analyzeSentencesWithCoze = async () => {
            retryCalls++;
            return { sentenceList: [
                { sentence: 'Dogs are loyal.', translation: '狗很忠诚。' },
                { sentence: 'They guard the house every night.', translation: '它们每晚守着房子。' },
                { sentence: 'Children love to play with them.', translation: '孩子们喜欢和它们一起玩。' }
            ] };
        };

        const ui = await page.evaluate(async (id) => {
            await loadArticleDetail(id);
            openArticle(id);
            await new Promise(r => setTimeout(r, 400));
            const bar = document.getElementById('sentenceFailNotice');
            const btn = document.getElementById('sentenceRetryBtn');
            return {
                status: (currentArticle || {}).status,
                barHidden: bar.classList.contains('hidden'),
                text: (document.getElementById('sentenceFailNoticeText') || {}).textContent || '',
                hasBtn: !!btn,
                btnText: btn ? btn.textContent.trim() : '',
                btnDisabled: btn ? btn.disabled : null,
                btnVisible: btn ? btn.getBoundingClientRect().width > 0 : false,
                wordSpans: document.querySelectorAll('#readContent .word-span').length,
                sentenceNodes: document.querySelectorAll('#readContent .article-sentence').length,
                bodyLen: (document.getElementById('readContent') || {}).textContent.trim().length,
                quizCards: document.querySelectorAll('#quizQuestions > *').length
            };
        }, UI_ART);

        check('partial 文章：正文正常渲染（有词 span，可点词）', ui.wordSpans > 10, ui);
        check('partial 文章：句子节点已生成（悬停有落点）', ui.sentenceNodes > 0, ui.sentenceNodes);
        check('partial 文章：单词释义正常（currentArticle.words 有内容）',
            await page.evaluate(() => Object.keys((currentArticle && currentArticle.words) || {}).length > 0));
        check('partial 文章：题目区正常渲染（不是空白）', ui.quizCards > 0, ui.quizCards);

        check('partial 文章：句子翻译提示条**可见**', ui.barHidden === false, ui.barHidden);
        check('提示文案 = 「句子翻译暂时不可用」', ui.text === '句子翻译暂时不可用', ui.text);
        check('提示条里有「重试」按钮且可见可点', ui.hasBtn && ui.btnVisible && ui.btnText === '重试' && ui.btnDisabled === false, ui);

        // 悬停句子：应明确提示「不可用 + 可重试」，而不是含糊的「（暂无翻译）」
        const hpt = await page.evaluate(() => {
            const n = document.querySelector('#readContent .article-sentence');
            const r = n.getBoundingClientRect();
            return { x: Math.round(r.left + Math.min(40, r.width / 2)), y: Math.round((r.top + r.bottom) / 2) };
        });
        await page.mouse.move(5, 5);
        await sleep(150);
        await page.mouse.move(hpt.x, hpt.y);
        await sleep(3400);
        const hovPartial = await page.evaluate(() => {
            const p = document.getElementById('sentenceHoverPanel');
            return { visible: p.classList.contains('visible'), translation: (p.querySelector('.shp-translation') || {}).textContent || '' };
        });
        check('partial 文章：悬停浮层显示「句子翻译暂时不可用」', hovPartial.visible && /句子翻译暂时不可用/.test(hovPartial.translation), hovPartial);
        await page.mouse.move(5, 5);
        await sleep(300);

        // ---- 点「重试」----
        const beforeCalls = retryCalls;
        await page.click('#sentenceRetryBtn');
        await sleep(250);
        const midBtn = await page.evaluate(() => {
            const b = document.getElementById('sentenceRetryBtn');
            return { text: b.textContent.trim(), disabled: b.disabled };
        });
        check('点重试后按钮进入「重试中…」且被禁用（防连点）', /重试中/.test(midBtn.text) && midBtn.disabled === true, midBtn);

        // 等提示条收起（= 重试成功回来后 syncSentenceFailedNotice 把它藏了）
        let barGone = false;
        for (let i = 0; i < 40; i++) {
            barGone = await page.evaluate(() => document.getElementById('sentenceFailNotice').classList.contains('hidden'));
            if (barGone) break;
            await sleep(200);
        }
        check('重试成功后：句子翻译提示条自动收起', barGone === true);
        check('重试只调了 1 次句子工作流', retryCalls - beforeCalls === 1, retryCalls - beforeCalls);

        const after = await page.evaluate(() => ({
            status: (currentArticle || {}).status,
            sentences: ((currentArticle && currentArticle.sentences) || []).length,
            firstTrans: (((currentArticle && currentArticle.sentences) || [])[0] || {}).translation || '',
            questions: ((currentArticle && currentArticle.questions) || []).length,
            words: Object.keys((currentArticle && currentArticle.words) || {}).length
        }));
        check('重试后前端状态 = completed', after.status === 'completed', after.status);
        check('重试后译文已进内存（3 句）', after.sentences === 3, after.sentences);
        check('重试后**题目没丢**（只重跑译文，不碰题目）', after.questions === 2, after.questions);
        check('重试后单词释义仍在', after.words > 0, after.words);

        // 悬停应能看到真中文译文了
        await page.mouse.move(hpt.x, hpt.y);
        await sleep(3400);
        const hovAfter = await page.evaluate(() => (document.querySelector('#sentenceHoverPanel .shp-translation') || {}).textContent || '');
        check('重试成功后：悬停浮层显示真中文译文', /[\u4e00-\u9fa5]/.test(hovAfter) && hovAfter.indexOf('暂时不可用') < 0, hovAfter);
        await page.mouse.move(5, 5);

        // 库里也要真的翻成 completed（不能只改内存）
        const dbAfter = dbOps.db.prepare('SELECT status, sentences, sentences_error, questions FROM articles WHERE id = ?').get(UI_ART);
        check('库里 status 也翻成 completed', dbAfter.status === 'completed', dbAfter.status);
        check('库里 sentences_error 已清空', dbAfter.sentences_error === null, dbAfter.sentences_error);
        check('库里题目原样保留', JSON.parse(dbAfter.questions || '[]').length === 2, dbAfter.questions);
    } catch (e) {
        check('【⑫】执行过程中出现异常', false, String(e && e.message || e));
    } finally {
        coze.analyzeSentencesWithCoze = ORIG_SENT;
        try { dbOps.db.prepare('DELETE FROM articles WHERE id = ?').run(UI_ART); } catch (_) {}
    }

    // ================= 【⑬⑭】2026-10-07 两个线上问题 =================
    //
    // 问题一「句子翻译成功（17 句）但浮层显示『暂无翻译』」—— 必须在真浏览器里复现，因为它由
    //   ① 「文章列表刷新把已加载的详情冲成空壳」+ ② 「正文掉空格导致句子匹配不上」两件事叠加而成：
    //   前者只在真实的分页请求/合并路径上出现，后者只在真实的「正文 = PDF 抽取文本」上出现。
    // 问题二「粘贴导致词粘连」—— 需求是 UI（卡片上要看到「合并 → 分开」三行），打桩测不出渲染。
    //
    // 样本用自造文章（finally 里删掉）：正文故意写成「词间空格丢失」（rapiddevelopment），
    //   而后端 sentenceList 里空格是正常的 —— 这正是线上那篇文章的结构。
    console.log('\n【⑬⑭ 问题一（列表刷新 × 掉空格匹配）+ 问题二（粘连词拆分）】');
    const GLUE_ART = 'qa_glue_probe';
    let probeUserId = (dbOps.db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get() || {}).id || 1;
    const GLUE_CONTENT = 'With the rapiddevelopment of Chinese economic and the improvement of living standards ofordinary people, more and more private cars are on road.';
    const GLUE_SENTENCE = 'With the rapid development of Chinese economic and the improvement of living standards of ordinary people, more and more private cars are on road.';
    const GLUE_TRANS = '随着中国经济的快速发展和普通民众生活水平的提高，道路上的私家车越来越多。';
    try {
        dbOps.db.prepare('DELETE FROM articles WHERE id = ?').run(GLUE_ART);
        dbOps.db.prepare(`
            INSERT INTO articles (id, user_id, title, description, content, source, level, level_label,
                                  word_count, status, questions, sentences)
            VALUES (@id, @uid, 'QA Glue Probe', '', @content, 'upload', 'middle', '初中',
                    19, 'completed', '[]', @sentences)
        `).run({
            id: GLUE_ART, uid: probeUserId, content: GLUE_CONTENT,
            sentences: JSON.stringify([{ sentence: GLUE_SENTENCE, translation: GLUE_TRANS }])
        });

        // ---- ⑬-a 打开文章（详情按需拉取）→ 译文必须就位 ----
        await page.evaluate(async (id) => {
            await fetch('/api/articles?page=1&pageSize=10&withContent=1');   // 先把列表刷一遍（模拟真实入口）
            openArticle(id);
        }, GLUE_ART);
        await page.waitForFunction((id) => {
            const a = ARTICLES.find(x => x.id === id);
            return !!(a && a.detailLoaded && (a.sentences || []).length > 0);
        }, GLUE_ART, { timeout: 15000 }).catch(() => {});
        const st1 = await page.evaluate((id) => {
            const a = ARTICLES.find(x => x.id === id) || {};
            return { sentences: (a.sentences || []).length, detailLoaded: !!a.detailLoaded };
        }, GLUE_ART);
        check('【⑬】打开后详情到位（译文 > 0 句）', st1.sentences > 0 && st1.detailLoaded, st1);

        // ---- ⑬-b 关键回归：再刷一次文章列表，详情**不能被轻量列表项冲掉** ----
        // 这正是线上问题的根因：旧代码 `ARTICLES[i] = Object.assign({}, 已加载详情的, 轻量列表项)`
        // 会把 sentences 打回 []，而补拉守卫 !articleDetailAsked[id] 又永远为 false → 永不补拉。
        await page.evaluate(() => loadArticlesPage(1, { force: true }));
        await sleep(900);
        const st2 = await page.evaluate((id) => {
            const a = ARTICLES.find(x => x.id === id) || {};
            return { sentences: (a.sentences || []).length, detailLoaded: !!a.detailLoaded, cur: (currentArticle || {}).sentences ? currentArticle.sentences.length : -1 };
        }, GLUE_ART);
        check('【⑬】列表刷新后译文没被冲掉（旧代码在这里会变 0）', st2.sentences > 0, st2);
        check('【⑬】列表刷新后 detailLoaded 仍为 true', st2.detailLoaded === true, st2);

        // ---- ⑬-c 掉空格的正文 → 句子仍能匹配上译文，悬停显示真中文 ----
        const nodes13 = await page.evaluate(() => document.querySelectorAll('#readContent .article-sentence').length);
        check('【⑬】掉空格的正文仍生成了可悬停的句子节点', nodes13 > 0, nodes13);
        const pt13 = await page.evaluate(() => {
            const n = document.querySelector('#readContent .article-sentence');
            if (!n) return null;
            const r = n.getBoundingClientRect();
            return { x: Math.round(r.left + 40), y: Math.round((r.top + r.bottom) / 2) };
        });
        await page.mouse.move(5, 5);
        await sleep(150);
        await page.mouse.move(pt13.x, pt13.y);
        await sleep(3400);
        const hov13 = await page.evaluate(() => (document.querySelector('#sentenceHoverPanel .shp-translation') || {}).textContent || '');
        check('【⑬】悬停显示真中文译文（旧代码在这里显示「（暂无翻译）」）',
            /[\u4e00-\u9fa5]/.test(hov13) && hov13.indexOf('暂无翻译') < 0, hov13);
        await page.mouse.move(5, 5);

        // ---- ⑬-d 极端兜底：手动把文章打回「空壳 + 已问过详情」→ 自愈必须把它救回来 ----
        await page.evaluate((id) => {
            const a = ARTICLES.find(x => x.id === id);
            a.sentences = []; a.detailLoaded = false;               // 制造「被冲掉」的状态
            articleDetailAsked[id] = true;                          // 旧代码的一次性闸门（现在不该再挡住补拉）
            renderArticle(id);
        }, GLUE_ART);
        await page.waitForFunction((id) => {
            const a = ARTICLES.find(x => x.id === id);
            return !!(a && (a.sentences || []).length > 0);
        }, GLUE_ART, { timeout: 15000 }).catch(() => {});
        const healed = await page.evaluate((id) => ((ARTICLES.find(x => x.id === id) || {}).sentences || []).length, GLUE_ART);
        check('【⑬】空壳状态会自愈（旧代码被 articleDetailAsked 永久钉住）', healed > 0, healed);

        // ---- ⑭ 点粘连词 rapiddevelopment → 卡片给出「合并 + 分开」三行 ----
        const glueSpan = await page.evaluate(async () => {
            const s = [...document.querySelectorAll('#readContent .word-span')].find(x => x.getAttribute('data-word') === 'rapiddevelopment');
            if (!s) return { found: false };
            s.click();
            return { found: true };
        });
        check('【⑭】正文里确实渲染出了粘连词 rapiddevelopment 的 span', glueSpan.found === true, glueSpan);
        await sleep(1000);
        const glueCard = await page.evaluate(() => {
            const c = document.querySelector('.word-card');
            if (!c) return { card: false };
            const g = c.querySelector('.wc-glue');
            return {
                card: true,
                hasSection: !!g,
                text: g ? g.textContent.replace(/\s+/g, '') : '',
                mergedRow: g ? (g.textContent.match(/合并/g) || []).length : 0,
                splitRows: g ? (g.textContent.match(/分开/g) || []).length : 0
            };
        });
        check('【⑭】词卡出现「拆分释义」区块', glueCard.hasSection === true, glueCard);
        check('【⑭】区块里有 1 行「合并」', glueCard.mergedRow === 1, glueCard.mergedRow);
        check('【⑭】区块里有 2 行「分开」', glueCard.splitRows === 2, glueCard.splitRows);
        check('【⑭】合并行显示原词 + 词典未收录', glueCard.text.indexOf('rapiddevelopment') >= 0 && glueCard.text.indexOf('词典未收录') >= 0, glueCard.text.slice(0, 200));
        check('【⑭】rapid 的义项出现', /rapid/.test(glueCard.text) && /迅速|飞快|快的/.test(glueCard.text), glueCard.text.slice(0, 200));
        check('【⑭】development 的义项出现', /development/.test(glueCard.text) && /发展/.test(glueCard.text), glueCard.text.slice(0, 200));
        await page.screenshot({ path: path.join(__dirname, 'test_screenshot_glue_split.png') });
        await page.evaluate(() => hideWordCard());
    } catch (e) {
        check('【⑬⑭】执行过程中出现异常', false, String(e && e.message || e));
    } finally {
        try { dbOps.db.prepare('DELETE FROM user_words WHERE article_id = ?').run(GLUE_ART); } catch (_) {}
        try { dbOps.db.prepare('DELETE FROM articles WHERE id = ?').run(GLUE_ART); } catch (_) {}
    }

    // ================= 【⑮】2026-10-07 释义锁（猜词模式） =================
    //
    // 打桩测不出「真实点击一次是不是真的能看到输入框 / 点了提交 UI 真的换形」——
    // 这一节全在真浏览器里跑：真 DOM 查询、真 fill、真 click、真鼠标悬停。
    // 样本用自造文章（finally 里删掉），句子带真译文，词用 ECDICT 一定收录的 development。
    console.log('\n【⑮ 释义锁（猜词模式）——真浏览器端到端】');
    const GUESS_ART = 'qa_guess_probe';
    const GUESS_WORD = 'development';
    const GUESS_SENT = 'The rapid development of the city brings more jobs.';
    const GUESS_TRANS = '城市的快速发展带来了更多的就业机会。';
    try {
        dbOps.db.prepare('DELETE FROM articles WHERE id = ?').run(GUESS_ART);
        dbOps.db.prepare(`
            INSERT INTO articles (id, user_id, title, description, content, source, level, level_label,
                                  word_count, status, questions, sentences)
            VALUES (@id, @uid, 'QA Guess Probe', '', @content, 'upload', 'middle', '初中',
                    10, 'completed', '[]', @sentences)
        `).run({
            id: GUESS_ART, uid: probeUserId, content: GUESS_SENT,
            sentences: JSON.stringify([{ sentence: GUESS_SENT, translation: GUESS_TRANS }])
        });

        // 复位：清理解锁记忆、切回「猜词模式」（= 产品默认态）
        await page.evaluate(() => {
            try {
                localStorage.removeItem('unlockedWords');
                localStorage.removeItem('unlockedSentences');
                localStorage.setItem('guessMode', 'on');
            } catch (e) {}
            loadGuessLockState();
            syncGuessLockButton();
            hideWordCard();
        });
        const lockSw0 = await page.evaluate(() => {
            const b = document.getElementById('guessLockBtn');
            return { text: (b.textContent || '').trim(), on: b.classList.contains('lock-on') };
        });
        check('【⑮】顶部开关显示「🔒 猜词模式」且高亮', lockSw0.text.indexOf('猜词模式') >= 0 && lockSw0.on === true, lockSw0);

        await page.evaluate(async (id) => {
            await fetch('/api/articles?page=1&pageSize=10&withContent=1');
            openArticle(id);
        }, GUESS_ART);
        await page.waitForFunction((id) => {
            const a = ARTICLES.find(x => x.id === id);
            return !!(a && a.detailLoaded && (a.sentences || []).length > 0);
        }, GUESS_ART, { timeout: 15000 }).catch(() => {});
        await sleep(1200);   // 等词典预取回来

        // ---- ⑮-a 点词 → 只给猜测框，释义一个字不露 ----
        const clicked = await page.evaluate((w) => {
            const s = [...document.querySelectorAll('#readContent .word-span')].find(x => x.getAttribute('data-word') === w);
            if (!s) return false;
            s.click();
            return true;
        }, GUESS_WORD);
        check('【⑮】正文里点到了目标单词 span', clicked === true, GUESS_WORD);
        await sleep(900);
        const g1 = await page.evaluate(() => {
            const c = document.querySelector('.word-card');
            if (!c) return { card: false };
            return {
                card: true,
                input: !!c.querySelector('.wc-guess-input'),
                submit: !!c.querySelector('.wc-btn-guess-submit'),
                revealBtn: !!c.querySelector('.wc-btn-guess-reveal'),
                phonetic: !!c.querySelector('.wc-phonetic'),
                badges: !!c.querySelector('.wc-badges'),
                dict: !!c.querySelector('.wc-dict'),
                context: !!c.querySelector('.wc-context'),
                actions: !!c.querySelector('.wc-actions'),
                sentence: (c.querySelector('.wc-sentence') || {}).textContent || ''
            };
        });
        check('【⑮】词卡出现猜测输入框', g1.input === true, g1);
        check('【⑮】猜测框配「提交」+「直接看释义」两个按钮', g1.submit === true && g1.revealBtn === true, g1);
        check('【⑮】未画音标（答案藏住）', g1.phonetic === false, g1);
        check('【⑮】未画徽章（原形/牛津/柯林斯 会泄题）', g1.badges === false, g1);
        check('【⑮】未画「其他释义」词典栏', g1.dict === false, g1);
        check('【⑮】未画「当前语境释义」栏', g1.context === false, g1);
        check('【⑮】未画「标记/收藏」动作区（不给绕过锁的近路）', g1.actions === false, g1);
        check('【⑮】句子原文仍显示（猜词要有语境）', g1.sentence.indexOf('rapid development') >= 0, g1.sentence);
        await page.screenshot({ path: path.join(__dirname, 'test_screenshot_guess_lock.png') });

        // ---- ⑮-b 输入猜测 + 点提交 → 并列展示，不判对错 ----
        const guessText = '发展；进展';
        await page.fill('.word-card .wc-guess-input', guessText);
        await page.click('.word-card .wc-btn-guess-submit');
        await sleep(500);
        const g2 = await page.evaluate(() => {
            const c = document.querySelector('.word-card');
            const r = c && c.querySelector('.wc-guess-result');
            return {
                hasResult: !!r,
                mine: r ? ((r.querySelector('.wc-guess-mine') || {}).textContent || '') : '',
                text: c ? (c.textContent || '') : '',
                context: !!(c && c.querySelector('.wc-context')),
                dict: !!(c && c.querySelector('.wc-dict')),
                actions: !!(c && c.querySelector('.wc-actions')),
                input: !!(c && c.querySelector('.wc-guess-input')),
                verdictMarks: (c ? ((c.textContent || '').match(/[✔✘✅❌]/g) || []) : []).length
            };
        });
        check('【⑮】提交后出现「你的猜测」回显块', g2.hasResult === true, g2);
        check('【⑮】回显内容 = 刚输入的内容', g2.mine.indexOf(guessText) >= 0, g2.mine);
        check('【⑮】猜测框已收起（换成对照视图）', g2.input === false, g2);
        check('【⑮】同时画出「📍 正确释义」栏', g2.context === true, g2);
        check('【⑮】同时画出「📚 其他释义」栏', g2.dict === true, g2);
        check('【⑮】动作区恢复（标记/收藏回来）', g2.actions === true, g2);
        check('【⑮】文案含「正确释义」与「其他释义」（用户能自行对照）',
            g2.text.indexOf('正确释义') >= 0 && g2.text.indexOf('其他释义') >= 0, g2.text.slice(0, 160));
        check('【⑮】★不判对错★：没有任何 ✔/✘ 判定标记', g2.verdictMarks === 0, g2.verdictMarks);
        await page.screenshot({ path: path.join(__dirname, 'test_screenshot_guess_echo.png') });

        // ---- ⑮-c 同一个词再点一次 → 已解锁，直接给完整释义 ----
        await page.evaluate((w) => {
            hideWordCard();
            const s = [...document.querySelectorAll('#readContent .word-span')].find(x => x.getAttribute('data-word') === w);
            if (s) s.click();
        }, GUESS_WORD);
        await sleep(900);
        const g3 = await page.evaluate((w) => {
            const c = document.querySelector('.word-card');
            let unlocked = [];
            try { unlocked = JSON.parse(localStorage.getItem('unlockedWords') || '[]') || []; } catch (e) {}
            return {
                input: !!(c && c.querySelector('.wc-guess-input')),
                result: !!(c && c.querySelector('.wc-guess-result')),
                context: !!(c && c.querySelector('.wc-context')),
                dict: !!(c && c.querySelector('.wc-dict')),
                hasWord: unlocked.indexOf(w) >= 0,
                unlockedCount: unlocked.length
            };
        }, GUESS_WORD);
        check('【⑮】已解锁的词再点开 → 不再要求猜', g3.input === false, g3);
        check('【⑮】已解锁的词直接显示释义栏（不再是刚提交的对照态）', g3.context === true && g3.dict === true && g3.result === false, g3);
        check('【⑮】该词已写入 localStorage.unlockedWords', g3.hasWord === true, g3);

        // ---- ⑮-d 顶部开关切到「查看模式」→ 没解锁过的词也直接显示 ----
        await page.evaluate(() => hideWordCard());
        await page.click('#guessLockBtn');
        await sleep(250);
        const sw = await page.evaluate(() => {
            const b = document.getElementById('guessLockBtn');
            return { text: (b.textContent || '').trim(), on: b.classList.contains('lock-on'), mode: localStorage.getItem('guessMode') };
        });
        check('【⑮】点开关切到「🔓 查看模式」', sw.text.indexOf('查看模式') >= 0 && sw.on === false, sw);
        check('【⑮】模式选择落盘 localStorage.guessMode=off', sw.mode === 'off', sw);
        // 切回猜词模式，供后面的句子锁测试用
        await page.click('#guessLockBtn');
        await sleep(250);
        check('【⑮】再点一次切回「猜词模式」', await page.evaluate(() => localStorage.getItem('guessMode')) === 'on');

        // ---- ⑮-e 句子锁：悬停 3 秒 → 先猜一猜 + 看翻译按钮 → 点开才给译文 ----
        const pt15 = await page.evaluate(() => {
            const n = document.querySelector('#readContent .article-sentence');
            if (!n) return null;
            const r = n.getBoundingClientRect();
            return { x: Math.round(r.left + 40), y: Math.round((r.top + r.bottom) / 2) };
        });
        check('【⑮】正文里有可悬停的句子节点', !!pt15, pt15);
        if (pt15) {
            await page.mouse.move(5, 5);
            await sleep(200);
            await page.mouse.move(pt15.x, pt15.y);
            await sleep(3400);
            const h1 = await page.evaluate(() => {
                const p = document.getElementById('sentenceHoverPanel');
                const t = p.querySelector('.shp-translation');
                const r = p.querySelector('.shp-reveal');
                return { trans: t ? (t.textContent || '') : '', revealVisible: !!(r && !r.classList.contains('hidden')) };
            });
            check('【⑮】句子未解锁 → 浮层显示「先猜一猜这句话的意思」', /先猜一猜/.test(h1.trans), h1);
            check('【⑮】句子未解锁 → 真译文没被显示', h1.trans.indexOf(GUESS_TRANS.slice(0, 4)) < 0, h1.trans);
            check('【⑮】「🔓 看翻译」按钮显示出来', h1.revealVisible === true, h1);
            await page.screenshot({ path: path.join(__dirname, 'test_screenshot_guess_sentence.png') });

            await page.click('#shpRevealBtn');
            await sleep(400);
            const h2 = await page.evaluate(() => {
                const p = document.getElementById('sentenceHoverPanel');
                const t = p.querySelector('.shp-translation');
                const r = p.querySelector('.shp-reveal');
                let unlocked = [];
                try { unlocked = JSON.parse(localStorage.getItem('unlockedSentences') || '[]') || []; } catch (e) {}
                return { trans: t ? (t.textContent || '') : '', revealHidden: !!(r && r.classList.contains('hidden')), unlockedCount: unlocked.length };
            });
            check('【⑮】点「看翻译」后浮层显示真译文', h2.trans.indexOf(GUESS_TRANS.slice(0, 4)) >= 0, h2.trans);
            check('【⑮】「看翻译」按钮点击后收起', h2.revealHidden === true, h2);
            check('【⑮】句子解锁已落盘 localStorage.unlockedSentences', h2.unlockedCount > 0, h2);
            await page.mouse.move(5, 5);
        }
    } catch (e) {
        check('【⑮】执行过程中出现异常', false, String((e && e.message) || e));
    } finally {
        try { dbOps.db.prepare('DELETE FROM user_words WHERE article_id = ?').run(GUESS_ART); } catch (_) {}
        try { dbOps.db.prepare('DELETE FROM articles WHERE id = ?').run(GUESS_ART); } catch (_) {}
        try { await page.evaluate(() => { try { localStorage.removeItem('unlockedWords'); localStorage.removeItem('unlockedSentences'); localStorage.setItem('guessMode', 'off'); loadGuessLockState(); } catch (e) {} }); } catch (_) {}
    }

    // ================= 【⑯】2026-10-08 译文「缺失/失败」的提示条 + 重试入口 =================
    //
    // 根因（用真库数据逐篇复现后定位）：真库里存在 status='completed' 但 sentences=[]、
    //   sentences_error=null 的上传文章（早期「句子翻译失败被静默写成 completed」的存量）。
    //   前端过去把它和「预置文章本来就没译文」混为一谈 → 悬停只显示「（暂无翻译）」，
    //   阅读页既没有提示条、也没有重试入口，用户完全不知道能修。
    // 本节自造一篇完全一样的坏数据（status=completed、sentences=[]），验证入口真的出现了。
    // 重试接口用 page.route 打桩成 202，**不真的调 Coze**（不烧额度）。
    console.log('\n【⑯ completed 却无译文：提示条 + 重试入口（2026-10-08）】');
    const MISS_ART = 'qa_missing_probe';
    const OK_ART = 'qa_ok_probe';
    const MISS_CONTENT = 'The rapid development of the city brings more jobs. The river runs through the town quietly.';
    try {
        dbOps.db.prepare('DELETE FROM articles WHERE id = ?').run(MISS_ART);
        dbOps.db.prepare(`
            INSERT INTO articles (id, user_id, title, description, content, source, level, level_label,
                                  word_count, status, questions, sentences)
            VALUES (@id, @uid, 'QA Missing Probe', '', @content, 'upload', 'middle', '初中',
                    20, 'completed', '[]', '[]')
        `).run({ id: MISS_ART, uid: probeUserId, content: MISS_CONTENT });

        // 重试接口打桩：立即 202，不真的排队调 Coze
        let retryHits = 0;
        await page.route('**/api/retry-sentences/**', async (route) => {
            retryHits++;
            await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ ok: true, started: true, status: 'processing' }) });
        });

        const cmpLogs = [];
        const onConsole = (m) => { if (m.text().indexOf('🆚 [句子对比]') >= 0) cmpLogs.push(m.text()); };
        page.on('console', onConsole);

        await page.evaluate(async (id) => { await fetch('/api/articles?page=1&pageSize=10&withContent=1'); openArticle(id); }, MISS_ART);
        await page.waitForFunction((id) => { const a = ARTICLES.find(x => x.id === id); return !!(a && a.detailLoaded); }, MISS_ART, { timeout: 15000 }).catch(() => {});
        await sleep(1300);

        const st16 = await page.evaluate(() => {
            const bar = document.getElementById('sentenceFailNotice');
            const btn = document.getElementById('sentenceRetryBtn');
            const txt = document.getElementById('sentenceFailNoticeText');
            return {
                state: articleTranslationState(),
                visible: !!(bar && !bar.classList.contains('hidden')),
                text: txt ? (txt.textContent || '') : '',
                btnText: btn ? (btn.textContent || '') : '',
                btnClickable: !!(btn && !btn.disabled)
            };
        });
        check('【⑯】译文状态判为 missing（completed 但一句译文都没有）', st16.state === 'missing', st16);
        check('【⑯】阅读页出现提示条（旧代码这里完全没有任何提示）', st16.visible === true, st16);
        check('【⑯】文案是「这篇还没有生成译文」而不是「暂时不可用」', st16.text.indexOf('还没有生成译文') >= 0, st16.text);
        check('【⑯】提示条里有可点的「重试」按钮', st16.btnClickable === true && st16.btnText.indexOf('重试') >= 0, st16);
        await page.screenshot({ path: path.join(__dirname, 'test_screenshot_missing_retry.png') });

        // 悬停：文案要指向重试 + 自动打印前后端 sentenceList 对比
        const pt16 = await page.evaluate(() => {
            const n = document.querySelector('#readContent .article-sentence');
            if (!n) return null;
            const r = n.getBoundingClientRect();
            return { x: Math.round(r.left + 50), y: Math.round((r.top + r.bottom) / 2) };
        });
        check('【⑯】正文里有可悬停的句子节点', !!pt16, pt16);
        if (pt16) {
            await page.mouse.move(5, 5); await sleep(200);
            await page.mouse.move(pt16.x, pt16.y); await sleep(3400);
            const hov16 = await page.evaluate(() => {
                const p = document.getElementById('sentenceHoverPanel');
                return { trans: (p.querySelector('.shp-translation') || {}).textContent || '', visible: p.classList.contains('visible') };
            });
            check('【⑯】浮层可见（悬停链路正常）', hov16.visible === true, hov16);
            // 2026-10-08 用户要求：浮层里**不再**写「点正文上方的『重试』」——
            // 提示条不保证每篇都为用户展开，文字指路会指向一个看不见的按钮。
            // 现在浮层只如实说状态；重试入口由正文上方那条提示条自己承担。
            check('【⑯】浮层如实说「还没生成译文」，且不再指向不存在的「重试」按钮',
                hov16.trans.indexOf('还没有生成译文') >= 0 && hov16.trans.indexOf('重试') < 0
                && hov16.trans.trim() !== '（暂无翻译）', hov16.trans);
            await page.mouse.move(5, 5);
        }
        check('【⑯】自动打印了前后端 sentenceList 对比', cmpLogs.length > 0, cmpLogs.slice(0, 2));
        check('【⑯】对比里给出「后端也没有译文 → 从未成功」的结论',
            cmpLogs.some(l => l.indexOf('后端也没有译文') >= 0), cmpLogs.filter(l => l.indexOf('后端') >= 0).slice(0, 3));
        check('【⑯】对比里同时打印了前端与后端的句数',
            cmpLogs.some(l => /前端：buildSentenceList\(\)=\d+ 句/.test(l)) && cmpLogs.some(l => /后端：\/api\/article\//.test(l)));
        cmpLogs.slice(0, 4).forEach(l => console.log('      ' + l.slice(0, 190)));

        // 手工排查入口仍然可用
        const manual = await page.evaluate(() => typeof window.__checkSentenceList === 'function');
        check('【⑯】控制台手工排查入口 __checkSentenceList 已暴露', manual === true);

        // 点「重试」→ 接口被调用 → 按钮进入忙碌态 → 拿到结果后必须自己复位（不能卡在「重试中…」）
        await page.click('#sentenceRetryBtn');
        await sleep(600);
        const busy = await page.evaluate(() => {
            const b = document.getElementById('sentenceRetryBtn');
            return { text: (b.textContent || ''), disabled: !!b.disabled };
        });
        check('【⑯】点重试后按钮进入「重试中…」忙碌态', busy.text.indexOf('重试中') >= 0 && busy.disabled === true, busy);
        check('【⑯】重试接口被真正调用（未被 alreadyDone 挡掉）', retryHits > 0, retryHits);
        await page.waitForFunction(() => {
            const b = document.getElementById('sentenceRetryBtn');
            return b && !b.disabled;
        }, { timeout: 12000 }).catch(() => {});
        const after = await page.evaluate(() => {
            const b = document.getElementById('sentenceRetryBtn');
            const txt = document.getElementById('sentenceFailNoticeText');
            return { text: (b.textContent || ''), disabled: !!b.disabled, notice: txt ? (txt.textContent || '') : '', state: articleTranslationState() };
        });
        check('【⑯】重试结束后按钮自行复位（旧代码会停在「非预期状态」直接放弃）', after.disabled === false && after.text === '重试', after);
        check('【⑯】重试未拿到译文 → 状态落回 failed，提示条文案随之更新',
            after.state === 'failed' && after.notice.indexOf('不可用') >= 0, after);

        page.off('console', onConsole);
        await page.unroute('**/api/retry-sentences/**');

        // 反向回归：有译文的文章**不能**误报提示条；预置文章也不该报
        // （自造一篇「正常」样本，不依赖真库里某篇具体文章是否存在）
        dbOps.db.prepare('DELETE FROM articles WHERE id = ?').run(OK_ART);
        dbOps.db.prepare(`
            INSERT INTO articles (id, user_id, title, description, content, source, level, level_label,
                                  word_count, status, questions, sentences)
            VALUES (@id, @uid, 'QA OK Probe', '', @content, 'upload', 'middle', '初中',
                    20, 'completed', '[]', @sentences)
        `).run({
            id: OK_ART, uid: probeUserId, content: MISS_CONTENT,
            sentences: JSON.stringify([
                { sentence: 'The rapid development of the city brings more jobs.', translation: '城市的快速发展带来了更多的就业机会。' },
                { sentence: 'The river runs through the town quietly.', translation: '这条河静静地流过小镇。' }
            ])
        });
        await page.evaluate(async (id) => { await fetch('/api/articles?page=1&pageSize=10&withContent=1'); openArticle(id); }, OK_ART);
        await page.waitForFunction((id) => {
            const a = ARTICLES.find(x => x.id === id);
            return !!(a && a.detailLoaded && (a.sentences || []).length > 0);
        }, OK_ART, { timeout: 15000 }).catch(() => {});
        await sleep(700);
        const okState = await page.evaluate(() => ({ state: articleTranslationState(), hidden: document.getElementById('sentenceFailNotice').classList.contains('hidden') }));
        check('【⑯】已有译文的文章不会误报提示条', okState.state === 'ok' && okState.hidden === true, okState);
        await page.evaluate(() => openArticle('article_001'));
        await page.waitForFunction(() => { const a = ARTICLES.find(x => x.id === 'article_001'); return !!(a && a.detailLoaded); }, { timeout: 15000 }).catch(() => {});
        await sleep(700);
        const presetState = await page.evaluate(() => ({ state: articleTranslationState(), hidden: document.getElementById('sentenceFailNotice').classList.contains('hidden') }));
        check('【⑯】预置文章（本来就没有译文）不会被当成失败、不弹提示条',
            (presetState.state === 'preset' || presetState.state === 'ok') && presetState.hidden === true, presetState);

        // 词卡上不该再出现那句「自己对照一下就好」
        const noVerdictLine = await page.evaluate(() => (document.body.innerHTML || '').indexOf('自己对照一下就好') < 0);
        check('【⑯】页面上找不到「自己对照一下就好，不判对错」', noVerdictLine === true);
    } catch (e) {
        check('【⑯】执行过程中出现异常', false, String((e && e.message) || e));
    } finally {
        try { dbOps.db.prepare('DELETE FROM user_words WHERE article_id = ?').run(MISS_ART); } catch (_) {}
        try { dbOps.db.prepare('DELETE FROM articles WHERE id = ?').run(MISS_ART); } catch (_) {}
        try { dbOps.db.prepare('DELETE FROM user_words WHERE article_id = ?').run(OK_ART); } catch (_) {}
        try { dbOps.db.prepare('DELETE FROM articles WHERE id = ?').run(OK_ART); } catch (_) {}
    }

    // ============================================================
    // 【⑰ 降级划选答题模式下，正文单词拖拽收藏必须仍然可用（2026-10-08）
    // ============================================================
    // 背景：quiz_generator 返回 0 题时 queue 会落「降级题」（isFallback / answerMode='selection'），
    //       前端据此进入 fallbackQuizActive=true 的「降级划选答题模式」。
    //       旧 app.js 在 onSpanPointerDown 里写死 `if (fallbackQuizActive) return;`
    //       → 这类文章里正文单词一按就返回，用户感知就是「这次改完拖拽收藏坏了」。
    //       本节自造一篇「降级题」文章，用真鼠标拖一次，验证收藏链路真的走通。
    console.log('\n【⑰ 降级划选答题模式下，拖拽收藏仍然可用（2026-10-08）】');
    const DEG_ART = 'qa_degraded_drag_probe';
    const DEG_CONTENT = 'The magnificent waterfall plunges into the valley below. Visitors come from far away.';
    const DEG_QUESTIONS = [
        { type: 'main-idea', question: '请用文章中的一句话概括全文主旨', options: [], answer_index: -1, explanation: '', isFallback: true, answerMode: 'selection' }
    ];
    const dragLogs = [];
    const onDragConsole = (m) => { if (m.text().indexOf('🖱️ [拖拽]') >= 0) dragLogs.push(m.text()); };
    try {
        dbOps.db.prepare('DELETE FROM user_words WHERE article_id = ?').run(DEG_ART);
        dbOps.db.prepare('DELETE FROM articles WHERE id = ?').run(DEG_ART);
        dbOps.db.prepare(`
            INSERT INTO articles (id, user_id, title, description, content, source, level, level_label,
                                  word_count, status, questions, sentences)
            VALUES (@id, @uid, 'QA Degraded Drag Probe', '', @content, 'upload', 'middle', '初中',
                    10, 'completed', @questions, '[]')
        `).run({ id: DEG_ART, uid: probeUserId, content: DEG_CONTENT, questions: JSON.stringify(DEG_QUESTIONS) });

        page.on('console', onDragConsole);
        await page.evaluate(async (id) => { await fetch('/api/articles?page=1&pageSize=10&withContent=1'); openArticle(id); }, DEG_ART);
        await page.waitForFunction((id) => { const a = ARTICLES.find(x => x.id === id); return !!(a && a.detailLoaded); }, DEG_ART, { timeout: 15000 }).catch(() => {});
        await sleep(700);

        const degState = await page.evaluate(() => ({
            fallbackQuizActive: (typeof fallbackQuizActive !== 'undefined' ? fallbackQuizActive : null),
            spans: document.querySelectorAll('#readContent .word-span').length,
            collected: document.querySelectorAll('#readContent .word-span.collected').length
        }));
        check('【⑰】文章确实进入「降级划选答题模式」(fallbackQuizActive=true)', degState.fallbackQuizActive === true, degState);
        check('【⑰】正文渲染出可拖拽的单词 span', degState.spans > 3 && degState.collected === 0, degState);

        // 真鼠标拖拽：按下 → 分步移动 → 落到收集区
        const dpt = await page.evaluate(() => {
            const spans = Array.from(document.querySelectorAll('#readContent .word-span'));
            const t = spans.find(s => !s.classList.contains('collected')) || spans[0];
            const r = t.getBoundingClientRect();
            const z = document.getElementById('collectZone').getBoundingClientRect();
            return { word: t.getAttribute('data-word'),
                     x: Math.round(r.left + r.width / 2), y: Math.round((r.top + r.bottom) / 2),
                     zx: Math.round(z.left + z.width / 2), zy: Math.round(z.top + z.height / 2) };
        });
        dragLogs.length = 0;
        await page.mouse.move(dpt.x, dpt.y);
        await sleep(120);
        await page.mouse.down();
        await sleep(90);
        for (let i = 1; i <= 8; i++) {
            await page.mouse.move(dpt.x + (dpt.zx - dpt.x) * i / 8, dpt.y + (dpt.zy - dpt.y) * i / 8);
            await sleep(45);
        }
        await page.mouse.up();
        await sleep(1200);

        const after = await page.evaluate(() => ({
            collected: document.querySelectorAll('#readContent .word-span.collected').length,
            inMemory: (userData && userData.collectedWords ? userData.collectedWords.length : -1),
            ghosts: document.querySelectorAll('.dragging-ghost').length
        }));
        const degRow = dbOps.db.prepare('SELECT COUNT(*) c FROM user_words WHERE article_id = ?').get(DEG_ART);
        check('【⑰】拖到收集区后，该词在页面上标记为已收藏', after.collected >= 1, after);
        check('【⑰】收藏真的落库（user_words 出现该文章的记录）', degRow.c > 0, degRow);
        check('【⑰】拖拽幽灵已清理（没有残留浮层）', after.ghosts === 0, after);
        check('【⑰】打印了「越过 5px 阈值 → 判定为拖拽」', dragLogs.some(l => /越过 5px 阈值/.test(l)), dragLogs.slice(0, 3));
        check('【⑰】打印了「收集区命中 → 进入 ✅」', dragLogs.some(l => /收集区命中/.test(l) && /进入/.test(l)), dragLogs.slice(0, 5));
        await page.screenshot({ path: path.join(__dirname, 'test_screenshot_degraded_drag.png') });

        // 反向回归：拖拽之后，普通「点词」仍然要能弹卡（spanJustDragged 不能泄漏）
        const cpt = await page.evaluate(() => {
            const spans = Array.from(document.querySelectorAll('#readContent .word-span'));
            const t = spans.find(s => !s.classList.contains('collected'));
            if (!t) return null;
            const r = t.getBoundingClientRect();
            return { word: t.getAttribute('data-word'), x: Math.round(r.left + r.width / 2), y: Math.round((r.top + r.bottom) / 2) };
        });
        if (cpt) {
            await page.mouse.click(cpt.x, cpt.y);
            await sleep(700);
            const cardOpen = await page.evaluate(() => !!document.querySelector('.word-card'));
            check('【⑰】拖拽收藏之后，普通点词仍能弹出词卡（spanJustDragged 未泄漏）', cardOpen === true, cpt);
            await page.evaluate(() => { if (typeof hideWordCard === 'function') hideWordCard(); });
        } else {
            check('【⑰】拖拽收藏之后，普通点词仍能弹出词卡（spanJustDragged 未泄漏）', false, '找不到未收藏的词可点');
        }
        page.off('console', onDragConsole);
    } catch (e) {
        check('【⑰】执行过程中出现异常', false, String((e && e.message) || e));
    } finally {
        try { dbOps.db.prepare('DELETE FROM user_words WHERE article_id = ?').run(DEG_ART); } catch (_) {}
        try { dbOps.db.prepare('DELETE FROM articles WHERE id = ?').run(DEG_ART); } catch (_) {}
    }

    // ============================================================
    // 【⑱ 收藏释义优先级：本句语境释义 → 文章词表 → 词典层首义（2026-10-08）
    // ============================================================
    // 背景：用户报「part-time 词典里没有『兼职的』，是联网深查补的，但收藏下来是词典的 part」。
    //       根因是拖拽/收藏时只带了本地词典层，没拿「本句语境释义」（word_context / 知识库回写）。
    //       本节造一篇带 part-time 的文章 + 一条 word_context 记录，故意让 word_cache（第②层）
    //       存一条「错误」释义，验证第①层确实压过它，并且真实点击收藏落库的也是第①层。
    console.log('\n【⑱ 收藏释义优先级：本句语境释义优先于词典层首义（2026-10-08）】');
    const CP_ART = 'qa_collect_priority_probe';
    const CP_SENT = 'I want to find a part-time job this summer.';
    const CP_WORD = 'part-time';
    // 第①层：语境库里的正确释义（模拟「联网深查」写回 word_context 的那条）
    const CP_CTX_DEF = '兼职的（本句语境释义，来自联网深查）';
    // 第②层：文章词表底层是 word_cache，故意放一条「错误」释义，用来证明第①层确实优先
    const CP_CACHE_DEF = '【不应被收藏】词典兼容层 n. 部分';
    const collectLogs = [];
    const onCollectConsole = (m) => { if (m.text().indexOf('🖱️ [收藏释义]') >= 0) collectLogs.push(m.text()); };
    // ⚠️ word_cache 是**全局共享的真实词表**（不区分文章），part-time 是真实存在的词。
    // 绝不能不问青红皂白 DELETE —— 第一版就是这么写的，把真实的「兼职的」那条删掉了，
    // 跑完发现 `word_cache WHERE word='part-time'` 为 0、兼容层直接退化。改成：先快照 → 再改 → finally 还原。
    const cpCacheSnapshot = dbOps.db.prepare(
        'SELECT word, definition, part_of_speech, is_academic FROM word_cache WHERE word = ?'
    ).all(CP_WORD);
    try {
        dbOps.db.prepare('DELETE FROM user_words WHERE article_id = ?').run(CP_ART);
        dbOps.db.prepare('DELETE FROM articles WHERE id = ?').run(CP_ART);
        dbOps.db.prepare('DELETE FROM word_context WHERE word = ? AND article_id = ?').run(CP_WORD, CP_ART);
        dbOps.db.prepare('DELETE FROM word_cache WHERE word = ?').run(CP_WORD);

        dbOps.db.prepare(`
            INSERT INTO articles (id, user_id, title, description, content, source, level, level_label,
                                  word_count, status, questions, sentences)
            VALUES (@id, @uid, 'QA Collect Priority Probe', '', @content, 'upload', 'middle', '初中',
                    8, 'completed', '[]', '[]')
        `).run({ id: CP_ART, uid: probeUserId, content: CP_SENT });
        dbOps.db.prepare(`INSERT INTO word_context (word, context, definition, part_of_speech, article_id, updated_at)
                          VALUES (?, ?, ?, 'adj.', ?, datetime('now'))`).run(CP_WORD, CP_SENT, CP_CTX_DEF, CP_ART);
        dbOps.db.prepare('INSERT INTO word_cache (word, definition, part_of_speech) VALUES (?, ?, ?)')
            .run(CP_WORD, CP_CACHE_DEF, 'adj.');

        page.on('console', onCollectConsole);
        await page.evaluate(async (id) => { await fetch('/api/articles?page=1&pageSize=10&withContent=1'); openArticle(id); }, CP_ART);
        await page.waitForFunction((id) => { const a = ARTICLES.find(x => x.id === id); return !!(a && a.detailLoaded); }, CP_ART, { timeout: 15000 }).catch(() => {});
        await sleep(800);

        // A. 直接调 resolveCollectMeaning（拖拽落点那一刻的同款调用：不带 contextDefinition）
        const cpA = await page.evaluate(async (a) => resolveCollectMeaning(a.word, a.sent), { word: CP_WORD, sent: CP_SENT });
        check('【⑱】本句语境库有释义 → 收藏优先取「本句语境释义」', cpA.source === 'context', cpA);
        check('【⑱】取到的是「兼职的」，而不是词典层/兼容层的错误释义',
            /兼职的/.test(cpA.meaning || '') && !/不应被收藏/.test(cpA.meaning || ''), cpA);

        // B. 换一个匹配不上的句子 → 不该再命中第①层
        const cpB = await page.evaluate(async (a) => resolveCollectMeaning(a.word, a.other),
            { word: CP_WORD, other: 'A totally unrelated sentence about rivers and banks.' });
        check('【⑱】句子跟语境库匹配不上 → 不再命中「本句语境释义」', cpB.source !== 'context', cpB);
        check('【⑱】此时才回落到第②/③层（拿到的是兼容层那条，证明链路顺序正确）',
            /不应被收藏/.test(cpB.meaning || '') || cpB.source === 'dictionary', cpB);

        // C. 来源日志
        check('【⑱】控制台打印了「[收藏释义]」并标明来源 = 本句语境释义',
            collectLogs.some(l => l.indexOf('采用【本句语境释义】') >= 0), collectLogs.slice(0, 3));

        // D. 真实点击收藏：点词 → 词卡 → ✨ 收藏 → 落库值必须是「本句语境释义」
        const cpPt = await page.evaluate((w) => {
            const s = Array.from(document.querySelectorAll('#readContent .word-span'))
                .find(x => (x.getAttribute('data-word') || '').toLowerCase() === w);
            if (!s) return null;
            const r = s.getBoundingClientRect();
            return { x: Math.round(r.left + r.width / 2), y: Math.round((r.top + r.bottom) / 2) };
        }, CP_WORD);
        check('【⑱】正文渲染出 part-time 的可点 span（连字符词未被拆开）', !!cpPt, cpPt);
        if (cpPt) {
            await page.mouse.click(cpPt.x, cpPt.y);
            await sleep(1000);
            const cardState = await page.evaluate(() => ({
                hasCard: !!document.querySelector('.word-card'),
                hasCollectBtn: !!document.querySelector('.word-card .wc-btn-collect')
            }));
            check('【⑱】点词弹出词卡', cardState.hasCard === true, cardState);
            const clicked = await page.evaluate(() => {
                const b = document.querySelector('.word-card .wc-btn-collect');
                if (!b) return false;
                b.click();
                return true;
            });
            check('【⑱】词卡里存在可点的「✨ 收藏」按钮', clicked === true);
            await sleep(1600);
            const cpRow = dbOps.db.prepare('SELECT word, definition, sentence FROM user_words WHERE article_id = ? AND word = ?').get(CP_ART, CP_WORD);
            check('【⑱】点击收藏后真的落库', !!cpRow, cpRow);
            check('【⑱】落库的释义是「本句语境释义」，不是词典层首义',
                !!cpRow && /兼职的/.test(cpRow.definition || ''), cpRow && cpRow.definition);
            check('【⑱】落库的释义不是「暂无释义」占位',
                !!cpRow && cpRow.definition !== '暂无释义', cpRow && cpRow.definition);
            await page.evaluate(() => { if (typeof hideWordCard === 'function') hideWordCard(); });
        }
        page.off('console', onCollectConsole);
        await page.screenshot({ path: path.join(__dirname, 'test_screenshot_collect_priority.png') });
    } catch (e) {
        check('【⑱】执行过程中出现异常', false, String((e && e.message) || e));
    } finally {
        try { dbOps.db.prepare('DELETE FROM user_words WHERE article_id = ?').run(CP_ART); } catch (_) {}
        try { dbOps.db.prepare('DELETE FROM articles WHERE id = ?').run(CP_ART); } catch (_) {}
        try { dbOps.db.prepare('DELETE FROM word_context WHERE word = ? AND article_id = ?').run(CP_WORD, CP_ART); } catch (_) {}
        // 还原 word_cache：删掉本节的探针行，再把真实行原样插回（含 is_academic，别丢）
        try {
            dbOps.db.prepare('DELETE FROM word_cache WHERE word = ?').run(CP_WORD);
            const ins = dbOps.db.prepare('INSERT INTO word_cache (word, definition, part_of_speech, is_academic) VALUES (?,?,?,?)');
            cpCacheSnapshot.forEach(function (r) { ins.run(r.word, r.definition, r.part_of_speech, r.is_academic); });
            const back = dbOps.db.prepare('SELECT COUNT(*) c FROM word_cache WHERE word = ?').get(CP_WORD).c;
            console.log(`   ↩ [⑱ 清理] word_cache("${CP_WORD}") 快照 ${cpCacheSnapshot.length} 行 → 还原后 ${back} 行`);
            check('【⑱】测试未污染真实词表（word_cache 探针词行数已还原）', back === cpCacheSnapshot.length, { before: cpCacheSnapshot.length, after: back });
        } catch (e) { console.warn('⚠️ [⑱ 清理] word_cache 还原失败:', e.message); }
    }

    // ============================================================
    // 【⑲ 收藏 →「待分类」→ 分类 → 总结页（2026-10-08）
    // ============================================================
    // 背景：用户报「待分类功能没了，收藏后单词直接进了总结页」。
    //       根因：finishReading() 成了死代码（无任何调用点），阅读页只剩「✅ 完成学习」→ 直接结算，
    //       于是「待分类」这一步被总结页整个顶掉。本节验收入口恢复 + 全链路可分类。
    console.log('\n【⑲ 收藏 →「待分类」→ 分类（2026-10-08）】');
    const PD_ART = 'qa_pending_sort_probe';
    const PD_SENT = 'The diligent student reviewed her notes carefully before the exam.';
    const pdLogs = [];
    const onPdConsole = (m) => { if (m.text().indexOf('📋 [待分类]') >= 0) pdLogs.push(m.text()); };
    try {
        dbOps.db.prepare('DELETE FROM user_words WHERE article_id = ?').run(PD_ART);
        dbOps.db.prepare('DELETE FROM articles WHERE id = ?').run(PD_ART);
        dbOps.db.prepare(`
            INSERT INTO articles (id, user_id, title, description, content, source, level, level_label,
                                  word_count, status, questions, sentences)
            VALUES (@id, @uid, 'QA Pending Sort Probe', '', @content, 'upload', 'middle', '初中',
                    10, 'completed', '[]', '[]')
        `).run({ id: PD_ART, uid: probeUserId, content: PD_SENT });

        page.on('console', onPdConsole);
        await page.evaluate(async (id) => { await fetch('/api/articles?page=1&pageSize=10&withContent=1'); openArticle(id); }, PD_ART);
        await page.waitForFunction((id) => { const a = ARTICLES.find(x => x.id === id); return !!(a && a.detailLoaded); }, PD_ART, { timeout: 15000 }).catch(() => {});
        await sleep(800);

        // 清掉本地收藏里的探针残留（本文 + 前面几节造的 qa_* 文章），让本节从确定的
        // pending 基线开始；只动探针，不碰真实种子数据。
        await page.evaluate((id) => {
            userData.collectedWords = userData.collectedWords.filter(function (w) {
                return w.articleId !== id && !/^qa_/.test(String(w.articleId || ''));
            });
            saveData(); updateCollectBadge();
        }, PD_ART);
        await sleep(200);

        // A. 入口：顶部按钮已按用户要求**移除**（2026-10-08），阅读页的正式入口是收藏区头部「📋 去分类」
        const entry0 = await page.evaluate(() => ({
            topBtnRemoved: !document.getElementById('pendingEntryBtn') && !document.getElementById('pendingEntryCount'),
            // 去掉 HTML 注释：注释节点也会被 innerHTML 序列化出来，但它对用户不可见
            topbarHtml: ((document.querySelector('#readingPage .main-topbar') || {}).innerHTML || '')
                .replace(/<!--[\s\S]*?-->/g, '')
                .replace(/<[^>]*>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim(),
            favsBtn: !!document.getElementById('favsSortBtn'),
            favsText: (document.getElementById('favsSortBtn') || {}).textContent || '',
            zoneClickable: !!document.getElementById('collectZone') && typeof onCollectZoneClick === 'function',
            pendingAll: userData.collectedWords.filter(w => w.status === 'pending').length,
            // 2026-10-08：阅读页计数必须按「本文」隔离 —— 这里取本文 id 与本文待分类数做对照
            curId: currentArticle && currentArticle.id,
            pendingInArticle: userData.collectedWords.filter(w => w.status === 'pending'
                && w.articleId === (currentArticle && currentArticle.id)).length
        }));
        check('【⑲】阅读页顶部**不再有**「📋 待分类」按钮（按要求移除）', entry0.topBtnRemoved === true, entry0);
        check('【⑲】顶部标题区里也没有残留的「待分类」文案',
            !/待分类/.test(entry0.topbarHtml), { topbarHtml: entry0.topbarHtml.slice(0, 200) });
        check('【⑲】「我的收藏」头部保留「📋 去分类」入口（改为阅读页正式入口）', entry0.favsBtn === true, entry0);
        check('【⑲】「去分类」是**本文**口径：本文 0 个待分类 → 文案不带数字（全局存量不上阅读页）',
            entry0.favsText.indexOf('去分类') >= 0 && !/\d/.test(entry0.favsText),
            { favsText: entry0.favsText, pendingAll: entry0.pendingAll, pendingInArticle: entry0.pendingInArticle });
        check('【⑲】右侧收集区已可点击（绑定 onCollectZoneClick）', entry0.zoneClickable === true, entry0);

        // B. 收藏一个词 → 进入「待分类」（status='pending'），收藏区入口计数跟着涨
        await page.evaluate(async (a) => { await doCollectWord({ word: 'diligent', meaning: '勤奋的', sentence: a.sent }); }, { sent: PD_SENT });
        await sleep(700);
        const afterCollect = await page.evaluate((id) => {
            const w = userData.collectedWords.find(x => x.word === 'diligent' && x.articleId === id);
            const pendingAll = userData.collectedWords.filter(x => x.status === 'pending').length;
            return {
                status: w ? w.status : null,
                pendingAll: pendingAll,
                badge: (document.getElementById('collectBadge') || {}).textContent,
                badgeHidden: (document.getElementById('collectBadge') || {}).classList.contains('hidden'),
                favsText: (document.getElementById('favsSortBtn') || {}).textContent || ''
            };
        }, PD_ART);
        const pdRow = dbOps.db.prepare('SELECT status FROM user_words WHERE article_id = ? AND word = ?').get(PD_ART, 'diligent');
        check('【⑲】收藏后单词状态是「待分类」(pending)', afterCollect.status === 'pending', afterCollect);
        check('【⑲】落库状态也是 pending', !!pdRow && pdRow.status === 'pending', pdRow);
        check('【⑲】收集区红点显示 1（本文待分类数）',
            afterCollect.badge === '1' && afterCollect.badgeHidden === false, afterCollect);
        check('【⑲】「📋 去分类」计数 = 本文待分类数（不是全局存量）',
            /去分类/.test(afterCollect.favsText)
            && Number((afterCollect.favsText.match(/(\d+)/) || [])[1]) === 1, afterCollect);
        check('【⑲】全局待分类（' + afterCollect.pendingAll + ' 个）没有泄漏到按钮文案上',
            afterCollect.pendingAll <= 1 || afterCollect.favsText.indexOf(String(afterCollect.pendingAll)) < 0,
            afterCollect);

        // C. 点入口 → 打开分类整理面板，且带「已掌握 / 学习中 / 需复习」按钮
        await page.evaluate(() => openPendingFromReading());
        await sleep(500);
        const panel = await page.evaluate(() => {
            const mask = document.getElementById('sortPanelMask');
            const btns = Array.from(document.querySelectorAll('#sortPanelContent .sort-btn')).map(b => b.textContent.trim());
            return {
                shown: !!(mask && mask.classList.contains('show')),
                title: (document.getElementById('sortPanelTitle') || {}).textContent,
                itemCount: document.querySelectorAll('#sortPanelContent .sort-word-item').length,
                buttons: btns
            };
        });
        check('【⑲】点「📋 待分类」→ 分类面板弹出', panel.shown === true, panel);
        check('【⑲】面板里有 1 个待分类单词', panel.itemCount === 1, panel);
        check('【⑲】面板提供「已掌握 / 学习中 / 需复习」三种分类',
            panel.buttons.length >= 3 && /已掌握/.test(panel.buttons.join('')) && /学习中/.test(panel.buttons.join('')), panel);
        check('【⑲】面板标题是「先整理待分类」而不是空的', !!panel.title && panel.title.length > 0, panel);

        // D. 点「已掌握」→ 状态流转，本文待分类归零
        const pdId = dbOps.db.prepare('SELECT id FROM user_words WHERE article_id = ? AND word = ?').get(PD_ART, 'diligent').id;
        await page.evaluate((id) => sortWordAction(id, 'mastered'), pdId);
        await sleep(800);
        const afterSort = await page.evaluate((id) => {
            const w = userData.collectedWords.find(x => x.word === 'diligent' && x.articleId === id);
            const pendInArticle = userData.collectedWords.filter(x => x.status === 'pending' && x.articleId === id).length;
            return { status: w ? w.status : null, knowledge: w ? w.knowledge : null,
                     pendInArticle: pendInArticle,
                     badgeHidden: (document.getElementById('collectBadge') || {}).classList.contains('hidden') };
        }, PD_ART);
        const pdRow2 = dbOps.db.prepare('SELECT status, knowledge FROM user_words WHERE id = ?').get(pdId);
        check('【⑲】分类后本地状态变为 mastered', afterSort.status === 'mastered', afterSort);
        check('【⑲】分类后落库状态变为 mastered', !!pdRow2 && pdRow2.status === 'mastered', pdRow2);
        check('【⑲】分类后本文待分类归零（收集区红点收起）',
            afterSort.pendInArticle === 0 && afterSort.badgeHidden === true, afterSort);
        await page.evaluate(() => closeSortPanel());
        await sleep(300);

        // E. 关键回归：「完成学习」不再直接跳总结页 —— 有待分类时先开面板
        await page.evaluate(async (a) => { await doCollectWord({ word: 'carefully', meaning: '仔细地', sentence: a.sent }); }, { sent: PD_SENT });
        await sleep(600);
        await page.evaluate(() => finishLearning());
        await sleep(600);
        const fl = await page.evaluate(() => ({
            panelShown: document.getElementById('sortPanelMask').classList.contains('show'),
            summaryActive: document.getElementById('summaryPage').classList.contains('active'),
            readingActive: document.getElementById('readingPage').classList.contains('active')
        }));
        check('【⑲】有待分类时点「✅ 完成学习」→ 先弹分类面板，不直接进总结页',
            fl.panelShown === true && fl.summaryActive === false, fl);

        // F. 面板关闭（= 点「稍后整理」）→ 自动继续进总结页
        //    注：这里的「待分类总数」会包含前面几节（⑰/⑱）遗留在 userData 里的 pending 词，
        //    所以断言不写死数字，而是和页面里的真实 pendingAll 对齐。
        await page.evaluate(() => closeSortPanel());
        await sleep(500);
        const fl2 = await page.evaluate(() => {
            const pendingAll = userData.collectedWords.filter(w => w.status === 'pending').length;
            const entries = userData.collectedWords.filter(w => w.status === 'pending').map(w => w.word);
            return {
                panelShown: document.getElementById('sortPanelMask').classList.contains('show'),
                summaryActive: document.getElementById('summaryPage').classList.contains('active'),
                pendingAll: pendingAll,
                // 2026-10-08：总结页按钮只统计「本次会话收藏且仍待分类」的词
                sessionPending: sessionPendingWords().length,
                entries: entries,
                sumSortBtnVisible: (function () {
                    const b = document.getElementById('summarySortBtn');
                    return !!b && b.style.display !== 'none';
                })(),
                sumSortText: (document.getElementById('summarySortBtn') || {}).textContent
            };
        });
        const sumCount = (String(fl2.sumSortText || '').match(/（(\d+)）/) || [])[1];
        check('【⑲】整理面板关闭后自动进入总结页', fl2.summaryActive === true && fl2.panelShown === false, fl2);
        check('【⑲】总结页有「📋 去分类待学单词（N）」按钮，且计数 = 本次会话留下的待分类（不累计历史存量）',
            fl2.sumSortBtnVisible === true && fl2.sessionPending > 0 && Number(sumCount) === fl2.sessionPending,
            { sumCount: sumCount, sessionPending: fl2.sessionPending, pendingAll: fl2.pendingAll, text: fl2.sumSortText });

        // G. 收集区点击入口也能打开面板
        await page.evaluate(() => { window.__lastCollectAt = 0; showScreen('readingPage'); });
        await sleep(300);
        const zoneClick = await page.evaluate(() => {
            const z = document.getElementById('collectZone');
            z.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            return document.getElementById('sortPanelMask').classList.contains('show');
        });
        check('【⑲】点击右侧收集区也能打开待分类面板', zoneClick === true, zoneClick);
        await page.evaluate(() => closeSortPanel());
        await sleep(300);

        check('【⑲】打印了「📋 [待分类]」链路日志（入口/计数/进入总结页）',
            pdLogs.some(l => /入口被点击|计数刷新/.test(l)), pdLogs.slice(0, 3));
        check('【⑲】「完成学习」日志说明了「先整理待分类，面板关闭后再结算」',
            pdLogs.some(l => /完成学习.*先整理待分类/s.test(l)), pdLogs.slice(0, 6));
        page.off('console', onPdConsole);
        await page.screenshot({ path: path.join(__dirname, 'test_screenshot_pending_sort.png') });
    } catch (e) {
        check('【⑲】执行过程中出现异常', false, String((e && e.message) || e));
    } finally {
        try { dbOps.db.prepare('DELETE FROM user_words WHERE article_id = ?').run(PD_ART); } catch (_) {}
        try { dbOps.db.prepare('DELETE FROM articles WHERE id = ?').run(PD_ART); } catch (_) {}
    }

    // 【⑳ 新上传文章：题目先就绪、句子翻译后到（2026-10-08 问题一/问题二）】
    //
    // 复现线上场景：释义/译文/题目是三个**并行**工作流（queue.js Promise.allSettled），
    // quiz_generator 常常先完成 → 前端进阅读页。旧代码在那一刻就 `return` 结束轮询，
    // 20 秒后句子翻译成功（后端日志「✅ [并行] …句子翻译（句子=19）」）**没有任何人在听**；
    // 又因为上传链路把 detailLoaded 写死 true，「服务端说有译文就补拉详情」的自愈也被挡住，
    // 最终浮层永远「⚠️ 这篇还没有生成译文」——而且它还指路到一个根本没显示的「重试」按钮。
    //
    // 本节断言：① 生成中不得谎报「还没生成译文」；② 迟到的终态必须把译文补上并重绘，
    //          ③ 浮层文案里不能再出现「重试」。
    console.log('\n【⑳ 新上传文章：译文迟到（2026-10-08 问题一/二）】');
    const UP_ART = 'qa_upload_late_sent_probe';
    const UP_S1 = 'The diligent student reviewed her notes carefully before the exam.';
    const UP_S2 = 'She wanted to pass with a good score.';
    const UP_CONTENT = UP_S1 + ' ' + UP_S2;
    const upLogs = [];
    const onUpConsole = (m) => { if (/\[终态落库\]|\[轮询\]|\[后台补拉\]/.test(m.text())) upLogs.push(m.text()); };
    try {
        dbOps.db.prepare('DELETE FROM user_words WHERE article_id = ?').run(UP_ART);
        dbOps.db.prepare('DELETE FROM articles WHERE id = ?').run(UP_ART);
        dbOps.db.prepare(`
            INSERT INTO articles (id, user_id, title, description, content, source, level, level_label,
                                  word_count, status, questions, sentences)
            VALUES (@id, @uid, 'QA Upload Late Sentence Probe', '', @content, 'upload', 'middle', '初中',
                    12, 'processing', '[]', '[]')
        `).run({ id: UP_ART, uid: probeUserId, content: UP_CONTENT });

        page.on('console', onUpConsole);
        // 模拟上传后的第一帧：三个工作流都还没就绪（deferEnter → 停在等待页）
        await page.evaluate((a) => {
            openAnalyzedArticle({
                status: 'processing', articleId: a.id, title: 'QA Upload Late Sentence Probe',
                description: '', level: 'middle', levelLabel: '初中',
                article: a.content, words: {}, sentences: [], questions: [],
                wordsReady: false, sentencesReady: false, questionsReady: false, isFallback: false
            }, { deferEnter: true });
        }, { id: UP_ART, content: UP_CONTENT });
        await sleep(500);

        const up0 = await page.evaluate((id) => {
            const a = ARTICLES.find(x => x.id === id);
            return {
                detailLoaded: a.detailLoaded, analyzing: a.analyzing,
                trState: articleTranslationState(),
                sentences: (a.sentences || []).length
            };
        }, UP_ART);
        check('【⑳】上传中的文章 detailLoaded=false（旧版写死 true，会挡住自愈补拉）', up0.detailLoaded === false, up0);
        check('【⑳】上传中的文章带 analyzing=true（「仍在生成中」）', up0.analyzing === true, up0);
        check('【⑳】生成中 → 译文状态是 loading，不再误报 missing', up0.trState === 'loading', up0);

        // 悬停浮层：生成中必须说「加载中」，且**不得**出现「还没生成译文 / 重试」
        const upPh = await page.evaluate((s) => {
            unlockSentence(s);
            showSentenceHoverPanel(s, '', null, 0);
            const el = document.querySelector('#sentenceHoverPanel .shp-translation');
            return { text: el ? el.textContent : '(缺节点)' };
        }, UP_S1);
        check('【⑳】生成中悬停浮层说「译文还在加载中」', /加载中/.test(upPh.text), upPh);
        check('【⑳】浮层文案里没有「重试」二字（问题二：不再指向不存在的按钮）', !/重试/.test(upPh.text), upPh);
        check('【⑳】浮层文案里没有「还没生成译文」（生成中不得下这个结论）', !/还没生成/.test(upPh.text), upPh);

        await page.evaluate(() => {
            const p = document.getElementById('sentenceHoverPanel');
            if (p) p.classList.remove('visible');
        });

        // ★ 模拟「题目先就绪 → 先进阅读页」：questionsReady=true，句子仍是空
        await page.evaluate((id) => {
            applyPartialProgress({ questions: [{ type: 'MAIN_IDEA', question: 'Q?', options: ['a', 'b', 'c', 'd'], answer: 0 }], questionsReady: true }, id);
        }, UP_ART);
        await sleep(300);
        const upMid = await page.evaluate((id) => {
            const a = ARTICLES.find(x => x.id === id);
            return { qReady: !!a.questionsReady, sentences: (a.sentences || []).length, analyzing: a.analyzing, trState: articleTranslationState() };
        }, UP_ART);
        check('【⑳】题目先就绪、译文仍空时文章仍是 analyzing（不会被误判成「本来就没有译文」）',
            upMid.qReady === true && upMid.sentences === 0 && upMid.analyzing === true, upMid);

        // ★ 迟到的终态：句子翻译成功了 → 必须被回填 + 重绘（这就是线上「19 句」那一刻）
        await page.evaluate((a) => {
            applyTerminalStatus(a.id, {
                status: 'completed',
                words: { diligent: { meaning: '勤奋的', partOfSpeech: 'adj.' } },
                sentences: [
                    { index: 0, sentence: a.s1, translation: '这个勤奋的学生在考试前仔细复习了笔记。' },
                    { index: 1, sentence: a.s2, translation: '她想取得好成绩。' }
                ],
                questions: [{ type: 'MAIN_IDEA', question: 'Q?', options: ['a', 'b', 'c', 'd'], answer: 0 }],
                sentencesError: null
            }, true);
        }, { id: UP_ART, s1: UP_S1, s2: UP_S2 });
        await sleep(500);

        const up1 = await page.evaluate((id) => {
            const a = ARTICLES.find(x => x.id === id);
            const nodes = document.querySelectorAll('#readContent .article-sentence');
            let withIdx = 0;
            nodes.forEach(n => { if (Number.isFinite(parseInt(n.getAttribute('data-sentence-idx'), 10))) withIdx++; });
            return {
                sentences: (a.sentences || []).length,
                withTranslation: (a.sentences || []).filter(s => s && String(s.translation || '').trim()).length,
                analyzing: a.analyzing,
                trState: articleTranslationState(),
                nodes: nodes.length, withIdx: withIdx,
                noticeHidden: document.getElementById('sentenceFailNotice').classList.contains('hidden')
            };
        }, UP_ART);
        check('【⑳】迟到的译文被回填进内存（2 句，均有译文）',
            up1.sentences === 2 && up1.withTranslation === 2, up1);
        check('【⑳】终态后 analyzing 被清除', up1.analyzing === false, up1);
        check('【⑳】译文状态变为 ok（浮层不再走兜底文案）', up1.trState === 'ok', up1);
        check('【⑳】正文被重绘出可悬停的句子节点、且都带 data-sentence-idx',
            up1.nodes >= 2 && up1.withIdx === up1.nodes, up1);
        check('【⑳】「句子翻译失败」提示条保持收起（译文正常，不该误报）', up1.noticeHidden === true, up1);

        // 悬停这一句 → 应该真的看到中文
        const upPh2 = await page.evaluate((s) => {
            unlockSentence(s);
            const idx = buildSentenceList().findIndex(x => x.sentence === s);
            const fresh = resolveSentenceAt(idx);
            showSentenceHoverPanel(s, (fresh && fresh.translation) || '', null, idx);
            const el = document.querySelector('#sentenceHoverPanel .shp-translation');
            return { idx: idx, text: el ? el.textContent : '(缺节点)' };
        }, UP_S1);
        check('【⑳】悬停句子看到中文译文（端到端闭环）', /勤奋的学生/.test(upPh2.text), upPh2);

        // 反例：真·存量缺失（detailLoaded=true、无 analyzing）→ 文案说「还没生成」，但**仍不得提「重试」**
        const upPh3 = await page.evaluate((a) => {
            const art = ARTICLES.find(x => x.id === a.id);
            const snap = { sentences: art.sentences, analyzing: art.analyzing, detailLoaded: art.detailLoaded, status: art.status };
            art.sentences = []; art.analyzing = false; art.detailLoaded = true; art.status = 'completed';
            const st = articleTranslationState();
            unlockSentence(a.s);
            showSentenceHoverPanel(a.s, '', null, 0);
            const el = document.querySelector('#sentenceHoverPanel .shp-translation');
            const text = el ? el.textContent : '(缺节点)';
            Object.assign(art, snap);
            return { state: st, text: text };
        }, { id: UP_ART, s: UP_S1 });
        check('【⑳】真·存量缺失仍判定为 missing', upPh3.state === 'missing', upPh3);
        check('【⑳】missing 文案说「还没有生成译文」，且不含「重试」',
            /还没有生成/.test(upPh3.text) && !/重试/.test(upPh3.text), upPh3);

        check('【⑳】终态落库链路打了日志（可追）', upLogs.some(l => /\[终态落库\]/.test(l)), upLogs.slice(0, 3));
        page.off('console', onUpConsole);
        await page.screenshot({ path: path.join(__dirname, 'test_screenshot_late_sentence.png') });
    } catch (e) {
        check('【⑳】执行过程中出现异常', false, String((e && e.message) || e));
    } finally {
        try { dbOps.db.prepare('DELETE FROM user_words WHERE article_id = ?').run(UP_ART); } catch (_) {}
        try { dbOps.db.prepare('DELETE FROM articles WHERE id = ?').run(UP_ART); } catch (_) {}
        try { await page.evaluate((id) => { ARTICLES = ARTICLES.filter(a => a.id !== id); }, UP_ART); } catch (_) {}
    }

    // 【㉑ 轮询：题目先就绪后**不得提前收工**，必须守着迟到的译文（2026-10-08 问题一的正面用例）】
    //
    // 上一节验证的是「拿到终态后能正确回填」，这一节验证**轮询本身会不会提前停**：
    // 用脚本化的 /api/article-status 响应模拟真实时序 ——
    //   第 1 拍：题目就绪（旧代码此刻 `return`，轮询结束）
    //   第 2 拍：还在跑，译文仍为空
    //   第 3 拍：句子翻译终于成功（= 线上那条「句子翻译成功（19 句）」日志）
    // 断言：第 3 拍的译文必须被接住（这正是线上静默丢数据的那一步）。
    console.log('\n【㉑ 轮询不提前收工（2026-10-08 问题一）】');
    const UP2_ART = 'qa_poll_quiet_probe';
    const UP2_S1 = 'The diligent student reviewed her notes carefully before the exam.';
    const UP2_S2 = 'She wanted to pass with a good score.';
    const UP2_CONTENT = UP2_S1 + ' ' + UP2_S2;
    const up2Logs = [];
    const onUp2Console = (m) => { if (/\[轮询\]|\[终态落库\]|\[后台补拉\]|\[applyPartialProgress\]/.test(m.text())) up2Logs.push(m.text()); };
    try {
        dbOps.db.prepare('DELETE FROM user_words WHERE article_id = ?').run(UP2_ART);
        dbOps.db.prepare('DELETE FROM articles WHERE id = ?').run(UP2_ART);
        dbOps.db.prepare(`
            INSERT INTO articles (id, user_id, title, description, content, source, level, level_label,
                                  word_count, status, questions, sentences)
            VALUES (@id, @uid, 'QA Poll Quiet Probe', '', @content, 'upload', 'middle', '初中',
                    12, 'processing', '[]', '[]')
        `).run({ id: UP2_ART, uid: probeUserId, content: UP2_CONTENT });

        page.on('console', onUp2Console);
        await page.evaluate((a) => {
            openAnalyzedArticle({
                status: 'processing', articleId: a.id, title: 'QA Poll Quiet Probe',
                description: '', level: 'middle', levelLabel: '初中',
                article: a.content, words: {}, sentences: [], questions: [],
                wordsReady: false, sentencesReady: false, questionsReady: false, isFallback: false
            }, { deferEnter: true });
            // 起一轮真实的 pollArticleProgress，但把状态接口换成脚本化响应
            window.__origApiGet = apiGet;
            let tick = 0;
            window.__pollTicks = 0;
            apiGet = async function (path) {
                if (String(path).indexOf('/api/article-status/') !== 0) return window.__origApiGet(path);
                tick++;
                window.__pollTicks = tick;
                const q = [{ type: 'MAIN_IDEA', question: 'Q?', options: ['a', 'b', 'c', 'd'], answer: 0 }];
                if (tick === 1) {
                    // ★ 第 1 拍：题目就绪、译文还没好 —— 旧代码就是在这里 return 收工的
                    return { status: 'processing', articleId: a.id, words: { diligent: { meaning: '勤奋的' } },
                             wordsReady: true, sentences: [], sentencesReady: false,
                             questions: q, questionsReady: true, sentencesFailed: false };
                }
                if (tick === 2) {
                    // 第 2 拍：仍在跑（译文依旧为空）
                    return { status: 'processing', articleId: a.id, words: { diligent: { meaning: '勤奋的' } },
                             wordsReady: true, sentences: [], sentencesReady: false,
                             questions: q, questionsReady: true, sentencesFailed: false };
                }
                // 第 3 拍：句子翻译终于成功 —— 这一步的译文必须被接住
                return { status: 'completed', articleId: a.id, words: { diligent: { meaning: '勤奋的' } },
                         sentences: [
                             { index: 0, sentence: a.s1, translation: '这个勤奋的学生在考试前仔细复习了笔记。' },
                             { index: 1, sentence: a.s2, translation: '她想取得好成绩。' }
                         ],
                         questions: q, sentencesError: null };
            };
            awaitingQuestionReady = true;
            pollArticleProgress(a.id, 'QA Poll Quiet Probe', a.content);
        }, { id: UP2_ART, content: UP2_CONTENT, s1: UP2_S1, s2: UP2_S2 });

        // 第 1 拍（~2s）：题目已就绪、用户进阅读页，但译文还没来
        await sleep(2600);
        const q1 = await page.evaluate((id) => {
            const a = ARTICLES.find(x => x.id === id);
            return { ticks: window.__pollTicks, qReady: !!a.questionsReady, sentences: (a.sentences || []).length,
                     readingActive: document.getElementById('readingPage').classList.contains('active') };
        }, UP2_ART);
        check('【㉑】第 1 拍：题目就绪 → 已进阅读页（与线上一致）',
            q1.ticks >= 1 && q1.qReady === true && q1.readingActive === true, q1);
        check('【㉑】第 1 拍：译文还空（此刻正是旧代码收工的时点）', q1.sentences === 0, q1);

        // 等到第 3 拍落地（2s/拍 → 最多 ~8s）
        await sleep(7000);
        const q2 = await page.evaluate((id) => {
            const a = ARTICLES.find(x => x.id === id);
            const nodes = document.querySelectorAll('#readContent .article-sentence');
            return { ticks: window.__pollTicks, sentences: (a.sentences || []).length,
                     withTranslation: (a.sentences || []).filter(s => s && String(s.translation || '').trim()).length,
                     analyzing: a.analyzing, trState: articleTranslationState(), nodes: nodes.length };
        }, UP2_ART);
        check('【㉑】轮询没有在题目就绪时就收工（继续查了第 2、3 拍）', q2.ticks >= 3, q2);
        check('【㉑】★ 迟到的终态译文被接住：内存里 2 句都有译文（旧代码这里必然是 0 句）',
            q2.sentences === 2 && q2.withTranslation === 2, q2);
        check('【㉑】analyzing 被清除、译文状态变为 ok', q2.analyzing === false && q2.trState === 'ok', q2);
        check('【㉑】正文被重绘出可悬停句子（悬停即可看中文）', q2.nodes >= 2, q2);
        check('【㉑】日志里能看到「转【后台补拉】」这一步（说明没提前收工）',
            up2Logs.some(l => /后台补拉/.test(l)), up2Logs.filter(l => /后台补拉|阶段=/.test(l)).slice(0, 3));

        page.off('console', onUp2Console);
    } catch (e) {
        check('【㉑】执行过程中出现异常', false, String((e && e.message) || e));
    } finally {
        try { await page.evaluate(() => { if (window.__origApiGet) { apiGet = window.__origApiGet; window.__origApiGet = null; } }); } catch (_) {}
        try { dbOps.db.prepare('DELETE FROM user_words WHERE article_id = ?').run(UP2_ART); } catch (_) {}
        try { dbOps.db.prepare('DELETE FROM articles WHERE id = ?').run(UP2_ART); } catch (_) {}
        try { await page.evaluate((id) => { ARTICLES = ARTICLES.filter(a => a.id !== id); }, UP2_ART); } catch (_) {}
    }

    // 【㉒ 收藏统计按「当前文章」隔离 + 新文章默认「查看模式」（2026-10-08 问题一/二）】
    //
    // 问题一：用户报「去分类 40 / 1/121 words，可我只收藏了几个词」。
    //   根因：`📋 去分类 N` 统计的是**所有文章**的 pending；`N/121 words` 读的是会话级全局数组
    //   collectedWords（切文章清空、跨文章却累计）——两个数字一个偏大一个偏小，还都与眼前的文章无关。
    //   本节断言：阅读页上**四个**收藏相关显示（收集区红点 / 去分类 / N words / 我的收藏列表）
    //   全部只认本文；另一篇文章的收藏一个字都不许泄漏进来。
    // 问题二：新文章默认「查看模式」（用户要求：刚打开文章先看内容，想猜再手动切），
    //   且手动设置是**全局**的、之后载入要沿用，不被默认值覆盖。
    console.log('\n【㉒ 收藏统计按本文隔离 + 默认查看模式（2026-10-08）】');
    const ISO_ART = 'qa_isolate_stats_probe';
    const ISO_OTHER = 'qa_isolate_stats_other';
    try {
        // 本节验的是**前端计数口径**，所以直接在内存里构造两篇文章的收藏行 ——
        // 不往真库塞/删探针数据（第 ⑱ 节误删真实词表的教训）。两篇文章同样是内存里的，
        // renderArticle 走的是真实渲染路径。
        const iso = await page.evaluate(({ a, b }) => {
            ARTICLES = ARTICLES.filter(x => x.id !== a && x.id !== b);
            ARTICLES.unshift({
                id: a, title: 'QA Isolate A', description: '', source: 'upload', level: 'middle',
                article: 'alpha beta gamma delta', words: { alpha: '甲', beta: '乙', gamma: '丙', delta: '丁' },
                sentences: [], questions: [], detailLoaded: true, wordsReady: true, sentencesReady: true, questionsReady: true
            });
            ARTICLES.unshift({
                id: b, title: 'QA Isolate B', description: '', source: 'upload', level: 'middle',
                article: 'epsilon zeta eta', words: { epsilon: '戊', zeta: '己', eta: '庚' },
                sentences: [], questions: [], detailLoaded: true, wordsReady: true, sentencesReady: true, questionsReady: true
            });
            // 只清这两篇的残留，不动真实数据
            userData.collectedWords = userData.collectedWords.filter(w => w.articleId !== a && w.articleId !== b);
            // 本文 A：alpha 在两个句子里各收藏一次（2 行，去重后 1 个词）+ beta 一行
            //          → 去重词数 2；pending 行数 2（alpha{s1} + beta）
            userData.collectedWords.push({ id: 'iso-1', word: 'alpha', meaning: '甲', articleId: a, sentence: 's1', status: 'pending', knowledge: 0 });
            userData.collectedWords.push({ id: 'iso-2', word: 'alpha', meaning: '甲', articleId: a, sentence: 's2', status: 'mastered', knowledge: 1 });
            userData.collectedWords.push({ id: 'iso-3', word: 'beta', meaning: '乙', articleId: a, sentence: 's1', status: 'pending', knowledge: 0 });
            // 别的文章 B：3 行全 pending（旧代码会把它们算进本文的「去分类」）
            userData.collectedWords.push({ id: 'iso-4', word: 'epsilon', meaning: '戊', articleId: b, sentence: 's3', status: 'pending', knowledge: 0 });
            userData.collectedWords.push({ id: 'iso-5', word: 'zeta', meaning: '己', articleId: b, sentence: 's3', status: 'pending', knowledge: 0 });
            userData.collectedWords.push({ id: 'iso-6', word: 'eta', meaning: '庚', articleId: b, sentence: 's3', status: 'pending', knowledge: 0 });

            renderArticle(a);     // 真实进阅读页（内部会刷计数与收藏列表）
            updateProgress();
            updateCollectBadge();
            renderReadingFavs();
            syncGuessLockButton();  // 真实应用里这步在 DOMContentLoaded；这里补上，保证开关文案与模式一致

            const host = document.getElementById('readingFavsList');
            const lockBtn = document.getElementById('guessLockBtn');
            return {
                curId: currentArticle && currentArticle.id,
                txt: (document.getElementById('progText') || {}).textContent || '',
                favsText: (document.getElementById('favsSortBtn') || {}).textContent || '',
                badge: (document.getElementById('collectBadge') || {}).textContent,
                badgeHidden: (document.getElementById('collectBadge') || {}).classList.contains('hidden'),
                favsHtml: (host && host.innerHTML) || '',
                pendingAll: pendingCountAll(),
                pendingInArticle: pendingCountOfArticle(a),
                otherPending: pendingCountOfArticle(b),
                lockText: (lockBtn.textContent || '').trim(),
                lockOn: lockBtn.classList.contains('lock-on'),
                // 默认查看模式 → 未锁：不需要解锁就能直接看到释义
                revealed: isMeaningRevealed('alpha')
            };
        }, { a: ISO_ART, b: ISO_OTHER });

        check('【㉒】当前文章确实切到了本文探针', iso.curId === ISO_ART, iso);
        check('【㉒】★「N words」分子 = 本文去重收藏词数（2），不是跨文章的会话累计',
            iso.txt === '2/4 words', iso.txt);
        check('【㉒】★「📋 去分类 N」= 本文待分类行数（2），不是全局存量（' + iso.pendingAll + '）',
            Number((iso.favsText.match(/(\d+)/) || [])[1]) === 2, iso);
        check('【㉒】收集区红点 = 本文待分类数（2）', iso.badge === '2' && iso.badgeHidden === false, iso);
        check('【㉒】「我的收藏」列表只列本文的词（alpha / beta）',
            /alpha/.test(iso.favsHtml) && /beta/.test(iso.favsHtml), iso.favsHtml.slice(0, 200));
        check('【㉒】★ 另一篇文章的收藏（epsilon / zeta / eta）一个字都没泄漏进列表',
            // 用「前后不是字母」的边界匹配：否则 beta 里的 "eta" 会误命中
            !/(?:^|[^a-z])(epsilon|zeta|eta)(?:[^a-z]|$)/i.test(iso.favsHtml), iso.favsHtml.slice(0, 200));
        check('【㉒】本文 2 行 / 另一篇 3 行 pending 各算各的（隔离而非合并）',
            iso.pendingInArticle === 2 && iso.otherPending === 3, iso);
        check('【㉒】默认查看模式下点词直接可见释义（未被「猜词模式」锁住）', iso.revealed === true, iso);
        check('【㉒】阅读页开关文案同步为「🔓 查看模式」（默认态不打脸）',
            iso.lockText.indexOf('查看模式') >= 0 && iso.lockOn === false, { lockText: iso.lockText, lockOn: iso.lockOn });
        await page.screenshot({ path: path.join(__dirname, 'test_screenshot_isolated_stats.png') });

        // ---- 问题二：默认「查看模式」+ 手动设置全局沿用 ----
        const gm1 = await page.evaluate(() => {
            localStorage.removeItem('guessMode');
            loadGuessLockState();
            syncGuessLockButton();
            const btn = document.getElementById('guessLockBtn');
            return {
                mode: guessMode,
                text: (btn.textContent || '').trim(),
                on: btn.classList.contains('lock-on'),
                stored: localStorage.getItem('guessMode')
            };
        });
        check('【㉒】localStorage 没有 guessMode 时 → 默认「查看模式」guessMode=false', gm1.mode === false, gm1);
        check('【㉒】顶部开关文案=「🔓 查看模式」且无 lock-on 高亮',
            gm1.text.indexOf('查看模式') >= 0 && gm1.on === false, gm1);
        check('【㉒】默认态**不写** localStorage（缺省即默认，不塞脏值）', gm1.stored === null, gm1);

        const gm2 = await page.evaluate(() => {
            localStorage.setItem('guessMode', 'on');    // 模拟用户手动切到猜词模式
            loadGuessLockState();
            syncGuessLockButton();
            const btn = document.getElementById('guessLockBtn');
            return { mode: guessMode, text: (btn.textContent || '').trim(), on: btn.classList.contains('lock-on') };
        });
        check('【㉒】用户手动设置过（stored=on）→ 之后载入沿用猜词模式（全局设置不被默认值覆盖）',
            gm2.mode === true && gm2.on === true && gm2.text.indexOf('猜词模式') >= 0, gm2);

        // 恢复成查看模式（本文件其它部分都按查看模式跑）
        await page.evaluate(() => { localStorage.setItem('guessMode', 'off'); loadGuessLockState(); syncGuessLockButton(); });
    } catch (e) {
        check('【㉒】执行过程中出现异常', false, String((e && e.message) || e));
    } finally {
        try {
            await page.evaluate(({ a, b }) => {
                userData.collectedWords = userData.collectedWords.filter(w => w.articleId !== a && w.articleId !== b);
                ARTICLES = ARTICLES.filter(x => x.id !== a && x.id !== b);
            }, { a: ISO_ART, b: ISO_OTHER });
        } catch (_) {}
    }

    // ============================================================
    // 【㉓ 总结页「收藏的单词」卡片排版（2026-10-09）
    //   用户报：所有词挤成一行 `词 · 释义`，词义一长完全读不下去。
    //   期望：一词一卡，单词 / 释义 / 括号备注各占一行。
    // ============================================================
    console.log('\n【㉓ 总结页「收藏的单词」卡片排版（2026-10-09）】');
    try {
        // ---- 拆释义的纯函数（含边界）----
        const sp = await page.evaluate(() => ({
            a: splitMeaningNote('决定；确定（determine 的第三人称单数）'),
            b: splitMeaningNote('可能性（复数）'),
            c: splitMeaningNote('苹果'),
            d: splitMeaningNote(''),
            e: splitMeaningNote(null),
            f: splitMeaningNote('（复数）'),          // 整条就是括号 → 不拆
            g: splitMeaningNote('n. 兼职的；部分时间的（指非全日工作）'),
        }));
        check('【㉓】★ 尾部括注被拆出：main=「决定；确定」 note=「（determine 的第三人称单数）」',
            sp.a.main === '决定；确定' && sp.a.note === '（determine 的第三人称单数）', sp.a);
        check('【㉓】★「可能性（复数）」→ main=「可能性」 note=「（复数）」',
            sp.b.main === '可能性' && sp.b.note === '（复数）', sp.b);
        check('【㉓】无括号的释义不拆（苹果）', sp.c.main === '苹果' && sp.c.note === '', sp.c);
        check('【㉓】空释义 / null 不抛异常且返回空', sp.d.main === '' && sp.e.main === '', { d: sp.d, e: sp.e });
        check('【㉓】整条就是括号时不拆（避免释义被吞空）', sp.f.main === '（复数）' && sp.f.note === '', sp.f);
        check('【㉓】多义项 + 括注：主释义保留完整分号链',
            sp.g.main === 'n. 兼职的；部分时间的' && sp.g.note === '（指非全日工作）', sp.g);

        // ---- 真渲染：用用户截图里的两条数据 ----
        const r = await page.evaluate(() => {
            window.__origSessionList = sessionCollectedList.slice();
            sessionCollectedList = [
                { word: 'determines', meaning: '决定；确定（determine 的第三人称单数）', articleId: null },
                { word: 'possibilities', meaning: '可能性（复数）', articleId: null },
            ];
            showScreen('summaryPage');
            renderSummary();
            const host = document.getElementById('summaryCollectedList');
            const cards = Array.prototype.slice.call(host.querySelectorAll('.summary-word-card'));
            const rect = (el) => { const b = el.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
            const cardsInfo = cards.map((c) => {
                const w = c.querySelector('.sw-word');
                const m = c.querySelector('.sw-meaning');
                const n = c.querySelector('.sw-note');
                return {
                    word: w ? w.textContent : null,
                    meaning: m ? m.textContent : null,
                    note: n ? n.textContent : null,
                    wordRect: w ? rect(w) : null,
                    meaningRect: m ? rect(m) : null,
                    rect: rect(c),
                    text: c.textContent,
                    borderLeftWidth: getComputedStyle(c).borderLeftWidth,
                    display: getComputedStyle(c).display,
                };
            });
            return {
                containerClass: host.className,
                display: getComputedStyle(host).display,
                cols: getComputedStyle(host).gridTemplateColumns,
                cardCount: cards.length,
                cards: cardsInfo,
                hostRect: rect(host),
                rawHtml: host.innerHTML,
            };
        });

        check('【㉓】列表容器换成了卡片网格（class=summary-word-grid，display:grid）',
            r.containerClass.indexOf('summary-word-grid') >= 0 && r.display === 'grid', { cls: r.containerClass, display: r.display });
        check('【㉓】★ 两个词渲染成两张独立卡片', r.cardCount === 2, r.cardCount);
        check('【㉓】★ 卡片里不再有 `词 · 释义` 的「·」拼接',
            !/·/.test(r.rawHtml), r.rawHtml.slice(0, 240));
        check('【㉓】★ 卡片 1：词 = determines', r.cards[0] && r.cards[0].word === 'determines', r.cards[0]);
        check('【㉓】★ 卡片 1：主释义 = 「决定；确定」', r.cards[0] && r.cards[0].meaning === '决定；确定', r.cards[0]);
        check('【㉓】★ 卡片 1：备注 = 「（determine 的第三人称单数）」',
            r.cards[0] && r.cards[0].note === '（determine 的第三人称单数）', r.cards[0]);
        check('【㉓】★ 卡片 2：词 = possibilities / 主释义 = 可能性 / 备注 = （复数）',
            r.cards[1] && r.cards[1].word === 'possibilities'
            && r.cards[1].meaning === '可能性' && r.cards[1].note === '（复数）', r.cards[1]);
        // 「单词」「释义」分行：释义的顶边不高于单词的底边 → 说明确实换行了
        check('【㉓】★ 单词与释义分行显示（释义不在单词同一行）',
            r.cards[0].meaningRect.t >= r.cards[0].wordRect.b - 2,
            { word: r.cards[0].wordRect, meaning: r.cards[0].meaningRect });
        // 两张卡片互不重叠（各自独立成卡，不是挤在一行）
        const c0 = r.cards[0].rect, c1 = r.cards[1].rect;
        const overlap = !(c0.r <= c1.l + 1 || c1.r <= c0.l + 1 || c0.b <= c1.t + 1 || c1.b <= c0.t + 1);
        check('【㉓】★ 两张卡片互不重叠（各自独立成卡）', overlap === false, { c0, c1 });
        check('【㉓】卡片宽度明显小于容器宽度（不是被拉成一行一个整条）',
            c0.w < r.hostRect.w - 2, { cardW: c0.w, hostW: r.hostRect.w });
        check('【㉓】每张卡片都有左侧强调边（border-left 3px 主色）',
            r.cards[0] && r.cards[0].borderLeftWidth === '3px', r.cards[0] && r.cards[0].borderLeftWidth);
        await sleep(500);   // 等 .screen 的 fadeIn 0.3s 动画走完，截图才不是半透明
        await page.screenshot({ path: path.join(__dirname, 'test_screenshot_summary_cards.png') });

        // ---- 空态：没有收藏时仍是提示文案 ----
        const empty = await page.evaluate(() => {
            sessionCollectedList = [];
            renderSummary();
            return document.getElementById('summaryCollectedList').textContent;
        });
        check('【㉓】没有收藏时显示「本次还没有收藏单词」', empty.indexOf('本次还没有收藏单词') >= 0, empty);

        // ---- 问题一：猜词表单不再有那句多余提示（浏览器侧同断言）----
        const hintGone = await page.evaluate(() => {
            const html = buildGuessSectionHtml('brandnew2', 'A brandnew2 thing.', 'k1');
            return { has: html.indexOf('猜不出来也没关系') >= 0, hasSkip: html.indexOf('跳过') >= 0, hasRevealBtn: html.indexOf('wc-btn-guess-reveal') >= 0 };
        });
        check('【㉓】猜词表单里**不再有**「猜不出来也没关系…跳过」提示', hintGone.has === false && hintGone.hasSkip === false, hintGone);
        check('【㉓】「直接看释义」按钮本身保留', hintGone.hasRevealBtn === true, hintGone);
    } catch (e) {
        check('【㉓】执行过程中出现异常', false, String((e && e.message) || e));
    } finally {
        try {
            await page.evaluate(() => {
                if (window.__origSessionList) { sessionCollectedList = window.__origSessionList; delete window.__origSessionList; }
                renderSummary();
            });
        } catch (_) {}
    }

    // ============================================================
    // 【㉔ 首页快捷操作：学习 / 复习 / 每日挑战（2026-10-09）
    //   用户报：四个快捷操作里只有 My Wordbooks 有内容，其余三个点了没反应。
    //   本节验：入口真的接线、副标题不是写死的壳、三条流程在真 DOM 里能走完、苹果每天只发一颗。
    // ============================================================
    console.log('\n【㉔ 首页快捷操作：学习 / 复习 / 每日挑战（2026-10-09）】');
    try {
        // ---- 造数据 + 打桩回写接口（绝不真改库）----
        const entry = await page.evaluate(() => {
            window.__origApiPut = apiPut;
            apiPut = async () => ({ success: true });        // 状态回写只测前端，别真写 user_words
            window.__origCollected = (userData.collectedWords || []).slice();
            window.__origApples = localStorage.getItem('gaApples');
            window.__origChDate = localStorage.getItem('gaChallengeDate');
            localStorage.removeItem('gaApples');
            localStorage.removeItem('gaChallengeDate');

            const now = Date.now(), DAY = 86400000;
            userData.collectedWords = [
                { id: 'qa-qa-l1', word: 'alphaish', meaning: '甲义的', status: 'pending', knowledge: 0, nextReviewAt: null, sentence: 'Alphaish things happen here.', articleId: null },
                { id: 'qa-qa-l2', word: 'betaish', meaning: '乙义的', status: 'pending', knowledge: 0, nextReviewAt: null, sentence: '', articleId: null },
                { id: 'qa-qa-l3', word: 'etaish', meaning: '戊义的', status: 'pending', knowledge: 0, nextReviewAt: null, sentence: '', articleId: null },
                { id: 'qa-qa-r1', word: 'gammaish', meaning: '丙义的', status: 'learning', knowledge: 0.5, nextReviewAt: new Date(now - DAY).toISOString(), sentence: 'Gammaish rays are strong.', articleId: null },
                { id: 'qa-qa-r2', word: 'epsilonish', meaning: '己义的', status: 'review', knowledge: 0.2, nextReviewAt: new Date(now + DAY).toISOString(), sentence: '', articleId: null },
            ];
            showScreen('dashboardPage');
            renderMain();

            const items = Array.prototype.slice.call(document.querySelectorAll('#dashboardPage .action-item'));
            const sub = (id) => { const e = document.getElementById(id); return e ? e.textContent : null; };
            return {
                itemCount: items.length,
                onclicks: items.map(i => i.getAttribute('onclick')),
                titles: items.map(i => { const e = i.querySelector('.action-title'); return e ? e.textContent : null; }),
                subs: ['qaWordbooksSub', 'qaLearnSub', 'qaReviewSub', 'qaChallengeSub'].map(sub),
            };
        });

        check('【㉔】首页仍是 4 个快捷操作', entry.itemCount === 4, entry.itemCount);
        check('【㉔】★ Learn Vocabulary 已接线（onclick=startPractice(\'learn\')）',
            (entry.onclicks[1] || '').indexOf("startPractice('learn')") >= 0, entry.onclicks[1]);
        check('【㉔】★ Review Words 已接线（onclick=startPractice(\'review\')）',
            (entry.onclicks[2] || '').indexOf("startPractice('review')") >= 0, entry.onclicks[2]);
        check('【㉔】★ Daily Challenge 已接线（onclick=startPractice(\'challenge\')）',
            (entry.onclicks[3] || '').indexOf("startPractice('challenge')") >= 0, entry.onclicks[3]);
        check('【㉔】★ 副标题不再是写死的壳（旧值 6 new words / 8 due today / +50 XP 全部消失）',
            entry.subs.slice(1).join(' ').indexOf('6 new words') < 0
            && entry.subs.slice(1).join(' ').indexOf('8 due today') < 0
            && entry.subs.slice(1).join(' ').indexOf('+50 XP') < 0, entry.subs);
        check('【㉔】My Wordbooks 副标题 = 收藏词数（5）', /^5 个收藏词$/.test(entry.subs[0]), entry.subs[0]);
        check('【㉔】★ Learn 副标题 = 待学词数（3 个 pending）', entry.subs[1] === '3 个待学单词', entry.subs[1]);
        check('【㉔】★ Review 副标题 = 今天该复习词数（1 到期 + 1 需复习 = 2）', entry.subs[2] === '2 个今日复习', entry.subs[2]);
        check('【㉔】Daily Challenge 副标题 = +1 🍎（初始苹果 0）',
            entry.subs[3] === '+1 🍎 · 已得 0', entry.subs[3]);

        // ---- 学习词汇：真点击入口 → 真卡片 ----
        await page.evaluate(() => { document.querySelectorAll('#dashboardPage .action-item')[1].click(); });
        await sleep(120);
        const learn1 = await page.evaluate(() => ({
            active: document.getElementById('practicePage').classList.contains('active'),
            title: document.getElementById('practiceTitle').textContent,
            progress: document.getElementById('practiceProgress').textContent,
            word: (document.querySelector('#practiceBody .practice-word') || {}).textContent,
            hasReveal: /practiceReveal\(\)/.test(document.getElementById('practiceActions').innerHTML),
            leaksMeaning: /甲义的|乙义的|戊义的/.test(document.getElementById('practiceBody').innerHTML),
        }));
        check('【㉔】★ 点 Learn → 进入练习屏', learn1.active === true, learn1);
        check('【㉔】标题「学习词汇」、进度 1 / 3', learn1.title === '学习词汇' && learn1.progress === '1 / 3', learn1);
        check('【㉔】第一张卡显示单词、且不泄露释义', !!learn1.word && learn1.leaksMeaning === false, learn1);
        check('【㉔】prompt 阶段只有「显示释义」按钮', learn1.hasReveal === true, learn1);
        await page.screenshot({ path: path.join(__dirname, 'test_screenshot_practice_learn.png') });

        await page.evaluate(() => document.querySelector('.practice-btn.primary').click());
        await sleep(80);
        const learn2 = await page.evaluate(() => ({
            body: document.getElementById('practiceBody').textContent,
            actions: document.getElementById('practiceActions').innerHTML,
        }));
        check('【㉔】点「显示释义」→ 释义出现', /甲义的|乙义的|戊义的/.test(learn2.body), learn2.body.slice(0, 120));
        check('【㉔】出现「认识 / 还不认识」两个判定按钮',
            learn2.actions.indexOf('practiceMark(true)') >= 0 && learn2.actions.indexOf('practiceMark(false)') >= 0, learn2.actions);
        await page.evaluate(() => document.querySelector('.practice-btn.ok').click());
        await sleep(120);
        const learn3 = await page.evaluate(() => ({
            status: (userData.collectedWords.find(w => w.word === 'alphaish') || {}).status,
            idx: document.getElementById('practiceProgress').textContent,
        }));
        check('【㉔】★ 点「认识了」→ 该词 status 变 mastered', learn3.status === 'mastered', learn3);
        check('【㉔】自动跳到第 2 题', learn3.idx === '2 / 3', learn3.idx);

        // ---- 复习单词：四选一真选项 ----
        await page.evaluate(() => { exitPractice(); });
        await sleep(80);
        await page.evaluate(() => { document.querySelectorAll('#dashboardPage .action-item')[2].click(); });
        await sleep(120);
        const rev1 = await page.evaluate(() => {
            const opts = Array.prototype.slice.call(document.querySelectorAll('#practiceBody .practice-option'));
            return {
                active: document.getElementById('practicePage').classList.contains('active'),
                title: document.getElementById('practiceTitle').textContent,
                optCount: opts.length,
                optTexts: opts.map(o => o.textContent.replace(/^[A-D]/, '').trim()),
                correctIdx: opts.map(o => o.textContent.replace(/^[A-D]/, '').trim()).indexOf('丙义的'),
            };
        });
        check('【㉔】★ 点 Review → 进入四选一题目', rev1.active === true && rev1.optCount === 4, rev1);
        check('【㉔】标题「复习单词」', rev1.title === '复习单词', rev1.title);
        check('【㉔】★ 4 个选项都有真释义（不是空壳按钮）', rev1.optTexts.every(t => t.length > 0), rev1.optTexts);
        check('【㉔】正确释义「丙义的」在选项里', rev1.correctIdx >= 0, rev1.optTexts);
        await page.screenshot({ path: path.join(__dirname, 'test_screenshot_practice_review.png') });

        await page.evaluate((i) => { document.querySelectorAll('#practiceBody .practice-option')[i].click(); }, rev1.correctIdx);
        await sleep(120);
        const rev2 = await page.evaluate(() => ({
            body: document.getElementById('practiceBody').textContent,
            status: (userData.collectedWords.find(w => w.word === 'gammaish') || {}).status,
        }));
        check('【㉔】★ 选对 → 显示「答对了」', /答对了/.test(rev2.body), rev2.body.slice(0, 100));
        check('【㉔】★ 答对 → status 变 mastered', rev2.status === 'mastered', rev2.status);

        // ---- 每日挑战：真输入框打字 ----
        await page.evaluate(() => { exitPractice(); });
        await sleep(80);
        await page.evaluate(() => { document.querySelectorAll('#dashboardPage .action-item')[3].click(); });
        await sleep(150);
        const ch1 = await page.evaluate(() => ({
            active: document.getElementById('practicePage').classList.contains('active'),
            hasInput: !!document.getElementById('practiceSpellInput'),
            prompt: document.getElementById('practiceBody').textContent,
            word: document.getElementById('practiceBody').innerHTML.indexOf('practiceSpellInput') >= 0,
        }));
        check('【㉔】★ 点 Daily Challenge → 进入拼写题', ch1.active === true && ch1.hasInput === true, ch1);

        // ★ 拼写题例句必须挖空（不再送答案）：把首题固定成有例句的 alphaish 做确定性验证，验完还原真实队列
        const chMask = await page.evaluate(() => {
            const st = practiceState;
            window.__origChallengeQueue = st.queue.slice();   // 留给截图后还原
            const w = userData.collectedWords.find(x => x.word === 'alphaish');
            st.queue = [w, w, w]; st.idx = 0; st.phase = 'ask'; st.hintKeep = 0; renderPractice();
            const body = document.getElementById('practiceBody');
            const out = {
                word: w && w.word,
                sentence: w && w.sentence,
                leaks: body.textContent.toLowerCase().indexOf('alphaish') >= 0,
                blanks: body.querySelectorAll('.practice-blank').length,
                text: body.textContent,
                hasHintBtn: /practiceHint\(\)/.test(document.getElementById('practiceActions').innerHTML),
            };
            practiceHint();                       // 开词根提示
            out.hintPrefix = w ? w.word.slice(0, Math.ceil(w.word.length / 2)) : '';
            out.hintLeaks = body.textContent.toLowerCase().indexOf('alphaish') >= 0;
            out.hintHasPrefix = body.textContent.toLowerCase().indexOf(String(out.hintPrefix).toLowerCase()) >= 0;
            out.hintText = body.textContent;
            practiceHint();                       // 收起（回到全挖空，正好给截图）
            return out;
        });
        check('【㉔】★ 拼写题例句里看不到目标词（alphaish 被挖空）',
            chMask.leaks === false, chMask);
        check('【㉔】★ 例句里出现下划线空位 .practice-blank', chMask.blanks >= 1, chMask);
        check('【㉔】★ 有「词根提示」按钮', chMask.hasHintBtn === true, chMask);
        check('【㉔】★ 词根提示开启后：露出前半字母但仍无完整目标词',
            chMask.hintLeaks === false && chMask.hintHasPrefix === true, chMask);
        await page.screenshot({ path: path.join(__dirname, 'test_screenshot_practice_challenge.png') });
        // 截图后还原真实队列，后续题目仍走原流程
        await page.evaluate(() => {
            const st = practiceState;
            if (st && window.__origChallengeQueue) {
                st.queue = window.__origChallengeQueue; st.idx = 0; st.phase = 'ask'; st.hintKeep = 0; renderPractice();
            }
        });

        // 三道题：用真输入框逐题作答（正确拼写 = 该题目标词）
        for (let i = 0; i < 3; i++) {
            const target = await page.evaluate(() => {
                const st = practiceState;
                return st && st.queue[st.idx] ? st.queue[st.idx].word : null;
            });
            if (!target) break;
            await page.fill('#practiceSpellInput', target);
            await page.click('#practiceSpellBtn');
            await sleep(120);
            const st = await page.evaluate(() => ({ phase: practiceState.phase, fb: document.getElementById('practiceBody').textContent }));
            check(`【㉔】挑战第 ${i + 1} 题拼对 → 显示「拼对了」`, /拼对了/.test(st.fb), st.fb.slice(0, 80));
            await page.evaluate(() => document.querySelector('.practice-btn.primary').click());
            await sleep(120);
        }
        const ch2 = await page.evaluate(() => ({
            apples: localStorage.getItem('gaApples'),
            chDate: localStorage.getItem('gaChallengeDate'),
            body: document.getElementById('practiceBody').textContent,
            sub: document.getElementById('qaChallengeSub').textContent,
        }));
        check('【㉔】★ 三道题做完 → 🍎 +1', ch2.apples === '1', ch2);
        check('【㉔】★ 记录今日已完成（gaChallengeDate 非空）', !!ch2.chDate, ch2.chDate);
        check('【㉔】结算页显示苹果到账', /苹果已到账/.test(ch2.body), ch2.body.slice(0, 120));
        check('【㉔】★ 首页副标题变为「今日已完成」', ch2.sub.indexOf('今日已完成') >= 0, ch2.sub);

        await page.evaluate(() => { exitPractice(); });
        await sleep(150);
        const dash = await page.evaluate(() => ({
            subs: ['qaWordbooksSub', 'qaLearnSub', 'qaReviewSub', 'qaChallengeSub'].map(id => document.getElementById(id).textContent),
            stats: document.getElementById('stats').textContent,
            // 实时重算一遍队列，用来证明副标题是「跟着数据算出来的」而不是写死的
            liveLearn: learnQueue().length,
            liveReview: reviewQueue().length,
            pendingLeft: userData.collectedWords.filter(w => w.status === 'pending').length,
        }));
        // 注意：每日挑战会随机抽中并升级词，所以「剩下几个待学」每轮不同 ——
        // 断言「副标题 == 实时队列长度」而不是写死数字（写死数字会被随机性打脸）。
        const expectLearn = dash.liveLearn > 0 ? dash.liveLearn + ' 个待学单词' : '暂无待学单词';
        const expectReview = dash.liveReview > 0 ? dash.liveReview + ' 个今日复习' : '今日无复习任务';
        check('【㉔】★ 回到首页后副标题跟着实时队列重算（不是写死值）',
            dash.subs[1] === expectLearn && dash.subs[2] === expectReview,
            { subs: dash.subs, expectLearn, expectReview, pendingLeft: dash.pendingLeft });
        check('【㉔】学过/复习过的词不再计入待学（pending 已减少）', dash.pendingLeft <= 1, dash.pendingLeft);
        check('【㉔】首页统计行带上苹果数 🍎 1', /🍎 1/.test(dash.stats), dash.stats);
        // 快捷操作卡片在首屏下方：滚到它再截图，否则截出来的全是上方内容
        await page.evaluate(() => { const c = document.querySelector('.quick-actions-card'); if (c) c.scrollIntoView({ block: 'center' }); });
        await sleep(250);
        await page.screenshot({ path: path.join(__dirname, 'test_screenshot_quick_actions.png') });
    } catch (e) {
        check('【㉔】执行过程中出现异常', false, String((e && e.message) || e));
    } finally {
        try {
            await page.evaluate(() => {
                if (window.__origApiPut) apiPut = window.__origApiPut;
                if (window.__origCollected) userData.collectedWords = window.__origCollected;
                if (window.__origApples === null || window.__origApples === undefined) localStorage.removeItem('gaApples');
                else localStorage.setItem('gaApples', window.__origApples);
                if (window.__origChDate === null || window.__origChDate === undefined) localStorage.removeItem('gaChallengeDate');
                else localStorage.setItem('gaChallengeDate', window.__origChDate);
                practiceState = null;
                renderMain();
            });
        } catch (_) {}
    }

    // 【㉕ 刷新不丢页 + 浏览器返回键不退出应用（2026-10-09）
    //     用户报：① 刷新页面会被打回欢迎页（「登录页」）② 按返回键直接退出应用
    //     这里用真刷新（page.reload）和真返回（history.back → 真 popstate）验证。
    console.log('\n【㉕ 刷新不丢页 + 返回键不退出应用（2026-10-09）】');
    try {
        const artId = await page.evaluate(() => {
            const a = (typeof ARTICLES !== 'undefined' && ARTICLES.length) ? ARTICLES[0] : null;
            return (a && a.id) ? a.id : 'article_001';
        });
        await page.evaluate((id) => { openArticle(id); }, artId);
        await sleep(600);
        const before = await page.evaluate(() => ({
            active: [...document.querySelectorAll('.screen')].filter(s => s.classList.contains('active')).map(s => s.id),
            title: document.getElementById('readTitle').textContent,
            id: currentArticle && currentArticle.id,
        }));
        check('【㉕】已进入阅读页（准备刷新）', before.active.indexOf('readingPage') >= 0 && !!before.title, before);

        // 等价于「用户点过开始旅程」：会话里记着已开始 + 当前屏 + 当前文章
        // ⚠️ 2026-10-09 起会话写在 sessionStorage（标签页级）；写 localStorage 已不再生效
        await page.evaluate((id) => {
            sessionStorage.setItem('gaSession', JSON.stringify({
                started: true, screen: 'readingPage', articleId: id, at: Date.now()
            }));
        }, artId);

        // ---- 真刷新 ----
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => typeof window.openArticle === 'function', { timeout: 15000 });
        let restored = null;
        for (let i = 0; i < 24; i++) {          // 最长等 6 秒（要重新拉文章列表/详情）
            await sleep(250);
            restored = await page.evaluate(() => ({
                active: [...document.querySelectorAll('.screen')].filter(s => s.classList.contains('active')).map(s => s.id),
                title: document.getElementById('readTitle').textContent,
                startActive: document.getElementById('startingPage').classList.contains('active'),
                sess: (function () { try { return JSON.parse(sessionStorage.getItem('gaSession') || 'null'); } catch (e) { return null; } })(),
            }));
            if (restored.active.indexOf('readingPage') >= 0) break;
        }
        check('【㉕】★ 刷新后没有被踢回欢迎页 / 登录页', restored.startActive === false, restored);
        check('【㉕】★ 刷新后仍停在刷新前那篇文章的阅读页', restored.active.indexOf('readingPage') >= 0, restored.active);
        check('【㉕】★ 刷新后文章标题与刷新前一致', restored.title === before.title, { before: before.title, after: restored.title });
        check('【㉕】会话里仍记着「已开始」和当前文章',
            !!restored.sess && restored.sess.started === true && !!restored.sess.articleId, restored.sess);
        await page.screenshot({ path: path.join(__dirname, 'test_screenshot_refresh_restore.png') });

        // ---- 真返回（history.back 会派发真 popstate，等价于点浏览器的返回键）----
        await page.evaluate(() => { window.__aliveProbe = 4242; });
        await page.evaluate(() => { history.back(); });
        await sleep(500);
        const b1 = await page.evaluate(() => ({
            active: [...document.querySelectorAll('.screen')].filter(s => s.classList.contains('active')).map(s => s.id),
            alive: window.__aliveProbe,
            appLoaded: typeof window.showScreen === 'function',
        }));
        check('【㉕】★ 按返回键 → 回到上一页（主界面），而不是退出应用', b1.active.indexOf('dashboardPage') >= 0, b1);
        check('【㉕】★ 返回过程是应用内切屏（页面没被卸载重载）', b1.alive === 4242 && b1.appLoaded === true, b1);

        // 已经在根屏（主界面）时再按返回：不应直接把用户踢出应用
        await page.evaluate(() => { history.back(); });
        await sleep(500);
        const b2 = await page.evaluate(() => ({
            active: [...document.querySelectorAll('.screen')].filter(s => s.classList.contains('active')).map(s => s.id),
            alive: window.__aliveProbe,
            toast: document.getElementById('toast').textContent,
        }));
        check('【㉕】★ 在根屏再按返回不会直接退出应用', b2.alive === 4242 && b2.active.indexOf('dashboardPage') >= 0, b2);
        check('【㉕】给出「再按一次返回即可退出」提示', b2.toast.indexOf('再按一次') >= 0, b2.toast);

        // 收尾：回到干净状态，别把会话留给后面的 ⑪ 收尾检查
        await page.evaluate(() => { sessionStorage.removeItem('gaSession'); });
    } catch (e) {
        check('【㉕】执行过程中出现异常', false, String((e && e.message) || e));
    }

    // 【㉖ 「🤖 AI 翻译」文案 + 「取消收藏」两个入口（2026-10-09）
    //     用户要求：① 按钮文案「🔎 联网深查本句释义」→「🤖 AI 翻译」
    //              ② 收藏后要有「取消收藏」入口：词卡里一个、我的收藏列表里每词一个。
    console.log('\n【㉖ 「🤖 AI 翻译」文案 + 「取消收藏」（2026-10-09）】');
    try {
        // ---- A. 文案：纯函数调用，不依赖 DOM ----
        const labels = await page.evaluate(() => ({
            withCtx: buildContextSectionHtml({ contextDefinition: 'x', contextSource: 'article', contextPending: false }),
            noCtx: buildContextSectionHtml({ contextDefinition: null, contextSource: null, contextPending: false }),
        }));
        check('【㉖】★ 「AI 翻译」文案生效（已有语境释义时）', labels.withCtx.indexOf('🤖 AI 翻译') >= 0, labels.withCtx.slice(0, 220));
        check('【㉖】★ 「AI 翻译」文案生效（本句还没有释义时）', labels.noCtx.indexOf('🤖 AI 翻译') >= 0, labels.noCtx.slice(0, 220));
        check('【㉖】★ 旧文案「联网深查本句释义」已彻底消失',
            labels.withCtx.indexOf('联网深查') < 0 && labels.noCtx.indexOf('联网深查') < 0, labels);
        check('【㉖】按钮内部类名仍是 wc-btn-remote（标识没被连带改掉）',
            labels.noCtx.indexOf('wc-btn-remote') >= 0 && labels.withCtx.indexOf('wc-btn-remote') >= 0);

        // ---- B. 造数据 + 打桩取消收藏接口（绝不真删库）----
        const artId = await page.evaluate(() => (currentArticle && currentArticle.id)
            || (ARTICLES[0] && ARTICLES[0].id) || 'article_001');

        const seeded = await page.evaluate(({ id }) => {
            window.__origApiDelete_ = apiDelete;
            window.__origCollected_ = (userData.collectedWords || []).slice();
            window.__origGuessMode_ = localStorage.getItem('guessMode');
            window.__delCalls = [];
            apiDelete = async (path, query) => { window.__delCalls.push({ path, query }); return { success: true, deleted: 1 }; };
            // 词卡要画「标记/收藏」区就必须是查看模式（猜词模式下整块 actions 是隐藏的）
            localStorage.setItem('guessMode', 'off');
            loadGuessLockState();

            // 关掉「按住单词拖到右侧收集区」的首次引导气泡：它固定在左下角，会压住收藏列表，
            // 截图拍出来像"列表被挡"。★ 必须在 showScreen 之前设：showDragGuideIfNeeded 是同步读
            // 这个键来决定要不要注册「500ms 后建气泡」的定时器，晚一步设就拦不住了。
            window.__origHasDropped_ = localStorage.getItem('hasDroppedWord');
            localStorage.setItem('hasDroppedWord', 'true');

            // 【㉖】开跑前必须回到阅读页：上一节（㉕）结束时已 history.back() 回主界面，
            // 收藏列表/词卡都挂在未激活的 #readingPage 里 → 渲染了也看不见（截图会拍到主界面）。
            showScreen('readingPage');

            const SENT1 = 'Qa uncollect probe sentence one.';
            const SENT2 = 'Qa uncollect probe sentence two.';
            const norm = (getWordPositionIndices(SENT1).cleanSentence) || SENT1;
            window.__qaSent = norm;
            userData.collectedWords = [
                { id: 'qa-u1', word: 'qauncollectish', meaning: '甲的', status: 'pending', knowledge: 0, sentence: norm, articleId: id },
                { id: 'qa-u2', word: 'qauncollectish', meaning: '甲的', status: 'pending', knowledge: 0, sentence: SENT2, articleId: id },
                { id: 'qa-other', word: 'otherwordish', meaning: '乙的', status: 'pending', knowledge: 0, sentence: 'Another article sentence.', articleId: 'qa_some_other_article' },
            ];
            renderReadingFavs();
            // x/y 是 showWordCard(wordData, x, y) 的**独立参数**（鼠标锚点）。
            // 早先误把 _x/_y 塞进 wordData → positionWordCard 收到 NaN → 卡片被判到正文下方（视口外），
            // 断言仍会过（只查 querySelector 存在性），但截图里根本看不到卡片。
            showWordCard({ word: 'qauncollectish', sentence: norm, selectedText: 'qauncollectish' }, 620, 380);
            const guide = document.querySelector('.drag-guide-bubble');
            if (guide) guide.remove();

            const list = document.getElementById('readingFavsList');
            return {
                cardHasUncollect: !!document.querySelector('.word-card .wc-btn-uncollect'),
                cardHasCollect: !!document.querySelector('.word-card .wc-btn-collect'),
                uncollectText: (document.querySelector('.word-card .wc-btn-uncollect') || {}).textContent || '',
                chipCount: list.querySelectorAll('.fav-chip').length,
                chipRemoveCount: list.querySelectorAll('.fav-chip .fav-remove').length,
                chipWords: Array.prototype.map.call(list.querySelectorAll('.fav-chip .fav-word'), function (e) { return e.textContent; }),
                chipRemoveTitle: (list.querySelector('.fav-chip .fav-remove') || {}).getAttribute
                    ? list.querySelector('.fav-chip .fav-remove').getAttribute('title') : '',
            };
        }, { id: artId });

        check('【㉖】★ 本句已收藏 → 词卡显示「🗑 取消收藏」而不是「✨ 收藏」',
            seeded.cardHasUncollect === true && seeded.cardHasCollect === false, seeded);
        check('【㉖】词卡按钮文案就是「取消收藏」', /取消收藏/.test(seeded.uncollectText), seeded.uncollectText);
        check('【㉖】★ 我的收藏列表：本文 1 个去重 chip（同词两句只显示一条）', seeded.chipCount === 1, seeded);
        check('【㉖】★ 列表里每个词都带「取消收藏」小按钮（title=取消收藏）',
            seeded.chipRemoveCount === 1 && seeded.chipRemoveTitle === '取消收藏', seeded);
        check('【㉖】列表不含别篇文章的收藏（otherwordish 不出现）',
            seeded.chipWords.join(',').indexOf('otherwordish') < 0, seeded.chipWords);

        await sleep(700);   // 等词卡淡入 + 重定位动画跑完，否则截图拍到半透明/半路上的卡片
        await page.screenshot({ path: path.join(__dirname, 'test_screenshot_uncollect.png') });
        // 再单独给「我的收藏」面板来一张特写：整页图里它贴在左下角、会被常驻的拖拽收集区
        // （#collectZone，不是引导气泡）压掉一部分，看不出每个词上的 ✕ 按钮
        const favsPanel = await page.$('.reading-favs');
        if (favsPanel) await favsPanel.screenshot({ path: path.join(__dirname, 'test_screenshot_uncollect_list.png') });

        // ---- C. 点词卡「取消收藏」→ 只删本句那一条 ----
        await page.evaluate(() => {
            const b = document.querySelector('.word-card .wc-btn-uncollect');
            if (b) b.click();
        });
        await sleep(300);
        const afterCard = await page.evaluate(() => ({
            delCalls: window.__delCalls.slice(),
            words: (userData.collectedWords || []).map(function (w) { return w.word; }),
            cardHasCollect: !!document.querySelector('.word-card .wc-btn-collect'),
            cardHasUncollect: !!document.querySelector('.word-card .wc-btn-uncollect'),
            footer: (document.querySelector('.word-card .wc-footer') || {}).textContent || '',
            chips: document.querySelectorAll('#readingFavsList .fav-chip').length,
        }));
        check('【㉖】★ 点词卡「取消收藏」→ 调 DELETE /api/collect-word',
            afterCard.delCalls.length === 1 && afterCard.delCalls[0].path === '/api/collect-word', afterCard.delCalls);
        check('【㉖】★ 锚点是本词 + 本篇文章，且带 sentence（只删本句）',
            afterCard.delCalls[0].query.word === 'qauncollectish'
            && afterCard.delCalls[0].query.articleId === artId
            && !!afterCard.delCalls[0].query.sentence, afterCard.delCalls[0]);
        check('【㉖】★ 本地镜像只移除本句那一行（同词另一句仍在、别篇的词不受影响）',
            afterCard.words.filter(function (w) { return w === 'qauncollectish'; }).length === 1
            && afterCard.words.indexOf('otherwordish') >= 0, afterCard.words);
        check('【㉖】★ 词卡原地重绘回「✨ 收藏」（按钮换回来了）',
            afterCard.cardHasCollect === true && afterCard.cardHasUncollect === false, afterCard);
        check('【㉖】卡片底部提示不再写「已收藏」', afterCard.footer.indexOf('已收藏') < 0, afterCard.footer);
        check('【㉖】列表还有 1 个 chip（同词另一句仍收藏着）', afterCard.chips === 1, afterCard.chips);

        // ---- D. 点列表 ✕ → 删该词在本文的全部行 ----
        await page.evaluate(() => {
            const b = document.querySelector('#readingFavsList .fav-chip .fav-remove');
            if (b) b.click();
        });
        await sleep(300);
        const afterChip = await page.evaluate(() => ({
            delCalls: window.__delCalls.slice(),
            words: (userData.collectedWords || []).map(function (w) { return w.word; }),
            chips: document.querySelectorAll('#readingFavsList .fav-chip').length,
            text: document.getElementById('readingFavsList').textContent,
        }));
        check('【㉖】★ 点列表 ✕ → 再次调 DELETE', afterChip.delCalls.length === 2, afterChip.delCalls);
        check('【㉖】★ 列表取消**不带** sentence（按词删本文全部行）',
            afterChip.delCalls[1].query.word === 'qauncollectish' && !afterChip.delCalls[1].query.sentence,
            afterChip.delCalls[1]);
        check('【㉖】★ 同词在本文的两行被一起移除（列表按词去重，取消要删干净）',
            afterChip.words.indexOf('qauncollectish') < 0, afterChip.words);
        check('【㉖】别篇文章的收藏没被误删', afterChip.words.indexOf('otherwordish') >= 0, afterChip.words);
        check('【㉖】列表清空后回到空态文案', afterChip.chips === 0 && afterChip.text.indexOf('还没有收藏') >= 0, afterChip.text);
    } catch (e) {
        check('【㉖】执行过程中出现异常', false, String((e && e.message) || e));
    } finally {
        try {
            await page.evaluate(() => {
                if (window.__origApiDelete_) apiDelete = window.__origApiDelete_;
                if (window.__origCollected_) { userData.collectedWords = window.__origCollected_; }
                if (window.__origGuessMode_ === null || window.__origGuessMode_ === undefined) localStorage.removeItem('guessMode');
                else localStorage.setItem('guessMode', window.__origGuessMode_);
                if (window.__origHasDropped_ === null || window.__origHasDropped_ === undefined) localStorage.removeItem('hasDroppedWord');
                else localStorage.setItem('hasDroppedWord', window.__origHasDropped_);
                if (typeof loadGuessLockState === 'function') loadGuessLockState();
                hideWordCard();
                renderReadingFavs();
                renderMain();
            });
        } catch (_) {}
    }

    // 【㉗ 全新访问 = 新标签页 → 欢迎页（2026-10-09 修「路由被旧会话劫持」）
    //     用户报：一进网页直接是阅读页，欢迎页 / Dashboard 全被跳过。
    //     根因：老版本把会话写进 localStorage（永久 + 跨标签），一旦进过阅读页就永远被劫持。
    //     修法：会话改 sessionStorage（标签页级）+ 启动时清理遗留的 localStorage.gaSession。
    //     这里用「真开一个新标签页」验证：当前标签页有活跃会话，新标签页必须回到欢迎页。
    console.log('\n【㉗ 新标签页 = 全新访问 → 欢迎页（2026-10-09）】');
    try {
        const artId3 = await page.evaluate(() => {
            const a = (typeof ARTICLES !== 'undefined' && ARTICLES.length) ? ARTICLES[0] : null;
            return (a && a.id) ? a.id : 'article_001';
        });
        // 1) 当前标签页造一个「已开始 + 停在阅读页」的活跃会话
        await page.evaluate((id) => {
            sessionStorage.setItem('gaSession', JSON.stringify({ started: true, screen: 'readingPage', articleId: id, at: Date.now() }));
        }, artId3);
        check('【㉗】当前标签页有活跃会话（前置条件）',
            !!(await page.evaluate(() => sessionStorage.getItem('gaSession'))),
            await page.evaluate(() => sessionStorage.getItem('gaSession')));

        // 2) 模拟「老版本遗留的永久会话」：localStorage 里塞一条——新标签页必须无视并清理它
        await page.evaluate(() => {
            localStorage.setItem('gaSession', JSON.stringify({ started: true, screen: 'readingPage', articleId: 'legacy_article' }));
        });

        // 3) 真开一个新标签页 = 全新访问
        const page2 = await ctx.newPage();
        await page2.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
        await page2.waitForFunction(() => typeof window.showScreen === 'function', { timeout: 15000 });
        let fresh = null;
        for (let i = 0; i < 24; i++) {
            await sleep(250);
            fresh = await page2.evaluate(() => ({
                active: [...document.querySelectorAll('.screen')].filter(s => s.classList.contains('active')).map(s => s.id),
                sess: sessionStorage.getItem('gaSession'),
                legacyGone: localStorage.getItem('gaSession') === null,
            }));
            if (fresh.active.length) break;
        }
        check('【㉗】★ 新标签页进的是欢迎页（不再被旧会话劫持到阅读页）',
            fresh.active.indexOf('startingPage') >= 0 && fresh.active.indexOf('readingPage') < 0, fresh);
        // 注意：欢迎页本身也会把「当前屏」记进会话（刷新时停在欢迎页），所以不能断言「sessionStorage 为空」；
        // 真正的判据是**没有 started 标记** —— 有它才算「已开始」，才会跳过欢迎页。
        check('【㉗】★ 新标签页的会话没有 started 标记（= 全新访问，不走还原分支）',
            (function () { try { return !JSON.parse(fresh.sess || '{}').started; } catch (e) { return true; } })(),
            fresh.sess);
        check('【㉗】老版本遗留的 localStorage.gaSession 被自动清理', fresh.legacyGone === true, fresh);
        await page2.screenshot({ path: path.join(__dirname, 'test_screenshot_route_fresh_welcome.png') });
        await page2.close();

        // 4) 收尾：清掉当前页会话，别影响 ⑪ 收尾
        await page.evaluate(() => { sessionStorage.removeItem('gaSession'); localStorage.removeItem('gaSession'); });
    } catch (e) {
        check('【㉗】执行过程中出现异常', false, String((e && e.message) || e));
    }

    console.log("\n【⑪ 收尾】");
    check('整轮下来没有未捕获的 JS 异常', pageErrors.length === 0, pageErrors);
    await browser.close();

    console.log(`\n结果：${pass} PASS / ${fail} FAIL`);
    process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.log('测试异常:', e && e.stack || e); process.exit(1); });
