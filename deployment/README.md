# Release Checklist

## Staging Setup
1. Provision staging Discord server and invite the bot with required permissions.
2. Deploy services via `docker compose` or CI to staging infrastructure.
3. Populate `.env` with staging credentials (Discord, Spotify, Mongo, Lavalink, dashboard URL).
4. Initialize MongoDB (optional seed data) and verify Lavalink connectivity.

## Regression Checklist
- [ ] `/play` (URL/busca) funciona em ambos idiomas.
- [ ] Menu de seleção / escolha manual e adição de playlist/álbum Spotify.
- [ ] Controles (pause/resume/skip/stop/queue) via comandos e botões.
- [ ] Autoplay, loop, filtros e modo 24/7.
- [ ] Persistência (DJ, idioma, volume) mantém-se após reboot.
- [ ] Dashboard Next.js: login OAuth, seleção de servidores, controles.
- [ ] API endpoints principais (`/status`, `/queue`, `/play`, etc.).
- [ ] Logs sem erros críticos (bot, dashboard, Lavalink, Mongo).

## Release Notes
1. Resumir funcionalidades principais adicionadas.
2. Incluir instruções de migração (env vars novas, Docker, Mongo).
3. Referenciar checklist de testes.
4. Definir plano de suporte pós-lançamento.
