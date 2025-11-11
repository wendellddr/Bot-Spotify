const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Skip the current track'),
    async execute(interaction) {
        const client = interaction.client;
        const queue = client.music.getQueue(interaction.guildId);

        if (!queue || !queue.playing) {
            await interaction.reply({
                content: 'Nada está tocando.',
                ephemeral: true
            });
            return;
        }

        try {
            await client.music.skip(interaction.guildId);
            await interaction.reply({ content: '⏭️ Pulei a faixa atual.' });
        } catch (error) {
            console.error('Failed to skip track:', error);
            await interaction.reply({
                content: 'Não consegui pular a faixa.',
                ephemeral: true
            });
        }
    }
};

