// Web Server for Bot Control Interface
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const session = require('express-session');
const path = require('path');
const { URLSearchParams } = require('url');
const { ChannelType } = require('discord.js');
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
        secret: process.env.SESSION_SECRET || 'seu-secret-super-seguro-aqui',
        resave: false,
        saveUninitialized: false,
        cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 horas
    }));
    
    // Middleware
    app.use(express.json());
    app.use(express.static(path.join(__dirname, '../../public')));
    
    // Middleware para verificar autenticação
    function requireAuth(req, res, next) {
        if (req.session.user) {
            return next();
        }
        res.redirect('/login');
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
                queue: Array.from(queue.tracks.values()).map(track => ({
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
    
    // API: Buscar música
    app.post('/api/search/:guildId', requireAuth, async (req, res) => {
        const startTime = Date.now();
        try {
            const { guildId } = req.params;
            const { query } = req.body;
            
            if (!query || !query.trim()) {
                return res.status(400).json({ success: false, error: 'Empty query' });
            }
            
            // Fast Spotify search
            try {
                const spotifyTracks = await fastSpotifySearch(query);
                
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
            const { guildId } = req.params;
            const { trackUrl, voiceChannelId, trackTitle, trackArtist } = req.body;
            
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
            
            // Criar ou obter fila
            if (!queue) {
                queue = player.nodes.create(guild, {
                    metadata: {
                        channel: voiceChannel
                    },
                    leaveOnEmpty: true,
                    leaveOnEnd: false,
                    leaveOnStop: true,
                    leaveOnEmptyCooldown: 15000
                });
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
            
            // Buscar no YouTube usando título e artista
            const searchQuery = trackArtist ? `${trackArtist} - ${trackTitle}` : trackTitle;
            const searchStartTime = Date.now();
            console.log(`🎬 Searching YouTube for: "${searchQuery}"`);
            
            const searchResult = await player.search(searchQuery, {
                requestedBy: null
            });
            
            const searchDuration = Date.now() - searchStartTime;
            console.log(`⏱️  YouTube search took ${searchDuration}ms`);
            
            if (!searchResult.hasTracks()) {
                return res.status(404).json({ 
                    success: false, 
                    error: 'Track not found on YouTube' 
                });
            }
            
            const track = searchResult.tracks[0];
            queue.addTrack(track);
            
            if (!queue.isPlaying()) {
                await queue.node.play();
            }
            
            console.log(`✅ Added "${track.title}" to queue`);
            
            res.json({ 
                success: true, 
                message: 'Song added to queue!',
                data: { 
                    title: track.title,
                    author: track.author,
                    duration: track.duration
                }
            });
            
            // Emitir para WebSocket
            io.to(guildId).emit('queueUpdate', { action: 'added', track: track.title });
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
             '/api/stop/:guildId', '/api/skip/:guildId'].join(', ')
        );
    });
    
    return { app, server, io };
}

module.exports = { initWebServer };

