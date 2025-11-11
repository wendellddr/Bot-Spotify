module.exports = async (client, interaction) => {
    if (interaction.isChatInputCommand()) {
        const command = client.slashCommands.get(interaction.commandName);
        if (!command) return;
        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(`Erro ao executar comando /${interaction.commandName}:`, error);
            const content = 'Ocorreu um erro ao executar este comando.';
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content }).catch(() => {});
            } else {
                await interaction.reply({ content, ephemeral: true }).catch(() => {});
            }
        }
        return;
    }

    if (interaction.isButton()) {
        const { customId } = interaction;
        if (!customId.startsWith('controller:')) return;
        await client.music.handleControllerInteraction(interaction);
    }
};

