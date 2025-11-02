# 💳 Integração com Serviços de Pagamento - MusicMaestro

## 📋 Visão Geral

Guia completo para integrar diferentes serviços de pagamento ao bot, permitindo que usuários comprem premium, créditos e features.

## 🎯 Serviços de Pagamento Disponíveis

### Para Brasil
1. **Mercado Pago** (Mais popular no Brasil)
2. **Stripe** (Internacional, aceita BRL)
3. **PayPal** (Internacional)
4. **PicPay** (Brasil)
5. **PIX Manual** (Sem integração automática)

### Internacionais
1. **Stripe** (Recomendado)
2. **PayPal**
3. **Square**
4. **Razorpay** (Índia)

## 🔧 Implementação Detalhada

### 1. Mercado Pago (Recomendado para Brasil)

#### Por que escolher?
- ✅ Mais popular no Brasil
- ✅ Aceita cartão, PIX, boleto
- ✅ Taxa: ~4.99% + R$ 0,39 por transação
- ✅ API fácil de usar
- ✅ Webhooks para confirmação automática

#### Instalação:
```bash
npm install mercadopago
```

#### Configuração:
```javascript
// payment/mercadopago.js
const mercadopago = require('mercadopago');

// Configurar access token (do seu painel Mercado Pago)
mercadopago.configurations.setAccessToken(process.env.MP_ACCESS_TOKEN);

// Criar preferência de pagamento
async function createMercadoPagoPayment(userId, amount, description, itemId) {
    const preference = {
        items: [
            {
                title: description,
                quantity: 1,
                currency_id: 'BRL',
                unit_price: amount
            }
        ],
        payer: {
            email: 'user@example.com' // Você pode pedir o email do usuário
        },
        back_urls: {
            success: `${process.env.BOT_URL}/payment/success`,
            failure: `${process.env.BOT_URL}/payment/failure`,
            pending: `${process.env.BOT_URL}/payment/pending`
        },
        auto_return: 'approved',
        external_reference: `${userId}_${itemId}_${Date.now()}`,
        notification_url: `${process.env.BOT_URL}/webhook/mercadopago`
    };

    try {
        const response = await mercadopago.preferences.create(preference);
        return {
            success: true,
            payment_url: response.body.init_point,
            payment_id: response.body.id,
            qr_code: response.body.qr_code // Para PIX
        };
    } catch (error) {
        console.error('Erro Mercado Pago:', error);
        return { success: false, error: error.message };
    }
}

// Webhook handler (recebe notificações do Mercado Pago)
async function handleMercadoPagoWebhook(paymentId) {
    try {
        const payment = await mercadopago.payment.findById(paymentId);
        
        if (payment.body.status === 'approved') {
            const externalRef = payment.body.external_reference;
            const [userId, itemId] = externalRef.split('_');
            
            // Ativar premium/feature para o usuário
            await processPaymentSuccess(userId, itemId, payment.body);
            return { success: true };
        }
        
        return { success: false, status: payment.body.status };
    } catch (error) {
        console.error('Erro ao processar webhook:', error);
        return { success: false, error: error.message };
    }
}
```

#### Comando no Bot:
```javascript
// Comando /buy premium
if (commandName === 'buy') {
    const type = interaction.options.getString('type'); // 'premium', 'credits', etc
    const amount = interaction.options.getInteger('amount'); // dias, quantidade
    
    // Calcular preço
    const price = calculatePrice(type, amount);
    
    // Criar pagamento
    const payment = await createMercadoPagoPayment(
        interaction.user.id,
        price,
        `${type} - ${amount}`,
        `${type}_${amount}`
    );
    
    if (payment.success) {
        // Criar embed com link de pagamento
        const embed = new EmbedBuilder()
            .setTitle('💳 Pagamento - Mercado Pago')
            .setDescription(`**Total: R$ ${price.toFixed(2)}**\n\nClique no botão abaixo para pagar:`)
            .setColor(0x00AEEF)
            .addFields({
                name: '📱 Formas de Pagamento',
                value: '• Cartão de Crédito\n• PIX (Aprovação instantânea)\n• Boleto',
                inline: false
            })
            .setFooter({ text: 'Após o pagamento, você receberá automaticamente!' })
            .setTimestamp();
        
        const button = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setLabel('Pagar Agora')
                    .setURL(payment.payment_url)
                    .setStyle(ButtonStyle.Link)
            );
        
        // Se tiver QR Code PIX, mostrar também
        if (payment.qr_code) {
            embed.setImage(payment.qr_code);
        }
        
        await interaction.reply({
            embeds: [embed],
            components: [button],
            ephemeral: true
        });
    }
}
```

### 2. Stripe (Internacional, aceita BRL)

#### Por que escolher?
- ✅ Aceita cartão de crédito internacional
- ✅ Taxa: 3.4% + R$ 0,40
- ✅ Mais seguro
- ✅ Melhor para pagamentos recorrentes
- ✅ Dashboard profissional

#### Instalação:
```bash
npm install stripe
```

#### Configuração:
```javascript
// payment/stripe.js
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Criar checkout session
async function createStripePayment(userId, amount, description, itemId) {
    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'brl',
                        product_data: {
                            name: description,
                        },
                        unit_amount: Math.round(amount * 100), // Stripe usa centavos
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: `${process.env.BOT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.BOT_URL}/payment/cancel`,
            metadata: {
                user_id: userId,
                item_id: itemId,
                type: 'premium_purchase'
            },
        });

        return {
            success: true,
            payment_url: session.url,
            session_id: session.id
        };
    } catch (error) {
        console.error('Erro Stripe:', error);
        return { success: false, error: error.message };
    }
}

// Webhook handler
async function handleStripeWebhook(event) {
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const { user_id, item_id, type } = session.metadata;
        
        // Processar pagamento
        await processPaymentSuccess(userId, itemId, session);
        return { success: true };
    }
    
    return { success: false };
}

// Para pagamentos recorrentes (assinaturas)
async function createStripeSubscription(userId, priceId) {
    try {
        // Criar ou buscar customer
        let customer = await findOrCreateStripeCustomer(userId);
        
        const subscription = await stripe.subscriptions.create({
            customer: customer.id,
            items: [{ price: priceId }],
            metadata: {
                user_id: userId
            }
        });

        return {
            success: true,
            subscription_id: subscription.id,
            client_secret: subscription.latest_invoice.payment_intent.client_secret
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}
```

### 3. PayPal (Internacional)

#### Por que escolher?
- ✅ Muito popular internacionalmente
- ✅ Aceita cartão sem conta PayPal
- ✅ Taxa: 3.4% + fixo por país
- ✅ Fácil de integrar

#### Instalação:
```bash
npm install @paypal/checkout-server-sdk
```

#### Configuração:
```javascript
// payment/paypal.js
const paypal = require('@paypal/checkout-server-sdk');

// Configurar ambiente
function paypalClient() {
    const environment = new paypal.core.SandboxEnvironment(
        process.env.PAYPAL_CLIENT_ID,
        process.env.PAYPAL_CLIENT_SECRET
    );
    
    // Para produção, use LiveEnvironment
    // const environment = new paypal.core.LiveEnvironment(...)
    
    return new paypal.core.PayPalHttpClient(environment);
}

// Criar ordem de pagamento
async function createPayPalOrder(userId, amount, description, itemId) {
    const client = paypalClient();
    const request = new paypal.orders.OrdersCreateRequest();
    
    request.prefer("return=representation");
    request.requestBody({
        intent: 'CAPTURE',
        purchase_units: [{
            amount: {
                currency_code: 'BRL',
                value: amount.toFixed(2)
            },
            description: description,
            custom_id: `${userId}_${itemId}`
        }],
        application_context: {
            return_url: `${process.env.BOT_URL}/payment/success`,
            cancel_url: `${process.env.BOT_URL}/payment/cancel`
        }
    });

    try {
        const order = await client.execute(request);
        return {
            success: true,
            order_id: order.result.id,
            approval_url: order.result.links.find(link => link.rel === 'approve').href
        };
    } catch (error) {
        console.error('Erro PayPal:', error);
        return { success: false, error: error.message };
    }
}

// Capturar pagamento após aprovação
async function capturePayPalOrder(orderId) {
    const client = paypalClient();
    const request = new paypal.orders.OrdersCaptureRequest(orderId);
    request.requestBody({});

    try {
        const order = await client.execute(request);
        
        if (order.result.status === 'COMPLETED') {
            const customId = order.result.purchase_units[0].payments.captures[0].custom_id;
            const [userId, itemId] = customId.split('_');
            
            await processPaymentSuccess(userId, itemId, order.result);
            return { success: true };
        }
        
        return { success: false };
    } catch (error) {
        return { success: false, error: error.message };
    }
}
```

### 4. PIX Manual (Sem API)

#### Como funciona:
- Usuário solicita pagamento
- Bot gera código PIX ou chave
- Usuário paga manualmente
- Você verifica e ativa manualmente (ou via comando admin)

#### Implementação:
```javascript
// payment/pix-manual.js

// Gerar dados PIX
function generatePixPayment(amount, description) {
    const pixKey = process.env.PIX_KEY; // Sua chave PIX
    const merchantName = 'MusicMaestro';
    const transactionId = `MM${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
    
    // Criar código PIX copia e cola
    const pixCode = createPixCode(pixKey, amount, merchantName, description, transactionId);
    
    return {
        pix_code: pixCode,
        qr_code: generateQRCode(pixCode), // Você precisa de uma lib para QR code
        transaction_id: transactionId,
        amount: amount,
        expires_in: 30 * 60 * 1000 // 30 minutos
    };
}

// Comando no bot
if (commandName === 'buy') {
    const type = interaction.options.getString('type');
    const amount = interaction.options.getInteger('amount');
    const price = calculatePrice(type, amount);
    
    // Gerar PIX
    const pixData = generatePixPayment(price, `${type} - ${amount}`);
    
    // Salvar pedido pendente
    savePendingOrder(interaction.user.id, {
        type,
        amount,
        price,
        transaction_id: pixData.transaction_id,
        expires_at: Date.now() + pixData.expires_in
    });
    
    // Criar embed
    const embed = new EmbedBuilder()
        .setTitle('💰 Pagamento PIX')
        .setDescription(`**Valor: R$ ${price.toFixed(2)}**\n\nCopie o código PIX abaixo e pague no seu app bancário:`)
        .addFields({
            name: '📋 Código PIX (Copiar)',
            value: `\`\`\`${pixData.pix_code}\`\`\``,
            inline: false
        })
        .setImage(pixData.qr_code) // QR Code para escanear
        .setFooter({ text: `Após pagar, envie o comprovante ou use /payment verify ${pixData.transaction_id}` })
        .setColor(0x32CD32);
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
}

// Comando admin para verificar pagamento
if (commandName === 'payment' && isAdmin(interaction.user.id)) {
    const transactionId = interaction.options.getString('transaction_id');
    const order = getPendingOrder(transactionId);
    
    if (!order) {
        return await interaction.reply('❌ Pedido não encontrado');
    }
    
    // Você verifica manualmente e então ativa
    await processPaymentSuccess(order.user_id, order.type, order);
    deletePendingOrder(transactionId);
    
    await interaction.reply(`✅ Pagamento aprovado! Premium ativado para <@${order.user_id}>`);
}
```

## 🔄 Sistema de Webhooks

### Estrutura de Webhook:

```javascript
// server/webhook-server.js
const express = require('express');
const app = express();

app.use(express.json());

// Mercado Pago Webhook
app.post('/webhook/mercadopago', async (req, res) => {
    const { type, data } = req.body;
    
    if (type === 'payment') {
        const result = await handleMercadoPagoWebhook(data.id);
        res.status(200).send('OK');
    } else {
        res.status(200).send('OK');
    }
});

// Stripe Webhook (precisa de assinatura do Stripe)
app.post('/webhook/stripe', express.raw({type: 'application/json'}), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    
    await handleStripeWebhook(event);
    res.status(200).send('OK');
});

app.listen(3000, () => {
    console.log('Webhook server running on port 3000');
});
```

### Usar ngrok para desenvolvimento:

```bash
# Instalar ngrok
npm install -g ngrok

# Criar tunnel
ngrok http 3000

# Usar a URL gerada como webhook URL nos serviços de pagamento
```

## 📊 Processamento de Pagamento

### Função Central:

```javascript
// payment/processor.js
const paymentMethods = {
    'mercadopago': require('./mercadopago'),
    'stripe': require('./stripe'),
    'paypal': require('./paypal'),
    'pix': require('./pix-manual')
};

async function processPayment(userId, amount, type, itemId, method = 'mercadopago') {
    const paymentHandler = paymentMethods[method];
    
    if (!paymentHandler) {
        return { success: false, error: 'Método de pagamento inválido' };
    }
    
    const description = getDescription(type, itemId);
    return await paymentHandler.createPayment(userId, amount, description, itemId);
}

async function processPaymentSuccess(userId, itemId, paymentData) {
    // Extrair informações do pagamento
    const [type, amount] = itemId.split('_');
    
    // Ativar feature/premium
    switch (type) {
        case 'premium':
            await grantPremium(userId, parseInt(amount)); // amount = dias
            break;
        case 'credits':
            await addCredits(userId, parseInt(amount));
            break;
        case 'unlock':
            await unlockFeature(userId, amount);
            break;
    }
    
    // Salvar log de pagamento
    await logPayment({
        user_id: userId,
        item_id: itemId,
        amount: paymentData.amount || paymentData.transaction_amount,
        payment_id: paymentData.id,
        status: 'completed',
        timestamp: Date.now()
    });
    
    // Notificar usuário
    try {
        const user = await client.users.fetch(userId);
        await user.send({
            embeds: [new EmbedBuilder()
                .setTitle('✅ Pagamento Confirmado!')
                .setDescription(`Seu ${type} foi ativado com sucesso!`)
                .setColor(0x00FF00)
            ]
        });
    } catch (error) {
        console.error('Erro ao notificar usuário:', error);
    }
}
```

## 🎮 Comandos no Bot

```javascript
// Comando unificado de compra
const buyCommand = {
    name: 'buy',
    description: 'Comprar premium, créditos ou features',
    options: [
        {
            name: 'type',
            type: 'STRING',
            required: true,
            choices: [
                { name: 'Premium (1 mês)', value: 'premium_30' },
                { name: 'Premium (3 meses)', value: 'premium_90' },
                { name: '100 Créditos', value: 'credits_100' },
                { name: 'Playlists Unlock', value: 'unlock_playlist' }
            ]
        },
        {
            name: 'method',
            type: 'STRING',
            required: false,
            choices: [
                { name: 'Mercado Pago', value: 'mercadopago' },
                { name: 'Stripe', value: 'stripe' },
                { name: 'PayPal', value: 'paypal' },
                { name: 'PIX', value: 'pix' }
            ]
        }
    ]
};

// Handler do comando
if (commandName === 'buy') {
    const type = interaction.options.getString('type');
    const method = interaction.options.getString('method') || 'mercadopago';
    
    const [itemType, amount] = type.split('_');
    const price = calculatePrice(itemType, amount);
    
    const payment = await processPayment(
        interaction.user.id,
        price,
        itemType,
        type,
        method
    );
    
    if (payment.success) {
        // Criar embed de pagamento
        const embed = createPaymentEmbed(payment, price, type, method);
        await interaction.reply({ embeds: [embed], ephemeral: true });
    } else {
        await interaction.reply({
            content: `❌ Erro ao processar pagamento: ${payment.error}`,
            ephemeral: true
        });
    }
}
```

## 📱 Configuração de Variáveis de Ambiente

```env
# Mercado Pago
MP_ACCESS_TOKEN=seu_access_token_aqui
MP_PUBLIC_KEY=sua_public_key_aqui

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLIC_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# PayPal
PAYPAL_CLIENT_ID=seu_client_id
PAYPAL_CLIENT_SECRET=seu_client_secret
PAYPAL_MODE=sandbox # ou 'live' para produção

# PIX Manual
PIX_KEY=sua_chave_pix_aqui

# URL do Bot (para webhooks)
BOT_URL=https://seu-bot.com
```

## 🔒 Segurança

### Boas Práticas:

1. **Sempre validar webhooks:**
   ```javascript
   // Verificar assinatura do webhook
   const signature = req.headers['x-signature'];
   if (!verifySignature(payload, signature)) {
       return res.status(401).send('Unauthorized');
   }
   ```

2. **Não confiar em dados do cliente:**
   - Sempre verificar no servidor de pagamento
   - Não confiar apenas em redirects

3. **Logs de segurança:**
   ```javascript
   function logPaymentAttempt(userId, itemId, success, reason) {
       // Log para auditoria
       console.log(`Payment attempt: ${userId} - ${itemId} - ${success} - ${reason}`);
   }
   ```

4. **Rate limiting:**
   - Limitar tentativas de pagamento por usuário
   - Prevenir spam

## 📊 Dashboard de Pagamentos

```javascript
// Comando admin para ver estatísticas
if (commandName === 'payments' && isAdmin(interaction.user.id)) {
    const stats = await getPaymentStats();
    
    const embed = new EmbedBuilder()
        .setTitle('📊 Estatísticas de Pagamentos')
        .addFields(
            { name: '💰 Receita Total', value: `R$ ${stats.total_revenue}`, inline: true },
            { name: '📈 Vendas do Mês', value: `${stats.monthly_sales}`, inline: true },
            { name: '👥 Usuários Premium', value: `${stats.premium_users}`, inline: true },
            { name: '💳 Método Mais Usado', value: stats.top_method, inline: true }
        );
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
}
```

## 🎯 Comparação de Serviços

| Serviço | Taxa | Popularidade BR | Facilidade | Recorrência |
|---------|------|-----------------|------------|-------------|
| Mercado Pago | 4.99% + R$ 0,39 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ✅ Sim |
| Stripe | 3.4% + R$ 0,40 | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ✅ Sim |
| PayPal | 3.4% + fixo | ⭐⭐⭐⭐ | ⭐⭐⭐ | ✅ Sim |
| PIX Manual | 0% | ⭐⭐⭐⭐⭐ | ⭐⭐ | ❌ Não |

## 💡 Recomendação

**Para começar no Brasil:**
1. **Mercado Pago** - Mais popular, aceita PIX/cartão/boleto
2. **PIX Manual** - Para quem quer evitar taxas (mas mais trabalho manual)

**Para escalar internacionalmente:**
1. **Stripe** - Melhor para assinaturas recorrentes
2. **PayPal** - Muito popular internacionalmente

---

**Próximos passos:** Escolha um serviço e comece a implementar. Mercado Pago é a melhor opção para começar no Brasil!

