const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('volume')
        .setDescription('Set the playback volume (0-100)')
        .addIntegerOption((option) =>
            option
                .setName('value')
                .setDescription('New volume (0-100)')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(100)
        ),
    async execute(interaction) {
        const value = interaction.options.getInteger('value', true);
        const client = interaction.client;
        const queue = client.music.getQueue(interaction.guildId);

        try {
            const result = await client.music.setVolume(interaction.guildId, value);
            if (!queue || !result.applied) {
                await interaction.reply({
                    content: `🔊 Volume será aplicado no próximo playback: **${value}**.`
                });
            } else {
                await interaction.reply({
                    content: `🔊 Volume ajustado para **${value}**.`
                });
            }
        } catch (error) {
            await interaction.reply({
                content: 'Não foi possível alterar o volume.',
                ephemeral: true
            });
        }
    }
};

