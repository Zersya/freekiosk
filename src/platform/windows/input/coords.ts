/**
 * Coordinate resolution for remote-control commands.
 * All captures are scaled so the longest side is <= CAPTURE_MAX_DIMENSION;
 * tap/swipe px are expressed in that frame space and converted to
 * normalized 0..1 coordinates for the native injector.
 */

export const CAPTURE_MAX_DIMENSION = 1080;

export interface ResolvedPoint {
  xn: number;
  yn: number;
  x: number;
  y: number;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function finiteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function resolvePoint(
  p: Record<string, unknown>,
  keys: { x: string; y: string; xPct: string; yPct: string },
  frame: { width: number; height: number }
): ResolvedPoint | null {
  const xPct = p[keys.xPct];
  const yPct = p[keys.yPct];
  if (finiteNumber(xPct) && finiteNumber(yPct)) {
    const xn = clamp01(xPct);
    const yn = clamp01(yPct);
    return { xn, yn, x: Math.round(xn * frame.width), y: Math.round(yn * frame.height) };
  }

  const x = p[keys.x];
  const y = p[keys.y];
  if (
    finiteNumber(x) &&
    finiteNumber(y) &&
    x >= 0 &&
    y >= 0 &&
    frame.width > 0 &&
    frame.height > 0
  ) {
    const xn = clamp01(x / frame.width);
    const yn = clamp01(y / frame.height);
    return { xn, yn, x: Math.round(xn * frame.width), y: Math.round(yn * frame.height) };
  }

  return null;
}
