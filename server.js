
require('dotenv').config();
const express = require('express');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;
const API_KEY = process.env.API_KEY;

// Güvenlik Kontrolü (API Key)
const checkApiKey = (req, res, next) => {
    const userKey = req.headers['x-api-key'];
    if (!userKey || userKey !== API_KEY) {
        return res.status(401).json({ error: 'Yetkisiz Erişim: Geçersiz API Key!' });
    }
    next();
};

// Test Ana Sayfası
app.get('/', (req, res) => {
    res.send('AI Servisi Aktif ve Çalışıyor!');
});

// HATA VEREN KISIM BURASIYDI - EKLENDİ
app.post('/chat', checkApiKey, (req, res) => {
    const { prompt } = req.body;

    if (!prompt) {
        return res.status(400).json({ error: 'Prompt alanı boş olamaz.' });
    }

    res.json({
        status: 'success',
        response: `İsteğiniz başarıyla alındı: "${prompt}"`
    });
});

app.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda çalışıyor.`);
});
