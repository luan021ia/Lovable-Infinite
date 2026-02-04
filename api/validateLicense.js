/**
 * POST /api/validateLicense
 * Valida e ativa/atualiza sessão da licença via Firebase Admin SDK (bypass das regras RTDB).
 * Body: { licenseKey, deviceFingerprint }
 * Sem auth; a chave + device são o segredo.
 */

const { getLicense, updateLicense } = require('./lib/firebaseAdmin');

const SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15 min sem ping = sessão liberada

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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

  let licenseKey = '';
  let deviceFingerprint = '';
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    licenseKey = (body.licenseKey != null ? String(body.licenseKey) : '').trim();
    deviceFingerprint = (body.deviceFingerprint != null ? String(body.deviceFingerprint) : '').trim();
  } catch (_) {
    return res.status(400).json({ valid: false, message: 'Dados inválidos.' });
  }

  if (!licenseKey || !deviceFingerprint) {
    return res.status(400).json({ valid: false, message: 'licenseKey e deviceFingerprint obrigatórios.' });
  }

  try {
    const cloudLicense = await getLicense(licenseKey);
    if (!cloudLicense || !cloudLicense.key) {
      return res.status(200).json({ valid: false, message: 'Licença não encontrada' });
    }

    if (!cloudLicense.active) {
      return res.status(200).json({ valid: false, message: 'Licença inativa' });
    }

    const expiryDate = new Date(cloudLicense.expiryDate);
    if (expiryDate < new Date()) {
      return res.status(200).json({ valid: false, message: 'Licença expirada' });
    }

    if (cloudLicense.maxUses != null && cloudLicense.maxUses !== '' && (cloudLicense.uses || 0) >= Number(cloudLicense.maxUses)) {
      return res.status(200).json({ valid: false, message: 'Limite de usos atingido' });
    }

    const activeSession = cloudLicense.activeSession;
    if (activeSession && activeSession.deviceFingerprint !== deviceFingerprint && activeSession.lastPingAt) {
      const lastPing = new Date(activeSession.lastPingAt).getTime();
      if (Date.now() - lastPing < SESSION_TIMEOUT_MS) {
        return res.status(200).json({
          valid: false,
          message: 'Esta licença está em uso em outro dispositivo no momento. Tente novamente mais tarde.'
        });
      }
    }

    if (cloudLicense.activatedDeviceFingerprint && cloudLicense.activatedDeviceFingerprint !== deviceFingerprint) {
      return res.status(200).json({
        valid: false,
        message: 'Esta licença já foi ativada em outro computador. Uma licença só pode ser usada em um dispositivo por vez.'
      });
    }

    const nowIso = new Date().toISOString();
    const sessionPayload = { deviceFingerprint, lastPingAt: nowIso };

    if (cloudLicense.activatedDeviceFingerprint === deviceFingerprint) {
      await updateLicense(licenseKey, { activeSession: sessionPayload });
      return res.status(200).json({
        valid: true,
        message: 'Licença ativada neste dispositivo. Acesso permanente.',
        license: cloudLicense,
        userData: buildUserData(cloudLicense)
      });
    }

    const newUses = (cloudLicense.uses || 0) + 1;
    const updateData = {
      activatedDeviceFingerprint: deviceFingerprint,
      activatedDate: nowIso,
      uses: newUses,
      lastAccessDate: nowIso,
      activeSession: sessionPayload,
      activated: true
    };
    await updateLicense(licenseKey, updateData);

    return res.status(200).json({
      valid: true,
      message: 'Licença ativada e vinculada a este dispositivo! Você poderá usar indefinidamente.',
      license: { ...cloudLicense, ...updateData },
      userData: buildUserData(cloudLicense)
    });
  } catch (err) {
    return res.status(500).json({ valid: false, message: 'Erro ao validar licença.' });
  }
};
