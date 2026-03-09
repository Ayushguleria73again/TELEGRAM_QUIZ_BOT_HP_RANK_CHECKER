const mongoose = require('mongoose');
const dotenv = require('dotenv');
const fs = require('fs');
const Question = require('./src/models/Question');

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

async function seedLatestCA() {
    try {
        if (!MONGODB_URI) {
            throw new Error('MONGODB_URI is missing in .env');
        }

        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB for CA Seeding');

        const fileName = process.argv[2] || 'latest_ca_questions.json';
        const data = JSON.parse(fs.readFileSync(fileName, 'utf8'));
        console.log(`Read ${data.length} questions from ${fileName}.`);

        let added = 0;
        let skipped = 0;

        for (const qData of data) {
            const exists = await Question.findOne({ question: qData.question });
            if (exists) {
                // Update category if it was wrong before
                if (exists.category !== qData.category) {
                    exists.category = qData.category;
                    await exists.save();
                }
                skipped++;
            } else {
                await Question.create(qData);
                added++;
            }
        }

        console.log(`✅ Seed Complete!`);
        console.log(`🆕 Added: ${added}`);
        console.log(`⏭️  Skipped/Updated: ${skipped}`);

    } catch (err) {
        console.error('Seed Error:', err);
    } finally {
        await mongoose.connection.close();
        process.exit();
    }
}

seedLatestCA();
