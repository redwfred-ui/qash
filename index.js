const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');
const cheerio = require('cheerio');

const BASE_URL = 'https://wwv.qeseh.com';
const SERIES_PATH = '/series/مسلسل-تاشاك-بو-الدنيز-مترجم/';

const manifest = {
    id: 'org.qeseh.tasacakbudeniz',
    version: '1.0.1',
    name: 'Taşacak Bu Deniz - قصة عشق',
    description: 'متابعة مسلسل هذا البحر سيفيض (Taşacak Bu Deniz) مترجم للعربية من موقع قصة عشق',
    resources: ['catalog', 'meta', 'stream'],
    types: ['series'],
    catalogs: [
        {
            type: 'series',
            id: 'qeseh_catalog',
            name: 'Taşacak Bu Deniz (هذا البحر سيفيض)'
        }
    ],
    idPrefixes: ['qeseh_']
};

const builder = new addonBuilder(manifest);

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': BASE_URL,
    'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8'
};

// 1. Catalog Handler
builder.defineCatalogHandler(async (args) => {
    if (args.type === 'series' && args.id === 'qeseh_catalog') {
        return {
            metas: [{
                id: 'qeseh_tasacak_bu_deniz',
                type: 'series',
                name: 'Taşacak Bu Deniz (هذا البحر سيفيض)',
                poster: 'https://wwv.qeseh.com/wp-content/uploads/2024/09/tasacak-bu-deniz.jpg',
                description: 'مسلسل هذا البحر سيفيض (Taşacak Bu Deniz) مترجم للعربية عبر موقع قصة عشق'
            }]
        };
    }
    return { metas: [] };
});

// 2. Meta Handler - ضمان ظهور الحلقات دائماً (مع نظام الاحتياط)
builder.defineMetaHandler(async (args) => {
    if (args.id !== 'qeseh_tasacak_bu_deniz') {
        return { meta: {} };
    }

    let videos = [];

    try {
        const targetUrl = BASE_URL + SERIES_PATH;
        const response = await axios.get(targetUrl, { headers: HEADERS, timeout: 8000 });
        const $ = cheerio.load(response.data);

        $('.episodes-list a, .EpisodesList a, a[href*="/episode/"], a[href*="حلقة"]').each((i, el) => {
            const href = $(el).attr('href');
            if (!href) return;

            const text = $(el).text().trim();
            const titleAttr = $(el).attr('title') || '';
            const combinedText = text ? text : titleAttr;

            let epNum = null;
            const matchText = combinedText.match(/الحلقة\s*(\d+)/i) || href.match(/حلقة-(\d+)/i) || href.match(/episode-(\d+)/i) || href.match(/-(\d+)\//);

            if (matchText && matchText[1]) {
                epNum = parseInt(matchText[1], 10);
            }

            if (epNum && !isNaN(epNum)) {
                let fullHref = href.startsWith('/') ? BASE_URL + href : href;
                const encodedUrl = Buffer.from(fullHref).toString('base64');
                
                videos.push({
                    id: 'qeseh_ep_' + epNum + ':' + encodedUrl,
                    title: 'الحلقة ' + epNum,
                    season: 1,
                    episode: epNum,
                    released: new Date().toISOString()
                });
            }
        });
    } catch (error) {
        console.error('Scraping error, using fallback episodes:', error.message);
    }

    // إذا فشل السحب أو لم يجد حلقات، يتم توليد الحلقات تلقائياً (من 1 إلى 30) لضمان عدم ظهور خطأ Metadata أبداً
    if (videos.length === 0) {
        for (let i = 1; i <= 30; i++) {
            const fallbackUrl = Buffer.from(BASE_URL + SERIES_PATH).toString('base64');
            videos.push({
                id: 'qeseh_ep_' + i + ':' + fallbackUrl,
                title: 'الحلقة ' + i,
                season: 1,
                episode: i,
                released: new Date().toISOString()
            });
        }
    }

    // إزالة التكرار وترتيب الحلقات
    const episodesMap = new Map();
    videos.forEach(v => {
        if (!episodesMap.has(v.episode)) {
            episodesMap.set(v.episode, v);
        }
    });

    const sortedVideos = Array.from(episodesMap.values()).sort((a, b) => a.episode - b.episode);

    return {
        meta: {
            id: 'qeseh_tasacak_bu_deniz',
            type: 'series',
            name: 'Taşacak Bu Deniz (هذا البحر سيفيض)',
            poster: 'https://wwv.qeseh.com/wp-content/uploads/2024/09/tasacak-bu-deniz.jpg',
            background: 'https://wwv.qeseh.com/wp-content/uploads/2024/09/tasacak-bu-deniz.jpg',
            description: 'جميع حلقات مسلسل هذا البحر سيفيض (Taşacak Bu Deniz) مترجمة للعربية من قصة عشق.',
            videos: sortedVideos
        }
    };
});

// 3. Stream Handler
builder.defineStreamHandler(async (args) => {
    if (!args.id || !args.id.startsWith('qeseh_ep_')) {
        return { streams: [] };
    }

    try {
        const parts = args.id.split(':');
        const base64Url = parts[1];
        const episodeUrl = Buffer.from(base64Url, 'base64').toString('utf-8');

        const response = await axios.get(episodeUrl, { headers: HEADERS, timeout: 8000 });
        const $ = cheerio.load(response.data);

        let iframeSrc = $('iframe').attr('src') || $('iframe[src*="embed"]').attr('src') || $('iframe[src*="player"]').attr('src');

        const streams = [];

        if (iframeSrc) {
            let finalIframe = iframeSrc.startsWith('//') ? 'https:' + iframeSrc : (iframeSrc.startsWith('/') ? BASE_URL + iframeSrc : iframeSrc);
            streams.push({
                title: 'مشاهدة عبر المشغل (قصة عشق)',
                externalUrl: finalIframe
            });
        }

        streams.push({
            title: 'فتح الحلقة على موقع قصة عشق مباشرة',
            externalUrl: episodeUrl
        });

        return { streams: streams };
    } catch (error) {
        return {
            streams: [{
                title: 'فتح المسلسل مباشرة على موقع قصة عشق',
                externalUrl: BASE_URL + SERIES_PATH
            }]
        };
    }
});

const PORT = process.env.PORT || 8080;
serveHTTP(builder.getInterface(), { port: PORT });
