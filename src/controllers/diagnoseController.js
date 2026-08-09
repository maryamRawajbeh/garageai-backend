const { callDiagnoseText } = require('../services/pythonService');
const db = require('../config/db');

function isValidMessage(m) {
  return (
    m &&
    typeof m === 'object' &&
    (m.role === 'user' || m.role === 'assistant') &&
    typeof m.content === 'string' &&
    m.content.trim().length > 0
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
  const { messages, conversationId } = req.body || {};

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

  try {
    const result = await callDiagnoseText(messages);
    let savedConversationId = null;

    if (req.user) {
      const fullMessages = JSON.stringify([...messages, { role: 'assistant', content: result.answer }]);

      if (conversationId) {
        const info = db
          .prepare(
            `UPDATE diagnose_conversations
             SET messages = ?, predicted_class = ?, category_label = ?, match_score = ?, updated_at = datetime('now')
             WHERE id = ? AND user_id = ?`
          )
          .run(fullMessages, result.predicted_class, result.category_label, result.match_score, conversationId, req.user.id);

        if (info.changes > 0) {
          savedConversationId = conversationId;
        }
      }

      if (!savedConversationId) {
        const info = db
          .prepare(
            `INSERT INTO diagnose_conversations (user_id, messages, predicted_class, category_label, match_score)
             VALUES (?, ?, ?, ?, ?)`
          )
          .run(req.user.id, fullMessages, result.predicted_class, result.category_label, result.match_score);
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
