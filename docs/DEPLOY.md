# 🚀 Guia de Deploy - Bot Spotify Discord

Este guia te ajudará a colocar seu bot online usando diferentes plataformas.

---

## ⚡ Otimizações de Recursos

**Ótimas notícias!** Seu bot já está otimizado para economia de recursos:

### 🎯 Economia Automática

- **✅ Não entra em canal vazio**: Verifica se há pessoas antes de conectar
- **✅ Sai do canal quando vazio**: Após 15 segundos quando todos saem
- **✅ Sai quando termina de tocar**: Após 2 minutos sem músicas
- **✅ Cache inteligente**: Buscas são armazenadas por 5 minutos
- **✅ Limpeza automática**: Cache e dados temporários são limpos automaticamente
- **✅ Limite de cache**: Máximo 100 entradas para não consumir muita memória
- **✅ Timeouts configurados**: Evita processos travados

### 💡 O que isso significa?

**🎉 Economia de custos!** Seu bot usa o mínimo de recursos possível, perfeito para:
- ✅ Planos gratuitos/baratos
- ✅ VPS pequenos
- ✅ Plataformas com limites
- ✅ Múltiplos servidores simultâneos

**Não precisa configurar nada!** Tudo já está otimizado automaticamente.

---

## 📌 Índice

1. [Railway (Recomendado)](#railway-recomendado)
2. [Render](#render)
3. [Replit](#replit)
4. [VPS (DigitalOcean)](#vps-digitalocean)

---

## 🚂 Railway (Recomendado)

**✅ Melhor opção!**
- **Preço**: $5/mês grátis no cartão
- **Uptime**: 99.9% (sempre online)
- **Deploy**: Automático via GitHub
- **Facilidade**: ⭐⭐⭐⭐⭐

### Passo a Passo:

1. **Criar conta no Railway**
   - Acesse: https://railway.app
   - Faça login com GitHub

2. **Configurar o projeto no GitHub**
   - Se ainda não tiver, crie um repositório no GitHub
   - Faça upload do código
   - **IMPORTANTE**: Remova `yt-dlp.exe` do repositório (não funciona no Railway)
   - Adicione ao `.gitignore` se ainda não estiver

3. **Conectar Railway ao GitHub**
   - No Railway, clique em "New Project"
   - Escolha "Deploy from GitHub repo"
   - Selecione seu repositório
   - Railway vai detectar automaticamente o `package.json`

4. **Configurar variáveis de ambiente**
   - Clique em "Variables"
   - Adicione as seguintes variáveis:
     ```
     DISCORD_TOKEN=seu_token_aqui
     CLIENT_ID=seu_client_id_aqui
     SPOTIFY_CLIENT_ID=seu_spotify_client_id
     SPOTIFY_CLIENT_SECRET=seu_spotify_client_secret
     ```
   - Clique em "Deploy"

5. **Pronto!** 🎉
   - Railway vai instalar as dependências
   - O bot vai subir automaticamente
   - Você pode ver os logs em tempo real

### ⚠️ Nota sobre yt-dlp no Railway

O Railway é Linux, então você precisa instalar yt-dlp via script. Adicione um arquivo `railway.json`:

```json
{
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm start"
  }
}
```

---

## 🌐 Render

**Preço**: Gratuito (com limitações)
- **Uptime**: Pode hibernar após 15 min inativo
- **Facilidade**: ⭐⭐⭐⭐

### Passo a Passo:

1. **Criar conta no Render**
   - Acesse: https://render.com
   - Faça login com GitHub

2. **Criar novo Web Service**
   - Clique em "New +" > "Web Service"
   - Conecte ao repositório GitHub
   - Configurações:
     - **Name**: Spotify Bot
     - **Region**: Escolha o mais próximo
     - **Branch**: main
     - **Root Directory**: . (ponto)
     - **Build Command**: `npm install`
     - **Start Command**: `npm start`

3. **Adicionar variáveis de ambiente**
   - Vá em "Environment"
   - Adicione as mesmas variáveis do Railway

4. **Deploy!**
   - Clique em "Save"
   - Render vai fazer o deploy automaticamente

### ⚠️ Limitação do free tier

- O bot pode hibernar após 15 min sem uso
- O primeiro comando pode ser lento (despertar)
- Para evitar isso, use o plano pago ($7/mês)

---

## 🟢 Replit

**Preço**: Gratuito (com limitações)
- **Uptime**: Pode hibernar
- **Facilidade**: ⭐⭐⭐⭐⭐ (muito fácil!)

### Passo a Passo:

1. **Criar conta no Replit**
   - Acesse: https://replit.com
   - Faça login

2. **Importar do GitHub**
   - Crie um novo Repl
   - Escolha "Import from GitHub"
   - Cole o link do seu repositório

3. **Adicionar variáveis de ambiente**
   - Clique no "Secrets" (🔐) no menu lateral
   - Adicione as variáveis:
     - `DISCORD_TOKEN`
     - `CLIENT_ID`
     - `SPOTIFY_CLIENT_ID`
     - `SPOTIFY_CLIENT_SECRET`

4. **Rodar o bot**
   - Clique em "Run"
   - Aguarde instalar dependências

### ⚠️ Manter o bot online

Para manter o bot online 24/7 no free tier:
- Use um pinger externo (UptimeRobot, cron-job.org)
- Configure para fazer ping a cada 5 min

---

## 🖥️ VPS (DigitalOcean)

**Preço**: $6/mês (Droplet básico)
- **Uptime**: 99.9%
- **Facilidade**: ⭐⭐⭐ (mais técnico)
- **Controle**: Total

### Passo a Passo:

1. **Criar Droplet**
   - Acesse: https://www.digitalocean.com
   - Crie um Droplet Ubuntu 22.04
   - Escolha o plano $6/mês

2. **Conectar via SSH**
   ```bash
   ssh root@seu_ip
   ```

3. **Instalar Node.js**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   node --version  # Verificar versão
   ```

4. **Instalar dependências**
   ```bash
   sudo apt-get update
   sudo apt-get install -y ffmpeg python3-pip
   pip3 install yt-dlp
   ```

5. **Clonar e configurar o bot**
   ```bash
   git clone seu_repositorio_url
   cd Bot-Spotify
   npm install
   ```

6. **Configurar .env**
   ```bash
   nano .env
   # Cole suas variáveis aqui
   ```

7. **Rodar com PM2 (mantém online)**
   ```bash
   sudo npm install -g pm2
   pm2 start index.js --name spotify-bot
   pm2 save
   pm2 startup
   ```

8. **Pronto!**
   - Seu bot está online 24/7
   - Use `pm2 logs` para ver logs
   - Use `pm2 restart spotify-bot` para reiniciar

---

## 🎯 Comparação Rápida

| Plataforma | Preço | Uptime | Facilidade | Melhor Para |
|------------|-------|--------|------------|-------------|
| **Railway** | $5/mês | 99.9% | ⭐⭐⭐⭐⭐ | Maioria |
| **Render** | Grátis | Variável | ⭐⭐⭐⭐ | Testes |
| **Replit** | Grátis | Variável | ⭐⭐⭐⭐⭐ | Iniciantes |
| **VPS** | $6/mês | 99.9% | ⭐⭐⭐ | Avançados |

---

## 🔧 Solução de Problemas

### Bot não sobe
- Verifique se todas as variáveis estão corretas
- Veja os logs da plataforma
- Confirme que o token do Discord está válido

### Bot fica offline
- Railway/Render: Veja os logs para erro
- Replit: Confirme que tem algo mantendo acordado
- VPS: Verifique com `pm2 status`

### Erro de áudio/ffmpeg
- No VPS: Reinstale ffmpeg
- Railway/Render: Já vem instalado automaticamente

### Não toca música
- Verifique se o bot está no canal de voz
- Confirme permissões do bot
- Veja logs para erros específicos

---

## 📞 Precisa de Ajuda?

- Veja os logs da plataforma
- Verifique se o Discord está fora de manutenção
- Confirme que o Spotify API está funcionando

---

**Recomendação Final**: Use **Railway** se possível. É a opção mais fácil e confiável! 🚀

