// =========================================================
// SmartPark — server entry point
// =========================================================
require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const vehicleRoutes = require('./routes/vehicles');
const slotRoutes = require('./routes/slots');
const dashboardRoutes = require('./routes/dashboard');
const activityRoutes = require('./routes/activity');
const reportRoutes = require('./routes/reports');
const settingsRoutes = require('./routes/settings');
const exportRoutes = require('./routes/export');
const healthRoutes = require('./routes/health');
const adminRoutes = require('./routes/admin');

const app = express();

// Security HTTP headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'font-src': ["'self'", 'https://fonts.gstatic.com'],
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        'img-src': ["'self'", 'data:', 'blob:'],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

app.use(compression());

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: true, limit: '200kb' }));

// ---------------------------------------------------------
// Rate Limiting
// ---------------------------------------------------------
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests from this IP. Please try again later.',
    code: 'RATE_LIMIT_EXCEEDED',
  },
  skip: () => process.env.NODE_ENV === 'test',
});

const writeLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many actions performed in a short time. Please slow down.',
    code: 'WRITE_RATE_LIMIT_EXCEEDED',
  },
  skip: () => process.env.NODE_ENV === 'test',
});

app.use('/api', apiLimiter);

// ---------------------------------------------------------
// API routes
// ---------------------------------------------------------
app.use('/api/vehicles', writeLimiter, vehicleRoutes);
app.use('/api/slots', slotRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/admin', writeLimiter, adminRoutes);

// ---------------------------------------------------------
// Static frontend
// ---------------------------------------------------------
const frontendDir = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendDir));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(frontendDir, 'index.html'));
});

// ---------------------------------------------------------
// 404 + error handling (must be last)
// ---------------------------------------------------------
app.use('/api', notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`SmartPark server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
