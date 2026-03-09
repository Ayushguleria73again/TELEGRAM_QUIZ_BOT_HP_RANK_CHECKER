const express = require('express');
const connectDB = require('./config/db');
const { initScheduler } = require('./scheduler/quizScheduler');
const bot = require('./bot/telegramBot'); // Bot starts polling here
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to Database
connectDB().then(() => {
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
