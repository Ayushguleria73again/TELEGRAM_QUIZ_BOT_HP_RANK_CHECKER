const cron = require('node-cron');
const { startQuiz } = require('../services/quizRunner');
const { getSetting } = require('../services/settingsService');
const dotenv = require('dotenv');

dotenv.config();


const initScheduler = async () => {
    // 1. Morning Session: GK Only (08:00 AM)
    cron.schedule('0 8 * * *', () => {
        console.log('Triggering Morning GK Quiz...');
        startQuiz({
            sessionName: '🌅 Morning GK Special',
            count: 60,
            categories: ['GK'],
            timer: 15
        });
    }, { timezone: "Asia/Kolkata" });

    // 2. Afternoon Session: Current Affairs (02:00 PM)
    cron.schedule('0 14 * * *', () => {
        console.log('Triggering Afternoon Current Affairs Quiz...');
        startQuiz({
            sessionName: '☀️ Afternoon Current Affairs',
            count: 30,
            categories: ['Current Affairs'],
            timer: 15
        });
    }, { timezone: "Asia/Kolkata" });

    // 3. Evening Session: Mixed (08:00 PM)
    // We can use the user-defined time here if they want, but mapping to 8 PM as requested.
    cron.schedule('0 20 * * *', () => {
        console.log('Triggering Evening Mega Mix Quiz...');
        startQuiz({
            sessionName: '🌙 Evening Mega Mix',
            count: 40,
            categories: ['All'],
            timer: 15
        });
    }, { timezone: "Asia/Kolkata" });

    console.log('✅ Triple Session Scheduler Initialized (08:00, 14:00, 20:00 IST)');
};

module.exports = { initScheduler };
