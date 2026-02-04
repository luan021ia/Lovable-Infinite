/**
 * Helper Firebase Admin + Realtime Database para APIs do painel.
 * Env: FIREBASE_SERVICE_ACCOUNT_JSON, FIREBASE_DATABASE_URL (opcional)
 */

let adminApp = null;

function getAdminApp() {
  if (adminApp) return adminApp;
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  if (!raw) {
    console.error('[firebaseAdmin] FIREBASE_SERVICE_ACCOUNT_JSON não configurada');
    return null;
  }
  try {
    const serviceAccount = JSON.parse(raw);
    const admin = require('firebase-admin');
    if (!admin.apps.length) {
      const options = { credential: admin.credential.cert(serviceAccount) };
      const dbUrl = (process.env.FIREBASE_DATABASE_URL || '').trim() ||
        `https://${serviceAccount.project_id || 'lovable2-e6f7f'}-default-rtdb.firebaseio.com`;
      options.databaseURL = dbUrl;
      admin.initializeApp(options);
    }
    adminApp = admin;
    return admin;
  } catch (e) {
    console.error('[firebaseAdmin] Erro ao inicializar Firebase Admin:', e);
    return null;
  }
}

function getAdminAuth() {
  const app = getAdminApp();
  return app ? app.auth() : null;
}

function getDatabase() {
  const app = getAdminApp();
  return app ? app.database() : null;
}

function getMasterEmails() {
  const raw = (process.env.MASTER_EMAILS || 'luan93dutra@gmail.com').trim();
  return raw ? raw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean) : [];
}

async function verifyMasterToken(req) {
  const auth = getAdminAuth();
  if (!auth) return { ok: false, status: 503 };
  const authHeader = (req.headers.authorization || req.headers.Authorization || '').trim();
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return { ok: false, status: 401 };
  let decoded;
  try {
    decoded = await auth.verifyIdToken(token);
  } catch (err) {
    console.error('[verifyMasterToken] Token inválido ou expirado:', err);
    return { ok: false, status: 401 };
  }
  const callerEmail = (decoded.email || '').trim().toLowerCase();
  if (!callerEmail) {
    console.warn('[verifyMasterToken] Token decodificado sem email:', decoded);
    return { ok: false, status: 403 };
  }
  const masterEmails = getMasterEmails();
  const isMaster = masterEmails.indexOf(callerEmail) !== -1;
  if (!isMaster) {
    console.warn('[verifyMasterToken] Email não autorizado:', callerEmail, 'Master emails:', masterEmails);
    return { ok: false, status: 403 };
  }
  return { ok: true, decoded };
}

const PANEL_USERS_PATH = 'panelUsers';
const LICENSES_PATH = 'licenses';

async function getPanelUserRef(uid) {
  const db = getDatabase();
  if (!db) return null;
  return db.ref(PANEL_USERS_PATH).child(uid);
}

async function getPanelUser(uid) {
  const ref = await getPanelUserRef(uid);
  if (!ref) return null;
  const snap = await ref.once('value');
  return snap.val();
}

async function setPanelUser(uid, data) {
  const ref = await getPanelUserRef(uid);
  if (!ref) return false;
  try {
    await ref.set(data);
    return true;
  } catch (err) {
    console.error('[setPanelUser] Erro ao salvar usuário:', uid, err);
    return false;
  }
}

async function removePanelUser(uid) {
  const ref = await getPanelUserRef(uid);
  if (!ref) return false;
  try {
    await ref.remove();
    return true;
  } catch (err) {
    console.error('[removePanelUser] Erro ao remover usuário:', uid, err);
    return false;
  }
}

async function listPanelUsersFromDb() {
  const db = getDatabase();
  if (!db) return [];
  try {
    const snap = await db.ref(PANEL_USERS_PATH).once('value');
    const val = snap.val();
    if (!val || typeof val !== 'object') return [];
    return Object.entries(val).map(([uid, v]) => ({ uid, ...v }));
  } catch (err) {
    console.error('[listPanelUsersFromDb] Erro ao listar usuários:', err);
    return [];
  }
}

function getLicenseRef(key) {
  const db = getDatabase();
  if (!db) return null;
  return db.ref(LICENSES_PATH).child(key);
}

async function getLicense(key) {
  const ref = getLicenseRef(key);
  if (!ref) return null;
  try {
    const snap = await ref.once('value');
    return snap.val();
  } catch (err) {
    console.error('[getLicense] Erro ao buscar licença:', key, err);
    return null;
  }
}

async function updateLicense(key, updates) {
  const ref = getLicenseRef(key);
  if (!ref) return false;
  try {
    const merged = { ...updates, timestamp: new Date().toISOString() };
    await ref.update(merged);
    return true;
  } catch (err) {
    console.error('[updateLicense] Erro ao atualizar licença:', key, err);
    return false;
  }
}

module.exports = {
  getAdminApp,
  getAdminAuth,
  getDatabase,
  getMasterEmails,
  verifyMasterToken,
  getPanelUser,
  setPanelUser,
  removePanelUser,
  listPanelUsersFromDb,
  getLicense,
  updateLicense,
  parseBody,
};
