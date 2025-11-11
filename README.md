# Discord Music Bot (Minimal)

Bot de música simples para Discord utilizando **discord.js**, **Shoukaku** e **Lavalink**.  
Focado apenas no essencial: comandos básicos de reprodução e gerenciamento de fila.

## Recursos

- `/play` – toca um link ou faz busca no YouTube (`ytsearch:`)
- `/skip` – pula a música atual
- `/stop` – limpa a fila e sai do canal de voz
- `/queue` – mostra a fila em execução
- `/volume` – ajusta o volume (persistido por servidor)
- `/loop` – controla repetição (off / track / queue)
- `/nowplaying` – exibe a faixa atual

## Requisitos

- Node.js 18+
- Instância Lavalink v4 (local ou via Docker)
- Token e Client ID do bot no Discord

## Configuração

1. Instale as dependências:
   ```bash
   npm install
   ```
2. Copie o arquivo de exemplo e preencha com suas credenciais:
   ```bash
   cp env.example .env         # Linux/Mac
   Copy-Item env.example .env  # PowerShell
   ```
   ```env
   DISCORD_TOKEN=seu_token
   DISCORD_CLIENT_ID=seu_client_id
   LAVALINK_HOST=127.0.0.1
   LAVALINK_PORT=2333
   LAVALINK_PASSWORD=youshallnotpass
   ```
3. Inicie o bot:
   ```bash
   npm start
   ```

## Docker Compose

O repositório inclui um `docker-compose.yml` com dois serviços:

- `lavalink`: servidor Lavalink oficial
- `bot`: este bot, construído a partir do Dockerfile

Antes de rodar, crie `.env` com as variáveis do bot. Em seguida:

```bash
docker compose up --build -d
```

## Estrutura do Projeto

```
.
├── Dockerfile
├── docker-compose.yml
├── env.example
├── package.json
├── package-lock.json
├── lavalink/
│   └── application.yml
└── src/
    ├── index.js
    └── settings.js

Dados persistidos ficam em `data/settings.json` (criado automaticamente).
```

## Desenvolvimento futuro

Este repositório está preparado para receber novos recursos (dashboard, filtros, cache etc.), mas a base foi reiniciada para priorizar estabilidade. Adicione funcionalidades gradualmente garantindo testes entre cada etapa.
