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
const { YouTubeExtractor } = require('./youtube-extractor');
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

// Inicializar Discord Player
const player = new Player(client, {
    blockExtractors: [],
    blockStreamFrom: [],
    skipFFmpeg: false
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
        
        // Listar extractors disponíveis
        const extractors = player.extractors.store;
        console.log(`✅ Extractors registrados: ${extractors.size} disponíveis`);
        if (process.env.DEBUG === 'true') {
            console.log('📝 Extractors disponíveis:');
            extractors.forEach((extractor, id) => {
                console.log(`   - ${id}`);
            });
        }
    } catch (error) {
        console.error('❌ Erro ao registrar extractors:', error);
    }
})();

// Credenciais Spotify
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

let accessToken = null;
let tokenExpiry = 0;
let tokenRefreshPromise = null;

// Cache de buscas do Spotify (5 minutos TTL)
const searchCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos
const MAX_CACHE_SIZE = 100; // Limite máximo de entradas no cache

// Armazenamento temporário para seleções de música (30 segundos TTL)
const pendingSelections = new Map();
const SELECTION_TTL = 30 * 1000; // 30 segundos

// Timeouts armazenados para poder cancelá-los se necessário
const activeTimeouts = new Map();

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
            
            throw new Error('Não foi possível obter o token de acesso');
        } catch (error) {
            console.error('Erro ao obter token do Spotify:', error.message);
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

// Função para buscar música no Spotify com cache
async function searchTrack(query) {
    // Verificar cache primeiro
    const cacheKey = query.toLowerCase().trim();
    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() < cached.expiry) {
        console.log(`      💾 Resultado encontrado no cache`);
        return cached.data;
    }

    console.log(`      🌐 Fazendo requisição à API do Spotify...`);
    const token = await ensureAccessToken();
    if (!token) {
        console.error('      ❌ Token do Spotify não disponível');
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
        
        console.log(`      ✅ Spotify retornou ${tracks.length} resultado(s)`);
        
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
        console.error(`      ❌ Erro ao buscar no Spotify: ${error.message}`);
        return [];
    }
}

// Comandos Slash
const commands = [
    new SlashCommandBuilder()
        .setName('play')
        .setDescription('Toca uma música no canal de voz')
        .addStringOption(option =>
            option.setName('busca')
                .setDescription('Nome da música/cantor ou URL (YouTube, Spotify, etc)')
                .setRequired(true)
        ),
    
    new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Para a reprodução de música e limpa a fila'),
    
    new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Pula a música atual'),
    
    new SlashCommandBuilder()
        .setName('pause')
        .setDescription('Pausa a reprodução'),
    
    new SlashCommandBuilder()
        .setName('resume')
        .setDescription('Retoma a reprodução pausada'),
    
    new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Mostra a fila de músicas')
        .addIntegerOption(option =>
            option.setName('pagina')
                .setDescription('Número da página (padrão: 1)')
                .setMinValue(1)
        ),
    
    new SlashCommandBuilder()
        .setName('nowplaying')
        .setDescription('Mostra a música que está tocando agora'),
    
    new SlashCommandBuilder()
        .setName('volume')
        .setDescription('Define o volume do bot (0-100)')
        .addIntegerOption(option =>
            option.setName('valor')
                .setDescription('Volume de 0 a 100')
                .setMinValue(0)
                .setMaxValue(100)
        ),
    
    new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Limpa a fila de músicas'),
    
    new SlashCommandBuilder()
        .setName('shuffle')
        .setDescription('Embaralha a fila de músicas'),
    
    new SlashCommandBuilder()
        .setName('loop')
        .setDescription('Define o modo de repetição')
        .addStringOption(option =>
            option.setName('modo')
                .setDescription('Modo de repetição')
                .setRequired(true)
                .addChoices(
                    { name: 'Desligado', value: 'off' },
                    { name: 'Música atual', value: 'track' },
                    { name: 'Fila inteira', value: 'queue' }
                )
        ),
    
    new SlashCommandBuilder()
        .setName('remove')
        .setDescription('Remove uma música da fila')
        .addIntegerOption(option =>
            option.setName('posicao')
                .setDescription('Posição da música na fila (começa em 1)')
                .setRequired(true)
                .setMinValue(1)
        ),
    
    new SlashCommandBuilder()
        .setName('jump')
        .setDescription('Pula para uma música específica na fila')
        .addIntegerOption(option =>
            option.setName('posicao')
                .setDescription('Posição da música na fila (começa em 1)')
                .setRequired(true)
                .setMinValue(1)
        ),
    
    new SlashCommandBuilder()
        .setName('remove-duplicates')
        .setDescription('Remove músicas duplicadas da fila'),
    
    new SlashCommandBuilder()
        .setName('seek')
        .setDescription('Avança ou retrocede na música atual')
        .addStringOption(option =>
            option.setName('tempo')
                .setDescription('Tempo no formato MM:SS ou segundos (ex: 1:30 ou 90)')
                .setRequired(true)
        ),
    
    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Responde com Pong!'),
    
    new SlashCommandBuilder()
        .setName('teste')
        .setDescription('Testa reprodução de áudio')
        .addStringOption(option =>
            option.setName('url')
                .setDescription('URL ou caminho do arquivo de áudio')
                .setRequired(true)
        )
];

// Registrar comandos
async function registerCommands() {
    try {
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
        
        console.log('🔄 Atualizando comandos slash...');
        
        // Limpar comandos antigos primeiro e depois registrar os novos
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
        );
        
        console.log(`✅ ${commands.length} comando(s) atualizado(s) com sucesso!`);
        console.log('📝 Comandos disponíveis:', commands.map(cmd => `/${cmd.name}`).join(', '));
    } catch (error) {
        console.error('❌ Erro ao registrar comandos:', error);
        
        // Se for erro de rate limit, mostrar mensagem mais amigável
        if (error.status === 429) {
            console.error('⚠️ Rate limit atingido. Aguarde alguns minutos antes de tentar novamente.');
        } else {
            console.error('💡 Dica: Verifique se CLIENT_ID no .env está correto');
        }
    }
}

// Evento quando o bot está pronto
client.once('clientReady', async () => {
    console.log(`Bot conectado como ${client.user.tag}!`);
    
    // Obter token inicial do Spotify
    await getSpotifyAccessToken();
    
    // Registrar comandos
    await registerCommands();
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
            leaveOnEmpty: true, // Deixar canal quando vazio (economia de recursos)
            leaveOnEnd: false, // Não deixar quando terminar (pode ter mais músicas)
            leaveOnEmptyCooldown: 60000 // Aguardar 1 minuto antes de sair quando vazio
        });
    }

    if (!queue.connection) {
        try {
            await queue.connect(voiceChannel);
        } catch (error) {
            console.error('❌ Erro ao conectar ao canal de voz:', error.message);
            throw new Error('Não foi possível conectar ao canal de voz. Verifique as permissões.');
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
    console.error('❌ Erro na fila:', error.message);
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
    // Log apenas em modo debug se necessário
    if (process.env.DEBUG === 'true') {
        console.log('🎵 Tocando agora:', track.title);
    }
});

// Evento quando uma track termina
player.events.on('audioTrackEnd', (queue, track) => {
    // Log apenas em modo debug se necessário
    if (process.env.DEBUG === 'true') {
        console.log('✅ Track terminada:', track.title);
    }
});

// Evento para interações
client.on('interactionCreate', async interaction => {
    // Handler para seleção de música do menu
    if (interaction.isStringSelectMenu()) {
        if (interaction.customId.startsWith('select_track_')) {
            try {
                await interaction.deferUpdate();

                // Buscar a seleção pelo customId
                const selectionData = pendingSelections.get(interaction.customId);

                if (!selectionData) {
                    await interaction.followUp({ 
                        content: '❌ Esta seleção expirou ou não foi encontrada. Use `/play` novamente.', 
                        ephemeral: true 
                    });
                    return;
                }

                // Verificar se expirou
                if (Date.now() > selectionData.expiry) {
                    pendingSelections.delete(interaction.customId);
                    await interaction.followUp({ 
                        content: '❌ Esta seleção expirou. Use `/play` novamente.', 
                        ephemeral: true 
                    });
                    return;
                }

                // Verificar se é o usuário correto
                if (selectionData.userId !== interaction.user.id) {
                    await interaction.followUp({ 
                        content: '❌ Esta seleção não é sua! Use `/play` para criar sua própria seleção.', 
                        ephemeral: true 
                    });
                    return;
                }

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
                        content: '❌ Música selecionada não encontrada.', 
                        ephemeral: true 
                    });
                    return;
                }

                console.log(`\n🎵 [${interaction.user.username}#${interaction.user.discriminator}] Selecionou: "${selectedTrack.name}"`);
                
                // Mostrar mensagem de carregamento imediatamente
                const loadingEmbed = new EmbedBuilder()
                    .setTitle('⏳ Carregando Música')
                    .setColor(0xFFA500)
                    .setDescription(`**${selectedTrack.name}**\n🎤 ${selectedTrack.artists.map(a => a.name).join(', ')}`)
                    .setThumbnail(selectedTrack.album.images[0]?.url)
                    .addFields(
                        { name: '💿 Álbum', value: selectedTrack.album.name, inline: true },
                        { name: '⏱️ Duração', value: `${Math.floor(selectedTrack.duration_ms / 60000)}:${((selectedTrack.duration_ms % 60000) / 1000).toFixed(0).padStart(2, '0')}`, inline: true }
                    )
                    .setFooter({ text: '🔍 Buscando áudio...' })
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
                        content: '❌ Você precisa estar em um canal de voz!', 
                        ephemeral: true 
                    });
                    return;
                }

                // Buscar áudio no YouTube
                const searchQuery = `${selectedTrack.artists[0].name} - ${selectedTrack.name}`;
                console.log(`   🎬 Buscando áudio no YouTube: "${searchQuery}"...`);
                
                // Atualizar embed para mostrar que está buscando
                loadingEmbed.setFooter({ text: '🎬 Buscando no YouTube...' });
                await interaction.editReply({ embeds: [loadingEmbed] });
                
                const searchResult = await player.search(searchQuery, {
                    requestedBy: interaction.user
                });

                if (!searchResult.hasTracks()) {
                    // Atualizar embed com erro
                    loadingEmbed.setTitle('❌ Erro ao Encontrar Áudio')
                        .setColor(0xFF0000)
                        .setFooter({ text: 'Não foi possível encontrar áudio' });
                    
                    await interaction.editReply({ embeds: [loadingEmbed] });
                    await interaction.followUp({ 
                        content: '⚠️ Não foi possível encontrar áudio para esta música no YouTube.', 
                        ephemeral: true 
                    });
                    return;
                }

                // Atualizar embed para mostrar que encontrou e está adicionando
                loadingEmbed.setFooter({ text: '▶️ Adicionando à fila...' });
                await interaction.editReply({ embeds: [loadingEmbed] });

                // Criar embed final
                const embed = new EmbedBuilder()
                    .setTitle('🎵 Tocando Agora')
                    .setColor(0x1DB954)
                    .setDescription(`**${selectedTrack.name}**\n🎤 ${selectedTrack.artists.map(a => a.name).join(', ')}`)
                    .setThumbnail(selectedTrack.album.images[0]?.url)
                    .addFields(
                        { name: '💿 Álbum', value: selectedTrack.album.name, inline: true },
                        { name: '⏱️ Duração', value: `${Math.floor(selectedTrack.duration_ms / 60000)}:${((selectedTrack.duration_ms % 60000) / 1000).toFixed(0).padStart(2, '0')}`, inline: true },
                        { name: '🔗 Link', value: `[Abrir no Spotify](${selectedTrack.external_urls.spotify})`, inline: true }
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
                    embed.setTitle('🎵 Tocando Agora');
                    embed.setFooter({ text: '✅ Música iniciada com sucesso!' });
                } else {
                    embed.setTitle('➕ Adicionado à Fila');
                    embed.addFields({ name: '📊 Posição', value: `#${queueSize + 1} na fila`, inline: true });
                    embed.setFooter({ text: '✅ Música adicionada à fila!' });
                }

                // Atualizar a mensagem original com o resultado final
                await interaction.editReply({ 
                    embeds: [embed], 
                    components: [] 
                });

            } catch (error) {
                console.error('❌ Erro ao processar seleção:', error);
                try {
                    await interaction.followUp({ 
                        content: '❌ Erro ao reproduzir a música selecionada.', 
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
                await interaction.editReply('❌ Você precisa estar em um canal de voz para usar este comando!');
                return;
            }

            let query = interaction.options.getString('busca');
            
            // Validar e limpar query
            if (!query || typeof query !== 'string') {
                await interaction.reply('❌ Por favor, forneça um nome de música, artista ou URL válida.');
                return;
            }
            
            query = query.trim();
            
            // Limitar comprimento da query (evitar queries muito longas)
            if (query.length > 200) {
                query = query.substring(0, 200);
            }
            
            if (query.length === 0) {
                await interaction.reply('❌ A busca não pode estar vazia.');
                return;
            }
            
            console.log(`\n🎵 [${userTag}] Iniciando busca: "${query.substring(0, 50)}${query.length > 50 ? '...' : ''}"`);
            
            // Detectar se é URL (mais preciso: deve conter domínio válido)
            const isUrl = /^(https?:\/\/)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/.test(query) || 
                         query.toLowerCase().includes('youtube.com') || 
                         query.toLowerCase().includes('youtu.be') ||
                         query.toLowerCase().includes('spotify.com') ||
                         query.toLowerCase().startsWith('http://') ||
                         query.toLowerCase().startsWith('https://');
            console.log(`   📍 Tipo detectado: ${isUrl ? 'URL' : 'Nome de música'}`);
            
            let searchResult;
            let embed;
            let preQueue = null;
            let isUrlFinal = isUrl; // Variável mutável para fallback

            if (isUrlFinal) {
                console.log(`   🔍 Buscando áudio diretamente da URL...`);
                const urlSearchStart = Date.now();
                
                // Se for URL, usar diretamente o discord-player
                try {
                    searchResult = await player.search(query, {
                        requestedBy: interaction.user
                    });
                    
                    if (process.env.DEBUG === 'true') {
                        console.log(`   📊 Resultado da busca:`, {
                            hasTracks: searchResult.hasTracks(),
                            loadType: searchResult.loadType,
                            playlist: searchResult.playlist ? 'Sim' : 'Não'
                        });
                    }
                } catch (searchError) {
                    console.error(`   ❌ Erro na busca:`, searchError.message);
                    searchResult = { hasTracks: () => false };
                }

                const urlSearchTime = ((Date.now() - urlSearchStart) / 1000).toFixed(2);
                
                if (!searchResult.hasTracks()) {
                    console.log(`   ❌ Nenhum áudio encontrado para a URL (${urlSearchTime}s)`);
                    console.log(`   📝 Tipo de resultado: ${searchResult.loadType || 'UNKNOWN'}`);
                    console.log(`   🔄 Tentando buscar como nome de música...`);
                    
                    // Fallback: tentar buscar no Spotify primeiro se URL não funcionar
                    const fallbackTracks = await searchTrack(query);
                    if (fallbackTracks && fallbackTracks.length > 0) {
                        const spotifyTrack = fallbackTracks[0];
                        const searchQuery = `${spotifyTrack.artists[0].name} - ${spotifyTrack.name}`;
                        
                        const fallbackResult = await player.search(searchQuery, {
                            requestedBy: interaction.user
                        });
                        
                        if (fallbackResult.hasTracks()) {
                            console.log(`   ✅ Fallback encontrou música via Spotify: "${spotifyTrack.name}"`);
                            searchResult = fallbackResult;
                            isUrlFinal = false; // Marcar como não URL para usar lógica de nome
                            
                            embed = new EmbedBuilder()
                                .setTitle('🎵 Tocando Agora')
                                .setColor(0x1DB954)
                                .setDescription(`**${spotifyTrack.name}**\n🎤 ${spotifyTrack.artists.map(a => a.name).join(', ')}`)
                                .setThumbnail(spotifyTrack.album.images[0]?.url)
                                .addFields(
                                    { name: '💿 Álbum', value: spotifyTrack.album.name, inline: true },
                                    { name: '⏱️ Duração', value: `${Math.floor(spotifyTrack.duration_ms / 60000)}:${((spotifyTrack.duration_ms % 60000) / 1000).toFixed(0).padStart(2, '0')}`, inline: true },
                                    { name: '🔗 Link', value: `[Abrir no Spotify](${spotifyTrack.external_urls.spotify})`, inline: true }
                                )
                                .setTimestamp();
                        } else {
                            await interaction.editReply('⚠️ Não foi possível encontrar áudio para esta URL ou busca.');
                            return;
                        }
                    } else {
                        await interaction.editReply('⚠️ Não foi possível encontrar áudio para esta URL ou busca.');
                        return;
                    }
                }

                // Só criar embed se não foi criado no fallback
                if (!embed) {
                    const track = searchResult.tracks[0];
                    console.log(`   ✅ Áudio encontrado: "${track.title}" (${urlSearchTime}s)`);
                    
                    // Criar embed simples para URL
                    embed = new EmbedBuilder()
                        .setTitle('🎵 Tocando Agora')
                        .setColor(0x1DB954)
                        .setDescription(`**${track.title}**\n🎤 ${track.author || 'Desconhecido'}`)
                        .setThumbnail(track.thumbnail)
                        .addFields(
                            { name: '⏱️ Duração', value: track.duration || 'Desconhecido', inline: true },
                            { name: '🔗 URL', value: `[Abrir](${track.url})`, inline: true }
                        )
                        .setTimestamp();
                }

            } else {
                // Se for nome, buscar no Spotify e preparar conexão em paralelo
                console.log(`   🎧 Buscando no Spotify...`);
                const spotifyStart = Date.now();
                
                // Iniciar busca no Spotify e preparação da fila em paralelo
                const [tracks, queuePrepared] = await Promise.all([
                    searchTrack(query),
                    getOrCreateQueue(interaction.guild, interaction.channel, voiceChannel).catch(() => null)
                ]);
                
                preQueue = queuePrepared;
                
                const spotifyTime = ((Date.now() - spotifyStart) / 1000).toFixed(2);

                if (!tracks || tracks.length === 0) {
                    console.log(`   ❌ Nenhuma música encontrada no Spotify (${spotifyTime}s)`);
                    await interaction.editReply('❌ Nenhuma música encontrada no Spotify!');
                    return;
                }

                // Se há múltiplas músicas, mostrar menu de seleção
                if (tracks.length > 1) {
                    console.log(`   📋 Encontradas ${tracks.length} músicas, mostrando menu de seleção...`);
                    
                    // Criar ID único para esta seleção
                    const selectionId = `select_track_${interaction.user.id}_${Date.now()}`;
                    
                    // Criar menu de seleção (máximo 25 opções no Discord)
                    const selectMenu = new StringSelectMenuBuilder()
                        .setCustomId(selectionId)
                        .setPlaceholder('Escolha uma música para tocar...')
                        .addOptions(
                            tracks.slice(0, 25).map((track, index) => ({
                                label: track.name.length > 100 ? track.name.substring(0, 97) + '...' : track.name,
                                description: `${track.artists.map(a => a.name).join(', ')} • ${Math.floor(track.duration_ms / 60000)}:${((track.duration_ms % 60000) / 1000).toFixed(0).padStart(2, '0')}`,
                                value: index.toString(),
                                emoji: '🎵'
                            }))
                        );

                    // Armazenar as músicas temporariamente
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
                        .setTitle('🎵 Escolha uma Música')
                        .setColor(0x1DB954)
                        .setDescription(`Encontrei **${tracks.length}** música(s) para **"${query}"**\n\nUse o menu abaixo para escolher qual tocar:`)
                        .setFooter({ text: 'Menu expira em 30 segundos' })
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
                    .setTitle('🎵 Tocando Agora')
                    .setColor(0x1DB954)
                    .setDescription(`**${spotifyTrack.name}**\n🎤 ${spotifyTrack.artists.map(a => a.name).join(', ')}`)
                    .setThumbnail(spotifyTrack.album.images[0]?.url)
                    .addFields(
                        { name: '💿 Álbum', value: spotifyTrack.album.name, inline: true },
                        { name: '⏱️ Duração', value: `${Math.floor(spotifyTrack.duration_ms / 60000)}:${((spotifyTrack.duration_ms % 60000) / 1000).toFixed(0).padStart(2, '0')}`, inline: true },
                        { name: '🔗 Link', value: `[Abrir no Spotify](${spotifyTrack.external_urls.spotify})`, inline: true }
                    )
                    .setTimestamp();

                // Buscar no YouTube usando o nome da música do Spotify
                const searchQuery = `${spotifyTrack.artists[0].name} - ${spotifyTrack.name}`;
                console.log(`   🎬 Buscando áudio no YouTube: "${searchQuery}"...`);
                const youtubeStart = Date.now();
                
                try {
                    searchResult = await player.search(searchQuery, {
                        requestedBy: interaction.user
                    });
                    
                    if (process.env.DEBUG === 'true') {
                        console.log(`   📊 Resultado YouTube:`, {
                            hasTracks: searchResult.hasTracks(),
                            loadType: searchResult.loadType,
                            tracks: searchResult.hasTracks() ? searchResult.tracks.length : 0
                        });
                    }
                } catch (searchError) {
                    console.error(`   ❌ Erro na busca YouTube:`, searchError.message);
                    searchResult = { hasTracks: () => false };
                }

                const youtubeTime = ((Date.now() - youtubeStart) / 1000).toFixed(2);

                if (!searchResult.hasTracks()) {
                    console.log(`   ❌ Nenhum áudio encontrado no YouTube (${youtubeTime}s)`);
                    console.log(`   📝 Tipo de resultado: ${searchResult.loadType || 'UNKNOWN'}`);
                    console.log(`   🔄 Tentando busca direta como fallback (query original: "${query}")...`);
                    
                    // Fallback 1: tentar buscar diretamente no player sem passar pelo Spotify
                    let fallbackResult;
                    try {
                        fallbackResult = await player.search(query, {
                            requestedBy: interaction.user
                        });
                        
                        if (process.env.DEBUG === 'true') {
                            console.log(`   📊 Resultado fallback 1:`, {
                                hasTracks: fallbackResult.hasTracks(),
                                loadType: fallbackResult.loadType
                            });
                        }
                    } catch (fallbackError) {
                        console.error(`   ❌ Erro no fallback 1:`, fallbackError.message);
                        fallbackResult = { hasTracks: () => false };
                    }
                    
                    // Fallback 2: tentar buscar apenas o nome da música (sem artista)
                    if (!fallbackResult.hasTracks() && spotifyTrack) {
                        console.log(`   🔄 Tentando fallback 2: apenas nome da música...`);
                        try {
                            const fallback2Result = await player.search(spotifyTrack.name, {
                                requestedBy: interaction.user
                            });
                            
                            if (fallback2Result.hasTracks()) {
                                console.log(`   ✅ Fallback 2 encontrou: "${fallback2Result.tracks[0].title}"`);
                                fallbackResult = fallback2Result;
                            }
                        } catch (fallback2Error) {
                            console.error(`   ❌ Erro no fallback 2:`, fallback2Error.message);
                        }
                    }
                    
                    // Fallback 3: tentar buscar com "official" ou "audio"
                    if (!fallbackResult.hasTracks() && spotifyTrack) {
                        console.log(`   🔄 Tentando fallback 3: com termos adicionais...`);
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
                                    console.log(`   ✅ Fallback 3 encontrou com: "${fallbackQuery}"`);
                                    fallbackResult = fallback3Result;
                                    break;
                                }
                            }
                        } catch (fallback3Error) {
                            console.error(`   ❌ Erro no fallback 3:`, fallback3Error.message);
                        }
                    }
                    
                    if (fallbackResult && fallbackResult.hasTracks()) {
                        console.log(`   ✅ Fallback encontrou: "${fallbackResult.tracks[0].title}"`);
                        searchResult = fallbackResult;
                        
                        // Criar embed simples para resultado do fallback
                        embed = new EmbedBuilder()
                            .setTitle('🎵 Tocando Agora')
                            .setColor(0x1DB954)
                            .setDescription(`**${fallbackResult.tracks[0].title}**\n🎤 ${fallbackResult.tracks[0].author || 'Desconhecido'}`)
                            .setThumbnail(fallbackResult.tracks[0].thumbnail)
                            .addFields(
                                { name: '⏱️ Duração', value: fallbackResult.tracks[0].duration || 'Desconhecido', inline: true },
                                { name: '🔗 URL', value: `[Abrir](${fallbackResult.tracks[0].url})`, inline: true }
                            )
                            .setTimestamp();
                    } else {
                        console.log(`   ❌ Todos os fallbacks falharam`);
                        console.log(`   💡 Dica: Tente uma busca mais específica ou use uma URL direta`);
                        await interaction.editReply('⚠️ Não foi possível encontrar áudio para esta música. Tente ser mais específico ou use uma URL do YouTube/SoundCloud.');
                        return;
                    }
                } else {
                    console.log(`   ✅ YouTube: "${searchResult.tracks[0].title}" (${youtubeTime}s)`);
                }
            }

            // Obter fila se ainda não foi obtida (caso de URL)
            let queue;
            if (isUrlFinal) {
                console.log(`   🔗 Conectando ao canal de voz...`);
                queue = await getOrCreateQueue(interaction.guild, interaction.channel, voiceChannel);
            } else {
                // Já foi obtida em paralelo, apenas garantir que está conectada
                queue = preQueue;
                if (!queue || !queue.connection) {
                    console.log(`   🔗 Conectando ao canal de voz...`);
                    queue = await getOrCreateQueue(interaction.guild, interaction.channel, voiceChannel);
                } else {
                    console.log(`   ✅ Conexão já preparada (economizou tempo)`);
                }
            }

            // Verificar se já está tocando algo
            const wasPlaying = queue.isPlaying();
            const queueSize = queue.size;

            // Adicionar à fila e reproduzir
            console.log(`   ▶️ Adicionando à fila e iniciando reprodução...`);
            await playTrack(queue, searchResult.tracks[0]);

            const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
            
            // Atualizar embed se não estiver tocando ainda
            if (!wasPlaying && queue.isPlaying()) {
                embed.setTitle('🎵 Tocando Agora');
                console.log(`   ✅ Reprodução iniciada! (Total: ${totalTime}s)`);
            } else {
                embed.setTitle('➕ Adicionado à Fila');
                embed.addFields({ name: '📊 Posição', value: `#${queueSize + 1} na fila`, inline: true });
                console.log(`   ✅ Adicionado à fila na posição #${queueSize + 1} (Total: ${totalTime}s)`);
            }

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            // Ignorar erros de interação expirada
            if (error.code === 10062 || error.message?.includes('Unknown interaction')) {
                return;
            }
            console.error('❌ Erro ao reproduzir:', error);
            try {
                await interaction.editReply('❌ Erro ao reproduzir música.');
            } catch (replyError) {
                // Interação pode ter expirado, ignorar silenciosamente
            }
        }
    }

    if (commandName === 'stop') {
        try {
            const userTag = `${interaction.user.username}#${interaction.user.discriminator}`;
            const queue = player.nodes.get(interaction.guild.id);
            if (!queue || !queue.isPlaying()) {
                await interaction.reply('❌ Nenhuma música está tocando!');
                return;
            }
            
            console.log(`⏹️ [${userTag}] Parou reprodução e limpou fila`);
            queue.delete();
            await interaction.reply('⏹️ Reprodução parada e fila limpa!');
        } catch (error) {
            if (error.code === 10062 || error.message?.includes('Unknown interaction')) {
                return;
            }
            console.error('❌ Erro ao parar:', error);
        }
    }

    if (commandName === 'skip') {
        try {
            const userTag = `${interaction.user.username}#${interaction.user.discriminator}`;
            const queue = player.nodes.get(interaction.guild.id);
            if (!queue || !queue.isPlaying()) {
                await interaction.reply('❌ Nenhuma música está tocando!');
                return;
            }
            
            const currentTrack = queue.currentTrack;
            const skippedTitle = currentTrack.title;
            console.log(`⏭️ [${userTag}] Pulou: "${skippedTitle}"`);
            
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
                        { name: '🎵 Tocando Agora', value: `**${nowPlaying.title}**\n🎤 ${nowPlaying.author || 'Desconhecido'}`, inline: false }
                    )
                    .setThumbnail(nowPlaying.thumbnail || currentTrack.thumbnail)
                    .setTimestamp();
                
                if (nowPlaying.duration) {
                    embed.addFields({ name: '⏱️ Duração', value: nowPlaying.duration, inline: true });
                }
                if (nowPlaying.url) {
                    embed.addFields({ name: '🔗 URL', value: `[Abrir](${nowPlaying.url})`, inline: true });
                }
                if (nowPlaying.requestedBy) {
                    embed.addFields({ name: '👤 Solicitado por', value: nowPlaying.requestedBy.toString(), inline: true });
                }
                
                await interaction.reply({ embeds: [embed] });
            } else {
                // Se não há próxima música, mostrar apenas que pulou
                await interaction.reply(`⏭️ Pulou: **${skippedTitle}**\n📭 Não há mais músicas na fila.`);
            }
        } catch (error) {
            if (error.code === 10062 || error.message?.includes('Unknown interaction')) {
                return;
            }
            console.error('❌ Erro ao pular:', error);
            try {
                await interaction.reply('❌ Erro ao pular música.');
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
                await interaction.reply('❌ Nenhuma música está tocando!');
                return;
            }
            
            if (queue.node.isPaused()) {
                await interaction.reply('⏸️ A música já está pausada!');
                return;
            }
            
            console.log(`⏸️ [${userTag}] Pausou: "${queue.currentTrack.title}"`);
            queue.node.pause();
            await interaction.reply('⏸️ Música pausada!');
        } catch (error) {
            if (error.code === 10062 || error.message?.includes('Unknown interaction')) {
                return;
            }
            console.error('❌ Erro ao pausar:', error);
        }
    }

    if (commandName === 'resume') {
        try {
            const userTag = `${interaction.user.username}#${interaction.user.discriminator}`;
            const queue = player.nodes.get(interaction.guild.id);
            if (!queue || !queue.isPlaying()) {
                await interaction.reply('❌ Nenhuma música está tocando!');
                return;
            }
            
            if (!queue.node.isPaused()) {
                await interaction.reply('▶️ A música já está tocando!');
                return;
            }
            
            console.log(`▶️ [${userTag}] Retomou: "${queue.currentTrack.title}"`);
            queue.node.resume();
            await interaction.reply('▶️ Música retomada!');
        } catch (error) {
            if (error.code === 10062 || error.message?.includes('Unknown interaction')) {
                return;
            }
            console.error('❌ Erro ao retomar:', error);
        }
    }

    if (commandName === 'queue') {
        try {
            const queue = player.nodes.get(interaction.guild.id);
            if (!queue || queue.size === 0) {
                await interaction.reply('📭 A fila está vazia!');
                return;
            }

            const page = interaction.options.getInteger('pagina') || 1;
            const pageSize = 10;
            const totalPages = Math.ceil(queue.size / pageSize);
            const startIndex = (page - 1) * pageSize;
            const endIndex = Math.min(startIndex + pageSize, queue.size);

            const queueList = queue.tracks.toArray().slice(startIndex, endIndex)
                .map((track, index) => `${startIndex + index + 1}. **${track.title}** - ${track.author}`)
                .join('\n');

            const embed = new EmbedBuilder()
                .setTitle('📋 Fila de Músicas')
                .setColor(0x1DB954)
                .setDescription(queueList)
                .addFields(
                    { name: '📊 Total', value: `${queue.size} música(s)`, inline: true },
                    { name: '📄 Página', value: `${page}/${totalPages}`, inline: true },
                    { name: '⏱️ Duração Total', value: formatDuration(queue.duration), inline: true }
                )
                .setTimestamp();

            if (queue.currentTrack) {
                embed.addFields({ 
                    name: '🎵 Tocando Agora', 
                    value: `**${queue.currentTrack.title}** - ${queue.currentTrack.author}`,
                    inline: false 
                });
            }

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            if (error.code === 10062 || error.message?.includes('Unknown interaction')) {
                return;
            }
            console.error('❌ Erro ao mostrar fila:', error);
        }
    }

    if (commandName === 'nowplaying') {
        try {
            const queue = player.nodes.get(interaction.guild.id);
            if (!queue || !queue.currentTrack) {
                await interaction.reply('❌ Nenhuma música está tocando!');
                return;
            }

            const track = queue.currentTrack;
            const progress = queue.node.getTimestamp();
            
            const embed = new EmbedBuilder()
                .setTitle('🎵 Tocando Agora')
                .setColor(0x1DB954)
                .setDescription(`**${track.title}**\n🎤 ${track.author}`)
                .setThumbnail(track.thumbnail)
                .addFields(
                    { name: '🔗 URL', value: `[Abrir](${track.url})`, inline: true },
                    { name: '⏱️ Duração', value: track.duration, inline: true },
                    { name: '👤 Solicitado por', value: track.requestedBy?.toString() || 'N/A', inline: true }
                );

            if (progress) {
                embed.addFields({ 
                    name: '⏳ Progresso', 
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
            console.error('❌ Erro ao mostrar música atual:', error);
        }
    }

    if (commandName === 'volume') {
        try {
            const queue = player.nodes.get(interaction.guild.id);
            if (!queue || !queue.isPlaying()) {
                await interaction.reply('❌ Nenhuma música está tocando!');
                return;
            }

            const volume = interaction.options.getInteger('valor');
            if (volume !== null) {
                queue.node.setVolume(volume);
                await interaction.reply(`🔊 Volume definido para **${volume}%**`);
            } else {
                await interaction.reply(`🔊 Volume atual: **${queue.node.volume}%**`);
            }
        } catch (error) {
            if (error.code === 10062 || error.message?.includes('Unknown interaction')) {
                return;
            }
            console.error('❌ Erro ao ajustar volume:', error);
        }
    }

    if (commandName === 'clear') {
        try {
            const queue = player.nodes.get(interaction.guild.id);
            if (!queue || queue.size === 0) {
                await interaction.reply('📭 A fila já está vazia!');
                return;
            }

            const cleared = queue.size;
            queue.clear();
            await interaction.reply(`🗑️ Removidas **${cleared}** música(s) da fila!`);
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
                await interaction.reply('❌ É necessário ter pelo menos 2 músicas na fila para embaralhar!');
                return;
            }

            queue.tracks.shuffle();
            await interaction.reply('🔀 Fila embaralhada!');
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
                await interaction.reply('❌ Nenhuma música está tocando!');
                return;
            }

            const modo = interaction.options.getString('modo');
            let loopMode;
            let modoTexto;

            switch (modo) {
                case 'track':
                    loopMode = 1; // Repetir música atual
                    modoTexto = '🔄 Música atual';
                    break;
                case 'queue':
                    loopMode = 2; // Repetir fila inteira
                    modoTexto = '🔁 Fila inteira';
                    break;
                case 'off':
                default:
                    loopMode = 0; // Desligado
                    modoTexto = '❌ Desligado';
                    break;
            }

            queue.setRepeatMode(loopMode);
            await interaction.reply(`🔁 Modo de repetição: **${modoTexto}**`);
        } catch (error) {
            if (error.code === 10062 || error.message?.includes('Unknown interaction')) {
                return;
            }
            console.error('❌ Erro ao configurar loop:', error);
        }
    }

    if (commandName === 'remove') {
        try {
            const queue = player.nodes.get(interaction.guild.id);
            if (!queue || queue.size === 0) {
                await interaction.reply('📭 A fila está vazia!');
                return;
            }

            const posicao = interaction.options.getInteger('posicao');
            if (posicao > queue.size) {
                await interaction.reply(`❌ A fila tem apenas **${queue.size}** música(s)!`);
                return;
            }

            const track = queue.tracks.at(posicao - 1);
            if (!track) {
                await interaction.reply('❌ Música não encontrada nessa posição!');
                return;
            }

            queue.removeTrack(track);
            await interaction.reply(`🗑️ Removida: **${track.title}** (posição ${posicao})`);
        } catch (error) {
            if (error.code === 10062 || error.message?.includes('Unknown interaction')) {
                return;
            }
            console.error('❌ Erro ao remover música:', error);
        }
    }

    if (commandName === 'jump') {
        try {
            const queue = player.nodes.get(interaction.guild.id);
            if (!queue || queue.size === 0) {
                await interaction.reply('📭 A fila está vazia!');
                return;
            }

            const posicao = interaction.options.getInteger('posicao');
            if (posicao > queue.size) {
                await interaction.reply(`❌ A fila tem apenas **${queue.size}** música(s)!`);
                return;
            }

            const track = queue.tracks.at(posicao - 1);
            if (!track) {
                await interaction.reply('❌ Música não encontrada nessa posição!');
                return;
            }

            // Mover a música para a posição 0 (próxima a tocar)
            queue.node.skipTo(track);
            await interaction.reply(`⏭️ Pulou para: **${track.title}** (posição ${posicao})`);
        } catch (error) {
            if (error.code === 10062 || error.message?.includes('Unknown interaction')) {
                return;
            }
            console.error('❌ Erro ao pular música:', error);
        }
    }

    if (commandName === 'remove-duplicates') {
        try {
            const queue = player.nodes.get(interaction.guild.id);
            if (!queue || queue.size === 0) {
                await interaction.reply('📭 A fila está vazia!');
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
                await interaction.reply('✅ Nenhuma música duplicada encontrada!');
            } else {
                await interaction.reply(`🗑️ Removidas **${removed}** música(s) duplicada(s)!`);
            }
        } catch (error) {
            if (error.code === 10062 || error.message?.includes('Unknown interaction')) {
                return;
            }
            console.error('❌ Erro ao remover duplicatas:', error);
        }
    }

    if (commandName === 'seek') {
        try {
            const queue = player.nodes.get(interaction.guild.id);
            if (!queue || !queue.isPlaying()) {
                await interaction.reply('❌ Nenhuma música está tocando!');
                return;
            }

            const tempo = interaction.options.getString('tempo');
            let segundos = 0;

            // Tentar parsear formato MM:SS
            if (tempo.includes(':')) {
                const partes = tempo.split(':');
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
                segundos = parseInt(tempo) || 0;
            }

            if (segundos < 0) {
                await interaction.reply('❌ O tempo não pode ser negativo!');
                return;
            }

            const currentTrack = queue.currentTrack;
            const trackDuration = currentTrack.durationMS || 0;
            
            if (trackDuration > 0 && segundos > trackDuration / 1000) {
                await interaction.reply(`❌ O tempo não pode ser maior que a duração da música (${formatDuration(trackDuration)})!`);
                return;
            }

            await queue.node.seek(segundos * 1000);
            
            const minutos = Math.floor(segundos / 60);
            const segs = segundos % 60;
            const tempoFormatado = `${minutos}:${segs.toString().padStart(2, '0')}`;
            
            await interaction.reply(`⏩ Avançado para **${tempoFormatado}**`);
        } catch (error) {
            if (error.code === 10062 || error.message?.includes('Unknown interaction')) {
                return;
            }
            console.error('❌ Erro ao fazer seek:', error);
            try {
                await interaction.reply('❌ Erro ao avançar música. O formato deve ser MM:SS ou segundos (ex: 1:30 ou 90)');
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
            console.error('❌ Erro ao responder ping:', error);
        }
    }

    if (commandName === 'teste') {
        try {
            await interaction.deferReply();

            // Verificar se o usuário está em um canal de voz
            const voiceChannel = interaction.member.voice.channel;
            if (!voiceChannel) {
                await interaction.editReply('❌ Você precisa estar em um canal de voz para usar este comando!');
                return;
            }

            const url = interaction.options.getString('url');
            
            // Buscar usando Discord Player
            const searchResult = await player.search(url, {
                requestedBy: interaction.user
            });

            if (!searchResult.hasTracks()) {
                await interaction.editReply('⚠️ Não foi possível encontrar áudio para esta URL.');
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
            console.error('❌ Erro ao reproduzir:', error);
            try {
                await interaction.editReply(`❌ Erro ao reproduzir: ${error.message}`);
            } catch (replyError) {
                // Interação pode ter expirado, ignorar silenciosamente
            }
        }
    }
});

// Login
client.login(process.env.DISCORD_TOKEN);
