const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');
const cheerio = require('cheerio');

const BASE_URL = 'https://wwv.qeseh.com';
const SERIES_PATH = '/series/مسلسل-تاشاك-بو-الدنيز-مترجم/';

const builder = new addonBuilder({
    id: 'org.qeseh.tasacakbudeniz',
    version: '1.0.0',
    name: 'Taşacak Bu Deniz - قصة عشق',
    description: 'متابعة مسلسل Taşacak Bu Deniz مترجم للعربية من موقع قصة عشق',
    resources: ['catalog', 'meta', 'stream'],
    types: ['series'],
    catalogs: [
        {
            type: 'series',
            id: 'qeseh_catalog',
            name: 'Taşacak Bu Deniz'
        }
    ]
});

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': BASE_URL
};

// 1. Catalog Handler
builder.defineCatalogHandler(async (args) => {
    if (args.id === 'qeseh_catalog') {
        return {
            metas: [{
                id: 'qeseh_tasacak_bu_deniz',
                type: 'series',
                name: 'Taşacak Bu Deniz',
                poster: 'https://wwv.qeseh.com/wp-content/uploads/2024/09/tasacak-bu-deniz.jpg',
                description: 'مسلسل Taşacak Bu Deniz مترجم عبر قصة عشق'
            }]
        };
    }
    return { metas: [] };
});

// 2. Meta Handler (Fetches episodes dynamically)
builder.defineMetaHandler(async (args) => {
    if (args.id !== 'qeseh_tasacak_bu_deniz') return { meta: {} };

    try {
        const { data } = await axios.get(`${BASE_URL}${SERIES_PATH}`, { headers: HEADERS });
        const $ = cheerio.load(data);
        const videos = [];

        $('.episodes-list a, .EpisodesList a, a[href*="/episode/"]').each((i, el) => {
            const href = $(el).attr('href');
            const titleText = $(el).text().trim() \vert{}\vert{}$(el).attr('title') || '';
            const epMatch = titleText.match(/الحلقة\s*(\d+)/i) || href.match(/حلقة-(\d+)/i) || href.match(/episode-(\d+)/i);

            if (epMatch && href) {
                const epNum = parseInt(epMatch[1], 10);
                videos.push({
                    id: `qeseh_ep_${epNum}:${Buffer.from(href).toString('base64')}`,
                    title: `الحلقة ${epNum}`,
                    season: 1,
                    episode: epNum,
                    released: new Date().toISOString()
                });
            }
        });

        // Deduplicate and sort episodes
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
                name: 'Taşacak Bu Deniz',
                poster: 'https://wwv.qeseh.com/wp-content/uploads/2024/09/tasacak-bu-deniz.jpg',
                background: 'https://wwv.qeseh.com/wp-content/uploads/2024/09/tasacak-bu-deniz.jpg',
                description: 'جميع حلقات مسلسل Taşacak Bu Deniz مترجمة للعربية.',
                videos: sortedVideos
            }
        };
    } catch (error) {
        console.error('Error fetching meta:', error.message);
        return { meta: {} };
    }
});

// 3. Stream Handler (Scrapes iframe & player links)
builder.defineStreamHandler(async (args) => {
    if (!args.id.startsWith('qeseh_ep_')) return { streams: [] };

    try {
        const [_, base64Url] = args.id.split(':');
        const episodeUrl = Buffer.from(base64Url, 'base64').toString('utf-8');

        const { data } = await axios.get(episodeUrl, { headers: HEADERS });
        const $ = cheerio.load(data);

        // Corrected Line 128 (using Standard Logical OR ||)
        const iframeSrc = $('iframe').attr('src') \vert{}\vert{}$('iframe[src*="embed"]').attr('src');

        if (iframeSrc) {
            const finalIframe = iframeSrc.startsWith('//') ? `https:${iframeSrc}` : iframeSrc;

            return {
                streams: [
                    {
                        title: 'مشاهدة عبر المشغل الخارجي (قائم)',
                        externalUrl: finalIframe
                    }
                ]
            };
        }

        return {
            streams: [
                {
                    title: 'فتح الحلقة على موقع قصة عشق',
                    externalUrl: episodeUrl
                }
            ]
        };
    } catch (error) {
        console.error('Error fetching stream:', error.message);
        return { streams: [] };
    }
});

const PORT = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port: PORT });
