const mongoose = require('mongoose');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const Question = require('./src/models/Question');

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

async function seedHpGk() {
    try {
        if (!MONGODB_URI) {
            throw new Error('MONGODB_URI is missing in .env file!');
        }

        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB database successfully.');

        const shouldClear = process.argv.includes('--clear') || true;

        if (shouldClear) {
            console.log('🗑️  Clearing existing question collection in database...');
            const deleteResult = await Question.deleteMany({});
            console.log(`✅ Removed ${deleteResult.deletedCount} old questions from database.`);
        }

        const filePath = path.join(__dirname, 'hp_gk_questions.json');
        if (!fs.existsSync(filePath)) {
            throw new Error(`hp_gk_questions.json not found at path ${filePath}`);
        }

        const questions = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        console.log(`📦 Loaded ${questions.length} Himachal Pradesh GK questions from JSON.`);

        let insertedCount = 0;
        for (const qData of questions) {
            await Question.create(qData);
            insertedCount++;
        }

        console.log(`\n🎉 Himachal Pradesh GK Seeding Complete!`);
        console.log(`✅ Total HP GK Questions Inserted: ${insertedCount}`);

    } catch (err) {
        console.error('❌ Seeding Error:', err.message);
        process.exit(1);
    } finally {
        await mongoose.connection.close();
        console.log('🔌 Database connection closed.');
        process.exit(0);
    }
}

seedHpGk();
