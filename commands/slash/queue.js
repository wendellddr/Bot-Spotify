const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Show the current queue'),
    async execute(interaction) {
        const client = interaction.client;
        const queue = client.music.getQueue(interaction.guildId);

        if (!queue || (!queue.playing && !queue.tracks.length)) {
            await interaction.reply({ content: 'A fila está vazia.' });
            return;
        }

        const nowPlaying = queue.current;
        const list = queue.tracks.map((track, index) => `${index + 1}. ${track.info.title}`).slice(0, 10);
        const description = [
            nowPlaying ? `🎶 **Tocando:** ${nowPlaying.info.title}` : null,
            queue.tracks.length ? `📜 **Fila:**\n${list.join('\n')}` : null,
            queue.tracks.length > 10 ? `...e mais ${queue.tracks.length - 10} músicas.` : null
        ].filter(Boolean).join('\n\n');

        await interaction.reply({ content: description || 'A fila está vazia.' });
    }
};

