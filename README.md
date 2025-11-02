# 🎵 Bot de Música para Discord

Um bot completo e moderno que integra busca do Spotify com reprodução de música nos canais de voz do Discord. Busque músicas por nome ou artista e toque-as diretamente no seu servidor!

![Status](https://img.shields.io/badge/Status-Funcionando-brightgreen)
![Node](https://img.shields.io/badge/Node.js-16.9%2B-green)
![Discord.js](https://img.shields.io/badge/Discord.js-14.x-blue)

> 🚀 **Quer colocar seu bot online 24/7?** Veja o **[Guia de Início Rápido](docs/QUICK-START.md)**!  
> 🌐 **Interface Web:** [Guia Rápido](docs/WEB-SETUP-GUIDE.md) | [Instalação Completa](docs/INSTALACAO-INTERFACE-WEB.md) | [Documentação](docs/INTERFACE-WEB.md)

## ✨ Funcionalidades Principais

- 🎵 **Busca Inteligente**: Busque músicas por nome, artista ou URL
- 📋 **Menu de Seleção**: Escolha entre múltiplas opções quando encontrar várias músicas
- 🎧 **Suporte Multiplataforma**: YouTube, SoundCloud, Spotify e mais
- 📊 **Fila Completa**: Gerencie sua playlist com comandos avançados
- 🔄 **Repetição**: Repita música atual ou fila inteira
- ⚡ **Performance Otimizada**: Cache inteligente e busca rápida
- 🎨 **Interface Bonita**: Embeds coloridos com informações detalhadas
- 🌐 **Interface Web**: Controle o bot pelo navegador!

## 📋 Pré-requisitos

Antes de começar, você precisa de:

- ✅ **Node.js** 16.9.0 ou superior ([Download](https://nodejs.org/))
- ✅ Conta no **Discord** (para criar o bot)
- ✅ Conta no **Spotify** (qualquer conta, sem Premium necessário)

## 🚀 Instalação Rápida

### Passo 1: Criar o Bot no Discord

1. Acesse o [Discord Developer Portal](https://discord.com/developers/applications)
2. Clique em **"New Application"** e dê um nome ao seu bot
3. Vá em **"Bot"** no menu lateral e clique em **"Add Bot"**
4. Copie o **Token** (você precisará depois)
5. Em **"Privileged Gateway Intents"**, ative:
   - ✅ `MESSAGE CONTENT INTENT`
   - ✅ `SERVER MEMBERS INTENT` (opcional, mas recomendado)
6. Vá em **"OAuth2"** > **"URL Generator"**
7. Selecione:
   - **Scopes**: `bot` e `applications.commands`
   - **Bot Permissions**: 
     - ✅ Connect (Conectar aos canais de voz)
     - ✅ Speak (Falar nos canais)
     - ✅ Use Voice Activity
     - ✅ Send Messages
     - ✅ Embed Links
8. Copie o link gerado e adicione o bot ao seu servidor

### Passo 2: Criar App no Spotify

1. Acesse o [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Faça login com sua conta Spotify (qualquer conta funciona!)
3. Clique em **"Create app"**
4. Preencha:
   - **App name**: Nome do seu bot
   - **App description**: Descrição do bot
   - **Website**: (opcional)
   - **Redirect URI**: `http://localhost:8888/callback`
5. Marque os termos e clique em **"Save"**
6. Copie o **Client ID** e **Client Secret**

### Passo 3: Configurar o Bot

1. **Clone ou baixe este repositório**
   ```bash
   git clone <seu-repositorio>
   cd Bot-Spotify
   ```

2. **Instale as dependências**
   ```bash
   npm install
   ```

3. **Configure as variáveis de ambiente**
   
   Copie o arquivo de exemplo:
   ```bash
   # Windows (PowerShell)
   Copy-Item env.example .env
   
   # Linux/Mac
   cp env.example .env
   ```
   
   Abra o arquivo `.env` e preencha com seus dados:
   ```env
   DISCORD_TOKEN=seu_token_do_discord_aqui
   CLIENT_ID=seu_client_id_do_discord_aqui
   SPOTIFY_CLIENT_ID=seu_spotify_client_id_aqui
   SPOTIFY_CLIENT_SECRET=seu_spotify_client_secret_aqui
   ```

   > ⚠️ **Importante**: Nunca compartilhe seu arquivo `.env`! Ele contém informações sensíveis.

4. **Inicie o bot**
   ```bash
   npm start
   ```
   
   Ou em modo desenvolvimento (com auto-reload):
   ```bash
   npm run dev
   ```

5. **Pronto!** 🎉 
   
   O bot está online! Aguarde alguns segundos para os comandos serem registrados no Discord.

## 📁 Estrutura do Projeto

O projeto está organizado da seguinte forma:

```
Bot-Spotify/
├── src/                    # Código fonte
│   ├── bot/               # Bot do Discord
│   │   └── index.js      # Arquivo principal do bot
│   ├── server/           # Servidor web
│   │   └── web-server.js # Servidor Express
│   └── utils/            # Utilitários
│       └── youtube-extractor.js
├── public/               # Interface web
│   ├── css/              # Estilos
│   ├── js/               # JavaScript do cliente
│   ├── index.html        # Interface principal
│   └── login.html        # Página de login
├── docs/                 # Documentação
├── scripts/              # Scripts utilitários
└── assets/               # Arquivos estáticos
```

> 📚 Para mais detalhes, veja [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)

## 🎮 Comandos Disponíveis

### Comandos Básicos

| Comando | Descrição | Exemplo |
|---------|-----------|---------|
| `/play` | Toca uma música ou adiciona à fila | `/play busca: Bohemian Rhapsody` |
| `/skip` | Pula a música atual | `/skip` |
| `/pause` | Pausa a reprodução | `/pause` |
| `/resume` | Retoma a reprodução pausada | `/resume` |
| `/stop` | Para a música e limpa a fila | `/stop` |

### Comandos de Fila

| Comando | Descrição | Exemplo |
|---------|-----------|---------|
| `/queue` | Mostra a fila de músicas | `/queue pagina: 1` |
| `/clear` | Limpa toda a fila | `/clear` |
| `/shuffle` | Embaralha a fila | `/shuffle` |
| `/remove` | Remove uma música específica | `/remove posicao: 3` |
| `/jump` | Pula para uma música específica | `/jump posicao: 5` |
| `/remove-duplicates` | Remove músicas duplicadas | `/remove-duplicates` |

### Comandos Avançados

| Comando | Descrição | Exemplo |
|---------|-----------|---------|
| `/nowplaying` | Mostra a música atual | `/nowplaying` |
| `/volume` | Ajusta o volume (0-100) | `/volume valor: 50` |
| `/loop` | Define modo de repetição | `/loop modo: Música atual` |
| `/seek` | Avança na música atual | `/seek tempo: 1:30` |

### Comandos Úteis

| Comando | Descrição |
|---------|-----------|
| `/ping` | Verifica se o bot está online |

## 📖 Como Usar

### Buscar e Tocar Música

1. Entre em um **canal de voz** no Discord
2. Digite `/play busca: nome da música` ou `/play busca: nome do artista`
3. Se encontrar várias músicas, escolha uma no menu que aparece
4. A música começará a tocar automaticamente!

### Exemplos de Uso

```
/play busca: Queen Bohemian Rhapsody
/play busca: https://youtube.com/watch?v=...
/play busca: The Beatles
```

### Menu de Seleção

Quando você busca algo genérico (como apenas o nome de um artista), o bot mostra um menu com até 10 opções. Basta clicar na música desejada!

## 🔧 Como Funciona

O bot usa duas tecnologias principais:

1. **Spotify API**: Busca informações detalhadas de músicas, artistas e álbums
2. **Discord Player**: Reproduz as músicas usando múltiplas fontes de áudio

### Plataformas Suportadas

- 🎬 **YouTube** - Vídeos e playlists
- 🎧 **SoundCloud** - Faixas e playlists
- 📹 **Vimeo** - Vídeos de áudio
- 🍎 **Apple Music** - Músicas e playlists
- 📎 **Arquivos MP3** - Uploads locais ou remotos

## 💡 Dicas e Truques

- ✅ **Busca Inteligente**: Você pode buscar por nome da música, artista ou até mesmo letras parciais
- ✅ **URLs Diretas**: Cole URLs do YouTube diretamente no `/play`
- ✅ **Menu de Seleção**: Se encontrar muitas opções, use o menu para escolher facilmente
- ✅ **Repetição**: Use `/loop` para repetir sua música favorita
- ✅ **Avançar Música**: Use `/seek` para pular partes da música atual

## ❓ Perguntas Frequentes (FAQ)

### O bot não está tocando música

**Verifique:**
- ✅ Você está em um canal de voz?
- ✅ O bot tem permissão para entrar no canal?
- ✅ As credenciais do Spotify estão corretas no `.env`?
- ✅ O bot está online? (use `/ping` para verificar)

**Solução:** Remova o bot do servidor e adicione-o novamente com as permissões corretas.

### Comandos não aparecem no Discord

**Aguarde:** Os comandos podem levar até 5 minutos para aparecerem após o bot iniciar.

**Forçar atualização:**
1. Feche completamente o Discord
2. Abra novamente
3. Os comandos devem aparecer

### Erro ao instalar dependências

**Certifique-se:**
- ✅ Você tem Node.js 16.9.0 ou superior
- ✅ Você está na pasta correta do projeto

**Solução:** 
```bash
# Limpar e reinstalar
rm -rf node_modules package-lock.json
npm install
```

### O bot não encontra músicas

**Possíveis causas:**
- A busca pode ser muito genérica (tente ser mais específico)
- A música pode não estar disponível nas plataformas suportadas
- Tente usar uma URL direta do YouTube

## 🐛 Resolução de Problemas

### Bot desconecta do canal

Isso é normal! O bot sai automaticamente quando:
- Não há ninguém no canal de voz por mais de 1 minuto
- Você usa `/stop` para parar a música

Basta entrar no canal de voz novamente e usar `/play`.

### Erro de permissões

Certifique-se de que o bot tem estas permissões:
- ✅ Conectar ao canal de voz
- ✅ Falar no canal de voz
- ✅ Enviar mensagens
- ✅ Usar comandos slash

### Erro ao conectar ao Spotify

Verifique se:
- ✅ O `SPOTIFY_CLIENT_ID` está correto
- ✅ O `SPOTIFY_CLIENT_SECRET` está correto
- ✅ Não há espaços extras no arquivo `.env`

## 📝 Notas Importantes

- 🔒 **Segurança**: Nunca compartilhe seu arquivo `.env` publicamente!
- 🎵 **Spotify**: Você não precisa ter Spotify Premium para usar o bot
- 📊 **Limites**: O bot usa cache para otimizar buscas repetidas
- ⚡ **Performance**: O bot sai automaticamente de canais vazios para economizar recursos

## 🛠️ Tecnologias Utilizadas

- [discord.js](https://discord.js.org/) - Framework para bots Discord
- [discord-player](https://github.com/Androz2091/discord-player) - Sistema de reprodução de música
- [Spotify Web API](https://developer.spotify.com/) - API do Spotify
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) - Extração de áudio do YouTube

## 🤝 Contribuindo

Contribuições são bem-vindas! Se você tem ideias para melhorar o bot:

1. Faça um Fork do projeto
2. Crie uma branch para sua feature (`git checkout -b feature/MinhaFeature`)
3. Faça commit das mudanças (`git commit -m 'Adiciona MinhaFeature'`)
4. Faça push para a branch (`git push origin feature/MinhaFeature`)
5. Abra um Pull Request

## 📄 Licença

Este projeto está licenciado sob a MIT License.

## 🙏 Agradecimentos

- [Androz2091](https://github.com/Androz2091) pelo incrível discord-player
- Discord.js Community pela excelente documentação
- Spotify pela API pública e gratuita

---

## 🚀 Deploy (Colocar Online)

Quer que seu bot fique online 24/7? Siga o **[Guia Completo de Deploy](DEPLOY.md)**!

Temos tutoriais para:
- 🚂 **Railway** (Recomendado - $5/mês grátis)
- 🌐 **Render** (Gratuito)
- 🟢 **Replit** (Gratuito)
- 🖥️ **VPS DigitalOcean** (Maior controle)

---

⭐ **Gostou do projeto?** Deixe uma estrela no repositório!

💬 **Dúvidas?** Abra uma issue no GitHub!

🎵 **Divirta-se usando o bot!**
