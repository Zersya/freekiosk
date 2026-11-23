/**
 * In-memory app status store for the Windows REST API.
 * HttpServerModule.updateStatus() feeds the app-level fields here;
 * buildStatusTree merges them into the /api/status tree.
 */

let appStatus: Record<string, unknown> = {};

export function setAppStatus(status: Record<string, unknown>): void {
  appStatus = status ?? {};
}

export function getAppStatus(): Record<string, unknown> {
  return appStatus;
}
