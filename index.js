const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, PermissionsBitField, Partials, VoiceChannel } = require('discord.js');
const fs = require('fs');
require('dotenv').config();

// ============================================
// CONFIGURATION
// ============================================
const BOT_TOKEN = process.env.BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID || "1511853901937119322";
const VOICE_REWARD_TIME = 2 * 60 * 60 * 1000; // 2 ساعات بالمللي ثانية

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
    steam: [],     // { name, email, password, notes }
    netflix: [],   // { name, link, notes }
    spotify: [],   // { name, link, notes }
    discord: [],   // { name, link, notes }
    other: []      // { name, link, notes }
};

let invites = {};
let voiceTracking = {}; // { userId: { startTime, channelId, accountClaimed } }

// ============================================
// FILE FUNCTIONS
// ============================================
function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            accounts = data.accounts || accounts;
            invites = data.invites || invites;
            voiceTracking = data.voiceTracking || {};
            console.log('📂 Data loaded successfully');
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
        const data = { accounts, invites, voiceTracking };
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
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildVoiceStates
    ],
    partials: [Partials.Channel, Partials.Message]
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
async function giveAccount(user, type, channel, fromVoice = false) {
    const accountType = type || 'any';
    let availableAccounts = [];
    let isSteam = false;
    
    if (accountType === 'any') {
        // جمع جميع الحسابات
        for (const type in accounts) {
            const accountsWithType = accounts[type].map(acc => ({ ...acc, type }));
            availableAccounts = availableAccounts.concat(accountsWithType);
        }
    } else {
        availableAccounts = accounts[accountType] || [];
        isSteam = accountType === 'steam';
    }
    
    // فلترة حسب النوع
    if (accountType !== 'any') {
        availableAccounts = availableAccounts.map(acc => ({ ...acc, type: accountType }));
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
    
    // إزالة الحساب من التخزين
    if (accountType === 'any') {
        const index = accounts[originalType].findIndex(a => {
            if (originalType === 'steam') {
                return a.email === account.email && a.password === account.password;
            } else {
                return a.link === account.link;
            }
        });
        if (index !== -1) {
            accounts[originalType].splice(index, 1);
        }
    } else {
        const index = accounts[accountType].findIndex(a => {
            if (accountType === 'steam') {
                return a.email === account.email && a.password === account.password;
            } else {
                return a.link === account.link;
            }
        });
        if (index !== -1) {
            accounts[accountType].splice(index, 1);
        }
    }
    
    saveData();
    
    // بناء الرسالة حسب نوع الحساب
    const embed = new EmbedBuilder()
        .setColor(0x22C55E)
        .setTitle(`🎉 You Received a ${ACCOUNT_TYPES[originalType]?.name || 'Unknown'} Account!`)
        .setDescription(`**${account.name || 'Account'}**`)
        .setFooter({ text: `Type: ${ACCOUNT_TYPES[originalType]?.name || 'Unknown'}${fromVoice ? ' | Voice Reward' : ''}` })
        .setTimestamp();
    
    if (originalType === 'steam') {
        embed.addFields(
            { name: '📧 Email', value: account.email || 'N/A', inline: true },
            { name: '🔑 Password', value: account.password || 'N/A', inline: true },
            { name: '📝 Notes', value: account.notes || 'No additional notes', inline: false }
        );
    } else {
        embed.addFields(
            { name: '🔗 Link', value: account.link || 'N/A', inline: true },
            { name: '📝 Notes', value: account.notes || 'No additional notes', inline: false }
        );
    }
    
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
// VOICE REWARD SYSTEM
// ============================================
async function checkVoiceReward(userId) {
    const userData = voiceTracking[userId];
    if (!userData) return false;
    if (userData.accountClaimed) return false;
    
    const timeSpent = Date.now() - userData.startTime;
    if (timeSpent >= VOICE_REWARD_TIME) {
        return true;
    }
    return false;
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
    
    // ========== -stoke ==========
    if (cmd === 'stoke') {
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
        if (!isStaff(member)) {
            return message.reply('❌ Only staff members can add accounts!');
        }
        
        const fullMessage = args.join(' ');
        if (!fullMessage) {
            return message.reply(`❌ Usage:\n• Steam: \`-add steam, name, email, password, notes\`\n• Other: \`-add type, name, link, notes\`\n\nTypes: steam, netflix, spotify, discord, other\nExample Steam: \`-add steam, Steam Account, email@gmail.com, pass123, Premium\`\nExample Other: \`-add netflix, Netflix Account, https://netflix.com/invite/xxx, 4K Quality\``);
        }
        
        let addedCount = 0;
        let lines = [];
        if (fullMessage.includes('\n')) {
            lines = fullMessage.split('\n').filter(line => line.trim());
        } else {
            lines = [fullMessage];
        }
        
        for (const line of lines) {
            const parts = line.split(',').map(p => p.trim());
            if (parts.length < 3) {
                continue;
            }
            
            const type = parts[0].toLowerCase();
            const name = parts[1];
            
            if (type === 'steam') {
                // Steam: name, email, password, notes
                const email = parts[2] || '';
                const password = parts[3] || '';
                const notes = parts[4] || '';
                
                if (!email || !password) {
                    console.log(`❌ Skipping: missing email or password for ${name}`);
                    continue;
                }
                
                const account = { name, email, password, notes };
                accounts.steam.push(account);
                addedCount++;
            } else if (['netflix', 'spotify', 'discord', 'other'].includes(type)) {
                // Other: name, link, notes
                const link = parts[2] || '';
                const notes = parts[3] || '';
                
                if (!link) {
                    console.log(`❌ Skipping: missing link for ${name}`);
                    continue;
                }
                
                const account = { name, link, notes };
                accounts[type].push(account);
                addedCount++;
            }
        }
        
        if (addedCount === 0) {
            return message.reply('❌ No valid accounts found! Please check the format.');
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
                const accountsWithType = accounts[t].map(acc => ({ ...acc, type: t }));
                availableAccounts = availableAccounts.concat(accountsWithType);
            }
        } else {
            availableAccounts = accounts[type] || [];
            availableAccounts = availableAccounts.map(acc => ({ ...acc, type }));
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
        
        await giveAccount(author, type, channel);
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
    
    // ========== -clear ==========
    if (cmd === 'clear') {
        if (!isStaff(member)) {
            return message.reply('❌ Only staff members can clear accounts!');
        }
        
        const confirmEmbed = new EmbedBuilder()
            .setColor(0xEF4444)
            .setTitle('⚠️ Confirm Clear All Accounts')
            .setDescription(`⚠️ **WARNING:** This will delete **ALL** accounts from the stock!\n\n📊 Current Stock:\n🎮 Steam: ${accounts.steam.length}\n📺 Netflix: ${accounts.netflix.length}\n🎵 Spotify: ${accounts.spotify.length}\n💬 Discord: ${accounts.discord.length}\n📦 Other: ${accounts.other.length}\n\n**Total: ${getTotalAccounts()} accounts**\n\nClick ✅ to confirm or ❌ to cancel.`)
            .setTimestamp();
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('confirm_clear').setLabel('✅ Confirm').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('cancel_clear').setLabel('❌ Cancel').setStyle(ButtonStyle.Secondary)
            );
        
        const confirmMsg = await message.reply({ embeds: [confirmEmbed], components: [row] });
        
        const filter = (i) => i.user.id === message.author.id;
        const collector = confirmMsg.createMessageComponentCollector({ filter, time: 30000, max: 1 });
        
        collector.on('collect', async (interaction) => {
            if (interaction.customId === 'confirm_clear') {
                const beforeCount = getTotalAccounts();
                
                accounts.steam = [];
                accounts.netflix = [];
                accounts.spotify = [];
                accounts.discord = [];
                accounts.other = [];
                
                saveData();
                
                await interaction.update({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x22C55E)
                            .setTitle('✅ All Accounts Cleared')
                            .setDescription(`Successfully deleted **${beforeCount}** accounts from the stock!`)
                            .setTimestamp()
                    ],
                    components: []
                });
            } else {
                await interaction.update({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x5865F2)
                            .setTitle('❌ Operation Cancelled')
                            .setDescription('No accounts were deleted.')
                            .setTimestamp()
                    ],
                    components: []
                });
            }
        });
        
        collector.on('end', async (collected) => {
            if (collected.size === 0) {
                await confirmMsg.edit({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xEF4444)
                            .setTitle('⏰ Timeout')
                            .setDescription('Clear operation timed out. No accounts were deleted.')
                            .setTimestamp()
                    ],
                    components: []
                });
            }
        });
        
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
                { name: '➕ Add Steam', value: '`-add steam, name, email, password, notes` - Add Steam account (Staff only)', inline: false },
                { name: '➕ Add Other', value: '`-add type, name, link, notes` - Add other account (Staff only)', inline: false },
                { name: '🎯 Claim', value: '`-claim [type]` - Claim an account (' + INVITES_NEEDED + ' invites required)', inline: false },
                { name: '📨 Invites', value: '`-invites [@user]` - Check invite count', inline: false },
                { name: '🗑️ Clear', value: '`-clear` - Delete ALL accounts (Staff only)', inline: false },
                { name: '🎤 Voice Reward', value: 'Stay in voice channel for **2 hours** to get a free account!', inline: false },
                { name: 'ℹ️ Help', value: '`-help` - Show this message', inline: false }
            )
            .addFields(
                { name: '📦 Account Types', value: '🎮 Steam (email+pass) | 📺 Netflix (link) | 🎵 Spotify (link) | 💬 Discord (link) | 📦 Other (link)', inline: false },
                { name: '🎯 How It Works', value: '• Each invite = 1 point\n• ' + INVITES_NEEDED + ' points = 1 account\n• 2 hours in voice = 1 account\n• Accounts sent via DM', inline: false }
            )
            .setFooter({ text: `Requested by ${author.tag}` })
            .setTimestamp();
        
        await message.reply({ embeds: [embed] });
        return;
    }
});

// ============================================
// VOICE STATE TRACKING
// ============================================
client.on('voiceStateUpdate', async (oldState, newState) => {
    const userId = newState.member?.id || oldState.member?.id;
    if (!userId) return;
    
    // User joined a voice channel
    if (newState.channelId && !oldState.channelId) {
        // Check if user already has tracking
        if (!voiceTracking[userId]) {
            voiceTracking[userId] = {
                startTime: Date.now(),
                channelId: newState.channelId,
                accountClaimed: false
            };
            saveData();
            console.log(`🎤 ${newState.member?.user?.tag || userId} joined voice channel. Tracking started.`);
        }
    }
    
    // User left a voice channel
    if (oldState.channelId && !newState.channelId) {
        if (voiceTracking[userId]) {
            // Check if user earned a reward
            const timeSpent = Date.now() - voiceTracking[userId].startTime;
            if (timeSpent >= VOICE_REWARD_TIME && !voiceTracking[userId].accountClaimed) {
                // User earned an account
                const user = await client.users.fetch(userId).catch(() => null);
                if (user) {
                    // Check if there are any accounts available
                    const totalAccounts = getTotalAccounts();
                    if (totalAccounts > 0) {
                        // Try to find a channel to send the message (use DM or a public channel)
                        try {
                            const success = await giveAccount(user, 'any', { send: (data) => user.send(data) }, true);
                            if (success) {
                                voiceTracking[userId].accountClaimed = true;
                                saveData();
                                console.log(`🎉 ${user.tag} earned a voice reward account!`);
                            }
                        } catch (error) {
                            console.error(`Failed to give voice reward to ${user.tag}:`, error.message);
                        }
                    } else {
                        console.log(`⚠️ No accounts available for voice reward to ${user.tag}`);
                    }
                }
            }
            
            // Clean up tracking (remove after 10 minutes or if account claimed)
            setTimeout(() => {
                if (voiceTracking[userId] && voiceTracking[userId].accountClaimed) {
                    delete voiceTracking[userId];
                    saveData();
                }
            }, 10 * 60 * 1000);
            
            console.log(`🎤 ${newState.member?.user?.tag || userId} left voice channel. Time spent: ${(timeSpent / 60000).toFixed(0)} minutes.`);
        }
    }
    
    // User switched voice channels
    if (newState.channelId && oldState.channelId && newState.channelId !== oldState.channelId) {
        if (voiceTracking[userId]) {
            voiceTracking[userId].channelId = newState.channelId;
            saveData();
        }
    }
});

// ============================================
// CHECK VOICE REWARDS PERIODICALLY
// ============================================
setInterval(async () => {
    const now = Date.now();
    for (const [userId, data] of Object.entries(voiceTracking)) {
        if (data.accountClaimed) continue;
        
        const timeSpent = now - data.startTime;
        if (timeSpent >= VOICE_REWARD_TIME) {
            const user = await client.users.fetch(userId).catch(() => null);
            if (user) {
                const totalAccounts = getTotalAccounts();
                if (totalAccounts > 0) {
                    // Find a channel to send the message (use DM)
                    try {
                        const success = await giveAccount(user, 'any', { send: (data) => user.send(data) }, true);
                        if (success) {
                            voiceTracking[userId].accountClaimed = true;
                            saveData();
                            console.log(`🎉 ${user.tag} earned a voice reward account! (Checked via interval)`);
                        }
                    } catch (error) {
                        console.error(`Failed to give voice reward to ${user.tag}:`, error.message);
                    }
                }
            }
        }
    }
}, 60000); // Check every minute

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
    console.log(`📊 Account Giveaway Bot - Powered by Invites & Voice`);
    console.log(`🎯 ${INVITES_NEEDED} invites needed for 1 account`);
    console.log(`🎤 ${VOICE_REWARD_TIME / (60 * 60 * 1000)} hours in voice = 1 account`);
    console.log(`📦 Total Accounts: ${getTotalAccounts()}`);
    console.log(`🎮 Steam (email+pass): ${accounts.steam.length}`);
    console.log(`📺 Netflix (link): ${accounts.netflix.length}`);
    console.log(`🎵 Spotify (link): ${accounts.spotify.length}`);
    console.log(`💬 Discord (link): ${accounts.discord.length}`);
    console.log(`📦 Other (link): ${accounts.other.length}`);
    console.log('');
    console.log('📝 Commands:');
    console.log('  -stoke      - Show account stock');
    console.log('  -add        - Add accounts (staff only)');
    console.log('  -claim      - Claim an account');
    console.log('  -invites    - Check invite count');
    console.log('  -clear      - Delete ALL accounts (staff only)');
    console.log('  -help       - Show help');
    console.log('');
    console.log('🚀 Bot is ready!');
    
    client.user.setActivity(`-claim | ${INVITES_NEEDED} invites = 1 account | 2h voice = 1 account`, { type: 3 });
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
