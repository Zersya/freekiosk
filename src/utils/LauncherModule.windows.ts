interface LauncherModuleType {
  enableHomeLauncher(): Promise<boolean>;
  disableHomeLauncher(): Promise<boolean>;
  isHomeLauncherEnabled(): Promise<boolean>;
  openDefaultLauncherSettings(): Promise<boolean>;
}

const LauncherModule: LauncherModuleType = {
  enableHomeLauncher: () => Promise.resolve(false),
  disableHomeLauncher: () => Promise.resolve(false),
  isHomeLauncherEnabled: () => Promise.resolve(false),
  openDefaultLauncherSettings: () => Promise.resolve(false),
};

export default LauncherModule;
