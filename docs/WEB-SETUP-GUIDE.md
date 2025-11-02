# 🌐 Guia de Configuração da Interface Web

## ✅ O que você precisa

A interface web precisa das mesmas credenciais do bot + uma credencial adicional para autenticação OAuth2.

## 🔑 Credenciais Necessárias

### 1️⃣ Discord Bot Token
✅ **Você já tem** - mesmo `DISCORD_TOKEN` do bot

### 2️⃣ Discord Client ID
✅ **Você já tem** - mesmo `CLIENT_ID` do bot

### 3️⃣ Discord Client Secret ⚠️ **NOVO!**
❓ **Você precisa obter** - Credencial para OAuth2

## 📋 Passo a Passo

### Passo 1: Obter Discord Client Secret

1. Acesse: https://discord.com/developers/applications
2. Clique no seu aplicativo/bot
3. Vá em **OAuth2** no menu lateral
4. Clique em **General**
5. Você verá duas opções:
   - **Client ID** - você já tem
   - **Client Secret** - clique em "Reset Secret" ou copie se já existe
6. **Copie o Client Secret** (aparece apenas uma vez!)

### Passo 2: Adicionar no `.env`

Abra seu arquivo `.env` e adicione:

```env
# Credenciais Discord
DISCORD_TOKEN=seu_token_aqui
CLIENT_ID=seu_client_id_aqui
DISCORD_CLIENT_SECRET=seu_client_secret_aqui  # ⬅️ ADICIONE ESTA LINHA

# Credenciais Spotify
SPOTIFY_CLIENT_ID=seu_spotify_client_id_aqui
SPOTIFY_CLIENT_SECRET=seu_spotify_client_secret_aqui

# Configurações Web
WEB_PORT=3000
REDIRECT_URI=http://localhost:3000/auth/callback
SESSION_SECRET=qualquer-string-aleatoria-muito-segura-aqui
```

### Passo 3: Configurar Redirect URI

1. Ainda no Discord Developer Portal
2. Em **OAuth2** > **General**
3. Na seção **Redirects**, clique em **Add Redirect**
4. Cole: `http://localhost:3000/auth/callback`
5. Clique em **Save Changes**

### Passo 4: Reiniciar o Bot

```bash
# Parar todos os processos node
Stop-Process -Name node -Force

# Iniciar novamente
npm start
```

### Passo 5: Acessar a Interface

Abra seu navegador em: **http://localhost:3000**

## ✅ Verificar se Funcionou

Ao iniciar, você deve ver:

```
✅ Extractors registered: 1 available
Bot connected as SeuBot#1234!
🔄 Updating slash commands...
✅ 18 command(s) updated successfully!
🌐 Web interface started!
   Access: http://localhost:3000
```

Se aparecer:
```
⚠️ Discord OAuth2 not configured. Web interface disabled.
```

❌ **Significa que faltou alguma credencial no `.env`**

Verifique:
- ✅ Tem `CLIENT_ID`?
- ✅ Tem `DISCORD_CLIENT_SECRET`? (⚠️ Esta é a que mais esquecem!)
- ✅ Credenciais estão corretas?

## 🚀 Para Deploy (Produção)

Ao fazer deploy, você precisa mudar o `REDIRECT_URI`:

### Exemplo no Railway:

```env
REDIRECT_URI=https://seu-bot.railway.app/auth/callback
```

E adicionar o mesmo URL no Discord Developer Portal em **OAuth2** > **Redirects**.

## 📝 Checklist Final

- [ ] Copiou o Discord Client Secret do Developer Portal
- [ ] Adicionou `DISCORD_CLIENT_SECRET` no `.env`
- [ ] Configurou redirect URI no Discord
- [ ] Reiniciou o bot
- [ ] Acessou http://localhost:3000
- [ ] Conseguiu fazer login com Discord

## 🆘 Ainda com Problemas?

### Erro: "This site can't be reached"
- Verifique se `WEB_PORT=3000` está no `.env`
- Tente mudar para `WEB_PORT=8080`

### Erro: "Unauthorized" ou "Invalid Redirect"
- Verifique se o redirect URI está **exatamente igual** no Discord e no `.env`
- Lembre-se: `http://localhost:3000/auth/callback` (não esquecer o `/auth/callback`)

### Erro: "Missing permissions"
- Certifique-se que o bot está no servidor
- Verifique se o usuário tem permissões no servidor

### Interface não aparece
- Verifique o console do bot
- Veja se aparece "Web interface started!"
- Se não aparecer, veja a mensagem de erro

---

📚 **Documentação Completa**: Veja [INSTALACAO-INTERFACE-WEB.md](INSTALACAO-INTERFACE-WEB.md)

