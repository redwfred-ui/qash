const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');
const cheerio = require('cheerio');

const BASE_URL = 'https://wwv.qeseh.com';
const SERIES_PATH = '/series/مسلسل-تاشاك-بو-الدنيز-مترجم/';

const manifest = {
    id: 'org.qeseh.tasacakbudeniz',
    version: '1.0.0',
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

// 1. Catalog Handler - إظهار المسلسل في القائمة
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

// 2. Meta Handler - جلب الحلقات وتفاصيل المسلسل
builder.defineMetaHandler(async (args) => {
    if (args.id !== 'qeseh_tasacak_bu_deniz') {
        return { meta: {} };
    }

    try {
        const targetUrl = BASE_URL + SERIES_PATH;
        const response = await axios.get(targetUrl, { headers: HEADERS, timeout: 10000 });
        const $ = cheerio.load(response.data);
        const videos = [];

        $('.episodes-list a, .EpisodesList a, a[href*="/episode/"], a[href*="حلقة"]').each((i, el) => {
            const href = $(el).attr('href');
            if (!href) return;

            const text = $(el).text().trim();
            const titleAttr = $(el).attr('title') || '';
            const combinedText = text ? text : titleAttr;

            // استخراج رقم الحلقة
            let epNum = null;
            const matchText = combinedText.match(/الحلقة\s*(\d+)/i) || href.match(/حلقة-(\d+)/i) || href.match(/episode-(\d+)/i) || href.match(/-(\d+)\//);

            if (matchText && matchText[1]) {
                epNum = parseInt(matchText[1], 10);
            }

            if (epNum && !isNaN(epNum)) {
                let fullHref = href;
                if (href.startsWith('/')) {
                    fullHref = BASE_URL + href;
                }

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

        // إزالة التكرار وترتيب الحلقات تصاعدياً
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
    } catch (error) {
        console.error('Error fetching meta:', error.message);
        return { meta: {} };
    }
});

// 3. Stream Handler - استخراج مشغلات الفيديو
builder.defineStreamHandler(async (args) => {
    if (!args.id || !args.id.startsWith('qeseh_ep_')) {
        return { streams: [] };
    }

    try {
        const parts = args.id.split(':');
        if (parts.length < 2) return { streams: [] };

        const base64Url = parts[1];
        const episodeUrl = Buffer.from(base64Url, 'base64').toString('utf-8');

        const response = await axios.get(episodeUrl, { headers: HEADERS, timeout: 10000 });
        const $ = cheerio.load(response.data);

        // البحث عن رابط المشغل (iframe)
        let iframeSrc = $('iframe').attr('src');
        if (!iframeSrc) {
            iframeSrc = $('iframe[src*="embed"]').attr('src');
        }
        if (!iframeSrc) {
            iframeSrc = $('iframe[src*="player"]').attr('src');
        }

        const streams = [];

        if (iframeSrc) {
            let finalIframe = iframeSrc;
            if (iframeSrc.startsWith('//')) {
                finalIframe = 'https:' + iframeSrc;
            } else if (iframeSrc.startsWith('/')) {
                finalIframe = BASE_URL + iframeSrc;
            }

            streams.push({
                title: 'مشاهدة عبر المشغل (قصة عشق)',
                externalUrl: finalIframe
            });
        }

        // خيار احتياطي دائماً لتمرير رابط الحلقة المباشر
        streams.push({
            title: 'فتح الحلقة على موقع قصة عشق مباشرة',
            externalUrl: episodeUrl
        });

        return { streams: streams };
    } catch (error) {
        console.error('Error fetching stream:', error.message);
        return { streams: [] };
    }
});

const PORT = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port: PORT });
