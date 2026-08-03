// Badge definitions and utility functions

const BADGES = {
    STREAK_MASTER: {
        name: 'Streak Master',
        emoji: '🔥',
        description: '7-day participation streak',
        check: (user) => user.currentStreak >= 7 || user.longestStreak >= 7
    },
    CENTURY_CLUB: {
        name: 'Century Club',
        emoji: '💯',
        description: '100 correct answers',
        check: (user) => user.stats.totalCorrect >= 100
    },
    SHARPSHOOTER: {
        name: 'Sharpshooter',
        emoji: '🎯',
        description: '90%+ accuracy (min 50 attempts)',
        check: (user) => {
            if (user.stats.totalAttempted < 50) return false;
            return (user.stats.totalCorrect / user.stats.totalAttempted) * 100 >= 90;
        }
    },
    HP_SCHOLAR: {
        name: 'HP Scholar',
        emoji: '👑',
        description: 'Reach 500 total points',
        check: (user) => user.totalScore >= 500
    },
    LEGEND: {
        name: 'Legend',
        emoji: '🏆',
        description: 'Reach 5000 total points',
        check: (user) => user.totalScore >= 5000
    },
    FIRST_STEP: {
        name: 'First Step',
        emoji: '⭐',
        description: 'Answer your first question correctly',
        check: (user) => user.stats.totalCorrect >= 1
    },
    DEDICATED: {
        name: 'Dedicated',
        emoji: '📚',
        description: '50 questions attempted',
        check: (user) => user.stats.totalAttempted >= 50
    },
    MARATHON: {
        name: 'Marathon',
        emoji: '🏃',
        description: '500 questions attempted',
        check: (user) => user.stats.totalAttempted >= 500
    },
    STREAK_LEGEND: {
        name: 'Streak Legend',
        emoji: '🌟',
        description: '30-day participation streak',
        check: (user) => user.currentStreak >= 30 || user.longestStreak >= 30
    },
    HALF_CENTURY: {
        name: 'Half Century',
        emoji: '5️⃣0️⃣',
        description: '50 correct answers',
        check: (user) => user.stats.totalCorrect >= 50
    }
};

/**
 * Check all badges for a user and return any newly earned badges.
 * @param {Object} user - Mongoose user document
 * @returns {Array} Array of newly earned badge objects { name, emoji, description }
 */
const checkAndAwardBadges = (user) => {
    const currentBadges = user.badges || [];
    const newBadges = [];

    for (const [key, badge] of Object.entries(BADGES)) {
        if (!currentBadges.includes(badge.name) && badge.check(user)) {
            newBadges.push(badge);
            currentBadges.push(badge.name);
        }
    }

    user.badges = currentBadges;
    return newBadges;
};

/**
 * Get the emoji for a badge name.
 * @param {string} badgeName 
 * @returns {string} emoji string
 */
const getBadgeEmojis = (badgeName) => {
    for (const badge of Object.values(BADGES)) {
        if (badge.name === badgeName) {
            return `${badge.emoji}`;
        }
    }
    return '🎖️';
};

/**
 * Format all earned badges as a display string.
 * @param {Array} badgeNames - Array of badge name strings
 * @returns {string} formatted badge display
 */
const formatBadges = (badgeNames) => {
    if (!badgeNames || badgeNames.length === 0) {
        return 'None yet — keep playing!';
    }

    return badgeNames.map(name => {
        const badge = Object.values(BADGES).find(b => b.name === name);
        return badge ? `${badge.emoji} ${badge.name}` : `🎖️ ${name}`;
    }).join('\n');
};

module.exports = { BADGES, checkAndAwardBadges, getBadgeEmojis, formatBadges };
