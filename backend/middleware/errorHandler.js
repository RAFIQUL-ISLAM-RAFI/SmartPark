// =========================================================
// SmartPark — centralized error handling
// =========================================================
const AppError = require('../utils/AppError');

function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    message: `Unknown API route: ${req.method} ${req.originalUrl}`,
    code: 'NOT_FOUND',
  });
}

// Postgres error codes we want to translate into friendly messages
// instead of leaking raw driver errors to the client.
const PG_ERROR_MESSAGES = {
  '23505': 'That record already exists or conflicts with an active session.',
  '23503': 'Referenced record does not exist.',
  '23514': 'That value violates a data constraint.',
  '22P02': 'Malformed input value.',
};

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Malformed JSON body (express.json() throws a SyntaxError)
  if (err.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({
      success: false,
      message: 'Malformed JSON in request body.',
      code: 'MALFORMED_JSON',
    });
  }

  if (err instanceof AppError) {
    return res.status(err.status).json({
      success: false,
      message: err.message,
      code: err.code,
      ...(err.details ? { details: err.details } : {}),
    });
  }

  // Postgres driver errors
  if (err.code && PG_ERROR_MESSAGES[err.code]) {
    return res.status(409).json({
      success: false,
      message: PG_ERROR_MESSAGES[err.code],
      code: 'DATABASE_CONSTRAINT',
    });
  }

  if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
    return res.status(503).json({
      success: false,
      message: 'Database connection failed. Please try again shortly.',
      code: 'DATABASE_UNAVAILABLE',
    });
  }

  console.error('[error]', err);
  return res.status(500).json({
    success: false,
    message: 'Internal server error.',
    code: 'INTERNAL_ERROR',
  });
}

module.exports = { errorHandler, notFoundHandler };
