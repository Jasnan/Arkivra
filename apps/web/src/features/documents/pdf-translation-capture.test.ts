import { describe, expect, it } from 'vitest';
import {
  createNormalizedRect,
  getCanvasCropRect,
  getNormalizedPointFromClient,
  getScaledCaptureSize,
  stripPngDataUrl,
} from './pdf-translation-capture';

describe('pdf translation capture helpers', () => {
  it('normalizes pointer coordinates within page bounds', () => {
    expect(getNormalizedPointFromClient({
      clientX: 150,
      clientY: 260,
      bounds: { left: 100, top: 200, width: 200, height: 400 },
    })).toEqual({ x: 0.25, y: 0.15 });

    expect(getNormalizedPointFromClient({
      clientX: 20,
      clientY: 700,
      bounds: { left: 100, top: 200, width: 200, height: 400 },
    })).toEqual({ x: 0, y: 1 });
  });

  it('creates normalized rectangles independent of drag direction', () => {
    expect(createNormalizedRect({ x: 0.8, y: 0.7 }, { x: 0.2, y: 0.1 })).toEqual({
      x: 0.2,
      y: 0.1,
      width: 0.6000000000000001,
      height: 0.6,
    });
  });

  it('converts normalized crop rectangles to canvas pixels', () => {
    expect(getCanvasCropRect({
      canvas: { width: 1000, height: 2000 },
      rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
    })).toEqual({
      sx: 100,
      sy: 400,
      sw: 300,
      sh: 800,
    });
  });

  it('downscales long edges while preserving aspect ratio', () => {
    expect(getScaledCaptureSize({ width: 4000, height: 2000, maxLongEdge: 2000 })).toEqual({
      width: 2000,
      height: 1000,
    });
  });

  it('strips png data url prefixes', () => {
    expect(stripPngDataUrl('data:image/png;base64,cG5n')).toBe('cG5n');
  });
});
