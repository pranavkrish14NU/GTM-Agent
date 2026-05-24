/**
 * @boba/drive-connector — public package exports.
 *
 * Consumers import from this entry point only; never from sub-paths.
 */

export type {
  DriveConnector,
  DriveFile,
  DriveFileContent,
  DrivePermission,
  SyncStatus,
  ListFilesOptions,
  SearchFilesOptions,
  SupportedMimeType,
} from './types.js';

export { SUPPORTED_MIME_TYPES } from './types.js';

export { MockDriveConnector, type MockDriveConnectorOptions } from './mock/mock-connector.js';

export { GoogleDriveConnector, type GoogleDriveConnectorOptions } from './google/google-drive-connector.js';

export { createDriveConnector, type ConnectorType, type CreateConnectorOptions } from './factory.js';
