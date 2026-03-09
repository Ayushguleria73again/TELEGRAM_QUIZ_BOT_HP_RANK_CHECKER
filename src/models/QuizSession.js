const mongoose = require('mongoose');

const quizSessionSchema = new mongoose.Schema({
    startTime: {
        type: Date,
        default: Date.now,
        expires: 86400 // Automatically delete sessions after 24 hours
    },
    isActive: {
        type: Boolean,
        default: true
    },
    // Mapping of poll_id to correct_option_id
    questions: [{
        pollId: String,
        correctIndex: Number
    }],
    // Scores: { userId: { name: string, score: number } }
    scores: {
        type: Map,
        of: new mongoose.Schema({
            name: String,
            score: { type: Number, default: 0 }
        }),
        default: {}
    }
}, {
    timestamps: true
});

const QuizSession = mongoose.model('QuizSession', quizSessionSchema);

module.exports = QuizSession;
