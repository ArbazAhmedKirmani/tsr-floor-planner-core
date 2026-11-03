import {
  FloorAreaSummary,
  InternalFeature,
  Point2D,
  RoomSpace,
  UUID,
  Vertex,
  WallEdge,
} from '../types/domain.js';

/**
 * Deterministic RICS / BCIS / RdSAP (EPC) Area Calculation Engine.
 * Implements:
 * - Gauss's Shoelace Theorem for arbitrary simple polygons
 * - Mitered Half-Plane Inward / Outward Polygon Offsetting for per-wall thicknesses
 * - GEA (Gross External Area - outer perimeter face)
 * - GIA (Gross Internal Area - inner face of external walls, inclusive of internal partitions)
 * - BCIS (Building Cost Information Service) Reinstatement Floor Area filtering
 * - EPC / RdSAP Total Floor Area filtering (excluding unheated/thermally separated conservatories, garages, porches)
 */
export class AreaEngine {
  private static readonly MM2_PER_SQM = 1_000_000;

  /**
   * Computes signed area in square millimeters (mm²) via the Shoelace formula:
   * A = 0.5 * sum_{i=0}^{n-1} (x_i * y_{i+1} - x_{i+1} * y_i)
   * Positive when vertices are ordered counter-clockwise (CCW) in standard Cartesian coordinates.
   */
  public static computeSignedPolygonAreaMm2(polygon: readonly Point2D[]): number {
    const n = polygon.length;
    if (n < 3) return 0;

    let sum = 0;
    for (let i = 0; i < n; i++) {
      const curr = polygon[i]!;
      const next = polygon[(i + 1) % n]!;
      sum += curr.x * next.y - next.x * curr.y;
    }
    return 0.5 * sum;
  }

  /**
   * Computes unsigned area in square meters (m²) rounded to 2 decimal places.
   */
  public static computePolygonAreaSqm(polygon: readonly Point2D[]): number {
    const areaMm2 = Math.abs(AreaEngine.computeSignedPolygonAreaMm2(polygon));
    return AreaEngine.mm2ToSqm(areaMm2);
  }

  public static mm2ToSqm(areaMm2: number): number {
    return Math.round((areaMm2 / AreaEngine.MM2_PER_SQM) * 100) / 100;
  }

  public static computePolygonPerimeterMeters(polygon: readonly Point2D[]): number {
    const n = polygon.length;
    if (n < 2) return 0;
    let totalMm = 0;
    for (let i = 0; i < n; i++) {
      const a = polygon[i]!;
      const b = polygon[(i + 1) % n]!;
      totalMm += Math.hypot(b.x - a.x, b.y - a.y);
    }
    return Math.round((totalMm / 1000) * 100) / 100;
  }

  /**
   * Offsets a closed polygon inward (toward its interior) by `0.5 * wallThickness[i]`
   * along each edge `i = (v_i -> v_{i+1})`, computing mitered corner intersections.
   * Used to derive the true inner-face polygon (GIA) from wall centerlines.
   */
  public static offsetPolygonInwardByWallThickness(
    centerlinePolygon: readonly Point2D[],
    edgeThicknessesMm: readonly number[],
  ): Point2D[] {
    return AreaEngine.offsetPolygonByHalfThickness(centerlinePolygon, edgeThicknessesMm, 'INWARD');
  }

  /**
   * Offsets a closed polygon outward (away from its interior) by `0.5 * wallThickness[i]`
   * along each edge `i = (v_i -> v_{i+1})`, computing mitered corner intersections.
   * Used to derive the true outer-face building footprint (GEA) from external wall centerlines.
   */
  public static offsetPolygonOutwardByWallThickness(
    centerlinePolygon: readonly Point2D[],
    edgeThicknessesMm: readonly number[],
  ): Point2D[] {
    return AreaEngine.offsetPolygonByHalfThickness(centerlinePolygon, edgeThicknessesMm, 'OUTWARD');
  }

  private static offsetPolygonByHalfThickness(
    polygon: readonly Point2D[],
    edgeThicknessesMm: readonly number[],
    direction: 'INWARD' | 'OUTWARD',
  ): Point2D[] {
    const n = polygon.length;
    if (n < 3) return [...polygon];

    const signedArea = AreaEngine.computeSignedPolygonAreaMm2(polygon);
    // For a CCW polygon (signedArea > 0), the inward unit normal of edge (dx, dy) is (-dy/L, dx/L).
    // For a CW polygon (signedArea < 0), the inward unit normal is (dy/L, -dx/L).
    const orientationSign = signedArea >= 0 ? 1 : -1;
    const offsetSign = direction === 'INWARD' ? orientationSign : -orientationSign;

    interface OffsetLine {
      p: Point2D;
      dir: Point2D;
      normal: Point2D;
      halfThickness: number;
    }

    const offsetLines: OffsetLine[] = [];

    for (let i = 0; i < n; i++) {
      const a = polygon[i]!;
      const b = polygon[(i + 1) % n]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      const thickness = edgeThicknessesMm[i] ?? edgeThicknessesMm[0] ?? 200;
      const halfT = thickness * 0.5;

      if (len < 1e-6) {
        offsetLines.push({
          p: { ...a },
          dir: { x: 1, y: 0 },
          normal: { x: 0, y: 1 },
          halfThickness: halfT,
        });
        continue;
      }

      const ux = dx / len;
      const uy = dy / len;
      const nx = offsetSign * -uy;
      const ny = offsetSign * ux;

      offsetLines.push({
        p: {
          x: a.x + nx * halfT,
          y: a.y + ny * halfT,
        },
        dir: { x: ux, y: uy },
        normal: { x: nx, y: ny },
        halfThickness: halfT,
      });
    }

    const resultVertices: Point2D[] = [];
    const miterRatioLimit = 4.0;

    for (let i = 0; i < n; i++) {
      const prevLine = offsetLines[(i - 1 + n) % n]!;
      const currLine = offsetLines[i]!;
      const origVertex = polygon[i]!;

      const det = prevLine.dir.x * currLine.dir.y - prevLine.dir.y * currLine.dir.x;

      if (Math.abs(det) < 1e-5) {
        // Parallel or anti-parallel consecutive edges: shift original vertex along average normal
        const avgNx = 0.5 * (prevLine.normal.x + currLine.normal.x);
        const avgNy = 0.5 * (prevLine.normal.y + currLine.normal.y);
        const avgHalfT = 0.5 * (prevLine.halfThickness + currLine.halfThickness);
        resultVertices.push({
          x: Math.round((origVertex.x + avgNx * avgHalfT) * 100) / 100,
          y: Math.round((origVertex.y + avgNy * avgHalfT) * 100) / 100,
        });
      } else {
        const diffX = currLine.p.x - prevLine.p.x;
        const diffY = currLine.p.y - prevLine.p.y;
        const t = (diffX * currLine.dir.y - diffY * currLine.dir.x) / det;

        const ix = prevLine.p.x + t * prevLine.dir.x;
        const iy = prevLine.p.y + t * prevLine.dir.y;

        const miterDist = Math.hypot(ix - origVertex.x, iy - origVertex.y);
        const maxAllowedDist = Math.max(prevLine.halfThickness, currLine.halfThickness) * miterRatioLimit;

        if (miterDist > maxAllowedDist) {
          const scale = maxAllowedDist / miterDist;
          resultVertices.push({
            x: Math.round((origVertex.x + (ix - origVertex.x) * scale) * 100) / 100,
            y: Math.round((origVertex.y + (iy - origVertex.y) * scale) * 100) / 100,
          });
        } else {
          resultVertices.push({
            x: Math.round(ix * 100) / 100,
            y: Math.round(iy * 100) / 100,
          });
        }
      }
    }

    return resultVertices;
  }

  /**
   * Evaluates whether a RoomSpace is included in BCIS Reinstatement Cost floor area.
   * BCIS rules:
   * - Respects explicit surveyor toggle (`inclusionRules.includeInBcis`)
   * - Excludes open balconies/terraces and internal voids/atria by default
   */
  public static isIncludedInBcis(room: RoomSpace): boolean {
    if (!room.inclusionRules.includeInBcis) {
      return false;
    }
    if (room.category === 'BALCONY_TERRACE' || room.category === 'VOID_ATRIUM') {
      return false;
    }
    return true;
  }

  /**
   * Evaluates whether a RoomSpace is included in EPC (RdSAP) Total Floor Area.
   * RdSAP conventions:
   * - Respects explicit surveyor toggle (`inclusionRules.includeInEpc`)
   * - Excludes garages (integral or detached), external porches, balconies, voids, and external stores
   * - Excludes conservatories that are thermally separated from the main dwelling
   */
  public static isIncludedInEpc(room: RoomSpace): boolean {
    if (!room.inclusionRules.includeInEpc) {
      return false;
    }
    const excludedCategories: ReadonlySet<RoomSpace['category']> = new Set([
      'GARAGE_INTEGRAL',
      'GARAGE_DETACHED',
      'PORCH_EXTERNAL',
      'BALCONY_TERRACE',
      'VOID_ATRIUM',
      'PLANT_EXTERNAL_STORE',
    ]);
    if (excludedCategories.has(room.category)) {
      return false;
    }
    if (room.category === 'CONSERVATORY' && room.inclusionRules.isThermallySeparated) {
      return false;
    }
    return true;
  }

  /**
   * Computes complete RICS Code of Measuring Practice (6th Ed) / IPMS Floor Area Summary
   * for a given FloorLevel:
   * - GEA (Gross External Area): Area bounded by the outer face of external perimeter walls,
   *   or sum of outer-offset room footprints + internal partition footprints.
   * - GIA (Gross Internal Area): Area bounded by the internal face of external perimeter walls
   *   (sum of net room inner areas + internal partition wall footprints, minus GIA deductions).
   * - BCIS Area & EPC Total Floor Area with per-room inclusion rules applied.
   */
  public static calculateFloorAreaSummary(params: {
    floorLevelId: UUID;
    vertices: readonly Vertex[];
    walls: readonly WallEdge[];
    rooms: readonly RoomSpace[];
    internalFeatures?: readonly InternalFeature[];
  }): FloorAreaSummary {
    const { floorLevelId, vertices, walls, rooms, internalFeatures = [] } = params;
    const vertexMap = new Map<UUID, Vertex>(vertices.map((v) => [v.id, v]));

    // 1. Compute sum of inner room polygons (Net Room Internal Area)
    let sumRoomInnerSqm = 0;
    let sumRoomCenterlineSqm = 0;
    let bcisAreaSqm = 0;
    let epcTotalFloorAreaSqm = 0;

    const roomBreakdowns: FloorAreaSummary['roomBreakdowns'] = [];

    for (const room of rooms) {
      const roomInnerSqm =
        room.innerPolygonMm.length >= 3
          ? AreaEngine.computePolygonAreaSqm(room.innerPolygonMm)
          : room.computedGiaSqm;

      const roomCenterSqm =
        room.centerlinePolygonMm.length >= 3
          ? AreaEngine.computePolygonAreaSqm(room.centerlinePolygonMm)
          : room.computedCenterlineAreaSqm;

      if (room.inclusionRules.includeInGia && room.category !== 'VOID_ATRIUM') {
        sumRoomInnerSqm += roomInnerSqm;
      }
      if (room.inclusionRules.includeInGea) {
        sumRoomCenterlineSqm += roomCenterSqm;
      }

      const incBcis = AreaEngine.isIncludedInBcis(room);
      const incEpc = AreaEngine.isIncludedInEpc(room);

      if (incBcis) {
        bcisAreaSqm += roomInnerSqm;
      }
      if (incEpc) {
        epcTotalFloorAreaSqm += roomInnerSqm;
      }

      roomBreakdowns.push({
        roomId: room.id,
        roomName: room.name,
        category: room.category,
        giaSqm: Math.round(roomInnerSqm * 100) / 100,
        includedInBcis: incBcis,
        includedInEpc: incEpc,
      });
    }

    // 2. Compute footprint of internal partition walls vs external perimeter walls
    let internalPartitionFootprintMm2 = 0;
    let externalWallHalfFootprintMm2 = 0;
    let externalPerimeterMm = 0;

    for (const wall of walls) {
      const u = vertexMap.get(wall.startVertexId);
      const v = vertexMap.get(wall.endVertexId);
      if (!u || !v) continue;

      const lengthMm = Math.hypot(v.x - u.x, v.y - u.y);
      const wallFootprintMm2 = lengthMm * wall.thicknessMm;

      if (wall.isExternalPerimeter || wall.wallType === 'EXTERNAL_CAVITY' || wall.wallType === 'EXTERNAL_SOLID') {
        externalWallHalfFootprintMm2 += wallFootprintMm2 * 0.5;
        externalPerimeterMm += lengthMm;
      } else {
        internalPartitionFootprintMm2 += wallFootprintMm2;
      }
    }

    // 3. Deduct internal features flagged with `deductFromGia` (e.g., open stairwell voids > 1m²)
    let featureDeductionMm2 = 0;
    for (const feat of internalFeatures) {
      if (feat.deductFromGia) {
        featureDeductionMm2 += feat.widthMm * feat.depthMm;
      }
    }

    const internalPartitionsSqm = AreaEngine.mm2ToSqm(internalPartitionFootprintMm2);
    const featureDeductionSqm = AreaEngine.mm2ToSqm(featureDeductionMm2);

    // RICS GIA includes internal partition thicknesses (measured to internal face of external walls)
    const giaSqm = Math.max(
      0,
      Math.round((sumRoomInnerSqm + internalPartitionsSqm - featureDeductionSqm) * 100) / 100,
    );

    // RICS GEA includes full external wall thickness outside the centerline polygon
    const externalOuterHalfSqm = AreaEngine.mm2ToSqm(externalWallHalfFootprintMm2);
    const geaSqm = Math.max(
      giaSqm,
      Math.round((sumRoomCenterlineSqm + externalOuterHalfSqm) * 100) / 100,
    );

    return {
      floorLevelId,
      geaSqm,
      giaSqm,
      bcisAreaSqm: Math.round((bcisAreaSqm + internalPartitionsSqm) * 100) / 100,
      epcTotalFloorAreaSqm: Math.round(epcTotalFloorAreaSqm * 100) / 100,
      netInternalAreaSqm: Math.round(sumRoomInnerSqm * 100) / 100,
      externalPerimeterMeters: Math.round((externalPerimeterMm / 1000) * 100) / 100,
      roomBreakdowns,
    };
  }

  /**
   * Ray-casting algorithm to test whether point pt is strictly inside or on the boundary of polygon.
   * Useful for room selection, defect pin mapping, and touch-hit tests.
   */
  public static isPointInsidePolygon(pt: Point2D, polygon: readonly Point2D[]): boolean {
    const n = polygon.length;
    if (n < 3) return false;
    let inside = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = polygon[i]!.x;
      const yi = polygon[i]!.y;
      const xj = polygon[j]!.x;
      const yj = polygon[j]!.y;

      const intersect =
        yi > pt.y !== yj > pt.y &&
        pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  /**
   * Computes the geometric centroid (center of mass) of any simple polygon.
   */
  public static computePolygonCentroid(polygon: readonly Point2D[]): Point2D {
    const n = polygon.length;
    if (n === 0) return { x: 0, y: 0 };
    if (n === 1) return { ...polygon[0]! };
    if (n === 2) {
      return {
        x: Math.round((polygon[0]!.x + polygon[1]!.x) * 0.5),
        y: Math.round((polygon[0]!.y + polygon[1]!.y) * 0.5),
      };
    }

    let signedArea = 0;
    let cx = 0;
    let cy = 0;

    for (let i = 0; i < n; i++) {
      const p0 = polygon[i]!;
      const p1 = polygon[(i + 1) % n]!;
      const a = p0.x * p1.y - p1.x * p0.y;
      signedArea += a;
      cx += (p0.x + p1.x) * a;
      cy += (p0.y + p1.y) * a;
    }

    signedArea *= 0.5;
    if (Math.abs(signedArea) < 1e-4) {
      let sumX = 0;
      let sumY = 0;
      for (const p of polygon) {
        sumX += p.x;
        sumY += p.y;
      }
      return { x: Math.round(sumX / n), y: Math.round(sumY / n) };
    }

    const factor = 1 / (6 * signedArea);
    return {
      x: Math.round(cx * factor),
      y: Math.round(cy * factor),
    };
  }

  /**
   * Proportional 2-Point scale calculation for calibrated blueprints & underlays:
   * scaleMmPerPx = currentScale * (targetRealWorldMm / measuredSpanMm)
   */
  public static computeCalibrationScale(params: {
    currentScaleMmPerPx: number;
    measuredSpanMm: number;
    targetRealWorldMm: number;
  }): number {
    const safeMeasured = Math.max(10, params.measuredSpanMm);
    const safeTarget = Math.max(100, Math.min(100000, params.targetRealWorldMm));
    const adjustmentMultiplier = safeTarget / safeMeasured;
    return Math.round(params.currentScaleMmPerPx * adjustmentMultiplier * 1000) / 1000;
  }

  /**
   * Computes bounding centroid and span radius across multi-storey vertices/draft polygons
   * for automatic 3D & 2D camera viewport framing.
   */
  public static computeBuildingBoundingBox(points: readonly Point2D[]): {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    centerX: number;
    centerY: number;
    spanMeters: number;
  } {
    if (points.length === 0) {
      return { minX: 0, maxX: 0, minY: 0, maxY: 0, centerX: 0, centerY: 0, spanMeters: 10 };
    }
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const centerX = (minX + maxX) * 0.5;
    const centerY = (minY + maxY) * 0.5;
    const spanMeters = Math.hypot((maxX - minX) * 0.001, (maxY - minY) * 0.001);
    return { minX, maxX, minY, maxY, centerX, centerY, spanMeters };
  }
}

