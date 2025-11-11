const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('resume')
        .setDescription('Resume the current track'),
    async execute(interaction) {
        const client = interaction.client;
        try {
            await client.music.resume(interaction.guildId);
            await interaction.reply({ content: '▶️ Playback retomado.' });
        } catch (error) {
            await interaction.reply({
                content: 'Nada está tocando no momento.',
                ephemeral: true
            });
        }
    }
};

