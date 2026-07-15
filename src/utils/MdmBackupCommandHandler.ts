/**
 * Handles MDM remote backup/restore commands from the agent WebSocket.
 */

import { DeviceEventEmitter, NativeModules, Platform } from 'react-native';
import { buildBackupJson, importBackupFromContent } from './BackupService';
import { mdmAgent } from './MdmAgentModule';

const { MdmAgentModule } = NativeModules;

let subscription: ReturnType<typeof DeviceEventEmitter.addListener> | null = null;

function resolveCommand(
  requestId: string,
  success: boolean,
  data?: Record<string, unknown> | null,
  error?: string | null,
) {
  if (!MdmAgentModule?.resolveMdmConfigCommand) return;
  const dataJson = data ? JSON.stringify(data) : null;
  MdmAgentModule.resolveMdmConfigCommand(requestId, success, dataJson, error ?? null).catch(() => {
    // Native bridge may already be torn down.
  });
}

export function initMdmBackupCommandHandler(): void {
  if (Platform.OS !== 'android' || subscription) return;

  subscription = DeviceEventEmitter.addListener(
    'onMdmConfigCommand',
    async (event: { requestId?: string; action?: string; params?: string }) => {
      const requestId = event?.requestId;
      if (!requestId) return;

      let params: { label?: string; backupId?: string } = {};
      try {
        if (event.params) {
          params = JSON.parse(event.params);
        }
      } catch {
        resolveCommand(requestId, false, null, 'Invalid command params');
        return;
      }

      try {
        if (event.action === 'backup') {
          const built = await buildBackupJson();
          if (!built.success || !built.json) {
            resolveCommand(requestId, false, null, built.error || 'Failed to build backup');
            return;
          }

          const uploaded = await mdmAgent.uploadConfigBackup(built.json, params.label ?? null);
          resolveCommand(requestId, true, { backupId: uploaded.id });
          return;
        }

        if (event.action === 'restore') {
          const backupId = params.backupId;
          if (!backupId) {
            resolveCommand(requestId, false, null, 'backupId is required');
            return;
          }

          const contentJson = await mdmAgent.fetchConfigBackupContent(backupId);
          const result = await importBackupFromContent(contentJson);
          if (!result.success) {
            resolveCommand(requestId, false, null, result.error || 'Restore failed');
            return;
          }

          resolveCommand(requestId, true, {
            warning: result.warning ?? null,
            backupId,
          });
          return;
        }

        resolveCommand(requestId, false, null, `Unknown action: ${event.action}`);
      } catch (error: any) {
        resolveCommand(requestId, false, null, error?.message || String(error));
      }
    },
  );
}

export function destroyMdmBackupCommandHandler(): void {
  subscription?.remove();
  subscription = null;
}
