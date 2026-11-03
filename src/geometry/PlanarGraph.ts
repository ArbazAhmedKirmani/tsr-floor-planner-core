import {
  InclusionRulesConfig,
  Point2D,
  RoomCategory,
  RoomSpace,
  UUID,
  Vertex,
  WallEdge,
  WallType,
} from '../types/domain.js';
import { AreaEngine } from './AreaEngine.js';

export interface DirectedHalfEdge {
  id: string;
  wallEdgeId: UUID;
  originVertexId: UUID;
  targetVertexId: UUID;
  twinHalfEdgeId: string;
  /** Angle in radians (-PI, PI] from origin to target */
  angleRad: number;
  thicknessMm: number;
}

export interface DetectedFaceCycle {
  halfEdgeIds: string[];
  vertexIds: UUID[];
  wallEdgeIds: UUID[];
  polygonMm: Point2D[];
  signedAreaMm2: number;
}

/**
 * Doubly Connected Edge List (DCEL) / Planar Graph engine for 2D Floor Plan geometry.
 * Handles:
 * - Vertex & WallEdge insertion, movement, deletion
 * - Splitting walls at arbitrary intersection points (T-junctions / X-junctions)
 * - Merging collinear adjacent walls
 * - Minimal cycle (interior face) extraction via planar half-edge traversal
 */
export class PlanarGraph {
  private vertices: Map<UUID, Vertex> = new Map();
  private walls: Map<UUID, WallEdge> = new Map();
  private readonly floorLevelId: UUID;

  constructor(floorLevelId: UUID, initialVertices: Vertex[] = [], initialWalls: WallEdge[] = []) {
    this.floorLevelId = floorLevelId;
    for (const v of initialVertices) {
      this.vertices.set(v.id, { ...v });
    }
    for (const w of initialWalls) {
      this.walls.set(w.id, { ...w, openings: [...(w.openings ?? [])] });
    }
  }

  public getVertices(): Vertex[] {
    return Array.from(this.vertices.values());
  }

  public getVertex(id: UUID): Vertex | undefined {
    return this.vertices.get(id);
  }

  public getWalls(): WallEdge[] {
    return Array.from(this.walls.values());
  }

  public getWall(id: UUID): WallEdge | undefined {
    return this.walls.get(id);
  }

  public upsertVertex(vertex: Vertex): Vertex {
    const existing = this.vertices.get(vertex.id);
    const updated: Vertex = {
      ...existing,
      ...vertex,
      updatedAt: new Date().toISOString(),
    };
    this.vertices.set(updated.id, updated);
    return updated;
  }

  public moveVertex(vertexId: UUID, newPos: Point2D): Vertex | undefined {
    const existing = this.vertices.get(vertexId);
    if (!existing || existing.locked) {
      return existing;
    }
    const updated: Vertex = {
      ...existing,
      x: Math.round(newPos.x * 100) / 100,
      y: Math.round(newPos.y * 100) / 100,
      updatedAt: new Date().toISOString(),
    };
    this.vertices.set(vertexId, updated);
    return updated;
  }

  public addWall(params: {
    id: UUID;
    startVertexId: UUID;
    endVertexId: UUID;
    thicknessMm: number;
    heightMm: number;
    wallType?: WallType;
    isExternalPerimeter?: boolean;
  }): WallEdge {
    if (params.startVertexId === params.endVertexId) {
      throw new Error('Cannot create a zero-length degenerate wall on identical start/end vertices.');
    }
    if (!this.vertices.has(params.startVertexId) || !this.vertices.has(params.endVertexId)) {
      throw new Error('Both startVertexId and endVertexId must exist in the PlanarGraph.');
    }

    // Prevent duplicate wall between the same pair of vertices
    for (const existing of this.walls.values()) {
      const sameForward =
        existing.startVertexId === params.startVertexId && existing.endVertexId === params.endVertexId;
      const sameReverse =
        existing.startVertexId === params.endVertexId && existing.endVertexId === params.startVertexId;
      if (sameForward || sameReverse) {
        return existing;
      }
    }

    const wall: WallEdge = {
      id: params.id,
      floorLevelId: this.floorLevelId,
      startVertexId: params.startVertexId,
      endVertexId: params.endVertexId,
      thicknessMm: params.thicknessMm,
      heightMm: params.heightMm,
      wallType: params.wallType ?? 'INTERNAL_STUD_PARTITION',
      isExternalPerimeter: params.isExternalPerimeter ?? false,
      openings: [],
      updatedAt: new Date().toISOString(),
    };
    this.walls.set(wall.id, wall);
    return wall;
  }

  public updateWallThickness(wallId: UUID, thicknessMm: number): WallEdge | undefined {
    const wall = this.walls.get(wallId);
    if (!wall) return undefined;
    const updated: WallEdge = {
      ...wall,
      thicknessMm: Math.max(50, Math.min(1200, thicknessMm)),
      updatedAt: new Date().toISOString(),
    };
    this.walls.set(wallId, updated);
    return updated;
  }

  /**
   * Splits an existing WallEdge at `splitPoint` (creating a new Vertex or reusing `splitVertexId`)
   * and returns the new vertex plus the two resulting WallEdges.
   * Opening features are proportionally re-parameterized onto the appropriate child segment.
   */
  public splitWallAtPoint(
    wallId: UUID,
    splitPoint: Point2D,
    newVertexId: UUID,
    firstWallId: UUID,
    secondWallId: UUID,
    endpointSnapToleranceMm = 25,
  ): { splitVertex: Vertex; walls: [WallEdge, WallEdge] | [WallEdge] } {
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
    const projected: Point2D = {
      x: vStart.x + tClamped * dx,
      y: vStart.y + tClamped * dy,
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
      updatedAt: new Date().toISOString(),
    });

    const firstOpenings = wall.openings
      .filter((op) => op.tCenter < tClamped)
      .map((op) => ({
        ...op,
        wallEdgeId: firstWallId,
        tCenter: tClamped > 0 ? op.tCenter / tClamped : 0.5,
      }));

    const secondOpenings = wall.openings
      .filter((op) => op.tCenter >= tClamped)
      .map((op) => ({
        ...op,
        wallEdgeId: secondWallId,
        tCenter: 1 - tClamped > 0 ? (op.tCenter - tClamped) / (1 - tClamped) : 0.5,
      }));

    this.walls.delete(wallId);

    const wallA: WallEdge = {
      ...wall,
      id: firstWallId,
      startVertexId: vStart.id,
      endVertexId: splitVertex.id,
      openings: firstOpenings,
      updatedAt: new Date().toISOString(),
    };

    const wallB: WallEdge = {
      ...wall,
      id: secondWallId,
      startVertexId: splitVertex.id,
      endVertexId: vEnd.id,
      openings: secondOpenings,
      updatedAt: new Date().toISOString(),
    };

    this.walls.set(wallA.id, wallA);
    this.walls.set(wallB.id, wallB);

    return {
      splitVertex,
      walls: [wallA, wallB],
    };
  }

  /**
   * Merges two walls that share a degree-2 vertex and are collinear within `angleToleranceDeg`.
   */
  public mergeCollinearWallsAtVertex(
    sharedVertexId: UUID,
    mergedWallId: UUID,
    angleToleranceDeg = 1.5,
  ): WallEdge | null {
    const incidentWalls = Array.from(this.walls.values()).filter(
      (w) => w.startVertexId === sharedVertexId || w.endVertexId === sharedVertexId,
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

    // For collinear opposing rays from sharedVertex, dot / (len1 * len2) should be ~ -1
    const cosTheta = (vec1.x * vec2.x + vec1.y * vec2.y) / (len1 * len2);
    const deviationRad = Math.acos(Math.max(-1, Math.min(1, -cosTheta)));
    const deviationDeg = (deviationRad * 180) / Math.PI;

    if (deviationDeg > angleToleranceDeg) {
      return null;
    }

    this.walls.delete(w1.id);
    this.walls.delete(w2.id);
    this.vertices.delete(sharedVertexId);

    const mergedWall: WallEdge = {
      id: mergedWallId,
      floorLevelId: this.floorLevelId,
      startVertexId: v1.id,
      endVertexId: v2.id,
      thicknessMm: w1.thicknessMm,
      heightMm: Math.max(w1.heightMm, w2.heightMm),
      wallType: w1.wallType,
      isExternalPerimeter: w1.isExternalPerimeter || w2.isExternalPerimeter,
      openings: [...w1.openings, ...w2.openings],
      updatedAt: new Date().toISOString(),
    };

    this.walls.set(mergedWall.id, mergedWall);
    return mergedWall;
  }

  public static extractMinimalFaces(
    vertices: readonly Vertex[],
    walls: readonly WallEdge[],
  ): DetectedFaceCycle[] {
    const graph = new PlanarGraph('temp-level', [...vertices], [...walls]);
    return graph.detectInteriorRoomCycles();
  }

  public static syncRooms(params: {
    floorLevelId: UUID;
    vertices: readonly Vertex[];
    walls: readonly WallEdge[];
    existingRooms?: RoomSpace[];
  }): RoomSpace[] {
    const graph = new PlanarGraph(params.floorLevelId, [...params.vertices], [...params.walls]);
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
  public detectInteriorRoomCycles(): DetectedFaceCycle[] {
    // 1. Prune filaments (degree < 2 vertices)
    const activeWallIds = new Set<UUID>(this.walls.keys());
    let pruned = true;
    while (pruned) {
      pruned = false;
      const degreeMap = new Map<UUID, number>();
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

    // 2. Construct directed half-edges
    const halfEdges = new Map<string, DirectedHalfEdge>();
    const outgoingByVertex = new Map<UUID, DirectedHalfEdge[]>();

    for (const wallId of activeWallIds) {
      const w = this.walls.get(wallId);
      if (!w) continue;
      const u = this.vertices.get(w.startVertexId);
      const v = this.vertices.get(w.endVertexId);
      if (!u || !v) continue;

      const fwdId = `${wallId}:fwd`;
      const revId = `${wallId}:rev`;

      const fwd: DirectedHalfEdge = {
        id: fwdId,
        wallEdgeId: wallId,
        originVertexId: u.id,
        targetVertexId: v.id,
        twinHalfEdgeId: revId,
        angleRad: Math.atan2(v.y - u.y, v.x - u.x),
        thicknessMm: w.thicknessMm,
      };

      const rev: DirectedHalfEdge = {
        id: revId,
        wallEdgeId: wallId,
        originVertexId: v.id,
        targetVertexId: u.id,
        twinHalfEdgeId: fwdId,
        angleRad: Math.atan2(u.y - v.y, u.x - v.x),
        thicknessMm: w.thicknessMm,
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

    // 3. Sort outgoing half-edges at each vertex in ascending CCW angle order
    for (const [, list] of outgoingByVertex.entries()) {
      list.sort((a, b) => a.angleRad - b.angleRad);
    }

    // 4. Build `nextHalfEdge` lookup
    const nextHalfEdgeMap = new Map<string, string>();
    for (const he of halfEdges.values()) {
      const twin = halfEdges.get(he.twinHalfEdgeId);
      if (!twin) continue;
      const outgoingAtTarget = outgoingByVertex.get(he.targetVertexId) ?? [];
      if (outgoingAtTarget.length === 0) continue;

      const twinIdx = outgoingAtTarget.findIndex((item) => item.id === twin.id);
      if (twinIdx === -1) continue;

      // In standard CCW planar graphs, to trace a minimal CCW interior face on the left of `he`,
      // at `targetVertex` we turn as sharply left as possible, which corresponds to the predecessor
      // in CCW order around `targetVertex` of `twin`.
      const nextIdx = (twinIdx - 1 + outgoingAtTarget.length) % outgoingAtTarget.length;
      const nextHe = outgoingAtTarget[nextIdx];
      if (nextHe) {
        nextHalfEdgeMap.set(he.id, nextHe.id);
      }
    }

    // 5. Traverse all unvisited half-edges to collect elementary cycles
    const visited = new Set<string>();
    const interiorCycles: DetectedFaceCycle[] = [];

    for (const startHe of halfEdges.values()) {
      if (visited.has(startHe.id)) continue;

      const cycleHeIds: string[] = [];
      let currId: string | undefined = startHe.id;
      const pathSet = new Set<string>();

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

      const vertexIds: UUID[] = [];
      const wallEdgeIds: UUID[] = [];
      const polygonMm: Point2D[] = [];

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

      // Keep strictly positive CCW interior faces (minimum area 0.25 m² = 250,000 mm²)
      if (signedAreaMm2 > 250_000) {
        interiorCycles.push({
          halfEdgeIds: cycleHeIds,
          vertexIds,
          wallEdgeIds,
          polygonMm,
          signedAreaMm2,
        });
      }
    }

    return interiorCycles;
  }

  /**
   * Synchronizes detected planar cycles into `RoomSpace` domain objects,
   * preserving existing room names/categories when boundary vertices overlap.
   */
  public buildRoomSpaces(existingRooms: RoomSpace[] = []): RoomSpace[] {
    const cycles = this.detectInteriorRoomCycles();
    const defaultInclusion: InclusionRulesConfig = {
      includeInGia: true,
      includeInGea: true,
      includeInBcis: true,
      includeInEpc: true,
      isThermallySeparated: false,
      isHeated: true,
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

      const category: RoomCategory = matchedExisting?.category ?? 'HABITABLE_LIVING';
      const inclusionRules: InclusionRulesConfig = matchedExisting?.inclusionRules ?? {
        ...defaultInclusion,
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
        updatedAt: new Date().toISOString(),
      };
    });
  }
}

