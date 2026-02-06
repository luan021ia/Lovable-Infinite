/**
 * POST /api/createPanelUser
 * Cria um usuário no Firebase Auth (e-mail/senha) e grava em RTDB. Apenas master autorizado.
 * Body: { email, password [, displayName, validUntil ] }
 * Header: Authorization: Bearer <Firebase ID Token>
 */

const { getAdminAuth, verifyMasterToken, setPanelUser, parseBody } = require('./_lib/firebaseAdmin');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });

  try {
    console.log('[createPanelUser] Step 1: Parsing body');
    const body = parseBody(req);
    const email = (body.email != null ? String(body.email) : '').trim().toLowerCase();
    const password = body.password != null ? String(body.password) : '';
    const displayName = (body.displayName != null ? String(body.displayName) : '').trim();
    let validUntil = -1;
    if (body.validUntil !== undefined && body.validUntil !== null && body.validUntil !== '') {
      validUntil = Number(body.validUntil);
      if (Number.isNaN(validUntil)) validUntil = -1;
    }
    console.log('[createPanelUser] Step 2: Validating input, email:', email);

    if (!email) return res.status(400).json({ error: 'Informe o e-mail.' });
    if (!password || password.length < 6) return res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres.' });

    console.log('[createPanelUser] Step 3: Verifying master token');
    const authResult = await verifyMasterToken(req);
    if (!authResult.ok) {
      console.log('[createPanelUser] Token verification failed, status:', authResult.status);
      return res.status(authResult.status).json({ error: 'Não autorizado. Faça login no painel.' });
    }
    console.log('[createPanelUser] Step 4: Token verified successfully');

    const auth = getAdminAuth();
    if (!auth) {
      console.log('[createPanelUser] Firebase Admin Auth not available');
      return res.status(503).json({ error: 'Serviço indisponível. Configure FIREBASE_SERVICE_ACCOUNT_JSON no Vercel.' });
    }
    console.log('[createPanelUser] Step 5: Creating user in Firebase Auth');

    const userRecord = await auth.createUser({
      email,
      password,
      emailVerified: false,
      displayName: displayName || email,
    });
    const uid = userRecord.uid;
    console.log('[createPanelUser] Step 6: User created, uid:', uid);

    await auth.setCustomUserClaims(uid, { validUntil: validUntil === -1 ? -1 : validUntil, disabled: false });

    const saved = await setPanelUser(uid, {
      uid,
      email,
      displayName: displayName || email,
      validUntil: validUntil === -1 ? -1 : validUntil,
      disabled: false,
      createdAt: Date.now(),
    });
    if (!saved) {
      // usuário criado no Auth; RTDB falhou (ex.: DB não configurado) – ainda retornamos sucesso
    }

    return res.status(200).json({ success: true, message: 'Acesso criado.', uid });
  } catch (err) {
    console.error('[createPanelUser] Erro inesperado:', err?.message || err, err?.stack || '');
    const code = err.code || '';
    const msg = (err?.message || '').toLowerCase();
    // Firebase Admin pode retornar código diferente ou mensagem descritiva
    if (code === 'auth/email-already-in-use' || code === 'auth/email-already-exists' || msg.includes('already in use') || msg.includes('already exists')) {
      return res.status(400).json({ error: 'Este e-mail já está cadastrado. Use outro ou recupere a senha.' });
    }
    if (code === 'auth/invalid-email' || msg.includes('invalid email')) {
      return res.status(400).json({ error: 'E-mail inválido.' });
    }
    return res.status(500).json({ error: 'Não foi possível criar o acesso. Tente novamente.', debug: err?.message || String(err) });
  }
};
