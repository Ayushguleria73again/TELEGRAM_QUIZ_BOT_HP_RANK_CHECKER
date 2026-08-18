const bot = require('./botInstance');
const { startQuiz } = require('../services/quizRunner');
const { getSetting, setSetting } = require('../services/settingsService');
const { initScheduler } = require('../scheduler/quizScheduler');
const Question = require('../models/Question');
const { shuffleQuestionOptions } = require('../utils/shuffleOptions');

// Rate Limiting Logic
const lastCommandTime = new Map();
const COOLDOWN_MS = 2000; // 2 seconds

function checkRateLimit(userId) {
    const now = Date.now();
    const lastTime = lastCommandTime.get(userId) || 0;
    if (now - lastTime < COOLDOWN_MS) {
        return true; // Limited
    }
    lastCommandTime.set(userId, now);
    return false; // Allowed
}

// Admin ID for manual triggers
const ADMIN_ID = process.env.ADMIN_ID;

// Set Bot Commands Menu
bot.setMyCommands([
    { command: 'start', description: '🚀 Start the bot & see welcome message' },
    { command: 'help', description: '❓ View all available commands & rules' },
    { command: 'me', description: '👤 View your professional stats, rank & badges' },
    { command: 'leaderboard', description: '🏆 View global rankings' },
    { command: 'random', description: '🎲 Get a random HP GK question instantly' },
    { command: 'challenge', description: '⚔️ Challenge someone to a 1v1 duel' },
    { command: 'generate', description: '🤖 (Admin) Generate new HP GK questions via AI' },
    { command: 'info', description: '📅 View daily quiz schedule' },
    { command: 'id', description: '🆔 Get your Telegram ID' }
]).catch(err => console.error('Error setting commands:', err));

// Start command
bot.onText(/\/start(@\w+)?/, (msg) => {
    if (checkRateLimit(msg.from.id)) return;
    const welcomeMsg = `🚀 *Welcome to the Elite Quiz Bot!* 🏆\n\n` +
        `I am your professional HP Rank assistant. I host competitive daily quizzes, track your performance, and manage 1v1 duels!\n\n` +
        `✨ *What can I do?*\n` +
        `• 🌅 *Daily Quizzes:* 3 sessions every day (Morning, Afternoon, Evening).\n` +
        `• 🔥 *Streaks:* Play daily to build your participation streak.\n` +
        `• ⚔️ *Duels:* Challenge anyone with \`/challenge @username\`.\n` +
        `• 📈 *Analytics:* See your accuracy and best subjects with \`/me\`.\n\n` +
        `Type /help to see the full list of commands and start your journey to *Rank Master*! 👑`;
    bot.sendMessage(msg.chat.id, welcomeMsg, { parse_mode: 'Markdown' });
});

// Help command
bot.onText(/\/help(@\w+)?/, (msg) => {
    if (checkRateLimit(msg.from.id)) return;
    const helpText = `❓ *Quiz Bot Help & Commands*\n\n` +
        `👤 *User Commands:*\n` +
        `• /me - Your rank, stats, and streaks.\n` +
        `• /leaderboard - View Weekly, Monthly, and All-Time Top 10.\n` +
        `• /challenge @user - Start a private 1v1 battle.\n` +
        `• /info - See the daily 08:00, 14:00, 20:00 schedule.\n` +
        `• /id - Get your Telegram ID (useful for support).\n\n` +
        `🎮 *Game Rules:*\n` +
        `1. Quizzes start automatically based on the schedule.\n` +
        `2. You have 15-20 seconds to answer each question.\n` +
        `3. Your rank increases as you earn more points.\n\n` +
        `🛡️ *Note:* There is a 2-second anti-spam cooldown on all commands.`;
    bot.sendMessage(msg.chat.id, helpText, { parse_mode: 'Markdown' });
});

// Help user get Chat ID
bot.onText(/\/id(@\w+)?/, (msg) => {
    if (checkRateLimit(msg.from.id)) return;
    bot.sendMessage(msg.chat.id, `ID of this chat: \`${msg.chat.id}\``, { parse_mode: 'Markdown' });
});

// Leaderboard command
bot.onText(/\/leaderboard(@\w+)?/, async (msg) => {
    if (checkRateLimit(msg.from.id)) return;
    const chatId = msg.chat.id;

    const options = {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "📊 Weekly", callback_data: "lb_weekly" },
                    { text: "🌟 Monthly", callback_data: "lb_monthly" }
                ],
                [{ text: "🏆 All-Time", callback_data: "lb_alltime" }]
            ]
        }
    };

    bot.sendMessage(chatId, "🏆 *Global Hall of Fame*\nSelect the leaderboard you want to view:", options);
});

// Info command
bot.onText(/\/info(@\w+)?/, (msg) => {
    if (checkRateLimit(msg.from.id)) return;
    const infoText = `📅 *Daily Himachal Pradesh GK Schedule (IST)*\n\n` +
        `🌅 *Morning Session (08:00 AM)*\n` +
        `• Focus: Himachal GK Special\n` +
        `• Count: 30 Questions\n` +
        `• Timer: 15 Seconds\n\n` +
        `☀️ *Afternoon Session (02:00 PM)*\n` +
        `• Focus: HP History & Geography\n` +
        `• Count: 20 Questions\n` +
        `• Timer: 15 Seconds\n\n` +
        `🌙 *Evening Session (08:00 PM)*\n` +
        `• Focus: HP GK Mega Mix\n` +
        `• Count: 30 Questions\n` +
        `• Timer: 15 Seconds\n\n` +
        `🏁 *Results & Leaderboards* are posted immediately after every quiz!`;

    bot.sendMessage(msg.chat.id, infoText, { parse_mode: 'Markdown' });
});

// Personal info command
bot.onText(/\/me(@\w+)?/, async (msg) => {
    if (checkRateLimit(msg.from.id)) return;
    const userId = msg.from.id;
    const User = require('../models/User');
    const { getRankDetails } = require('../utils/rankUtils');

    try {
        const user = await User.findOne({ telegramId: userId.toString() });
        if (!user || user.totalScore === 0) {
            return bot.sendMessage(msg.chat.id, "❌ You haven't earned any points yet! Participate in the next quiz to start your journey. 🚀");
        }

        const rank = getRankDetails(user.totalScore);

        // Calculate Accuracy
        const accuracy = user.stats.totalAttempted > 0
            ? ((user.stats.totalCorrect / user.stats.totalAttempted) * 100).toFixed(1)
            : 0;

        // Find Best Category
        let bestCategory = "None";
        let bestAcc = 0;
        user.stats.categoryStats.forEach((val, key) => {
            const acc = (val.correct / val.attempted) * 100;
            if (acc > bestAcc && val.attempted >= 5) {
                bestAcc = acc;
                bestCategory = key;
            }
        });

        let nextRankText = "";
        const tiers = [
            { min: 500, title: 'Scholar', emoji: '📚' },
            { min: 2000, title: 'Expert', emoji: '🧠' },
            { min: 5000, title: 'Rank Master', emoji: '👑' }
        ];

        const nextTier = tiers.find(t => user.totalScore < t.min);
        if (nextTier) {
            const diff = nextTier.min - user.totalScore;
            nextRankText = `\n\n🎯 *Next Goal:* ${diff} points to reach *${nextTier.title}* ${nextTier.emoji}`;
        } else {
            nextRankText = `\n\n👑 You have reached the highest rank! You are a *Rank Master*!`;
        }

        const { formatBadges } = require('../utils/badgeUtils');
        const badgeDisplay = formatBadges(user.badges);

        const profileText = `👤 *Your Professional Profile*\n\n` +
            `🏆 *Current Rank:* ${rank.title} ${rank.emoji}\n` +
            `🔥 *Daily Streak:* ${user.currentStreak} days (Best: ${user.longestStreak || user.currentStreak})\n` +
            `✨ *Total Points:* ${user.totalScore}\n\n` +
            `📊 *Performance Analytics:*\n` +
            `• Accuracy: ${accuracy}%\n` +
            `• Attempted: ${user.stats.totalAttempted}\n` +
            `• Best Subject: ${bestCategory}${bestAcc > 0 ? ` (${bestAcc.toFixed(0)}%)` : ''}\n\n` +
            `🎖️ *Achievement Badges:*\n${badgeDisplay}\n\n` +
            `🌟 *Monthly Score:* ${user.monthlyScore}\n` +
            `📊 *Weekly Score:* ${user.weeklyScore}` +
            nextRankText;

        bot.sendMessage(msg.chat.id, profileText, { parse_mode: 'Markdown' });
    } catch (err) {
        console.error('Error fetching user profile:', err);
    }
});

// Random Quiz Challenge command
bot.onText(/\/random(@\w+)?/, async (msg) => {
    if (checkRateLimit(msg.from.id)) return;
    const chatId = msg.chat.id;

    try {
        const pool = await Question.find({ isFlagged: { $ne: true } }).sort({ lastUsed: 1 }).limit(15);
        if (!pool || pool.length === 0) {
            return bot.sendMessage(chatId, "⚠️ No HP GK questions available right now.");
        }

        const rawQ = pool[Math.floor(Math.random() * pool.length)];
        const q = shuffleQuestionOptions(rawQ);
        await Question.updateOne({ _id: q._id }, { lastUsed: new Date() });
        let qText = `🎲 *Instant HP GK Challenge!*\n\n${q.question}`;
        if (qText.length > 300) qText = qText.substring(0, 297) + '...';

        let explanationText = q.explanation || '';
        if (explanationText.length > 200) explanationText = explanationText.substring(0, 197) + '...';

        const optionsText = q.options.map(opt => opt.length > 100 ? opt.substring(0, 97) + '...' : opt);
        const openPeriod = 20;

        await bot.sendPoll(chatId, qText, optionsText, {
            type: 'quiz',
            correct_option_id: q.correctIndex,
            is_anonymous: false,
            open_period: openPeriod,
            explanation: explanationText
        });

        // Automatically reveal answer and explanation when timer ends
        setTimeout(async () => {
            const answerReveal = `✅ *Answer & Explanation*\n\n` +
                `Q: *${q.question}*\n\n` +
                `✅ *Correct Answer:* ${q.options[q.correctIndex]}\n` +
                `ℹ️ *Explanation:* ${q.explanation}`;

            const inlineKeyboard = {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "🚩 Report Issue with Question", callback_data: `flag_q_${q._id}` }]
                    ]
                }
            };

            try {
                await bot.sendMessage(chatId, answerReveal, { parse_mode: 'Markdown', ...inlineKeyboard });
            } catch (err) {
                const plainReveal = `✅ Answer & Explanation\n\n` +
                    `Q: ${q.question}\n\n` +
                    `✅ Correct Answer: ${q.options[q.correctIndex]}\n` +
                    `ℹ️ Explanation: ${q.explanation}`;
                await bot.sendMessage(chatId, plainReveal, inlineKeyboard).catch(e => console.error('Error sending plain reveal:', e.message));
            }
        }, (openPeriod + 1) * 1000);

    } catch (err) {
        console.error('Error sending random question:', err.message);
    }
});

// Manual start command
bot.onText(/\/startquiz(@\w+)?/, async (msg) => {
    const chatId = msg.chat.id;

    if (ADMIN_ID && chatId.toString() !== ADMIN_ID.toString()) {
        return bot.sendMessage(chatId, "⚠️ Unauthorised. Only admins can manually start the quiz.");
    }

    bot.sendMessage(chatId, "🚀 Starting quiz manually...");
    const status = await startQuiz();

    if (status === 'RUNNING') {
        bot.sendMessage(chatId, "⚠️ A quiz is already in progress. Please wait for it to finish.");
    }
});

// User Reporting / Flag Command (e.g. /flag [question text])
bot.onText(/\/flag\b(@\w+)?(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const queryStr = match[2] ? match[2].trim() : '';

    if (!queryStr) {
        return bot.sendMessage(chatId, "🚩 *Report a Question Issue*\n\nTo report a question, tap the *'🚩 Report Q'* button under the quiz answer summary message, or type:\n`/flag [question text]`", { parse_mode: 'Markdown' });
    }

    try {
        const matchingQ = await Question.findOne({ question: new RegExp(queryStr, 'i') });
        if (!matchingQ) {
            return bot.sendMessage(chatId, `⚠️ Could not find a question matching "${queryStr}". Make sure to copy the question text!`);
        }

        matchingQ.flagCount = (matchingQ.flagCount || 0) + 1;
        if (matchingQ.flagCount >= 2) {
            matchingQ.isFlagged = true;
        }
        await matchingQ.save();

        bot.sendMessage(chatId, `🚩 *Thank you!* The question has been reported to Admin for review.`, { parse_mode: 'Markdown' });
    } catch (err) {
        bot.sendMessage(chatId, `Error reporting question: ${err.message}`);
    }
});

// Helper: Escape regex special characters to prevent regex crashes with names like "Aspirant.."
function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Battle Mode: Challenge Command (supports @username, Display Name, Reply-to-message, or empty /challenge)
bot.onText(/\/challenge\b(@\w+)?(?:\s+(.+))?/i, async (msg, match) => {
    if (checkRateLimit(msg.from.id)) return;
    const chatId = msg.chat.id;
    const challengerId = msg.from.id.toString();
    const challengerName = (msg.from.first_name + (msg.from.last_name ? ` ${msg.from.last_name}` : '')).trim();
    const queryStr = match[2] ? match[2].trim() : '';

    const User = require('../models/User');
    const Battle = require('../models/Battle');

    try {
        // Concurrency Gate: Only 1 duel can run at a time per group!
        const activeBattle = await Battle.findOne({
            groupChatId: chatId.toString(),
            status: 'ACCEPTED'
        });

        if (activeBattle) {
            return bot.sendMessage(
                chatId,
                `⚔️ *A 1v1 DUEL IS ALREADY IN PROGRESS!* ⚔️\n\n` +
                `🔥 *${activeBattle.challengerName}* and *${activeBattle.challengedName}* are currently battling in this arena!\n\n` +
                `⏳ Please wait ~1 minute for their match to finish before starting a new duel.`,
                { parse_mode: 'Markdown' }
            );
        }

        let challengedUser = null;
        let challengedDisplayName = '';

        // 1. Check if user is replying to someone's message in the group
        if (msg.reply_to_message && msg.reply_to_message.from) {
            const repliedFrom = msg.reply_to_message.from;
            if (repliedFrom.is_bot) {
                return bot.sendMessage(chatId, "🤖 You cannot duel a bot! Choose a human opponent. 😉");
            }
            const repliedId = repliedFrom.id.toString();
            challengedUser = await User.findOne({ telegramId: repliedId });
            if (!challengedUser) {
                // Auto-register user in DB if active in chat
                challengedUser = new User({
                    telegramId: repliedId,
                    firstName: repliedFrom.first_name || 'Player',
                    lastName: repliedFrom.last_name || '',
                    username: repliedFrom.username || ''
                });
                await challengedUser.save();
            }
            challengedDisplayName = (challengedUser.firstName + (challengedUser.lastName ? ` ${challengedUser.lastName}` : '')).trim();
        } else if (queryStr) {
            // 2. Query specified (e.g. /challenge Aspirant.. or /challenge @username)
            const cleanQuery = queryStr.replace(/^@/, '').trim();
            const escaped = escapeRegex(cleanQuery);

            // A. Exact username match (case-insensitive)
            challengedUser = await User.findOne({ username: new RegExp(`^${escaped}$`, 'i') });

            // B. Exact First Name match (case-insensitive)
            if (!challengedUser) {
                challengedUser = await User.findOne({ firstName: new RegExp(`^${escaped}$`, 'i') });
            }

            // C. Full Name match across active users
            if (!challengedUser) {
                const candidateUsers = await User.find({}, 'telegramId firstName lastName username');
                challengedUser = candidateUsers.find(u => {
                    const full = (u.firstName + (u.lastName ? ` ${u.lastName}` : '')).trim().toLowerCase();
                    return full === cleanQuery.toLowerCase() || u.firstName?.trim().toLowerCase() === cleanQuery.toLowerCase();
                });
            }

            // D. Loose substring/prefix match
            if (!challengedUser) {
                challengedUser = await User.findOne({
                    $or: [
                        { firstName: new RegExp(escaped, 'i') },
                        { username: new RegExp(escaped, 'i') },
                        { lastName: new RegExp(escaped, 'i') }
                    ]
                });
            }

            if (!challengedUser) {
                return bot.sendMessage(
                    chatId,
                    `❌ I couldn't find *${queryStr}* in our player records.\n\n` +
                    `💡 *Tips to challenge:*\n` +
                    `• *Reply* directly to any message by the user with \`/challenge\`\n` +
                    `• Or use their exact Telegram handle: \`/challenge @username\``,
                    { parse_mode: 'Markdown' }
                );
            }

            challengedDisplayName = (challengedUser.firstName + (challengedUser.lastName ? ` ${challengedUser.lastName}` : '')).trim();
        } else {
            // 3. No query and no reply provided -> Auto-match with a random active player from DB!
            const randomOpponents = await User.aggregate([
                { $match: { telegramId: { $ne: challengerId } } },
                { $sample: { size: 1 } }
            ]);

            if (randomOpponents && randomOpponents.length > 0) {
                challengedUser = randomOpponents[0];
                challengedDisplayName = (challengedUser.firstName + (challengedUser.lastName ? ` ${challengedUser.lastName}` : '')).trim();
            } else {
                challengedDisplayName = "ANYONE in this group";
            }
        }

        if (challengedUser && challengedUser.telegramId === challengerId) {
            return bot.sendMessage(chatId, "🤝 You can't challenge yourself! Find a worthy opponent. 😉");
        }

        const handleSuffix = (challengedUser && challengedUser.username) ? ` (@${challengedUser.username})` : '';
        const targetIdParam = challengedUser ? challengedUser.telegramId : 'any';

        const options = {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: "⚔️ Accept Duel", callback_data: `battle_accept_${challengerId}_${targetIdParam}` },
                    { text: "❌ Decline", callback_data: `battle_decline_${challengerId}_${targetIdParam}` }
                ]]
            }
        };

        const isRandomMatch = !queryStr && (!msg.reply_to_message || !msg.reply_to_message.from);
        const headerTitle = isRandomMatch ? "🎲 *RANDOM MATCHMAKING DUEL!* ⚔️" : "⚔️ *QUIZ DUEL CHALLENGE!* ⚔️";

        const inviteMsg = `${headerTitle}\n\n` +
            `*${challengerName}* has initiated a 1v1 HP Rank Battle against *${challengedDisplayName}*${handleSuffix}!\n\n` +
            `🔹 Questions: 5 (Fast-paced HP GK)\n` +
            `🔹 Time per round: 20s\n\n` +
            `*${challengedDisplayName}* (or anyone in this group), tap below to start the duel!`;

        bot.sendMessage(chatId, inviteMsg, options);
    } catch (err) {
        console.error('Error initiating challenge:', err);
    }
});

// AI Question Generator Command (Admin Only)
bot.onText(/\/generate(@\w+)?(?:\s+(\d+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (ADMIN_ID && chatId.toString() !== ADMIN_ID.toString()) {
        return bot.sendMessage(chatId, "⚠️ Unauthorised.");
    }

    const count = parseInt(match[2] || '10', 10);
    const { generateAiQuestions } = require('../services/aiQuestionGenerator');

    const statusMsg = await bot.sendMessage(chatId, `🤖 *AI Question Generator Started*\n\nGenerating ${count} fresh HP GK questions using Gemini AI... Please wait!`, { parse_mode: 'Markdown' });

    try {
        const result = await generateAiQuestions(count);
        const report = `🎉 *AI Question Generation Complete!*\n\n` +
            `✅ *Added:* ${result.addedCount} new unique questions\n` +
            `⏭️ *Skipped:* ${result.skippedCount} duplicate questions\n` +
            `📦 *Total Bank Size:* ${result.totalQuestions} questions in DB! 🚀`;

        bot.editMessageText(report, { chatId, message_id: statusMsg.message_id, parse_mode: 'Markdown' }).catch(() => {
            bot.sendMessage(chatId, report, { parse_mode: 'Markdown' });
        });
    } catch (err) {
        const errMsg = `❌ *AI Generation Failed:* ${err.message}\n\nMake sure GEMINI_API_KEY is set in .env!`;
        bot.editMessageText(errMsg, { chatId, message_id: statusMsg.message_id, parse_mode: 'Markdown' }).catch(() => {
            bot.sendMessage(chatId, errMsg, { parse_mode: 'Markdown' });
        });
    }
});

// Admin Command: Manage Flagged/Quarantined Questions (matches /flagged or /flaged)
bot.onText(/\/(flagged|flaged)(@\w+)?/i, async (msg) => {
    const chatId = msg.chat.id;
    if (ADMIN_ID && chatId.toString() !== ADMIN_ID.toString()) {
        return bot.sendMessage(chatId, "⚠️ Unauthorised.");
    }

    try {
        const flaggedQs = await Question.find({ $or: [{ isFlagged: true }, { flagCount: { $gt: 0 } }] });
        if (!flaggedQs || flaggedQs.length === 0) {
            return bot.sendMessage(chatId, "✅ No reported/quarantined questions in database.");
        }

        await bot.sendMessage(chatId, `🚩 *Found ${flaggedQs.length} Quarantined Questions:*`, { parse_mode: 'Markdown' });

        for (let i = 0; i < Math.min(flaggedQs.length, 5); i++) {
            const q = flaggedQs[i];
            const text = `*Q${i + 1}:* ${q.question}\n✅ *Current Marked Ans:* ${q.options[q.correctIndex]}\n🚩 *Total Flags:* ${q.flagCount}`;
            const opts = {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "🤖 AI Auto-Fix & Audit", callback_data: `aiaudit_q_${q._id}` }],
                        [
                            { text: "✅ Approve & Restore", callback_data: `unflag_${q._id}` },
                            { text: "🗑️ Delete Question", callback_data: `delete_q_${q._id}` }
                        ]
                    ]
                }
            };
            await bot.sendMessage(chatId, text, opts);
        }
    } catch (err) {
        bot.sendMessage(chatId, `Error fetching flagged questions: ${err.message}`);
    }
});

// Settings command
bot.onText(/\/settings(@\w+)?/, async (msg) => {
    if (checkRateLimit(msg.from.id)) return;
    const chatId = msg.chat.id;

    if (ADMIN_ID && chatId.toString() !== ADMIN_ID.toString()) {
        return bot.sendMessage(chatId, "⚠️ Unauthorised.");
    }

    const quizTime = await getSetting('quizTime') || '20:00';
    const categories = await getSetting('quizCategories') || ['All'];
    const count = await getSetting('questionCount') || 15;

    const message = `⚙️ *Quiz Bot Settings*\n\n` +
        `⏰ *Time:* ${quizTime} (IST)\n` +
        `📚 *Categories:* ${categories.join(', ')}\n` +
        `🔢 *Questions:* ${count}\n\n` +
        `Choose a setting to modify:`;

    const options = {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: "⏰ Change Time", callback_data: "set_time" }],
                [{ text: "📚 Select Categories", callback_data: "set_categories" }],
                [{ text: "🔢 Question Count", callback_data: "set_count" }],
                [{ text: "🔄 Restart Scheduler", callback_data: "restart_scheduler" }]
            ]
        }
    };

    bot.sendMessage(chatId, message, options);
});

// Callback Query Handler for Settings
bot.on('callback_query', async (callbackQuery) => {
    if (checkRateLimit(callbackQuery.from.id)) {
        return bot.answerCallbackQuery(callbackQuery.id, { text: "⚠️ Slow down! Please wait a moment.", show_alert: true });
    }
    const { data, message } = callbackQuery;
    const chatId = message.chat.id;

    if (data === 'set_categories') {
        const allCategories = await Question.distinct('category');
        const selected = await getSetting('quizCategories') || ['All'];

        const buttons = allCategories.map(cat => ([{
            text: `${selected.includes(cat) ? '✅' : '⬜️'} ${cat}`,
            callback_data: `toggle_cat_${cat}`
        }]));

        buttons.push([{ text: "✅ Done", callback_data: "main_menu" }]);

        bot.editMessageText("📚 *Select Categories*\n\nClick to toggle categories for the quiz:", {
            chat_id: chatId,
            message_id: message.message_id,
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: buttons }
        }).catch(err => {
            if (!err.message.includes('message is not modified')) console.error('Error editing message:', err.message);
        });
    } else if (data.startsWith('toggle_cat_')) {
        const cat = data.replace('toggle_cat_', '');
        let selected = await getSetting('quizCategories') || ['All'];

        if (selected.includes(cat)) {
            selected = selected.filter(c => c !== cat);
        } else {
            selected.push(cat);
        }

        if (selected.length === 0) selected = ['All'];
        else selected = selected.filter(c => c !== 'All');

        await setSetting('quizCategories', selected);

        // Refresh the categories menu
        const allCategories = await Question.distinct('category');
        const buttons = allCategories.map(c => ([{
            text: `${selected.includes(c) ? '✅' : '⬜️'} ${c}`,
            callback_data: `toggle_cat_${c}`
        }]));
        buttons.push([{ text: "✅ Done", callback_data: "main_menu" }]);

        bot.editMessageReplyMarkup({ inline_keyboard: buttons }, {
            chat_id: chatId,
            message_id: message.message_id
        }).catch(err => {
            if (!err.message.includes('message is not modified')) console.error('Error editing reply markup:', err.message);
        });
    } else if (data === 'main_menu') {
        const quizTime = await getSetting('quizTime') || '20:00';
        const categories = await getSetting('quizCategories') || ['All'];
        const count = await getSetting('questionCount') || 15;

        const text = `⚙️ *Quiz Bot Settings*\n\n` +
            `⏰ *Time:* ${quizTime} (IST)\n` +
            `📚 *Categories:* ${categories.join(', ')}\n` +
            `🔢 *Questions:* ${count}\n\n` +
            `Choose a setting to modify:`;

        bot.editMessageText(text, {
            chat_id: chatId,
            message_id: message.message_id,
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: "⏰ Change Time", callback_data: "set_time" }],
                    [{ text: "📚 Select Categories", callback_data: "set_categories" }],
                    [{ text: "🔢 Question Count", callback_data: "set_count" }],
                    [{ text: "🔄 Restart Scheduler", callback_data: "restart_scheduler" }]
                ]
            }
        }).catch(err => {
            if (!err.message.includes('message is not modified')) console.error('Error editing message:', err.message);
        });
    } else if (data === 'set_time') {
        bot.sendMessage(chatId, "⏰ Please send the new quiz time in HH:mm format (e.g., 21:00).");
        bot.once('message', async (msg) => {
            if (msg.text && /^([01]\d|2[0-3]):([0-5]\d)$/.test(msg.text)) {
                await setSetting('quizTime', msg.text);
                bot.sendMessage(chatId, `✅ Quiz time updated to ${msg.text}.\n\n⚠️ IMPORTANT: Click '🔄 Restart Scheduler' in /settings to apply this change.`);
            } else if (msg.chat.id === chatId) {
                bot.sendMessage(chatId, "❌ Invalid format. Use HH:mm (e.g., 20:30).");
            }
        });
    } else if (data === 'set_count') {
        bot.sendMessage(chatId, "🔢 How many questions should the quiz have? (Enter a number between 5 and 60)");
        bot.once('message', async (msg) => {
            if (msg.chat.id !== chatId) return;
            const num = parseInt(msg.text);
            if (!isNaN(num) && num >= 5 && num <= 60) {
                await setSetting('questionCount', num);
                bot.sendMessage(chatId, `✅ Question count updated to ${num}.`);
            } else {
                bot.sendMessage(chatId, "❌ Please enter a valid number between 5 and 60.");
            }
        });
    } else if (data === 'restart_scheduler') {
        await initScheduler();
        bot.answerCallbackQuery(callbackQuery.id, { text: "🔄 Scheduler Restarted!" });
    } else if (data.startsWith('lb_')) {
        const type = data.replace('lb_', '');
        const User = require('../models/User');

        let sortField = 'weeklyScore';
        let title = "📊 Weekly Leaderboard";

        if (type === 'monthly') {
            sortField = 'monthlyScore';
            title = "🌟 Monthly Leaderboard";
        } else if (type === 'alltime') {
            sortField = 'totalScore';
            title = "🏆 All-Time Hall of Fame";
        }

        const topUsers = await User.find({ [sortField]: { $gt: 0 } })
            .sort({ [sortField]: -1 })
            .limit(10);

        if (topUsers.length === 0) {
            bot.editMessageText(`ℹ️ No scores recorded yet for ${title}.`, {
                chat_id: chatId,
                message_id: message.message_id
            });
        } else {
            const { getRankDetails } = require('../utils/rankUtils');
            let lbText = `✨ *${title}* ✨\n\n`;
            const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];

            topUsers.forEach((user, idx) => {
                const name = user.firstName + (user.lastName ? ` ${user.lastName}` : '');
                const rank = getRankDetails(user.totalScore);
                lbText += `${medals[idx]} ${rank.emoji} *${name}*: ${user[sortField]} pts\n`;
            });

            bot.editMessageText(lbText, {
                chat_id: chatId,
                message_id: message.message_id,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: "⬅️ Back", callback_data: "lb_main" }]]
                }
            }).catch(err => {
                if (!err.message.includes('message is not modified')) console.error('Error editing leaderboard:', err.message);
            });
        }
    } else if (data.startsWith('battle_accept_') || data.startsWith('battle_decline_')) {
        const parts = data.split('_');
        const action = parts[1];
        const challengerId = parts[2];
        const challengedId = parts[3];
        const acceptingUserId = callbackQuery.from.id.toString();

        // Prevent challenger from accepting/declining their own match
        if (acceptingUserId === challengerId) {
            return bot.answerCallbackQuery(callbackQuery.id, { text: "⚠️ You cannot accept your own challenge! Wait for an opponent to join.", show_alert: true });
        }

        // If specific user was challenged and action is decline, only they can decline
        if (challengedId !== 'any' && challengedId !== acceptingUserId && action === 'decline') {
            return bot.answerCallbackQuery(callbackQuery.id, { text: "⚠️ Only the challenged player can decline this match.", show_alert: true });
        }

        const Battle = require('../models/Battle');
        const Question = require('../models/Question');

        if (action === 'decline') {
            await bot.editMessageText("❌ Challenge Declined.", { chat_id: chatId, message_id: message.message_id });
            return;
        }

        // --- ACCEPTED ---
        try {
            // Concurrency Gate: Check if another battle is already in progress
            const runningBattle = await Battle.findOne({
                groupChatId: chatId.toString(),
                status: 'ACCEPTED'
            });

            if (runningBattle) {
                return bot.answerCallbackQuery(callbackQuery.id, {
                    text: `⚠️ A 1v1 duel between ${runningBattle.challengerName} and ${runningBattle.challengedName} is already running in this group! Please wait for it to finish.`,
                    show_alert: true
                });
            }

            const questions = await Question.aggregate([{ $sample: { size: 5 } }]);
            const questionData = questions.map(q => ({ questionId: q._id, correctIndex: q.correctIndex }));

            const actualChallengedId = acceptingUserId;
            const actualChallengedName = (callbackQuery.from.first_name + (callbackQuery.from.last_name ? ` ${callbackQuery.from.last_name}` : '')).trim();

            const battle = new Battle({
                challengerId,
                challengerName: "",
                challengedId: actualChallengedId,
                challengedName: actualChallengedName,
                groupChatId: chatId,
                status: 'ACCEPTED',
                questions: questionData
            });

            // Get names for display
            const User = require('../models/User');
            const cUser = await User.findOne({ telegramId: challengerId });
            battle.challengerName = cUser ? (cUser.firstName + (cUser.lastName ? ` ${cUser.lastName}` : '')).trim() : "Challenger";
            await battle.save();

            await bot.editMessageText(
                `⚔️ *DUEL ACCEPTED! COMMENCING LIVE IN THIS GROUP!* ⚔️\n\n` +
                `🔥 *${battle.challengerName}* 🆚 *${actualChallengedName}*\n\n` +
                `🔹 Total Rounds: 5 (15 seconds per question)\n` +
                `🔹 Both duelists: tap your answers in the polls below!\n\n` +
                `🏁 *Round 1 starts in 3 seconds!*`,
                {
                    chat_id: chatId,
                    message_id: message.message_id,
                    parse_mode: 'Markdown'
                }
            );

            // Trigger Live In-Group Duel Runner asynchronously
            setTimeout(() => {
                runGroupBattle(battle._id, chatId);
            }, 3000);

        } catch (err) {
            console.error('Error starting battle:', err);
        }
    } else if (data === 'lb_main') {
        bot.editMessageText("🏆 *Global Hall of Fame*\nSelect the leaderboard you want to view:", {
            chat_id: chatId,
            message_id: message.message_id,
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "📊 Weekly", callback_data: "lb_weekly" },
                        { text: "🌟 Monthly", callback_data: "lb_monthly" }
                    ],
                    [{ text: "🏆 All-Time", callback_data: "lb_alltime" }]
                ]
            }
        }).catch(err => {
            if (!err.message.includes('message is not modified')) console.error('Error editing leaderboard menu:', err.message);
        });
    } else if (data.startsWith('flag_q_')) {
        const qId = data.replace('flag_q_', '');
        try {
            const q = await Question.findById(qId);
            if (!q) {
                return bot.answerCallbackQuery(callbackQuery.id, { text: "Question not found." });
            }

            q.flagCount = (q.flagCount || 0) + 1;
            if (q.flagCount >= 2) {
                q.isFlagged = true; // Auto Quarantine
            }
            await q.save();

            bot.answerCallbackQuery(callbackQuery.id, { text: "🚩 Thank you! Issue reported to Admin." });

            if (ADMIN_ID) {
                const adminMsg = `🚩 *Question Reported by User*\n\n` +
                    `*Q:* ${q.question}\n` +
                    `*Total Flags:* ${q.flagCount}\n` +
                    `*Auto-Quarantined:* ${q.isFlagged ? 'YES 🛑 (Removed from Quiz Pool)' : 'NO ⏳'}`;
                bot.sendMessage(ADMIN_ID, adminMsg, { parse_mode: 'Markdown' }).catch(() => {});
            }
        } catch (err) {
            console.error('Error handling flag_q:', err.message);
        }
        return;
    } else if (data.startsWith('aiaudit_q_')) {
        const qId = data.replace('aiaudit_q_', '');
        const messageId = message.message_id;
        bot.answerCallbackQuery(callbackQuery.id, { text: "🤖 AI Reviewer Agent auditing question..." });
        bot.editMessageText(`🤖 *AI Reviewer Agent auditing question... Please wait!*`, { chatId, message_id: messageId, parse_mode: 'Markdown' }).catch(() => {});

        try {
            const { auditSingleQuestionWithAi } = require('../services/aiQuestionGenerator');
            const res = await auditSingleQuestionWithAi(qId);

            if (res.status === 'FIXED') {
                const report = `🤖 *AI Auto-Corrected & Restored!*\n\n` +
                    `*Q:* ${res.question.question}\n` +
                    `✅ *Correct Answer:* ${res.question.options[res.question.correctIndex]}\n` +
                    `ℹ️ *Explanation:* ${res.question.explanation}\n\n` +
                    `🛠️ *Audit Notes:* ${res.changesMade}\n\n` +
                    `✅ *Status:* Factually verified & restored to active quiz pool! 🚀`;

                bot.editMessageText(report, { chatId, message_id: messageId, parse_mode: 'Markdown' }).catch(() => {
                    bot.sendMessage(chatId, report, { parse_mode: 'Markdown' });
                });
            } else {
                const report = `⚠️ *AI Recommendation: DELETE QUESTION!*\n\n` +
                    `*Q:* ${res.question.question}\n` +
                    `❌ *Reason:* ${res.reason}\n\n` +
                    `Tap below to delete this question:`;

                const opts = {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "🗑️ Confirm Delete Question", callback_data: `delete_q_${res.question._id}` }]
                        ]
                    }
                };

                bot.editMessageText(report, { chatId, message_id: messageId, ...opts }).catch(() => {
                    bot.sendMessage(chatId, report, opts);
                });
            }
        } catch (err) {
            bot.sendMessage(chatId, `❌ AI Audit Error: ${err.message}`);
        }
        return;
    } else if (data.startsWith('unflag_')) {
        const qId = data.replace('unflag_', '');
        try {
            await Question.updateOne({ _id: qId }, { isFlagged: false, flagCount: 0 });
            bot.answerCallbackQuery(callbackQuery.id, { text: "✅ Question restored to active pool!" });
            bot.editMessageText(`✅ *Question Approved & Restored to Active Pool!*`, { chatId, message_id: message.message_id, parse_mode: 'Markdown' }).catch(() => {});
        } catch (err) {
            console.error('Error unflagging question:', err.message);
        }
        return;
    } else if (data.startsWith('delete_q_')) {
        const qId = data.replace('delete_q_', '');
        try {
            await Question.deleteOne({ _id: qId });
            bot.answerCallbackQuery(callbackQuery.id, { text: "🗑️ Question permanently deleted!" });
            bot.editMessageText(`🗑️ *Question Deleted Permanently.*`, { chatId, message_id: message.message_id, parse_mode: 'Markdown' }).catch(() => {});
        } catch (err) {
            console.error('Error deleting question:', err.message);
        }
        return;
    }

    bot.answerCallbackQuery(callbackQuery.id).catch(() => { });
});

/**
 * Executes a 1v1 Battle live in the group chat round by round
 */
async function runGroupBattle(battleId, chatId) {
    const Battle = require('../models/Battle');
    const Question = require('../models/Question');
    const delay = (ms) => new Promise(r => setTimeout(r, ms));

    try {
        const battle = await Battle.findById(battleId);
        if (!battle) return;

        for (let i = 0; i < battle.questions.length; i++) {
            const qData = battle.questions[i];
            const qObj = await Question.findById(qData.questionId);
            if (!qObj) continue;

            let qTitle = `⚔️ DUEL Round ${i + 1}/5 (${battle.challengerName} 🆚 ${battle.challengedName}):\n${qObj.question}`;
            if (qTitle.length > 300) qTitle = qTitle.substring(0, 297) + '...';

            const options = qObj.options.map(opt => opt.length > 100 ? opt.substring(0, 97) + '...' : opt);
            const explanation = qObj.explanation ? (qObj.explanation.length > 200 ? qObj.explanation.substring(0, 197) + '...' : qObj.explanation) : undefined;

            const pollMsg = await bot.sendPoll(chatId, qTitle, options, {
                type: 'quiz',
                correct_option_id: qObj.correctIndex,
                is_anonymous: false,
                open_period: 15,
                explanation: explanation
            });

            const pollId = (pollMsg.poll && pollMsg.poll.id) || pollMsg.poll_id || String(pollMsg.message_id);
            battle.pollIds.set(pollId, String(i));
            await battle.save();

            // Wait 15s poll time + 2s intermission before next round
            await delay(17000);
        }

        // Fetch refreshed battle to get final scores
        const finalBattle = await Battle.findById(battleId);
        const p1Score = finalBattle.challengerScore;
        const p2Score = finalBattle.challengedScore;

        let resultText = `🏆 *DUEL FINISHED! FINAL SCOREBOARD* 🏆\n\n` +
            `⚔️ *${finalBattle.challengerName}* [ *${p1Score}* ] 🆚 *${finalBattle.challengedName}* [ *${p2Score}* ]\n\n`;

        if (p1Score > p2Score) {
            resultText += `🥇 Winner: *${finalBattle.challengerName}*! 🎉👑 (+${p1Score} Points)\n` +
                          `👏 Tough fight by *${finalBattle.challengedName}*! (+${p2Score} Points)`;
        } else if (p2Score > p1Score) {
            resultText += `🥇 Winner: *${finalBattle.challengedName}*! 🎉👑 (+${p2Score} Points)\n` +
                          `👏 Tough fight by *${finalBattle.challengerName}*! (+${p1Score} Points)`;
        } else {
            resultText += `🤝 It's a DRAW! Both warriors scored ${p1Score}/5! ✨`;
        }

        resultText += `\n\n💬 *Want to challenge the winner or battle a friend?*\nType \`/challenge\` in this group now! 🚀`;

        await bot.sendMessage(chatId, resultText, { parse_mode: 'Markdown' });

        finalBattle.status = 'COMPLETED';
        await finalBattle.save();

    } catch (err) {
        console.error('Error running group battle:', err);
    }
}

// Real-time Score Tracking (Group Mode & Duels)
bot.on('poll_answer', async (answer) => {
    const pollId = answer.poll_id;
    const userId = answer.user.id;
    const firstName = answer.user.first_name;
    const lastName = answer.user.last_name || '';
    const username = answer.user.username || '';
    const fullName = (firstName + ' ' + lastName).trim();
    const selectedOption = answer.option_ids[0];

    try {
        const QuizSession = require('../models/QuizSession');
        const Battle = require('../models/Battle');

        const today = new Date().toISOString().split('T')[0];
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

        // --- A. CHECK FOR LIVE 1v1 BATTLE ---
        const battle = await Battle.findOne({ status: 'ACCEPTED', [`pollIds.${pollId}`]: { $exists: true } });
        if (battle) {
            const isChallenger = battle.challengerId === userId.toString();
            const isChallenged = battle.challengedId === userId.toString();

            // STRICT: Non-duelist spectator votes are completely ignored!
            if (!isChallenger && !isChallenged) {
                return;
            }

            const roundIndexStr = battle.pollIds.get(pollId);
            const roundIndex = parseInt(roundIndexStr, 10) || 0;
            const currentQ = battle.questions[roundIndex];
            const isCorrect = currentQ && selectedOption === currentQ.correctIndex;

            if (isCorrect) {
                if (isChallenger) {
                    battle.challengerScore += 1;
                } else if (isChallenged) {
                    battle.challengedScore += 1;
                }
                await battle.save();
            }

            // Only update stats for the two active duelists
            await updateUserStats(userId, fullName, username, firstName, lastName, isCorrect, 'Duel', today, yesterday);
            return;
        }

        // --- B. CHECK FOR GROUP QUIZ SESSION ---
        const session = await QuizSession.findOne({ isActive: true, 'questions.pollId': pollId });
        if (session) {
            const question = session.questions.find(q => q.pollId === pollId);
            if (!question) return;

            const isCorrect = selectedOption === question.correctIndex;
            const category = question.category || 'General';

            if (isCorrect) {
                const userScore = session.scores.get(userId.toString()) || {
                    name: fullName,
                    score: 0,
                    telegramId: userId.toString()
                };
                userScore.score += 1;
                userScore.telegramId = userId.toString();
                session.scores.set(userId.toString(), userScore);
                await session.save();
            }

            await updateUserStats(userId, fullName, username, firstName, lastName, isCorrect, category, today, yesterday);
            return;
        }

    } catch (err) {
        console.error('Error processing poll answer:', err);
    }
});

// Helper Function for User Stats
async function updateUserStats(userId, fullName, username, firstName, lastName, isCorrect, category, today, yesterday) {
    const User = require('../models/User');
    let user = await User.findOne({ telegramId: userId.toString() });
    if (!user) {
        user = new User({
            telegramId: userId.toString(),
            firstName, lastName, username
        });
    }

    // Streak Logic
    if (user.lastParticipationDate !== today) {
        if (user.lastParticipationDate === yesterday) {
            user.currentStreak += 1;
        } else {
            user.currentStreak = 1;
        }
        if (user.currentStreak > user.longestStreak) {
            user.longestStreak = user.currentStreak;
        }
        user.lastParticipationDate = today;
    }

    // Stats Logic
    user.stats.totalAttempted += 1;
    if (isCorrect) {
        user.stats.totalCorrect += 1;
        user.totalScore += 1;
        user.weeklyScore += 1;
        user.monthlyScore += 1;
    }

    // Category Stats Logic
    const catStat = user.stats.categoryStats.get(category) || { correct: 0, attempted: 0 };
    catStat.attempted += 1;
    if (isCorrect) catStat.correct += 1;
    user.stats.categoryStats.set(category, catStat);

    user.lastActivity = new Date();

    const channelId = process.env.CHANNEL_ID;

    // --- Rank Milestone Logic (Level-Up Rewards) ---
    const { getRankDetails } = require('../utils/rankUtils');
    const newRank = getRankDetails(user.totalScore);

    const thresholds = [
        { points: 500, title: 'Scholar' },
        { points: 2000, title: 'Expert' },
        { points: 5000, title: 'Rank Master' }
    ];

    for (const mil of thresholds) {
        if (user.totalScore >= mil.points && !user.unlockedRanks.includes(mil.title)) {
            user.unlockedRanks.push(mil.title);

            const celebMsg = `🎊 *RANK UP! LEVEL REACHED!* 🎊\n\n` +
                `Everyone congratulate *${fullName}* for reaching the *${mil.title}* rank! ${newRank.emoji}\n\n` +
                `Keep playing to reach the next tier! 🚀🏁`;

            bot.sendMessage(channelId, celebMsg, { parse_mode: 'Markdown' }).catch(err => {
                console.error('Error sending rank-up celebration:', err);
            });
        }
    }

    // --- Check & Award Achievement Badges ---
    const { checkAndAwardBadges } = require('../utils/badgeUtils');
    const newBadges = checkAndAwardBadges(user);

    if (newBadges.length > 0) {
        for (const badge of newBadges) {
            const badgeMsg = `🎖️ *BADGE UNLOCKED!* 🎖️\n\n` +
                `Congratulations *${fullName}*! You earned the *${badge.name}* ${badge.emoji} badge!\n` +
                `_${badge.description}_ 🚀`;

            bot.sendMessage(channelId, badgeMsg, { parse_mode: 'Markdown' }).catch(err => {
                console.error('Error sending badge announcement:', err);
            });
        }
    }

    await user.save();
}

module.exports = bot;
