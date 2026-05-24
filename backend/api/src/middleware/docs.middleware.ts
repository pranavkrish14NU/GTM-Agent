/**
 * API documentation middleware.
 *
 * Serves:
 *   GET /api-spec.json  — raw OpenAPI 3.0 spec as JSON (all environments)
 *   GET /docs           — Swagger UI HTML (non-production only)
 *
 * Design decisions:
 *   - Spec is imported as a TypeScript const (openapi.ts) to avoid YAML/JSON
 *     loader issues in the ESM module system.
 *   - Swagger UI is loaded from the official CDN to keep the bundle lean and
 *     avoid vendoring a large static asset.
 *   - /docs is gated on NODE_ENV !== 'production' so the endpoint is never
 *     exposed on the production cluster where GKE security controls would also
 *     block it.  The raw spec is always available for tooling integrations.
 */

import { Router, type Request, type Response } from 'express';
import { openApiSpec } from '../openapi.js';

/** Swagger UI CDN version pinned for reproducibility. */
const SWAGGER_UI_VERSION = '5.17.14';

/**
 * Returns the Swagger UI HTML page that loads the spec from /api-spec.json.
 * Using a relative URL keeps this portable across any host/port.
 */
function swaggerHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>BOBA API Docs</title>
  <link rel="stylesheet"
        href="https://unpkg.com/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui.css" />
</head>
<body>
<div id="swagger-ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui-bundle.js"
        crossorigin></script>
<script>
  window.onload = function () {
    SwaggerUIBundle({
      url: '/api-spec.json',
      dom_id: '#swagger-ui',
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
      layout: 'BaseLayout',
      deepLinking: true,
    });
  };
</script>
</body>
</html>`;
}

/**
 * Creates the docs router.
 *
 * @param isProd - When true, /docs returns 404. /api-spec.json is always available.
 */
export function createDocsRouter(isProd = process.env['NODE_ENV'] === 'production'): Router {
  const router = Router();

  // Raw spec — always available (tooling, CI validation, external consumers).
  router.get('/api-spec.json', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/json');
    res.json(openApiSpec);
  });

  // Swagger UI — non-production only.
  router.get('/docs', (_req: Request, res: Response) => {
    if (isProd) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(swaggerHtml());
  });

  return router;
}
