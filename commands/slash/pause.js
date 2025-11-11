const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pause')
        .setDescription('Pause the current track'),
    async execute(interaction) {
        const client = interaction.client;
        try {
            await client.music.pause(interaction.guildId);
            await interaction.reply({ content: '⏸️ Playback pausado.' });
        } catch (error) {
            await interaction.reply({
                content: 'Nada está tocando no momento.',
                ephemeral: true
            });
        }
    }
};

