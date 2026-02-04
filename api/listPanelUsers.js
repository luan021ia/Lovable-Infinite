/**
 * GET /api/listPanelUsers
 * Lista usuários do painel (Firebase Auth + RTDB). Apenas master.
 * Header: Authorization: Bearer <Firebase ID Token>
 */

const { verifyMasterToken, listPanelUsersFromDb } = require('./lib/firebaseAdmin');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido.' });

  const authResult = await verifyMasterToken(req);
  if (!authResult.ok) return res.status(authResult.status).json({ error: 'Não autorizado.' });

  try {
    const list = await listPanelUsersFromDb();
    return res.status(200).json({ success: true, users: list });
  } catch (e) {
    return res.status(500).json({ error: 'Erro ao listar usuários.' });
  }
};
