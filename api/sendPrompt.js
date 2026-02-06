/**
 * POST /api/sendPrompt
 * Proxy seguro para o webhook n8n.
 * 
 * Recebe dados limpos da extensão, valida JWT, monta o payload
 * scrambled (com segredos que SÓ existem no servidor) e encaminha
 * para o n8n. O n8n recebe EXATAMENTE o mesmo formato de antes.
 * 
 * Headers: Authorization: Bearer <sessionToken>
 * Body: { message, projectId, token, file?: { name, type, data } }
 */

const { requireSession } = require('./_lib/sessionManager');

// ========== SEGREDOS DO N8N - SÓ NO SERVIDOR ==========
// Configurar como variáveis de ambiente no Vercel
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || '';
const N8N_SECRET_SALT = process.env.N8N_SECRET_SALT || '';
const N8N_SCRAMBLE_KEY = process.env.N8N_SCRAMBLE_KEY || '';

function cors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function parseBody(req) {
    const raw = req.body;
    if (raw == null) return {};
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
        try { return JSON.parse(raw); } catch (_) { return {}; }
    }
    return {};
}

/**
 * XOR scramble - mesma lógica que estava no client, agora server-side
 */
function scramble(str, key) {
    let result = '';
    for (let i = 0; i < str.length; i++) {
        result += String.fromCharCode(
            str.charCodeAt(i) ^ key.charCodeAt(i % key.length)
        );
    }
    return result;
}

module.exports = async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Método não permitido' });

    // 1. Verificar sessão JWT (obrigatório)
    const auth = requireSession(req);
    if (!auth.ok) {
        return res.status(auth.status).json({ success: false, error: auth.message });
    }

    const { session } = auth;
    const body = parseBody(req);

    const message = (body.message != null ? String(body.message) : '').trim();
    const projectId = (body.projectId != null ? String(body.projectId) : '').trim();
    const lovableToken = (body.token != null ? String(body.token) : '').trim();
    const fileData = body.file || null; // { name, type, data (base64 dataURL) }

    if (!message) return res.status(400).json({ success: false, error: 'message é obrigatório' });
    if (!projectId) return res.status(400).json({ success: false, error: 'projectId é obrigatório' });
    if (!lovableToken) return res.status(400).json({ success: false, error: 'token é obrigatório' });

    if (!N8N_WEBHOOK_URL) {
        console.error('[sendPrompt] N8N_WEBHOOK_URL não configurada');
        return res.status(503).json({ success: false, error: 'Serviço temporariamente indisponível.' });
    }

    try {
        // 2. Montar payload EXATAMENTE como o n8n espera
        //    (mesma lógica que estava no popup.js, agora server-side)
        const timeRef = Math.floor(Date.now() / 60000);
        const signatureInput = String(timeRef) + N8N_SECRET_SALT + session.licenseKey + session.deviceFingerprint;
        const signature = Buffer.from(signatureInput).toString('base64').slice(0, 20);

        const basicPayload = {
            message: message,
            projectId: projectId,
            token: lovableToken,
            source: 'PX-EXT',
            license: session.licenseKey,
            hwid: session.deviceFingerprint,
            signature: signature
        };

        // Converter para UTF-8 latin1 (equivalente ao unescape(encodeURIComponent(...)) do browser)
        const jsonString = JSON.stringify(basicPayload);
        const utf8Latin1 = Buffer.from(jsonString, 'utf-8').toString('binary');

        // XOR scramble + base64 (equivalente ao btoa(scramble(...)) do browser)
        const scrambled = scramble(utf8Latin1, N8N_SCRAMBLE_KEY);
        const packed = Buffer.from(scrambled, 'binary').toString('base64');

        // 3. Enviar para o n8n
        let response;

        if (fileData && fileData.data) {
            // Com arquivo: enviar como FormData (mesmo formato que o background.js fazia)
            const formData = new FormData();
            formData.append('p', packed);

            // Decodificar base64 data URL para blob
            const base64Match = fileData.data.match(/^data:[^;]+;base64,(.+)$/);
            const base64Data = base64Match ? base64Match[1] : fileData.data;
            const binaryData = Buffer.from(base64Data, 'base64');
            const blob = new Blob([binaryData], { type: fileData.type || 'image/png' });
            formData.append('file', blob, fileData.name || 'image.png');

            response = await fetch(N8N_WEBHOOK_URL, {
                method: 'POST',
                body: formData
            });
        } else {
            // Sem arquivo: enviar como JSON (mesmo formato que antes)
            response = await fetch(N8N_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ p: packed })
            });
        }

        const text = await response.text();
        let json = {};
        try { json = JSON.parse(text); } catch (_) {}

        if (response.ok) {
            return res.status(200).json({ success: true, data: json });
        } else {
            const errorMsg = json.message || json.error || `Erro ${response.status}`;
            return res.status(response.status >= 400 && response.status < 600 ? response.status : 502).json({
                success: false,
                error: errorMsg
            });
        }
    } catch (err) {
        console.error('[sendPrompt] Erro:', err.message);
        return res.status(500).json({ success: false, error: 'Falha ao processar prompt: ' + err.message });
    }
};
