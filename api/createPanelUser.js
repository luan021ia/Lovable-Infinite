/**
 * POST /api/createPanelUser
 * Cria um usuário no Firebase Auth (e-mail/senha) e grava em RTDB. Apenas master autorizado.
 * Body: { email, password [, displayName, validUntil ] }
 * validUntil: -1 = sem expiração, ou timestamp (ms). Header: Authorization: Bearer <Firebase ID Token>
 * Env: FIREBASE_SERVICE_ACCOUNT_JSON, FIREBASE_DATABASE_URL (opcional), MASTER_EMAILS (opcional)
 */

const { getAdminAuth, verifyMasterToken, setPanelUser } = require('./lib/firebaseAdmin');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

const GENERIC_ERROR = 'Não autorizado ou dados inválidos.';

module.exports = async function handler(req, res) {
  cors(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: GENERIC_ERROR });
  }

  let email = '';
  let password = '';
  let displayName = '';
  let validUntil = -1;
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    email = (body.email != null ? String(body.email) : '').trim().toLowerCase();
    password = body.password != null ? String(body.password) : '';
    displayName = (body.displayName != null ? String(body.displayName) : '').trim();
    if (body.validUntil !== undefined && body.validUntil !== null && body.validUntil !== '') {
      validUntil = Number(body.validUntil);
      if (Number.isNaN(validUntil)) validUntil = -1;
    }
  } catch (_) {
    return res.status(400).json({ error: GENERIC_ERROR });
  }

  if (!email || !password || password.length < 6) {
    return res.status(400).json({ error: GENERIC_ERROR });
  }

  const authResult = await verifyMasterToken(req);
  if (!authResult.ok) {
    return res.status(authResult.status).json({ error: GENERIC_ERROR });
  }

  const auth = getAdminAuth();
  if (!auth) {
    return res.status(503).json({ error: GENERIC_ERROR });
  }

  try {
    const userRecord = await auth.createUser({
      email,
      password,
      emailVerified: false,
      displayName: displayName || email,
    });
    const uid = userRecord.uid;

    await auth.setCustomUserClaims(uid, { validUntil: validUntil === -1 ? -1 : validUntil, disabled: false });

    await setPanelUser(uid, {
      uid,
      email,
      displayName: displayName || email,
      validUntil: validUntil === -1 ? -1 : validUntil,
      disabled: false,
      createdAt: Date.now(),
    });

    return res.status(200).json({ success: true, message: 'Acesso criado.', uid });
  } catch (err) {
    const code = err.code || '';
    if (code === 'auth/email-already-exists' || code === 'auth/invalid-email') {
      return res.status(400).json({ error: GENERIC_ERROR });
    }
    return res.status(500).json({ error: GENERIC_ERROR });
  }
};
