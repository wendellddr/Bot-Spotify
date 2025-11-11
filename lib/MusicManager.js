const { Collection, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

class MusicManager {
    /**
     * @param {import('shoukaku').Shoukaku} shoukaku
     * @param {{ getGuildSettings: Function, setGuildVolume: Function, setGuildLoopMode: Function }} settingsStore
     * @param {(message: string) => void} logger
     */
    constructor(shoukaku, settingsStore, config, logger = console.log) {
        this.shoukaku = shoukaku;
        this.settings = settingsStore;
        this.log = logger;
        this.queues = new Collection();
        this.config = config;
        this.deletedMessages = new WeakSet();

        this.shoukaku.on('ready', (name) => {
            this.log(`[Lavalink] Node ${name} is ready`);
        });

        this.shoukaku.on('error', (name, error) => {
            this.log(`[Lavalink] Node ${name} error: ${error?.stack || error}`);
        });

        this.shoukaku.on('close', (name, code, reason) => {
            this.log(`[Lavalink] Node ${name} closed: ${code} ${reason || ''}`);
            // flush queues using this node
            for (const [guildId, queue] of this.queues.entries()) {
                if (queue.nodeName === name) {
                    this.destroyQueue(guildId);
                }
            }
        });
    }

    /**
     * @param {string} identifier
     */
    async resolve(identifier) {
        const node = this.getConnectedNode();
        return node.rest.resolve(identifier);
    }

    /**
     * @private
     * @returns {import('shoukaku').Node}
     */
    getConnectedNode() {
        const node = [...this.shoukaku.nodes.values()].find(
            (n) => n.state === require('shoukaku').Constants.State.CONNECTED
        );
        if (!node) throw new Error('No Lavalink nodes are available');
        return node;
    }

    /**
     * Normalise a track object and attach requester metadata.
     * @param {any} rawTrack
     * @param {string} requesterId
     * @returns {{ encoded: string, info: any, pluginInfo?: any, raw: any } | null}
     */
    normalizeTrack(rawTrack, requesterId) {
        if (!rawTrack) return null;

        let encoded =
            rawTrack.encoded ??
            rawTrack.track ??
            (typeof rawTrack === 'string' ? rawTrack : rawTrack.id ?? null);

        let info = rawTrack.info ? { ...rawTrack.info } : null;

        if (!encoded && rawTrack.track) {
            encoded = rawTrack.track.encoded ?? rawTrack.track;
            info = rawTrack.track.info ?? info;
        }

        if (!encoded) return null;

        if (!info) info = {};
        info.requester = requesterId;

        return {
            encoded,
            info,
            pluginInfo: rawTrack.pluginInfo ?? rawTrack.track?.pluginInfo ?? null,
            raw: rawTrack
        };
    }

    /**
     * @param {import('discord.js').Interaction} interaction
     * @param {Array<any>} tracks
     */
    async enqueue(interaction, tracks) {
        if (!Array.isArray(tracks) || !tracks.length) {
            throw new Error('No tracks to enqueue');
        }

        const guildId = interaction.guildId;
        const voiceChannel = interaction.member.voice?.channel;
        if (!voiceChannel) {
            throw new Error('Member is not connected to a voice channel');
        }

        let queue = this.queues.get(guildId);

        if (!queue) {
            const node = this.getConnectedNode();
            const player = await this.shoukaku.joinVoiceChannel({
                guildId,
                channelId: voiceChannel.id,
                shardId: interaction.guild.shardId,
                deaf: true
            });

            const guildSettings = this.settings.getGuildSettings(guildId);

            const embedColorHex =
                guildSettings.embedColor ||
                this.config?.embedColor ||
                '#5865F2';

            queue = {
                guildId,
                nodeName: node.name,
                player,
                tracks: [],
                playing: false,
                volume: guildSettings.volume ?? this.config?.defaultVolume ?? 80,
                loopMode: guildSettings.loopMode ?? 'off',
                textChannel: interaction.channel,
                current: null,
                autoQueue: guildSettings.autoQueue ?? this.config?.autoQueue ?? false,
                autoLeave: guildSettings.autoLeave ?? this.config?.autoLeave ?? true,
                autoPause: guildSettings.autoPause ?? this.config?.autoPause ?? false,
                twentyFourSeven:
                    guildSettings.twentyFourSeven ?? this.config?.twentyFourSeven ?? false,
                embedColor: parseInt(embedColorHex.replace('#', ''), 16),
                iconURL: this.config?.iconURL || null,
                nowPlayingMessage: null,
                recent: []
            };

            this.queues.set(guildId, queue);
        }

        const requesterId = interaction.user.id;
        const normalizedTracks = tracks
            .map((track) => this.normalizeTrack(track, requesterId))
            .filter(Boolean);

        if (!normalizedTracks.length) {
            throw new Error('Unable to normalise any tracks');
        }

        queue.tracks.push(...normalizedTracks);
        normalizedTracks.forEach((track) => {
            const identifier = track.info?.identifier || track.encoded;
            if (identifier) this.addToRecent(queue, identifier);
        });

        if (!queue.playing) {
            await this.playNext(guildId);
        }

        return normalizedTracks[0];
    }

    /**
     * @param {string} guildId
     */
    async playNext(guildId) {
        const queue = this.queues.get(guildId);
        if (!queue) return;

        const nextTrack = queue.tracks.shift();
        if (!nextTrack) {
            queue.playing = false;
            queue.current = null;
            await this.shoukaku.leaveVoiceChannel(guildId).catch(() => {});
            this.queues.delete(guildId);
            return;
        }

        queue.playing = true;
        queue.current = nextTrack;
        queue.currentStart = Date.now();
        const identifier = nextTrack.info?.identifier || encodedTrack;
        if (identifier) this.addToRecent(queue, identifier);

        const player = queue.player;
        player.removeAllListeners('end');
        player.removeAllListeners('exception');

        player.on('end', async (event) => {
            if (event.reason === 'replaced') return;
            const finishedTrack = queue.current;

            if (event.reason === 'finished') {
                if (queue.loopMode === 'track' && finishedTrack) {
                    queue.tracks.unshift(finishedTrack);
                } else if (queue.loopMode === 'queue' && finishedTrack) {
                    queue.tracks.push(finishedTrack);
                }
                if (queue.autoQueue && (!queue.tracks.length || queue.loopMode === 'off')) {
                    await this.handleAutoQueue(queue, finishedTrack).catch((error) =>
                        console.error('AutoQueue failed:', error)
                    );
                }
            } else if (queue.loopMode === 'track' && finishedTrack) {
                queue.tracks.unshift(finishedTrack);
            }

            queue.current = null;
            queue.playing = false;
            await this.playNext(guildId).catch((error) =>
                console.error('Failed to play next track:', error)
            );
        });

        player.on('exception', (event) => {
            console.error('Track exception:', event);
            queue.current = null;
            queue.playing = false;
            this.playNext(guildId).catch((error) =>
                console.error('Failed to play next track:', error)
            );
        });

        const encodedTrack = nextTrack.encoded ?? nextTrack.track;
        if (!encodedTrack) {
            console.error('Track missing encoded data:', nextTrack);
            queue.current = null;
            queue.playing = false;
            await this.playNext(guildId);
            return;
        }

        console.log('Playing track for guild', guildId, 'encoded length', encodedTrack.length);
        await player.playTrack({ track: encodedTrack });
        await player.setGlobalVolume(queue.volume);

        if (queue.textChannel) {
            if (queue.nowPlayingMessage && !this.isMessageDeleted(queue.nowPlayingMessage)) {
                queue.nowPlayingMessage.delete().catch(() => {});
            }

            queue.textChannel
                .send({
                    embeds: [this.buildNowPlayingEmbed(queue, nextTrack)],
                    components: this.createController(guildId, queue)
                })
                .then((message) => {
                    queue.nowPlayingMessage = message;
                })
                .catch(() => {});
        }
    }

    /**
     * @param {string} guildId
     */
    async skip(guildId) {
        const queue = this.queues.get(guildId);
        if (!queue || !queue.playing) {
            throw new Error('Nothing is playing');
        }
        await queue.player.stopTrack();
    }

    /**
     * @param {string} guildId
     */
    async pause(guildId) {
        const queue = this.queues.get(guildId);
        if (!queue || !queue.player) {
            throw new Error('Nothing is playing');
        }
        await queue.player.setPaused(true);
    }

    async resume(guildId) {
        const queue = this.queues.get(guildId);
        if (!queue || !queue.player) {
            throw new Error('Nothing is playing');
        }
        await queue.player.setPaused(false);
    }

    /**
     * @param {string} guildId
     */
    async stop(guildId) {
        const queue = this.queues.get(guildId);
        if (!queue) return;

        queue.tracks = [];
        queue.playing = false;
        this.queues.delete(guildId);

        await this.shoukaku.leaveVoiceChannel(guildId).catch(() => {});
    }

    /**
     * @param {string} guildId
     * @param {number} value
     */
    async setVolume(guildId, value) {
        const queue = this.queues.get(guildId);

        this.settings.setGuildVolume(guildId, value);

        if (!queue || !queue.player) {
            return { applied: false };
        }

        queue.volume = value;

        try {
            await queue.player.setGlobalVolume(value);
            return { applied: true };
        } catch (error) {
            console.error('Failed to set volume:', error);
            throw error;
        }
    }

    /**
     * @param {string} guildId
     * @param {'off'|'track'|'queue'} mode
     */
    setLoopMode(guildId, mode) {
        const queue = this.queues.get(guildId);
        this.settings.setGuildLoopMode(guildId, mode);
        if (queue) {
            queue.loopMode = mode;
        }
    }

    /**
     * @param {string} guildId
     */
    getQueue(guildId) {
        return this.queues.get(guildId) || null;
    }

    /**
     * @param {string} guildId
     */
    shuffle(guildId) {
        const queue = this.queues.get(guildId);
        if (!queue || queue.tracks.length <= 1) {
            throw new Error('Nothing to shuffle');
        }
        for (let i = queue.tracks.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            [queue.tracks[i], queue.tracks[j]] = [queue.tracks[j], queue.tracks[i]];
        }
        return queue.tracks;
    }

    /**
     * @param {string} guildId
     * @param {number} position 1-based index in upcoming queue
     */
    remove(guildId, position) {
        const queue = this.queues.get(guildId);
        if (!queue || queue.tracks.length === 0) {
            throw new Error('Queue is empty');
        }
        const index = position - 1;
        if (index < 0 || index >= queue.tracks.length) {
            throw new Error('Invalid position');
        }
        return queue.tracks.splice(index, 1)[0];
    }

    /**
     * @param {string} guildId
     * @param {number} position 1-based index
     */
    async skipTo(guildId, position) {
        const queue = this.queues.get(guildId);
        if (!queue || queue.tracks.length === 0) {
            throw new Error('Queue is empty');
        }
        const index = position - 1;
        if (index < 0 || index >= queue.tracks.length) {
            throw new Error('Invalid position');
        }
        queue.tracks = queue.tracks.slice(index);
        await this.skip(guildId);
    }

    /**
     * @param {string} guildId
     * @param {number} from 1-based
     * @param {number} to 1-based
     */
    move(guildId, from, to) {
        const queue = this.queues.get(guildId);
        if (!queue || queue.tracks.length === 0) {
            throw new Error('Queue is empty');
        }
        const fromIdx = from - 1;
        const toIdx = to - 1;

        if (
            fromIdx < 0 ||
            fromIdx >= queue.tracks.length ||
            toIdx < 0 ||
            toIdx >= queue.tracks.length
        ) {
            throw new Error('Invalid position');
        }

        const [track] = queue.tracks.splice(fromIdx, 1);
        queue.tracks.splice(toIdx, 0, track);
        return queue.tracks;
    }

    createController(guildId, queue) {
        const player = queue.player;
        return [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`controller:${guildId}:Skip`)
                    .setEmoji('⏭️')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`controller:${guildId}:PlayPause`)
                    .setEmoji(player.paused ? '▶️' : '⏸️')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`controller:${guildId}:Stop`)
                    .setEmoji('⏹️')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(`controller:${guildId}:Loop`)
                    .setEmoji(queue.loopMode === 'track' ? '🔂' : queue.loopMode === 'queue' ? '🔁' : '🔁')
                    .setStyle(
                        queue.loopMode === 'off' ? ButtonStyle.Secondary : ButtonStyle.Success
                    ),
                new ButtonBuilder()
                    .setCustomId(`controller:${guildId}:Shuffle`)
                    .setEmoji('🔀')
                    .setStyle(ButtonStyle.Secondary)
            ),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`controller:${guildId}:VolumeDown`)
                    .setEmoji('🔉')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`controller:${guildId}:VolumeUp`)
                    .setEmoji('🔊')
                    .setStyle(ButtonStyle.Secondary)
            )
        ];
    }

    buildNowPlayingEmbed(queue, track) {
        const embed = {
            color: queue.embedColor || 0x5865f2,
            author: queue.iconURL
                ? {
                      name: 'Now playing',
                      icon_url: queue.iconURL
                  }
                : { name: 'Now playing' },
            description: `[${track.info.title}](${track.info.uri || track.info.url || track.info.identifier || ''})`,
            fields: [
                {
                    name: 'Requested by',
                    value: track.info.requester ? `<@${track.info.requester}>` : 'Desconhecido',
                    inline: true
                },
                {
                    name: 'Duração',
                    value: this.formatDuration(track.info.length, track.info.isStream),
                    inline: true
                },
                {
                    name: 'Volume',
                    value: `${queue.volume}%`,
                    inline: true
                },
                {
                    name: 'Loop',
                    value: queue.loopMode,
                    inline: true
                }
            ],
            thumbnail: {
                url: track.info.artworkUrl || track.info.thumbnail || track.info.image || null
            }
        };
        if (queue.autoQueue) {
            embed.fields.push({
                name: 'AutoQueue',
                value: 'Ativado',
                inline: true
            });
        }
        return embed;
    }

    formatDuration(lengthMs, isStream) {
        if (isStream) return '`LIVE`';
        const totalSeconds = Math.floor((lengthMs || 0) / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `\`${minutes}:${seconds.toString().padStart(2, '0')}\``;
    }

    markMessageDeleted(message) {
        this.deletedMessages.add(message);
    }

    isMessageDeleted(message) {
        return this.deletedMessages.has(message);
    }

    async handleControllerInteraction(interaction) {
        const [_, guildId, action] = interaction.customId.split(':');
        try {
            switch (action) {
                case 'Skip':
                    await this.skip(guildId);
                    await interaction.reply({ content: '⏭️ Música pulada.', ephemeral: true });
                    break;
                case 'PlayPause': {
                    const queue = this.getQueue(guildId);
                    if (!queue) throw new Error('Nada está tocando.');
                    if (queue.player.paused) {
                        await this.resume(guildId);
                        await interaction.reply({ content: '▶️ Playback retomado.', ephemeral: true });
                    } else {
                        await this.pause(guildId);
                        await interaction.reply({ content: '⏸️ Playback pausado.', ephemeral: true });
                    }
                    break;
                }
                case 'Stop':
                    await this.stop(guildId);
                    await interaction.reply({ content: '⏹️ Playback parado.', ephemeral: true });
                    break;
                case 'Loop': {
                    const queue = this.getQueue(guildId);
                    if (!queue) throw new Error('Nada está tocando.');
                    const cycle = ['off', 'track', 'queue'];
                    const nextMode = cycle[(cycle.indexOf(queue.loopMode) + 1) % cycle.length];
                    this.setLoopMode(guildId, nextMode);
                    await interaction.reply({
                        content: `🔁 Loop definido para **${nextMode}**.`,
                        ephemeral: true
                    });
                    if (queue.nowPlayingMessage && !this.isMessageDeleted(queue.nowPlayingMessage)) {
                        queue.nowPlayingMessage
                            .edit({ embeds: [this.buildNowPlayingEmbed(queue, queue.current)] })
                            .catch(() => {});
                    }
                    break;
                }
                case 'Shuffle':
                    this.shuffle(guildId);
                    await interaction.reply({ content: '🔀 Fila embaralhada.', ephemeral: true });
                    break;
                case 'VolumeDown': {
                    const queue = this.getQueue(guildId);
                    if (!queue) throw new Error('Nada está tocando.');
                    const newVolume = Math.max(queue.volume - 10, 0);
                    await this.setVolume(guildId, newVolume);
                    await interaction.reply({
                        content: `🔉 Volume ajustado para **${newVolume}**.`,
                        ephemeral: true
                    });
                    if (queue.nowPlayingMessage && !this.isMessageDeleted(queue.nowPlayingMessage)) {
                        queue.nowPlayingMessage
                            .edit({ embeds: [this.buildNowPlayingEmbed(queue, queue.current)] })
                            .catch(() => {});
                    }
                    break;
                }
                case 'VolumeUp': {
                    const queue = this.getQueue(guildId);
                    if (!queue) throw new Error('Nada está tocando.');
                    const newVolume = Math.min(queue.volume + 10, 100);
                    await this.setVolume(guildId, newVolume);
                    await interaction.reply({
                        content: `🔊 Volume ajustado para **${newVolume}**.`,
                        ephemeral: true
                    });
                    if (queue.nowPlayingMessage && !this.isMessageDeleted(queue.nowPlayingMessage)) {
                        queue.nowPlayingMessage
                            .edit({ embeds: [this.buildNowPlayingEmbed(queue, queue.current)] })
                            .catch(() => {});
                    }
                    break;
                }
                default:
                    await interaction.reply({
                        content: 'Ação desconhecida.',
                        ephemeral: true
                    });
            }
        } catch (error) {
            await interaction.reply({
                content: error.message || 'Não foi possível executar essa ação.',
                ephemeral: true
            }).catch(() => {});
        }
    }

    /**
     * @param {string} guildId
     */
    destroyQueue(guildId) {
        const queue = this.queues.get(guildId);
        if (!queue) return;
        queue.tracks = [];
        queue.playing = false;
        queue.current = null;
        if (queue.nowPlayingMessage && !this.isMessageDeleted(queue.nowPlayingMessage)) {
            queue.nowPlayingMessage.delete().catch(() => {});
        }
        queue.nowPlayingMessage = null;
        this.queues.delete(guildId);
    }

    addToRecent(queue, identifier) {
        if (!identifier) return;
        queue.recent.push(identifier);
        if (queue.recent.length > 100) {
            queue.recent.shift();
        }
    }

    async handleAutoQueue(queue, finishedTrack) {
        if (!finishedTrack) return;
        const identifier = finishedTrack.info?.identifier;
        if (!identifier) return;

        const search = `https://www.youtube.com/watch?v=${identifier}&list=RD${identifier}`;
        try {
            const result = await this.resolve(search);
            const tracks = this.extractTracks(result);
            const candidate = tracks.find(
                (track) => !queue.recent.includes(track.info?.identifier)
            );
            if (!candidate) return;
            const normalised = this.normalizeTrack(candidate, finishedTrack.info?.requester);
            if (!normalised) return;
            queue.tracks.push(normalised);
            const newIdentifier = normalised.info?.identifier || normalised.encoded;
            if (newIdentifier) this.addToRecent(queue, newIdentifier);
        } catch (error) {
            console.error('Failed to auto-queue track:', error);
        }
    }

    extractTracks(result) {
        if (!result) return [];

        if (typeof result.loadType === 'string' && Object.prototype.hasOwnProperty.call(result, 'data')) {
            if (result.loadType === 'empty') return [];
            if (result.loadType === 'error') return [];
            if (result.loadType === 'track') return result.data ? [result.data] : [];
            if (result.loadType === 'playlist') return Array.isArray(result.data?.tracks) ? result.data.tracks : [];
            if (result.loadType === 'search') return Array.isArray(result.data) ? result.data : [];
        }

        if (Array.isArray(result.tracks)) {
            return result.tracks;
        }

        return [];
    }
}

module.exports = MusicManager;

