require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;
const API_KEY = process.env.API_KEY;

let modelInstance = null;
let llamaContext = null;
let isModelLoaded = false;

const MODEL_URL = "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q3_k_m.gguf";
const MODEL_PATH = path.join(__dirname, "qwen2.5-0.5b-instruct-q3_k_m.gguf");

// Stream İndirme Fonksiyonu
function downloadModelStream(url, destPath) {
    return new Promise((resolve, reject) => {
        if (fs.existsSync(destPath)) {
            console.log("Model dosyası zaten diske indirilmiş.");
            return resolve();
        }

        console.log("Model indiriliyor...");
        const fileStream = fs.createWriteStream(destPath);

        const handleDownload = (downloadUrl) => {
            https.get(downloadUrl, (response) => {
                if (response.statusCode === 301 || response.statusCode === 302) {
                    return handleDownload(response.headers.location);
                }
                if (response.statusCode !== 200) {
                    return reject(new Error(`İndirme başarısız: HTTP ${response.statusCode}`));
                }

                response.pipe(fileStream);

                fileStream.on('finish', () => {
                    fileStream.close(() => {
                        console.log("Model diske başarıyla indirildi!");
                        resolve();
                    });
                });
            }).on('error', (err) => {
                fs.unlink(destPath, () => {});
                reject(err);
            });
        };

        handleDownload(url);
    });
}

// Modeli Başlatma
async function initModel() {
    try {
        console.log("node-llama-cpp yukleniyor...");
        const { getLlama } = await import('node-llama-cpp');

        await downloadModelStream(MODEL_URL, MODEL_PATH);

        console.log("Llama örneği başlatılıyor...");
        const llama = await getLlama();

        console.log("Model RAM'e yükleniyor...");
        modelInstance = await llama.loadModel({
            modelPath: MODEL_PATH
        });

        console.log("Context oluşturuluyor...");
        llamaContext = await modelInstance.createContext({ contextSize: 512 });

        isModelLoaded = true;
        console.log("Model başarıyla yüklendi ve hazır!");
    } catch (err) {
        console.error("Model yükleme hatası:", err);
    }
}

initModel();

// API Key Kontrolü
const checkApiKey = (req, res, next) => {
    const userKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
    if (!userKey || userKey !== API_KEY) {
        return res.status(401).json({ error: 'Yetkisiz Erişim: Geçersiz API Key!' });
    }
    next();
};

// 1. Ana Sayfa
app.get('/', (req, res) => {
    res.send('AI Servisi Çalışıyor!');
});

// 2. UptimeRobot İçin Aktif Tutma (Health-Check) Endpoint'i
app.get('/ping', (req, res) => {
    if (!isModelLoaded) {
        return res.status(530).send('Model yukleniyor...');
    }
    res.status(200).send('pong');
});

// 3. Chat Endpoint (Esnek Format Destekli)
app.post('/chat', checkApiKey, async (req, res) => {
    // Hem { prompt: "mesaj" } hem de { messages: [{ content: "mesaj" }] } formatını kabul eder
    let userPrompt = req.body.prompt;
    
    if (!userPrompt && Array.isArray(req.body.messages) && req.body.messages.length > 0) {
        const lastMessage = req.body.messages[req.body.messages.length - 1];
        userPrompt = lastMessage.content || lastMessage.prompt;
    }

    if (!userPrompt) {
        return res.status(400).json({ error: 'Prompt veya messages alanı boş olamaz.' });
    }

    if (!isModelLoaded) {
        return res.status(530).json({ error: 'Model henüz uyanıyor veya yükleniyor, lütfen birkaç saniye sonra tekrar deneyin.' });
    }

    try {
        const { LlamaChatSession } = await import('node-llama-cpp');
        // Her istek için izole edilmiş taze session oluşturulur
        const session = new LlamaChatSession({ contextSequence: llamaContext.getSequence() });
        
        const response = await session.prompt(userPrompt, { maxTokens: 120 });
        
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
