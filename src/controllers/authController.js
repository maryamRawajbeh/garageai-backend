const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { signToken } = require('../utils/jwt');
const { sendPasswordResetEmail } = require('../services/mailer');

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function toPublicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
  };
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function signup(req, res) {
  const { name, email, password } = req.body || {};

  if (!name || !isValidEmail(email) || !password || password.length < 6) {
    return res.status(400).json({
      error: 'A name, a valid email, and a password of at least 6 characters are required',
    });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const info = db
    .prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
    .run(name.trim(), email.toLowerCase(), passwordHash);

  const user = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(info.lastInsertRowid);
  const token = signToken({ sub: user.id });

  return res.status(201).json({ token, user: toPublicUser(user) });
}

async function login(req, res) {
  const { email, password } = req.body || {};

  if (!isValidEmail(email) || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const matches = await bcrypt.compare(password, user.password_hash);
  if (!matches) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = signToken({ sub: user.id });
  return res.status(200).json({ token, user: toPublicUser(user) });
}

function me(req, res) {
  return res.status(200).json({ user: toPublicUser(req.user) });
}

async function forgotPassword(req, res) {
  const { email } = req.body || {};
  const genericResponse = {
    message: 'If an account with that email exists, a password reset link has been sent.',
  };

  if (!isValidEmail(email)) {
    return res.status(200).json(genericResponse);
  }

  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user) {
    return res.status(200).json(genericResponse);
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();

  db.prepare('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)').run(
    user.id,
    tokenHash,
    expiresAt
  );

  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${rawToken}`;

  try {
    await sendPasswordResetEmail(email, resetUrl);
  } catch (err) {
    // Don't leak delivery failures to the client -- the response must stay generic
    // either way to avoid revealing whether the email exists.
    console.error('Failed to send password reset email:', err.message);
  }

  return res.status(200).json(genericResponse);
}

function resetPassword(req, res) {
  const { token, newPassword } = req.body || {};

  if (!token || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'A token and a new password of at least 6 characters are required' });
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const resetRow = db
    .prepare(
      `SELECT * FROM password_resets
       WHERE token_hash = ? AND used = 0 AND expires_at > datetime('now')
       ORDER BY id DESC LIMIT 1`
    )
    .get(tokenHash);

  if (!resetRow) {
    return res.status(400).json({ error: 'This reset link is invalid or has expired' });
  }

  bcrypt.hash(newPassword, 10).then((passwordHash) => {
    const tx = db.transaction(() => {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, resetRow.user_id);
      db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(resetRow.id);
    });
    tx();
    res.status(200).json({ message: 'Password has been reset successfully' });
  });
}

module.exports = { signup, login, me, forgotPassword, resetPassword };
