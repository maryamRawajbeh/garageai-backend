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
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000' }));
app.use(express.json());

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

/* istanbul ignore next -- exercised via integration, not unit, tests */
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`GarageAI Backend running on http://localhost:${PORT}`);
    console.log(`Swagger available at http://localhost:${PORT}/docs`);
  });
}

module.exports = app;