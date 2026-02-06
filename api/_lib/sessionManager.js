/**
 * Session Manager - Sistema de sessões JWT seguro
 * 
 * Gera tokens JWT assinados pelo servidor que a extensão deve enviar
 * em TODA requisição. Sem esse token, nada funciona.
 * 
 * O segredo JWT é armazenado no env (JWT_SECRET). Se ele for rotacionado,
 * TODAS as sessões existentes são invalidadas automaticamente.
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Segredo JWT - DEVE ser configurado como variável de ambiente no Vercel
// Se não existir, gera um aleatório (invalidará ao reiniciar - bom para emergências)
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');

// Versão do protocolo de sessão - incrementar invalida TODAS as sessões
// ESTA É A ARMA NUCLEAR: mude para 2, 3, etc. para derrubar todo mundo
const SESSION_PROTOCOL_VERSION = 1;

// Tempo de vida do token (24 horas)
const TOKEN_TTL = '24h';

// Tempo de vida do refresh (7 dias)
const REFRESH_TTL = '7d';

/**
 * Gera um token JWT de sessão para a extensão
 * @param {Object} payload - Dados do usuário/licença
 * @param {string} payload.licenseKey - Chave da licença
 * @param {string} payload.deviceFingerprint - Fingerprint do dispositivo
 * @param {string} [payload.userName] - Nome do usuário
 * @returns {Object} { sessionToken, refreshToken, expiresAt }
 */
function createSession(payload) {
  const now = Math.floor(Date.now() / 1000);
  
  const sessionPayload = {
    lk: payload.licenseKey,
    df: payload.deviceFingerprint,
    un: payload.userName || '',
    pv: SESSION_PROTOCOL_VERSION,
    // Identificador único da sessão (para revogação individual)
    sid: crypto.randomBytes(16).toString('hex'),
    type: 'session'
  };

  const refreshPayload = {
    lk: payload.licenseKey,
    df: payload.deviceFingerprint,
    pv: SESSION_PROTOCOL_VERSION,
    sid: sessionPayload.sid,
    type: 'refresh'
  };

  const sessionToken = jwt.sign(sessionPayload, JWT_SECRET, { expiresIn: TOKEN_TTL });
  const refreshToken = jwt.sign(refreshPayload, JWT_SECRET, { expiresIn: REFRESH_TTL });

  // Calcula expiração absoluta
  const decoded = jwt.decode(sessionToken);
  
  return {
    sessionToken,
    refreshToken,
    expiresAt: decoded.exp * 1000, // em milliseconds
    sessionId: sessionPayload.sid
  };
}

/**
 * Verifica e decodifica um token JWT de sessão
 * @param {string} token - Token JWT
 * @returns {Object|null} Payload decodificado ou null se inválido
 */
function verifySession(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Verifica versão do protocolo
    if (decoded.pv !== SESSION_PROTOCOL_VERSION) {
      return null; // Versão antiga = sessão invalidada
    }
    
    // Verifica tipo
    if (decoded.type !== 'session') {
      return null;
    }

    return {
      licenseKey: decoded.lk,
      deviceFingerprint: decoded.df,
      userName: decoded.un,
      sessionId: decoded.sid,
      protocolVersion: decoded.pv,
      issuedAt: decoded.iat,
      expiresAt: decoded.exp
    };
  } catch (err) {
    return null; // Token expirado, inválido ou assinatura incorreta
  }
}

/**
 * Verifica e decodifica um refresh token
 * @param {string} token - Refresh token JWT
 * @returns {Object|null} Payload decodificado ou null se inválido
 */
function verifyRefreshToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    if (decoded.pv !== SESSION_PROTOCOL_VERSION) {
      return null;
    }
    
    if (decoded.type !== 'refresh') {
      return null;
    }

    return {
      licenseKey: decoded.lk,
      deviceFingerprint: decoded.df,
      sessionId: decoded.sid,
      protocolVersion: decoded.pv,
      issuedAt: decoded.iat,
      expiresAt: decoded.exp
    };
  } catch (err) {
    return null;
  }
}

/**
 * Extrai o token de sessão do header Authorization
 * @param {Object} req - Request object
 * @returns {string|null} Token ou null
 */
function extractSessionToken(req) {
  const authHeader = (req.headers.authorization || req.headers.Authorization || '').trim();
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return null;
}

/**
 * Middleware: verifica sessão válida antes de processar a requisição
 * Adiciona req.session com os dados da sessão
 * @param {Object} req - Request object
 * @returns {Object} { ok: boolean, session?: Object, status?: number, message?: string }
 */
function requireSession(req) {
  const token = extractSessionToken(req);
  if (!token) {
    return { ok: false, status: 401, message: 'Token de sessão ausente. Faça login novamente.' };
  }
  
  const session = verifySession(token);
  if (!session) {
    return { ok: false, status: 401, message: 'Sessão expirada ou inválida. Faça login novamente.' };
  }
  
  return { ok: true, session };
}

module.exports = {
  createSession,
  verifySession,
  verifyRefreshToken,
  extractSessionToken,
  requireSession,
  SESSION_PROTOCOL_VERSION,
  JWT_SECRET
};
