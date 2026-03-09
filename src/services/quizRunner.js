const Question = require('../models/Question');
const QuizSession = require('../models/QuizSession');
const bot = require('../bot/botInstance');
const { getSetting } = require('./settingsService');
const dotenv = require('dotenv');

dotenv.config();

const CHANNEL_ID = process.env.CHANNEL_ID;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

let isQuizRunning = false;

const startQuiz = async (options = {}) => {
    if (isQuizRunning) {
        console.log('Quiz is already running. Skipping trigger.');
        return 'RUNNING';
    }

    try {
        isQuizRunning = true;
        if (!CHANNEL_ID) {
            console.error('CHANNEL_ID is missing in .env');
            return;
        }

        // 0. Set Parameters based on overrides or settings
        const selectedCategories = options.categories || await getSetting('quizCategories');
        const count = options.count || await getSetting('questionCount') || 15;
        const timer = options.timer || 15; // User requested 15s timer for these sessions

        // Initialize a new database session for tracking scores
        const session = await QuizSession.create({ isActive: true, questions: [], scores: {} });

        // Mute the group for non-admins
        try {
            await bot.setChatPermissions(CHANNEL_ID, {
                can_send_messages: false,
                can_send_polls: false,
                can_send_other_messages: false,
                can_add_web_page_previews: false
            });
            console.log(`Chat ${CHANNEL_ID} muted for quiz.`);
        } catch (e) {
            console.log('Could not mute chat (bot might not have Restrict Members permission)');
        }

        // 1. Fetch a larger pool of potential questions (e.g., 3x the count)
        // Define query for category filtering
        const query = {};
        if (selectedCategories && selectedCategories.length > 0 && !selectedCategories.includes('All')) {
            if (selectedCategories.includes('GK')) {
                // 'GK' means anything EXCEPT 'Current Affairs'
                query.category = { $ne: 'Current Affairs' };
            } else {
                query.category = { $in: selectedCategories };
            }
        }

        // 1. Fetch a larger pool of potential questions (e.g., 3x the count)
        // We still prefer those least recently used
        const limit = count * 3;
        const questionsPool = await Question.find(query)
            .sort({ lastUsed: 1 })
            .limit(limit);

        if (questionsPool.length < 1) {
            console.log('No questions found in database.');
            return;
        }

        // Fisher-Yates Shuffle for truly random selection from the pool
        const shuffle = (array) => {
            for (let i = array.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [array[i], array[j]] = [array[j], array[i]];
            }
            return array;
        };

        const shuffledPool = shuffle([...questionsPool]);
        const selectedQuestions = shuffledPool.slice(0, Math.min(count, shuffledPool.length));

        if (selectedQuestions.length < 1) {
            console.log('No questions found in database.');
            return;
        }

        // 2. Send Rules Message
        const categoriesDisplay = (selectedCategories && selectedCategories.length > 0) ? selectedCategories.join(', ') : 'All';
        const rulesMessage = `📚 *HP Rank Checker Quiz*\n\n` +
            `🔹 *Session:* ${options.sessionName || 'Special Session'}\n` +
            `🔹 *Total questions:* ${selectedQuestions.length}\n` +
            `🔹 *Categories:* ${categoriesDisplay}\n` +
            `🔹 *Time per question:* ${timer} seconds\n\n` +
            `Choose the correct option before the poll closes! 🏁`;

        await bot.sendMessage(CHANNEL_ID, rulesMessage, { parse_mode: 'Markdown' });
        await delay(3000); // 3-second gap before first question

        // 3. Loop through questions
        for (let i = 0; i < selectedQuestions.length; i++) {
            const q = selectedQuestions[i];

            const poll = await bot.sendPoll(CHANNEL_ID, `${i + 1}. ${q.question}`, q.options, {
                type: 'quiz',
                correct_option_id: q.correctIndex,
                is_anonymous: false, // REQUIRED for leaderboard
                open_period: timer,
                explanation: q.explanation.length > 200 ? q.explanation.substring(0, 197) + '...' : q.explanation
            });

            // Register poll in session for score tracking
            session.questions.push({ pollId: poll.poll_id, correctIndex: q.correctIndex });
            await session.save();

            // Update lastUsed date
            q.lastUsed = new Date();
            await q.save();

            // Wait for poll to close
            await delay(timer * 1000);
        }

        // 4. Send Finish Message
        await bot.sendMessage(CHANNEL_ID, "🏁 Quiz Finished!\n\nGreat job everyone 👏\nNow let's review the correct answers.");
        await delay(2000);

        // 5. Aggregate and send explanations
        let explanationsText = "📚 Quiz Answers & Explanations\n\n";
        const messages = [];

        for (let i = 0; i < selectedQuestions.length; i++) {
            const q = selectedQuestions[i];
            const chunk = `Q${i + 1}. ${q.question}\n✅ Answer: ${q.options[q.correctIndex]}\nℹ️ ${q.explanation}\n\n`;

            // Check for Telegram message length limit (4096)
            if ((explanationsText.length + chunk.length) > 4000) {
                messages.push(explanationsText);
                explanationsText = chunk;
            } else {
                explanationsText += chunk;
            }
        }
        messages.push(explanationsText);

        for (const msg of messages) {
            const sentMsg = await bot.sendMessage(CHANNEL_ID, msg);
            // Optional: Pin the last message
            if (messages.indexOf(msg) === messages.length - 1) {
                try {
                    await bot.pinChatMessage(CHANNEL_ID, sentMsg.message_id);
                } catch (e) {
                    console.log('Could not pin message (bot might not be admin with pin permission)');
                }
            }
            await delay(1000);
        }

        // 6. Final Leaderboard (Group Mode only)
        const finalSession = await QuizSession.findById(session._id);
        const scoreArray = Array.from(finalSession.scores.values())
            .sort((a, b) => b.score - a.score)
            .slice(0, 5);

        if (scoreArray.length > 0) {
            let leaderboardMsg = "🏆 *Quiz Leaderboard (Top 5)*\n\n";
            const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];

            scoreArray.forEach((user, idx) => {
                leaderboardMsg += `${medals[idx]} *${user.name}*: ${user.score} points\n`;
            });

            await bot.sendMessage(CHANNEL_ID, leaderboardMsg, { parse_mode: 'Markdown' });
        }

        finalSession.isActive = false;
        await finalSession.save();

        console.log(`Quiz completed successfully in ${CHANNEL_ID}`);

    } catch (error) {
        console.error('Error in quiz runner:', error);
    } finally {
        // Unmute the group
        try {
            await bot.setChatPermissions(CHANNEL_ID, {
                can_send_messages: true,
                can_send_polls: true,
                can_send_other_messages: true,
                can_add_web_page_previews: true,
                can_invite_users: true
            });
            console.log(`Chat ${CHANNEL_ID} unmuted.`);
        } catch (e) {
            console.log('Could not unmute chat.');
        }
        isQuizRunning = false;
    }
};

module.exports = { startQuiz };
