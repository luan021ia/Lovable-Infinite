/**
 * DELETE /api/deletePanelUser
 * Remove usuário do painel (Auth + RTDB). Apenas master.
 * Body: { uid }
 */

const { getAdminAuth, verifyMasterToken, removePanelUser, parseBody } = require('./_lib/firebaseAdmin');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'DELETE, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'DELETE' && req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });

  try {
    const authResult = await verifyMasterToken(req);
    if (!authResult.ok) return res.status(authResult.status).json({ error: 'Não autorizado.' });

    const body = parseBody(req);
    const uid = (body.uid != null ? String(body.uid) : '').trim();
    if (!uid) return res.status(400).json({ error: 'uid obrigatório.' });

    const auth = getAdminAuth();
    if (!auth) return res.status(503).json({ error: 'Serviço indisponível.' });

    await auth.deleteUser(uid);
    await removePanelUser(uid);
    return res.status(200).json({ success: true, message: 'Usuário removido.' });
  } catch (err) {
    console.error('[deletePanelUser] Erro inesperado:', err);
    const code = err.code || '';
    if (code === 'auth/user-not-found') return res.status(404).json({ error: 'Usuário não encontrado.' });
    return res.status(500).json({ error: 'Erro ao remover.' });
  }
};