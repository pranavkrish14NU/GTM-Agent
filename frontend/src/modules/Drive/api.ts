/**
 * Drive Knowledge Hub API client.
 *
 * Thin wrappers around the /v1/documents REST endpoints.
 * All requests are workspace-scoped via the Bearer token in localStorage
 * (handled by the shared `api` helper in services/api.ts).
 */

import { api } from '../../services/api.js';
import type {
  ListDocumentsResult,
  DuplicateGroup,
  DocumentRow,
  HealthMetrics,
} from './types.js';

/** Paginated list of all indexed documents, sorted by last_synced DESC */
export function fetchDocuments(
  page = 1,
  pageSize = 20,
): Promise<ListDocumentsResult> {
  return api.get<ListDocumentsResult>(
    `/v1/documents?page=${page}&pageSize=${pageSize}`,
  );
}

/** Groups of documents sharing the same content hash (duplicates) */
export function fetchDuplicates(): Promise<DuplicateGroup[]> {
  return api.get<DuplicateGroup[]>('/v1/documents/duplicates');
}

/**
 * Documents whose freshness score is below `threshold` (default 30).
 * Lower threshold = stricter; returns only very stale files.
 */
export function fetchOutdated(threshold = 30): Promise<DocumentRow[]> {
  return api.get<DocumentRow[]>(`/v1/documents/outdated?threshold=${threshold}`);
}

/** Full-text search across document titles and chunk content */
export function fetchSearch(q: string): Promise<DocumentRow[]> {
  return api.get<DocumentRow[]>(`/v1/documents/search?q=${encodeURIComponent(q)}`);
}

/** Aggregate sync health metrics for the workspace */
export function fetchHealth(): Promise<HealthMetrics> {
  return api.get<HealthMetrics>('/v1/documents/health');
}
