import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

export interface ApkInstallProgressEvent {
  jobId: string;
  appId?: string;
  packageName?: string;
  stage: string;
  message?: string;
}

export interface ApkInstallResultEvent {
  jobId: string;
  appId?: string;
  packageName?: string;
  displayName?: string;
  addedToHomeScreen?: boolean;
  error?: string;
}

const { ApkInstallModule } = NativeModules;

class ApkInstallService {
  private emitter = ApkInstallModule
    ? new NativeEventEmitter(ApkInstallModule)
    : null;

  async downloadAndInstall(options: {
    downloadUrl: string;
    fileName: string;
    sha256?: string;
    appId?: string;
    packageName?: string;
    displayName?: string;
  }): Promise<string> {
    if (Platform.OS !== 'android' || !ApkInstallModule) {
      throw new Error('ApkInstallModule is only available on Android');
    }

    return ApkInstallModule.downloadAndInstall(
      options.downloadUrl,
      options.fileName,
      options.sha256 ?? null,
      options.appId ?? null,
      options.packageName ?? null,
      options.displayName ?? null,
    );
  }

  addProgressListener(listener: (event: ApkInstallProgressEvent) => void) {
    return this.emitter?.addListener('onApkInstallProgress', listener);
  }

  addCompleteListener(listener: (event: ApkInstallResultEvent) => void) {
    return this.emitter?.addListener('onApkInstallComplete', listener);
  }

  addErrorListener(listener: (event: ApkInstallResultEvent) => void) {
    return this.emitter?.addListener('onApkInstallError', listener);
  }
}

export const apkInstall = new ApkInstallService();
