import { Point2D, UUID, Vertex, WallEdge } from '../types/domain.js';

export type SnapKind = 'VERTEX' | 'EDGE_PROJECTION' | 'AXIS_ALIGNMENT' | 'ANGLE_CONSTRAINT' | 'GRID' | 'RAW';

export interface SnapConfig {
  /** Grid quantization interval in mm (default: 50mm) */
  gridStepMm: number;
  /** Magnetic snap radius for existing vertices in mm (default: 150mm) */
  vertexSnapRadiusMm: number;
  /** Magnetic snap radius for wall segments in mm (default: 120mm) */
  edgeSnapRadiusMm: number;
  /** Angular tolerance in degrees for 0°/45°/90° locking (default: 4.0°) */
  angleSnapToleranceDeg: number;
  /** Enable orthogonal / 45-degree angle snapping relative to anchor vertex */
  enableAngleConstraint: boolean;
  /** Enable grid snapping fallback */
  enableGridSnap: boolean;
}

export interface SnapResult {
  snappedPoint: Point2D;
  snapKind: SnapKind;
  snappedVertexId?: UUID;
  snappedWallEdgeId?: UUID;
  /** Parameter t in [0, 1] along snappedWallEdgeId when snapKind === 'EDGE_PROJECTION' */
  edgeParameterT?: number;
  /** Constrained angle in degrees [-180, 180] from anchorPoint if applicable */
  snappedAngleDeg?: number;
  /** Distance in mm from anchorPoint to snappedPoint */
  distanceFromAnchorMm?: number;
  guideLine?: {
    from: Point2D;
    to: Point2D;
  };
}

export const DEFAULT_SNAP_CONFIG: SnapConfig = {
  gridStepMm: 50,
  vertexSnapRadiusMm: 150,
  edgeSnapRadiusMm: 120,
  angleSnapToleranceDeg: 4.0,
  enableAngleConstraint: true,
  enableGridSnap: true,
};

/**
 * High-precision CAD Snapping Solver for 2D Wall & Feature placement.
 * Priority Order:
 * 1. Existing Vertex magnetic snap (`VERTEX`)
 * 2. Orthogonal X/Y alignment with existing vertices (`AXIS_ALIGNMENT`)
 * 3. Wall Edge perpendicular projection (`EDGE_PROJECTION`)
 * 4. 0° / 45° / 90° / 135° / 180° polar angle constraint relative to active drawing anchor (`ANGLE_CONSTRAINT`)
 * 5. Metric Grid quantization (`GRID`)
 */
export class SnapSolver {
  private config: SnapConfig;

  constructor(config: Partial<SnapConfig> = {}) {
    this.config = { ...DEFAULT_SNAP_CONFIG, ...config };
  }

  public updateConfig(partial: Partial<SnapConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  public getConfig(): SnapConfig {
    return { ...this.config };
  }

  /**
   * Resolves a raw cursor point (in mm) to the highest-priority geometric snap target.
   */
  public solve(
    rawPoint: Point2D,
    vertices: readonly Vertex[],
    walls: readonly WallEdge[],
    anchorPoint?: Point2D,
    excludeVertexIds: ReadonlySet<UUID> = new Set(),
  ): SnapResult {
    // 1. Vertex Snap (Highest Priority)
    let closestVertex: Vertex | undefined;
    let minVertexDist = this.config.vertexSnapRadiusMm;

    for (const v of vertices) {
      if (excludeVertexIds.has(v.id)) continue;
      const d = Math.hypot(rawPoint.x - v.x, rawPoint.y - v.y);
      if (d <= minVertexDist) {
        minVertexDist = d;
        closestVertex = v;
      }
    }

    if (closestVertex) {
      const snappedPoint = { x: closestVertex.x, y: closestVertex.y };
      return {
        snappedPoint,
        snapKind: 'VERTEX',
        snappedVertexId: closestVertex.id,
        ...this.computePolarMetrics(anchorPoint, snappedPoint),
      };
    }

    // Apply optional polar angle constraint candidate if drawing from an anchor point
    let workingPoint: Point2D = { ...rawPoint };
    let activeAngleSnapDeg: number | undefined;

    if (anchorPoint && this.config.enableAngleConstraint) {
      const angleConstraint = this.applyAngleConstraint(anchorPoint, rawPoint);
      if (angleConstraint.didSnap) {
        workingPoint = angleConstraint.point;
        activeAngleSnapDeg = angleConstraint.snappedAngleDeg;
      }
    }

    // 2. Wall Edge Projection Snap (T-junction / Split-on-Edge target)
    const vertexMap = new Map<UUID, Vertex>(vertices.map((v) => [v.id, v]));
    let closestEdgeResult:
      | {
          wall: WallEdge;
          projectedPoint: Point2D;
          t: number;
          distance: number;
        }
      | undefined;
    let minEdgeDist = this.config.edgeSnapRadiusMm;

    for (const wall of walls) {
      const vStart = vertexMap.get(wall.startVertexId);
      const vEnd = vertexMap.get(wall.endVertexId);
      if (!vStart || !vEnd) continue;

      const proj = SnapSolver.projectPointOntoSegment(workingPoint, vStart, vEnd);
      // Avoid snapping to the very ends as EDGE_PROJECTION (handled by VERTEX snap)
      if (proj.t > 0.02 && proj.t < 0.98 && proj.distance <= minEdgeDist) {
        minEdgeDist = proj.distance;
        closestEdgeResult = {
          wall,
          projectedPoint: proj.point,
          t: proj.t,
          distance: proj.distance,
        };
      }
    }

    if (closestEdgeResult) {
      return {
        snappedPoint: closestEdgeResult.projectedPoint,
        snapKind: 'EDGE_PROJECTION',
        snappedWallEdgeId: closestEdgeResult.wall.id,
        edgeParameterT: closestEdgeResult.t,
        ...this.computePolarMetrics(anchorPoint, closestEdgeResult.projectedPoint),
      };
    }

    // 3. Orthogonal Axis Alignment with existing vertices
    let alignedX: { x: number; refVertex: Vertex } | undefined;
    let alignedY: { y: number; refVertex: Vertex } | undefined;
    const axisTolerance = this.config.vertexSnapRadiusMm * 0.6;

    for (const v of vertices) {
      if (excludeVertexIds.has(v.id)) continue;
      if (Math.abs(workingPoint.x - v.x) <= axisTolerance) {
        alignedX = { x: v.x, refVertex: v };
      }
      if (Math.abs(workingPoint.y - v.y) <= axisTolerance) {
        alignedY = { y: v.y, refVertex: v };
      }
    }

    if (alignedX || alignedY) {
      const snappedPoint: Point2D = {
        x: alignedX ? alignedX.x : this.quantizeToGrid(workingPoint.x),
        y: alignedY ? alignedY.y : this.quantizeToGrid(workingPoint.y),
      };
      const refV = alignedX?.refVertex ?? alignedY?.refVertex;
      return {
        snappedPoint,
        snapKind: 'AXIS_ALIGNMENT',
        guideLine: refV ? { from: { x: refV.x, y: refV.y }, to: snappedPoint } : undefined,
        ...this.computePolarMetrics(anchorPoint, snappedPoint),
      };
    }

    // 4. Angle Constraint Snap (0° / 45° / 90° / 135° / 180°)
    if (anchorPoint && activeAngleSnapDeg !== undefined) {
      // Quantize radial distance to grid step for crisp metric dimensions
      const rawDist = Math.hypot(workingPoint.x - anchorPoint.x, workingPoint.y - anchorPoint.y);
      const quantizedDist = this.config.enableGridSnap
        ? Math.max(this.config.gridStepMm, Math.round(rawDist / this.config.gridStepMm) * this.config.gridStepMm)
        : rawDist;
      const rad = (activeAngleSnapDeg * Math.PI) / 180;
      const snappedPoint: Point2D = {
        x: Math.round((anchorPoint.x + Math.cos(rad) * quantizedDist) * 100) / 100,
        y: Math.round((anchorPoint.y + Math.sin(rad) * quantizedDist) * 100) / 100,
      };
      return {
        snappedPoint,
        snapKind: 'ANGLE_CONSTRAINT',
        snappedAngleDeg: activeAngleSnapDeg,
        distanceFromAnchorMm: quantizedDist,
        guideLine: { from: anchorPoint, to: snappedPoint },
      };
    }

    // 5. Grid Snap Fallback
    if (this.config.enableGridSnap) {
      const snappedPoint: Point2D = {
        x: this.quantizeToGrid(rawPoint.x),
        y: this.quantizeToGrid(rawPoint.y),
      };
      return {
        snappedPoint,
        snapKind: 'GRID',
        ...this.computePolarMetrics(anchorPoint, snappedPoint),
      };
    }

    return {
      snappedPoint: { x: rawPoint.x, y: rawPoint.y },
      snapKind: 'RAW',
      ...this.computePolarMetrics(anchorPoint, rawPoint),
    };
  }

  /**
   * Computes a point at an exact distance (e.g., from a BLE laser distance meter)
   * along the current vector from `anchorPoint` to `cursorPoint` (with angle snapping).
   */
  public applyLaserDistanceFromAnchor(anchorPoint: Point2D, cursorPoint: Point2D, laserDistanceMm: number): Point2D {
    const angleRes = this.applyAngleConstraint(anchorPoint, cursorPoint);
    const dx = angleRes.point.x - anchorPoint.x;
    const dy = angleRes.point.y - anchorPoint.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) {
      return { x: anchorPoint.x + laserDistanceMm, y: anchorPoint.y };
    }
    return {
      x: Math.round((anchorPoint.x + (dx / len) * laserDistanceMm) * 100) / 100,
      y: Math.round((anchorPoint.y + (dy / len) * laserDistanceMm) * 100) / 100,
    };
  }

  private quantizeToGrid(valueMm: number): number {
    const step = this.config.gridStepMm;
    return Math.round(valueMm / step) * step;
  }

  /**
   * Locks vector (anchor -> target) to nearest multiple of 45° (0°, ±45°, ±90°, ±135°, 180°)
   * when within `angleSnapToleranceDeg`.
   */
  private applyAngleConstraint(
    anchor: Point2D,
    target: Point2D,
  ): { point: Point2D; didSnap: boolean; snappedAngleDeg?: number } {
    const dx = target.x - anchor.x;
    const dy = target.y - anchor.y;
    const r = Math.hypot(dx, dy);
    if (r < 1e-3) {
      return { point: target, didSnap: false };
    }

    const rawAngleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    const nearest45Deg = Math.round(rawAngleDeg / 45) * 45;
    const diffDeg = Math.abs(rawAngleDeg - nearest45Deg);

    if (diffDeg <= this.config.angleSnapToleranceDeg) {
      const normalizedDeg = nearest45Deg === -180 ? 180 : nearest45Deg;
      const rad = (normalizedDeg * Math.PI) / 180;
      return {
        point: {
          x: anchor.x + Math.cos(rad) * r,
          y: anchor.y + Math.sin(rad) * r,
        },
        didSnap: true,
        snappedAngleDeg: normalizedDeg,
      };
    }

    return { point: target, didSnap: false };
  }

  private computePolarMetrics(
    anchorPoint: Point2D | undefined,
    targetPoint: Point2D,
  ): { snappedAngleDeg?: number; distanceFromAnchorMm?: number } {
    if (!anchorPoint) return {};
    const dx = targetPoint.x - anchorPoint.x;
    const dy = targetPoint.y - anchorPoint.y;
    const dist = Math.round(Math.hypot(dx, dy) * 10) / 10;
    const angle = Math.round(((Math.atan2(dy, dx) * 180) / Math.PI) * 10) / 10;
    return {
      snappedAngleDeg: angle,
      distanceFromAnchorMm: dist,
    };
  }

  public static projectPointOntoSegment(
    p: Point2D,
    a: Point2D,
    b: Point2D,
  ): { point: Point2D; t: number; distance: number } {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const lenSq = abx * abx + aby * aby;
    if (lenSq < 1e-9) {
      return {
        point: { x: a.x, y: a.y },
        t: 0,
        distance: Math.hypot(p.x - a.x, p.y - a.y),
      };
    }

    const apx = p.x - a.x;
    const apy = p.y - a.y;
    const tRaw = (apx * abx + apy * aby) / lenSq;
    const t = Math.max(0, Math.min(1, tRaw));
    const projX = a.x + t * abx;
    const projY = a.y + t * aby;

    return {
      point: {
        x: Math.round(projX * 100) / 100,
        y: Math.round(projY * 100) / 100,
      },
      t,
      distance: Math.hypot(p.x - projX, p.y - projY),
    };
  }
}

