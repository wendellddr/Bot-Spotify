const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Stop playback and clear the queue'),
    async execute(interaction) {
        const client = interaction.client;
        const queue = client.music.getQueue(interaction.guildId);

        if (!queue) {
            await interaction.reply({
                content: 'Nada está tocando.',
                ephemeral: true
            });
            return;
        }

        await client.music.stop(interaction.guildId);

        await interaction.reply({
            content: '⏹️ Playback parado e fila limpa.'
        });
    }
};

