/**
 * ScreenCaptureModule.ts
 * React Native bridge for MediaProjection full-screen capture
 */

import { NativeModules, Platform } from 'react-native';

const { ScreenCaptureModule } = NativeModules;

class ScreenCaptureService {
  async isActive(): Promise<boolean> {
    if (Platform.OS !== 'android' || !ScreenCaptureModule) {
      return false;
    }

    try {
      return await ScreenCaptureModule.isScreenCaptureActive();
    } catch {
      return false;
    }
  }

  async isWanted(): Promise<boolean> {
    if (Platform.OS !== 'android' || !ScreenCaptureModule?.isRemoteCaptureWanted) {
      return false;
    }

    try {
      return await ScreenCaptureModule.isRemoteCaptureWanted();
    } catch {
      return false;
    }
  }

  async setWanted(wanted: boolean): Promise<boolean> {
    if (Platform.OS !== 'android' || !ScreenCaptureModule?.setRemoteCaptureWanted) {
      return false;
    }

    return ScreenCaptureModule.setRemoteCaptureWanted(wanted);
  }

  async requestPermission(): Promise<boolean> {
    if (Platform.OS !== 'android' || !ScreenCaptureModule) {
      throw new Error('Screen capture is only available on Android');
    }

    return ScreenCaptureModule.requestScreenCapturePermission();
  }

  async stop(): Promise<boolean> {
    if (Platform.OS !== 'android' || !ScreenCaptureModule) {
      return false;
    }

    return ScreenCaptureModule.stopScreenCapture();
  }
}

export const screenCapture = new ScreenCaptureService();
