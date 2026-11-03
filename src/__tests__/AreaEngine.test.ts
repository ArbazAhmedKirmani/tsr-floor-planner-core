import { describe, expect, it } from 'vitest';
import { AreaEngine } from '../geometry/AreaEngine.js';

describe('AreaEngine pure formulas and helpers', () => {
  it('computes shoelace area for a standard 4m x 5m rectangular room (20 m²)', () => {
    const polygon = [
      { x: 0, y: 0 },
      { x: 5000, y: 0 },
      { x: 5000, y: 4000 },
      { x: 0, y: 4000 },
    ];
    const signedAreaMm2 = AreaEngine.computeSignedPolygonAreaMm2(polygon);
    expect(signedAreaMm2).toBe(20_000_000);

    const areaSqm = AreaEngine.computePolygonAreaSqm(polygon);
    expect(areaSqm).toBe(20);

    const perimeterM = AreaEngine.computePolygonPerimeterMeters(polygon);
    expect(perimeterM).toBe(18);
  });

  it('determines point-in-polygon containment accurately', () => {
    const polygon = [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 1000 },
      { x: 0, y: 1000 },
    ];
    expect(AreaEngine.isPointInsidePolygon({ x: 500, y: 500 }, polygon)).toBe(true);
    expect(AreaEngine.isPointInsidePolygon({ x: 1500, y: 500 }, polygon)).toBe(false);
  });

  it('calculates polygon centroid correctly', () => {
    const polygon = [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 1000 },
      { x: 0, y: 1000 },
    ];
    const centroid = AreaEngine.computePolygonCentroid(polygon);
    expect(centroid.x).toBe(500);
    expect(centroid.y).toBe(500);
  });

  it('computes 2-point proportional calibration scale factor accurately', () => {
    // Current scale is 10 mm/px. Measured distance is 2000 mm. Target is 4000 mm.
    // Factor is 4000 / 2000 = 2x => new scale is 20 mm/px.
    const newScale = AreaEngine.computeCalibrationScale({
      currentScaleMmPerPx: 10,
      measuredSpanMm: 2000,
      targetRealWorldMm: 4000,
    });
    expect(newScale).toBe(20);
  });

  it('computes building bounding box and camera span radius', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10000, y: 0 },
      { x: 10000, y: 6000 },
      { x: 0, y: 6000 },
    ];
    const bbox = AreaEngine.computeBuildingBoundingBox(points);
    expect(bbox.minX).toBe(0);
    expect(bbox.maxX).toBe(10000);
    expect(bbox.centerX).toBe(5000);
    expect(bbox.centerY).toBe(3000);
    expect(bbox.spanMeters).toBeCloseTo(Math.hypot(10, 6), 2);
  });
});
