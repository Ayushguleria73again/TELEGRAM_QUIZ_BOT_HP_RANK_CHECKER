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
