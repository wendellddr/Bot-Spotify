const { BaseExtractor } = require('discord-player');
const { spawn } = require('child_process');
const { Readable } = require('stream');
const path = require('path');
const fs = require('fs');
const { searchYouTubeAPI } = require('./youtube-api-search');

const YTDLP_TIMEOUT = 10000;
const SEARCH_CACHE_TTL = 30 * 60 * 1000;
const PREHEAT_STREAM_TTL = 5 * 60 * 1000; // 5 minutos
const searchCache = new Map();

// Cache de streams pré-aquecidos: url -> { stream, expiry }
const preheatedStreams = new Map();

class YouTubeExtractor extends BaseExtractor {
    static identifier = 'com.custom.youtube-extractor';
    
    constructor() {
        super();
        this.ytdlpPath = this.findYtDlp();
    }
    
    // Pré-aquecer stream em background (não bloqueia)
    preheatStream(url) {
        if (!url) return;
        
        // Verificar cache primeiro (evita criar stream duplicado) - SEM LOGS (rápido)
        const cached = preheatedStreams.get(url);
        if (cached && Date.now() < cached.expiry) {
            // Stream já está pré-aquecido e válido
            return;
        }
        
        try {
            // Criar stream em background (não bloqueia) - SEM LOGS durante criação
            const stream = this.getStreamDirect(url);
            
            // Armazenar no cache com timestamp de criação
            preheatedStreams.set(url, {
                stream: stream,
                expiry: Date.now() + PREHEAT_STREAM_TTL,
                createdAt: Date.now() // Timestamp para calcular economia de tempo
            });
            
            // Logs apenas em background (não bloqueia)
            setImmediate(() => {
                console.log(`✅ [PREHEAT] Stream pré-aquecido: ${url.substring(0, 50)}...`);
            });
            
            // Limpar quando stream terminar ou der erro (sem logs excessivos)
            stream.on('end', () => {
                preheatedStreams.delete(url);
            });
            
            stream.on('error', () => {
                preheatedStreams.delete(url);
            });
            
            // Permitir que o stream comece a baixar dados em background
            // Não precisa aguardar - o stream já está iniciado
        } catch (error) {
            // Erro silencioso - não é crítico para pré-aquecimento
        }
    }
    
    // Limpar streams pré-aquecidos antigos
    cleanupPreheatedStreams() {
        const now = Date.now();
        for (const [url, cached] of preheatedStreams.entries()) {
            if (now >= cached.expiry) {
                try {
                    if (!cached.stream.destroyed) {
                        cached.stream.destroy();
                    }
                } catch {}
                preheatedStreams.delete(url);
            }
        }
    }
    
    findYtDlp() {
        // Verificar se yt-dlp.exe está no diretório local
        const localPath = path.join(__dirname, '..', '..', 'bin', 'yt-dlp.exe');
        if (fs.existsSync(localPath)) {
            return localPath;
        }
        
        // Tentar no diretório atual
        const localPath2 = path.join(__dirname, 'yt-dlp.exe');
        if (fs.existsSync(localPath2)) {
            return localPath2;
        }
        
        // Tentar no PATH do sistema
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
            const handleStart = Date.now();
            console.log(`⏱️ [TIMING] Extractor.handle - Iniciado: "${query.substring(0, 50)}"`);
            
            const Track = require('discord-player').Track;
            const isUrl = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)/.test(query);
            
            // Se for busca (não URL), usar API diretamente (mais rápido)
            // Retornar múltiplos resultados para permitir seleção
            if (!isUrl) {
                const searchStart = Date.now();
                const searchResults = await this.searchAndGetInfo(query, 10); // Buscar até 10 resultados
                const searchEnd = Date.now();
                console.log(`⏱️ [TIMING] Extractor.handle - searchAndGetInfo: ${searchEnd - searchStart}ms`);
                
                if (!searchResults) {
                    return this.emptyResponse();
                }

                // Se for array (múltiplos resultados)
                if (Array.isArray(searchResults)) {
                    const tracksStart = Date.now();
                    const tracks = searchResults.map(result => {
                        // ⚡ PRÉ-AQUECER: Iniciar stream em background para TODAS as opções
                        this.preheatStream(result.url);
                        
                        return new Track(context.player, {
                            title: result.title,
                            author: result.uploader || 'Unknown Artist',
                            url: result.url,
                            duration: this.parseDuration(result.duration),
                            thumbnail: result.thumbnail,
                            views: result.view_count || 0,
                            requestedBy: context.requestedBy,
                            source: 'youtube'
                        });
                    });
                    const tracksEnd = Date.now();
                    console.log(`⏱️ [TIMING] Extractor.handle - Criar tracks (${tracks.length}): ${tracksEnd - tracksStart}ms`);
                    
                    const handleEnd = Date.now();
                    console.log(`⏱️ [TIMING] Extractor.handle - TOTAL (múltiplos): ${handleEnd - handleStart}ms`);
                    
                    // Retornar múltiplos tracks para que o bot possa mostrar menu
                    return { loadType: 'SEARCH_RESULT', tracks: tracks };
                }

                // Se for objeto único (compatibilidade - não deveria acontecer com maxResults=10)
                // ⚡ PRÉ-AQUECER: Iniciar stream em background (não bloqueia)
                this.preheatStream(searchResults.url);
                
                const trackStart = Date.now();
                const track = new Track(context.player, {
                    title: searchResults.title,
                    author: searchResults.uploader || 'Unknown Artist',
                    url: searchResults.url,
                    duration: this.parseDuration(searchResults.duration),
                    thumbnail: searchResults.thumbnail,
                    views: searchResults.view_count || 0,
                    requestedBy: context.requestedBy,
                    source: 'youtube'
                });
                const trackEnd = Date.now();
                console.log(`⏱️ [TIMING] Extractor.handle - Criar track único: ${trackEnd - trackStart}ms`);
                
                const handleEnd = Date.now();
                console.log(`⏱️ [TIMING] Extractor.handle - TOTAL (único): ${handleEnd - handleStart}ms`);
                
                return { loadType: 'TRACK_LOADED', tracks: [track] };
            }
            
            // Se for URL, obter info via yt-dlp (necessário para metadados completos)
            const videoInfo = await this.getVideoInfo(query);
            if (!videoInfo) {
                return this.emptyResponse();
            }
            
            // ⚡ PRÉ-AQUECER: Iniciar stream em background (não bloqueia)
            this.preheatStream(query);
            
            const track = new Track(context.player, {
                title: videoInfo.title,
                author: videoInfo.uploader || 'Unknown Artist',
                url: query,
                duration: this.parseDuration(videoInfo.duration),
                thumbnail: videoInfo.thumbnail,
                views: videoInfo.view_count || 0,
                requestedBy: context.requestedBy,
                source: 'youtube'
            });
            
            return { loadType: 'TRACK_LOADED', tracks: [track] };
        } catch (error) {
            if (!error.message?.includes('Timeout')) {
                console.error('❌ YouTube Extractor:', error.message);
            }
            return this.emptyResponse();
        }
    }
    
    async stream(track) {
        const streamStart = Date.now();
        
        // Limpar streams antigos periodicamente
        this.cleanupPreheatedStreams();
        
        // Verificar se já tem stream pré-aquecido
        const preheated = preheatedStreams.get(track.url);
        if (preheated && Date.now() < preheated.expiry) {
            // ⚡ Usar stream pré-aquecido (instantâneo!)
            const preheatCheckTime = Date.now() - streamStart;
            const preheatAge = preheated.createdAt ? Date.now() - preheated.createdAt : 0;
            
            // Estimar tempo economizado (assumindo que criar novo stream levaria ~2-5s)
            const estimatedTimeWithoutPreheat = 3000; // 3 segundos estimados
            const timeSaved = estimatedTimeWithoutPreheat - preheatCheckTime;
            
            // Log em background (não bloqueia)
            setImmediate(() => {
                console.log(`⚡ [STREAM] ✅ PRÉ-AQUECIDO: "${track.title.substring(0, 40)}..." | Economia: ~${(timeSaved / 1000).toFixed(1)}s | Idade: ${(preheatAge / 1000).toFixed(1)}s`);
            });
            
            preheatedStreams.delete(track.url); // Remover do cache (já está sendo usado)
            return preheated.stream;
        }
        
        // Se não tem pré-aquecido, criar novo
        const createStart = Date.now();
        const stream = this.getStreamDirect(track.url);
        const createEnd = Date.now();
        const createTime = createEnd - createStart;
        
        // Log em background (não bloqueia)
        setImmediate(() => {
            console.log(`⏳ [STREAM] ❌ SEM PRÉ-AQUECIMENTO: "${track.title.substring(0, 40)}..." | Criado em: ${(createTime / 1000).toFixed(1)}s`);
        });
        
        return stream;
    }
    
    getStreamDirect(url) {
        const ytdlp = spawn(this.ytdlpPath, [
            '-f', 'bestaudio',
            '-o', '-',
            '--no-playlist',
            '--quiet',
            '--no-warnings',
            '--socket-timeout', '10',
            '--retries', '1',
            '--no-cache-dir',
            url
        ], {
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true
        });
        
        const stream = new Readable({ read() {} });
        
        ytdlp.stdout.on('data', (chunk) => stream.push(chunk));
        ytdlp.stdout.on('end', () => stream.push(null));
        ytdlp.stdout.on('error', (err) => stream.destroy(err));
        ytdlp.on('error', (err) => stream.destroy(err));
        
        stream.on('close', () => {
            try {
                if (!ytdlp.killed) ytdlp.kill();
            } catch {}
        });
        
        return stream;
    }
    
    async searchAndGetInfo(query, maxResults = 1) {
        const searchStart = Date.now();
        const cacheKey = `${query.toLowerCase().trim()}_${maxResults}`;
        const cached = searchCache.get(cacheKey);
        if (cached?.info && Date.now() < cached.expiry) {
            console.log(`⏱️ [TIMING] searchAndGetInfo - Cache hit: ${Date.now() - searchStart}ms`);
            return cached.info;
        }

        const apiKey = process.env.YOUTUBE_API_KEY;
        if (!apiKey) return null;

        const apiStart = Date.now();
        const apiResult = await searchYouTubeAPI(query, apiKey, maxResults);
        const apiEnd = Date.now();
        console.log(`⏱️ [TIMING] searchAndGetInfo - API call: ${apiEnd - apiStart}ms`);
        
        if (!apiResult) return null;

        // Se for array (múltiplos resultados)
        if (Array.isArray(apiResult)) {
            const results = apiResult.map(item => ({
                url: item.url,
                title: item.title,
                uploader: item.uploader || 'Unknown Artist',
                duration: item.duration || 0,
                thumbnail: item.thumbnail || '',
                view_count: item.viewCount || 0
            }));

            searchCache.set(cacheKey, {
                info: results,
                expiry: Date.now() + SEARCH_CACHE_TTL
            });

            const totalTime = Date.now() - searchStart;
            console.log(`⏱️ [TIMING] searchAndGetInfo - TOTAL (múltiplos): ${totalTime}ms`);
            return results;
        }

        // Se for objeto único (compatibilidade)
        const processStart = Date.now();
        const videoInfo = {
            url: apiResult.url,
            title: apiResult.title,
            uploader: apiResult.uploader || 'Unknown Artist',
            duration: apiResult.duration,
            thumbnail: apiResult.thumbnail,
            view_count: apiResult.viewCount || 0
        };
        const processEnd = Date.now();
        console.log(`⏱️ [TIMING] searchAndGetInfo - Processar resultado: ${processEnd - processStart}ms`);

        searchCache.set(cacheKey, {
            url: apiResult.url,
            info: videoInfo,
            expiry: Date.now() + SEARCH_CACHE_TTL
        });

        const totalTime = Date.now() - searchStart;
        console.log(`⏱️ [TIMING] searchAndGetInfo - TOTAL (único): ${totalTime}ms`);
        return videoInfo;
    }
    
    async getVideoInfo(url) {
        return new Promise((resolve) => {
            const ytdlp = spawn(this.ytdlpPath, [
                '--dump-json',
                '--no-playlist',
                '--quiet',
                '--no-warnings',
                '--socket-timeout', '8',
                '--retries', '1',
                url
            ], {
                stdio: ['ignore', 'pipe', 'pipe'],
                windowsHide: true
            });
            
            let output = '';
            let hasResolved = false;
            
            const timeout = setTimeout(() => {
                if (!hasResolved) {
                    hasResolved = true;
                    try { ytdlp.kill(); } catch {}
                    resolve(null);
                }
            }, YTDLP_TIMEOUT);
            
            ytdlp.stdout.on('data', (data) => { output += data.toString(); });
            ytdlp.stderr.on('data', () => {});
            
            ytdlp.on('close', (code) => {
                if (hasResolved) return;
                clearTimeout(timeout);
                if (code === 0 || code === null) {
                    try {
                        resolve(JSON.parse(output));
                    } catch {
                        resolve(null);
                    }
                } else {
                    resolve(null);
                }
            });
            
            ytdlp.on('error', () => {
                if (!hasResolved) {
                    hasResolved = true;
                    clearTimeout(timeout);
                    resolve(null);
                }
            });
        });
    }
    
    parseDuration(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
}

module.exports = { YouTubeExtractor };
