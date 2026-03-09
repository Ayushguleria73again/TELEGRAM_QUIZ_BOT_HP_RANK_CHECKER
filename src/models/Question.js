const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
    question: {
        type: String,
        required: true,
    },
    options: {
        type: [String],
        required: true,
        validate: [optionsLimit, '{PATH} must have 4 options'],
    },
    correctIndex: {
        type: Number,
        required: true,
    },
    explanation: {
        type: String,
        required: true,
    },
    category: {
        type: String,
        required: true,
    },
    lastUsed: {
        type: Date,
        default: null,
    },
}, {
    timestamps: true,
});

function optionsLimit(val) {
    return val.length === 4;
}

const Question = mongoose.model('Question', questionSchema);

module.exports = Question;
