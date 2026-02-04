/**
 * POST /api/publishExtensionRelease
 * Atualiza extensionRelease/current no Realtime Database. Apenas master autorizado.
 * Body: { version?: string, message?: string }
 * Header: Authorization: Bearer <Firebase ID Token>
 * Env: FIREBASE_SERVICE_ACCOUNT_JSON, MASTER_EMAILS (opcional)
 */

let adminApp = null;

function getAdminApp() {
  if (adminApp) return adminApp;
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  if (!raw) return null;
  try {
    const serviceAccount = JSON.parse(raw);
    const admin = require('firebase-admin');
    if (!admin.apps.length) {
      const databaseURL = (serviceAccount.project_id && `https://${serviceAccount.project_id}-default-rtdb.firebaseio.com`) || process.env.FIREBASE_DATABASE_URL || '';
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount), databaseURL: databaseURL || undefined });
    }
    adminApp = admin;
    return admin;
  } catch (e) {
    return null;
  }
}

function getAdminDb() {
  const app = getAdminApp();
  return app ? app.database() : null;
}

function getAdminAuth() {
  const app = getAdminApp();
  return app ? app.auth() : null;
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

  let version = '';
  let message = '';
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    version = (body.version != null ? String(body.version) : '').trim();
    message = (body.message != null ? String(body.message) : '').trim();
  } catch (_) {
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

  const db = getAdminDb();
  if (!db) {
    return res.status(503).json({ error: GENERIC_ERROR });
  }

  const payload = {
    version: version || '1.0.0',
    message: message || 'Extensão atualizada. Baixe a nova versão.',
    publishedAt: Date.now()
  };

  try {
    await db.ref('extensionRelease/current').set(payload);
    return res.status(200).json({ success: true, message: 'Versão publicada.' });
  } catch (err) {
    console.error('[publishExtensionRelease] Erro inesperado:', err);
    return res.status(500).json({ error: GENERIC_ERROR });
  }
};
