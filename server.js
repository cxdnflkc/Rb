require('dotenv').config();
const express = require('express');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;
const API_KEY = process.env.API_KEY;

let session = null;
let isModelLoaded = false;

// Qwen2.5-0.5B Modelini Güncel v3 API İle Yükleme
async function initModel() {
    try {
        console.log("node-llama-cpp yükleniyor...");
        const { getLlama, LlamaChatSession } = await import('node-llama-cpp');

        console.log("Llama örneği başlatılıyor...");
        const llama = await getLlama();

        console.log("Model indiriliyor ve yükleniyor (Qwen2.5-0.5B)...");
        const model = await llama.loadModel({
            modelUri: "hf:Qwen/Qwen2.5-0.5B-Instruct-GGUF/qwen2.5-0.5b-instruct-q3_k_m.gguf"
        });

        console.log("Context oluşturuluyor...");
        const context = await model.createContext({ contextSize: 512 });
        session = new LlamaChatSession({ contextSequence: context.getSequence() });

        isModelLoaded = true;
        console.log("Model başarıyla yüklendi ve hazır!");
    } catch (err) {
        console.error("Model yükleme hatası:", err);
    }
}

// Sunucu başlarken modeli arka planda yükle
initModel();

// API Key Doğrulama Middleware
const checkApiKey = (req, res, next) => {
    const userKey = req.headers['x-api-key'];
    if (!userKey || userKey !== API_KEY) {
        return res.status(401).json({ error: 'Yetkisiz Erişim: Geçersiz API Key!' });
    }
    next();
};

app.get('/', (req, res) => {
    res.send('AI Servisi Aktif!');
});

// Yapay Zeka Chat Endpoint'i
app.post('/chat', checkApiKey, async (req, res) => {
    const { prompt } = req.body;

    if (!prompt) {
        return res.status(400).json({ error: 'Prompt alanı boş olamaz.' });
    }

    if (!isModelLoaded) {
        return res.status(530).json({ error: 'Model henüz yükleniyor, lütfen birkaç saniye sonra tekrar deneyin.' });
    }

    try {
        const response = await session.prompt(prompt, { maxTokens: 150 });
        res.json({
            status: 'success',
            response: response
        });
    } catch (error) {
        console.error("AI Yanıt Hatası:", error);
        res.status(500).json({ error: 'Yapay zeka yanıt üretirken bir hata oluştu.' });
    }
});

app.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda çalışıyor.`);
});
