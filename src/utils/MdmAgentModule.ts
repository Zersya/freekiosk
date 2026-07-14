import { NativeModules, Platform } from 'react-native';

export interface MdmAgentInfo {
  enabled: boolean;
  connected: boolean;
  wsUrl?: string;
  deviceId: number;
  enrolled: boolean;
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
      return { enabled: false, connected: false, deviceId: 0, enrolled: false };
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

export const mdmAgent = new MdmAgentService();
