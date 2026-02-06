/**
 * POST /api/getPromptConfig
 * Retorna as credenciais de comunicação com o n8n.
 * Requer JWT válido. Os segredos NUNCA ficam no código-fonte da extensão.
 * 
 * Headers: Authorization: Bearer <sessionToken>
 * Retorna: { success, config: { webhookUrl, secretSalt, scrambleKey } }
 */

const { requireSession } = require('./_lib/sessionManager');

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || '';
const N8N_SECRET_SALT = process.env.N8N_SECRET_SALT || '';
const N8N_SCRAMBLE_KEY = process.env.N8N_SCRAMBLE_KEY || '';

function cors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Método não permitido.' });

    // Verificar JWT - só quem tem sessão válida recebe os segredos
    const auth = requireSession(req);
    if (!auth.ok) {
        return res.status(auth.status).json({ success: false, error: auth.message });
    }

    if (!N8N_WEBHOOK_URL) {
        return res.status(503).json({ success: false, error: 'Serviço indisponível.' });
    }

    return res.status(200).json({
        success: true,
        config: {
            webhookUrl: N8N_WEBHOOK_URL,
            secretSalt: N8N_SECRET_SALT,
            scrambleKey: N8N_SCRAMBLE_KEY
        }
    });
};
