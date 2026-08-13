const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

const PYTHON_URL = process.env.PYTHON_SERVICE_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

// Audio analysis runs several ML models back-to-back; text diagnosis calls out to
// Gemini. Both can legitimately take a while, but neither should hang forever.
const PREDICT_TIMEOUT_MS = 60_000;
const DIAGNOSE_TIMEOUT_MS = 30_000;

function internalHeaders(extra = {}) {
  return INTERNAL_API_KEY ? { ...extra, 'x-internal-api-key': INTERNAL_API_KEY } : extra;
}

async function callPredict(filePath, originalName) {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath), originalName);

  const response = await axios.post(`${PYTHON_URL}/predict`, form, {
    headers: internalHeaders(form.getHeaders()),
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    timeout: PREDICT_TIMEOUT_MS,
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