/**
 * GET /api/listPanelUsers
 * Lista usuários do painel diretamente do Firebase Auth. Apenas master.
 * Header: Authorization: Bearer <Firebase ID Token>
 */

const { getAdminAuth, verifyMasterToken, listPanelUsersFromDb } = require('./lib/firebaseAdmin');

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

    const auth = getAdminAuth();
    if (!auth) return res.status(503).json({ error: 'Serviço indisponível.' });

    // Listar todos os usuários do Firebase Auth (até 1000)
    const listResult = await auth.listUsers(1000);
    const authUsers = listResult.users || [];

    // Também pegar dados do RTDB para mesclar informações extras
    const dbUsers = await listPanelUsersFromDb();
    const dbMap = {};
    dbUsers.forEach(u => { if (u.uid) dbMap[u.uid] = u; });

    // Mesclar: Auth é a fonte principal, RTDB complementa
    const users = authUsers.map(userRecord => {
      const dbData = dbMap[userRecord.uid] || {};
      const claims = userRecord.customClaims || {};
      return {
        uid: userRecord.uid,
        email: userRecord.email || '',
        displayName: userRecord.displayName || dbData.displayName || '',
        disabled: userRecord.disabled || false,
        validUntil: claims.validUntil !== undefined ? claims.validUntil : (dbData.validUntil !== undefined ? dbData.validUntil : -1),
        createdAt: dbData.createdAt || (userRecord.metadata?.creationTime ? new Date(userRecord.metadata.creationTime).getTime() : null),
        lastSignIn: userRecord.metadata?.lastSignInTime || null,
        emailVerified: userRecord.emailVerified || false,
      };
    });

    return res.status(200).json({ success: true, users: users });
  } catch (err) {
    console.error('[listPanelUsers] Erro inesperado:', err);
    return res.status(500).json({ error: 'Erro ao listar usuários: ' + (err.message || err) });
  }
};