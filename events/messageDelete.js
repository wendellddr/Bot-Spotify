module.exports = (client, message) => {
    client.music?.markMessageDeleted?.(message);
};

