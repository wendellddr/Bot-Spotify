# 🌐 Interface Web - Guia de Instalação

A interface web permite controlar o bot diretamente pelo navegador, sem precisar usar comandos no Discord!

## ✨ Funcionalidades

- 🎵 **Buscar e adicionar músicas** sem digitar comandos
- 🎮 **Controles visuais**: Play/Pause, Skip, Stop
- 📋 **Ver a fila completa** em tempo real
- 🔊 **Ajustar volume** com slider
- 🖥️ **Interface moderna** e responsiva
- ⚡ **Atualização em tempo real** via WebSocket

---

## 📋 Pré-requisitos

1. ✅ Bot configurado e funcionando
2. ✅ Node.js instalado
3. ✅ Dependências do projeto instaladas

---

## 🚀 Instalação

### 1️⃣ Instalar Dependências

```bash
npm install express socket.io discord-oauth2 express-session
```

Ou reinstalar todas as dependências:

```bash
npm install
```

### 2️⃣ Configurar Variáveis de Ambiente

Adicione ao seu arquivo `.env`:

```env
# Web Server (Interface HTML)
WEB_PORT=3000
REDIRECT_URI=http://localhost:3000/auth/callback
SESSION_SECRET=sua-chave-secreta-super-segura-aqui
```

> 💡 **IMPORTANTE**: 
> - `WEB_PORT`: Porta onde o servidor web vai rodar (padrão: 3000)
> - `REDIRECT_URI`: Deve ser **exatamente** como configurado no Discord Developer Portal
> - `SESSION_SECRET`: Use uma string aleatória e segura

### 3️⃣ Configurar Discord OAuth2

1. Acesse o [Discord Developer Portal](https://discord.com/developers/applications)
2. Selecione seu bot
3. Vá em **OAuth2** > **General**
4. Clique em **Add Redirect**
5. Adicione: `http://localhost:3000/auth/callback`
6. Em **Scopes**, marque:
   - ✅ `identify`
   - ✅ `guilds`
7. Clique em **Save Changes**

### 4️⃣ Iniciar o Bot

```bash
npm start
```

Você verá:

```
🌐 Interface web iniciada!
   Acesse: http://localhost:3000
```

### 5️⃣ Acessar a Interface

1. Abra o navegador em `http://localhost:3000`
2. Clique em **"Login com Discord"**
3. Autorize o bot
4. Selecione um servidor
5. Comece a usar! 🎉

---

## 🎮 Como Usar

### Buscar Música

1. Selecione um servidor
2. Digite o nome da música na barra de busca
3. Clique em 🔍 ou pressione Enter
4. A música será adicionada à fila!

### Controles

- **▶️ Play/Pause**: Pausar ou retomar a música atual
- **⏭️ Skip**: Pular para a próxima música
- **⏹️ Stop**: Parar a reprodução e limpar a fila
- **🔊 Volume**: Ajuste o volume com o slider

### Visualizar Fila

A fila completa é exibida em tempo real com:
- Capa da música
- Título e artista
- Duração

---

## 🔧 Configuração Avançada

### Mudar Porta

No `.env`:

```env
WEB_PORT=8080
```

### Usar HTTPS

Para produção, configure um proxy reverso com Nginx ou similar.

### Personalizar REDIRECT_URI

Se mudar o `REDIRECT_URI`, atualize também no Discord Developer Portal!

Exemplo para produção:

```env
REDIRECT_URI=https://seu-dominio.com/auth/callback
```

---

## 🐛 Troubleshooting

### ❌ "Interface web desabilitada"

**Problema**: Falta configurar Discord OAuth2 no `.env`

**Solução**: Certifique-se de que `CLIENT_ID` e `DISCORD_CLIENT_SECRET` estão corretos

### ❌ "Erro na autenticação"

**Problema**: REDIRECT_URI não corresponde ao configurado no Discord

**Solução**: Verifique se o `REDIRECT_URI` no `.env` está exatamente igual ao do Developer Portal

### ❌ "Erro ao carregar servidores"

**Problema**: Bot não está nos servidores do usuário

**Solução**: Adicione o bot aos servidores com permissões adequadas

### ❌ "Porta já em uso"

**Problema**: Outro serviço está usando a porta 3000

**Solução**: Mude o `WEB_PORT` no `.env` para outra porta (ex: 3001, 8080)

---

## 🔒 Segurança

### Sessões

- As sessões duram 24 horas
- Use `SESSION_SECRET` forte e aleatório
- Para produção, configure HTTPS

### Acesso

- Apenas usuários autenticados podem usar
- Apenas servidores onde o bot está presente aparecem
- Cada usuário vê apenas seus próprios servidores

---

## 🌍 Deploy

### Railway

O Railway detecta automaticamente e inicia o servidor web!

⚠️ **IMPORTANTE**: No `.env` de produção, configure:

```env
REDIRECT_URI=https://seu-app.railway.app/auth/callback
```

E atualize no Discord Developer Portal também!

### Render

Similar ao Railway, mas configure HTTPS no redirect URI.

### VPS

Use Nginx como proxy reverso:

```nginx
server {
    listen 80;
    server_name seu-dominio.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 📝 Estrutura de Arquivos

```
Bot-Spotify/
├── index.js              # Bot principal
├── web-server.js         # Servidor web
├── package.json          # Dependências
├── .env                  # Configurações
└── public/               # Interface HTML
    ├── index.html        # Interface principal
    ├── style.css         # Estilos
    └── app.js            # JavaScript frontend
```

---

## 🎨 Personalização

### Mudar Cores

Edite `public/style.css`:

```css
:root {
    --primary: #1DB954;  /* Cor principal */
    --secondary: #191414;
    /* ... */
}
```

### Adicionar Funcionalidades

Edite `public/app.js` para adicionar novas funções!

---

## 📊 API Endpoints

### GET `/api/servers`
Retorna lista de servidores do usuário

### GET `/api/status/:guildId`
Retorna status atual do player

### POST `/api/play/:guildId`
Adiciona música à fila

### POST `/api/toggle/:guildId`
Pausa/retoma reprodução

### POST `/api/stop/:guildId`
Para reprodução

### POST `/api/skip/:guildId`
Pula música atual

---

## 🆘 Precisa de Ajuda?

1. Verifique os logs do bot
2. Confirme que todas as dependências estão instaladas
3. Verifique se o `.env` está configurado corretamente
4. Certifique-se de que o Discord OAuth2 está configurado

---

**🎵 Divirta-se com sua interface web!**

