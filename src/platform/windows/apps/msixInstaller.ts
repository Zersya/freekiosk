/**
 * MSIX install/uninstall orchestration for Windows.
 * Driven by the MDM `installApk` / `uninstallApk` commands (direct REST and
 * agent WebSocket share the same params and result shape).
 */

import { NativeModules } from 'react-native';
import type * as MdmAgentClient from '../mdm/agentClient';

const { PackageInstallModule, KioskModule } = NativeModules;

export interface InstallerDeps {
  native: {
    downloadFile(url: string, fileName: string): Promise<string>;
    installPackage(path: string): Promise<string>;
    removePackage(name: string): Promise<string>;
    getSelfPackageName(): Promise<string>;
    deleteFile(path: string): Promise<void>;
  };
  reportStatus(
    appId: string,
    body: { status: string; installedVersionCode?: number; errorMessage?: string }
  ): Promise<void>;
  timeoutMs: number;
}

function defaultReportStatus(
  appId: string,
  body: { status: string; installedVersionCode?: number; errorMessage?: string }
): Promise<void> {
  // Lazy require to avoid a module cycle with the MDM agent.
  const mod: typeof MdmAgentClient = require('../mdm/agentClient');
  return mod.windowsMdmAgent.reportInstallStatus(appId, body);
}

const defaultDeps: InstallerDeps = {
  native: {
    downloadFile: (url, fileName) => PackageInstallModule.downloadFile(url, fileName),
    installPackage: (path) => PackageInstallModule.installPackage(path),
    removePackage: (name) => PackageInstallModule.removePackage(name),
    getSelfPackageName: () => PackageInstallModule.getSelfPackageName(),
    deleteFile: (path) => KioskModule.deleteFile(path),
  },
  reportStatus: defaultReportStatus,
  timeoutMs: 110_000,
};

type Params = Record<string, unknown>;

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function installMsix(
  params: Params,
  deps: InstallerDeps = defaultDeps
): Promise<Record<string, unknown>> {
  const packageName = String(params.packageName ?? '');
  const appId = String(params.appId ?? '');
  const base = { command: 'installApk', packageName };

  const fail = (status: 'failed' | 'timeout', error: string) => ({
    ...base,
    executed: false,
    success: false,
    status,
    error,
  });

  const downloadUrl = String(params.downloadUrl ?? '');
  if (!downloadUrl.trim()) {
    return fail('failed', 'downloadUrl is required');
  }

  const fileName = String(params.fileName ?? '');
  const lower = fileName.toLowerCase();
  if (!lower.endsWith('.msix') && !lower.endsWith('.msixbundle')) {
    return fail('failed', 'Only .msix and .msixbundle packages can be installed on Windows');
  }

  const selfName = await deps.native.getSelfPackageName().catch(() => '');
  if (packageName && packageName === selfName) {
    return fail('failed', 'Kiosk self-update is not supported on Windows');
  }

  const report = (status: string, extra: { installedVersionCode?: number; errorMessage?: string } = {}) => {
    if (!appId) return;
    deps
      .reportStatus(appId, { status, ...extra })
      .catch((e) => console.warn('[MSIX] reportStatus failed:', e));
  };

  const run = async (): Promise<Record<string, unknown>> => {
    let path = '';
    try {
      report('downloading');
      const download = JSON.parse(await deps.native.downloadFile(downloadUrl, fileName)) as {
        path: string;
        sha256?: string;
      };
      path = download.path;

      const expectedSha = String(params.sha256 ?? '');
      if (
        expectedSha.trim() &&
        String(download.sha256 ?? '').toLowerCase() !== expectedSha.toLowerCase()
      ) {
        // The finally block deletes the downloaded file.
        const error = 'SHA-256 checksum mismatch';

        report('failed', { errorMessage: error });
        return fail('failed', error);
      }

      report('installing');
      const install = JSON.parse(await deps.native.installPackage(path)) as {
        success: boolean;
        error?: string;
      };
      if (install.success) {
        report('installed', { installedVersionCode: Number(params.versionCode) || undefined });
        return { ...base, executed: true, success: true, status: 'installed' };
      }
      const error = install.error ?? 'Install failed';
      report('failed', { errorMessage: error });
      return fail('failed', error);
    } catch (e) {
      const error = errorMessage(e);
      report('failed', { errorMessage: error });
      return fail('failed', error);
    } finally {
      if (path) {
        await deps.native.deleteFile(path).catch(() => undefined);
      }
    }
  };

  const timeout = new Promise<Record<string, unknown>>((resolve) => {
    setTimeout(() => resolve(fail('timeout', 'Install timed out')), deps.timeoutMs);
  });

  return Promise.race([run(), timeout]);
}

export async function uninstallMsix(
  params: Params,
  deps: InstallerDeps = defaultDeps
): Promise<Record<string, unknown>> {
  const packageName = String(params.packageName ?? '');
  const appId = String(params.appId ?? '');
  const base = { command: 'uninstallApk', packageName };

  if (!packageName.trim()) {
    return { ...base, executed: false, success: false, status: 'failed', error: 'packageName is required' };
  }

  const report = (status: string, errorMessage?: string) => {
    if (!appId) return;
    deps
      .reportStatus(appId, errorMessage ? { status, errorMessage } : { status })
      .catch((e) => console.warn('[MSIX] reportStatus failed:', e));
  };

  let result: { status: string; error?: string };
  try {
    result = JSON.parse(await deps.native.removePackage(packageName));
  } catch (e) {
    const error = errorMessage(e);
    report('failed', error);
    return { ...base, executed: false, success: false, status: 'failed', error };
  }

  if (result.status === 'uninstalled') {
    report('uninstalled');
    return { ...base, executed: true, success: true, status: 'uninstalled' };
  }
  if (result.status === 'not_installed') {
    report('uninstalled');
    return {
      ...base,
      executed: true,
      success: true,
      status: 'uninstalled',
      message: 'Package was not installed',
    };
  }
  const error = result.error ?? 'Uninstall failed';
  report('failed', error);
  return { ...base, executed: false, success: false, status: 'failed', error };
}
