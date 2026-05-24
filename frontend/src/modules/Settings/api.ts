/**
 * Admin Settings API client.
 *
 * GET  /v1/settings                          — returns full SettingsData
 * POST /v1/settings/folders/:id              — update folder mapping
 * POST /v1/settings/users/:id/role           — update user role
 * POST /v1/settings/sync/trigger             — trigger manual sync
 * POST /v1/settings/sync/schedule            — update sync schedule
 * POST /v1/settings/connections/:id/reauth   — re-authenticate Drive connection
 * DELETE /v1/settings/connections/:id        — disconnect Drive connection
 */

import { api } from '../../services/api.js';
import type {
  SettingsData,
  FolderMapping,
  MappableModule,
  WorkspaceRole,
  SyncFrequency,
} from './types.js';

/** Fetch full admin settings data. */
export function getSettings(): Promise<SettingsData> {
  return api.get<SettingsData>('/v1/settings');
}

/** Update the module assignment for a Drive folder. */
export function updateFolderMapping(
  folderId: string,
  module: MappableModule | null,
): Promise<FolderMapping> {
  return api.post<FolderMapping>(`/v1/settings/folders/${folderId}`, { module });
}

/** Update a workspace member's role. Requires owner or admin. */
export function updateUserRole(
  userId: string,
  role: WorkspaceRole,
): Promise<{ id: string; role: WorkspaceRole }> {
  return api.post<{ id: string; role: WorkspaceRole }>(
    `/v1/settings/users/${userId}/role`,
    { role },
  );
}

/** Trigger an immediate manual sync. */
export function triggerSync(): Promise<{ message: string }> {
  return api.post<{ message: string }>('/v1/settings/sync/trigger', {});
}

/** Update the recurring sync schedule. */
export function updateSyncSchedule(
  frequency: SyncFrequency,
): Promise<{ frequency: SyncFrequency; next_sync_at: string }> {
  return api.post<{ frequency: SyncFrequency; next_sync_at: string }>(
    '/v1/settings/sync/schedule',
    { frequency },
  );
}

/** Re-authenticate a Drive connection. */
export function reauthDriveConnection(
  connectionId: string,
): Promise<{ message: string; auth_url: string }> {
  return api.post<{ message: string; auth_url: string }>(
    `/v1/settings/connections/${connectionId}/reauth`,
    {},
  );
}

/** Disconnect a Drive connection. */
export function disconnectDriveConnection(
  connectionId: string,
): Promise<{ message: string }> {
  return api.delete<{ message: string }>(
    `/v1/settings/connections/${connectionId}`,
  );
}
