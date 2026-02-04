/**
 * DELETE /api/deletePanelUser
 * Remove usuário do painel (Auth + RTDB). Apenas master.
 * Body: { uid }
 * Header: Authorization: Bearer <Firebase ID Token>
 */

const { getAdminAuth, verifyMasterToken, removePanelUser } = require('./lib/firebaseAdmin');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'DELETE, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'DELETE' && req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });

  const authResult = await verifyMasterToken(req);
  if (!authResult.ok) return res.status(authResult.status).json({ error: 'Não autorizado.' });

  let body = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  } catch (_) {
    return res.status(400).json({ error: 'Body inválido.' });
  }

  const uid = (body.uid != null ? String(body.uid) : '').trim();
  if (!uid) return res.status(400).json({ error: 'uid obrigatório.' });

  const auth = getAdminAuth();
  if (!auth) return res.status(503).json({ error: 'Serviço indisponível.' });

  try {
    await auth.deleteUser(uid);
    await removePanelUser(uid);
    return res.status(200).json({ success: true, message: 'Usuário removido.' });
  } catch (err) {
    const code = err.code || '';
    if (code === 'auth/user-not-found') return res.status(404).json({ error: 'Usuário não encontrado.' });
    return res.status(500).json({ error: 'Erro ao remover.' });
  }
};
