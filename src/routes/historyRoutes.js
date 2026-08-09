const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { list, getOne, remove } = require('../controllers/historyController');

router.use(requireAuth);

/**
 * @swagger
 * /api/v1/history:
 *   get:
 *     summary: List the current user's past analyses
 *     tags: [History]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of past analyses }
 */
router.get('/', list);

/**
 * @swagger
 * /api/v1/history/{id}:
 *   get:
 *     summary: Get a single past analysis
 *     tags: [History]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: The analysis }
 *       404: { description: Not found }
 *   delete:
 *     summary: Delete a past analysis
 *     tags: [History]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       204: { description: Deleted }
 *       404: { description: Not found }
 */
router.get('/:id', getOne);
router.delete('/:id', remove);

module.exports = router;
