const { SlashCommandBuilder } = require('discord.js');
const Genius = require('genius-lyrics');

const client = new Genius.Client();

async function findLyrics(query) {
    const searches = await client.songs.search(query);
    if (!searches.length) return null;

    const song = searches[0];
    try {
        const lyrics = await song.lyrics();
        return {
            title: `${song.title} — ${song.artist.name}`,
            url: song.url,
            lyrics
        };
    } catch (error) {
        console.error('Failed to fetch lyrics text:', error);
        return {
            title: `${song.title} — ${song.artist.name}`,
            url: song.url,
            lyrics: null
        };
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lyrics')
        .setDescription('Busca a letra da música atual ou de uma consulta')
        .addStringOption((option) =>
            option
                .setName('query')
                .setDescription('Nome da música/artista')
                .setRequired(false)
        ),
    async execute(interaction) {
        await interaction.deferReply();

        const query = interaction.options.getString('query');
        const queue = interaction.client.music.getQueue(interaction.guildId);

        let searchQuery = query;
        if (!searchQuery) {
            if (!queue || (!queue.current && !queue.tracks.length)) {
                await interaction.editReply('Nenhuma música encontrada na fila.');
                return;
            }
            const track = queue.current || queue.tracks[0];
            searchQuery = `${track.info.title} ${track.info.author}`;
        }

        try {
            const result = await findLyrics(searchQuery);
            if (!result) {
                await interaction.editReply('Não encontrei letras para essa música.');
                return;
            }

            if (!result.lyrics) {
                await interaction.editReply(
                    `Encontrei a música **${result.title}**, mas não consegui obter a letra.\n${result.url}`
                );
                return;
            }

            if (result.lyrics.length < 1800) {
                await interaction.editReply(`**${result.title}**\n${result.lyrics}`);
            } else {
                await interaction.editReply({
                    content: `**${result.title}**\nA letra é muito longa, veja em: ${result.url}`
                });
            }
        } catch (error) {
            console.error('Lyrics command failed:', error);
            await interaction.editReply('Não foi possível buscar a letra no momento.');
        }
    }
};

