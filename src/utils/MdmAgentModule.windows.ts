/**
 * MdmAgentModule.windows.ts
 * Windows implementation of the MDM agent surface: same typed contract as
 * the Android service, backed by the TS WebSocket agent.
 */

import { windowsMdmAgent } from '../platform/windows/mdm/agentClient';
import * as agentStore from '../platform/windows/mdm/agentStore';
import type {
  MdmAgentInfo,
  MdmCatalogApp,
  MdmConfigBackupListResponse,
  MdmKioskUpdateInfo,
} from './MdmAgentModule';

export type {
  MdmAgentInfo,
  MdmKioskUpdateLatest,
  MdmKioskUpdateInfo,
  MdmConfigBackupSummary,
  MdmConfigBackupGroup,
  MdmConfigBackupListResponse,
  MdmCatalogApp,
} from './MdmAgentModule';

class MdmAgentService {
  async configure(wsUrl: string, enrollmentToken?: string | null): Promise<boolean> {
    await agentStore.saveWsUrl(wsUrl.trim());
    if (enrollmentToken && enrollmentToken.trim()) {
      await agentStore.saveEnrollmentToken(enrollmentToken.trim());
    }
    return true;
  }

  async startAgent(): Promise<boolean> {
    await agentStore.setEnabled(true);
    await windowsMdmAgent.start();
    return true;
  }

  async stopAgent(): Promise<boolean> {
    await agentStore.setEnabled(false);
    await windowsMdmAgent.stop();
    return true;
  }

  async isAgentConnected(): Promise<boolean> {
    return windowsMdmAgent.isConnected();
  }

  async getAgentInfo(): Promise<MdmAgentInfo> {
    const state = await agentStore.loadAgentState();
    return {
      enabled: state.enabled,
      connected: windowsMdmAgent.isConnected(),
      wsUrl: state.wsUrl,
      deviceId: state.deviceId,
      enrolled: !!state.deviceId && !!state.agentToken,
    };
  }

  async clearEnrollment(): Promise<boolean> {
    await windowsMdmAgent.stop();
    await agentStore.setEnabled(false);
    await agentStore.clearCredentials();
    return true;
  }

  async fetchAvailableApps(): Promise<MdmCatalogApp[]> {
    // The on-device catalog installer stays Android-only.
    return [];
  }

  async fetchKioskUpdate(): Promise<MdmKioskUpdateInfo> {
    throw new Error('Kiosk updates are not supported on Windows');
  }

  async listConfigBackups(): Promise<MdmConfigBackupListResponse> {
    return { groups: [], backups: [] };
  }

  async uploadConfigBackup(_backupJson: string, _label?: string | null): Promise<{ id: string }> {
    throw new Error('MDM config backup is not supported on Windows');
  }

  async fetchConfigBackupContent(_backupId: string): Promise<string> {
    throw new Error('MDM config backup is not supported on Windows');
  }
}

export const mdmAgent = new MdmAgentService();
