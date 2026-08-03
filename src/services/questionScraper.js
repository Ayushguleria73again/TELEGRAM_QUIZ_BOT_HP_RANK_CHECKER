const axios = require('axios');
const cheerio = require('cheerio');
const Question = require('../models/Question');

/**
 * Normalizes question text for robust comparison (expands HP -> himachal pradesh, strips prefixes, punctuation, extra spaces, lowercases).
 */
const normalizeText = (text) => {
    return text
        .toLowerCase()
        .replace(/\bhp\b/g, 'himachal pradesh')
        .replace(/^(?:q\d*[\.:\s]*|\d+[\.:\s]*|question\s*\d*[\.:\s]*)/gi, '') // Strip leading Q1., 1., Question 1:
        .replace(/[^\w\s]/gi, '') // Remove punctuation & special characters
        .replace(/\s+/g, ' ') // Collapse multiple spaces
        .trim();
};

/**
 * Calculates Jaccard Word Similarity between two strings (0.0 to 1.0).
 */
const getWordSimilarity = (str1, str2) => {
    const set1 = new Set(str1.split(' ').filter(w => w.length >= 2));
    const set2 = new Set(str2.split(' ').filter(w => w.length >= 2));

    if (set1.size === 0 || set2.size === 0) return 0;

    let intersectionCount = 0;
    set1.forEach(word => {
        if (set2.has(word)) intersectionCount++;
    });

    const unionCount = new Set([...set1, ...set2]).size;
    return intersectionCount / unionCount;
};

/**
 * Checks if a candidate question is a duplicate of any question in the DB.
 */
const checkIsDuplicate = (candidateQ, existingDbQuestions) => {
    const normCandidate = normalizeText(candidateQ.question);

    for (const dbQ of existingDbQuestions) {
        const normDbQ = normalizeText(dbQ.question);

        // 1. Exact normalized match (ignores casing, punctuation, prefix numbers, HP vs Himachal Pradesh)
        if (normCandidate === normDbQ) return true;

        // 2. High fuzzy word similarity (>= 75% word overlap)
        const similarity = getWordSimilarity(normCandidate, normDbQ);
        if (similarity >= 0.75) return true;

        // 3. Moderate word similarity (>= 35%) + at least 2 matching options (e.g. "Reo Purgyil", "Hanuman Tibba")
        if (similarity >= 0.35 && candidateQ.options && dbQ.options) {
            const candOptionsNorm = candidateQ.options.map(o => normalizeText(o));
            const dbOptionsNorm = dbQ.options.map(o => normalizeText(o));
            const matchingOpts = candOptionsNorm.filter(o => dbOptionsNorm.includes(o));
            if (matchingOpts.length >= 2) return true;
        }
    }

    return false;
};

/**
 * Scrapes HP GK questions from public educational sites and seeds new unique questions into MongoDB.
 */
const scrapeHpQuestions = async () => {
    console.log('🕷️ Starting HP GK Question Scraper with Smart Deduplication...');
    let addedCount = 0;
    let skippedCount = 0;

    try {
        // Source 1: Himexam HP GK MCQ page
        const targetUrl = 'https://himexam.com/hp-gk-mcq-in-english/';
        console.log(`Fetching MCQs from ${targetUrl}...`);

        const response = await axios.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 10000
        });

        const $ = cheerio.load(response.data);
        const parsedQuestions = [];

        // Parse paragraphs / lists containing Q&A
        $('p, li').each((_, el) => {
            const text = $(el).text().trim();
            if (text.includes('?') && (text.includes('A)') || text.includes('a)')) && text.toLowerCase().includes('answer')) {
                try {
                    const qMatch = text.match(/(?:Q\d*[\.:\s]*|^\d+[\.:\s]*)(.*?)(?=[A-Da-d][\)\.:])/s);
                    const optAMatch = text.match(/[A-Da-d1][\)\.:\s]+(.*?)(?=[B-Db-d2][\)\.:])/s);
                    const optBMatch = text.match(/[B-Db-d2][\)\.:\s]+(.*?)(?=[C-Dc-d3][\)\.:])/s);
                    const optCMatch = text.match(/[C-Dc-d3][\)\.:\s]+(.*?)(?=[D-Dd-d4][\)\.:])/s);
                    const optDMatch = text.match(/[D-Dd-d4][\)\.:\s]+(.*?)(?=Answer|Ans|[\n\r]|$)/is);
                    const ansMatch = text.match(/(?:Answer|Ans)[\s:\-\)]*([A-D|a-d])/i);

                    if (qMatch && optAMatch && optBMatch && optCMatch && optDMatch && ansMatch) {
                        const questionText = qMatch[1].trim();
                        const optA = optAMatch[1].trim();
                        const optB = optBMatch[1].trim();
                        const optC = optCMatch[1].trim();
                        const optD = optDMatch[1].trim();
                        const ansChar = ansMatch[1].toUpperCase();

                        const letterToIndex = { 'A': 0, 'B': 1, 'C': 2, 'D': 3 };
                        const correctIndex = letterToIndex[ansChar] !== undefined ? letterToIndex[ansChar] : 0;

                        if (questionText.length > 10 && optA && optB && optC && optD) {
                            parsedQuestions.push({
                                question: questionText,
                                options: [optA, optB, optC, optD],
                                correctIndex,
                                explanation: `Correct Answer: ${[optA, optB, optC, optD][correctIndex]}`,
                                category: 'Himachal GK'
                            });
                        }
                    }
                } catch (parseErr) {
                    // Skip unparseable block
                }
            }
        });

        console.log(`Extracted ${parsedQuestions.length} candidate questions from web page.`);

        // Fetch all existing questions from DB once for fast comparison
        const allDbQuestions = await Question.find({}, 'question options');

        // Insert new unique questions into DB
        for (const qObj of parsedQuestions) {
            const isDup = checkIsDuplicate(qObj, allDbQuestions);
            if (!isDup) {
                await Question.create(qObj);
                allDbQuestions.push(qObj); // Add to local cache to prevent duplicate inserts within same run
                addedCount++;
            } else {
                skippedCount++;
            }
        }

        console.log(`✅ Smart Scraping complete. Added: ${addedCount}, Skipped duplicates: ${skippedCount}`);
    } catch (err) {
        console.error('❌ Web Scraper encountered an error:', err.message);
    }

    return { addedCount, skippedCount };
};

module.exports = { scrapeHpQuestions, checkIsDuplicate, normalizeText };
