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
    }
}, {
    timestamps: true
});

// Indexing for faster leaderboard queries
userSchema.index({ weeklyScore: -1 });
userSchema.index({ monthlyScore: -1 });
userSchema.index({ totalScore: -1 });

const User = mongoose.model('User', userSchema);

module.exports = User;
