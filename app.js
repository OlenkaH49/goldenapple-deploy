// ==================== 内置文章（离线兜底 · 2026-10-06 降级） ====================
// 这 6 篇原本是前端**唯一**的文章来源（硬编码），导致用户上传的文章刷新页面就没了。
// 现在文章改为「从服务端分页加载」（见 loadArticlesPage / renderArticle / openArticle），
// 本数组只剩两个用途：
//   ① 服务端不可用（离线 / 后端挂了 / 没通过访问密码）时的兜底，保证界面不是空的；
//   ② 列表加载完成前的初始值，保证 `ARTICLES[0]` 这类同步引用不会踩空。
// 它们自带 words/questions（详情已在内存里），所以下面会被打上 detailLoaded=true，
// 不会被误判成「需要按需拉详情」而白跑一次网络。
const BUILTIN_ARTICLES = [
    {
        id: 'article_001',
        level: 'middle',
        levelLabel: '初中',
        title: 'A Trip to the Beach',
        description: 'A wonderful summer vacation with family.',
        article: 'Last summer, my family and I went on a trip to the beach. We drove for three hours to get there. When we arrived, the sun was shining brightly and the sky was a beautiful blue. My little sister immediately ran towards the water, while my dad set up our tent. I helped my mom unpack the picnic basket. We spent the whole day swimming, building sandcastles, and playing beach volleyball. In the evening, we had a barbecue on the beach. The food smelled amazing! As the sun set, we sat around the campfire and told stories. It was one of the best vacations I\'ve ever had.',
        words: {
            'vacation': '假期', 'beach': '海滩', 'drove': '驾驶', 'arrived': '到达',
            'shining': '照耀', 'beautiful': '美丽的', 'immediately': '立刻', 'ran': '跑',
            'towards': '朝向', 'set up': '搭建', 'tent': '帐篷', 'unpack': '打开包裹',
            'picnic': '野餐', 'basket': '篮子', 'swimming': '游泳', 'sandcastles': '沙堡',
            'volleyball': '排球', 'evening': '傍晚', 'barbecue': '烧烤', 'campfire': '篝火',
            'stories': '故事', 'whole day': '一整天', 'as the sun set': '当太阳落下时'
        },
        questions: [
            { type: 'DETAIL', question: 'How did the family get to the beach?', options: ['By plane', 'By car', 'By train', 'By boat'], answer_index: 1 },
            { type: 'DETAIL', question: 'What did the little sister do first?', options: ['Built a sandcastle', 'Ran towards the water', 'Helped unpack', 'Played volleyball'], answer_index: 1 },
            { type: 'DETAIL', question: 'What did they do in the evening?', options: ['Swam in the ocean', 'Built more sandcastles', 'Had a barbecue', 'Went shopping'], answer_index: 2 },
            { type: 'INFERENCE', question: 'How did the author feel about the trip?', options: ['It was boring', 'It was one of the best vacations', 'It was too short', 'It was expensive'], answer_index: 1 }
        ]
    },
    {
        id: 'article_002',
        level: 'middle',
        levelLabel: '初中',
        title: 'The Power of Music',
        description: 'Music\'s effects on mood and expression.',
        article: 'Music is an important part of many people\'s lives. It can make us happy, sad, or excited. Different types of music have different effects on our mood. For example, fast music with a strong beat can make us feel energetic and want to dance. Slow, soft music can help us relax and reduce stress. Music is also a form of expression. Musicians write songs to share their feelings and experiences with others. Some people learn to play musical instruments like the piano, guitar, or violin. Others enjoy singing in choirs or bands. No matter how we enjoy music, it has the power to connect people from all over the world.',
        words: {
            'power': '力量', 'effects': '效果', 'mood': '心情', 'expression': '表达',
            'excited': '兴奋的', 'types': '类型', 'fast': '快的', 'strong': '强烈的',
            'beat': '节拍', 'energetic': '精力充沛的', 'dance': '跳舞', 'slow': '慢的',
            'soft': '柔和的', 'relax': '放松', 'reduce': '减少', 'stress': '压力',
            'musicians': '音乐家', 'songs': '歌曲', 'share': '分享', 'feelings': '感受',
            'experiences': '经历', 'instruments': '乐器', 'piano': '钢琴', 'guitar': '吉他',
            'violin': '小提琴', 'singing': '唱歌', 'choirs': '合唱团', 'bands': '乐队',
            'connect': '连接', 'all over the world': '全世界'
        },
        questions: [
            { type: 'MAIN IDEA', question: 'What can music do to our mood?', options: ['Only make us happy', 'Only make us sad', 'Have different effects', 'Have no effect'], answer_index: 2 },
            { type: 'DETAIL', question: 'What kind of music can help us relax?', options: ['Fast music with strong beat', 'Slow, soft music', 'Loud rock music', 'Heavy metal music'], answer_index: 1 },
            { type: 'DETAIL', question: 'Why do musicians write songs?', options: ['To make money', 'To share feelings and experiences', 'To become famous', 'To practice their instruments'], answer_index: 1 },
            { type: 'MAIN IDEA', question: 'What is the main idea of this passage?', options: ['Music is only for musicians', 'Music has many forms and benefits', 'Music is too loud', 'Music is a waste of time'], answer_index: 1 }
        ]
    },
    {
        id: 'article_003',
        level: 'middle',
        levelLabel: '初中',
        title: 'Man\'s Best Friend',
        description: 'The loyalty and companionship of dogs.',
        article: 'Dogs are often called "man\'s best friend" and for good reason. They are loyal, friendly, and always ready to help. Dogs have been domesticated for thousands of years and have become an important part of many families. There are hundreds of different breeds of dogs, each with their own unique characteristics. Some dogs are small and good for apartment living, while others are large and need lots of space to run. Dogs can be trained to do many things, such as fetching balls, guarding homes, and even helping people with disabilities. Taking care of a dog is a big responsibility. They need food, water, exercise, and love every day. But the joy and companionship they bring make it all worth it.',
        words: {
            'loyal': '忠诚的', 'companionship': '陪伴', 'domesticated': '驯养的', 'breeds': '品种',
            'unique': '独特的', 'characteristics': '特征', 'apartment': '公寓', 'space': '空间',
            'trained': '训练', 'fetching': '取来', 'guarding': '守卫', 'disabilities': '残疾',
            'responsibility': '责任', 'food': '食物', 'water': '水', 'exercise': '锻炼',
            'love': '爱', 'joy': '快乐', 'thousands of years': '数千年', 'for good reason': '有充分的理由',
            'take care of': '照顾', 'make it worth it': '使一切值得'
        },
        questions: [
            { type: 'DETAIL', question: 'Why are dogs called \'man\'s best friend\'?', options: ['They are expensive', 'They are loyal and friendly', 'They can bark loud', 'They eat a lot'], answer_index: 1 },
            { type: 'DETAIL', question: 'How many breeds of dogs are there?', options: ['Only a few', 'Hundreds', 'Exactly 100', 'Thousands'], answer_index: 1 },
            { type: 'DETAIL', question: 'What is one thing dogs can be trained to do?', options: ['Drive cars', 'Cook food', 'Guard homes', 'Read books'], answer_index: 2 },
            { type: 'DETAIL', question: 'What do dogs need every day?', options: ['Only food', 'Food, water, exercise, and love', 'Just sleep', 'Expensive toys'], answer_index: 1 }
        ]
    },
    {
        id: 'article_004',
        level: 'high',
        levelLabel: '高中',
        title: 'The Concept of Time',
        description: 'Philosophical and scientific perspectives on time.',
        article: 'The concept of time has fascinated philosophers and scientists for centuries. In physics, time is considered a dimension, along with space, in which events occur in a non-reversible order. Einstein\'s theory of relativity revolutionized our understanding of time, showing that it is not absolute but depends on the observer\'s frame of reference. Time dilation, for example, means that time passes more slowly for objects moving at high speeds relative to stationary observers. This has been confirmed by experiments with atomic clocks on airplanes and satellites. In psychology, the perception of time varies depending on factors such as attention, emotion, and age. When we are engaged in an interesting activity, time seems to fly by, while when we are bored, it drags on. Understanding time is crucial not only for scientific progress but also for organizing our daily lives and making sense of our experiences.',
        words: {
            'concept': '概念', 'fascinated': '使着迷', 'philosophers': '哲学家', 'scientists': '科学家',
            'centuries': '世纪', 'physics': '物理学', 'dimension': '维度', 'events': '事件',
            'non-reversible': '不可逆的', 'order': '顺序', 'Einstein': '爱因斯坦', 'relativity': '相对论',
            'revolutionized': '彻底改变', 'absolute': '绝对的', 'observer': '观察者', 'frame of reference': '参考系',
            'time dilation': '时间膨胀', 'objects': '物体', 'high speeds': '高速', 'relative to': '相对于',
            'stationary': '静止的', 'confirmed': '证实', 'atomic clocks': '原子钟', 'airplanes': '飞机',
            'satellites': '卫星', 'psychology': '心理学', 'perception': '感知', 'factors': '因素',
            'attention': '注意力', 'emotion': '情绪', 'engaged': '参与', 'activity': '活动',
            'fly by': '飞逝', 'bored': '无聊的', 'drags on': '拖延', 'crucial': '关键的',
            'scientific progress': '科学进步', 'making sense of': '理解'
        },
        questions: [
            { type: 'DETAIL', question: 'What did Einstein\'s theory of relativity show about time?', options: ['Time is absolute', 'Time depends on the observer\'s frame of reference', 'Time only exists in space', 'Time is the same for everyone'], answer_index: 1 },
            { type: 'DETAIL', question: 'What is time dilation?', options: ['Time passing more slowly for moving objects', 'Time stopping completely', 'Time moving backwards', 'Time speeding up for everyone'], answer_index: 0 },
            { type: 'DETAIL', question: 'What affects our perception of time according to the passage?', options: ['Only age', 'Attention, emotion, and age', 'Weather conditions', 'The time of day'], answer_index: 1 },
            { type: 'MAIN IDEA', question: 'Why is understanding time important?', options: ['For scientific progress and organizing daily lives', 'Only for scientists', 'For making money', 'For predicting the future'], answer_index: 0 }
        ]
    },
    {
        id: 'article_005',
        level: 'high',
        levelLabel: '高中',
        title: 'The Human Brain',
        description: 'Exploring the complexity of the brain.',
        article: 'The human brain is one of the most complex and fascinating organs in the body. It is composed of billions of neurons that communicate with each other through electrical and chemical signals. The brain can be divided into several regions, each responsible for different functions. The cerebrum, the largest part, controls conscious thought, memory, and voluntary movements. The cerebellum coordinates balance and motor skills. The brainstem regulates basic life functions like breathing and heartbeat. Recent advances in neuroscience have revealed that the brain has remarkable plasticity, meaning it can reorganize itself by forming new neural connections throughout life. This is particularly evident in cases of brain injury, where undamaged areas can sometimes take over functions of damaged regions. Understanding the brain\'s structure and function is essential for developing treatments for neurological disorders and unlocking the mysteries of consciousness.',
        words: {
            'complex': '复杂的', 'fascinating': '迷人的', 'organs': '器官', 'composed': '组成',
            'billions': '数十亿', 'neurons': '神经元', 'communicate': '交流', 'electrical': '电的',
            'chemical': '化学的', 'signals': '信号', 'regions': '区域', 'responsible': '负责的',
            'functions': '功能', 'cerebrum': '大脑', 'conscious': '有意识的', 'thought': '思考',
            'memory': '记忆', 'voluntary': '自愿的', 'movements': '运动', 'cerebellum': '小脑',
            'coordinates': '协调', 'balance': '平衡', 'motor skills': '运动技能', 'brainstem': '脑干',
            'regulates': '调节', 'basic': '基本的', 'breathing': '呼吸', 'heartbeat': '心跳',
            'neuroscience': '神经科学', 'revealed': '揭示', 'remarkable': '显著的', 'plasticity': '可塑性',
            'reorganize': '重组', 'neural connections': '神经连接', 'throughout life': '一生',
            'evident': '明显的', 'brain injury': '脑损伤', 'undamaged': '未受损的', 'take over': '接管',
            'damaged': '受损的', 'structure': '结构', 'essential': '必要的', 'treatments': '治疗',
            'neurological disorders': '神经系统疾病', 'unlocking': '解开', 'mysteries': '奥秘',
            'consciousness': '意识'
        },
        questions: [
            { type: 'DETAIL', question: 'What is the brain composed of?', options: ['Billions of neurons', 'Muscle fibers', 'Blood vessels', 'Bone cells'], answer_index: 0 },
            { type: 'DETAIL', question: 'What does the cerebrum control?', options: ['Balance and motor skills', 'Conscious thought and memory', 'Breathing and heartbeat', 'Digestion'], answer_index: 1 },
            { type: 'DETAIL', question: 'What is brain plasticity?', options: ['The brain\'s ability to reorganize itself', 'The brain\'s rigid structure', 'The brain\'s size', 'The brain\'s color'], answer_index: 0 },
            { type: 'MAIN IDEA', question: 'Why is understanding the brain important?', options: ['For growing vegetables', 'For developing treatments for neurological disorders', 'For building computers', 'For predicting weather'], answer_index: 1 }
        ]
    },
    {
        id: 'article_006',
        level: 'high',
        levelLabel: '高中',
        title: 'Globalization',
        description: 'The interconnected world and its challenges.',
        article: 'Globalization has transformed the world into an interconnected network of economies, cultures, and societies. Advances in technology, particularly the internet and transportation, have made it easier than ever for goods, services, and information to flow across borders. Multinational corporations operate in multiple countries, creating global supply chains that span continents. Cultural exchange has also increased, with people around the world having access to foreign music, movies, and cuisine. However, globalization is not without its challenges. It has led to economic inequality, as wealthy nations and corporations often benefit more than developing ones. There are also concerns about cultural homogenization, where local traditions and languages may be replaced by global influences. Environmental issues such as pollution and resource depletion have become global problems requiring international cooperation. As the world becomes more connected, finding a balance between global integration and local preservation remains a key challenge for policymakers and citizens alike.',
        words: {
            'globalization': '全球化', 'transformed': '转变', 'interconnected': '相互连接的', 'network': '网络',
            'economies': '经济', 'cultures': '文化', 'societies': '社会', 'advances': '进步',
            'technology': '技术', 'particularly': '尤其', 'internet': '互联网', 'transportation': '交通',
            'goods': '商品', 'services': '服务', 'information': '信息', 'flow': '流动',
            'borders': '边界', 'multinational': '跨国的', 'corporations': '公司', 'operate': '运作',
            'global supply chains': '全球供应链', 'span': '跨越', 'continents': '大陆', 'cultural exchange': '文化交流',
            'increased': '增加', 'access': '访问', 'foreign': '外国的', 'music': '音乐',
            'movies': '电影', 'cuisine': '美食', 'challenges': '挑战', 'economic inequality': '经济不平等',
            'wealthy': '富裕的', 'nations': '国家', 'benefit': '受益', 'developing': '发展中的',
            'concerns': '担忧', 'cultural homogenization': '文化同质化', 'local traditions': '地方传统',
            'languages': '语言', 'replaced': '取代', 'global influences': '全球影响', 'environmental issues': '环境问题',
            'pollution': '污染', 'resource depletion': '资源枯竭', 'international cooperation': '国际合作',
            'balance': '平衡', 'global integration': '全球一体化', 'local preservation': '地方保护',
            'policymakers': '政策制定者', 'citizens': '公民', 'alike': '同样地'
        },
        questions: [
            { type: 'DETAIL', question: 'What has made globalization possible?', options: ['Decline in technology', 'Advances in technology like internet and transportation', 'Isolation policies', 'Natural disasters'], answer_index: 1 },
            { type: 'DETAIL', question: 'What is one challenge of globalization mentioned?', options: ['Increased cultural diversity', 'Economic inequality', 'Decreased trade', 'Less communication'], answer_index: 1 },
            { type: 'DETAIL', question: 'What is cultural homogenization?', options: ['Preserving local traditions', 'Replacing local traditions with global influences', 'Increasing language diversity', 'Protecting local cuisine'], answer_index: 1 },
            { type: 'MAIN IDEA', question: 'What is a key challenge mentioned in the passage?', options: ['Finding balance between global integration and local preservation', 'Stopping all international trade', 'Eliminating all technology', 'Closing borders completely'], answer_index: 0 }
        ]
    }
];

// ==================== 文章列表：从服务端分页加载（2026-10-06） ====================
// 内存里的文章集合。初值 = 内置兜底，之后由 loadArticlesPage() 用服务端数据替换/追加。
// 每项保证有「列表字段」（id/title/description/level/content…），
// 而详情字段（sentences/words/questions）只有 detailLoaded=true 时才保证齐全。
let ARTICLES = BUILTIN_ARTICLES.map(function (a) {
    return Object.assign({}, a, { source: a.source || 'preset', detailLoaded: true });
});

const ARTICLES_PAGE_SIZE = 10;      // 每页篇数（服务端上限 100）
let articlesPage = 0;               // 已加载到第几页（0 = 还没从服务端拿到过数据）
let articlesHasMore = true;         // 服务端是否还有下一页
let articlesLoading = false;        // 防重入：加载中不再发请求
let articlesTotal = 0;              // 服务端总篇数
let articlesFromServer = false;     // 是否已成功从服务端拿到数据（false = 现在用的是内置兜底）
const articleDetailInFlight = {};   // id → Promise，避免同一篇的详情被并发拉多次
const articleDetailAsked = {};      // id → true，记录「已拉过详情」（失败会复位，见 loadArticleDetail）
const articleDetailFailedAt = {};   // id → 上次拉取失败的时间戳，用于「失败退避」，避免服务挂了被反复打
const ARTICLE_DETAIL_RETRY_MS = 5000;

/** 这篇要不要去拉详情：已加载过 → 不要；刚失败过（5 秒内）→ 先不要，避免打爆后端 */
function shouldFetchArticleDetail(art) {
    if (!art) return false;
    if (art.detailLoaded) return false;
    if (articleDetailInFlight[art.id]) return false;
    const lastFail = articleDetailFailedAt[art.id] || 0;
    return (Date.now() - lastFail) > ARTICLE_DETAIL_RETRY_MS;
}

/** 服务端列表项 → 前端文章结构（字段一律给安全默认值，避免 undefined 进入渲染流程） */
function mapServerArticle(a) {
    return {
        id: a.id,
        title: a.title || '(无标题)',
        description: a.description || '',
        level: a.level || 'middle',
        levelLabel: a.levelLabel || '自定义',
        source: a.source,
        status: a.status,
        // 'partial' = 句子翻译失败（后端不再静默降级成 completed），带原因供阅读页提示
        sentencesError: a.sentencesError || null,
        createdAt: a.createdAt,
        // 服务端在列表里就告诉我们「这篇有译文」（sentences_length > 2）。
        // 有了这个信号，前端才能区分两种「译文为空」：
        //   ① 本来就没有译文（预置文章 / 历史上传）→ 浮层如实说「暂无翻译」
        //   ② 有译文、只是**详情还没加载回来** → 浮层说「译文加载中」，并触发补拉
        // 问题一（2026-10-07）就是 ② 被当成了 ①：「句子翻译成功（17 句）」但浮层「暂无翻译」。
        serverHasSentences: !!a.hasSentences,
        // 列表阶段只带正文；译文/释义/题目留空 → buildSentenceList() 自动走本地切句兜底
        article: a.content || '',
        words: {},
        sentences: [],
        questions: [],
        detailLoaded: false
    };
}

/**
 * 「服务端列表项」合并进「内存里的文章」——**不能直接用 Object.assign 盖**。
 *
 * 问题一（2026-10-07）的根因就在这里：
 * `/api/articles` 的列表项是**轻量版**（只有正文；sentences/words/questions 一律空壳，
 * detailLoaded=false）。用户此前点开过这篇文章、详情早已加载好，此后任何一次列表刷新
 * （首页重载 / 加载更多 / 下拉重试）都会把详情**原地冲掉**：
 *     ARTICLES[i] = Object.assign({}, 已加载详情的文章, 轻量列表项)
 *   → sentences 被改回 []、detailLoaded 被改回 false
 * 而列表末尾的补拉守卫是 `!articleDetailAsked[cur.id]` —— 用户点过一次之后它永远是 true，
 * 于是**永不补拉**。最终现象：后端日志「✅ 句子翻译成功（17 句）」，前端 `currentArticle.sentences`
 * 却是空的，`buildSentenceList()` 走本地切句兜底（译文全空）→ 悬停浮层「（暂无翻译）」。
 *
 * 现在的规则：详情已加载的文章，轻量字段（标题/正文/状态/时间）照常更新，
 * **重字段（译文/释义/题目/就绪标记）原样保留**，绝不用空壳覆盖。
 */
function mergeServerListItem(existing, item) {
    const merged = Object.assign({}, existing, item);
    if (existing && existing.detailLoaded) {
        merged.sentences = existing.sentences;
        merged.words = existing.words;
        merged.questions = existing.questions;
        merged.detailLoaded = true;
        merged.wordsReady = existing.wordsReady;
        merged.sentencesReady = existing.sentencesReady;
        merged.questionsReady = existing.questionsReady;
    }
    // 列表项没有详情，所以 hasSentences 取「或」，避免把已知的「这篇有译文」丢掉
    merged.serverHasSentences = !!(item.serverHasSentences || (existing && existing.serverHasSentences));
    return merged;
}

/**
 * 加载第 page 页文章列表。
 * @param {number} page
 * @param {{force?:boolean}} [opts] force=true 时忽略 hasMore（下拉重试用）
 */
async function loadArticlesPage(page, opts) {
    opts = opts || {};
    if (articlesLoading) {
        console.log(`📚 [文章] 第 ${page} 页请求被跳过：上一页还在加载中`);
        return false;
    }
    if (!opts.force && page > 1 && !articlesHasMore) {
        console.log('📚 [文章] 没有更多文章了（hasMore=false）');
        return false;
    }

    articlesLoading = true;
    updateLoadMoreIndicator();
    const t0 = Date.now();
    try {
        const res = await apiGet('/api/articles?page=' + page
            + '&pageSize=' + ARTICLES_PAGE_SIZE + '&withContent=1');
        const items = (res && res.items) || [];
        const mapped = items.map(mapServerArticle);

        // 首页重载：整表替换（丢掉内置兜底 + 已从服务端删除的），
        // 但**先留一份快照**，好把「已加载好的详情」搬回去（旧实现直接清空，
        // 于是重载后所有文章的译文/释义/题目都被打回空壳 —— 问题一的根因）。
        const snapshot = {};
        if (page === 1) {
            ARTICLES.forEach(function (x) { snapshot[x.id] = x; });
            ARTICLES.length = 0;
        }
        let added = 0;
        let preserved = 0;
        let dropped = 0;
        for (const a of mapped) {
            const i = ARTICLES.findIndex(x => x.id === a.id);
            const prev = (i >= 0) ? ARTICLES[i] : snapshot[a.id];
            const mergedItem = prev ? mergeServerListItem(prev, a) : a;
            if (i >= 0) ARTICLES[i] = mergedItem;
            else ARTICLES.push(mergedItem);
            if (prev && prev.detailLoaded) preserved++;
            else if (prev) dropped++;
            else added++;
        }

        articlesPage = res.page || page;
        articlesHasMore = !!res.hasMore;
        articlesTotal = res.total || ARTICLES.length;
        articlesFromServer = true;

        console.log(`📚 [文章] 第 ${articlesPage} 页加载完成（${Date.now() - t0}ms）| 本页 ${items.length} 篇（新增 ${added}）`
            + ` | 内存共 ${ARTICLES.length} 篇 / 服务端共 ${articlesTotal} 篇 | 共 ${res.totalPages} 页 | 还有更多=${articlesHasMore}`
            + ` | 保留已加载详情 ${preserved} 篇${dropped ? `（另有 ${dropped} 篇仍是轻量壳）` : ''}`);

        // 已经在阅读页 → 选择器要跟着更新，新加载的文章要能点到
        const reading = document.getElementById('readingPage');
        if (reading && reading.classList.contains('active')) {
            renderArticleSelector(currentArticle ? currentArticle.id : null, true);
        }

        // 边界：如果用户此刻正读着某一篇、而这篇在内存里仍是「未加载详情」的轻量壳
        // （典型：先点了内置兜底的 article_001，紧接着服务端首页才回来），
        // 这里顺手补拉一次详情，否则要等用户再点一次才会补齐。
        // ⚠️ 不再用 `!articleDetailAsked[id]` 当闸门（2026-10-07）：那是一次性开关，
        // 用户点过一次就永远为 true，一旦详情因超时/抖动失败，这篇就**永久**停在空壳状态 ——
        // 与「列表刷新把详情冲掉」叠加，就是「后端有译文、前端永远『暂无翻译』」。
        // 现在改用失败退避（shouldFetchArticleDetail），失败 5 秒后允许自动重试。
        if (currentArticle) {
            const cur = ARTICLES.find(x => x.id === currentArticle.id);
            if (cur && shouldFetchArticleDetail(cur)) {
                articleDetailAsked[cur.id] = true;
                console.log(`📚 [文章] 列表刷新后当前文章（${cur.id}）仍是未加载详情的轻量壳 → 自动补拉一次`);
                loadArticleDetail(cur.id).then(function (full) {
                    if (full && currentArticle && currentArticle.id === full.id) renderArticle(full.id);
                });
            }
        }
        return true;
    } catch (e) {
        console.error(`📚 [文章] 第 ${page} 页加载失败，继续用${articlesFromServer ? '已加载的数据' : '内置兜底文章'}:`,
            (e && e.message) || e);
        return false;
    } finally {
        articlesLoading = false;
        updateLoadMoreIndicator();
    }
}

function loadMoreArticles() {
    return loadArticlesPage(articlesPage + 1);
}

/**
 * 合并「内置教材词表」与服务端词表（以内置优先）。
 *
 * 为什么需要：预置文章的内置词表是**人工准备的教材释义**（vacation=假期），
 * 比服务端从 word_cache 提取的通用释义更贴这篇文章。改成服务端加载后不能把它弄丢——
 * 实测 article_001 的 vacation / immediately / sandcastles / campfire **都不在 word_cache 里**，
 * 不合并的话这些词就只剩词典层的通用义项了（体验降级）。
 */
function mergeBuiltinWords(id, serverWords) {
    const builtin = BUILTIN_ARTICLES.find(function (b) { return b.id === id; });
    if (!builtin || !builtin.words) return serverWords || {};
    const serverCount = Object.keys(serverWords || {}).length;
    const merged = Object.assign({}, serverWords || {}, builtin.words);   // 内置覆盖同名，服务端补充其余
    const total = Object.keys(merged).length;
    if (total > serverCount) {
        console.log(`📚 [文章详情] ${id} 合并内置教材词表：服务端 ${serverCount} 个 + 内置补 ${total - serverCount} 个 → 共 ${total} 个`);
    }
    return merged;
}

/**
 * 按需加载单篇文章详情（正文 + 译文 + 释义 + 题目）。
 * 同一篇并发调用共用同一个 Promise（articleDetailInFlight）。
 */
function loadArticleDetail(id) {
    if (!id) return Promise.resolve(null);
    if (articleDetailInFlight[id]) return articleDetailInFlight[id];

    const p = (async function () {
        try {
            const d = await apiGet('/api/article/' + encodeURIComponent(id));
            if (!d || !d.id) throw new Error('详情响应为空');
            const prevEntry = ARTICLES.find(x => x.id === id);
            const full = {
                id: d.id,
                title: d.title || '(无标题)',
                description: d.description || '',
                level: d.level || 'middle',
                levelLabel: d.levelLabel || '自定义',
                source: d.source,
                status: d.status,
                sentencesError: d.sentencesError || null,
                // 详情本身就说明「译文存不存在」，所以这里以详情的长度为准
                serverHasSentences: Array.isArray(d.sentences) && d.sentences.length > 0,
                article: d.article || '',
                words: mergeBuiltinWords(d.id, d.words || {}),
                sentences: d.sentences || [],
                questions: d.questions || [],
                detailLoaded: true,
                // ★ 2026-10-08：把「服务端还在生成中」如实带进来。
                //   否则「详情里 sentences=[]」会被当成「这篇本来就没有译文」，
                //   浮层写「还没生成译文」并配一个指路到不存在按钮的提示（问题一/问题二）。
                analyzing: (d.status === 'processing' || d.status === 'pending'),
                wordsReady: (d.status !== 'processing' && d.status !== 'pending'),
                sentencesReady: (d.status !== 'processing' && d.status !== 'pending') && Array.isArray(d.sentences) && d.sentences.length > 0,
                questionsReady: (d.status !== 'processing' && d.status !== 'pending') && Array.isArray(d.questions) && d.questions.length > 0
            };
            if (prevEntry && prevEntry.status && prevEntry.status !== full.status) {
                console.log(`📚 [文章详情] ${id} 状态有更新：${prevEntry.status} → ${full.status}`);
            }
            const i = ARTICLES.findIndex(x => x.id === id);
            if (i >= 0) ARTICLES[i] = full; else ARTICLES.push(full);
            // ★ 2026-10-08 关键修复：ARTICLES[i] 被替换成了**新对象**，但 currentArticle 只是
            //   一个「指向某个对象的引用」—— 不同步的话它会继续指向被丢弃的旧对象，
            //   于是「applyPartialProgress 更新了 ARTICLES 里的新对象，而渲染读的是 currentArticle 旧对象」
            //   两边数据分叉：译文明明回填了，正文里却还是空的（问题一在测试里就是这么复现的）。
            if (currentArticle && currentArticle.id === id && currentArticle !== full) {
                console.log(`🔗 [文章详情] ${id} 详情替换了内存条目 → 同步 currentArticle 引用（避免与新对象分叉）`);
                currentArticle = full;
            }
            delete articleDetailFailedAt[id];

            console.log(`📚 [文章详情] 按需加载 ${id} | 正文 ${full.article.length} 字 | 译文 ${full.sentences.length} 句`
                + ` | 文章词表 ${Object.keys(full.words || {}).length} 个 | 题目 ${full.questions.length} 道`
                + (full.sentencesError ? ` | ⚠️ 句子翻译失败：${full.sentencesError}` : '')
                + (full.sentences.length === 0 ? '（无译文 → 句子走本地切句兜底）' : ''));
            if (full.sentences.length === 0 && full.serverHasSentences === undefined) {
                // 服务端列表说这篇有译文，但详情里是空的 → 值得记一笔（数据层面不一致）
                console.warn(`📚 [文章详情] ${id} 详情里译文为空 —— 若列表标记 hasSentences=true 则属数据不一致`);
            }
            return full;
        } catch (e) {
            console.error(`📚 [文章详情] 加载失败 ${id}:`, (e && e.message) || e);
            // 复位「已问过」标记 + 记下失败时间：
            // 旧实现里 articleDetailAsked[id] 一旦置 true 就永不复位，一次瞬时失败会把这篇
            // **永久**钉在「只有正文、没有译文」的状态 —— 用户看到的是浮层永远「暂无翻译」，
            // 而后端日志一切正常（问题一）。
            delete articleDetailAsked[id];
            articleDetailFailedAt[id] = Date.now();
            console.warn(`📚 [文章详情] ${id} 拉取失败 → 已复位 articleDetailAsked，${ARTICLE_DETAIL_RETRY_MS / 1000}s 后允许自动重试`);
            return null;
        } finally {
            delete articleDetailInFlight[id];
        }
    })();

    articleDetailInFlight[id] = p;
    return p;
}

/** 渲染阅读页顶部的文章选择器：只渲染「已加载的页」+「加载更多」，不再一次性铺全部文章 */
function renderArticleSelector(activeId, quiet) {
    const box = document.getElementById('articleSelector');
    if (!box) return;

    const cards = ARTICLES.map(function (a) {
        return `
        <div onclick="openArticle('${a.id}')" style="flex-shrink:0;background:white;padding:0.8rem 1rem;border-radius:0.75rem;cursor:pointer;border:2px solid ${a.id === activeId ? 'var(--primary)' : 'transparent'};">
            <div style="font-size:0.7rem;color:var(--gray);margin-bottom:0.25rem;">${a.levelLabel || ''}</div>
            <div style="font-size:0.85rem;font-weight:600;">${a.title || ''}</div>
        </div>`;
    }).join('');

    const tail = articlesHasMore
        ? `<div id="articleLoadMoreBtn" onclick="loadMoreArticles()"
               style="flex-shrink:0;display:flex;align-items:center;justify-content:center;min-width:88px;padding:0.8rem 1rem;border-radius:0.75rem;cursor:pointer;border:2px dashed var(--primary);color:var(--primary);font-size:0.85rem;font-weight:600;background:transparent;">
               ＋ 加载更多
           </div>`
        : `<div style="flex-shrink:0;display:flex;align-items:center;padding:0.8rem 1rem;color:var(--gray);font-size:0.8rem;">
               已全部加载（${ARTICLES.length} 篇）
           </div>`;

    box.innerHTML = cards + tail;
    if (!quiet) {
        console.log(`📚 [文章选择器] 渲染 ${ARTICLES.length} 篇（已加载到第 ${articlesPage} 页）| 还有更多=${articlesHasMore}`
            + ` | 来源=${articlesFromServer ? '服务端' : '内置兜底'}`);
    }
}

/** 「加载更多」按钮的忙碌态（避免连点） */
function updateLoadMoreIndicator() {
    const btn = document.getElementById('articleLoadMoreBtn');
    if (!btn) return;
    btn.textContent = articlesLoading ? '加载中…' : '＋ 加载更多';
    btn.style.opacity = articlesLoading ? '0.6' : '1';
}

const WORDBOOKS = [
    { id: 'wb_1', name: '初中词汇', icon: '📚', totalWords: 1500, learned: 320, mastered: 180, level: 'middle' },
    { id: 'wb_2', name: '高中词汇', icon: '📖', totalWords: 3500, learned: 120, mastered: 45, level: 'high' },
    { id: 'wb_3', name: '中考核心', icon: '🎯', totalWords: 600, learned: 450, mastered: 320, level: 'middle' },
    { id: 'wb_4', name: '高考核心', icon: '💎', totalWords: 1200, learned: 80, mastered: 25, level: 'high' },
    { id: 'wb_5', name: '日常会话', icon: '💬', totalWords: 500, learned: 200, mastered: 150, level: 'a2' },
    { id: 'wb_6', name: '商务英语', icon: '💼', totalWords: 800, learned: 50, mastered: 10, level: 'c1' }
];

let currentArticle, collectedWords = [], quizAnswers = [];
let sessionReadArticleIds = new Set();   // 本次会话阅读过的文章 ID（结算页「阅读文章数」）
let sessionCollectedList = [];           // 本次会话收藏的单词 [{ word, meaning }]（结算页「收藏单词数/列表」）
let lastQuizResult = null;               // 最近一次答题结果 { correct, total, accuracy }（结算页「答题正确率」）
let userData = { collectedWords: [], level: 'A2', streak: 0, lastDate: null, masteredCount: 0 };
let currentFilter = 'all';
let currentWordCard = null;
let currentWordCardKey = null; // 当前词卡对应的「词+句」指纹，用于后台精修回来后原地刷新（不误刷别的词）
let currentWordCardData = null; // 当前词卡的完整数据：拆词结果异步回来时用它原地重绘（问题二）
// 注：2026-10-05 移除了卡片内「🌐 本句翻译」按钮（含 3 秒计时器）。
// 句子翻译改由「悬停原句 3 秒 → 浮层显示」这条主动触发路径承担，见 buildSentenceList / showSentenceHoverPanel。
let isTranslationsVisible = false;
let analysisAbortController = null;
let analyzePollToken = 0; // 轮询取消令牌：手动降级/取消时自增，使旧轮询失效
let awaitingQuestionReady = false; // true = 停在等待页，题目（或降级/超时）就绪后才允许进入阅读页

// 拖拽相关全局变量
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;
let currentDragData = null;  // 当前拖拽的单词数据
let sortPanelSortedWords = [];  // 分类面板中已整理的单词
let sortPanelArticleId = null;  // 分类面板当前筛选的文章ID（null = 不按文章限定）
// 2026-10-08：结算页「📋 去分类待学单词（N）」打开的面板只列**本次会话**收藏的待分类词。
// 面板最小化后要能原样恢复，所以用这个标记记住「本次面板是会话范围」而不是「全部」。
let sortPanelSessionOnly = false;
// 2026-10-08：点「完成学习」时若还有待分类，先开整理面板；面板关闭后据此自动进总结页
let summaryAfterSort = false;

// ==================== 后端 API 调用层 ====================
// 数据持久化在 SQLite 数据库（user_words 表），userData.collectedWords 作为运行时镜像
const API_BASE = (window.location.protocol === 'file:') ? 'http://localhost:3000' : (window.location.origin || 'http://localhost:3000');

function getUsername() {
    return (userData && userData.userName) ? userData.userName : 'golden-apple-user';
}

// ==================== 访问密码 ====================
const ACCESS_PASSWORD_STORAGE_KEY = 'accessPassword';

function getAccessPassword() {
    try { return localStorage.getItem(ACCESS_PASSWORD_STORAGE_KEY) || ''; } catch (e) { return ''; }
}

function setAccessPassword(pwd) {
    try {
        if (pwd) localStorage.setItem(ACCESS_PASSWORD_STORAGE_KEY, pwd);
        else localStorage.removeItem(ACCESS_PASSWORD_STORAGE_KEY);
    } catch (e) {}
}

let activePasswordPrompt = null;

// 向后端校验密码：正确返回 true，错误返回 false
async function verifyPasswordOnServer(pwd) {
    try {
        const r = await fetch(API_BASE + '/api/verify-password', {
            headers: { 'x-access-password': pwd, 'x-username': getUsername() }
        });
        console.log(`🔐 [前端] 校验密码请求 /api/verify-password → status ${r.status}`);
        return r.status === 200;
    } catch (e) {
        console.error('🔐 [前端] 校验密码请求失败:', (e && e.message) || e);
        return false;
    }
}

// 弹出密码输入框，校验通过后返回密码字符串（错误则留在弹窗提示）
function promptAccessPassword(errorMsg) {
    const existing = document.getElementById('accessPasswordOverlay');
    if (existing) existing.remove();

    return new Promise(function(resolve) {
        const overlay = document.createElement('div');
        overlay.id = 'accessPasswordOverlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(35,45,60,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
        overlay.innerHTML = `
            <div style="background:#fff;border-radius:1.1rem;padding:1.6rem 1.8rem;width:330px;max-width:92vw;box-shadow:0 12px 40px rgba(0,0,0,0.25);">
                <div style="font-size:1.1rem;font-weight:700;color:#333;margin-bottom:0.35rem;">🔒 访问密码</div>
                <div style="font-size:0.85rem;color:#888;margin-bottom:1.1rem;">请输入访问密码以进入「金苹果之旅」</div>
                <input id="accessPasswordInput" type="password" placeholder="请输入密码" style="width:100%;box-sizing:border-box;padding:0.7rem 0.85rem;border:1px solid #ddd;border-radius:0.65rem;font-size:0.98rem;margin-bottom:0.7rem;outline:none;" />
                <div id="accessPasswordError" style="color:#E5484D;font-size:0.82rem;min-height:1.05rem;margin-bottom:0.6rem;">${errorMsg || ''}</div>
                <button id="accessPasswordSubmit" style="width:100%;padding:0.72rem;background:#6B9B37;color:#fff;border:none;border-radius:0.65rem;font-size:0.98rem;font-weight:600;cursor:pointer;">进入</button>
            </div>
        `;
        document.body.appendChild(overlay);

        const input = overlay.querySelector('#accessPasswordInput');
        const btn = overlay.querySelector('#accessPasswordSubmit');
        const errEl = overlay.querySelector('#accessPasswordError');

        async function submit() {
            const v = input.value.trim();
            if (!v) { errEl.textContent = '请输入密码'; return; }
            btn.disabled = true;
            btn.textContent = '验证中...';
            const ok = await verifyPasswordOnServer(v);
            if (ok) {
                overlay.remove();
                resolve(v);
            } else {
                btn.disabled = false;
                btn.textContent = '进入';
                errEl.textContent = '密码错误，请重新输入';
                input.value = '';
                input.focus();
            }
        }
        btn.addEventListener('click', submit);
        input.addEventListener('keydown', function(e) { if (e.key === 'Enter') submit(); });
        setTimeout(function() { input.focus(); }, 0);
    });
}

// 确保已取得访问密码；force 时清空旧密码并重弹
function ensureAccessPassword(opts) {
    opts = opts || {};
    const stored = getAccessPassword();
    if (!opts.force && stored) return Promise.resolve(stored);
    if (opts.force) setAccessPassword('');
    if (activePasswordPrompt) return activePasswordPrompt;
    activePasswordPrompt = promptAccessPassword(opts.errorMsg).then(function(pwd) {
        setAccessPassword(pwd);
        activePasswordPrompt = null;
        return pwd;
    }).catch(function(e) {
        activePasswordPrompt = null;
        throw e;
    });
    return activePasswordPrompt;
}

// 统一请求：加 x-access-password 头，401 时重弹密码框并重试
async function request(path, opts) {
    const method = opts.method || 'GET';
    const headers = Object.assign({ 'x-username': getUsername() }, opts.headers || {});
    const body = opts.body !== undefined ? JSON.stringify(opts.body) : undefined;
    if (body !== undefined && !headers['Content-Type']) headers['Content-Type'] = 'application/json';

    let token = await ensureAccessPassword();
    headers['x-access-password'] = token;
    console.log(`🌐 [前端请求] ${method} ${path} | 携带密码头: ${!!token} | 密码长度: ${token.length}`);

    let r = await fetch(API_BASE + path, { method: method, headers: headers, body: body });
    console.log(`🌐 [前端响应] ${method} ${path} → status ${r.status}`);
    while (r.status === 401) {
        token = await ensureAccessPassword({ force: true, errorMsg: '密码错误，请重新输入' });
        headers['x-access-password'] = token;
        console.log(`🌐 [前端重试] ${method} ${path} | 携带密码头: ${!!token} | 密码长度: ${token.length}`);
        r = await fetch(API_BASE + path, { method: method, headers: headers, body: body });
        console.log(`🌐 [前端响应] ${method} ${path} → status ${r.status}`);
    }
    return r;
}

async function apiGet(path) {
    const r = await request(path, { method: 'GET' });
    if (!r.ok) throw new Error('GET ' + path + ' 失败: ' + r.status);
    return r.json();
}

async function apiPost(path, body) {
    const r = await request(path, { method: 'POST', body: body || {} });
    if (!r.ok) throw new Error('POST ' + path + ' 失败: ' + r.status);
    return r.json();
}

async function apiPut(path, body) {
    const r = await request(path, { method: 'PUT', body: body || {} });
    if (!r.ok) throw new Error('PUT ' + path + ' 失败: ' + r.status);
    return r.json();
}

// DELETE：body 走 query 传递（取消收藏用 —— 见 server.js DELETE /api/collect-word）
async function apiDelete(path, query) {
    const qs = query ? ('?' + Object.keys(query)
        .filter(k => query[k] !== undefined && query[k] !== null && query[k] !== '')
        .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(query[k]))
        .join('&')) : '';
    const r = await request(path + qs, { method: 'DELETE' });
    if (!r.ok) throw new Error('DELETE ' + path + ' 失败: ' + r.status);
    return r.json();
}

// 从后端同步 user_words 到本地缓存（userData.collectedWords 作为运行时镜像）
async function syncUserWordsFromServer() {
    try {
        const words = await apiGet('/api/user-words?status=all');
        let dictFilled = 0;
        userData.collectedWords = (words || []).map(function(w) {
            // 用 articleId 找到对应文章，补全 article 标题和 level（用于分组显示）
            const art = ARTICLES.find(a => a.id === w.articleId);
            // 后端已经做过释义兜底（meaning = 存库值或本地三层补全值）；这里再兜一层空值判断，
            // 顺便把后端给的 dictionary（音标 + 全部义项）灌进词典缓存，单词本可以直接用。
            const meaning = (w.meaning || w.definition || '').trim();
            if (w.dictionary && w.word) dictionaryCache[String(w.word).toLowerCase()] = w.dictionary;
            if (w.meaningSource && w.meaningSource !== 'stored') dictFilled++;
            return {
                id: w.id,
                word: w.word,
                meaning: meaning,
                definition: w.definition,
                meaningSource: w.meaningSource || (meaning ? 'stored' : null),
                sentence: w.sentence,
                articleId: w.articleId,
                article: art ? art.title : (w.articleId || '未知文章'),
                level: art ? art.level : 'middle',
                paragraphIndex: w.paragraphIndex,
                sentenceIndex: w.sentenceIndex,
                status: w.status,
                knowledge: w.knowledge,
                collectedAt: w.collectedAt,
                // 2026-10-09：复习（Review Words）要按 next_review_at 判「今天到期没」，
                // 原来这个字段在后端返回了（server.js nextReviewAt）但前端没接，白丢了。
                nextReviewAt: w.nextReviewAt || null
            };
        });
        saveData();
        console.log('✅ 同步 ' + userData.collectedWords.length + ' 个收藏单词'
            + (dictFilled ? `（其中 ${dictFilled} 条的释义由本地词典层补全，不再显示「暂无释义」）` : ''));
    } catch (e) {
        console.warn('⚠️ 同步 user-words 失败（离线模式可用本地缓存）:', e.message);
    }
}

// 启动时后端初始化：迁移本地数据 + 打卡 + 拉取收藏
async function initBackendSync() {
    try {
        // 1. 首次升级时迁移 localStorage 旧数据到数据库
        if (userData.collectedWords.length > 0 && !userData.migrated) {
            await apiPost('/api/migrate', {
                collectedWords: userData.collectedWords,
                streak: userData.streak,
                lastDate: userData.lastDate,
                level: userData.level,
                userName: userData.userName
            });
            userData.migrated = true;
            saveData();
            console.log('✅ 本地数据已迁移到数据库');
        }
        // 2. 打卡（更新 users.streak）
        const checkIn = await apiPost('/api/check-in', {});
        if (checkIn && checkIn.streak !== undefined) {
            userData.streak = checkIn.streak;
            userData.lastDate = checkIn.lastActive;
            if (checkIn.level) userData.level = checkIn.level;
            saveData();
        }
        // 3. 拉取数据库收藏单词到本地缓存
        await syncUserWordsFromServer();
        // 4. 若当前在主界面，刷新统计
        if (document.getElementById('dashboardPage') &&
            document.getElementById('dashboardPage').classList.contains('active')) {
            renderMain();
        }
        updateCollectBadge();
    } catch (e) {
        console.warn('⚠️ 后端同步失败（离线模式仍可用）:', e.message);
    }
}

function loadData() {
    const saved = localStorage.getItem('gaUserData');
    if (saved) userData = JSON.parse(saved);
}

function saveData() {
    localStorage.setItem('gaUserData', JSON.stringify(userData));
}

function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.style.opacity = 1;
    setTimeout(() => t.style.opacity = 0, 2000);
}

// ==================== 会话保持 + 浏览器历史（返回键） ====================
// 2026-10-09 新增；同日把会话的存储介质从 localStorage 改成 **sessionStorage（标签页级）**。
//   ① 刷新页面被打回欢迎页（用户口中的「登录页」）——刷新前把「已开始 + 当前屏 + 当前文章」
//      记进会话，启动时据此还原；顺带把用户身份（userName）一起恢复，
//      否则刷新后 getUsername() 会退回默认用户，x-username 头一变拉到的就是别人的收藏。
//   ② 浏览器返回键直接退出应用——SPA 从不压历史，栈里只有一条 → 一按返回就离开本站。
//      现在每切一次屏就 pushState（带上 gaDepth 深度），返回键即在应用内回退；
//      退到最根部的屏时第一次不退出，2.5 秒内再按一次才真正退出。
//
// ⚠️ 为什么改用 sessionStorage（2026-10-09 用户报障后修正）：
//    localStorage 是**永久 + 跨标签**的。只要用户曾经点进过阅读页，之后**每一次「进网页」**
//    （新开标签、重开浏览器、直接输网址、隔天再访问）都会被那条旧会话劫持 → 直接落到阅读页，
//    欢迎页 / Dashboard 全被跳过 —— 在用户眼里就是「路由坏了」。见 DOMContentLoaded 里的清理。
//    sessionStorage 只在**当前标签页存活期间**有效：
//      · F5 刷新 / 应用内前进后退 → 会话还在 → 仍停在原页（保留 ① 的收益）
//      · 新标签 / 重开浏览器 / 全新访问 → 全新会话 → 回到欢迎页（满足「第一次访问 → 欢迎页」）
const SESSION_KEY = 'gaSession';

/**
 * 会话存储介质：优先 sessionStorage（标签页级）。
 * 取不到（无痕、被禁用、无头沙箱）时返回 null → 退化为「不做会话保持」，
 * 每次访问都从欢迎页开始。**绝不回退到 localStorage**，否则又变成永久记住、重新劫持首访。
 */
function sessionStore() {
    try { if (typeof sessionStorage !== 'undefined' && sessionStorage) return sessionStorage; } catch (e) {}
    try { if (typeof window !== 'undefined' && window.sessionStorage) return window.sessionStorage; } catch (e) {}
    return null;
}

/** 安全读会话（无痕 / 被禁用时返回 {}） */
function readSession() {
    try {
        const store = sessionStore();
        if (!store) return {};
        const raw = store.getItem(SESSION_KEY);
        if (!raw) return {};
        const obj = JSON.parse(raw);
        return (obj && typeof obj === 'object') ? obj : {};
    } catch (e) { return {}; }
}

/** 增量写会话；失败只记日志，不影响主流程 */
function patchSession(patch) {
    try {
        const store = sessionStore();
        if (!store) return null;
        const next = Object.assign(readSession(), patch || {});
        store.setItem(SESSION_KEY, JSON.stringify(next));
        return next;
    } catch (e) {
        console.warn('🔒 [会话] 写入失败：' + ((e && e.message) || e));
        return null;
    }
}

/** 清空会话（强制全新开始 / 回到欢迎页时用） */
function clearSession() {
    try { const store = sessionStore(); if (store) store.removeItem(SESSION_KEY); } catch (e) {}
}

/** 读地址栏查询串 / 哈希（无头沙箱里可能没有，返回空串） */
function locationSearch() {
    try { return (typeof window !== 'undefined' && window.location && window.location.search) || ''; } catch (e) { return ''; }
}
function locationHash() {
    try { return (typeof window !== 'undefined' && window.location && window.location.hash) || ''; } catch (e) { return ''; }
}

/**
 * 调试 / 兜底开关：访问时带 `?fresh=1`（或 `#fresh`）→ 丢弃会话，强制从欢迎页开始。
 * 用途：被旧会话「劫持」时不必手动清浏览器缓存，改一下网址即可复位。
 */
function wantsFreshStart() {
    if (/(?:^|[?&])fresh=1(?:&|$)/.test(String(locationSearch() || ''))) return true;
    return String(locationHash() || '').toLowerCase().indexOf('fresh') >= 0;
}

let lastScreenId = '';            // 最近一次展示的屏（根守卫 / 二次返回要用）
let currentHistoryScreen = '';    // 当前浏览器历史条目对应的屏（同屏重绘时据此不重复压栈）
let historyBooted = false;        // 首次 replaceState 之后才允许 pushState
let suppressHistoryPush = false;  // 历史回退触发的内部跳转不要再压栈
let rootScreenId = '';            // 历史根条目对应的屏（一般是 dashboardPage / startingPage）
let pushedScreens = [];           // 与 depth 对齐：pushedScreens[d-1] = 第 d 条历史对应的屏

/** 浏览器是否支持 History API（无头测试的 window 桩没有 history，会走 false 分支） */
function historySupported() {
    return typeof window !== 'undefined' && !!window.history
        && typeof window.history.pushState === 'function'
        && typeof window.history.replaceState === 'function';
}

/** 当前历史条目的深度（根条目 = 0，应用自己压进去的第一条 = 1） */
function currentHistoryDepth() {
    if (!historySupported()) return 0;
    const st = window.history.state;
    return (st && Number(st.gaDepth)) || 0;
}

function pushScreenHistory(id) {
    if (!historySupported() || !historyBooted || suppressHistoryPush) return;
    try {
        const depth = pushedScreens.length + 1;
        window.history.pushState({ gaScreen: id, gaDepth: depth }, '', '#' + id);
        pushedScreens.push(id);
        currentHistoryScreen = id;
        console.log('🧭 [导航] pushState → ' + id + '（depth ' + depth + '）');
    } catch (e) {
        console.warn('🧭 [导航] pushState 失败：' + ((e && e.message) || e));
    }
}

/** 回到历史栈里已经存在的屏（含根屏）—— 不再压新条目，否则浏览器返回键会「前进」 */
function goBackToHistory(id) {
    if (!historySupported() || !historyBooted) return false;
    let delta = 0;
    const idx = pushedScreens.lastIndexOf(id);
    // 换算成浏览器条目差：条目 0/1 是根与根副本，depth d 对应条目下标 d+1；
    // 当前在 pushedScreens.length+1 号条目上，所以差值比数组下标差少 1。
    if (idx >= 0) delta = pushedScreens.length - idx - 1;
    else if (id === rootScreenId) delta = pushedScreens.length;  // 回根屏：一路退回根条目
    if (delta <= 0) return false;
    console.log('🧭 [导航] ' + id + ' 已在历史栈 → go(-' + delta + ') 回退（不重复压栈）');
    try { window.history.go(-delta); return true; } catch (e) { return false; }
}

/** 覆写当前历史条目（根条目 / 同一屏重绘都用它，不增加栈深） */
function syncHistoryEntry(id, isRoot) {
    if (!historySupported() || !historyBooted) return;
    try {
        const depth = isRoot ? 0 : currentHistoryDepth();
        window.history.replaceState({ gaScreen: id, gaDepth: depth }, '', '#' + id);
        currentHistoryScreen = id;
        console.log('🧭 [导航] replaceState → ' + id + '（depth ' + depth + (isRoot ? '，根' : '') + '）');
    } catch (e) {
        console.warn('🧭 [导航] replaceState 失败：' + ((e && e.message) || e));
    }
}

/** 建立历史根条目：之后的返回键至少能退回这一屏，而不是直接离开本站 */
function bootHistory(rootScreen) {
    if (!historySupported()) {
        console.log('🧭 [导航] 当前环境无 History API → 跳过历史初始化（无头测试走这条）');
        return;
    }
    // 先把闸门打开再写根条目：syncHistoryEntry 自己会检查 historyBooted
    historyBooted = true;
    rootScreenId = rootScreen;
    pushedScreens = [];
    syncHistoryEntry(rootScreen, true);   // idx0：根条目（depth 0）
    // ⚠️ 再压一条同屏副本。原因：浏览器在「最根的那条历史」上再按返回会**直接离开本站**，
    //    而且这种情况下根本不会触发 popstate，我们没有任何机会拦截。
    //    多这一条副本，用户退到根屏时返回键至少能被接住一次（给出「再按一次」提示）。
    try {
        window.history.pushState({ gaScreen: rootScreen, gaDepth: 0 }, '', '#' + rootScreen);
        currentHistoryScreen = rootScreen;
        console.log('🧭 [导航] 历史初始化完成，根 = ' + rootScreen + '（含 1 条守卫副本）');
    } catch (e) {
        console.warn('🧭 [导航] 根副本压栈失败：' + ((e && e.message) || e));
    }
}

/** 历史回退触发的跳转期间，屏蔽内部 showScreen 的压栈 */
function withHistorySuppressed(fn) {
    suppressHistoryPush = true;
    try { return fn(); } finally { suppressHistoryPush = false; }
}

function showScreen(id, opts) {
    opts = opts || {};
    const target = document.getElementById(id);
    if (!target) {
        console.warn('🧭 [路由] 找不到屏幕：' + id);
        return;
    }
    // 路由日志：每一跳都打印「从哪来 → 去哪」，排查「欢迎页被跳过」这类问题全靠它
    console.log('🧭 [路由] ' + (lastScreenId || '(启动)') + ' → ' + id
        + (opts.fromHistory ? '（历史回退，不压栈）' : opts.replace ? '（replace，不新增历史条目）' : ''));
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    target.classList.add('active');
    // 页面切换时强制回到顶部，避免测试页等从上一页的滚动位置继续（问题2）
    window.scrollTo(0, 0);
    toggleCollectZone(id === 'readingPage' && !!(currentArticle && currentArticle.article));

    // 记住当前屏：刷新恢复、返回键守卫都靠它
    lastScreenId = id;
    patchSession({ screen: id, at: Date.now() });
    // 阅读页额外记下文章 id，刷新后能原地回到那篇文章
    if (id === 'readingPage' && currentArticle && currentArticle.id) {
        patchSession({ articleId: currentArticle.id });
    }

    // 历史：popstate 触发的切换不再压栈，否则返回键会「越按越深」
    if (opts.fromHistory || suppressHistoryPush) return;
    if (opts.replace) { syncHistoryEntry(id, true); return; }
    if (id === currentHistoryScreen) { syncHistoryEntry(id, false); return; }  // 同屏重绘（详情回填）不重复压栈
    // 目标屏已经在历史栈里（例如点应用内的「← 返回」回主界面）→ 真回退，不再压新条目。
    // 否则会多出一条重复条目，用户再按浏览器返回键会「前进」回刚离开的那页。
    if (goBackToHistory(id)) return;
    pushScreenHistory(id);
}

/**
 * 历史回退到的屏需要「把数据也带回来」——不能只切 class：
 *   阅读页要重绘文章正文；单词本要重算分类；练习页状态在内存里，没了就退回首页。
 * 这些函数内部还会调 showScreen（会再压栈）→ 统一用 withHistorySuppressed 包住。
 */
function navigateBackTo(target) {
    console.log('🧭 [导航] 应用内回退 → ' + target);
    if (target === 'readingPage') {
        if (currentArticle && currentArticle.id) {
            withHistorySuppressed(function () { renderArticle(currentArticle.id); });
            return;
        }
        const sess = readSession();
        if (sess.articleId) {
            withHistorySuppressed(function () { openArticle(sess.articleId); });
            return;
        }
        showScreen('dashboardPage', { fromHistory: true });
        return;
    }
    if (target === 'wordbookPage') {
        withHistorySuppressed(function () { showVocabBook(); });
        return;
    }
    if (target === 'practicePage') {
        if (practiceState) {
            showScreen('practicePage', { fromHistory: true });
            renderPractice();
            return;
        }
        console.log('🧭 [导航] 练习状态已不在内存 → 退回主界面');
        renderMain();
        showScreen('dashboardPage', { fromHistory: true });
        return;
    }
    if (target === 'summaryPage') {
        showScreen('summaryPage', { fromHistory: true });
        renderSummary();
        return;
    }
    if (target === 'uploadPage') { showScreen('uploadPage', { fromHistory: true }); return; }
    if (target === 'startingPage') { showScreen('startingPage', { fromHistory: true }); return; }
    // 默认落到主界面
    renderMain();
    showScreen('dashboardPage', { fromHistory: true });
}

function onPopState(event) {
    if (!historyBooted) return;
    const st = (event && event.state) ? event.state : {};
    const depth = Number(st.gaDepth) || 0;
    const target = st.gaScreen;
    console.log('🧭 [导航] 浏览器返回 → ' + (target || '(根外)') + ' | depth=' + depth);
    // 让本地栈与浏览器条目对齐（刷新后本地栈可能是空的，用空位补齐即可，不影响匹配）
    pushedScreens.length = depth;
    if (depth > 0 && !pushedScreens[depth - 1]) pushedScreens[depth - 1] = target || '';

    // ① 应用自己压进去的条目（depth >= 1）→ 正常在应用内回退
    // ② 退回根条目本身（depth 0）且当前不在根屏 → 照常切回根屏
    if (target && (depth >= 1 || lastScreenId !== target)) {
        currentHistoryScreen = target;
        navigateBackTo(target);
        return;
    }

    // ③ 已经停在根屏：这一次返回不退出，只提示；再按一次浏览器才会真正离开本站
    //    （根条目 + 守卫副本，所以这里还有一次机会；再按就出了 popstate 范围，拦不住）
    console.log('🧭 [导航] 已在根屏 → 拦截本次返回（再按一次才会退出应用）');
    toast('再按一次返回即可退出');
}

/**
 * 刷新后恢复用户身份。
 * ⚠️ 这一步不能省：app.js 顶层 `let userData` 每次载入都是空对象，而 getUsername() 直接读它，
 *    没恢复的话所有 /api 请求都会带 x-username: golden-apple-user → 拉到别人的收藏。
 * 只恢复身份/展示字段，**不恢复 collectedWords**（以服务端为准，由 initBackendSync 拉取），
 * 同时把 migrated 标成 true：迁移是一次性升级动作，别把服务端下来的数据又 POST 回 /api/migrate。
 */
function restoreUserIdentity() {
    let saved = null;
    try { saved = localStorage.getItem('gaUserData'); } catch (e) {}
    if (!saved) {
        console.log('🔄 [会话] 本地无 gaUserData → 保持默认用户');
        return false;
    }
    try {
        const obj = JSON.parse(saved);
        if (!obj || typeof obj !== 'object') return false;
        userData = Object.assign({}, userData, {
            userName: obj.userName,
            level: obj.level || userData.level,
            streak: Number(obj.streak) || 0,
            lastDate: obj.lastDate || null,
            masteredCount: Number(obj.masteredCount) || 0,
            collectedWords: [],
            migrated: true
        });
        console.log('🔄 [会话] 已恢复用户身份：' + (obj.userName || '(未命名)'));
        return true;
    } catch (e) {
        console.warn('⚠️ [会话] 恢复本地用户数据失败：' + ((e && e.message) || e));
        return false;
    }
}

/** 刷新后把「上次停留的屏」还原回来；临时的屏（等待页/总结页等）退回主界面 */
function restoreScreenFromSession(sess) {
    const saved = sess && sess.screen;
    if (saved === 'readingPage' && sess.articleId) {
        console.log('🔄 [会话] 刷新恢复 → 重新打开文章 ' + sess.articleId);
        openArticle(sess.articleId);
        return true;
    }
    if (saved === 'wordbookPage') {
        console.log('🔄 [会话] 刷新恢复 → 我的单词本');
        showVocabBook();
        return true;
    }
    if (saved === 'uploadPage') {
        console.log('🔄 [会话] 刷新恢复 → 上传页');
        showScreen('uploadPage');
        return true;
    }
    console.log('🔄 [会话] 刷新恢复 → 主界面（原屏 ' + (saved || '无') + (saved === 'dashboardPage' ? '' : ' 不适合恢复') + '）');
    showScreen('dashboardPage', { fromHistory: true });
    return false;
}

// 控制右侧收藏区的显示：仅在阅读页且文章已加载时显示
function toggleCollectZone(show) {
    const zone = document.getElementById('collectZone');
    if (zone) zone.style.display = show ? 'flex' : 'none';
}

function getLevelLabel(level) {
    const labels = {
        'a2': 'Beginner', 'b1': 'Intermediate', 'c1': 'Advanced',
        'middle': '初中', 'high': '高中'
    };
    return labels[level] || level;
}

function extractWordsFromArticle(articleText) {
    const commonWords = ['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
                         'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
                         'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
                         'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by',
                         'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above',
                         'below', 'between', 'under', 'again', 'further', 'then', 'once', 'here',
                         'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more',
                         'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
                         'same', 'so', 'than', 'too', 'very', 'just', 'but', 'and', 'or', 'if',
                         'because', 'until', 'while', 'about', 'against', 'he', 'she', 'it', 'they',
                         'we', 'you', 'I', 'me', 'him', 'her', 'us', 'them', 'this', 'that',
                         'these', 'those', 'what', 'which', 'who', 'whom', 'whose'];
    
    const words = {};
    const text = articleText.toLowerCase();
    const wordMatches = text.match(/[a-zA-Z'-]+/g) || [];
    
    const interestingWords = wordMatches.filter(word => {
        return word.length >= 4 && !commonWords.includes(word);
    });
    
    const uniqueWords = [...new Set(interestingWords)].slice(0, 15);
    
    uniqueWords.forEach(word => {
        words[word] = '点击查看释义';
    });
    
    return words;
}

function startApp() {
    try {
        console.log('🎯 startApp() 开始执行...');

        // ★ 先快照「当前用户名」：下面会清空 gaUserData，若用户没在输入框里重填名字，
        //   就会退化成默认用户 golden-apple-user，之后所有 /api 都带错 x-username
        //   → 拉到别人的收藏（2026-10-09 修：首访回到欢迎页后点 Start Journey 会触发这条）。
        const prevUserName = (userData && userData.userName) || '';

        // 重置本地数据：每次点击「开始旅程」都从全新状态开始
        localStorage.removeItem('gaUserData');
        localStorage.removeItem('gaCollectedWords');
        localStorage.removeItem('hasDroppedWord');
        userData = { collectedWords: [], level: 'A2', streak: 0, lastDate: null, masteredCount: 0 };
        collectedWords = [];
        currentArticle = null;
        sessionReadArticleIds = new Set();
        sessionCollectedList = [];
        lastQuizResult = null;
        console.log('✅ 本地数据已重置');

        const userNameInput = document.getElementById('userName');
        const typedName = (userNameInput && userNameInput.value.trim()) || '';
        const finalName = typedName || prevUserName;   // 没填就沿用上次的名字，避免把身份丢了
        if (finalName) {
            userData.userName = finalName;
            saveData();
            console.log('👤 [路由] 用户名 = ' + finalName + (typedName ? '（来自输入框）' : '（沿用上次身份）'));
        }
        
        const today = new Date().toDateString();
        if (userData.lastDate !== today) {
            const yest = new Date(); yest.setDate(yest.getDate() - 1);
            userData.streak = (userData.lastDate === yest.toDateString()) ? userData.streak + 1 : 1;
            userData.lastDate = today;
            saveData();
        }
        
        // 标记会话已开始：刷新页面后据此直接回到主界面，而不是被打回欢迎页
        patchSession({ started: true, screen: 'dashboardPage', articleId: null, at: Date.now() });

        // 先直接切换页面，确保可见
        // replace 而非 push：把「欢迎页」这条历史条目就地改写成主界面，
        // 这样用户按返回键时不会又看到一次「欢迎页」（像是被登出）。
        console.log('📝 先切换到主页面...');
        showScreen('dashboardPage', { replace: true });

        // 再渲染内容
        console.log('📝 渲染主界面内容...');
        try {
            renderMain();
        } catch(e) {
            console.warn('⚠️ renderMain 出错（不影响跳转）:', e.message);
        }
        
        // 异步后端同步：迁移本地数据 + 打卡 + 拉取收藏（不阻塞页面渲染）
        initBackendSync();
        console.log('✅ 完成！');

    } catch (error) {
        console.error('❌ startApp 出错:', error);
        alert('启动失败: ' + error.message);
    }
}

function backToMain() { renderMain(); showScreen('dashboardPage'); }

function renderMain() {
    const h = new Date().getHours();
    const greetingEl = document.getElementById('greeting');
    if (greetingEl) greetingEl.textContent = h >= 18 ? '晚上好!' : h >= 12 ? '下午好!' : '早上好!';
    
    const streakEl = document.getElementById('streak');
    if (streakEl) streakEl.textContent = userData.streak + ' 天';
    
    const total = userData.collectedWords.length;
    const pending = userData.collectedWords.filter(w => w.status === 'pending').length;
    const mastered = userData.collectedWords.filter(w => w.status === 'mastered').length;
    
    const statsEl = document.getElementById('stats');
    if (statsEl) statsEl.textContent = `Level ${userData.level} · ${total} words learned · ${userData.streak}-day streak · 🍎 ${applesOf()}`;
    
    const vTotal = document.getElementById('vTotal');
    if (vTotal) vTotal.textContent = total;
    
    const vPending = document.getElementById('vPending');
    if (vPending) vPending.textContent = pending;
    
    const vMastered = document.getElementById('vMastered');
    if (vMastered) vMastered.textContent = mastered;
    
    const dailyProgress = Math.min(mastered, 10);
    const dailyProgressEl = document.getElementById('dailyProgress');
    if (dailyProgressEl) dailyProgressEl.textContent = `${dailyProgress}/10`;
    
    const dailyProgressBar = document.getElementById('dailyProgressBar');
    if (dailyProgressBar) dailyProgressBar.style.width = `${(dailyProgress / 10) * 100}%`;
    
    const articlesList = document.getElementById('articlesList');
    if (articlesList) {
        articlesList.innerHTML = ARTICLES.map(a => {
            return `
            <div class="article-card" onclick="openArticle('${a.id}')">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
                    <span class="diff-badge diff-${a.level}">${a.level.toUpperCase()}</span>
                    <div style="color:var(--primary);font-size:0.8rem;">★★★☆☆</div>
                </div>
                <h3 style="margin:0.5rem 0;font-size:1rem;">${a.title}</h3>
                <p style="color:var(--gray);font-size:0.85rem;">${a.description}</p>
            </div>
            `;
        }).join('');
    }
    
    const wordbooksGrid = document.getElementById('wordbooksGrid');
    if (wordbooksGrid) {
        wordbooksGrid.innerHTML = WORDBOOKS.map(wb => {
            const progress = Math.round((wb.learned / wb.totalWords) * 100);
            return `
            <div class="grid-item">
                <div style="font-size:1.5rem;margin-bottom:0.5rem;">${wb.icon}</div>
                <div style="font-weight:600;font-size:0.95rem;">${wb.name}</div>
                <div style="font-size:0.75rem;color:var(--gray);margin:0.25rem 0;">${wb.learned}/${wb.totalWords} words</div>
                <div class="progress-bar" style="height:6px;"><div class="progress-fill" style="width:${progress}%;"></div></div>
            </div>
            `;
        }).join('');
    }
    
    // 首页快捷操作三个入口的计数（2026-10-09）
    renderQuickActions();

    console.log('✅ renderMain() 完成');
}

// ==================== 首页「快捷操作」：学习 / 复习 / 每日挑战（2026-10-09） ====================
//
// 【为什么三个功能放一个模块】
//   它们的骨架完全一样：从一个词队列里逐个出题 → 判定 → 回写状态 → 统计 → 结算。
//   差别只有「队列怎么挑」和「题面长什么样」，所以共用一个 #practicePage 屏，
//   用 mode + phase 驱动重绘（renderPractice），避免三套几乎重复的 UI 代码各自漂移。
//
// 【数据来源】只读 userData.collectedWords（= 后端 /api/user-words 的本地镜像），**不新增后端接口**：
//   learn     ：status === 'pending'（待学）。若一个 pending 都没有，则按知识度最低的未掌握词推荐。
//   review    ：next_review_at <= 现在（艾宾浩斯到期）∪ status === 'review'（标了「需复习」的优先见）。
//               ⚠️ next_review_at 目前只有「被分类过」的词才有（computeNextReview 写的），
//               历史遗留为 NULL 的分类词按「从未排期 → 视为到期」处理，否则老数据永远进不了复习。
//   challenge ：从全部收藏里随机抽 3 个**有释义**的词（没释义出不了拼写题）。
//
// 【状态回写】统一走既有的 PUT /api/word-status/:id —— 不新造写接口。
//   db.updateUserWordStatus 会按 status 重算 next_review_at（review=+1天 / learning=+3天 / mastered=+7天），
//   所以「答错 → 明天再复习」「答对 → 7 天后再见」直接复用后端既有规则，前端不另造一套间隔。

const PRACTICE_META = {
    learn:     { title: '学习词汇', sub: '先回忆，再看释义' },
    review:    { title: '复习单词', sub: '选出正确的释义' },
    challenge: { title: '每日挑战', sub: '拼写 3 个单词，全对得 1 颗苹果 🍎' }
};
const PRACTICE_LEARN_MAX = 20;     // 一次最多过 20 张卡：队列可能几十个，别让用户看着进度条绝望
const CHALLENGE_SIZE = 3;
const CHALLENGE_APPLE = 1;

let practiceState = null;          // { mode, queue, idx, phase, picked, typedOk, stats }

// ---------- 小工具 ----------

function shuffleArr(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
}

function todayKey() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function applesOf() { return Number(localStorage.getItem('gaApples')) || 0; }

/**
 * 每日挑战的「今天做过了吗」。
 * ⚠️ 苹果数与挑战日期**故意存在独立的 localStorage 键**，不放 userData：
 *    startApp()（点「开始旅程」）会 `localStorage.removeItem('gaUserData')` 把 userData 整个重置，
 *    若寄存在 userData 里，用户重启一次就能刷一次苹果、且「每天一次」形同虚设。
 *    这两个键不在 startApp 的清理清单里，所以能跨会话保留。
 */
function challengeDoneToday() { return localStorage.getItem('gaChallengeDate') === todayKey(); }

/** 正文里把目标词加粗（先转义再拼，避免词里带 `&`/`<` 把结构搞坏） */
function highlightWordInSentence(sentence, word) {
    const s = String(sentence || '');
    const w = String(word || '');
    if (!s) return '';
    if (!w) return escapeHtml(s);
    const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return s.split(new RegExp('(' + esc + ')', 'ig')).map(function (p, i) {
        return (i % 2 === 1) ? '<b>' + escapeHtml(p) + '</b>' : escapeHtml(p);
    }).join('');
}

/**
 * 目标词的「常见词形」候选表（原形 + 常见屈折）。
 * 【为什么需要】拼写题要在例句里把目标词挖空，而例句里出现的往往是变形
 * （analysis → analyses / analyse → analysing / study → studies），只按原形替换会漏掉 → 照样把答案送出去。
 * 纯函数、无副作用；不做词性判断，宁可多列几个（列多了匹配不到就自然失效，不会误伤）。
 */
function wordMatchForms(word) {
    const base = String(word || '').trim().toLowerCase();
    if (!base) return [];
    const forms = [];
    const add = function (f) { if (f && forms.indexOf(f) < 0) forms.push(f); };
    add(base);
    add(base + 's');                                    // analysis → analysiss（列多了无害）
    add(base + 'es');                                   // box → boxes
    add(base + 'ed');                                   // analyse → analysed（英式）
    add(base + 'd');                                    // analyse → analysed
    add(base + 'ing');                                  // analyse → analyseing（列多了无害）
    if (/e$/.test(base)) add(base.slice(0, -1) + 'ing');           // analyse → analysing
    if (/y$/.test(base)) { add(base.slice(0, -1) + 'ies'); add(base.slice(0, -1) + 'ied'); }  // study → studies / studied
    if (/is$/.test(base)) add(base.slice(0, -2) + 'es');           // analysis → analyses
    if (/(s|x|z|ch|sh)$/.test(base)) add(base + 'es');             // box → boxes
    return forms;
}

/**
 * 拼写题的「挖空」：把句子里的目标词（含常见词形）替换成下划线空位。
 *   opts.keepPrefix = N → 保留前 N 个字母（词根提示，如 analysis → anal____）；默认 0 = 全空。
 *   opts.silent      = true → 没匹配到时不打警告（用于顺手清理的释义文本，避免刷屏）
 * 返回 **HTML**（非命中片段已 escapeHtml；命中片段是 .practice-blank 的 <span>）。
 * ★ 这是「拼写题不送答案」的唯一实现点：learn / review 仍走 highlightWordInSentence（把词加粗，属正常提示）。
 */
function maskWordInSentence(sentence, word, opts) {
    opts = opts || {};
    const keep = Math.max(0, Math.floor(Number(opts.keepPrefix) || 0));
    const s = String(sentence || '');
    const w = String(word || '');
    if (!s) return '';
    if (!w) return escapeHtml(s);
    // 长形态优先（analyses 要排在 analysis 之前，避免被短形态截断成 analys + es）
    const forms = wordMatchForms(w)
        .sort(function (a, b) { return b.length - a.length; })
        .map(function (f) { return f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); });
    // 前后加「非字母」断言，避免子串误伤（如 car 命中 scar）
    const re = new RegExp('(?<![A-Za-z])(' + forms.join('|') + ')(?![A-Za-z])', 'ig');
    const hits = [];
    const html = s.split(re).map(function (part, i) {
        if (i % 2 !== 1) return escapeHtml(part);        // 非命中片段原样转义
        hits.push(part);
        const n = part.length;
        const keepN = Math.min(keep, Math.max(0, n - 1));   // 至少留一个下划线，别把词全露出来
        const head = keepN > 0 ? escapeHtml(part.slice(0, keepN)) : '';
        const rest = Math.max(3, n - keepN);
        return '<span class="practice-blank">' + head + '_'.repeat(rest) + '</span>';
    }).join('');
    if (typeof console !== 'undefined') {
        if (hits.length) {
            console.log('🎯 [拼写] 例句挖空 word=' + w + ' | 命中形态=' + JSON.stringify(hits) + ' | 保留前缀=' + keep);
        } else if (!opts.silent) {
            console.warn('⚠️ [拼写] 例句里没找到目标词（原形与常见词形都未命中），例句原样显示 | word=' + w + ' | sentence=' + s);
        }
    }
    return html;
}

/** 自检：给定文本里是否还看得到答案（不含则返回 false）。用于挖空后的兜底断言与测试。 */
function textLeaksWord(text, word) {
    const w = String(word || '').trim().toLowerCase();
    if (!w) return false;
    return String(text || '').toLowerCase().indexOf(w) >= 0;
}

// ---------- 三个队列 ----------

/** 待学：status === 'pending'。一个都没有时按「知识度最低的未掌握词」推荐（用户原话的第二种口径） */
function learnQueue() {
    const all = userData.collectedWords || [];
    let q = all.filter(function (w) { return w.status === 'pending'; });
    let fallback = false;
    if (q.length === 0) {
        q = all.filter(function (w) { return w.status !== 'mastered'; })
              .sort(function (a, b) { return (Number(a.knowledge) || 0) - (Number(b.knowledge) || 0); });
        fallback = q.length > 0;
    }
    if (typeof console !== 'undefined') {
        console.log('🎯 [练习] learn 队列 = ' + Math.min(q.length, PRACTICE_LEARN_MAX) + ' 个'
            + (fallback ? '（无 pending → 按知识度最低推荐）' : '（status=pending）'));
    }
    return q.slice(0, PRACTICE_LEARN_MAX);
}

/** 复习：next_review_at 已到期 ∪ status === 'review' */
function reviewQueue() {
    const now = Date.now();
    const all = userData.collectedWords || [];
    const q = all.filter(function (w) {
        if (w.status === 'review') return true;
        const t = w.nextReviewAt ? Date.parse(w.nextReviewAt) : NaN;
        if (!isNaN(t)) return t <= now;
        // next_review_at 为空：只有「已分类过」的词才可能是历史遗留（pending 本来就没排期）
        return w.status === 'learning' || w.status === 'mastered';
    });
    console.log('🎯 [练习] review 队列 = ' + q.length + ' 个（next_review_at <= ' + new Date(now).toISOString() + ' ∪ status=review）');
    return q;
}

/** 每日挑战：随机 3 个有释义的词 */
function challengeQueue() {
    const pool = (userData.collectedWords || []).filter(function (w) {
        return String(w.meaning || '').trim() && w.word;
    });
    const q = shuffleArr(pool).slice(0, CHALLENGE_SIZE);
    console.log('🎯 [练习] challenge 队列 = ' + q.length + ' 个（从 ' + pool.length + ' 个有释义词里随机）');
    return q;
}

// ---------- 首页计数 ----------

/** 首页三个入口的副标题计数。任何会改 status / 收藏集合的地方，回主界面时都会重跑这里。 */
function renderQuickActions() {
    const all = userData.collectedWords || [];
    const subWb = document.getElementById('qaWordbooksSub');
    if (subWb) subWb.textContent = all.length + ' 个收藏词';

    const nLearn = learnQueue().length;
    const subLearn = document.getElementById('qaLearnSub');
    if (subLearn) subLearn.textContent = nLearn > 0 ? (nLearn + ' 个待学单词') : '暂无待学单词';

    const nReview = reviewQueue().length;
    const subReview = document.getElementById('qaReviewSub');
    if (subReview) subReview.textContent = nReview > 0 ? (nReview + ' 个今日复习') : '今日无复习任务';

    const subCh = document.getElementById('qaChallengeSub');
    if (subCh) {
        // 不写 ✓（U+2713）：部分环境下字体缺字形会渲染成 √ 之类的怪符号，用纯文本更稳
        subCh.textContent = challengeDoneToday()
            ? '今日已完成 · +1 🍎'
            : '+1 🍎 · 已得 ' + applesOf();
    }
    console.log('🎯 [快捷操作] 收藏 ' + all.length + ' | 待学 ' + nLearn + ' | 今日复习 ' + nReview
        + ' | 挑战今日已完成: ' + challengeDoneToday() + ' | 🍎 ' + applesOf());
}

// ---------- 主流程 ----------

function startPractice(mode) {
    if (!PRACTICE_META[mode]) return;
    let queue = mode === 'learn' ? learnQueue() : mode === 'review' ? reviewQueue() : challengeQueue();

    if (queue.length === 0) {
        const msg = mode === 'learn'
            ? '还没有待学的单词 —— 先去阅读文章、收藏几个词吧 📚'
            : mode === 'review'
                ? '今天没有到期的复习词，明天再来 🎉'
                : '还没有可出题的单词（收藏的词还没有释义）';
        console.log('🎯 [练习] ' + mode + ' 队列为空，不进练习屏');
        toast(msg);
        return;
    }

    practiceState = {
        mode: mode,
        queue: queue,
        idx: 0,
        phase: mode === 'learn' ? 'prompt' : 'ask',
        picked: null,       // review：用户选了哪个下标
        typedOk: null,      // challenge：拼写对不对
        hintKeep: 0,        // challenge：拼写题「词根提示」保留的前缀字母数（0 = 全挖空）
        rewardGranted: false,   // challenge：本次是否真的发了苹果（重复完成时结算文案要区分）
        stats: { right: 0, wrong: 0 }
    };
    console.log('🎯 [练习] 开始 ' + mode + ' | 共 ' + queue.length + ' 题');
    showScreen('practicePage');
    renderPractice();
}

function practiceCurrent() { return practiceState && practiceState.queue[practiceState.idx]; }

/** 复习题的四个选项：1 个正确 + 3 个干扰（取自其它收藏词的释义），不足 2 个干扰就不出这道题 */
function buildReviewOptions(word) {
    const correct = String(word.meaning || '').trim();
    const seen = {};
    seen[correct.toLowerCase()] = true;
    const pool = [];
    (userData.collectedWords || []).forEach(function (w) {
        const m = String(w.meaning || '').trim();
        if (!m) return;
        const k = m.toLowerCase();
        if (seen[k]) return;
        seen[k] = true;
        pool.push(m);
    });
    const distractors = shuffleArr(pool).slice(0, 3);
    if (distractors.length < 2) return null;      // 干扰项太少 → 这道题没意义
    return shuffleArr([correct].concat(distractors));
}

function renderPractice() {
    const st = practiceState;
    if (!st) return;
    const meta = PRACTICE_META[st.mode];
    const total = st.queue.length;
    const word = practiceCurrent();

    document.getElementById('practiceTitle').textContent = meta.title;
    document.getElementById('practiceSub').textContent = meta.sub;
    document.getElementById('practiceProgress').textContent = (st.idx + 1) + ' / ' + total;
    document.getElementById('practiceBarFill').style.width = (st.idx / total * 100) + '%';

    const body = document.getElementById('practiceBody');
    const acts = document.getElementById('practiceActions');

    // ---- 结算屏 ----
    if (st.phase === 'done') {
        document.getElementById('practiceProgress').textContent = total + ' / ' + total;
        document.getElementById('practiceBarFill').style.width = '100%';
        body.innerHTML = practiceResultHtml();
        acts.innerHTML = '<button class="practice-btn primary" onclick="exitPractice()">回到首页</button>';
        return;
    }

    if (!word) { st.phase = 'done'; renderPractice(); return; }

    const sentenceHtml = word.sentence
        ? '<div class="practice-sentence">' + highlightWordInSentence(word.sentence, word.word) + '</div>'
        : '';

    // ---- 学习：先只看单词，点「显示释义」才揭示 ----
    if (st.mode === 'learn') {
        if (st.phase === 'prompt') {
            body.innerHTML =
                '<div class="practice-word">' + escapeHtml(word.word) + '</div>'
                + '<div class="practice-hint">先在心里回忆一下它的意思</div>'
                + sentenceHtml;
            acts.innerHTML = '<button class="practice-btn primary" onclick="practiceReveal()">显示释义</button>';
        } else {
            body.innerHTML =
                '<div class="practice-word">' + escapeHtml(word.word) + '</div>'
                + '<div class="practice-divider"></div>'
                + '<div class="practice-meaning">' + escapeHtml(word.meaning || '（暂无释义）') + '</div>'
                + sentenceHtml;
            acts.innerHTML =
                '<button class="practice-btn no" onclick="practiceMark(false)">❌ 还不认识</button>'
                + '<button class="practice-btn ok" onclick="practiceMark(true)">✅ 认识了</button>';
        }
        return;
    }

    // ---- 复习：四选一 ----
    if (st.mode === 'review') {
        if (st.phase === 'ask') {
            const opts = buildReviewOptions(word);
            if (!opts) {   // 干扰项不够 → 跳过这题
                console.log('🎯 [练习] review 跳过（干扰项不足）: ' + word.word);
                practiceAdvance();
                return;
            }
            st.options = opts;
            body.innerHTML =
                '<div class="practice-word">' + escapeHtml(word.word) + '</div>'
                + '<div class="practice-hint">它是什么意思？</div>'
                + sentenceHtml
                + '<div class="practice-options">'
                + opts.map(function (m, i) {
                    return '<button class="practice-option" data-opt="' + i + '" onclick="practiceChoose(' + i + ')">'
                        + '<span class="opt-key">' + 'ABCD'[i] + '</span><span>' + escapeHtml(m) + '</span></button>';
                }).join('')
                + '</div>';
            acts.innerHTML = '';
        } else {
            const correct = String(word.meaning || '').trim();
            body.innerHTML =
                '<div class="practice-word">' + escapeHtml(word.word) + '</div>'
                + '<div class="practice-divider"></div>'
                + '<div class="practice-meaning">' + escapeHtml(correct) + '</div>'
                + '<div class="practice-hint">'
                + (st.pickedOk ? '✅ 答对了' : '❌ 答错了，正确答案已在上方')
                + (word.sentence ? '' : '')
                + '</div>'
                + sentenceHtml;
            acts.innerHTML = '<button class="practice-btn primary" onclick="practiceAdvance()">下一题 →</button>';
        }
        return;
    }

    // ---- 每日挑战：拼写 ----
    if (st.mode === 'challenge') {
        const w = String(word.word || '');
        if (st.phase === 'ask') {
            // ★ 拼写题：例句里的目标词必须挖空（否则用户直接照抄），释义也顺手清一遍（少数释义里带英文原词）
            const keepN = Math.max(0, Number(st.hintKeep) || 0);
            const askSentenceHtml = word.sentence
                ? '<div class="practice-sentence">' + maskWordInSentence(word.sentence, w, { keepPrefix: keepN }) + '</div>'
                : '';
            if (word.sentence && keepN === 0 && textLeaksWord(askSentenceHtml.replace(/<[^>]*>/g, ''), w)) {
                console.warn('⚠️ [拼写] 挖空后例句里仍能看到目标词，请检查词形表 | word=' + w);
            }
            const hint = w.length > 1
                ? ('首字母 ' + escapeHtml(w[0]) + ' · 共 ' + w.length + ' 个字母')
                : ('共 ' + w.length + ' 个字母');
            body.innerHTML =
                '<div class="practice-prompt">' + maskWordInSentence(String(word.meaning || '（暂无释义）'), w, { silent: true }) + '</div>'
                + '<div class="practice-hint">' + hint + '</div>'
                + askSentenceHtml
                + '<input class="practice-input" id="practiceSpellInput" type="text" autocomplete="off"'
                + ' autocapitalize="off" spellcheck="false" placeholder="拼出这个单词…" />';
            acts.innerHTML =
                (word.sentence
                    ? '<button class="practice-btn ghost" id="practiceHintBtn" onclick="practiceHint()">'
                        + (keepN > 0 ? '↺ 收起提示' : '💡 词根提示') + '</button>'
                    : '')
                + '<button class="practice-btn primary" id="practiceSpellBtn" onclick="practiceSubmitSpelling()">提交</button>';
            const inp = document.getElementById('practiceSpellInput');
            if (inp) {
                inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') practiceSubmitSpelling(); });
                inp.focus();
            }
        } else {
            // 提交后：答案已公布，例句恢复「目标词加粗」的正常提示
            body.innerHTML =
                '<div class="practice-prompt">' + escapeHtml(word.meaning || '（暂无释义）') + '</div>'
                + '<div class="practice-divider"></div>'
                + '<div class="practice-word" style="font-size:1.7rem;">' + escapeHtml(w) + '</div>'
                + '<div class="practice-hint">' + (st.typedOk ? '✅ 拼对了' : '❌ 拼错了') + '</div>'
                + sentenceHtml;
            acts.innerHTML = '<button class="practice-btn primary" onclick="practiceAdvance()">下一题 →</button>';
        }
        return;
    }
}

function practiceReveal() {
    if (!practiceState || practiceState.phase !== 'prompt') return;
    practiceState.phase = 'answer';
    console.log('🎯 [练习] learn 揭示释义: ' + (practiceCurrent() || {}).word);
    renderPractice();
}

/** 学习：认识 / 不认识 → 回写 status（mastered / learning） */
function practiceMark(known) {
    const st = practiceState;
    const word = practiceCurrent();
    if (!st || !word) return;
    st.stats.right += known ? 1 : 0;
    st.stats.wrong += known ? 0 : 1;
    console.log('🎯 [练习] learn 判定 ' + word.word + ' → ' + (known ? '认识了(mastered)' : '还不认识(learning)'));
    setWordStatus(word, known ? 'mastered' : 'learning');
    practiceAdvance();
}

/** 复习：选了一个选项 */
function practiceChoose(i) {
    const st = practiceState;
    const word = practiceCurrent();
    if (!st || !word || st.phase !== 'ask') return;
    const opts = st.options || [];
    const correct = String(word.meaning || '').trim();
    const ok = String(opts[i] || '').trim() === correct;
    st.picked = i;
    st.pickedOk = ok;
    st.stats.right += ok ? 1 : 0;
    st.stats.wrong += ok ? 0 : 1;
    console.log('🎯 [练习] review 作答 ' + word.word + ' → 选「' + opts[i] + '」' + (ok ? ' 正确' : ' 错误'));
    // 答对 → mastered（+7 天后再见）；答错 → review（明天再来）
    setWordStatus(word, ok ? 'mastered' : 'review');
    st.phase = 'feedback';
    renderPractice();
}

/** 每日挑战：提交拼写 */
function practiceSubmitSpelling() {
    const st = practiceState;
    const word = practiceCurrent();
    if (!st || !word || st.phase !== 'ask') return;
    const inp = document.getElementById('practiceSpellInput');
    const typed = inp ? String(inp.value || '') : '';
    const norm = function (s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); };
    const ok = !!typed.trim() && norm(typed) === norm(word.word);
    st.typedOk = ok;
    st.stats.right += ok ? 1 : 0;
    st.stats.wrong += ok ? 0 : 1;
    console.log('🎯 [练习] challenge 拼写 ' + word.word + ' → 输入「' + typed + '」' + (ok ? ' 正确' : ' 错误'));
    if (ok) setWordStatus(word, 'mastered');
    st.phase = 'feedback';
    renderPractice();
}

/**
 * 每日挑战：词根提示开关。
 * 在例句空位里保留目标词**前半部分**字母（analysis → anal____），再点一次收起。
 * 只是「多给一点线索」，所以不算答对判定的一部分；不影响 typedOk 与状态回写。
 */
function practiceHint() {
    const st = practiceState;
    const word = practiceCurrent();
    if (!st || !word || st.mode !== 'challenge' || st.phase !== 'ask') return;
    const w = String(word.word || '');
    if (!w) return;
    if (st.hintKeep > 0) {
        st.hintKeep = 0;
    } else {
        let k = Math.ceil(w.length / 2);        // 保留前半（最长不超过「长度 - 1」，绝不留整词）
        if (k >= w.length) k = w.length - 1;
        st.hintKeep = Math.max(1, k);
    }
    console.log('🎯 [练习] 词根提示 ' + (st.hintKeep > 0 ? '开（' + w + ' 保留前 ' + st.hintKeep + ' 个字母）' : '关')
        + ' → 例句挖空随之更新');
    // 重绘会重建输入框 → 先把用户已经打了一半的字保住，重绘后填回并把光标放到末尾
    const prevInput = document.getElementById('practiceSpellInput');
    const draft = prevInput ? String(prevInput.value || '') : '';
    renderPractice();
    const nextInput = document.getElementById('practiceSpellInput');
    if (nextInput && draft) {
        nextInput.value = draft;
        try { nextInput.setSelectionRange(draft.length, draft.length); } catch (e) {}
    }
}

/** 下一题 / 收尾 */
function practiceAdvance() {
    const st = practiceState;
    if (!st) return;
    st.idx += 1;
    st.picked = null;
    st.pickedOk = null;
    st.typedOk = null;
    st.hintKeep = 0;
    st.options = null;
    if (st.idx >= st.queue.length) {
        practiceState.phase = 'done';
        console.log('🎯 [练习] ' + st.mode + ' 全部完成 | 对 ' + st.stats.right + ' / 错 ' + st.stats.wrong);
        grantPracticeReward();
    } else {
        st.phase = st.mode === 'learn' ? 'prompt' : 'ask';
    }
    renderPractice();
    renderQuickActions();
}

/** 每日挑战完成 → +1 🍎（每天最多一次）；学习/复习不给苹果 */
function grantPracticeReward() {
    const st = practiceState;
    if (!st || st.mode !== 'challenge') return;
    if (challengeDoneToday()) {
        // 今天已经领过 —— 记「本次没发」，结算文案才不会谎称「苹果已到账」（否则用户以为白做一遍）
        st.rewardGranted = false;
        console.log('🎯 [练习] 今日挑战已完成过，不重复发苹果（当前 🍎 ' + applesOf() + '）');
        return;
    }
    localStorage.setItem('gaApples', String(applesOf() + CHALLENGE_APPLE));
    localStorage.setItem('gaChallengeDate', todayKey());
    st.rewardGranted = true;
    console.log('🎯 [练习] 每日挑战完成 → 🍎 +' + CHALLENGE_APPLE + '（累计 ' + applesOf() + '）');
}

function practiceResultHtml() {
    const st = practiceState;
    const total = st.queue.length;
    if (st.mode === 'challenge') {
        return '<div class="practice-result-icon">🍎</div>'
            + '<div class="practice-result-title">挑战完成！</div>'
            + '<div class="practice-result-line">拼对 ' + st.stats.right + ' / ' + total + ' 个</div>'
            + '<div class="practice-result-line">'
            + (st.rewardGranted ? '苹果已到账 +1 · 现有 🍎 ' + applesOf() : '今日已完成过，本次不重复发放（现有 🍎 ' + applesOf() + '）')
            + '</div>';
    }
    if (st.mode === 'review') {
        return '<div class="practice-result-icon">📖</div>'
            + '<div class="practice-result-title">复习完成</div>'
            + '<div class="practice-result-line">答对 ' + st.stats.right + ' / ' + total + ' 个</div>'
            + '<div class="practice-result-line">答错的词已排到明天再来复习</div>';
    }
    return '<div class="practice-result-icon">🌱</div>'
        + '<div class="practice-result-title">学习完成</div>'
        + '<div class="practice-result-line">认识的 ' + st.stats.right + ' 个（已归入「已掌握」）</div>'
        + '<div class="practice-result-line">还不认识的 ' + st.stats.wrong + ' 个（已归入「学习中」）</div>';
}

function exitPractice() {
    const m = practiceState && practiceState.mode;
    console.log('🎯 [练习] 退出 ' + (m || '') + ' → 回首页');
    practiceState = null;
    showScreen('dashboardPage');
    renderMain();
}

/**
 * 回写单词分类状态。**先改本地再发请求**：本地立刻生效（卡片/计数不用等网络），
 * 失败只警告不回滚 —— 下一次 syncUserWordsFromServer 会以服务端为准把本地纠正回来。
 */
function setWordStatus(word, status) {
    if (!word) return;
    word.status = status;
    word.knowledge = { mastered: 1, learning: 0.5, review: 0.2, pending: 0 }[status] || 0;
    word.nextReviewAt = computeNextReviewLocal(status);
    saveData();
    if (word.id === undefined || word.id === null) {
        console.warn('⚠️ [练习] 该词没有 id（未落库），只改本地: ' + word.word);
        return;
    }
    apiPut('/api/word-status/' + word.id, { status: status })
        .then(function () { console.log('✅ [练习] 状态已回写 ' + word.word + ' → ' + status); })
        .catch(function (e) { console.warn('⚠️ [练习] 状态回写失败（本地已生效）: ' + word.word + ' → ' + status + ' | ' + e.message); });
}

/** 与 db.js computeNextReview 同规则（review=+1d / learning=+3d / mastered=+7d），用于本地镜像 */
function computeNextReviewLocal(status) {
    const days = { review: 1, learning: 3, mastered: 7 }[status];
    if (!days) return null;
    const d = new Date(); d.setDate(d.getDate() + days);
    return d.toISOString();
}

function continueLearning() {
    if (userData.collectedWords.length > 0) {
        showVocabBook();
    } else {
        toast('还没有生词，开始阅读吧!');
        const first = ARTICLES[0];
        if (first) {
            openArticle(first.id);
        } else {
            // 列表还没回来（极早期点击）→ 补一次加载再打开首篇
            console.log('📚 [文章] ARTICLES 为空，先补一次加载再打开首篇');
            loadArticlesPage(1, { force: true }).then(function () {
                if (ARTICLES[0]) openArticle(ARTICLES[0].id);
                else toast('文章加载失败，请检查网络');
            });
        }
    }
}

/**
 * 打开文章（2026-10-06 改为「先渲染、再按需补详情」）。
 *
 * 数据分两级来源：
 *   ① 列表阶段的**轻量数据**（title/description/content）→ 立刻渲染，句子走本地切句兜底；
 *   ② **详情** `/api/article/:id`（正文 + 译文 + 释义 + 题目）→ 异步补齐，
 *      回来后只有「用户还停在这一篇」才原地重渲染，避免把用户已经切走的页面覆盖回去。
 *
 * 好处：点开文章永不白屏等网络；正文先出来，译文/释义到位后再悄悄升级。
 * 只有内存里彻底没有这篇（例如它在还没加载的页里）时，才先拉详情再渲染。
 */
function openArticle(id) {
    const known = ARTICLES.find(a => a.id === id);

    if (!known) {
        console.log(`📚 [文章] 内存里没有 ${id}（可能在第 ${articlesPage + 1} 页之后）→ 先拉详情再打开`);
        loadArticleDetail(id).then(function (full) {
            if (full) renderArticle(id);
            else toast('文章加载失败，请稍后重试');
        });
        return;
    }

    renderArticle(id);

    // 详情没加载过 → 按需拉一次，回来后原地升级译文/释义/题目。
    // 用 shouldFetchArticleDetail 而不是「!articleDetailAsked[id]」那个一次性闸门：
    // 后者在详情拉取失败后会永久挡住重试，文章就永远停在「只有正文、没有译文」的空壳上。
    if (shouldFetchArticleDetail(known)) {
        articleDetailAsked[id] = true;   // 先占位，防止连点触发多次
        if (known.serverHasSentences && !known.detailLoaded) {
            console.log(`📚 [文章] ${id} 服务端标记「有译文」但内存里没有 → 必须补拉详情（否则浮层会显示「暂无翻译」）`);
        }
        loadArticleDetail(id).then(function (full) {
            if (!full) return;
            if (currentArticle && currentArticle.id === id) {
                console.log(`📚 [文章] 详情已就绪 → 原地重渲染（${id}：译文 ${full.sentences.length} 句`
                    + ` / 释义 ${Object.keys(full.words || {}).length} 个 / 题目 ${full.questions.length} 道）`);
                renderArticle(id);
            } else {
                console.log(`📚 [文章] 详情已就绪，但用户已切到 ${currentArticle && currentArticle.id} → 只更新内存，不重渲染`);
            }
        });
    }
}

/** 同步渲染阅读页 —— 只用内存里已有的数据，零网络请求 */
function renderArticle(id) {
    currentArticle = ARTICLES.find(a => a.id === id);
    if (!currentArticle) return;

    collectedWords = [];
    isTranslationsVisible = false;
    sessionReadArticleIds.add(currentArticle.id);

    renderArticleSelector(currentArticle.id);

    document.getElementById('readTitle').textContent = currentArticle.title;
    document.getElementById('readDesc').textContent = currentArticle.description || '';
    document.getElementById('readDiff').textContent = String(currentArticle.level || '').toUpperCase();
    document.getElementById('readDiff').className = `diff-badge diff-${currentArticle.level}`;

    renderArticleWithTranslations();
    bindWordSpanEventsOnce();
    showDragGuideIfNeeded();
    updateProgress();

    const transBtn = document.getElementById('toggleTransBtn');
    if (transBtn) {
        transBtn.style.display = 'none';
    }

    // 降级划线答题模式关闭，直接渲染右侧题目区
    fallbackQuizActive = false;
    hideQuizExtras();
    updateCollectBadge();
    renderReadingFavs();
    initQuizArea();
    // 每次切文章都重判一次：partial 文章显示「句子翻译失败」提示条，其它文章必须收起。
    // 顺带收起上篇文章可能残留的「AI 降级」提示条（它是整篇级提示，跟着文章走，不跟着页面走）。
    syncSentenceFailedNotice();
    const fbNotice = document.getElementById('fallbackNotice');
    if (fbNotice && currentArticle.status !== 'failed') fbNotice.classList.add('hidden');

    showScreen('readingPage');
    // 进阅读页：一次性把本文所有词的词典释义拉回本地缓存，此后点任何词都是 0 网络出卡
    prefetchDictionaryForArticle();

    console.log(`📚 [阅读页] 渲染 ${currentArticle.id} | ${currentArticle.title}`
        + ` | 正文 ${(currentArticle.article || '').length} 字`
        + ` | 译文 ${(currentArticle.sentences || []).length} 句`
        + ` | 详情已加载=${!!currentArticle.detailLoaded}`
        + (currentArticle.serverHasSentences && (currentArticle.sentences || []).length === 0
            ? ' | ⚠️ 服务端说有译文但本地为空 → 正在补拉详情（问题一的自愈路径）' : ''));

    // 自愈（2026-10-07）：正文渲染完发现「服务端说这篇有译文、本地却一句都没有」，
    // 且详情没加载过 → 主动补拉一次。这样无论用户从哪条路进阅读页
    //（列表点开 / 首页刚回来 / 轮询落库），都不会停在「浮层永远暂无翻译」的状态。
    if (!currentArticle.detailLoaded && shouldFetchArticleDetail(currentArticle)) {
        articleDetailAsked[currentArticle.id] = true;
        const healId = currentArticle.id;
        console.log(`📚 [阅读页] ${healId} 无详情 → 触发自愈补拉`);
        loadArticleDetail(healId).then(function (full) {
            if (full && currentArticle && currentArticle.id === healId) {
                console.log(`📚 [阅读页] 自愈补拉完成 → 重渲染（译文 ${full.sentences.length} 句）`);
                renderArticle(healId);
            }
        });
    }

    // ★ 2026-10-08 新增：文章仍在生成中（analyzing）→ 挂一个后台守护。
    //   覆盖「用户中途切回来 / 详情先拉到但服务端还没跑完」这类情况：
    //   守护每 2 秒查一次状态，等句子翻译落地就把译文原地补上并重绘。
    //   没有这一步时，analyzing 的文章只能靠悬停时读到的旧数据，
    //   浮层会一直停在「译文还在加载中」，而轮询早就结束（或从未为它启动）。
    if (currentArticle.analyzing) {
        console.log(`🔁 [阅读页] ${currentArticle.id} 标记为「仍在生成中」→ 挂后台补拉守护（等迟到的译文落地）`);
        backfillArticleUntilTerminal(currentArticle.id, '进入阅读页时文章仍在生成中');
    }
}

function openArticleById(index) {
    if (index >= 0 && index < ARTICLES.length) {
        openArticle(ARTICLES[index].id);
    }
}

function showAllArticles() {
    // Scroll to the Reading Library section or show a toast
    toast('查看所有文章');
}

function getWordFromClick(e) {
    const range = document.caretRangeFromPoint(e.clientX, e.clientY);
    if (!range) return null;
    
    range.expand('word');
    let text = range.toString().trim();
    if (!text) return null;
    
    const words = currentArticle.words || {};
    const sentence = getSentenceFromRange(range);
    
    const currentWord = text.replace(/[^-a-zA-Z']/g, '').toLowerCase();
    if (!currentWord) return null;
    
    const connectorWords = ['however', 'therefore', 'moreover', 'furthermore', 'nevertheless', 'consequently', 'meanwhile', 'otherwise', 'although', 'though', 'while', 'when', 'as', 'if', 'because', 'since', 'so', 'but', 'and', 'or', 'for', 'yet', 'nor', 'also', 'even', 'still', 'just', 'only', 'such', 'than', 'that', 'this', 'these', 'those', 'despite', 'during'];
    
    if (connectorWords.includes(currentWord) && words[currentWord]) {
        return { word: currentWord, meaning: words[currentWord], sentence };
    }
    
    const prevWord = getPreviousWord(range, sentence);
    
    if (prevWord) {
        const twoWordPhrase = `${prevWord} ${currentWord}`;
        if (words[twoWordPhrase]) {
            return { word: twoWordPhrase, meaning: words[twoWordPhrase], sentence };
        }
        
        const threeWordPhrase = getThreeWordPhrase(range, sentence, prevWord, currentWord);
        if (threeWordPhrase && words[threeWordPhrase]) {
            return { word: threeWordPhrase, meaning: words[threeWordPhrase], sentence };
        }
    }
    
    const nextWord = getNextWord(range, sentence);
    if (nextWord) {
        const twoWordPhrase = `${currentWord} ${nextWord}`;
        if (words[twoWordPhrase]) {
            return { word: twoWordPhrase, meaning: words[twoWordPhrase], sentence };
        }
    }
    
    if (words[currentWord]) {
        return { word: currentWord, meaning: words[currentWord], sentence };
    }
    
    return null;
}

function getPreviousWord(range, sentence) {
    const offset = range.startOffset;
    const beforeText = sentence.substring(0, offset);
    const wordsBefore = beforeText.split(/\s+/).filter(w => w.trim());
    if (wordsBefore.length > 0) {
        return wordsBefore[wordsBefore.length - 1].replace(/[^-a-zA-Z']/g, '').toLowerCase();
    }
    return null;
}

function getNextWord(range, sentence) {
    const offset = range.endOffset;
    const afterText = sentence.substring(offset);
    const wordsAfter = afterText.split(/\s+/).filter(w => w.trim());
    if (wordsAfter.length > 0) {
        return wordsAfter[0].replace(/[^-a-zA-Z']/g, '').toLowerCase();
    }
    return null;
}

function getThreeWordPhrase(range, sentence, prevWord, currentWord) {
    const nextWord = getNextWord(range, sentence);
    if (nextWord) {
        return `${prevWord} ${currentWord} ${nextWord}`;
    }
    return null;
}

function getSentenceFromRange(range) {
    const container = range.commonAncestorContainer;
    let text = container.textContent || '';
    const sentences = text.split(/[.!?]+/);
    const offset = range.startOffset;
    
    let accum = 0;
    for (const s of sentences) {
        if (accum + s.length >= offset) {
            return s.trim();
        }
        accum += s.length + 1;
    }
    return sentences[0] || text.substring(0, 50);
}

// 判断单词在当前文章的当前句子中是否已收藏（word + articleId + sentence 三者组合）
function isWordCollectedInThisSentence(word, articleId, sentence) {
    const list = (userData && userData.collectedWords) ? userData.collectedWords : [];
    return list.some(function(item) {
        return item.word === word && 
               item.articleId === articleId && 
               item.sentence === sentence;
    });
}

// 浏览器语音朗读单词（speechSynthesis）
function speakText(text) {
    if (!text) return;
    if (!('speechSynthesis' in window)) {
        toast('当前浏览器不支持发音');
        return;
    }
    try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'en-US';
        u.rate = 0.9;
        window.speechSynthesis.speak(u);
    } catch (e) {
        toast('发音失败');
    }
}

// 把释义数组按词性分组渲染（用于单词卡片）
function buildDefinitionsHtml(definitions) {
    const groups = {};
    definitions.forEach(function(d) {
        const pos = d.part_of_speech || '其他';
        if (!groups[pos]) groups[pos] = [];
        groups[pos].push(d.definition);
    });
    const order = ['n.', 'v.', 'adj.', 'adv.'];
    const posEntries = Object.keys(groups).sort(function(a, b) {
        const ia = order.indexOf(a); const ib = order.indexOf(b);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
    let html = '<div class="wc-defs" style="margin-top:0.4rem;">';
    posEntries.forEach(function(pos) {
        html += '<div class="wc-def-group" style="display:flex;gap:0.5rem;align-items:baseline;margin-top:0.3rem;line-height:1.5;">'
            + '<span style="flex:none;font-size:0.72rem;font-weight:700;color:var(--primary);background:var(--primary-light);padding:0.05rem 0.45rem;border-radius:0.4rem;">' + escapeHtml(pos) + '</span>'
            + '<span style="font-size:1.05rem;color:var(--primary);">' + groups[pos].map(escapeHtml).join('；') + '</span>'
            + '</div>';
    });
    html += '</div>';
    return html;
}

// 无释义/空释义时的输入表单（输入释义 + 选词性 + 保存）
function buildWordFormHtml() {
    return ''
        + '<div class="wc-no-meaning" style="margin-top:0.5rem;font-size:0.95rem;color:var(--gray);">暂无释义，添加一个：</div>'
        + '<div style="margin-top:0.55rem;display:flex;flex-direction:column;gap:0.5rem;">'
        +   '<input class="wc-input" type="text" placeholder="输入释义，如：预订" style="width:100%;box-sizing:border-box;padding:0.55rem 0.7rem;border:1px solid var(--border);border-radius:0.6rem;font-size:0.95rem;outline:none;" />'
        +   '<div style="display:flex;gap:0.5rem;">'
        +     '<select class="wc-pos-select" style="flex:1;padding:0.55rem 0.5rem;border:1px solid var(--border);border-radius:0.6rem;font-size:0.9rem;background:#fff;cursor:pointer;">'
        +       '<option value="n.">n. 名词</option>'
        +       '<option value="v.">v. 动词</option>'
        +       '<option value="adj.">adj. 形容词</option>'
        +       '<option value="adv.">adv. 副词</option>'
        +       '<option value="其他">其他</option>'
        +     '</select>'
        +     '<button class="wc-save-btn" type="button" style="flex:none;padding:0.55rem 0.9rem;border:none;border-radius:0.6rem;background:var(--primary);color:#fff;font-weight:600;cursor:pointer;font-size:0.9rem;">保存</button>'
        +   '</div>'
        + '</div>';
}

// 释义数组拼成收藏用的单行文本
function definitionsToText(definitions) {
    if (!definitions || definitions.length === 0) return '';
    return definitions.map(function(d) {
        return d.definition + (d.part_of_speech ? ' (' + prettyPosLabel(d.part_of_speech) + ')' : '');
    }).join('；');
}

// 词性标签归一（前端侧兜底）：后端 ECDICT 的 pos 是机器格式 `adj:100`，
// 直接拼进释义会变成「adj. 小的 (adj:100)」。这里统一成 `adj` / `adv`。
const POS_LABEL_SIMPLE = {
    a: 'adj', ad: 'adv', adj: 'adj', adv: 'adv',
    n: 'n', v: 'v', vi: 'vi', vt: 'vt', aux: 'aux',
    prep: 'prep', conj: 'conj', pron: 'pron', num: 'num',
    art: 'art', int: 'interj', interj: 'interj', abbr: 'abbr'
};
function prettyPosLabel(pos) {
    const raw = String(pos == null ? '' : pos).trim();
    if (!raw) return '';
    const first = raw.split('/')[0].split(':')[0].trim().toLowerCase().replace(/\.$/, '');
    return POS_LABEL_SIMPLE[first] || first;
}

/** 收藏释义：把空值 / 字面量「暂无释义」统一当「没有」，避免把占位文案当释义存库 */
function cleanCollectMeaning(m) {
    const s = String(m == null ? '' : m).trim();
    return (s && s !== '暂无释义') ? s : null;
}

// 收藏释义来源 → 中文标签（只用于日志，方便一眼看出「到底存了哪一层」）
const COLLECT_MEANING_SOURCES = {
    context: '本句语境释义',
    article: '文章词表',
    dictionary: '词典层首义',
    glue: '拆词合成',
    '': '（三层都没有 → 留空）'
};

/**
 * 「真正的本句语境释义」来源白名单（2026-10-08）。
 *
 * 后端 `contextSource` ∈ `context`(L2 语境库) | `kb`(L1 知识库) | `ai`(L3 AI 生成) | `cache` | null。
 * ⚠️ `cache` 是**兼容层**（通用词库 word_cache）—— 它也会把 `contextDefinition` 填上，
 * 但那是「这个词的通用释义」，**不是本句里的意思**，绝不能冒充「本句语境释义」。
 * （测试 【⑱】 B 组就是踩这个：无关句子下后端返回 contextSource='cache' 的通用释义，
 *   前端若按「有 contextDefinition 就算语境释义」去认，日志和优先级都会失真。）
 */
const REAL_CONTEXT_SOURCES = ['context', 'kb', 'ai'];

/** 传进来的 contextSource 算不算「真正的本句语境释义」；null/空 时按旧行为放行（兼容不带 source 的老调用） */
function isRealContextSource(ctxSource) {
    if (ctxSource === null || ctxSource === undefined || ctxSource === '') return true;
    return REAL_CONTEXT_SOURCES.indexOf(String(ctxSource).toLowerCase()) >= 0;
}

/** contextSource → 日志后缀（标明这条语境释义具体来自哪一层） */
function ctxSourceLabel(ctxSource) {
    const s = String(ctxSource || '').toLowerCase();
    if (s === 'kb') return '，L1 知识库';
    if (s === 'ai') return '，L3 AI 生成';
    if (s === 'cache') return '，兼容层通用词库';
    if (s === 'article') return '，文章词表占位';
    return '';
}

/**
 * 收藏时到底该存哪条释义（2026-10-06 新增，2026-10-08 改造）。
 *
 * 背景：单词本里 35 条收藏有 25 条显示「暂无释义」。两个来源：
 *   · 拖拽路径写死 `words[word] || '暂无释义'` —— 只查文章词表，词典层完全没参与；
 *   · 卡片收藏按钮用 `definitionsToText(definitions)` —— 点词瞬间后台还没回，数组是空的。
 *
 * **2026-10-08 用户报的第二个问题**：part-time 在词典里没有「兼职的」（ECDICT 未收录，
 * 词典层靠「连字符取首段」兜到 part），「兼职的」是「联网深查」补的 —— 但收藏下来的是
 * 词典的 part 释义。原因：拖拽路径调 `bestMeaningForCollect(word)` **没带 contextDefinition**，
 * 而拖拽时压根没有词卡 → ① 那一层永远是空的 → 直接掉到 ③ 词典层。
 * 现在统一走 `resolveCollectMeaning`（会去语境库查一次），优先级仍是下面三层。
 *
 * 优先级（用户指定）：① 本句语境释义 → ② 文章词表 → ③ 词典层首义。
 *
 * @returns {{meaning: string, source: 'context'|'article'|'dictionary'|'', detail: string}}
 */
function bestMeaningSourceForCollect(word, opts) {
    const o = opts || {};
    const w = String(word || '').trim();
    if (!w) return { meaning: '', source: '', detail: '空词' };
    // ① 本句语境释义最贴切（卡片上已经算好的，或刚查回来的）——
    //    但只有 contextSource 明确属于语境层（context/kb/ai）时才算；兼容层(cache)不算。
    const ctx = cleanCollectMeaning(o.contextDefinition);
    if (ctx && isRealContextSource(o.contextSource)) {
        return { meaning: ctx, source: 'context', detail: '本句语境释义' + ctxSourceLabel(o.contextSource) };
    }
    // ② 文章分析给出的词表释义（= word_cache，进阅读页已随详情一起下发）；
    //    卡片上带的 article/cache 占位也归这一层（它就是文章词表的同源数据）
    const wordsLoaded = Object.keys((currentArticle && currentArticle.words) || {}).length;
    const m = ctx || cleanCollectMeaning(localMeaningOf(w));
    if (m) return { meaning: m, source: 'article', detail: '文章词表' + (o.contextSource ? ctxSourceLabel(o.contextSource) : '') };
    // ③ 词典层首义（本地词典库，同步）
    const d = dictionaryOf(w);
    if (d && d.translationLines && d.translationLines.length) {
        const dm = cleanCollectMeaning(d.translationLines[0]);
        if (dm) return {
            meaning: dm,
            source: 'dictionary',
            detail: '词典层首义' + (d.via ? `（词典兜底命中：${DICT_VIA_LABELS[d.via] || d.via}）` : '')
        };
    }
    return {
        meaning: '',
        source: '',
        detail: `三层都没有（文章词表已加载 ${wordsLoaded} 词${wordsLoaded === 0 ? ' ← 词表是空的，第②层必然跳过' : ''}）`
    };
}

/** 兼容旧调用：只取释义字符串（找不到返回 ''，**不要**返回 '暂无释义'） */
function bestMeaningForCollect(word, opts) {
    return bestMeaningSourceForCollect(word, opts).meaning;
}

/**
 * 从后端「查词结果」里挑一条最合适的收藏释义。
 * 顺序：① 本句语境释义（仅 context/kb/ai）→ ② 文章词表 / 兼容层 → ③ 词典层首义。
 *
 * @param {string} word
 * @param {object} remote fetchWordDefinitions 的返回（含 contextDefinition/contextSource/dictionary）
 */
function pickCollectMeaning(word, remote) {
    const r = remote || {};
    const ctx = cleanCollectMeaning(r.contextDefinition);
    const ctxSrc = r.contextSource || null;
    // ① 真·本句语境释义
    if (ctx && isRealContextSource(ctxSrc)) {
        return { meaning: ctx, source: 'context', detail: '本句语境释义' + ctxSourceLabel(ctxSrc) };
    }
    // ② 文章词表；后端兼容层(cache)给的通用释义同源，也归这一层
    const fromArticle = cleanCollectMeaning(localMeaningOf(word)) || ctx;
    if (fromArticle) {
        return { meaning: fromArticle, source: 'article', detail: '文章词表' + (ctx ? ctxSourceLabel(ctxSrc) : '') };
    }
    // ③ 词典层首义
    const d = r.dictionary || dictionaryOf(word);
    if (d && d.translationLines && d.translationLines.length) {
        const m = cleanCollectMeaning(d.translationLines[0]);
        if (m) return {
            meaning: m,
            source: 'dictionary',
            detail: '词典层首义' + (d.via ? `（词典兜底命中：${DICT_VIA_LABELS[d.via] || d.via}）` : '')
        };
    }
    return { meaning: '', source: '', detail: '三层都没有 → 留空，等单词本兜底' };
}

/**
 * 收藏释义解析（2026-10-08 新增）：**优先收藏「用户看到的释义」，而不是词典的**。
 *
 * 为什么拖拽时必须异步查一次：拖拽收藏时**没有词卡**，前端本地只有词典层（批量预取）和文章词表，
 * 语境释义（含「联网深查」写回 word_context 的那条）只有后端知道。
 * 带的这次请求 **不带 `?ai=1`** —— 只查本地词典 + 语境库（~1ms），**不调 LLM、不烧额度**。
 *
 * 卡片路径：只有当卡片上显示的**是真正的语境释义**（contextSource ∈ context/kb/ai）时才直取，
 * 否则照样去后端查一次 —— 卡片上可能只是「文章词表占位」或「兼容层通用释义」，
 * 不能因为「有 contextDefinition」就当成语境释义（见 isRealContextSource 的注释）。
 *
 * @param {string} word
 * @param {string} sentence 本句原文（语境库按 word + context 匹配）
 * @param {object} [opts] { contextDefinition, contextSource } 卡片上已在显示的释义与来源
 * @returns {Promise<{meaning:string, source:string, detail:string}>}
 */
async function resolveCollectMeaning(word, sentence, opts) {
    const o = opts || {};
    const t0 = Date.now();
    const cardCtx = cleanCollectMeaning(o.contextDefinition);
    const cardSrc = o.contextSource || null;

    // 卡片上已经在显示「真正的本句语境释义」→ 那就是「用户看到的」，直接用，不用再问后端
    if (cardCtx && isRealContextSource(cardSrc)) {
        const picked = { meaning: cardCtx, source: 'context', detail: '本句语境释义（卡片上已在显示' + ctxSourceLabel(cardSrc) + '）' };
        console.log(`🖱️ [收藏释义] word="${word}" | 采用【${COLLECT_MEANING_SOURCES[picked.source]}】`
            + ` | ${picked.detail} | 释义="${picked.meaning.slice(0, 40)}" | 卡片直取，未发起请求`);
        return picked;
    }

    let remote = null;
    let remoteErr = null;
    try {
        remote = await fetchWordDefinitions(word, sentence);   // 不带 ai → 只查本地词典 + 语境库
    } catch (e) {
        remoteErr = (e && e.message) || String(e);
        console.warn(`🖱️ [收藏释义] 语境查询失败 → 回退纯本地优先级 | word="${word}" | ${remoteErr}`);
    }
    const picked = pickCollectMeaning(word, remote);
    // 极端兜底：后端什么都没有、但卡片上还有个占位 → 用占位（总比空好）
    if (!picked.meaning && cardCtx) {
        picked.meaning = cardCtx;
        picked.source = 'article';
        picked.detail = '文章词表' + ctxSourceLabel(cardSrc) + '（后端也无 → 用卡片占位）';
    }
    console.log(`🖱️ [收藏释义] word="${word}" | 采用【${COLLECT_MEANING_SOURCES[picked.source]}】`
        + ` | ${picked.detail} | 释义="${picked.meaning.slice(0, 40)}"`
        + ` | 语境库命中=${remote && remote.contextDefinition ? '有' : '无'}（layer=${(remote && remote.layer) || '-'}，contextSource=${(remote && remote.contextSource) || '-'}）`
        + ` | 文章词表=${Object.keys((currentArticle && currentArticle.words) || {}).length} 词`
        + ` | 词典层=${remote && remote.dictionary ? '有' : (dictionaryOf(word) ? '有' : '无')}`
        + ` | 耗时 ${Date.now() - t0}ms`
        + (remoteErr ? ` | ⚠️ 查询异常：${remoteErr}` : '')
        + `\n   └─ 语境="${String(sentence || '').slice(0, 60)}"`);
    if (picked.source === 'dictionary') {
        console.warn(`🖱️ [收藏释义] ⚠️ 只能落到「词典层首义」—— 说明本句语境释义既没在卡片上、也没在 word_context 里。`
            + `\n      若期望存「AI 翻译」查到的释义，请先在词卡里点过「🤖 AI 翻译」（它会写回 word_context），再收藏。`
            + `\n      词="${word}" | 句子="${String(sentence || '').slice(0, 60)}"`);
    }
    return picked;
}

// 查询某单词的释义（带语境 context）；返回 {definitions, source, contextDefinition, contextSource, dictionary, layer, elapsedMs}
// opts.ai = true 时带 ?ai=1，让后端走「联网深查」（L1 知识库工作流 + L3 AI 生成）。
// 默认不带 —— 后端只查本地（词典 + 语境库），响应稳定在几毫秒。
function fetchWordDefinitions(word, context, opts) {
    const o = opts || {};
    let url = '/api/words/' + encodeURIComponent(word);
    const qs = [];
    if (context) qs.push('context=' + encodeURIComponent(context));
    if (o.ai) qs.push('ai=1');
    if (qs.length) url += '?' + qs.join('&');
    return apiGet(url)
        .then(function(data) {
            return {
                definitions: (data && data.definitions) ? data.definitions : [],
                source: (data && data.source) ? data.source : 'cache',
                contextDefinition: (data && data.contextDefinition) || null,
                contextSource: (data && data.contextSource) || null,
                dictionary: (data && data.dictionary) || null,
                layer: (data && data.layer) || null,
                elapsedMs: (data && data.elapsedMs) || null
            };
        })
        .catch(function() { return { definitions: [], source: 'cache', contextDefinition: null, contextSource: null, dictionary: null }; });
}

/**
 * 把词卡放到「不会压住正文」的位置（2026-10-06 重写定位逻辑）。
 *
 * 旧实现只会放在被点单词的正上方、放不下就翻到正下方 —— 但卡片有 340×430~470px，
 * 一翻到下方就正好盖住后面 5~10 行正文。被盖住的那几行**再也收不到 mouseover**，
 * 于是「悬停句子 3 秒」完全不触发（真实浏览器实测确认，而不是猜的）。
 *
 * 新策略：优先塞进正文列**右侧的空白栏**（1440/1280 视口下 `#readContent` 右侧有
 * 468px 富余，卡片 340px 刚好放得下），次选左侧空白栏，都没有才退回旧的上下方案。
 * 这样卡片压的是右侧栏（题目区/空白），而不是用户正在读的正文。
 *
 * 另外：卡片内容会在后台核对回来后变高（实测 427 → 469px），旧实现只在 appendChild
 * 那一刻算一次位置，变高后不会重算 —— 现在由 ResizeObserver 兜住（见 showWordCard）。
 */
function positionWordCard(card, x, y) {
    if (!card) return;
    const w = card.offsetWidth || 340;
    const h = card.offsetHeight || 200;
    const vw = window.innerWidth, vh = window.innerHeight;
    const edge = 12;
    const clamp = function (v, min, max) { return Math.max(min, Math.min(v, max)); };

    const rc = (function () {
        const el = document.getElementById('readContent');
        return el ? el.getBoundingClientRect() : null;
    })();

    let m = null;
    if (rc && rc.width > 0) {
        const rightRoom = vw - rc.right;
        const leftRoom = rc.left;
        if (rightRoom >= w + edge * 2) m = { left: rc.right + edge, side: '右侧空白栏' };
        else if (leftRoom >= w + edge * 2) m = { left: rc.left - edge - w, side: '左侧空白栏' };
    }

    if (m) {
        m.top = clamp(y - h / 2, rc.top, Math.max(rc.top, vh - h - edge));
    } else {
        // 回退：老的「先上后下」，仅夹在视口内
        m = { side: '锚点上下（视口无侧边空档）', left: clamp(x - w / 2, edge, Math.max(edge, vw - w - edge)) };
        m.top = (y - h - 10 >= edge) ? (y - h - 10) : (y + 10);
    }
    m.top = clamp(m.top, edge, Math.max(edge, vh - h - edge));
    m.left = clamp(m.left, edge, Math.max(edge, vw - w - edge));

    card.style.left = Math.round(m.left) + 'px';
    card.style.top = Math.round(m.top) + 'px';
    console.log(`📍 [词卡定位] ${m.side} | left=${Math.round(m.left)} top=${Math.round(m.top)} | 卡片 ${w}×${h}`
        + ` | 正文列 ${rc ? Math.round(rc.left) + '..' + Math.round(rc.right) : '(未找到)'} | 视口 ${vw}×${vh}`);
}

// ==================== 词典层（本地 ECDICT 词典库） ====================
// 进阅读页时一次性把「本文所有词的词典释义」拉回来（一次 HTTP），此后点任何词都是
// 0 网络、0 延迟地出卡，卡片内容还是完整的（音标 / 多义项 / 词性 / 星级 / 考试标签）。
// 不预取也能用（点词时单独请求，后端本地查只要 ~1ms），预取只是省掉那次 HTTP 往返。
const dictionaryCache = {};              // { word: 词典条目 }
let dictionaryPrefetchArticleId = null;  // 已预取过的文章 id，同一篇只拉一次
// 预取是否正在进行中。词卡要判断「这个词查不到」是真的没收录、还是预取还没回来：
// dictionaryOf() 两种情况都返回 null，靠这个标记区分，才不会把「等 3 秒」和「直接放按钮」搞反。
let dictionaryPrefetchPending = false;

/** 从预取缓存里取词典条目（可能还没回来 → null） */
function dictionaryOf(word) {
    return dictionaryCache[String(word || '').toLowerCase()] || null;
}

/** 进阅读页后调用：批量预取本文所有词的词典释义 */
function prefetchDictionaryForArticle() {
    if (!currentArticle) return;
    if (dictionaryPrefetchArticleId === currentArticle.id) return;   // 同一篇只拉一次

    // 词表 = 「文章分析出的 words」∪「正文里正则抽出来的词」。
    // 只取 words 是不够的：那是 AI 挑出来的重点词，正文里点得动的 span 远不止这些，
    // 剩下那些点下去要先等一次 HTTP 才出词典释义。两个来源合并后，**点得动的每个词**
    // 都已经在本地缓存里了（一次批量请求 ~10ms 换掉此后每一次点词的往返）。
    let words = Object.keys(currentArticle.words || {});
    if (currentArticle.article) {
        const set = {};
        words.forEach(function(w) { set[String(w).toLowerCase()] = 1; });
        (String(currentArticle.article).toLowerCase().match(/[a-z]+(?:['\u2019-][a-z]+)*/g) || []).forEach(function(w) {
            if (w.length >= 2) set[w] = 1;
        });
        words = Object.keys(set);
    }
    if (words.length === 0) return;

    const articleId = currentArticle.id;
    dictionaryPrefetchArticleId = articleId;
    dictionaryPrefetchPending = true;
    const t0 = Date.now();
    const payload = words.slice(0, 2000);   // 后端上限 2000
    apiPost('/api/dictionary/batch', { words: payload })
        .then(function(data) {
            const entries = (data && data.entries) || {};
            Object.keys(entries).forEach(function(w) { dictionaryCache[w] = entries[w]; });
            console.log(`📖 [词典预取] article=${articleId} | 请求 ${payload.length} 词 | 命中 ${Object.keys(entries).length} | ${Date.now() - t0}ms`);
        })
        .catch(function(e) {
            console.warn(`📖 [词典预取] 失败（不影响点词，点词时会单独请求）| article=${articleId} | ${e && e.message}`);
        })
        .then(function() {
            // 无论成功失败都收尾，否则词卡会一直以为「还在查」而白等 3 秒。
            // 但只在「当前预取还是这一篇」时才收尾 —— 用户在请求返回前切了文章的话，
            // 收尾归后一篇负责，这里提前清掉会让后一篇的计时器误判。
            if (dictionaryPrefetchArticleId === articleId) dictionaryPrefetchPending = false;
        });
}

// 词卡指纹：同一个词 + 同一句才算「同一张卡」
function wordCardKeyOf(word, sentence) {
    return String(word || '').toLowerCase() + '\u0001' + String(sentence || '');
}

// 查本地已有释义（文章分析阶段已经算好的 words 映射）—— 语境释义的「即时占位」
function localMeaningOf(word) {
    if (!currentArticle || !currentArticle.words) return null;
    const w = String(word || '');
    return currentArticle.words[w] || currentArticle.words[w.toLowerCase()] || null;
}

// 语境释义的来源标签
const CONTEXT_SOURCE_LABELS = {
    article: { text: '文章释义', color: '#888780' },
    context: { text: '本句释义', color: '#0F6E56' },
    kb: { text: '知识库', color: '#185FA5' },
    ai: { text: 'AI 生成', color: '#993C1D' },
    cache: { text: '通用释义', color: '#854F0B' }
};

// ECDICT 考试标签 → 中文
const DICT_TAG_LABELS = {
    zk: '中考', gk: '高考', cet4: '四级', cet6: '六级',
    ky: '考研', toefl: '托福', ielts: '雅思', gre: 'GRE'
};

// 兜底命中方式的说明（缩写在释义区单独成行，其余在这里挂个小徽章）
const DICT_VIA_LABELS = {
    possessive: '所有格',
    'hyphen-head': '复合词',
    apostrophe: '撇号变体',
    'apostrophe-stripped': '撇号变体'
};

function dictBadgesHtml(dict) {
    if (!dict) return '';
    const items = [];
    if (dict.collins > 0) items.push({ text: '柯林斯 ' + dict.collins + '★', bg: '#FAEEDA', fg: '#854F0B' });
    if (dict.oxford === 1) items.push({ text: '牛津3000', bg: '#E6F1FB', fg: '#185FA5' });
    (dict.tagList || []).forEach(function(t) {
        items.push({ text: DICT_TAG_LABELS[t] || t, bg: '#EEEDFE', fg: '#534AB7' });
    });
    if (dict.lemma && dict.lemma !== dict.word) items.push({ text: '原形 ' + dict.lemma, bg: '#F1EFE8', fg: '#5F5E5A' });
    // 词典里查不到原词、是靠兜底规则找到的（student's → student）→ 说明清楚，别让用户以为点错了
    if (dict.via && DICT_VIA_LABELS[dict.via]) {
        items.push({ text: DICT_VIA_LABELS[dict.via] + ' → ' + dict.word, bg: '#F1EFE8', fg: '#5F5E5A' });
    }
    if (items.length === 0) return '';
    return '<div class="wc-badges" style="display:flex;flex-wrap:wrap;gap:0.3rem;margin-top:0.4rem;">'
        + items.map(function(i) {
            return '<span style="font-size:0.68rem;padding:0.1rem 0.45rem;border-radius:0.5rem;background:' + i.bg + ';color:' + i.fg + ';">' + escapeHtml(i.text) + '</span>';
        }).join('')
        + '</div>';
}

// 「其他释义」区块：词典层的中文义项逐条列出（后端已把字面量 \n 拆好）
// @param {string} [label] 标题文案。猜词模式下传「📚 其他释义」与「📍 正确释义」配对（2026-10-07）
function buildDictionarySectionHtml(dict, label) {
    const title = label || '其他释义';
    if (!dict) {
        return '<div class="wc-dict" style="margin-top:0.7rem;">'
            + '<div style="font-size:0.72rem;color:var(--gray);letter-spacing:0.05em;margin-bottom:0.3rem;">' + escapeHtml(title) + '</div>'
            + '<div style="font-size:0.82rem;color:var(--gray);">本地词典未收录该词</div>'
            + '</div>';
    }
    const lines = dict.translationLines || [];
    const enLines = dict.definitionLines || [];
    let body = '';
    // 缩写先给出展开式：don't ＝ do not，再看 do 的释义，对初中生比一堆词性标注有用得多
    if (dict.contraction) {
        body += '<div style="font-size:0.9rem;color:var(--primary);font-weight:600;margin-top:0.2rem;">＝ '
            + escapeHtml(dict.contraction) + '</div>';
    }
    if (lines.length > 0) {
        body += lines.map(function(l) {
            return '<div style="font-size:0.9rem;color:#333;line-height:1.6;margin-top:0.2rem;">' + escapeHtml(l) + '</div>';
        }).join('');
    } else {
        body += '<div style="font-size:0.82rem;color:var(--gray);">（词典无中文释义）</div>';
    }
    // 英文释义默认折叠：初中生基本用不到，但老师/家长可能想看
    if (enLines.length > 0) {
        body += '<details style="margin-top:0.45rem;">'
            + '<summary style="font-size:0.72rem;color:var(--gray);cursor:pointer;">展开英文释义（' + enLines.length + ' 条）</summary>'
            + '<div style="margin-top:0.3rem;padding-left:0.6rem;border-left:2px solid var(--border);">'
            + enLines.map(function(l) {
                return '<div style="font-size:0.78rem;color:#666;line-height:1.55;margin-top:0.15rem;font-style:italic;">' + escapeHtml(l) + '</div>';
            }).join('')
            + '</div></details>';
    }
    if (dict.forms && dict.forms.length > 0) {
        body += '<div style="margin-top:0.4rem;font-size:0.72rem;color:var(--gray);">词形：'
            + dict.forms.map(function(f) { return escapeHtml(f.label + ' ' + f.value); }).join(' · ')
            + '</div>';
    }
    return '<div class="wc-dict" style="margin-top:0.7rem;padding-top:0.6rem;border-top:1px solid var(--border);">'
        + '<div style="font-size:0.72rem;color:var(--gray);letter-spacing:0.05em;margin-bottom:0.3rem;">' + escapeHtml(title) + '</div>'
        + body
        + '</div>';
}

// 「当前语境释义」区块：有就高亮显示，没有就给「联网深查」入口
// 什么时候给「联网深查」按钮：只有在「这句话的释义不是真·句子级命中」时才给 ——
// 即来源是 文章释义 / 通用释义 / 压根没有。来源已经是 本句释义 / 知识库 / AI 生成 就没必要再查。
function buildContextSectionHtml(wd) {
    const src = wd.contextSource ? CONTEXT_SOURCE_LABELS[wd.contextSource] : null;
    const badge = src
        ? '<span style="font-size:0.68rem;padding:0.1rem 0.45rem;border-radius:0.5rem;background:#EAF4E0;color:' + src.color + ';margin-left:0.4rem;">' + escapeHtml(src.text) + '</span>'
        : '';
    const head = '<div style="font-size:0.72rem;color:var(--gray);letter-spacing:0.05em;margin-bottom:0.3rem;">'
        + escapeHtml(wd.sectionLabel || '当前语境释义') + '</div>';
    // 按钮文案 = 「🤖 AI 翻译」（2026-10-09 用户要求：比「联网深查本句释义」简洁好懂）。
    // 类名 `wc-btn-remote` 保持不变 —— 它是内部标识（提示条 / 测试 / revealWordCardRemoteBtn 都按它找按钮），
    // 改文案不要连带改类名。
    const REMOTE_BTN = '<button class="wc-btn wc-btn-remote" type="button" style="width:100%;margin-top:0.45rem;padding:0.5rem;border:1px solid var(--primary);border-radius:0.6rem;background:transparent;color:var(--primary);font-weight:600;cursor:pointer;font-size:0.88rem;">🤖 AI 翻译</button>';
    const worthRemote = !wd.contextPending && (!wd.contextSource || wd.contextSource === 'article' || wd.contextSource === 'cache');

    if (wd.contextDefinition) {
        return '<div class="wc-context" style="margin-top:0.5rem;">' + head
            + '<div style="display:flex;align-items:baseline;flex-wrap:wrap;">'
            + '<span style="font-size:1.1rem;color:var(--primary);font-weight:600;line-height:1.5;">' + escapeHtml(wd.contextDefinition) + '</span>'
            + badge + '</div>'
            + (wd.contextPending
                ? '<div class="wc-pending" style="margin-top:0.25rem;font-size:0.72rem;color:var(--gray);">⏳ 正在核对本句释义…</div>'
                : '')
            + (worthRemote ? REMOTE_BTN : '')
            + '</div>';
    }

    if (wd.contextPending) {
        return '<div class="wc-context" style="margin-top:0.5rem;">' + head
            + '<div class="wc-no-meaning wc-pending" style="font-size:0.92rem;color:var(--gray);">⏳ 正在查询本句释义…</div>'
            + '</div>';
    }

    // 本地没有该词的语境释义 —— 给出联网深查入口（默认不联网，用户点了才走）
    return '<div class="wc-context" style="margin-top:0.5rem;">' + head
        + '<div style="font-size:0.85rem;color:var(--gray);">本句还没有这个字的语境释义</div>'
        + REMOTE_BTN
        + '</div>';
}


// ==================== 释义锁（猜词模式，2026-10-07 新增） ====================
//
// 核心理念：用户先猜、再对照、自行判断。不强制、可跳过。
//
// 【最重要的一条】锁只影响「显示」，不影响「加载」。
//   后端照常调 API（句子翻译 / 单词释义），词典层 / L2 语境库 / L3 通用词库照常加载 ——
//   数据在点词那一刻就已经在内存里了。锁只是让卡片**先不画**这些字段。
//   所以用户点「直接看释义」时是纯本地重渲染：0 网络、0 等待，秒出。
//   ⚠️ 改这里时请守住这条：任何 `if (lock) return;` 提前跳过请求的写法都是错的。
//
// 三个 localStorage 键（读写全部包 try/catch —— 无痕模式下 setItem 会抛，
// 绝不能因为存不了偏好就让「点词」这个核心功能失效）：
//   guessMode         'on' | 'off'        全局开关。**默认 'off'（查看模式）**
//                     ★ 2026-10-08 用户要求改默认值：原来是 'on'（新文章一进来就是猜词），
//                       用户的心智是「刚打开文章先看内容，再决定要不要猜词」。
//                       改默认**不影响**「全局 + 用户手动设置」这条契约：只要用户点过开关，
//                       localStorage 里就有显式值，之后无论开哪篇（含新上传）都按他的选择走。
//   unlockedWords     ["word", ...]       已解锁的单词（小写）→ 下次点它直接显示释义
//   unlockedSentences ["sentence", ...]   已解锁的句子（归一化 key）→ 下次悬停直接显示译文

const GUESS_MODE_KEY = 'guessMode';
const UNLOCKED_WORDS_KEY = 'unlockedWords';
const UNLOCKED_SENTENCES_KEY = 'unlockedSentences';
// 单表上限：超了丢最旧的。localStorage 总共只有 ~5MB，而句子 key 一条最长 300 字，
// 不设上限的话「长期使用」会把它慢慢撑爆，最后连模式开关都写不进去。
const GUESS_UNLOCK_MAX = 800;
const GUESS_SENTENCE_KEY_MAX = 300;

let guessMode = false;       // 默认「查看模式」（2026-10-08 起；原来默认锁上）
let unlockedWords = [];      // 用数组而非 Set：要保留插入顺序才能「超限丢最旧」
let unlockedSentences = [];

// 猜测草稿 / 本次猜测结果：按「词+句」指纹索引，**刻意不塞进 wordData**。
// 因为后台核对（~1ms）、拆词结果回来时都会重绘卡片，
// 用模块级字典存，任何一条重绘路径都能自然带上，不会把用户打了一半的猜测清掉。
const guessDraftByKey = {};    // key → 输入框里的原文（实时记账）
const guessResultByKey = {};   // key → 已提交的猜测（决定卡片停在「你的猜测」形态）

/** localStorage 安全读：无痕模式 / 被策略禁用时返回 null，由调用方给默认值 */
function guessStorageGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
}
/** localStorage 安全写：配额满 / 被禁用时只记日志，不把异常抛给调用方 */
function guessStorageSet(key, value) {
    try { localStorage.setItem(key, value); return true; }
    catch (e) {
        console.warn(`🔒 [释义锁] localStorage 写入失败（${key}）：${(e && e.message) || e}`
            + ' → 本次改动只在内存生效（刷新后会丢，但功能不受影响）');
        return false;
    }
}
/** 规整成「去重 + 保序」的字符串数组：历史脏数据（重复项 / null / 非字符串）不至于把后续逻辑带崩 */
function guessNormalizeList(raw) {
    if (!Array.isArray(raw)) return [];
    const seen = {};
    const out = [];
    for (let i = 0; i < raw.length; i++) {
        const s = String(raw[i] == null ? '' : raw[i]).trim();
        if (!s || seen[s]) continue;
        seen[s] = true;
        out.push(s);
    }
    return out;
}
function guessLoadJsonArray(key) {
    const raw = guessStorageGet(key);
    if (!raw) return [];
    try { return guessNormalizeList(JSON.parse(raw)); }
    catch (e) {
        console.warn(`🔒 [释义锁] ${key} 解析失败（${(e && e.message) || e}）→ 当作空表处理`);
        return [];
    }
}

/**
 * 启动时载入。
 *
 * ★ 2026-10-08 改默认值：只有**显式写过 'on'** 才锁上（猜词模式）；null / 空串 / 脏值
 *   一律当「查看模式」—— 用户要求「新文章默认先看内容，想猜再手动切」。
 *   「全局 + 用户手动设置」契约不变：开关一拨就落盘，之后所有文章（含新上传）都沿用。
 */
function loadGuessLockState() {
    const raw = guessStorageGet(GUESS_MODE_KEY);
    guessMode = (raw === 'on');
    const from = (raw === null || raw === '')
        ? '默认（查看模式）'
        : `localStorage.${GUESS_MODE_KEY}="${raw}"（用户手动设置）`;
    unlockedWords = guessLoadJsonArray(UNLOCKED_WORDS_KEY);
    unlockedSentences = guessLoadJsonArray(UNLOCKED_SENTENCES_KEY);
    console.log(`🔒 [释义锁] 状态载入 | 模式=${guessMode ? '🔒 猜词模式' : '🔓 查看模式'} | 来源=${from}`
        + ` | 已解锁单词=${unlockedWords.length} 个 | 已解锁句子=${unlockedSentences.length} 句`);
}

/**
 * 句子的解锁 key：复用正文句子匹配用的归一化（小写 / 去站标 / 去标点 / 压空白）再截断。
 * 为什么不让调用方直接拿原句当 key：「同一句因重新渲染多了个尾空格、或标点从全角变半角」
 * 就会变成两条记录，用户明明解锁过却还要再猜一次。归一化把这类差异吃掉。
 */
function sentenceLockKey(sentence) {
    return normalizeSentence(sentence || '').slice(0, GUESS_SENTENCE_KEY_MAX);
}
function isWordUnlocked(word) {
    const k = String(word || '').trim().toLowerCase();
    return !!k && unlockedWords.indexOf(k) >= 0;
}
function isSentenceUnlocked(sentence) {
    const k = sentenceLockKey(sentence);
    return !!k && unlockedSentences.indexOf(k) >= 0;
}

/** 这个单词的释义现在该不该直接显示？· 查看模式全显示 · 猜词模式只显示解锁过的 */
function isMeaningRevealed(word) {
    if (!guessMode) return true;
    return isWordUnlocked(word);
}
/** 这句话的译文现在该不该直接显示？ */
function isSentenceRevealed(sentence) {
    if (!guessMode) return true;
    return isSentenceUnlocked(sentence);
}

/** 记下「这个词解锁过了」：下次点它直接显示释义，不再让用户猜 */
function unlockWord(word) {
    const k = String(word || '').trim().toLowerCase();
    if (!k || unlockedWords.indexOf(k) >= 0) return false;
    unlockedWords.push(k);
    if (unlockedWords.length > GUESS_UNLOCK_MAX) {
        const dropped = unlockedWords.splice(0, unlockedWords.length - GUESS_UNLOCK_MAX);
        console.log(`🔒 [释义锁] unlockedWords 超上限 ${GUESS_UNLOCK_MAX} → 淘汰最旧的 ${dropped.length} 个`);
    }
    guessStorageSet(UNLOCKED_WORDS_KEY, JSON.stringify(unlockedWords));
    console.log(`🔒 [释义锁] "${k}" 已解锁 → 共 ${unlockedWords.length} 个（下次点它直接显示释义）`);
    return true;
}

/** 记下「这句话解锁过了」：下次悬停直接显示译文 */
function unlockSentence(sentence) {
    const k = sentenceLockKey(sentence);
    if (!k || unlockedSentences.indexOf(k) >= 0) return false;
    unlockedSentences.push(k);
    if (unlockedSentences.length > GUESS_UNLOCK_MAX) {
        const dropped = unlockedSentences.splice(0, unlockedSentences.length - GUESS_UNLOCK_MAX);
        console.log(`🔒 [释义锁] unlockedSentences 超上限 ${GUESS_UNLOCK_MAX} → 淘汰最旧的 ${dropped.length} 句`);
    }
    guessStorageSet(UNLOCKED_SENTENCES_KEY, JSON.stringify(unlockedSentences));
    console.log(`🔒 [释义锁] 句子已解锁 → 共 ${unlockedSentences.length} 句 | "${k.slice(0, 40)}…"`);
    return true;
}

/** 顶部开关的文案 / 配色同步（DOM 缺失时静默跳过，不影响逻辑） */
function syncGuessLockButton() {
    const btn = document.getElementById('guessLockBtn');
    if (!btn) return;
    btn.textContent = guessMode ? '🔒 猜词模式' : '🔓 查看模式';
    btn.classList.toggle('lock-on', guessMode);
    btn.title = guessMode
        ? '当前：点词先猜一猜，不直接显示释义（点这里切到查看模式）'
        : '当前：点词直接显示释义（点这里切到猜词模式）';
}

/** 开关：🔒 猜词模式 ↔ 🔓 查看模式 */
function toggleGuessLock() {
    setGuessMode(guessMode ? 'off' : 'on');
}
function setGuessMode(mode) {
    const on = (mode !== 'off');
    if (on === guessMode) { syncGuessLockButton(); return; }
    guessMode = on;
    guessStorageSet(GUESS_MODE_KEY, on ? 'on' : 'off');
    console.log(`🔒 [释义锁] 开关切换 → ${on ? '🔒 猜词模式（点词先猜）' : '🔓 查看模式（点词直接看释义）'}`
        + ` | 已写入 localStorage.${GUESS_MODE_KEY}`);
    syncGuessLockButton();
    // 浮层的内容与模式强相关，留在屏幕上会自相矛盾 → 直接收起
    hideSentenceHoverPanel();
    // 词卡原地重渲染：锁上 → 回到猜测框；解锁 → 直接显示释义
    if (currentWordCard && currentWordCardData && currentWordCardData.word) {
        // 丢掉 __guessView 让它按新模式重新判定（否则会停在上一模式的形态）
        const base = Object.assign({}, currentWordCardData, { __guessView: null });
        console.log(`🔒 [释义锁] 模式变化 → 原地重渲染当前词卡 "${base.word}"（纯本地，零网络）`);
        showWordCard(base, base._x, base._y);
    }
}

/**
 * 点「提交」：记下猜测 → 与真实释义并排显示 → 该词写入 unlockedWords。
 * 【刻意不做对错判断】不加颜色、不打勾叉 —— 用户明确要求「让用户自行对照」。
 */
function submitGuess(word, sentence, selectedText, guessText, x, y) {
    const key = wordCardKeyOf(word, sentence);
    const guess = String(guessText || '').trim();
    guessDraftByKey[key] = guess;
    guessResultByKey[key] = guess;
    console.log(`🔒 [释义锁] "${word}" 提交猜测="${guess || '(空)'}" → 展示释义对照`
        + '（不判对错，交给用户自行判断；释义来自内存，零网络）');
    unlockWord(word);
    rerenderWordCardAs('echo', word, sentence, selectedText, x, y);
}

/** 点「直接看释义」：跳过猜测（用户随时可以不猜） */
function revealWordMeaning(trigger, word, sentence, selectedText, x, y) {
    console.log(`🔒 [释义锁] "${word}" ${trigger} → 跳过猜测，直接显示释义（本地重绘、零网络）`);
    unlockWord(word);
    rerenderWordCardAs('full', word, sentence, selectedText, x, y);
}

/**
 * 用指定形态原地重绘当前词卡。
 * 形态由 `__guessView` 显式指定，而**不是**交给 isMeaningRevealed 重新判定 ——
 * 因为「提交」那一刻词已经被写进 unlockedWords，重新判定会得到 'full'，
 * 把用户刚敲下的那句猜测从屏幕上抹掉（他连自己写了什么都看不到了）。
 * 下一次点这个词才会走自动判定（= 'full'）。
 */
function rerenderWordCardAs(view, word, sentence, selectedText, x, y) {
    const base = currentWordCardData || {};
    showWordCard(Object.assign({}, base, {
        word: word, sentence: sentence, selectedText: selectedText,
        __guessView: view,
        _x: (x === undefined ? base._x : x),
        _y: (y === undefined ? base._y : y)
    }), (x === undefined ? base._x : x), (y === undefined ? base._y : y));
}

// 恢复上次的模式与已解锁词句。
// ⚠️ 放在**脚本载入时**执行，不放 DOMContentLoaded：app.js 在 </body> 前加载，
// localStorage 此时已可用；这样「默认模式」在第一帧渲染前就定了，不会先按默认画一遍再跳。
// （另一个现实原因：无头测试不会派发 DOMContentLoaded，状态永远载入不了。）
loadGuessLockState();

/**
 * 点词打开释义卡片（2026-10-05 改为「词典式」两栏 + 全本地即时）
 *
 * 卡片结构：
 *   顶部      单词 + 音标 + 星级/考试标签徽章
 *   第一栏    「当前语境释义」—— 这句话里它是什么意思（本句释义 / 知识库 / AI 生成）
 *   第二栏    「其他释义」—— 词典里这个词的全部义项（音标 + 多义项 + 英文释义 + 词形变化）
 *
 * 快在哪：
 *   词典条目在进阅读页时就批量预取好了（dictionaryCache），语境释义的占位来自文章分析结果，
 *   所以卡片是**同步**弹出来的（0 延迟、0 网络）。然后后台再打一次「只查本地」的接口
 *   （后端 ~1ms）把语境释义换成精确的「本句释义」。整个默认路径不碰 Coze、不碰 LLM。
 *   真要看联网结果，卡片里有「联网深查」按钮 —— 用户主动点才走 L1/L3。
 */
function openWordCard(word, sentence, selectedText, x, y) {
    const localMeaning = localMeaningOf(word);
    const dict = dictionaryOf(word);

    // ① 同步出卡（词典条目 + 文章分析得到的语境释义占位）
    showWordCard({
        word: word,
        sentence: sentence,
        selectedText: selectedText,
        contextDefinition: localMeaning || null,
        contextSource: localMeaning ? 'article' : null,
        contextPending: true,                 // 后台还在核对本句释义
        dictionary: dict,
        definitions: localMeaning ? [{ definition: localMeaning, part_of_speech: null }] : [],
        source: localMeaning ? 'cache' : (dict ? 'dictionary' : 'none')
    }, x, y);
    console.log(`🔍 [点词] word="${word}" | 同步出卡 | 词典=${dict ? `${dict.translationLines.length} 义项` : '无（未预取或未收录）'} | 文章释义=${localMeaning ? '有' : '无'} | 音标=${dict && dict.phoneticPretty ? '/' + dict.phoneticPretty + '/' : '无'}`);

    // ② 后台核对「本句释义」（只查本地，后端 ~1ms；不联网）
    fetchWordDefinitions(word, sentence).then(function(result) {
        const payload = {
            contextDefinition: result.contextDefinition || null,
            contextSource: result.contextSource || null,
            contextPending: false,
            dictionary: result.dictionary || dict,
            definitions: result.definitions,
            source: result.source
        };
        console.log(`🔍 [点词] word="${word}" | 本地核对完成 ${result.elapsedMs}ms | 本句释义=${result.contextDefinition ? '有(' + result.contextSource + ')' : '无'} | 词典=${payload.dictionary ? payload.dictionary.translationLines.length + ' 义项' : '无'}`);
        updateWordCardIfOpen(word, sentence, payload, x, y);

        // ③ 问题二：合并词「词典 + 语境 + 通用词库」全都查不到 → 尝试拆粘连词（0 联网）
        const d2 = payload.dictionary || dict;
        const hasDict = !!(d2 && d2.translationLines && d2.translationLines.length);
        const hasCtx = !!payload.contextDefinition;
        const hasDefs = !!(payload.definitions && payload.definitions.length);
        if (!hasDict && !hasCtx && !hasDefs) {
            console.log(`🧩 [拆词] word="${word}" 各层均无释义 → 触发拆词（本地词典分词）`);
            requestGlueSplit(word, sentence, x, y);
        } else {
            console.log(`🧩 [拆词] word="${word}" 已有释义（词典=${hasDict} 语境=${hasCtx} 通用=${hasDefs}）→ 不拆`);
        }
    });
}

/**
 * 后台结果回来时刷新卡片。只有当「当前打开的还是同一个词 + 同一句」才刷新，
 * 避免用户已经点了别的词，旧请求回来把卡片覆盖掉。
 * @param {object|null} payload 传 null 表示「只是别再显示查询中」
 */
function updateWordCardIfOpen(word, sentence, payload, x, y) {
    if (!currentWordCard) return;
    if (currentWordCardKey !== wordCardKeyOf(word, sentence)) return; // 已经不是这张卡了

    // 释义锁：猜词形态下卡片上**一个字释义都没有**，后台精修回来重绘它纯属白费 ——
    // 而且重绘会重建输入框（丢焦点、丢光标），用户正打字时尤其难受。
    // 所以这里只把新数据并进 currentWordCardData，等用户点「提交 / 直接看释义」那次重绘自然就用上了。
    if (currentWordCardData && currentWordCardData.__guessView === 'guess') {
        console.log(`🔒 [释义锁] "${word}" 仍在猜词形态 → 后台精修结果只更新内存、不重绘（保住输入焦点）`);
        currentWordCardData = Object.assign({}, currentWordCardData, {
            contextDefinition: (payload && payload.contextDefinition) || currentWordCardData.contextDefinition,
            contextSource: (payload && payload.contextSource) || currentWordCardData.contextSource,
            contextPending: false,
            dictionary: (payload && payload.dictionary) || currentWordCardData.dictionary,
            definitions: (payload && payload.definitions && payload.definitions.length)
                ? payload.definitions : currentWordCardData.definitions,
            source: (payload && payload.source) || currentWordCardData.source
        });
        return;
    }

    // 语境释义：本地若有就用它、否则保留卡片上已有的（比如文章释义），避免越刷新越少
    const ctxDef = (payload && payload.contextDefinition) || null;
    const keepSame = !ctxDef && currentWordCardKey === wordCardKeyOf(word, sentence);
    const prevCtx = keepSame ? currentWordCard.getAttribute('data-ctx-def') : null;
    const prevSrc = keepSame ? currentWordCard.getAttribute('data-ctx-src') : null;
    const nextCtxDef = ctxDef || (prevCtx ? decodeURIComponent(prevCtx) : null);
    const nextDict = (payload && payload.dictionary) || dictionaryOf(word);

    // 即便「毫无新信息」（语境空 + 词典未收录）也要重绘这一次：
    //   contextPending 落到 false 后，卡片会露出「联网深查」入口，横幅从「正在查询」切到「本句还没有…」。
    showWordCard({
        word: word,
        sentence: sentence,
        selectedText: word,   // 选中的文本仍按单词算，保证「标记/收藏」行为一致
        // 保持当前形态：'echo'（刚提交过猜测）不能在后台刷新时被打回 'full'，
        // 否则用户刚写下的那句猜测会从屏幕上消失
        __guessView: (currentWordCardData && currentWordCardData.__guessView) || null,
        contextDefinition: nextCtxDef,
        contextSource: (payload && payload.contextSource) || (prevSrc || null),
        contextPending: false,
        dictionary: nextDict,
        definitions: (payload && payload.definitions && payload.definitions.length)
            ? payload.definitions
            : (nextCtxDef
                ? [{ definition: nextCtxDef, part_of_speech: null }]
                : ((nextDict && nextDict.translationLines && nextDict.translationLines.length)
                    ? [{ definition: nextDict.translationLines[0], part_of_speech: null }]
                    : [])),
        source: (payload && payload.source) || 'cache'
    }, x, y);
}

/** 用户点「🤖 AI 翻译」：这条路径才走 Coze 工作流 / LLM，慢但更准 */
function remoteLookupWordCard(word, sentence, x, y) {
    const btn = currentWordCard ? currentWordCard.querySelector('.wc-btn-remote') : null;
    if (btn) { btn.disabled = true; btn.textContent = '⏳ AI 翻译中…'; }
    console.log(`🔎 [点词-联网深查] word="${word}" | 开始（L1 知识库工作流 + L3 AI）`);
    const t0 = Date.now();
    fetchWordDefinitions(word, sentence, { ai: true }).then(function(result) {
        console.log(`🔎 [点词-联网深查] word="${word}" | 完成 ${Date.now() - t0}ms | 本句释义=${result.contextDefinition ? '有(' + result.contextSource + ')' : '无'}`);
        updateWordCardIfOpen(word, sentence, {
            contextDefinition: result.contextDefinition || null,
            contextSource: result.contextSource || null,
            contextPending: false,
            dictionary: result.dictionary || dictionaryOf(word),
            definitions: result.definitions,
            source: result.source
        }, x, y);
    }).catch(function(e) {
        console.warn(`🔎 [点词-联网深查] 失败: ${e && e.message}`);
        if (btn) { btn.disabled = false; btn.textContent = '🤖 AI 翻译'; }
    });
}

// 绑定「自行输入释义」表单的保存逻辑：写入 word_cache 后刷新卡片
function wireMeaningSave(card, word, sentence, selectedText, x, y) {
    const saveBtn = card.querySelector('.wc-save-btn');
    if (!saveBtn) return;
    saveBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        const input = card.querySelector('.wc-input');
        const select = card.querySelector('.wc-pos-select');
        const definition = (input && input.value || '').trim();
        if (!definition) { toast('请先输入释义'); return; }
        const part_of_speech = select ? select.value : '其他';
        saveBtn.disabled = true;
        apiPost('/api/words', { word: word, definition: definition, part_of_speech: part_of_speech, context: sentence })
            .then(function() {
                toast('释义已保存');
                fetchWordDefinitions(word, sentence).then(function(result) {
                    const dict = result.dictionary || dictionaryOf(word);
                    // 刚存进去的释义作为语境释义兜底，保证重绘后卡片不会比刚存前还空
                    const ctxDef = result.contextDefinition || definition;
                    showWordCard({
                        word: word,
                        sentence: sentence,
                        selectedText: selectedText,
                        contextDefinition: ctxDef,
                        contextSource: result.contextSource || 'cache',
                        contextPending: false,
                        dictionary: dict,
                        definitions: result.definitions && result.definitions.length
                            ? result.definitions
                            : [{ definition: definition, part_of_speech: part_of_speech }],
                        source: result.source
                    }, x, y);
                });
            })
            .catch(function() {
                toast('保存失败，请重试');
                saveBtn.disabled = false;
            });
    });
}

// ==================== 粘连词「拆分释义」（问题二，2026-10-07） ====================
//
// 现象：文章正文常因 PDF/OCR 抽取丢空格，产生 `rapiddevelopment`（rapid + development）、
//       `thinkprivate`（think + private）这类**粘连词**。点上去词典必然查不到，用户只看到「未收录」。
// 期望（用户）：先查合并词；查不到就拆成 rapid / development，分别给释义，
//       卡片上按「合并 → 分开」逐行展示。
// 实现：后端 `GET /api/glue-word/:word` 用本地 ECDICT 当词表做动态规划分词（0 联网、0 额度）；
//       这里只负责「什么时候问 + 怎么展示」。AI 兜底要用户主动点「AI 拆词」才会带上 ?ai=1。

const glueSplitCache = {};       // word → 拆词接口响应（同一篇里同词只问一次）
const glueSplitInFlight = {};    // word → Promise，防并发重复请求

/**
 * 「拆分释义」区块：合并词一行 + 拆开后的每段各一行。
 * 合并词本身不是英语单词（词典未收录）时如实说明，不糊弄成「暂无释义」。
 */
function buildGlueSplitSectionHtml(split, word) {
    if (!split || !split.isGlued || !(split.parts || []).length) return '';
    const mergedEntry = split.merged && split.merged.entry;
    const rows = [];

    // ① 合并词（用户明确要求保留这一行：合并 → 释义「如果有」）
    rows.push(glueRowHtml({
        label: (split.merged && split.merged.word) || word,
        tag: '合并',
        tagBg: '#F1EFE8', tagFg: '#5F5E5A',
        entry: mergedEntry,
        fallback: '词典未收录（这个词本身不是英语单词，是几个词粘在了一起）'
    }));

    // ② 拆开后的每一段
    (split.parts || []).forEach(function (p) {
        rows.push(glueRowHtml({
            label: p.word,
            tag: '分开',
            tagBg: '#E6F1FB', tagFg: '#185FA5',
            entry: p.entry,
            fallback: p.fallbackMeaning || '词典未收录'
        }));
    });

    const methodLabel = split.method === 'ai-assist' ? 'AI 辅助拆分' : '本地词典分词';
    return '<div class="wc-glue" style="margin-top:0.7rem;padding-top:0.6rem;border-top:1px solid var(--border);">'
        + '<div style="font-size:0.72rem;color:var(--gray);letter-spacing:0.05em;margin-bottom:0.3rem;">'
        + '拆分释义 <span style="font-weight:400;">（这个词是几个词粘在一起的 · ' + escapeHtml(methodLabel) + '）</span></div>'
        + rows.join('')
        + '</div>';
}

/** 拆分释义里的一行：标签 + 单词（+音标）+ 该词的全部义项 */
function glueRowHtml(o) {
    const entry = o.entry;
    const lines = (entry && entry.translationLines) || [];
    const phonetic = (entry && entry.phoneticPretty)
        ? `<span style="color:var(--gray);font-size:0.75rem;font-family:var(--font-mono);font-weight:400;margin-left:0.3rem;">/${escapeHtml(entry.phoneticPretty)}/</span>`
        : '';
    let body;
    if (lines.length) {
        body = lines.slice(0, 4).map(function (l) {
            return '<div style="font-size:0.88rem;color:#333;line-height:1.55;">' + escapeHtml(l) + '</div>';
        }).join('')
            + (lines.length > 4
                ? '<div style="font-size:0.72rem;color:var(--gray);">…共 ' + lines.length + ' 个义项</div>'
                : '');
    } else {
        body = '<div style="font-size:0.82rem;color:var(--gray);">' + escapeHtml(o.fallback || '未收录') + '</div>';
    }
    return '<div style="display:flex;gap:0.5rem;align-items:flex-start;margin-top:0.45rem;">'
        + '<span style="flex:none;font-size:0.68rem;font-weight:700;padding:0.1rem 0.4rem;border-radius:0.4rem;background:'
        + o.tagBg + ';color:' + o.tagFg + ';margin-top:0.15rem;">' + escapeHtml(o.tag) + '</span>'
        + '<div style="min-width:0;flex:1;">'
        + '<div style="font-size:0.95rem;font-weight:600;color:var(--primary);">' + escapeHtml(o.label) + phonetic + '</div>'
        + body
        + '</div></div>';
}

/** 结果回来后，只有在「用户还在看这个词 + 这句话」时才重绘卡片 */
function attachGlueSplit(word, sentence, x, y, split) {
    if (!currentWordCard) return;
    if (currentWordCardKey !== wordCardKeyOf(word, sentence)) {
        console.log(`🧩 [拆词] "${word}" 结果回来时卡片已切换 → 丢弃（不覆盖用户当前在看的那张）`);
        return;
    }
    // 释义锁：猜词形态下「拆分释义」区块根本不显示 —— 同样只记进内存，不重绘（理由同上）
    if (currentWordCardData && currentWordCardData.__guessView === 'guess') {
        console.log(`🔒 [释义锁] "${word}" 仍是猜词形态 → 拆词结果先入缓存，不重绘`);
        currentWordCardData = Object.assign({}, currentWordCardData, { glueSplit: split || null });
        return;
    }
    if (!split || !split.isGlued) {
        console.log(`🧩 [拆词] "${word}" 无可拆切分 → 卡片保持不变（按钮状态还原）`);
    }
    showWordCard(Object.assign({}, currentWordCardData || {}, {
        word: word, sentence: sentence, selectedText: word,
        glueSplit: split || null
    }), x, y);
}

/**
 * 请求拆词。默认只走本地词典分词；opts.allowAI=true 时才带 ?ai=1（用户主动点「AI 拆词」）。
 */
function requestGlueSplit(word, sentence, x, y, opts) {
    const o = opts || {};
    const key = String(word || '').trim().toLowerCase();
    if (!key || key.length < 6 || !/^[a-z]+$/.test(key)) return Promise.resolve(null);

    if (glueSplitCache[key]) {
        attachGlueSplit(word, sentence, x, y, glueSplitCache[key]);
        return Promise.resolve(glueSplitCache[key]);
    }
    if (glueSplitInFlight[key]) return glueSplitInFlight[key];

    const t0 = Date.now();
    console.log(`🧩 [拆词] "${key}" 合并词与语境都没有释义 → 请求拆词接口`
        + `（${o.allowAI ? '允许 AI 兜底' : '本地词典分词，不联网'}）`);
    const p = apiGet('/api/glue-word/' + encodeURIComponent(key) + (o.allowAI ? '?ai=1' : ''))
        .then(function (r) {
            glueSplitCache[key] = r;
            const dt = Date.now() - t0;
            if (r && r.isGlued) {
                console.log(`🧩 [拆词] "${key}" → ${r.parts.map(function (x2) { return x2.word; }).join(' + ')}`
                    + `（${r.method} | ${dt}ms，接口内部 ${r.elapsedMs}ms）`);
            } else {
                console.log(`🧩 [拆词] "${key}" 拆不出（合并词收录=${!!(r && r.merged && r.merged.found)} | ${dt}ms）`
                    + ' → 卡片只保留「合并词未收录」，不硬凑');
            }
            attachGlueSplit(word, sentence, x, y, r);
            return r;
        })
        .catch(function (e) {
            console.warn(`🧩 [拆词] "${key}" 请求失败: ${(e && e.message) || e}`);
            return null;
        })
        .then(function (r) { delete glueSplitInFlight[key]; return r; });

    glueSplitInFlight[key] = p;
    return p;
}

// ==================== 释义锁：词卡上的两个片段（2026-10-07） ====================

/**
 * 「先猜一猜」表单（猜词模式 + 该词未解锁时，卡片里唯一有内容的一块）。
 * 输入框的 value 走 escapeAttr —— 用户打一个 `"` 就能把属性提前闭合、把卡片结构搅乱。
 */
function buildGuessSectionHtml(word, sentence, key) {
    const draft = guessDraftByKey[key] || '';
    const inputStyle = 'width:100%;box-sizing:border-box;padding:0.6rem 0.7rem;border:1px solid var(--border);'
        + 'border-radius:0.6rem;font-size:0.95rem;outline:none;background:#fff;';
    const btnBase = 'flex:1;padding:0.6rem 0.5rem;border-radius:0.6rem;font-size:0.85rem;font-weight:600;cursor:pointer;';
    return '<div class="wc-guess" style="margin-top:0.6rem;">'
        + '<div style="font-size:0.85rem;color:var(--primary-dark);font-weight:600;margin-bottom:0.45rem;">🤔 先猜一猜：</div>'
        + '<input class="wc-guess-input" type="text" autocomplete="off" autocapitalize="off" spellcheck="false"'
        + ' placeholder="输入你的猜测…" value="' + escapeAttr(draft) + '" style="' + inputStyle + '" />'
        + '<div style="display:flex;gap:0.5rem;margin-top:0.6rem;">'
        + '<button class="wc-btn wc-btn-guess-submit" type="button" style="' + btnBase + 'border:none;background:var(--primary);color:#fff;">提交</button>'
        + '<button class="wc-btn wc-btn-guess-reveal" type="button" style="' + btnBase + 'border:1px solid var(--border);background:#fff;color:var(--text);">直接看释义</button>'
        + '</div>'
        + '</div>';
}

/**
 * 「你的猜测」回显（刚点过提交时）。
 * 只做并列展示：下面紧跟 📍 正确释义 / 📚 其他释义，**不给任何对错判定**。
 */
function buildGuessEchoHtml(word, key) {
    const guess = guessResultByKey[key] || '';
    const shown = guess
        ? escapeHtml(guess)
        : '<span style="color:var(--gray);">（未填写，直接看的释义）</span>';
    return '<div class="wc-guess-result" style="margin-top:0.6rem;padding:0.55rem 0.7rem;background:var(--bg-light);border-radius:0.6rem;">'
        + '<div style="font-size:0.72rem;color:var(--gray);letter-spacing:0.05em;">你的猜测</div>'
        + '<div class="wc-guess-mine" style="font-size:1rem;color:var(--text);line-height:1.5;margin-top:0.15rem;word-break:break-word;">' + shown + '</div>'
        + '</div>';
}

function showWordCard(wordData, x, y) {
    // 释义锁：重绘会重建 DOM，猜测框会丢焦点与光标位置。
    // 先记下「重绘前焦点是否在猜测框里、光标在哪」，重绘后原样恢复 ——
    // 否则用户刚点开词就开始打字，1ms 后后台核对回来一重绘，字就打不进去了。
    const prevFocusIsGuess = !!(document.activeElement && document.activeElement.classList
        && document.activeElement.classList.contains('wc-guess-input'));
    const prevCaret = prevFocusIsGuess ? (document.activeElement.selectionStart || 0) : 0;
    hideWordCard();
    // 互斥：显示单词释义卡片时，隐藏句子翻译浮层并取消待触发的悬停计时
    hideSentenceHoverPanel();
    clearSentenceHoverTimer('显示词卡（与句子浮层互斥）');
    const { word, sentence, selectedText } = wordData;
    // 兼容旧调用（传 meaning 字符串）与新的多释义调用（传 definitions 数组）
    let definitions = wordData.definitions;
    if (!Array.isArray(definitions)) {
        const m = wordData.meaning;
        definitions = (m && m !== '暂无释义') ? [{ definition: m, part_of_speech: null }] : [];
    }
    
    const card = document.createElement('div');
    card.className = 'word-card';
    
    const articleId = currentArticle ? currentArticle.id : null;
    
    // 获取规范化的句子（和收藏时存储的格式一致）
    const { cleanSentence } = getWordPositionIndices(sentence);
    const normalizedSentence = cleanSentence || sentence;
    
    // 用 word + articleId + sentence 三者组合判断是否已收藏
    const isAlreadyCollected = isWordCollectedInThisSentence(word, articleId, normalizedSentence);
    
    // 顶部：大字号单词 + 发音按钮
    const wordRow = `
        <div class="wc-word-row">
            <span class="wc-word">${word}</span>
            <button class="wc-speak-btn" title="播放发音" type="button">🔊</button>
        </div>`;
    // 词典层：音标 + 星级/考试标签（来自本地 ECDICT，进阅读页时已批量预取）
    const dict = wordData.dictionary || dictionaryOf(word);

    // ===== 释义锁（2026-10-07）：先决定这张卡长什么样 =====
    //   'full'  —— 查看模式 / 该词已解锁过：原有完整卡片
    //   'guess' —— 猜词模式且该词未解锁：只有单词 + 发音 + 句子 + 猜测框，释义一个字都不画
    //   'echo'  —— 刚点过「提交」：用户的猜测 + 真释义并排（内容同 full，只多一行「你的猜测」）
    // __guessView 是**显式指定**、不是重新判定 —— 见 rerenderWordCardAs 的注释：
    // 提交那一刻词已写进 unlockedWords，重新判定会得到 'full'，把用户刚敲下的猜测从屏幕上抹掉。
    let guessView = wordData.__guessView;
    if (guessView !== 'guess' && guessView !== 'echo' && guessView !== 'full') {
        guessView = isMeaningRevealed(word) ? 'full' : 'guess';
    }
    const isGuessView = (guessView === 'guess');
    const showMeanings = !isGuessView;      // guess 之外的两种形态都要画释义
    const guessKey = wordCardKeyOf(word, sentence);

    if (isGuessView) {
        console.log(`🔒 [释义锁] 点词 "${word}" → 未解锁，只画猜测框`
            + `（释义其实已备好：词典 ${(dict && dict.translationLines) ? dict.translationLines.length : 0} 义项`
            + ` / 文章释义 ${wordData.contextDefinition ? '有' : '无'} → 先不画，解锁时本地重绘秒出）`);
    }

    // 音标与徽章同样只在 showMeanings 时渲染：徽章里的「原形 student」「牛津3000」「柯林斯 5★」
    // 基本等于把答案递过去（用户明确要求锁定期间一起藏）。
    const phoneticHtml = (showMeanings && dict && dict.phoneticPretty)
        ? `<div class="wc-phonetic" style="margin-top:0.2rem;font-size:0.85rem;color:var(--gray);font-family:var(--font-mono);">/${escapeHtml(dict.phoneticPretty)}/</div>`
        : '';
    const badgesHtml = showMeanings ? dictBadgesHtml(dict) : '';
    // 第一栏：语境释义。猜词对照时改标题为「📍 正确释义」，与上面的「你的猜测」配成一对
    const contextHtml = showMeanings ? buildContextSectionHtml({
        contextDefinition: wordData.contextDefinition || null,
        contextSource: wordData.contextSource || null,
        contextPending: !!wordData.contextPending,
        sectionLabel: (guessView === 'echo') ? '📍 正确释义' : null
    }) : '';
    // 第二栏：其他释义（词典里的全部义项）
    const dictionaryHtml = showMeanings
        ? buildDictionarySectionHtml(dict, (guessView === 'echo') ? '📚 其他释义' : null)
        : '';
    // 第三栏：拆分释义（粘连词，问题二）—— 命中缓存就直接渲染，不必等这次请求
    const glueSplit = wordData.glueSplit || glueSplitCache[String(word || '').toLowerCase()] || null;
    const glueHtml = showMeanings ? buildGlueSplitSectionHtml(glueSplit, word) : '';
    // 合并词本词典没有、语境也没有、拆也拆不出 → 给一个「AI 拆词」入口（默认不联网，用户点了才走）
    const lowerWord = String(word || '').toLowerCase();
    const hasDictMeaning = !!(dict && dict.translationLines && dict.translationLines.length);
    const hasCtxMeaning = !!wordData.contextDefinition;
    const hasAnyMeaning = hasDictMeaning || hasCtxMeaning || (definitions && definitions.length > 0);
    const canAiSplit = showMeanings && !hasAnyMeaning && !(glueSplit && glueSplit.isGlued) && /^[a-z]{6,}$/.test(lowerWord);
    const glueAiBtnHtml = canAiSplit
        ? '<button class="wc-btn wc-btn-glue-ai" type="button" style="width:100%;margin-top:0.45rem;padding:0.5rem;border:1px dashed var(--primary);border-radius:0.6rem;background:transparent;color:var(--primary);font-weight:600;cursor:pointer;font-size:0.88rem;">🔎 用 AI 拆开这个词</button>'
        : '';
    // 旧的 definitions 数组仍用于「标记/收藏」时的释义文本，不再直接渲染
    const sentenceHtml = `<div class="wc-sentence">"${sentence}"</div>`;
    // 统一的「自行输入释义」入口。只在显示释义时给 —— 猜测框里再摆一个「自己写释义」纯属分心
    const addMeaningHtml = showMeanings ? `
        <button class="wc-btn wc-btn-add-meaning" type="button" style="width:100%;margin-top:0.5rem;padding:0.5rem;border:1px dashed var(--primary);border-radius:0.6rem;background:transparent;color:var(--primary);font-weight:600;cursor:pointer;font-size:0.9rem;">✎ 自行输入释义</button>
        <div class="wc-meaning-form"></div>` : '';
    // 释义锁的两块内容：未解锁 → 猜测框；刚提交 → 「你的猜测」回显
    const guessHtml = isGuessView
        ? buildGuessSectionHtml(word, sentence, guessKey)
        : ((guessView === 'echo') ? buildGuessEchoHtml(word, guessKey) : '');

    // 底部动作区：猜词模式下**整块隐藏**（用户明确要求「锁定期间不出现标记/收藏」）——
    // 否则「先收藏、再去生词本看释义」就是一条绕过锁的近路。
    // （拖拽收藏由正文的 word-span 承担，不受这里影响；已收藏的样式也照常生效）
    const actionsHtml = isGuessView ? '' : `
            <div class="wc-actions">
                <button class="wc-btn wc-btn-highlight" type="button">✎ 标记</button>
                ${isAlreadyCollected
                    ? '<button class="wc-btn wc-btn-uncollect" type="button">🗑 取消收藏</button>'
                    : '<button class="wc-btn wc-btn-collect" type="button">✨ 收藏</button>'}
            </div>
            <div class="wc-footer" style="color:${isAlreadyCollected ? 'var(--green)' : 'var(--gray)'};">${isAlreadyCollected ? '✅ 本句中已收藏' : '也可直接把单词拖到右侧收集区'}</div>`;

    if (isAlreadyCollected && !isGuessView) card.classList.add('collected');
    card.innerHTML = `
            <button class="card-close-btn" title="关闭">✕</button>
            ${wordRow}
            ${phoneticHtml}
            ${badgesHtml}
            ${guessHtml}
            ${contextHtml}
            ${dictionaryHtml}
            ${glueHtml}
            ${glueAiBtnHtml}
            ${addMeaningHtml}
            ${sentenceHtml}
            ${actionsHtml}
        `;

    // 记下当前语境释义：后台刷新时如果新结果没有语境释义，用它兜住（避免越刷新越少）
    if (wordData.contextDefinition) {
        card.setAttribute('data-ctx-def', encodeURIComponent(wordData.contextDefinition));
        card.setAttribute('data-ctx-src', wordData.contextSource || '');
    }

    // 「联网深查」按钮：只有当卡片上还没有任何语境释义时才会出现（见 revealWordCardRemoteBtn）
    const remoteBtn = card.querySelector('.wc-btn-remote');
    if (remoteBtn) {
        remoteBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            remoteLookupWordCard(word, sentence, x, y);
        });
    }

    // 「AI 拆词」按钮（粘连词且本地各层都查不到时才出现）：用户主动点才联网，不点就零消耗
    const glueAiBtn = card.querySelector('.wc-btn-glue-ai');
    if (glueAiBtn) {
        glueAiBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            glueAiBtn.disabled = true;
            glueAiBtn.textContent = '⏳ AI 正在拆分…';
            console.log(`🔎 [拆词-AI] 用户主动请求 AI 拆词 | word="${word}"`);
            requestGlueSplit(word, sentence, x, y, { allowAI: true }).then(function(r) {
                if (!r || !r.isGlued) {
                    glueAiBtn.disabled = false;
                    glueAiBtn.textContent = '🔎 用 AI 拆开这个词';
                    toast('AI 也没能把它拆成单词');
                }
            });
        });
    }

    // 关闭按钮
    card.querySelector('.card-close-btn').addEventListener('click', function(e) {
        e.stopPropagation();
        hideWordCard();
    });

    // 发音按钮
    card.querySelector('.wc-speak-btn').addEventListener('click', function(e) {
        e.stopPropagation();
        speakText(word);
    });

    // 标记按钮（猜词模式下整块动作区不渲染 → 必须判空，否则这里会 TypeError 把整张卡挂掉）
    const highlightBtn = card.querySelector('.wc-btn-highlight');
    if (highlightBtn) {
        highlightBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            toggleHighlight(selectedText || word);
        });
    }

    // ===== 释义锁：猜测框交互（2026-10-07）=====
    const guessInput = card.querySelector('.wc-guess-input');
    const guessSubmit = card.querySelector('.wc-btn-guess-submit');
    const guessReveal = card.querySelector('.wc-btn-guess-reveal');
    if (guessInput) {
        // 实时记账：后台核对 / 拆词结果回来可能重绘卡片，靠它把用户打了一半的字回填回去
        guessInput.addEventListener('input', function() {
            guessDraftByKey[guessKey] = guessInput.value;
        });
        // Enter 提交 / Esc 关卡片；顺带阻止冒泡（document 级还挂着 click 监听）
        guessInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                if (guessSubmit) guessSubmit.click();
            } else if (e.key === 'Escape') {
                e.stopPropagation();
                hideWordCard();
            }
        });
        guessInput.addEventListener('click', function(e) { e.stopPropagation(); });
    }
    if (guessSubmit) {
        guessSubmit.addEventListener('click', function(e) {
            e.stopPropagation();
            submitGuess(word, sentence, selectedText, guessInput ? guessInput.value : '', x, y);
        });
    }
    if (guessReveal) {
        guessReveal.addEventListener('click', function(e) {
            e.stopPropagation();
            revealWordMeaning('直接看释义', word, sentence, selectedText, x, y);
        });
    }

    // 收藏按钮（仅在未收藏时存在）
    const collectBtn = card.querySelector('.wc-btn-collect');
    if (collectBtn) {
        // 收藏释义优先级（用户指定）：① 本句语境释义 → ② 文章词表 → ③ 词典层首义。
        // 卡片上已经在显示语境释义时直接用它；否则点击那一刻再查一次语境库（**不带 ai，不联网**）。
        // 最后一层兜底是「粘连词拆分」：rapiddevelopment 收藏下来不该是空的，
        // 至少存「rapid：迅速的；development：发展」。
        const glueMeaning = (function () {
            const g = glueSplitCache[lowerWord];
            if (!g || !g.isGlued) return '';
            return (g.parts || []).map(function (p) {
                const l = (p.entry && p.entry.translationLines) || [];
                return p.word + '：' + (l[0] || p.fallbackMeaning || '');
            }).join('；');
        })();
        collectBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            console.log(`✨ [收藏] word="${word}" | 开始解析释义（优先级：本句语境释义 → 文章词表 → 词典层首义）`);
            resolveCollectMeaning(word, normalizedSentence, { contextDefinition: wordData.contextDefinition, contextSource: wordData.contextSource })
                .then(function(picked) {
                    const meaning = picked.meaning || glueMeaning;
                    console.log(`✨ [收藏] word="${word}" | 存入释义="${meaning || '(空，交给单词本兜底)'}"`
                        + ` | 来源=${COLLECT_MEANING_SOURCES[picked.source]}${picked.meaning ? '' : '（键释义为空，改用拆词合成兜底）'}`);
                    return doCollectWord({ word: word, meaning: meaning, sentence: normalizedSentence });
                })
                .then(function() {
                    markCollectedSpans();
                })
                .catch(function(err) {
                    console.error(`✨ [收藏] 失败 word="${word}": ${(err && err.message) || err}`);
                    collectBtn.disabled = false;
                });
            hideWordCard();
        });
    }

    // 取消收藏按钮（仅在「本句已收藏」时存在）：点它删掉本句这条收藏
    const uncollectBtn = card.querySelector('.wc-btn-uncollect');
    if (uncollectBtn) {
        uncollectBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            uncollectBtn.disabled = true;
            console.log(`🗑️ [词卡-取消收藏] word="${word}" | 本句已收藏 → 走取消收藏`);
            // 传 sentence → 只删「本句」这一条（别的句子里的同一词不受影响）
            uncollectWord({ word: word, articleId: articleId, sentence: normalizedSentence });
        });
    }

    // 统一的「自行输入释义」按钮：点开后注入表单并绑定保存
    const addMeaningBtn = card.querySelector('.wc-btn-add-meaning');
    if (addMeaningBtn) {
        addMeaningBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            const formContainer = card.querySelector('.wc-meaning-form');
            if (formContainer && !formContainer.querySelector('.wc-input')) {
                formContainer.innerHTML = buildWordFormHtml();
                wireMeaningSave(card, word, sentence, selectedText, x, y);
            }
        });
    }

    document.body.appendChild(card);

    // 初始定位：优先放正文列右侧的空白栏，避免压住正文（压住 → 那几行句子再也悬停不了）
    positionWordCard(card, x, y);

    // 恢复猜测框的焦点与光标（见函数开头的说明；括号里的调用在极简 DOM 桩里可能不存在）
    if (prevFocusIsGuess) {
        const gi = card.querySelector('.wc-guess-input');
        if (gi) {
            try {
                gi.focus();
                if (gi.setSelectionRange) gi.setSelectionRange(prevCaret, prevCaret);
            } catch (e) {}
        }
    }

    // 卡片内容会在后台核对回来后变高（实测 427 → 469px）→ 尺寸一变就重新定位，
    // 否则它会自己往下"长"进正文里，静默压住更多句子。
    if (typeof ResizeObserver === 'function') {
        if (card._posObserver) card._posObserver.disconnect();
        card._posObserver = new ResizeObserver(function () {
            if (card === currentWordCard) positionWordCard(card, x, y);
        });
        card._posObserver.observe(card);
    }

    currentWordCard = card;
    currentWordCardKey = wordCardKeyOf(word, sentence);
    // 记下这张卡的数据：拆词结果异步回来时要用它原地重绘（attachGlueSplit）；
    // _x/_y 一并存下来，切模式（setGuessMode）时才能原地重绘到同一个位置
    // __guessView 写回**已判定**的形态（而不是原样保留 wordData 里的 undefined）：
    // updateWordCardIfOpen 靠它识别「现在是猜词形态，后台精修只更新内存、别重绘」——
    // 少了这一步，刚点开就打字时后台结果一回来就会重建输入框（丢焦点、丢光标）。
    currentWordCardData = Object.assign({}, wordData, {
        word: word, sentence: sentence, selectedText: selectedText,
        __guessView: guessView, _x: x, _y: y
    });
    document.addEventListener('click', closeWordCardHandler);

    // 已收藏卡片不需要拖拽；未收藏卡片的拖拽由文章中的 word-span 直接承担，卡片本身不可拖
}

// ==================== 引导气泡 ====================

function showDragGuideIfNeeded() {
    const hasDropped = localStorage.getItem('hasDroppedWord') === 'true';
    if (hasDropped) return;
    
    // 检查是否在阅读页
    const readingActive = document.getElementById('readingPage').classList.contains('active');
    if (!readingActive) return;
    
    // 延迟显示，确保 DOM 已渲染
    setTimeout(function() {
        const existingGuide = document.querySelector('.drag-guide-bubble');
        if (existingGuide) existingGuide.remove();
        
        const zone = document.getElementById('collectZone');
        if (!zone) return;
        const zoneRect = zone.getBoundingClientRect();
        
        const guide = document.createElement('div');
        guide.className = 'drag-guide-bubble';
        guide.innerHTML = `
            <button class="guide-close" title="知道了">✕</button>
            💡 按住文章中的单词，拖到右侧收集区即可收藏（也可点单词后点「收藏」按钮）
            <div class="guide-arrow"></div>
        `;
        
        document.body.appendChild(guide);
        
        const guideWidth = guide.offsetWidth;
        const guideHeight = guide.offsetHeight;
        
        // 放在收集区左侧，指向收集区
        let guideX = zoneRect.left - guideWidth - 20;
        let guideY = zoneRect.top + zoneRect.height / 2 - guideHeight / 2;
        
        // 如果空间不够，放在收集区上方
        if (guideX < 10) {
            guideX = zoneRect.left;
            guideY = zoneRect.top - guideHeight - 16;
        }
        
        // 边界检查
        if (guideY < 10) guideY = 10;
        if (guideY + guideHeight > window.innerHeight - 10) {
            guideY = window.innerHeight - guideHeight - 10;
        }
        
        guide.style.left = `${guideX}px`;
        guide.style.top = `${guideY}px`;
        
        // 关闭按钮（仅关闭气泡，不设 hasDroppedWord）
        guide.querySelector('.guide-close').addEventListener('click', function(e) {
            e.stopPropagation();
            guide.remove();
        });
    }, 500);
}

function hideDragGuide() {
    const guide = document.querySelector('.drag-guide-bubble');
    if (guide) guide.remove();
}

// ==================== 拖拽逻辑 ====================

function startDrag(e, card) {
    isDragging = true;
    currentWordCard = card;
    
    const rect = card.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    
    card.classList.add('dragging');
    card.style.position = 'fixed';
    card.style.left = `${rect.left}px`;
    card.style.top = `${rect.top}px`;
    card.style.transform = 'scale(1.08)';
    card.style.margin = '0';
    
    document.removeEventListener('click', closeWordCardHandler);
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
}

function onDragMove(e) {
    if (!isDragging || !currentWordCard) return;
    
    const x = e.clientX - dragOffsetX;
    const y = e.clientY - dragOffsetY;
    
    currentWordCard.style.left = `${x}px`;
    currentWordCard.style.top = `${y}px`;
    currentWordCard.style.transform = 'scale(1.08)';
    
    checkCollectZoneHover(e.clientX, e.clientY);
}

function onTouchMove(e) {
    if (!isDragging) return;
    e.preventDefault();
    const touch = e.touches[0];
    onDragMove({ clientX: touch.clientX, clientY: touch.clientY });
}

function checkCollectZoneHover(clientX, clientY) {
    const zone = document.getElementById('collectZone');
    if (!zone) {
        console.warn('🖱️ [拖拽] 命中检测：未找到 #collectZone 节点（收藏区不存在 → 拖拽永远无法命中）');
        return false;
    }

    const rect = zone.getBoundingClientRect();
    const isOver = clientX >= rect.left - 20 &&  // 增加一些容错
                  clientX <= rect.right + 20 &&
                  clientY >= rect.top - 20 &&
                  clientY <= rect.bottom + 20;

    // 只在「进入 / 离开」切换时打日志，避免 mousemove 刷屏
    if (isOver !== zone._dragHoverState) {
        zone._dragHoverState = isOver;
        console.log(`🖱️ [拖拽] 收集区命中 → ${isOver ? '进入 ✅' : '离开'}`
            + ` | 指针(${Math.round(clientX)},${Math.round(clientY)})`
            + ` | 区 rect=${Math.round(rect.left)},${Math.round(rect.top)} ${Math.round(rect.width)}×${Math.round(rect.height)}`);
    }

    if (isOver) {
        zone.classList.add('active');
    } else {
        zone.classList.remove('active');
    }
    return isOver;
}

function onDragEnd(e) {
    if (!isDragging || !currentWordCard) {
        cleanupDrag();
        return;
    }
    
    const clientX = e.clientX;
    const clientY = e.clientY;
    const isOverZone = checkCollectZoneHover(clientX, clientY);
    
    if (isOverZone && currentDragData) {
        // 成功收藏：飞入动画
        flyToCollectZone(currentWordCard, currentDragData);
    } else {
        // 未到收集区：淡出消失，不收藏
        currentWordCard.classList.add('cancelling');
        setTimeout(() => {
            hideWordCard();
        }, 200);
    }
    
    const zone = document.getElementById('collectZone');
    if (zone) zone.classList.remove('active');
    cleanupDrag();
}

function onTouchEnd(e) {
    if (!isDragging) return;
    const touch = e.changedTouches[0];
    onDragEnd({ clientX: touch.clientX, clientY: touch.clientY });
}

function cleanupDrag() {
    isDragging = false;
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
    document.removeEventListener('touchmove', onTouchMove);
    document.removeEventListener('touchend', onTouchEnd);
}

function flyToCollectZone(card, dragData) {
    const zone = document.getElementById('collectZone');
    if (!zone) {
        doCollectWord(dragData);
        hideWordCard();
        return;
    }
    
    // 计算收集区中心位置
    const zoneRect = zone.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    
    const targetX = zoneRect.left + zoneRect.width / 2 - cardRect.width / 2;
    const targetY = zoneRect.top + zoneRect.height / 2 - cardRect.height / 2;
    
    // 设置飞入动画起点位置
    card.style.transition = 'left 0.35s cubic-bezier(0.4, 0, 0.2, 1), top 0.35s cubic-bezier(0.4, 0, 0.2, 1), transform 0.35s, opacity 0.35s';
    card.style.left = `${targetX}px`;
    card.style.top = `${targetY}px`;
    card.classList.add('flying');
    
    setTimeout(() => {
        doCollectWord(dragData);
        // 收集区微动画
        zone.animate([
            { transform: 'translateY(-50%) scale(1)' },
            { transform: 'translateY(-50%) scale(1.15)' },
            { transform: 'translateY(-50%) scale(1)' }
        ], { duration: 300, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' });
        
        hideWordCard();
        updateCollectBadge();
    }, 350);
}

// 记录本次会话收藏的单词（结算页「收藏单词数/列表」用；按 word 去重）
// 2026-10-08：多记一个 articleId —— 结算页的「去分类待学单词」要按
// 「本次会话收藏的词 ∩ 仍是 pending」(词+文章) 匹配，只有 word 无法区分不同文章里的同一个词。
function recordSessionCollect(word, meaning, articleId) {
    if (!sessionCollectedList.some(function (x) { return x.word === word; })) {
        sessionCollectedList.push({ word: word, meaning: meaning, articleId: articleId || null });
    }
    renderReadingFavs();
}

// ==================== 收藏统计：一律按「当前文章」隔离（2026-10-08 修） ====================
//
// 【为什么要有这三个函数】
//   用户报「去分类 40 / 1/121 words，可我只收藏了几个词」。根因是阅读页上的数字读的都是
//   **全局口径**：`📋 去分类 N` 统计的是 userData.collectedWords 里**所有文章**的 pending；
//   而 `N/121 words` 读的是会话级全局数组 `collectedWords`（切文章就清空、跨文章却累计）。
//   两者一个偏大一个偏小，还都和用户眼前的这篇文章无关。
//
// 【约定（改这里的人请守住）】
//   阅读页上任何与收藏有关的**数字/列表**，只认 userData.collectedWords 里 articleId === 本文 的行。
//   「全部待分类」只允许出现在两个明确是全局视图的地方：
//     · 单词本页（它本身就是「所有收藏」的视图，带 tab 筛选）
//     · 单词本/兜底的「整理全部待分类」面板（openSortPanelAllPending）
//
// 每行收藏都带 articleId（doCollectWord 写入，与后端 user_words.article_id 同源），所以这里纯本地过滤。

/** 本文的收藏行（**未去重**：同一个词在不同句子里各占一行，与数据库一致） */
function collectedRowsOfArticle(articleId) {
    if (!articleId) return [];
    return userData.collectedWords.filter(function (w) {
        return w && w.articleId === articleId;
    });
}

/** 本文已收藏的「词」集合（小写去重）——「1/121 words」的分子用它 */
function collectedWordSetOfArticle(articleId) {
    const set = {};
    collectedRowsOfArticle(articleId).forEach(function (w) {
        const k = String((w && w.word) || '').trim().toLowerCase();
        if (k) set[k] = true;
    });
    return set;
}

/** 本文仍待分类的条数（收集区红点 / 「📋 去分类」计数用它） */
function pendingCountOfArticle(articleId) {
    return collectedRowsOfArticle(articleId).filter(function (w) {
        return w.status === 'pending';
    }).length;
}

/** 全部仍待分类的条数（**只给单词本 / 整理全部面板 / 日志**用，阅读页一律不用它） */
function pendingCountAll() {
    return userData.collectedWords.filter(function (w) { return w && w.status === 'pending'; }).length;
}

/**
 * 本次会话收藏、且**现在仍是 pending** 的词（结算页「📋 去分类待学单词（N）」用它）。
 * 语义 = 「这次学习留下的、还没整理的」，不累计历史文章的存量 —— 与结算页其它统计口径一致。
 */
function sessionPendingWords() {
    return userData.collectedWords.filter(function (w) {
        if (!w || w.status !== 'pending') return false;
        const k = String(w.word || '').trim().toLowerCase();
        return sessionCollectedList.some(function (it) {
            return String(it.word || '').trim().toLowerCase() === k
                && (it.articleId == null || it.articleId === w.articleId);
        });
    });
}

// 渲染主页面左下收藏区（横向滚动的收藏单词芯片）
// 2026-10-08 修：原来渲染的是 sessionCollectedList（**跨文章累计**的会话列表），
//   于是「我的收藏」里会出现别的文章的词，和「N/121 words」「去分类 N」三个数字互相打架。
//   现在统一成「本文已收藏的词」，与上面三个计数同源。
function renderReadingFavs() {
    const list = document.getElementById('readingFavsList');
    if (!list) return;
    const articleId = currentArticle ? currentArticle.id : null;

    // 去重：同一个词收藏在多句里 → 只显示一条（保留第一条有释义的）
    const byWord = {};
    const chips = [];
    collectedRowsOfArticle(articleId).forEach(function (w) {
        const k = String((w && w.word) || '').trim().toLowerCase();
        if (!k) return;
        if (!byWord[k]) {
            byWord[k] = { word: w.word, meaning: w.meaning || '', status: w.status || 'pending' };
            chips.push(byWord[k]);
        } else if (!byWord[k].meaning && w.meaning) {
            byWord[k].meaning = w.meaning;
        }
    });

    if (chips.length === 0) {
        list.innerHTML = '<div style="font-size:0.8rem;color:var(--gray);padding:0.25rem 0;">本文还没有收藏单词，拖拽文章中的生词进来吧</div>';
        console.log(`📚 [我的收藏] 本文=${articleId || '（无）'} → 0 个收藏词（按本文隔离，不含其它文章/历史）`);
        return;
    }
    list.innerHTML = chips.map(function (it) {
        const tip = it.status === 'pending' ? '待分类' : ('已分类：' + it.status);
        return '<div class="fav-chip" title="' + escapeAttr(tip) + '">' +
            '<button class="fav-remove" type="button" title="取消收藏" aria-label="取消收藏"' +
            ' data-fav-word="' + escapeAttr(it.word) + '">✕</button>' +
            '<span class="fav-word">' + escapeHtml(it.word) + '</span>' +
            (it.meaning ? '<span class="fav-meaning">' + escapeHtml(it.meaning) + '</span>' : '') +
            '</div>';
    }).join('');

    // 「取消收藏」：列表每次整块重绘，所以绑定在刚生成的这批按钮上（重绘即重绑，不留旧监听）
    Array.prototype.forEach.call(list.querySelectorAll('.fav-remove'), function (btn) {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            const w = btn.getAttribute('data-fav-word');
            console.log(`🗑️ [我的收藏] 点「取消收藏」word="${w}" | 本文=${articleId || '（无）'}`
                + ` | 将删除该词在本篇的全部收藏行（列表按词去重展示，取消要删干净）`);
            btn.disabled = true;
            // 不传 sentence → 删该词在本文下的全部行（去重展示，取消要删干净）
            uncollectWord({ word: w, articleId: articleId });
        });
    });

    console.log(`📚 [我的收藏] 本文=${articleId || '（无）'} → 渲染 ${chips.length} 个收藏词（按本文隔离，不含其它文章/历史）`);
}

// 执行实际收藏操作（包含paragraphIndex, sentenceIndex）
async function doCollectWord(dragData) {
    const { word, meaning, sentence } = dragData;
    window.__lastCollectAt = Date.now();   // 给 onCollectZoneClick 用：避免刚收藏完就弹出待分类面板

    // 获取段落和句子索引
    const { paragraphIndex, sentenceIndex, cleanSentence } = getWordPositionIndices(sentence);

    const finalSentence = cleanSentence || sentence;
    const articleId = currentArticle ? currentArticle.id : null;

    // 本地快速判断（基于 user_id + word + article_id + sentence 四字段）
    if (isWordCollectedInThisSentence(word, articleId, finalSentence)) {
        toast('本句中已收藏过这个词！');
        return;
    }

    // ⚠️ 已废弃（2026-10-08）：全局字符串数组 `collectedWords` **不再被任何计数/渲染读取**。
    // 它原来被当成「收藏数」用（跨文章累计、切文章清空），是「收藏统计不对」的元凶之一。
    // 现在统一改用 userData.collectedWords ∩ 本文（见 collectedWordSetOfArticle / pendingCountOfArticle）。
    // 这里仍保留写入，只是为兼容可能存在的旧引用；新代码请勿再读它。
    if (!collectedWords.includes(word)) {
        collectedWords.push(word);
    }

    // 调后端接口持久化到 user_words 表
    try {
        const result = await apiPost('/api/collect-word', {
            word: word,
            meaning: meaning,
            sentence: finalSentence,
            articleId: articleId,
            paragraphIndex: paragraphIndex,
            sentenceIndex: sentenceIndex
        });

        if (result.success) {
            userData.collectedWords.push({
                id: result.id,                   // 用后端返回的数据库 id
                word: word,
                meaning: meaning,
                sentence: finalSentence,
                paragraphIndex: paragraphIndex,
                sentenceIndex: sentenceIndex,
                article: currentArticle ? currentArticle.title : '未知文章',
                articleId: articleId,
                level: currentArticle ? currentArticle.level : null,
                status: 'pending',
                knowledge: 0,
                collectedAt: new Date().toISOString()
            });
            saveData();
            updateProgress();
            updateCollectBadge();
            localStorage.setItem('hasDroppedWord', 'true');
            hideDragGuide();
            recordSessionCollect(word, meaning, articleId);
            console.log(`📋 [待分类] 收藏成功 → word="${word}" 进入待分类 | 点右上角「📋 待分类」可分类`);
            toast('收藏成功！已进「待分类」📋');
        } else {
            // 后端返回失败：如果是重复收藏，同步到本地（数据库已有记录，本地不应丢失状态）
            if (result.reason === 'duplicate' && !isWordCollectedInThisSentence(word, articleId, finalSentence)) {
                userData.collectedWords.push({
                    id: result.id || Date.now(),
                    word: word,
                    meaning: meaning,
                    sentence: finalSentence,
                    paragraphIndex: paragraphIndex,
                    sentenceIndex: sentenceIndex,
                    article: currentArticle ? currentArticle.title : '未知文章',
                    articleId: articleId,
                    level: currentArticle ? currentArticle.level : null,
                    status: 'pending',
                    knowledge: 0,
                    collectedAt: new Date().toISOString()
                });
                saveData();
                updateProgress();
                updateCollectBadge();
                recordSessionCollect(word, meaning, articleId);
            }
            toast(result.message || '本句中已收藏过这个词');
        }
    } catch (e) {
        // 后端失败，降级本地存储（离线模式）
        console.warn('⚠️ 收藏接口失败，降级本地存储:', e.message);
        userData.collectedWords.push({
            id: Date.now(),
            word: word,
            meaning: meaning,
            sentence: finalSentence,
            paragraphIndex: paragraphIndex,
            sentenceIndex: sentenceIndex,
            article: currentArticle ? currentArticle.title : '未知文章',
            articleId: articleId,
            level: currentArticle ? currentArticle.level : null,
            status: 'pending',
            knowledge: 0,
            collectedAt: new Date().toISOString()
        });
        saveData();
        updateProgress();
        updateCollectBadge();
        localStorage.setItem('hasDroppedWord', 'true');
        hideDragGuide();
        recordSessionCollect(word, meaning, articleId);
        toast('收藏成功（离线）！待分类 +1');
    }
}

// ==================== 取消收藏（2026-10-09 新增） ====================
//
// 入口有两处（都调这里的 uncollectWord）：
//   ① 单词卡片：本句已收藏时，「✨ 收藏」按钮位置换成「🗑 取消收藏」→ 只删本句那一条
//   ② 我的收藏列表：每个词卡右上角的小 ✕ → 删该词在**本文**下的全部行（列表按词去重展示，
//      只删一条的话别的句子里同一词还在，列表看起来像没删掉）
//
// 本地镜像（userData.collectedWords）与后端一起删：接口失败也照删本地（离线可用），
// 下次刷新由 /api/user-words 拉回真实状态。删完统一刷「计数 / 列表 / 正文标记 / 词卡」。

/** 原地重绘当前词卡（取消收藏后要把「取消收藏」换回「收藏」） */
function refreshWordCardInPlace() {
    if (!currentWordCard || !currentWordCardData) return;
    const d = currentWordCardData;
    showWordCard(d, d._x, d._y);
}

/**
 * 取消收藏。target = { word, articleId, sentence? }
 *   传 sentence → 只删本句那一条；不传 → 删该词在本篇文章下的全部行。
 * 返回本地移除的行数。
 */
async function uncollectWord(target) {
    const word = target && target.word;
    if (!word) return 0;
    const articleId = (target && target.articleId) || null;
    const sentence = (target && target.sentence) || null;

    const matchLocal = function (w) {
        if (!w || w.word !== word) return false;
        if (articleId && w.articleId !== articleId) return false;
        if (sentence && w.sentence !== sentence) return false;
        return true;
    };
    const localHit = (userData.collectedWords || []).filter(matchLocal).length;
    console.log(`🗑️ [取消收藏] word="${word}" | 范围=${sentence ? '仅本句' : (articleId ? '本文全部' : '该词全部')}`
        + ` | 本地命中 ${localHit} 行 → DELETE /api/collect-word`);

    let deleted = 0;
    try {
        const r = await apiDelete('/api/collect-word', { word: word, articleId: articleId, sentence: sentence });
        deleted = (r && r.deleted) || 0;
    } catch (e) {
        // 离线也允许用户移除（本地先删，刷新后以服务端为准）
        console.warn(`🗑️ [取消收藏] 接口失败，降级只删本地：${(e && e.message) || e}`);
    }

    // 本地镜像同步移除
    userData.collectedWords = (userData.collectedWords || []).filter(function (w) { return !matchLocal(w); });
    // 兼容层：会话级全局字符串数组（UI 已不再读它，但保持一致免得留下幽灵词）
    collectedWords = collectedWords.filter(function (w) { return w !== word; });

    saveData();
    updateProgress();
    updateCollectBadge();
    renderReadingFavs();
    markCollectedSpans();       // 正文里该词的「已收藏」样式撤掉，重新可拖拽
    refreshWordCardInPlace();   // 词卡若开着：按钮换回「✨ 收藏」

    toast(localHit > 0 || deleted > 0 ? '已取消收藏' : '这个词本来就不在收藏里');
    console.log(`🗑️ [取消收藏] 完成 word="${word}" | 后端删除 ${deleted} 行 | 本地移除 ${localHit} 行`);
    return localHit;
}

// 获取单词所在的段落索引和句子索引
function getWordPositionIndices(targetSentence) {
    const result = {
        paragraphIndex: 0,
        sentenceIndex: 0,
        cleanSentence: targetSentence || ''
    };
    
    if (!currentArticle) return result;
    
    const paragraphs = currentArticle.article.split('\n\n');
    
    for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
        const paragraph = paragraphs[pIdx];
        // 按句子分割（. ! ?）
        const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph];
        
        for (let sIdx = 0; sIdx < sentences.length; sIdx++) {
            const sentence = sentences[sIdx].trim();
            const target = (targetSentence || '').trim();
            
            if (target && (
                sentence.includes(target) || 
                target.includes(sentence.substring(0, Math.min(sentence.length, 20)))
            )) {
                result.paragraphIndex = pIdx;
                result.sentenceIndex = sIdx;
                result.cleanSentence = sentence;
                return result;
            }
        }
    }
    
    // 如果没找到精确匹配，尝试在 readContent DOM 中查找
    const readContent = document.getElementById('readContent');
    if (readContent && targetSentence) {
        const pNodes = readContent.querySelectorAll('p');
        for (let pIdx = 0; pIdx < pNodes.length; pIdx++) {
            const pNode = pNodes[pIdx];
            const text = pNode.textContent || '';
            if (text.includes(targetSentence.trim())) {
                const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
                for (let sIdx = 0; sIdx < sentences.length; sIdx++) {
                    if (sentences[sIdx].trim().includes(targetSentence.trim().substring(0, 15))) {
                        result.paragraphIndex = pIdx;
                        result.sentenceIndex = sIdx;
                        result.cleanSentence = sentences[sIdx].trim();
                        return result;
                    }
                }
                result.paragraphIndex = pIdx;
                result.sentenceIndex = 0;
                return result;
            }
        }
    }
    
    return result;
}

// 更新收集区小红点徽章 + 所有「待分类」入口的计数
//   · #collectBadge        右侧收集区红点（**本文**）
//   · #favsSortBtn         「我的收藏」头部「📋 去分类 N」（**本文**）★ 阅读页里的正式入口
//   · #summarySortBtn      总结页「📋 去分类待学单词（N）」（**本次会话收藏且仍待分类**）
// ⚠️ 2026-10-08 二次修正：这三个计数原来有两个是「全局」口径（去分类=全部文章的 pending、
//    总结页=全部 pending），用户报「去分类 40，可我只收藏了几个词」。
//    现在阅读页一律按**当前文章**隔离；结算页按**本次会话**隔离。全局口径只留给单词本。
// ⚠️ 阅读页右上角的 #pendingEntryBtn 已按要求删除（顶部不适合放入口），本函数不再查询它。
let _lastPendingBadgeLog = '';
function updateCollectBadge() {
    const articleId = currentArticle ? currentArticle.id : null;

    // 本文口径（阅读页用）：去重后的收藏词数 + 待分类条数
    const collectedWordsInArticle = Object.keys(collectedWordSetOfArticle(articleId)).length;
    const pendingInArticle = pendingCountOfArticle(articleId);
    // 会话口径（结算页用）：本次收藏且仍待分类
    const pendingInSession = sessionPendingWords().length;
    // 全局口径（**只进日志 + 单词本**，不再挂到阅读页任何数字上）
    const pendingAll = pendingCountAll();

    const badge = document.getElementById('collectBadge');
    if (badge) {
        if (pendingInArticle > 0 && articleId) {
            badge.textContent = pendingInArticle;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }

    // 「我的收藏」头部的「📋 去分类」——**只算本文**（阅读页里的正式入口）
    const favsBtn = document.getElementById('favsSortBtn');
    if (favsBtn) {
        favsBtn.textContent = pendingInArticle > 0 ? `📋 去分类 ${pendingInArticle}` : '📋 去分类';
        favsBtn.classList.toggle('is-empty', pendingInArticle === 0);
        favsBtn.title = pendingInArticle > 0
            ? `本文还有 ${pendingInArticle} 个待分类单词，点这里整理`
            : ('本文的单词都分类完了'
                + (pendingAll > 0 ? `（其它文章还有 ${pendingAll} 个待分类，可去「我的单词本」里整理）` : ''));
    }

    // 总结页「📋 去分类待学单词（N）」：只统计**本次会话**留下的待分类；没有就整块隐藏
    const sumBtn = document.getElementById('summarySortBtn');
    if (sumBtn) {
        sumBtn.style.display = pendingInSession > 0 ? '' : 'none';
        sumBtn.textContent = `📋 去分类待学单词（${pendingInSession}）`;
        sumBtn.title = '只包含本次学习收藏、还没分类的单词（不累计历史）';
    }

    // 日志：只在计数变化时打，避免被高频调用刷屏
    const sig = `${articleId}|${collectedWordsInArticle}|${pendingInArticle}|${pendingInSession}|${pendingAll}`;
    if (sig !== _lastPendingBadgeLog) {
        _lastPendingBadgeLog = sig;
        console.log(`📋 [待分类] 计数刷新 | 本文=${pendingInArticle} 待分类 / ${collectedWordsInArticle} 收藏词`
            + `（articleId=${articleId || '（无）'}）`
            + ` | 本次会话=${pendingInSession} | 全部=${pendingAll}（仅日志与单词本，不上阅读页）`
            + ` | 收藏行总数=${userData.collectedWords.length}`);
    }
}

function closeWordCardHandler(e) {
    if (!currentWordCard || !currentWordCard.contains(e.target)) {
        hideWordCard();
    }
}

function hideWordCard() {
    if (currentWordCard) {
        if (currentWordCard._posObserver) {
            currentWordCard._posObserver.disconnect();
            currentWordCard._posObserver = null;
        }
        currentWordCard.remove();
        currentWordCard = null;
    }
    currentWordCardKey = null;
    document.removeEventListener('click', closeWordCardHandler);
}

// ==================== 选中文本 & 高亮 ====================

function handleTextSelection(e) {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
        hideWordCard();
        return;
    }
    
    const selectedText = selection.toString().trim();
    if (!selectedText) {
        hideWordCard();
        return;
    }
    
    const words = currentArticle ? (currentArticle.words || {}) : {};
    const normalizedText = selectedText.toLowerCase().replace(/[^-a-zA-Z' ]/g, '');
    
    let meaning = words[normalizedText] || words[selectedText] || words[selectedText.toLowerCase()];
    let displayWord = selectedText;
    
    if (!meaning) {
        const wordParts = normalizedText.split(/\s+/).filter(w => w.length >= 3);
        for (const part of wordParts) {
            if (words[part]) {
                meaning = words[part];
                displayWord = part;
                break;
            }
        }
    }
    
    if (!meaning) {
        // 文章词表里没有 → 再用词典层兜一次（不再写死「暂无释义」，那会被当真释义存进收藏库）
        meaning = bestMeaningForCollect(displayWord) || '暂无释义';
    }
    
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top - 10;
    
    const sentence = getSentenceFromSelection(selection);
    
    // 走和「点词」同一条卡片路径：语境释义（文章/本地库）+ 词典释义（本地 ECDICT）两栏齐全，
    // 并同样在后台打一次「只查本地」的接口核对精确本句释义（~1ms，不联网）。
    const hasMeaning = !!(meaning && meaning !== '暂无释义');
    const dict = dictionaryOf(displayWord);
    showWordCard({
        word: displayWord,
        sentence: sentence,
        selectedText: selectedText,
        contextDefinition: hasMeaning ? meaning : null,
        contextSource: hasMeaning ? 'article' : null,
        contextPending: true,
        dictionary: dict,
        definitions: hasMeaning ? [{ definition: meaning, part_of_speech: null }] : [],
        source: hasMeaning ? 'cache' : (dict ? 'dictionary' : 'none')
    }, x, y);
    console.log(`🔍 [划选] text="${selectedText.slice(0, 24)}" | word="${displayWord}" | 词典=${dict ? dict.translationLines.length + ' 义项' : '无'} | 文章释义=${hasMeaning ? '有' : '无'}`);

    fetchWordDefinitions(displayWord, sentence).then(function(result) {
        updateWordCardIfOpen(displayWord, sentence, {
            contextDefinition: result.contextDefinition || null,
            contextSource: result.contextSource || null,
            contextPending: false,
            dictionary: result.dictionary || dict,
            definitions: result.definitions,
            source: result.source
        }, x, y);
    });
}

function getSentenceFromSelection(selection) {
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const selectedStr = selection.toString().trim();
    
    if (container.nodeType === 3) {
        const parent = container.parentElement;
        if (parent) {
            const text = parent.textContent || '';
            const sentences = text.split(/[.!?]+/);
            for (const s of sentences) {
                if (s.includes(selectedStr)) {
                    return s.trim();
                }
            }
        }
    }
    
    const root = document.getElementById('readContent');
    if (root) {
        const sentences = root.textContent.split(/[.!?]+/);
        for (const s of sentences) {
            if (s.includes(selectedStr)) {
                return s.trim();
            }
        }
    }
    
    return selectedStr.length > 50 ? selectedStr.substring(0, 50) + '...' : selectedStr;
}

function toggleHighlight(text) {
    if (!currentArticle) return;
    
    const highlights = getHighlights();
    const key = `${currentArticle.id}_${text}`;
    
    if (highlights[key]) {
        delete highlights[key];
        toast('已取消标记');
    } else {
        highlights[key] = {
            text: text,
            articleId: currentArticle.id,
            timestamp: Date.now()
        };
        toast('已标记高亮');
    }
    
    localStorage.setItem('gaHighlights', JSON.stringify(highlights));
    applyHighlights();
    hideWordCard();
}

function getHighlights() {
    try {
        const saved = localStorage.getItem('gaHighlights');
        return saved ? JSON.parse(saved) : {};
    } catch (e) {
        return {};
    }
}

function applyHighlights() {
    if (!currentArticle) return;
    
    const highlights = getHighlights();
    const readContent = document.getElementById('readContent');
    if (!readContent) return;
    
    // 先清除所有 word-span 的高亮标记
    readContent.querySelectorAll('.word-span.highlighted-text').forEach(function (el) {
        el.classList.remove('highlighted-text');
    });
    
    const articleHighlights = Object.values(highlights).filter(h => h.articleId === currentArticle.id);
    articleHighlights.forEach(function (h) {
        const key = (h.text || '').toLowerCase().trim();
        if (!key) return;
        // 精确匹配单个单词
        const matched = readContent.querySelector('.word-span[data-word="' + key.replace(/"/g, '\\"') + '"]');
        if (matched) {
            matched.classList.add('highlighted-text');
        } else {
            // 词组高亮：把高亮文本拆成单词，匹配到的连续 word-span 都标记
            const words = key.split(/\s+/).filter(Boolean);
            if (words.length > 1) {
                words.forEach(function (w) {
                    const el = readContent.querySelector('.word-span[data-word="' + w.replace(/"/g, '\\"') + '"]');
                    if (el) el.classList.add('highlighted-text');
                });
            }
        }
    });
}

// 兼容旧代码：点击收藏（现在调用拖拽收藏使用的同一逻辑）
function collectWord(word, meaning, sentence) {
    doCollectWord({ word, meaning, sentence });
    hideWordCard();
}

// 「N/M words」进度：**本文**已收藏词数 / 本文词表词数
// 2026-10-08 修：分子原来读的是会话级全局数组 `collectedWords`（切文章时被清空、跨文章却累计），
//   于是「刚进这篇文章」永远是 0、「一直不切文章」又会把别的文章的收藏算进来。
//   现在与「📋 去分类」「收集区红点」「我的收藏列表」同源：userData.collectedWords ∩ 本文。
function updateProgress() {
    const articleId = currentArticle ? currentArticle.id : null;
    const totalWords = Object.keys((currentArticle && currentArticle.words) || {}).length;
    const collected = Object.keys(collectedWordSetOfArticle(articleId)).length;
    const pct = totalWords ? Math.min(100, (collected / totalWords) * 100) : 0;

    const txt = document.getElementById('progText');
    if (txt) txt.textContent = `${collected}/${totalWords} words`;
    const bar = document.getElementById('progBar');
    if (bar) bar.style.width = `${pct}%`;

    console.log(`📊 [收藏统计] 本文=${articleId || '（无）'} | 已收藏 ${collected}/${totalWords} words（去重）`
        + ` | 本文收藏行=${collectedRowsOfArticle(articleId).length}`
        + ` | 全部收藏行=${userData.collectedWords.length}（不参与本文进度）`);
}

function startQuiz() {
    // 题目已合并进主页面右侧，无需跳转独立测试页；仅重置作答状态并刷新题目区
    initQuizArea();
}

function backToReading() { showScreen('readingPage'); }

// 初始化主页面右侧题目区（重置作答状态 + 分派渲染）
function initQuizArea() {
    const q = (currentArticle && currentArticle.questions) || [];
    quizAnswers = new Array(q.length).fill(-1);
    renderQuizPanel();
}

// 答题区底部按钮：答题前「提交答案」，已提交后「完成学习」（点击进入结算/总结页）
function setQuizSubmitButton(submitted) {
    const btn = document.getElementById('quizSubmitBtn');
    if (!btn) return;
    if (submitted) {
        btn.textContent = '✅ 完成学习';
        btn.onclick = function () { finishLearning(); };
    } else {
        btn.textContent = '提交答案 →';
        btn.onclick = function () { submitQuiz(); };
    }
}

// 根据题目类型分派渲染：普通选择题 → #quizQuestions；降级划选题 → #fallbackQuizArea
function renderQuizPanel() {
    const q = (currentArticle && currentArticle.questions) || [];

    // 每次渲染题目区都先把底部按钮复位为「提交答案」（新一套题 = 尚未提交）
    setQuizSubmitButton(false);

    // 同步作答数组长度（保留已作答项，新增项填 -1）——避免重复轮询重渲染时清空用户的作答状态
    if (quizAnswers.length !== q.length) {
        const next = new Array(q.length).fill(-1);
        for (let k = 0; k < q.length && k < quizAnswers.length; k++) next[k] = quizAnswers[k];
        quizAnswers = next;
    }

    document.getElementById('quizArticleInfo').textContent = (currentArticle ? currentArticle.title + ' · ' : '') + q.length + ' 题';

    // 题目未就绪：右侧显示「题目生成中」占位
    if (!q.length) {
        fallbackQuizActive = false;
        const qBox = document.getElementById('quizLoadingBox');
        if (qBox) {
            qBox.style.display = 'block';
            qBox.innerHTML = '📝 题目生成中...';
        }
        document.getElementById('quizQuestions').innerHTML = '';
        const fArea = document.getElementById('fallbackQuizArea');
        if (fArea) { fArea.style.display = 'none'; fArea.innerHTML = ''; }
        const review = document.getElementById('quizReview');
        if (review) review.innerHTML = '';
        document.getElementById('quizProg').textContent = '0/0';
        document.getElementById('quizProgressBar').style.width = '0%';
        document.getElementById('quizAnswered').textContent = '题目生成中...';
        return;
    }

    const qBox = document.getElementById('quizLoadingBox');
    if (qBox) qBox.style.display = 'none';

    const isFallback = q.some(function (x) { return x && (x.answerMode === 'selection' || x.isFallback === true); });
    if (isFallback) {
        fallbackQuizActive = true;
        document.getElementById('quizQuestions').innerHTML = '';
        renderFallbackQuiz(q);
    } else {
        fallbackQuizActive = false;
        const fArea = document.getElementById('fallbackQuizArea');
        if (fArea) { fArea.style.display = 'none'; fArea.innerHTML = ''; }
        renderQuiz();
    }
}

// 去掉 workflow 选项里自带的前缀（如 "A. xxx"、"B) xxx"），避免和前端加的前缀重复
function stripOptionPrefix(opt) {
    if (typeof opt !== 'string') return opt;
    return opt.replace(/^\s*[A-Da-d]\s*[.)、:：\-—]\s*/, '').trim();
}

function renderQuiz() {
    const qContainer = document.getElementById('quizQuestions');

    // 题目尚未加载：右侧显示「题目生成中...」占位
    if (!currentArticle || !currentArticle.questions || currentArticle.questions.length === 0) {
        document.getElementById('quizProg').textContent = '0/0';
        document.getElementById('quizProgressBar').style.width = '0%';
        document.getElementById('quizAnswered').textContent = '题目生成中...';
        if (qContainer) {
            qContainer.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--gray);">📝 题目生成中...</div>';
        }
        return;
    }

    const answered = quizAnswers.filter(a => a !== -1).length;
    document.getElementById('quizProg').textContent = `${answered}/${currentArticle.questions.length}`;
    document.getElementById('quizProgressBar').style.width = `${(answered / currentArticle.questions.length) * 100}%`;
    document.getElementById('quizAnswered').textContent = `${answered}/${currentArticle.questions.length} answered`;
    
    if (qContainer) qContainer.innerHTML = currentArticle.questions.map((q, i) => `
        <div style="background:white;padding:1.2rem;border-radius:1rem;margin-bottom:1rem;">
            <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.75rem;">
                <div style="width:24px;height:24px;border-radius:50%;background:var(--primary);color:white;font-size:0.7rem;font-weight:600;display:flex;align-items:center;justify-content:center;">${i+1}</div>
                <div style="font-size:0.75rem;color:var(--gray);font-weight:600;">${q.type || 'QUESTION'}</div>
            </div>
            <p style="margin:0.5rem 0;font-size:0.95rem;">${q.question}</p>
            ${q.options.map((opt, j) => `
                <div onclick="selectAns(${i}, ${j})" style="padding:0.8rem;border:2px solid var(--border);border-radius:0.6rem;cursor:pointer;margin:0.5rem 0;display:flex;align-items:center;gap:0.75rem;">
                    <div style="width:20px;height:20px;border-radius:50%;border:2px solid ${quizAnswers[i] === j ? 'var(--primary)' : 'var(--border)'};background:${quizAnswers[i] === j ? 'var(--primary)' : 'white'};display:flex;align-items:center;justify-content:center;">
                        ${quizAnswers[i] === j ? '<span style="color:white;font-size:0.7rem;">✓</span>' : ''}
                    </div>
                    <span style="${quizAnswers[i] === j ? 'color:var(--primary);font-weight:600;' : ''}">${String.fromCharCode(65+j)}. ${stripOptionPrefix(opt)}</span>
                </div>
            `).join('')}
        </div>
    `).join('');
}

// 测试页文章主区域渲染（文章始终显示，词可点查；释义未加载时点词提示「释义生成中」）
function renderQuizArticle() {
    const el = document.getElementById('quizArticleContent');
    if (!el) return;

    const articleText = (currentArticle && currentArticle.article) || '';
    if (!articleText.trim()) {
        el.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--gray);">📖 文章加载中...</div>';
        return;
    }

    // 按空行分段，段落内按行拆分，每行用 splitWordsToSpans 生成可点词的词 span
    const paragraphs = articleText.replace(/\r\n/g, '\n').split(/\n{2,}/).filter(p => p.trim().length > 0);
    const htmlParts = paragraphs.map(p => {
        const lines = p.split('\n').filter(l => l.trim().length > 0);
        const lineHtml = lines.map(l => splitWordsToSpans(l)).join('<br>');
        return '<p style="margin-bottom:1.1rem;line-height:2;font-size:1rem;">' + lineHtml + '</p>';
    });
    el.innerHTML = htmlParts.join('');
    ensureQuizArticleClickBound();
    console.log(`📖 [测试页] 文章渲染完成 | 段落数=${paragraphs.length} | 字符数=${articleText.length}`);
}

// 给测试页文章容器绑定一次点词事件（事件委托，innerHTML 重渲染不受影响）
let quizArticleClickBound = false;
function ensureQuizArticleClickBound() {
    if (quizArticleClickBound) return;
    const el = document.getElementById('quizArticleContent');
    if (!el) return;
    quizArticleClickBound = true;
    el.addEventListener('click', function (e) {
        const span = e.target.closest('.word-span');
        if (span) {
            e.stopPropagation();
            handleWordSpanClick(span);
        }
    });
}

// 切换题目面板的开/关（按钮即开关，无独立关闭按钮）
function toggleQuizPanel() {
    const ready = currentArticle && currentArticle.questionsReady !== false && (currentArticle.questions || []).length > 0;
    if (!ready) {
        toast('题目生成中，请稍候...');
        return;
    }
    const panel = document.getElementById('quizPanel');
    if (!panel) return;
    const isOpen = panel.classList.toggle('open');
    panel.setAttribute('aria-hidden', String(!isOpen));
    updateQuizToggleButton();
}

// 根据题目加载状态 + 面板开关状态，刷新按钮文字与禁用态
function updateQuizToggleButton() {
    const btn = document.getElementById('quizPanelToggle');
    if (!btn) return;
    const ready = currentArticle && currentArticle.questionsReady !== false && (currentArticle.questions || []).length > 0;
    if (!ready) {
        btn.disabled = true;
        btn.textContent = '题目生成中...';
        return;
    }
    btn.disabled = false;
    const panel = document.getElementById('quizPanel');
    const open = panel && panel.classList.contains('open');
    btn.textContent = open ? '✖ 收起' : '📝 题目';
}

function selectAns(i, j) {
    quizAnswers[i] = j;
    renderQuiz();
}

function submitQuiz() {
    const q = (currentArticle && currentArticle.questions) || [];
    const unanswered = quizAnswers.filter(function (a) { return a === -1; }).length;
    if (unanswered > 0) {
        toast('还有 ' + unanswered + ' 题未作答，先答完再提交吧！');
        return;
    }

    const total = q.length;
    const correct = quizAnswers.reduce(function (acc, ans, idx) {
        return acc + (ans === q[idx].answer_index ? 1 : 0);
    }, 0);
    const accuracy = total ? Math.round((correct / total) * 100) : 0;
    lastQuizResult = { correct: correct, total: total, accuracy: accuracy };

    // 沿用原等级判定逻辑（结算页与学习档案保持一致）
    // 2026-10-08：vocabRate 的分子同步改成「**本文**已收藏词数」（原来读全局数组 collectedWords，
    // 会把别篇文章的收藏算进来，等级判定被历史数据带偏）。
    const wordTotal = Object.keys(currentArticle.words || {}).length;
    const collectedInArticle = Object.keys(collectedWordSetOfArticle(currentArticle.id)).length;
    const vocabRate = wordTotal ? Math.round((collectedInArticle / wordTotal) * 100) : 0;
    let level = 'A2';
    if (accuracy >= 80 && vocabRate <= 50) { level = 'C1'; }
    else if (accuracy >= 60 && vocabRate <= 70) { level = 'B2'; }
    else if (accuracy >= 40) { level = 'B1'; }
    userData.level = level;
    saveData();

    // 主页面右侧展示答题回顾
    const review = document.getElementById('quizReview');
    if (review) renderQuizReview(review);
    const answeredEl = document.getElementById('quizAnswered');
    if (answeredEl) answeredEl.textContent = '正确 ' + correct + '/' + total + '（' + accuracy + '%）';

    // 已提交：底部按钮由「提交答案」切换为「完成学习」
    setQuizSubmitButton(true);

    toast('作答完成！');
}

// 逐题展示用户答案、正确答案、解析、是否正确（容器可传：主页面 #quizReview / 结算页 #summaryReview）
function renderQuizReview(container) {
    if (!container) container = document.getElementById('quizReview');
    if (!container) return;
    const questions = (currentArticle && currentArticle.questions) || [];

    container.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem;">
            <h3 style="font-size:1rem;font-weight:600;">答题回顾</h3>
        </div>
        ${questions.map(function(q, i) {
            const options = Array.isArray(q.options) ? q.options : [];
            const correctIdx = typeof q.answer_index === 'number' ? q.answer_index : -1;
            const userIdx = quizAnswers[i];
            const isCorrect = userIdx === correctIdx;

            const correctText = (correctIdx >= 0 && options[correctIdx] != null)
                ? String.fromCharCode(65 + correctIdx) + '. ' + stripOptionPrefix(options[correctIdx])
                : '—';
            const userText = (userIdx != null && userIdx >= 0 && options[userIdx] != null)
                ? String.fromCharCode(65 + userIdx) + '. ' + stripOptionPrefix(options[userIdx])
                : '未作答';
            const explanation = q.explanation ? q.explanation : '（无解析）';
            const statusColor = isCorrect ? '#6B9B37' : '#E5484D';
            const statusText = isCorrect ? '✓ 正确' : '✗ 错误';

            return `
                <div style="background:white;padding:1rem 1.1rem;border-radius:0.9rem;margin-bottom:0.75rem;border:1px solid var(--border);">
                    <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.6rem;">
                        <div style="width:22px;height:22px;border-radius:50%;background:var(--primary);color:white;font-size:0.7rem;font-weight:600;display:flex;align-items:center;justify-content:center;flex:none;">${i + 1}</div>
                        <div style="font-size:0.95rem;font-weight:600;color:var(--text);">${escapeHtml(q.question)}</div>
                    </div>
                    <div style="font-size:0.9rem;line-height:1.9;color:var(--gray);">
                        <div>你的答案：<span style="color:${statusColor};font-weight:600;">${escapeHtml(userText)}</span></div>
                        <div>正确答案：<span style="color:#6B9B37;font-weight:600;">${escapeHtml(correctText)}</span></div>
                        <div style="margin-top:0.35rem;color:${statusColor};font-weight:600;">${statusText}</div>
                        <div style="margin-top:0.35rem;padding:0.5rem 0.7rem;background:var(--bg-light);border-radius:0.5rem;color:var(--text);">解析：${escapeHtml(explanation)}</div>
                    </div>
                </div>
            `;
        }).join('')}
    `;
}

// ==================== 完成学习 → 结算/总结页面 ====================

// 点击右上角「✅ 完成学习」
// 2026-10-08 修复：不再**直接**跳结算页 —— 本文还有待分类的收藏词时，先开分类面板整理，
// 整理完（或点「稍后整理」）再自动进结算页。否则「总结页」会把「待分类」这一步整个顶掉。
function finishLearning() {
    const articleId = currentArticle ? currentArticle.id : null;
    const pendingInArticle = userData.collectedWords.filter(function(w) {
        return w.status === 'pending' && w.articleId === articleId;
    });
    const pendingAll = userData.collectedWords.filter(function(w) {
        return w.status === 'pending';
    });

    console.log(`📋 [待分类] 点击「完成学习」| 本文待分类=${pendingInArticle.length} | 全部待分类=${pendingAll.length}`
        + ` → ${pendingInArticle.length > 0 ? '先整理待分类，面板关闭后再结算' : '直接进入总结页'}`);

    if (pendingInArticle.length > 0) {
        summaryAfterSort = true;   // closeSortPanel() 里读到 → 自动进总结页
        sortPanelSortedWords = [];
        sortPanelArticleId = articleId;
        sortPanelSessionOnly = false;   // 这个面板是「本文」范围，不是会话范围
        showSortPanel(pendingInArticle, '📋 先整理待分类，再结算');
        return;
    }
    gotoSummary();
}

// 真正渲染并跳转结算/总结页
function gotoSummary() {
    summaryAfterSort = false;
    console.log('📋 [待分类] → 进入总结页 renderSummary()');
    renderSummary();
    showScreen('summaryPage');
}

/**
 * 把「释义」拆成「主释义」与「末尾括号备注」（2026-10-09，总结页排版用）。
 *
 * 收藏下来的释义常带一个尾部括注（词性/单复数/变形说明），例如：
 *   「决定；确定（determine 的第三人称单数）」 → 主「决定；确定」 + 注「（determine 的第三人称单数）」
 *   「可能性（复数）」                        → 主「可能性」     + 注「（复数）」
 * 拆开后备注单独一行、字号更小，主释义才读得下去。**不改变数据**，纯展示拆分。
 * 括号里没内容、或整条就是括号（如「（复数）」）时 → 不拆，原样当主释义。
 */
function splitMeaningNote(meaning) {
    const raw = (meaning == null ? '' : String(meaning)).trim();
    if (!raw) return { main: '', note: '' };
    // 只匹配「结尾处」的全文/半角括号：前面必须还有非空内容，避免把整条释义吞进 note
    const m = raw.match(/^(.*\S)\s*[（(]([^（()）]*)[）)]\s*$/);
    if (m && m[1].trim() && m[2].trim()) {
        return { main: m[1].trim(), note: '（' + m[2].trim() + '）' };
    }
    return { main: raw, note: '' };
}

// 渲染结算/总结页的统计、收藏单词列表与答题回顾
function renderSummary() {
    const articlesRead = sessionReadArticleIds.size;
    const collectedCount = sessionCollectedList.length;
    const accuracyText = lastQuizResult ? (lastQuizResult.accuracy + '%') : '—';

    document.getElementById('summaryArticlesRead').textContent = articlesRead;
    document.getElementById('summaryCollectedCount').textContent = collectedCount;
    document.getElementById('summaryAccuracy').textContent = accuracyText;

    // 刷新「📋 去分类待学单词（N）」按钮的计数与显隐（没有待分类就隐藏）
    updateCollectBadge();

    const list = document.getElementById('summaryCollectedList');
    if (list) {
        if (collectedCount === 0) {
            list.innerHTML = '<div style="color:var(--gray);padding:0.5rem 0;">本次还没有收藏单词</div>';
        } else {
            // 2026-10-09：改造为「一词一卡」。旧版把所有词挤成一行 `词 · 释义`，
            // 词义一长完全读不下去（用户报「determines · 决定；确定（determine 的第三人称单数）
            // possibilities · 可能性（复数）」糊成一片）。现在单词 / 释义 / 括号备注各占一行。
            list.innerHTML = sessionCollectedList.map(function (it, i) {
                const parts = splitMeaningNote(it.meaning);
                return '<div class="summary-word-card">'
                    + '<div class="sw-head">'
                    + '<span class="sw-word">' + escapeHtml(it.word) + '</span>'
                    + '<span class="sw-idx">' + (i + 1) + '</span>'
                    + '</div>'
                    + (parts.main ? '<div class="sw-meaning">' + escapeHtml(parts.main) + '</div>' : '')
                    + (parts.note ? '<div class="sw-note">' + escapeHtml(parts.note) + '</div>' : '')
                    + '</div>';
            }).join('');
        }
    }

    const review = document.getElementById('summaryReview');
    if (review) {
        if (lastQuizResult) {
            renderQuizReview(review);
        } else {
            review.innerHTML = '<h3 class="summary-section-title">答题回顾</h3><div style="color:var(--gray);">本次还没有答题记录</div>';
        }
    }
}

// 结算页「继续学习」：返回主页面继续阅读/做题
function summaryContinue() {
    showScreen('readingPage');
}

function showVocabBook() {
    currentFilter = 'all';
    updateVocabFilterTabs();
    renderVocabBook();
    updateCollectBadge();
    showScreen('wordbookPage');
}

function filterVocab(filter) {
    currentFilter = filter;
    updateVocabFilterTabs();
    renderVocabBook();
}

function updateVocabFilterTabs() {
    // 兼容两种结构：新的filter-tab（id对应）和旧的vocab-filter
    const filterMap = {
        'all': 'filterAll',
        'pending': 'filterPending',
        'learning': 'filterLearning',
        'mastered': 'filterMastered',
        'review': 'filterReview'
    };
    
    Object.keys(filterMap).forEach(function(key) {
        const el = document.getElementById(filterMap[key]);
        if (el) {
            if (key === currentFilter) {
                el.classList.add('active');
                el.style.background = 'var(--primary)';
                el.style.color = 'white';
            } else {
                el.classList.remove('active');
                el.style.background = '';
                el.style.color = '';
            }
        }
    });
    
    document.querySelectorAll('.vocab-filter').forEach(function(b) {
        const text = b.textContent.trim();
        const textMap = {
            '全部': 'all',
            '待分类': 'pending',
            '待学': 'pending',
            '学习中': 'learning',
            '已掌握': 'mastered',
            '需复习': 'review'
        };
        const filter = textMap[text] || text.toLowerCase();
        if (filter === currentFilter) {
            b.classList.add('active');
        } else {
            b.classList.remove('active');
        }
    });
}

function getStatusLabel(status) {
    const map = {
        'pending': '待分类',
        'learning': '学习中',
        'mastered': '已掌握',
        'review': '需复习'
    };
    return map[status] || status;
}

// 「释义补全中…」占位：批量补释义期间先给个能看懂的提示，避免又出现一片「暂无释义」
const VOCAB_MEANING_PLACEHOLDER = '<span style="color:var(--gray);">释义补全中…</span>';
const VOCAB_MEANING_EMPTY = '<span style="color:var(--gray);">暂无释义（点「去分类」可手动补充）</span>';

// 单词本释义兜底：只有「本地词典缓存也没有」的词才会被收集到这里，攒完一次性打批量接口
let vocabDictFillInFlight = false;
let vocabDictFillAsked = {};   // { word: 1 } 已经问过接口的词，避免同一批反复请求

function renderVocabBook() {
    const total = userData.collectedWords.length;
    document.getElementById('vocabStats').textContent = `${total} collected words`;
    
    let filteredWords = userData.collectedWords;
    if (currentFilter !== 'all') {
        filteredWords = filteredWords.filter(w => w.status === currentFilter);
    }
    
    // 更新统计数字
    const vTotal = document.getElementById('vTotal');
    const vPending = document.getElementById('vPending');
    const vMastered = document.getElementById('vMastered');
    if (vTotal) vTotal.textContent = total;
    if (vPending) vPending.textContent = userData.collectedWords.filter(w => w.status === 'pending').length;
    if (vMastered) vMastered.textContent = userData.collectedWords.filter(w => w.status === 'mastered').length;

    // ---------- 释义兜底（2026-10-06）----------
    // 收藏列表的数据源 = user_words.definition（收藏那一刻的快照），历史上可能是空串或
    // 字面量「暂无释义」，直接渲染就是一片「暂无释义」。这里不再信任快照：
    //   ① 快照有真释义 → 用快照（最贴语境）
    //   ② 否则查本地词典缓存（进阅读页时已批量预取，同步零成本）
    //   ③ 还没有 → 记进 missingWords，渲染成「释义补全中…」，函数末尾批量打一次接口补齐后重绘
    const missingWords = [];
    const meaningHtmlOf = function (w) {
        const snap = String(w.meaning || '').trim();
        if (snap && snap !== '暂无释义') return escapeHtml(snap);
        const d = dictionaryOf(w.word);
        if (d && d.translationLines && d.translationLines.length) {
            return escapeHtml(d.translationLines[0]);
        }
        if (missingWords.indexOf(w.word) < 0) missingWords.push(w.word);
        // 已经问过接口还是没有 → 不无限重试，直接显示占位
        return vocabDictFillAsked[w.word] ? VOCAB_MEANING_EMPTY : VOCAB_MEANING_PLACEHOLDER;
    };
    
    const grouped = {};
    filteredWords.forEach(function(w) {
        if (!grouped[w.article]) grouped[w.article] = [];
        grouped[w.article].push(w);
    });
    
    if (Object.keys(grouped).length === 0) {
        let hintText = 'No words collected yet. Start reading to collect new words!';
        if (currentFilter === 'pending') hintText = '没有待分类的单词 🎉';
        if (currentFilter === 'learning') hintText = '没有学习中的单词';
        if (currentFilter === 'mastered') hintText = '还没有已掌握的单词，加油!';
        if (currentFilter === 'review') hintText = '没有需要复习的单词';
        
        // 待分类时显示"去分类"入口
        if (currentFilter === 'pending') {
            document.getElementById('vocabContent').innerHTML = `
                <div style="background:white;padding:2rem;border-radius:1rem;text-align:center;color:var(--gray);">
                    <div style="font-size:2rem;margin-bottom:0.5rem;">✨</div>
                    <div style="font-size:1rem;font-weight:600;color:var(--text);margin-bottom:0.5rem;">${hintText}</div>
                </div>`;
        } else {
            document.getElementById('vocabContent').innerHTML = `
                <div style="background:white;padding:2rem;border-radius:1rem;text-align:center;color:var(--gray);">
                    <div style="font-size:2rem;margin-bottom:0.5rem;">📚</div>
                    <div>${hintText}</div>
                </div>`;
        }
        return;
    }
    
    document.getElementById('vocabContent').innerHTML = Object.keys(grouped).map(function(article) {
        const wordsInGroup = grouped[article];
        return `
        <div style="background:white;border-radius:1rem;margin-bottom:1.5rem;overflow:hidden;">
            <div style="padding:1rem;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">
                <div style="display:flex;align-items:center;gap:0.5rem;">
                    <h3 style="font-size:0.95rem;font-weight:600;">${article}</h3>
                    <span class="diff-badge diff-${wordsInGroup[0]?.level || 'middle'}">${(wordsInGroup[0]?.level || 'middle').toUpperCase()}</span>
                </div>
                <span style="font-size:0.8rem;color:var(--gray);">${wordsInGroup.length} words</span>
            </div>
            ${wordsInGroup.map(function(w) {
                const isPending = w.status === 'pending';
                return `
                <div style="padding:1rem;border-bottom:1px solid var(--border);">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.5rem;">
                        <div style="flex:1;">
                            <div style="font-weight:600;font-size:1rem;">${w.word}</div>
                            <div style="color:var(--primary);font-size:0.9rem;">${meaningHtmlOf(w)}</div>
                            <div style="font-size:0.8rem;color:var(--gray);font-style:italic;margin-top:0.25rem;">"${w.sentence}"</div>
                            ${w.paragraphIndex !== undefined ? `<div style="font-size:0.7rem;color:var(--light-gray);margin-top:0.25rem;">📍 第${w.paragraphIndex + 1}段 · 第${w.sentenceIndex + 1}句</div>` : ''}
                        </div>
                        <span class="status-${w.status}" style="flex-shrink:0;margin-left:0.5rem;">${getStatusLabel(w.status)}</span>
                    </div>
                    <div style="display:flex;gap:0.5rem;margin-top:0.75rem;">
                        ${isPending ? `<button class="go-sort-btn" onclick="goSortFromWordbook('${w.id}')">📋 去分类</button>` : ''}
                        ${w.status !== 'mastered' ? `<button class="btn" onclick="markMastered(${w.id})" style="flex:1;background:#D1FAE5;color:#059669;padding:0.5rem;font-size:0.8rem;${isPending ? 'flex:0.6;' : ''}">✓ 已掌握</button>` : ''}
                        ${w.status !== 'learning' && !isPending ? `<button class="btn" onclick="markLearning(${w.id})" style="flex:1;background:#DBEAFE;color:#2563EB;padding:0.5rem;font-size:0.8rem;">📖 学习中</button>` : ''}
                        ${w.status !== 'review' && !isPending ? `<button class="btn" onclick="markNeedReview(${w.id})" style="flex:1;background:#FEE2E2;color:#DC2626;padding:0.5rem;font-size:0.8rem;">↻ 需复习</button>` : ''}
                        <button class="btn" onclick="deleteWord(${w.id})" style="flex:${isPending ? '0.6' : '1'};background:#FEE2E2;color:#DC2626;padding:0.5rem;font-size:0.8rem;">🗑 删除</button>
                    </div>
                </div>
                `;
            }).join('')}
        </div>
        `;
    }).join('');

    // 本地也补不到的词 → 打一次批量接口（后端 ECDICT 全量），补进缓存后重绘一次。
    // 只补「没问过接口」的词，且同一时刻只跑一个请求，避免重绘 → 再请求 的死循环。
    const ask = missingWords.filter(function (w) { return !vocabDictFillAsked[w]; });
    if (ask.length > 0) {
        console.log(`📚 [单词本] ${missingWords.length} 个词的释义本地没有 → 批量补全 ${ask.length} 个: ${ask.slice(0, 8).join(', ')}${ask.length > 8 ? ' …' : ''}`);
        ask.forEach(function (w) { vocabDictFillAsked[w] = 1; });
        if (!vocabDictFillInFlight) {
            vocabDictFillInFlight = true;
            apiPost('/api/dictionary/batch', { words: ask.slice(0, 2000) })
                .then(function (data) {
                    const entries = (data && data.entries) || {};
                    Object.keys(entries).forEach(function (w) { dictionaryCache[w] = entries[w]; });
                    console.log(`📚 [单词本] 批量补全完成 | 命中 ${Object.keys(entries).length}/${ask.length} → 重绘列表`);
                })
                .catch(function (e) {
                    console.warn(`📚 [单词本] 批量补全失败（列表保留「释义补全中…」）: ${e && e.message}`);
                })
                .then(function () {
                    vocabDictFillInFlight = false;
                    renderVocabBook();
                });
        }
    } else if (missingWords.length > 0) {
        console.log(`📚 [单词本] ${missingWords.length} 个词的释义本地与词典都没有（已请求过接口）→ 显示「暂无释义」占位`);
    }
}

// 从单词本点击"去分类"按钮打开分类面板（按文章分组）
function goSortFromWordbook(wordId) {
    const targetWord = userData.collectedWords.find(w => w.id == wordId);
    if (!targetWord) return;
    // 以这个单词所在文章为范围打开分类面板
    openSortPanelForArticle(targetWord.articleId, targetWord.article);
}

// 通用：调用后端更新单词分类状态（user_words 表），失败降级本地
async function updateWordStatusOnServer(id, newStatus, knowledge) {
    const word = userData.collectedWords.find(w => w.id === id);
    if (!word) return false;
    try {
        await apiPut('/api/word-status/' + id, { status: newStatus, knowledge: knowledge });
        word.status = newStatus;
        word.knowledge = knowledge;
        saveData();
        return true;
    } catch (e) {
        console.warn('⚠️ 分类接口失败，降级本地:', e.message);
        word.status = newStatus;
        word.knowledge = knowledge;
        saveData();
        return false;
    }
}

async function markMastered(id) {
    const ok = await updateWordStatusOnServer(id, 'mastered', 1);
    renderVocabBook();
    updateCollectBadge();
    toast(ok ? '已掌握！知识度+100%' : '已掌握（离线）');
}

// 标记为"学习中"
async function markLearning(id) {
    const ok = await updateWordStatusOnServer(id, 'learning', 0.5);
    renderVocabBook();
    updateCollectBadge();
    toast(ok ? '加入学习中队列' : '加入学习中队列（离线）');
}

// 标记为"需复习"
async function markNeedReview(id) {
    const ok = await updateWordStatusOnServer(id, 'review', 0.2);
    renderVocabBook();
    updateCollectBadge();
    toast(ok ? '加入复习队列，记得回头看哦!' : '加入复习队列（离线）');
}

// 兼容旧函数名：旧的 markReview = 新的 markLearning
function markReview(id) {
    markLearning(id);
}

function deleteWord(id) {
    userData.collectedWords = userData.collectedWords.filter(w => w.id !== id);
    saveData();
    renderVocabBook();
    updateCollectBadge();
    toast('Word deleted!');
}

// 用 pdf.js 提取 PDF 纯文本
async function parsePDF(file) {
    if (typeof pdfjsLib === 'undefined') {
        throw new Error('pdf.js 未加载');
    }
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    // 日志：先打印 PDF 总页数，便于排查「只显示部分内容」是否因漏页导致
    console.log(`📄 [PDF] 开始解析，总页数 = ${pdf.numPages}`);

    let fullText = '';
    let totalChars = 0;

    // 遍历每一页（pdf.numPages 是全部页数，逐页提取不丢页）
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();

        // 逐 item 拼接：hasEOL 表示该 item 后应换行，否则用空格，保留阅读顺序与换行结构
        let pageText = '';
        for (let i = 0; i < textContent.items.length; i++) {
            const item = textContent.items[i];
            const str = (item && item.str) ? item.str : '';
            pageText += str;
            if (item && item.hasEOL) {
                pageText += '\n';
            } else if (i < textContent.items.length - 1) {
                pageText += ' ';
            }
        }

        const pageChars = pageText.length;
        totalChars += pageChars;
        console.log(`📄 [PDF] 第 ${pageNum} 页提取字符数 = ${pageChars}${pageChars === 0 ? '（⚠️ 本页无文本，可能是扫描图片页）' : ''}`);

        fullText += pageText + '\n';
    }

    const finalText = fullText.trim();
    console.log(`📄 [PDF] 提取完成：共 ${pdf.numPages} 页，各页字符合计 = ${totalChars}，最终字符数 = ${finalText.length}`);

    return finalText;
}

// 用 mammoth.js 提取 .docx 纯文本
async function parseDocx(file) {
    if (typeof mammoth === 'undefined') {
        throw new Error('mammoth.js 未加载');
    }
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
    return (result && result.value ? result.value : '').trim();
}

function showUploadScreen() {
    document.getElementById('uploadTitle').value = '';
    document.getElementById('uploadContent').value = '';
    document.getElementById('charCount').textContent = '0';
    document.getElementById('articleLevelHint').textContent = '';
    document.getElementById('fileUpload').value = '';
    showScreen('uploadPage');
    
    setTimeout(() => {
        const textarea = document.getElementById('uploadContent');
        const fileInput = document.getElementById('fileUpload');
        
        if (textarea) {
            textarea.addEventListener('input', function() {
                const len = this.value.length;
                document.getElementById('charCount').textContent = len.toLocaleString();
                const hint = document.getElementById('articleLevelHint');
                if (len > 5000) {
                    hint.textContent = '⚠️ 文章较长，分析可能需要更长时间';
                    hint.style.color = '#D97706';
                } else if (len > 3000) {
                    hint.textContent = '📚 高中难度级别';
                    hint.style.color = '#DC2626';
                } else if (len > 500) {
                    hint.textContent = '📘 初中难度级别';
                    hint.style.color = '#D97706';
                } else if (len > 0) {
                    hint.textContent = '📗 入门级别';
                    hint.style.color = '#10B981';
                } else {
                    hint.textContent = '';
                }
            });
        }
        
        if (fileInput) {
            fileInput.addEventListener('change', async function(e) {
                const file = e.target.files && e.target.files[0];
                if (!file) return;
                const name = file.name || '';
                const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
                try {
                    let text = '';
                    if (ext === 'pdf') {
                        text = await parsePDF(file);
                    } else if (ext === 'docx') {
                        text = await parseDocx(file);
                    } else if (ext === 'txt' || ext === 'md' || ext === 'markdown') {
                        text = await file.text();
                    } else {
                        toast('不支持的文件格式，请使用 txt / md / pdf / docx');
                        return;
                    }
                    if (!text || !text.trim()) {
                        toast('文件解析失败（提取内容为空）');
                        return;
                    }
                    document.getElementById('uploadContent').value = text;
                    document.getElementById('uploadContent').dispatchEvent(new Event('input'));
                    if (!document.getElementById('uploadTitle').value) {
                        document.getElementById('uploadTitle').value = name.replace(/\.[^.]+$/, '');
                    }
                } catch (err) {
                    console.error('[上传] 文件解析失败:', err);
                    toast('文件解析失败，请重试或改用 txt / md 格式');
                }
            });
        }
    }, 100);
}

async function analyzeArticle() {
    const title = document.getElementById('uploadTitle').value.trim();
    const content = document.getElementById('uploadContent').value.trim();

    if (!content || content.length < 50) {
        toast('请输入至少50字符的英语文章内容');
        return;
    }

    analysisAbortController = new AbortController();
    analyzePollToken++;  // 新一轮分析：终止上一轮仍在进行的轮询

    // 检查是否通过 file:// 协议打开（没有服务器）
    const isLocalFile = window.location.protocol === 'file:';

    if (isLocalFile) {
        // 本地模式：直接使用示例数据（无后端）
        toast('本地模式：使用示例数据');
        setTimeout(() => {
            openAnalyzedArticle(generateMockResult(title || '用户文章', content));
        }, 500);
        return;
    }

    try {
        // 上传文章（立即返回 pending，不等 AI 完成）
        const uploadRes = await apiPost('/api/upload-article', { content, title });
        if (!uploadRes.success) throw new Error(uploadRes.error || '上传失败');
        const articleId = uploadRes.articleId;

        // 2026-09-30 需求变更：题目没生成时先进【等待页】，等题目（或降级/超时）就绪后再进阅读页。
        // 旧行为是「立刻进阅读页」——结果右侧题目区空空如也，用户以为坏了。
        // 现在：先把文章对象装进 currentArticle（阅读页 DOM 照常渲染，但停在后台），
        // 然后显式展示等待页，由 pollArticleProgress 在题目就绪时调 enterReadingPage() 切入。
        awaitingQuestionReady = true;
        openAnalyzedArticle({
            status: 'processing',
            articleId: articleId,
            title: title || '用户上传文章',
            description: '用户上传的英语文章',
            level: content.length > 3000 ? 'high' : 'middle',
            levelLabel: content.length > 3000 ? '高中' : '初中',
            article: content,
            words: {},
            sentences: [],
            questions: [],
            wordsReady: false,
            sentencesReady: false,
            questionsReady: false,
            isFallback: false
        }, { deferEnter: true });

        showWaitingPage({
            title: '正在生成阅读题目...',
            message: '文章已收到，正在同时生成单词释义、句子译文和阅读理解题。题目就绪后会自动进入阅读页。'
        });

        // 后台轮询，逐步回填释义与题目
        pollArticleProgress(articleId, title || '用户上传文章', content);
    } catch (err) {
        console.error('上传失败:', err);
        awaitingQuestionReady = false;
        toast('上传失败: ' + err.message);
        showScreen('uploadPage');
    }
}

function generateMockResult(title, content) {
    // 从文章中提取一些单词作为示例
    const words = extractWordsFromText(content);
    const mockWordList = words.slice(0, 20).map(w => ({
        word: w.word,
        meaning: w.meaning || '（示例释义）',
        isAcademic: w.isAcademic || false
    }));
    
    // 分割句子
    const sentences = content.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 10);
    const mockSentenceList = sentences.slice(0, 10).map((s, i) => ({
        index: i,
        original: s,
        translation: `（示例翻译）${s.substring(0, 30)}...`
    }));
    
    // 生成示例问题
    const mockQuestions = [
        {
            type: 'MAIN_IDEA',
            question: 'What is the main idea of this passage?',
            options: [
                'The passage discusses a specific topic in detail',
                'The passage tells a personal story',
                'The passage argues for a specific point of view',
                'The passage describes a historical event'
            ],
            answer: 0
        },
        {
            type: 'DETAIL',
            question: 'According to the passage, what is mentioned?',
            options: [
                'A specific example or detail',
                'A historical date',
                'A scientific theory',
                'A famous person'
            ],
            answer: 0
        },
        {
            type: 'INFERENCE',
            question: 'What can be inferred from the passage?',
            options: [
                'The author holds a specific viewpoint',
                'The event happened in a specific year',
                'The technology was invented by someone',
                'The location is in Europe'
            ],
            answer: 0
        },
        {
            type: 'VOCABULARY',
            question: 'What does the underlined word mean?',
            options: [
                'A specific meaning in context',
                'A literal translation',
                'A technical term',
                'A colloquial expression'
            ],
            answer: 0
        }
    ];
    
    return {
        id: 'mock_' + Date.now(),
        title: title,
        content: content,
        wordList: mockWordList,
        sentenceList: mockSentenceList,
        questions: mockQuestions,
        level: 'A2',
        levelLabel: '初中水平',
        fromCache: false
    };
}

function extractWordsFromText(text) {
    const wordRegex = /[A-Za-z]+(?:-[A-Za-z]+)*/g;
    const matches = text.match(wordRegex) || [];
    const uniqueWords = [...new Set(matches.map(w => w.toLowerCase()))];
    
    // 常用词释义（简化版）
    const commonMeanings = {
        'the': '这个', 'a': '一个', 'an': '一个', 'is': '是', 'are': '是',
        'was': '是', 'were': '是', 'be': '是', 'been': '是', 'being': '是',
        'have': '有', 'has': '有', 'had': '有', 'do': '做', 'does': '做',
        'did': '做', 'will': '将', 'would': '将', 'could': '能', 'should': '应该',
        'may': '可能', 'might': '可能', 'must': '必须', 'shall': '将',
        'can': '能', 'need': '需要', 'dare': '敢', 'ought': '应该',
        'used': '使用', 'to': '到', 'of': '的', 'in': '在', 'for': '为了',
        'on': '在...上', 'with': '和', 'at': '在', 'by': '被', 'from': '从',
        'as': '作为', 'into': '进入', 'through': '通过', 'during': '在...期间',
        'before': '之前', 'after': '之后', 'above': '之上', 'below': '之下',
        'between': '之间', 'out': '外面', 'off': '离开', 'over': '超过',
        'under': '之下', 'again': '再次', 'further': '进一步', 'then': '然后',
        'once': '曾经', 'here': '这里', 'there': '那里', 'when': '当',
        'where': '哪里', 'why': '为什么', 'how': '如何', 'all': '所有',
        'both': '两者', 'each': '每个', 'few': '少量', 'more': '更多',
        'most': '最多', 'other': '其他', 'some': '一些', 'such': '这样的',
        'no': '不', 'nor': '也不', 'not': '不', 'only': '只有', 'own': '自己的',
        'same': '相同的', 'so': '所以', 'than': '比', 'too': '也',
        'very': '非常', 'just': '只是', 'because': '因为', 'but': '但是',
        'and': '和', 'or': '或', 'if': '如果', 'while': '当', 'although': '虽然',
        'though': '虽然', 'that': '那个', 'which': '哪个', 'who': '谁',
        'whom': '谁', 'this': '这个', 'these': '这些', 'those': '那些',
        'i': '我', 'you': '你', 'he': '他', 'she': '她', 'it': '它',
        'we': '我们', 'they': '他们', 'me': '我', 'him': '他', 'her': '她',
        'us': '我们', 'them': '他们', 'my': '我的', 'your': '你的',
        'his': '他的', 'its': '它的', 'our': '我们的', 'their': '他们的',
        'what': '什么', 'which': '哪个', 'who': '谁', 'whom': '谁',
        'am': '是', 'been': '是', 'being': '是'
    };
    
    return uniqueWords.map(word => ({
        word: word,
        meaning: commonMeanings[word] || null,
        isAcademic: word.length > 6
    })).filter(w => w.meaning); // 只返回有释义的词
}

// ==================== 等待页（题目生成期间） ====================
// 复用 index.html 里本来就存在、但此前没人调用的 #loadingPage（样式齐全：#loadingTitle /
// #loadingMessage / #loadingProgressBar / #loadingProgress / #longArticleHint / #useFallbackBtn）。

function setWaitingProgress(percent) {
    const p = Math.max(0, Math.min(100, Math.round(percent)));
    const bar = document.getElementById('loadingProgressBar');
    const txt = document.getElementById('loadingProgress');
    if (bar) bar.style.width = p + '%';
    if (txt) txt.textContent = String(p);
}

// 展示/刷新等待页（不重复 showScreen 也没关系，showScreen 是幂等的）
function showWaitingPage(opts) {
    const o = opts || {};
    const titleEl = document.getElementById('loadingTitle');
    const msgEl = document.getElementById('loadingMessage');
    if (titleEl && o.title) titleEl.textContent = o.title;
    if (msgEl && o.message) msgEl.textContent = o.message;
    const hint = document.getElementById('longArticleHint');
    if (hint) hint.classList.toggle('hidden', !o.longHint);
    const fb = document.getElementById('useFallbackBtn');
    if (fb) fb.classList.add('hidden');   // 「使用基础题目」按钮默认藏起来，30 秒后才放出来
    if (o.progress === undefined) setWaitingPageProgressByStage(o.status, o.elapsed);
    else setWaitingProgress(o.progress);
    showScreen('loadingPage');
    console.log(`⏳ [等待页] 展示 | 进展=${document.getElementById('loadingProgress') ? document.getElementById('loadingProgress').textContent : '?'}% | ${o.message || ''}`);
}

// 按「已就绪的工作流」推进进度条，避免用户觉得卡死
function setWaitingPageProgressByStage(status, elapsedMs) {
    let p = 10;
    if (status && status.wordsReady) p = Math.max(p, 35);
    if (status && status.sentencesReady) p = Math.max(p, 55);
    // 时间维度再叠加一点缓慢爬升（最多到 90%），让进度条保持「在动」
    if (elapsedMs) p = Math.max(p, Math.min(90, 10 + Math.round(elapsedMs / 1000) * 1.2));
    setWaitingProgress(Math.min(90, p));
}

// 题目/降级/超时就绪 → 从等待页切进阅读页。
// 用 awaitingQuestionReady 做守卫：只有「确实在等」的那一次才切，避免异步竞态误切页面。
function enterReadingPage(reason) {
    if (!awaitingQuestionReady) {
        console.log(`🚪 [阅读页] 忽略进入请求（当前不在等待页）| ${reason}`);
        return;
    }
    awaitingQuestionReady = false;
    console.log(`🚪 [阅读页] 就绪（${reason}）→ 进入阅读页`);
    setWaitingProgress(100);
    showScreen('readingPage');
    // 进阅读页：一次性把本文所有词的词典释义拉回本地缓存，此后点任何词都是 0 网络出卡
    prefetchDictionaryForArticle();
    // 阅读页此刻才真正 active；deferEnter 期间判断会直接返回，所以放到这里再判一次
    showDragGuideIfNeeded();
}

// 30 秒仍未出题：在等待页放出「使用基础题目」按钮，同时更新文案（不强制跳页）
function revealWaitingFallback(elapsedMs) {
    const fb = document.getElementById('useFallbackBtn');
    if (fb) fb.classList.remove('hidden');
    const msgEl = document.getElementById('loadingMessage');
    if (msgEl) {
        // 2026-09-30：文案不再带「已等待 X 秒」（用户要求等待页不显示秒数）
        msgEl.textContent = '题目生成较慢。可以继续等待，或点下方按钮先用基础题目进入阅读页。';
    }
    console.log(`⏳ [等待页] 已放出「使用基础题目」入口（已等待 ${Math.round((elapsedMs || 0) / 1000)}s，秒数仅打在日志里）`);
}

/**
 * 后台轮询文章处理进度，逐步回填释义与题目（谁先完成谁先渲染）
 * - article_word_analyzer 完成 → 回填 words/sentences，用户点词即可看释义
 * - quiz_generator 完成 → 回填 questions，显示「开始测试」按钮 / 题目
 *
 * 2026-09-30 起：题目未就绪时前端停在等待页（awaitingQuestionReady=true），
 * 题目（或降级/超时/手动点「使用基础题目」）一就绪就调 enterReadingPage() 切进阅读页。
 */
function pollArticleProgress(articleId, title, content) {
    const pollInterval = 2000;
    let elapsed = 0;
    const hintWait = 30000;   // 30 秒后给出「使用基础题目」入口
    const maxWait = 300000;   // 300 秒（5 分钟）后不再等题目（保留阅读页与降级入口）
    // ★ 2026-10-08 新增：quiet 阶段（已在阅读页）的后台补拉上限。
    //   比 maxWait 宽得多，因为句子翻译在长文章上可能跑好几分钟，而这里只是每 2 秒查一次状态。
    const quietMaxWait = 900000;   // 15 分钟
    const pollToken = ++analyzePollToken;
    window._timeoutArticleId = null;

    // ★★ 2026-10-08 问题一（反复出现）的根因修复 ★★
    //
    // 旧实现在「题目就绪」时直接 `return` —— 轮询到此为止。但释义/译文/题目是三个
    // **并行**工作流（queue.js 里 Promise.allSettled），quiz_generator 常常最先完成：
    //     题目就绪 → 进阅读页 → 轮询结束 → 20 秒后句子翻译才成功（后端日志「句子翻译成功（19 句）」）
    //   → 却**没有任何人在听**，前端 currentArticle.sentences 永远是空数组。
    // 又因为上传链路给文章打了 detailLoaded=true，`shouldFetchArticleDetail()` 恒为 false，
    // 「服务端说有译文就补拉详情」的自愈路径也被挡住 → 浮层永远「这篇还没有生成译文」。
    //
    // 现在：进阅读页只代表「可以开始读了」，轮询**继续在后台守着**（quiet 阶段），
    // 直到文章落到终态（completed / partial / failed）再把迟到的译文原地贴上。
    let quiet = false;        // true = 已进阅读页，静默后台补拉
    let quietElapsed = 0;

    const artOf = (id) => ARTICLES.find(a => a.id === id);

    const poll = async () => {
        if (pollToken !== analyzePollToken) return;  // 已被手动降级/取消/新一轮分析取代
        try {
            const status = await apiGet('/api/article-status/' + articleId);
            if (pollToken !== analyzePollToken) return;
            console.log(`📡 [轮询] articleId=${articleId} | 状态=${status.status} | 释义就绪=${!!status.wordsReady} | 译文就绪=${!!status.sentencesReady} | 题目就绪=${!!status.questionsReady} | 单词数=${(status.words && Object.keys(status.words).length) || 0} | 句子数=${(status.sentences && status.sentences.length) || 0} | 题目数=${(status.questions && status.questions.length) || 0} | 阶段=${quiet ? '后台补拉' : '等待题目'} | 已耗时=${elapsed}ms`);

            // ==================== 终态：completed / partial / failed ====================
            // 走到这里三个工作流都已经结束（成功或失败），status 里带的是**完整**结果，
            // 所以这里必须把释义+译文+题目**一次性全部回填** —— 这正是修复「迟到译文」的落点。
            const terminal = applyTerminalStatus(articleId, status, quiet);
            if (terminal) {
                if (!quiet) {
                    enterReadingPage(terminal === 'failed' ? 'AI 失败，已使用降级题目'
                        : (terminal === 'partial' ? '部分完成（句子翻译失败）' : '分析完成（completed）'));
                }
                return;   // 终态 = 真正结束
            }

            // ==================== processing：逐步回填 ====================
            // 释义（words）、译文（sentences）、题目（questions）是三个独立工作流，
            // 谁先就绪谁先渲染 —— 所以这里必须各自判各自的 ready 标记，不能只盯 wordsReady，
            // 否则「句子翻译先成功、单词释义还在跑」时译文永远不显示。
            // 未就绪的那一项传 null，交给 applyPartialProgress 原样保留，避免用空值把已有结果冲掉。
            if (status.wordsReady || status.sentencesReady) {
                applyPartialProgress({
                    words: status.wordsReady ? (status.words || {}) : null,
                    sentences: status.sentencesReady ? (status.sentences || []) : null,
                    wordsReady: !!status.wordsReady,
                    sentencesReady: !!status.sentencesReady
                }, articleId);
            }

            // 句子翻译在工作流里已经失败、但题目还没好（我们还停在等待页）：
            // 提前把失败原因挂到当前文章上，这样「题目一就绪进阅读页」时提示条就已经在了，
            // 不会出现「先正常进入、过一会儿才冒出警告」的跳变。
            if (status.sentencesFailed && currentArticle && currentArticle.id === articleId) {
                currentArticle.sentencesError = status.sentencesError || '句子翻译工作流失败';
                console.warn(`⚠️ [轮询] 句子翻译已失败（文章尚未落库为 partial）| 原因=${currentArticle.sentencesError}`);
                syncSentenceFailedNotice();
            }

            // 题目就绪 → 结束等待，进阅读页（只做一次；之后转 quiet 后台补拉）
            if (status.questionsReady && status.questions && status.questions.length) {
                const a3 = artOf(articleId);
                if (!(a3 && a3.questionsReady)) {
                    applyPartialProgress({ questions: status.questions, questionsReady: true }, articleId);
                }
                if (!quiet) {
                    enterReadingPage(`题目就绪（${status.questions.length} 题）`);
                    quiet = true;
                    quietElapsed = 0;
                    const stillPending = [];
                    if (!status.wordsReady) stillPending.push('释义');
                    if (!status.sentencesReady) stillPending.push('译文');
                    if (stillPending.length) {
                        console.log(`🔁 [轮询] 已进阅读页，但 ${stillPending.join('、')} 尚未就绪 → 转【后台补拉】，`
                            + `等它们落地后原地重绘（不再像旧版那样直接停止轮询）`);
                    } else {
                        console.log('🔁 [轮询] 已进阅读页；三项工作流均已就绪 → 后台等最后一次终态确认');
                    }
                }
            }

            // 还在等：刷新等待页文案与进度条，避免看着像卡死
            if (awaitingQuestionReady) {
                const done = [];
                if (status.wordsReady) done.push('释义');
                if (status.sentencesReady) done.push('译文');
                showWaitingPage({
                    title: '正在生成阅读题目...',
                    // 2026-09-30：去掉「（已等待 X 秒）」——用户要求等待页不要显示秒数
                    message: done.length
                        ? `已完成：${done.join('、')}；正在生成阅读理解题…`
                        : '正在同时生成单词释义、句子译文和阅读理解题…',
                    longHint: elapsed >= 20000,
                    status: status,
                    elapsed: elapsed
                });
            }

            if (quiet) {
                // 已在阅读页：只计数 quiet 阶段的等待时长，不碰 elapsed（那只服务于等待页文案）
                quietElapsed += pollInterval;
                if (quietElapsed >= quietMaxWait) {
                    console.warn(`⏰ [轮询] 后台补拉超时（${quietMaxWait / 1000}s）仍未到终态 → 停止轮询`
                        + `（文章在后端仍会完成；下次打开会靠详情补拉兜底）| articleId=${articleId}`);
                    return;
                }
                setTimeout(poll, pollInterval);
                return;
            }

            elapsed += pollInterval;

            // 30 秒：题目区给出「使用基础题目」入口（等待页 + 阅读页两处），但继续轮询
            if (elapsed >= hintWait && !window._timeoutArticleId) {
                window._timeoutArticleId = articleId;
                showQuizFallbackLink();
                revealWaitingFallback(elapsed);
            }

            // 5 分钟仍未出题：先进阅读页让用户手动选择，但**继续后台补拉**
            //（旧版在这里 return，等于把还没跑完的句子翻译彻底丢掉）
            if (elapsed >= maxWait) {
                console.log('⏰ [轮询] 等待题目超时，先进阅读页并保留降级入口 → 同时转后台补拉');
                enterReadingPage('轮询超时');
                quiet = true;
                quietElapsed = 0;
            }

            setTimeout(poll, pollInterval);
        } catch (e) {
            // 网络抖动/瞬时错误不应永久终止轮询：继续重试，直到 token 失效或超时
            console.error('⚠️ [轮询] 请求失败，稍后重试:', e && e.message);
            if (pollToken !== analyzePollToken) return;
            if (quiet) {
                quietElapsed += pollInterval;
                if (quietElapsed >= quietMaxWait) {
                    console.warn(`⏰ [轮询] 后台补拉超时（多次失败）→ 停止 | articleId=${articleId}`);
                    return;
                }
            } else {
                elapsed += pollInterval;
                if (elapsed >= maxWait) {
                    console.log('⏰ 轮询超时（多次失败），进入阅读页并保留降级入口 → 转后台补拉');
                    enterReadingPage('轮询超时（多次失败）');
                    quiet = true;
                    quietElapsed = 0;
                }
            }
            setTimeout(poll, pollInterval);
        }
    };

    setTimeout(poll, pollInterval);
}

/**
 * 清掉文章的「仍在生成中」标记（analyzing）。
 * 文章落到终态（completed / partial / failed）或详情已完整拉到时就该清 ——
 * 浮层靠这个标记区分「还在生成」（说「译文还在加载中」）和「生成完了却没有译文」（说「还没生成译文」）。
 */
function clearAnalyzingFlag(articleId) {
    const a = ARTICLES.find(x => x.id === articleId);
    if (a && a.analyzing) {
        a.analyzing = false;
        console.log(`🏁 [阅读页] ${articleId} 已到终态 → 清除 analyzing 标记`);
    }
    if (currentArticle && currentArticle.id === articleId && currentArticle.analyzing) {
        currentArticle.analyzing = false;
    }
}

/**
 * ★ 文章到达终态（completed / partial / failed）时的**唯一**回填入口 ★
 *
 * 为什么必须唯一：问题一反复出现的根本原因是「有两条路在等同一篇文章完成后端结果，
 * 但只有其中一条会回填」——quiz 先就绪就走人，句子翻译晚了就没人收。把回填收敛成一个函数，
 * 以后不管是轮询、后台守护还是手工补拉，**只要拿到终态就走这里**，不会再漏。
 *
 * 做的事：
 *   ① 一次性回填释义 / 译文 / 题目（译文就在 status.sentences 里，这是「迟到译文」的落点）
 *   ② 清 analyzing 标记（浮层从此可以下「有译文 / 真没译文」的结论）
 *   ③ partial → 挂失败原因并同步提示条；failed → 打降级提示
 *   ④ 用户在阅读页看的就是这篇 → 立刻重绘正文，悬停即可看中文
 *
 * @param {string} articleId
 * @param {object} status   /api/article-status/:id 的响应
 * @param {boolean} [quiet] true = 用户已在阅读页（后台补拉阶段），不弹降级提示
 * @returns {string|null}   'completed' | 'partial' | 'failed'；不是终态则返回 null
 */
function applyTerminalStatus(articleId, status, quiet) {
    const st = status && status.status;
    if (st !== 'completed' && st !== 'partial' && st !== 'failed') return null;

    const nSent = (status.sentences || []).length;
    console.log(`✅ [终态落库] ${articleId} → status=${st} | 回填释义 ${Object.keys(status.words || {}).length} 个`
        + ` / 译文 ${nSent} 句 / 题目 ${(status.questions || []).length} 道`
        + (quiet ? '｜后台补拉阶段：用户已在阅读页，直接原地重绘' : ''));

    applyPartialProgress({ words: status.words || {}, sentences: status.sentences || [], wordsReady: true, sentencesReady: true }, articleId);
    applyPartialProgress({ questions: status.questions || [], questionsReady: true }, articleId);
    clearAnalyzingFlag(articleId);

    if (st === 'partial') {
        // 部分完成：单词释义 / 题目都成功了，只有句子翻译失败（后端不再静默降级成 completed）。
        // 处理方式跟 completed 一致（都是真结果），但要多一步「如实告知译文缺失」。
        const reason = status.sentencesError || '句子翻译工作流失败';
        console.warn(`⚠️ [终态落库] ${articleId} 句子翻译失败 | 原因=${reason}`);
        const a = ARTICLES.find(x => x.id === articleId);
        if (a) { a.status = 'partial'; a.sentencesError = reason; }
        if (currentArticle && currentArticle.id === articleId) {
            currentArticle.status = 'partial';
            currentArticle.sentencesError = reason;
            syncSentenceFailedNotice();
        }
    }

    if (st === 'failed') {
        console.log(`🩹 [终态落库] ${articleId} 收到 failed，已回填降级题目与缓存释义`);
        const a = ARTICLES.find(x => x.id === articleId);
        if (a) a.status = 'failed';
        if (currentArticle && currentArticle.id === articleId) {
            currentArticle.status = 'failed';
            if (!quiet) showFallbackNotice();
        }
    }

    if (currentArticle && currentArticle.id === articleId) {
        // 把迟到的译文/释义原地贴上：重绘正文后悬停即可看中文
        renderArticleWithTranslations();
        markCollectedSpans();
        syncSentenceFailedNotice();
        console.log(`🎨 [终态落库] ${articleId} 已重绘正文｜译文 ${(currentArticle.sentences || []).length} 句`
            + ` / 释义 ${Object.keys(currentArticle.words || {}).length} 个 → 悬停句子即可看中文`);
    } else {
        console.log(`📥 [终态落库] ${articleId} 不是当前文章（当前=${currentArticle && currentArticle.id}）→ 只更新内存，不重绘`);
    }
    return st;
}

// ==================== 后台补拉守护（2026-10-08 新增）====================
// 场景：文章还在生成中，但「等待题目 → 进阅读页」这条轮询已经被主动终止
//（用户点了「使用基础题目」/「取消分析」，或轮询 15 分钟上限到了）。
// 旧代码在这里就彻底没人听了，迟到的句子翻译静默丢失。
// 本守护**不切页、不弹提示**，只做一件事：等到终态就把数据补上并重绘。
const BACKFILL_INTERVAL_MS = 2000;
const BACKFILL_MAX_MS = 900000;      // 15 分钟
const backfillRunning = {};          // articleId → true，防止重复守护
const backfillTokens = {};           // articleId → token（**按文章独立**，避免补 A 时把 B 的守护掐掉）

function backfillArticleUntilTerminal(articleId, why) {
    if (!articleId) return;
    if (backfillRunning[articleId]) {
        console.log(`🔁 [后台补拉] ${articleId} 已有守护在跑，跳过（原因=${why || '未说明'}）`);
        return;
    }
    backfillRunning[articleId] = true;
    const token = (backfillTokens[articleId] || 0) + 1;
    backfillTokens[articleId] = token;
    const t0 = Date.now();
    const isStale = () => backfillTokens[articleId] !== token;
    console.log(`🔁 [后台补拉] 开始守护 ${articleId} | 原因=${why || '未说明'}`
        + ` | 间隔 ${BACKFILL_INTERVAL_MS}ms | 上限 ${BACKFILL_MAX_MS / 1000}s`);

    const stop = (whyStop) => {
        delete backfillRunning[articleId];
        console.log(`🔁 [后台补拉] 停止守护 ${articleId} | ${whyStop} | 共守护 ${Math.round((Date.now() - t0) / 1000)}s`);
    };

    const tick = async () => {
        if (isStale()) { stop('已被同一篇文章的新一轮守护取代'); return; }
        if (Date.now() - t0 >= BACKFILL_MAX_MS) { stop('达到时间上限'); return; }
        let st = null;
        try {
            st = await apiGet('/api/article-status/' + encodeURIComponent(articleId));
        } catch (e) {
            console.warn(`🔁 [后台补拉] ${articleId} 状态查询失败，${BACKFILL_INTERVAL_MS / 1000}s 后重试：${(e && e.message) || e}`);
            setTimeout(tick, BACKFILL_INTERVAL_MS);
            return;
        }
        if (isStale()) { stop('已被同一篇文章的新一轮守护取代'); return; }

        const sent = (st.sentences || []).length;
        console.log(`🔁 [后台补拉] ${articleId} | 状态=${st.status} | 译文=${sent} 句`
            + ` | 已守护 ${Math.round((Date.now() - t0) / 1000)}s`);

        const terminal = applyTerminalStatus(articleId, st, true);
        if (terminal) { stop(`到达终态 ${terminal}（译文 ${sent} 句）`); return; }
        setTimeout(tick, BACKFILL_INTERVAL_MS);
    };
    setTimeout(tick, BACKFILL_INTERVAL_MS);
}

// 把后端返回的部分结果合并进 currentArticle 并触发局部渲染
// 三个字段各自独立合并：
//   - 未就绪的项（值为 null/undefined）原样保留，绝不用空值覆盖已有结果
//   - 只有内容真的变了才重绘正文 —— renderArticleWithTranslations 会重建 readContent 的 innerHTML，
//     每 2 秒轮询都白重绘一次的话，用户正在划的选区、悬停浮层会被反复清掉，手感就是「卡」
//
// 2026-10-08：新增第二个参数 articleId —— 因为轮询现在会**跨页面**在后台补拉
// （用户可能已经切到别的文章），结果必须写进指定文章的内存对象，
// 且只有「这篇正好是当前在看的」才允许重绘，否则会把别人的正文改掉。
function applyPartialProgress(part, articleId) {
    const targetId = articleId || (currentArticle && currentArticle.id);
    const art = ARTICLES.find(a => a.id === targetId);
    if (!art) {
        console.log(`⚠️ [applyPartialProgress] 内存里找不到文章 ${targetId}，跳过`);
        return;
    }
    // 只有「目标文章 = 当前正在阅读的文章」时才碰 currentArticle / 触发重绘
    let isCurrent = !!(currentArticle && currentArticle.id === targetId);
    if (isCurrent && currentArticle !== art) {
        // ▲ 同 id 但不同对象 = 引用分叉（详情替换内存条目时会产生）。
        //   必须把 currentArticle 重新指向 ARTICLES 里那个「权威对象」，
        //   否则后面 renderArticleWithTranslations() 读的还是旧对象的空 sentences。
        console.warn(`🔗 [applyPartialProgress] ${targetId} 的 currentArticle 与内存条目已分叉 → 重新指向权威对象`);
        currentArticle = art;
        isCurrent = true;
    }
    if (!isCurrent) {
        console.log(`📥 [applyPartialProgress] ${targetId} 不是当前文章（当前=${currentArticle && currentArticle.id}）→ 只更新内存，不重绘`);
    }

    let needRenderArticle = false;

    if (part.questionsReady) {
        const prevReady = !!art.questionsReady;
        art.questions = part.questions || [];
        art.questionsReady = true;
        console.log(`📝 [applyPartialProgress] 题目就绪：${art.questions.length} 题（此前已就绪=${prevReady}）`);
        // 仅在题目「首次」就绪时渲染一次；后续重复轮询不再重绘，避免清空用户已作答状态
        if (!prevReady && isCurrent) {
            try {
                revealQuiz();
            } catch (e) {
                console.error('❌ [applyPartialProgress] 渲染题目失败:', e && e.message);
            }
        }
    }

    if (part.wordsReady && part.words) {
        const prevCount = Object.keys(art.words || {}).length;
        const nowCount = Object.keys(part.words).length;
        art.words = part.words;
        art.wordsReady = true;
        console.log(`🔤 [applyPartialProgress] 释义就绪：单词=${nowCount}（此前 ${prevCount}）`);
        if (nowCount !== prevCount) needRenderArticle = true;
    }

    if (part.sentencesReady && part.sentences) {
        const prevLen = (art.sentences || []).length;
        const nowLen = part.sentences.length;
        art.sentences = part.sentences;
        art.sentencesReady = true;
        console.log(`🌐 [applyPartialProgress] 译文就绪：句子=${nowLen}（此前 ${prevLen}，示例="${String((part.sentences[0] || {}).translation || '').substring(0, 20)}"）`);
        if (nowLen !== prevLen) needRenderArticle = true;
    }

    if (needRenderArticle && isCurrent) {
        console.log('🎨 [applyPartialProgress] 释义/译文有变化 → 重绘正文（含句子悬停译文）');
        renderArticleWithTranslations();
        markCollectedSpans();
    }
}

// 显示 AI 降级提示条
function showFallbackNotice() {
    const notice = document.getElementById('fallbackNotice');
    if (notice) notice.classList.remove('hidden');
}

/**
 * 句子翻译失败提示条（文章 status='partial'）—— 2026-10-06 新增，2026-10-07 加「重试」按钮。
 *
 * 后端以前把「句子翻译失败」静默写成 status='completed' + sentences=[]，
 * 用户看到的只是「这篇没译文」，无从知道是**生成失败**。现在 queue.js 落 status='partial'
 * 并把原因写进 sentences_error，这里如实告诉用户：
 *   - 正文 / 单词释义 / 题目全部正常（后端 partial 就是「只有译文挂了」）；
 *   - 译文区域给出「⚠️ 句子翻译暂时不可用 + 重试」，点重试只重跑句子翻译工作流。
 */

// 正在重试译文的目标文章 id（null = 空闲）。用来防止连点，并保证切换文章后按钮状态不会串。
let sentenceRetryTargetId = null;
let sentenceRetryPollToken = 0;

/** 重试按钮的两态切换 */
function setSentenceRetryButtonState(state) {
    const btn = document.getElementById('sentenceRetryBtn');
    if (!btn) return;
    if (state === 'busy') {
        btn.disabled = true;
        btn.textContent = '重试中…';
    } else {
        btn.disabled = false;
        btn.textContent = '重试';
    }
}

function showSentenceFailedNotice(reason, kind) {
    const bar = document.getElementById('sentenceFailNotice');
    if (!bar) {
        console.warn('⚠️ [阅读页] 未找到 #sentenceFailNotice 节点，无法显示句子翻译失败提示');
        return;
    }
    const txt = document.getElementById('sentenceFailNoticeText');
    if (txt) {
        // 'missing' = completed 却一句译文都没有（存量静默降级）—— 文案要说「还没生成」而不是「不可用」，
        // 两者对用户的含义不同：前者是「从来没做」，后者是「做了但这次失败」。
        const isMissing = (kind === 'missing');
        txt.textContent = isMissing ? '这篇还没有生成译文' : '句子翻译暂时不可用';
        // 原因不摆在明面上（对用户没意义），放 title 里给排查用
        txt.title = reason ? `原因：${String(reason)}` : (isMissing ? '原因：历史数据里句子翻译曾静默失败（status=completed 但译文为 0 句）' : '');
    }
    // 按钮状态：只有「当前这篇正在重试」才显示重试中，其它情况（含切到别的文章）一律可点
    const busyHere = !!(sentenceRetryTargetId && currentArticle && sentenceRetryTargetId === currentArticle.id);
    setSentenceRetryButtonState(busyHere ? 'busy' : 'idle');
    bar.classList.remove('hidden');
    console.warn(`⚠️ [阅读页] 译文不可用 → 已显示提示条（含「重试」按钮）`
        + ` | 类型=${kind === 'missing' ? '从未生成(missing)' : '翻译失败(failed)'}`
        + ` | 原因=${reason || '（未提供）'} | 重试中=${busyHere}`);
}

function hideSentenceFailedNotice() {
    const bar = document.getElementById('sentenceFailNotice');
    if (bar) bar.classList.add('hidden');
}

/**
 * 按当前文章同步提示条显隐（切文章 / 详情补齐 / 详情加载完 / 重试落库后都要重新判一次）。
 * 2026-10-08：判定收敛到 articleTranslationState()，并**新增 missing 分支** ——
 * 真库里有 6 篇 status='completed' 但 sentences=[] 的上传文章（早期静默降级的存量），
 * 过去它们既没有提示条也没有重试入口，用户只能看到浮层「（暂无翻译）」，无从知道能重试。
 */
function syncSentenceFailedNotice() {
    if (!currentArticle) return;
    const state = articleTranslationState();
    if (state === 'failed') showSentenceFailedNotice(currentArticle.sentencesError, 'failed');
    else if (state === 'missing') showSentenceFailedNotice(null, 'missing');
    else hideSentenceFailedNotice();
    console.log(`🆚 [阅读页] 译文状态同步 → ${state}`
        + `（status=${currentArticle.status}、译文 ${(currentArticle.sentences || []).length} 句、`
        + `详情已加载=${!!currentArticle.detailLoaded}、来源=${currentArticle.source}）`);
}

/**
 * 把「重试句子翻译」的结果写回内存与界面（成功 → 上译文 + 收起提示条；失败 → 保持提示条 + 更新原因）。
 * 失败时**不改动正文 / 单词释义 / 题目** —— 它们本来就是好的。
 */
function applyRetriedSentences(articleId, sentences, errorReason) {
    const art = ARTICLES.find(a => a.id === articleId);
    const ok = !!(sentences && sentences.length > 0);

    if (ok) {
        if (art) { art.sentences = sentences; art.status = 'completed'; art.sentencesError = null; }
    } else if (art) {
        art.status = 'partial';
        if (errorReason) art.sentencesError = errorReason;
    }

    if (currentArticle && currentArticle.id === articleId) {
        if (ok) {
            currentArticle.sentences = sentences;
            currentArticle.status = 'completed';
            currentArticle.sentencesError = null;
        } else {
            currentArticle.status = 'partial';
            if (errorReason) currentArticle.sentencesError = errorReason;
        }
    }

    if (ok) {
        console.log(`✅ [重试译文] 译文已就位：${articleId} | ${sentences.length} 句 → status=completed（提示条即将收起）`);
        // 只在用户还停在这一篇时重绘正文（重绘会把译文挂到 .article-sentence 上，悬停即可看中文）
        if (currentArticle && currentArticle.id === articleId) renderArticleWithTranslations();
    } else {
        console.warn(`⚠️ [重试译文] 仍未成功：${articleId} | 原因=${errorReason || '（未提供）'} → 保持 partial`);
    }

    syncSentenceFailedNotice();
}

const SENTENCE_RETRY_POLL_MS = 1500;    // 轮询间隔
const SENTENCE_RETRY_MAX_MS = 120000;   // 最多等 2 分钟（单次句子工作流足够）

/**
 * 点「重试」后的轮询：/api/retry-sentences 是 202 立即返回的，最终结果靠这里读。
 *
 * 判定依据（关键）：重试期间 DB 的 status **一直保持 partial**，所以不能只看 status，
 * 必须同时看后端透出的 `sentencesRetrying`：
 *   - status=completed 且译文非空                → 成功
 *   - status=partial 且 sentencesRetrying=false  → 重试已结束但仍失败（后端已把新原因写回）
 *   - status=partial 且 sentencesRetrying=true   → 还在跑，继续等
 */
async function pollSentenceRetry(articleId, token) {
    const t0 = Date.now();
    while (Date.now() - t0 < SENTENCE_RETRY_MAX_MS) {
        await new Promise(r => setTimeout(r, SENTENCE_RETRY_POLL_MS));
        if (token !== sentenceRetryPollToken) {
            console.log('🔁 [重试译文] 轮询已被新的动作取代，停止');
            return;
        }

        let st;
        try {
            st = await apiGet('/api/article-status/' + encodeURIComponent(articleId));
        } catch (e) {
            console.warn('⚠️ [重试译文] 轮询请求失败，继续等:', (e && e.message) || e);
            continue;
        }

        const count = (st.sentences || []).length;
        console.log(`🔁 [重试译文] 轮询 | status=${st.status} | 重试中=${!!st.sentencesRetrying}`
            + ` | 译文=${count} 句 | 已等 ${Math.round((Date.now() - t0) / 1000)}s`);

        // 成功：拿到了非空译文（无论原来是 partial 还是 completed+空）
        if (st.status === 'completed' && count > 0) {
            applyRetriedSentences(articleId, st.sentences, null);
            toast(`译文生成成功（${count} 句），悬停句子即可查看`);
            return;
        }
        // 还在跑：重试期间 DB 的 status **不会变**——原来 partial 就还是 partial，
        // 原来是 completed+空译文的（存量 missing）就还是 completed。所以不能只看 status，
        // 必须同时看后端透出的 sentencesRetrying。少判这一条会出现：
        // 「completed 且译文仍为 0」被当成「非预期状态」直接停止等待，用户点完重试什么都不发生。
        if (st.sentencesRetrying) {
            console.log('🔁 [重试译文] 后端仍在跑（sentencesRetrying=true），继续等');
            continue;
        }
        // 重试已结束但仍然是空译文 → 失败
        if ((st.status === 'partial' || st.status === 'completed') && count === 0) {
            applyRetriedSentences(articleId, null, st.sentencesError || '句子翻译工作流失败');
            toast('译文重试仍未成功，稍后可再试');
            return;
        }
        if (st.status !== 'partial' && st.status !== 'processing') {
            console.warn(`⚠️ [重试译文] 遇到非预期状态=${st.status}（译文 ${count} 句），停止等待`);
            return;
        }
    }
    console.warn(`⏰ [重试译文] 轮询超时（${SENTENCE_RETRY_MAX_MS / 1000}s）仍未拿到最终结果 | articleId=${articleId}`);
    toast('译文重试仍在进行，稍后刷新查看');
}

/**
 * 用户点「重试」—— 只重跑句子翻译工作流。
 * 正文 / 单词释义 / 题目都不受影响（后端 startSentenceRetry 只调 analyzeSentencesWithCoze）。
 */
async function retrySentenceTranslation() {
    const articleId = currentArticle && currentArticle.id;
    if (!articleId) { toast('无法获取文章信息，请稍后重试'); return; }
    if (sentenceRetryTargetId) {
        console.log(`⏭️ [重试译文] 已有重试在跑（articleId=${sentenceRetryTargetId}），忽略本次点击`);
        return;
    }

    const token = ++sentenceRetryPollToken;
    sentenceRetryTargetId = articleId;
    setSentenceRetryButtonState('busy');
    console.log(`🔁 [重试译文] 用户点击「重试」| articleId=${articleId}`);

    try {
        const r = await apiPost('/api/retry-sentences/' + encodeURIComponent(articleId), {});
        console.log('🔁 [重试译文] 接口返回:', JSON.stringify(r));

        // 幂等命中：后端发现译文已经存在（比如别人刚重试成功）→ 直接采用
        if (r && r.alreadyDone && Array.isArray(r.sentences) && r.sentences.length > 0) {
            applyRetriedSentences(articleId, r.sentences, null);
            toast('译文已经生成好了');
            return;
        }

        await pollSentenceRetry(articleId, token);
    } catch (e) {
        console.error('❌ [重试译文] 请求失败:', (e && e.message) || e);
        toast('重试请求失败，请稍后再试');
    } finally {
        if (sentenceRetryTargetId === articleId) {
            sentenceRetryTargetId = null;
            setSentenceRetryButtonState('idle');
        }
    }
}


// 题目区显示「使用基础题目」入口（30 秒超时后）
function showQuizFallbackLink() {
    if (currentArticle && currentArticle.questionsReady === true) return;
    const qBox = document.getElementById('quizLoadingBox');
    if (!qBox) return;
    qBox.innerHTML = '📝 题目生成中... <a href="javascript:void(0)" onclick="useFallbackNow()" style="margin-left:0.5rem;color:var(--primary);font-weight:600;">使用基础题目</a>';
}

// 用户点击「使用基础题目」按钮（等待页 30 秒后 / 阅读页 30 秒后显示）
async function useFallbackNow() {
    const articleId = window._timeoutArticleId || (currentArticle ? currentArticle.id : null);
    if (!articleId) {
        toast('无法获取文章信息，请稍后重试');
        return;
    }
    analyzePollToken++;  // 用户手动降级：终止后台轮询，避免完成后二次渲染

    const qBox = document.getElementById('quizLoadingBox');
    if (qBox) qBox.innerHTML = '📝 正在生成基础题目...';
    const waitingMsg = document.getElementById('loadingMessage');
    if (waitingMsg && awaitingQuestionReady) waitingMsg.textContent = '正在准备基础题目，马上进入阅读页...';

    try {
        const data = await apiPost('/api/article-fallback/' + articleId, {});
        if (currentArticle) {
            if (data.words) { currentArticle.words = data.words; }
            if (data.sentences) { currentArticle.sentences = data.sentences; }
            currentArticle.wordsReady = true;
            currentArticle.questions = data.questions || [];
            currentArticle.questionsReady = true;
            renderArticleWithTranslations();
            markCollectedSpans();
            showFallbackNotice();
            revealQuiz();
        }
        // 手动降级也要结束等待页（否则用户点了按钮却还停在等待页）
        enterReadingPage('手动使用基础题目');
        // ★ 2026-10-08：上面的 analyzePollToken++ 把「等待题目 → 进阅读页」的轮询掐掉了，
        //   但文章的句子翻译/释义可能还在后端跑。这里补挂一个**不切页**的后台守护，
        //   否则迟到的译文会像问题一那样静默丢失（用户看到的是「这篇还没有生成译文」）。
        if (currentArticle && currentArticle.analyzing) {
            backfillArticleUntilTerminal(currentArticle.id, '手动使用基础题目后接手补齐译文');
        }
    } catch (e) {
        toast('降级题目生成失败：' + e.message);
        if (qBox) {
            qBox.innerHTML = '📝 题目生成中... <a href="javascript:void(0)" onclick="useFallbackNow()" style="margin-left:0.5rem;color:var(--primary);font-weight:600;">使用基础题目</a>';
        }
    }
}

function cancelAnalysis() {
    analyzePollToken++;  // 取消进行中的轮询
    analysisAbortController = null;
    awaitingQuestionReady = false; // 取消后不再受「等待页 → 阅读页」守卫约束
    toast('已取消分析');
    showScreen('uploadPage');
}

function openAnalyzedArticle(articleData, opts) {
    const o = opts || {};
    const newArticle = {
        id: articleData.articleId || ('custom_' + Date.now()),
        title: articleData.title || '用户上传文章',
        description: articleData.description || '用户上传的自定义文章',
        level: articleData.level || 'middle',
        levelLabel: articleData.levelLabel || '自定义',
        article: articleData.article || '',
        words: articleData.words || articleData.wordList || {},
        sentences: articleData.sentences || articleData.sentenceList || [],
        questions: articleData.questions || [],
        // 释义 / 译文 / 题目是否已就绪（三者来自独立工作流，分开渲染）；历史/预置文章默认已就绪
        wordsReady: articleData.wordsReady === false ? false : true,
        sentencesReady: articleData.sentencesReady === false ? false : true,
        questionsReady: articleData.questionsReady === false ? false : true
    };
    
    // ★ 2026-10-08 修正（问题一/问题二的共同根因之一）：
    //   不能无条件写 detailLoaded=true。上传链路是 deferEnter（先停在等待页），
    //   此刻 words/sentences/questions 往往还是空壳，若草率地宣布「详情已加载」，会连环踩两个坑：
    //     ① articleTranslationState() 落到 'missing' → 浮层说「这篇还没有生成译文」（其实还在生成），
    //        而且它还会让 hint 「点正文上方的『重试』」指向一个**根本没显示的**按钮（问题二）；
    //     ② shouldFetchArticleDetail() 恒为 false → 「后端有译文就补拉详情」的自愈路径被永久挡住。
    const allReady = !!(newArticle.wordsReady && newArticle.sentencesReady && newArticle.questionsReady);
    newArticle.detailLoaded = allReady;   // 三件都齐了才算「详情已加载」
    newArticle.analyzing = !allReady;     // 仍在生成中 → 浮层说「译文还在加载中」
    newArticle.serverHasSentences = (newArticle.sentences || []).length > 0;   // 有译文 → 补详情时不要再动
    const existingIndex = ARTICLES.findIndex(a => a.id === newArticle.id || a.title === newArticle.title);
    if (existingIndex >= 0) {
        ARTICLES.splice(existingIndex, 1);
    }
    ARTICLES.unshift(newArticle);
    articleDetailAsked[newArticle.id] = true;
    console.log(`📚 [文章] 新分析完成 → 插入列表首位：${newArticle.id} | ${newArticle.title}`
        + ` | 内存共 ${ARTICLES.length} 篇 | 译文 ${(newArticle.sentences || []).length} 句`
        + ` | 三项就绪=${allReady}（释义=${newArticle.wordsReady} / 译文=${newArticle.sentencesReady} / 题目=${newArticle.questionsReady}）`
        + ` | detailLoaded=${newArticle.detailLoaded} | analyzing=${newArticle.analyzing}`
        + (allReady ? '' : ' ← 仍在生成：浮层将显示「译文还在加载中」，轮询会在后台把迟到的译文补上'));
    
    currentArticle = newArticle;
    collectedWords = [];
    isTranslationsVisible = false;
    sessionReadArticleIds.add(currentArticle.id);
    
    const articlesList = document.getElementById('articlesList');
    if (articlesList) {
        renderMain();
    }
    
    renderArticleSelector(currentArticle.id);
    
    document.getElementById('readTitle').textContent = currentArticle.title;
    document.getElementById('readDesc').textContent = currentArticle.description || '';
    document.getElementById('readDiff').textContent = currentArticle.level.toUpperCase();
    document.getElementById('readDiff').className = `diff-badge diff-${currentArticle.level}`;

    // AI 降级题目提示条（isFallback=true 时显示）
    const fallbackNotice = document.getElementById('fallbackNotice');
    if (fallbackNotice) {
        if (articleData.isFallback) {
            fallbackNotice.classList.remove('hidden');
        } else {
            fallbackNotice.classList.add('hidden');
        }
    }

    renderArticleWithTranslations();
    bindWordSpanEventsOnce();
    showDragGuideIfNeeded();
    updateProgress();
    
    const transBtn = document.getElementById('toggleTransBtn');
    if (transBtn) {
        transBtn.style.display = 'none';
    }
    
    // 题目区：直接渲染右侧题目（未就绪时显示「题目生成中」，轮询回填后自动刷新）
    fallbackQuizActive = false;
    updateCollectBadge();
    renderReadingFavs();
    initQuizArea();

    if (o.deferEnter) {
        // 停在等待页：题目就绪后由 pollArticleProgress → enterReadingPage() 切入阅读页
        console.log('⏳ [阅读页] 已准备就绪但暂不切入（题目未就绪，先停在等待页）');
        return;
    }
    showScreen('readingPage');
}

// ==================== 降级题目：通用阅读理解题（划选作答） ====================
let fallbackQuizActive = false;      // 降级划选答题模式（true 时禁用单词拖拽，让位原生文字选区）
let fallbackAnswers = [];            // [{ text, submitted }]
let activeFallbackQuestion = 0;      // 当前正在作答的题号
let quizRevealTimer = null;          // 题目区「后台生成」的展示计时器

function hideQuizExtras() {
    const qBox = document.getElementById('quizLoadingBox');
    if (qBox) qBox.style.display = 'none';
    const fArea = document.getElementById('fallbackQuizArea');
    if (fArea) { fArea.style.display = 'none'; fArea.innerHTML = ''; }
}

// 前端本地降级题目生成器（兜底：题目为空时也能出 3 道题）
function makeLocalFallbackQuestions(content) {
    const subject = (function() {
        if (!content) return '';
        const stop = ['the','and','that','with','this','from','they','have','there','their','which','about','would','should','could','because','through','between','during','before','after','above','below','again','further','those','other','people','world','important','different'];
        const words = content.match(/[A-Za-z]{5,}/g) || [];
        const freq = {};
        words.forEach(function(w) { const k = w.toLowerCase(); freq[k] = (freq[k] || 0) + 1; });
        return Object.keys(freq).filter(function(k) { return stop.indexOf(k) === -1; }).sort(function(a, b) { return freq[b] - freq[a]; })[0] || '';
    })();
    return [
        { type: 'main-idea', question: '请用文章中的一句话概括全文主旨', options: [], answer_index: -1, explanation: '', isFallback: true, answerMode: 'selection' },
        { type: 'detail', question: '请找出文章中描述' + (subject ? '「' + subject + '」' : '核心内容') + '的句子', options: [], answer_index: -1, explanation: '', isFallback: true, answerMode: 'selection' },
        { type: 'inference', question: '请划出最能体现作者观点或态度的句子', options: [], answer_index: -1, explanation: '', isFallback: true, answerMode: 'selection' }
    ];
}

// 题目区占位 → 模拟后台独立生成 → 展示
function prepareQuizArea() {
    const qBox = document.getElementById('quizLoadingBox');
    const fArea = document.getElementById('fallbackQuizArea');
    const quizBtn = document.getElementById('startQuizBtn');
    if (fArea) { fArea.style.display = 'none'; fArea.innerHTML = ''; }
    if (quizBtn) quizBtn.style.display = 'none';
    fallbackQuizActive = false;

    if (qBox) {
        qBox.style.display = 'block';
        // 题目尚未就绪：保持「生成中」占位，等 pollArticleProgress 回填后调用 revealQuiz
        if (currentArticle && currentArticle.questionsReady === false) {
            qBox.innerHTML = '📝 题目生成中...';
            if (quizRevealTimer) clearTimeout(quizRevealTimer);
            return;
        }
        qBox.innerHTML = '📝 正在生成阅读理解题，请稍候...';
    }

    if (quizRevealTimer) clearTimeout(quizRevealTimer);
    quizRevealTimer = setTimeout(revealQuiz, 1500);
}

function revealQuiz() {
    let questions = (currentArticle && currentArticle.questions) || [];
    if (!questions || questions.length === 0) {
        questions = makeLocalFallbackQuestions(currentArticle ? currentArticle.article : '');
        if (currentArticle) currentArticle.questions = questions;
    }
    // 题目已就绪：直接渲染右侧（不清空作答状态；renderQuizPanel 内部会按需同步作答数组）
    renderQuizPanel();
}

async function retryQuiz() {
    const qBox = document.getElementById('quizLoadingBox');
    if (qBox) { qBox.style.display = 'block'; qBox.innerHTML = '📝 正在重新生成题目，请稍候...'; }
    const id = (currentArticle && currentArticle.id) || window._timeoutArticleId;
    if (!id) {
        currentArticle.questions = makeLocalFallbackQuestions(currentArticle ? currentArticle.article : '');
        revealQuiz();
        return;
    }
    try {
        const data = await apiPost('/api/article-fallback/' + id, {});
        currentArticle.questions = (data && data.questions && data.questions.length)
            ? data.questions
            : makeLocalFallbackQuestions(currentArticle ? currentArticle.article : '');
        revealQuiz();
    } catch (e) {
        currentArticle.questions = makeLocalFallbackQuestions(currentArticle ? currentArticle.article : '');
        revealQuiz();
    }
}

function renderFallbackQuiz(questions) {
    const area = document.getElementById('fallbackQuizArea');
    if (!area) return;

    fallbackAnswers = (questions || []).map(function() { return { text: null, submitted: false }; });
    activeFallbackQuestion = 0;

    area.style.display = 'block';
    renderFallbackQuizCards();
}

function renderFallbackQuizCards() {
    const area = document.getElementById('fallbackQuizArea');
    if (!area || !currentArticle) return;
    const questions = currentArticle.questions || [];

    area.innerHTML = `
        <div style="margin-bottom:0.75rem;font-size:0.85rem;color:var(--gray);line-height:1.5;">
            💡 请在左侧文章中用鼠标<b>划选句子</b>作为答案，选中文字会高亮为黄色，再点击「提交答案」。
        </div>
        ${questions.map(function(q, i) {
            const f = fallbackAnswers[i] || {};
            const submitted = !!f.submitted;
            const hasText = !!f.text;
            const badge = q.type === 'main-idea' ? '主旨题' : (q.type === 'detail' ? '细节题' : '推理题');
            const isActive = (i === activeFallbackQuestion && !submitted);
            return `
                <div class="fallback-q-card" data-q="${i}" style="background:white;padding:1.1rem;border-radius:1rem;margin-bottom:0.9rem;border:2px solid ${isActive ? 'var(--primary)' : 'var(--border)'};transition:border-color 0.2s;">
                    <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;">
                        <span style="background:var(--primary);color:white;font-size:0.7rem;font-weight:600;padding:2px 8px;border-radius:999px;">${badge}</span>
                        <span style="font-size:0.7rem;color:var(--gray);">第 ${i+1} 题</span>
                        ${submitted ? '<span style="margin-left:auto;font-size:0.7rem;color:var(--correct);font-weight:600;">✓ 已提交</span>' : ''}
                    </div>
                    <p style="margin:0.4rem 0;font-size:0.95rem;line-height:1.5;">${q.question}</p>
                    <div style="font-size:0.8rem;color:var(--gray);margin:0.5rem 0;min-height:1.2rem;word-break:break-word;">
                        ${submitted && hasText
                            ? '<span style="background:#FDE68A;color:#78350F;padding:2px 6px;border-radius:4px;">' + escapeHtml(f.text) + '</span>'
                            : (hasText
                                ? '<span style="background:#FEF3C7;color:#B45309;padding:2px 6px;border-radius:4px;">' + escapeHtml(f.text) + '（待提交）</span>'
                                : (isActive ? '正在作答，请在左侧文章划选文字…' : '尚未划线作答') )}
                    </div>
                    ${!submitted ? '<button onclick="submitFallbackAnswer(' + i + ')" style="width:100%;padding:0.6rem;border-radius:0.6rem;border:1px solid var(--primary);background:var(--primary-light,#FEF3C7);color:var(--primary-dark,#B45309);font-weight:600;cursor:pointer;">提交答案</button>' : ''}
                </div>
            `;
        }).join('')}
    `;

    // 点击卡片切换当前作答题（跳过按钮点击）
    area.querySelectorAll('.fallback-q-card').forEach(function(card) {
        card.addEventListener('click', function(e) {
            if (e.target.closest('button')) return;
            const idx = parseInt(card.getAttribute('data-q'), 10);
            if (fallbackAnswers[idx] && !fallbackAnswers[idx].submitted) {
                activeFallbackQuestion = idx;
                renderFallbackQuizCards();
            }
        });
    });
}

function submitFallbackAnswer(i) {
    const f = fallbackAnswers[i];
    if (!f || !f.text) {
        toast('请先在文章中划选一段文字作为答案');
        return;
    }
    f.submitted = true;
    const next = fallbackAnswers.findIndex(function(x, idx) { return !x.submitted; });
    activeFallbackQuestion = next >= 0 ? next : i;
    renderFallbackQuizCards();
    toast('已保存第 ' + (i + 1) + ' 题答案');
}

// 松手后捕获文章文字选区并高亮
function onFallbackSelection() {
    if (!fallbackQuizActive) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const text = sel.toString().replace(/\s+/g, ' ').trim();
    if (!text) return;
    const readContent = document.getElementById('readContent');
    if (!readContent || !sel.anchorNode || !readContent.contains(sel.anchorNode)) return;

    // 高亮选中文字（黄色背景）
    try {
        document.execCommand('hiliteColor', false, '#FDE68A');
    } catch (e) { /* 某些环境下 execCommand 不可用，忽略，仅记录答案文本 */ }

    if (fallbackAnswers[activeFallbackQuestion]) {
        fallbackAnswers[activeFallbackQuestion].text = text;
        renderFallbackQuizCards();
    }
    sel.removeAllRanges();
}

// ==================== 单词 span 渲染 & 拖拽（方案 A） ====================

// HTML 转义，避免文章内容中的 < > & 破坏 DOM（全文件唯一定义，勿再重复声明）
function escapeHtml(str) {
    if (!str) return '';                 // null / undefined / '' / 0 / NaN 一律给空串
    const div = document.createElement('div');
    div.textContent = String(str);       // 数字等非字符串也能安全转义
    return div.innerHTML;
}

// 转义「要塞进 HTML 属性值」的文本（如猜测输入框的 value="…"）。
// 不能复用 escapeHtml：innerHTML 只转义 & < >，**不转义引号** ——
// 用户只要在猜测里打一个 `"` 就能提前闭合属性，把卡片结构搅乱。
function escapeAttr(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, function (c) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
}

/**
 * 把纯文本文章拆成一个个 <span class="word-span">，标点空格保留为文本节点
 * 每个 span 带 data-word（小写），用于查词和收藏判断
 * 不在这里设 data-sentence，渲染后由 getSentenceOfSpan 从 DOM 计算，避免正则脆弱
 */
function splitWordsToSpans(text) {
    if (!text) return '';
    const escaped = escapeHtml(text);
    // 匹配英文单词（含连字符 - 和撇号 '，如 don't, well-known）
    return escaped.replace(/([A-Za-z]+(?:['-][A-Za-z]+)*)/g, function (match) {
        const lower = match.toLowerCase();
        return '<span class="word-span" data-word="' + lower + '">' + match + '</span>';
    });
}

/**
 * 从 DOM 计算某个 word-span 所在的原文句子
 * 向上找到 <p>，按 . ! ? 分割，找到包含该 span 文本的句子
 */
function getSentenceOfSpan(spanEl) {
    const p = spanEl.closest('p');
    if (!p) return '';
    const fullText = p.textContent || '';
    const wordText = spanEl.textContent || '';
    // 按句子分割（保留标点）
    const sentences = fullText.match(/[^.!?]+[.!?]+/g) || [fullText];
    for (const s of sentences) {
        if (s.indexOf(wordText) !== -1) {
            return s.trim();
        }
    }
    return fullText.trim();
}

/**
 * 遍历所有 word-span，标记已收藏的（加 collected 类，禁用拖拽）
 * 在渲染文章后调用
 */
function markCollectedSpans() {
    const readContent = document.getElementById('readContent');
    if (!readContent || !currentArticle) return;

    const articleId = currentArticle.id;
    const spans = readContent.querySelectorAll('.word-span');
    spans.forEach(function (span) {
        const word = span.getAttribute('data-word') || '';
        const rawSentence = getSentenceOfSpan(span);
        // 统一用 getWordPositionIndices 的 cleanSentence 判断（和 doCollectWord 存储时一致）
        const { cleanSentence } = getWordPositionIndices(rawSentence);
        const sentence = cleanSentence || rawSentence;
        if (isWordCollectedInThisSentence(word, articleId, sentence)) {
            span.classList.add('collected');
            span.setAttribute('title', '✅ 本句中已收藏');
        } else {
            span.classList.remove('collected');
            span.removeAttribute('title');
        }
    });
}

/**
 * 点击 word-span → 弹释义卡片
 * 从 currentArticle.words 取释义，复用 showWordCard
 */
function handleWordSpanClick(spanEl) {
    const word = spanEl.getAttribute('data-word') || spanEl.textContent || '';
    if (!word) return;

    const sentence = getSentenceOfSpan(spanEl);
    const localMeaning = localMeaningOf(word);

    // 2026-09-30 修复（问题2「单词翻译出不来」的直接原因）：
    // 旧实现在这里写死 `if (currentArticle.wordsReady === false) { toast('释义生成中，请稍候...'); return; }`。
    // 而单词释义工作流一旦失败/超时，后端不会再返回 wordsReady=true（queue.js 的 catch 分支只记录不置位），
    // 于是点词被永久拦掉 —— 用户看到的就是「点词只闪一个提示，卡片永远不出来」。
    // 现在统一走 openWordCard 的「即时出卡 + 后台精修」契约：
    //   本地有释义 → 立刻显示；本地没有 → 先显示「⏳ 正在查询语境释义…」；
    //   核对完仍没有 → 卡片里留「🤖 AI 翻译」入口（用户主动点才联网）。
    console.log(`🔍 [点词] word="${word}" | wordsReady=${currentArticle ? currentArticle.wordsReady : '无文章'} | 本地释义=${localMeaning ? '有' : '无'} | 释义库=${currentArticle && currentArticle.words ? Object.keys(currentArticle.words).length : 0} 词 | 句子="${String(sentence || '').slice(0, 60)}"`);

    // 定位到 span 上方居中
    const rect = spanEl.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top;

    // 从数据库读该词的所有释义；无释义则展示输入框
    openWordCard(word, sentence, word, x, y);
}

// ==================== span 拖拽（pointer events，桌面+移动端通用） ====================

let spanDragState = null; // { span, ghost, startX, startY, moved, word, meaning, sentence }

function onSpanPointerDown(e) {
    // 用 this 获取 span（事件委托下 e.currentTarget 是 readContent 而非 span）
    const span = this;
    // 新的一次按下 = 新的一次手势，先把「刚拖拽过」的标记复位。
    // 为什么需要（2026-10-08）：拖到收集区松手时，pointerdown/up 的 target 不同，
    // 浏览器把 click 派发到了 readContent **之外**，于是读 readContent click 的那个
    // `spanJustDragged` 永远没机会被消费 → 下一次正常点词会被误判成「刚拖拽过」而吞掉
    //（表现：拖拽收藏一次之后，点词不再弹卡）。在这里复位即可根治。
    spanJustDragged = false;
    // 已收藏的不可拖拽
    if (span.classList.contains('collected')) {
        console.log(`🖱️ [拖拽] 忽略：该词在本句已收藏（span 带 .collected）| word="${span.getAttribute('data-word')}"`);
        return;
    }

    const word = span.getAttribute('data-word') || span.textContent || '';
    const sentence = getSentenceOfSpan(span);
    // 起手只算「本地三层预估值」——用于日志与极端兜底。真正的收藏释义在**落点那一刻**
    // 由 resolveCollectMeaning 解析（会带上本句去查语境库），优先级：
    //   ① 本句语境释义（含「联网深查」写回 word_context 的那条）→ ② 文章词表 → ③ 词典层首义。
    // 2026-10-08 用户报的正是这里：拖拽时没有词卡，旧代码 `bestMeaningForCollect(word)` 不带语境，
    // 于是 part-time 永远只能取到词典层兜底出来的 part（「n. 部分, 局部…」），把「兼职的」丢了。
    // ⚠️ 历史坑：这里曾写死 `|| '暂无释义'`，存进库的就是字面量「暂无释义」（单词本 35 条有 25 条），
    //    绝不能再把占位文案当释义存。
    const pre = bestMeaningSourceForCollect(word);
    const meaning = pre.meaning;
    console.log(`🖱️ [拖拽] 起手 word="${word}" | 本地预估释义=【${COLLECT_MEANING_SOURCES[pre.source]}】`
        + `${meaning ? `"${meaning.slice(0, 30)}"` : '（无）'} | ${pre.detail}`
        + ` | 文章词表=${Object.keys((currentArticle && currentArticle.words) || {}).length} 词`
        + ` | pointerType=${e.pointerType || 'mouse'} | 降级划选模式=${fallbackQuizActive}`
        + ` | 落点时会再查一次语境库（不带 ai，不联网）`);

    // 2026-10-08 修复（用户报「这次改完拖拽收藏失效」）：
    //   旧实现在这里写死 `if (fallbackQuizActive) return;` —— 只要文章进了「降级划选答题模式」
    //   （题目是降级题，见 fallback.js 的 isFallback/answerMode='selection'），
    //   正文单词就**一按就返回**，用户感知就是「拖拽突然坏了」。而进这个模式的唯一原因，
    //   恰恰是 quiz_generator 返回 0 题被静默降级（见 coze.js runQuizOnce / queue.js）。
    //   现在不再直接禁掉，而是改成「延迟创建幽灵」：只有真的拖进收集区才显示拖拽效果，
    //   于是「正文划选作答」和「拖拽收藏」可以共存（见 onSpanPointerMove）。
    spanDragState = {
        span: span,
        ghost: null,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        word: word,
        meaning: meaning,
        sentence: sentence
    };

    // 在 document 上监听 move/up（不依赖 setPointerCapture，兼容合成事件）
    document.addEventListener('pointermove', onSpanPointerMove);
    document.addEventListener('pointerup', onSpanPointerUp);
    document.addEventListener('pointercancel', onSpanPointerUp);
}

/** 创建拖拽幽灵（浮动副本）：移动超过阈值、或降级模式下指针进入收集区时才调用 */
function createSpanDragGhost() {
    if (!spanDragState || spanDragState.ghost) return;
    const ghost = spanDragState.span.cloneNode(true);
    ghost.classList.add('dragging-ghost');
    ghost.style.position = 'fixed';
    ghost.style.pointerEvents = 'none';
    ghost.style.zIndex = '9999';
    ghost.style.left = (spanDragState.startX - 20) + 'px';
    ghost.style.top = (spanDragState.startY - 10) + 'px';
    ghost.style.transform = 'scale(1.3)';
    ghost.style.background = 'var(--primary-light, #FEF3C7)';
    ghost.style.padding = '2px 6px';
    ghost.style.borderRadius = '4px';
    ghost.style.boxShadow = '0 8px 24px rgba(0,0,0,0.2)';
    ghost.style.color = 'var(--primary-dark, #D97706)';
    ghost.style.fontWeight = '600';
    document.body.appendChild(ghost);
    spanDragState.ghost = ghost;
    // 隐藏原 span 的文字（保持占位）
    spanDragState.span.style.opacity = '0.3';
    console.log(`🖱️ [拖拽] 幽灵已创建 | word="${spanDragState.word}" | 起点(${Math.round(spanDragState.startX)},${Math.round(spanDragState.startY)})`);
}

function onSpanPointerMove(e) {
    if (!spanDragState) return;
    const dx = e.clientX - spanDragState.startX;
    const dy = e.clientY - spanDragState.startY;

    // 移动超过 5px 才判定为拖拽（否则当作点击）
    if (!spanDragState.moved && Math.hypot(dx, dy) < 5) return;

    if (!spanDragState.moved) {
        spanDragState.moved = true;
        console.log(`🖱️ [拖拽] 越过 5px 阈值 → 判定为拖拽 | word="${spanDragState.word}" | 位移=${Math.round(Math.hypot(dx, dy))}px`
            + ` | 幽灵=${fallbackQuizActive ? '延迟创建（降级划选模式下：进入收集区才显示，避免打断正文划选）' : '立即创建'}`);
        // 普通模式：越过阈值就立刻给拖拽反馈（跟手）
        if (!fallbackQuizActive) createSpanDragGhost();
    }

    // 降级划选答题模式：只有指针真的拖到收集区附近才补建幽灵。
    // 这样普通阅读时拖拽收藏照常可用，而去作答降级题划选正文时又不会被幽灵打断。
    if (fallbackQuizActive && !spanDragState.ghost && checkCollectZoneHover(e.clientX, e.clientY)) {
        console.log('🖱️ [拖拽] 降级划选模式下指针已进入收集区 → 补建幽灵（判定为拖拽收藏，不当作划选）');
        createSpanDragGhost();
    }

    if (spanDragState.ghost) {
        spanDragState.ghost.style.left = (e.clientX - 20) + 'px';
        spanDragState.ghost.style.top = (e.clientY - 10) + 'px';
    }

    checkCollectZoneHover(e.clientX, e.clientY);
}

function onSpanPointerUp(e) {
    if (!spanDragState) return;
    const span = spanDragState.span;

    document.removeEventListener('pointermove', onSpanPointerMove);
    document.removeEventListener('pointerup', onSpanPointerUp);
    document.removeEventListener('pointercancel', onSpanPointerUp);

    // 「算不算拖拽」以**幽灵是否创建**为准：
    //   · 普通模式 = 越过 5px 就创建 → 等价于旧行为；
    //   · 降级划选模式 = 只有到了收集区才创建 → 单纯按下再划选/松手不会被误判成拖拽
    //     （否则会吃掉随后的 click 弹词卡，或把划选答案的动作顶掉）。
    const wasDragging = !!spanDragState.ghost;
    const ghost = spanDragState.ghost;
    const dragData = {
        word: spanDragState.word,
        meaning: spanDragState.meaning,
        sentence: spanDragState.sentence
    };

    // 清理状态
    spanDragState = null;

    if (!wasDragging) {
        console.log(`🖱️ [拖拽] 结束：未构成拖拽（未创建幽灵，位移不足或没进收集区）→ 交给 click 弹词卡`
            + ` | word="${dragData.word}" | 降级划选模式=${fallbackQuizActive}`);
        // 没拖拽 → 当作点击，弹释义卡片（由 click 事件兜底处理，这里不重复弹）
        return;
    }

    // 拖拽过：标记 spanJustDragged，阻止随后的 click 事件弹卡片
    spanJustDragged = true;

    // 拖拽结束：判断是否在收集区上
    const isOver = checkCollectZoneHover(e.clientX, e.clientY);
    const zone = document.getElementById('collectZone');
    if (zone) zone.classList.remove('active');

    if (!zone) {
        console.warn('🖱️ [拖拽] ⚠️ 未找到 #collectZone 收集区节点 —— 落点永远判不中，这就是「拖了不收藏」的直接原因');
    }
    console.log(`🖱️ [拖拽] 结束 word="${dragData.word}" | 落点(${Math.round(e.clientX)},${Math.round(e.clientY)}) | 是否在收集区=${isOver}`
        + (zone ? ` | 收集区 rect=${Math.round(zone.getBoundingClientRect().left)},${Math.round(zone.getBoundingClientRect().top)} ${Math.round(zone.getBoundingClientRect().width)}×${Math.round(zone.getBoundingClientRect().height)}` : ''));

    if (ghost) {
        if (isOver) {
            // 飞入收集区动画，结束后收藏
            animateGhostToZone(ghost, zone, function () {
                if (ghost.parentNode) ghost.parentNode.removeChild(ghost);
                console.log(`🖱️ [拖拽] 飞入动画结束 → 解析释义并写入收藏 word="${dragData.word}"`);
                // 落点这一刻才解析释义：会带上本句去查语境库（不带 ai、不联网、~1ms），
                // 这样「联网深查」已经写回 word_context 的释义才拿得到（旧代码在这里只用了本地预估值）。
                resolveCollectMeaning(dragData.word, dragData.sentence)
                    .then(function(picked) {
                        const meaning = picked.meaning || dragData.meaning || '';
                        if (picked.meaning && dragData.meaning && picked.meaning !== dragData.meaning) {
                            console.log(`🖱️ [拖拽] 释义按优先级升级 | 起手预估="${String(dragData.meaning).slice(0, 30)}"`
                                + ` → 实际存入="${String(picked.meaning).slice(0, 30)}"（${COLLECT_MEANING_SOURCES[picked.source]}）`);
                        }
                        return doCollectWord({ word: dragData.word, meaning: meaning, sentence: dragData.sentence });
                    })
                    .then(function() {
                        markCollectedSpans(); // 更新已收藏标记（等 doCollectWord 完成后）
                        console.log(`🖱️ [拖拽] 收藏流程结束 word="${dragData.word}"`);
                    })
                    .catch(function(err) {
                        console.error(`🖱️ [拖拽] 收藏失败 word="${dragData.word}": ${(err && err.message) || err}`);
                    });
            });
        } else {
            // 拖出半路松手 → 淡出消失，不收藏
            console.log(`🖱️ [拖拽] 松手时不在收集区 → 取消收藏（不写入）| word="${dragData.word}"`);
            ghost.style.transition = 'opacity 0.2s';
            ghost.style.opacity = '0';
            setTimeout(function () {
                if (ghost.parentNode) ghost.parentNode.removeChild(ghost);
            }, 200);
        }
    }

    // 恢复原 span 透明度
    span.style.opacity = '';
}

function animateGhostToZone(ghost, zone, done) {
    if (!zone) { done && done(); return; }
    const zoneRect = zone.getBoundingClientRect();
    const ghostRect = ghost.getBoundingClientRect();
    const targetX = zoneRect.left + zoneRect.width / 2 - ghostRect.width / 2;
    const targetY = zoneRect.top + zoneRect.height / 2 - ghostRect.height / 2;

    ghost.style.transition = 'left 0.3s cubic-bezier(0.4,0,0.2,1), top 0.3s cubic-bezier(0.4,0,0.2,1), transform 0.3s, opacity 0.3s';
    ghost.style.left = targetX + 'px';
    ghost.style.top = targetY + 'px';
    ghost.style.transform = 'scale(0.5)';
    ghost.style.opacity = '0';
    setTimeout(done, 320);
}

/**
 * 给 readContent 绑定 word-span 的 pointerdown + click 事件委托（只绑一次）
 * - pointer 事件负责拖拽
 * - click 事件负责弹释义卡片（兜底，保证 .click() 和真实点击都能触发）
 */
let wordSpanEventsBound = false;
let spanJustDragged = false; // 拖拽结束时置 true，click 事件据此跳过，避免拖拽后误弹卡片
function bindWordSpanEventsOnce() {
    if (wordSpanEventsBound) return;
    const readContent = document.getElementById('readContent');
    if (!readContent) return;
    wordSpanEventsBound = true;

    // pointerdown：启动拖拽判定
    readContent.addEventListener('pointerdown', function (e) {
        const span = e.target.closest('.word-span');
        if (span) {
            onSpanPointerDown.call(span, e);
        }
    });

    // click：弹释义卡片（拖拽刚结束时跳过）
    readContent.addEventListener('click', function (e) {
        if (spanJustDragged) {
            spanJustDragged = false;
            return;
        }
        const span = e.target.closest('.word-span');
        if (span) {
            e.stopPropagation();
            handleWordSpanClick(span);
        }
    });

    // mouseup：降级划选答题模式下，捕获文章文字选区并高亮
    readContent.addEventListener('mouseup', function (e) {
        if (!fallbackQuizActive) return;
        if (e.target.closest('.fallback-q-card') || e.target.closest('button')) return;
        setTimeout(onFallbackSelection, 10);
    });

    // 句子翻译悬停：mouseover/mousemove/mouseout —— **绑在 document 上**，不是 #readContent。
    // 为什么（2026-10-06）：绑在 #readContent 时必须「鼠标物理落在正文里」才会收到事件；
    // 一旦有东西压在上面（点词后的词卡就是典型：340×470px 正压在正文上），
    // 事件全被词卡吃掉，悬停永远不排期 → 用户看到的就是「停顿 3 秒没反应」。
    // 绑 document 之后，任何位置都能收到事件，并且能在日志里说清「是谁挡住了」。
    document.addEventListener('mouseover', onSentenceMouseOver);
    document.addEventListener('mouseout', onSentenceMouseOut);
    document.addEventListener('mousemove', onSentenceMouseMove);
    console.log('🖱️ [句子翻译] 悬停监听已绑定（document 级 + 穿透检测）| 延迟=' + SENTENCE_HOVER_DELAY_MS + 'ms');

    // 浮层自身交互：鼠标进入保持显示，离开后延迟关闭
    const hoverPanel = getSentenceHoverPanel();
    if (hoverPanel) {
        hoverPanel.addEventListener('mouseenter', onSentenceHoverPanelEnter);
        hoverPanel.addEventListener('mouseleave', onSentenceHoverPanelLeave);
        // 释义锁：浮层里的「🔓 看翻译」按钮（只绑一次，节点常驻）
        const shpReveal = hoverPanel.querySelector('.shp-reveal');
        if (shpReveal) {
            shpReveal.addEventListener('click', onSentenceRevealClick);
            console.log('🔒 [释义锁] 句子浮层的「看翻译」按钮已绑定');
        } else {
            console.warn('🔒 [释义锁] 未找到 .shp-reveal 节点 → 猜词模式下句子将无法手动解锁');
        }
    }
}

// ==================== 句子翻译悬停浮层（3 秒滑出） ====================

// 悬停多久弹出译文。想更灵敏就把这个值调小（原来是写死在 setTimeout 里的 3000）
const SENTENCE_HOVER_DELAY_MS = 3000;

let sentenceHoverTimer = null;
let sentenceHoverPanel = null;
let sentenceHoverEl = null;         // 当前鼠标所在的句子元素
let sentenceHoverArmedIdx = null;   // 正在计时的句子索引（null = 没有在计时）
let sentenceHoverVisibleIdx = null; // 浮层当前展示的句子索引（null = 浮层未展示）
let sentenceHideTimer = null;       // 延迟关闭浮层的计时器
let hoverPanelHovering = false;     // 鼠标是否在浮层上

// 把 currentArticle.sentences 规范化为 [{ sentence, translation }]
function buildSentenceList() {
    const list = ((currentArticle && currentArticle.sentences) || []).map(function(s) {
        // 兼容多种字段命名（字符串 / original·en·sentence·text·english·content / translation·zh·chinese·cn）
        if (typeof s === 'string') {
            return { sentence: '', translation: s };
        }
        return {
            sentence: (s.original || s.en || s.sentence || s.text || s.english || s.content || '').toString().trim(),
            translation: (s.translation || s.zh || s.chinese || s.cn || '').toString().trim()
        };
    });
    if (list.length > 0) return list;

    // ---------- 兜底：没有译文数据时，本地按标点切句（2026-10-06）----------
    // 为什么需要：app.js 顶部的预置文章（article_001…）只带 `article` 正文，**没有 sentences 数组**
    // （译文要靠 article 分析工作流产出，只有用户上传的文章才有）。
    // 旧实现下 renderArticleWithTranslations 走到 `sentences.length === 0` 分支，
    // 一个 `.article-sentence` 节点都不生成 → 「悬停 3 秒看译文」在这些文章上**永远不可能触发**，
    // 而且完全静默（没有日志、没有报错），这正是「悬停没反应」最底层的原因。
    // 这里用与正文渲染**完全相同**的切句规则本地切一遍，保证悬停始终有落点；
    // translation 留空 → 浮层显示英文原文 +「（暂无翻译）」，至少是「有反馈」而不是「死寂」。
    const text = (currentArticle && currentArticle.article) || '';
    if (!text.trim()) return [];
    const parts = [];
    text.split(/\n\n+/).forEach(function (p) {
        const seg = p.match(/[^.!?]+[.!?]+/g) || [p];
        seg.forEach(function (t) {
            const s = t.trim();
            if (s) parts.push({ sentence: s, translation: '' });
        });
    });
    if (parts.length > 0) {
        // 节流：buildSentenceList 会被悬停/重绘高频调用，这个警告每帧打一次会把控制台刷爆
        const warnKey = (currentArticle ? currentArticle.id : '-') + '|' + parts.length;
        if (buildSentenceList._warnKey !== warnKey) {
            buildSentenceList._warnKey = warnKey;
            console.log(`⚠️ [句子渲染] 本文没有译文数据（currentArticle.sentences 为空）→ 已按标点本地切出 ${parts.length} 句兜底：`
                + `悬停可以正常触发，但浮层只显示英文原文 +「（暂无翻译）」。`
                + ` | detailLoaded=${!!currentArticle.detailLoaded} | 服务端标记有译文=${!!currentArticle.serverHasSentences}`
                + (currentArticle.serverHasSentences ? ' ← ⚠️ 服务端说有译文，属「详情没加载到」，将自动补拉' : ''));
        }
    }
    return parts;
}

function getSentenceHoverPanel() {
    if (!sentenceHoverPanel) {
        sentenceHoverPanel = document.getElementById('sentenceHoverPanel');
    }
    return sentenceHoverPanel;
}

function showSentenceHoverPanel(sentence, translation, anchorEl, idx) {
    const panel = getSentenceHoverPanel();
    if (!panel) {
        console.warn('🖱️ [句子翻译] 未找到 #sentenceHoverPanel DOM 元素');
        return;
    }
    if (sentenceHideTimer) {
        clearTimeout(sentenceHideTimer);
        sentenceHideTimer = null;
    }
    hoverPanelHovering = false;
    // 互斥：显示句子翻译浮层时，隐藏单词释义卡片
    hideWordCard();
    panel.querySelector('.shp-origin').textContent = sentence || '';
    // 译文为空时的兜底文案要分情况（2026-10-08 收敛到 articleTranslationState()，全前端唯一判定）：
    //   failed  句子翻译失败（partial / 有原因）→ 「不可用」
    //   missing completed 却一句译文都没有（存量静默降级）→ 「还没生成」
    //   loading 详情没加载到 / 文章**还在生成中** → 「译文加载中」，并顺手补拉
    //   preset  预置文章本来就不做句子翻译 → 保持「（暂无翻译）」
    // ⚠️ 2026-10-08（用户明确要求）：**不再**在浮层里写「点正文上方的『重试』可生成」——
    //    提示条在正文上方、但不保证每一篇都为用户展开，写成文字指路会指向一个看不见的按钮。
    //    重试入口就交给正文上方的提示条本身（它是真实的按钮），浮层只如实说状态。
    const trState = articleTranslationState();
    const hasNoSentences = !currentArticle || (currentArticle.sentences || []).length === 0;
    const detailMissing = hasNoSentences && !!currentArticle && !currentArticle.detailLoaded;
    let placeholder;
    if (trState === 'failed') placeholder = '⚠️ 句子翻译暂时不可用';
    else if (trState === 'missing') placeholder = '⚠️ 这篇还没有生成译文';
    else if (detailMissing || trState === 'loading') placeholder = '⏳ 译文还在加载中，稍等几秒再悬停一次';
    else placeholder = '（暂无翻译）';

    if (!translation) {
        const why = describeEmptyTranslation(idx);
        console.warn(`🖱️ [句子翻译] 浮层译文为空 | idx=${idx} | 译文状态=${trState} | ${why}`);
        // 详情没加载到 → 当场补拉一次（自愈），成功后重绘正文
        // ⚠️ 2026-10-08：文章还在生成中（analyzing）时**不要**补拉 —— 此刻后端还没写译文，
        //    拉回来的只是一具空壳，还会顺手把 ARTICLES 里的条目整个换掉（引用分叉）。
        //    这种情况交给轮询的后台补拉 / backfillArticleUntilTerminal 守护去收尾。
        if (detailMissing && !currentArticle.analyzing && shouldFetchArticleDetail(currentArticle)) {
            const healId = currentArticle.id;
            articleDetailAsked[healId] = true;
            console.log(`🖱️ [句子翻译] 检测到译文缺失是「详情未加载」导致 → 补拉详情 ${healId}`);
            loadArticleDetail(healId).then(function (full) {
                if (full && currentArticle && currentArticle.id === healId) {
                    console.log(`🖱️ [句子翻译] 详情补拉完成（译文 ${full.sentences.length} 句）→ 重绘正文`);
                    renderArticleWithTranslations();
                }
            });
        }
        // ★ 用户明确要求：译文取不到时，把「前端 sentenceList」与「后端 sentenceList」并排打出来做对比。
        //   加节流：同一篇文章 8 秒内只对比一次，避免鼠标划过一串空译文的句子把控制台刷爆。
        const cmpH = '_lastCmpAt';
        if (currentArticle && (!currentArticle[cmpH] || Date.now() - currentArticle[cmpH] > 8000)) {
            if (currentArticle) currentArticle[cmpH] = Date.now();
            logSentenceListComparison(`悬停 idx=${idx} 时译文为空`);
        }
    }
    // ===== 释义锁（2026-10-07）：猜词模式下，没解锁过的句子先不让看译文 =====
    // 关键：译文**不是**没拿到，是拿到了但先不显示（就在 translation 参数里）——
    // 点「🔓 看翻译」时是纯本地重绘，零网络、零等待。锁只挡显示，不挡加载。
    const sentenceLocked = !isSentenceRevealed(sentence);
    const translationEl = panel.querySelector('.shp-translation');
    if (sentenceLocked) {
        console.log(`🔒 [释义锁] 句子未解锁（idx=${idx}）→ 浮层只给「先猜一猜」，译文先不显示`
            + `（译文其实已在内存：${translation ? translation.slice(0, 24) : '(空)'}）`);
        if (translationEl) translationEl.textContent = '🤔 先猜一猜这句话的意思';
    } else {
        if (translationEl) translationEl.textContent = translation || placeholder;
    }
    // 「🔓 看翻译」按钮只有锁着时才出现（点击处理见 onSentenceRevealClick，初始化时绑一次）
    const revealBox = panel.querySelector('.shp-reveal');
    if (revealBox) revealBox.classList.toggle('hidden', !sentenceLocked);
    // 把待解锁的原句记在浮层上：点击时若 idx 取不到句子，还能靠它兜住
    panel.setAttribute('data-lock-sentence', sentenceLocked ? String(sentence || '') : '');

    // 先定位再显示，避免浮层在 (0,0) 闪一下再跳位。
    // 锚点要有「记忆」：用户点浮层里的「看翻译」时鼠标在浮层上，sentenceHoverEl 已被清空，
    // 没有记忆就会回落到「视口顶部居中」——浮层会当着用户的面跳走。
    const anchorEl2 = anchorEl || sentenceHoverEl || panel._anchorEl || null;
    if (anchorEl2) panel._anchorEl = anchorEl2;
    positionSentenceHoverPanel(anchorEl2);
    panel.classList.add('visible');
    sentenceHoverVisibleIdx = (idx === undefined || idx === null || Number.isNaN(idx)) ? null : idx;
    console.log(`✅ [句子翻译] 浮层已显示 | idx=${sentenceHoverVisibleIdx}`
        + ` | ${sentenceLocked ? '🔒 锁定（未显示译文）' : '译文=' + (translation ? translation.substring(0, 20) : '(空)')}`);
}

/**
 * 点浮层里的「🔓 看翻译」：解锁这句话 + 原地显示译文。
 * 译文按 idx **现取**（不是闭包里的旧值），保证显示的是这一刻最新的那一句。
 */
function onSentenceRevealClick(e) {
    e.stopPropagation();
    const idx = sentenceHoverVisibleIdx;
    const fresh = resolveSentenceAt(idx);
    const panel = getSentenceHoverPanel();
    const sentence = (fresh && fresh.sentence) || (panel && panel.getAttribute('data-lock-sentence')) || '';
    const translation = (fresh && fresh.translation) || '';
    console.log(`🔒 [释义锁] 用户点「看翻译」| idx=${idx} | 句子="${String(sentence).slice(0, 40)}…"`
        + ` | 译文=${translation ? '有 → 本地重绘立即显示（零网络）' : '空 → 该句本来就没译文，会退回原兜底文案'}`);
    unlockSentence(sentence);
    showSentenceHoverPanel(sentence, translation,
        (panel && panel._anchorEl) || sentenceHoverEl, idx);
}

// 将浮层定位到锚点句子的正上方；上方空间不足时回落到句子下方
function positionSentenceHoverPanel(anchorEl) {
    const panel = getSentenceHoverPanel();
    if (!panel) return;
    // 无锚点：回退到视口上方居中
    if (!anchorEl || !anchorEl.getBoundingClientRect) {
        panel.style.left = '50%';
        panel.style.top = '10%';
        console.log('📍 [句子翻译] 无锚点，回退定位到视口顶部居中');
        return;
    }
    const rect = anchorEl.getBoundingClientRect();
    const gap = 8;   // 浮层与句子的间距
    const edge = 8;  // 距视口边缘的最小间距
    let left = rect.left;
    let top = rect.top - panel.offsetHeight - gap;

    // 横向夹在视口内
    if (left + panel.offsetWidth > window.innerWidth - edge) {
        left = window.innerWidth - panel.offsetWidth - edge;
    }
    if (left < edge) left = edge;

    // 上方空间不足时，改显示到句子下方
    if (top < edge) {
        top = rect.bottom + gap;
    }

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    console.log(`📍 [句子翻译] 定位浮层 | left=${Math.round(left)} top=${Math.round(top)} | 句子顶部=${Math.round(rect.top)} 底部=${Math.round(rect.bottom)}`);
}

function hideSentenceHoverPanel() {
    const panel = getSentenceHoverPanel();
    if (panel) panel.classList.remove('visible');
    hoverPanelHovering = false;
    sentenceHoverVisibleIdx = null;
}

// 离开句子/浮层后延迟 1 秒关闭，给用户时间把鼠标移向浮层
function scheduleHideSentenceHoverPanel() {
    if (sentenceHideTimer) clearTimeout(sentenceHideTimer);
    sentenceHideTimer = setTimeout(function() {
        sentenceHideTimer = null;
        if (hoverPanelHovering) return; // 鼠标在浮层上，不关闭
        hideSentenceHoverPanel();
        console.log('🖱️ [句子翻译] 延迟 1 秒后关闭浮层');
    }, 1000);
}

function onSentenceHoverPanelEnter() {
    hoverPanelHovering = true;
    if (sentenceHideTimer) {
        clearTimeout(sentenceHideTimer);
        sentenceHideTimer = null;
    }
    console.log('🖱️ [句子翻译] 鼠标进入浮层，保持显示');
}

function onSentenceHoverPanelLeave() {
    hoverPanelHovering = false;
    console.log('🖱️ [句子翻译] 鼠标离开浮层，1 秒后关闭');
    scheduleHideSentenceHoverPanel();
}

/**
 * 清掉悬停计时器。
 * @param {string} [reason] 是谁清的 —— 悬停不触发这类问题里，「3 秒计时到底被谁打断」是关键线索，
 *                          以前这里只打印「已清除悬停计时器」，根本看不出调用方，排障时只能靠猜。
 */
function clearSentenceHoverTimer(reason) {
    if (sentenceHoverTimer) {
        clearTimeout(sentenceHoverTimer);
        sentenceHoverTimer = null;
        console.log(`🖱️ [句子翻译] 清除悬停计时器 | 原因=${reason || '(未标注)'} | 原本计时的句=${sentenceHoverArmedIdx}`);
    }
    sentenceHoverArmedIdx = null;
}

/**
 * 为某个句子「排期」：SENTENCE_HOVER_DELAY_MS 毫秒后弹出它的译文浮层。
 *
 * 修复（2026-09-30）—— 线上表现为「从上一句移到下一句，触发不了；必须在句子上移动两下再停下才触发」。
 * 两个根因：
 *   ① 旧实现里只要浮层还是 visible 就直接 return，导致「上一句的浮层还没消失时进入下一句」这一轮
 *      永远不会排期（必须等浮层自己关掉后再动一次鼠标才能重新计时）；
 *   ② 旧实现每次 mousemove 都 clearTimeout + 重新 setTimeout，鼠标在句子上哪怕轻微抖动，
 *      3 秒计时就被无限往后推 → 必须一动不动地停满 3 秒才触发。
 * 现在：
 *   · 同一个句子重复调用是**幂等**的 —— 计时节正在跑就不重置（不再被抖动打断）；
 *   · 换到另一句时，先收掉旧浮层与旧计时，再为新句子重新排期（不会被子虚乌有的 visible 挡住）。
 */
function armSentenceHover(el) {
    if (!el) return;
    const idx = parseInt(el.getAttribute('data-sentence-idx'), 10);
    if (!Number.isFinite(idx)) {
        console.warn(`🖱️ [句子翻译] 该句没有 data-sentence-idx，无法排期 | 文本="${String(el.textContent || '').slice(0, 30)}"`);
        return;
    }

    const panel = getSentenceHoverPanel();
    // 这一句的浮层已经展示出来了 → 什么都不做（不要把它关掉）
    if (sentenceHoverVisibleIdx === idx && panel && panel.classList.contains('visible')) return;
    // 这一句已经在计时了 → 保持计时，不重置（关键：让「进入句子后停下」能稳定触发）。
    // ⚠️ 这里刻意不打日志：mousemove 每帧都来，打出来会把控制台刷爆（这正是"抖动不重置"的用意）
    if (sentenceHoverArmedIdx === idx && sentenceHoverTimer) return;

    const list = buildSentenceList();
    const item = list[idx];
    if (!item || (!item.sentence && !item.translation)) {
        console.warn(`🖱️ [句子翻译] idx=${idx} 无有效数据 | 总句数=${list.length} | 命中=${!!item}`);
        return;
    }

    // 排期这一刻如果手里还没有译文，把原因打出来（问题一：后端「成功 17 句」但浮层「暂无翻译」）
    if (!item.translation) {
        console.warn(`🖱️ [句子翻译] idx=${idx} 排期时译文为空 | ${describeEmptyTranslation(idx)}`);
    }

    // 换句子：收掉上一句的浮层与计时
    if (sentenceHoverTimer) {
        clearTimeout(sentenceHoverTimer);
        sentenceHoverTimer = null;
    }
    if (sentenceHoverVisibleIdx !== null && sentenceHoverVisibleIdx !== idx) {
        hideSentenceHoverPanel();
    }

    sentenceHoverArmedIdx = idx;
    console.log(`⏱️ [句子翻译] 已排期 idx=${idx}（${SENTENCE_HOVER_DELAY_MS}ms 后弹出，期间同句内移动不重置）`);
    sentenceHoverTimer = setTimeout(function() {
        sentenceHoverTimer = null;
        sentenceHoverArmedIdx = null;
        // 触发时鼠标已经不在这一句了（快速划过）→ 不弹
        if (!sentenceHoverEl || sentenceHoverEl !== el) {
            console.log(`⏱️ [句子翻译] 计时到点但鼠标已离开 idx=${idx}，不弹浮层`);
            return;
        }
        // ★ 问题一的关键修复：译文要**在「要显示」的这一刻**按 idx 重新取，
        //   不能用 mouseover 那一刻捕获的旧值。旧写法把 item 闭包进计时器，
        //   如果这 3 秒里文章详情才到达（或被列表刷新打回空壳），弹出来的就是过期的「（暂无翻译）」。
        const fresh = resolveSentenceAt(idx);
        const use = (fresh && (fresh.translation || !item.translation)) ? fresh : item;
        if (fresh && fresh.translation !== item.translation) {
            console.log(`⏱️ [句子翻译] idx=${idx} 译文在排期后发生了变化 → 用最新值`
                + `（排期时="${(item.translation || '').slice(0, 16)}" → 现在="${(fresh.translation || '').slice(0, 16)}"）`);
        }
        console.log(`⏱️ [句子翻译] 计时器触发，id=${idx} | 译文=${use.translation ? use.translation.substring(0, 20) : '(空)'}`);
        showSentenceHoverPanel(use.sentence, use.translation, el, idx);
    }, SENTENCE_HOVER_DELAY_MS);
}

/** 按索引取当前最新的句子条目（显示前重新取一次，避免用到过期的空译文） */
function resolveSentenceAt(idx) {
    if (!Number.isFinite(idx)) return null;
    return buildSentenceList()[idx] || null;
}

/**
 * 「这个 idx 为什么没有译文」——把可能性一条条排除掉，日志里直接给结论。
 * 问题一要求「加日志，打印匹配失败的原因」，这里覆盖的是「匹配上了但译文取不到」的那一类。
 */
function describeEmptyTranslation(idx) {
    const art = currentArticle;
    if (!art) return 'currentArticle 为空';
    const n = (art.sentences || []).length;
    const detailLoaded = !!art.detailLoaded;
    const serverSays = !!art.serverHasSentences;
    if (n === 0) {
        if (serverSays || !detailLoaded) {
            return `文章详情未加载到（内存里 sentences=0，detailLoaded=${detailLoaded}，服务端标记有译文=${serverSays}）`
                + ' → 前端只能用本地切句兜底，译文必然为空；已触发补拉详情';
        }
        return '这篇本来就没有译文数据（预置文章 / 历史上传）→ 属正常';
    }
    if (idx >= n) return `idx 越界（idx=${idx} ≥ sentences=${n}）→ data-sentence-idx 是渲染时挂的旧索引`;
    const raw = art.sentences[idx];
    const keys = (raw && typeof raw === 'object') ? Object.keys(raw).join(',') : typeof raw;
    return `sentences[${idx}] 的 translation 字段为空 | 该条字段=${keys}`
        + ` | 原值=${JSON.stringify(raw && (raw.translation === undefined ? raw : raw.translation)).slice(0, 120)}`
        + ' → 可能是字段名不一致（后端返回 sentence/translation）或该句译文确实缺失';
}

/**
 * 「这篇文章的译文现在处在哪种状态」—— 全前端唯一判定处。
 *
 * 为什么必须收成一个函数（2026-10-08）：过去这段判断散在 3 个地方
 * （悬停浮层占位文案 / 提示条显隐 / 重试入口），任何一处漏改都会自相矛盾。
 *
 * 取值与含义：
 *   'ok'                有译文，正常
 *   'failed'            status='partial' 或带 sentencesError → 句子翻译失败（可重试）
 *   'missing' ★★        status='completed'、sentences 为空、且**不是预置文章**
 *                       —— 这是存量数据里真实存在的一类：早期「句子翻译失败」被静默写成
 *                       completed + sentences=[] + sentences_error=null，前端过去把它当成
 *                       「本来就没有译文」，浮层只显示「（暂无翻译）」，用户完全不知道能重试。
 *                       实测真库有 6 篇这样的上传文章（正文 700~123316 字，译文却是 0 句）。
 *   'preset'            预置文章本来就不做句子翻译 → 悬停「暂无翻译」属正常，不给重试入口
 *   'loading'           详情还没加载回来 / **文章还在生成中**，不能下结论
 *   'none'              currentArticle 为空
 *
 * ⚠️ 'missing' 必须以 detailLoaded 为前提：详情没到之前 currentArticle.sentences 恒为 []，
 *    不设这道闸会把每次「刚点开文章」都误报成「译文缺失」并弹出重试条。
 *
 * ⚠️ 2026-10-08 追加 `analyzing` 闸（问题一根因）：
 *    新上传文章在等待页期间 sentences 恒为 []，而它**确实**已经在生成译文了。
 *    没有这道闸时它会掉进 'missing' → 浮层写「这篇还没有生成译文」，
 *    同时还让「部分完成」的提示条逻辑误判，指向一个没显示的「重试」按钮（问题二）。
 *    'analyzing' = true 时一律归 'loading'（文案「译文还在加载中」），**绝不能**说成「还没生成」。
 */
function articleTranslationState() {
    const a = currentArticle;
    if (!a) return 'none';
    if (a.status === 'partial' || a.sentencesError) return 'failed';
    const n = (a.sentences || []).length;
    if (n > 0) return 'ok';
    // 还在生成中（三个工作流没跑完）→ 只能说「加载中」，不能下「没有译文」的结论
    if (a.analyzing) return 'loading';
    if (!a.detailLoaded) return 'loading';
    if (a.source === 'preset') return 'preset';
    return 'missing';
}

/** 译文不可用（要么失败、要么存量缺失）→ 需要提示条 + 重试入口 */
function isTranslationUnavailable(state) {
    return state === 'failed' || state === 'missing';
}

/**
 * ★ 排查「浮层显示暂无翻译」的核心工具（2026-10-08 用户明确要求）★
 *
 * 同时打印两份 sentenceList 并逐条对比：
 *   · 前端（页面正在用的）：buildSentenceList() 的结果，以及每个 .article-sentence 节点挂的 data-sentence-idx
 *   · 后端（接口返回的）：现打一次 /api/article/:id，取它的 sentences
 *
 * 报告四件事，任何一条对不上都会直接写出结论：
 *   ① 两份的**条数**是否一致
 *   ② 逐条的**英文句子**是否一致（不一致就打印第一个差异位置 + 各自原文）
 *   ③ 每条是否**带中文译文**（后端有译文、前端却取不到 → 一定是加载/合并链的问题，不是匹配问题）
 *   ④ 页面实际渲染出的句子节点数、以及有没有节点缺 data-sentence-idx
 *
 * 调用点：悬停发现译文为空时（自动）、切文章渲染完成时（去重后一次）、
 * 以及手工在控制台执行 `__checkSentenceList()`。
 */
async function logSentenceListComparison(note) {
    const a = currentArticle;
    if (!a) { console.warn('🆚 [句子对比] currentArticle 为空，跳过'); return null; }
    const front = buildSentenceList();
    const nodes = document.querySelectorAll('#readContent .article-sentence');
    const missIdx = [];
    nodes.forEach(function (n) {
        if (!Number.isFinite(parseInt(n.getAttribute('data-sentence-idx'), 10))) missIdx.push(n);
    });
    console.log(`🆚 [句子对比] ===== ${a.id}（${note || '手动检查'}）=====`);
    console.log(`🆚 [句子对比] 前端：buildSentenceList()=${front.length} 句`
        + `（currentArticle.sentences=${(a.sentences || []).length}）`
        + ` | 有译文=${front.filter(s => s.translation).length} 句`
        + ` | 详情已加载=${!!a.detailLoaded} | 服务端标记有译文=${!!a.serverHasSentences}`
        + ` | status=${a.status} | source=${a.source} | 译文状态=${articleTranslationState()}`);
    console.log(`🆚 [句子对比] 前端正文节点：.article-sentence=${nodes.length} 个`
        + `（缺 data-sentence-idx 的 ${missIdx.length} 个）`
        + ` | 正文总长=${String(a.article || '').length} 字`);

    let back = null;
    try {
        const d = await apiGet('/api/article/' + encodeURIComponent(a.id));
        back = Array.isArray(d && d.sentences) ? d.sentences : [];
        console.log(`🆚 [句子对比] 后端：/api/article/${a.id} → sentences=${back.length} 句`
            + ` | 有译文=${back.filter(s => s && String(s.translation || '').trim()).length} 句`
            + ` | status=${d.status} | hasSentences=${!!d.hasSentences}`
            + ` | sentencesError=${d.sentencesError || '无'}`);
    } catch (e) {
        console.warn(`🆚 [句子对比] 后端接口调用失败，无法对比：${(e && e.message) || e}`);
        return null;
    }

    // ① 条数
    if (front.length !== back.length) {
        console.warn(`🆚 [句子对比] ❌ 条数不一致：前端 ${front.length} 句 vs 后端 ${back.length} 句`);
    } else {
        console.log(`🆚 [句子对比] ✅ 条数一致（${front.length} 句）`);
    }

    // ② 逐条英文是否一致（打第一个差异就停，避免刷屏）
    let firstDiff = -1;
    for (let i = 0; i < Math.min(front.length, back.length); i++) {
        const f = normalizeSentence(front[i].sentence);
        const b = normalizeSentence((back[i] && back[i].sentence) || '');
        if (f !== b) { firstDiff = i; break; }
    }
    if (firstDiff >= 0) {
        console.warn(`🆚 [句子对比] ❌ 第 ${firstDiff} 条英文原文不一致（归一化后仍不同）：`);
        console.warn(`🆚           前端="${String(front[firstDiff].sentence).slice(0, 120)}"`);
        console.warn(`🆚           后端="${String((back[firstDiff] || {}).sentence || '').slice(0, 120)}"`);
    } else if (front.length && back.length) {
        console.log('🆚 [句子对比] ✅ 逐条英文原文一致');
    }

    // ③ 译文有无 —— 这一条最能定位「到底是没数据还是没匹配」
    const backWithTr = back.filter(s => s && String(s.translation || '').trim()).length;
    const frontWithTr = front.filter(s => s.translation).length;
    if (backWithTr > 0 && frontWithTr === 0) {
        console.warn(`🆚 [句子对比] ❌❌ 后端有 ${backWithTr} 句译文，前端一句都没拿到`
            + ' → 问题在「加载/合并链路」（详情没到位或译本被冲掉），**不是句子匹配**。'
            + ` 详情已加载=${!!a.detailLoaded}、服务端标记有译文=${!!a.serverHasSentences}`);
    } else if (backWithTr === 0 && String(a.article || '').trim()) {
        console.warn(`🆚 [句子对比] ⚠️ 后端也没有译文（sentences=0）→ 这篇的句子翻译**从未成功**`
            + `（status=${a.status}${a.sentencesError ? '、原因=' + a.sentencesError : '、sentences_error 为空 = 静默降级时期的存量数据'}）`
            + ' → 悬停只能显示英文原文，应给出「重试」入口');
    } else if (backWithTr > 0 && frontWithTr > 0) {
        console.log(`🆚 [句子对比] ✅ 译文齐备（前端 ${frontWithTr} / 后端 ${backWithTr} 句）`);
    }

    // ④ 页面渲染出的句子节点（悬停有没有落点）
    if (front.length > 0 && nodes.length === 0) {
        console.warn('🆚 [句子对比] ❌ 一句译文都没有对应的 .article-sentence 节点 → 悬停不可能有反应');
    }
    if (missIdx.length > 0) {
        console.warn(`🆚 [句子对比] ❌ 有 ${missIdx.length} 个句子节点缺 data-sentence-idx → 悬停取不到译文`
            + `（首条="${String(missIdx[0].textContent || '').slice(0, 60)}"）`);
    }
    console.log('🆚 [句子对比] ===== 对比结束 =====');
    return { front: front.length, back: back.length, frontWithTr, backWithTr, nodes: nodes.length };
}

// 手工排查入口：控制台执行 __checkSentenceList() / __checkSentenceList('upload_xxx')
window.__checkSentenceList = function (articleId) {
    if (articleId && (!currentArticle || currentArticle.id !== articleId)) {
        const target = ARTICLES.find(x => x.id === articleId);
        if (!target) { console.warn(`🆚 [句子对比] 内存里没有 ${articleId}，先 openArticle('${articleId}')`); return; }
        currentArticle = target;
    }
    return logSentenceListComparison('手工检查');
};

// 描述一个元素，用于日志（"谁挡住了鼠标"）
function describeEl(el) {
    if (!el) return '(null)';
    if (el === document.documentElement) return '<html>';
    if (el === document.body) return '<body>';
    const cls = String(el.className || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.');
    return (el.id ? '#' + el.id : '') + (cls ? '.' + cls : '') + '<' + el.tagName + '>';
}

// 我们自己的浮层：它们压在正文上时属于「自家挡自家」，日志里要能一眼认出来
function isOwnOverlay(el) {
    if (!el || !el.closest) return false;
    return !!(el.closest('.word-card') || el.closest('#sentenceHoverPanel')
        || el.closest('.sort-panel') || el.closest('.drag-guide-bubble') || el.closest('.toast'));
}

/**
 * 从鼠标事件里解析出「指针所在的句子元素」，并在被自家浮层挡住时给出明确日志。
 *
 * 这就是问题三（悬停 3 秒不触发）的根因所在：词卡 340×470px 压在正文上时，
 * 事件目标是词卡而不是 `<p class="article-sentence">`，于是老的 `closest()` 直接返回 null，
 * 悬停永远不排期、也不报错 —— 静默失效。
 */
function resolveSentenceEl(e, quiet) {
    const direct = (e.target && e.target.closest) ? e.target.closest('.article-sentence') : null;
    if (direct) return direct;
    if (isOwnOverlay(e.target)) {
        // 穿透探测：把自家浮层临时让开，看它底下是不是正文句子
        const under = quiet ? null : sentenceUnderPoint(e.clientX, e.clientY);
        if (!quiet) {
            if (under) {
                console.log(`🖱️ [句子翻译] ⚠️ 指针被自家的 ${describeEl(e.target)} 挡住 → 穿透后发现下方是 idx=${under.getAttribute('data-sentence-idx')} 的句子（这行日志就是"悬停不触发"的现场）`);
            } else {
                console.log(`🖱️ [句子翻译] 指针在自家的 ${describeEl(e.target)} 上（下方不是正文，忽略）`);
            }
        }
        return null;   // 自家浮层上的指针不参与句子悬停（用户在看卡片，不是在看句子）
    }
    return null;
}

/** 指针位置「穿透自家浮层」后落在哪个句子上（纯几何，不做事件派发） */
function sentenceUnderPoint(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const root = document.getElementById('readContent');
    if (!root) return null;
    const nodes = root.querySelectorAll('.article-sentence');
    for (let i = 0; i < nodes.length; i++) {
        const r = nodes[i].getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (y >= r.top && y <= r.bottom && x >= r.left && x <= r.right) return nodes[i];
    }
    return null;
}

// 计时器状态摘要（日志里一眼看清「到底有没有在计时」）
function hoverTimerState() {
    const armed = (sentenceHoverArmedIdx === null) ? '无' : sentenceHoverArmedIdx;
    const cur = sentenceHoverEl ? sentenceHoverEl.getAttribute('data-sentence-idx') : '无';
    const vis = (sentenceHoverVisibleIdx === null) ? '未显示' : ('idx=' + sentenceHoverVisibleIdx);
    return `状态[计时中的句=${armed} 计时器=${sentenceHoverTimer ? '在跑' : '无'} 鼠标所在句=${cur} 浮层=${vis}]`;
}

function onSentenceMouseOver(e) {
    const el = resolveSentenceEl(e);
    if (!el) return;
    if (el.contains(e.relatedTarget)) return; // 在句子内部（含 word-span）移动，忽略
    sentenceHoverEl = el;
    const idx = parseInt(el.getAttribute('data-sentence-idx'), 10);
    console.log(`🖱️ [句子翻译] mouseover 进入句子 idx=${idx}${Number.isFinite(idx) ? '' : '（⚠️ 该句没有 data-sentence-idx，无法取译文）'} | ${hoverTimerState()}`);
    // 进入即排期：这样「移到句子上一停就等弹出」也能触发，不依赖后续是否还有 mousemove
    armSentenceHover(el);
}

function onSentenceMouseMove(e) {
    const el = resolveSentenceEl(e, true);   // quiet：mousemove 每帧都来，遮挡日志只在 mouseover 里打一次
    if (!el) {
        // 鼠标不在任何句子上：取消计时，延迟 1 秒关闭浮层（给用户时间移向浮层）
        if (sentenceHoverEl || sentenceHoverTimer) {
            console.log(`🖱️ [句子翻译] mousemove 离开句子（指针在 ${describeEl(e.target)}）| 清计时 → ${hoverTimerState()}`);
        }
        sentenceHoverEl = null;
        clearSentenceHoverTimer('鼠标移出句子');
        scheduleHideSentenceHoverPanel();
        return;
    }
    if (el !== sentenceHoverEl) {
        sentenceHoverEl = el;
        const idx = parseInt(el.getAttribute('data-sentence-idx'), 10);
        const item = buildSentenceList()[idx];
        console.log(`🖱️ [句子翻译] mousemove 进入句子 idx=${idx} | 有译文=${!!(item && item.translation)} | ${hoverTimerState()}`);
    }
    // 排期是幂等的：同句内反复移动不会重置计时（旧实现会，导致很难触发）
    armSentenceHover(el);
}

function onSentenceMouseOut(e) {
    const el = (e.target && e.target.closest) ? e.target.closest('.article-sentence') : null;
    if (!el) return;
    if (el.contains(e.relatedTarget)) return; // 仍在句子内部，忽略
    // 注意：不要在这里把 sentenceHoverEl 无条件清空 —— mouseout 先于下一句的 mouseover 触发，
    // 若此处清空、而新句子又没有新的 mousemove，上一轮已排期的计时就会在触发时被判为「鼠标已离开」而丢弃。
    if (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.article-sentence')) {
        console.log('🖱️ [句子翻译] 离开句子去往另一句，等待新句子重新排期');
        clearSentenceHoverTimer('切到另一句');
        return;
    }
    sentenceHoverEl = null;
    clearSentenceHoverTimer('鼠标移出句子');
    // 延迟 1 秒关闭，给用户时间把鼠标从句子移到浮层
    scheduleHideSentenceHoverPanel();
}

// 归一化句子用于语义模糊匹配：去掉形如 [xxx] 的标记、非字母字符、数字、多余空格
function normalizeSentence(s) {
    if (typeof s !== 'string') s = String(s == null ? '' : s);
    return s
        .toLowerCase()
        .replace(/\[[^\]]*\]/g, ' ')   // 去掉 [LunWenJia.Com] 之类的站标/标注
        .replace(/[^a-z\s]/g, ' ')     // 去掉数字、标点等非字母字符
        .replace(/\s+/g, ' ')          // 合并多余空白
        .trim();
}

/**
 * 「压扁」：在 normalizeSentence 基础上**再去掉所有空白**。
 *
 * 为什么需要（2026-10-07，问题一）：文章正文常常是从 PDF 抽出来的，**词间空格会丢**——
 * 实测 `upload_1791341507681` 正文是 `With the rapiddevelopment of ...`（rapid+development 粘连），
 * 而后端 sentenceList 里是正常的 `With the rapid development of ...`。
 * 逐字比较必然不相等 → 17 句里 11 句只能靠「顺序兜底」对齐（碰巧对得上；片段数与句数一变就错位：
 * 实测 upload_1790413176880 是 33 句 vs 39 片段、upload_1790329600818 是 58 句 vs 21 片段）。
 * 去掉空白后两者的比较键完全一致 → 匹配率从 6/17 提到 17/17，不再依赖运气。
 */
function squashSentence(s) {
    return normalizeSentence(s).replace(/\s+/g, '');
}

// 判断正文句子片段与 sentenceList 中的句子是否匹配（先精确包含，再归一化模糊匹配）
function sentenceMatches(partText, sentenceText) {
    if (!sentenceText) return false;
    const key = (partText || '').toLowerCase().trim();
    const sen = String(sentenceText).toLowerCase().trim();
    if (!key || !sen) return false;

    // 1) 精确包含（原逻辑，保证向下兼容）+ 长度比例护栏。
    //    护栏是 2026-10-07 加的：没有它，正文里 3 个字母的片段（如 "the"）会因为长句里
    //    恰好含 "the" 而「匹配」到那个毫不相干的句子 —— 浮层就会显示别人的译文。
    //    要求短的一侧至少占长的一侧 50%，才算「同一句被切得不一样」。
    if (key.indexOf(sen) !== -1 || sen.indexOf(key) !== -1) {
        const shorter = Math.min(key.length, sen.length);
        const longer = Math.max(key.length, sen.length);
        if (longer === 0 || shorter / longer >= 0.5) return true;
    }

    const nk = normalizeSentence(key);
    const ns = normalizeSentence(sen);
    if (!nk || !ns) return false;

    // 2) 归一化后完全相等
    if (nk === ns) return true;

    // 2b) **压扁后完全相等** —— 唯一差别是「空格」时视为同一句（PDF 掉空格的文章靠这条救回来）
    const qk = squashSentence(key);
    const qs = squashSentence(sen);
    if (qk && qs && qk === qs) return true;

    // 3) 归一化后一方包含另一方（长度需足够，避免 "the" 等短词误匹配）
    if (ns.length >= 10 && nk.indexOf(ns) !== -1) return true;
    if (nk.length >= 10 && ns.indexOf(nk) !== -1) return true;

    // 3b) 压扁后一方包含另一方
    if (qs.length >= 10 && qk.indexOf(qs) !== -1) return true;
    if (qk.length >= 10 && qs.indexOf(qk) !== -1) return true;

    // 4) 归一化后前 30 字符相等
    if (nk.length >= 30 && ns.length >= 30 && nk.substring(0, 30) === ns.substring(0, 30)) return true;
    // 4b) 压扁后前 30 字符相等
    if (qk.length >= 30 && qs.length >= 30 && qk.substring(0, 30) === qs.substring(0, 30)) return true;

    return false;
}

/**
 * 匹配失败时的诊断：找出「最接近的一句」，报告公共前缀有多长、差在第几个字母。
 * 这是问题一要求的「加日志，打印匹配失败的原因」——不用再靠猜。
 */
function describeMatchFailure(partText, sentences) {
    const qk = squashSentence(partText);
    let best = null;
    for (let i = 0; i < sentences.length; i++) {
        const qs = squashSentence(sentences[i].sentence);
        if (!qs) continue;
        let common = 0;
        const n = Math.min(qk.length, qs.length);
        while (common < n && qk[common] === qs[common]) common++;
        if (!best || common > best.common) best = { idx: i, common, qs: qs };
    }
    const head = qk.slice(0, 60);
    if (!best) return `片段键="${head}"（去空格后 ${qk.length} 字母），sentenceList 里没有可比较的句子`;
    return `片段键="${head}"（去空格后 ${qk.length} 字母）`
        + ` | 最接近的是 idx=${best.idx}（前 ${best.common} 个字母相同，共 ${best.qs.length} 字母）`
        + ` | 该句键="${best.qs.slice(0, 60)}"`
        + ` | 差异位置=${best.common}`;
}

function renderArticleWithTranslations() {
    const readContent = document.getElementById('readContent');
    if (!currentArticle) return;

    let html = '';
    // 英文正文始终来自 currentArticle.article（上传时已入库，不依赖 Coze 返回）
    const articleText = (currentArticle.article || '').trim();
    const sentences = buildSentenceList();
    const paragraphs = articleText.split(/\n\n+/).filter(p => p.trim().length > 0);
    let matchedParts = 0;      // 拿到了 data-sentence-idx 的片段数（含靠顺序兜底的）
    let textMatchedParts = 0;  // 其中真正靠「文本匹配」命中的片段数（其余是顺序兜底）
    let totalParts = 0;        // 切出的片段总数
    let sentenceNodes = 0;     // 实际渲染出的 .article-sentence 节点数（悬停译文靠它）
    let seqIdx = 0;            // 全局片段序号（跨段累计，用于「顺序对齐」兜底）

    if (sentences.length > 0) {
        // 逐句渲染英文（来自 articleText），按文本匹配关联译文用于悬停浮层；
        // data-sentence-idx 指向 buildSentenceList 索引，供右侧浮层按索引取译文
        html = paragraphs.map(function (p) {
            const parts = p.match(/[^.!?]+[.!?]+/g) || [p];
            return parts.map(function (part) {
                const t = part.trim();
                if (!t) return '';
                totalParts++;
                const idx = sentences.findIndex(function (s) {
                    return sentenceMatches(t, s.sentence);
                });
                if (idx >= 0) {
                    matchedParts++;
                    textMatchedParts++;
                    sentenceNodes++;
                    seqIdx++;
                    return '<p class="article-sentence" data-sentence-idx="' + idx + '" style="margin-bottom:0.75rem;line-height:1.8;">' + splitWordsToSpans(t) + '</p>';
                }
                // 兜底：整篇匹配失败时按「顺序对齐」挂上索引（后端 sentenceList 顺序与正文一致），
                // 保证句子翻译仍有悬停入口，而不是静默退化成普通段落。
                // ⚠️ 不再要求 `sentences[seqIdx].translation` 非空（2026-10-06）：
                // buildSentenceList() 现在会在「没有译文数据」时用本地切句兜底，这些句子
                // 译文为空但**必须有 data-sentence-idx**，否则悬停依旧没有落点、等于没修。
                const fallbackIdx = (seqIdx < sentences.length && sentences[seqIdx]) ? seqIdx : -1;
                seqIdx++;
                if (fallbackIdx >= 0) {
                    matchedParts++;
                    sentenceNodes++;
                    // 诊断（问题一要求）：不只说「匹配失败」，还要说清「差在哪」——
                    // 片段键（去空格）与最接近的那一句的前缀重合度，一眼能看出是空格问题、
                    // 标点问题，还是片段与句子根本对不上（严重错位）。
                    console.log(`🖱️ [句子渲染] 文本匹配失败 → 按顺序对齐 idx=${fallbackIdx} | ${describeMatchFailure(t, sentences)}`);
                    return '<p class="article-sentence" data-sentence-idx="' + fallbackIdx + '" style="margin-bottom:0.75rem;line-height:1.8;">' + splitWordsToSpans(t) + '</p>';
                }
                console.warn(`🖱️ [句子渲染] 该片段既匹配不到译文、也无顺序兜底（片段数已超出 sentenceList）`
                    + ` | 片段="${t.slice(0, 60)}" | 片段序号=${seqIdx - 1} / sentenceList=${sentences.length}`);
                return '<p style="margin-bottom:0.75rem;line-height:1.8;">' + splitWordsToSpans(t) + '</p>';
            }).join('');
        }).join('');
    } else {
        html = paragraphs.map(function (p) {
            return '<p style="margin-bottom:1rem;line-height:1.8;">' + splitWordsToSpans(p) + '</p>';
        }).join('');
    }

    readContent.innerHTML = html;

    // 2026-09-30 修复：重绘会把 #readContent 里的旧节点全部销毁，但 sentenceHoverEl 仍指向旧节点，
    // 已排期的 3 秒计时到点时会因为 `sentenceHoverEl !== el` 被判为「鼠标已离开」而丢弃 →
    // 表现为「悬停没反应，必须再动一下鼠标才有译文」。这里统一把悬停状态复位。
    sentenceHoverEl = null;
    clearSentenceHoverTimer('正文重绘（旧节点已失效）');
    hideSentenceHoverPanel();

    applyHighlights();
    markCollectedSpans();

    const fallbackCount = matchedParts - 0;   // 兼容旧日志字段：matchedParts 现在含顺序兜底
    console.log(`🎨 [句子渲染] 完成 | sentenceList=${sentences.length} 句 | 段落=${paragraphs.length} | 切出片段=${totalParts}`
        + ` | 有索引的片段=${matchedParts}（其中靠文本匹配=${textMatchedParts}，靠顺序兜底=${fallbackCount - textMatchedParts}）`
        + ` | 生成 .article-sentence 节点=${sentenceNodes}`
        + (sentences.length > 0 && sentenceNodes === 0 ? ' ← ⚠️ 一个都没生成，句子翻译将无法悬停！' : '')
        + (sentences.length === 0 ? ` | 本文没有译文数据（详情已加载=${!!currentArticle.detailLoaded}`
            + `，服务端标记有译文=${!!currentArticle.serverHasSentences}）→ 悬停只能显示英文原文` : ''));

    // ★ 用户要求（2026-10-08）：把「前端 sentenceList」与「后端 sentenceList」并排打出来对比。
    //   只在**看起来不正常**时自动触发（有正文却一句译文都没有 / 译文条数为 0），
    //   正常文章不打印，避免把控制台刷爆；每篇文章只自动触发一次（手动可用 __checkSentenceList()）。
    if (currentArticle && String(articleText || '').length > 0
        && (sentences.length === 0 || sentences.filter(s => s.translation).length === 0)
        && currentArticle._autoCmpDone !== true) {
        currentArticle._autoCmpDone = true;
        console.warn(`🆚 [句子对比] 正文有 ${articleText.length} 字，却没有任何可用译文 → 自动触发前后端 sentenceList 对比`);
        logSentenceListComparison('渲染完成（译文为空）');
    }
}

function toggleTranslations() {
    isTranslationsVisible = !isTranslationsVisible;
    const btn = document.getElementById('toggleTransBtn');
    if (btn) {
        btn.textContent = isTranslationsVisible ? '🔒 隐藏译文' : '🌐 显示译文';
    }
    renderArticleWithTranslations();
}

// ==================== 完成阅读 & 分类整理面板 ====================

/**
 * 「待分类」统一入口（2026-10-08 恢复）。
 *
 * 谁调用：阅读页右上「📋 待分类 N」、右侧收集区点击、「我的收藏」头部「📋 去分类」。
 * 逻辑：优先整理「本文」待分类的词；本文整理完了（或不在阅读页）就展示全部待分类的词。
 * 这里**不**自动跳题目/总结页 —— 入口点击的语义就是「我要分类」。
 */
function openPendingFromReading() {
    const articleId = currentArticle ? currentArticle.id : null;
    const pendingInArticle = userData.collectedWords.filter(function(w) {
        return w.status === 'pending' && w.articleId === articleId;
    });
    const pendingAll = userData.collectedWords.filter(function(w) {
        return w.status === 'pending';
    });

    console.log(`📋 [待分类] 入口被点击 | 当前文章=${articleId || '（无，非阅读页）'}`
        + ` | 本文待分类=${pendingInArticle.length} | 全部待分类=${pendingAll.length}`
        + ` | 收藏总数=${userData.collectedWords.length}`);

    if (pendingAll.length === 0) {
        console.log('📋 [待分类] 没有任何待分类单词 → 只提示，不开面板');
        toast('没有待分类的单词 🎉 收藏的单词都已经分类好了');
        return;
    }

    if (articleId && pendingInArticle.length === 0) {
        console.log(`📋 [待分类] 本文已整理完 → 改为展示全部待分类（${pendingAll.length} 个）`);
        toast('本文的单词都分类完了，下面是你其他文章里待分类的单词');
        openSortPanelAllPending();
        return;
    }

    // 有本文待分类 → 限定本文范围打开面板（保持和「完成阅读」一致的语义）
    sortPanelSortedWords = [];
    sortPanelArticleId = articleId;
    sortPanelSessionOnly = false;
    showSortPanel(pendingInArticle, (currentArticle && currentArticle.title) || '文章单词整理');
}

/**
 * 右侧收集区点击 → 打开待分类。
 * 注意：拖拽落点判中时也会走这里（pointerup 之后浏览器仍会派发 click），
 * 用 spanJustDragged / 短时间内的收藏动作把「刚收藏完的那一下点击」吞掉，
 * 否则用户一拖完就弹面板，打断阅读。
 */
function onCollectZoneClick(e) {
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    const since = Date.now() - (window.__lastCollectAt || 0);
    if (since < 600) {
        console.log(`📋 [待分类] 收集区点击被忽略（距上次收藏仅 ${since}ms，避免刚拖完就弹面板）`);
        return;
    }
    console.log('📋 [待分类] ← 从收集区点击进入');
    openPendingFromReading();
}

// 点击"完成阅读"按钮触发（历史入口，2026-10-08 起统一走 openPendingFromReading）
function finishReading() {
    console.log('📋 [待分类] ← 从 finishReading() 进入');
    openPendingFromReading();
}

// 打开分类面板：按文章ID筛选（用于从单词本"去分类"和完成阅读）
function openSortPanelForArticle(articleId, articleTitle) {
    const words = userData.collectedWords.filter(function(w) {
        return w.status === 'pending' && w.articleId === articleId;
    });
    
    if (words.length === 0) {
        toast('这篇文章已整理完毕 🎉');
        return;
    }
    
    sortPanelSortedWords = [];
    sortPanelArticleId = articleId;  // 记录当前面板筛选的文章ID
    sortPanelSessionOnly = false;
    showSortPanel(words, articleTitle || '文章单词整理');
}

// 打开分类面板：所有待分类（用于没有当前文章时 / 单词本兜底）
function openSortPanelAllPending() {
    const words = userData.collectedWords.filter(function(w) {
        return w.status === 'pending';
    });
    sortPanelSortedWords = [];
    sortPanelArticleId = null;  // 不限定文章
    sortPanelSessionOnly = false;
    showSortPanel(words, '所有待分类单词');
}

/**
 * 打开分类面板：**本次学习**收藏且仍待分类的词（结算页「📋 去分类待学单词（N）」入口）。
 * 2026-10-08 新增：结算页是「本次学习」的结算，所以它下面的入口也只该管本次留下的待分类，
 * 不能把历史文章攒下的存量一起端上来（用户原话：「不累计历史记录」）。
 */
function openSortPanelForSession() {
    const words = sessionPendingWords();
    console.log(`📋 [待分类] ← 从结算页「去分类待学单词」进入 | 本次会话待分类=${words.length}`
        + ` | 全部待分类=${pendingCountAll()}（不参与）`);
    if (words.length === 0) {
        toast('本次收藏的单词都分类好了 🎉');
        return;
    }
    sortPanelSortedWords = [];
    sortPanelArticleId = null;      // 会话范围：可能跨多篇文章
    sortPanelSessionOnly = true;    // 恢复/重绘时按「本次会话」过滤
    showSortPanel(words, '本次学习 · 待分类');
}

// 显示分类面板（核心入口）
function showSortPanel(pendingWords, title) {
    const mask = document.getElementById('sortPanelMask');
    if (!mask) return;
    
    if (!pendingWords || pendingWords.length === 0) {
        toast('没有待分类的单词 🎉');
        return;
    }
    
    document.getElementById('sortPanelTitle').textContent = title || '整理待分类单词';
    
    mask.classList.add('show');
    document.body.style.overflow = 'hidden';  // 锁定背景滚动
    
    renderSortPanelContent(pendingWords);
}

// 关闭面板
function closeSortPanel() {
    const mask = document.getElementById('sortPanelMask');
    if (!mask) return;
    
    mask.classList.remove('show');
    document.body.style.overflow = '';
    
    // 清理浮动标签（如果有）
    const floatingTag = document.querySelector('.sort-floating-tag');
    if (floatingTag) floatingTag.remove();
    
    // 清理
    sortPanelSortedWords = [];
    sortPanelArticleId = null;
    
    // 如果在单词本页面，重新渲染
    const wordbookActive = document.getElementById('wordbookPage').classList.contains('active');
    if (wordbookActive) {
        renderVocabBook();
    }
    updateCollectBadge();

    // 2026-10-08：这次面板是「完成学习」触发的 → 关闭后继续进总结页
    if (summaryAfterSort) {
        console.log('📋 [待分类] 整理面板关闭（完成学习触发）→ 继续进入总结页');
        summaryAfterSort = false;
        gotoSummary();
    }
}

// 渲染分类面板内容
function renderSortPanelContent(pendingWords) {
    const contentEl = document.getElementById('sortPanelContent');
    const progressTextEl = document.getElementById('sortProgressText');
    const footerEl = document.getElementById('sortPanelFooter');
    
    if (!contentEl) return;
    
    const total = pendingWords.length + sortPanelSortedWords.length;
    const sortedCount = sortPanelSortedWords.length;
    
    // 更新进度（显示百分比）
    if (progressTextEl) {
        const percent = total > 0 ? Math.round((sortedCount / total) * 100) : 0;
        progressTextEl.textContent = `${sortedCount}/${total} 已整理 · ${percent}%`;
    }
    
    // 如果全部整理完成
    if (pendingWords.length === 0) {
        contentEl.innerHTML = `
            <div class="sort-done-tip">
                <div class="sort-done-emoji">🎉</div>
                <div class="sort-done-text">整理完成！</div>
                <div class="sort-done-sub">本次共整理 ${total} 个单词，太棒了！</div>
            </div>
        `;
        if (footerEl) {
            footerEl.innerHTML = `
                <button class="sort-footer-btn sort-footer-finish" onclick="closeSortPanel()" style="flex:1;">✓ 完成整理</button>
            `;
        }
        return;
    }
    
    // 底部按钮
    if (footerEl) {
        footerEl.innerHTML = `
            <button class="sort-footer-btn sort-footer-later" onclick="closeSortPanel()">稍后整理</button>
            <button class="sort-footer-btn sort-footer-finish" onclick="closeSortPanel()">完成整理 (${sortedCount}/${total})</button>
        `;
    }
    
    // 列表内容
    contentEl.innerHTML = pendingWords.map(function(w) {
        const paraText = (w.paragraphIndex !== undefined && w.paragraphIndex !== null) 
            ? `第${w.paragraphIndex + 1}段` 
            : '';
        return `
        <div class="sort-word-item" id="sort-word-${w.id}">
            <div class="sort-word-row">
                <div>
                    <div class="sort-word-text">${escapeHtml(w.word)}</div>
                    <div class="sort-word-meaning">${escapeHtml(w.meaning || '')}</div>
                </div>
            </div>
            ${w.sentence ? `
                <div class="sort-word-sentence" onclick="jumpToParagraphInReading(${w.id})" title="点击跳回阅读页对应段落">
                    ${paraText ? `<span class="sort-sentence-label">📍 ${paraText}</span><br>` : ''}
                    "${escapeHtml(w.sentence)}"
                </div>
            ` : ''}
            <div class="sort-buttons">
                <button class="sort-btn sort-btn-mastered" onclick="sortWordAction(${w.id}, 'mastered')">
                    ✓ 已掌握
                </button>
                <button class="sort-btn sort-btn-learning" onclick="sortWordAction(${w.id}, 'learning')">
                    📖 学习中
                </button>
                <button class="sort-btn sort-btn-review" onclick="sortWordAction(${w.id}, 'review')">
                    ↻ 需复习
                </button>
            </div>
        </div>
        `;
    }).join('') + renderSortedSection();
}

// 已整理单词的chip区域
function renderSortedSection() {
    if (sortPanelSortedWords.length === 0) return '';
    const mastered = sortPanelSortedWords.filter(w => w.status === 'mastered');
    const learning = sortPanelSortedWords.filter(w => w.status === 'learning');
    const review = sortPanelSortedWords.filter(w => w.status === 'review');
    
    return `
    <div class="sorted-section">
        <div class="sorted-title">已整理 (${sortPanelSortedWords.length})</div>
        <div class="sorted-list">
            ${mastered.map(w => `<span class="sorted-chip mastered">✓ ${escapeHtml(w.word)}</span>`).join('')}
            ${learning.map(w => `<span class="sorted-chip learning">📖 ${escapeHtml(w.word)}</span>`).join('')}
            ${review.map(w => `<span class="sorted-chip review">↻ ${escapeHtml(w.word)}</span>`).join('')}
        </div>
    </div>
    `;
}

// 单词分类动作
async function sortWordAction(wordId, newStatus) {
    const word = userData.collectedWords.find(w => w.id === wordId);
    if (!word) return;

    const knowledgeMap = {
        'mastered': 1,
        'learning': 0.5,
        'review': 0.2
    };
    const knowledge = knowledgeMap[newStatus] || 0;

    // 本地乐观更新（保证动画流畅）
    word.status = newStatus;
    word.knowledge = knowledge;
    saveData();

    // 2026-10-08：分类会改变「待分类」数量 → 立刻刷新所有入口计数/红点，
    // 否则要等面板关闭才更新，用户会看到「已掌握」了计数还挂着。
    updateCollectBadge();
    // 收藏区列表也带状态（chip 的 tooltip 显示「待分类 / 已分类」）→ 一起重绘，避免状态显示滞后
    renderReadingFavs();
    const wordbookOpen = document.getElementById('wordbookPage');
    if (wordbookOpen && wordbookOpen.classList.contains('active')) renderVocabBook();

    // 后台同步到后端 user_words 表（不阻塞动画）
    apiPut('/api/word-status/' + wordId, { status: newStatus, knowledge: knowledge })
        .catch(function(e) { console.warn('⚠️ 分类同步后端失败:', e.message); });

    // 记录到已整理列表
    sortPanelSortedWords.push({
        word: word.word,
        status: newStatus
    });

    // 播放收缩动画
    const itemEl = document.getElementById('sort-word-' + wordId);
    if (itemEl) {
        itemEl.classList.add('collapsing');
        setTimeout(function() {
            // 重新获取 pending 列表：范围跟面板打开时保持一致
            // （会话模式 / 限定文章 / 全部 —— 见 currentSortPanelPendingList）
            renderSortPanelContent(currentSortPanelPendingList());
        }, 300);
    }

    const msgMap = {
        'mastered': '✓ 已掌握！',
        'learning': '📖 加入学习中',
        'review': '↻ 加入复习队列'
    };
    toast(msgMap[newStatus] || '分类完成');
}

// 点击句子跳转回阅读页对应段落（面板缩小为浮动标签）
function jumpToParagraphInReading(wordId) {
    const word = userData.collectedWords.find(w => w.id === wordId);
    if (!word) return;
    
    // 面板缩小为浮动标签（不关闭）
    minimizeSortPanel();
    
    // 如果有文章ID，打开对应文章
    if (word.articleId) {
        // 找到文章
        let article = ARTICLES.find(a => a.id === word.articleId);
        if (!article && currentArticle && currentArticle.id === word.articleId) {
            article = currentArticle;
        }
        
        if (article) {
            // 如果当前不在阅读页或文章不同，先打开文章
            const readingActive = document.getElementById('readingPage').classList.contains('active');
            if (!readingActive || !currentArticle || currentArticle.id !== word.articleId) {
                openArticle(article.id);
            }
            
            // 滚动到对应段落并高亮闪烁
            setTimeout(function() {
                const readContent = document.getElementById('readContent');
                if (readContent) {
                    const pNodes = readContent.querySelectorAll('p');
                    const pIdx = word.paragraphIndex || 0;
                    if (pNodes[pIdx]) {
                        pNodes[pIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
                        
                        // 橙色高亮闪烁2次后保持柔和底色
                        pNodes[pIdx].classList.add('paragraph-highlighted');
                        
                        // 闪烁动画结束后保持柔和底色
                        setTimeout(function() {
                            if (pNodes[pIdx]) {
                                pNodes[pIdx].style.background = 'var(--primary-light)';
                                pNodes[pIdx].style.borderRadius = '0.5rem';
                                pNodes[pIdx].style.padding = '0.5rem';
                            }
                        }, 1200);
                        
                        // 5秒后完全清除高亮
                        setTimeout(function() {
                            if (pNodes[pIdx]) {
                                pNodes[pIdx].classList.remove('paragraph-highlighted');
                                pNodes[pIdx].style.background = '';
                                pNodes[pIdx].style.borderRadius = '';
                                pNodes[pIdx].style.padding = '';
                            }
                        }, 5000);
                    }
                }
            }, 300);
        } else {
            toast('无法找到对应文章');
        }
    }
}

// 面板缩小为浮动标签
function minimizeSortPanel() {
    const mask = document.getElementById('sortPanelMask');
    if (!mask) return;
    
    // 隐藏面板（保留数据，不清理）
    mask.classList.remove('show');
    document.body.style.overflow = '';
    
    // 显示浮动标签
    const existingTag = document.querySelector('.sort-floating-tag');
    if (existingTag) existingTag.remove();
    
    const tag = document.createElement('div');
    tag.className = 'sort-floating-tag';
    tag.innerHTML = '📚 继续分类';
    tag.onclick = restoreSortPanel;
    document.body.appendChild(tag);
}

/**
 * 分类面板当前该显示哪些待分类词 —— 范围跟面板「打开时」保持一致：
 *   ① sortPanelSessionOnly  → 本次会话收藏且仍待分类（结算页入口）
 *   ② sortPanelArticleId    → 该文章的待分类（单词本「去分类」/ 阅读页入口）
 *   ③ 都不设                → 全部待分类（单词本兜底）
 */
function currentSortPanelPendingList() {
    if (sortPanelSessionOnly) return sessionPendingWords();
    if (sortPanelArticleId) {
        return userData.collectedWords.filter(function (w) {
            return w.status === 'pending' && w.articleId === sortPanelArticleId;
        });
    }
    return userData.collectedWords.filter(function (w) {
        return w.status === 'pending';
    });
}

// 恢复面板
function restoreSortPanel() {
    const tag = document.querySelector('.sort-floating-tag');
    if (tag) tag.remove();
    
    const mask = document.getElementById('sortPanelMask');
    if (!mask) return;
    
    mask.classList.add('show');
    document.body.style.overflow = 'hidden';
    
    // 重新渲染当前 pending 列表（范围与打开时一致）
    renderSortPanelContent(currentSortPanelPendingList());
}

// ==================== 初始化 ====================

window.addEventListener('DOMContentLoaded', function() {
    console.log('🎯 DOM 加载完成');

    // 释义锁：模式与已解锁词句在脚本载入时就读好了（见 loadGuessLockState 的调用点），
    // 这里只需把顶部开关的文案/配色同步上去（它依赖 DOM）
    syncGuessLockButton();

    // ---- 会话恢复（2026-10-09；存储介质已改为 sessionStorage 标签页级）----
    // ⚠️ 历史遗留清理：老版本把会话写进了 localStorage（永久 + 跨标签），会让**每一次进网页**
    //    都被劫持到阅读页、跳过欢迎页与 Dashboard（用户 2026-10-09 报的「路由坏了」）。
    //    这里主动删掉它 —— 用户不用手动清缓存，下次访问即恢复正常流程。
    try {
        if (localStorage.getItem(SESSION_KEY) !== null) {
            localStorage.removeItem(SESSION_KEY);
            console.log('🧹 [路由] 已清理遗留的 localStorage.gaSession（旧版永久会话，正是它跳过了欢迎页）');
        }
    } catch (e) {}

    // 兜底开关：网址带 ?fresh=1 / #fresh → 丢弃会话，强制从欢迎页开始
    if (wantsFreshStart()) {
        clearSession();
        console.log('🧭 [路由] 地址栏带 fresh 标记 → 丢弃会话，强制回到欢迎页');
    }

    const sessionSupported = !!sessionStore();
    const sess = readSession();
    const started = !!(sess && sess.started);

    console.log('🧭 [路由] ===== 启动路由决策 =====');
    console.log('🧭 [路由] 会话介质: ' + (sessionSupported
        ? 'sessionStorage（标签页级；新标签 / 重开浏览器 = 全新访问）'
        : '不可用 → 每次访问都从欢迎页开始'));
    console.log('🧭 [路由] 会话内容: ' + JSON.stringify(sess || {}));
    console.log('🧭 [路由] 判定: ' + (started
        ? '本标签页有会话 → 还原到「' + (sess.screen || 'dashboardPage') + '」' + (sess.articleId ? '（文章 ' + sess.articleId + '）' : '')
        : '无会话 → 欢迎页 startingPage（正常首访流程）'));

    // 身份恢复：**无论有没有会话都要做**。app.js 顶层 userData 每次载入都是空对象，
    // getUsername() 会退化成 golden-apple-user → 欢迎页拉文章、以及之后所有 /api 请求
    // 都会带错 x-username，把别人的收藏当成自己的。只恢复身份，不恢复收藏（以服务端为准）。
    restoreUserIdentity();

    // 历史根条目：有会话时根 = 主界面（欢迎页不再进返回栈），否则根 = 欢迎页
    bootHistory(started ? 'dashboardPage' : 'startingPage');
    window.addEventListener('popstate', onPopState);

    // 打开网站即校验访问密码（未存则弹窗，已存则静默通过）；密码就绪后再拉文章首页，
    // 免得第一次请求因缺密码头吃 401。加载失败会退回内置兜底文章，不阻塞界面。
    const pwdReady = ensureAccessPassword().catch(function() {});
    pwdReady.then(function () {
        loadArticlesPage(1);
    });
    
    // 初始化收集区徽章（尚未进入主界面，保持隐藏）
    setTimeout(updateCollectBadge, 100);

    if (started) {
        // 还原上次停留的屏（无 History API 时也照样还原，只是没有返回栈）
        restoreScreenFromSession(sess);
        // 会话恢复时 startApp() 不会被调用 → 打卡 / 拉取收藏必须在这里补上，否则主界面是空的
        initBackendSync();
    } else {
        console.log('🧭 [路由] 进入欢迎页（正常流程：欢迎页 → Start Journey → Dashboard → 点文章 → 阅读页）');
        showScreen('startingPage', { fromHistory: true });
    }
});