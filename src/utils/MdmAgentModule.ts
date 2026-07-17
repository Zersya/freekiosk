import { NativeModules, Platform } from 'react-native';

export interface MdmAgentInfo {
  enabled: boolean;
  connected: boolean;
  wsUrl?: string;
  deviceId?: string | null;
  enrolled: boolean;
}

export interface MdmKioskUpdateLatest {
  appId: string;
  name: string;
  versionName?: string;
  versionCode: number;
  fileName: string;
  fileSizeBytes: number;
  sha256: string;
  downloadUrl: string;
}

export interface MdmKioskUpdateInfo {
  packageName: string;
  currentVersionCode?: number;
  currentVersionName?: string;
  updateAvailable: boolean;
  latest?: MdmKioskUpdateLatest | null;
}

export interface MdmConfigBackupSummary {
  id: string;
  deviceId: string;
  deviceName: string;
  label?: string | null;
  appVersion?: string | null;
  exportDate?: string | null;
  settingsCount: number;
  hasPinConfigured: boolean;
  createdAt: string;
  groupNames: string[];
  isOwnDevice: boolean;
}

export interface MdmConfigBackupGroup {
  id: string;
  name: string;
  color?: string | null;
}

export interface MdmConfigBackupListResponse {
  groups: MdmConfigBackupGroup[];
  backups: MdmConfigBackupSummary[];
}

export interface MdmCatalogApp {
  id: string;
  name: string;
  packageName: string;
  versionName?: string;
  versionCode?: number;
  fileName: string;
  fileSizeBytes: number;
  sha256: string;
  downloadUrl: string;
  installStatus?: string;
  installedOnDevice?: boolean;
  deviceVersionName?: string;
  updateAvailable?: boolean;
}

const { MdmAgentModule } = NativeModules;

class MdmAgentService {
  async configure(wsUrl: string, enrollmentToken?: string | null): Promise<boolean> {
    if (Platform.OS !== 'android' || !MdmAgentModule) {
      throw new Error('MdmAgentModule is only available on Android');
    }
    return MdmAgentModule.configure(wsUrl, enrollmentToken ?? null);
  }

  async startAgent(): Promise<boolean> {
    if (Platform.OS !== 'android' || !MdmAgentModule) {
      return false;
    }
    return MdmAgentModule.startAgent();
  }

  async stopAgent(): Promise<boolean> {
    if (Platform.OS !== 'android' || !MdmAgentModule) {
      return false;
    }
    return MdmAgentModule.stopAgent();
  }

  async isAgentConnected(): Promise<boolean> {
    if (Platform.OS !== 'android' || !MdmAgentModule) {
      return false;
    }
    return MdmAgentModule.isAgentConnected();
  }

  async getAgentInfo(): Promise<MdmAgentInfo> {
    if (Platform.OS !== 'android' || !MdmAgentModule) {
      return { enabled: false, connected: false, deviceId: null, enrolled: false };
    }
    return MdmAgentModule.getAgentInfo();
  }

  async clearEnrollment(): Promise<boolean> {
    if (Platform.OS !== 'android' || !MdmAgentModule) {
      return false;
    }
    return MdmAgentModule.clearEnrollment();
  }

  async fetchAvailableApps(): Promise<MdmCatalogApp[]> {
    if (Platform.OS !== 'android' || !MdmAgentModule) {
      return [];
    }
    return MdmAgentModule.fetchAvailableApps();
  }

  async fetchKioskUpdate(): Promise<MdmKioskUpdateInfo> {
    if (Platform.OS !== 'android' || !MdmAgentModule) {
      throw new Error('MdmAgentModule is only available on Android');
    }
    return MdmAgentModule.fetchKioskUpdate();
  }

  async listConfigBackups(): Promise<MdmConfigBackupListResponse> {
    if (Platform.OS !== 'android' || !MdmAgentModule) {
      return { groups: [], backups: [] };
    }
    return MdmAgentModule.listConfigBackups();
  }

  async uploadConfigBackup(backupJson: string, label?: string | null): Promise<{ id: string }> {
    if (Platform.OS !== 'android' || !MdmAgentModule) {
      throw new Error('MdmAgentModule is only available on Android');
    }
    const result = await MdmAgentModule.uploadConfigBackup(backupJson, label ?? null);
    return { id: result.id };
  }

  async fetchConfigBackupContent(backupId: string): Promise<string> {
    if (Platform.OS !== 'android' || !MdmAgentModule) {
      throw new Error('MdmAgentModule is only available on Android');
    }
    const result = await MdmAgentModule.fetchConfigBackup(backupId);
    return result.contentJson;
  }
}

export const mdmAgent = new MdmAgentService();
