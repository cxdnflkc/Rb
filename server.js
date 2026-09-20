require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;
const API_KEY = process.env.API_KEY;

let session = null;
let isModelLoaded = false;

const MODEL_URL = "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q3_k_m.gguf";
const MODEL_PATH = path.join(__dirname, "qwen2.5-0.5b-instruct-q3_k_m.gguf");

// RAM Kullanmayan Akışlı (Stream) İndirme Fonksiyonu
function downloadModelStream(url, destPath) {
    return new Promise((resolve, reject) => {
        if (fs.existsSync(destPath)) {
            console.log("Model dosyası zaten diske indirilmiş, indirme atlanıyor.");
            return resolve();
        }

        console.log("Model dosyası akış (stream) ile diske indiriliyor...");
        const fileStream = fs.createWriteStream(destPath);

        const handleDownload = (downloadUrl) => {
            https.get(downloadUrl, (response) => {
                // HuggingFace yönlendirmelerini (302 Redirect) takip et
                if (response.statusCode === 301 || response.statusCode === 302) {
                    return handleDownload(response.headers.location);
                }

                if (response.statusCode !== 200) {
                    return reject(new Error(`İndirme başarısız: HTTP Status ${response.statusCode}`));
                }

                response.pipe(fileStream);

                fileStream.on('finish', () => {
                    fileStream.close(() => {
                        console.log("Model dosyası RAM harcanmadan başarıyla diske indirildi!");
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
        const { getLlama, LlamaChatSession } = await import('node-llama-cpp');

        // 1. Modeli RAM'i şişirmeden akışla diske indir
        await downloadModelStream(MODEL_URL, MODEL_PATH);

        // 2. Llama örneğini başlat ve yerel dosyadan yükle
        console.log("Llama örneği başlatılıyor...");
        const llama = await getLlama();

        console.log("Model RAM'e yükleniyor...");
        const model = await llama.loadModel({
            modelPath: MODEL_PATH
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

// Sunucu başlarken modeli başlat
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
