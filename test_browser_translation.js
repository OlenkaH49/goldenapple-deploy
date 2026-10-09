/**
 * test_browser_translation.js —— 真实浏览器端到端回归（句子/单词翻译链路）
 *
 * 覆盖本轮（2026-09-30）三个修复点：
 *   问题1 等待页不显示「已等待 X 秒」
 *   问题2 单词释义失败（wordsReady=false）时点词仍要弹卡；句子译文仍要能悬停
 *   问题3 点词后 3 秒内释义没回来 → 卡片内出现「🌐 本句翻译」按钮 → 点击显示该句译文
 *
 * 前置条件：
 *   ① 服务已启动：ACCESS_PASSWORD= PORT=3999 node server.js
 *   ② 本机有 Edge（用 playwright-core + channel:'msedge'，无需下载浏览器）
 *   ③ playwright-core 已安装（示例路径见 PW_MODULES）
 *
 * 运行：
 *   NODE_PATH="$PW_MODULES" node test_browser_translation.js [articleId]
 * 环境变量：
 *   PROBE_PORT  服务端口，默认 3999
 *   PW_MODULES  playwright-core 的 node_modules 路径
 */
const path = require('path');

const PW_MODULES = process.env.PW_MODULES || 'C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules';
const { chromium } = require(path.join(PW_MODULES, 'playwright-core'));

const PORT = process.env.PROBE_PORT || 3999;
const BASE = `http://127.0.0.1:${PORT}`;
const SRC_ARTICLE = process.argv[2] || 'upload_1790744976506';

let pass = 0, fail = 0;
function check(name, cond, extra) {
    if (cond) { pass++; console.log(`  PASS  ${name}`); }
    else { fail++; console.log(`  FAIL  ${name}${extra !== undefined ? ' | 实际: ' + extra : ''}`); }
}

(async () => {
    // 取一篇真实文章当素材（含 24 句译文 / 5 题），避免等 2 分钟的真实 AI 生成
    const real = await (await fetch(`${BASE}/api/article-status/${SRC_ARTICLE}`)).json();
    if (!real || !Array.isArray(real.sentences) || !real.sentences.length) {
        console.error(`素材文章 ${SRC_ARTICLE} 没有句子译文，无法回归。请传入一篇已完成且译文正常的文章 ID。`);
        process.exit(2);
    }
    console.log(`=== 素材：${SRC_ARTICLE} | 句子=${real.sentences.length} | 题目=${(real.questions || []).length} | 缓存词=${Object.keys(real.words || {}).length} ===`);

    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const logs = [];
    page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
    page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));

    await page.addInitScript(({ sentences, questions, content }) => {
        try { localStorage.setItem('accessPassword', 'probe'); } catch (e) {}
        // 释义锁（2026-10-07）：默认「猜词模式」会让悬停浮层只显示「先猜一猜」，本文件断言的是译文，播种查看模式
        try { localStorage.setItem('guessMode', 'off'); } catch (e) {}
        window.__waitingTexts = [];
        window.__hangingWordCalls = 0;
        let poll = 0;
        const origFetch = window.fetch.bind(window);
        const json = (obj, status) => Promise.resolve({
            ok: (status || 200) < 400, status: status || 200,
            json: () => Promise.resolve(obj), text: () => Promise.resolve(JSON.stringify(obj))
        });
        window.fetch = function (url, opts) {
            const u = String(url || '');
            const method = (opts && opts.method) || 'GET';
            if (u.indexOf('/api/upload-article') !== -1 && method === 'POST') {
                return json({ success: true, articleId: 'probe_article', status: 'pending' });
            }
            if (u.indexOf('/api/article-status/probe_article') !== -1) {
                poll += 1;
                if (poll === 1) {
                    return json({ status: 'processing', articleId: 'probe_article', title: '用户上传文章', level: 'middle', levelLabel: '初中',
                        words: null, wordsReady: false, sentences: null, sentencesReady: false, questions: null, questionsReady: false });
                }
                if (poll === 2) {
                    // 句子翻译成功、单词释义失败（用户上报的状态）
                    return json({ status: 'processing', articleId: 'probe_article', title: '用户上传文章', level: 'middle', levelLabel: '初中',
                        words: null, wordsReady: false, sentences: sentences, sentencesReady: true, questions: null, questionsReady: false });
                }
                return json({ status: 'processing', articleId: 'probe_article', title: '用户上传文章', level: 'middle', levelLabel: '初中',
                    words: null, wordsReady: false, sentences: sentences, sentencesReady: true, questions: questions, questionsReady: true });
            }
            // 模拟「释义查询很慢」：30 秒后才返回，确保能测到 3 秒按钮
            if (u.indexOf('/api/words/') !== -1) {
                window.__hangingWordCalls += 1;
                return new Promise(resolve => setTimeout(() => resolve(json({ definitions: [], source: 'cache', layer: 'none' })), 30000));
            }
            return origFetch(url, opts);
        };
        // 抓等待页文案（每次变化都记下来，用于断言「没有秒数」）
        document.addEventListener('DOMContentLoaded', () => {
            const el = document.getElementById('loadingMessage');
            if (!el) return;
            setInterval(() => { const t = el.textContent || ''; if (t && window.__waitingTexts[window.__waitingTexts.length - 1] !== t) window.__waitingTexts.push(t); }, 200);
        });
    }, { sentences: real.sentences, questions: real.questions, content: real.content });

    await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    await page.evaluate(() => { const o = document.getElementById('accessPasswordOverlay'); if (o) o.remove(); });

    // ---------- 走真实上传 → 等待页 → 轮询 → 阅读页 ----------
    await page.evaluate(({ content }) => {
        document.getElementById('uploadContent').value = content;
        document.getElementById('uploadTitle').value = '用户上传文章';
        return analyzeArticle();
    }, { content: real.content });

    await page.waitForTimeout(2600);
    console.log('\n【问题1】等待页文案不含「已等待 X 秒」');
    const waitingTexts = await page.evaluate(() => window.__waitingTexts);
    console.log('   抓到文案:', JSON.stringify(waitingTexts));
    check('等待页文案里没有「已等待」', waitingTexts.every(t => t.indexOf('已等待') === -1), JSON.stringify(waitingTexts));
    check('等待页文案里没有「N 秒」', waitingTexts.every(t => !/\d+\s*秒/.test(t)), JSON.stringify(waitingTexts));

    await page.waitForTimeout(4200);
    const afterEnter = await page.evaluate(() => ({
        screen: (document.querySelector('.screen.active') || {}).id,
        articleSentences: document.querySelectorAll('#readContent .article-sentence').length,
        sentencesReady: currentArticle && currentArticle.sentencesReady,
        wordsReady: currentArticle && currentArticle.wordsReady
    }));
    console.log('\n【前置】题目就绪后进入阅读页');
    console.log('  ', JSON.stringify(afterEnter));
    check('已进入阅读页', afterEnter.screen === 'readingPage', afterEnter.screen);
    check('句子已渲染成 .article-sentence（译文可悬停）', afterEnter.articleSentences > 0, afterEnter.articleSentences);

    console.log('\n【问题2】句子译文悬停仍然可用');
    const sen = await page.$('#readContent .article-sentence');
    const sb = await sen.boundingBox();
    await page.mouse.move(sb.x + 10, sb.y + sb.height / 2);
    await page.waitForTimeout(350);
    await page.mouse.move(sb.x + 40, sb.y + sb.height / 2 + 2);
    await page.waitForTimeout(3600);
    const hover = await page.evaluate(() => {
        const p = document.getElementById('sentenceHoverPanel');
        return { visible: p.classList.contains('visible'), translation: p.querySelector('.shp-translation').textContent };
    });
    check('悬停 3 秒后译文浮层可见', hover.visible === true);
    check('浮层里有译文文本', !!hover.translation, JSON.stringify(hover));

    console.log('\n【问题2】单词释义失败（wordsReady=false）时点词仍要弹卡');
    check('文章确实是释义未就绪状态', afterEnter.wordsReady === false, String(afterEnter.wordsReady));
    await page.evaluate(() => { const c = document.querySelector('.word-card'); if (c) c.remove(); });
    const span = await page.$('#readContent .word-span');
    const wb = await span.boundingBox();
    const targetWord = await page.evaluate(() => document.querySelector('#readContent .word-span').getAttribute('data-word'));
    await page.mouse.move(wb.x + wb.width / 2, wb.y + wb.height / 2);
    await page.waitForTimeout(150);
    await page.mouse.down();
    await page.waitForTimeout(60);
    await page.mouse.up();
    await page.waitForTimeout(600);
    const card = await page.evaluate(() => {
        const c = document.querySelector('.word-card');
        return { exists: !!c, text: c ? c.innerText.replace(/\n+/g, ' | ') : null };
    });
    check('点词后单词卡片弹出', card.exists === true, JSON.stringify(card));
    check('卡片里显示「正在查询语境释义」（说明后台在查 RAG）', /正在查询语境释义/.test(card.text || ''), card.text);

    console.log('\n【问题3】3 秒内释义没返回 → 卡片内出现「本句翻译」按钮');
    const btnBefore = await page.evaluate(() => {
        const b = document.querySelector('.word-card .wc-btn-sentence');
        return b ? b.style.display : '(无按钮节点)';
    });
    check('3 秒未到按钮还藏着', btnBefore === 'none', btnBefore);
    await page.waitForTimeout(3200);
    const btnAfter = await page.evaluate(() => {
        const c = document.querySelector('.word-card');
        const b = c ? c.querySelector('.wc-btn-sentence') : null;
        return { exists: !!b, display: b ? b.style.display : null, text: b ? b.textContent.trim() : null, cardStillOpen: !!c };
    });
    console.log('  ', JSON.stringify(btnAfter));
    check('卡片仍在（没被误关）', btnAfter.cardStillOpen === true);
    check('「本句翻译」按钮已显示', btnAfter.exists && btnAfter.display !== 'none', JSON.stringify(btnAfter));

    console.log('\n【问题3】点「本句翻译」→ 卡片内显示该句译文');
    await page.click('.word-card .wc-btn-sentence');
    await page.waitForTimeout(400);
    const shown = await page.evaluate(() => {
        const c = document.querySelector('.word-card');
        const box = c ? c.querySelector('.wc-st-box') : null;
        return {
            cardStillOpen: !!c,
            boxDisplay: box ? box.style.display : null,
            origin: box ? box.querySelector('.wc-st-origin').textContent : null,
            translation: box ? box.querySelector('.wc-st-text').textContent : null
        };
    });
    console.log('  ', JSON.stringify(shown));
    check('卡片没有被关闭', shown.cardStillOpen === true);
    check('译文区块已展开', shown.boxDisplay === 'block', String(shown.boxDisplay));
    check('显示了原文句子', !!shown.origin, String(shown.origin));
    check('显示了中文译文（非提示文案）', !!shown.translation && !/还没拿到译文|还没有句子译文/.test(shown.translation), String(shown.translation));

    // 译文应与后端 sentenceList 中对应句子的 translation 一致
    const expect = real.sentences.find(s => s.sentence && shown.origin && s.sentence.slice(0, 20) === shown.origin.slice(0, 20));
    check('译文与后端一致', !!(expect && expect.translation === shown.translation), `期望="${expect && expect.translation}" 实际="${shown.translation}"`);

    console.log('\n=== 浏览器报错 ===');
    const errs = logs.filter(l => /pageerror|\[error\]/i.test(l) && !/favicon|404/i.test(l));
    errs.slice(-8).forEach(l => console.log('  ' + l));
    if (!errs.length) console.log('  （无）');

    console.log(`\n结果：${pass} PASS / ${fail} FAIL`);
    await browser.close();
    process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('测试异常:', e && e.message); process.exit(1); });
