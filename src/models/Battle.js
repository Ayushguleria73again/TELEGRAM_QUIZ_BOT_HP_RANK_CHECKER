const mongoose = require('mongoose');

const battleSchema = new mongoose.Schema({
    challengerId: { type: String, required: true },
    challengerName: { type: String, required: true },
    challengedId: { type: String, required: true },
    challengedName: { type: String, required: true },
    groupChatId: { type: String, required: true },
    status: {
        type: String,
        enum: ['PENDING', 'ACCEPTED', 'COMPLETED', 'DECLINED'],
        default: 'PENDING'
    },
    questions: [{
        questionId: mongoose.Schema.Types.ObjectId,
        correctIndex: Number
    }],
    challengerScore: { type: Number, default: 0 },
    challengedScore: { type: Number, default: 0 },
    challengerIndex: { type: Number, default: 0 }, // 0 to 4
    challengedIndex: { type: Number, default: 0 }, // 0 to 4
    challengerFinished: { type: Boolean, default: false },
    challengedFinished: { type: Boolean, default: false },
    pollIds: { type: Map, of: String }, // Map poll_id -> userId
    expiresAt: { type: Date, default: () => new Date(Date.now() + 3600000) } // 1 hour expiry
}, { timestamps: true });

module.exports = mongoose.model('Battle', battleSchema);
