/**
 * Tests for the MSIX install/uninstall orchestration.
 */

jest.mock('react-native', () => ({
  NativeModules: {
    PackageInstallModule: {},
    KioskModule: {},
  },
  DeviceEventEmitter: { emit: jest.fn(), addListener: jest.fn() },
}));

import { installMsix, uninstallMsix, InstallerDeps } from '../../src/platform/windows/apps/msixInstaller';

function makeDeps(overrides: Partial<InstallerDeps['native']> = {}): InstallerDeps & {
  reports: Array<{ appId: string; body: Record<string, unknown> }>;
  deleted: string[];
} {
  const reports: Array<{ appId: string; body: Record<string, unknown> }> = [];
  const deleted: string[] = [];
  const deps: InstallerDeps & { reports: typeof reports; deleted: string[] } = {
    native: {
      downloadFile: jest.fn(async () =>
        JSON.stringify({ path: 'C:\\tmp\\app.msix', sizeBytes: 10, sha256: 'abc' })
      ),
      installPackage: jest.fn(async () => JSON.stringify({ success: true })),
      removePackage: jest.fn(async () => JSON.stringify({ status: 'uninstalled' })),
      getSelfPackageName: jest.fn(async () => 'FreeKiosk'),
      deleteFile: jest.fn(async (path: string) => {
        deleted.push(path);
      }),
      ...overrides,
    },
    reportStatus: jest.fn(async (appId: string, body: Record<string, unknown>) => {
      reports.push({ appId, body });
    }),
    timeoutMs: 5000,
    reports,
    deleted,
  };
  return deps;
}

describe('installMsix', () => {
  it('runs the happy path with status reports and cleanup', async () => {
    const deps = makeDeps();
    const result = await installMsix(
      {
        appId: 'app1',
        downloadUrl: 'http://x/app.msix',
        fileName: 'app.msix',
        packageName: 'Contoso.Test',
        sha256: 'ABC',
        versionCode: 2005007,
      },
      deps
    );

    expect(result.status).toBe('installed');
    expect(result.executed).toBe(true);
    expect(result.success).toBe(true);
    expect(deps.reports.map((r) => r.body.status)).toEqual([
      'downloading',
      'installing',
      'installed',
    ]);
    expect(deps.reports[2].body.installedVersionCode).toBe(2005007);
    expect(deps.deleted).toEqual(['C:\\tmp\\app.msix']);
  });

  it('rejects a blank downloadUrl', async () => {
    const deps = makeDeps();
    const result = await installMsix({ fileName: 'a.msix', packageName: 'p' }, deps);
    expect(result).toMatchObject({
      executed: false,
      success: false,
      status: 'failed',
      error: 'downloadUrl is required',
    });
  });

  it('rejects .apk file names on Windows', async () => {
    const deps = makeDeps();
    const result = await installMsix(
      { downloadUrl: 'http://x/a.apk', fileName: 'a.apk', packageName: 'p' },
      deps
    );
    expect(result.status).toBe('failed');
    expect(result.error).toBe('Only .msix and .msixbundle packages can be installed on Windows');
    expect(deps.native.downloadFile).not.toHaveBeenCalled();
  });

  it('refuses kiosk self-update', async () => {
    const deps = makeDeps();
    const result = await installMsix(
      {
        downloadUrl: 'http://x/f.msix',
        fileName: 'f.msix',
        packageName: 'FreeKiosk',
      },
      deps
    );
    expect(result.status).toBe('failed');
    expect(result.error).toBe('Kiosk self-update is not supported on Windows');
    expect(deps.native.downloadFile).not.toHaveBeenCalled();
  });

  it('fails on SHA-256 mismatch and deletes the file', async () => {
    const deps = makeDeps();
    const result = await installMsix(
      {
        appId: 'app1',
        downloadUrl: 'http://x/app.msix',
        fileName: 'app.msix',
        packageName: 'p',
        sha256: 'deadbeef',
      },
      deps
    );
    expect(result.status).toBe('failed');
    expect(result.error).toBe('SHA-256 checksum mismatch');
    expect(deps.deleted).toEqual(['C:\\tmp\\app.msix']);
    expect(deps.reports.some((r) => r.body.status === 'failed')).toBe(true);
    expect(deps.native.installPackage).not.toHaveBeenCalled();
  });

  it('fails when the native install reports failure', async () => {
    const deps = makeDeps({
      installPackage: jest.fn(async () =>
        JSON.stringify({ success: false, error: 'Deployment failed (0x80073CF0)' })
      ),
    });
    const result = await installMsix(
      { appId: 'a', downloadUrl: 'u', fileName: 'f.msix', packageName: 'p' },
      deps
    );
    expect(result.status).toBe('failed');
    expect(result.error).toBe('Deployment failed (0x80073CF0)');
    expect(deps.reports[deps.reports.length - 1].body).toMatchObject({
      status: 'failed',
      errorMessage: 'Deployment failed (0x80073CF0)',
    });
  });

  it('times out when the install never resolves', async () => {
    const deps = makeDeps({
      downloadFile: jest.fn(() => new Promise<string>(() => {})),
    });
    deps.timeoutMs = 50;
    const result = await installMsix(
      { appId: 'a', downloadUrl: 'u', fileName: 'f.msix', packageName: 'p' },
      deps
    );
    expect(result.status).toBe('timeout');
    expect(result.error).toBe('Install timed out');
  });
});

describe('uninstallMsix', () => {
  it('maps uninstalled', async () => {
    const deps = makeDeps();
    const result = await uninstallMsix({ appId: 'a', packageName: 'Contoso.Test' }, deps);
    expect(result).toMatchObject({
      executed: true,
      success: true,
      status: 'uninstalled',
      packageName: 'Contoso.Test',
      command: 'uninstallApk',
    });
    expect(deps.reports[0].body.status).toBe('uninstalled');
  });

  it('maps not_installed with a message', async () => {
    const deps = makeDeps({
      removePackage: jest.fn(async () => JSON.stringify({ status: 'not_installed' })),
    });
    const result = await uninstallMsix({ packageName: 'p' }, deps);
    expect(result.success).toBe(true);
    expect(result.status).toBe('uninstalled');
    expect(result.message).toBe('Package was not installed');
  });

  it('maps failed', async () => {
    const deps = makeDeps({
      removePackage: jest.fn(async () =>
        JSON.stringify({ status: 'failed', error: 'denied' })
      ),
    });
    const result = await uninstallMsix({ packageName: 'p' }, deps);
    expect(result).toMatchObject({ executed: false, success: false, status: 'failed', error: 'denied' });
  });

  it('rejects a blank packageName', async () => {
    const deps = makeDeps();
    const result = await uninstallMsix({ packageName: '' }, deps);
    expect(result).toMatchObject({
      executed: false,
      success: false,
      status: 'failed',
      error: 'packageName is required',
    });
  });
});
