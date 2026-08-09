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