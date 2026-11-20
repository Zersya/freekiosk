interface AccessibilityServiceModuleType {
  isServiceEnabled(): Promise<boolean>;
  openAccessibilitySettings(): Promise<boolean>;
}

const AccessibilityServiceModule: AccessibilityServiceModuleType = {
  isServiceEnabled: () => Promise.resolve(false),
  openAccessibilitySettings: () => Promise.resolve(false),
};

export default AccessibilityServiceModule;
