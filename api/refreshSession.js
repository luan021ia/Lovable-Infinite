/**
 * POST /api/refreshSession
 * Renova o token de sessão usando o refresh token.
 * 
 * Body: { refreshToken, deviceFingerprint }
 * 
 * Retorna: { valid, sessionToken?, refreshToken?, expiresAt?, message }
 */

const { verifyRefreshToken, createSession } = require('./_lib/sessionManager');
const { getDatabase, getLicense } = require('./_lib/firebaseAdmin');

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

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ valid: false, message: 'Método não permitido.' });

  const body = parseBody(req);
  const refreshToken = (body.refreshToken || '').trim();
  const deviceFingerprint = (body.deviceFingerprint || '').trim();

  if (!refreshToken) {
    return res.status(400).json({ valid: false, message: 'refreshToken obrigatório.' });
  }

  // 1. Verificar refresh token
  const decoded = verifyRefreshToken(refreshToken);
  if (!decoded) {
    return res.status(401).json({ valid: false, message: 'Refresh token expirado ou inválido. Faça login novamente.' });
  }

  // 2. Verificar device fingerprint
  if (deviceFingerprint && decoded.deviceFingerprint !== deviceFingerprint) {
    return res.status(401).json({ valid: false, message: 'Dispositivo não corresponde. Faça login novamente.' });
  }

  // 3. Verificar se a licença ainda é válida
  if (!getDatabase()) {
    return res.status(503).json({ valid: false, message: 'Serviço temporariamente indisponível.' });
  }

  try {
    const license = await getLicense(decoded.licenseKey);
    
    if (!license || !license.key || !license.active) {
      return res.status(200).json({ valid: false, message: 'Licença inativa ou não encontrada.' });
    }

    if (license.lifetime !== true) {
      const expiryDate = new Date(license.expiryDate);
      if (Number.isNaN(expiryDate.getTime()) || expiryDate < new Date()) {
        return res.status(200).json({ valid: false, message: 'Licença expirada.' });
      }
    }

    // 4. Gerar nova sessão
    const newSession = createSession({
      licenseKey: decoded.licenseKey,
      deviceFingerprint: decoded.deviceFingerprint,
      userName: license.userName || ''
    });

    return res.status(200).json({
      valid: true,
      message: 'Sessão renovada.',
      sessionToken: newSession.sessionToken,
      refreshToken: newSession.refreshToken,
      expiresAt: newSession.expiresAt
    });
  } catch (err) {
    console.error('[refreshSession] Erro:', err?.message || err);
    return res.status(500).json({ valid: false, message: 'Erro ao renovar sessão.' });
  }
};
