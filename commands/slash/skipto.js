const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('skipto')
        .setDescription('Skip ahead to a specific track in the queue')
        .addIntegerOption((option) =>
            option
                .setName('position')
                .setDescription('Posição da música na fila (começa em 1)')
                .setRequired(true)
                .setMinValue(1)
        ),
    async execute(interaction) {
        const client = interaction.client;
        const position = interaction.options.getInteger('position', true);

        try {
            await client.music.skipTo(interaction.guildId, position);
            await interaction.reply({
                content: `⏭️ Pulei para a posição **${position}**.`
            });
        } catch (error) {
            await interaction.reply({
                content: error.message || 'Não foi possível pular para essa posição.',
                ephemeral: true
            });
        }
    }
};

