// ============================================================
// validation.middleware.js
// NexaSense AI Assistant
// Zod schema validation middleware
// ============================================================

const logger = require("../utils/logger");

/**
 * Validates request data against a Zod schema
 * @param {import("zod").ZodSchema} schema 
 * @param {'body' | 'query' | 'params'} source 
 */
function validateRequest(schema, source = "body") {
  return (req, res, next) => {
    try {
      const parsed = schema.parse(req[source]);
      // Replace request data with parsed/sanitized data
      req[source] = parsed;
      next();
    } catch (error) {
      logger.warn(`[Validation] Request Validation failed: ${error.message}`);
      res.status(400).json({
        success: false,
        error: "Validation Error",
        details: error.errors
      });
    }
  };
}

module.exports = validateRequest;
