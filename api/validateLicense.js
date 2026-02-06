/**
 * POST /api/validateLicense
 * Valida e ativa/atualiza sessão da licença via Firebase Admin SDK.
 * AGORA retorna um JWT de sessão que a extensão DEVE usar em todas as requisições.
 * 
 * Body: { licenseKey, deviceFingerprint }
 * Retorna: { valid, message, sessionToken?, refreshToken?, expiresAt?, license?, userData? }
 */

const { getDatabase, getLicense, updateLicense } = require('./_lib/firebaseAdmin');
const { createSession } = require('./_lib/sessionManager');

const SESSION_TIMEOUT_MS = 15 * 60 * 1000;

// ========== MODO DE EMERGÊNCIA ==========
// Bloqueia TODAS as licenças exceto a de manutenção
const EMERGENCY_MODE = false;
const MAINTENANCE_LICENSE_KEY = 'MLI-MANUTENCAO-2026-EMERGENCIA';

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

function buildUserData(license) {
  const userData = {};
  if (license && license.expiryDate) userData.expiryDate = license.expiryDate;
  if (license && license.lifetime === true) userData.lifetime = true;
  return userData;
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ valid: false, message: 'Método não permitido.' });

  const body = parseBody(req);
  const licenseKey = (body.licenseKey != null ? String(body.licenseKey) : '').trim();
  const deviceFingerprint = (body.deviceFingerprint != null ? String(body.deviceFingerprint) : '').trim();

  if (!licenseKey || !deviceFingerprint) {
    return res.status(400).json({ valid: false, message: 'licenseKey e deviceFingerprint obrigatórios.' });
  }

  // ========== MODO DE EMERGÊNCIA ==========
  if (EMERGENCY_MODE) {
    if (licenseKey === MAINTENANCE_LICENSE_KEY) {
      const session = createSession({ licenseKey: MAINTENANCE_LICENSE_KEY, deviceFingerprint, userName: 'Manutenção' });
      return res.status(200).json({
        valid: true,
        message: 'Licença de manutenção ativa.',
        sessionToken: session.sessionToken,
        refreshToken: session.refreshToken,
        expiresAt: session.expiresAt,
        license: { key: MAINTENANCE_LICENSE_KEY, lifetime: true, active: true },
        userData: { lifetime: true }
      });
    } else {
      return res.status(200).json({
        valid: false,
        message: 'Sistema em manutenção. Tente novamente mais tarde.'
      });
    }
  }
  // =========================================

  if (!getDatabase()) {
    console.error('[validateLicense] Firebase não configurado (FIREBASE_SERVICE_ACCOUNT_JSON)');
    return res.status(503).json({ valid: false, message: 'Serviço temporariamente indisponível.' });
  }

  try {
    const cloudLicense = await getLicense(licenseKey);
    if (!cloudLicense || !cloudLicense.key) {
      return res.status(200).json({ valid: false, message: 'Licença não encontrada' });
    }
    if (!cloudLicense.active) {
      return res.status(200).json({ valid: false, message: 'Licença inativa' });
    }
    if (cloudLicense.lifetime !== true) {
      const expiryDate = new Date(cloudLicense.expiryDate);
      if (Number.isNaN(expiryDate.getTime()) || expiryDate < new Date()) {
        return res.status(200).json({ valid: false, message: 'Licença expirada' });
      }
    }
    if (cloudLicense.maxUses != null && cloudLicense.maxUses !== '' && (cloudLicense.uses || 0) >= Number(cloudLicense.maxUses)) {
      return res.status(200).json({ valid: false, message: 'Limite de usos atingido' });
    }

    // Verificação de sessão ativa em outro dispositivo
    const activeSession = cloudLicense.activeSession;
    if (activeSession && activeSession.deviceFingerprint !== deviceFingerprint && activeSession.lastPingAt) {
      const lastPing = new Date(activeSession.lastPingAt).getTime();
      if (!Number.isNaN(lastPing) && Date.now() - lastPing < SESSION_TIMEOUT_MS) {
        return res.status(200).json({
          valid: false,
          message: 'Esta licença está em uso em outro dispositivo no momento. Tente novamente mais tarde.'
        });
      }
    }

    // Verificação de device binding
    if (cloudLicense.activatedDeviceFingerprint && cloudLicense.activatedDeviceFingerprint !== deviceFingerprint) {
      return res.status(200).json({
        valid: false,
        message: 'Esta licença já foi ativada em outro computador. Uma licença só pode ser usada em um dispositivo por vez.'
      });
    }

    const nowIso = new Date().toISOString();
    const sessionPayload = { deviceFingerprint, lastPingAt: nowIso };

    // Gerar JWT de sessão
    const jwtSession = createSession({
      licenseKey,
      deviceFingerprint,
      userName: cloudLicense.userName || ''
    });

    if (cloudLicense.activatedDeviceFingerprint === deviceFingerprint) {
      // Já ativado neste dispositivo - atualizar sessão
      await updateLicense(licenseKey, { activeSession: sessionPayload });
      return res.status(200).json({
        valid: true,
        message: 'Licença ativada neste dispositivo. Acesso permanente.',
        sessionToken: jwtSession.sessionToken,
        refreshToken: jwtSession.refreshToken,
        expiresAt: jwtSession.expiresAt,
        license: cloudLicense,
        userData: buildUserData(cloudLicense)
      });
    }

    // Primeira ativação - vincular dispositivo
    const newUses = (cloudLicense.uses || 0) + 1;
    const updateData = {
      activatedDeviceFingerprint: deviceFingerprint,
      activatedDate: nowIso,
      uses: newUses,
      lastAccessDate: nowIso,
      activeSession: sessionPayload,
      activated: true
    };
    const updated = await updateLicense(licenseKey, updateData);
    if (!updated) {
      return res.status(503).json({ valid: false, message: 'Erro ao ativar licença. Tente novamente.' });
    }

    return res.status(200).json({
      valid: true,
      message: 'Licença ativada e vinculada a este dispositivo!',
      sessionToken: jwtSession.sessionToken,
      refreshToken: jwtSession.refreshToken,
      expiresAt: jwtSession.expiresAt,
      license: { ...cloudLicense, ...updateData },
      userData: buildUserData(cloudLicense)
    });
  } catch (err) {
    console.error('[validateLicense] Erro inesperado:', err?.message || err, err?.stack);
    return res.status(500).json({ valid: false, message: 'Erro ao validar licença.' });
  }
};
