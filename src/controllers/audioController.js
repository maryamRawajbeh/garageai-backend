const fs = require('fs');
const { callPredict } = require('../services/pythonService');
const db = require('../config/db');

async function analyzeAudio(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'No file was uploaded' });
  }

  const filePath = req.file.path;
  // Multer's upload.single('file') still parses other multipart text fields into
  // req.body -- extra_model is optional and undefined if the client didn't send it,
  // in which case callPredict falls back to its normal (shorter) timeout.
  const extraModel = req.body.extra_model || undefined;

  try {
    const result = await callPredict(filePath, req.file.originalname, extraModel);

    if (req.user) {
      db.prepare(
        `INSERT INTO analyses (user_id, filename, final_prediction, final_confidence, all_probabilities, individual_models, processing_time_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        req.user.id,
        req.file.originalname,
        result.final_prediction,
        result.final_confidence,
        JSON.stringify(result.all_probabilities || {}),
        JSON.stringify(result.individual_models || []),
        result.processing_time_ms || null
      );
    }

    return res.status(200).json({
      filename: req.file.originalname,
      ...result,
    });
  } catch (error) {
    console.error('Error while calling the analysis service:', error.message);
    if (error.code === 'ECONNABORTED') {
      return res.status(504).json({ error: 'The analysis service took too long to respond' });
    }
    return res.status(502).json({ error: 'Failed to connect to the analysis service (GarageAI Audio Analysis)' });
  } finally {
    // Delete the temp file after processing
    fs.unlink(filePath, (err) => {
      if (err) console.error('Failed to delete temp file:', err);
    });
  }
}

module.exports = { analyzeAudio };