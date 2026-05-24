/**
 * DriveConnector provider factory.
 *
 * Reads the DRIVE_CONNECTOR environment variable to select the implementation:
 *
 *   DRIVE_CONNECTOR=mock   → MockDriveConnector (default for development/test)
 *   DRIVE_CONNECTOR=google → GoogleDriveConnector (production)
 *
 * The factory is the single call site that knows about concrete implementations.
 * All other code in the system depends only on the DriveConnector interface.
 */

import type { DriveConnector } from './types.js';
import { MockDriveConnector, type MockDriveConnectorOptions } from './mock/mock-connector.js';
import {
  GoogleDriveConnector,
  type GoogleDriveConnectorOptions,
} from './google/google-drive-connector.js';

export type ConnectorType = 'mock' | 'google';

export interface CreateConnectorOptions {
  /**
   * Explicit connector type — overrides DRIVE_CONNECTOR env var.
   * Useful in tests where you want to force mock without setting env.
   */
  type?: ConnectorType;
  /** Options forwarded to MockDriveConnector when type === 'mock'. */
  mockOptions?: MockDriveConnectorOptions;
  /**
   * Options forwarded to GoogleDriveConnector when type === 'google'.
   * accessToken is required for the real connector.
   */
  googleOptions?: GoogleDriveConnectorOptions;
}

/**
 * Creates and returns the appropriate DriveConnector implementation.
 *
 * @throws {Error} If DRIVE_CONNECTOR is set to an unrecognised value.
 * @throws {Error} If type is 'google' but googleOptions.accessToken is missing.
 */
export function createDriveConnector(options: CreateConnectorOptions = {}): DriveConnector {
  const connectorType: string =
    options.type ?? process.env['DRIVE_CONNECTOR'] ?? 'mock';

  switch (connectorType) {
    case 'mock':
      return new MockDriveConnector(options.mockOptions);

    case 'google': {
      const googleOptions = options.googleOptions ?? {
        accessToken: process.env['GOOGLE_ACCESS_TOKEN'] ?? '',
      };
      if (!googleOptions.accessToken) {
        throw new Error(
          'GoogleDriveConnector requires an accessToken. ' +
            'Pass googleOptions.accessToken or set GOOGLE_ACCESS_TOKEN env var.',
        );
      }
      return new GoogleDriveConnector(googleOptions);
    }

    default:
      throw new Error(
        `Unknown DRIVE_CONNECTOR value: '${connectorType}'. ` +
          "Valid values are: 'mock', 'google'.",
      );
  }
}
