# 🏆 HP Rank Checker: The Elite Quiz Platform

A high-performance, professional Telegram Quiz Bot built for competitive communities. Beyond just a quiz bot, this is a gamified learning ecosystem featuring 1v1 duels, complex social rankings, and deep performance analytics.

---

## 🚀 Key Features

### 1. ⚔️ Battle Mode (1v1 Duels)
*   Challenge any group member using `/challenge @username`.
*   Private, high-intensity 5-question rounds.
*   Automated victory announcements in the main group chat.

### 2. 📈 Professional Analytics & Streaks
*   **Daily Streaks (🔥):** Tracks consecutive days of participation to build loyalty.
*   **Performance Metrics:** Category-wise accuracy (e.g., "90% in History") and "Best Subject" identification.
*   **Digital Profile:** Comprehensive `/me` command showing rank, total points, and current win-rates.

### 3. 🎓 Dynamic Ranking System
*   **Tiers:** Aspirant 🎓 → Scholar 📚 → Expert 🧠 → Rank Master 👑.
*   **Milestone Celebrations:** Real-time group announcements when a user reaches a new rank.
*   **Monthly Hall of Fame:** Automated ceremonies and score resets on the 1st of every month.

### 4. 📅 Automated Ecosystem
*   **Triple Sessions:** Morning (08:00 AM), Afternoon (02:00 PM), and Evening (08:00 PM) IST.
*   **Countdown Alerts:** 5-minute and 1-minute warnings before every quiz.
*   **Mute Mode:** Automatically restricts chat during quizzes to ensure focus.

### 5. 🛠️ Robust Infrastructure
*   **Admin Dashboard:** Interactive `/settings` menu to change time, categories, and question counts dynamically.
*   **Hint System:** Embedded "💡" hints inside polls for instant educational feedback.
*   **Anti-Spam:** Integrated 2-second rate limiter for high stability.

---

## 🛠️ Tech Stack

- **Runtime**: Node.js & Express.js
- **Database**: MongoDB Atlas (Persistent Cloud Storage)
- **Bot Framework**: `node-telegram-bot-api`
- **Automation**: `node-cron` & `node-cron`

---

## 📦 Installation & Setup

1. **Clone & Install**:
   ```bash
   git clone <your-repo-url>
   npm install
   ```

2. **Environment Configuration (`.env`)**:
   ```env
   TELEGRAM_BOT_TOKEN=...
   MONGODB_URI=...
   CHANNEL_ID=... (Group ID starting with -100)
   ADMIN_ID=... (Your user ID)
   PORT=3000
   ```

3. **Data Management**:
   ```bash
   node seedQuestions.js  # Populates initial GK bank
   npm start              # Production launch
   ```

---

## 🎮 Bot Commands

| Command | Description | Level |
| :--- | :--- | :--- |
| `/start` | Onboarding guide for new users | Everyone |
| `/me` | View your Ranks, Stats, and Streaks | Everyone |
| `/leaderboard` | View Weekly/Monthly/All-Time rankings | Everyone |
| `/challenge @user` | Initiate a 1v1 duel | Everyone |
| `/info` | View the daily quiz schedule | Everyone |
| `/help` | Detailed command list and rules | Everyone |
| `/settings` | Admin: Change Time/Categories/Question Count | Admin |
| `/startquiz` | Admin: Trigger a manual quiz session | Admin |

---

## 👑 Maintenance & Reset Cycles

- **Weekly Reset**: Every Monday at 00:00 AM (Weekly scores clear).
- **Monthly Reset**: 1st of every Month (A championship ceremony is posted).
- **Permanent Records**: All-Time Hall of Fame never resets.

---
Created with ❤️ by **The Elite Quiz Team**
