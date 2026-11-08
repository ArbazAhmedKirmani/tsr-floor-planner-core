"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  AreaEngine: () => AreaEngine,
  DEFAULT_SNAP_CONFIG: () => DEFAULT_SNAP_CONFIG,
  DiscrepancyEngine: () => DiscrepancyEngine,
  PlanarGraph: () => PlanarGraph,
  SnapSolver: () => SnapSolver
});
module.exports = __toCommonJS(index_exports);

// src/geometry/AreaEngine.ts
var AreaEngine = class _AreaEngine {
  static MM2_PER_SQM = 1e6;
  /**
   * Computes signed area in square millimeters (mm²) via the Shoelace formula:
   * A = 0.5 * sum_{i=0}^{n-1} (x_i * y_{i+1} - x_{i+1} * y_i)
   * Positive when vertices are ordered counter-clockwise (CCW) in standard Cartesian coordinates.
   */
  static computeSignedPolygonAreaMm2(polygon) {
    const n = polygon.length;
    if (n < 3) return 0;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const curr = polygon[i];
      const next = polygon[(i + 1) % n];
      sum += curr.x * next.y - next.x * curr.y;
    }
    return 0.5 * sum;
  }
  /**
   * Computes unsigned area in square meters (m²) rounded to 2 decimal places.
   */
  static computePolygonAreaSqm(polygon) {
    const areaMm2 = Math.abs(_AreaEngine.computeSignedPolygonAreaMm2(polygon));
    return _AreaEngine.mm2ToSqm(areaMm2);
  }
  static mm2ToSqm(areaMm2) {
    return Math.round(areaMm2 / _AreaEngine.MM2_PER_SQM * 100) / 100;
  }
  static computePolygonPerimeterMeters(polygon) {
    const n = polygon.length;
    if (n < 2) return 0;
    let totalMm = 0;
    for (let i = 0; i < n; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % n];
      totalMm += Math.hypot(b.x - a.x, b.y - a.y);
    }
    return Math.round(totalMm / 1e3 * 100) / 100;
  }
  /**
   * Offsets a closed polygon inward (toward its interior) by `0.5 * wallThickness[i]`
   * along each edge `i = (v_i -> v_{i+1})`, computing mitered corner intersections.
   * Used to derive the true inner-face polygon (GIA) from wall centerlines.
   */
  static offsetPolygonInwardByWallThickness(centerlinePolygon, edgeThicknessesMm) {
    return _AreaEngine.offsetPolygonByHalfThickness(centerlinePolygon, edgeThicknessesMm, "INWARD");
  }
  /**
   * Offsets a closed polygon outward (away from its interior) by `0.5 * wallThickness[i]`
   * along each edge `i = (v_i -> v_{i+1})`, computing mitered corner intersections.
   * Used to derive the true outer-face building footprint (GEA) from external wall centerlines.
   */
  static offsetPolygonOutwardByWallThickness(centerlinePolygon, edgeThicknessesMm) {
    return _AreaEngine.offsetPolygonByHalfThickness(centerlinePolygon, edgeThicknessesMm, "OUTWARD");
  }
  static offsetPolygonByHalfThickness(polygon, edgeThicknessesMm, direction) {
    const n = polygon.length;
    if (n < 3) return [...polygon];
    const signedArea = _AreaEngine.computeSignedPolygonAreaMm2(polygon);
    const orientationSign = signedArea >= 0 ? 1 : -1;
    const offsetSign = direction === "INWARD" ? orientationSign : -orientationSign;
    const offsetLines = [];
    for (let i = 0; i < n; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % n];
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
          halfThickness: halfT
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
          y: a.y + ny * halfT
        },
        dir: { x: ux, y: uy },
        normal: { x: nx, y: ny },
        halfThickness: halfT
      });
    }
    const resultVertices = [];
    const miterRatioLimit = 4;
    for (let i = 0; i < n; i++) {
      const prevLine = offsetLines[(i - 1 + n) % n];
      const currLine = offsetLines[i];
      const origVertex = polygon[i];
      const det = prevLine.dir.x * currLine.dir.y - prevLine.dir.y * currLine.dir.x;
      if (Math.abs(det) < 1e-5) {
        const avgNx = 0.5 * (prevLine.normal.x + currLine.normal.x);
        const avgNy = 0.5 * (prevLine.normal.y + currLine.normal.y);
        const avgHalfT = 0.5 * (prevLine.halfThickness + currLine.halfThickness);
        resultVertices.push({
          x: Math.round((origVertex.x + avgNx * avgHalfT) * 100) / 100,
          y: Math.round((origVertex.y + avgNy * avgHalfT) * 100) / 100
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
            y: Math.round((origVertex.y + (iy - origVertex.y) * scale) * 100) / 100
          });
        } else {
          resultVertices.push({
            x: Math.round(ix * 100) / 100,
            y: Math.round(iy * 100) / 100
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
  static isIncludedInBcis(room) {
    if (!room.inclusionRules.includeInBcis) {
      return false;
    }
    if (room.category === "BALCONY_TERRACE" || room.category === "VOID_ATRIUM") {
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
  static isIncludedInEpc(room) {
    if (!room.inclusionRules.includeInEpc) {
      return false;
    }
    const excludedCategories = /* @__PURE__ */ new Set([
      "GARAGE_INTEGRAL",
      "GARAGE_DETACHED",
      "PORCH_EXTERNAL",
      "BALCONY_TERRACE",
      "VOID_ATRIUM",
      "PLANT_EXTERNAL_STORE"
    ]);
    if (excludedCategories.has(room.category)) {
      return false;
    }
    if (room.category === "CONSERVATORY" && room.inclusionRules.isThermallySeparated) {
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
  static calculateFloorAreaSummary(params) {
    const { floorLevelId, vertices, walls, rooms, internalFeatures = [] } = params;
    const vertexMap = new Map(vertices.map((v) => [v.id, v]));
    let sumRoomInnerSqm = 0;
    let sumRoomCenterlineSqm = 0;
    let bcisAreaSqm = 0;
    let epcTotalFloorAreaSqm = 0;
    const roomBreakdowns = [];
    for (const room of rooms) {
      const roomInnerSqm = room.innerPolygonMm.length >= 3 ? _AreaEngine.computePolygonAreaSqm(room.innerPolygonMm) : room.computedGiaSqm;
      const roomCenterSqm = room.centerlinePolygonMm.length >= 3 ? _AreaEngine.computePolygonAreaSqm(room.centerlinePolygonMm) : room.computedCenterlineAreaSqm;
      if (room.inclusionRules.includeInGia && room.category !== "VOID_ATRIUM") {
        sumRoomInnerSqm += roomInnerSqm;
      }
      if (room.inclusionRules.includeInGea) {
        sumRoomCenterlineSqm += roomCenterSqm;
      }
      const incBcis = _AreaEngine.isIncludedInBcis(room);
      const incEpc = _AreaEngine.isIncludedInEpc(room);
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
        includedInEpc: incEpc
      });
    }
    let internalPartitionFootprintMm2 = 0;
    let externalWallHalfFootprintMm2 = 0;
    let externalPerimeterMm = 0;
    for (const wall of walls) {
      const u = vertexMap.get(wall.startVertexId);
      const v = vertexMap.get(wall.endVertexId);
      if (!u || !v) continue;
      const lengthMm = Math.hypot(v.x - u.x, v.y - u.y);
      const wallFootprintMm2 = lengthMm * wall.thicknessMm;
      if (wall.isExternalPerimeter || wall.wallType === "EXTERNAL_CAVITY" || wall.wallType === "EXTERNAL_SOLID") {
        externalWallHalfFootprintMm2 += wallFootprintMm2 * 0.5;
        externalPerimeterMm += lengthMm;
      } else {
        internalPartitionFootprintMm2 += wallFootprintMm2;
      }
    }
    let featureDeductionMm2 = 0;
    for (const feat of internalFeatures) {
      if (feat.deductFromGia) {
        featureDeductionMm2 += feat.widthMm * feat.depthMm;
      }
    }
    const internalPartitionsSqm = _AreaEngine.mm2ToSqm(internalPartitionFootprintMm2);
    const featureDeductionSqm = _AreaEngine.mm2ToSqm(featureDeductionMm2);
    const giaSqm = Math.max(
      0,
      Math.round((sumRoomInnerSqm + internalPartitionsSqm - featureDeductionSqm) * 100) / 100
    );
    const externalOuterHalfSqm = _AreaEngine.mm2ToSqm(externalWallHalfFootprintMm2);
    const geaSqm = Math.max(
      giaSqm,
      Math.round((sumRoomCenterlineSqm + externalOuterHalfSqm) * 100) / 100
    );
    return {
      floorLevelId,
      geaSqm,
      giaSqm,
      bcisAreaSqm: Math.round((bcisAreaSqm + internalPartitionsSqm) * 100) / 100,
      epcTotalFloorAreaSqm: Math.round(epcTotalFloorAreaSqm * 100) / 100,
      netInternalAreaSqm: Math.round(sumRoomInnerSqm * 100) / 100,
      externalPerimeterMeters: Math.round(externalPerimeterMm / 1e3 * 100) / 100,
      roomBreakdowns
    };
  }
  /**
   * Ray-casting algorithm to test whether point pt is strictly inside or on the boundary of polygon.
   * Useful for room selection, defect pin mapping, and touch-hit tests.
   */
  static isPointInsidePolygon(pt, polygon) {
    const n = polygon.length;
    if (n < 3) return false;
    let inside = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = polygon[i].x;
      const yi = polygon[i].y;
      const xj = polygon[j].x;
      const yj = polygon[j].y;
      const intersect = yi > pt.y !== yj > pt.y && pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }
  /**
   * Computes the geometric centroid (center of mass) of any simple polygon.
   */
  static computePolygonCentroid(polygon) {
    const n = polygon.length;
    if (n === 0) return { x: 0, y: 0 };
    if (n === 1) return { ...polygon[0] };
    if (n === 2) {
      return {
        x: Math.round((polygon[0].x + polygon[1].x) * 0.5),
        y: Math.round((polygon[0].y + polygon[1].y) * 0.5)
      };
    }
    let signedArea = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < n; i++) {
      const p0 = polygon[i];
      const p1 = polygon[(i + 1) % n];
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
      y: Math.round(cy * factor)
    };
  }
  /**
   * Proportional 2-Point scale calculation for calibrated blueprints & underlays:
   * scaleMmPerPx = currentScale * (targetRealWorldMm / measuredSpanMm)
   */
  static computeCalibrationScale(params) {
    const safeMeasured = Math.max(10, params.measuredSpanMm);
    const safeTarget = Math.max(100, Math.min(1e5, params.targetRealWorldMm));
    const adjustmentMultiplier = safeTarget / safeMeasured;
    return Math.round(params.currentScaleMmPerPx * adjustmentMultiplier * 1e3) / 1e3;
  }
  /**
   * Computes bounding centroid and span radius across multi-storey vertices/draft polygons
   * for automatic 3D & 2D camera viewport framing.
   */
  static computeBuildingBoundingBox(points) {
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
    const spanMeters = Math.hypot((maxX - minX) * 1e-3, (maxY - minY) * 1e-3);
    return { minX, maxX, minY, maxY, centerX, centerY, spanMeters };
  }
};

// src/geometry/PlanarGraph.ts
var PlanarGraph = class _PlanarGraph {
  vertices = /* @__PURE__ */ new Map();
  walls = /* @__PURE__ */ new Map();
  floorLevelId;
  constructor(floorLevelId, initialVertices = [], initialWalls = []) {
    this.floorLevelId = floorLevelId;
    for (const v of initialVertices) {
      this.vertices.set(v.id, { ...v });
    }
    for (const w of initialWalls) {
      this.walls.set(w.id, { ...w, openings: [...w.openings ?? []] });
    }
  }
  getVertices() {
    return Array.from(this.vertices.values());
  }
  getVertex(id) {
    return this.vertices.get(id);
  }
  getWalls() {
    return Array.from(this.walls.values());
  }
  getWall(id) {
    return this.walls.get(id);
  }
  upsertVertex(vertex) {
    const existing = this.vertices.get(vertex.id);
    const updated = {
      ...existing,
      ...vertex,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.vertices.set(updated.id, updated);
    return updated;
  }
  moveVertex(vertexId, newPos) {
    const existing = this.vertices.get(vertexId);
    if (!existing || existing.locked) {
      return existing;
    }
    const updated = {
      ...existing,
      x: Math.round(newPos.x * 100) / 100,
      y: Math.round(newPos.y * 100) / 100,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.vertices.set(vertexId, updated);
    return updated;
  }
  addWall(params) {
    if (params.startVertexId === params.endVertexId) {
      throw new Error("Cannot create a zero-length degenerate wall on identical start/end vertices.");
    }
    if (!this.vertices.has(params.startVertexId) || !this.vertices.has(params.endVertexId)) {
      throw new Error("Both startVertexId and endVertexId must exist in the PlanarGraph.");
    }
    for (const existing of this.walls.values()) {
      const sameForward = existing.startVertexId === params.startVertexId && existing.endVertexId === params.endVertexId;
      const sameReverse = existing.startVertexId === params.endVertexId && existing.endVertexId === params.startVertexId;
      if (sameForward || sameReverse) {
        return existing;
      }
    }
    const wall = {
      id: params.id,
      floorLevelId: this.floorLevelId,
      startVertexId: params.startVertexId,
      endVertexId: params.endVertexId,
      thicknessMm: params.thicknessMm,
      heightMm: params.heightMm,
      wallType: params.wallType ?? "INTERNAL_STUD_PARTITION",
      isExternalPerimeter: params.isExternalPerimeter ?? false,
      openings: [],
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.walls.set(wall.id, wall);
    return wall;
  }
  updateWallThickness(wallId, thicknessMm) {
    const wall = this.walls.get(wallId);
    if (!wall) return void 0;
    const updated = {
      ...wall,
      thicknessMm: Math.max(50, Math.min(1200, thicknessMm)),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.walls.set(wallId, updated);
    return updated;
  }
  /**
   * Splits an existing WallEdge at `splitPoint` (creating a new Vertex or reusing `splitVertexId`)
   * and returns the new vertex plus the two resulting WallEdges.
   * Opening features are proportionally re-parameterized onto the appropriate child segment.
   */
  splitWallAtPoint(wallId, splitPoint, newVertexId, firstWallId, secondWallId, endpointSnapToleranceMm = 25) {
    const wall = this.walls.get(wallId);
    if (!wall) {
      throw new Error(`Wall ${wallId} does not exist in PlanarGraph.`);
    }
    const vStart = this.vertices.get(wall.startVertexId);
    const vEnd = this.vertices.get(wall.endVertexId);
    if (!vStart || !vEnd) {
      throw new Error(`Wall ${wallId} references missing vertices.`);
    }
    const dx = vEnd.x - vStart.x;
    const dy = vEnd.y - vStart.y;
    const lenSq = dx * dx + dy * dy;
    const len = Math.sqrt(lenSq);
    const tRaw = lenSq > 0 ? ((splitPoint.x - vStart.x) * dx + (splitPoint.y - vStart.y) * dy) / lenSq : 0;
    const tClamped = Math.max(0, Math.min(1, tRaw));
    const projected = {
      x: vStart.x + tClamped * dx,
      y: vStart.y + tClamped * dy
    };
    const distToStart = Math.hypot(projected.x - vStart.x, projected.y - vStart.y);
    if (distToStart <= endpointSnapToleranceMm) {
      return { splitVertex: vStart, walls: [wall] };
    }
    const distToEnd = Math.hypot(projected.x - vEnd.x, projected.y - vEnd.y);
    if (distToEnd <= endpointSnapToleranceMm) {
      return { splitVertex: vEnd, walls: [wall] };
    }
    const splitVertex = this.upsertVertex({
      id: newVertexId,
      x: Math.round(projected.x * 100) / 100,
      y: Math.round(projected.y * 100) / 100,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    const firstOpenings = wall.openings.filter((op) => op.tCenter < tClamped).map((op) => ({
      ...op,
      wallEdgeId: firstWallId,
      tCenter: tClamped > 0 ? op.tCenter / tClamped : 0.5
    }));
    const secondOpenings = wall.openings.filter((op) => op.tCenter >= tClamped).map((op) => ({
      ...op,
      wallEdgeId: secondWallId,
      tCenter: 1 - tClamped > 0 ? (op.tCenter - tClamped) / (1 - tClamped) : 0.5
    }));
    this.walls.delete(wallId);
    const wallA = {
      ...wall,
      id: firstWallId,
      startVertexId: vStart.id,
      endVertexId: splitVertex.id,
      openings: firstOpenings,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const wallB = {
      ...wall,
      id: secondWallId,
      startVertexId: splitVertex.id,
      endVertexId: vEnd.id,
      openings: secondOpenings,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.walls.set(wallA.id, wallA);
    this.walls.set(wallB.id, wallB);
    return {
      splitVertex,
      walls: [wallA, wallB]
    };
  }
  /**
   * Merges two walls that share a degree-2 vertex and are collinear within `angleToleranceDeg`.
   */
  mergeCollinearWallsAtVertex(sharedVertexId, mergedWallId, angleToleranceDeg = 1.5) {
    const incidentWalls = Array.from(this.walls.values()).filter(
      (w) => w.startVertexId === sharedVertexId || w.endVertexId === sharedVertexId
    );
    if (incidentWalls.length !== 2) {
      return null;
    }
    const [w1, w2] = incidentWalls;
    if (!w1 || !w2) return null;
    if (w1.thicknessMm !== w2.thicknessMm || w1.wallType !== w2.wallType) {
      return null;
    }
    const vShared = this.vertices.get(sharedVertexId);
    const otherV1Id = w1.startVertexId === sharedVertexId ? w1.endVertexId : w1.startVertexId;
    const otherV2Id = w2.startVertexId === sharedVertexId ? w2.endVertexId : w2.startVertexId;
    const v1 = this.vertices.get(otherV1Id);
    const v2 = this.vertices.get(otherV2Id);
    if (!vShared || !v1 || !v2) return null;
    const vec1 = { x: v1.x - vShared.x, y: v1.y - vShared.y };
    const vec2 = { x: v2.x - vShared.x, y: v2.y - vShared.y };
    const len1 = Math.hypot(vec1.x, vec1.y);
    const len2 = Math.hypot(vec2.x, vec2.y);
    if (len1 < 1e-3 || len2 < 1e-3) return null;
    const cosTheta = (vec1.x * vec2.x + vec1.y * vec2.y) / (len1 * len2);
    const deviationRad = Math.acos(Math.max(-1, Math.min(1, -cosTheta)));
    const deviationDeg = deviationRad * 180 / Math.PI;
    if (deviationDeg > angleToleranceDeg) {
      return null;
    }
    this.walls.delete(w1.id);
    this.walls.delete(w2.id);
    this.vertices.delete(sharedVertexId);
    const mergedWall = {
      id: mergedWallId,
      floorLevelId: this.floorLevelId,
      startVertexId: v1.id,
      endVertexId: v2.id,
      thicknessMm: w1.thicknessMm,
      heightMm: Math.max(w1.heightMm, w2.heightMm),
      wallType: w1.wallType,
      isExternalPerimeter: w1.isExternalPerimeter || w2.isExternalPerimeter,
      openings: [...w1.openings, ...w2.openings],
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.walls.set(mergedWall.id, mergedWall);
    return mergedWall;
  }
  static extractMinimalFaces(vertices, walls) {
    const graph = new _PlanarGraph("temp-level", [...vertices], [...walls]);
    return graph.detectInteriorRoomCycles();
  }
  static syncRooms(params) {
    const graph = new _PlanarGraph(params.floorLevelId, [...params.vertices], [...params.walls]);
    return graph.buildRoomSpaces(params.existingRooms ?? []);
  }
  /**
   * Extracts closed interior faces (rooms) using DCEL / Half-Edge planar cycle detection:
   * 1. Iteratively prunes degree-1 filament vertices/edges that cannot bound a room.
   * 2. Generates paired directed half-edges (u -> v and v -> u) for every remaining wall.
   * 3. Sorts outgoing half-edges at each vertex counter-clockwise by polar angle.
   * 4. For each half-edge (u -> v), picks the next edge at `v` by taking the predecessor
   *    in the CCW cyclic order around `v` of the twin (v -> u), tracing minimal left-hand faces.
   * 5. Keeps bounded interior faces (signedArea > 0 in standard CCW coordinates) and filters out
   *    the unbounded exterior face (signedArea < 0).
   */
  detectInteriorRoomCycles() {
    const activeWallIds = new Set(this.walls.keys());
    let pruned = true;
    while (pruned) {
      pruned = false;
      const degreeMap = /* @__PURE__ */ new Map();
      for (const wallId of activeWallIds) {
        const w = this.walls.get(wallId);
        if (!w) continue;
        degreeMap.set(w.startVertexId, (degreeMap.get(w.startVertexId) ?? 0) + 1);
        degreeMap.set(w.endVertexId, (degreeMap.get(w.endVertexId) ?? 0) + 1);
      }
      for (const wallId of Array.from(activeWallIds)) {
        const w = this.walls.get(wallId);
        if (!w) continue;
        const dStart = degreeMap.get(w.startVertexId) ?? 0;
        const dEnd = degreeMap.get(w.endVertexId) ?? 0;
        if (dStart < 2 || dEnd < 2) {
          activeWallIds.delete(wallId);
          pruned = true;
        }
      }
    }
    if (activeWallIds.size < 3) {
      return [];
    }
    const halfEdges = /* @__PURE__ */ new Map();
    const outgoingByVertex = /* @__PURE__ */ new Map();
    for (const wallId of activeWallIds) {
      const w = this.walls.get(wallId);
      if (!w) continue;
      const u = this.vertices.get(w.startVertexId);
      const v = this.vertices.get(w.endVertexId);
      if (!u || !v) continue;
      const fwdId = `${wallId}:fwd`;
      const revId = `${wallId}:rev`;
      const fwd = {
        id: fwdId,
        wallEdgeId: wallId,
        originVertexId: u.id,
        targetVertexId: v.id,
        twinHalfEdgeId: revId,
        angleRad: Math.atan2(v.y - u.y, v.x - u.x),
        thicknessMm: w.thicknessMm
      };
      const rev = {
        id: revId,
        wallEdgeId: wallId,
        originVertexId: v.id,
        targetVertexId: u.id,
        twinHalfEdgeId: fwdId,
        angleRad: Math.atan2(u.y - v.y, u.x - v.x),
        thicknessMm: w.thicknessMm
      };
      halfEdges.set(fwdId, fwd);
      halfEdges.set(revId, rev);
      const uList = outgoingByVertex.get(u.id) ?? [];
      uList.push(fwd);
      outgoingByVertex.set(u.id, uList);
      const vList = outgoingByVertex.get(v.id) ?? [];
      vList.push(rev);
      outgoingByVertex.set(v.id, vList);
    }
    for (const [, list] of outgoingByVertex.entries()) {
      list.sort((a, b) => a.angleRad - b.angleRad);
    }
    const nextHalfEdgeMap = /* @__PURE__ */ new Map();
    for (const he of halfEdges.values()) {
      const twin = halfEdges.get(he.twinHalfEdgeId);
      if (!twin) continue;
      const outgoingAtTarget = outgoingByVertex.get(he.targetVertexId) ?? [];
      if (outgoingAtTarget.length === 0) continue;
      const twinIdx = outgoingAtTarget.findIndex((item) => item.id === twin.id);
      if (twinIdx === -1) continue;
      const nextIdx = (twinIdx - 1 + outgoingAtTarget.length) % outgoingAtTarget.length;
      const nextHe = outgoingAtTarget[nextIdx];
      if (nextHe) {
        nextHalfEdgeMap.set(he.id, nextHe.id);
      }
    }
    const visited = /* @__PURE__ */ new Set();
    const interiorCycles = [];
    for (const startHe of halfEdges.values()) {
      if (visited.has(startHe.id)) continue;
      const cycleHeIds = [];
      let currId = startHe.id;
      const pathSet = /* @__PURE__ */ new Set();
      while (currId && !visited.has(currId)) {
        if (pathSet.has(currId)) {
          break;
        }
        pathSet.add(currId);
        cycleHeIds.push(currId);
        currId = nextHalfEdgeMap.get(currId);
      }
      for (const id of cycleHeIds) {
        visited.add(id);
      }
      if (currId !== startHe.id || cycleHeIds.length < 3) {
        continue;
      }
      const vertexIds = [];
      const wallEdgeIds = [];
      const polygonMm = [];
      for (const heId of cycleHeIds) {
        const he = halfEdges.get(heId);
        if (!he) continue;
        const v = this.vertices.get(he.originVertexId);
        if (!v) continue;
        vertexIds.push(v.id);
        wallEdgeIds.push(he.wallEdgeId);
        polygonMm.push({ x: v.x, y: v.y });
      }
      const signedAreaMm2 = AreaEngine.computeSignedPolygonAreaMm2(polygonMm);
      if (signedAreaMm2 > 25e4) {
        interiorCycles.push({
          halfEdgeIds: cycleHeIds,
          vertexIds,
          wallEdgeIds,
          polygonMm,
          signedAreaMm2
        });
      }
    }
    return interiorCycles;
  }
  /**
   * Synchronizes detected planar cycles into `RoomSpace` domain objects,
   * preserving existing room names/categories when boundary vertices overlap.
   */
  buildRoomSpaces(existingRooms = []) {
    const cycles = this.detectInteriorRoomCycles();
    const defaultInclusion = {
      includeInGia: true,
      includeInGea: true,
      includeInBcis: true,
      includeInEpc: true,
      isThermallySeparated: false,
      isHeated: true
    };
    return cycles.map((cycle, index) => {
      const cycleVertexSet = new Set(cycle.vertexIds);
      const matchedExisting = existingRooms.find((room) => {
        if (room.boundaryVertexIds.length !== cycle.vertexIds.length) return false;
        return room.boundaryVertexIds.every((vId) => cycleVertexSet.has(vId));
      });
      const thicknessesMm = cycle.wallEdgeIds.map((wId) => this.walls.get(wId)?.thicknessMm ?? 100);
      const innerPolygonMm = AreaEngine.offsetPolygonInwardByWallThickness(cycle.polygonMm, thicknessesMm);
      const centerlineAreaSqm = AreaEngine.mm2ToSqm(Math.abs(cycle.signedAreaMm2));
      const giaSqm = AreaEngine.computePolygonAreaSqm(innerPolygonMm);
      const category = matchedExisting?.category ?? "HABITABLE_LIVING";
      const inclusionRules = matchedExisting?.inclusionRules ?? {
        ...defaultInclusion
      };
      return {
        id: matchedExisting?.id ?? `room-${this.floorLevelId}-${index + 1}`,
        floorLevelId: this.floorLevelId,
        name: matchedExisting?.name ?? `Room ${index + 1}`,
        category,
        boundaryVertexIds: cycle.vertexIds,
        boundaryWallEdgeIds: cycle.wallEdgeIds,
        innerPolygonMm,
        centerlinePolygonMm: cycle.polygonMm,
        ceilingHeightMm: matchedExisting?.ceilingHeightMm ?? 2400,
        reducedHeadroomRatio: matchedExisting?.reducedHeadroomRatio ?? 0,
        inclusionRules,
        computedGiaSqm: giaSqm,
        computedCenterlineAreaSqm: centerlineAreaSqm,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
    });
  }
};

// src/geometry/SnapSolver.ts
var DEFAULT_SNAP_CONFIG = {
  gridStepMm: 50,
  vertexSnapRadiusMm: 150,
  edgeSnapRadiusMm: 120,
  angleSnapToleranceDeg: 4,
  enableAngleConstraint: true,
  enableGridSnap: true
};
var SnapSolver = class _SnapSolver {
  config;
  constructor(config = {}) {
    this.config = { ...DEFAULT_SNAP_CONFIG, ...config };
  }
  updateConfig(partial) {
    this.config = { ...this.config, ...partial };
  }
  getConfig() {
    return { ...this.config };
  }
  static solveSnap(params) {
    const solver = new _SnapSolver(params.config);
    return solver.solve(
      params.rawPoint,
      params.vertices,
      params.walls,
      params.anchorPoint,
      params.excludeVertexIds ?? /* @__PURE__ */ new Set()
    );
  }
  /**
   * Resolves a raw cursor point (in mm) to the highest-priority geometric snap target.
   */
  solve(rawPoint, vertices, walls, anchorPoint, excludeVertexIds = /* @__PURE__ */ new Set()) {
    let closestVertex;
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
        snapKind: "VERTEX",
        snappedVertexId: closestVertex.id,
        ...this.computePolarMetrics(anchorPoint, snappedPoint)
      };
    }
    let workingPoint = { ...rawPoint };
    let activeAngleSnapDeg;
    if (anchorPoint && this.config.enableAngleConstraint) {
      const angleConstraint = this.applyAngleConstraint(anchorPoint, rawPoint);
      if (angleConstraint.didSnap) {
        workingPoint = angleConstraint.point;
        activeAngleSnapDeg = angleConstraint.snappedAngleDeg;
      }
    }
    const vertexMap = new Map(vertices.map((v) => [v.id, v]));
    let closestEdgeResult;
    let minEdgeDist = this.config.edgeSnapRadiusMm;
    for (const wall of walls) {
      const vStart = vertexMap.get(wall.startVertexId);
      const vEnd = vertexMap.get(wall.endVertexId);
      if (!vStart || !vEnd) continue;
      const proj = _SnapSolver.projectPointOntoSegment(workingPoint, vStart, vEnd);
      if (proj.t > 0.02 && proj.t < 0.98 && proj.distance <= minEdgeDist) {
        minEdgeDist = proj.distance;
        closestEdgeResult = {
          wall,
          projectedPoint: proj.point,
          t: proj.t,
          distance: proj.distance
        };
      }
    }
    if (closestEdgeResult) {
      return {
        snappedPoint: closestEdgeResult.projectedPoint,
        snapKind: "EDGE_PROJECTION",
        snappedWallEdgeId: closestEdgeResult.wall.id,
        edgeParameterT: closestEdgeResult.t,
        ...this.computePolarMetrics(anchorPoint, closestEdgeResult.projectedPoint)
      };
    }
    let alignedX;
    let alignedY;
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
      const snappedPoint = {
        x: alignedX ? alignedX.x : this.quantizeToGrid(workingPoint.x),
        y: alignedY ? alignedY.y : this.quantizeToGrid(workingPoint.y)
      };
      const refV = alignedX?.refVertex ?? alignedY?.refVertex;
      return {
        snappedPoint,
        snapKind: "AXIS_ALIGNMENT",
        guideLine: refV ? { from: { x: refV.x, y: refV.y }, to: snappedPoint } : void 0,
        ...this.computePolarMetrics(anchorPoint, snappedPoint)
      };
    }
    if (anchorPoint && activeAngleSnapDeg !== void 0) {
      const rawDist = Math.hypot(workingPoint.x - anchorPoint.x, workingPoint.y - anchorPoint.y);
      const quantizedDist = this.config.enableGridSnap ? Math.max(this.config.gridStepMm, Math.round(rawDist / this.config.gridStepMm) * this.config.gridStepMm) : rawDist;
      const rad = activeAngleSnapDeg * Math.PI / 180;
      const snappedPoint = {
        x: Math.round((anchorPoint.x + Math.cos(rad) * quantizedDist) * 100) / 100,
        y: Math.round((anchorPoint.y + Math.sin(rad) * quantizedDist) * 100) / 100
      };
      return {
        snappedPoint,
        snapKind: "ANGLE_CONSTRAINT",
        snappedAngleDeg: activeAngleSnapDeg,
        distanceFromAnchorMm: quantizedDist,
        guideLine: { from: anchorPoint, to: snappedPoint }
      };
    }
    if (this.config.enableGridSnap) {
      const snappedPoint = {
        x: this.quantizeToGrid(rawPoint.x),
        y: this.quantizeToGrid(rawPoint.y)
      };
      return {
        snappedPoint,
        snapKind: "GRID",
        ...this.computePolarMetrics(anchorPoint, snappedPoint)
      };
    }
    return {
      snappedPoint: { x: rawPoint.x, y: rawPoint.y },
      snapKind: "RAW",
      ...this.computePolarMetrics(anchorPoint, rawPoint)
    };
  }
  /**
   * Computes a point at an exact distance (e.g., from a BLE laser distance meter)
   * along the current vector from `anchorPoint` to `cursorPoint` (with angle snapping).
   */
  applyLaserDistanceFromAnchor(anchorPoint, cursorPoint, laserDistanceMm) {
    const angleRes = this.applyAngleConstraint(anchorPoint, cursorPoint);
    const dx = angleRes.point.x - anchorPoint.x;
    const dy = angleRes.point.y - anchorPoint.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) {
      return { x: anchorPoint.x + laserDistanceMm, y: anchorPoint.y };
    }
    return {
      x: Math.round((anchorPoint.x + dx / len * laserDistanceMm) * 100) / 100,
      y: Math.round((anchorPoint.y + dy / len * laserDistanceMm) * 100) / 100
    };
  }
  quantizeToGrid(valueMm) {
    const step = this.config.gridStepMm;
    return Math.round(valueMm / step) * step;
  }
  /**
   * Locks vector (anchor -> target) to nearest multiple of 45° (0°, ±45°, ±90°, ±135°, 180°)
   * when within `angleSnapToleranceDeg`.
   */
  applyAngleConstraint(anchor, target) {
    const dx = target.x - anchor.x;
    const dy = target.y - anchor.y;
    const r = Math.hypot(dx, dy);
    if (r < 1e-3) {
      return { point: target, didSnap: false };
    }
    const rawAngleDeg = Math.atan2(dy, dx) * 180 / Math.PI;
    const nearest45Deg = Math.round(rawAngleDeg / 45) * 45;
    const diffDeg = Math.abs(rawAngleDeg - nearest45Deg);
    if (diffDeg <= this.config.angleSnapToleranceDeg) {
      const normalizedDeg = nearest45Deg === -180 ? 180 : nearest45Deg;
      const rad = normalizedDeg * Math.PI / 180;
      return {
        point: {
          x: anchor.x + Math.cos(rad) * r,
          y: anchor.y + Math.sin(rad) * r
        },
        didSnap: true,
        snappedAngleDeg: normalizedDeg
      };
    }
    return { point: target, didSnap: false };
  }
  computePolarMetrics(anchorPoint, targetPoint) {
    if (!anchorPoint) return {};
    const dx = targetPoint.x - anchorPoint.x;
    const dy = targetPoint.y - anchorPoint.y;
    const dist = Math.round(Math.hypot(dx, dy) * 10) / 10;
    const angle = Math.round(Math.atan2(dy, dx) * 180 / Math.PI * 10) / 10;
    return {
      snappedAngleDeg: angle,
      distanceFromAnchorMm: dist
    };
  }
  static projectPointOntoSegment(p, a, b) {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const lenSq = abx * abx + aby * aby;
    if (lenSq < 1e-9) {
      return {
        point: { x: a.x, y: a.y },
        t: 0,
        distance: Math.hypot(p.x - a.x, p.y - a.y)
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
        y: Math.round(projY * 100) / 100
      },
      t,
      distance: Math.hypot(p.x - projX, p.y - projY)
    };
  }
};

// src/geometry/DiscrepancyEngine.ts
var DiscrepancyEngine = class _DiscrepancyEngine {
  /**
   * Evaluates graph topology against architectural integrity rules.
   */
  static validateTopology(vertices, walls) {
    const vertexMap = new Map(vertices.map((v) => [v.id, v]));
    const discrepancies = [];
    const degreeMap = /* @__PURE__ */ new Map();
    for (const w of walls) {
      degreeMap.set(w.startVertexId, (degreeMap.get(w.startVertexId) ?? 0) + 1);
      degreeMap.set(w.endVertexId, (degreeMap.get(w.endVertexId) ?? 0) + 1);
    }
    for (const [vId, deg] of degreeMap.entries()) {
      if (deg === 1) {
        const v = vertexMap.get(vId);
        discrepancies.push({
          id: `disc-open-${vId}`,
          severity: "WARNING",
          code: "OPEN_PERIMETER_VERTEX",
          message: `Unclosed wall endpoint at (${Math.round(v?.x ?? 0)}mm, ${Math.round(v?.y ?? 0)}mm). Close loop to include space in GIA.`,
          affectedEntityIds: [vId],
          pointMm: v ? { x: v.x, y: v.y } : void 0
        });
      }
    }
    for (let i = 0; i < walls.length; i++) {
      const w1 = walls[i];
      const a1 = vertexMap.get(w1.startVertexId);
      const a2 = vertexMap.get(w1.endVertexId);
      if (!a1 || !a2) continue;
      for (let j = i + 1; j < walls.length; j++) {
        const w2 = walls[j];
        const sharesEndpoint = w1.startVertexId === w2.startVertexId || w1.startVertexId === w2.endVertexId || w1.endVertexId === w2.startVertexId || w1.endVertexId === w2.endVertexId;
        const b1 = vertexMap.get(w2.startVertexId);
        const b2 = vertexMap.get(w2.endVertexId);
        if (!b1 || !b2) continue;
        if (w1.startVertexId === w2.startVertexId && w1.endVertexId === w2.endVertexId || w1.startVertexId === w2.endVertexId && w1.endVertexId === w2.startVertexId) {
          discrepancies.push({
            id: `disc-dup-${w1.id}-${w2.id}`,
            severity: "ERROR",
            code: "DUPLICATE_COLLINEAR_SEGMENT",
            message: "Duplicate overlapping wall segment detected between identical vertices.",
            affectedEntityIds: [w1.id, w2.id]
          });
          continue;
        }
        if (!sharesEndpoint) {
          const hit = _DiscrepancyEngine.segmentProperIntersection(a1, a2, b1, b2);
          if (hit) {
            discrepancies.push({
              id: `disc-intersect-${w1.id}-${w2.id}`,
              severity: "ERROR",
              code: "SELF_INTERSECTING_WALLS",
              message: `Walls cross without a shared junction vertex at (${Math.round(hit.x)}mm, ${Math.round(hit.y)}mm). Use Split Wall tool.`,
              affectedEntityIds: [w1.id, w2.id],
              pointMm: hit
            });
          }
        }
      }
    }
    const hasErrors = discrepancies.some((d) => d.severity === "ERROR");
    const hasWarnings = discrepancies.some((d) => d.severity === "WARNING");
    return {
      discrepancies,
      hasErrors,
      hasWarnings
    };
  }
  /**
   * Returns intersection point if segments (a -> b) and (c -> d) strictly intersect
   * (excluding endpoint touching).
   */
  static segmentProperIntersection(a, b, c, d) {
    const rX = b.x - a.x;
    const rY = b.y - a.y;
    const sX = d.x - c.x;
    const sY = d.y - c.y;
    const denom = rX * sY - rY * sX;
    if (Math.abs(denom) < 1e-6) return null;
    const uNumerator = (c.x - a.x) * rY - (c.y - a.y) * rX;
    const tNumerator = (c.x - a.x) * sY - (c.y - a.y) * sX;
    const t = tNumerator / denom;
    const u = uNumerator / denom;
    if (t > 0.02 && t < 0.98 && u > 0.02 && u < 0.98) {
      return {
        x: Math.round((a.x + t * rX) * 100) / 100,
        y: Math.round((a.y + t * rY) * 100) / 100
      };
    }
    return null;
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AreaEngine,
  DEFAULT_SNAP_CONFIG,
  DiscrepancyEngine,
  PlanarGraph,
  SnapSolver
});
//# sourceMappingURL=index.cjs.map