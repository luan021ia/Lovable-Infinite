/**
 * POST /api/verifySession
 * Verifica se a sessão JWT da extensão ainda é válida.
 * A extensão DEVE chamar este endpoint a cada abertura do popup.
 * 
 * Também atualiza o lastPingAt da sessão ativa no Firebase
 * (para manter o controle de "em uso em outro dispositivo").
 * 
 * Headers: Authorization: Bearer <sessionToken>
 * 
 * Retorna: { valid, session?, license?, message }
 */

const { requireSession } = require('./_lib/sessionManager');
const { getDatabase, getLicense, updateLicense } = require('./_lib/firebaseAdmin');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ valid: false, message: 'Método não permitido.' });

  // 1. Verificar JWT
  const auth = requireSession(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ valid: false, message: auth.message });
  }

  const { session } = auth;

  // 2. Verificar se a licença ainda é válida no Firebase
  if (!getDatabase()) {
    return res.status(503).json({ valid: false, message: 'Serviço temporariamente indisponível.' });
  }

  try {
    const license = await getLicense(session.licenseKey);

    if (!license || !license.key) {
      return res.status(200).json({ valid: false, message: 'Licença não encontrada.' });
    }

    if (!license.active) {
      return res.status(200).json({ valid: false, message: 'Licença desativada.' });
    }

    // Verificar expiração
    if (license.lifetime !== true) {
      const expiryDate = new Date(license.expiryDate);
      if (Number.isNaN(expiryDate.getTime()) || expiryDate < new Date()) {
        return res.status(200).json({ valid: false, message: 'Licença expirada.' });
      }
    }

    // Verificar se o device fingerprint bate
    if (license.activatedDeviceFingerprint && license.activatedDeviceFingerprint !== session.deviceFingerprint) {
      return res.status(200).json({ valid: false, message: 'Dispositivo não autorizado.' });
    }

    // 3. Atualizar o ping da sessão ativa no Firebase
    //    (mantém o controle de "em uso em outro dispositivo")
    const nowIso = new Date().toISOString();
    await updateLicense(session.licenseKey, {
      activeSession: {
        deviceFingerprint: session.deviceFingerprint,
        lastPingAt: nowIso
      }
    });

    // 4. Tudo ok - sessão válida
    return res.status(200).json({
      valid: true,
      message: 'Sessão válida.',
      session: {
        licenseKey: session.licenseKey,
        expiresAt: session.expiresAt * 1000,
        protocolVersion: session.protocolVersion
      },
      license: {
        expiryDate: license.expiryDate || null,
        lifetime: license.lifetime === true,
        userName: license.userName || ''
      }
    });
  } catch (err) {
    console.error('[verifySession] Erro:', err?.message || err);
    return res.status(500).json({ valid: false, message: 'Erro ao verificar sessão.' });
  }
};
