/**
 * Types for the Drive Knowledge Hub module.
 * Mirror the shape returned by the /v1/documents API endpoints.
 */

export interface DocumentRow {
  id: string;
  workspace_id: string;
  drive_connection_id: string;
  drive_file_id: string;
  title: string;
  mime_type: string;
  last_synced: string | null;
  content_hash: string | null;
  created_at: string;
  updated_at: string;
  freshness_score: number;
}

export interface ListDocumentsResult {
  data: DocumentRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DuplicateGroup {
  content_hash: string;
  documents: DocumentRow[];
}

export interface HealthMetrics {
  total_files: number;
  synced_files: number;
  average_freshness: number;
  error_count: number;
}

/** Active tab in the Knowledge Hub */
export type ActiveTab = 'all' | 'duplicates' | 'outdated';
