# 💝 Sistema de Doações - MusicMaestro

## 📋 Visão Geral

Sistema simples de doações para que usuários possam apoiar o projeto voluntariamente, sem compromisso de assinatura.

## 🎯 Características

- ✅ **Voluntário** - Sem obrigação, apenas apoio
- ✅ **Flexível** - Qualquer valor
- ✅ **Simples** - Não precisa de integração complexa
- ✅ **Gratidão** - Reconhecimento aos doadores

## 💳 Opções de Doação

### 1. Links Diretos (Mais Simples)

Usuário clica em links e doa diretamente pelos serviços.

#### Opções:
- **PayPal** - https://paypal.me/seuusuario
- **Ko-fi** - https://ko-fi.com/seuusuario
- **PicPay** - QR Code ou link
- **PIX** - Chave PIX com QR Code
- **Buy Me a Coffee** - https://buymeacoffee.com/seuusuario

### 2. Valor Sugerido (Opcional)

Oferecer valores sugeridos para facilitar:
- ☕ Café (R$ 5,00)
- 🍕 Pizza (R$ 20,00)
- 🎁 Presente (R$ 50,00)
- 💎 Grande (R$ 100,00)

## 🎮 Comando /donate

### Implementação Básica:

```javascript
// Comando simples com links
{
    name: 'donate',
    description: 'Apoie o projeto com uma doação'
}

// Handler
if (commandName === 'donate') {
    const embed = new EmbedBuilder()
        .setTitle('💝 Apoie o MusicMaestro!')
        .setDescription(
            '✨ Se você gosta do bot e quer ajudar a mantê-lo funcionando, ' +
            'considere fazer uma doação! Qualquer valor é bem-vindo e muito apreciado! 🎵\n\n' +
            '**O que sua doação ajuda:**\n' +
            '• 🚀 Melhorias e novas features\n' +
            '• 🛠️ Manutenção do servidor\n' +
            '• ⚡ Melhor performance\n' +
            '• 🎨 Novos recursos'
        )
        .setColor(0xFFD700)
        .addFields(
            {
                name: '💳 Formas de Doação',
                value: 'Escolha a forma mais conveniente para você:',
                inline: false
            },
            {
                name: '📱 PIX (Brasil)',
                value: 'Chave: `seu-pix@email.com`\nAprovação instantânea!',
                inline: true
            },
            {
                name: '🌐 PayPal',
                value: '[Clique aqui para doar](https://paypal.me/seuusuario)',
                inline: true
            },
            {
                name: '☕ Ko-fi',
                value: '[Clique aqui para doar](https://ko-fi.com/seuusuario)',
                inline: true
            }
        )
        .setFooter({ text: 'Muito obrigado pelo seu apoio! 🙏' })
        .setTimestamp();
    
    // Botões de ação
    const buttons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setLabel('PayPal')
                .setURL('https://paypal.me/seuusuario')
                .setStyle(ButtonStyle.Link)
                .setEmoji('💳'),
            new ButtonBuilder()
                .setLabel('Ko-fi')
                .setURL('https://ko-fi.com/seuusuario')
                .setStyle(ButtonStyle.Link)
                .setEmoji('☕'),
            new ButtonBuilder()
                .setLabel('PIX')
                .setCustomId('donate_pix')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📱')
        );
    
    await interaction.reply({
        embeds: [embed],
        components: [buttons],
        ephemeral: false // Público para outros verem
    });
}
```

### Versão com QR Code PIX:

```javascript
// Handler do botão PIX
if (interaction.isButton() && interaction.customId === 'donate_pix') {
    const pixKey = process.env.PIX_KEY || 'seu-pix@email.com';
    const pixQRCode = generatePIXQRCode(pixKey); // Você precisa de uma lib para QR
    
    const embed = new EmbedBuilder()
        .setTitle('📱 Doação via PIX')
        .setDescription(
            `**Chave PIX:**\n\`\`\`${pixKey}\`\`\`\n\n` +
            'Copie a chave acima ou escaneie o QR Code:'
        )
        .setImage(pixQRCode) // QR Code
        .setColor(0x32CD32)
        .setFooter({ 
            text: 'Após doar, você receberá um agradecimento especial! 💝' 
        });
    
    await interaction.reply({
        embeds: [embed],
        ephemeral: true
    });
}
```

## 🏆 Sistema de Reconhecimento (Opcional)

### Agradecer aos Doadores:

```javascript
// Lista de doadores (você atualiza manualmente ou via webhook)
const donors = new Map();

// Comando /donors - Ver doadores
if (commandName === 'donors') {
    const topDonors = Array.from(donors.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([userId, amount], index) => 
            `${index + 1}. <@${userId}> - R$ ${amount.toFixed(2)}`
        )
        .join('\n');
    
    const embed = new EmbedBuilder()
        .setTitle('💝 Nossos Apoiadores')
        .setDescription(topDonors || 'Seja o primeiro a apoiar! Use /donate')
        .setColor(0xFFD700)
        .setFooter({ text: 'Muito obrigado a todos os doadores! 🙏' });
    
    await interaction.reply({ embeds: [embed] });
}

// Cargo especial para doadores (opcional)
async function grantDonorRole(userId, guildId) {
    const donorRoleId = process.env.DONOR_ROLE_ID;
    const member = await interaction.guild.members.fetch(userId);
    
    if (donorRoleId && !member.roles.cache.has(donorRoleId)) {
        await member.roles.add(donorRoleId);
    }
}
```

### Agradecimento Automático:

```javascript
// Se você tiver webhook do PayPal/Ko-fi, pode agradecer automaticamente
async function thankDonor(userId, amount) {
    try {
        const user = await client.users.fetch(userId);
        
        const embed = new EmbedBuilder()
            .setTitle('💝 Obrigado pela Doação!')
            .setDescription(
                `Você doou **R$ ${amount.toFixed(2)}** para o MusicMaestro!\n\n` +
                'Sua generosidade ajuda muito a manter o bot funcionando e a adicionar novas features! 🙏\n\n' +
                'Como agradecimento, você recebeu:\n' +
                '• ✨ Cargo especial no servidor\n' +
                '• 🎁 Agradecimento público'
            )
            .setColor(0xFFD700)
            .setThumbnail('https://i.imgur.com/example.png') // Imagem de agradecimento
        
        await user.send({ embeds: [embed] });
        
        // Adicionar aos doadores
        donors.set(userId, (donors.get(userId) || 0) + amount);
        
    } catch (error) {
        console.error('Erro ao agradecer doador:', error);
    }
}
```

## 📊 Estatísticas de Doações

```javascript
// Comando admin para ver estatísticas
if (commandName === 'donations' && isAdmin(interaction.user.id)) {
    const total = Array.from(donors.values()).reduce((a, b) => a + b, 0);
    const count = donors.size;
    const average = count > 0 ? total / count : 0;
    
    const embed = new EmbedBuilder()
        .setTitle('📊 Estatísticas de Doações')
        .addFields(
            { name: '💰 Total Arrecadado', value: `R$ ${total.toFixed(2)}`, inline: true },
            { name: '👥 Total de Doadores', value: `${count}`, inline: true },
            { name: '📈 Média por Doador', value: `R$ ${average.toFixed(2)}`, inline: true }
        )
        .setColor(0xFFD700)
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
}
```

## 🎨 Versão Avançada com Valores Sugeridos

```javascript
if (commandName === 'donate') {
    const embed = new EmbedBuilder()
        .setTitle('💝 Apoie o MusicMaestro!')
        .setDescription('Escolha um valor sugerido ou doe qualquer quantia:')
        .setColor(0xFFD700)
        .addFields(
            {
                name: '☕ Café (R$ 5,00)',
                value: 'Ajuda com um café ☕',
                inline: true
            },
            {
                name: '🍕 Pizza (R$ 20,00)',
                value: 'Ajuda com uma pizza 🍕',
                inline: true
            },
            {
                name: '💎 Grande (R$ 50,00)',
                value: 'Doação generosa! 💎',
                inline: true
            }
        );
    
    // Botões com valores
    const buttons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setLabel('R$ 5,00')
                .setURL('https://ko-fi.com/seuusuario/?amount=5')
                .setStyle(ButtonStyle.Link)
                .setEmoji('☕'),
            new ButtonBuilder()
                .setLabel('R$ 20,00')
                .setURL('https://ko-fi.com/seuusuario/?amount=20')
                .setStyle(ButtonStyle.Link)
                .setEmoji('🍕'),
            new ButtonBuilder()
                .setLabel('R$ 50,00')
                .setURL('https://ko-fi.com/seuusuario/?amount=50')
                .setStyle(ButtonStyle.Link)
                .setEmoji('💎'),
            new ButtonBuilder()
                .setLabel('Outro Valor')
                .setURL('https://ko-fi.com/seuusuario')
                .setStyle(ButtonStyle.Link)
                .setEmoji('💰')
        );
    
    const buttons2 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setLabel('PayPal')
                .setURL('https://paypal.me/seuusuario')
                .setStyle(ButtonStyle.Link),
            new ButtonBuilder()
                .setLabel('PIX')
                .setCustomId('donate_pix')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📱')
        );
    
    await interaction.reply({
        embeds: [embed],
        components: [buttons, buttons2]
    });
}
```

## 🔗 Integração com Ko-fi (Recomendado)

Ko-fi é ideal para doações porque:
- ✅ Gratuito (sem taxa base)
- ✅ Aceita doações únicas ou recorrentes
- ✅ Pode vender "produtos" (premium por exemplo)
- ✅ Dashboard simples
- ✅ Webhook para notificações

### Webhook do Ko-fi:

```javascript
// Se você configurar webhook no Ko-fi
app.post('/webhook/kofi', async (req, res) => {
    const { data } = req.body;
    
    if (data && data.type === 'Donation') {
        const { message, amount, email } = data;
        
        // Tentar encontrar usuário pelo email ou mensagem
        const userId = findUserByEmailOrMessage(email, message);
        
        if (userId) {
            await thankDonor(userId, parseFloat(amount));
            // Adicionar cargo, créditos, etc.
        }
        
        res.status(200).send('OK');
    }
});
```

## 📝 Configuração no .env

```env
# Doações
PIX_KEY=seu-pix@email.com
PAYPAL_LINK=https://paypal.me/seuusuario
KO_FI_LINK=https://ko-fi.com/seuusuario
BUY_ME_COFFEE_LINK=https://buymeacoffee.com/seuusuario

# Opcional: Cargo de doador
DONOR_ROLE_ID=123456789

# Opcional: Webhook do Ko-fi
KO_FI_WEBHOOK_SECRET=seu_secret
```

## 💡 Dicas

1. **Seja Genuíno**: Mostre como a doação ajuda
2. **Não Force**: Doação é voluntária
3. **Reconheça**: Sempre agradeça os doadores
4. **Transparência**: Mostre onde o dinheiro vai (opcional)
5. **Simplicidade**: Mantenha simples, não complique

## 🎯 Comparação de Serviços

| Serviço | Taxa | Facilidade | Popularidade |
|---------|------|------------|--------------|
| Ko-fi | 0% (sugestão 5%) | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| Buy Me a Coffee | 5% | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| PayPal | 3.4% | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| PIX | 0% | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

## ✨ Exemplo de Embed Final

```
💝 Apoie o MusicMaestro!

✨ Se você gosta do bot e quer ajudar a mantê-lo funcionando, 
considere fazer uma doação! Qualquer valor é bem-vindo! 🎵

O que sua doação ajuda:
• 🚀 Melhorias e novas features
• 🛠️ Manutenção do servidor
• ⚡ Melhor performance
• 🎨 Novos recursos

[Botões: PayPal | Ko-fi | PIX]
```

---

**Recomendação**: Ko-fi ou PIX são as melhores opções. Ko-fi tem webhook para automação, PIX é mais popular no Brasil.

