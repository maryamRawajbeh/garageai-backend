const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

const PYTHON_URL = process.env.PYTHON_SERVICE_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

// Audio analysis runs several ML models back-to-back; text diagnosis calls out to
// Gemini. Both can legitimately take a while, but neither should hang forever.
const PREDICT_TIMEOUT_MS = 60_000;
// Must stay >= the Python service's own PREDICT_TIMEOUT_SECONDS_WITH_EXTRA (app/core/
// config.py in garageai-audio-analysis, currently 90s) -- an optional extra_model (AST/
// CLAP) is loaded fresh per-request there and measured ~10-30s beyond the base ensemble,
// well past PREDICT_TIMEOUT_MS. Without this, axios would abort and surface a client-side
// timeout even when the Python service was on track to answer within ITS own budget.
const PREDICT_WITH_EXTRA_TIMEOUT_MS = 100_000;
const DIAGNOSE_TIMEOUT_MS = 30_000;

function internalHeaders(extra = {}) {
  return INTERNAL_API_KEY ? { ...extra, 'x-internal-api-key': INTERNAL_API_KEY } : extra;
}

async function callPredict(filePath, originalName, extraModel) {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath), originalName);
  if (extraModel) {
    form.append('extra_model', extraModel);
  }

  const response = await axios.post(`${PYTHON_URL}/predict`, form, {
    headers: internalHeaders(form.getHeaders()),
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    timeout: extraModel ? PREDICT_WITH_EXTRA_TIMEOUT_MS : PREDICT_TIMEOUT_MS,
  });

  return response.data;
}

async function callDiagnoseText(messages, audioResult, formResult) {
  const response = await axios.post(
    `${PYTHON_URL}/diagnose/text`,
    { messages, audio_result: audioResult ?? undefined, form_result: formResult ?? undefined },
    { headers: internalHeaders(), timeout: DIAGNOSE_TIMEOUT_MS }
  );
  return response.data;
}

module.exports = { callPredict, callDiagnoseText };