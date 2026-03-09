const cron = require('node-cron');
const { startQuiz, sendCountdown } = require('../services/quizRunner');
const { getSetting } = require('../services/settingsService');
const dotenv = require('dotenv');

dotenv.config();


const initScheduler = async () => {
    // --- 1. Morning Session (08:00 AM) ---
    // 5 min warning
    cron.schedule('55 7 * * *', () => sendCountdown('Morning GK Special', 5), { timezone: "Asia/Kolkata" });
    // 1 min warning
    cron.schedule('59 7 * * *', () => sendCountdown('Morning GK Special', 1), { timezone: "Asia/Kolkata" });
    // Start
    cron.schedule('0 8 * * *', () => {
        console.log('Triggering Morning GK Quiz...');
        startQuiz({
            sessionName: '🌅 Morning GK Special',
            count: 60,
            categories: ['GK'],
            timer: 15
        });
    }, { timezone: "Asia/Kolkata" });

    // --- 2. Afternoon Session (02:00 PM) ---
    // 5 min warning
    cron.schedule('55 13 * * *', () => sendCountdown('Afternoon Current Affairs', 5), { timezone: "Asia/Kolkata" });
    // 1 min warning
    cron.schedule('59 13 * * *', () => sendCountdown('Afternoon Current Affairs', 1), { timezone: "Asia/Kolkata" });
    // Start
    cron.schedule('0 14 * * *', () => {
        console.log('Triggering Afternoon Current Affairs Quiz...');
        startQuiz({
            sessionName: '☀️ Afternoon Current Affairs',
            count: 30,
            categories: ['Current Affairs'],
            timer: 15
        });
    }, { timezone: "Asia/Kolkata" });

    // --- 3. Evening Session (08:00 PM) ---
    // 5 min warning
    cron.schedule('55 19 * * *', () => sendCountdown('Evening Mega Mix', 5), { timezone: "Asia/Kolkata" });
    // 1 min warning
    cron.schedule('59 19 * * *', () => sendCountdown('Evening Mega Mix', 1), { timezone: "Asia/Kolkata" });
    // Start
    cron.schedule('0 20 * * *', () => {
        console.log('Triggering Evening Mega Mix Quiz...');
        startQuiz({
            sessionName: '🌙 Evening Mega Mix',
            count: 40,
            categories: ['All'],
            timer: 15
        });
    }, { timezone: "Asia/Kolkata" });

    console.log('✅ Triple Session Scheduler with Countdowns Initialized (08:00, 14:00, 20:00 IST)');

    // --- 4. Weekly Reset (Every Monday at 00:00 AM) ---
    cron.schedule('0 0 * * 1', async () => {
        console.log('Reseting Weekly Scores...');
        const User = require('../models/User');
        await User.updateMany({}, { weeklyScore: 0 });
    }, { timezone: "Asia/Kolkata" });

    // --- 5. Monthly Winner Ceremony & Reset (1st of every month at 00:01 AM) ---
    cron.schedule('1 0 1 * *', async () => {
        console.log('Monthly Ceremony Starting...');
        const User = require('../models/User');
        const bot = require('../bot/telegramBot');
        const { getRankDetails } = require('../utils/rankUtils');

        // Find winner
        const winner = await User.findOne({ monthlyScore: { $gt: 0 } }).sort({ monthlyScore: -1 });

        if (winner) {
            const name = (winner.firstName + (winner.lastName ? ` ${winner.lastName}` : '')).trim();
            const rank = getRankDetails(winner.totalScore);
            const channelId = process.env.CHANNEL_ID;

            const ceremonyMsg = `👑 *GRAND MONTHLY CEREMONY* 👑\n\n` +
                `The results are in! The Champion of the Month is:\n\n` +
                `🏆 *${name}* ${rank.emoji}\n` +
                `✨ Score: ${winner.monthlyScore} points\n\n` +
                `Congratulations! You have earned the title of *Monthly Hall of Famer*! 🌟🎉\n\n` +
                `📅 *Next Month starts NOW!* All monthly scores have been reset. Type /leaderboard to begin the new race! 🏁`;

            bot.sendMessage(channelId, ceremonyMsg, { parse_mode: 'Markdown' });
        }

        // Reset all monthly scores
        await User.updateMany({}, { monthlyScore: 0 });
    }, { timezone: "Asia/Kolkata" });
};

module.exports = { initScheduler };
