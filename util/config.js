const path = require('path');
const fs = require('fs');

const DEFAULT_CONFIG = {
    prefix: '!',
    embedColor: '#5865F2',
    iconURL: null,
    serverDeafen: true,
    defaultVolume: 80,
    autoQueue: false,
    autoLeave: true,
    autoPause: false,
    twentyFourSeven: false,
    disconnectTime: 300000 // 5 min
};

let cache = null;

function loadConfig() {
    if (cache) return cache;

    const configPath = path.join(__dirname, '..', 'config.json');

    if (!fs.existsSync(configPath)) {
        cache = DEFAULT_CONFIG;
        return cache;
    }

    try {
        const raw = fs.readFileSync(configPath, 'utf-8');
        const parsed = JSON.parse(raw);
        cache = { ...DEFAULT_CONFIG, ...parsed };
    } catch (error) {
        console.error('Failed to read config.json, using defaults.', error);
        cache = DEFAULT_CONFIG;
    }
    return cache;
}

module.exports = loadConfig();

