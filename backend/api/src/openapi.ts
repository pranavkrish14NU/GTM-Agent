/**
 * BOBA API — OpenAPI 3.0 specification.
 *
 * Defined as a TypeScript constant so it can be imported natively in the
 * ESM module system without a YAML/JSON loader.  The spec is served:
 *   GET /api-spec.json   — raw JSON (machine-readable)
 *   GET /docs            — Swagger UI (non-production only)
 *
 * All endpoints under /v1/ require a Bearer JWT unless marked "no auth".
 * CSRF protection applies to /v1/auth/refresh and /v1/auth/logout
 * (X-CSRF-Token header required alongside the cookie).
 */

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'BOBA API',
    version: '0.1.0',
    description:
      'BOBA (Back-Office Business Accelerator) – GTM intelligence platform API. ' +
      'Provides semantic document search, AI-generated insights, content generation, ' +
      'and workspace administration.',
    contact: {
      name: 'BOBA Platform Team',
      email: 'platform@boba.example.com',
    },
  },
  servers: [
    { url: 'http://localhost:8080', description: 'Local development' },
    { url: 'https://api-staging.boba.example.com', description: 'Staging' },
    { url: 'https://api.boba.example.com', description: 'Production' },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'RS256-signed JWT issued by POST /v1/auth/callback or /v1/auth/refresh. ' +
          'Pass as: Authorization: Bearer <token>',
      },
    },
    schemas: {
      // ── Generic ───────────────────────────────────────────────────────────
      Error: {
        type: 'object',
        required: ['error'],
        properties: {
          error: { type: 'string', description: 'Human-readable error message' },
          details: {
            type: 'array',
            items: { type: 'string' },
            description: 'Validation error detail messages (validation errors only)',
          },
        },
      },
      Pagination: {
        type: 'object',
        properties: {
          total: { type: 'integer', description: 'Total matching records' },
          page: { type: 'integer', description: 'Current page number (1-based)' },
          pageSize: { type: 'integer', description: 'Items per page' },
        },
      },
      // ── Auth ──────────────────────────────────────────────────────────────
      AuthTokenResponse: {
        type: 'object',
        required: ['access_token', 'expires_in'],
        properties: {
          access_token: { type: 'string', description: 'BOBA JWT (RS256)' },
          expires_in: { type: 'integer', description: 'Seconds until the access token expires' },
        },
      },
      // ── Documents ─────────────────────────────────────────────────────────
      Document: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          workspace_id: { type: 'string', format: 'uuid' },
          title: { type: 'string' },
          drive_file_id: { type: 'string' },
          mime_type: { type: 'string' },
          content_hash: { type: 'string' },
          freshness_score: { type: 'number', minimum: 0, maximum: 100 },
          last_synced: { type: 'string', format: 'date-time', nullable: true },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      DocumentListResult: {
        type: 'object',
        properties: {
          data: { type: 'array', items: { $ref: '#/components/schemas/Document' } },
          total: { type: 'integer' },
          page: { type: 'integer' },
          pageSize: { type: 'integer' },
        },
      },
      SyncHealth: {
        type: 'object',
        properties: {
          total_files: { type: 'integer' },
          synced_files: { type: 'integer' },
          average_freshness: { type: 'number' },
          error_count: { type: 'integer' },
        },
      },
      // ── Ask / RAG ─────────────────────────────────────────────────────────
      AskCitation: {
        type: 'object',
        properties: {
          sourceFileId: { type: 'string' },
          sourceFileName: { type: 'string' },
          driveUrl: { type: 'string', format: 'uri' },
          section: { type: 'string', nullable: true },
          page: { type: 'integer', nullable: true },
          chunkId: { type: 'string' },
          relevanceScore: { type: 'number', minimum: 0, maximum: 100 },
        },
      },
      AskResponse: {
        type: 'object',
        required: ['query_id', 'conversation_id', 'answer', 'confidence_level'],
        properties: {
          query_id: { type: 'string', format: 'uuid' },
          conversation_id: { type: 'string', format: 'uuid' },
          answer: { type: 'string' },
          evidence_summary: { type: 'string' },
          sources: { type: 'array', items: { $ref: '#/components/schemas/AskCitation' } },
          confidence_level: { type: 'string', enum: ['high', 'medium', 'low'] },
          suggested_next_actions: { type: 'array', items: { type: 'string' } },
        },
      },
      QueryHistoryItem: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          query_text: { type: 'string' },
          response_summary: { type: 'string', nullable: true },
          conversation_id: { type: 'string', format: 'uuid', nullable: true },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      // ── Dashboard / Insights ──────────────────────────────────────────────
      DimensionInsight: {
        type: 'object',
        properties: {
          dimension_id: { type: 'string' },
          label: { type: 'string' },
          score: { type: 'number', minimum: 0, maximum: 100 },
          summary: { type: 'string' },
          recommendation: { type: 'string', nullable: true },
          generated_at: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      DashboardResponse: {
        type: 'object',
        properties: {
          overall_health_score: { type: 'number', minimum: 0, maximum: 100 },
          last_generated_at: { type: 'string', format: 'date-time', nullable: true },
          dimensions: { type: 'array', items: { $ref: '#/components/schemas/DimensionInsight' } },
          priority_recommendations: {
            type: 'array',
            items: { $ref: '#/components/schemas/DimensionInsight' },
          },
        },
      },
      // ── Content ───────────────────────────────────────────────────────────
      ContentDraft: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          workspace_id: { type: 'string', format: 'uuid' },
          user_id: { type: 'string', format: 'uuid' },
          title: { type: 'string' },
          content_type: { type: 'string' },
          body: { type: 'string' },
          status: { type: 'string', enum: ['draft', 'published', 'archived'] },
          created_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' },
        },
      },
      // ── Admin ─────────────────────────────────────────────────────────────
      AuditLog: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          workspace_id: { type: 'string', format: 'uuid' },
          user_id: { type: 'string', format: 'uuid' },
          user_email: { type: 'string', format: 'email', nullable: true },
          action: { type: 'string' },
          resource_type: { type: 'string' },
          resource_id: { type: 'string' },
          metadata: { type: 'object' },
          ip_address: { type: 'string', nullable: true },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      UserDataExport: {
        type: 'object',
        properties: {
          user_id: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email' },
          name: { type: 'string', nullable: true },
          role: { type: 'string' },
          exported_at: { type: 'string', format: 'date-time' },
          profile: {
            type: 'object',
            properties: {
              created_at: { type: 'string', format: 'date-time' },
              last_active_at: { type: 'string', format: 'date-time', nullable: true },
            },
          },
          queries: {
            type: 'array',
            items: { $ref: '#/components/schemas/QueryHistoryItem' },
          },
          drafts: {
            type: 'array',
            items: { $ref: '#/components/schemas/ContentDraft' },
          },
        },
      },
    },
    responses: {
      Unauthorized: {
        description: 'Missing or invalid JWT.',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      Forbidden: {
        description: 'Authenticated but insufficient role for this operation.',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      NotFound: {
        description: 'Resource not found.',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      BadRequest: {
        description: 'Validation error in request body or parameters.',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      InternalServerError: {
        description: 'Unexpected server error.',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      TooManyRequests: {
        description: 'Rate limit exceeded.',
        headers: {
          'Retry-After': { schema: { type: 'integer' }, description: 'Seconds until retry is safe' },
          'X-RateLimit-Limit': { schema: { type: 'integer' } },
          'X-RateLimit-Remaining': { schema: { type: 'integer' } },
        },
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
    },
  },
  security: [{ BearerAuth: [] }],
  paths: {
    // ═══════════════════════════════════════════════════════════════════════
    // Auth
    // ═══════════════════════════════════════════════════════════════════════
    '/v1/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Initiate Google OAuth login',
        description:
          'Returns the Google OAuth authorization URL with PKCE code challenge. ' +
          'Redirect the user to this URL. No authentication required.',
        security: [],
        requestBody: { required: false, content: {} },
        responses: {
          '200': {
            description: 'Authorization URL generated.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    authorization_url: {
                      type: 'string',
                      format: 'uri',
                      description: 'Google OAuth 2.0 authorization URL',
                    },
                  },
                },
              },
            },
          },
          '500': { $ref: '#/components/responses/InternalServerError' },
        },
      },
    },
    '/v1/auth/callback': {
      post: {
        tags: ['Auth'],
        summary: 'Exchange OAuth code for BOBA JWT',
        description:
          'Accepts the code and state from the Google OAuth redirect, exchanges ' +
          'for tokens, and returns a BOBA JWT. Also sets an HttpOnly refresh token cookie. ' +
          'No authentication required.',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['code', 'state'],
                properties: {
                  code: { type: 'string', description: 'Google OAuth authorization code' },
                  state: { type: 'string', description: 'PKCE state parameter' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'JWT issued, refresh cookie set.',
            headers: {
              'Set-Cookie': {
                description: 'HttpOnly refresh token cookie (boba_refresh)',
                schema: { type: 'string' },
              },
            },
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/AuthTokenResponse' } },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '500': { $ref: '#/components/responses/InternalServerError' },
        },
      },
    },
    '/v1/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Rotate refresh token and issue new JWT',
        description:
          'Reads the boba_refresh HttpOnly cookie, validates it, rotates it, ' +
          'and returns a new JWT. Requires the X-CSRF-Token header (double-submit cookie pattern).',
        security: [],
        parameters: [
          {
            in: 'header',
            name: 'X-CSRF-Token',
            required: true,
            schema: { type: 'string' },
            description: 'CSRF token from the boba_csrf cookie',
          },
        ],
        responses: {
          '200': {
            description: 'New JWT issued.',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/AuthTokenResponse' } },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '500': { $ref: '#/components/responses/InternalServerError' },
        },
      },
    },
    '/v1/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Logout and clear refresh token cookie',
        description: 'Clears the boba_refresh HttpOnly cookie. Requires X-CSRF-Token header.',
        parameters: [
          {
            in: 'header',
            name: 'X-CSRF-Token',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': { description: 'Logged out successfully.' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },

    // ═══════════════════════════════════════════════════════════════════════
    // Workspaces
    // ═══════════════════════════════════════════════════════════════════════
    '/v1/workspaces': {
      get: {
        tags: ['Workspaces'],
        summary: 'List workspaces the caller belongs to',
        responses: {
          '200': {
            description: 'List of workspaces.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    workspaces: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          name: { type: 'string' },
                          role: { type: 'string', enum: ['viewer', 'member', 'admin', 'owner'] },
                          created_at: { type: 'string', format: 'date-time' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '500': { $ref: '#/components/responses/InternalServerError' },
        },
      },
      post: {
        tags: ['Workspaces'],
        summary: 'Create a new workspace',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: { name: { type: 'string', maxLength: 100 } },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Workspace created.' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },

    // ═══════════════════════════════════════════════════════════════════════
    // Drive Connections
    // ═══════════════════════════════════════════════════════════════════════
    '/v1/connections/drive': {
      get: {
        tags: ['Drive Connections'],
        summary: 'List Drive connections for the workspace',
        description: 'Requires admin role. OAuth tokens are not included in the response.',
        responses: {
          '200': {
            description: 'Drive connections list.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    connections: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          status: { type: 'string', enum: ['connected', 'disconnected'] },
                          files_indexed: { type: 'integer' },
                          last_sync_at: { type: 'string', format: 'date-time', nullable: true },
                          sync_health: { type: 'string', nullable: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
      post: {
        tags: ['Drive Connections'],
        summary: 'Initiate a new Drive OAuth connection',
        description: 'Returns the Google OAuth URL to begin the connection flow. Requires admin role.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  folder_mappings: { type: 'array', items: { type: 'object' } },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'OAuth URL for Drive connection.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { authorization_url: { type: 'string', format: 'uri' } },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/v1/connections/drive/{connectionId}': {
      delete: {
        tags: ['Drive Connections'],
        summary: 'Disconnect and remove a Drive connection',
        parameters: [
          { in: 'path', name: 'connectionId', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Connection removed.' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    // ═══════════════════════════════════════════════════════════════════════
    // Documents
    // ═══════════════════════════════════════════════════════════════════════
    '/v1/documents': {
      get: {
        tags: ['Documents'],
        summary: 'List workspace documents (paginated)',
        description: 'Returns documents sorted by last_synced DESC with freshness scores. Results are cached for 2 minutes.',
        parameters: [
          { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
          { in: 'query', name: 'pageSize', schema: { type: 'integer', default: 20, maximum: 100 } },
        ],
        responses: {
          '200': {
            description: 'Paginated document list.',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/DocumentListResult' } },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '429': { $ref: '#/components/responses/TooManyRequests' },
          '500': { $ref: '#/components/responses/InternalServerError' },
        },
      },
    },
    '/v1/documents/duplicates': {
      get: {
        tags: ['Documents'],
        summary: 'Find duplicate documents',
        description: 'Returns groups of documents that share the same content_hash.',
        responses: {
          '200': {
            description: 'Duplicate groups.',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      content_hash: { type: 'string' },
                      documents: { type: 'array', items: { $ref: '#/components/schemas/Document' } },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/v1/documents/outdated': {
      get: {
        tags: ['Documents'],
        summary: 'List outdated documents',
        parameters: [
          {
            in: 'query',
            name: 'threshold',
            schema: { type: 'integer', default: 30, minimum: 0, maximum: 100 },
            description: 'Freshness score below which a document is considered outdated',
          },
        ],
        responses: {
          '200': {
            description: 'Documents below freshness threshold.',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/Document' } },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/v1/documents/search': {
      get: {
        tags: ['Documents'],
        summary: 'Full-text search across documents',
        description: 'Uses PostgreSQL to_tsvector / plainto_tsquery for full-text search.',
        parameters: [
          { in: 'query', name: 'q', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'Matching documents.',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/Document' } },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/v1/documents/health': {
      get: {
        tags: ['Documents'],
        summary: 'Sync health metrics',
        responses: {
          '200': {
            description: 'Sync health summary.',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/SyncHealth' } },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },

    // ═══════════════════════════════════════════════════════════════════════
    // Ask BOBA (RAG)
    // ═══════════════════════════════════════════════════════════════════════
    '/v1/ask': {
      post: {
        tags: ['Ask'],
        summary: 'Submit a natural-language GTM question',
        description:
          'Embeds the query via the LLM gateway, performs pgvector similarity search, ' +
          'and synthesises an answer with citations. Responses are cached for 5 minutes ' +
          'for identical standalone queries. Rate limit: 10 req/min.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['query'],
                properties: {
                  query: {
                    type: 'string',
                    minLength: 1,
                    maxLength: 2000,
                    description: 'Natural-language GTM question',
                  },
                  conversation_id: {
                    type: 'string',
                    format: 'uuid',
                    description: 'Pass to continue a prior conversation',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Structured answer with citations.',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/AskResponse' } },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '429': { $ref: '#/components/responses/TooManyRequests' },
          '500': { $ref: '#/components/responses/InternalServerError' },
        },
      },
    },
    '/v1/ask/history': {
      get: {
        tags: ['Ask'],
        summary: 'Paginated query history for the authenticated user',
        parameters: [
          { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
          { in: 'query', name: 'pageSize', schema: { type: 'integer', default: 20, maximum: 100 } },
        ],
        responses: {
          '200': {
            description: 'Query history.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/QueryHistoryItem' },
                    },
                    total: { type: 'integer' },
                    page: { type: 'integer' },
                    pageSize: { type: 'integer' },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '500': { $ref: '#/components/responses/InternalServerError' },
        },
      },
    },

    // ═══════════════════════════════════════════════════════════════════════
    // Dashboard
    // ═══════════════════════════════════════════════════════════════════════
    '/v1/dashboard': {
      get: {
        tags: ['Dashboard'],
        summary: 'GTM health overview',
        description: 'Returns overall health score, per-dimension scores, and priority recommendations. Cached for 5 minutes.',
        responses: {
          '200': {
            description: 'Dashboard data.',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/DashboardResponse' } },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '500': { $ref: '#/components/responses/InternalServerError' },
        },
      },
    },
    '/v1/dashboard/dimensions/{id}': {
      get: {
        tags: ['Dashboard'],
        summary: 'Detailed insight for a single GTM dimension',
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'string' },
            description: 'Dimension ID (e.g. brand_consistency, competitive_position)',
          },
        ],
        responses: {
          '200': {
            description: 'Dimension detail.',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/DimensionInsight' } },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/v1/dashboard/refresh': {
      post: {
        tags: ['Dashboard'],
        summary: 'Trigger on-demand insight regeneration',
        description: 'Regenerates insights for all 10 GTM dimensions. Requires member role or above. Also invalidates the dashboard cache.',
        responses: {
          '200': {
            description: 'Regeneration complete.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { message: { type: 'string' } },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '500': { $ref: '#/components/responses/InternalServerError' },
        },
      },
    },

    // ═══════════════════════════════════════════════════════════════════════
    // Citations
    // ═══════════════════════════════════════════════════════════════════════
    '/v1/insights/{id}/citations': {
      get: {
        tags: ['Citations'],
        summary: 'Get citations for an insight',
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': {
            description: 'Resolved citations with Drive URLs.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    citations: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/AskCitation' },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/InternalServerError' },
        },
      },
    },

    // ═══════════════════════════════════════════════════════════════════════
    // Content Generation
    // ═══════════════════════════════════════════════════════════════════════
    '/v1/content/generate': {
      post: {
        tags: ['Content'],
        summary: 'Generate a content draft',
        description: 'Generates multi-format content (blog, email, ad copy, etc.) using the LLM gateway and workspace brand voice. Rate limit: 10 req/min.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['topic'],
                properties: {
                  topic: { type: 'string', minLength: 1, maxLength: 1000 },
                  type: { type: 'string', maxLength: 100, description: 'Content type (blog_post, email, ad_copy, etc.)' },
                  content_type: { type: 'string', maxLength: 100, description: 'Alias for type' },
                  tone: { type: 'string', maxLength: 100, description: 'Tone (formal, casual, persuasive, etc.)' },
                  length: { type: 'string', maxLength: 50, description: 'Target length (short, medium, long)' },
                  channel: { type: 'string', maxLength: 100, description: 'Distribution channel' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Generated content draft.',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ContentDraft' } },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '429': { $ref: '#/components/responses/TooManyRequests' },
          '500': { $ref: '#/components/responses/InternalServerError' },
        },
      },
    },
    '/v1/content/drafts': {
      get: {
        tags: ['Content'],
        summary: 'List content drafts for the workspace',
        parameters: [
          { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
          { in: 'query', name: 'pageSize', schema: { type: 'integer', default: 20, maximum: 100 } },
        ],
        responses: {
          '200': {
            description: 'Paginated draft list.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { type: 'array', items: { $ref: '#/components/schemas/ContentDraft' } },
                    total: { type: 'integer' },
                    page: { type: 'integer' },
                    pageSize: { type: 'integer' },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/v1/content/drafts/{id}': {
      get: {
        tags: ['Content'],
        summary: 'Get a content draft by ID',
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': {
            description: 'Content draft.',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ContentDraft' } },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      put: {
        tags: ['Content'],
        summary: 'Update a content draft',
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  body: { type: 'string' },
                  status: { type: 'string', enum: ['draft', 'published', 'archived'] },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Draft updated.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ContentDraft' } } } },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      delete: {
        tags: ['Content'],
        summary: 'Delete a content draft',
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': { description: 'Draft deleted.' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    // ═══════════════════════════════════════════════════════════════════════
    // Brand Intelligence
    // ═══════════════════════════════════════════════════════════════════════
    '/v1/brand': {
      get: {
        tags: ['Brand Intelligence'],
        summary: 'Get brand voice analysis and consistency score',
        responses: {
          '200': {
            description: 'Brand analysis result.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    consistency_score: { type: 'number', minimum: 0, maximum: 100 },
                    voice_summary: { type: 'string' },
                    drift_indicators: { type: 'array', items: { type: 'string' } },
                    generated_at: { type: 'string', format: 'date-time', nullable: true },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/v1/brand/refresh': {
      post: {
        tags: ['Brand Intelligence'],
        summary: 'Regenerate brand analysis',
        responses: {
          '200': { description: 'Brand regeneration complete.' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },

    // ═══════════════════════════════════════════════════════════════════════
    // Persona Intelligence
    // ═══════════════════════════════════════════════════════════════════════
    '/v1/personas': {
      get: {
        tags: ['Personas'],
        summary: 'List B2B buyer persona cards',
        responses: {
          '200': {
            description: 'Persona list.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { personas: { type: 'array', items: { type: 'object' } } },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/v1/personas/{id}': {
      get: {
        tags: ['Personas'],
        summary: 'Get a persona by ID',
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Persona detail.' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    // ═══════════════════════════════════════════════════════════════════════
    // Competitor Intelligence
    // ═══════════════════════════════════════════════════════════════════════
    '/v1/competitors': {
      get: {
        tags: ['Competitors'],
        summary: 'List competitor battlecards',
        responses: {
          '200': {
            description: 'Competitor list with threat scores.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { competitors: { type: 'array', items: { type: 'object' } } },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/v1/competitors/{id}': {
      get: {
        tags: ['Competitors'],
        summary: 'Get a competitor battlecard',
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Competitor battlecard.' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    // ═══════════════════════════════════════════════════════════════════════
    // Win / Loss Analysis
    // ═══════════════════════════════════════════════════════════════════════
    '/v1/winloss': {
      get: {
        tags: ['Win/Loss'],
        summary: 'Win/loss deal pattern analysis',
        responses: {
          '200': {
            description: 'Win/loss trends and patterns.',
            content: { 'application/json': { schema: { type: 'object' } } },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/v1/winloss/trends': {
      get: {
        tags: ['Win/Loss'],
        summary: 'Win/loss trend data over time',
        responses: {
          '200': { description: 'Trend data.' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },

    // ═══════════════════════════════════════════════════════════════════════
    // Campaign Planner
    // ═══════════════════════════════════════════════════════════════════════
    '/v1/campaigns': {
      post: {
        tags: ['Campaigns'],
        summary: 'Generate a multi-channel campaign brief',
        description: 'Generates email sequences, ad copy, and channel recommendations. Rate limit: 10 req/min.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['objective'],
                properties: {
                  objective: { type: 'string', maxLength: 1000 },
                  target_persona_id: { type: 'string' },
                  channels: { type: 'array', items: { type: 'string' } },
                  duration_days: { type: 'integer', minimum: 1, maximum: 365 },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Campaign brief generated.' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '429': { $ref: '#/components/responses/TooManyRequests' },
        },
      },
      get: {
        tags: ['Campaigns'],
        summary: 'List generated campaign briefs',
        responses: {
          '200': { description: 'Campaign list.' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },

    // ═══════════════════════════════════════════════════════════════════════
    // Market Intelligence
    // ═══════════════════════════════════════════════════════════════════════
    '/v1/market': {
      get: {
        tags: ['Market Intelligence'],
        summary: 'Market trends, sentiment, and emerging topics',
        responses: {
          '200': {
            description: 'Market intelligence summary.',
            content: { 'application/json': { schema: { type: 'object' } } },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/v1/market/trends': {
      get: {
        tags: ['Market Intelligence'],
        summary: 'Extracted market trends',
        responses: {
          '200': { description: 'Trend list.' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },

    // ═══════════════════════════════════════════════════════════════════════
    // Analytics
    // ═══════════════════════════════════════════════════════════════════════
    '/v1/analytics': {
      get: {
        tags: ['Analytics'],
        summary: 'GTM dimension trends and narrative summaries',
        parameters: [
          { in: 'query', name: 'from', schema: { type: 'string', format: 'date' } },
          { in: 'query', name: 'to', schema: { type: 'string', format: 'date' } },
        ],
        responses: {
          '200': {
            description: 'Analytics dashboard data.',
            content: { 'application/json': { schema: { type: 'object' } } },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/v1/analytics/qbr': {
      get: {
        tags: ['Analytics'],
        summary: 'Generate QBR export data',
        responses: {
          '200': { description: 'QBR export.' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },

    // ═══════════════════════════════════════════════════════════════════════
    // Drive (folder picker)
    // ═══════════════════════════════════════════════════════════════════════
    '/v1/drive/folders': {
      get: {
        tags: ['Drive'],
        summary: 'List root-level Drive folders',
        description: 'Used by the folder picker in the Drive connection setup flow.',
        responses: {
          '200': {
            description: 'Drive folders.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    folders: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          name: { type: 'string' },
                          mimeType: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/v1/drive/folders/{folderId}/subfolders': {
      get: {
        tags: ['Drive'],
        summary: 'List subfolders within a Drive folder',
        parameters: [
          { in: 'path', name: 'folderId', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Subfolders list.' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },

    // ═══════════════════════════════════════════════════════════════════════
    // Admin
    // ═══════════════════════════════════════════════════════════════════════
    '/v1/admin/connections': {
      get: {
        tags: ['Admin'],
        summary: 'List all Drive connections (admin)',
        description: 'Requires admin role. Returns connections without OAuth tokens.',
        responses: {
          '200': { description: 'Connections list.' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/v1/admin/connections/{id}': {
      put: {
        tags: ['Admin'],
        summary: 'Update a connection config',
        description: 'Update scopes or folder mappings. Requires admin role. Records an audit log entry.',
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  scopes: { type: 'array', items: { type: 'string' } },
                  folder_mappings: { type: 'array', items: { type: 'object' } },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Connection updated.' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/v1/admin/users': {
      get: {
        tags: ['Admin'],
        summary: 'List workspace members with roles',
        responses: {
          '200': {
            description: 'Workspace members.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    users: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          email: { type: 'string', format: 'email' },
                          name: { type: 'string', nullable: true },
                          role: { type: 'string', enum: ['viewer', 'member', 'admin', 'owner'] },
                          created_at: { type: 'string', format: 'date-time' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/v1/admin/users/{id}/role': {
      put: {
        tags: ['Admin'],
        summary: 'Update a member\'s role',
        description: 'Owner-only for assigning the owner role. Records audit log.',
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['role'],
                properties: {
                  role: { type: 'string', enum: ['viewer', 'member', 'admin', 'owner'] },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Role updated.' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
          '409': { description: 'Cannot remove the last owner.' },
        },
      },
    },
    '/v1/admin/sync/schedule': {
      post: {
        tags: ['Admin'],
        summary: 'Configure automatic sync schedule',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['schedule_type'],
                properties: {
                  schedule_type: { type: 'string', enum: ['hourly', 'daily', 'custom'] },
                  cron_expression: {
                    type: 'string',
                    description: 'Required when schedule_type is custom',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Schedule configured.' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/v1/admin/audit-logs': {
      get: {
        tags: ['Admin'],
        summary: 'Paginated audit logs (90-day retention)',
        parameters: [
          { in: 'query', name: 'user_id', schema: { type: 'string' } },
          { in: 'query', name: 'action', schema: { type: 'string' } },
          { in: 'query', name: 'from', schema: { type: 'string', format: 'date-time' } },
          { in: 'query', name: 'to', schema: { type: 'string', format: 'date-time' } },
          { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
          { in: 'query', name: 'page_size', schema: { type: 'integer', default: 25, maximum: 100 } },
        ],
        responses: {
          '200': {
            description: 'Audit log entries.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    entries: { type: 'array', items: { $ref: '#/components/schemas/AuditLog' } },
                    total: { type: 'integer' },
                    page: { type: 'integer' },
                    page_size: { type: 'integer' },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },

    // ── GDPR data subject rights ───────────────────────────────────────────
    '/v1/admin/data-export': {
      post: {
        tags: ['Admin', 'GDPR'],
        summary: 'Export requesting user\'s data (GDPR Article 20)',
        description:
          'Generates a portable JSON export of the authenticated user\'s profile, ' +
          'queries, and content drafts. An audit log entry is recorded.',
        responses: {
          '200': {
            description: 'User data export.',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/UserDataExport' } },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/InternalServerError' },
        },
      },
    },
    '/v1/admin/users/{id}/data': {
      delete: {
        tags: ['Admin', 'GDPR'],
        summary: 'Erase user-specific data (GDPR Article 17)',
        description:
          'Deletes all queries and content drafts for the specified user. ' +
          'Workspace-level documents are not affected. ' +
          'Requires confirmation token in body. Audit log recorded before deletion.',
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['confirm'],
                properties: {
                  confirm: {
                    type: 'string',
                    enum: ['DELETE_MY_DATA'],
                    description: 'Exact confirmation token required',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'User data deleted.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string' },
                    user_id: { type: 'string', format: 'uuid' },
                    deleted_at: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/v1/admin/workspace': {
      delete: {
        tags: ['Admin', 'GDPR'],
        summary: 'Permanently delete workspace (GDPR Article 17 — workspace-wide)',
        description:
          'IRREVERSIBLE. Deletes all workspace data including documents, chunks, embeddings, ' +
          'queries, drafts, users, and connections. OAuth tokens are revoked first. ' +
          'Requires owner role and confirmation token.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['confirm'],
                properties: {
                  confirm: {
                    type: 'string',
                    enum: ['DELETE_WORKSPACE'],
                    description: 'Exact confirmation token required',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Workspace permanently deleted.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string' },
                    workspace_id: { type: 'string', format: 'uuid' },
                    deleted_at: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/InternalServerError' },
        },
      },
    },
  },
  tags: [
    { name: 'Auth', description: 'Authentication and token management' },
    { name: 'Workspaces', description: 'Multi-tenant workspace management' },
    { name: 'Drive Connections', description: 'Google Drive OAuth connection management' },
    { name: 'Documents', description: 'Indexed document management and health' },
    { name: 'Ask', description: 'RAG-powered semantic Q&A (Ask BOBA)' },
    { name: 'Dashboard', description: 'GTM health scores and dimension insights' },
    { name: 'Citations', description: 'Source citations for insight evidence' },
    { name: 'Content', description: 'AI content generation and draft management' },
    { name: 'Brand Intelligence', description: 'Brand voice consistency analysis' },
    { name: 'Personas', description: 'B2B buyer persona intelligence' },
    { name: 'Competitors', description: 'Competitor battlecard generation' },
    { name: 'Win/Loss', description: 'Deal pattern extraction and trend analysis' },
    { name: 'Campaigns', description: 'Multi-channel campaign brief generation' },
    { name: 'Market Intelligence', description: 'Market trend and sentiment analysis' },
    { name: 'Analytics', description: 'GTM dimension trends and QBR exports' },
    { name: 'Drive', description: 'Google Drive folder picker utility' },
    { name: 'Admin', description: 'Workspace administration (admin role required)' },
    { name: 'GDPR', description: 'GDPR data subject rights (Article 17 & 20)' },
  ],
} as const;
