const crypto = require('crypto');
const db = require('../config/db');

// Matches the default JWT_EXPIRES_IN ('7d') so a session row doesn't outlive (or
// expire well before) the token it backs. If JWT_EXPIRES_IN is overridden in .env,
// update this alongside it.
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Creates a session row for a freshly issued token and returns its jti. */
function createSession(userId) {
  const jti = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  db.prepare('INSERT INTO sessions (jti, user_id, expires_at) VALUES (?, ?, ?)').run(jti, userId, expiresAt);
  return jti;
}

/** True if this jti was issued, hasn't been revoked, and hasn't expired. */
function isSessionActive(jti) {
  if (!jti) return false;
  const row = db
    .prepare("SELECT 1 FROM sessions WHERE jti = ? AND revoked = 0 AND expires_at > datetime('now')")
    .get(jti);
  return !!row;
}

function revokeSession(jti) {
  db.prepare('UPDATE sessions SET revoked = 1 WHERE jti = ?').run(jti);
}

/** Revokes every session for a user except (optionally) the current one -- used on password change. */
function revokeOtherSessions(userId, keepJti) {
  db.prepare('UPDATE sessions SET revoked = 1 WHERE user_id = ? AND jti != ?').run(userId, keepJti || '');
}

module.exports = { createSession, isSessionActive, revokeSession, revokeOtherSessions };
