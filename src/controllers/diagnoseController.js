const { callDiagnoseText } = require('../services/pythonService');
const db = require('../config/db');

const AUDIO_RESULT_LABELS = new Set(['belt', 'brake', 'sway']);

function isValidMessage(m) {
  return (
    m &&
    typeof m === 'object' &&
    (m.role === 'user' || m.role === 'assistant') &&
    typeof m.content === 'string' &&
    m.content.trim().length > 0
  );
}

// The audio ensemble's own classification, when the chat was opened from an analysis
// result -- lets the diagnosis service ground on it directly instead of re-deriving the
// category from a semantic search over prose that merely describes the result.
function isValidAudioResult(a) {
  return (
    a &&
    typeof a === 'object' &&
    AUDIO_RESULT_LABELS.has(a.predicted_class) &&
    typeof a.confidence === 'number' &&
    Number.isFinite(a.confidence)
  );
}

const SEVERITY_LEVELS = new Set(['low', 'medium', 'high']);

// The client-side severity checklist's own result (severityForm.ts), when the chat was
// opened from it -- lets the diagnosis service build on an already-computed, rule-based
// severity instead of re-deriving (and risking contradicting) it via the LLM.
function isValidFormResult(f) {
  return (
    f &&
    typeof f === 'object' &&
    AUDIO_RESULT_LABELS.has(f.predicted_class) &&
    Number.isInteger(f.percent) &&
    f.percent >= 0 &&
    f.percent <= 100 &&
    SEVERITY_LEVELS.has(f.level) &&
    Array.isArray(f.positive_findings) &&
    f.positive_findings.every((x) => typeof x === 'string')
  );
}

function firstUserMessagePreview(messages) {
  const first = messages.find((m) => m.role === 'user');
  const text = first ? first.content.trim() : '';
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

function toConversationSummary(row) {
  const messages = JSON.parse(row.messages);
  return {
    id: row.id,
    preview: firstUserMessagePreview(messages),
    predicted_class: row.predicted_class,
    category_label: row.category_label,
    match_score: row.match_score,
    severity: row.severity,
    severity_reason: row.severity_reason,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toConversationDetail(row) {
  return {
    ...toConversationSummary(row),
    messages: JSON.parse(row.messages),
  };
}

async function diagnoseText(req, res) {
  const { messages, conversationId, audioResult, formResult } = req.body || {};

  if (!Array.isArray(messages) || messages.length === 0 || !messages.every(isValidMessage)) {
    return res.status(400).json({
      error: 'messages is required and must be a non-empty array of { role: "user"|"assistant", content: string }',
    });
  }

  if (messages[messages.length - 1].role !== 'user') {
    return res.status(400).json({ error: 'The last message must be from the user' });
  }

  if (conversationId !== undefined && conversationId !== null && !Number.isInteger(conversationId)) {
    return res.status(400).json({ error: 'conversationId must be an integer when provided' });
  }

  if (audioResult !== undefined && audioResult !== null && !isValidAudioResult(audioResult)) {
    return res.status(400).json({
      error: 'audioResult must be { predicted_class: "belt"|"brake"|"sway", confidence: number }',
    });
  }

  if (formResult !== undefined && formResult !== null && !isValidFormResult(formResult)) {
    return res.status(400).json({
      error:
        'formResult must be { predicted_class: "belt"|"brake"|"sway", percent: 0-100, level: "low"|"medium"|"high", positive_findings: string[] }',
    });
  }

  try {
    const result = await callDiagnoseText(messages, audioResult, formResult);
    let savedConversationId = null;

    if (req.user) {
      const fullMessages = JSON.stringify([...messages, { role: 'assistant', content: result.answer }]);

      if (conversationId) {
        const info = db
          .prepare(
            `UPDATE diagnose_conversations
             SET messages = ?, predicted_class = ?, category_label = ?, match_score = ?, severity = ?, severity_reason = ?, updated_at = datetime('now')
             WHERE id = ? AND user_id = ?`
          )
          .run(
            fullMessages,
            result.predicted_class,
            result.category_label,
            result.match_score,
            result.severity,
            result.severity_reason,
            conversationId,
            req.user.id
          );

        if (info.changes > 0) {
          savedConversationId = conversationId;
        }
      }

      if (!savedConversationId) {
        const info = db
          .prepare(
            `INSERT INTO diagnose_conversations (user_id, messages, predicted_class, category_label, match_score, severity, severity_reason)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            req.user.id,
            fullMessages,
            result.predicted_class,
            result.category_label,
            result.match_score,
            result.severity,
            result.severity_reason
          );
        savedConversationId = info.lastInsertRowid;
      }
    }

    return res.status(200).json({ ...result, conversationId: savedConversationId });
  } catch (error) {
    console.error('Error while calling the diagnosis service:', error.message);
    if (error.code === 'ECONNABORTED') {
      return res.status(504).json({ error: 'The diagnosis service took too long to respond' });
    }
    return res.status(502).json({ error: 'Failed to connect to the analysis service (GarageAI Audio Analysis)' });
  }
}

function listConversations(req, res) {
  const rows = db
    .prepare('SELECT * FROM diagnose_conversations WHERE user_id = ? ORDER BY updated_at DESC')
    .all(req.user.id);

  return res.status(200).json({ conversations: rows.map(toConversationSummary) });
}

function getConversation(req, res) {
  const row = db
    .prepare('SELECT * FROM diagnose_conversations WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);

  if (!row) {
    return res.status(404).json({ error: 'Conversation not found' });
  }

  return res.status(200).json({ conversation: toConversationDetail(row) });
}

function deleteConversation(req, res) {
  const info = db
    .prepare('DELETE FROM diagnose_conversations WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user.id);

  if (info.changes === 0) {
    return res.status(404).json({ error: 'Conversation not found' });
  }

  return res.status(204).send();
}

module.exports = { diagnoseText, listConversations, getConversation, deleteConversation };
