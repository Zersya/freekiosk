export interface AutoBrightnessResult {
  success: boolean;
  message: string;
}

export interface AutoBrightnessStatus {
  active: boolean;
  currentLightLevel: number;
  currentBrightness: number;
  minBrightness: number;
  maxBrightness: number;
  brightnessOffset: number;
}

export interface LightLevelResult {
  lux: number;
  sensorAvailable: boolean;
}

export const AUTO_BRIGHTNESS_DEFAULTS = {
  enabled: false,
  minBrightness: 0.1,
  maxBrightness: 1.0,
  brightnessOffset: 0.0,
  updateInterval: 1000,
};

const unavailable = (message: string): AutoBrightnessResult => ({ success: false, message });

const AutoBrightnessModule = {
  startAutoBrightness: async (): Promise<AutoBrightnessResult> =>
    unavailable('Auto-brightness is not available on Windows'),
  stopAutoBrightness: async (): Promise<AutoBrightnessResult> =>
    unavailable('Auto-brightness is not available on Windows'),
  isAutoBrightnessActive: async (): Promise<AutoBrightnessStatus> => ({
    active: false,
    currentLightLevel: -1,
    currentBrightness: 0,
    minBrightness: 0,
    maxBrightness: 0,
    brightnessOffset: 0,
  }),
  getCurrentLightLevel: async (): Promise<LightLevelResult> => ({ lux: -1, sensorAvailable: false }),
  updateParameters: async (): Promise<AutoBrightnessResult> =>
    unavailable('Auto-brightness is not available on Windows'),
  hasLightSensor: async (): Promise<boolean> => false,
  resetToSystemBrightness: async (): Promise<AutoBrightnessResult> =>
    unavailable('Auto-brightness is not available on Windows'),
};

export default AutoBrightnessModule;
