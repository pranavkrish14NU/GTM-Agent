/**
 * DriveConnector provider factory.
 *
 * Reads the DRIVE_CONNECTOR environment variable to select the implementation:
 *
 *   DRIVE_CONNECTOR=mock   → MockDriveConnector (default for development/test)
 *   DRIVE_CONNECTOR=google → GoogleDriveConnector (production — WO-018)
 *
 * The factory is the single call site that knows about concrete implementations.
 * All other code in the system depends only on the DriveConnector interface.
 */

import type { DriveConnector } from './types.js';
import { MockDriveConnector, type MockDriveConnectorOptions } from './mock/mock-connector.js';

export type ConnectorType = 'mock' | 'google';

export interface CreateConnectorOptions {
  /**
   * Explicit connector type — overrides DRIVE_CONNECTOR env var.
   * Useful in tests where you want to force mock without setting env.
   */
  type?: ConnectorType;
  /** Options forwarded to MockDriveConnector when type === 'mock'. */
  mockOptions?: MockDriveConnectorOptions;
}

/**
 * Creates and returns the appropriate DriveConnector implementation.
 *
 * @throws {Error} If DRIVE_CONNECTOR is set to an unrecognised value.
 */
export function createDriveConnector(options: CreateConnectorOptions = {}): DriveConnector {
  const connectorType: string =
    options.type ?? process.env['DRIVE_CONNECTOR'] ?? 'mock';

  switch (connectorType) {
    case 'mock':
      return new MockDriveConnector(options.mockOptions);

    case 'google':
      // GoogleDriveConnector will be implemented in WO-018.
      // Importing lazily here so the factory does not fail at load time when
      // the google implementation is not yet present.
      throw new Error(
        'GoogleDriveConnector is not yet implemented. ' +
          'Set DRIVE_CONNECTOR=mock for development, or implement WO-018.',
      );

    default:
      throw new Error(
        `Unknown DRIVE_CONNECTOR value: '${connectorType}'. ` +
          "Valid values are: 'mock', 'google'.",
      );
  }
}
