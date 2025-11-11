require('dotenv').config();

const DiscordMusicBot = require('../lib/DiscordMusicBot');

const bot = new DiscordMusicBot();

bot.start().catch((error) => {
    console.error('Falha ao iniciar o bot:', error);
});

