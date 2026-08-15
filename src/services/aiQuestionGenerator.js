const axios = require('axios');
const fs = require('fs');
const path = require('path');
const Question = require('../models/Question');
const { checkIsDuplicate, buildBloomFilter, normalizeText } = require('./questionScraper');
const { shuffleQuestionOptions } = require('../utils/shuffleOptions');
const dotenv = require('dotenv');

dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Topics to rotate for diverse HP GK question generation
const HP_GK_TOPICS = [
    "Himachal Pradesh Hill States History, Rulers and Dynasties",
    "Himachal Pradesh Geography, Rivers, Lakes, Passes and Peaks",
    "Himachal Pradesh Culture, Fairs, Festivals, Dances and Handicrafts",
    "Himachal Pradesh Hydroelectric Projects, Dams and Energy",
    "Himachal Pradesh Wildlife Sanctuaries, National Parks and Flora/Fauna",
    "Himachal Pradesh Polity, Administration, Firsts in HP and State Symbols",
    "District-wise GK: Shimla, Kangra, Mandi, Kullu, Chamba, Lahaul-Spiti, Kinnaur, Sirmaur, Solan, Bilaspur, Hamirpur, Una",
    "Himachal Pradesh Freedom Movement, Praja Mandal Movements, Pajhota and Dhami firing",
    "Himachal Pradesh Agriculture, Horticulture, Apples, Crops and Soil Types"
];

/**
 * Uses Gemini AI to generate fresh Himachal Pradesh GK MCQs and seed unique questions into MongoDB.
 * @param {number} count Number of questions to generate (default: 10)
 * @returns {Promise<{addedCount: number, skippedCount: number, totalQuestions: number}>}
 */
const generateAiQuestions = async (count = 10) => {
    console.log(`🤖 Starting AI Question Generator for ${count} questions...`);

    if (!GEMINI_API_KEY) {
        console.warn('⚠️ GEMINI_API_KEY is missing in .env! Cannot call Gemini API.');
        throw new Error('GEMINI_API_KEY is not set in .env file. Please add GEMINI_API_KEY=your_key');
    }

    const randomTopic = HP_GK_TOPICS[Math.floor(Math.random() * HP_GK_TOPICS.length)];

    // Sample 25 existing questions to pass as negative constraints to AI
    const sampleExisting = await Question.aggregate([{ $sample: { size: 25 } }]);
    const existingListStr = sampleExisting.map((q, idx) => `${idx + 1}. ${q.question}`).join('\n');

    const prompt = `You are a top exam expert creating high-quality Multiple Choice Questions (MCQs) for Himachal Pradesh competitive exams (HPPSC, HPSSC, HAS, Allied Services).

Generate ${count} UNIQUE, authentic, factually accurate Himachal Pradesh General Knowledge questions focusing on: "${randomTopic}".

IMPORTANT CONSTRAINTS:
1. Do NOT repeat or generate questions similar to any of these existing questions in our database:
${existingListStr}

Rules:
1. Each question MUST have exactly 4 options.
2. Only 1 option must be correct.
3. Provide a clear, educational 1-2 sentence explanation.
4. Output MUST be ONLY a valid JSON array of objects. Do not include markdown code blocks or trailing text outside JSON.

JSON format:
[
  {
    "question": "Which river enters Himachal Pradesh at Shipki Pass in Kinnaur?",
    "options": ["Yamuna", "Satluj", "Ravi", "Chenab"],
    "correctIndex": 1,
    "explanation": "The Satluj enters HP at Shipki La pass from Tibet.",
    "category": "Himachal GK"
  }
]`;

    try {
        let response;
        try {
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`;
            response = await axios.post(apiUrl, {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.7, topP: 0.95, maxOutputTokens: 4096 }
            }, { headers: { 'Content-Type': 'application/json' }, timeout: 30000 });
        } catch (primaryErr) {
            console.warn('gemini-flash-latest primary endpoint failed, trying gemini-3.6-flash fallback...');
            const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${GEMINI_API_KEY}`;
            response = await axios.post(fallbackUrl, {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.7, topP: 0.95, maxOutputTokens: 4096 }
            }, { headers: { 'Content-Type': 'application/json' }, timeout: 30000 });
        }

        const rawText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        
        // Clean markdown code fence if present
        const jsonMatch = rawText.match(/\[\s*\{[\s\S]*\}\s*\]/);
        if (!jsonMatch) {
            throw new Error('AI response did not contain a valid JSON array');
        }

        const generatedQuestions = JSON.parse(jsonMatch[0]);
        console.log(`🤖 AI Generator Agent created ${generatedQuestions.length} candidate questions.`);

        // --- Dual-AI Pipeline Step 2: AI Reviewer & Fact-Checker Agent ---
        let verifiedQuestions = [];
        try {
            console.log(`🕵️ Passing ${generatedQuestions.length} candidates to AI Reviewer & Fact-Checker Agent...`);
            const reviewerPrompt = `You are a Senior Chief Examiner & Fact-Checker for Himachal Pradesh Public Service Commission (HPPSC / HAS exams).
Your job is to audit and fact-check candidate Multiple Choice Questions (MCQs) for 100% factual accuracy, correct option indices, and clear explanations.

Candidate questions to review:
${JSON.stringify(generatedQuestions, null, 2)}

Instructions:
1. Verify each question against real Himachal Pradesh General Knowledge facts.
2. Verify if options are accurate and marked correctIndex points to the true correct answer.
3. If any factual error or bad option is found, fix it in the returned object.
4. If a question is factually broken or ambiguous, set "approved": false.

Return ONLY a valid JSON array of objects in this exact format:
[
  {
    "approved": true,
    "question": "Verified question text",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctIndex": 0,
    "explanation": "Factually verified 1-2 sentence explanation.",
    "category": "Himachal GK"
  }
]`;

            const revApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`;
            const revResponse = await axios.post(revApiUrl, {
                contents: [{ parts: [{ text: reviewerPrompt }] }],
                generationConfig: { temperature: 0.2, topP: 0.8, maxOutputTokens: 4096 } // Low temperature for high factual accuracy
            }, { headers: { 'Content-Type': 'application/json' }, timeout: 35000 });

            const revRawText = revResponse.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const revJsonMatch = revRawText.match(/\[\s*\{[\s\S]*\}\s*\]/);
            if (revJsonMatch) {
                const audited = JSON.parse(revJsonMatch[0]);
                verifiedQuestions = audited.filter(q => q.approved !== false);
                console.log(`✅ AI Reviewer Agent approved ${verifiedQuestions.length}/${generatedQuestions.length} factually verified questions.`);
            } else {
                verifiedQuestions = generatedQuestions;
            }
        } catch (revErr) {
            console.warn('⚠️ AI Reviewer Agent step encountered an error, falling back to primary generator:', revErr.message);
            verifiedQuestions = generatedQuestions;
        }

        // Fetch existing DB questions for deduplication and build Bloom Filter
        const allDbQuestions = await Question.find({}, 'question options');
        const bloomFilter = buildBloomFilter(allDbQuestions);
        let addedCount = 0;
        let skippedCount = 0;
        const newValidQuestions = [];

        for (const qObj of verifiedQuestions) {
            if (!qObj.question || !Array.isArray(qObj.options) || qObj.options.length !== 4 || qObj.correctIndex === undefined) {
                continue;
            }

            qObj.category = 'Himachal GK';

            const isDup = checkIsDuplicate(qObj, allDbQuestions, bloomFilter);
            if (!isDup) {
                const finalQ = shuffleQuestionOptions(qObj);
                await Question.create(finalQ);
                allDbQuestions.push(finalQ);
                bloomFilter.add(normalizeText(finalQ.question));
                newValidQuestions.push(finalQ);
                addedCount++;
            } else {
                skippedCount++;
            }
        }

        // Also append new questions to local hp_gk_questions.json file for persistent backup
        if (newValidQuestions.length > 0) {
            const jsonPath = path.join(__dirname, '..', '..', 'hp_gk_questions.json');
            if (fs.existsSync(jsonPath)) {
                try {
                    const localData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
                    localData.push(...newValidQuestions);
                    fs.writeFileSync(jsonPath, JSON.stringify(localData, null, 2), 'utf8');
                    console.log(`📁 Appended ${newValidQuestions.length} new questions to hp_gk_questions.json`);
                } catch (fileErr) {
                    console.error('Error updating local JSON file:', fileErr.message);
                }
            }
        }

        const totalQuestions = await Question.countDocuments();
        console.log(`✅ AI Generation Complete. Added: ${addedCount}, Skipped duplicates: ${skippedCount}. Total in DB: ${totalQuestions}`);

        return { addedCount, skippedCount, totalQuestions };
    } catch (err) {
        console.error('❌ AI Question Generator Error:', err.message);
        throw err;
    }
};

module.exports = { generateAiQuestions };
