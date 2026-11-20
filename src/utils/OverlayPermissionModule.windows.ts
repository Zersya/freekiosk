interface OverlayPermissionModuleType {
  canDrawOverlays(): Promise<boolean>;
  requestOverlayPermission(): Promise<boolean>;
}

const OverlayPermissionModule: OverlayPermissionModuleType = {
  canDrawOverlays: () => Promise.resolve(true),
  requestOverlayPermission: () => Promise.resolve(true),
};

export default OverlayPermissionModule;
