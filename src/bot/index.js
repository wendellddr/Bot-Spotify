// Suprimir avisos de depreciação conhecidos do Node.js (não críticos)
if (typeof process.removeAllListeners === 'function') {
    process.removeAllListeners('warning');
}
process.on('warning', (warning) => {
    // Suprimir apenas avisos de depreciação conhecidos que não afetam a funcionalidade
    // Mantém outros warnings importantes visíveis
    if (warning.name === 'DeprecationWarning') {
        const message = warning.message || '';
        // Ignorar avisos conhecidos do Node.js que são apenas informativos
        if (message.includes('process.emitWarning') || 
            message.includes('buffer') ||
            message.includes('util.inherits')) {
            // Avisos não críticos, ignorar silenciosamente
            return;
        }
    }
    // Mostrar outros warnings que podem ser importantes
    if (process.env.DEBUG === 'true') {
        console.warn('⚠️', warning.name + ':', warning.message);
    }
});

const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { Player } = require('discord-player');
const { DefaultExtractors } = require('@discord-player/extractor');
const { YouTubeExtractor } = require('../utils/youtube-extractor');
// Usar fetch nativo se disponível (Node.js 18+), caso contrário usar node-fetch
const fetch = (typeof globalThis.fetch === 'function') ? globalThis.fetch : require('node-fetch');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// Inicializar Discord Player com configurações otimizadas para resource saving
const player = new Player(client, {
    blockExtractors: [],
    blockStreamFrom: [],
    skipFFmpeg: false,
    // Configurações globais para resource saving
    leaveOnEnd: false, // Vamos controlar manualmente com delay
    leaveOnStop: true, // Sair quando parar manualmente
    leaveOnEmpty: true, // Sair quando o canal ficar vazio
    leaveOnEmptyCooldown: 15000 // Sair após 15 segundos quando todos saírem (economia)
});

// Variável para controlar se extractors foram registrados
let extractorsRegistered = false;

// Registrar os extractors
(async () => {
    try {
        // Registrar DefaultExtractors primeiro (inclui SoundCloud, Vimeo, etc.)
        await player.extractors.register(DefaultExtractors);
        
        // Adicionar nosso YouTubeExtractor customizado usando yt-dlp (mais confiável)
        await player.extractors.register(YouTubeExtractor, {});
        
        extractorsRegistered = true;
        
        // Listar extractors available
        const extractors = player.extractors.store;
        console.log(`✅ Extractors registered: ${extractors.size} available`);
        if (process.env.DEBUG === 'true') {
            console.log('📝 Extractors available:');
            extractors.forEach((extractor, id) => {
                console.log(`   - ${id}`);
            });
        }
    } catch (error) {
        console.error('❌ Error registering extractors:', error);
    }
})();

// Credenciais Spotify
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

let accessToken = null;
let tokenExpiry = 0;
let tokenRefreshPromise = null;

// Cache de querys do Spotify (5 minutos TTL)
const searchCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos
const MAX_CACHE_SIZE = 100; // Limite máximo de entradas no cache

// Armazenamento timerário para seleções de música (30 segundos TTL)
const pendingSelections = new Map();
const SELECTION_TTL = 30 * 1000; // 30 segundos

// Timeouts armazenados para poder cancelá-los se necessário
const activeTimeouts = new Map();

// Timers para controle de saída após término da fila
const endTimers = new Map();

// Limpeza periódica automática de cache e seleções expiradas (a cada 1 minuto)
setInterval(() => {
    const now = Date.now();
    let cleanedCache = 0;
    let cleanedSelections = 0;

    // Limpar cache expirado
    for (const [key, value] of searchCache.entries()) {
        if (now > value.expiry) {
            searchCache.delete(key);
            cleanedCache++;
        }
    }

    // Limpar seleções expiradas
    for (const [id, data] of pendingSelections.entries()) {
        if (now > data.expiry) {
            pendingSelections.delete(id);
            // Limpar timeout associado se existir
            if (activeTimeouts.has(id)) {
                clearTimeout(activeTimeouts.get(id));
                activeTimeouts.delete(id);
            }
            cleanedSelections++;
        }
    }

    // Limitar tamanho do cache (remover entradas mais antigas se exceder o limite)
    if (searchCache.size > MAX_CACHE_SIZE) {
        const entriesToRemove = searchCache.size - MAX_CACHE_SIZE;
        const entries = Array.from(searchCache.entries()).sort((a, b) => a[1].expiry - b[1].expiry);
        for (let i = 0; i < entriesToRemove; i++) {
            searchCache.delete(entries[i][0]);
            cleanedCache++;
        }
    }

    if (process.env.DEBUG === 'true' && (cleanedCache > 0 || cleanedSelections > 0)) {
        console.log(`🧹 Limpeza automática: ${cleanedCache} cache(s), ${cleanedSelections} seleção(ões)`);
    }
}, 60 * 1000); // Executar a cada 1 minuto

// Função para obter token de acesso do Spotify com refresh proativo
async function getSpotifyAccessToken() {
    // Se já existe uma requisição de token em andamento, aguardar ela
    if (tokenRefreshPromise) {
        return tokenRefreshPromise;
    }

    tokenRefreshPromise = (async () => {
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
        
        if (data.access_token) {
            accessToken = data.access_token;
                // Renovar 5 minutos antes de expirar (refresh proativo)
                const bufferTime = 5 * 60 * 1000; // 5 minutos
                tokenExpiry = Date.now() + (data.expires_in * 1000) - bufferTime;
            return accessToken;
        }
        
        throw new Error('Could not obtain access token');
    } catch (error) {
            console.error('Error getting Spotify token:', error.message);
            throw error;
        } finally {
            tokenRefreshPromise = null;
        }
    })();

    return tokenRefreshPromise;
}

// Função para garantir que temos um token válido
async function ensureAccessToken() {
    // Renovar se expirado ou próximo de expirar (refresh proativo)
    if (!accessToken || Date.now() >= tokenExpiry) {
        await getSpotifyAccessToken();
    }
    return accessToken;
}

// Função para queryr música no Spotify com cache
async function searchTrack(query) {
    // Verificar cache primeiro
    const cacheKey = query.toLowerCase().trim();
    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() < cached.expiry) {
        console.log(`      💾 Result found in cache`);
        return cached.data;
    }

    console.log(`      🌐 Making request to API do Spotify...`);
    const token = await ensureAccessToken();
    if (!token) {
        console.error('      ❌ Spotify token not available');
        return null;
    }

    try {
        const searchQuery = encodeURIComponent(query);
        const response = await fetch(`https://api.spotify.com/v1/search?q=${searchQuery}&type=track&limit=10`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        const tracks = data.tracks?.items || [];
        
        console.log(`      ✅ Spotify returned ${tracks.length} result(s)`);
        
        // Armazenar no cache
        searchCache.set(cacheKey, {
            data: tracks,
            expiry: Date.now() + CACHE_TTL
        });

        // Limpar cache antigo periodicamente (manter apenas últimas 100 entradas)
        if (searchCache.size > 100) {
            const oldestKey = searchCache.keys().next().value;
            searchCache.delete(oldestKey);
        }

        return tracks;
    } catch (error) {
        console.error(`      ❌ Error searching on Spotify: ${error.message}`);
        return [];
    }
}

// Slash Commands
const commands = [
    new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play a song in the voice channel')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('Song name/artist or URL (YouTube, Spotify, etc)')
                .setRequired(true)
        ),
    
    new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Stop music playback and clear the queue'),
    
    new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Skip the current song'),
    
    new SlashCommandBuilder()
        .setName('pause')
        .setDescription('Pause playback'),
    
    new SlashCommandBuilder()
        .setName('resume')
        .setDescription('Resume paused playback'),
    
    new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Show the music queue')
        .addIntegerOption(option =>
            option.setName('page')
                .setDescription('Page number (default: 1)')
                .setMinValue(1)
        ),
    
    new SlashCommandBuilder()
        .setName('nowplaying')
        .setDescription('Show the currently playing song'),
    
    new SlashCommandBuilder()
        .setName('volume')
        .setDescription('Set the bot volume (0-100)')
        .addIntegerOption(option =>
            option.setName('value')
                .setDescription('Volume from 0 to 100')
                .setMinValue(0)
                .setMaxValue(100)
        ),
    
    new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Clear the music queue'),
    
    new SlashCommandBuilder()
        .setName('shuffle')
        .setDescription('Shuffle the music queue'),
    
    new SlashCommandBuilder()
        .setName('loop')
        .setDescription('Set loop mode')
        .addStringOption(option =>
            option.setName('mode')
                .setDescription('Loop mode')
                .setRequired(true)
                .addChoices(
                    { name: 'Off', value: 'off' },
                    { name: 'Current Track', value: 'track' },
                    { name: 'Entire Queue', value: 'queue' }
                )
        ),
    
    new SlashCommandBuilder()
        .setName('remove')
        .setDescription('Remove a song from the queue')
        .addIntegerOption(option =>
            option.setName('position')
                .setDescription('Position of the song in queue (starts at 1)')
                .setRequired(true)
                .setMinValue(1)
        ),
    
    new SlashCommandBuilder()
        .setName('jump')
        .setDescription('Jump to a specific song in the queue')
        .addIntegerOption(option =>
            option.setName('position')
                .setDescription('Position of the song in queue (starts at 1)')
                .setRequired(true)
                .setMinValue(1)
        ),
    
    new SlashCommandBuilder()
        .setName('remove-duplicates')
        .setDescription('Remove duplicate songs from the queue'),
    
    new SlashCommandBuilder()
        .setName('seek')
        .setDescription('Seek forward or backward in the current song')
        .addStringOption(option =>
            option.setName('time')
                .setDescription('Time in MM:SS format or seconds (e.g: 1:30 or 90)')
                .setRequired(true)
        ),
    
    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Responds with Pong!'),
    
    new SlashCommandBuilder()
        .setName('test')
        .setDescription('Test audio playback')
        .addStringOption(option =>
            option.setName('url')
                .setDescription('URL or path to audio file')
                .setRequired(true)
        ),
    
    new SlashCommandBuilder()
        .setName('reload')
        .setDescription('Reload commands in this server (fixes outdated commands)')
];

// Registrar comandos
async function registerCommands() {
    try {
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
        
        console.log('🔄 Updating slash commands...');
        
        // Converter comandos para formato JSON
        const commandsData = commands.map(cmd => cmd.toJSON());
        
        // Tentar deletar comandos antigos primeiro (opcional, ajuda com cache)
        try {
            // Pegar comandos existentes
            const existingCommands = await rest.get(
                Routes.applicationCommands(process.env.CLIENT_ID)
            );
            
            // Deletar comandos que não estão mais na lista
            const commandNames = new Set(commandsData.map(c => c.name));
            for (const cmd of existingCommands) {
                if (!commandNames.has(cmd.name)) {
                    try {
                        await rest.delete(
                            Routes.applicationCommand(process.env.CLIENT_ID, cmd.id)
                        );
                        console.log(`🗑️ Deleted old command: /${cmd.name}`);
                    } catch (deleteError) {
                        // Ignorar erros ao deletar
                    }
                }
            }
        } catch (fetchError) {
            // Se falhar ao buscar comandos existentes, continuar mesmo assim
            console.log('⚠️ Could not fetch existing commands, continuing...');
        }
        
        // Pequeno delay para evitar rate limit
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Registrar/atualizar comandos
        const result = await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commandsData }
        );
        
        console.log(`✅ ${result.length} command(s) updated successfully!`);
        console.log('📝 Available commands:', commands.map(cmd => `/${cmd.name}`).join(', '));
        
        // Avisar sobre propagação (pode levar até 1 hora)
        console.log('⏳ Note: Command updates may take up to 1 hour to propagate globally.');
        console.log('   If commands appear outdated, wait a few minutes and try again.');
        console.log('   Tip: You can also use /reload in a server to refresh commands faster.');
        
    } catch (error) {
        console.error('❌ Error registering commands:', error);
        
        // Se for erro de rate limit, mostrar mensagem mais amigável
        if (error.status === 429) {
            const retryAfter = error.retry_after || 60;
            console.error(`⚠️ Rate limit reached. Please wait ${retryAfter} seconds before trying again.`);
            console.error('💡 You can restart the bot after the cooldown period.');
        } else if (error.status === 403) {
            console.error('❌ Forbidden: Check if the bot has "applications.commands" scope');
            console.error('💡 Make sure you added the bot with the correct OAuth2 URL including "applications.commands"');
        } else if (error.status === 401) {
            console.error('❌ Unauthorized: Check if DISCORD_TOKEN is correct');
        } else {
            console.error('💡 Tip: Check if CLIENT_ID in .env is correct');
            console.error(`   Error details: ${error.message}`);
        }
    }
}

// Registrar comandos em um servidor específico (mais rápido que global)
async function registerGuildCommands(guildId) {
    try {
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
        const commandsData = commands.map(cmd => cmd.toJSON());
        
        const result = await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
            { body: commandsData }
        );
        
        return { success: true, count: result.length };
    } catch (error) {
        console.error(`❌ Error registering guild commands for ${guildId}:`, error.message);
        return { success: false, error: error.message };
    }
}

// Evento quando o bot está pronto
client.once('clientReady', async () => {
    console.log(`Bot connected as ${client.user.tag}!`);
    
    // Obter token inicial do Spotify
    await getSpotifyAccessToken();
    
    // Registrar comandos
    await registerCommands();
    
    // Inicializar servidor web (interface HTML)
    try {
        const { initWebServer } = require('../server/web-server');
        initWebServer(client, player);
    } catch (error) {
        console.log('⚠️  Erro ao inicializar servidor web:', error.message);
        console.log('   Instale as dependências: npm install express socket.io discord-oauth2 express-session');
    }
});

// Handler de erros não tratados
client.on('error', (error) => {
    // Ignorar erros de interação expirada
    if (error.code === 10062 || error.message?.includes('Unknown interaction')) {
        return;
    }
    console.error('❌ Erro no cliente:', error);
});

// Função auxiliar para criar fila de reprodução
async function getOrCreateQueue(guild, channel, voiceChannel) {
    let queue = player.nodes.get(guild.id);
    if (!queue) {
        queue = player.nodes.create(guild, {
            metadata: {
                channel: channel
            },
            leaveOnEmpty: true, // Deixar canal quando vazio (resource saving)
            leaveOnEnd: false, // Controlamos manualmente com delay
            leaveOnStop: true, // Deixar quando parar manualmente
            leaveOnEmptyCooldown: 15000 // Aguardar 15 segundos antes de sair quando vazio (economia)
        });
    }

    if (!queue.connection) {
        // Verificar se há pessoas no canal antes de conectar (resource saving)
        const membersInChannel = voiceChannel.members.filter(member => !member.user.bot).size;
        
        if (membersInChannel === 0) {
            console.log('⚠️ Bot does not enter empty channel (resource saving)');
            throw new Error('There are no people in the voice channel! The bot needs someone in the channel to play music.');
        }
        
        try {
            await queue.connect(voiceChannel);
            console.log(`✅ Bot connected to channel (${membersInChannel} person(s) present)`);
        } catch (error) {
            console.error('❌ Error connecting to voice channel:', error.message);
            throw new Error('Could not connect to voice channel. Check the permissions.');
        }
    }

    return queue;
}

// Função auxiliar para adicionar e reproduzir track
async function playTrack(queue, track) {
    queue.addTrack(track);
    if (!queue.isPlaying()) {
        await queue.node.play();
    }
}

// Função auxiliar para formatar duração
function formatDuration(ms) {
    if (!ms || isNaN(ms)) return '0:00';
    const seconds = Math.floor(ms / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// Eventos do Discord Player
player.events.on('error', (queue, error) => {
    // Ignorar erros comuns de IP discovery (não afetam a reprodução)
    if (error.message?.includes('IP discovery') || error.message?.includes('socket closed')) {
        return;
    }
    console.error('❌ Erro in queue:', error.message);
});

player.events.on('playerError', (queue, error) => {
    // Ignorar erros comuns de IP discovery
    if (error.message?.includes('IP discovery') || error.message?.includes('socket closed')) {
        return;
    }
    console.error('❌ Erro no player:', error.message);
});

// Evento quando uma track começa a tocar
player.events.on('playerStart', (queue, track) => {
    // Cancelar timer de saída se existir (alguém adicionou música)
    if (endTimers.has(queue.guild.id)) {
        clearTimeout(endTimers.get(queue.guild.id));
        endTimers.delete(queue.guild.id);
        console.log('✅ Timer cancelled - music playing again!');
    }
    
    // Log apenas em mode debug se necessário
    if (process.env.DEBUG === 'true') {
    console.log('🎵 Tocando agora:', track.title);
    }
});

// Evento quando uma track termina
player.events.on('audioTrackEnd', (queue, track) => {
    // Log apenas em mode debug se necessário
    if (process.env.DEBUG === 'true') {
        console.log('✅ Track terminada:', track.title);
    }
    
    // Se não há mais músicas in queue, o bot sairá automaticamente
    if (queue.size === 0 && !queue.isPlaying()) {
        if (process.env.DEBUG === 'true') {
            console.log('📭 Empty queue, bot will leave soon to save resources');
        }
    }
});

// Evento quando o bot sai do canal (resource saving)
player.events.on('disconnect', (queue) => {
    console.log(`🔌 Bot disconnected from voice channel on server: ${queue.guild.name} (resource saving)`);
    
    // Limpar timer se existir
    if (endTimers.has(queue.guild.id)) {
        clearTimeout(endTimers.get(queue.guild.id));
        endTimers.delete(queue.guild.id);
    }
});

// Evento quando a fila termina completamente
player.events.on('queueEnd', (queue) => {
    console.log(`📭 Fila terminada no servidor: ${queue.guild.name}`);
    
    // Cancelar timer anterior se existir
    if (endTimers.has(queue.guild.id)) {
        clearTimeout(endTimers.get(queue.guild.id));
        endTimers.delete(queue.guild.id);
    }
    
    // Esperar 2 minutos antes de sair (se não adicionarem músicas)
    const timer = setTimeout(() => {
        if (queue && queue.connection) {
            console.log(`⏰ Wait time expired (2 min), bot leaving channel (${queue.guild.name})`);
            queue.delete();
            endTimers.delete(queue.guild.id);
        }
    }, 120000); // 2 minutos = 120000ms
    
    endTimers.set(queue.guild.id, timer);
    console.log('⏳ Bot waiting 2 minutes... Add music to continue!');
});

// Evento para interações
client.on('interactionCreate', async interaction => {
    // Handler para seleção de música do menu
    if (interaction.isStringSelectMenu()) {
        if (interaction.customId.startsWith('select_track_')) {
            try {
                // Buscar a seleção pelo customId ANTES de deferUpdate
                const selectionData = pendingSelections.get(interaction.customId);

                if (!selectionData) {
                    await interaction.followUp({ 
                        content: '❌ This selection has expired or not found. Use `/play` again.', 
                        ephemeral: true 
                    });
                    return;
                }

                // Verificar se expirou
                if (Date.now() > selectionData.expiry) {
                    pendingSelections.delete(interaction.customId);
                    await interaction.followUp({ 
                        content: '❌ This selection has expired. Use `/play` again.', 
                        ephemeral: true 
                    });
                    return;
                }

                // Verificar se é o usuário correto
                if (selectionData.userId !== interaction.user.id) {
                    await interaction.followUp({ 
                        content: '❌ This selection is not yours! Use `/play` to create your own selection.', 
                        ephemeral: true 
                    });
                    return;
                }
                
                // Agora sim, fazer deferUpdate
                await interaction.deferUpdate();

                // Remover da lista de pendentes após uso
                pendingSelections.delete(interaction.customId);
                
                // Cancelar timeout se ainda estiver ativo
                if (activeTimeouts.has(interaction.customId)) {
                    clearTimeout(activeTimeouts.get(interaction.customId));
                    activeTimeouts.delete(interaction.customId);
                }

                const selectedIndex = parseInt(interaction.values[0]);
                const selectedTrack = selectionData.tracks[selectedIndex];

                if (!selectedTrack) {
                    await interaction.followUp({ 
                        content: '❌ Selected music not found.', 
                        ephemeral: true 
                    });
                    return;
                }

                console.log(`\n🎵 [${interaction.user.username}#${interaction.user.discriminator}] Selected: "${selectedTrack.name}"`);
                
                // Mostrar mensagem de carregamento imediatamente
                const loadingEmbed = new EmbedBuilder()
                    .setTitle('⏳ Loading Music')
                    .setColor(0xFFA500)
                    .setDescription(`**${selectedTrack.name}**\n🎤 ${selectedTrack.artists.map(a => a.name).join(', ')}`)
                    .setThumbnail(selectedTrack.album.images[0]?.url)
                    .addFields(
                        { name: '💿 Album', value: selectedTrack.album.name, inline: true },
                        { name: '⏱️ Duration', value: `${Math.floor(selectedTrack.duration_ms / 60000)}:${((selectedTrack.duration_ms % 60000) / 1000).toFixed(0).padStart(2, '0')}`, inline: true }
                    )
                    .setFooter({ text: '🔍 Searching audio...' })
                    .setTimestamp();

                await interaction.editReply({ 
                    embeds: [loadingEmbed], 
                    components: [] // Remover o menu
                });
                
                // Verificar se o usuário está em um canal de voz (usar o canal original ou verificar novamente)
                let voiceChannel = interaction.member.voice.channel;
                if (!voiceChannel) {
                    // Tentar usar o canal armazenado
                    const guild = interaction.guild;
                    if (guild) {
                        const storedChannel = guild.channels.cache.get(selectionData.voiceChannelId);
                        if (storedChannel) {
                            voiceChannel = storedChannel;
                        }
                    }
                }
                
                if (!voiceChannel) {
                    await interaction.followUp({ 
                        content: '❌ You need to be in a voice channel!', 
                        ephemeral: true 
                    });
                    return;
                }

                // Buscar áudio no YouTube
                const searchQuery = `${selectedTrack.artists[0].name} - ${selectedTrack.name}`;
                console.log(`   🎬 Searching audio on YouTube: "${searchQuery}"...`);
                
                // Atualizar embed para mostrar que está buscando
                loadingEmbed.setFooter({ text: '🎬 Searching on YouTube...' });
                await interaction.editReply({ embeds: [loadingEmbed] });
                
                const searchResult = await player.search(searchQuery, {
                    requestedBy: interaction.user
                });

                if (!searchResult.hasTracks()) {
                    // Atualizar embed com erro
                    loadingEmbed.setTitle('❌ Error Finding Audio')
                        .setColor(0xFF0000)
                        .setFooter({ text: 'Could not find audio' });
                    
                    await interaction.editReply({ embeds: [loadingEmbed] });
                    await interaction.followUp({ 
                        content: '⚠️ Could not find audio for this song on YouTube.', 
                        ephemeral: true 
                    });
                    return;
                }

                // Atualizar embed para mostrar que encontrou e está adicionando
                loadingEmbed.setFooter({ text: '▶️ Adding to queue...' });
                await interaction.editReply({ embeds: [loadingEmbed] });

                // Criar embed final
                const embed = new EmbedBuilder()
                    .setTitle('🎵 Now Playing')
                    .setColor(0x1DB954)
                    .setDescription(`**${selectedTrack.name}**\n🎤 ${selectedTrack.artists.map(a => a.name).join(', ')}`)
                    .setThumbnail(selectedTrack.album.images[0]?.url)
                    .addFields(
                        { name: '💿 Album', value: selectedTrack.album.name, inline: true },
                        { name: '⏱️ Duration', value: `${Math.floor(selectedTrack.duration_ms / 60000)}:${((selectedTrack.duration_ms % 60000) / 1000).toFixed(0).padStart(2, '0')}`, inline: true },
                        { name: '🔗 Link', value: `[Open in Spotify](${selectedTrack.external_urls.spotify})`, inline: true }
                    )
                    .setTimestamp();

                // Obter ou criar fila
                const queue = await getOrCreateQueue(
                    interaction.guild, 
                    interaction.channel, 
                    voiceChannel
                );

                const wasPlaying = queue.isPlaying();
                const queueSize = queue.size;

                // Adicionar à fila e reproduzir
                await playTrack(queue, searchResult.tracks[0]);

                if (!wasPlaying && queue.isPlaying()) {
                    embed.setTitle('🎵 Now Playing');
                    embed.setFooter({ text: '✅ Song started successfully!' });
                } else {
                    embed.setTitle('➕ Added to Queue');
                    embed.addFields({ name: '📊 Position', value: `#${queueSize + 1} in queue`, inline: true });
                    embed.setFooter({ text: '✅ Song added to queue!' });
                }

                // Atualizar a mensagem original com o resultado final
                await interaction.editReply({ 
                    embeds: [embed], 
                    components: [] 
                });

            } catch (error) {
                // Ignorar erros de interação expirada (Unknown interaction)
                if (error.code === 10062 || error.message?.includes('Unknown interaction')) {
                    console.log('⚠️ Selection interaction expired (took too long to process)');
                    return;
                }
                
                console.error('❌ Error processing selection:', error);
                try {
                    await interaction.followUp({ 
                        content: '❌ Error playing selected music.', 
                        ephemeral: true 
                    });
                } catch (replyError) {
                    // Ignorar se a interação expirou
                }
            }
            return;
        }
    }

    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'play') {
        const startTime = Date.now();
        const userTag = `${interaction.user.username}#${interaction.user.discriminator}`;
        
        try {
            await interaction.deferReply();

            // Verificar se o usuário está em um canal de voz
            const voiceChannel = interaction.member.voice.channel;
            if (!voiceChannel) {
                await interaction.editReply('❌ You need to be in a voice channel to use this command!');
                return;
            }

            let query = interaction.options.getString('query');
            
            // Validar e limpar query
            if (!query || typeof query !== 'string') {
                await interaction.reply('❌ Please provide a valid song name, artist, or URL.');
                return;
            }
            
            query = query.trim();
            
            // Limitar comprimento da query (evitar queries muito longas)
            if (query.length > 200) {
                query = query.substring(0, 200);
            }
            
            if (query.length === 0) {
                await interaction.reply('❌ Query cannot be empty.');
                return;
            }
            
            console.log(`\n🎵 [${userTag}] Starting search: "${query.substring(0, 50)}${query.length > 50 ? '...' : ''}"`);
            
            // Detectar se é URL (mais preciso: deve conter domínio válido)
            const isUrl = /^(https?:\/\/)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/.test(query) || 
                         query.toLowerCase().includes('youtube.com') || 
                         query.toLowerCase().includes('youtu.be') ||
                         query.toLowerCase().includes('spotify.com') ||
                         query.toLowerCase().startsWith('http://') ||
                         query.toLowerCase().startsWith('https://');
            console.log(`   📍 Type detected: ${isUrl ? 'URL' : 'Song name'}`);
            
            let searchResult;
            let embed;
            let preQueue = null;
            let isUrlFinal = isUrl; // Variável mutável para fallback

            if (isUrlFinal) {
                console.log(`   🔍 Searching audio diretamente da URL...`);
                const urlSearchStart = Date.now();
                
                // Se for URL, usar diretamente o discord-player
                try {
                    searchResult = await player.search(query, {
                        requestedBy: interaction.user
                    });
                    
                    if (process.env.DEBUG === 'true') {
                        console.log(`   📊 Search result:`, {
                            hasTracks: searchResult.hasTracks(),
                            loadType: searchResult.loadType,
                            playlist: searchResult.playlist ? 'Sim' : 'Não'
                        });
                    }
                } catch (searchError) {
                    console.error(`   ❌ Erro na query:`, searchError.message);
                    searchResult = { hasTracks: () => false };
                }

                const urlSearchTime = ((Date.now() - urlSearchStart) / 1000).toFixed(2);
                
                if (!searchResult.hasTracks()) {
                    console.log(`   ❌ Nenhum áudio found for the URL (${urlSearchTime}s)`);
                    console.log(`   📝 Result type: ${searchResult.loadType || 'UNKNOWN'}`);
                    console.log(`   🔄 Trying queryr como nome de música...`);
                    
                    // Fallback: tentar queryr no Spotify primeiro se URL não funcionar
                    const fallbackTracks = await searchTrack(query);
                    if (fallbackTracks && fallbackTracks.length > 0) {
                        const spotifyTrack = fallbackTracks[0];
                        const searchQuery = `${spotifyTrack.artists[0].name} - ${spotifyTrack.name}`;
                        
                        const fallbackResult = await player.search(searchQuery, {
                            requestedBy: interaction.user
                        });
                        
                        if (fallbackResult.hasTracks()) {
                            console.log(`   ✅ Fallback found music via Spotify: "${spotifyTrack.name}"`);
                            searchResult = fallbackResult;
                            isUrlFinal = false; // Marcar como não URL para usar lógica de nome
                            
                            embed = new EmbedBuilder()
                                .setTitle('🎵 Now Playing')
                                .setColor(0x1DB954)
                                .setDescription(`**${spotifyTrack.name}**\n🎤 ${spotifyTrack.artists.map(a => a.name).join(', ')}`)
                                .setThumbnail(spotifyTrack.album.images[0]?.url)
                                .addFields(
                                    { name: '💿 Album', value: spotifyTrack.album.name, inline: true },
                                    { name: '⏱️ Duration', value: `${Math.floor(spotifyTrack.duration_ms / 60000)}:${((spotifyTrack.duration_ms % 60000) / 1000).toFixed(0).padStart(2, '0')}`, inline: true },
                                    { name: '🔗 Link', value: `[Open in Spotify](${spotifyTrack.external_urls.spotify})`, inline: true }
                                )
                                .setTimestamp();
                        } else {
                            await interaction.editReply('⚠️ Could not find audio for this URL or query.');
                            return;
                        }
                    } else {
                        await interaction.editReply('⚠️ Could not find audio for this URL or query.');
                        return;
                    }
                }

                // Só criar embed se não foi criado no fallback
                if (!embed) {
                    const track = searchResult.tracks[0];
                    console.log(`   ✅ Audio found: "${track.title}" (${urlSearchTime}s)`);
                    
                    // Criar embed simples para URL
                    embed = new EmbedBuilder()
                        .setTitle('🎵 Now Playing')
                        .setColor(0x1DB954)
                        .setDescription(`**${track.title}**\n🎤 ${track.author || 'Desconhecido'}`)
                        .setThumbnail(track.thumbnail)
                        .addFields(
                            { name: '⏱️ Duration', value: track.duration || 'Desconhecido', inline: true },
                            { name: '🔗 URL', value: `[Open](${track.url})`, inline: true }
                        )
                        .setTimestamp();
                }

            } else {
                // Se for nome, queryr no Spotify e preparar conexão em paralelo
                console.log(`   🎧 Buscando no Spotify...`);
                const spotifyStart = Date.now();
                
                // Iniciar query no Spotify e preparação da fila em paralelo
                const [tracks, queuePrepared] = await Promise.all([
                    searchTrack(query),
                    getOrCreateQueue(interaction.guild, interaction.channel, voiceChannel).catch(() => null)
                ]);
                
                preQueue = queuePrepared;
                
                const spotifyTime = ((Date.now() - spotifyStart) / 1000).toFixed(2);

            if (!tracks || tracks.length === 0) {
                    console.log(`   ❌ No music encontrada no Spotify (${spotifyTime}s)`);
                await interaction.editReply('❌ No music found on Spotify!');
                return;
            }

                // Se há múltiplas músicas, mostrar menu de seleção
                if (tracks.length > 1) {
                    console.log(`   📋 Found ${tracks.length} songs, showing selection menu...`);
                    
                    // Criar ID único para esta seleção
                    const selectionId = `select_track_${interaction.user.id}_${Date.now()}`;
                    
                    // Criar menu de seleção (máximo 25 opções no Discord)
                    const selectMenu = new StringSelectMenuBuilder()
                        .setCustomId(selectionId)
                        .setPlaceholder('Choose a song to play...')
                        .addOptions(
                            tracks.slice(0, 25).map((track, index) => ({
                                label: track.name.length > 100 ? track.name.substring(0, 97) + '...' : track.name,
                                description: `${track.artists.map(a => a.name).join(', ')} • ${Math.floor(track.duration_ms / 60000)}:${((track.duration_ms % 60000) / 1000).toFixed(0).padStart(2, '0')}`,
                                value: index.toString(),
                                emoji: '🎵'
                            }))
                        );

                    // Armazenar as músicas timerariamente
                    pendingSelections.set(selectionId, {
                        tracks: tracks,
                        userId: interaction.user.id,
                        guildId: interaction.guild.id,
                        channelId: interaction.channel.id,
                        voiceChannelId: voiceChannel.id,
                        expiry: Date.now() + SELECTION_TTL
                    });

                    // Limpar seleções expiradas
                    for (const [id, data] of pendingSelections.entries()) {
                        if (Date.now() > data.expiry) {
                            pendingSelections.delete(id);
                        }
                    }

                    // Criar embed de seleção
                    const selectEmbed = new EmbedBuilder()
                        .setTitle('🎵 Choose a Music')
                        .setColor(0x1DB954)
                        .setDescription(`Found **${tracks.length}** song(s) for **"${query}"**\n\nUse the menu below to choose which one to play:`)
                        .setFooter({ text: 'Menu expires in 30 seconds' })
                        .setTimestamp();

                    const row = new ActionRowBuilder().addComponents(selectMenu);

                    await interaction.editReply({ 
                        embeds: [selectEmbed], 
                        components: [row] 
                    });
                    
                    // Limpar seleção após timeout (armazenar para poder cancelar se necessário)
                    const timeoutId = setTimeout(() => {
                        pendingSelections.delete(selectionId);
                        activeTimeouts.delete(selectionId);
                    }, SELECTION_TTL);
                    activeTimeouts.set(selectionId, timeoutId);
                    
                    return; // Parar aqui, aguardar seleção do usuário
                }

                // Se há apenas 1 música, tocar diretamente (comportamento original)
                const spotifyTrack = tracks[0];
                console.log(`   ✅ Spotify: "${spotifyTrack.name}" - ${spotifyTrack.artists[0].name} (${spotifyTime}s)`);

                // Criar embed com informações do Spotify
                embed = new EmbedBuilder()
                .setTitle('🎵 Now Playing')
                .setColor(0x1DB954)
                    .setDescription(`**${spotifyTrack.name}**\n🎤 ${spotifyTrack.artists.map(a => a.name).join(', ')}`)
                    .setThumbnail(spotifyTrack.album.images[0]?.url)
                .addFields(
                        { name: '💿 Album', value: spotifyTrack.album.name, inline: true },
                        { name: '⏱️ Duration', value: `${Math.floor(spotifyTrack.duration_ms / 60000)}:${((spotifyTrack.duration_ms % 60000) / 1000).toFixed(0).padStart(2, '0')}`, inline: true },
                        { name: '🔗 Link', value: `[Open in Spotify](${spotifyTrack.external_urls.spotify})`, inline: true }
                )
                .setTimestamp();

                // Buscar no YouTube usando o nome da música do Spotify
                const searchQuery = `${spotifyTrack.artists[0].name} - ${spotifyTrack.name}`;
                console.log(`   🎬 Searching audio on YouTube: "${searchQuery}"...`);
                const youtubeStart = Date.now();
                
                try {
                    searchResult = await player.search(searchQuery, {
                requestedBy: interaction.user
            });
                    
                    if (process.env.DEBUG === 'true') {
                        console.log(`   📊 YouTube result:`, {
                            hasTracks: searchResult.hasTracks(),
                            loadType: searchResult.loadType,
                            tracks: searchResult.hasTracks() ? searchResult.tracks.length : 0
                        });
                    }
                } catch (searchError) {
                    console.error(`   ❌ Error in YouTube search:`, searchError.message);
                    searchResult = { hasTracks: () => false };
                }

                const youtubeTime = ((Date.now() - youtubeStart) / 1000).toFixed(2);

            if (!searchResult.hasTracks()) {
                    console.log(`   ❌ No audio found on YouTube (${youtubeTime}s)`);
                    console.log(`   📝 Result type: ${searchResult.loadType || 'UNKNOWN'}`);
                    console.log(`   🔄 Trying direct search as fallback (query original: "${query}")...`);
                    
                    // Fallback 1: tentar queryr diretamente no player sem passar pelo Spotify
                    let fallbackResult;
                    try {
                        fallbackResult = await player.search(query, {
                            requestedBy: interaction.user
                        });
                        
                        if (process.env.DEBUG === 'true') {
                            console.log(`   📊 Fallback 1 result:`, {
                                hasTracks: fallbackResult.hasTracks(),
                                loadType: fallbackResult.loadType
                            });
                        }
                    } catch (fallbackError) {
                        console.error(`   ❌ Error in fallback 1:`, fallbackError.message);
                        fallbackResult = { hasTracks: () => false };
                    }
                    
                    // Fallback 2: tentar queryr apenas o nome da música (sem artista)
                    if (!fallbackResult.hasTracks() && spotifyTrack) {
                        console.log(`   🔄 Trying fallback 2: just song name...`);
                        try {
                            const fallback2Result = await player.search(spotifyTrack.name, {
                                requestedBy: interaction.user
                            });
                            
                            if (fallback2Result.hasTracks()) {
                                console.log(`   ✅ Fallback 2 found: "${fallback2Result.tracks[0].title}"`);
                                fallbackResult = fallback2Result;
                            }
                        } catch (fallback2Error) {
                            console.error(`   ❌ Error in fallback 2:`, fallback2Error.message);
                        }
                    }
                    
                    // Fallback 3: tentar queryr com "official" ou "audio"
                    if (!fallbackResult.hasTracks() && spotifyTrack) {
                        console.log(`   🔄 Trying fallback 3: with additional terms...`);
                        try {
                            const fallback3Queries = [
                                `${spotifyTrack.artists[0].name} ${spotifyTrack.name} official`,
                                `${spotifyTrack.name} ${spotifyTrack.artists[0].name} audio`,
                                `${spotifyTrack.name} official audio`
                            ];
                            
                            for (const fallbackQuery of fallback3Queries) {
                                const fallback3Result = await player.search(fallbackQuery, {
                                    requestedBy: interaction.user
                                });
                                
                                if (fallback3Result.hasTracks()) {
                                    console.log(`   ✅ Fallback 3 found with: "${fallbackQuery}"`);
                                    fallbackResult = fallback3Result;
                                    break;
                                }
                            }
                        } catch (fallback3Error) {
                            console.error(`   ❌ Error in fallback 3:`, fallback3Error.message);
                        }
                    }
                    
                    if (fallbackResult && fallbackResult.hasTracks()) {
                        console.log(`   ✅ Fallback found: "${fallbackResult.tracks[0].title}"`);
                        searchResult = fallbackResult;
                        
                        // Criar embed simples para resultado do fallback
                        embed = new EmbedBuilder()
                            .setTitle('🎵 Now Playing')
                            .setColor(0x1DB954)
                            .setDescription(`**${fallbackResult.tracks[0].title}**\n🎤 ${fallbackResult.tracks[0].author || 'Unknown'}`)
                            .setThumbnail(fallbackResult.tracks[0].thumbnail)
                            .addFields(
                                { name: '⏱️ Duration', value: fallbackResult.tracks[0].duration || 'Unknown', inline: true },
                                { name: '🔗 URL', value: `[Open](${fallbackResult.tracks[0].url})`, inline: true }
                            )
                            .setTimestamp();
            } else {
                        console.log(`   ❌ All fallbacks failed`);
                        console.log(`   💡 Tip: Try a more specific query or use a direct URL`);
                        await interaction.editReply('⚠️ Could not find audio for this song. Try being more specific or use a YouTube/SoundCloud URL.');
                        return;
                    }
                } else {
                    console.log(`   ✅ YouTube: "${searchResult.tracks[0].title}" (${youtubeTime}s)`);
                }
            }

            // Obter fila se ainda não foi obtida (caso de URL)
            let queue;
            if (isUrlFinal) {
                console.log(`   🔗 Connecting to voice channel...`);
                queue = await getOrCreateQueue(interaction.guild, interaction.channel, voiceChannel);
            } else {
                // Já foi obtida em paralelo, apenas garantir que está conectada
                queue = preQueue;
                if (!queue || !queue.connection) {
                    console.log(`   🔗 Connecting to voice channel...`);
                    queue = await getOrCreateQueue(interaction.guild, interaction.channel, voiceChannel);
                } else {
                    console.log(`   ✅ Connection already prepared (saved time)`);
                }
            }

            // Verificar se já está tocando algo
            const wasPlaying = queue.isPlaying();
            const queueSize = queue.size;

            // Adicionar à fila e reproduzir
            console.log(`   ▶️ Adding to queue and starting playback...`);
            await playTrack(queue, searchResult.tracks[0]);

            const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
            
            // Atualizar embed se não estiver tocando ainda
            if (!wasPlaying && queue.isPlaying()) {
                embed.setTitle('🎵 Now Playing');
                console.log(`   ✅ Playback started! (Total: ${totalTime}s)`);
            } else {
                embed.setTitle('➕ Added to Queue');
                embed.addFields({ name: '📊 Position', value: `#${queueSize + 1} in queue`, inline: true });
                console.log(`   ✅ Added to queue at position #${queueSize + 1} (Total: ${totalTime}s)`);
            }

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            // Ignorar erros de interação expirada
            if (error.code === 10062 || error.message?.includes('Unknown interaction')) {
                return;
            }
            console.error('❌ Error playing:', error);
            try {
                await interaction.editReply('❌ Error playing music.');
            } catch (replyError) {
                // Interação pode ter expirado, ignorar silenciosamente
            }
        }
    }

    if (commandName === 'stop') {
        try {
            const userTag = `${interaction.user.username}#${interaction.user.discriminator}`;
            const queue = player.nodes.get(interaction.guild.id);
            
            if (!queue) {
                await interaction.reply('❌ No queue to stop!');
                return;
            }
            
            if (queue.isPlaying()) {
                queue.stop();
            }
            queue.clear(); // Limpar fila
            console.log(`⏹️ [${userTag}] Stopped playback and cleared queue`);
            
            // O bot sairá automaticamente devido à configuração leaveOnStop: true
            await interaction.reply('⏹️ Playback stopped and queue cleared! The bot will leave the channel automatically.');
            
            // Forçar desconexão após um pequeno delay para garantir resource saving
            setTimeout(() => {
                if (queue && queue.connection) {
                    queue.delete();
                }
            }, 2000);
        } catch (error) {
            if (error.code === 10062 || error.message?.includes('Unknown interaction')) {
                return;
            }
            console.error('❌ Error stopping:', error);
        }
    }

    if (commandName === 'skip') {
        try {
            const userTag = `${interaction.user.username}#${interaction.user.discriminator}`;
            const queue = player.nodes.get(interaction.guild.id);
            if (!queue || !queue.isPlaying()) {
                await interaction.reply('❌ No music is playing!');
                return;
            }
            
            const currentTrack = queue.currentTrack;
            const skippedTitle = currentTrack.title;
            console.log(`⏭️ [${userTag}] Skipped: "${skippedTitle}"`);
            
            // Verificar se há próxima música antes de pular
            const hasNextTrack = queue.tracks.size > 0;
            
            // Pular a música
            queue.node.skip();
            
            // Aguardar um pouco para a próxima música começar (se houver)
            if (hasNextTrack) {
                await new Promise(resolve => setTimeout(resolve, 800));
            }
            
            // Verificar qual música está tocando agora
            const nowPlaying = queue.currentTrack;
            
            if (nowPlaying && queue.isPlaying()) {
                // Criar embed mostrando a música atual
                const embed = new EmbedBuilder()
                    .setTitle('⏭️ Música Pulada')
                    .setColor(0xFF6B6B)
                    .setDescription(`**${skippedTitle}** foi pulada`)
                    .addFields(
                        { name: '🎵 Now Playing', value: `**${nowPlaying.title}**\n🎤 ${nowPlaying.author || 'Desconhecido'}`, inline: false }
                    )
                    .setThumbnail(nowPlaying.thumbnail || currentTrack.thumbnail)
                    .setTimestamp();
                
                if (nowPlaying.duration) {
                    embed.addFields({ name: '⏱️ Duration', value: nowPlaying.duration, inline: true });
                }
                if (nowPlaying.url) {
                    embed.addFields({ name: '🔗 URL', value: `[Open](${nowPlaying.url})`, inline: true });
                }
                if (nowPlaying.requestedBy) {
                    embed.addFields({ name: '👤 Requested by', value: nowPlaying.requestedBy.toString(), inline: true });
                }
                
                await interaction.reply({ embeds: [embed] });
            } else {
                // Se não há próxima música, mostrar apenas que pulou
                await interaction.reply(`⏭️ Skipped: **${skippedTitle}**\n📭 No more music in queue.`);
            }
        } catch (error) {
            if (error.code === 10062 || error.message?.includes('Unknown interaction')) {
                return;
            }
            console.error('❌ Error skipping:', error);
            try {
                await interaction.reply('❌ Error skipping music.');
            } catch (replyError) {
                // Ignorar se a interação expirou
            }
        }
    }

    if (commandName === 'pause') {
        try {
            const userTag = `${interaction.user.username}#${interaction.user.discriminator}`;
            const queue = player.nodes.get(interaction.guild.id);
            if (!queue || !queue.isPlaying()) {
                await interaction.reply('❌ No music is playing!');
                return;
            }
            
            if (queue.node.isPaused()) {
                await interaction.reply('⏸️ Music is already paused!');
                return;
            }
            
            console.log(`⏸️ [${userTag}] Pausou: "${queue.currentTrack.title}"`);
            queue.node.pause();
            await interaction.reply('⏸️ Music paused!');
        } catch (error) {
            if (error.code === 10062 || error.message?.includes('Unknown interaction')) {
                return;
            }
            console.error('❌ Error pausing:', error);
        }
    }

    if (commandName === 'resume') {
        try {
            const userTag = `${interaction.user.username}#${interaction.user.discriminator}`;
            const queue = player.nodes.get(interaction.guild.id);
            if (!queue || !queue.isPlaying()) {
                await interaction.reply('❌ No music is playing!');
                return;
            }
            
            if (!queue.node.isPaused()) {
                await interaction.reply('▶️ Music is already playing!');
                return;
            }
            
            console.log(`▶️ [${userTag}] Retomou: "${queue.currentTrack.title}"`);
            queue.node.resume();
            await interaction.reply('▶️ Music resumed!');
        } catch (error) {
            if (error.code === 10062 || error.message?.includes('Unknown interaction')) {
                return;
            }
            console.error('❌ Error resuming:', error);
        }
    }

    if (commandName === 'queue') {
        try {
            const queue = player.nodes.get(interaction.guild.id);
            if (!queue || queue.size === 0) {
                await interaction.reply('📭 The queue is empty!');
                return;
            }

            const page = interaction.options.getInteger('page') || 1;
            const pageSize = 10;
            const totalPages = Math.ceil(queue.size / pageSize);
            const startIndex = (page - 1) * pageSize;
            const endIndex = Math.min(startIndex + pageSize, queue.size);

            const queueList = queue.tracks.toArray().slice(startIndex, endIndex)
                .map((track, index) => `${startIndex + index + 1}. **${track.title}** - ${track.author}`)
                .join('\n');

            const embed = new EmbedBuilder()
                .setTitle('📋 Music Queue')
                .setColor(0x1DB954)
                .setDescription(queueList)
                .addFields(
                    { name: '📊 Total', value: `${queue.size} song(s)`, inline: true },
                    { name: '📄 Page', value: `${page}/${totalPages}`, inline: true },
                    { name: '⏱️ Total Duration', value: formatDuration(queue.duration), inline: true }
                )
                .setTimestamp();

            if (queue.currentTrack) {
                embed.addFields({ 
                    name: '🎵 Now Playing', 
                    value: `**${queue.currentTrack.title}** - ${queue.currentTrack.author}`,
                    inline: false 
                });
            }

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            if (error.code === 10062 || error.message?.includes('Unknown interaction')) {
                return;
            }
            console.error('❌ Error showing queue:', error);
        }
    }

    if (commandName === 'nowplaying') {
        try {
            const queue = player.nodes.get(interaction.guild.id);
            if (!queue || !queue.currentTrack) {
                await interaction.reply('❌ No music is playing!');
                return;
            }

            const track = queue.currentTrack;
            const progress = queue.node.getTimestamp();
            
            const embed = new EmbedBuilder()
                .setTitle('🎵 Now Playing')
                .setColor(0x1DB954)
                .setDescription(`**${track.title}**\n🎤 ${track.author}`)
                .setThumbnail(track.thumbnail)
                .addFields(
                    { name: '🔗 URL', value: `[Open](${track.url})`, inline: true },
                    { name: '⏱️ Duration', value: track.duration, inline: true },
                    { name: '👤 Requested by', value: track.requestedBy?.toString() || 'N/A', inline: true }
                );

            if (progress) {
                embed.addFields({ 
                    name: '⏳ Progress', 
                    value: `${progress.current.label} / ${progress.total.label}`,
                    inline: false 
                });
            }

            embed.setTimestamp();
            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            if (error.code === 10062 || error.message?.includes('Unknown interaction')) {
                return;
            }
            console.error('❌ Error showing current music:', error);
        }
    }

    if (commandName === 'volume') {
        try {
            const queue = player.nodes.get(interaction.guild.id);
            if (!queue || !queue.isPlaying()) {
                await interaction.reply('❌ No music is playing!');
                return;
            }

            const volume = interaction.options.getInteger('value');
            if (volume !== null) {
                queue.node.setVolume(volume);
                await interaction.reply(`🔊 Volume set to **${volume}%**`);
            } else {
                await interaction.reply(`🔊 Current volume: **${queue.node.volume}%**`);
            }
        } catch (error) {
            if (error.code === 10062 || error.message?.includes('Unknown interaction')) {
                return;
            }
            console.error('❌ Error adjusting volume:', error);
        }
    }

    if (commandName === 'clear') {
        try {
            const queue = player.nodes.get(interaction.guild.id);
            if (!queue || queue.size === 0) {
                await interaction.reply('📭 The queue is already empty!');
                return;
            }

            const cleared = queue.size;
            queue.clear();
            await interaction.reply(`🗑️ Removed **${cleared}** song(s) from the queue!`);
        } catch (error) {
            if (error.code === 10062 || error.message?.includes('Unknown interaction')) {
                return;
            }
            console.error('❌ Erro ao limpar fila:', error);
        }
    }

    if (commandName === 'shuffle') {
        try {
            const queue = player.nodes.get(interaction.guild.id);
            if (!queue || queue.size < 2) {
                await interaction.reply('❌ You need at least 2 songs in queue to shuffle!');
                return;
            }

            queue.tracks.shuffle();
            await interaction.reply('🔀 Queue shuffled!');
        } catch (error) {
            if (error.code === 10062 || error.message?.includes('Unknown interaction')) {
                return;
            }
            console.error('❌ Erro ao embaralhar:', error);
        }
    }

    if (commandName === 'loop') {
        try {
            const queue = player.nodes.get(interaction.guild.id);
            if (!queue || !queue.isPlaying()) {
                await interaction.reply('❌ No music is playing!');
                return;
            }

            const mode = interaction.options.getString('mode');
            let loopMode;
            let modeTexto;

            switch (mode) {
                case 'track':
                    loopMode = 1; // Repeat current track
                    modeTexto = '🔄 Current track';
                    break;
                case 'queue':
                    loopMode = 2; // Repeat entire queue
                    modeTexto = '🔁 Entire queue';
                    break;
                case 'off':
                default:
                    loopMode = 0; // Off
                    modeTexto = '❌ Off';
                    break;
            }

            queue.setRepeatMode(loopMode);
            await interaction.reply(`🔁 Repeat mode: **${modeTexto}**`);
        } catch (error) {
            if (error.code === 10062 || error.message?.includes('Unknown interaction')) {
                return;
            }
            console.error('❌ Error configuring loop:', error);
        }
    }

    if (commandName === 'remove') {
        try {
            const queue = player.nodes.get(interaction.guild.id);
            if (!queue || queue.size === 0) {
                await interaction.reply('📭 The queue is empty!');
                return;
            }

            const position = interaction.options.getInteger('position');
            if (position > queue.size) {
                await interaction.reply(`❌ Queue has only **${queue.size}** song(s)!`);
                return;
            }

            const track = queue.tracks.at(position - 1);
            if (!track) {
                await interaction.reply('❌ Music not found at that position!');
                return;
            }

            queue.removeTrack(track);
            await interaction.reply(`🗑️ Removed: **${track.title}** (position ${position})`);
        } catch (error) {
            if (error.code === 10062 || error.message?.includes('Unknown interaction')) {
                return;
            }
            console.error('❌ Error removing music:', error);
        }
    }

    if (commandName === 'jump') {
        try {
            const queue = player.nodes.get(interaction.guild.id);
            if (!queue || queue.size === 0) {
                await interaction.reply('📭 The queue is empty!');
                return;
            }

            const position = interaction.options.getInteger('position');
            if (position > queue.size) {
                await interaction.reply(`❌ Queue has only **${queue.size}** song(s)!`);
                return;
            }

            const track = queue.tracks.at(position - 1);
            if (!track) {
                await interaction.reply('❌ Music not found at that position!');
                return;
            }

            // Mover a música para a posição 0 (próxima a tocar)
            queue.node.skipTo(track);
            await interaction.reply(`⏭️ Jumped to: **${track.title}** (position ${position})`);
        } catch (error) {
            if (error.code === 10062 || error.message?.includes('Unknown interaction')) {
                return;
            }
            console.error('❌ Error skipping music:', error);
        }
    }

    if (commandName === 'remove-duplicates') {
        try {
            const queue = player.nodes.get(interaction.guild.id);
            if (!queue || queue.size === 0) {
                await interaction.reply('📭 The queue is empty!');
                return;
            }

            const tracks = queue.tracks.toArray();
            const seen = new Set();
            let removed = 0;

            // Percorrer de trás para frente para não afetar os índices
            for (let i = tracks.length - 1; i >= 0; i--) {
                const track = tracks[i];
                const key = `${track.url || track.title}_${track.author}`;
                
                if (seen.has(key)) {
                    queue.removeTrack(track);
                    removed++;
                } else {
                    seen.add(key);
                }
            }

            if (removed === 0) {
                await interaction.reply('✅ No duplicate music found!');
            } else {
                await interaction.reply(`🗑️ Removed **${removed}** duplicate song(s)!`);
            }
        } catch (error) {
            if (error.code === 10062 || error.message?.includes('Unknown interaction')) {
                return;
            }
            console.error('❌ Error removing duplicates:', error);
        }
    }

    if (commandName === 'seek') {
        try {
            const queue = player.nodes.get(interaction.guild.id);
            if (!queue || !queue.isPlaying()) {
                await interaction.reply('❌ No music is playing!');
                return;
            }

            const time = interaction.options.getString('time');
            let segundos = 0;

            // Tentar parsear formato MM:SS
            if (time.includes(':')) {
                const partes = time.split(':');
                if (partes.length === 2) {
                    const minutos = parseInt(partes[0]) || 0;
                    const segs = parseInt(partes[1]) || 0;
                    segundos = minutos * 60 + segs;
                } else if (partes.length === 3) {
                    // Formato HH:MM:SS
                    const horas = parseInt(partes[0]) || 0;
                    const minutos = parseInt(partes[1]) || 0;
                    const segs = parseInt(partes[2]) || 0;
                    segundos = horas * 3600 + minutos * 60 + segs;
                }
            } else {
                // Tentar parsear como segundos diretos
                segundos = parseInt(time) || 0;
            }

            if (segundos < 0) {
                await interaction.reply('❌ Time cannot be negative!');
                return;
            }

            const currentTrack = queue.currentTrack;
            const trackDuration = currentTrack.durationMS || 0;
            
            if (trackDuration > 0 && segundos > trackDuration / 1000) {
                await interaction.reply(`❌ Time cannot be greater than the song duration (${formatDuration(trackDuration)})!`);
                return;
            }

            await queue.node.seek(segundos * 1000);
            
            const minutos = Math.floor(segundos / 60);
            const segs = segundos % 60;
            const timeFormatado = `${minutos}:${segs.toString().padStart(2, '0')}`;
            
            await interaction.reply(`⏩ Seeked to **${timeFormatado}**`);
        } catch (error) {
            if (error.code === 10062 || error.message?.includes('Unknown interaction')) {
                return;
            }
            console.error('❌ Error seeking:', error);
            try {
                await interaction.reply('❌ Error seeking music. Format must be MM:SS or seconds (e.g: 1:30 or 90)');
            } catch (replyError) {
                // Ignorar se a interação expirou
            }
        }
    }

    if (commandName === 'ping') {
        try {
            await interaction.reply('🏓 Pong!');
        } catch (error) {
            // Ignorar erros de interação expirada
            if (error.code === 10062 || error.message?.includes('Unknown interaction')) {
                return;
            }
            console.error('❌ Error responding to ping:', error);
        }
    }

    if (commandName === 'reload') {
        try {
            // Verificar se o usuário tem permissão de administrador
            if (!interaction.member.permissions.has('Administrator')) {
                await interaction.reply('❌ You need Administrator permission to reload commands!');
                return;
            }

            await interaction.deferReply({ ephemeral: true });
            
            const guildId = interaction.guild.id;
            const result = await registerGuildCommands(guildId);
            
            if (result.success) {
                await interaction.editReply(`✅ Successfully reloaded ${result.count} command(s) in this server!\n⏳ Commands should be available immediately.`);
            } else {
                await interaction.editReply(`❌ Failed to reload commands: ${result.error}`);
            }
        } catch (error) {
            if (error.code === 10062 || error.message?.includes('Unknown interaction')) {
                return;
            }
            console.error('❌ Error reloading commands:', error);
            try {
                await interaction.editReply('❌ Error reloading commands. Please try again later.');
            } catch (replyError) {
                // Ignorar se a interação expirou
            }
        }
    }

    if (commandName === 'test') {
        try {
            await interaction.deferReply();

            // Verificar se o usuário está em um canal de voz
            const voiceChannel = interaction.member.voice.channel;
            if (!voiceChannel) {
                await interaction.editReply('❌ You need to be in a voice channel to use this command!');
                return;
            }

            const url = interaction.options.getString('url');
            
            // Buscar usando Discord Player
            const searchResult = await player.search(url, {
                requestedBy: interaction.user
            });

            if (!searchResult.hasTracks()) {
                await interaction.editReply('⚠️ Could not find audio for this URL.');
                return;
            }

            // Obter ou criar fila e conectar
            const queue = await getOrCreateQueue(interaction.guild, interaction.channel, voiceChannel);

            // Adicionar à fila e reproduzir
            await playTrack(queue, searchResult.tracks[0]);

            const embed = new EmbedBuilder()
                .setTitle('✅ Teste de Reprodução')
                .setColor(0x1DB954)
                .setDescription(`**${searchResult.tracks[0].title}**`)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            // Ignorar erros de interação expirada
            if (error.code === 10062 || error.message?.includes('Unknown interaction')) {
                return;
            }
            console.error('❌ Error playing:', error);
            try {
                await interaction.editReply(`❌ Error playing: ${error.message}`);
            } catch (replyError) {
                // Interação pode ter expirado, ignorar silenciosamente
            }
        }
    }
});

// Login
client.login(process.env.DISCORD_TOKEN);
