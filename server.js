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
let llamaInstance = null;
let isModelLoaded = false;

const MODEL_URL = "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q3_k_m.gguf";
const MODEL_PATH = path.join(__dirname, "qwen2.5-0.5b-instruct-q3_k_m.gguf");

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

async function initModel() {
    try {
        console.log("node-llama-cpp yükleniyor...");
        const { getLlama } = await import('node-llama-cpp');

        await downloadModelStream(MODEL_URL, MODEL_PATH);

        console.log("Llama örneği başlatılıyor...");
        llamaInstance = await getLlama();

        console.log("Model RAM'e yükleniyor...");
        modelInstance = await llamaInstance.loadModel({
            modelPath: MODEL_PATH
        });

        isModelLoaded = true;
        console.log("Model başarıyla yüklendi ve hazır!");
    } catch (err) {
        console.error("Model yükleme hatası:", err);
    }
}

initModel();

const checkApiKey = (req, res, next) => {
    const userKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
    if (!userKey || userKey !== API_KEY) {
        return res.status(401).json({ error: 'Yetkisiz Erişim: Geçersiz API Key!' });
    }
    next();
};

app.get('/', (req, res) => {
    res.send('AI Servisi Çalışıyor!');
});

app.get('/ping', (req, res) => {
    if (!isModelLoaded) {
        return res.status(530).send('Model yukleniyor...');
    }
    res.status(200).send('pong');
});

// Chat Endpoint
app.post('/chat', checkApiKey, async (req, res) => {
    let userPrompt = req.body.prompt;
    
    if (!userPrompt && Array.isArray(req.body.messages) && req.body.messages.length > 0) {
        const lastMessage = req.body.messages[req.body.messages.length - 1];
        userPrompt = lastMessage.content || lastMessage.prompt;
    }

    if (!userPrompt) {
        return res.status(400).json({ error: 'Prompt alanı boş olamaz.' });
    }

    if (!isModelLoaded) {
        return res.status(530).json({ error: 'Model henüz uyanıyor veya yükleniyor...' });
    }

    let context = null;
    try {
        const { LlamaChatSession } = await import('node-llama-cpp');

        // Her istek için isolated (izole) context ve session açıp kapatıyoruz (RAM sızıntısını ve Sequence kilitlenmesini önler)
        context = await modelInstance.createContext({ contextSize: 512 });
        const session = new LlamaChatSession({ contextSequence: context.getSequence() });
        
        const response = await session.prompt(userPrompt, { maxTokens: 100 });
        
        // Context işi bittiğinde belleği temizle
        await context.dispose();

        res.json({
            status: 'success',
            response: response
        });
    } catch (error) {
        console.error("AI Yanıt Hatası Detayı:", error);
        if (context) {
            try { await context.dispose(); } catch (e) {}
        }
        res.status(500).json({ error: 'Yapay zeka yanıt üretirken bir hata oluştu.', detail: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda çalışıyor.`);
});
