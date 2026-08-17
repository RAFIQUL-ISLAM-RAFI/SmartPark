// =========================================================
// SmartPark — server entry point
// =========================================================
require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

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

app.use(
  helmet({
    // The frontend is served from the same origin and loads Google Fonts;
    // relax just enough for that without disabling CSP entirely.
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'font-src': ["'self'", 'https://fonts.gstatic.com'],
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        'img-src': ["'self'", 'data:'],
      },
    },
  })
);
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || '*',
  })
);
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// ---------------------------------------------------------
// API routes
// ---------------------------------------------------------
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/slots', slotRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/admin', adminRoutes);

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
