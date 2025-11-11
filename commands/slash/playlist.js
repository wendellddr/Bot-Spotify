const { SlashCommandBuilder } = require('discord.js');

function extractPlaylistTracks(result) {
    if (!result) return [];

    if (typeof result.loadType === 'string') {
        if (result.loadType === 'playlist' && Array.isArray(result.data?.tracks)) {
            return result.data.tracks;
        }
        if (result.loadType === 'search' && Array.isArray(result.data)) {
            return result.data;
        }
        if (result.loadType === 'track' && result.data) {
            return [result.data];
        }
    }

    if (Array.isArray(result.tracks)) {
        return result.tracks;
    }

    return [];
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('playlist')
        .setDescription('Add a playlist or multiple tracks to the queue')
        .addStringOption((option) =>
            option
                .setName('query')
                .setDescription('Playlist URL ou termo de busca')
                .setRequired(true)
        ),
    async execute(interaction) {
        const client = interaction.client;
        const query = interaction.options.getString('query', true);
        const identifier = query.startsWith('http') ? query : `ytsearch:${query}`;

        try {
            const result = await client.music.resolve(identifier);
            const tracks = extractPlaylistTracks(result);

            if (!tracks.length) {
                await interaction.reply({
                    content: 'Nenhum resultado encontrado para essa playlist.',
                    ephemeral: true
                });
                return;
            }

            await client.music.enqueue(interaction, tracks);

            await interaction.reply({
                content: `📚 Adicionei **${tracks.length}** músicas à fila.`
            });
        } catch (error) {
            console.error('Playlist command failed:', error);
            await interaction.reply({
                content: 'Não foi possível carregar essa playlist.',
                ephemeral: true
            });
        }
    }
};

