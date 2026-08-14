/**
 * Shuffles question options dynamically so the correct answer is randomly rotated across options A, B, C, D.
 * Ensures questions never suffer from "always Option A" bias.
 */
const shuffleQuestionOptions = (q) => {
    if (!q || !Array.isArray(q.options) || q.options.length < 2) {
        return q;
    }

    // Handle Mongoose lean objects or plain JS objects
    const plainQ = typeof q.toObject === 'function' ? q.toObject() : { ...q };
    const optionsCopy = [...plainQ.options];
    const originalCorrectIndex = plainQ.correctIndex !== undefined ? plainQ.correctIndex : 0;
    const correctText = optionsCopy[originalCorrectIndex];

    // Fisher-Yates shuffle
    for (let i = optionsCopy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [optionsCopy[i], optionsCopy[j]] = [optionsCopy[j], optionsCopy[i]];
    }

    const newCorrectIndex = optionsCopy.indexOf(correctText);

    plainQ.options = optionsCopy;
    plainQ.correctIndex = newCorrectIndex >= 0 ? newCorrectIndex : 0;

    return plainQ;
};

module.exports = { shuffleQuestionOptions };
