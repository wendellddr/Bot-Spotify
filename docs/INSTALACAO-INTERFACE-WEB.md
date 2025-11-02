# 🚀 Instalação Rápida - Interface Web

## Passo a Passo Completo

### 1️⃣ Instalar Dependências

```bash
npm install
```

Ou manualmente:

```bash
npm install express socket.io express-session node-fetch
```

### 2️⃣ Configurar `.env`

Adicione estas linhas no seu `.env`:

```env
# Web Server
WEB_PORT=3000
REDIRECT_URI=http://localhost:3000/auth/callback
SESSION_SECRET=qualquer-string-aleatoria-aqui
```

> ⚠️ **IMPORTANTE**: 
> - Substitua `SESSION_SECRET` por uma string segura aleatória
> - O `REDIRECT_URI` deve estar **exatamente igual** ao configurado no Discord

### 3️⃣ Obter Discord Client Secret

1. Acesse https://discord.com/developers/applications
2. Clique no seu bot
3. Vá em **OAuth2** > **General**
4. Clique em **Reset Secret** (ou copie o secret existente)
5. **Copie o Client Secret** - você vai precisar dele
6. Adicione no `.env`:
   ```env
   DISCORD_CLIENT_SECRET=seu_client_secret_aqui
   ```

### 4️⃣ Configurar Discord OAuth2

1. Ainda em **OAuth2** > **General**
2. Clique em **Add Redirect**
3. Cole: `http://localhost:3000/auth/callback`
4. Em **Scopes**, marque:
   - ✅ `identify`
   - ✅ `guilds`
5. Clique em **Save Changes**

### 5️⃣ Iniciar o Bot

```bash
npm start
```

Você verá:

```
✅ Bot conectado como SeuBot#1234!
🌐 Interface web iniciada!
   Acesse: http://localhost:3000
```

### 6️⃣ Usar

1. Abra http://localhost:3000
2. Faça login com Discord
3. Selecione um servidor
4. Adicione músicas! 🎵

---

## 🎯 Arquivos Criados

- ✅ `web-server.js` - Servidor web
- ✅ `public/index.html` - Interface principal
- ✅ `public/style.css` - Estilos
- ✅ `public/app.js` - JavaScript
- ✅ `public/login.html` - Página de login
- ✅ `INTERFACE-WEB.md` - Documentação completa

---

## ⚙️ APIs Disponíveis

### Autenticação
- `GET /login` - Redireciona para login
- `GET /auth/callback` - Callback OAuth2
- `GET /logout` - Sair

### API
- `GET /api/servers` - Lista servidores
- `GET /api/status/:guildId` - Status atual
- `POST /api/play/:guildId` - Adicionar música
- `POST /api/toggle/:guildId` - Play/Pause
- `POST /api/stop/:guildId` - Parar
- `POST /api/skip/:guildId` - Pular

---

## 🐛 Problemas?

### "Interface web desabilitada"
- Verifique `CLIENT_ID` e se tem `DISCORD_CLIENT_SECRET` no `.env`

### "Erro na autenticação"
- `REDIRECT_URI` não corresponde ao Discord
- Verifique se está exatamente igual em ambos os lugares

### "Porta já em uso"
- Mude `WEB_PORT` no `.env`

### "Erro ao carregar servidores"
- Bot precisa estar no servidor do usuário

---

## 📖 Documentação Completa

Veja `INTERFACE-WEB.md` para documentação detalhada.

---

**🎉 Pronto! Sua interface web está funcionando!**

