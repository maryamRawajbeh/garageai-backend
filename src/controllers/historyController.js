const db = require('../config/db');

function toPublicAnalysis(row) {
  return {
    id: row.id,
    filename: row.filename,
    final_prediction: row.final_prediction,
    final_confidence: row.final_confidence,
    all_probabilities: row.all_probabilities ? JSON.parse(row.all_probabilities) : {},
    individual_models: JSON.parse(row.individual_models),
    processing_time_ms: row.processing_time_ms,
    created_at: row.created_at,
  };
}

function list(req, res) {
  const rows = db
    .prepare('SELECT * FROM analyses WHERE user_id = ? ORDER BY created_at DESC')
    .all(req.user.id);

  return res.status(200).json({ analyses: rows.map(toPublicAnalysis) });
}

function getOne(req, res) {
  const row = db
    .prepare('SELECT * FROM analyses WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);

  if (!row) {
    return res.status(404).json({ error: 'Analysis not found' });
  }

  return res.status(200).json({ analysis: toPublicAnalysis(row) });
}

function remove(req, res) {
  const info = db.prepare('DELETE FROM analyses WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);

  if (info.changes === 0) {
    return res.status(404).json({ error: 'Analysis not found' });
  }

  return res.status(204).send();
}

module.exports = { list, getOne, remove };
