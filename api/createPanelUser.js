/**
 * POST /api/createPanelUser
 * Cria um usuário no Firebase Auth (e-mail/senha). Apenas master autorizado.
 * Body: { email, password [, passwordConfirm] }
 * Header: Authorization: Bearer <Firebase ID Token>
 * Env: FIREBASE_SERVICE_ACCOUNT_JSON (JSON string do service account), MASTER_EMAILS (opcional, e-mails separados por vírgula)
 */

let adminApp = null;

function getAdminAuth() {
  if (adminApp) return adminApp.auth();
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  if (!raw) return null;
  try {
    const serviceAccount = JSON.parse(raw);
    const admin = require('firebase-admin');
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
    adminApp = admin;
    return admin.auth();
  } catch (e) {
    return null;
  }
}

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
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    email = (body.email != null ? String(body.email) : '').trim().toLowerCase();
    password = body.password != null ? String(body.password) : '';
  } catch (_) {
    return res.status(400).json({ error: GENERIC_ERROR });
  }

  if (!email || !password || password.length < 6) {
    return res.status(400).json({ error: GENERIC_ERROR });
  }

  const authHeader = (req.headers.authorization || req.headers.Authorization || '').trim();
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    return res.status(401).json({ error: GENERIC_ERROR });
  }

  const auth = getAdminAuth();
  if (!auth) {
    return res.status(503).json({ error: GENERIC_ERROR });
  }

  let decoded = null;
  try {
    decoded = await auth.verifyIdToken(token);
  } catch (_) {
    return res.status(401).json({ error: GENERIC_ERROR });
  }

  const callerEmail = (decoded.email || '').trim().toLowerCase();
  const masterEmailsRaw = (process.env.MASTER_EMAILS || 'luan93dutra@gmail.com').trim();
  const masterEmails = masterEmailsRaw ? masterEmailsRaw.split(',').map(function (e) { return e.trim().toLowerCase(); }).filter(Boolean) : [];
  const isMaster = masterEmails.indexOf(callerEmail) !== -1;
  if (!isMaster) {
    return res.status(403).json({ error: GENERIC_ERROR });
  }

  try {
    await auth.createUser({ email: email, password: password, emailVerified: false });
    return res.status(200).json({ success: true, message: 'Acesso criado.' });
  } catch (err) {
    const code = err.code || '';
    if (code === 'auth/email-already-exists' || code === 'auth/invalid-email') {
      return res.status(400).json({ error: GENERIC_ERROR });
    }
    return res.status(500).json({ error: GENERIC_ERROR });
  }
};
