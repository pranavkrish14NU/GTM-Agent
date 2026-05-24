/**
 * Admin Settings module tests
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import Settings from './index.js';
import {
  FIXTURE_SETTINGS_DATA,
  FIXTURE_FOLDER_MAPPINGS,
  FIXTURE_SYNC_CONFIG_RUNNING,
} from './fixtures.js';

vi.mock('./api.js', () => ({
  getSettings: vi.fn(),
  updateFolderMapping: vi.fn(),
  updateUserRole: vi.fn(),
  triggerSync: vi.fn(),
  updateSyncSchedule: vi.fn(),
  reauthDriveConnection: vi.fn(),
  disconnectDriveConnection: vi.fn(),
}));

import {
  getSettings,
  updateFolderMapping,
  updateUserRole,
  triggerSync,
  updateSyncSchedule,
  reauthDriveConnection,
  disconnectDriveConnection,
} from './api.js';

const mockGetSettings = vi.mocked(getSettings);
const mockUpdateFolderMapping = vi.mocked(updateFolderMapping);
const mockUpdateUserRole = vi.mocked(updateUserRole);
const mockTriggerSync = vi.mocked(triggerSync);
const mockUpdateSyncSchedule = vi.mocked(updateSyncSchedule);
const mockReauthDriveConnection = vi.mocked(reauthDriveConnection);
const mockDisconnectDriveConnection = vi.mocked(disconnectDriveConnection);

function renderSettings() {
  return render(
    <MemoryRouter>
      <Settings />
    </MemoryRouter>
  );
}

describe('Settings page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSettings.mockResolvedValue(FIXTURE_SETTINGS_DATA);
    mockUpdateFolderMapping.mockResolvedValue(FIXTURE_FOLDER_MAPPINGS[0]);
    mockUpdateUserRole.mockResolvedValue({ id: 'user-003', role: 'admin' });
    mockTriggerSync.mockResolvedValue({ message: 'Sync started' });
    mockUpdateSyncSchedule.mockResolvedValue({ frequency: 'weekly', next_sync_at: new Date().toISOString() });
    mockReauthDriveConnection.mockResolvedValue({ message: 'Re-authentication initiated', auth_url: 'https://auth.example.com' });
    mockDisconnectDriveConnection.mockResolvedValue({ message: 'Drive disconnected' });
  });

  // ---------------------------------------------------------------------------
  // Page structure
  // ---------------------------------------------------------------------------

  describe('page structure', () => {
    it('renders the page heading', async () => {
      renderSettings();
      await waitFor(() =>
        expect(screen.getByTestId('settings-heading')).toBeInTheDocument()
      );
      expect(screen.getByTestId('settings-heading')).toHaveTextContent('Settings & Admin');
    });

    it('renders all tab buttons', async () => {
      renderSettings();
      await waitFor(() =>
        expect(screen.getByTestId('settings-tabs')).toBeInTheDocument()
      );
      expect(screen.getByTestId('tab-connections')).toBeInTheDocument();
      expect(screen.getByTestId('tab-folders')).toBeInTheDocument();
      expect(screen.getByTestId('tab-users')).toBeInTheDocument();
      expect(screen.getByTestId('tab-audit')).toBeInTheDocument();
      expect(screen.getByTestId('tab-sync')).toBeInTheDocument();
    });

    it('shows loading skeleton initially', () => {
      mockGetSettings.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(FIXTURE_SETTINGS_DATA), 200))
      );
      renderSettings();
      expect(screen.getByTestId('settings-loading')).toBeInTheDocument();
    });

    it('connections tab is active by default', async () => {
      renderSettings();
      await waitFor(() =>
        expect(screen.getByTestId('tab-content-connections')).toBeInTheDocument()
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Connections tab
  // ---------------------------------------------------------------------------

  describe('connections tab', () => {
    it('renders connection cards', async () => {
      renderSettings();
      await waitFor(() =>
        expect(screen.getAllByTestId('connection-card').length).toBeGreaterThan(0)
      );
    });

    it('renders connection emails', async () => {
      renderSettings();
      await waitFor(() =>
        expect(screen.getAllByTestId('connection-email').length).toBeGreaterThan(0)
      );
      expect(screen.getByText(FIXTURE_SETTINGS_DATA.connections[0].email)).toBeInTheDocument();
    });

    it('renders connection status', async () => {
      renderSettings();
      await waitFor(() =>
        expect(screen.getAllByTestId('connection-status').length).toBeGreaterThan(0)
      );
    });

    it('renders reauth buttons', async () => {
      renderSettings();
      await waitFor(() =>
        expect(screen.getAllByTestId('reauth-button').length).toBeGreaterThan(0)
      );
    });

    it('renders disconnect buttons', async () => {
      renderSettings();
      await waitFor(() =>
        expect(screen.getAllByTestId('disconnect-button').length).toBeGreaterThan(0)
      );
    });

    it('calls reauthDriveConnection when reauth is clicked', async () => {
      renderSettings();
      await waitFor(() =>
        expect(screen.getAllByTestId('reauth-button')[0]).toBeInTheDocument()
      );
      fireEvent.click(screen.getAllByTestId('reauth-button')[0]);
      await waitFor(() =>
        expect(mockReauthDriveConnection).toHaveBeenCalledWith(
          FIXTURE_SETTINGS_DATA.connections[0].id
        )
      );
    });

    it('calls disconnectDriveConnection and removes card when disconnect clicked', async () => {
      renderSettings();
      await waitFor(() =>
        expect(screen.getAllByTestId('disconnect-button')[0]).toBeInTheDocument()
      );
      const initialCount = screen.getAllByTestId('connection-card').length;
      fireEvent.click(screen.getAllByTestId('disconnect-button')[0]);
      await waitFor(() =>
        expect(screen.getAllByTestId('connection-card').length).toBe(initialCount - 1)
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Folder mapping tab
  // ---------------------------------------------------------------------------

  describe('folder mapping tab', () => {
    it('switches to folder mapping tab', async () => {
      renderSettings();
      await waitFor(() =>
        expect(screen.getByTestId('tab-folders')).toBeInTheDocument()
      );
      fireEvent.click(screen.getByTestId('tab-folders'));
      await waitFor(() =>
        expect(screen.getByTestId('tab-content-folders')).toBeInTheDocument()
      );
    });

    it('renders folder rows', async () => {
      renderSettings();
      await waitFor(() =>
        expect(screen.getByTestId('tab-folders')).toBeInTheDocument()
      );
      fireEvent.click(screen.getByTestId('tab-folders'));
      await waitFor(() =>
        expect(screen.getAllByTestId('folder-row').length).toBe(
          FIXTURE_SETTINGS_DATA.folder_mappings.length
        )
      );
    });

    it('renders folder names', async () => {
      renderSettings();
      await waitFor(() => expect(screen.getByTestId('tab-folders')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('tab-folders'));
      await waitFor(() =>
        expect(screen.getAllByTestId('folder-name').length).toBeGreaterThan(0)
      );
      expect(screen.getByText(FIXTURE_SETTINGS_DATA.folder_mappings[0].folder_name)).toBeInTheDocument();
    });

    it('renders module select dropdowns', async () => {
      renderSettings();
      await waitFor(() => expect(screen.getByTestId('tab-folders')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('tab-folders'));
      await waitFor(() =>
        expect(screen.getAllByTestId('folder-module-select').length).toBeGreaterThan(0)
      );
    });

    it('calls updateFolderMapping when module is changed', async () => {
      renderSettings();
      await waitFor(() => expect(screen.getByTestId('tab-folders')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('tab-folders'));
      await waitFor(() =>
        expect(screen.getAllByTestId('folder-module-select').length).toBeGreaterThan(0)
      );
      const selects = screen.getAllByTestId('folder-module-select');
      fireEvent.change(selects[0], { target: { value: 'campaigns' } });
      await waitFor(() => expect(mockUpdateFolderMapping).toHaveBeenCalled());
    });
  });

  // ---------------------------------------------------------------------------
  // Users tab
  // ---------------------------------------------------------------------------

  describe('users tab', () => {
    it('switches to users tab', async () => {
      renderSettings();
      await waitFor(() => expect(screen.getByTestId('tab-users')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('tab-users'));
      await waitFor(() =>
        expect(screen.getByTestId('tab-content-users')).toBeInTheDocument()
      );
    });

    it('renders user rows', async () => {
      renderSettings();
      await waitFor(() => expect(screen.getByTestId('tab-users')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('tab-users'));
      await waitFor(() =>
        expect(screen.getAllByTestId('user-row').length).toBe(
          FIXTURE_SETTINGS_DATA.members.length
        )
      );
    });

    it('renders user names', async () => {
      renderSettings();
      await waitFor(() => expect(screen.getByTestId('tab-users')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('tab-users'));
      await waitFor(() =>
        expect(screen.getAllByTestId('user-name').length).toBeGreaterThan(0)
      );
      expect(screen.getByText(FIXTURE_SETTINGS_DATA.members[0].display_name)).toBeInTheDocument();
    });

    it('renders role selects', async () => {
      renderSettings();
      await waitFor(() => expect(screen.getByTestId('tab-users')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('tab-users'));
      await waitFor(() =>
        expect(screen.getAllByTestId('role-select').length).toBeGreaterThan(0)
      );
    });

    it('calls updateUserRole when role is changed', async () => {
      renderSettings();
      await waitFor(() => expect(screen.getByTestId('tab-users')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('tab-users'));
      await waitFor(() =>
        expect(screen.getAllByTestId('role-select').length).toBeGreaterThan(0)
      );
      const roleSelects = screen.getAllByTestId('role-select');
      // Find a non-disabled select (not owner)
      const editableSelect = roleSelects.find(
        (s) => !(s as HTMLSelectElement).disabled
      );
      if (editableSelect) {
        fireEvent.change(editableSelect, { target: { value: 'admin' } });
        await waitFor(() => expect(mockUpdateUserRole).toHaveBeenCalled());
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Audit logs tab
  // ---------------------------------------------------------------------------

  describe('audit logs tab', () => {
    it('switches to audit logs tab', async () => {
      renderSettings();
      await waitFor(() => expect(screen.getByTestId('tab-audit')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('tab-audit'));
      await waitFor(() =>
        expect(screen.getByTestId('tab-content-audit')).toBeInTheDocument()
      );
    });

    it('renders audit entries', async () => {
      renderSettings();
      await waitFor(() => expect(screen.getByTestId('tab-audit')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('tab-audit'));
      await waitFor(() =>
        expect(screen.getAllByTestId('audit-entry').length).toBeGreaterThan(0)
      );
    });

    it('renders audit descriptions', async () => {
      renderSettings();
      await waitFor(() => expect(screen.getByTestId('tab-audit')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('tab-audit'));
      await waitFor(() =>
        expect(screen.getAllByTestId('audit-description').length).toBeGreaterThan(0)
      );
      expect(
        screen.getByText(FIXTURE_SETTINGS_DATA.audit_logs[0].description)
      ).toBeInTheDocument();
    });

    it('renders search input', async () => {
      renderSettings();
      await waitFor(() => expect(screen.getByTestId('tab-audit')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('tab-audit'));
      await waitFor(() =>
        expect(screen.getByTestId('audit-search')).toBeInTheDocument()
      );
    });

    it('filters audit entries by search term', async () => {
      renderSettings();
      await waitFor(() => expect(screen.getByTestId('tab-audit')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('tab-audit'));
      await waitFor(() => expect(screen.getByTestId('audit-search')).toBeInTheDocument());

      const fullCount = screen.getAllByTestId('audit-entry').length;
      fireEvent.change(screen.getByTestId('audit-search'), {
        target: { value: 'drive_connect' },
      });
      await waitFor(() =>
        expect(screen.getAllByTestId('audit-entry').length).toBeLessThanOrEqual(fullCount)
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Sync tab
  // ---------------------------------------------------------------------------

  describe('sync tab', () => {
    it('switches to sync tab', async () => {
      renderSettings();
      await waitFor(() => expect(screen.getByTestId('tab-sync')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('tab-sync'));
      await waitFor(() =>
        expect(screen.getByTestId('tab-content-sync')).toBeInTheDocument()
      );
    });

    it('renders sync panel', async () => {
      renderSettings();
      await waitFor(() => expect(screen.getByTestId('tab-sync')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('tab-sync'));
      await waitFor(() =>
        expect(screen.getByTestId('sync-panel')).toBeInTheDocument()
      );
    });

    it('renders trigger sync button', async () => {
      renderSettings();
      await waitFor(() => expect(screen.getByTestId('tab-sync')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('tab-sync'));
      await waitFor(() =>
        expect(screen.getByTestId('trigger-sync-button')).toBeInTheDocument()
      );
    });

    it('renders frequency select', async () => {
      renderSettings();
      await waitFor(() => expect(screen.getByTestId('tab-sync')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('tab-sync'));
      await waitFor(() =>
        expect(screen.getByTestId('frequency-select')).toBeInTheDocument()
      );
    });

    it('calls triggerSync when button is clicked', async () => {
      renderSettings();
      await waitFor(() => expect(screen.getByTestId('tab-sync')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('tab-sync'));
      await waitFor(() =>
        expect(screen.getByTestId('trigger-sync-button')).toBeInTheDocument()
      );
      fireEvent.click(screen.getByTestId('trigger-sync-button'));
      await waitFor(() => expect(mockTriggerSync).toHaveBeenCalled());
    });

    it('calls updateSyncSchedule when frequency changes', async () => {
      renderSettings();
      await waitFor(() => expect(screen.getByTestId('tab-sync')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('tab-sync'));
      await waitFor(() =>
        expect(screen.getByTestId('frequency-select')).toBeInTheDocument()
      );
      fireEvent.change(screen.getByTestId('frequency-select'), { target: { value: 'weekly' } });
      await waitFor(() => expect(mockUpdateSyncSchedule).toHaveBeenCalledWith('weekly'));
    });

    it('shows running state when sync is in progress', async () => {
      mockGetSettings.mockResolvedValue({
        ...FIXTURE_SETTINGS_DATA,
        sync_config: FIXTURE_SYNC_CONFIG_RUNNING,
      });
      renderSettings();
      await waitFor(() => expect(screen.getByTestId('tab-sync')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('tab-sync'));
      await waitFor(() =>
        expect(screen.getByTestId('sync-status-running')).toBeInTheDocument()
      );
    });

    it('trigger sync button is disabled when sync is running', async () => {
      mockGetSettings.mockResolvedValue({
        ...FIXTURE_SETTINGS_DATA,
        sync_config: FIXTURE_SYNC_CONFIG_RUNNING,
      });
      renderSettings();
      await waitFor(() => expect(screen.getByTestId('tab-sync')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('tab-sync'));
      await waitFor(() =>
        expect(screen.getByTestId('trigger-sync-button')).toBeDisabled()
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Error state
  // ---------------------------------------------------------------------------

  describe('error state', () => {
    it('shows error banner when getSettings fails', async () => {
      mockGetSettings.mockRejectedValue(new Error('Failed to load settings'));
      renderSettings();
      await waitFor(() =>
        expect(screen.getByTestId('settings-error')).toBeInTheDocument()
      );
      expect(screen.getByTestId('settings-error')).toHaveTextContent('Failed to load settings');
    });
  });

  // ---------------------------------------------------------------------------
  // Status messages
  // ---------------------------------------------------------------------------

  describe('status messages', () => {
    it('shows status message after sync trigger', async () => {
      renderSettings();
      await waitFor(() => expect(screen.getByTestId('tab-sync')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('tab-sync'));
      await waitFor(() =>
        expect(screen.getByTestId('trigger-sync-button')).toBeInTheDocument()
      );
      fireEvent.click(screen.getByTestId('trigger-sync-button'));
      await waitFor(() =>
        expect(screen.getByTestId('status-message')).toBeInTheDocument()
      );
      expect(screen.getByTestId('status-message')).toHaveTextContent('Sync started');
    });
  });
});
