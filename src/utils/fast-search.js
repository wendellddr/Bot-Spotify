const fetch = (typeof globalThis.fetch === 'function') ? globalThis.fetch : require('node-fetch');

class LRUCache {
    constructor(maxSize = 300) {
        this.maxSize = maxSize;
        this.cache = new Map();
    }
    get(key) {
        if (!this.cache.has(key)) return null;
        const value = this.cache.get(key);
        this.cache.delete(key);
        this.cache.set(key, value);
        return value;
    }
    set(key, value) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(key, value);
    }
}

const SEARCH_TTL = 15 * 60 * 1000; // 15 min
const searchCache = new LRUCache(400);

function cacheGet(key) {
    const it = searchCache.get(key);
    if (it && Date.now() < it.expiry) return it.data;
    return null;
}

function cacheSet(key, data) {
    searchCache.set(key, { data, expiry: Date.now() + SEARCH_TTL });
}

async function pipedQuickSearch(query) {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 3500);
    try {
        const endpoint = `https://piped.video/api/v1/search?q=${encodeURIComponent(query)}`;
        const res = await fetch(endpoint, { signal: ctrl.signal });
        if (!res.ok) return null;
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) return null;
        // Priorizar resultados com duração > 0 e tipo "stream"
        const sorted = data
            .filter(x => (x.type === 'stream' || x.type === 'video') && (x.duration || 0) > 0)
            .sort((a, b) => (b.views || 0) - (a.views || 0));
        if (sorted.length === 0) return null;
        const first = sorted[0];
        // Construir URL padrão do YouTube
        const url = first.url || (first.url && first.url.startsWith('http') ? first.url : (first.url || ''));
        const youtubeUrl = url && url.includes('http') ? url : (first?.url ?? `https://www.youtube.com/watch?v=${first?.url ?? first?.id ?? ''}`);
        return youtubeUrl;
    } catch (_) {
        return null;
    } finally {
        clearTimeout(timeout);
    }
}

async function fastSearchUrl(query) {
    const key = query.toLowerCase().trim();
    const cached = cacheGet(key);
    if (cached) return cached;
    // Piped primeiro
    const pipedUrl = await pipedQuickSearch(query);
    if (pipedUrl) {
        cacheSet(key, pipedUrl);
        return pipedUrl;
    }
    return null;
}

module.exports = { fastSearchUrl };


