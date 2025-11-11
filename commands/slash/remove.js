const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('remove')
        .setDescription('Remove an item from the queue')
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
            const removed = client.music.remove(interaction.guildId, position);
            await interaction.reply({
                content: `🗑️ Removido da fila: **${removed.info.title}**`
            });
        } catch (error) {
            await interaction.reply({
                content: error.message || 'Não foi possível remover essa posição.',
                ephemeral: true
            });
        }
    }
};

