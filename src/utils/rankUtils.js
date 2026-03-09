const getRankDetails = (points) => {
    if (points >= 5000) return { title: 'Rank Master', emoji: '👑' };
    if (points >= 2000) return { title: 'Expert', emoji: '🧠' };
    if (points >= 500) return { title: 'Scholar', emoji: '📚' };
    return { title: 'Aspirant', emoji: '🎓' };
};

module.exports = { getRankDetails };
