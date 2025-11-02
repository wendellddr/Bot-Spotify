const { BaseExtractor } = require('discord-player');
const { spawn } = require('child_process');
const { Readable } = require('stream');
// Usar fetch nativo se disponível
const fetch = (typeof globalThis.fetch === 'function') ? globalThis.fetch : require('node-fetch');
const path = require('path');
const fs = require('fs');

// Timeouts e constantes
const YTDLP_TIMEOUT = 30000; // 30 segundos
const SEARCH_CACHE_TTL = 10 * 60 * 1000; // 10 minutos

// Cache de buscas do YouTube
const youtubeSearchCache = new Map();
const videoInfoCache = new Map();

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
            // Usar yt-dlp para obter stream direto
            const stream = await this.getAudioStream(track.url);
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
                '--flat-playlist',
                '--default-search', 'auto',
                searchQuery
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
                    resolve(null);
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
                        if (info && info.webpage_url) {
                            // Armazenar no cache
                            youtubeSearchCache.set(cacheKey, {
                                url: info.webpage_url,
                                expiry: Date.now() + SEARCH_CACHE_TTL
                            });
                            
                            // Limitar tamanho do cache (manter apenas últimas 50 buscas)
                            if (youtubeSearchCache.size > 50) {
                                const oldestKey = youtubeSearchCache.keys().next().value;
                                youtubeSearchCache.delete(oldestKey);
                            }
                            
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
                        
                        // Armazenar no cache
                        videoInfoCache.set(url, {
                            data: videoInfo,
                            expiry: Date.now() + SEARCH_CACHE_TTL
                        });
                        
                        // Limitar tamanho do cache
                        if (videoInfoCache.size > 100) {
                            const oldestKey = videoInfoCache.keys().next().value;
                            videoInfoCache.delete(oldestKey);
                        }
                        
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
    
    getAudioStream(url) {
        // Retornar URL direta do áudio usando yt-dlp
        return new Promise((resolve, reject) => {
            const ytdlp = spawn(this.ytdlpPath, [
                '-f', 'bestaudio/best',
                '-g',
                '--no-playlist',
                '--no-warnings',
                '--no-cache-dir',
                url
            ], {
                stdio: ['ignore', 'pipe', 'pipe']
            });
            
            let streamUrl = '';
            let hasResolved = false;
            
            // Timeout para evitar processos travados
            const timeout = setTimeout(() => {
                if (!hasResolved) {
                    hasResolved = true;
                    ytdlp.kill();
                    reject(new Error('Timeout ao obter stream de áudio'));
                }
            }, YTDLP_TIMEOUT);
            
            ytdlp.stdout.on('data', (data) => {
                streamUrl += data.toString().trim();
            });
            
            ytdlp.stderr.on('data', (data) => {
                // Ignorar warnings do yt-dlp em stderr
            });
            
            ytdlp.on('close', (code) => {
                if (hasResolved) return;
                
                clearTimeout(timeout);
                if (code === 0 && streamUrl) {
                    resolve(streamUrl);
                } else {
                    reject(new Error(`yt-dlp failed with code ${code}`));
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

module.exports = { YouTubeExtractor };

