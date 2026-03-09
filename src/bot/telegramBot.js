const bot = require('./botInstance');
const { startQuiz } = require('../services/quizRunner');
const { getSetting, setSetting } = require('../services/settingsService');
const { initScheduler } = require('../scheduler/quizScheduler');
const Question = require('../models/Question');

// Admin ID for manual triggers
const ADMIN_ID = process.env.ADMIN_ID;

// Help user get Chat ID
bot.onText(/\/id/, (msg) => {
    bot.sendMessage(msg.chat.id, `ID of this chat: \`${msg.chat.id}\``, { parse_mode: 'Markdown' });
});

// Leaderboard command
bot.onText(/\/leaderboard/, async (msg) => {
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
bot.onText(/\/info/, (msg) => {
    const infoText = `📅 *Daily Quiz Schedule (IST)*\n\n` +
        `🌅 *Morning Session (08:00 AM)*\n` +
        `• Focus: General Knowledge (GK)\n` +
        `• Count: 60 Questions\n` +
        `• Timer: 15 Seconds\n\n` +
        `☀️ *Afternoon Session (02:00 PM)*\n` +
        `• Focus: Current Affairs Only\n` +
        `• Count: 30 Questions\n` +
        `• Timer: 15 Seconds\n\n` +
        `🌙 *Evening Session (08:00 PM)*\n` +
        `• Focus: GK + Current Affairs Mix\n` +
        `• Count: 40 Questions\n` +
        `• Timer: 15 Seconds\n\n` +
        `🏁 *Results & Leaderboards* are posted immediately after every quiz!`;

    bot.sendMessage(msg.chat.id, infoText, { parse_mode: 'Markdown' });
});

// Manual start command
bot.onText(/\/startquiz/, async (msg) => {
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

// Settings command
bot.onText(/\/settings/, async (msg) => {
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
            let lbText = `✨ *${title}* ✨\n\n`;
            const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];

            topUsers.forEach((user, idx) => {
                const name = user.firstName + (user.lastName ? ` ${user.lastName}` : '');
                lbText += `${medals[idx]} *${name}*: ${user[sortField]} pts\n`;
            });

            bot.editMessageText(lbText, {
                chat_id: chatId,
                message_id: message.message_id,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: "⬅️ Back", callback_data: "lb_main" }]]
                }
            });
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
        });
    }

    bot.answerCallbackQuery(callbackQuery.id).catch(() => { });
});

// Real-time Score Tracking (Group Mode)
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
        const User = require('../models/User'); // Import User model
        const session = await QuizSession.findOne({ isActive: true, 'questions.pollId': pollId });

        if (!session) return;

        const question = session.questions.find(q => q.pollId === pollId);
        if (question && selectedOption === question.correctIndex) {
            // 1. Update Session Score (for current quiz leaderboard)
            const userScore = session.scores.get(userId.toString()) || { name: fullName, score: 0 };
            userScore.score += 1;
            session.scores.set(userId.toString(), userScore);
            await session.save();

            // 2. Update Persistent User Score (for Weekly/Monthly Hall of Fame)
            await User.findOneAndUpdate(
                { telegramId: userId.toString() },
                {
                    $inc: { totalScore: 1, weeklyScore: 1, monthlyScore: 1 },
                    $set: {
                        username: username,
                        firstName: firstName,
                        lastName: lastName,
                        lastActivity: new Date()
                    }
                },
                { upsert: true, new: true }
            );
        }
    } catch (err) {
        console.error('Error processing poll answer:', err);
    }
});

module.exports = bot;
