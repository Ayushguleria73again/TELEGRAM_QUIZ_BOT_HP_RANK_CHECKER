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

// Personal info command
bot.onText(/\/me/, async (msg) => {
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

        const profileText = `👤 *Your Professional Profile*\n\n` +
            `🏆 *Current Rank:* ${rank.title} ${rank.emoji}\n` +
            `🔥 *Daily Streak:* ${user.currentStreak} days\n` +
            `✨ *Total Points:* ${user.totalScore}\n\n` +
            `📊 *Performance Analytics:*\n` +
            `• Accuracy: ${accuracy}%\n` +
            `• Attempted: ${user.stats.totalAttempted}\n` +
            `• Best Subject: ${bestCategory}${bestAcc > 0 ? ` (${bestAcc.toFixed(0)}%)` : ''}\n\n` +
            `🌟 *Monthly Score:* ${user.monthlyScore}\n` +
            `📊 *Weekly Score:* ${user.weeklyScore}` +
            nextRankText;

        bot.sendMessage(msg.chat.id, profileText, { parse_mode: 'Markdown' });
    } catch (err) {
        console.error('Error fetching user profile:', err);
    }
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

// Battle Mode: Challenge Command
bot.onText(/\/challenge (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const challengerId = msg.from.id.toString();
    const challengerName = (msg.from.first_name + (msg.from.last_name ? ` ${msg.from.last_name}` : '')).trim();
    const targetUsername = match[1].replace('@', '').trim();

    const User = require('../models/User');
    const Battle = require('../models/Battle');

    try {
        const challengedUser = await User.findOne({ username: new RegExp(`^${targetUsername}$`, 'i') });
        if (!challengedUser) {
            return bot.sendMessage(chatId, `❌ I couldn't find *${targetUsername}*. They must have used the bot at least once to be challenged!`, { parse_mode: 'Markdown' });
        }

        if (challengedUser.telegramId === challengerId) {
            return bot.sendMessage(chatId, "🤝 You can't challenge yourself! Find a worthy opponent. 😉");
        }

        const options = {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: "✅ Accept", callback_data: `battle_accept_${challengerId}_${challengedUser.telegramId}` },
                    { text: "❌ Decline", callback_data: `battle_decline_${challengerId}_${challengedUser.telegramId}` }
                ]]
            }
        };

        const inviteMsg = `⚔️ *QUIZ DUEL CHALLENGE!* ⚔️\n\n` +
            `*${challengerName}* has challenged *${challengedUser.firstName}* (@${targetUsername}) to a 1v1 HP Rank Battle!\n\n` +
            `🔹 Questions: 5\n` +
            `🔹 Category: Random Mix\n\n` +
            `*${challengedUser.firstName}*, do you accept the challenge?`;

        bot.sendMessage(chatId, inviteMsg, options);
    } catch (err) {
        console.error('Error initiating challenge:', err);
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
            });
        }
    } else if (data.startsWith('battle_accept_') || data.startsWith('battle_decline_')) {
        const parts = data.split('_');
        const action = parts[1];
        const challengerId = parts[2];
        const challengedId = parts[3];

        if (callbackQuery.from.id.toString() !== challengedId) {
            return bot.answerCallbackQuery(callbackQuery.id, { text: "⚠️ Only the challenged person can respond!", show_alert: true });
        }

        const Battle = require('../models/Battle');
        const Question = require('../models/Question');

        if (action === 'decline') {
            await bot.editMessageText("❌ Challenge Declined.", { chat_id: chatId, message_id: message.message_id });
            return;
        }

        // --- ACCEPTED ---
        try {
            const questions = await Question.aggregate([{ $sample: { size: 5 } }]);
            const questionData = questions.map(q => ({ questionId: q._id, correctIndex: q.correctIndex }));

            const battle = new Battle({
                challengerId,
                challengerName: "", // We will populate these or use existing info
                challengedId,
                challengedName: callbackQuery.from.first_name,
                groupChatId: chatId,
                status: 'ACCEPTED',
                questions: questionData
            });

            // Get names for display
            const User = require('../models/User');
            const cUser = await User.findOne({ telegramId: challengerId });
            battle.challengerName = cUser ? cUser.firstName : "Challenger";
            await battle.save();

            await bot.editMessageText("⚔️ *DUEL STARTED!* Check your private messages!", {
                chat_id: chatId,
                message_id: message.message_id,
                parse_mode: 'Markdown'
            });

            // Start the private duel by sending the first question to both
            const firstQId = questions[0].questionId;
            const qObj = await Question.findById(firstQId);

            const sendBattlePoll = async (pId, qText, options, cIdx, qNum) => {
                const poll = await bot.sendPoll(pId, `Round ${qNum}/5: ${qText}`, options, {
                    type: 'quiz',
                    correct_option_id: cIdx,
                    is_anonymous: false,
                    open_period: 20
                });
                return poll.poll_id;
            };

            const p1Id = await sendBattlePoll(challengerId, qObj.question, qObj.options, qObj.correctIndex, 1);
            const p2Id = await sendBattlePoll(challengedId, qObj.question, qObj.options, qObj.correctIndex, 1);

            battle.pollIds.set(p1Id, challengerId);
            battle.pollIds.set(p2Id, challengedId);
            await battle.save();
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
        const User = require('../models/User');
        const Battle = require('../models/Battle');
        const Question = require('../models/Question');

        const today = new Date().toISOString().split('T')[0];
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

        // --- A. CHECK FOR GROUP QUIZ SESSION ---
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
                session.scores.set(userId.toString(), userScore);
                await session.save();
            }

            await updateUserStats(userId, fullName, username, firstName, lastName, isCorrect, category, today, yesterday);
            return;
        }

        // --- B. CHECK FOR 1v1 BATTLE ---
        const battle = await Battle.findOne({ status: 'ACCEPTED', [`pollIds.${pollId}`]: { $exists: true } });
        if (battle) {
            const isChallenger = battle.challengerId === userId.toString();
            const currentIndex = isChallenger ? battle.challengerIndex : battle.challengedIndex;
            const currentQ = battle.questions[currentIndex];
            const isCorrect = selectedOption === currentQ.correctIndex;

            if (isCorrect) {
                if (isChallenger) battle.challengerScore += 1;
                else battle.challengedScore += 1;
            }

            // Move to next question or finish
            if (currentIndex < 4) {
                const nextIndex = currentIndex + 1;
                if (isChallenger) battle.challengerIndex = nextIndex;
                else battle.challengedIndex = nextIndex;

                const nextQData = battle.questions[nextIndex];
                const qObj = await Question.findById(nextQData.questionId);

                const nextPoll = await bot.sendPoll(userId, `Round ${nextIndex + 1}/5: ${qObj.question}`, qObj.options, {
                    type: 'quiz',
                    correct_option_id: qObj.correctIndex,
                    is_anonymous: false,
                    open_period: 20
                });

                battle.pollIds.set(nextPoll.poll_id, userId.toString());
            } else {
                if (isChallenger) battle.challengerFinished = true;
                else battle.challengedFinished = true;
                bot.sendMessage(userId, "🏁 You have finished your duel! Waiting for your opponent...");
            }

            await battle.save();

            // Check if both finished to announce winner
            if (battle.challengerFinished && battle.challengedFinished) {
                let resultText = `🏆 *DUEL RESULTS!* 🏆\n\n` +
                    `*${battle.challengerName}* vs *${battle.challengedName}*\n\n` +
                    `📊 Score: ${battle.challengerScore} - ${battle.challengedScore}\n\n`;

                if (battle.challengerScore > battle.challengedScore) {
                    resultText += `🥇 Winner: *${battle.challengerName}*! 🎉`;
                } else if (battle.challengedScore > battle.challengerScore) {
                    resultText += `🥇 Winner: *${battle.challengedName}*! 🎉`;
                } else {
                    resultText += `🤝 It's a DRAW! Well played both. ✨`;
                }

                bot.sendMessage(battle.groupChatId, resultText, { parse_mode: 'Markdown' });
                battle.status = 'COMPLETED';
                await battle.save();
            }

            // Also update all-time stats for battles!
            await updateUserStats(userId, fullName, username, firstName, lastName, isCorrect, 'Duel', today, yesterday);
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
    await user.save();
}

module.exports = bot;
