// Bot Principal - Discord Music Bot
require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const { Player } = require('discord-player');
const { DefaultExtractors } = require('@discord-player/extractor');
const { YouTubeExtractor } = require('../utils/youtube-extractor');
const { initWebServer } = require('../server/web-server');

// Verificar variáveis de ambiente
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
if (!DISCORD_TOKEN) {
    console.error('❌ DISCORD_TOKEN não configurado! Configure no .env');
    process.exit(1);
}

// Criar cliente Discord
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent
    ]
});

// Criar Discord Player
let player;
try {
    player = new Player(client, {
        connectionTimeout: 30000,
        leaveOnEmpty: false, // Desabilitar saída automática - vamos controlar manualmente
        leaveOnEnd: false // Desabilitar saída automática - vamos controlar manualmente
    });
    console.log('✅ Discord Player criado');
} catch (error) {
    console.error('❌ Erro ao criar Discord Player:', error);
    process.exit(1);
}

// Armazenar timers de desconexão por servidor
const disconnectTimers = new Map(); // guildId -> timeout
const DISCONNECT_DELAY = 2 * 60 * 1000; // 2 minutos em milissegundos

// Registrar extractors
(async () => {
    try {
        await player.extractors.register(DefaultExtractors);
        console.log('✅ DefaultExtractors registrados');
        
        await player.extractors.register(YouTubeExtractor);
        console.log('✅ YouTubeExtractor registrado');
        
        console.log('✅ Todos os extractors registrados com sucesso');
    } catch (error) {
        console.error('❌ Erro ao registrar extractors:', error);
        console.error('Stack:', error.stack);
    }
})();

// Spotify credentials
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

let spotifyAccessToken = null;
let spotifyTokenExpiry = 0;

// Cache de buscas Spotify
const spotifyCache = new Map();
const SPOTIFY_CACHE_TTL = 5 * 60 * 1000;

// Função para formatar duração (segundos -> mm:ss ou hh:mm:ss)
function formatDuration(seconds) {
    // Verificar se é válido
    if (seconds === null || seconds === undefined || isNaN(seconds) || seconds < 0) {
        return 'Desconhecida';
    }
    
    // Converter para número se for string
    const duration = typeof seconds === 'string' ? parseFloat(seconds) : seconds;
    
    // Verificar novamente após conversão
    if (isNaN(duration) || duration < 0) {
        return 'Desconhecida';
    }
    
    // Se for 0, retornar desconhecida
    if (duration === 0) {
        return 'Desconhecida';
    }
    
    const hours = Math.floor(duration / 3600);
    const minutes = Math.floor((duration % 3600) / 60);
    const secs = Math.floor(duration % 60);
    
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// Armazenar seleções pendentes (para menu de escolha)
const pendingSelections = new Map();
const SELECTION_TTL = 30 * 1000; // 30 segundos

// Obter token Spotify
async function getSpotifyToken() {
    if (spotifyAccessToken && Date.now() < spotifyTokenExpiry) {
        return spotifyAccessToken;
    }
    
    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
        return null;
    }
    
    try {
        const fetch = require('node-fetch');
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')}`
            },
            body: 'grant_type=client_credentials'
        });

        const data = await response.json();
        if (data.access_token) {
            spotifyAccessToken = data.access_token;
            spotifyTokenExpiry = Date.now() + (data.expires_in * 1000);
            return spotifyAccessToken;
        }
    } catch (error) {
        console.error('❌ Erro ao obter token Spotify:', error.message);
    }
    
    return null;
}

// Função auxiliar para extrair artista do título (ex: "Song Name - Artist Name")
function extractArtistFromTitle(title) {
    if (!title) return null;
    
    // Padrões comuns: "Música - Artista", "Artista - Música", "Música | Artista"
    const patterns = [
        /^(.+?)\s*[-–—]\s*(.+?)$/,  // "Música - Artista"
        /^(.+?)\s*\|\s*(.+?)$/,      // "Música | Artista"
        /^(.+?)\s*by\s*(.+?)$/i,     // "Música by Artista"
        /^(.+?)\s*feat\.?\s*(.+?)$/i, // "Música feat. Artista"
    ];
    
    for (const pattern of patterns) {
        const match = title.match(pattern);
        if (match) {
            // Geralmente o artista vem depois do separador
            const artist = match[2]?.trim();
            if (artist && artist.length > 0 && artist.length < 100) {
                return artist;
            }
        }
    }
    
    return null;
}

// Buscar no Spotify (retorna um único resultado)
async function searchSpotify(query) {
    const cacheKey = query.toLowerCase().trim();
    const cached = spotifyCache.get(cacheKey);
    if (cached && Date.now() < cached.expiry) {
        return cached.data;
    }

    const token = await getSpotifyToken();
    if (!token) return null;
    
    try {
        const fetch = require('node-fetch');
        const response = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await response.json();
        if (data.tracks?.items?.length > 0) {
            const track = data.tracks.items[0];
            const result = {
                name: track.name,
                artist: track.artists[0]?.name || 'Unknown',
                url: track.external_urls?.spotify || null
            };
            
            spotifyCache.set(cacheKey, {
                data: result,
                expiry: Date.now() + SPOTIFY_CACHE_TTL
            });
            
            return result;
        }
    } catch (error) {
        console.error('❌ Erro na busca Spotify:', error.message);
    }
    
    return null;
}

// Buscar múltiplos resultados no Spotify (para diversidade de artistas)
async function searchSpotifyMultiple(query, limit = 10) {
    const cacheKey = `${query.toLowerCase().trim()}_multi_${limit}`;
    const cached = spotifyCache.get(cacheKey);
    if (cached && Date.now() < cached.expiry) {
        return cached.data;
    }
    
    const token = await getSpotifyToken();
    if (!token) return null;
    
    try {
        const fetch = require('node-fetch');
        const response = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=${Math.min(limit, 20)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        if (data.tracks?.items?.length > 0) {
            const results = data.tracks.items.map(track => ({
                name: track.name,
                artist: track.artists[0]?.name || 'Unknown',
                artists: track.artists.map(a => a.name).join(', '),
                url: track.external_urls?.spotify || null
            }));
            
            spotifyCache.set(cacheKey, {
                data: results,
                expiry: Date.now() + SPOTIFY_CACHE_TTL
            });
            
            return results;
        }
    } catch (error) {
        console.error('❌ Erro na busca múltipla Spotify:', error.message);
    }
    
    return null;
}

// Registrar comandos slash
async function registerCommands() {
    const { REST, Routes } = require('discord.js');
    const commands = [
        {
            name: 'play',
            description: 'Toca uma música ou adiciona à fila',
            options: [{
                name: 'busca',
                type: 3,
                description: 'Nome da música, artista ou URL',
                required: true
            }]
        },
        {
            name: 'skip',
            description: 'Pula a música atual'
        },
        {
            name: 'pause',
            description: 'Pausa a reprodução'
        },
        {
            name: 'resume',
            description: 'Retoma a reprodução'
        },
        {
            name: 'stop',
            description: 'Para a música e limpa a fila'
        },
        {
            name: 'queue',
            description: 'Mostra a fila de músicas',
            options: [{
                name: 'pagina',
                type: 4,
                description: 'Página da fila',
                required: false
            }]
        },
        {
            name: 'ping',
            description: 'Verifica se o bot está online'
        }
    ];
    
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    
    try {
        console.log('🔄 Registrando comandos slash...');
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
        );
        console.log('✅ Comandos slash registrados');
    } catch (error) {
        console.error('❌ Erro ao registrar comandos:', error);
    }
}

// Eventos do bot
client.once('ready', async () => {
    console.log(`✅ Bot conectado como ${client.user.tag}`);
    console.log(`📊 Bot está em ${client.guilds.cache.size} servidores`);
    
    // Registrar comandos
    await registerCommands();
    
    try {
        // Inicializar web server
        initWebServer(client, player);
        console.log('✅ Web server inicializado');
    } catch (error) {
        console.error('❌ Erro ao inicializar web server:', error);
    }
});

// Armazenar mensagens de controle de música por servidor
const nowPlayingMessages = new Map(); // guildId -> message

// ⚡ PRÉ-AQUECER PRÓXIMA MÚSICA: Quando uma música começa, pré-aquecer a próxima automaticamente
player.events.on('playerStart', async (queue, track) => {
    // Cancelar timer de desconexão se existir (música começou a tocar)
    const existingTimer = disconnectTimers.get(queue.guild.id);
    if (existingTimer) {
        clearTimeout(existingTimer);
        disconnectTimers.delete(queue.guild.id);
        console.log(`✅ Timer de desconexão cancelado para ${queue.guild.name} (música iniciou)`);
    }
    
    const extractor = player.extractors.store.get('com.custom.youtube-extractor');
    if (!extractor) return;
    
    // Pré-aquecer próxima música da fila em background
    const nextTrack = queue.tracks.at(0);
    if (nextTrack) {
        try {
            extractor.preheatStream(nextTrack.url);
        } catch (error) {
            // Falha silenciosa
        }
    }
    
    // Criar embed de "Now Playing" com botões de controle
    const channel = queue.metadata?.channel || queue.channel;
    if (!channel) return;
    
    try {
        // Verificar e formatar duração corretamente
        let durationValue = track.duration;
        
        // Se duration for string no formato "mm:ss" ou "hh:mm:ss", converter para segundos
        if (typeof durationValue === 'string' && durationValue.includes(':')) {
            const parts = durationValue.split(':').map(p => parseInt(p) || 0);
            if (parts.length === 2) {
                durationValue = parts[0] * 60 + parts[1];
            } else if (parts.length === 3) {
                durationValue = parts[0] * 3600 + parts[1] * 60 + parts[2];
            }
        }
        
        // Se duration for um objeto Duration do Discord Player, extrair msToSeconds
        if (durationValue && typeof durationValue === 'object' && durationValue.ms !== undefined) {
            durationValue = durationValue.ms / 1000; // Converter de ms para segundos
        }
        
        const duration = formatDuration(durationValue);
        const nextTrackInfo = queue.tracks.at(0) ? `**${queue.tracks.at(0).title}**` : 'Nenhuma';
        
        const embed = new EmbedBuilder()
            .setTitle('🎵 Tocando Agora')
            .setDescription(`**${track.title}**`)
            .setColor(0x1DB954)
            .setThumbnail(track.thumbnail || null)
            .addFields(
                { name: '👤 Artista', value: track.author || 'Unknown', inline: true },
                { name: '⏱️ Duração', value: duration, inline: true },
                { name: '📊 Status', value: queue.node.isPaused() ? '⏸️ Pausado' : '▶️ Reproduzindo', inline: true },
                { name: '📋 Próxima', value: nextTrackInfo, inline: false }
            )
            .setFooter({ text: `Requisitado por: ${track.requestedBy?.displayName || 'Unknown'}` })
            .setTimestamp();
        
        // Criar botões de controle
        const controlButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('control_pause')
                    .setLabel(queue.node.isPaused() ? '▶️ Retomar' : '⏸️ Pausar')
                    .setStyle(queue.node.isPaused() ? ButtonStyle.Success : ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('control_skip')
                    .setLabel('⏭️ Pular')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('control_stop')
                    .setLabel('⏹️ Parar')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('control_queue')
                    .setLabel('📋 Fila')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('control_refresh')
                    .setLabel('🔄 Atualizar')
                    .setStyle(ButtonStyle.Secondary)
            );
        
        // Enviar ou atualizar mensagem de controle
        const existingMessage = nowPlayingMessages.get(queue.guild.id);
        if (existingMessage) {
            try {
                await existingMessage.edit({ embeds: [embed], components: [controlButtons] });
            } catch (error) {
                // Mensagem não existe mais, criar nova
                const message = await channel.send({ embeds: [embed], components: [controlButtons] });
                nowPlayingMessages.set(queue.guild.id, message);
            }
        } else {
            const message = await channel.send({ embeds: [embed], components: [controlButtons] });
            nowPlayingMessages.set(queue.guild.id, message);
        }
    } catch (error) {
        console.error('Erro ao criar embed de Now Playing:', error);
    }
});

// Handler para quando a fila acabar (vazia)
player.events.on('emptyQueue', (queue) => {
    console.log(`📭 Fila vazia em ${queue.guild.name}`);
    const channel = queue.metadata?.channel || queue.channel;
    
    // Cancelar timer anterior se existir
    const existingTimer = disconnectTimers.get(queue.guild.id);
    if (existingTimer) {
        clearTimeout(existingTimer);
    }
    
    // Criar novo timer para desconectar após 2 minutos
    const timer = setTimeout(async () => {
        try {
            if (queue.connection && queue.connection.state.status !== 'destroyed') {
                queue.connection.disconnect();
                console.log(`👋 Bot desconectado de ${queue.guild.name} após 2 minutos de inatividade`);
                
                // Limpar mensagem de controle
                const message = nowPlayingMessages.get(queue.guild.id);
                if (message) {
        try {
            const embed = new EmbedBuilder()
                            .setTitle('⏹️ Fila Finalizada')
                            .setDescription('A fila terminou e não há mais músicas para tocar.')
                            .setColor(0x808080)
                            .setFooter({ text: 'Bot sairá em breve se não houver atividade' })
                .setTimestamp();
                        await message.edit({ embeds: [embed], components: [] });
        } catch (error) {
                        // Mensagem pode não existir mais
                    }
                    nowPlayingMessages.delete(queue.guild.id);
                }
                
                // Enviar mensagem no canal se disponível
                if (channel) {
                    try {
                        await channel.send('⏹️ Fila finalizada. Bot sairá do canal de voz em breve.');
                    } catch (error) {
                        // Pode não ter permissão
                    }
                }
            }
        } catch (error) {
            console.error(`❌ Erro ao desconectar de ${queue.guild.name}:`, error);
        }
        
        disconnectTimers.delete(queue.guild.id);
    }, DISCONNECT_DELAY);
    
    disconnectTimers.set(queue.guild.id, timer);
    console.log(`⏱️ Timer de desconexão iniciado para ${queue.guild.name} (2 minutos)`);
});

// Handler para quando música adicionada à fila (cancelar timer de desconexão)
player.events.on('audioTrackAdd', (queue, track) => {
    console.log(`➕ Música adicionada à fila em ${queue.guild.name}: ${track.title}`);
    
    // Cancelar timer de desconexão se existir
    const existingTimer = disconnectTimers.get(queue.guild.id);
    if (existingTimer) {
        clearTimeout(existingTimer);
        disconnectTimers.delete(queue.guild.id);
        console.log(`✅ Timer de desconexão cancelado para ${queue.guild.name}`);
    }
});


// Função para atualizar embed de Now Playing
async function updateNowPlayingEmbed(queue) {
    const message = nowPlayingMessages.get(queue.guild.id);
    if (!message || !queue.currentTrack) return;
    
    try {
        const track = queue.currentTrack;
        
        // Verificar e formatar duração corretamente
        let durationValue = track.duration;
        
        // Se duration for string no formato "mm:ss" ou "hh:mm:ss", converter para segundos
        if (typeof durationValue === 'string' && durationValue.includes(':')) {
            const parts = durationValue.split(':').map(p => parseInt(p) || 0);
            if (parts.length === 2) {
                durationValue = parts[0] * 60 + parts[1];
            } else if (parts.length === 3) {
                durationValue = parts[0] * 3600 + parts[1] * 60 + parts[2];
            }
        }
        
        // Se duration for um objeto Duration do Discord Player, extrair msToSeconds
        if (durationValue && typeof durationValue === 'object' && durationValue.ms !== undefined) {
            durationValue = durationValue.ms / 1000; // Converter de ms para segundos
        }
        
        const duration = formatDuration(durationValue);
        const nextTrackInfo = queue.tracks.at(0) ? `**${queue.tracks.at(0).title}**` : 'Nenhuma';
        
        const embed = new EmbedBuilder()
            .setTitle('🎵 Tocando Agora')
            .setDescription(`**${track.title}**`)
            .setColor(0x1DB954)
            .setThumbnail(track.thumbnail || null)
            .addFields(
                { name: '👤 Artista', value: track.author || 'Unknown', inline: true },
                { name: '⏱️ Duração', value: duration, inline: true },
                { name: '📊 Status', value: queue.node.isPaused() ? '⏸️ Pausado' : '▶️ Reproduzindo', inline: true },
                { name: '📋 Próxima', value: nextTrackInfo, inline: false }
            )
            .setFooter({ text: `Requisitado por: ${track.requestedBy?.displayName || 'Unknown'}` })
            .setTimestamp();
        
        const controlButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('control_pause')
                    .setLabel(queue.node.isPaused() ? '▶️ Retomar' : '⏸️ Pausar')
                    .setStyle(queue.node.isPaused() ? ButtonStyle.Success : ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('control_skip')
                    .setLabel('⏭️ Pular')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('control_stop')
                    .setLabel('⏹️ Parar')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('control_queue')
                    .setLabel('📋 Fila')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('control_refresh')
                    .setLabel('🔄 Atualizar')
                    .setStyle(ButtonStyle.Secondary)
            );
        
        await message.edit({ embeds: [embed], components: [controlButtons] });
    } catch (error) {
        // Mensagem não existe mais
        nowPlayingMessages.delete(queue.guild.id);
    }
}

// Handler de interações (comandos slash, botões e select menus)
client.on('interactionCreate', async (interaction) => {
    // Handler para botões de controle de música
    if (interaction.isButton() && interaction.customId.startsWith('control_')) {
        const queue = player.nodes.get(interaction.guildId);
        if (!queue) {
            await interaction.reply({ content: '❌ Não há música tocando!', ephemeral: true });
                    return;
                }
                
                await interaction.deferUpdate();

        const control = interaction.customId.replace('control_', '');
        
        switch (control) {
            case 'pause':
                if (queue.node.isPaused()) {
                    queue.node.resume();
                } else {
                    queue.node.pause();
                }
                await updateNowPlayingEmbed(queue);
                break;
                
            case 'skip':
                if (queue.tracks.size === 0) {
                    await interaction.followUp({ content: '❌ Não há próxima música na fila!', ephemeral: true });
                    return;
                }
                queue.node.skip();
                await interaction.followUp({ content: '⏭️ Música pulada!', ephemeral: true });
                break;
                
            case 'stop':
                queue.node.stop();
                queue.tracks.clear();
                nowPlayingMessages.delete(interaction.guildId);
                await interaction.followUp({ content: '⏹️ Música parada e fila limpa!', ephemeral: true });
                break;
                
            case 'queue':
                if (queue.tracks.size === 0) {
                    await interaction.followUp({ content: '❌ A fila está vazia!', ephemeral: true });
                    return;
                }

                const queueList = queue.tracks.slice(0, 10).map((track, index) => 
                    `**${index + 1}.** ${track.title} - ${track.author || 'Unknown'}`
                ).join('\n');
                
                const queueEmbed = new EmbedBuilder()
                    .setTitle('📋 Fila de Músicas')
                    .setDescription(queueList)
                    .setColor(0x1DB954)
                    .setFooter({ text: `Total: ${queue.tracks.size} músicas` })
                    .setTimestamp();

                await interaction.followUp({ embeds: [queueEmbed], ephemeral: true });
                break;
                
            case 'refresh':
                await updateNowPlayingEmbed(queue);
                await interaction.followUp({ content: '🔄 Embed atualizado!', ephemeral: true });
                break;
        }
        return;
    }
    
    // Handler para Select Menu de seleção de música
    if (interaction.isStringSelectMenu() && interaction.customId === 'select_music') {
        const selectedValue = interaction.values[0];
        const selectionId = selectedValue.replace('select_', '');
        const index = parseInt(selectionId);
        
        // Procurar seleção pendente
        let foundSelection = null;
        let foundKey = null;
        
        for (const [key, selection] of pendingSelections.entries()) {
            if (selection.userId === interaction.user.id && Date.now() < selection.expiry) {
                foundSelection = selection;
                foundKey = key;
                break;
            }
        }
        
        if (!foundSelection || index >= foundSelection.tracks.length || index < 0) {
            await interaction.reply({ content: '❌ Seleção inválida ou expirada!', ephemeral: true });
                    return;
                }

        const selectedTrack = foundSelection.tracks[index];
        
        const selectStart = Date.now();
        console.log(`\n⏱️ [TIMING] === SELEÇÃO DE MÚSICA DO MENU ===`);
        console.log(`⏱️ [TIMING] Track selecionado: "${selectedTrack.title}"`);
        console.log(`⏱️ [TIMING] Usuário: ${interaction.user.tag}`);
        
        const deferStart = Date.now();
        await interaction.deferUpdate();
        const deferEnd = Date.now();
        console.log(`⏱️ [TIMING] Button - deferUpdate: ${deferEnd - deferStart}ms`);
        
        try {
            // ⚡ Stream já deve estar pré-aquecido (todas as músicas do menu são pré-aquecidas)
            // Se não estiver, o extractor.stream() criará um novo
            
            // Criar ou obter queue
            const queueStart = Date.now();
            let queue = player.nodes.get(foundSelection.guildId);
            if (!queue) {
                queue = player.nodes.create(interaction.guild, {
                    metadata: {
                        channel: foundSelection.channel
                    }
                });
            }
            const queueEnd = Date.now();
            console.log(`⏱️ [TIMING] Select - Obter/criar queue: ${queueEnd - queueStart}ms`);
            
            // Conectar ao canal de voz
            const connectStart = Date.now();
            if (!queue.connection) {
                await queue.connect(foundSelection.voiceChannel);
            }
            const connectEnd = Date.now();
            console.log(`⏱️ [TIMING] Select - Conectar ao canal: ${connectEnd - connectStart}ms`);
            
            // Adicionar à fila
            const addStart = Date.now();
            queue.addTrack(selectedTrack);
            const addEnd = Date.now();
            console.log(`⏱️ [TIMING] Select - Adicionar track: ${addEnd - addStart}ms`);
            console.log(`📊 [DEBUG] Fila após adicionar: ${queue.tracks.size} músicas`);
            console.log(`📊 [DEBUG] isPlaying: ${queue.isPlaying()}`);
            
            // Remover seleção pendente
            pendingSelections.delete(foundKey);
            
            // Verificar se precisa iniciar reprodução ANTES de criar embed
                const wasPlaying = queue.isPlaying();
            if (!wasPlaying) {
                console.log(`🎵 [DEBUG] Iniciando reprodução - fila não estava tocando`);
                const playStart = Date.now();
                await queue.node.play();
                const playEnd = Date.now();
                console.log(`⏱️ [TIMING] Select - Iniciar reprodução: ${playEnd - playStart}ms`);
            }
            
            // Atualizar mensagem com feedback visual melhorado
            const embedStart = Date.now();
            const embed = new EmbedBuilder()
                .setTitle('✅ Música selecionada!')
                .setDescription(`**${selectedTrack.title}**`)
                .setColor(0x1DB954);
            
            if (selectedTrack.thumbnail) {
                embed.setThumbnail(selectedTrack.thumbnail);
            }
            
            // Verificar e formatar duração corretamente
            let durationValue = selectedTrack.duration;
            if (typeof durationValue === 'string' && durationValue.includes(':')) {
                const parts = durationValue.split(':').map(p => parseInt(p) || 0);
                if (parts.length === 2) {
                    durationValue = parts[0] * 60 + parts[1];
                } else if (parts.length === 3) {
                    durationValue = parts[0] * 3600 + parts[1] * 60 + parts[2];
                }
            }
            if (durationValue && typeof durationValue === 'object' && durationValue.ms !== undefined) {
                durationValue = durationValue.ms / 1000;
            }
            const duration = formatDuration(durationValue);
            embed.addFields(
                { name: '👤 Artista', value: selectedTrack.author || 'Unknown', inline: true },
                { name: '⏱️ Duração', value: duration, inline: true }
            );
            
            if (queue.isPlaying()) {
                embed.addFields({ name: '📊 Status', value: '✅ Adicionada à fila', inline: false });
                embed.setFooter({ text: `Total na fila: ${queue.tracks.size} músicas` });
                const embedEnd = Date.now();
                console.log(`⏱️ [TIMING] Select - Criar embed (fila): ${embedEnd - embedStart}ms`);
                } else {
                embed.addFields({ name: '📊 Status', value: '🎵 Tocando agora!', inline: false });
                embed.setFooter({ text: '⚡ Stream pré-aquecido - início instantâneo!' });
                const embedEnd = Date.now();
                console.log(`⏱️ [TIMING] Select - Criar embed (tocando): ${embedEnd - embedStart}ms`);
            }
            
            const replyStart = Date.now();
                await interaction.editReply({ 
                    embeds: [embed], 
                    components: [] 
                });
            const replyEnd = Date.now();
            console.log(`⏱️ [TIMING] Select - Enviar resposta: ${replyEnd - replyStart}ms`);

            const totalTime = Date.now() - selectStart;
            console.log(`⏱️ [TIMING] === TOTAL (seleção do menu): ${totalTime}ms ===\n`);
            } catch (error) {
            console.error('❌ Erro ao tocar música selecionada:', error);
            await interaction.editReply({
                content: `❌ Erro ao tocar música: ${error.message}`,
                components: []
            });
            }
            return;
    }

    if (!interaction.isChatInputCommand()) return;

    try {
    const { commandName } = interaction;

        if (commandName === 'ping') {
            await interaction.reply('🏓 Pong!');
                return;
            }

        if (commandName === 'play') {
            const query = interaction.options.getString('busca');
            if (!query) {
                await interaction.reply('❌ Por favor, forneça um termo de busca ou URL.');
                return;
            }
            
            const voiceChannel = interaction.member?.voice?.channel;
            if (!voiceChannel) {
                await interaction.reply('❌ Você precisa estar em um canal de voz!');
                return;
            }
            
            // ⚡ FEEDBACK IMEDIATO: Responder instantaneamente para melhor UX
            // Discord tem limite de 3s para responder, então respondemos imediatamente
            const startTime = Date.now();
            console.log(`\n⏱️ [TIMING] === NOVA BUSCA INICIADA ===`);
            console.log(`⏱️ [TIMING] Query: "${query}"`);
            console.log(`⏱️ [TIMING] Usuário: ${interaction.user.tag}`);
            
            const stepStart = Date.now();
            await interaction.deferReply();
            const stepEnd = Date.now();
            console.log(`⏱️ [TIMING] Step 1 - deferReply: ${stepEnd - stepStart}ms`);
            
            // Mostrar mensagem de "Buscando..." imediatamente (feedback visual)
            const loadingEmbed = new EmbedBuilder()
                .setTitle('🔍 Buscando música...')
                .setDescription(`**${query}**`)
                .setColor(0x1DB954)
                .setFooter({ text: 'Isso pode levar alguns segundos...' });
            
            const stepStart2 = Date.now();
            await interaction.editReply({ embeds: [loadingEmbed] });
            const stepEnd2 = Date.now();
            console.log(`⏱️ [TIMING] Step 2 - editReply (loading): ${stepEnd2 - stepStart2}ms`);
            
            try {
                // ⚡ ESTRATÉGIA OTIMIZADA: Buscar diretamente no YouTube (rápido) e usar Spotify apenas para melhorar artistas
                // Isso é muito mais rápido que buscar cada música individualmente
                const stepStart3 = Date.now();
                const spotifyTracksPromise = searchSpotifyMultiple(query, 5); // Buscar apenas 5 no Spotify (em paralelo)
                
                // Buscar diretamente no YouTube (rápido - retorna múltiplos resultados)
                const stepStart4 = Date.now();
                const youtubeSearchResult = await player.search(query, {
                            requestedBy: interaction.user
                        });
                const stepEnd4 = Date.now();
                console.log(`⏱️ [TIMING] Step 4 - Busca YouTube: ${stepEnd4 - stepStart4}ms`);
                
                // Aguardar Spotify (já foi iniciado em paralelo)
                const spotifyTracks = await spotifyTracksPromise;
                const stepEnd3 = Date.now();
                if (spotifyTracks && spotifyTracks.length > 0) {
                    console.log(`⏱️ [TIMING] Step 3 - Busca Spotify (paralelo): ${stepEnd3 - stepStart3}ms (${spotifyTracks.length} resultados)`);
                        } else {
                    console.log(`⏱️ [TIMING] Step 3 - Busca Spotify (paralelo): ${stepEnd3 - stepStart3}ms (não encontrado)`);
                        }
                
                if (!youtubeSearchResult.hasTracks()) {
                    await interaction.editReply('❌ Não foi possível encontrar a música no YouTube.');
                        return;
                }
                
                const extractor = player.extractors.store.get('com.custom.youtube-extractor');
                let allTracks = youtubeSearchResult.tracks;
                
                // ⚡ PRÉ-AQUECER OTIMIZADO: Iniciar streams em paralelo (não bloqueante) para TODOS os resultados
                // Isso torna a experiência muito mais rápida!
                if (extractor && allTracks.length > 0) {
                    const preheatStart = Date.now();
                    
                    // Pré-aquecer em paralelo (não bloqueia) - apenas inicia os processos
                    const tracksToPreheat = allTracks.slice(0, 10);
                    
                    tracksToPreheat.forEach(track => {
                        if (track.url) {
                            // Executar em background sem await (não bloqueia) - SEM LOGS durante
                            setImmediate(() => {
                                try {
                                    extractor.preheatStream(track.url);
                                } catch (error) {
                                    // Erro silencioso
                                }
                            });
                        }
                    });
                    
                    const preheatEnd = Date.now();
                    const preheatInitTime = preheatEnd - preheatStart;
                    // Log único após iniciar tudo
                    console.log(`⚡ [PREHEAT] Pré-aquecimento iniciado: ${tracksToPreheat.length} streams (${preheatInitTime}ms)`);
                }
                
                // Melhorar artistas usando dados do Spotify (se disponível)
                if (spotifyTracks && spotifyTracks.length > 0) {
                    // Criar mapa de nomes de músicas para artistas do Spotify
                    const spotifyMap = new Map();
                    spotifyTracks.forEach(st => {
                        const key = st.name.toLowerCase().trim();
                        if (!spotifyMap.has(key)) {
                            spotifyMap.set(key, st.artist);
                        }
                    });
                    
                    // Tentar melhorar artistas dos resultados do YouTube
                    allTracks.forEach(track => {
                        const trackTitle = track.title.toLowerCase().trim();
                        // Tentar encontrar correspondência no Spotify
                        for (const [spotifyName, spotifyArtist] of spotifyMap.entries()) {
                            if (trackTitle.includes(spotifyName) || spotifyName.includes(trackTitle.split(' - ')[0])) {
                                track.author = spotifyArtist;
                                break;
                            }
                        }
                    });
                }
                
                // Criar objeto de resultado compatível com o código existente
                const searchResult = {
                    hasTracks: () => allTracks.length > 0,
                    tracks: allTracks
                };
                
                // ⚡ PRÉ-AQUECER IMEDIATAMENTE: Iniciar streams assim que a busca retornar
                // Isso torna a experiência muito mais rápida!
                // (extractor já foi obtido acima na linha 841)
                
                // Se encontrar múltiplas músicas (mais de 1) e não for URL, mostrar menu de seleção
                // Se for apenas 1 resultado, tocar diretamente
                if (searchResult.tracks.length > 1 && !query.startsWith('http')) {
                    const stepStart5 = Date.now();
                    console.log(`🎵 Menu de seleção: ${searchResult.tracks.length} músicas encontradas`);
                    const tracks = searchResult.tracks.slice(0, 10); // Máximo 10 opções
                    
                    // ✨ Limpar/extrair artista de cada música individualmente
                    // Isso mantém a diversidade de artistas (não aplicar o mesmo artista a todas)
                    tracks.forEach(track => {
                        // Primeiro, tentar extrair do título (ex: "Música - Artista")
                        const extractedArtist = extractArtistFromTitle(track.title);
                        if (extractedArtist) {
                            track.author = extractedArtist;
                        } else if (track.author) {
                            // Limpar sufixos comuns do YouTube (VEVO, Topic, etc.)
                            let cleanAuthor = track.author
                                .replace(/\s*VEVO\s*$/i, '')
                                .replace(/\s*Topic\s*$/i, '')
                                .replace(/\s*-\s*VEVO\s*$/i, '')
                                .replace(/\s*-\s*Topic\s*$/i, '')
                                .trim();
                            
                            if (cleanAuthor && cleanAuthor !== track.author) {
                                track.author = cleanAuthor;
                            }
                        }
                    });
                    console.log(`✨ [ARTIST] Limpando/extraindo artista dos títulos (mantendo diversidade)`);
                    
                    // ⚡ PRÉ-AQUECER: TODAS as músicas do menu em background (não bloqueia)!
                    // Quando usuário escolher, stream já estará pronto!
                    if (extractor) {
                        const preheatStart = Date.now();
                        
                        // Pré-aquecer em paralelo (não bloqueia) - SEM LOGS durante
                        tracks.forEach(track => {
                            if (track.url) {
                                setImmediate(() => {
                                    try {
                                        extractor.preheatStream(track.url);
                                    } catch (error) {
                                        // Erro silencioso
                                    }
                                });
                            }
                        });
                        
                        const preheatEnd = Date.now();
                        const preheatInitTime = preheatEnd - preheatStart;
                        // Log único após iniciar tudo
                        console.log(`⚡ [PREHEAT-MENU] Pré-aquecimento iniciado: ${tracks.length} opções (${preheatInitTime}ms)`);
                    }
                    
                    // Criar embed melhorado com layout visual
                    const embedStart = Date.now();
                    const embed = new EmbedBuilder()
                        .setTitle('🎵 Escolha uma música')
                        .setDescription(`**${tracks.length}** resultados encontrados para **"${query}"**\n\n*✨ Todas as opções já estão pré-aquecidas para início instantâneo!*`)
                        .setColor(0x1DB954)
                        .setFooter({ text: 'Use o menu abaixo para selecionar uma música' })
                        .setTimestamp();
                    
                    // Adicionar até 3 primeiras músicas como preview no embed
                    const previewTracks = tracks.slice(0, 3);
                    let description = `**${tracks.length}** resultados encontrados para **"${query}"**\n\n`;
                    description += '*✨ Todas as opções já estão pré-aquecidas para início instantâneo!*\n\n';
                    description += '**Preview:**\n';
                    
                    previewTracks.forEach((track, index) => {
                        let durationValue = track.duration;
                        if (typeof durationValue === 'string' && durationValue.includes(':')) {
                            const parts = durationValue.split(':').map(p => parseInt(p) || 0);
                            if (parts.length === 2) {
                                durationValue = parts[0] * 60 + parts[1];
                            } else if (parts.length === 3) {
                                durationValue = parts[0] * 3600 + parts[1] * 60 + parts[2];
                            }
                        }
                        if (durationValue && typeof durationValue === 'object' && durationValue.ms !== undefined) {
                            durationValue = durationValue.ms / 1000;
                        }
                        const duration = formatDuration(durationValue);
                        const title = track.title.length > 50 ? track.title.substring(0, 47) + '...' : track.title;
                        description += `**${index + 1}.** ${title}\n` +
                                     `   👤 ${track.author || 'Unknown'} • ⏱️ ${duration}\n\n`;
                    });
                    
                    if (tracks.length > 3) {
                        description += `*... e mais ${tracks.length - 3} opções no menu abaixo*`;
                    }
                    
                    embed.setDescription(description);
                    
                    // Usar thumbnail da primeira música se disponível
                    if (tracks[0]?.thumbnail) {
                        embed.setThumbnail(tracks[0].thumbnail);
                    }
                    
                    // Criar Select Menu (dropdown) - mais elegante que botões
                    const selectMenu = new StringSelectMenuBuilder()
                        .setCustomId('select_music')
                        .setPlaceholder('🎵 Selecione uma música para tocar...')
                        .setMinValues(1)
                        .setMaxValues(1);
                    
                    // Adicionar opções ao select menu (máximo 25 opções)
                    // Discord limita: Label = 100 chars, Description = 100 chars
                    tracks.slice(0, 25).forEach((track, index) => {
                        let durationValue = track.duration;
                        if (typeof durationValue === 'string' && durationValue.includes(':')) {
                            const parts = durationValue.split(':').map(p => parseInt(p) || 0);
                            if (parts.length === 2) {
                                durationValue = parts[0] * 60 + parts[1];
                            } else if (parts.length === 3) {
                                durationValue = parts[0] * 3600 + parts[1] * 60 + parts[2];
                            }
                        }
                        if (durationValue && typeof durationValue === 'object' && durationValue.ms !== undefined) {
                            durationValue = durationValue.ms / 1000;
                        }
                        const duration = formatDuration(durationValue);
                        
                        // Limpar e formatar título para o label
                        // Limitar a 90 chars (deixar espaço para número + formatação)
                        let cleanTitle = track.title.trim();
                        // Remover caracteres problemáticos que podem quebrar o Discord
                        cleanTitle = cleanTitle.replace(/[\u200B-\u200D\uFEFF]/g, ''); // Remove zero-width chars
                        cleanTitle = cleanTitle.replace(/\s+/g, ' '); // Múltiplos espaços -> 1 espaço
                        
                        // Calcular espaço necessário para o número (ex: "10. " = 4 chars)
                        const numberPrefix = `${index + 1}. `;
                        const maxTitleLength = 100 - numberPrefix.length;
                        
                        if (cleanTitle.length > maxTitleLength) {
                            cleanTitle = cleanTitle.substring(0, maxTitleLength - 3) + '...';
                        }
                        
                        const label = `${index + 1}. ${cleanTitle}`;
                        
                        // Formatar description (artista + duração)
                        const artist = (track.author || 'Unknown').trim();
                        const descriptionText = `${artist} • ${duration}`;
                        const description = descriptionText.length > 100 
                            ? descriptionText.substring(0, 97) + '...' 
                            : descriptionText;
                        
                        selectMenu.addOptions(
                            new StringSelectMenuOptionBuilder()
                                .setLabel(label)
                                .setDescription(description)
                                .setValue(`select_${index}`)
                                .setEmoji('🎵')
                        );
                    });
                    
                    const rows = [
                        new ActionRowBuilder().addComponents(selectMenu)
                    ];
                    
                    // Armazenar seleções pendentes (usar customId do select menu)
                    pendingSelections.set('select_music', {
                        tracks: tracks,
                        guildId: interaction.guildId,
                        voiceChannel: voiceChannel,
                        channel: interaction.channel,
                        userId: interaction.user.id,
                        expiry: Date.now() + SELECTION_TTL
                    });
                    
                    // Limpar seleções expiradas
            setTimeout(() => {
                        pendingSelections.delete('select_music');
                    }, SELECTION_TTL);
                    
                    const embedEnd = Date.now();
                    console.log(`⏱️ [TIMING] Step 6 - Criar embed e botões: ${embedEnd - embedStart}ms`);
                    
                    const replyStart = Date.now();
                    await interaction.editReply({
                        embeds: [embed],
                        components: rows
                    });
                    const replyEnd = Date.now();
                    console.log(`⏱️ [TIMING] Step 7 - Enviar resposta (menu): ${replyEnd - replyStart}ms`);
                    
                    const totalTime = Date.now() - startTime;
                    console.log(`⏱️ [TIMING] === TOTAL (até menu): ${totalTime}ms ===\n`);
                return;
            }
            
                // Se apenas uma música ou URL, tocar diretamente
                const track = searchResult.tracks[0];
                console.log(`⏱️ [TIMING] Track selecionado: "${track.title}"`);
                
                // ✨ Usar artista do Spotify se disponível (melhor identificação)
                // Se tivermos resultados do Spotify, usar o primeiro para o artista
                let spotifyTrack = null;
                if (spotifyTracks && spotifyTracks.length > 0) {
                    spotifyTrack = spotifyTracks[0];
                }
                
                if (spotifyTrack && spotifyTrack.artist) {
                    track.author = spotifyTrack.artist;
                    console.log(`✨ [ARTIST] Usando artista do Spotify: ${spotifyTrack.artist}`);
                } else {
                    // Tentar extrair artista do título (ex: "Música - Artista")
                    const extractedArtist = extractArtistFromTitle(track.title);
                    if (extractedArtist) {
                        track.author = extractedArtist;
                        console.log(`✨ [ARTIST] Extraído do título: ${extractedArtist}`);
                    } else if (track.author) {
                        // Limpar sufixos comuns do YouTube (VEVO, Topic, etc.)
                        let cleanAuthor = track.author
                            .replace(/\s*VEVO\s*$/i, '')
                            .replace(/\s*Topic\s*$/i, '')
                            .replace(/\s*-\s*VEVO\s*$/i, '')
                            .replace(/\s*-\s*Topic\s*$/i, '')
                            .trim();
                        
                        if (cleanAuthor && cleanAuthor !== track.author) {
                            track.author = cleanAuthor;
                            console.log(`✨ [ARTIST] Limpado: ${track.author} -> ${cleanAuthor}`);
                        }
                    }
                }
                
                // ⚡ PRÉ-AQUECER: Iniciar stream em background ANTES de criar queue (não bloqueia)
                // Isso torna a experiência muito mais rápida!
                const stepStart5 = Date.now();
                if (extractor && track.url) {
                    // Executar em background sem await (não bloqueia a execução)
                    setImmediate(() => {
                        try {
                            extractor.preheatStream(track.url);
        } catch (error) {
                            // Falha silenciosa - não é crítico
                        }
                    });
                }
                const stepEnd5 = Date.now();
                console.log(`⚡ Pré-aquecimento iniciado (background): ${stepEnd5 - stepStart5}ms`);
                
                // Criar ou obter queue
                const stepStart6 = Date.now();
                let queue = player.nodes.get(interaction.guildId);
                if (!queue) {
                    queue = player.nodes.create(interaction.guild, {
                        metadata: {
                            channel: interaction.channel
                        }
                    });
                }
                const stepEnd6 = Date.now();
                console.log(`⏱️ [TIMING] Step 6 - Obter/criar queue: ${stepEnd6 - stepStart6}ms`);
                
                // Conectar ao canal de voz
                const stepStart7 = Date.now();
                if (!queue.connection) {
                    await queue.connect(voiceChannel);
                }
                const stepEnd7 = Date.now();
                console.log(`⏱️ [TIMING] Step 7 - Conectar ao canal de voz: ${stepEnd7 - stepStart7}ms`);
                
                // Adicionar à fila
                const stepStart8 = Date.now();
                queue.addTrack(track);
                const stepEnd8 = Date.now();
                console.log(`⏱️ [TIMING] Step 8 - Adicionar track à fila: ${stepEnd8 - stepStart8}ms`);
                console.log(`📊 [DEBUG] Fila após adicionar: ${queue.tracks.size} músicas`);
                console.log(`📊 [DEBUG] isPlaying: ${queue.isPlaying()}`);
                
                // Verificar se precisa iniciar reprodução ANTES de criar embed
                const wasPlaying = queue.isPlaying();
                if (!wasPlaying) {
                    console.log(`🎵 [DEBUG] Iniciando reprodução - fila não estava tocando`);
                    const playStart = Date.now();
                    await queue.node.play();
                    const playEnd = Date.now();
                    console.log(`⏱️ [TIMING] Step 9 - Iniciar reprodução (queue.node.play): ${playEnd - playStart}ms`);
                }
                
                // Verificar status após adicionar e iniciar reprodução
                const isNowPlaying = queue.isPlaying();
                const tracksCount = queue.tracks.size;
                
                // ⚡ PRÉ-AQUECER: Pré-aquecer próxima música da fila
                // Se já está tocando, a próxima é queue.tracks.at(0) (primeira na fila)
                // Se acabou de iniciar, a próxima também é queue.tracks.at(0)
                const nextTrack = queue.tracks.at(0);
                if (nextTrack && extractor) {
                    try {
                        extractor.preheatStream(nextTrack.url);
                        console.log(`⚡ Pré-aquecendo próxima: ${nextTrack.title}`);
        } catch (error) {
                        console.error(`❌ Erro ao pré-aquecer: ${error.message}`);
                    }
                }
                
                const replyStart = Date.now();
                
                // Embed melhorado para música adicionada à fila
                let durationValue = track.duration;
                if (typeof durationValue === 'string' && durationValue.includes(':')) {
                    const parts = durationValue.split(':').map(p => parseInt(p) || 0);
                    if (parts.length === 2) {
                        durationValue = parts[0] * 60 + parts[1];
                    } else if (parts.length === 3) {
                        durationValue = parts[0] * 3600 + parts[1] * 60 + parts[2];
                    }
                }
                if (durationValue && typeof durationValue === 'object' && durationValue.ms !== undefined) {
                    durationValue = durationValue.ms / 1000;
                }
                const duration = formatDuration(durationValue);
                
                // Verificar se é a primeira música (acabou de iniciar) ou se foi adicionada à fila
                // Se não estava tocando antes e agora está, é a primeira música
                const isFirstTrack = !wasPlaying && isNowPlaying;
                
                if (isFirstTrack || tracksCount === 1) {
                    // Primeira música - está tocando agora
                    const playingEmbed = new EmbedBuilder()
                        .setTitle('🎵 Tocando Agora')
                        .setDescription(`**${track.title}**`)
                .setColor(0x1DB954)
                        .setThumbnail(track.thumbnail || null)
                .addFields(
                            { name: '👤 Artista', value: track.author || 'Unknown', inline: true },
                            { name: '⏱️ Duração', value: duration, inline: true },
                            { name: '📊 Status', value: '▶️ Reproduzindo', inline: true }
                        )
                        .setFooter({ text: 'Use os botões de controle abaixo ou os comandos do bot' })
                .setTimestamp();

                    await interaction.editReply({ embeds: [playingEmbed] });
                } else if (wasPlaying) {
                    // Música adicionada à fila (já estava tocando outra)
                    const queueEmbed = new EmbedBuilder()
                        .setTitle('✅ Música Adicionada à Fila')
                        .setDescription(`**${track.title}**`)
                .setColor(0x1DB954)
                        .setThumbnail(track.thumbnail || null)
                .addFields(
                            { name: '👤 Artista', value: track.author || 'Unknown', inline: true },
                            { name: '⏱️ Duração', value: duration, inline: true },
                            { name: '📍 Posição na Fila', value: `${tracksCount}`, inline: true }
                        )
                        .setFooter({ text: `Total de músicas na fila: ${tracksCount}` })
                        .setTimestamp();
                    
                    await interaction.editReply({ embeds: [queueEmbed] });
            } else {
                    // Fallback - se não conseguiu iniciar, mostrar erro
                    await interaction.editReply(`⏳ Iniciando reprodução... (pode levar alguns segundos)`);
                }
                
                const replyEnd = Date.now();
                console.log(`⏱️ [TIMING] Step 9 - Enviar resposta: ${replyEnd - replyStart}ms`);
                
                const totalTime = Date.now() - startTime;
                console.log(`⏱️ [TIMING] === TOTAL: ${totalTime}ms ===\n`);
        } catch (error) {
                console.error('❌ Erro ao tocar música:', error);
                await interaction.editReply(`❌ Erro ao tocar música: ${error.message}`);
            }
                return;
            }

        if (commandName === 'skip') {
            const queue = player.nodes.get(interaction.guildId);
            if (!queue || !queue.isPlaying()) {
                await interaction.reply('❌ Não há música tocando!');
                return;
            }

            queue.node.skip();
            await interaction.reply('⏭️ Música pulada!');
                return;
        }
        
        if (commandName === 'pause') {
            const queue = player.nodes.get(interaction.guildId);
            if (!queue || !queue.isPlaying()) {
                await interaction.reply('❌ Não há música tocando!');
                return;
            }

            queue.node.pause();
            await interaction.reply('⏸️ Pausado!');
                return;
            }

        if (commandName === 'resume') {
            const queue = player.nodes.get(interaction.guildId);
            if (!queue || queue.node.isPlaying()) {
                await interaction.reply('❌ Não há música pausada!');
                return;
            }

            queue.node.resume();
            await interaction.reply('▶️ Retomado!');
                return;
        }
        
        if (commandName === 'stop') {
            const queue = player.nodes.get(interaction.guildId);
            if (!queue) {
                await interaction.reply('❌ Não há fila!');
                return;
            }

            queue.delete();
            await interaction.reply('⏹️ Parado e fila limpa!');
                return;
            }

        if (commandName === 'queue') {
            const queue = player.nodes.get(interaction.guildId);
            if (!queue || queue.tracks.size === 0) {
                await interaction.reply('❌ A fila está vazia!');
                return;
            }

            const tracks = queue.tracks.toArray();
            const current = queue.currentTrack;
            let message = `📋 **Fila de Músicas**\n\n`;
            
            if (current) {
                message += `🎵 **Tocando agora:** ${current.title}\n\n`;
            }
            
            message += `**Próximas músicas:**\n`;
            tracks.slice(0, 10).forEach((track, index) => {
                message += `${index + 1}. ${track.title}\n`;
            });
            
            if (tracks.length > 10) {
                message += `\n... e mais ${tracks.length - 10} música(s)`;
            }
            
            await interaction.reply(message);
                return;
            }
        } catch (error) {
        console.error('❌ Erro ao processar comando:', error);
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply(`❌ Erro: ${error.message}`).catch(() => {});
            } else {
            await interaction.reply(`❌ Erro: ${error.message}`).catch(() => {});
        }
    }
});

client.on('error', (error) => {
    console.error('❌ Erro do Discord:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('❌ Unhandled Rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    process.exit(1);
});

// Fazer login
client.login(DISCORD_TOKEN).catch((error) => {
    console.error('❌ Erro ao fazer login:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
});

