/**
 * Persona Intelligence routes — /v1/personas
 *
 * GET /v1/personas
 *   Returns all persona cards for the authenticated workspace.
 *   Each card includes role, goals, pain points, buying triggers,
 *   common objections, content gaps, and source citations.
 *
 * GET /v1/personas/:id
 *   Returns a single persona card by insight row ID.
 *   Returns 404 if not found in the caller's workspace.
 *
 * POST /v1/personas/generate
 *   Triggers on-demand persona generation for the caller's workspace.
 *   Requires 'member' role or above — generation is a write operation
 *   that updates the insights table with new persona_card rows.
 *
 * All routes require a valid BOBA JWT. Workspace isolation is enforced
 * by PersonaService using the JWT workspace_id.
 */

import { Router, type Request, type Response } from 'express';
import type { AuthService } from '../services/auth.service.js';
import type { PersonaService } from '../services/persona.service.js';
import { createJwtMiddleware } from '../middleware/jwt.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';

export function createPersonaRouter(
  authService: AuthService,
  personaService: PersonaService,
): Router {
  const router = Router();
  const jwtGuard = createJwtMiddleware(authService);

  // -------------------------------------------------------------------------
  // GET /v1/personas
  // Returns all persona cards for the workspace.
  //
  // Response: PersonaInsightResult[]
  // -------------------------------------------------------------------------
  router.get(
    '/',
    jwtGuard,
    requireRole('viewer'),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const personas = await personaService.getPersonas(req.user!.workspace_id);
        res.json(personas);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load personas';
        res.status(500).json({ error: message });
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /v1/personas/:id
  // Returns a single persona card by insight ID.
  //
  // Response: PersonaInsightResult
  //   or 404 if the persona card does not exist in this workspace.
  // -------------------------------------------------------------------------
  router.get(
    '/:id',
    jwtGuard,
    requireRole('viewer'),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const persona = await personaService.getPersona(req.user!.workspace_id, req.params['id']!);
        if (!persona) {
          res.status(404).json({ error: 'Persona not found. Run POST /v1/personas/generate first.' });
          return;
        }
        res.json(persona);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load persona';
        res.status(500).json({ error: message });
      }
    },
  );

  // -------------------------------------------------------------------------
  // POST /v1/personas/generate
  // Triggers on-demand persona card generation for the workspace.
  //
  // Requires 'member' role or above — generation is a write operation.
  //
  // Response: { message: 'Persona generation complete' }
  // -------------------------------------------------------------------------
  router.post(
    '/generate',
    jwtGuard,
    requireRole('member'),
    async (req: Request, res: Response): Promise<void> => {
      try {
        await personaService.generatePersonas(req.user!.workspace_id);
        res.json({ message: 'Persona generation complete' });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to generate personas';
        res.status(500).json({ error: message });
      }
    },
  );

  return router;
}
