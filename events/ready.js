module.exports = async (client) => {
    console.log(`✅ Bot conectado como ${client.user.tag}`);
    try {
        await client.registerCommands();
        console.log('✅ Slash commands registrados.');
    } catch (error) {
        console.error('Falha ao registrar comandos:', error);
    }
};

