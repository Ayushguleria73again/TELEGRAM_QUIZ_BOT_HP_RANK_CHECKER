const https = require('https');
const dotenv = require('dotenv');

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
    console.error('❌ Error: TELEGRAM_BOT_TOKEN is missing in .env');
    process.exit(1);
}

console.log(`🔍 Testing connectivity for token: ${token.substring(0, 10)}...`);

const options = {
    hostname: 'api.telegram.org',
    port: 443,
    path: `/bot${token}/getMe`,
    method: 'GET',
    // Force IPv4 if needed (some Node 17+ issues)
    family: 4
};

const req = https.request(options, (res) => {
    console.log(`📡 Status Code: ${res.statusCode}`);

    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        const response = JSON.parse(data);
        if (response.ok) {
            console.log('✅ Success! Connection to Telegram API is working.');
            console.log(`🤖 Bot Name: @${response.result.username}`);
        } else {
            console.log('❌ Telegram API error:', response.description);
        }
        process.exit();
    });
});

req.on('error', (error) => {
    console.error('❌ Network Error:', error.message);
    if (error.code === 'EADDRINUSE') {
        console.log('💡 Tip: Your port or another instance is already running.');
    }
    process.exit(1);
});

req.end();
