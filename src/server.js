require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const audioRoutes = require('./routes/audioRoutes');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const historyRoutes = require('./routes/historyRoutes');
const diagnoseRoutes = require('./routes/diagnoseRoutes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 5000;

// Off (Express's default) unless TRUST_PROXY is set. Only set this when actually
// deployed behind a known, trusted reverse proxy (nginx, Render, Railway, ...) -- with
// it off, req.ip is always the direct TCP peer, so every rate limiter below keys
// correctly per real client. Deployed behind a proxy WITHOUT setting this, req.ip is
// the proxy's own address for every request, collapsing authLimiter/analyzeLimiter/
// diagnoseLimiter into one shared bucket for the entire user base -- a single client
// can then exhaust everyone else's quota. Conversely, setting it to a hop count
// without an actual trusted proxy in front lets a client spoof X-Forwarded-For to fake
// a different IP per request and bypass rate limiting entirely -- so this must match
// the real deployment topology, never be turned on "just in case".
if (process.env.TRUST_PROXY) {
  const hops = Number(process.env.TRUST_PROXY);
  app.set('trust proxy', Number.isNaN(hops) ? process.env.TRUST_PROXY : hops);
}

app.use(helmet());

// In production the browser must be served from exactly FRONTEND_URL. In dev,
// Vite hands you several equivalent URLs for the same server (http://localhost:5173
// AND http://127.0.0.1:5173, plus a LAN IP) and it's easy to open the "wrong" one --
// a strict single-origin allowlist then makes every request fail the CORS check, and
// the frontend surfaces that as a misleading "Could not reach the GarageAI server".
// So outside production, accept any loopback origin regardless of port.
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const isLoopbackOrigin = (origin) => {
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch {
    return false;
  }
};
app.use(
  cors({
    origin(origin, callback) {
      // Non-browser clients (curl, the Node gateway's own calls, health checks)
      // send no Origin header -- always allow those.
      if (!origin) return callback(null, true);
      if (origin === FRONTEND_URL) return callback(null, true);
      if (process.env.NODE_ENV !== 'production' && isLoopbackOrigin(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
  })
);
app.use(express.json());

// A client that disconnects mid-upload (tab closed, network drop, cancelled
// recording) aborts the underlying request stream; without a listener here that
// surfaces as an unhandled 'error' event on the IncomingMessage and crashes the
// whole process for every other in-flight user, not just this one request. This
// must be registered before multer (audioRoutes' upload.single('file')) runs.
app.use((req, res, next) => {
  req.on('error', (err) => {
    console.error(`Request stream error on ${req.method} ${req.originalUrl} (client likely disconnected):`, err.message);
  });
  next();
});

// Baseline defense-in-depth: any route not given its own (stricter) limiter
// still gets a sane ceiling instead of being unprotected by default.
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test',
  })
);

// Swagger UI
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Routes
app.use('/api/v1/audio', audioRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/history', historyRoutes);
app.use('/api/v1/diagnose', diagnoseRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'GarageAI API Gateway - see /docs for documentation' });
});

app.use(notFoundHandler);
app.use(errorHandler);

// Last-resort safety net: log and keep serving other users instead of crashing the
// whole gateway on one request's edge case (e.g. an aborted upload stream error that
// slips past the per-request listener above). Real bugs are still visible in these
// logs; this only prevents one bad request from taking the entire server down.
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception (server stays up):', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection (server stays up):', reason);
});

/* istanbul ignore next -- exercised via integration, not unit, tests */
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`GarageAI Backend running on http://localhost:${PORT}`);
    console.log(`Swagger available at http://localhost:${PORT}/docs`);
  });
}

module.exports = app;