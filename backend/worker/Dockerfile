# syntax=docker/dockerfile:1
# Multi-stage build for the BOBA worker service (Node/TypeScript).
# Build context is the repo ROOT so the npm workspace + root lockfile resolve.
#   docker build -f backend/worker/Dockerfile -t <img> .

# ---- build stage: compile TypeScript ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/worker/package.json ./backend/worker/package.json
RUN npm ci --include-workspace-root --workspace backend/worker
COPY . .
RUN npm run build --workspace backend/worker

# ---- deps stage: production-only node_modules ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/worker/package.json ./backend/worker/package.json
RUN npm ci --omit=dev --include-workspace-root --workspace backend/worker

# ---- runtime: distroless, non-root, no shell ----
FROM gcr.io/distroless/nodejs20-debian12:nonroot AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/backend/worker/dist ./backend/worker/dist
COPY --from=build /app/backend/worker/package.json ./backend/worker/package.json
USER nonroot
# Health check: call /health endpoint via Node (no shell needed in distroless image).
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "require('http').get('http://localhost:8081/health',(r)=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"]
CMD ["backend/worker/dist/index.js"]
