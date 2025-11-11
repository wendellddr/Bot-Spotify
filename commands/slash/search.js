const { SlashCommandBuilder } = require('discord.js');

function extractSearchResults(result) {
    if (!result) return [];
    if (typeof result.loadType === 'string') {
        if (result.loadType === 'search' && Array.isArray(result.data)) {
            return result.data;
        }
        if (result.loadType === 'track') {
            return result.data ? [result.data] : [];
        }
    }
    if (Array.isArray(result.tracks)) {
        return result.tracks;
    }
    return [];
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('search')
        .setDescription('Search for tracks without enqueueing')
        .addStringOption((option) =>
            option
                .setName('query')
                .setDescription('Song name or URL')
                .setRequired(true)
        ),
    async execute(interaction) {
        const client = interaction.client;
        const query = interaction.options.getString('query', true);
        const identifier = query.startsWith('http') ? query : `ytsearch:${query}`;

        try {
            const result = await client.music.resolve(identifier);
            const tracks = extractSearchResults(result).slice(0, 5);

            if (!tracks.length) {
                await interaction.reply({
                    content: 'Nenhum resultado encontrado.',
                    ephemeral: true
                });
                return;
            }

            const lines = tracks.map((track, index) => `${index + 1}. [${track.info.title}](${track.info.uri || track.info.url || track.info.identifier}) — ${track.info.author}`);

            await interaction.reply({
                content: `🔍 Resultados para **${query}**:\n${lines.join('\n')}`,
                ephemeral: true
            });
        } catch (error) {
            console.error('Search command failed:', error);
            await interaction.reply({
                content: 'Não foi possível realizar a busca.',
                ephemeral: true
            });
        }
    }
};

