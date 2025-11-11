const os = require('os');
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder().setName('stats').setDescription('Mostra informações do bot'),
    async execute(interaction) {
        const client = interaction.client;
        const uptimeMs = client.uptime ?? 0;
        const totalSeconds = Math.floor(uptimeMs / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        const memoryUsage = process.memoryUsage();

        const embed = {
            color: client.config?.embedColor
                ? parseInt(client.config.embedColor.replace('#', ''), 16)
                : 0x5865f2,
            title: '📊 Estatísticas do Bot',
            fields: [
                {
                    name: 'Servidores',
                    value: client.guilds.cache.size.toString(),
                    inline: true
                },
                {
                    name: 'Usuários',
                    value: client.users.cache.size.toString(),
                    inline: true
                },
                {
                    name: 'Ping',
                    value: `${Math.round(client.ws.ping)}ms`,
                    inline: true
                },
                {
                    name: 'Uptime',
                    value: `${hours}h ${minutes}m ${seconds}s`,
                    inline: true
                },
                {
                    name: 'Memória (RSS)',
                    value: `${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`,
                    inline: true
                },
                {
                    name: 'Memória (Heap)',
                    value: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
                    inline: true
                },
                {
                    name: 'Sistema',
                    value: `${os.type()} ${os.release()} (${os.arch()})`,
                    inline: false
                },
                {
                    name: 'Node.js',
                    value: process.version,
                    inline: true
                }
            ],
            footer: {
                text: `Músicas reproduzidas: ${client.music?.totalPlayed || 0}`
            }
        };

        await interaction.reply({ embeds: [embed] });
    }
};

