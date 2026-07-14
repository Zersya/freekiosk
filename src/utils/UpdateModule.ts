import { NativeModules } from 'react-native';

const { UpdateModule } = NativeModules;

/**
 * Play Store compliance flag.
 * When building with `./gradlew bundleRelease -Pplaystore`, this is false
 * and all update methods become no-ops. The UI hides the update section.
 */
export const ENABLE_SELF_UPDATE: boolean = UpdateModule?.ENABLE_SELF_UPDATE ?? true;

interface VersionInfo {
  versionName: string;
  versionCode: number;
}

export default {
  /**
   * Get current app version (always available, even in Play Store builds)
   */
  getCurrentVersion(): Promise<VersionInfo> {
    return UpdateModule.getCurrentVersion();
  },

  /**
   * Check if the app has permission to install APKs from unknown sources.
   * No-op in Play Store builds.
   */
  checkInstallPermission(): Promise<boolean> {
    if (!ENABLE_SELF_UPDATE) {
      return Promise.resolve(false);
    }
    return UpdateModule.checkInstallPermission();
  },

  /**
   * Open the system settings page to allow installing from unknown sources.
   * No-op in Play Store builds.
   */
  openInstallPermissionSettings(): Promise<boolean> {
    if (!ENABLE_SELF_UPDATE) {
      return Promise.resolve(false);
    }
    return UpdateModule.openInstallPermissionSettings();
  },
};
