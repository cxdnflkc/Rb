require('dotenv').config();
const express = require('express');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;
const SECRET_API_KEY = process.env.API_KEY;

// Güvenlik Kontrolü: İstek atan kişinin doğru API Key gönderip göndermediğini kontrol eder
const authenticate = (req, res, next) => {
    const userKey = req.headers['x-api-key'] || req.query.apiKey;
    
    if (!userKey || userKey !== SECRET_API_KEY) {
        return res.status(401).json({ success: false, message: 'Yetkisiz erişim: Geçersiz veya eksik API Key!' });
    }
    next();
};

// Ana test adresi
app.get('/', (req, res) => {
    res.send('Servis aktif çalışıyor.');
});

// Güvenli AI / API Istek Noktasi
app.post('/api/chat', authenticate, (req, res) => {
    const { prompt } = req.body;

    if (!prompt) {
        return res.status(400).json({ success: false, message: 'Prompt alanı boş olamaz.' });
    }

    // Burada gelen prompt'a yanıt üretilir veya başka bir servise iletilir
    res.json({
        success: true,
        response: `İsteğiniz başarıyla alındı: "${prompt}"`
    });
});

app.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda başlatıldı.`);
});
