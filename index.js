const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, PermissionsBitField } = require('discord.js');
const fs = require('fs');
require('dotenv').config();

// ============================================
// CONFIGURATION
// ============================================
const BOT_TOKEN = process.env.BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID || "1511853901937119322";

// عدد الدعوات المطلوبة للحصول على حساب
const INVITES_NEEDED = 5;

if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN not found in environment variables!');
    process.exit(1);
}

// ============================================
// DATA STORAGE
// ============================================
const DATA_FILE = './accounts_data.json';

// Account types
const ACCOUNT_TYPES = {
    steam: { name: "Steam", emoji: "🎮", color: "#1B2838" },
    netflix: { name: "Netflix", emoji: "📺", color: "#E50914" },
    spotify: { name: "Spotify", emoji: "🎵", color: "#1DB954" },
    discord: { name: "Discord", emoji: "💬", color: "#5865F2" },
    other: { name: "Other", emoji: "📦", color: "#808080" }
};

// Data structure
let accounts = {
    steam: [],
    netflix: [],
    spotify: [],
    discord: [],
    other: []
};

let invites = {};

// ============================================
// FILE FUNCTIONS
// ============================================
function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            accounts = data.accounts || accounts;
            invites = data.invites || invites;
            console.log('📂 Data loaded successfully');
            console.log('📊 Current accounts:', JSON.stringify(accounts, null, 2));
        } else {
            saveData();
            console.log('📂 New data file created');
        }
    } catch (error) {
        console.error('❌ Failed to load data:', error.message);
        saveData();
    }
}

function saveData() {
    try {
        const data = { accounts, invites };
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        console.log('💾 Data saved successfully');
    } catch (error) {
        console.error('❌ Failed to save data:', error.message);
    }
}

// ============================================
// CLIENT INITIALIZATION
// ============================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildInvites
    ]
});

// ============================================
// HELPER FUNCTIONS
// ============================================
function isStaff(member) {
    if (!member) return false;
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
    if (STAFF_ROLE_ID && member.roles.cache.has(STAFF_ROLE_ID)) return true;
    return false;
}

function getAccountTypeFromName(name) {
    const lower = name.toLowerCase();
    if (lower.includes('steam')) return 'steam';
    if (lower.includes('netflix')) return 'netflix';
    if (lower.includes('spotify')) return 'spotify';
    if (lower.includes('discord')) return 'discord';
    return 'other';
}

function getTotalAccounts() {
    let total = 0;
    for (const type in accounts) {
        total += accounts[type].length;
    }
    return total;
}

function getAccountsByType(type) {
    return accounts[type] || [];
}

function getInviteCount(userId) {
    return invites[userId] || 0;
}

function addInvite(userId) {
    invites[userId] = (invites[userId] || 0) + 1;
    saveData();
}

function resetInvites(userId) {
    invites[userId] = 0;
    saveData();
}

// ============================================
// ACCOUNT DISTRIBUTION
// ============================================
async function giveAccount(user, type, channel) {
    const accountType = type || 'any';
    let availableAccounts = [];
    
    if (accountType === 'any') {
        for (const type in accounts) {
            availableAccounts = availableAccounts.concat(accounts[type].map(acc => ({ ...acc, type })));
        }
    } else {
        availableAccounts = accounts[accountType] || [];
    }
    
    if (availableAccounts.length === 0) {
        const embed = new EmbedBuilder()
            .setColor(0xEF4444)
            .setTitle('❌ No Accounts Available')
            .setDescription(`There are no ${accountType === 'any' ? '' : accountType} accounts available at the moment.`)
            .setTimestamp();
        await channel.send({ embeds: [embed] });
        return false;
    }
    
    const account = availableAccounts[0];
    const originalType = account.type || getAccountTypeFromName(account.name);
    
    if (accountType === 'any') {
        const index = accounts[originalType].findIndex(a => a.email === account.email && a.password === account.password);
        if (index !== -1) {
            accounts[originalType].splice(index, 1);
        }
    } else {
        const index = accounts[accountType].findIndex(a => a.email === account.email && a.password === account.password);
        if (index !== -1) {
            accounts[accountType].splice(index, 1);
        }
    }
    
    saveData();
    
    const embed = new EmbedBuilder()
        .setColor(0x22C55E)
        .setTitle(`🎉 You Received a ${ACCOUNT_TYPES[originalType]?.name || 'Unknown'} Account!`)
        .setDescription(`**${account.name || 'Account'}**`)
        .addFields(
            { name: '📧 Email/Username', value: account.email, inline: true },
            { name: '🔑 Password', value: account.password, inline: true },
            { name: '📝 Notes', value: account.notes || 'No additional notes', inline: false }
        )
        .setFooter({ text: `Type: ${ACCOUNT_TYPES[originalType]?.name || 'Unknown'}` })
        .setTimestamp();
    
    try {
        await user.send({ embeds: [embed] });
        return true;
    } catch (error) {
        const failEmbed = new EmbedBuilder()
            .setColor(0xEF4444)
            .setTitle('❌ Cannot Send DM')
            .setDescription(`${user}, please enable DMs to receive your account!`)
            .setTimestamp();
        await channel.send({ embeds: [failEmbed] });
        return false;
    }
}

// ============================================
// COMMAND HANDLER (Using - prefix instead of /)
// ============================================
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith('-')) return;
    
    const args = message.content.slice(1).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();
    const { member, channel, guild, author } = message;
    
    console.log(`📝 Command received: ${cmd} from ${author.tag}`);
    console.log(`📝 Args: ${args.join(' ')}`);
    
    // ========== -stoke ==========
    if (cmd === 'stoke') {
        console.log('📊 Showing stock...');
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('📊 Account Stock')
            .setDescription('Current available accounts:')
            .addFields(
                { name: '🎮 Steam', value: `${accounts.steam.length} accounts`, inline: true },
                { name: '📺 Netflix', value: `${accounts.netflix.length} accounts`, inline: true },
                { name: '🎵 Spotify', value: `${accounts.spotify.length} accounts`, inline: true },
                { name: '💬 Discord', value: `${accounts.discord.length} accounts`, inline: true },
                { name: '📦 Other', value: `${accounts.other.length} accounts`, inline: true },
                { name: '📊 Total', value: `${getTotalAccounts()} accounts`, inline: true }
            )
            .setFooter({ text: `Requested by ${author.tag}` })
            .setTimestamp();
        
        await message.reply({ embeds: [embed] });
        return;
    }
    
    // ========== -add ==========
    if (cmd === 'add') {
        console.log('➕ Adding accounts...');
        
        if (!isStaff(member)) {
            console.log('❌ User is not staff!');
            return message.reply('❌ Only staff members can add accounts!');
        }
        
        const fullMessage = args.join(' ');
        console.log(`📝 Full message: ${fullMessage}`);
        
        if (!fullMessage) {
            return message.reply(`❌ Usage: \`-add name, email, password, notes\`\nExample: \`-add Steam Account, email@example.com, pass123, Premium\`\n\nYou can add multiple accounts by putting each on a new line.`);
        }
        
        let addedCount = 0;
        let lines = [];
        if (fullMessage.includes('\n')) {
            lines = fullMessage.split('\n').filter(line => line.trim());
        } else {
            lines = [fullMessage];
        }
        
        console.log(`📝 Lines to process: ${lines.length}`);
        
        for (const line of lines) {
            const parts = line.split(',').map(p => p.trim());
            console.log(`📝 Processing: ${line}`);
            console.log(`📝 Parts: ${parts}`);
            
            if (parts.length < 3) {
                console.log(`❌ Skipping: not enough parts (${parts.length})`);
                continue;
            }
            
            const name = parts[0];
            const email = parts[1];
            const password = parts[2];
            const notes = parts[3] || '';
            const type = getAccountTypeFromName(name);
            
            console.log(`📝 Adding: ${name} | ${email} | ${password} | ${notes} | Type: ${type}`);
            
            const account = { name, email, password, notes };
            accounts[type].push(account);
            addedCount++;
        }
        
        if (addedCount === 0) {
            return message.reply('❌ No valid accounts found! Please use format: `name, email, password, notes`');
        }
        
        saveData();
        
        const embed = new EmbedBuilder()
            .setColor(0x22C55E)
            .setTitle('✅ Accounts Added')
            .setDescription(`Successfully added **${addedCount}** accounts!`)
            .addFields(
                { name: '📊 New Stock', value: `Total: ${getTotalAccounts()} accounts`, inline: true }
            )
            .setTimestamp();
        
        await message.reply({ embeds: [embed] });
        console.log(`✅ Added ${addedCount} accounts successfully!`);
        return;
    }
    
    // ========== -claim ==========
    if (cmd === 'claim') {
        const type = args[0] || 'any';
        const inviteCount = getInviteCount(author.id);
        
        if (inviteCount < INVITES_NEEDED) {
            const embed = new EmbedBuilder()
                .setColor(0xEF4444)
                .setTitle('❌ Not Enough Invites')
                .setDescription(`You need **${INVITES_NEEDED} invites** to claim an account!\nYou currently have **${inviteCount}** invites.\n\nInvite more people to earn invites!`)
                .setTimestamp();
            await message.reply({ embeds: [embed] });
            return;
        }
        
        let availableAccounts = [];
        if (type === 'any') {
            for (const t in accounts) {
                availableAccounts = availableAccounts.concat(accounts[t].map(acc => ({ ...acc, type: t })));
            }
        } else {
            availableAccounts = accounts[type] || [];
        }
        
        if (availableAccounts.length === 0) {
            const embed = new EmbedBuilder()
                .setColor(0xEF4444)
                .setTitle('❌ No Accounts Available')
                .setDescription(`There are no ${type === 'any' ? '' : type} accounts available at the moment.`)
                .setTimestamp();
            await message.reply({ embeds: [embed] });
            return;
        }
        
        invites[author.id] = inviteCount - INVITES_NEEDED;
        saveData();
        
        const account = availableAccounts[0];
        const originalType = account.type || getAccountTypeFromName(account.name);
        
        if (type === 'any') {
            const index = accounts[originalType].findIndex(a => a.email === account.email && a.password === account.password);
            if (index !== -1) {
                accounts[originalType].splice(index, 1);
            }
        } else {
            const index = accounts[type].findIndex(a => a.email === account.email && a.password === account.password);
            if (index !== -1) {
                accounts[type].splice(index, 1);
            }
        }
        saveData();
        
        const embed = new EmbedBuilder()
            .setColor(0x22C55E)
            .setTitle(`🎉 You Received a ${ACCOUNT_TYPES[originalType]?.name || 'Unknown'} Account!`)
            .setDescription(`**${account.name || 'Account'}**`)
            .addFields(
                { name: '📧 Email/Username', value: account.email, inline: true },
                { name: '🔑 Password', value: account.password, inline: true },
                { name: '📝 Notes', value: account.notes || 'No additional notes', inline: false }
            )
            .setFooter({ text: `Type: ${ACCOUNT_TYPES[originalType]?.name || 'Unknown'} | Invites used: ${INVITES_NEEDED}` })
            .setTimestamp();
        
        await message.reply(`✅ Account sent to your DMs! Check your messages. (Used ${INVITES_NEEDED} invites)`);
        
        try {
            await author.send({ embeds: [embed] });
        } catch (error) {
            await message.reply('❌ I cannot send you a DM. Please enable DMs and try again.');
            invites[author.id] = inviteCount;
            saveData();
        }
        return;
    }
    
    // ========== -invites ==========
    if (cmd === 'invites') {
        const target = args[0] ? await client.users.fetch(args[0]).catch(() => null) : author;
        if (!target) {
            return message.reply('❌ User not found!');
        }
        
        const inviteCount = getInviteCount(target.id);
        
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('📨 Invite Count')
            .setDescription(`${target} has **${inviteCount}** invite${inviteCount !== 1 ? 's' : ''}.`)
            .addFields(
                { name: '🎯 How to get more', value: '• Invite friends to the server\n• Each invite gives you **1 point**\n• **' + INVITES_NEEDED + ' invites** = 1 account', inline: false },
                { name: '📝 Available Accounts', value: `🎮 Steam: ${accounts.steam.length}\n📺 Netflix: ${accounts.netflix.length}\n🎵 Spotify: ${accounts.spotify.length}\n💬 Discord: ${accounts.discord.length}\n📦 Other: ${accounts.other.length}`, inline: true }
            )
            .setFooter({ text: `User ID: ${target.id}` })
            .setTimestamp();
        
        await message.reply({ embeds: [embed] });
        return;
    }
    
    // ========== -help ==========
    if (cmd === 'help') {
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('📋 Account Giveaway Bot Commands')
            .setDescription('**Prefix:** `-`')
            .addFields(
                { name: '📊 Stock', value: '`-stoke` - Show available accounts', inline: false },
                { name: '➕ Add', value: '`-add name, email, password, notes` - Add accounts (Staff only)', inline: false },
                { name: '🎯 Claim', value: '`-claim [type]` - Claim an account (' + INVITES_NEEDED + ' invites required)', inline: false },
                { name: '📨 Invites', value: '`-invites [@user]` - Check invite count', inline: false },
                { name: 'ℹ️ Help', value: '`-help` - Show this message', inline: false }
            )
            .addFields(
                { name: '📦 Account Types', value: '🎮 Steam | 📺 Netflix | 🎵 Spotify | 💬 Discord | 📦 Other', inline: false },
                { name: '🎯 How It Works', value: '• Each invite = 1 point\n• ' + INVITES_NEEDED + ' points = 1 account\n• Accounts sent via DM', inline: false }
            )
            .setFooter({ text: `Requested by ${author.tag}` })
            .setTimestamp();
        
        await message.reply({ embeds: [embed] });
        return;
    }
});

// ============================================
// INVITE TRACKING
// ============================================
client.on('inviteCreate', async (invite) => {
    console.log(`📨 New invite created: ${invite.code} by ${invite.inviter.tag}`);
});

client.on('guildMemberAdd', async (member) => {
    try {
        const invites = await member.guild.invites.fetch();
        const usedInvite = invites.find(inv => inv.uses > 0);
        
        if (usedInvite && usedInvite.inviter) {
            addInvite(usedInvite.inviter.id);
            console.log(`✅ ${usedInvite.inviter.tag} earned an invite! (${getInviteCount(usedInvite.inviter.id)} total)`);
            
            const inviteCount = getInviteCount(usedInvite.inviter.id);
            if (inviteCount >= INVITES_NEEDED) {
                const embed = new EmbedBuilder()
                    .setColor(0x22C55E)
                    .setTitle('🎉 You Earned an Invite!')
                    .setDescription(`You now have **${inviteCount}** invites!\n\nYou can claim an account with **${INVITES_NEEDED} invites**.\n\nUse \`-claim\` to claim your account!`)
                    .setTimestamp();
                try {
                    await usedInvite.inviter.send({ embeds: [embed] });
                } catch (error) {
                    console.log(`Could not DM ${usedInvite.inviter.tag}`);
                }
            } else {
                const embed = new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle('📨 You Earned an Invite!')
                    .setDescription(`You now have **${inviteCount}** invites.\n\nNeed **${INVITES_NEEDED} invites** to claim an account.\n\nKeep inviting! 🎯`)
                    .setTimestamp();
                try {
                    await usedInvite.inviter.send({ embeds: [embed] });
                } catch (error) {
                    console.log(`Could not DM ${usedInvite.inviter.tag}`);
                }
            }
        }
    } catch (error) {
        console.error('❌ Error tracking invite:', error.message);
    }
});

// ============================================
// READY EVENT
// ============================================
client.once('ready', async () => {
    console.log(`✨ ${client.user.tag} is online!`);
    console.log(`📊 Account Giveaway Bot - Powered by Invites`);
    console.log(`🎯 ${INVITES_NEEDED} invites needed for 1 account`);
    console.log(`📦 Total Accounts: ${getTotalAccounts()}`);
    console.log(`🎮 Steam: ${accounts.steam.length}`);
    console.log(`📺 Netflix: ${accounts.netflix.length}`);
    console.log(`🎵 Spotify: ${accounts.spotify.length}`);
    console.log(`💬 Discord: ${accounts.discord.length}`);
    console.log(`📦 Other: ${accounts.other.length}`);
    console.log('');
    console.log('📝 Commands:');
    console.log('  -stoke    - Show account stock');
    console.log('  -add      - Add accounts (staff only)');
    console.log('  -claim    - Claim an account');
    console.log('  -invites  - Check invite count');
    console.log('  -help     - Show help');
    console.log('');
    console.log('🚀 Bot is ready!');
    
    client.user.setActivity(`-claim | ${INVITES_NEEDED} invites = 1 account`, { type: 3 });
});

// ============================================
// ERROR HANDLING
// ============================================
process.on('unhandledRejection', (error) => {
    console.error('❌ Unhandled rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught exception:', error);
});

// ============================================
// LOGIN
// ============================================
loadData();
client.login(BOT_TOKEN);
            
