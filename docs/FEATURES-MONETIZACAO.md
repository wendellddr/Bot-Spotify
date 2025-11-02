# 💰 Features de Monetização - MusicMaestro

## 📋 Visão Geral

Diferentes formas de monetizar features específicas além do sistema de assinatura premium. Permite monetização granular e flexível.

## 🎯 Modelos de Monetização

### 1. 💎 Pay-Per-Use (Pagar por Uso)

Usuário paga apenas pelo que usa, sem assinatura.

#### Exemplos:
- **R$ 0,50 por busca avançada** (busca com mais opções)
- **R$ 1,00 por playlist grande** (adicionar 50+ músicas de uma vez)
- **R$ 2,00 por qualidade HD** (por música)
- **R$ 3,00 por remoção de limite** (desbloquear uma vez)

#### Implementação:
```javascript
// Exemplo: Busca Avançada
async function advancedSearch(query, userId) {
    const cost = 0.50; // R$ 0,50
    
    // Verificar saldo/creditos
    if (!hasCredits(userId, cost)) {
        return 'Você precisa de créditos para usar busca avançada. Use /buy credits';
    }
    
    // Debitar créditos
    deductCredits(userId, cost);
    
    // Executar busca avançada (mais resultados, mais rápido)
    return await searchSpotify(query, { limit: 50, priority: true });
}
```

### 2. 🪙 Sistema de Créditos

Usuários compram créditos e gastam conforme usam.

#### Estrutura:
- **R$ 5,00 = 100 créditos**
- **R$ 10,00 = 220 créditos** (10% bônus)
- **R$ 20,00 = 480 créditos** (20% bônus)
- **R$ 50,00 = 1300 créditos** (30% bônus)

#### Custo por Feature:
- Busca básica: 1 crédito
- Busca avançada: 5 créditos
- Adicionar à fila: 2 créditos por música
- Playlist salva: 10 créditos
- Qualidade HD: 3 créditos por música
- Estatísticas: 2 créditos

#### Implementação:
```javascript
// Comando /credits
{
    name: 'credits',
    description: 'Ver seus créditos ou comprar mais',
    options: [
        {
            name: 'buy',
            type: 'SUB_COMMAND',
            options: [
                { name: 'amount', type: 'INTEGER', choices: [100, 220, 480, 1300] }
            ]
        }
    ]
}

// Verificação de créditos
function hasCredits(userId, amount) {
    const user = getUserData(userId);
    return user.credits >= amount;
}

// Debitar créditos
function deductCredits(userId, amount) {
    const user = getUserData(userId);
    user.credits -= amount;
    saveUserData(userId, user);
}
```

### 3. 🎁 Features Unlock (Desbloqueio Permanente)

Usuário compra uma feature específica para sempre.

#### Opções:
- **Playlist System: R$ 15,00** (desbloqueia para sempre)
- **Estatísticas Avançadas: R$ 10,00**
- **Quality HD: R$ 20,00**
- **Comandos Avançados: R$ 25,00**
- **Pacote Completo: R$ 50,00** (todas as features)

#### Implementação:
```javascript
const UNLOCKED_FEATURES = {
    'playlist': 15.00,
    'stats': 10.00,
    'hd_quality': 20.00,
    'advanced_commands': 25.00,
    'all': 50.00 // Pacote completo com desconto
};

// Verificar se feature está desbloqueada
function hasFeatureUnlocked(userId, feature) {
    const user = getUserData(userId);
    
    if (user.unlocked_features.includes('all')) {
        return true; // Tem tudo desbloqueado
    }
    
    return user.unlocked_features.includes(feature);
}

// Desbloquear feature
async function unlockFeature(userId, feature) {
    // Processar pagamento
    const payment = await processPayment(userId, UNLOCKED_FEATURES[feature]);
    
    if (payment.success) {
        const user = getUserData(userId);
        user.unlocked_features.push(feature);
        saveUserData(userId, user);
        return true;
    }
    return false;
}
```

### 4. 🎫 Tickets/Vouchers (Sistema de Tickets)

Usuários compram tickets que podem usar em várias features.

#### Exemplos:
- **10 Tickets: R$ 5,00**
- **25 Tickets: R$ 10,00** (melhor custo)
- **50 Tickets: R$ 18,00**
- **100 Tickets: R$ 30,00**

#### Uso de Tickets:
- Busca avançada: 2 tickets
- Adicionar 10 músicas: 1 ticket
- Playlist temporária: 3 tickets
- Estatísticas: 1 ticket
- Quality boost: 2 tickets

### 5. 🏆 Sistema de Servidor Premium

Premium por servidor Discord, não por usuário.

#### Planos:
- **Servidor Bronze: R$ 29,90/mês**
  - 50 usuários podem usar features premium
  - Fila de 100 músicas
  - 5 playlists do servidor

- **Servidor Prata: R$ 59,90/mês**
  - Todos os usuários têm acesso
  - Fila ilimitada
  - 20 playlists do servidor
  - Estatísticas do servidor

- **Servidor Ouro: R$ 99,90/mês**
  - Tudo do Prata
  - Canais dedicados para música
  - Suporte prioritário
  - Features customizadas

#### Implementação:
```javascript
function isServerPremium(guildId) {
    const server = getServerData(guildId);
    
    if (!server.premium) return false;
    if (Date.now() > server.premium_expires_at) {
        removeServerPremium(guildId);
        return false;
    }
    
    return {
        tier: server.premium_tier,
        limits: SERVER_TIER_LIMITS[server.premium_tier]
    };
}

// Aplicar limites por servidor
function canAddToQueue(guildId, currentSize) {
    const serverPremium = isServerPremium(guildId);
    
    if (serverPremium && serverPremium.limits.maxQueue === Infinity) {
        return true;
    }
    
    const limit = serverPremium ? 
        serverPremium.limits.maxQueue : 
        FREE_SERVER_LIMITS.maxQueue;
    
    return currentSize < limit;
}
```

### 6. 📺 Anúncios e Sponsorships

Modelo freemium com anúncios.

#### Opções:
- **Versão com anúncios: Gratuita**
  - Banner no embed a cada 5 músicas
  - Mensagem promocional ocasional
  - Link de patrocínio no footer

- **Versão sem anúncios: R$ 4,99/mês**
  - Remove todos os anúncios
  - Experiência limpa

#### Implementação:
```javascript
let adCounter = new Map(); // Contador por usuário

function shouldShowAd(userId) {
    const count = adCounter.get(userId) || 0;
    
    if (isPremium(userId)) {
        return false; // Premium não vê anúncios
    }
    
    if (count >= 5) {
        adCounter.set(userId, 0);
        return true;
    }
    
    adCounter.set(userId, count + 1);
    return false;
}

function createAdEmbed() {
    return new EmbedBuilder()
        .setTitle('📢 Patrocinado')
        .setDescription('Conheça nossos parceiros!')
        .setColor(0x00FF00)
        .addFields({
            name: 'Serviço X',
            value: '[Clique aqui para conhecer](https://...)',
            inline: false
        });
}
```

### 7. 🎁 Gift System (Sistema de Presentes)

Usuários podem presentear premium/features para outros.

#### Exemplos:
- Presentear 1 mês de premium: R$ 19,90
- Presentear pacote de créditos: Preço normal + opção de presente
- Presentear feature unlock: Preço normal + opção de presente

#### Implementação:
```javascript
// Comando /gift
{
    name: 'gift',
    description: 'Presentear premium ou features',
    options: [
        {
            name: 'type',
            type: 'STRING',
            choices: ['premium', 'credits', 'feature'],
            required: true
        },
        {
            name: 'user',
            type: 'USER',
            description: 'Usuário para presentear',
            required: true
        },
        {
            name: 'amount',
            type: 'INTEGER',
            description: 'Quantidade (dias/creditos)',
            required: false
        }
    ]
}

async function giftPremium(giverId, receiverId, days) {
    // Processar pagamento do giver
    const payment = await processPayment(giverId, calculatePrice(days));
    
    if (payment.success) {
        // Ativar premium para o receiver
        await grantPremium(receiverId, days);
        
        // Notificar ambos
        notifyUser(giverId, `Você presenteou ${days} dias de premium!`);
        notifyUser(receiverId, `Você recebeu ${days} dias de premium de presente! 🎁`);
        
        return true;
    }
    return false;
}
```

### 8. 🏅 Achievements com Rewards

Sistema de conquistas que podem ser monetizadas.

#### Exemplos:
- **"Ouviu 100 músicas"** → Ganha 50 créditos grátis
- **"Usou 7 dias seguidos"** → Ganha 1 dia de premium
- **"Top listener do mês"** → Ganha 1 mês premium grátis

#### Monetização:
- Usuários podem comprar achievements específicos
- Ou ganhar através de gameplay normal

### 9. 🎨 Customizações Premium

Features visuais e de personalização.

#### Opções:
- **Cores personalizadas do bot: R$ 5,00**
- **Embed customizado: R$ 10,00**
- **Cargo especial no Discord: R$ 15,00**
- **Comando personalizado: R$ 20,00**
- **Prefix customizado: R$ 8,00**

### 10. 💼 B2B (Business to Business)

Vender para servidores comerciais.

#### Planos Empresariais:
- **Plano Básico Empresarial: R$ 199/mês**
  - Até 500 usuários simultâneos
  - Suporte dedicado
  - SLA garantido
  - Dashboard de analytics

- **Plano Enterprise: R$ 499/mês**
  - Usuários ilimitados
  - Suporte 24/7
  - Integração customizada
  - White-label (sem branding)

## 💻 Estrutura de Implementação

### Arquivos Necessários:

```
projeto/
├── monetization/
│   ├── credits/
│   │   ├── credits-manager.js
│   │   ├── credits-commands.js
│   │   └── credits-payment.js
│   ├── unlocks/
│   │   ├── unlock-manager.js
│   │   └── unlock-commands.js
│   ├── server-premium/
│   │   └── server-premium.js
│   ├── ads/
│   │   └── ad-system.js
│   └── payments/
│       ├── payment-processor.js
│       ├── webhook-handler.js
│       └── payment-providers.js
```

### Exemplo de Integração no Comando /play:

```javascript
if (commandName === 'play') {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    
    // Verificar limites baseado no sistema escolhido
    const limits = getLimits(userId, guildId);
    
    // Aplicar limites
    if (queue.size >= limits.maxQueue) {
        // Opção 1: Bloquear e pedir upgrade
        if (limits.canUpgrade) {
            return await interaction.reply({
                content: `❌ Fila cheia! Limite: ${limits.maxQueue} músicas.`,
                components: [createUpgradeButton()]
            });
        }
        
        // Opção 2: Oferecer adicionar por créditos
        return await interaction.reply({
            content: `❌ Fila cheia! Use créditos para adicionar mais músicas.`,
            components: [createCreditsButton()]
        });
    }
    
    // Continuar com reprodução normal...
}
```

## 📊 Dashboard de Analytics

Monitore o sucesso de cada feature:

- Conversão por feature
- Revenue por modelo
- Feature mais popular
- Churn rate
- Lifetime Value (LTV)

## 🎯 Recomendações

### Para Começar:
1. **Sistema de Créditos** - Mais flexível, fácil de implementar
2. **Server Premium** - Melhor ROI, mais fácil de vender
3. **Features Unlock** - Valor percebido alto

### Para Escalar:
1. Combine modelos (créditos + premium)
2. Ofereça bundles (compre 3, leve 1)
3. Programa de fidelidade
4. Descontos sazonais

## ⚖️ Considerações Legais

- ✅ Termos claros sobre o que é pago
- ✅ Política de reembolso transparente
- ✅ Não fazer "pay to win" excessivo
- ✅ Manter versão gratuita funcional
- ✅ Conformidade com LGPD/GDPR

## 💡 Estratégias de Marketing

- **Trial grátis**: 3 dias de premium grátis
- **Primeiro mês 50% off**
- **Programa de referência**: Ganhe R$ 5 por indicação
- **Promoções sazonais**: Black Friday, Natal, etc.
- **Community rewards**: Atividades na comunidade ganham créditos

---

**Resumo**: Escolha o modelo que melhor se adapta ao seu público. O sistema de créditos é mais flexível, enquanto server premium tem melhor retenção.

