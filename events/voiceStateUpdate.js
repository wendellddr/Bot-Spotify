module.exports = (client, oldState, newState) => {
    const guildId = oldState.guild.id;
    const queue = client.music.getQueue(guildId);
    if (!queue) return;

    const voiceChannel = oldState.guild.members.me?.voice?.channel;
    if (!voiceChannel) return;

    const members = voiceChannel.members.filter((member) => !member.user.bot);

    if (members.size === 0) {
        if (queue.autoPause) {
            queue.player.setPaused(true).catch(() => {});
            queue.textChannel?.send('⏸️ Playback pausado por ausência de ouvintes.').catch(() => {});
        }

        if (queue.autoLeave) {
            setTimeout(async () => {
                const updatedChannel = oldState.guild.members.me?.voice?.channel;
                if (!updatedChannel || updatedChannel.members.filter((member) => !member.user.bot).size === 0) {
                    await client.music.stop(guildId);
                    queue.textChannel?.send('👋 Saindo do canal por inatividade.').catch(() => {});
                }
            }, client.config.disconnectTime || 300000);
        }
    } else if (queue.autoPause && queue.player.paused) {
        queue.player.setPaused(false).catch(() => {});
        queue.textChannel?.send('▶️ Playback retomado.').catch(() => {});
    }
};

