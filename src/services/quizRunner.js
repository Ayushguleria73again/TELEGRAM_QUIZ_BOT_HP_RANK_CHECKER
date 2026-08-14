const Question = require('../models/Question');
const QuizSession = require('../models/QuizSession');
const bot = require('../bot/botInstance');
const { getSetting } = require('./settingsService');
const { shuffleQuestionOptions } = require('../utils/shuffleOptions');
const dotenv = require('dotenv');

dotenv.config();

const CHANNEL_ID = process.env.CHANNEL_ID;
const COMMUNITY_CHANNEL_ID = process.env.COMMUNITY_CHANNEL_ID;
const GROUP_JOIN_LINK = process.env.GROUP_JOIN_LINK;

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
            query.category = { $in: selectedCategories };
        }

        // 1. Strict Rotation: Fetch questions sorted by lastUsed (nulls first, then oldest)
        const allQuestions = await Question.find(query).sort({ lastUsed: 1 });

        if (!allQuestions || allQuestions.length < 1) {
            console.log('No questions found in database.');
            return;
        }

        // Shuffle utility
        const shuffle = (array) => {
            for (let i = array.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [array[i], array[j]] = [array[j], array[i]];
            }
            return array;
        };

        // Pick from the top candidate pool (oldest/never used questions)
        const poolSize = Math.min(allQuestions.length, Math.max(count * 2, 50));
        const candidatePool = allQuestions.slice(0, poolSize);
        const shuffledPool = shuffle([...candidatePool]);
        const selectedQuestions = shuffledPool.slice(0, Math.min(count, shuffledPool.length));

        // Immediately update lastUsed timestamps so concurrent/next sessions won't pick them
        const now = new Date();
        const selectedIds = selectedQuestions.map(q => q._id);
        await Question.updateMany({ _id: { $in: selectedIds } }, { lastUsed: now });

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
            try {
                // Dynamically shuffle and rotate options across A, B, C, D
                const q = shuffleQuestionOptions(selectedQuestions[i]);
                selectedQuestions[i] = q;

                let questionText = `${i + 1}. ${q.question}`;
                if (questionText.length > 300) {
                    questionText = questionText.substring(0, 297) + '...';
                }

                // Telegram poll explanation limit: 200 characters
                let explanationText = q.explanation || "";
                if (explanationText.length > 200) {
                    explanationText = explanationText.substring(0, 197) + '...';
                }

                const optionsText = q.options.map(opt => opt.length > 100 ? opt.substring(0, 97) + '...' : opt);

                const poll = await bot.sendPoll(CHANNEL_ID, questionText, optionsText, {
                    type: 'quiz',
                    correct_option_id: q.correctIndex,
                    is_anonymous: false, // REQUIRED for leaderboard
                    open_period: timer,
                    explanation: explanationText
                });

                // Register poll in session for score tracking
                session.questions.push({
                    pollId: poll.poll.id,
                    correctIndex: q.correctIndex,
                    category: q.category
                });
                await session.save();

                // Update lastUsed date (gracefully)
                try {
                    q.lastUsed = new Date();
                    await q.save();
                } catch (saveErr) {
                    console.error(`Could not update lastUsed for question ${q._id}:`, saveErr.message);
                }

                // Wait for poll to close
                await delay(timer * 1000);
            } catch (qError) {
                console.error(`Error processing question ${i + 1}:`, qError.message);
                // Continue with next question
                await delay(2000);
            }
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
            const User = require('../models/User');
            const { getRankDetails } = require('../utils/rankUtils');
            let leaderboardMsg = "🏆 *Quiz Leaderboard (Top 5)*\n\n";
            const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];

            for (let idx = 0; idx < scoreArray.length; idx++) {
                const result = scoreArray[idx];
                // Fetch user from DB for total score
                const userInDb = await User.findOne({ telegramId: result.telegramId });
                const rank = getRankDetails(userInDb ? userInDb.totalScore : 0);

                leaderboardMsg += `${medals[idx]} ${rank.emoji} *${result.name}*: ${result.score} points\n`;
            }

            await bot.sendMessage(CHANNEL_ID, leaderboardMsg, { parse_mode: 'Markdown' });

            // Post Top 3 results to Community Channel
            if (COMMUNITY_CHANNEL_ID) {
                let communityResultsMsg = `🏁 *${options.sessionName || 'HP GK Quiz'} Results!* 🏆\n\n` +
                    `Congratulations to the top performers of this session:\n\n`;

                const top3 = scoreArray.slice(0, 3);
                for (let idx = 0; idx < top3.length; idx++) {
                    const result = top3[idx];
                    const userInDb = await User.findOne({ telegramId: result.telegramId });
                    const rank = getRankDetails(userInDb ? userInDb.totalScore : 0);
                    communityResultsMsg += `${medals[idx]} ${rank.emoji} *${result.name}*: ${result.score} points\n`;
                }

                communityResultsMsg += `\n📚 Great job everyone! Join our next session to compete and climb the ranks! 👑`;

                const commOptions = { parse_mode: 'Markdown' };
                if (GROUP_JOIN_LINK) {
                    commOptions.reply_markup = {
                        inline_keyboard: [
                            [{ text: '🚀 Join Quiz Group Now!', url: GROUP_JOIN_LINK }]
                        ]
                    };
                }

                try {
                    await bot.sendMessage(COMMUNITY_CHANNEL_ID, communityResultsMsg, commOptions);
                    console.log(`Posted quiz results to community channel.`);
                } catch (cErr) {
                    console.error('Error posting results to community channel:', cErr.message);
                }
            }
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

const sendCountdown = async (sessionName, minutesLeft) => {
    if (!CHANNEL_ID) return;

    const emoji = minutesLeft === 5 ? '🔔' : '🚀';
    const message = `${emoji} *GET READY!* ${emoji}\n\n` +
        `🏆 The *${sessionName}* is starting in *${minutesLeft} minute${minutesLeft > 1 ? 's' : ''}*!\n\n` +
        `🏁 Join the group now to secure your rank!`;

    try {
        await bot.sendMessage(CHANNEL_ID, message, { parse_mode: 'Markdown' });
        console.log(`Sent ${minutesLeft}min countdown for ${sessionName}`);
    } catch (err) {
        console.error('Error sending countdown:', err);
    }

    // Also notify the community channel
    if (COMMUNITY_CHANNEL_ID) {
        const communityMsg = `${emoji} *HP GK Quiz Alert!* ${emoji}\n\n` +
            `🏆 The *${sessionName}* is starting in *${minutesLeft} minute${minutesLeft > 1 ? 's' : ''}*!\n\n` +
            `📚 Test your Himachal Pradesh knowledge now!\n` +
            `🏁 Join our quiz group to participate and climb the ranks! 👑`;

        const communityOptions = { parse_mode: 'Markdown' };
        if (GROUP_JOIN_LINK) {
            communityOptions.reply_markup = {
                inline_keyboard: [
                    [{ text: '🚀 Join Quiz Group Now!', url: GROUP_JOIN_LINK }]
                ]
            };
        }

        try {
            await bot.sendMessage(COMMUNITY_CHANNEL_ID, communityMsg, communityOptions);
            console.log(`Sent community notification for ${sessionName}`);
        } catch (err) {
            console.error('Error sending to community channel:', err.message);
        }
    }
};

module.exports = { startQuiz, sendCountdown };
