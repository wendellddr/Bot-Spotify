const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder().setName('ping').setDescription('Mostra a latência do bot'),
    async execute(interaction) {
        const sent = await interaction.reply({ content: '🏓 Pingando...', fetchReply: true });
        const latency = sent.createdTimestamp - interaction.createdTimestamp;
        const apiLatency = Math.round(interaction.client.ws.ping);

        await interaction.editReply(`🏓 Pong!\nLatência: **${latency}ms**\nLatência API: **${apiLatency}ms**`);
    }
};

