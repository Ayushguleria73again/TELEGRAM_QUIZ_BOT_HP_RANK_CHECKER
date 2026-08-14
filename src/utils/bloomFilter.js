/**
 * High-performance, memory-efficient Bloom Filter for fast O(1) question deduplication.
 * Eliminates unnecessary DB/Fuzzy string comparisons when a question is guaranteed new.
 */
class QuestionBloomFilter {
    /**
     * @param {number} expectedItems Expected number of unique questions (default: 20000)
     * @param {number} falsePositiveRate Desired false positive probability (default: 0.01 = 1%)
     */
    constructor(expectedItems = 20000, falsePositiveRate = 0.01) {
        // Optimal size (m) = - (n * ln(p)) / (ln(2)^2)
        this.size = Math.ceil(-(expectedItems * Math.log(falsePositiveRate)) / Math.pow(Math.log(2), 2));
        // Optimal hash functions (k) = (m / n) * ln(2)
        this.numHashes = Math.round((this.size / expectedItems) * Math.log(2));

        // Use Uint8Array bit vector for ultra-fast bitwise manipulation
        this.bitArray = new Uint8Array(Math.ceil(this.size / 8));
    }

    /**
     * Generates multiple hash indices for a string using double-hashing (fnv1a / djb2 hybrid).
     */
    _hashes(string) {
        let h1 = 5381;
        let h2 = 0x811c9dc5;

        for (let i = 0; i < string.length; i++) {
            const c = string.charCodeAt(i);
            h1 = ((h1 << 5) + h1) ^ c;
            h2 = (h2 ^ c) * 0x01000193;
        }

        h1 = Math.abs(h1);
        h2 = Math.abs(h2);

        const indices = [];
        for (let i = 0; i < this.numHashes; i++) {
            indices.push((h1 + i * h2) % this.size);
        }
        return indices;
    }

    /**
     * Add a normalized question or keyword phrase to the Bloom Filter.
     * @param {string} item 
     */
    add(item) {
        if (!item) return;
        const indices = this._hashes(item);
        for (const idx of indices) {
            const byteIdx = Math.floor(idx / 8);
            const bitIdx = idx % 8;
            this.bitArray[byteIdx] |= (1 << bitIdx);
        }
    }

    /**
     * Check if a normalized item might be in the Bloom Filter.
     * @param {string} item 
     * @returns {boolean} false = DEFINITELY NEW (0% false negative), true = MAYBE DUPLICATE
     */
    contains(item) {
        if (!item) return false;
        const indices = this._hashes(item);
        for (const idx of indices) {
            const byteIdx = Math.floor(idx / 8);
            const bitIdx = idx % 8;
            if (!(this.bitArray[byteIdx] & (1 << bitIdx))) {
                return false; // Guaranteed NOT in set!
            }
        }
        return true; // Might be in set (run full fuzzy verification)
    }
}

module.exports = QuestionBloomFilter;
