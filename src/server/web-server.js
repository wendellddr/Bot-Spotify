// Web Server for Bot Control Interface
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const session = require('express-session');
const path = require('path');
const { URLSearchParams } = require('url');
const { ChannelType, EmbedBuilder } = require('discord.js');
require('dotenv').config();

// Importar instâncias do bot principal (vai ser injetado)
let client = null;
let player = null;

// Spotify credentials (same as bot)
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

let spotifyAccessToken = null;
let spotifyTokenExpiry = 0;

// Fast Spotify search cache
const searchCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 200; // Increased cache size for better performance

// YouTube search cache (fast lookup)
const youtubeSearchCache = new Map();
const YT_SEARCH_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Rate limiting
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minuto
const RATE_LIMIT_MAX_REQUESTS = {
    autocomplete: 30, // 30 autocomplete por minuto
    search: 10, // 10 buscas por minuto
    play: 20 // 20 play por minuto
};

function checkRateLimit(req, endpoint) {
    const ip = req.ip || req.connection.remoteAddress;
    const key = `${ip}:${endpoint}`;
    const now = Date.now();
    
    if (!rateLimitMap.has(key)) {
        rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
        return true;
    }
    
    const limit = rateLimitMap.get(key);
    
    // Reset se passou a janela
    if (now > limit.resetAt) {
        limit.count = 1;
        limit.resetAt = now + RATE_LIMIT_WINDOW;
        return true;
    }
    
    // Verificar limite
    const maxRequests = RATE_LIMIT_MAX_REQUESTS[endpoint] || 10;
    if (limit.count >= maxRequests) {
        return false;
    }
    
    limit.count++;
    return true;
}

// Limpar rate limits antigos periodicamente
setInterval(() => {
    const now = Date.now();
    for (const [key, limit] of rateLimitMap.entries()) {
        if (now > limit.resetAt) {
            rateLimitMap.delete(key);
        }
    }
}, 5 * 60 * 1000); // A cada 5 minutos

// Fast YouTube search using yt-dlp directly
async function fastYouTubeSearch(query) {
    const cacheKey = query.toLowerCase().trim();
    const cached = youtubeSearchCache.get(cacheKey);
    if (cached && Date.now() < cached.expiry) {
        return cached.url;
    }

    const { spawn } = require('child_process');
    const path = require('path');
    const fs = require('fs');
    
    // Encontrar yt-dlp
    let ytdlpPath = path.join(__dirname, '../utils/yt-dlp.exe');
    if (!fs.existsSync(ytdlpPath)) {
        ytdlpPath = 'yt-dlp';
    }

    return new Promise((resolve) => {
        const searchQuery = `ytsearch1:${query}`;
        const ytdlp = spawn(ytdlpPath, [
            '--dump-json',
            '--no-playlist',
            '--quiet',
            '--no-warnings',
            '--no-cache-dir',
            '--skip-download',
            '--socket-timeout', '3',
            '--fragment-retries', '1',
            '--retries', '1',
            '--ignore-errors',
            '--no-mtime',
            '--extractor-args', 'youtube:player_client=android',
            searchQuery
        ], {
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true
        });
        
        let output = '';
        let hasResolved = false;
        const timeout = setTimeout(() => {
            if (!hasResolved) {
                hasResolved = true;
                ytdlp.kill();
                resolve(null);
            }
        }, 4000); // 4 segundos timeout
        
        ytdlp.stdout.on('data', (data) => {
            output += data.toString();
        });
        
        ytdlp.on('close', (code) => {
            if (hasResolved) return;
            clearTimeout(timeout);
            
            if (code === 0 && output) {
                try {
                    const info = JSON.parse(output);
                    if (info && info.webpage_url) {
                        youtubeSearchCache.set(cacheKey, {
                            url: info.webpage_url,
                            expiry: Date.now() + YT_SEARCH_CACHE_TTL
                        });
                        resolve(info.webpage_url);
                        return;
                    }
                } catch (e) {
                    // Ignore parse errors
                }
            }
            resolve(null);
            hasResolved = true;
        });
        
        ytdlp.on('error', () => {
            if (hasResolved) return;
            clearTimeout(timeout);
            resolve(null);
            hasResolved = true;
        });
    });
}

// Get Spotify access token
async function getSpotifyToken() {
    if (spotifyAccessToken && Date.now() < spotifyTokenExpiry) {
        return spotifyAccessToken;
    }

    try {
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')}`
            },
            body: 'grant_type=client_credentials'
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        spotifyAccessToken = data.access_token;
        spotifyTokenExpiry = Date.now() + (data.expires_in * 1000) - (5 * 60 * 1000); // Refresh 5min before
        return spotifyAccessToken;
    } catch (error) {
        console.error('❌ Error getting Spotify token:', error);
        return null;
    }
}

// Fast Spotify search
async function fastSpotifySearch(query) {
    // Check cache first
    const cacheKey = query.toLowerCase().trim();
    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() < cached.expiry) {
        return cached.data;
    }

    // Get token and search
    const token = await getSpotifyToken();
    if (!token) {
        return [];
    }

    try {
        const response = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=10`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        const tracks = data.tracks?.items || [];

        // Cache results
        searchCache.set(cacheKey, {
            data: tracks,
            expiry: Date.now() + CACHE_TTL
        });

        // Limit cache size - LRU eviction
        if (searchCache.size > MAX_CACHE_SIZE) {
            const oldestKey = searchCache.keys().next().value;
            searchCache.delete(oldestKey);
        }

        return tracks;
    } catch (error) {
        console.error('❌ Spotify search error:', error);
        return [];
    }
}

function initWebServer(botClient, botPlayer) {
    client = botClient;
    player = botPlayer;
    
    const app = express();
    const server = http.createServer(app);
    const io = socketIo(server);
    
    // Configurações
    const PORT = process.env.WEB_PORT || 3000;
    const DISCORD_CLIENT_ID = process.env.CLIENT_ID;
    const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
    const REDIRECT_URI = process.env.REDIRECT_URI || `http://localhost:${PORT}/auth/callback`;
    
    // Verificar se tem as credenciais necessárias
    if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET) {
        console.log('⚠️  Discord OAuth2 not configured. Web interface disabled.');
        return null;
    }
    
    // Função para fazer requisições à API do Discord
    const fetch = require('node-fetch');
    
    async function getDiscordUser(accessToken) {
        const response = await fetch('https://discord.com/api/users/@me', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        return response.json();
    }
    
    async function getUserGuilds(accessToken) {
        const response = await fetch('https://discord.com/api/users/@me/guilds', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        return response.json();
    }
    
    async function exchangeCodeForToken(code) {
        const response = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: DISCORD_CLIENT_ID,
                client_secret: DISCORD_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: REDIRECT_URI,
                scope: 'identify guilds'
            })
        });
        return response.json();
    }
    
    // Configurar sessão
    app.use(session({
        secret: process.env.SESSION_SECRET || 'music-maestro-secret-key-change-in-production',
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: process.env.NODE_ENV === 'production',
            httpOnly: true,
            maxAge: 24 * 60 * 60 * 1000, // 24 horas
            sameSite: 'lax'
        }
    }));
    
    // Middleware
    app.use(express.json());
    app.use(express.static(path.join(__dirname, '../../public')));
    
    // Sanitização de inputs
    function sanitizeInput(input) {
        if (typeof input !== 'string') return '';
        return input.trim().substring(0, 500); // Limitar tamanho
    }
    
    // Middleware para verificar autenticação
    function requireAuth(req, res, next) {
        // Verificar se sessão expirou
        if (!req.session || !req.session.user) {
            return res.redirect('/login');
        }
        
        // Verificar timeout de sessão (24 horas)
        if (req.session.lastActivity && Date.now() - req.session.lastActivity > 24 * 60 * 60 * 1000) {
            req.session.destroy();
            return res.redirect('/login');
        }
        
        // Atualizar última atividade
        req.session.lastActivity = Date.now();
        return next();
    }
    
    // Rotas de autenticação
    app.get('/login', (req, res) => {
        const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds`;
        res.redirect(authUrl);
    });
    
    // Página de login fallback
    app.get('/login-page', (req, res) => {
        res.sendFile(path.join(__dirname, '../../public', 'login.html'));
    });
    
    app.get('/auth/callback', async (req, res) => {
        try {
            const code = req.query.code;
            
            if (!code) {
                console.error('❌ No code received in callback');
                return res.redirect('/login?error=no_code');
            }
            
            console.log('🔐 Exchanging code for token...');
            const tokenData = await exchangeCodeForToken(code);
            
            if (!tokenData || !tokenData.access_token) {
                console.error('❌ Token exchange failed:', tokenData);
                return res.redirect('/login?error=token_failed');
            }
            
            // Obter informações do usuário
            console.log('👤 Getting user info...');
            const user = await getDiscordUser(tokenData.access_token);
            
            if (!user || !user.id) {
                console.error('❌ Failed to get user info:', user);
                return res.redirect('/login?error=user_failed');
            }
            
            // Salvar na sessão
            req.session.user = user;
            req.session.access_token = tokenData.access_token;
            
            console.log(`✅ User ${user.username} authenticated`);
            res.redirect('/');
        } catch (error) {
            console.error('❌ Authentication error:', error);
            res.redirect('/login?error=auth_failed');
        }
    });
    
    app.get('/logout', (req, res) => {
        req.session.destroy();
        res.redirect('/login');
    });
    
    // Rota principal (protegida)
    app.get('/', requireAuth, (req, res) => {
        res.sendFile(path.join(__dirname, '../../public', 'index.html'));
    });
    
    // API: Obter servidores do usuário
    app.get('/api/servers', requireAuth, async (req, res) => {
        try {
            const guilds = await getUserGuilds(req.session.access_token);
            
            // Filtrar apenas servidores onde o bot está presente
            const botGuilds = [];
            for (const guild of guilds) {
                const botGuild = client.guilds.cache.get(guild.id);
                if (botGuild) {
                    const member = botGuild.members.cache.get(botGuild.client.user.id);
                    if (member) {
                        botGuilds.push({
                            id: guild.id,
                            name: guild.name,
                            icon: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : null,
                            permissions: guild.permissions
                        });
                    }
                }
            }
            
            res.json({ success: true, servers: botGuilds });
        } catch (error) {
            console.error('❌ Error getting servers:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });
    
    // API: Obter canais de voz do servidor
    app.get('/api/voice-channels/:guildId', requireAuth, (req, res) => {
        try {
            const { guildId } = req.params;
            const guild = client.guilds.cache.get(guildId);
            
            if (!guild) {
                return res.status(404).json({ success: false, error: 'Guild not found' });
            }
            
            // Obter todos os canais de voz
            const voiceChannels = guild.channels.cache
                .filter(channel => channel.type === ChannelType.GuildVoice)
                .map(channel => ({
                    id: channel.id,
                    name: channel.name,
                    userCount: channel.members.filter(m => !m.user.bot).size
                }))
                .sort((a, b) => b.userCount - a.userCount); // Ordenar por número de usuários
            
            res.json({ success: true, channels: voiceChannels });
        } catch (error) {
            console.error('❌ Error getting voice channels:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });
    
    // API: Obter estado do player (fila, música atual, etc)
    app.get('/api/status/:guildId', requireAuth, (req, res) => {
        try {
            const { guildId } = req.params;
            const queue = player.nodes.get(guildId);
            
            if (!queue) {
                return res.json({
                    success: true,
                    status: {
                        isPlaying: false,
                        currentTrack: null,
                        queue: [],
                        volume: 100
                    }
                });
            }
            
            const status = {
                isPlaying: queue.isPlaying(),
                currentTrack: queue.currentTrack ? {
                    title: queue.currentTrack.title,
                    author: queue.currentTrack.author,
                    url: queue.currentTrack.url,
                    duration: queue.currentTrack.duration,
                    thumbnail: queue.currentTrack.thumbnail
                } : null,
                queue: queue.tracks.toArray().map(track => ({
                    title: track.title,
                    author: track.author,
                    url: track.url,
                    duration: track.duration,
                    thumbnail: track.thumbnail
                })),
                volume: queue.node.volume || 100,
                connection: queue.connection ? {
                    state: queue.connection.state.status,
                    channel: queue.connection.channel?.name
                } : null
            };
            
            res.json({ success: true, status });
        } catch (error) {
            console.error('❌ Error getting status:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });
    
    // API: Autocomplete (sugestões rápidas)
    app.post('/api/autocomplete/:guildId', requireAuth, async (req, res) => {
        try {
            // Rate limiting
            if (!checkRateLimit(req, 'autocomplete')) {
                return res.status(429).json({ 
                    success: false, 
                    error: 'Too many requests. Please wait a moment.' 
                });
            }
            
            const { query } = req.body;
            
            // Validação e sanitização
            if (!query || typeof query !== 'string') {
                return res.json({ success: true, suggestions: [] });
            }
            
            const sanitizedQuery = sanitizeInput(query);
            
            if (sanitizedQuery.length < 2) {
                return res.json({ success: true, suggestions: [] });
            }
            
            const searchQuery = sanitizedQuery.substring(0, 50); // Limitar tamanho
            
            // Busca rápida no Spotify com limite menor
            try {
                const token = await getSpotifyToken();
                if (!token) {
                    return res.json({ success: true, suggestions: [] });
                }
                
                const response = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(searchQuery)}&type=track&limit=5`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                
                if (!response.ok) {
                    return res.json({ success: true, suggestions: [] });
                }
                
                const data = await response.json();
                const suggestions = (data.tracks?.items || []).map(track => ({
                    title: track.name,
                    artist: track.artists.map(a => a.name).join(', '),
                    fullQuery: `${track.artists[0].name} - ${track.name}`
                }));
                
                res.json({ success: true, suggestions });
            } catch (error) {
                console.error('❌ Autocomplete error:', error);
                res.json({ success: true, suggestions: [] });
            }
        } catch (error) {
            console.error('❌ Error in autocomplete:', error);
            res.json({ success: true, suggestions: [] });
        }
    });
    
    // API: Buscar música
    app.post('/api/search/:guildId', requireAuth, async (req, res) => {
        const startTime = Date.now();
        try {
            // Rate limiting
            if (!checkRateLimit(req, 'search')) {
                return res.status(429).json({ 
                    success: false, 
                    error: 'Too many requests. Please wait a moment.' 
                });
            }
            
            const { guildId } = req.params;
            const { query } = req.body;
            
            // Validação e sanitização
            if (!query || typeof query !== 'string' || !query.trim()) {
                return res.status(400).json({ success: false, error: 'Empty query' });
            }
            
            const sanitizedQuery = sanitizeInput(query);
            
            if (sanitizedQuery.length < 1) {
                return res.status(400).json({ success: false, error: 'Query too short' });
            }
            
            // Fast Spotify search
            try {
                const spotifyTracks = await fastSpotifySearch(sanitizedQuery);
                
                if (spotifyTracks.length === 0) {
                    return res.status(404).json({ 
                        success: false, 
                        error: 'No music found' 
                    });
                }
                
                // Format results similar to Discord bot - optimized
                const tracks = spotifyTracks.map(track => ({
                    title: track.name,
                    author: track.artists.map(a => a.name).join(', '),
                    duration: track.duration_ms,
                    thumbnail: track.album.images[0]?.url,
                    url: track.external_urls.spotify,
                    spotifyId: track.id
                }));
                
                const duration = Date.now() - startTime;
                console.log(`✅ Found ${tracks.length} results in ${duration}ms`);
                
                res.json({ 
                    success: true, 
                    tracks: tracks
                });
            } catch (searchError) {
                console.error('❌ Search error:', searchError);
                return res.status(500).json({ 
                    success: false, 
                    error: 'Error searching for music: ' + searchError.message 
                });
            }
        } catch (error) {
            console.error('❌ Error searching:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });
    
    // API: Adicionar música à fila
    app.post('/api/play/:guildId', requireAuth, async (req, res) => {
        try {
            // Rate limiting
            if (!checkRateLimit(req, 'play')) {
                return res.status(429).json({ 
                    success: false, 
                    error: 'Too many requests. Please wait a moment.' 
                });
            }
            
            const { guildId } = req.params;
            let { trackUrl, voiceChannelId, trackTitle, trackArtist } = req.body;
            
            // Validação e sanitização
            if (!trackUrl || typeof trackUrl !== 'string') {
                return res.status(400).json({ success: false, error: 'No track provided' });
            }
            
            trackUrl = sanitizeInput(trackUrl);
            trackTitle = trackTitle ? sanitizeInput(trackTitle) : '';
            trackArtist = trackArtist ? sanitizeInput(trackArtist) : '';
            
            if (!trackUrl) {
                return res.status(400).json({ success: false, error: 'No track provided' });
            }
            
            console.log(`🎵 Web play request for guild ${guildId}`);
            
            // Obter o servidor
            const guild = client.guilds.cache.get(guildId);
            if (!guild) {
                return res.status(404).json({ 
                    success: false, 
                    error: 'Guild not found' 
                });
            }
            
            // Buscar o canal de voz
            let voiceChannel = null;
            if (voiceChannelId) {
                voiceChannel = guild.channels.cache.get(voiceChannelId);
            }
            
            // Se não especificou canal, tentar usar a fila existente
            let queue = player.nodes.get(guildId);
            if (!voiceChannel && queue && queue.channel) {
                voiceChannel = queue.channel;
            }
            
            if (!voiceChannel) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'No voice channel specified',
                    requiresVoiceChannel: true
                });
            }
            
            // Encontrar um canal de texto para enviar mensagens
            let textChannel = null;
            if (queue && queue.metadata && queue.metadata.channel) {
                // Se já tem um canal de texto na fila, usar ele
                textChannel = queue.metadata.channel;
            } else {
                // Buscar o primeiro canal de texto que o bot tem permissão
                textChannel = guild.channels.cache.find(ch => 
                    ch.type === ChannelType.GuildText && 
                    ch.permissionsFor(client.user)?.has(['SendMessages', 'EmbedLinks'])
                );
            }
            
            // Criar ou obter fila
            if (!queue) {
                queue = player.nodes.create(guild, {
                    metadata: {
                        channel: textChannel || voiceChannel // Usar canal de texto se disponível
                    },
                    leaveOnEmpty: true,
                    leaveOnEnd: false,
                    leaveOnStop: true,
                    leaveOnEmptyCooldown: 15000
                });
            } else if (textChannel && (!queue.metadata || !queue.metadata.channel || queue.metadata.channel.type === ChannelType.GuildVoice)) {
                // Atualizar metadata se não tiver canal de texto
                queue.metadata = queue.metadata || {};
                queue.metadata.channel = textChannel;
            }
            
            // Conectar ao canal se necessário
            if (!queue.connection) {
                const membersInChannel = voiceChannel.members.filter(member => !member.user.bot).size;
                
                if (membersInChannel === 0) {
                    return res.status(400).json({ 
                        success: false, 
                        error: 'You need to be in the voice channel!' 
                    });
                }
                
                try {
                    await queue.connect(voiceChannel);
                    console.log(`✅ Bot connected to channel "${voiceChannel.name}"`);
                } catch (error) {
                    console.error('❌ Error connecting:', error);
                    return res.status(500).json({ 
                        success: false, 
                        error: 'Could not connect to voice channel: ' + error.message 
                    });
                }
            }
            
            // Responder imediatamente ao frontend (não bloquear)
            res.json({ 
                success: true, 
                message: 'Processing song...',
                processing: true
            });
            
            // Processar busca e adicionar à fila em background
            (async () => {
                try {
                    // Buscar no YouTube usando título e artista
                    const searchQuery = trackArtist ? `${trackArtist} - ${trackTitle}` : trackTitle;
                    const searchStartTime = Date.now();
                    console.log(`🎬 Searching YouTube for: "${searchQuery}"`);
                    
                    // Notificar início da busca via WebSocket
                    io.to(guildId).emit('queueUpdate', { 
                        action: 'processing', 
                        track: trackTitle,
                        message: 'Searching for audio...'
                    });
                    
                    // Tentar busca ultra-rápida via Piped primeiro
                    let youtubeUrl;
                    try {
                        const { fastSearchUrl } = require('../utils/fast-search');
                        youtubeUrl = await fastSearchUrl(searchQuery);
                    } catch (_) {
                        youtubeUrl = null;
                    }
                    // Fallback: fastYouTubeSearch existente
                    if (!youtubeUrl) {
                        youtubeUrl = await fastYouTubeSearch(searchQuery);
                    }
                    
                    let searchResult;
                    if (youtubeUrl) {
                        // Se encontrou URL diretamente, usar ela
                        searchResult = await player.search(youtubeUrl, {
                            requestedBy: null
                        });
                        // Prefetch do stream em background (não aguardar)
                        try {
                            const { prefetchStreamUrl } = require('../utils/youtube-extractor');
                            prefetchStreamUrl(youtubeUrl).catch(() => {});
                        } catch (_) {}
                    } else {
                        // Fallback para busca normal do player
                        searchResult = await player.search(searchQuery, {
                            requestedBy: null
                        });
                    }
                    
                    const searchDuration = Date.now() - searchStartTime;
                    console.log(`⏱️  YouTube search took ${searchDuration}ms`);
                    
                    if (!searchResult.hasTracks()) {
                        // Notificar erro via WebSocket
                        io.to(guildId).emit('queueUpdate', { 
                            action: 'error', 
                            track: trackTitle,
                            error: 'Track not found on YouTube'
                        });
                        return;
                    }
                    
                    const track = searchResult.tracks[0];
                    const wasPlaying = queue.isPlaying();
                    const queueSize = queue.size;
                    
                    // Logs de tempo para web interface
                    const webPlayStartTime = Date.now();
                    console.log(`\n⏱️  [TIMING] ===== INICIANDO REPRODUÇÃO VIA WEB =====`);
                    console.log(`   ⏱️  [TIMING] Música: "${track.title}"`);
                    console.log(`   ⏱️  [TIMING] Tempo inicial: ${new Date().toISOString()}`);
                    
                    const addStart = Date.now();
                    queue.addTrack(track);
                    const addTime = ((Date.now() - addStart) / 1000).toFixed(2);
                    console.log(`   ⏱️  [TIMING] Track adicionada à fila: ${addTime}s`);
                    
                    if (!queue.isPlaying()) {
                        const playCallStart = Date.now();
                        console.log(`   ⏱️  [TIMING] Chamando queue.node.play()...`);
                        await queue.node.play();
                        const playCallTime = ((Date.now() - playCallStart) / 1000).toFixed(2);
                        console.log(`   ⏱️  [TIMING] queue.node.play() retornou: ${playCallTime}s`);
                    }
                    
                    const totalTime = ((Date.now() - webPlayStartTime) / 1000).toFixed(2);
                    console.log(`   ⏱️  [TIMING] Tempo total até agora: ${totalTime}s`);
                    console.log(`✅ Added "${track.title}" to queue`);
                    
                    // Enviar mensagem no Discord
                    try {
                        // Tentar obter o canal do metadata da fila (já configurado acima)
                        const channel = queue.metadata && queue.metadata.channel && 
                                       queue.metadata.channel.type === ChannelType.GuildText 
                                       ? queue.metadata.channel : null;
                        
                        if (channel) {
                            const embed = new EmbedBuilder()
                                .setColor(0x1DB954)
                                .setThumbnail(track.thumbnail || null);
                            
                            if (!wasPlaying && queue.isPlaying()) {
                                embed.setTitle('🎵 Now Playing')
                                    .setDescription(`**${track.title}**\n🎤 ${track.author || 'Unknown Artist'}`)
                                    .setFooter({ text: '✅ Added from Web Interface' });
                            } else {
                                embed.setTitle('➕ Added to Queue')
                                    .setDescription(`**${track.title}**\n🎤 ${track.author || 'Unknown Artist'}`)
                                    .addFields({ 
                                        name: '📊 Position', 
                                        value: `#${queueSize + 1} in queue`, 
                                        inline: true 
                                    })
                                    .setFooter({ text: '✅ Added from Web Interface' });
                            }
                            
                            if (track.duration) {
                                embed.addFields({ 
                                    name: '⏱️ Duration', 
                                    value: track.duration, 
                                    inline: true 
                                });
                            }
                            
                            if (track.url) {
                                embed.addFields({ 
                                    name: '🔗 Link', 
                                    value: `[Open](${track.url})`, 
                                    inline: true 
                                });
                            }
                            
                            embed.setTimestamp();
                            
                            await channel.send({ embeds: [embed] });
                        }
                    } catch (error) {
                        console.error('❌ Error sending Discord message:', error.message);
                        // Não bloquear se falhar ao enviar mensagem
                    }
                    
                    // Notificar sucesso via WebSocket
                    io.to(guildId).emit('queueUpdate', { 
                        action: 'added', 
                        track: track.title,
                        data: {
                            title: track.title,
                            author: track.author,
                            duration: track.duration
                        }
                    });
                } catch (error) {
                    console.error('❌ Error processing track in background:', error);
                    // Notificar erro via WebSocket
                    io.to(guildId).emit('queueUpdate', { 
                        action: 'error', 
                        track: trackTitle,
                        error: error.message || 'Error processing track'
                    });
                }
            })();
        } catch (error) {
            console.error('❌ Error playing:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });
    
    // API: Pausar/Retomar
    app.post('/api/toggle/:guildId', requireAuth, (req, res) => {
        try {
            const { guildId } = req.params;
            const queue = player.nodes.get(guildId);
            
            if (!queue) {
                return res.status(400).json({ success: false, error: 'No queue found' });
            }
            
            if (!queue.isPlaying()) {
                return res.status(400).json({ success: false, error: 'Nothing playing' });
            }
            
            const paused = queue.node.isPaused();
            if (paused) {
                queue.node.resume();
                io.to(guildId).emit('playerUpdate', { paused: false });
                res.json({ success: true, message: 'Resumed' });
            } else {
                queue.node.pause();
                io.to(guildId).emit('playerUpdate', { paused: true });
                res.json({ success: true, message: 'Paused' });
            }
        } catch (error) {
            console.error('❌ Error toggling:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });
    
    // API: Parar
    app.post('/api/stop/:guildId', requireAuth, (req, res) => {
        try {
            const { guildId } = req.params;
            const queue = player.nodes.get(guildId);
            
            if (queue) {
                queue.stop();
                queue.delete();
            }
            
            io.to(guildId).emit('playerUpdate', { stopped: true });
            res.json({ success: true, message: 'Stopped' });
        } catch (error) {
            console.error('❌ Error stopping:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });
    
    // API: Pular música
    app.post('/api/skip/:guildId', requireAuth, (req, res) => {
        try {
            const { guildId } = req.params;
            const queue = player.nodes.get(guildId);
            
            if (!queue || !queue.isPlaying()) {
                return res.status(400).json({ success: false, error: 'Nothing playing' });
            }
            
            queue.node.skip();
            io.to(guildId).emit('playerUpdate', { skipped: true });
            res.json({ success: true, message: 'Song skipped' });
        } catch (error) {
            console.error('❌ Error skipping:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });
    
    // API: Embaralhar fila
    app.post('/api/shuffle/:guildId', requireAuth, (req, res) => {
        try {
            const { guildId } = req.params;
            const queue = player.nodes.get(guildId);
            
            if (!queue || queue.tracks.size < 2) {
                return res.status(400).json({ success: false, error: 'Need at least 2 songs to shuffle' });
            }
            
            queue.tracks.shuffle();
            io.to(guildId).emit('queueUpdate', { action: 'shuffled' });
            res.json({ success: true, message: 'Queue shuffled' });
        } catch (error) {
            console.error('❌ Error shuffling:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });
    
    // API: Limpar fila
    app.post('/api/clear/:guildId', requireAuth, (req, res) => {
        try {
            const { guildId } = req.params;
            const queue = player.nodes.get(guildId);
            
            if (!queue || queue.tracks.size === 0) {
                return res.status(400).json({ success: false, error: 'Queue is already empty' });
            }
            
            const cleared = queue.tracks.size;
            queue.clear();
            io.to(guildId).emit('queueUpdate', { action: 'cleared', count: cleared });
            res.json({ success: true, message: `Removed ${cleared} song(s)` });
        } catch (error) {
            console.error('❌ Error clearing:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });
    
    // API: Ajustar volume
    app.post('/api/volume/:guildId', requireAuth, (req, res) => {
        try {
            const { guildId } = req.params;
            const { volume } = req.body;
            const queue = player.nodes.get(guildId);
            
            if (!queue || !queue.isPlaying()) {
                return res.status(400).json({ success: false, error: 'No music is playing' });
            }
            
            if (volume !== undefined) {
                const vol = Math.min(Math.max(parseInt(volume), 0), 100);
                queue.node.setVolume(vol);
                res.json({ success: true, message: `Volume set to ${vol}%` });
            } else {
                res.json({ success: true, currentVolume: queue.node.volume });
            }
        } catch (error) {
            console.error('❌ Error setting volume:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });
    
    // WebSocket para atualização em tempo real
    io.on('connection', (socket) => {
        console.log('🌐 WebSocket client connected');
        
        socket.on('subscribe', (guildId) => {
            socket.join(guildId);
            console.log(`📡 Client subscribed to server ${guildId}`);
        });
        
        socket.on('disconnect', () => {
            console.log('🌐 WebSocket client disconnected');
        });
    });
    
    // Iniciar servidor
    server.listen(PORT, () => {
        console.log(`\n🌐 Web interface started!`);
        console.log(`   Access: http://localhost:${PORT}`);
        console.log(`   Routes registered:`, 
            ['/', '/login', '/api/servers', '/api/search/:guildId', '/api/play/:guildId', 
             '/api/status/:guildId', '/api/voice-channels/:guildId', '/api/toggle/:guildId', 
             '/api/stop/:guildId', '/api/skip/:guildId', '/api/shuffle/:guildId', 
             '/api/clear/:guildId', '/api/volume/:guildId'].join(', ')
        );
    });
    
    return { app, server, io };
}

module.exports = { initWebServer };

