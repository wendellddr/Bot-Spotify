const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE_PATH = path.join(DATA_DIR, 'settings.json');

let cache = {};

function ensureFile() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(FILE_PATH)) {
        fs.writeFileSync(FILE_PATH, JSON.stringify({}, null, 2));
    }
}

function loadSettings() {
    ensureFile();
    try {
        const data = fs.readFileSync(FILE_PATH, 'utf-8');
        cache = JSON.parse(data || '{}');
    } catch (error) {
        console.error('[Settings] Failed to load settings file, starting fresh.', error);
        cache = {};
    }
}

function saveSettings() {
    ensureFile();
    fs.writeFileSync(FILE_PATH, JSON.stringify(cache, null, 2));
}

function defaultSettings() {
    return {
        volume: 80,
        loopMode: 'off'
    };
}

function getGuildSettings(guildId) {
    if (!cache[guildId]) {
        cache[guildId] = defaultSettings();
    }
    return cache[guildId];
}

function setGuildSettings(guildId, partial) {
    const current = getGuildSettings(guildId);
    cache[guildId] = { ...current, ...partial };
    saveSettings();
    return cache[guildId];
}

function setGuildVolume(guildId, volume) {
    return setGuildSettings(guildId, { volume });
}

function setGuildLoopMode(guildId, loopMode) {
    return setGuildSettings(guildId, { loopMode });
}

loadSettings();

module.exports = {
    getGuildSettings,
    setGuildVolume,
    setGuildLoopMode
};

