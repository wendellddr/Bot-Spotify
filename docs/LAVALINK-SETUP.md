# Guia de Configuração do Lavalink

## Pré-requisitos

- Node.js 18 LTS (para o bot)
- Java 17+ (Temurin/OpenJDK)
- Git instalado
- Opcional: Docker / Docker Compose

## Passo 1 — Baixar o Lavalink

1. Baixe o [Lavalink v4 release](https://github.com/lavalink-devs/Lavalink/releases) mais recente.
2. Extraia o arquivo JAR e copie para `lavalink/Lavalink.jar` (retire espaços do nome, se necessário).

## Passo 2 — Configurar `application.yml`

1. Copie `lavalink/application.example.yml` para `lavalink/application.yml`.
2. Ajuste a senha (`password`) se desejar. O valor padrão é `youshallnotpass`.
3. Ajuste plugins, caso deseje suporte adicional (ex.: Spotify). Consulte documentação do plugin.

## Passo 3 — Executar o servidor

### Via Java direto

```powershell
cd lavalink
java -jar Lavalink.jar
```

### Via Docker Compose

Se preferir container, crie um `docker-compose.yml` (exemplo simplificado):

```yaml
services:
  lavalink:
    image: ghcr.io/lavalink-devs/lavalink:4
    container_name: lavalink
    restart: unless-stopped
    environment:
      SERVER_PORT: 2333
      LAVALINK_SERVER_PASSWORD: youshallnotpass
    ports:
      - "2333:2333"
    volumes:
      - ./lavalink/application.yml:/opt/Lavalink/application.yml
```

> Garanta que a senha e a porta coincidam com as variáveis definidas no `.env` do bot.

## Passo 4 — Variáveis de ambiente do bot

No arquivo `.env` do projeto, configure:

```
LAVALINK_HOST=127.0.0.1
LAVALINK_PORT=2333
LAVALINK_PASSWORD=youshallnotpass
LAVALINK_SECURE=false
```

## Passo 5 — Teste de conexão

1. Inicie o Lavalink e aguarde mensagem `Started Launcher` no terminal.
2. Inicie o bot (`npm run dev`).
3. Verifique se logs do bot exibem `Lavalink node conectado`.

Pronto! Lavalink está disponível para ser integrado nas próximas etapas.

