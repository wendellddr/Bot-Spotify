# 🚂 Deploy no Railway - Guia Simplificado

> **⏱️ Tempo**: 10 minutos
> **💰 Custo**: $5/mês grátis (precisa de cartão)
> **🎯 Dificuldade**: ⭐⭐ (Fácil)

---

## ⚡ Boa Notícia: Seu Bot Já Está Otimizado!

**Seu bot já tem economia automática de recursos configurada:**

✅ Não entra em canal vazio (verificação prévia)  
✅ Sai do canal quando vazio (15s quando todos saem)  
✅ Sai quando termina de tocar (2 min sem músicas)  
✅ Cache inteligente (5 min de TTL)  
✅ Limpeza automática de memória  
✅ Limite de cache para não consumir muito  
✅ Timeouts para evitar travamentos  

**🎉 Isso significa:** Você vai economizar $5/mês da Railway facilmente! O bot usa o mínimo de recursos possível.

---

## ✅ Passo a Passo Visual

### **1️⃣ Preparar o Repositório**

1. **Crie um repositório no GitHub** (se ainda não tiver):
   - Acesse: https://github.com/new
   - Nome: `MusicMaestro` (ou o que preferir)
   - Selecione "Public" ou "Private"
   - Clique em "Create repository"

2. **Upload do código no GitHub**:

   No terminal/PowerShell na pasta do projeto:

   ```bash
   # Inicializar git (se ainda não fez)
   git init
   
   # Adicionar tudo
   git add .
   
   # Fazer commit
   git commit -m "Primeiro commit"
   
   # Adicionar remote do GitHub (substitua pela sua URL)
   git remote add origin https://github.com/SEU_USUARIO/MusicMaestro.git
   
   # Enviar para o GitHub
   git branch -M main
   git push -u origin main
   ```

   > 💡 **Dica**: Se não tem Git configurado:
   > ```bash
   > git config --global user.name "Seu Nome"
   > git config --global user.email "seu@email.com"
   > ```

---

### **2️⃣ Configurar Railway**

1. **Criar conta**
   - Acesse: https://railway.app
   - Clique em "Login with GitHub"
   - Autorize o Railway

2. **Criar projeto**
   - Clique em **"New Project"**
   - Escolha **"Deploy from GitHub repo"**
   - Selecione seu repositório `MusicMaestro`

3. **Aguardar detecção**
   - Railway vai detectar automaticamente que é Node.js
   - Vai iniciar o build automaticamente
   - ⏳ Aguarde 2-3 minutos

---

### **3️⃣ Adicionar Variáveis de Ambiente**

1. No projeto, clique em **"Variables"** (menu lateral)

2. Clique em **"+ New Variable"**

3. Adicione CADA variável clicando em "+ New Variable":

   | Nome da Variável | Valor |
   |------------------|-------|
   | `DISCORD_TOKEN` | Cole o token do Discord |
   | `CLIENT_ID` | Cole o Client ID do Discord |
   | `SPOTIFY_CLIENT_ID` | Cole o Spotify Client ID |
   | `SPOTIFY_CLIENT_SECRET` | Cole o Spotify Client Secret |

   > ⚠️ **ATENÇÃO**: Sem aspas! Só o valor mesmo.

4. Depois de adicionar todas as 4, o bot **vai reiniciar automaticamente**

---

### **4️⃣ Verificar se Está Funcionando**

1. Clique em **"Deployments"** no menu
2. Clique no deploy mais recente
3. Clique em **"Logs"** 
4. Procure por:
   ```
   ✅ Bot iniciado com sucesso!
   ✅ Logado como: NomeDoBot#1234
   ```

5. **Teste no Discord**:
   - Use `/play` em um canal de voz
   - Se funcionar = **SUCESSO!** 🎉

---

## 🔍 Ver Logs e Debug

### Ver Logs em Tempo Real

```
Railway Dashboard → Seu Projeto → Deployments → Mais Recente → Logs
```

### Comandos Úteis

- **Ver logs**: Clique em "Logs" no deploy
- **Reiniciar**: Railway → Settings → Redeploy
- **Atualizar código**: Faça git push, Railway faz deploy automático

---

## 💸 Custos e Limites

### Free Tier do Railway

- **$5 grátis por mês** (renew mensalmente)
- **500 horas de uso/mês** (mais que suficiente)
- **Gratuito para sempre** se não passar de $5

### Monitorar Uso

```
Railway → Settings → Usage
```

---

## ⚠️ Problemas Comuns

### ❌ "Bot não inicia"

**Solução**:
1. Verifique se todas as 4 variáveis estão corretas
2. Veja os logs para o erro específico
3. Confirme que o `.env` local está funcionando primeiro

### ❌ "Erro de build"

**Solução**:
1. Verifique que o `package.json` está correto
2. Veja os logs de build
3. Confirme que tem o arquivo `nixpacks.toml` na raiz

### ❌ "Bot offline no Discord"

**Solução**:
1. Verifique o `DISCORD_TOKEN` (copiar e colar de novo)
2. Veja logs do Railway
3. Confirme que o bot ainda existe no Discord Developer Portal

### ❌ "Não toca música"

**Solução**:
1. Veja logs para erros de áudio
2. Confirme que o `ffmpeg` está instalado (Railway instala automaticamente)
3. Teste comandos básicos primeiro

---

## 🔄 Atualizar o Bot

Quando quiser adicionar novos recursos:

```bash
# Na sua máquina local
git add .
git commit -m "Adicionar novo recurso"
git push

# Railway faz deploy automático em 1-2 minutos!
```

---

## 📊 Status do Deploy

### ✅ Tudo OK

Os logs mostram:
```
✅ Bot iniciado com sucesso!
✅ Logado como: SeuBot#1234
🎵 Bot pronto para tocar música!
```

### ⚠️ Avisos (Normal)

Alguns warnings são normais e não afetam o funcionamento:
- Deprecation warnings
- Buffer warnings
- Process warnings

---

## 🎉 Pronto!

Seu bot está online 24/7! 🚀

### O que você ganhou:

- ✅ Bot sempre online
- ✅ Deploy automático ao fazer git push
- ✅ Logs em tempo real
- ✅ Monitoramento de uso
- ✅ Custo zero (até $5/mês)

### Próximos passos:

1. Convide para outros servidores
2. Adicione novos recursos
3. Compartilhe com amigos!

---

## 📞 Precisa de Ajuda?

1. Veja os **logs** primeiro
2. Confira a **documentação oficial**: https://docs.railway.app
3. Veja o arquivo **[DEPLOY.md](DEPLOY.md)** para outras plataformas

---

**🎵 Divirta-se com seu bot online!**

