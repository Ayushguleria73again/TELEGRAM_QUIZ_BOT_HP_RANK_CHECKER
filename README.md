# 🏆 HP Rank Checker Quiz Bot

A powerful, automated Telegram Quiz Bot designed for competitive exam aspirants. Features real-time leaderboards, daily scheduling, and automated group management.

## 🚀 Key Features

- **📅 Automated Scheduling**: Quizzes run daily at your preferred time (IST).
- **🏆 Global Hall of Fame**: Persistent Weekly, Monthly, and All-Time leaderboards.
- **🤫 Quiz Mute Mode**: Automatically restricts group messages during active quizzes to prevent distractions.
- **💡 Embedded Explanations**: Instant learning with high-quality hints inside every poll.
- **⚙️ Interactive Admin Menu**: Change quiz time, categories, and question counts directly from Telegram.
- **🔍 Anti-Repetition Logic**: Fisher-Yates shuffle and usage tracking ensure fresh questions every session.

## 🛠️ Tech Stack

- **Backend**: Node.js & Express.js
- **Database**: MongoDB (Mongoose)
- **Bot Framework**: `node-telegram-bot-api`
- **Scheduler**: `node-cron`

## 📦 Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone <your-repo-url>
   cd quiz-bot-for-telegram
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Create a `.env` file in the root directory:
   ```env
   TELEGRAM_BOT_TOKEN=your_bot_token
   MONGODB_URI=your_mongodb_connection_string
   CHANNEL_ID=your_group_chat_id (starts with -100)
   ADMIN_ID=your_personal_telegram_user_id
   QUIZ_TIME=20:00
   PORT=3000
   ```

4. **Seed the Database**:
   ```bash
   node seed.js
   ```

5. **Start the Bot**:
   ```bash
   npm run dev
   ```

## 🎮 Bot Commands

| Command | Description | Permission |
| :--- | :--- | :--- |
| `/start` | Start the bot | Everyone |
| `/leaderboard` | View Hall of Fame (Weekly/Monthly/All-time) | Everyone |
| `/id` | Get the current Chat ID | Everyone |
| `/settings` | Open interactive settings menu | Admin |
| `/startquiz` | Trigger a quiz session manually | Admin |

## ⚙️ Administration

To manage the bot, use the `/settings` command. You can:
- **Set Quiz Time**: Update when the daily quiz triggers.
- **Select Categories**: Filter questions (e.g., History, Science, Polity).
- **Adjust Count**: Set between 5 to 60 questions per session.

---
Created with ❤️ by **HP Rank Checker Team**
