const { verifyToken } = require('../utils/jwt');
const { isSessionActive } = require('../utils/sessionStore');
const db = require('../config/db');

function resolveRequest(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;

  const token = header.slice('Bearer '.length);
  try {
    const payload = verifyToken(token);
    // A syntactically valid, unexpired JWT can still have been logged out (or its
    // password changed) since it was issued -- the session row is the source of
    // truth for "is this token actually still usable right now".
    if (!isSessionActive(payload.jti)) return null;
    const user = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(payload.sub);
    if (!user) return null;
    return { user, jti: payload.jti };
  } catch {
    return null;
  }
}

/** Requires a valid Bearer token; 401s otherwise. */
function requireAuth(req, res, next) {
  const resolved = resolveRequest(req);
  if (!resolved) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  req.user = resolved.user;
  req.sessionJti = resolved.jti;
  next();
}

/** Attaches req.user when a valid token is present, but never blocks the request. */
function optionalAuth(req, res, next) {
  const resolved = resolveRequest(req);
  req.user = resolved ? resolved.user : null;
  req.sessionJti = resolved ? resolved.jti : null;
  next();
}

module.exports = { requireAuth, optionalAuth };
