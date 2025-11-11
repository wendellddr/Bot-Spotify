const { SlashCommandBuilder } = require('discord.js');

function extractTracks(result) {
    if (!result) return [];

    if (typeof result.loadType === 'string' && Object.prototype.hasOwnProperty.call(result, 'data')) {
        if (result.loadType === 'empty') return [];
        if (result.loadType === 'error') {
            throw new Error(result.data?.message || 'LavalinkError');
        }
        if (result.loadType === 'track') return result.data ? [result.data] : [];
        if (result.loadType === 'playlist') return Array.isArray(result.data?.tracks) ? result.data.tracks : [];
        if (result.loadType === 'search') return Array.isArray(result.data) ? result.data : [];
    }

    if (Array.isArray(result.tracks)) {
        if (result.loadType === 'LOAD_FAILED') {
            throw new Error(result.exception?.message || 'LavalinkError');
        }
        return result.tracks;
    }

    console.warn('Unexpected Lavalink response format:', result);
    return [];
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play a track from a search query or URL')
        .addStringOption((option) =>
            option
                .setName('query')
                .setDescription('Song name or URL')
                .setRequired(true)
        ),
    async execute(interaction) {
        const client = interaction.client;
        const member = interaction.member;
        const voiceChannel = member.voice?.channel;

        if (!voiceChannel) {
            await interaction.reply({
                content: 'Você precisa entrar em um canal de voz.',
                ephemeral: true
            });
            return;
        }

        const query = interaction.options.getString('query', true);
        const identifier = query.startsWith('http') ? query : `ytsearch:${query}`;

        let result;
        try {
            result = await client.music.resolve(identifier);
        } catch (error) {
            console.error('Failed to resolve track:', error);
            await interaction.reply({
                content: 'Não foi possível processar essa pesquisa.',
                ephemeral: true
            });
            return;
        }

        let tracks;
        try {
            tracks = extractTracks(result);
        } catch (error) {
            console.error('Lavalink resolve error:', {
                identifier,
                result,
                error
            });
            await interaction.reply({
                content: 'Não foi possível processar essa pesquisa.',
                ephemeral: true
            });
            return;
        }

        if (!tracks.length) {
            await interaction.reply({
                content: 'Nenhum resultado encontrado.',
                ephemeral: true
            });
            return;
        }

        try {
            const existingQueue = client.music.getQueue(interaction.guildId);
            const addedTrack = await client.music.enqueue(interaction, [tracks[0]]);
            if (!existingQueue || !existingQueue.playing) {
                await interaction.reply({
                    content: `▶️ Tocando agora: **${addedTrack.info.title}**`
                });
            } else {
                await interaction.reply({
                    content: `➕ Adicionado à fila: **${addedTrack.info.title}**`
                });
            }
        } catch (error) {
            console.error('Failed to enqueue track:', {
                identifier,
                result,
                error
            });
            await interaction.reply({
                content: 'Não foi possível tocar essa faixa.',
                ephemeral: true
            });
        }
    }
};

