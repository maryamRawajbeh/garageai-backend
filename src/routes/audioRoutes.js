const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const upload = require('../middleware/upload');
const { optionalAuth } = require('../middleware/auth');
const { analyzeAudio } = require('../controllers/audioController');

// Analysis is CPU-heavy (multiple ML models on the Python side) and open to
// unauthenticated callers, so it needs its own tighter ceiling.
const analyzeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { error: 'Too many analysis requests, please try again later' },
});

/**
 * @swagger
 * /api/v1/audio/analyze:
 *   post:
 *     summary: Analyze a car sound and classify the fault
 *     tags: [Audio]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               extra_model:
 *                 type: string
 *                 enum: [ast, clap]
 *                 description: Optional -- request an extra comparison model's prediction (loaded on-demand by the Python service, adds ~10-30s). Omit for the normal fast response.
 *     responses:
 *       200:
 *         description: Analysis result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 filename:
 *                   type: string
 *                 final_prediction:
 *                   type: string
 *                 final_confidence:
 *                   type: number
 *                 individual_models:
 *                   type: array
 *                   items:
 *                     type: object
 *       400:
 *         description: No file uploaded or unsupported file format
 *       502:
 *         description: Failed to connect to the analysis service
 */
router.post('/analyze', analyzeLimiter, optionalAuth, upload.single('file'), analyzeAudio);

module.exports = router;