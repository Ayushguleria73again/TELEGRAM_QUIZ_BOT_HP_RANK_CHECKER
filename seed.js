const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Question = require('./src/models/Question');
const connectDB = require('./src/config/db');
const dotenv = require('dotenv');

dotenv.config();

const loadQuestions = () => {
    try {
        const data = fs.readFileSync(path.join(__dirname, 'gk_questions_500.json'), 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading gk_questions_500.json:', error.message);
        return [];
    }
};

const seedDB = async () => {
    await connectDB();
    try {
        const questionsFromFile = loadQuestions();

        if (questionsFromFile.length === 0) {
            console.log('No questions found in gk_questions_500.json. Skipping seed.');
            process.exit();
        }

        console.log(`Checking ${questionsFromFile.length} questions for duplicates...`);

        let addedCount = 0;
        let skippedCount = 0;

        for (const q of questionsFromFile) {
            // Check if question text already exists (to avoid duplicates)
            const exists = await Question.findOne({ question: q.question });
            if (!exists) {
                await Question.create(q);
                addedCount++;
            } else {
                skippedCount++;
            }
        }

        console.log(`Seed process complete!`);
        console.log(`✅ Added: ${addedCount} new questions.`);
        console.log(`⏭️  Skipped: ${skippedCount} duplicates.`);

        process.exit();
    } catch (error) {
        console.error('Seeding error:', error);
        process.exit(1);
    }
};

seedDB();
