const db = require('../../src/config/db');

function resetDb() {
  db.exec('DELETE FROM analyses; DELETE FROM password_resets; DELETE FROM users;');
}

module.exports = { resetDb };
