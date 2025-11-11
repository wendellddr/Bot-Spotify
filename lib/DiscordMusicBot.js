const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, Routes } = require('discord.js');
const { Shoukaku, Connectors } = require('shoukaku');
const { REST } = require('@discordjs/rest');
const MusicManager = require('./MusicManager');
const settingsStore = require('../src/settings');
const config = require('../util/config');
const loadCommands = require('../util/loadCommands');

const {
    DISCORD_TOKEN,
    DISCORD_CLIENT_ID,
    LAVALINK_HOST = '127.0.0.1',
    LAVALINK_PORT = '2333',
    LAVALINK_PASSWORD = 'youshallnotpass'
} = process.env;

if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID) {
    throw new Error('Missing DISCORD_TOKEN or DISCORD_CLIENT_ID in environment');
}

class DiscordMusicBot extends Client {
    constructor() {
        super({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildVoiceStates
            ]
        });

        this.slashCommands = new Collection();
        this.contextCommands = new Collection();

        this.shoukaku = new Shoukaku(
            new Connectors.DiscordJS(this),
            [
                {
                    name: 'main',
                    url: `${LAVALINK_HOST}:${LAVALINK_PORT}`,
                    auth: LAVALINK_PASSWORD
                }
            ],
            {
                moveOnDisconnect: false,
                resumable: false,
                reconnectTries: 3
            }
        );

        this.config = config;

        this.music = new MusicManager(this.shoukaku, settingsStore, this.config, (msg) =>
            console.log(msg)
        );

        this.loadCommands();
        this.loadEvents();
    }

    loadCommands() {
        const slashDir = path.join(__dirname, '..', 'commands', 'slash');
        const slashCommands = loadCommands(slashDir);
        for (const { file, module } of slashCommands) {
            if (!module?.data || typeof module.execute !== 'function') {
                console.warn(`[Commands] Skipping ${file}: missing data or execute`);
                continue;
            }
            this.slashCommands.set(module.data.name, module);
        }

        const contextDir = path.join(__dirname, '..', 'commands', 'context');
        const contextCommands = loadCommands(contextDir);
        for (const { file, module } of contextCommands) {
            if (!module?.data || typeof module.execute !== 'function') {
                console.warn(`[Commands] Skipping context ${file}: missing data or execute`);
                continue;
            }
            this.contextCommands.set(module.data.name, module);
        }
    }

    loadEvents() {
        const eventsDir = path.join(__dirname, '..', 'events');
        if (!fs.existsSync(eventsDir)) return;

        for (const file of fs.readdirSync(eventsDir).filter((name) => name.endsWith('.js'))) {
            const event = require(path.join(eventsDir, file));
            const eventName = file.split('.')[0];
            if (typeof event !== 'function') {
                console.warn(`[Events] Skipping ${file}: export is not a function`);
                continue;
            }
            this.on(eventName, (...args) => event(this, ...args));
        }
    }

    async registerCommands() {
        const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
        const commands = [
            ...this.slashCommands.values()
        ]
            .map((cmd) => cmd.data.toJSON());

        await rest.put(Routes.applicationCommands(DISCORD_CLIENT_ID), { body: commands });
        console.log(`[Registry] Registered ${commands.length} application commands.`);
    }

    start() {
        return this.login(DISCORD_TOKEN);
    }
}

module.exports = DiscordMusicBot;

