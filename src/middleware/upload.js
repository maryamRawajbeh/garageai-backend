const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../uploads'));
  },
  filename: (req, file, cb) => {
    const safeBase = path
      .basename(file.originalname)
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(-100);
    const uniqueName = `${Date.now()}-${crypto.randomUUID()}-${safeBase}`;
    cb(null, uniqueName);
  },
});

// The Python analysis service (garageai-audio-analysis) runs every upload through
// ffmpeg before it touches any model, converting whatever format arrives into a
// mono 22.05kHz WAV -- so the only thing this filter needs to gate is "is this
// plausibly an audio file", not a specific container. Browsers are inconsistent
// about the MIME type they report for less common formats (a .flac can show up as
// audio/flac, audio/x-flac, or even application/octet-stream depending on OS), so
// we accept on EITHER a recognized audio mimetype OR a known audio extension.
const ALLOWED_EXTENSIONS = new Set([
  '.wav', '.mp3', '.m4a', '.aac', '.ogg', '.oga', '.opus',
  '.flac', '.webm', '.wma', '.3gp', '.3gpp', '.amr', '.aiff', '.aif',
]);

const fileFilter = (req, file, cb) => {
  const looksLikeAudioMime = file.mimetype.startsWith('audio/');
  const ext = path.extname(file.originalname).toLowerCase();
  const looksLikeAudioExt = ALLOWED_EXTENSIONS.has(ext);

  if (looksLikeAudioMime || looksLikeAudioExt) {
    cb(null, true);
  } else {
    cb(new Error('Unsupported file format'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

module.exports = upload;