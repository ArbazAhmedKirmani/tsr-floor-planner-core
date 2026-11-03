import { DiscrepancyWarning, Point2D, UUID, Vertex, WallEdge } from '../types/domain.js';

export interface DiscrepancyValidationResult {
  discrepancies: DiscrepancyWarning[];
  hasErrors: boolean;
  hasWarnings: boolean;
}

/**
 * High-precision Topological Discrepancy and Integrity Validator:
 * - Detects unclosed/dangling perimeter endpoints (degree === 1)
 * - Detects duplicate collinear/overlapping wall segments
 * - Detects intersecting non-junction wall segments (crossings without shared vertices)
 */
export class DiscrepancyEngine {
  /**
   * Evaluates graph topology against architectural integrity rules.
   */
  public static validateTopology(
    vertices: readonly Vertex[],
    walls: readonly WallEdge[],
  ): DiscrepancyValidationResult {
    const vertexMap = new Map<UUID, Vertex>(vertices.map((v) => [v.id, v]));
    const discrepancies: DiscrepancyWarning[] = [];

    // 1. Check for Open/Dangling Wall Vertices (degree === 1)
    const degreeMap = new Map<UUID, number>();
    for (const w of walls) {
      degreeMap.set(w.startVertexId, (degreeMap.get(w.startVertexId) ?? 0) + 1);
      degreeMap.set(w.endVertexId, (degreeMap.get(w.endVertexId) ?? 0) + 1);
    }

    for (const [vId, deg] of degreeMap.entries()) {
      if (deg === 1) {
        const v = vertexMap.get(vId);
        discrepancies.push({
          id: `disc-open-${vId}`,
          severity: 'WARNING',
          code: 'OPEN_PERIMETER_VERTEX',
          message: `Unclosed wall endpoint at (${Math.round(v?.x ?? 0)}mm, ${Math.round(v?.y ?? 0)}mm). Close loop to include space in GIA.`,
          affectedEntityIds: [vId],
          pointMm: v ? { x: v.x, y: v.y } : undefined,
        });
      }
    }

    // 2. Check for Duplicate Collinear Wall Segments & Crossing Walls Without Shared Vertices
    for (let i = 0; i < walls.length; i++) {
      const w1 = walls[i]!;
      const a1 = vertexMap.get(w1.startVertexId);
      const a2 = vertexMap.get(w1.endVertexId);
      if (!a1 || !a2) continue;

      for (let j = i + 1; j < walls.length; j++) {
        const w2 = walls[j]!;
        const sharesEndpoint =
          w1.startVertexId === w2.startVertexId ||
          w1.startVertexId === w2.endVertexId ||
          w1.endVertexId === w2.startVertexId ||
          w1.endVertexId === w2.endVertexId;

        const b1 = vertexMap.get(w2.startVertexId);
        const b2 = vertexMap.get(w2.endVertexId);
        if (!b1 || !b2) continue;

        // Duplicate identical or reversed segment
        if (
          (w1.startVertexId === w2.startVertexId && w1.endVertexId === w2.endVertexId) ||
          (w1.startVertexId === w2.endVertexId && w1.endVertexId === w2.startVertexId)
        ) {
          discrepancies.push({
            id: `disc-dup-${w1.id}-${w2.id}`,
            severity: 'ERROR',
            code: 'DUPLICATE_COLLINEAR_SEGMENT',
            message: 'Duplicate overlapping wall segment detected between identical vertices.',
            affectedEntityIds: [w1.id, w2.id],
          });
          continue;
        }

        if (!sharesEndpoint) {
          const hit = DiscrepancyEngine.segmentProperIntersection(a1, a2, b1, b2);
          if (hit) {
            discrepancies.push({
              id: `disc-intersect-${w1.id}-${w2.id}`,
              severity: 'ERROR',
              code: 'SELF_INTERSECTING_WALLS',
              message: `Walls cross without a shared junction vertex at (${Math.round(hit.x)}mm, ${Math.round(hit.y)}mm). Use Split Wall tool.`,
              affectedEntityIds: [w1.id, w2.id],
              pointMm: hit,
            });
          }
        }
      }
    }

    const hasErrors = discrepancies.some((d) => d.severity === 'ERROR');
    const hasWarnings = discrepancies.some((d) => d.severity === 'WARNING');

    return {
      discrepancies,
      hasErrors,
      hasWarnings,
    };
  }

  /**
   * Returns intersection point if segments (a -> b) and (c -> d) strictly intersect
   * (excluding endpoint touching).
   */
  public static segmentProperIntersection(
    a: Point2D,
    b: Point2D,
    c: Point2D,
    d: Point2D,
  ): Point2D | null {
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
        y: Math.round((a.y + t * rY) * 100) / 100,
      };
    }
    return null;
  }
}

