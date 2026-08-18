const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    telegramId: {
        type: String,
        required: true,
        unique: true
    },
    username: String,
    firstName: String,
    lastName: String,
    totalScore: {
        type: Number,
        default: 0
    },
    weeklyScore: {
        type: Number,
        default: 0
    },
    monthlyScore: {
        type: Number,
        default: 0
    },
    unlockedRanks: {
        type: [String],
        default: []
    },
    badges: {
        type: [String],
        default: []
    },
    lastActivity: {
        type: Date,
        default: Date.now
    },
    currentStreak: {
        type: Number,
        default: 0
    },
    longestStreak: {
        type: Number,
        default: 0
    },
    lastParticipationDate: {
        type: String // YYYY-MM-DD
    },
    stats: {
        totalCorrect: { type: Number, default: 0 },
        totalAttempted: { type: Number, default: 0 },
        categoryStats: {
            type: Map,
            of: {
                correct: { type: Number, default: 0 },
                attempted: { type: Number, default: 0 }
            },
            default: {}
        }
    },
    battleStats: {
        totalBattles: { type: Number, default: 0 },
        battlesWon: { type: Number, default: 0 },
        battlesLost: { type: Number, default: 0 },
        battlesDrawn: { type: Number, default: 0 },
        currentWinStreak: { type: Number, default: 0 },
        bestWinStreak: { type: Number, default: 0 },
        dailyBattlesCount: { type: Number, default: 0 },
        lastBattleDate: { type: String } // YYYY-MM-DD
    }
}, {
    timestamps: true
});

// Indexing for faster leaderboard queries
userSchema.index({ weeklyScore: -1 });
userSchema.index({ monthlyScore: -1 });
userSchema.index({ 'battleStats.battlesWon': -1 });
userSchema.index({ 'battleStats.currentWinStreak': -1 });
userSchema.index({ totalScore: -1 });

const User = mongoose.model('User', userSchema);

module.exports = User;
