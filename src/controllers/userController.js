const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { revokeOtherSessions } = require('../utils/sessionStore');

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function updateProfile(req, res) {
  const { name, email } = req.body || {};

  if (!name || !isValidEmail(email)) {
    return res.status(400).json({ error: 'A name and a valid email are required' });
  }

  const existing = db
    .prepare('SELECT id FROM users WHERE email = ? AND id != ?')
    .get(email.toLowerCase(), req.user.id);
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  db.prepare('UPDATE users SET name = ?, email = ? WHERE id = ?').run(
    name.trim(),
    email.toLowerCase(),
    req.user.id
  );

  const user = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(req.user.id);
  return res.status(200).json({ user });
}

async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body || {};

  if (!currentPassword || !newPassword || newPassword.length < 6) {
    return res.status(400).json({
      error: 'The current password and a new password of at least 6 characters are required',
    });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const matches = await bcrypt.compare(currentPassword, user.password_hash);
  if (!matches) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, req.user.id);

  // Changing your password is a signal that other sessions might not be trusted
  // anymore (e.g. you suspect a leaked token) -- log them out, but keep the
  // session making this very request alive so the user isn't kicked out of
  // Settings right after successfully changing it.
  revokeOtherSessions(req.user.id, req.sessionJti);

  return res.status(200).json({ message: 'Password updated successfully' });
}

function deleteAccount(req, res) {
  db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
  return res.status(204).send();
}

function getSettings(req, res) {
  const row = db
    .prepare('SELECT email_notifications, maintenance_reminders FROM users WHERE id = ?')
    .get(req.user.id);

  return res.status(200).json({
    emailNotifications: !!row.email_notifications,
    maintenanceReminders: !!row.maintenance_reminders,
  });
}

function updateSettings(req, res) {
  const { emailNotifications, maintenanceReminders } = req.body || {};

  const current = db
    .prepare('SELECT email_notifications, maintenance_reminders FROM users WHERE id = ?')
    .get(req.user.id);

  const nextEmailNotifications =
    typeof emailNotifications === 'boolean' ? emailNotifications : !!current.email_notifications;
  const nextMaintenanceReminders =
    typeof maintenanceReminders === 'boolean' ? maintenanceReminders : !!current.maintenance_reminders;

  db.prepare('UPDATE users SET email_notifications = ?, maintenance_reminders = ? WHERE id = ?').run(
    nextEmailNotifications ? 1 : 0,
    nextMaintenanceReminders ? 1 : 0,
    req.user.id
  );

  return res.status(200).json({
    emailNotifications: nextEmailNotifications,
    maintenanceReminders: nextMaintenanceReminders,
  });
}

module.exports = { updateProfile, changePassword, deleteAccount, getSettings, updateSettings };
