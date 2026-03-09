const TelegramBot = require('node-telegram-bot-api');
const dotenv = require('dotenv');

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
    console.error('TELEGRAM_BOT_TOKEN is missing in .env file');
    process.exit(1);
}

const bot = new TelegramBot(token, {
    polling: true,
    request: {
        agentOptions: {
            family: 4
        }
    }
});

// Log when the bot is ready
bot.getMe().then((me) => {
    console.log(`Bot is running as @${me.username}`);
}).catch((err) => {
    console.error('Error starting bot:', err.message);
});

// Detailed polling error logging
bot.on('polling_error', (error) => {
    if (error.code === 'EFATAL') {
        console.error('Critical Polling Error (EFATAL): This often means your network is blocking Telegram or your Bot Token is being used elsewhere.');
    } else {
        console.error('Polling Error:', error.code, error.message);
    }
});

module.exports = bot;
