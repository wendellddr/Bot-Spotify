const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, EmbedBuilder } = require('discord.js');
const { Player } = require('discord-player');
const { DefaultExtractors } = require('@discord-player/extractor');
const { YoutubeiExtractor } = require('discord-player-youtubei');
const fetch = require('node-fetch');
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

// Registrar os extractors
(async () => {
    await player.extractors.register(YoutubeiExtractor, {});
    // Não carregamos DefaultExtractors para evitar SoundCloud
})();

// Credenciais Spotify
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

let accessToken = null;
let tokenExpiry = 0;

// Função para obter token de acesso do Spotify
async function getSpotifyAccessToken() {
    try {
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
            accessToken = data.access_token;
            tokenExpiry = Date.now() + (data.expires_in * 1000);
            return accessToken;
        }
        
        throw new Error('Não foi possível obter o token de acesso');
    } catch (error) {
        console.error('Erro ao obter token do Spotify:', error);
        return null;
    }
}

// Função para garantir que temos um token válido
async function ensureAccessToken() {
    if (!accessToken || Date.now() >= tokenExpiry) {
        await getSpotifyAccessToken();
    }
    return accessToken;
}

// Função para buscar música no Spotify
async function searchTrack(query) {
    const token = await ensureAccessToken();
    if (!token) return null;

    try {
        const searchQuery = encodeURIComponent(query);
        const response = await fetch(`https://api.spotify.com/v1/search?q=${searchQuery}&type=track&limit=5`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();
        return data.tracks?.items || [];
    } catch (error) {
        console.error('Erro ao buscar música:', error);
        return [];
    }
}

// Comandos Slash
const commands = [
    new SlashCommandBuilder()
        .setName('play')
        .setDescription('Toca uma música no canal de voz')
        .addStringOption(option =>
            option.setName('musica')
                .setDescription('Nome da música')
                .setRequired(true)
        ),
    
    new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Para a reprodução de música'),
    
    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Responde com Pong!')
];

// Registrar comandos
async function registerCommands() {
    try {
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
        
        console.log('Registrando comandos slash...');
        
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
        );
        
        console.log('Comandos registrados com sucesso!');
    } catch (error) {
        console.error('Erro ao registrar comandos:', error);
    }
}

// Evento quando o bot está pronto
client.once('ready', async () => {
    console.log(`Bot conectado como ${client.user.tag}!`);
    
    // Obter token inicial do Spotify
    await getSpotifyAccessToken();
    
    // Registrar comandos
    await registerCommands();
});

// Eventos do Discord Player
player.events.on('error', (queue, error) => {
    console.error('Erro na fila:', error);
});

player.events.on('playerError', (queue, error) => {
    console.error('Erro no player:', error.message);
    // Não fazer nada, apenas logar
});

// Evento para interações
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'play') {
        await interaction.deferReply();

        // Verificar se o usuário está em um canal de voz
        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel) {
            await interaction.editReply('❌ Você precisa estar em um canal de voz para usar este comando!');
            return;
        }

        const query = interaction.options.getString('musica');
        
        // Buscar primeiro no Spotify para mostrar informações
        const tracks = await searchTrack(query);

        if (!tracks || tracks.length === 0) {
            await interaction.editReply('❌ Nenhuma música encontrada no Spotify!');
            return;
        }

        const track = tracks[0];

        // Criar embed de resposta
        const embed = new EmbedBuilder()
            .setTitle('🎵 Tocando Agora')
            .setColor(0x1DB954)
            .setDescription(`**${track.name}**\n🎤 ${track.artists.map(a => a.name).join(', ')}`)
            .setThumbnail(track.album.images[0]?.url)
            .addFields(
                { name: '💿 Álbum', value: track.album.name, inline: true },
                { name: '⏱️ Duração', value: `${Math.floor(track.duration_ms / 60000)}:${((track.duration_ms % 60000) / 1000).toFixed(0).padStart(2, '0')}`, inline: true },
                { name: '🔗 Link', value: `[Abrir no Spotify](${track.external_urls.spotify})`, inline: true }
            )
            .setTimestamp();

        // Buscar e reproduzir usando Discord Player
        try {
            const searchQuery = `${track.artists[0].name} - ${track.name}`;
            console.log(`🔍 Buscando: ${searchQuery}`);
            
            // Primeiro buscar
            const searchResult = await player.search(searchQuery, {
                requestedBy: interaction.user
            });

            if (!searchResult.hasTracks()) {
                await interaction.editReply('⚠️ Não foi possível encontrar áudio para esta música.');
                return;
            }

            // Obter ou criar fila
            let queue = player.nodes.get(interaction.guild.id);
            if (!queue) {
                console.log('📦 Criando nova fila...');
                queue = player.nodes.create(interaction.guild, {
                    metadata: {
                        channel: interaction.channel
                    },
                    leaveOnEmpty: false,
                    leaveOnEnd: false
                });
            } else {
                console.log('✅ Fila já existe');
            }

            if (!queue.connection) {
                console.log('🔗 Conectando ao canal de voz...');
                await queue.connect(voiceChannel);
                console.log('✅ Conectado!');
            } else {
                console.log('✅ Já conectado');
            }

            // Adicionar à fila e tocar
            console.log(`🎵 Adicionando track: ${searchResult.tracks[0].title}`);
            queue.addTrack(searchResult.tracks[0]);

            if (!queue.isPlaying()) {
                console.log('▶️ Iniciando reprodução...');
                await queue.node.play();
                console.log('✅ Reprodução iniciada!');
            } else {
                console.log('ℹ️ Já está tocando');
            }

            await interaction.editReply({ embeds: [embed] });
            console.log(`▶️ Reproduzindo: ${track.name}`);
        } catch (error) {
            console.error('❌ Erro ao reproduzir:', error);
            await interaction.editReply('❌ Erro ao reproduzir música.');
        }
    }

    if (commandName === 'stop') {
        // Obter a fila
        const queue = player.nodes.get(interaction.guild.id);
        if (queue && queue.isPlaying()) {
            queue.delete();
            await interaction.reply('⏹️ Reprodução parada!');
        } else {
            await interaction.reply('❌ Nenhuma música está tocando!');
        }
    }

    if (commandName === 'ping') {
        await interaction.reply('🏓 Pong!');
    }
});

// Login
client.login(process.env.DISCORD_TOKEN);
