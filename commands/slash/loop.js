const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('loop')
        .setDescription('Control loop mode')
        .addStringOption((option) =>
            option
                .setName('mode')
                .setDescription('Loop mode')
                .setRequired(true)
                .addChoices(
                    { name: 'off', value: 'off' },
                    { name: 'track', value: 'track' },
                    { name: 'queue', value: 'queue' }
                )
        ),
    async execute(interaction) {
        const mode = interaction.options.getString('mode', true);
        const client = interaction.client;

        client.music.setLoopMode(interaction.guildId, mode);

        await interaction.reply({
            content: `🔁 Modo de repetição definido para **${mode}**.`
        });
    }
};

