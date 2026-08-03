const bot = require('../bot/botInstance');
const Question = require('../models/Question');
const User = require('../models/User');
const { getRankDetails } = require('../utils/rankUtils');
const { getBadgeEmojis } = require('../utils/badgeUtils');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config();

const COMMUNITY_CHANNEL_ID = process.env.COMMUNITY_CHANNEL_ID;
const GROUP_JOIN_LINK = process.env.GROUP_JOIN_LINK;

// --- Feature 1: Daily Quiz of the Day ---
const sendDailyTeaser = async () => {
    if (!COMMUNITY_CHANNEL_ID) {
        console.log('COMMUNITY_CHANNEL_ID not set, skipping daily teaser.');
        return;
    }

    try {
        const questions = await Question.aggregate([{ $sample: { size: 1 } }]);
        if (questions.length === 0) {
            console.log('No questions in DB for daily teaser.');
            return;
        }

        const q = questions[0];

        let questionText = `🎯 *Daily HP GK Quiz of the Day!*\n\n${q.question}`;
        if (questionText.length > 300) {
            questionText = questionText.substring(0, 297) + '...';
        }

        const optionsText = q.options.map(opt =>
            opt.length > 100 ? opt.substring(0, 97) + '...' : opt
        );

        let explanationText = q.explanation || '';
        if (explanationText.length > 200) {
            explanationText = explanationText.substring(0, 197) + '...';
        }

        const pollOptions = {
            type: 'quiz',
            correct_option_id: q.correctIndex,
            is_anonymous: true,
            explanation: explanationText
        };

        await bot.sendPoll(COMMUNITY_CHANNEL_ID, questionText, optionsText, pollOptions);

        // Send a follow-up message with join link
        if (GROUP_JOIN_LINK) {
            const followUp = `📚 Want more HP GK questions?\n🏆 Join our daily quiz sessions at 8 AM, 2 PM & 8 PM IST!`;
            await bot.sendMessage(COMMUNITY_CHANNEL_ID, followUp, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🚀 Join Quiz Group Now!', url: GROUP_JOIN_LINK }]
                    ]
                }
            });
        }

        console.log('✅ Daily teaser sent to community channel.');
    } catch (err) {
        console.error('❌ Error sending daily teaser:', err.message);
    }
};

// --- Feature 4: Did You Know (Random HP Facts) ---
const sendDidYouKnow = async () => {
    if (!COMMUNITY_CHANNEL_ID) {
        console.log('COMMUNITY_CHANNEL_ID not set, skipping Did You Know.');
        return;
    }

    try {
        const factsPath = path.join(__dirname, '..', 'data', 'hp_facts.json');
        if (!fs.existsSync(factsPath)) {
            console.log('hp_facts.json not found, skipping Did You Know.');
            return;
        }

        const facts = JSON.parse(fs.readFileSync(factsPath, 'utf8'));
        if (facts.length === 0) return;

        const randomFact = facts[Math.floor(Math.random() * facts.length)];

        const message = `💡 *Did You Know?*\n\n` +
            `${randomFact.fact}\n\n` +
            `📍 _${randomFact.category}_`;

        const options = { parse_mode: 'Markdown' };
        if (GROUP_JOIN_LINK) {
            options.reply_markup = {
                inline_keyboard: [
                    [{ text: '📚 Test Your HP GK!', url: GROUP_JOIN_LINK }]
                ]
            };
        }

        await bot.sendMessage(COMMUNITY_CHANNEL_ID, message, options);
        console.log('✅ Did You Know fact sent to community channel.');
    } catch (err) {
        console.error('❌ Error sending Did You Know:', err.message);
    }
};

// --- Feature 5: Weekly Report Card (Sunday DMs) ---
const sendWeeklyReports = async () => {
    try {
        const activeUsers = await User.find({ weeklyScore: { $gt: 0 } })
            .sort({ weeklyScore: -1 });

        if (activeUsers.length === 0) {
            console.log('No active users this week for report cards.');
            return;
        }

        console.log(`📅 Sending weekly reports to ${activeUsers.length} users...`);

        for (let i = 0; i < activeUsers.length; i++) {
            const user = activeUsers[i];
            const rank = getRankDetails(user.totalScore);
            const weeklyRank = i + 1;

            const accuracy = user.stats.totalAttempted > 0
                ? ((user.stats.totalCorrect / user.stats.totalAttempted) * 100).toFixed(1)
                : 0;

            // Find best category
            let bestCategory = 'None';
            let bestAcc = 0;
            if (user.stats.categoryStats) {
                user.stats.categoryStats.forEach((val, key) => {
                    if (val.attempted >= 5) {
                        const catAcc = (val.correct / val.attempted) * 100;
                        if (catAcc > bestAcc) {
                            bestAcc = catAcc;
                            bestCategory = key;
                        }
                    }
                });
            }

            // Badges display
            const badges = user.badges && user.badges.length > 0
                ? user.badges.map(b => getBadgeEmojis(b)).join(' ')
                : 'None yet — keep playing!';

            const reportMsg = `📅 *Your Weekly Report Card* 📅\n\n` +
                `Hey *${user.firstName}*! Here's how you did this week:\n\n` +
                `🏆 *Weekly Rank:* #${weeklyRank} of ${activeUsers.length}\n` +
                `✨ *Weekly Score:* ${user.weeklyScore} points\n` +
                `📊 *Overall Accuracy:* ${accuracy}%\n` +
                `🔥 *Current Streak:* ${user.currentStreak} days\n` +
                `🏅 *Best Subject:* ${bestCategory}${bestAcc > 0 ? ` (${bestAcc.toFixed(0)}%)` : ''}\n` +
                `${rank.emoji} *Current Rank:* ${rank.title}\n\n` +
                `🎖️ *Badges:* ${badges}\n\n` +
                `Keep going! See you in next week's quizzes! 🚀`;

            try {
                await bot.sendMessage(user.telegramId, reportMsg, { parse_mode: 'Markdown' });
            } catch (dmErr) {
                // User may have blocked the bot or never started a DM
                console.log(`Could not DM user ${user.firstName} (${user.telegramId}): ${dmErr.message}`);
            }

            // Small delay to avoid Telegram rate limits
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        console.log(`✅ Weekly reports sent to ${activeUsers.length} users.`);
    } catch (err) {
        console.error('❌ Error sending weekly reports:', err.message);
    }
};

module.exports = { sendDailyTeaser, sendDidYouKnow, sendWeeklyReports };
