/**
 * Tests for capture-frame coordinate resolution.
 */

import { resolvePoint, CAPTURE_MAX_DIMENSION } from '../../src/platform/windows/input/coords';

const FRAME = { width: 1080, height: 608 };

describe('resolvePoint', () => {
  it('resolves px coordinates in frame space', () => {
    const p = resolvePoint({ x: 540, y: 304 }, { x: 'x', y: 'y', xPct: 'xPct', yPct: 'yPct' }, FRAME);
    expect(p).not.toBeNull();
    expect(p!.xn).toBeCloseTo(0.5);
    expect(p!.yn).toBeCloseTo(0.5);
    expect(p!.x).toBe(540);
    expect(p!.y).toBe(304);
  });

  it('prefers the *Pct pair over px', () => {
    const p = resolvePoint(
      { x: 5, y: 5, xPct: 0.25, yPct: 0.75 },
      { x: 'x', y: 'y', xPct: 'xPct', yPct: 'yPct' },
      FRAME
    );
    expect(p!.xn).toBeCloseTo(0.25);
    expect(p!.yn).toBeCloseTo(0.75);
  });

  it('returns null when no usable pair is present', () => {
    expect(
      resolvePoint({}, { x: 'x', y: 'y', xPct: 'xPct', yPct: 'yPct' }, FRAME)
    ).toBeNull();
    expect(
      resolvePoint({ x: 10 }, { x: 'x', y: 'y', xPct: 'xPct', yPct: 'yPct' }, FRAME)
    ).toBeNull();
  });

  it('clamps out-of-range values to 0..1', () => {
    const p = resolvePoint(
      { x: 99999, y: -1, xPct: 1.5, yPct: -0.5 },
      { x: 'x', y: 'y', xPct: 'xPct', yPct: 'yPct' },
      FRAME
    );
    expect(p!.xn).toBe(1);
    expect(p!.yn).toBe(0);
  });

  it('exports the capture max dimension', () => {
    expect(CAPTURE_MAX_DIMENSION).toBe(1080);
  });
});
