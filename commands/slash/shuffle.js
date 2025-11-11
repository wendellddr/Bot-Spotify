const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shuffle')
        .setDescription('Shuffle the upcoming tracks'),
    async execute(interaction) {
        const client = interaction.client;
        try {
            client.music.shuffle(interaction.guildId);
            await interaction.reply({ content: '🔀 Fila embaralhada.' });
        } catch (error) {
            await interaction.reply({
                content: error.message || 'Não foi possível embaralhar a fila.',
                ephemeral: true
            });
        }
    }
};

