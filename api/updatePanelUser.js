/**
 * PATCH /api/updatePanelUser
 * Atualiza usuário do painel: nome, senha, validade, ativo/inativo. Apenas master.
 * Body: { uid, displayName?, password?, validUntil?, disabled? }
 */

const { getAdminAuth, verifyMasterToken, getPanelUser, setPanelUser, parseBody } = require('./_lib/firebaseAdmin');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PATCH, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'PATCH' && req.method !== 'PUT') return res.status(405).json({ error: 'Método não permitido.' });

  try {
    const authResult = await verifyMasterToken(req);
    if (!authResult.ok) return res.status(authResult.status).json({ error: 'Não autorizado.' });

    const body = parseBody(req);
    const uid = (body.uid != null ? String(body.uid) : '').trim();
    if (!uid) return res.status(400).json({ error: 'uid obrigatório.' });

    const auth = getAdminAuth();
    if (!auth) return res.status(503).json({ error: 'Serviço indisponível.' });

    const updates = {};
    if (body.displayName !== undefined) updates.displayName = String(body.displayName).trim() || null;
    if (body.password !== undefined && body.password !== '') {
      if (body.password.length < 6) return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres.' });
      updates.password = body.password;
    }
    if (Object.keys(updates).length > 0) {
      const current = await auth.getUser(uid).catch(() => null);
      if (!current) return res.status(404).json({ error: 'Usuário não encontrado.' });
      await auth.updateUser(uid, updates);
    }

    const existingDb = await getPanelUser(uid);
    const dbData = existingDb ? { ...existingDb } : { uid, email: '', displayName: '', validUntil: -1, disabled: false, createdAt: Date.now() };
    if (body.validUntil !== undefined) dbData.validUntil = body.validUntil === null || body.validUntil === '' ? -1 : Number(body.validUntil);
    if (body.disabled !== undefined) dbData.disabled = !!body.disabled;
    if (body.displayName !== undefined) dbData.displayName = String(body.displayName).trim() || dbData.email || '';
    await setPanelUser(uid, dbData);

    const userRecord = await auth.getUser(uid);
    const existingClaims = userRecord.customClaims || {};
    await auth.setCustomUserClaims(uid, {
      ...existingClaims,
      validUntil: dbData.validUntil == null ? -1 : dbData.validUntil,
      disabled: !!dbData.disabled,
    });

    return res.status(200).json({ success: true, message: 'Usuário atualizado.' });
  } catch (err) {
    console.error('[updatePanelUser] Erro inesperado:', err);
    const code = err.code || '';
    if (code === 'auth/user-not-found') return res.status(404).json({ error: 'Usuário não encontrado.' });
    return res.status(500).json({ error: 'Erro ao atualizar.' });
  }
};