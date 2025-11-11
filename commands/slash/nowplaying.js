const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('nowplaying')
        .setDescription('Show the current track'),
    async execute(interaction) {
        const client = interaction.client;
        const queue = client.music.getQueue(interaction.guildId);

        if (!queue || !queue.current) {
            await interaction.reply({
                content: 'Nada está tocando no momento.',
                ephemeral: true
            });
            return;
        }

        const track = queue.current;

        await interaction.reply({
            content: `🎶 **Agora tocando:** ${track.info.title}\n👤 **Artista:** ${track.info.author}\n⏱️ **Duração:** ${Math.floor(track.info.length / 1000)}s\n🔁 **Loop:** ${queue.loopMode}\n🔊 **Volume:** ${queue.volume}`
        });
    }
};

