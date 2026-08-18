const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const connectDB = require('./config/db');
const { initScheduler } = require('./scheduler/quizScheduler');
const bot = require('./bot/telegramBot'); // Bot starts polling here

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to Database & clean up interrupted duels from server restarts
connectDB().then(async () => {
    try {
        const Battle = require('./models/Battle');
        await Battle.updateMany(
            { status: { $in: ['ACCEPTED', 'PENDING'] } },
            { $set: { status: 'COMPLETED' } }
        );
        console.log('🧹 Cleaned up any stale/interrupted duel locks on startup.');
    } catch (e) {
        console.warn('Could not reset stale battles on startup:', e.message);
    }
    // Initialize Scheduler
    initScheduler();
});

// Basic health check route
app.get('/', (req, res) => {
    res.send('Quiz Bot is running!');
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
