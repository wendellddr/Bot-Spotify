const fs = require('fs');
const path = require('path');

module.exports = function loadCommands(directory) {
    if (!fs.existsSync(directory)) return [];
    return fs
        .readdirSync(directory)
        .filter((file) => file.endsWith('.js'))
        .map((file) => ({
            file,
            path: path.join(directory, file),
            module: require(path.join(directory, file))
        }));
};

