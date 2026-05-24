/**
 * Input validation middleware.
 *
 * Provides createBodyValidator() — a factory that accepts a lightweight
 * JSON schema definition and returns an Express middleware that:
 *
 *   1. Verifies required fields are present and non-empty.
 *   2. Validates per-field types (string, number, boolean, array, object).
 *   3. Enforces string length and enum constraints.
 *   4. Returns 400 with an { error, details } payload on failure.
 *   5. Never leaks internal stack traces or implementation details in errors.
 *
 * The schema format is intentionally minimal — tuned for BOBA's API surface.
 * For a more complex validation layer, drop in ajv or zod behind this interface.
 *
 * SQL injection prevention:
 *   All database queries in BOBA use parameterized queries (pg.Pool.query with
 *   $N placeholders).  This middleware is an additional defence — it rejects
 *   malformed inputs before they reach service or repository layers.
 */

import type { Request, Response, NextFunction } from 'express';

// ---------------------------------------------------------------------------
// Schema types
// ---------------------------------------------------------------------------

type FieldType = 'string' | 'number' | 'boolean' | 'array' | 'object';

export interface FieldSchema {
  type: FieldType;
  /** Minimum string length (for type: 'string'). */
  minLength?: number;
  /** Maximum string length (for type: 'string'). */
  maxLength?: number;
  /** Minimum array item count (for type: 'array'). */
  minItems?: number;
  /** Allowed values — validation fails if the value is not in this set. */
  enum?: readonly string[];
}

export interface BodySchema {
  /** Fields that must be present and non-empty in the request body. */
  required?: readonly string[];
  /** Per-field validation rules (applied to both required and optional fields). */
  properties?: Record<string, FieldSchema>;
}

// ---------------------------------------------------------------------------
// Pre-built schemas for BOBA routes
// ---------------------------------------------------------------------------

/** Schema for POST /v1/ask */
export const ASK_BODY_SCHEMA: BodySchema = {
  required: ['query'],
  properties: {
    query: { type: 'string', minLength: 1, maxLength: 2000 },
    conversation_id: { type: 'string', maxLength: 36 },
  },
};

/** Schema for POST /v1/content/generate */
export const CONTENT_GENERATE_SCHEMA: BodySchema = {
  required: ['topic'],
  properties: {
    topic: { type: 'string', minLength: 1, maxLength: 1000 },
    // Accept both 'type' (legacy) and 'content_type' (new) field names.
    // The service layer normalises to ContentGenerationRequest.type.
    type: { type: 'string', minLength: 1, maxLength: 100 },
    content_type: { type: 'string', minLength: 1, maxLength: 100 },
    // Tone and channel are validated by the service — accept any string here.
    tone: { type: 'string', maxLength: 100 },
    length: { type: 'string', maxLength: 50 },
    channel: { type: 'string', maxLength: 100 },
    target_persona: { type: 'string', maxLength: 36 },
    additional_instructions: { type: 'string', maxLength: 500 },
  },
};

/** Schema for POST /v1/auth/callback */
export const AUTH_CALLBACK_SCHEMA: BodySchema = {
  required: ['code', 'state'],
  properties: {
    code: { type: 'string', minLength: 1 },
    state: { type: 'string', minLength: 1 },
  },
};

// ---------------------------------------------------------------------------
// Validator factory
// ---------------------------------------------------------------------------

/**
 * Returns Express middleware that validates the request body against `schema`.
 *
 * Attach between the JWT guard and the route handler:
 * @example
 *   router.post('/', jwtGuard, createBodyValidator(ASK_BODY_SCHEMA), handler);
 */
export function createBodyValidator(schema: BodySchema) {
  return function bodyValidatorMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    const body = req.body as Record<string, unknown>;
    const errors: string[] = [];

    // --- Required field presence check ---
    for (const field of schema.required ?? []) {
      const value = body[field];
      const missing =
        value === undefined ||
        value === null ||
        (typeof value === 'string' && value.trim() === '');
      if (missing) {
        errors.push(`'${field}' is required`);
      }
    }

    // --- Per-field constraint validation ---
    for (const [field, fieldSchema] of Object.entries(schema.properties ?? {})) {
      const value = body[field];

      // Skip unset optional fields.
      if (value === undefined || value === null) continue;

      // Type check.
      const actualType = Array.isArray(value) ? 'array' : typeof value;
      if (actualType !== fieldSchema.type) {
        errors.push(`'${field}' must be of type ${fieldSchema.type}`);
        continue; // Skip further checks — type mismatch makes them nonsensical.
      }

      if (fieldSchema.type === 'string') {
        const str = value as string;

        if (fieldSchema.minLength !== undefined && str.length < fieldSchema.minLength) {
          errors.push(`'${field}' must be at least ${fieldSchema.minLength} character(s)`);
        }
        if (fieldSchema.maxLength !== undefined && str.length > fieldSchema.maxLength) {
          errors.push(`'${field}' must be at most ${fieldSchema.maxLength} character(s)`);
        }
        if (fieldSchema.enum !== undefined && !fieldSchema.enum.includes(str)) {
          errors.push(`'${field}' must be one of: ${fieldSchema.enum.join(', ')}`);
        }
      }

      if (fieldSchema.type === 'array') {
        const arr = value as unknown[];
        if (fieldSchema.minItems !== undefined && arr.length < fieldSchema.minItems) {
          errors.push(`'${field}' must contain at least ${fieldSchema.minItems} item(s)`);
        }
      }

      if (fieldSchema.type === 'number') {
        // minLength/maxLength semantics re-used as min/max value for numbers.
        const num = value as number;
        if (fieldSchema.minLength !== undefined && num < fieldSchema.minLength) {
          errors.push(`'${field}' must be at least ${fieldSchema.minLength}`);
        }
        if (fieldSchema.maxLength !== undefined && num > fieldSchema.maxLength) {
          errors.push(`'${field}' must be at most ${fieldSchema.maxLength}`);
        }
      }
    }

    if (errors.length > 0) {
      res.status(400).json({
        error: 'Validation failed',
        details: errors,
      });
      return;
    }

    next();
  };
}
