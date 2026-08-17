// =========================================================
// SmartPark — Application error type
// Thrown intentionally from controllers/services for expected
// failure cases (validation, business-rule violations, 404s).
// Caught by middleware/errorHandler.js and turned into the
// { success:false, message, code } response shape.
// =========================================================
class AppError extends Error {
  constructor(message, { status = 400, code = 'BAD_REQUEST', details } = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

module.exports = AppError;
