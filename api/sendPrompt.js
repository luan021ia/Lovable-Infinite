/**
 * POST /api/sendPrompt
 * Envia prompt para a API do Lovable
 * Substitui o webhook n8n comprometido
 * 
 * Body: { message, projectId, token, chatMode? }
 * 
 * Endpoint descoberto: POST https://api.lovable.dev/projects/{projectId}/chat
 */

function cors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function parseBody(req) {
    const raw = req.body;
    if (raw == null) return {};
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
        try {
            return JSON.parse(raw);
        } catch (_) {
            return {};
        }
    }
    return {};
}

module.exports = async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Método não permitido' });

    const body = parseBody(req);
    const message = (body.message != null ? String(body.message) : '').trim();
    const projectId = (body.projectId != null ? String(body.projectId) : '').trim();
    const token = (body.token != null ? String(body.token) : '').trim();

    // Log para debug
    console.log('[sendPrompt] Recebido:', { 
        message: message.substring(0, 50) + (message.length > 50 ? '...' : ''), 
        projectId, 
        tokenLength: token.length
    });

    if (!message) {
        return res.status(400).json({ success: false, error: 'message é obrigatório' });
    }
    if (!projectId) {
        return res.status(400).json({ success: false, error: 'projectId é obrigatório' });
    }
    if (!token) {
        return res.status(400).json({ success: false, error: 'token é obrigatório' });
    }

    // Endpoint da API do Lovable para enviar mensagens de chat
    const lovableUrl = `https://api.lovable.dev/projects/${projectId}/chat`;

    try {
        console.log('[sendPrompt] Enviando para:', lovableUrl);
        
        const response = await fetch(lovableUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({ message })
        });

        const text = await response.text();
        let json = {};
        try { json = JSON.parse(text); } catch (_) {}

        console.log('[sendPrompt] Resposta Lovable:', response.status, text.substring(0, 200));

        // 202 Accepted = sucesso (requisição aceita para processamento)
        if (response.status === 202 || response.ok) {
            return res.status(200).json({ 
                success: true, 
                message: 'Prompt enviado com sucesso'
            });
        }

        // Erros específicos
        if (response.status === 401) {
            return res.status(401).json({
                success: false,
                error: 'Token inválido ou expirado. Recarregue a página do Lovable.',
                details: json
            });
        }

        if (response.status === 403) {
            return res.status(403).json({
                success: false,
                error: 'Sem permissão para este projeto.',
                details: json
            });
        }

        if (response.status === 404) {
            return res.status(404).json({
                success: false,
                error: 'Projeto não encontrado.',
                details: json
            });
        }

        // Outros erros
        return res.status(response.status).json({
            success: false,
            error: json.message || json.error || `Erro ${response.status}`,
            details: json
        });

    } catch (err) {
        console.error('[sendPrompt] Erro:', err.message);
        return res.status(500).json({
            success: false,
            error: 'Falha ao conectar com a API do Lovable: ' + err.message
        });
    }
};
