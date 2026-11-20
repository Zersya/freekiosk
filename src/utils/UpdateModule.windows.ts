export const ENABLE_SELF_UPDATE = false;

interface VersionInfo {
  versionName: string;
  versionCode: number;
}

export default {
  getCurrentVersion(): Promise<VersionInfo> {
    return Promise.resolve({
      versionName: require('../../package.json').version,
      versionCode: 0,
    });
  },

  checkInstallPermission(): Promise<boolean> {
    return Promise.resolve(false);
  },

  openInstallPermissionSettings(): Promise<boolean> {
    return Promise.resolve(false);
  },
};
