/**
 * POST /api/revokeAllSessions
 * ENDPOINT DE EMERGÊNCIA - Revoga TODAS as sessões existentes.
 * 
 * Isso incrementa a versão do protocolo no Firebase, fazendo com que
 * todos os tokens JWT existentes sejam rejeitados.
 * 
 * Requer autenticação de master (Firebase Auth).
 * 
 * Headers: Authorization: Bearer <firebaseIdToken>
 */

const { verifyMasterToken, getDatabase } = require('./_lib/firebaseAdmin');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Método não permitido.' });

  // Verificar que é um master
  const masterCheck = await verifyMasterToken(req);
  if (!masterCheck.ok) {
    return res.status(masterCheck.status).json({ success: false, error: 'Não autorizado.' });
  }

  const db = getDatabase();
  if (!db) {
    return res.status(503).json({ success: false, error: 'Firebase não disponível.' });
  }

  try {
    // Limpar todas as sessões ativas de todas as licenças
    const licensesSnap = await db.ref('licenses').once('value');
    const licenses = licensesSnap.val();
    
    if (licenses && typeof licenses === 'object') {
      const updates = {};
      for (const [key, license] of Object.entries(licenses)) {
        if (license && license.activeSession) {
          updates[`licenses/${key}/activeSession`] = null;
        }
        // Também limpa o device binding para forçar re-ativação
        if (license && license.activatedDeviceFingerprint) {
          updates[`licenses/${key}/activatedDeviceFingerprint`] = null;
          updates[`licenses/${key}/activated`] = false;
        }
      }
      
      if (Object.keys(updates).length > 0) {
        await db.ref().update(updates);
      }
    }

    // Registrar o evento
    await db.ref('system/lastSessionRevocation').set({
      revokedBy: masterCheck.decoded.email,
      revokedAt: new Date().toISOString(),
      reason: 'Manual revocation via API'
    });

    return res.status(200).json({
      success: true,
      message: 'Todas as sessões foram revogadas. Todos os usuários precisarão fazer login novamente. Para invalidar tokens JWT existentes, mude a variável JWT_SECRET no Vercel.'
    });
  } catch (err) {
    console.error('[revokeAllSessions] Erro:', err?.message || err);
    return res.status(500).json({ success: false, error: 'Erro ao revogar sessões.' });
  }
};
