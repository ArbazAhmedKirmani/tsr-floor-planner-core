import { describe, expect, it } from 'vitest';
import { PlanarGraph } from '../geometry/PlanarGraph.js';
import { SnapSolver } from '../geometry/SnapSolver.js';
import { DiscrepancyEngine } from '../geometry/DiscrepancyEngine.js';
import { Vertex, WallEdge } from '../types/domain.js';

describe('SnapSolver & PlanarGraph & DiscrepancyEngine in @tsr/floor-planner-core', () => {
  const vertices: Vertex[] = [
    { id: 'v1', x: 0, y: 0, updatedAt: '' },
    { id: 'v2', x: 4000, y: 0, updatedAt: '' },
    { id: 'v3', x: 4000, y: 3000, updatedAt: '' },
    { id: 'v4', x: 0, y: 3000, updatedAt: '' },
  ];

  const walls: WallEdge[] = [
    {
      id: 'w1',
      floorLevelId: 'fl-1',
      startVertexId: 'v1',
      endVertexId: 'v2',
      thicknessMm: 300,
      heightMm: 2400,
      wallType: 'EXTERNAL_CAVITY',
      isExternalPerimeter: true,
      openings: [],
      updatedAt: '',
    },
    {
      id: 'w2',
      floorLevelId: 'fl-1',
      startVertexId: 'v2',
      endVertexId: 'v3',
      thicknessMm: 300,
      heightMm: 2400,
      wallType: 'EXTERNAL_CAVITY',
      isExternalPerimeter: true,
      openings: [],
      updatedAt: '',
    },
    {
      id: 'w3',
      floorLevelId: 'fl-1',
      startVertexId: 'v3',
      endVertexId: 'v4',
      thicknessMm: 300,
      heightMm: 2400,
      wallType: 'EXTERNAL_CAVITY',
      isExternalPerimeter: true,
      openings: [],
      updatedAt: '',
    },
    {
      id: 'w4',
      floorLevelId: 'fl-1',
      startVertexId: 'v4',
      endVertexId: 'v1',
      thicknessMm: 300,
      heightMm: 2400,
      wallType: 'EXTERNAL_CAVITY',
      isExternalPerimeter: true,
      openings: [],
      updatedAt: '',
    },
  ];

  it('snaps accurately to existing vertex within tolerance', () => {
    const snap = SnapSolver.solveSnap({
      rawPoint: { x: 40, y: -20 },
      vertices,
      walls,
    });
    expect(snap.snapKind).toBe('VERTEX');
    expect(snap.snappedVertexId).toBe('v1');
    expect(snap.snappedPoint).toEqual({ x: 0, y: 0 });
  });

  it('projects perpendicularly onto wall edge (T-junction target)', () => {
    const snap = SnapSolver.solveSnap({
      rawPoint: { x: 2000, y: 40 },
      vertices,
      walls,
    });
    expect(snap.snapKind).toBe('EDGE_PROJECTION');
    expect(snap.snappedWallEdgeId).toBe('w1');
    expect(snap.snappedPoint.x).toBe(2000);
    expect(snap.snappedPoint.y).toBe(0);
  });

  it('locks polar angle to 90 degrees when drawing from anchor', () => {
    const snap = SnapSolver.solveSnap({
      rawPoint: { x: 2, y: 1500 },
      vertices: [],
      walls: [],
      anchorPoint: { x: 0, y: 0 },
    });
    expect(snap.snapKind).toBe('ANGLE_CONSTRAINT');
    expect(snap.snappedAngleDeg).toBe(90);
    expect(snap.snappedPoint.x).toBe(0);
    expect(snap.snappedPoint.y).toBe(1500);
  });

  it('extracts minimal interior room cycles via DCEL half-edges', () => {
    const faces = PlanarGraph.extractMinimalFaces(vertices, walls);
    expect(faces.length).toBe(1);
    expect(faces[0]!.vertexIds.length).toBe(4);
    expect(faces[0]!.signedAreaMm2).toBe(12_000_000); // 4m * 3m = 12m²
  });

  it('validates topology integrity and detects open perimeter endpoints', () => {
    const openWalls = walls.slice(0, 3); // w4 removed, leaving v1 and v4 dangling
    const result = DiscrepancyEngine.validateTopology(vertices, openWalls);
    expect(result.hasWarnings).toBe(true);
    expect(result.discrepancies.some((d) => d.code === 'OPEN_PERIMETER_VERTEX')).toBe(true);
  });

  it('detects duplicate collinear segments', () => {
    const dupWalls = [
      ...walls,
      {
        ...walls[0]!,
        id: 'w1-dup',
      },
    ];
    const result = DiscrepancyEngine.validateTopology(vertices, dupWalls);
    expect(result.hasErrors).toBe(true);
    expect(result.discrepancies.some((d) => d.code === 'DUPLICATE_COLLINEAR_SEGMENT')).toBe(true);
  });
});

