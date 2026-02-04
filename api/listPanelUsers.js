/**
 * GET /api/listPanelUsers
 * Lista usuários do painel (RTDB). Apenas master.
 * Header: Authorization: Bearer <Firebase ID Token>
 */

const { verifyMasterToken, listPanelUsersFromDb, parseBody } = require('./lib/firebaseAdmin');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido.' });

  try {
    const authResult = await verifyMasterToken(req);
    if (!authResult.ok) return res.status(authResult.status).json({ error: 'Não autorizado.' });

    const list = await listPanelUsersFromDb();
    return res.status(200).json({ success: true, users: list });
  } catch (err) {
    console.error('[listPanelUsers] Erro inesperado:', err);
    return res.status(500).json({ error: 'Erro ao listar usuários.' });
  }
};