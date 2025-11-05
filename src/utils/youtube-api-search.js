// YouTube Data API v3 Search - Busca rápida sem scraping
const fetch = require('node-fetch');

// Cache para buscas da API (evitar gastar quota)
const apiSearchCache = new Map();
const API_CACHE_TTL = 30 * 60 * 1000; // 30 minutos

/**
 * Busca no YouTube usando a API oficial (YouTube Data API v3)
 * Muito mais rápido que yt-dlp (100-500ms vs 2-8s)
 * 
 * @param {string} query - Query de busca
 * @param {string} apiKey - YouTube Data API v3 Key
 * @param {number} maxResults - Número máximo de resultados (padrão: 1)
 * @returns {Promise<{url: string, title: string, thumbnail: string, duration: number} | Array | null>}
 */
async function searchYouTubeAPI(query, apiKey, maxResults = 1) {
    if (!apiKey) return null;

    const cacheKey = `${query.toLowerCase().trim()}_${maxResults}`;
    const cached = apiSearchCache.get(cacheKey);
    if (cached && Date.now() < cached.expiry) {
        return cached.result;
    }

    try {
        // Remover videoCategoryId para ter mais diversidade de resultados
        // Isso permite buscar músicas de vários artistas, não apenas uma categoria específica
        const searchUrl = `https://www.googleapis.com/youtube/v3/search?` +
            `q=${encodeURIComponent(query)}&` +
            `key=${apiKey}&` +
            `part=snippet&` +
            `type=video&` +
            `maxResults=${Math.min(maxResults, 10)}&` +
            `order=relevance`;
        
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Request timeout')), 3000)
        );
        
        const response = await Promise.race([
            fetch(searchUrl, { headers: { 'Accept': 'application/json' } }),
            timeoutPromise
        ]);

        const data = await response.json();
        if (data.error || !data.items?.length) return null;

        // Se maxResults = 1, retornar objeto único (compatibilidade)
        if (maxResults === 1) {
            const video = data.items[0];
            const videoId = video.id.videoId;
            
            const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?` +
                `id=${videoId}&` +
                `key=${apiKey}&` +
                `part=contentDetails,snippet,statistics`;
            
            const detailsStart = Date.now();
            const detailsTimeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Request timeout')), 3000)
            );
            
            const detailsResponse = await Promise.race([
                fetch(detailsUrl, { headers: { 'Accept': 'application/json' } }),
                detailsTimeoutPromise
            ]);
            const detailsEnd = Date.now();
            console.log(`⏱️ [TIMING] YouTube API - Details request: ${detailsEnd - detailsStart}ms`);

            const detailsParseStart = Date.now();
            const detailsData = await detailsResponse.json();
            const detailsParseEnd = Date.now();
            console.log(`⏱️ [TIMING] YouTube API - Details parse JSON: ${detailsParseEnd - detailsParseStart}ms`);
            
            let result;
            if (detailsData.error || !detailsData.items?.length) {
                result = {
                    url: `https://www.youtube.com/watch?v=${videoId}`,
                    title: video.snippet.title,
                    thumbnail: video.snippet.thumbnails?.default?.url || video.snippet.thumbnails?.medium?.url || '',
                    duration: 0,
                    uploader: video.snippet.channelTitle,
                    viewCount: 0
                };
            } else {
                const videoDetails = detailsData.items[0];
                const durationStr = videoDetails.contentDetails?.duration || 'PT0S';
                result = {
                    url: `https://www.youtube.com/watch?v=${videoId}`,
                    title: video.snippet.title,
                    thumbnail: video.snippet.thumbnails?.high?.url || video.snippet.thumbnails?.default?.url || '',
                    duration: parseISO8601Duration(durationStr),
                    uploader: video.snippet.channelTitle,
                    viewCount: parseInt(videoDetails.statistics?.viewCount || 0)
                };
            }

            apiSearchCache.set(cacheKey, {
                result,
                expiry: Date.now() + API_CACHE_TTL
            });

            const apiEnd = Date.now();
            console.log(`⏱️ [TIMING] YouTube API - TOTAL (1 resultado): ${apiEnd - apiStart}ms`);
            return result;
        }

        // Se maxResults > 1, retornar array de resultados
        const videoIds = data.items.map(item => item.id.videoId).join(',');
        
        const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?` +
            `id=${videoIds}&` +
            `key=${apiKey}&` +
            `part=contentDetails,snippet,statistics`;
        
        const detailsStart = Date.now();
        const detailsTimeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Request timeout')), 5000)
        );
        
        const detailsResponse = await Promise.race([
            fetch(detailsUrl, { headers: { 'Accept': 'application/json' } }),
            detailsTimeoutPromise
        ]);
        const detailsEnd = Date.now();
        console.log(`⏱️ [TIMING] YouTube API - Details request (múltiplos): ${detailsEnd - detailsStart}ms`);

        const detailsParseStart = Date.now();
        const detailsData = await detailsResponse.json();
        const detailsParseEnd = Date.now();
        console.log(`⏱️ [TIMING] YouTube API - Details parse JSON (múltiplos): ${detailsParseEnd - detailsParseStart}ms`);
        
        const results = [];
        if (detailsData.items && detailsData.items.length > 0) {
            for (let i = 0; i < data.items.length; i++) {
                const video = data.items[i];
                const videoDetails = detailsData.items.find(item => item.id === video.id.videoId);
                
                if (videoDetails) {
                    const durationStr = videoDetails.contentDetails?.duration || 'PT0S';
                    results.push({
                        url: `https://www.youtube.com/watch?v=${video.id.videoId}`,
                        title: video.snippet.title,
                        thumbnail: video.snippet.thumbnails?.high?.url || video.snippet.thumbnails?.default?.url || '',
                        duration: parseISO8601Duration(durationStr),
                        uploader: video.snippet.channelTitle,
                        viewCount: parseInt(videoDetails.statistics?.viewCount || 0)
                    });
                } else {
                    // Fallback se não tiver detalhes
                    results.push({
                        url: `https://www.youtube.com/watch?v=${video.id.videoId}`,
                        title: video.snippet.title,
                        thumbnail: video.snippet.thumbnails?.default?.url || video.snippet.thumbnails?.medium?.url || '',
                        duration: 0,
                        uploader: video.snippet.channelTitle,
                        viewCount: 0
                    });
                }
            }
        }

        apiSearchCache.set(cacheKey, {
            result: results,
            expiry: Date.now() + API_CACHE_TTL
        });

        const apiEnd = Date.now();
        console.log(`⏱️ [TIMING] YouTube API - TOTAL (${results.length} resultados): ${apiEnd - apiStart}ms`);
        return results;
    } catch (error) {
        console.error(`⏱️ [TIMING] YouTube API - ERRO: ${error.message}`);
        return null;
    }
}

/**
 * Parseia duração ISO 8601 (PT4M13S) para segundos
 * @param {string} duration - Duração no formato ISO 8601
 * @returns {number} - Duração em segundos
 */
function parseISO8601Duration(duration) {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    
    const hours = parseInt(match[1] || 0);
    const minutes = parseInt(match[2] || 0);
    const seconds = parseInt(match[3] || 0);
    
    return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Limpa o cache da API (útil para testes)
 */
function clearAPICache() {
    apiSearchCache.clear();
}

module.exports = {
    searchYouTubeAPI,
    clearAPICache
};

