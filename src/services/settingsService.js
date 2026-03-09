const Settings = require('../models/Settings');

const DEFAULT_SETTINGS = {
    quizTime: '20:00',
    quizCategories: ['All'], // 'All' means no category filter
    questionCount: 15
};

const getSetting = async (key) => {
    const setting = await Settings.findOne({ key });
    return setting ? setting.value : DEFAULT_SETTINGS[key];
};

const setSetting = async (key, value) => {
    await Settings.findOneAndUpdate(
        { key },
        { value },
        { upsert: true, new: true }
    );
};

module.exports = { getSetting, setSetting };
