import { NativeModules, Platform } from 'react-native';

export interface MdmAgentInfo {
  enabled: boolean;
  connected: boolean;
  wsUrl?: string;
  deviceId?: string | null;
  enrolled: boolean;
}

export interface MdmKioskUpdateLatest {
  appId: number;
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

export interface MdmCatalogApp {
  id: number;
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
}

export const mdmAgent = new MdmAgentService();
