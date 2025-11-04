const { BaseExtractor } = require('discord-player');
const { spawn } = require('child_process');
const { Readable } = require('stream');
// Usar fetch nativo se disponível
const fetch = (typeof globalThis.fetch === 'function') ? globalThis.fetch : require('node-fetch');
const path = require('path');
const fs = require('fs');

// Timeouts e constantes
const YTDLP_TIMEOUT = 10000; // 10 segundos (otimizado para performance)
const YTDLP_SEARCH_TIMEOUT = 5000; // 5 segundos para buscas (mais agressivo)
const SEARCH_CACHE_TTL = 30 * 60 * 1000; // 30 minutos (cache mais longo)
const VIDEO_INFO_CACHE_TTL = 60 * 60 * 1000; // 1 hora para informações de vídeo (raramente mudam)

// Cache de buscas do YouTube (LRU simples)
class LRUCache {
    constructor(maxSize = 200) {
        this.maxSize = maxSize;
        this.cache = new Map();
    }
    
    get(key) {
        if (!this.cache.has(key)) return null;
        const value = this.cache.get(key);
        // Mover para o final (mais recente)
        this.cache.delete(key);
        this.cache.set(key, value);
        return value;
    }
    
    set(key, value) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.maxSize) {
            // Remover o mais antigo (primeiro item)
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(key, value);
    }
    
    size() {
        return this.cache.size;
    }
}

const youtubeSearchCache = new LRUCache(300); // Cache maior para buscas
const videoInfoCache = new LRUCache(200); // Cache para informações de vídeo
const streamUrlCache = new LRUCache(300); // Cache para URLs de stream (warmup)
const STREAM_URL_TTL = 10 * 60 * 1000; // 10 minutos

function getCachedStreamUrl(url) {
    const cached = streamUrlCache.get(url);
    if (cached && Date.now() < cached.expiry) {
        return cached.url;
    }
    return null;
}

function extractYouTubeId(url) {
    try {
        const u = new URL(url);
        if (u.hostname.includes('youtu.be')) return u.pathname.slice(1);
        if (u.searchParams.get('v')) return u.searchParams.get('v');
        const parts = u.pathname.split('/');
        const idx = parts.indexOf('watch');
        if (idx >= 0 && u.searchParams.get('v')) return u.searchParams.get('v');
        return null;
    } catch (_) {
        return null;
    }
}

async function fetchPipedStream(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
        const endpoint = `https://piped.video/api/v1/streams?url=${encodeURIComponent(url)}`;
        const res = await fetch(endpoint, { signal: controller.signal });
        if (!res.ok) return null;
        const data = await res.json();
        const streams = data?.audioStreams || [];
        if (!Array.isArray(streams) || streams.length === 0) return null;
        // Prefer m4a > webm, maior bitrate primeiro
        streams.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
        const preferred = streams.find(s => (s.mimeType || '').includes('mp4')) || streams[0];
        return preferred?.url || null;
    } catch (_) {
        return null;
    } finally {
        clearTimeout(timeout);
    }
}

function ytdlpStreamUrl(ytdlpPath, url) {
    return new Promise((resolve) => {
        const ytdlp = spawn(ytdlpPath, [
            '-f', 'bestaudio[ext=m4a][filesize<50M]/bestaudio[ext=webm][filesize<50M]/bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best',
            '-g',
            '--no-playlist',
            '--no-warnings',
            '--no-cache-dir',
            '--quiet',
            '--no-check-certificate',
            '--force-ipv4',
            '--socket-timeout', '5',
            '--fragment-retries', '1',
            '--retries', '1',
            '--ignore-errors',
            '--prefer-free-formats',
            '--hls-prefer-native',
            '--no-mtime',
            '--no-write-thumbnail',
            '--no-write-info-json',
            '--extractor-args', 'youtube:player_client=android,web',
            url
        ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });

        let out = '';
        const killTimer = setTimeout(() => { try { ytdlp.kill(); } catch (_) {} }, 7000);
        ytdlp.stdout.on('data', d => { out += d.toString(); });
        ytdlp.on('close', () => {
            clearTimeout(killTimer);
            const line = out.trim().split(/\r?\n/).find(Boolean);
            resolve(line || null);
        });
        ytdlp.on('error', () => resolve(null));
    });
}

async function resolveStreamUrl(ytdlpPath, url) {
    const cached = getCachedStreamUrl(url);
    if (cached) return cached;
    // Correr em paralelo: Piped e yt-dlp; o primeiro a responder vence
    const start = Date.now();
    const winner = await Promise.race([
        fetchPipedStream(url),
        ytdlpStreamUrl(ytdlpPath, url)
    ]);
    if (winner) {
        streamUrlCache.set(url, { url: winner, expiry: Date.now() + STREAM_URL_TTL });
        if (process.env.DEBUG === 'true') {
            console.log(`   ⚡ [RACE] Stream resolvida em ${(Date.now() - start)}ms`);
        }
        return winner;
    }
    // Se nenhum venceu dentro do prazo, tenta fallback final com yt-dlp normal (bloqueante curto)
    const fallback = await ytdlpStreamUrl(ytdlpPath, url);
    if (fallback) {
        streamUrlCache.set(url, { url: fallback, expiry: Date.now() + STREAM_URL_TTL });
    }
    return fallback;
}

class YouTubeExtractor extends BaseExtractor {
    static identifier = 'com.custom.youtube-extractor';
    
    constructor() {
        super();
        // Tentar encontrar yt-dlp
        this.ytdlpPath = this.findYtDlp();
    }
    
    findYtDlp() {
        // Verificar se yt-dlp.exe está no diretório local
        const localPath = path.join(__dirname, 'yt-dlp.exe');
        if (fs.existsSync(localPath)) {
            if (process.env.DEBUG === 'true') {
                console.log('✅ yt-dlp encontrado localmente');
            }
            return localPath;
        }
        
        // Tentar no PATH do sistema
        if (process.env.DEBUG === 'true') {
            console.log('⚠️ yt-dlp.exe não encontrado localmente, tentando PATH do sistema');
        }
        return 'yt-dlp';
    }
    
    async validate(query, type) {
        // Aceitar URLs do YouTube e buscas de texto
        if (typeof query !== 'string') return false;
        // Se for URL do YouTube, aceitar
        if (/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)/.test(query)) return true;
        // Se for busca de texto (AUTO ou texto simples), aceitar
        if (type === 'AUTO' || !query.startsWith('http')) return true;
        return false;
    }
    
    async handle(query, context) {
        try {
            // Se for uma busca, primeiro obter URL do YouTube
            let videoUrl = query;
            if (!/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)/.test(query)) {
                videoUrl = await this.searchYouTube(query);
                if (!videoUrl) {
                    return this.emptyResponse();
                }
            }
            
            // Obter informações do vídeo usando yt-dlp
            const videoInfo = await this.getVideoInfo(videoUrl);
            if (!videoInfo) {
                return this.emptyResponse();
            }
            
            // Criar Track usando o BaseExtractor
            // IMPORTANTE: usar videoUrl original, não streamUrl!
            const Track = require('discord-player').Track;
            const track = new Track(context.player, {
                title: videoInfo.title,
                author: videoInfo.uploader || 'Unknown Artist',
                url: videoUrl,  // URL original do YouTube, não streamUrl
                duration: this.parseDuration(videoInfo.duration),
                thumbnail: videoInfo.thumbnail,
                views: videoInfo.view_count || 0,
                requestedBy: context.requestedBy,
                source: 'youtube'
            });
            
            return {
                loadType: 'TRACK_LOADED',
                tracks: [track]
            };
        } catch (error) {
            // Log apenas erros importantes
            if (!error.message?.includes('Timeout')) {
                console.error('❌ YouTube Extractor: Erro ao processar:', error.message);
            }
            return this.emptyResponse();
        }
    }
    
    async stream(track) {
        try {
            const streamStartTime = Date.now();
            console.log(`   ⏱️  [TIMING] Obtendo stream URL para: "${track.title}"`);
            
            // Tentar cache primeiro
            const cached = getCachedStreamUrl(track.url);
            let stream;
            if (cached) {
                console.log('   ⚡ [CACHE] Usando stream URL em cache');
                stream = cached;
            } else {
                // Usar yt-dlp para obter stream direto
                stream = await this.getAudioStream(track.url);
                // Armazenar no cache
                streamUrlCache.set(track.url, { url: stream, expiry: Date.now() + STREAM_URL_TTL });
            }
            
            const streamTime = ((Date.now() - streamStartTime) / 1000).toFixed(2);
            console.log(`   ⏱️  [TIMING] Stream URL obtida: ${streamTime}s`);
            
            return stream;
        } catch (error) {
            // Re-throw para que o discord-player possa tratar
            throw error;
        }
    }
    
    async searchYouTube(query) {
        // Verificar cache primeiro
        const cacheKey = query.toLowerCase().trim();
        const cached = youtubeSearchCache.get(cacheKey);
        if (cached && Date.now() < cached.expiry) {
            return cached.url;
        }

        // Usar yt-dlp para buscar no YouTube
        return new Promise((resolve, reject) => {
            // yt-dlp pode buscar usando "ytsearch:query"
            const searchQuery = `ytsearch1:${query}`;
            const ytdlp = spawn(this.ytdlpPath, [
                '--dump-json',
                '--no-playlist',
                '--no-warnings',
                '--no-cache-dir',
                '--skip-download',
                '--quiet',
                '--no-check-certificate',
                '--socket-timeout', '5',
                '--fragment-retries', '1',
                '--retries', '1',
                '--ignore-errors',
                '--no-mtime',
                '--no-write-thumbnail',
                '--no-write-info-json',
                '--no-write-description',
                '--no-write-annotations',
                '--extractor-args', 'youtube:player_client=android,web',
                '--default-search', 'auto',
                searchQuery
            ], {
                stdio: ['ignore', 'pipe', 'pipe'],
                windowsHide: true
            });
            
            let output = '';
            let hasResolved = false;
            
            // Timeout otimizado para buscas (mais rápido)
            const timeout = setTimeout(() => {
                if (!hasResolved) {
                    hasResolved = true;
                    ytdlp.kill();
                    resolve(null);
                }
            }, YTDLP_SEARCH_TIMEOUT);
            
            ytdlp.stdout.on('data', (data) => {
                output += data.toString();
            });
            
            ytdlp.stderr.on('data', (data) => {
                // Ignorar warnings do yt-dlp em stderr
            });
            
            ytdlp.on('close', (code) => {
                if (hasResolved) return;
                
                clearTimeout(timeout);
                if (code === 0) {
                    try {
                        const info = JSON.parse(output);
                        if (info && info.webpage_url) {
                            // Armazenar no cache
                            youtubeSearchCache.set(cacheKey, {
                                url: info.webpage_url,
                                expiry: Date.now() + SEARCH_CACHE_TTL
                            });
                            
                            // Cache LRU gerencia automaticamente o tamanho
                            
                            resolve(info.webpage_url);
                        } else {
                            resolve(null);
                        }
                    } catch (error) {
                        resolve(null);
                    }
                } else {
                    resolve(null);
                }
                hasResolved = true;
            });
            
            ytdlp.on('error', (error) => {
                if (hasResolved) return;
                clearTimeout(timeout);
                hasResolved = true;
                resolve(null);
            });
        });
    }
    
    getVideoInfo(url) {
        // Verificar cache primeiro
        const cached = videoInfoCache.get(url);
        if (cached && Date.now() < cached.expiry) {
            return Promise.resolve(cached.data);
        }

        return new Promise((resolve, reject) => {
            const ytdlp = spawn(this.ytdlpPath, [
                '--dump-json',
                '--no-playlist',
                '--no-warnings',
                '--no-cache-dir',
                '--skip-download',
                '--quiet',
                '--no-check-certificate',
                '--socket-timeout', '10',
                '--fragment-retries', '3',
                '--retries', '2',
                '--ignore-errors',
                '--no-write-info-json',
                url
            ], {
                stdio: ['ignore', 'pipe', 'pipe']
            });
            
            let output = '';
            let hasResolved = false;
            
            // Timeout para evitar processos travados
            const timeout = setTimeout(() => {
                if (!hasResolved) {
                    hasResolved = true;
                    ytdlp.kill();
                    reject(new Error('Timeout ao obter informações do vídeo'));
                }
            }, YTDLP_TIMEOUT);
            
            ytdlp.stdout.on('data', (data) => {
                output += data.toString();
            });
            
            ytdlp.stderr.on('data', (data) => {
                // Ignorar warnings do yt-dlp em stderr
            });
            
            ytdlp.on('close', (code) => {
                if (hasResolved) return;
                
                clearTimeout(timeout);
                if (code === 0) {
                    try {
                        const info = JSON.parse(output);
                        const videoInfo = {
                            title: info.title,
                            uploader: info.uploader,
                            url: info.url || info.webpage_url || url,
                            duration: info.duration,
                            thumbnail: info.thumbnail,
                            view_count: info.view_count
                        };
                        
                        // Armazenar no cache (TTL mais longo para info de vídeo)
                        videoInfoCache.set(url, {
                            data: videoInfo,
                            expiry: Date.now() + VIDEO_INFO_CACHE_TTL
                        });
                        
                        // Cache LRU gerencia automaticamente o tamanho
                        
                        resolve(videoInfo);
                    } catch (error) {
                        reject(new Error('Erro ao parsear JSON'));
                    }
                } else {
                    reject(new Error(`yt-dlp exited with code ${code}`));
                }
                hasResolved = true;
            });
            
            ytdlp.on('error', (error) => {
                if (hasResolved) return;
                clearTimeout(timeout);
                hasResolved = true;
                reject(new Error(`yt-dlp não encontrado: ${error.message}`));
            });
        });
    }
    
    async getAudioStream(url) {
        // Resolve usando corrida Piped vs yt-dlp e cacheia o resultado
        const start = Date.now();
        const resolved = await resolveStreamUrl(this.ytdlpPath, url);
        if (!resolved) {
            throw new Error('Não foi possível obter URL de stream');
        }
        const took = ((Date.now() - start) / 1000).toFixed(2);
        console.log(`   ⏱️  [TIMING] Stream URL resolvida: ${took}s`);
        return resolved;
    }
    
    parseDuration(duration) {
        // Discord-player espera string no formato "MM:SS" ou "HH:MM:SS"
        if (typeof duration === 'number') {
            // Converter segundos para "MM:SS"
            const mins = Math.floor(duration / 60);
            const secs = duration % 60;
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        }
        if (typeof duration === 'string') {
            // Se já está no formato correto, retornar como está
            if (duration.includes(':')) {
                return duration;
            }
            // Se é número como string, converter
            const seconds = parseInt(duration);
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        }
        return '0:00';
    }
    
    emptyResponse() {
        return {
            loadType: 'NO_MATCHES',
            tracks: []
        };
    }
}

async function prefetchStreamUrl(url) {
    try {
        if (getCachedStreamUrl(url)) return getCachedStreamUrl(url);
        const extractor = new YouTubeExtractor();
        const stream = await extractor.getAudioStream(url);
        streamUrlCache.set(url, { url: stream, expiry: Date.now() + STREAM_URL_TTL });
        return stream;
    } catch (_) {
        return null;
    }
}

module.exports = { YouTubeExtractor, prefetchStreamUrl, getCachedStreamUrl };

