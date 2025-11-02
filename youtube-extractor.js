const { BaseExtractor } = require('discord-player');
const { spawn } = require('child_process');
const { Readable } = require('stream');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');

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
            console.log('✅ yt-dlp encontrado localmente');
            return localPath;
        }
        
        // Tentar no PATH do sistema
        console.log('⚠️ yt-dlp.exe não encontrado localmente, tentando PATH do sistema');
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
            console.log('🔍 YouTube Extractor: Buscando:', query);
            
            // Se for uma busca, primeiro obter URL do YouTube
            let videoUrl = query;
            if (!/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)/.test(query)) {
                videoUrl = await this.searchYouTube(query);
                if (!videoUrl) {
                    console.log('❌ YouTube Extractor: Nenhum resultado encontrado');
                    return this.emptyResponse();
                }
            }
            
            // Obter informações do vídeo usando yt-dlp
            const videoInfo = await this.getVideoInfo(videoUrl);
            if (!videoInfo) {
                console.log('❌ YouTube Extractor: Não foi possível obter informações do vídeo');
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
            
            console.log('✅ YouTube Extractor: Track criada:', track.title);
            
            return {
                loadType: 'TRACK_LOADED',
                tracks: [track]
            };
        } catch (error) {
            console.error('❌ YouTube Extractor: Erro ao processar:', error.message);
            return this.emptyResponse();
        }
    }
    
    async stream(track) {
        try {
            console.log('🎵 YouTube Extractor: Obtendo stream para:', track.title);
            
            // Usar yt-dlp para obter stream direto
            const stream = await this.getAudioStream(track.url);
            console.log('✅ YouTube Extractor: Stream obtido');
            return stream;
        } catch (error) {
            console.error('❌ YouTube Extractor: Erro ao criar stream:', error.message);
            throw error;
        }
    }
    
    async searchYouTube(query) {
        // Usar yt-dlp para buscar no YouTube
        return new Promise((resolve, reject) => {
            console.log('🔍 YouTube Extractor: Buscando vídeo no YouTube:', query);
            
            // yt-dlp pode buscar usando "ytsearch:query"
            const searchQuery = `ytsearch1:${query}`;
            const ytdlp = spawn(this.ytdlpPath, [
                '--dump-json',
                '--no-playlist',
                searchQuery
            ]);
            
            let output = '';
            
            ytdlp.stdout.on('data', (data) => {
                output += data.toString();
            });
            
            ytdlp.on('close', (code) => {
                if (code === 0) {
                    try {
                        const info = JSON.parse(output);
                        if (info && info.webpage_url) {
                            console.log('✅ YouTube Extractor: Vídeo encontrado:', info.title);
                            resolve(info.webpage_url);
                        } else {
                            resolve(null);
                        }
                    } catch (error) {
                        console.error('❌ YouTube Extractor: Erro ao parsear resultado da busca:', error);
                        resolve(null);
                    }
                } else {
                    console.error('❌ YouTube Extractor: yt-dlp busca falhou com código:', code);
                    resolve(null);
                }
            });
            
            ytdlp.on('error', (error) => {
                console.error('❌ YouTube Extractor: Erro ao executar yt-dlp:', error.message);
                resolve(null);
            });
        });
    }
    
    getVideoInfo(url) {
        return new Promise((resolve, reject) => {
            // Verificar se yt-dlp está disponível
            const ytdlp = spawn(this.ytdlpPath, [
                '--dump-json',
                '--no-playlist',
                url
            ]);
            
            let output = '';
            
            ytdlp.stdout.on('data', (data) => {
                output += data.toString();
            });
            
            ytdlp.on('close', (code) => {
                if (code === 0) {
                    try {
                        const info = JSON.parse(output);
                        resolve({
                            title: info.title,
                            uploader: info.uploader,
                            url: info.url,
                            duration: info.duration,
                            thumbnail: info.thumbnail,
                            view_count: info.view_count
                        });
                    } catch (error) {
                        reject(new Error('Erro ao parsear JSON'));
                    }
                } else {
                    reject(new Error(`yt-dlp exited with code ${code}`));
                }
            });
            
            ytdlp.on('error', (error) => {
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
                url
            ]);
            
            let streamUrl = '';
            
            ytdlp.stdout.on('data', (data) => {
                streamUrl += data.toString().trim();
            });
            
            ytdlp.on('close', (code) => {
                if (code === 0 && streamUrl) {
                    resolve(streamUrl);
                } else {
                    reject(new Error(`yt-dlp failed with code ${code}`));
                }
            });
            
            ytdlp.on('error', (error) => {
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

