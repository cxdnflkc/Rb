require('dotenv').config();
const express = require('express');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;
const API_KEY = process.env.API_KEY;

let session = null;
let isModelLoaded = false;

// Qwen2.5-0.5B Modelini Dinamik Import İle Yükleme
async function initModel() {
    try {
        console.log("Model kütüphanesi yükleniyor...");
        // node-llama-cpp modülünü dinamik import() ile çağırıyoruz
        const { LlamaModel, LlamaContext, LlamaChatSession, HuggingFaceModelRepository } = await import('node-llama-cpp');

        console.log("Model indiriliyor...");
        const repository = new HuggingFaceModelRepository({
            repo: "Qwen/Qwen2.5-0.5B-Instruct-GGUF"
        });
        const modelPath = await repository.downloadModel("qwen2.5-0.5b-instruct-q3_k_m.gguf");

        const model = new LlamaModel({ modelPath });
        const context = new LlamaContext({ model, contextSize: 512 });
        session = new LlamaChatSession({ contextSequence: context.getSequence() });
        
        isModelLoaded = true;
        console.log("Model başarıyla yüklendi!");
    } catch (err) {
        console.error("Model yükleme hatası:", err);
    }
}

// Sunucu başlarken modeli arka planda başlat
initModel();

// API Key Doğrulama
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

// Chat Endpoint
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
