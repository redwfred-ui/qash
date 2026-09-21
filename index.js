const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');
const cheerio = require('cheerio');

const BASE_URL = 'https://wwv.qeseh.com/yeni-show/tasacak-bu-deniz-mreku/';

// ترويسات متقدمة لمحاكاة متصفح حقيقي وتفادي الحظر
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'ar,en-US;q=0.7,en;q=0.3',
    'Referer': 'https://wwv.qeseh.com/'
};

// إنشاء العميل المخصص للطلبات مع Timeout لتفادي تعليق السيرفر
const httpClient = axios.create({
    headers: HEADERS,
    timeout: 12000
});

const builder = new addonBuilder({
    id: 'org.qeseh.tasacakbudeniz.pro',
    version: '2.0.0',
    name: 'مسلسل هذا البحر سيفيض - قصة عشق',
    description: 'إضافة احترافية لمتابعة جميع حلقات مسلسل هذا البحر سيفيض مترجمة',
    resources: ['catalog', 'meta', 'stream'],
    types: ['series'],
    catalogs: [
        {
            type: 'series',
            id: 'qeseh_turkish_catalog',
            name: 'مسلسلات تركية'
        }
    ]
});

// 1. الكتالوج
builder.defineCatalogHandler(async ({ type, id }) => {
    if (type === 'series' && id === 'qeseh_turkish_catalog') {
        return {
            metas: [
                {
                    id: 'qeseh_tasacak_bu_deniz',
                    type: 'series',
                    name: 'هذا البحر سيفيض (Taşacak Bu Deniz)',
                    poster: 'https://wwv.qeseh.com/wp-content/uploads/2024/09/tasacak-bu-deniz.jpg',
                    description: 'مسلسل دراما وتشويق تركي مترجم - قصة عشق'
                }
            ]
        };
    }
    return { metas: [] };
});

// 2. الميتا: استخراج وفلترة جميع الحلقات بدقة
builder.defineMetaHandler(async ({ id }) => {
    if (id !== 'qeseh_tasacak_bu_deniz') return { meta: null };

    try {
        const response = await httpClient.get(BASE_URL);
        const $ = cheerio.load(response.data);
        const episodesMap = new Map();

        $('a').each((_, el) => {
            const href = $(el).attr('href');
            const text = $(el).text().trim();

            if (href && (href.includes('tasacak-bu-deniz') || href.includes('qeseh'))) {
                // استخراج رقم الحلقة بدقة باستخدام Regex
                const match = text.match(/الحلقة\s*(\d+)/i) || href.match(/episode-(\d+)/i) || href.match(/-(\d+)\.html/i);
                
                if (match) {
                    const epNum = parseInt(match[1], 10);
                    if (!episodesMap.has(epNum)) {
                        episodesMap.set(epNum, {
                            id: `qeseh_ep_${epNum}:${Buffer.from(href).toString('base64')}`,
                            title: `الحلقة ${epNum}`,
                            season: 1,
                            episode: epNum
                        });
                    }
                }
            }
        });

        // ترتيب الحلقات تصاعدياً
        const videos = Array.from(episodesMap.values()).sort((a, b) => a.episode - b.episode);

        return {
            meta: {
                id: 'qeseh_tasacak_bu_deniz',
                type: 'series',
                name: 'هذا البحر سيفيض',
                poster: 'https://wwv.qeseh.com/wp-content/uploads/2024/09/tasacak-bu-deniz.jpg',
                background: 'https://wwv.qeseh.com/wp-content/uploads/2024/09/tasacak-bu-deniz.jpg',
                description: `تم إيجاد ${videos.length} حلقة مترجمة متوفرة.`,
                videos: videos
            }
        };
    } catch (error) {
        console.error('[Meta Handler Error]:', error.message);
        return { meta: null };
    }
});

// 3. الستريم: محاولة استخراج فيديو مباشر M3U8 مع خيار احتياطي للمتصفح
builder.defineStreamHandler(async ({ id }) => {
    if (!id.startsWith('qeseh_ep_')) return { streams: [] };

    try {
        const encodedUrl = id.split(':')[1];
        const epUrl = Buffer.from(encodedUrl, 'base64').toString('utf-8');

        const pageRes = await httpClient.get(epUrl);
        const $ = cheerio.load(pageRes.data);
        const streams = [];

        // أ) البحث عن رابط مباشر .m3u8 أو .mp4 داخل الصفحة
        const directMatch = pageRes.data.match(/(https?:\/\/[^"'s\s]+\.(m3u8|mp4)[^"'s\s]*)/i);
        if (directMatch) {
            streams.push({
                title: 'قصة عشق - بث مباشر (HLS/MP4)',
                url: directMatch[1]
            });
        }

        // ب) قراءة مشغل الـ Iframe واستخراج رابط الفيديو
        const iframeSrc = $('iframe').attr('src') \vert{}\vert{}$('iframe[src*="embed"]').attr('src');
        if (iframeSrc) {
            const fullIframeUrl = iframeSrc.startsWith('//') ? `https:${iframeSrc}` : iframeSrc;

            try {
                const iframeRes = await httpClient.get(fullIframeUrl, { 
                    headers: { ...HEADERS, Referer: epUrl } 
                });
                
                const m3u8Match = iframeRes.data.match(/(https?:\/\/[^"'s\s]+\.m3u8[^"'s\s]*)/i);

                if (m3u8Match) {
                    streams.push({
                        title: 'قصة عشق - مشغل HD المباشر',
                        url: m3u8Match[1],
                        behaviorHints: {
                            proxyHeaders: {
                                request: {
                                    "User-Agent": HEADERS['User-Agent'],
                                    "Referer": fullIframeUrl
                                }
                            }
                        }
                    });
                }
            } catch (iframeErr) {
                console.warn('[Iframe Extraction Warning]:', iframeErr.message);
            }

            // ج) الخيار الاحترافي الاحتياطي (الفتح في المتصفح إذا تعذر الاستخراج)
            streams.push({
                title: 'قصة عشق - فتح الحلقة في المتصفح الخارجي',
                externalUrl: fullIframeUrl
            });
        }

        return { streams };

    } catch (error) {
        console.error('[Stream Handler Error]:', error.message);
        return { streams: [] };
    }
});

const PORT = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port: PORT });const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');
const cheerio = require('cheerio');

const BASE_URL = 'https://wwv.qeseh.com/yeni-show/tasacak-bu-deniz-mreku/';

// ترويسات متقدمة لمحاكاة متصفح حقيقي وتفادي الحظر
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'ar,en-US;q=0.7,en;q=0.3',
    'Referer': 'https://wwv.qeseh.com/'
};

// إنشاء العميل المخصص للطلبات مع Timeout لتفادي تعليق السيرفر
const httpClient = axios.create({
    headers: HEADERS,
    timeout: 12000
});

const builder = new addonBuilder({
    id: 'org.qeseh.tasacakbudeniz.pro',
    version: '2.0.0',
    name: 'مسلسل هذا البحر سيفيض - قصة عشق',
    description: 'إضافة احترافية لمتابعة جميع حلقات مسلسل هذا البحر سيفيض مترجمة',
    resources: ['catalog', 'meta', 'stream'],
    types: ['series'],
    catalogs: [
        {
            type: 'series',
            id: 'qeseh_turkish_catalog',
            name: 'مسلسلات تركية'
        }
    ]
});

// 1. الكتالوج
builder.defineCatalogHandler(async ({ type, id }) => {
    if (type === 'series' && id === 'qeseh_turkish_catalog') {
        return {
            metas: [
                {
                    id: 'qeseh_tasacak_bu_deniz',
                    type: 'series',
                    name: 'هذا البحر سيفيض (Taşacak Bu Deniz)',
                    poster: 'https://wwv.qeseh.com/wp-content/uploads/2024/09/tasacak-bu-deniz.jpg',
                    description: 'مسلسل دراما وتشويق تركي مترجم - قصة عشق'
                }
            ]
        };
    }
    return { metas: [] };
});

// 2. الميتا: استخراج وفلترة جميع الحلقات بدقة
builder.defineMetaHandler(async ({ id }) => {
    if (id !== 'qeseh_tasacak_bu_deniz') return { meta: null };

    try {
        const response = await httpClient.get(BASE_URL);
        const $ = cheerio.load(response.data);
        const episodesMap = new Map();

        $('a').each((_, el) => {
            const href = $(el).attr('href');
            const text = $(el).text().trim();

            if (href && (href.includes('tasacak-bu-deniz') || href.includes('qeseh'))) {
                // استخراج رقم الحلقة بدقة باستخدام Regex
                const match = text.match(/الحلقة\s*(\d+)/i) || href.match(/episode-(\d+)/i) || href.match(/-(\d+)\.html/i);
                
                if (match) {
                    const epNum = parseInt(match[1], 10);
                    if (!episodesMap.has(epNum)) {
                        episodesMap.set(epNum, {
                            id: `qeseh_ep_${epNum}:${Buffer.from(href).toString('base64')}`,
                            title: `الحلقة ${epNum}`,
                            season: 1,
                            episode: epNum
                        });
                    }
                }
            }
        });

        // ترتيب الحلقات تصاعدياً
        const videos = Array.from(episodesMap.values()).sort((a, b) => a.episode - b.episode);

        return {
            meta: {
                id: 'qeseh_tasacak_bu_deniz',
                type: 'series',
                name: 'هذا البحر سيفيض',
                poster: 'https://wwv.qeseh.com/wp-content/uploads/2024/09/tasacak-bu-deniz.jpg',
                background: 'https://wwv.qeseh.com/wp-content/uploads/2024/09/tasacak-bu-deniz.jpg',
                description: `تم إيجاد ${videos.length} حلقة مترجمة متوفرة.`,
                videos: videos
            }
        };
    } catch (error) {
        console.error('[Meta Handler Error]:', error.message);
        return { meta: null };
    }
});

// 3. الستريم: محاولة استخراج فيديو مباشر M3U8 مع خيار احتياطي للمتصفح
builder.defineStreamHandler(async ({ id }) => {
    if (!id.startsWith('qeseh_ep_')) return { streams: [] };

    try {
        const encodedUrl = id.split(':')[1];
        const epUrl = Buffer.from(encodedUrl, 'base64').toString('utf-8');

        const pageRes = await httpClient.get(epUrl);
        const $ = cheerio.load(pageRes.data);
        const streams = [];

        // أ) البحث عن رابط مباشر .m3u8 أو .mp4 داخل الصفحة
        const directMatch = pageRes.data.match(/(https?:\/\/[^"'s\s]+\.(m3u8|mp4)[^"'s\s]*)/i);
        if (directMatch) {
            streams.push({
                title: 'قصة عشق - بث مباشر (HLS/MP4)',
                url: directMatch[1]
            });
        }

        // ب) قراءة مشغل الـ Iframe واستخراج رابط الفيديو
        const iframeSrc = $('iframe').attr('src') \vert{}\vert{}$('iframe[src*="embed"]').attr('src');
        if (iframeSrc) {
            const fullIframeUrl = iframeSrc.startsWith('//') ? `https:${iframeSrc}` : iframeSrc;

            try {
                const iframeRes = await httpClient.get(fullIframeUrl, { 
                    headers: { ...HEADERS, Referer: epUrl } 
                });
                
                const m3u8Match = iframeRes.data.match(/(https?:\/\/[^"'s\s]+\.m3u8[^"'s\s]*)/i);

                if (m3u8Match) {
                    streams.push({
                        title: 'قصة عشق - مشغل HD المباشر',
                        url: m3u8Match[1],
                        behaviorHints: {
                            proxyHeaders: {
                                request: {
                                    "User-Agent": HEADERS['User-Agent'],
                                    "Referer": fullIframeUrl
                                }
                            }
                        }
                    });
                }
            } catch (iframeErr) {
                console.warn('[Iframe Extraction Warning]:', iframeErr.message);
            }

            // ج) الخيار الاحترافي الاحتياطي (الفتح في المتصفح إذا تعذر الاستخراج)
            streams.push({
                title: 'قصة عشق - فتح الحلقة في المتصفح الخارجي',
                externalUrl: fullIframeUrl
            });
        }

        return { streams };

    } catch (error) {
        console.error('[Stream Handler Error]:', error.message);
        return { streams: [] };
    }
});

const PORT = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port: PORT });
