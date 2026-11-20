import React from 'react';
import type { CameraDevice, CameraPermissionStatus, CodeScanner } from 'react-native-vision-camera';

export type { CameraDevice, CameraPermissionStatus, CodeScanner };

export const Camera: React.FC<Record<string, unknown>> & {
  getAvailableCameraDevices: () => CameraDevice[];
  addCameraDevicesChangedListener: (cb: (devices: CameraDevice[]) => void) => { remove: () => void };
  requestCameraPermission: () => Promise<CameraPermissionStatus>;
  getCameraPermissionStatus: () => CameraPermissionStatus;
} = Object.assign(
  (_props: Record<string, unknown>) => null,
  {
    getAvailableCameraDevices: () => [],
    addCameraDevicesChangedListener: () => ({ remove() {} }),
    requestCameraPermission: async () => 'denied' as CameraPermissionStatus,
    getCameraPermissionStatus: () => 'denied' as CameraPermissionStatus,
  },
);

export const useCameraDevice = (_position?: 'back' | 'front'): CameraDevice | undefined => undefined;

export const useCameraPermission = () => ({
  hasPermission: false,
  requestPermission: async () => false,
});

export const useCodeScanner = (config: CodeScanner): CodeScanner => config;
