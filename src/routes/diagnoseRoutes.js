const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { optionalAuth, requireAuth } = require('../middleware/auth');
const {
  diagnoseText,
  listConversations,
  getConversation,
  deleteConversation,
} = require('../controllers/diagnoseController');

// Protects the underlying Gemini free-tier quota from being exhausted by one client.
const diagnoseLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { error: 'Too many messages, please slow down and try again in a bit' },
});

/**
 * @swagger
 * /api/v1/diagnose/text:
 *   post:
 *     summary: Diagnose a car fault from a chat-style conversation (Arabic dialect supported, multi-turn)
 *     tags: [Diagnose]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [messages]
 *             properties:
 *               messages:
 *                 type: array
 *                 description: Full conversation so far; the last message must be from the user.
 *                 items:
 *                   type: object
 *                   required: [role, content]
 *                   properties:
 *                     role: { type: string, enum: [user, assistant] }
 *                     content: { type: string }
 *               conversationId:
 *                 type: integer
 *                 description: Pass back the conversationId from a previous reply to keep saving to the same conversation (logged-in users only).
 *               audioResult:
 *                 type: object
 *                 description: The audio ensemble's own classification, when the chat was opened from an analysis result -- lets the diagnosis ground on it directly instead of re-deriving the category from a semantic search over prose that merely describes the result.
 *                 properties:
 *                   predicted_class: { type: string, enum: [belt, brake, sway] }
 *                   confidence: { type: number }
 *               formResult:
 *                 type: object
 *                 description: The client-side severity checklist's own result, when the chat was opened from it -- lets the diagnosis build on an already-computed, rule-based severity instead of re-deriving it via the LLM.
 *                 properties:
 *                   predicted_class: { type: string, enum: [belt, brake, sway] }
 *                   percent: { type: integer, minimum: 0, maximum: 100 }
 *                   level: { type: string, enum: [low, medium, high] }
 *                   positive_findings:
 *                     type: array
 *                     items: { type: string }
 *     responses:
 *       200:
 *         description: Diagnosis / conversational reply grounded in the fault knowledge base
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 predicted_class: { type: string, nullable: true }
 *                 category_label: { type: string, nullable: true }
 *                 match_score: { type: number }
 *                 matched_phrases:
 *                   type: array
 *                   items: { type: string }
 *                 answer: { type: string }
 *                 severity: { type: string, nullable: true, enum: [low, medium, high] }
 *                 severity_reason: { type: string, nullable: true }
 *                 conversationId: { type: integer, nullable: true }
 *       400:
 *         description: Invalid or missing messages
 *       502:
 *         description: Failed to connect to the analysis service
 */
router.post('/text', diagnoseLimiter, optionalAuth, diagnoseText);

/**
 * @swagger
 * /api/v1/diagnose/conversations:
 *   get:
 *     summary: List the current user's saved chat conversations
 *     tags: [Diagnose]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of past conversations }
 */
router.get('/conversations', requireAuth, listConversations);

/**
 * @swagger
 * /api/v1/diagnose/conversations/{id}:
 *   get:
 *     summary: Get a single saved conversation (full message history)
 *     tags: [Diagnose]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: The conversation }
 *       404: { description: Not found }
 *   delete:
 *     summary: Delete a saved conversation
 *     tags: [Diagnose]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       204: { description: Deleted }
 *       404: { description: Not found }
 */
router.get('/conversations/:id', requireAuth, getConversation);
router.delete('/conversations/:id', requireAuth, deleteConversation);

module.exports = router;
