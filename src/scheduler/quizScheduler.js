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
};

module.exports = { initScheduler };
