const { verifyToken } = require('../utils/jwt');
const db = require('../config/db');

function getUserFromHeader(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;

  const token = header.slice('Bearer '.length);
  try {
    const payload = verifyToken(token);
    const user = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(payload.sub);
    return user || null;
  } catch {
    return null;
  }
}

/** Requires a valid Bearer token; 401s otherwise. */
function requireAuth(req, res, next) {
  const user = getUserFromHeader(req);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  req.user = user;
  next();
}

/** Attaches req.user when a valid token is present, but never blocks the request. */
function optionalAuth(req, res, next) {
  req.user = getUserFromHeader(req);
  next();
}

module.exports = { requireAuth, optionalAuth };
