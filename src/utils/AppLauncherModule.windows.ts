import { NativeModules, NativeEventEmitter } from 'react-native';
import { StorageService } from './storage';

export interface AppInfo {
  packageName: string;
  appName: string;
}

export interface AppInfoAll extends AppInfo {
  hasLauncherActivity: boolean;
}

interface IAppLauncherModule {
  launchExternalApp(packageName: string): Promise<boolean>;
  isAppInstalled(packageName: string): Promise<boolean>;
  getInstalledApps(): Promise<AppInfo[]>;
  getAllInstalledApps(): Promise<AppInfoAll[]>;
  getPackageLabel(packageName: string): Promise<string>;
  getAppIcon(packageName: string, size: number): Promise<string>;
  launchBootApps(): Promise<number>;
  startBackgroundMonitor(): Promise<boolean>;
  stopBackgroundMonitor(): Promise<boolean>;
}

const { AppLauncherModule: NativeAppLauncherModule } = NativeModules;

if (!NativeAppLauncherModule) {
  console.error('[AppLauncherModule] Native module not found. Did you rebuild the app?');
}

export const appLauncherEmitter = new NativeEventEmitter(NativeAppLauncherModule);

const AppLauncherModule: IAppLauncherModule = {
  launchExternalApp: (packageName: string) =>
    NativeAppLauncherModule.launchExternalApp(packageName),
  isAppInstalled: (packageName: string) =>
    NativeAppLauncherModule.isAppInstalled(packageName),
  getInstalledApps: () => NativeAppLauncherModule.getInstalledApps(),
  getAllInstalledApps: () => NativeAppLauncherModule.getAllInstalledApps(),
  getPackageLabel: (packageName: string) =>
    NativeAppLauncherModule.getPackageLabel(packageName),
  getAppIcon: (packageName: string, size: number) =>
    NativeAppLauncherModule.getAppIcon(packageName, size),

  async launchBootApps(): Promise<number> {
    try {
      const managedApps = await StorageService.getManagedApps();
      const bootApps = managedApps.filter((app) => app.launchOnBoot);
      let launched = 0;
      for (const app of bootApps) {
        try {
          await NativeAppLauncherModule.launchExternalApp(app.packageName);
          launched++;
          // Small gap between launches to avoid overwhelming the shell
          await new Promise<void>((resolve) => setTimeout(resolve, 800));
        } catch (error) {
          console.error(`[AppLauncherModule] Failed to launch boot app ${app.packageName}:`, error);
        }
      }
      return launched;
    } catch (error) {
      console.error('[AppLauncherModule] launchBootApps failed:', error);
      return 0;
    }
  },

  startBackgroundMonitor: () => Promise.resolve(false),
  stopBackgroundMonitor: () => Promise.resolve(true),
};

export default AppLauncherModule;
