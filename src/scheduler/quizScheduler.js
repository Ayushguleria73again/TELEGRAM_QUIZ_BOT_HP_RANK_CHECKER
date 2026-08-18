const cron = require('node-cron');
const dotenv = require('dotenv');
const { startQuiz, sendCountdown } = require('../services/quizRunner');
const { sendDailyTeaser, sendDidYouKnow, sendWeeklyReports } = require('../services/communityService');
const { scrapeHpQuestions } = require('../services/questionScraper');

dotenv.config();

const initScheduler = async () => {
    // --- 1. Morning Session (08:00 AM) ---
    // 5 min warning
    cron.schedule('55 7 * * *', () => sendCountdown('Morning HP GK Special', 5), { timezone: "Asia/Kolkata" });
    // 1 min warning
    cron.schedule('59 7 * * *', () => sendCountdown('Morning HP GK Special', 1), { timezone: "Asia/Kolkata" });
    // Start
    cron.schedule('0 8 * * *', () => {
        console.log('Triggering Morning HP GK Quiz...');
        startQuiz({
            sessionName: '🌅 Morning HP GK Special',
            count: 30,
            categories: ['Himachal GK'],
            timer: 15
        });
    }, { timezone: "Asia/Kolkata" });

    // --- 2. Daily Teaser to Community Channel (10:00 AM) ---
    cron.schedule('0 10 * * *', () => {
        console.log('Triggering Daily Quiz Teaser...');
        sendDailyTeaser();
    }, { timezone: "Asia/Kolkata" });

    // --- 3. Did You Know Fact (11:00 AM) ---
    cron.schedule('0 11 * * *', () => {
        console.log('Triggering Morning Did You Know Fact...');
        sendDidYouKnow();
    }, { timezone: "Asia/Kolkata" });

    // --- 4. Afternoon Session (02:00 PM) ---
    // 5 min warning
    cron.schedule('55 13 * * *', () => sendCountdown('Afternoon HP History & Geography', 5), { timezone: "Asia/Kolkata" });
    // 1 min warning
    cron.schedule('59 13 * * *', () => sendCountdown('Afternoon HP History & Geography', 1), { timezone: "Asia/Kolkata" });
    // Start
    cron.schedule('0 14 * * *', () => {
        console.log('Triggering Afternoon HP History & Geography Quiz...');
        startQuiz({
            sessionName: '☀️ Afternoon HP History & Geography',
            count: 20,
            categories: ['Himachal GK'],
            timer: 15
        });
    }, { timezone: "Asia/Kolkata" });

    // --- 5. Did You Know Fact (05:00 PM) ---
    cron.schedule('0 17 * * *', () => {
        console.log('Triggering Evening Did You Know Fact...');
        sendDidYouKnow();
    }, { timezone: "Asia/Kolkata" });

    // --- 6. Evening Session (08:00 PM) ---
    // 5 min warning
    cron.schedule('55 19 * * *', () => sendCountdown('Evening HP GK Mega Mix', 5), { timezone: "Asia/Kolkata" });
    // 1 min warning
    cron.schedule('59 19 * * *', () => sendCountdown('Evening HP GK Mega Mix', 1), { timezone: "Asia/Kolkata" });
    // Start
    cron.schedule('0 20 * * *', () => {
        console.log('Triggering Evening HP GK Mega Mix Quiz...');
        startQuiz({
            sessionName: '🌙 Evening HP GK Mega Mix',
            count: 30,
            categories: ['Himachal GK'],
            timer: 15
        });
    }, { timezone: "Asia/Kolkata" });

    // --- 7. Weekly Report Cards (Every Sunday at 09:00 AM) ---
    cron.schedule('0 9 * * 0', () => {
        console.log('Triggering Weekly Report Cards...');
        sendWeeklyReports();
    }, { timezone: "Asia/Kolkata" });

    // --- 8. Auto Question Scraper (Every Sunday at 03:00 AM) ---
    cron.schedule('0 3 * * 0', () => {
        console.log('Triggering Weekly HP Question Scraper...');
        scrapeHpQuestions();
    }, { timezone: "Asia/Kolkata" });

    // --- 9. Weekly AI Question Generator (Every Wednesday at 04:00 AM) ---
    cron.schedule('0 4 * * 3', async () => {
        console.log('Triggering Weekly AI Question Generator...');
        try {
            const { generateAiQuestions } = require('../services/aiQuestionGenerator');
            await generateAiQuestions(15);
        } catch (err) {
            console.error('Error running automated AI question generation:', err.message);
        }
    }, { timezone: "Asia/Kolkata" });

    console.log('✅ Full Automation & Engagement Scheduler Initialized (Quizzes, Teasers, Facts, Reports, Scraper, AI Generator)');

    // --- 9. Weekly Reset (Every Monday at 00:00 AM) ---
    cron.schedule('0 0 * * 1', async () => {
        console.log('Reseting Weekly Scores...');
        const User = require('../models/User');
        await User.updateMany({}, { weeklyScore: 0 });
    }, { timezone: "Asia/Kolkata" });

    // --- 10. Monthly Winner Ceremony & Reset (1st of every month at 00:01 AM) ---
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
