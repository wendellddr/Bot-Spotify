# 💎 Sistema Premium - MusicMaestro

## 📋 Visão Geral

Sistema de assinaturas premium que oferece recursos avançados para usuários que desejam uma experiência musical melhor no Discord.

## 🎯 Features Premium vs Gratuito

### ✅ Versão Gratuita (Free)
- ✅ Reprodução de música básica
- ✅ Fila de até 20 músicas
- ✅ Comandos básicos (play, skip, pause, etc.)
- ✅ Busca no Spotify
- ✅ Menu de seleção (até 5 opções)

### 💎 Versão Premium (Pago)
- 💎 Fila ilimitada
- 💎 Prioridade de busca (mais rápido)
- 💎 Qualidade de áudio superior
- 💎 Estatísticas personalizadas
- 💎 Playlists salvas
- 💎 Comandos avançados exclusivos
- 💎 Suporte prioritário
- 💎 Menos anúncios (se houver)
- 💎 Acesso beta a novas features

## 💰 Planos de Assinatura

### 🥉 Básico - R$ 9,90/mês
- Fila até 50 músicas
- Qualidade padrão
- 3 playlists salvas

### 🥈 Premium - R$ 19,90/mês
- Fila ilimitada
- Qualidade alta
- 10 playlists salvas
- Estatísticas básicas
- Prioridade de busca

### 🥇 VIP - R$ 39,90/mês
- Tudo do Premium
- Qualidade máxima (HD)
- Playlists ilimitadas
- Estatísticas avançadas
- Features beta exclusivas
- Suporte prioritário

## 🏗️ Arquitetura Técnica

### 1. Armazenamento de Dados

**Opção A: Banco de Dados SQLite (Simples)**
```javascript
// Estrutura básica
const premiumUsers = new Map(); // Cache em memória
const db = require('better-sqlite3')('premium.db');

// Tabela
CREATE TABLE premium_users (
    user_id TEXT PRIMARY KEY,
    guild_id TEXT,
    tier TEXT, // 'basic', 'premium', 'vip'
    expires_at INTEGER, // timestamp
    payment_id TEXT,
    created_at INTEGER
);
```

**Opção B: JSON File (Ainda mais simples)**
```json
{
  "user_id": {
    "guild_id": "123456789",
    "tier": "premium",
    "expires_at": 1735689600000,
    "payment_id": "pay_xxx"
  }
}
```

### 2. Sistema de Verificação

```javascript
// Função para verificar se usuário é premium
function isPremium(userId, guildId) {
    const userData = getPremiumData(userId);
    if (!userData) return false;
    
    // Verificar se está no servidor correto (se aplicável)
    if (userData.guild_id && userData.guild_id !== guildId) {
        return false;
    }
    
    // Verificar se não expirou
    if (Date.now() > userData.expires_at) {
        removePremium(userId);
        return false;
    }
    
    return {
        tier: userData.tier,
        valid: true
    };
}
```

### 3. Limites por Tier

```javascript
const TIER_LIMITS = {
    free: {
        maxQueue: 20,
        maxPlaylists: 0,
        audioQuality: 'standard',
        searchPriority: false
    },
    basic: {
        maxQueue: 50,
        maxPlaylists: 3,
        audioQuality: 'standard',
        searchPriority: false
    },
    premium: {
        maxQueue: Infinity,
        maxPlaylists: 10,
        audioQuality: 'high',
        searchPriority: true
    },
    vip: {
        maxQueue: Infinity,
        maxPlaylists: Infinity,
        audioQuality: 'hd',
        searchPriority: true,
        betaFeatures: true
    }
};
```

## 🔗 Integração com Pagamento

### Opção 1: PayPal (Mais Popular)
```javascript
// Usar PayPal SDK ou API
const paypal = require('@paypal/checkout-server-sdk');

// Criar assinatura recorrente
async function createPayPalSubscription(tier, userId) {
    // Configurar subscription
    // Retornar link de pagamento
    // Webhook para confirmar pagamento
}
```

### Opção 2: Stripe (Mais Profissional)
```javascript
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Criar subscription
async function createStripeSubscription(tier, userId) {
    const priceId = TIER_PRICE_IDS[tier];
    const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
    });
    return subscription;
}
```

### Opção 3: Mercado Pago (Brasil)
```javascript
const mercadopago = require('mercadopago');
mercadopago.configurations.setAccessToken(process.env.MP_ACCESS_TOKEN);

// Criar preferência de pagamento
async function createMPSubscription(tier, userId) {
    // Configurar pagamento recorrente
}
```

### Opção 4: Manual (Mais Simples)
- Receber pagamento via PIX/Transferência
- Usuário envia comprovante
- Você ativa manualmente ou via comando admin

## 🎮 Comandos Premium

### Comandos do Usuário

```javascript
// /premium - Ver status premium
/premium info - Mostra seu tier atual e quando expira

// /premium subscribe - Link para assinar
/premium subscribe tier: premium

// /playlist save - Salvar playlist (premium)
/playlist save nome: "Minhas Favoritas"

// /playlist load - Carregar playlist (premium)
/playlist load nome: "Minhas Favoritas"
```

### Comandos Admin

```javascript
// /premium grant - Dar premium a usuário (admin)
/premium grant usuario: @user tier: premium dias: 30

// /premium revoke - Remover premium (admin)
/premium revoke usuario: @user

// /premium list - Listar usuários premium (admin)
/premium list
```

## 📊 Sistema de Estatísticas (Premium)

```javascript
// Comandos
/stats - Estatísticas pessoais
/stats top - Top músicas tocadas
/stats artistas - Artistas mais ouvidos
/stats tempo - Tempo total ouvindo

// Dados armazenados
{
  "user_id": {
    "total_songs": 150,
    "total_time": 3600000, // ms
    "top_songs": [...],
    "top_artists": [...],
    "playlists": [...]
  }
}
```

## 🔐 Segurança

### Proteção Contra Fraude
- Verificação de pagamento via webhook
- Validação de assinatura ativa
- Rate limiting para comandos premium
- Logs de ações premium

### Dados Sensíveis
- Criptografar dados de pagamento
- Não armazenar tokens de cartão
- Usar webhooks seguros
- Validar todas as requisições

## 💻 Estrutura de Arquivos

```
projeto/
├── premium/
│   ├── database.js         # Gerenciamento de DB
│   ├── verification.js      # Verificação de status
│   ├── payment.js          # Integração de pagamento
│   ├── limits.js           # Aplicação de limites
│   └── commands/           # Comandos premium
│       ├── premium.js
│       ├── playlist.js
│       └── stats.js
└── config/
    └── premium-config.js   # Configurações
```

## 🚀 Implementação Passo a Passo

### Fase 1: Base (Semana 1)
1. ✅ Criar sistema de armazenamento (SQLite/JSON)
2. ✅ Função de verificação de premium
3. ✅ Comando `/premium info`
4. ✅ Aplicar limites básicos (fila, playlists)

### Fase 2: Pagamento (Semana 2)
1. ✅ Integrar sistema de pagamento (PayPal/Stripe)
2. ✅ Webhook para confirmação
3. ✅ Comando `/premium subscribe`
4. ✅ Ativação automática após pagamento

### Fase 3: Features (Semana 3-4)
1. ✅ Sistema de playlists
2. ✅ Estatísticas
3. ✅ Qualidade de áudio ajustável
4. ✅ Prioridade de busca

### Fase 4: Admin (Semana 5)
1. ✅ Comandos admin para gerenciar premium
2. ✅ Dashboard web (opcional)
3. ✅ Relatórios e analytics

## 📈 Métricas de Sucesso

- Taxa de conversão: % free → premium
- Retenção: % que renova mensalmente
- Churn: % que cancela
- ARPU: Receita média por usuário
- Features mais usadas

## ⚖️ Considerações Legais

- ✅ Termos de Serviço claros
- ✅ Política de Privacidade
- ✅ Política de Reembolso
- ✅ Conformidade com LGPD (Brasil)
- ✅ Conformidade com GDPR (Europa)

## 💡 Dicas de Marketing

- Período de trial gratuito (7 dias)
- Desconto para primeiros usuários
- Programa de referência (ganhe 1 mês indicando)
- Features beta exclusivas para VIPs
- Comunidade premium (cargo especial no Discord)

## 🎯 Exemplo de Código Base

```javascript
// premium/verification.js
const premiumDB = require('./database');

async function checkPremium(userId, guildId) {
    const data = await premiumDB.getUser(userId);
    
    if (!data) return { premium: false, tier: 'free' };
    
    if (Date.now() > data.expires_at) {
        await premiumDB.removeUser(userId);
        return { premium: false, tier: 'free' };
    }
    
    return {
        premium: true,
        tier: data.tier,
        expiresAt: data.expires_at,
        limits: TIER_LIMITS[data.tier]
    };
}

function canAddToQueue(userId, currentQueueSize) {
    const { premium, tier, limits } = checkPremium(userId);
    if (limits.maxQueue === Infinity) return true;
    return currentQueueSize < limits.maxQueue;
}
```

---

**Nota:** Este é um guia completo. A implementação real dependerá das suas necessidades específicas e do sistema de pagamento escolhido.

