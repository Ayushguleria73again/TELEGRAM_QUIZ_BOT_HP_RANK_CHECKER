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

// Cascading model fallback list
const GEMINI_MODELS = [
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash-lite',
    'gemini-2.5-flash',
    'gemini-flash-latest'
];

/**
 * Resilient Gemini API caller with multi-model fallback cascade
 */
async function callGeminiApi(prompt, genConfig, timeout = 30000) {
    if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is not set in .env file. Please add GEMINI_API_KEY=your_key');
    }

    let lastError = null;
    for (const model of GEMINI_MODELS) {
        try {
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
            const response = await axios.post(apiUrl, {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: genConfig
            }, {
                headers: { 'Content-Type': 'application/json' },
                timeout
            });

            if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
                return response.data.candidates[0].content.parts[0].text;
            }
        } catch (err) {
            lastError = err;
            const errMsg = err.response?.data?.error?.message || err.message;
            console.warn(`[Gemini API] Model ${model} failed (${errMsg}). Trying next fallback model...`);
        }
    }

    throw new Error(`All Gemini models failed. Last error: ${lastError?.message}`);
}

/**
 * Safely parses JSON arrays from AI responses, handling raw JSON, markdown code fences, or wrapped JSON objects.
 */
const safeParseJsonArray = (text) => {
    if (!text) throw new Error('AI response body was empty.');

    try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return parsed;
        if (typeof parsed === 'object' && parsed !== null) {
            const arr = parsed.questions || parsed.data || parsed.items || Object.values(parsed).find(Array.isArray);
            if (arr) return arr;
        }
    } catch (e) {
        const arrayMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
        if (arrayMatch) {
            return JSON.parse(arrayMatch[0]);
        }
        const objMatch = text.match(/\{[\s\S]*\}/);
        if (objMatch) {
            const parsedObj = JSON.parse(objMatch[0]);
            const arr = parsedObj.questions || parsedObj.data || parsedObj.items || Object.values(parsedObj).find(Array.isArray);
            if (arr) return arr;
        }
    }
    throw new Error('AI response did not contain a valid JSON array');
};

/**
 * Uses Gemini AI to generate fresh Himachal Pradesh GK MCQs and seed unique questions into MongoDB.
 * @param {number} count Number of questions to generate (default: 10)
 * @returns {Promise<{addedCount: number, skippedCount: number, totalQuestions: number}>}
 */
const generateAiQuestions = async (count = 10) => {
    console.log(`🤖 Starting AI Question Generator for ${count} questions...`);

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

Output JSON format:
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
        const genConfig = { temperature: 0.7, topP: 0.95, maxOutputTokens: 4096, responseMimeType: "application/json" };
        const rawText = await callGeminiApi(prompt, genConfig, 35000);
        const generatedQuestions = safeParseJsonArray(rawText);
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

Return JSON format:
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

            const revConfig = { temperature: 0.2, topP: 0.8, maxOutputTokens: 4096, responseMimeType: "application/json" };
            const revRawText = await callGeminiApi(reviewerPrompt, revConfig, 35000);
            const audited = safeParseJsonArray(revRawText);
            verifiedQuestions = audited.filter(q => q.approved !== false);
            console.log(`✅ AI Reviewer Agent approved ${verifiedQuestions.length}/${generatedQuestions.length} factually verified questions.`);
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
            try {
                const jsonPath = path.join(__dirname, '../data/hp_gk_questions.json');
                if (fs.existsSync(jsonPath)) {
                    const existingJson = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
                    const combined = [...existingJson, ...newValidQuestions.map(q => ({
                        question: q.question,
                        options: q.options,
                        correctIndex: q.correctIndex,
                        explanation: q.explanation,
                        category: q.category
                    }))];
                    fs.writeFileSync(jsonPath, JSON.stringify(combined, null, 2));
                    console.log(`💾 Saved ${newValidQuestions.length} new questions to persistent backup: ${jsonPath}`);
                }
            } catch (fsErr) {
                console.error('Could not save to local JSON file:', fsErr.message);
            }
        }

        const totalQuestions = await Question.countDocuments();
        console.log(`✨ AI Generation Summary: Added=${addedCount}, SkippedDuplicates=${skippedCount}, TotalDBQuestions=${totalQuestions}`);

        return {
            addedCount,
            skippedCount,
            totalQuestions
        };

    } catch (err) {
        console.error('Error generating AI questions:', err);
        throw err;
    }
};

/**
 * Single-Question AI Fact-Checker and Auto-Correction (Admin Quarantined Audit Feature)
 * @param {string} questionId MongoDB ObjectId string of quarantined question
 */
const auditSingleQuestionWithAi = async (questionId) => {
    const q = await Question.findById(questionId);
    if (!q) throw new Error('Question not found');

    const prompt = `You are the Chief Fact-Checker for HPPSC (Himachal Pradesh Public Service Commission).
A user has reported a possible issue/error in this Himachal Pradesh GK question:

Question: "${q.question}"
Options: ${JSON.stringify(q.options)}
Currently Marked Correct Option: "${q.options[q.correctIndex]}" (Index: ${q.correctIndex})
Current Explanation: "${q.explanation}"

Instructions:
1. Verify if the question statement is factually valid regarding Himachal Pradesh.
2. If the question is INVALID, nonsense, factually broken beyond repair, or ambiguous, return JSON:
   {"isValid": false, "reason": "Clear explanation of why this question is invalid and should be deleted."}
3. If the question IS VALID:
   - Identify the 100% true correct option.
   - If marked correctIndex was wrong, fix correctIndex (0-3).
   - Ensure explanation is factually accurate.
   - Return JSON:
   {
     "isValid": true,
     "question": "Verified/cleaned question text",
     "options": ["Opt A", "Opt B", "Opt C", "Opt D"],
     "correctIndex": 0,
     "explanation": "Factually verified 1-2 sentence explanation.",
     "changesMade": "Summary of what was corrected or confirmed."
   }`;

    const genConfig = { temperature: 0.2, topP: 0.8, maxOutputTokens: 2048, responseMimeType: "application/json" };
    const rawText = await callGeminiApi(prompt, genConfig, 30000);
    const auditResult = JSON.parse(rawText);

    if (auditResult.isValid) {
        // Auto-correct question in MongoDB & clear flags
        q.question = auditResult.question || q.question;
        q.options = auditResult.options || q.options;
        q.correctIndex = auditResult.correctIndex !== undefined ? auditResult.correctIndex : q.correctIndex;
        q.explanation = auditResult.explanation || q.explanation;
        q.isFlagged = false;
        q.flagCount = 0;
        await q.save();

        return {
            status: 'FIXED',
            changesMade: auditResult.changesMade || 'Factual accuracy verified and updated.',
            question: q
        };
    } else {
        return {
            status: 'REJECTED',
            reason: auditResult.reason || 'Question determined to be factually invalid or ambiguous.',
            question: q
        };
    }
};

module.exports = { generateAiQuestions, auditSingleQuestionWithAi };
