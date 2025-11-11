module.exports = (client, message) => {
    if (!message.guild || message.author.bot) return;

    const prefix = client.config.prefix || '!';
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const commandName = args.shift()?.toLowerCase();
    if (!commandName) return;

    const command = client.slashCommands.get(commandName);
    if (!command) return;

    // For simplicity, we just inform users to use slash commands
    message.reply('Use os comandos slash `/` para controlar o bot.').catch(() => {});
};

