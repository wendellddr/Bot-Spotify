const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('move')
        .setDescription('Move an item within the queue')
        .addIntegerOption((option) =>
            option
                .setName('from')
                .setDescription('Posição atual da música (começa em 1)')
                .setRequired(true)
                .setMinValue(1)
        )
        .addIntegerOption((option) =>
            option
                .setName('to')
                .setDescription('Nova posição da música (começa em 1)')
                .setRequired(true)
                .setMinValue(1)
        ),
    async execute(interaction) {
        const client = interaction.client;
        const from = interaction.options.getInteger('from', true);
        const to = interaction.options.getInteger('to', true);

        try {
            client.music.move(interaction.guildId, from, to);
            await interaction.reply({
                content: `🔁 Movi a música da posição **${from}** para **${to}**.`
            });
        } catch (error) {
            await interaction.reply({
                content: error.message || 'Não foi possível mover essa música.',
                ephemeral: true
            });
        }
    }
};

