/**
 * @tsr/floor-planner-core — Comprehensive Domain Model & DTOs
 * Single Source of Truth (SSOT) for 2D CAD Geometry, Procedural 3D Extrusion,
 * RICS/BCIS/EPC Area Calculations, and TSR Defect Survey Mapping.
 *
 * Coordinate Convention:
 * - All linear lengths/coordinates (x, y, z, thickness, height) are in millimeters (mm)
 *   unless explicitly noted (e.g., area in m²).
 */
type UUID = string;
interface Point2D {
    x: number;
    y: number;
}
interface Point3D extends Point2D {
    z: number;
}
/**
 * RICS Home Survey Standard Condition Ratings:
 * - CR1: No repair is currently needed.
 * - CR2: Defects that need repairing or replacing but are not considered to be either serious or urgent.
 * - CR3: Defects that are serious and/or need to be repaired, replaced or investigated urgently.
 * - NI: Not Inspected.
 */
type ConditionRating = 'CR1' | 'CR2' | 'CR3' | 'NI';
/**
 * Standard TSR (The Survey Reporter) RICS Report Section Deep-Link Codes
 */
type TSRReportSectionCode = 'D1_CHIMNEY_STACKS' | 'D2_ROOF_COVERINGS' | 'D3_RAINWATER_PIPES_GUTTERS' | 'D4_MAIN_WALLS' | 'D5_WINDOWS' | 'D6_OUTSIDE_DOORS' | 'D7_CONSERVATORY_PORCH' | 'D8_OTHER_JOINERY_FINISHES' | 'E1_ROOF_STRUCTURE' | 'E2_CEILINGS' | 'E3_WALLS_AND_PARTITIONS' | 'E4_FLOORS' | 'E5_FIREPLACES_CHIMNEY_BREASTS' | 'E6_BUILT_IN_FITTINGS' | 'E7_WOODWORK' | 'E8_BATHROOM_FITTINGS' | 'E9_OTHER_INTERNAL' | 'F1_ELECTRICITY' | 'F2_GAS_OIL' | 'F3_WATER' | 'F4_HEATING' | 'F5_WATER_HEATING' | 'F6_DRAINAGE';
interface TSRReportSectionRef {
    code: TSRReportSectionCode;
    label: string;
    paragraphAnchorId?: string;
}
interface Vertex {
    id: UUID;
    x: number;
    y: number;
    locked?: boolean;
    updatedAt: string;
}
type WallType = 'EXTERNAL_CAVITY' | 'EXTERNAL_SOLID' | 'INTERNAL_LOAD_BEARING' | 'INTERNAL_STUD_PARTITION' | 'PARTY_WALL' | 'RETAINING_WALL';
type typeOpeningKind = 'DOOR_SINGLE' | 'DOOR_DOUBLE' | 'DOOR_BIFOLD' | 'DOOR_SLIDING' | 'WINDOW_CASEMENT' | 'WINDOW_SASH' | 'WINDOW_BAY' | 'ARCHWAY';
interface OpeningFeature {
    id: UUID;
    wallEdgeId: UUID;
    kind: typeOpeningKind;
    /** Parametric offset from startVertex along the wall centerline in [0, 1] */
    tCenter: number;
    widthMm: number;
    heightMm: number;
    sillHeightMm: number;
    swingDirection?: 'LEFT_IN' | 'LEFT_OUT' | 'RIGHT_IN' | 'RIGHT_OUT' | 'NONE';
    uValue?: number;
    glazingType?: 'SINGLE' | 'DOUBLE' | 'TRIPLE' | 'SECONDARY';
    updatedAt: string;
}
type InternalFeatureKind = 'STAIRCASE_STRAIGHT' | 'STAIRCASE_WINDER' | 'CHIMNEY_BREAST' | 'FIREPLACE' | 'KITCHEN_ISLAND' | 'BOILER_UNIT' | 'CONSUMER_UNIT' | 'RADIATOR' | 'SANITARY_WC' | 'SANITARY_BASIN' | 'SANITARY_BATH' | 'SANITARY_SHOWER' | 'ROOF_LIGHT';
interface InternalFeature {
    id: UUID;
    floorLevelId: UUID;
    roomSpaceId?: UUID;
    kind: InternalFeatureKind;
    label: string;
    position: Point2D;
    rotationDeg: number;
    widthMm: number;
    depthMm: number;
    heightMm: number;
    deductFromGia: boolean;
    updatedAt: string;
}
interface WallEdge {
    id: UUID;
    floorLevelId: UUID;
    startVertexId: UUID;
    endVertexId: UUID;
    thicknessMm: number;
    heightMm: number;
    wallType: WallType;
    isExternalPerimeter: boolean;
    openings: OpeningFeature[];
    materialDescription?: string;
    updatedAt: string;
}
type RoomCategory = 'HABITABLE_LIVING' | 'HABITABLE_BEDROOM' | 'KITCHEN' | 'BATHROOM_WC' | 'CIRCULATION_HALL_LANDING' | 'UTILITY_PLANT' | 'CONSERVATORY' | 'GARAGE_INTEGRAL' | 'GARAGE_DETACHED' | 'PORCH_EXTERNAL' | 'BALCONY_TERRACE' | 'VOID_ATRIUM' | 'PLANT_EXTERNAL_STORE';
interface InclusionRulesConfig {
    /** Include in RICS Gross Internal Area (GIA) */
    includeInGia: boolean;
    /** Include in RICS Gross External Area (GEA) */
    includeInGea: boolean;
    /** Include in BCIS Reinstatement Cost Assessment floor area */
    includeInBcis: boolean;
    /** Include in RdSAP / EPC Total Floor Area (heated habitable envelope) */
    includeInEpc: boolean;
    /** Whether thermally separated from main dwelling (impacts Conservatory EPC rule) */
    isThermallySeparated: boolean;
    /** Whether space is heated by fixed heating system */
    isHeated: boolean;
}
interface RoomSpace {
    id: UUID;
    floorLevelId: UUID;
    name: string;
    category: RoomCategory;
    /** Ordered cycle of vertex IDs (counter-clockwise in standard math coords) */
    boundaryVertexIds: UUID[];
    /** Ordered cycle of directed wall edge IDs bounding this room */
    boundaryWallEdgeIds: UUID[];
    /** Computed inner face offset polygon vertices in mm */
    innerPolygonMm: Point2D[];
    /** Computed centerline polygon vertices in mm */
    centerlinePolygonMm: Point2D[];
    ceilingHeightMm: number;
    /** Percentage of room area with headroom < 1500mm (for RICS loft/mansard notes) */
    reducedHeadroomRatio?: number;
    inclusionRules: InclusionRulesConfig;
    computedGiaSqm: number;
    computedCenterlineAreaSqm: number;
    updatedAt: string;
}
interface MediaAttachment {
    id: UUID;
    defectPinId: UUID;
    mediaType: 'PHOTO' | 'VOICE_MEMO' | 'THERMAL_IMAGE' | 'MOISTURE_READING';
    localUri: string;
    remoteS3Key?: string;
    mimeType: string;
    durationMs?: number;
    caption?: string;
    capturedAt: string;
    syncStatus: 'LOCAL_ONLY' | 'UPLOADING' | 'SYNCED' | 'FAILED';
}
interface DefectPin {
    id: UUID;
    projectId: UUID;
    floorLevelId: UUID;
    /** Optional anchor to a specific structural wall */
    wallEdgeId?: UUID;
    /** Optional anchor to a detected room space */
    roomSpaceId?: UUID;
    /** 3D position in mm (x, y on floor plan, z elevation from floor finish level) */
    position: Point3D;
    /** Canvas label callout offset in mm relative to pin position */
    calloutOffset: Point2D;
    title: string;
    description: string;
    conditionRating: ConditionRating;
    reportSection: TSRReportSectionRef;
    dampMeterReadingWme?: number;
    crackWidthMm?: number;
    media: MediaAttachment[];
    createdByUserId: string;
    updatedAt: string;
    version: number;
}
interface FloorAreaSummary {
    floorLevelId: UUID;
    geaSqm: number;
    giaSqm: number;
    bcisAreaSqm: number;
    epcTotalFloorAreaSqm: number;
    netInternalAreaSqm: number;
    externalPerimeterMeters: number;
    roomBreakdowns: Array<{
        roomId: UUID;
        roomName: string;
        category: RoomCategory;
        giaSqm: number;
        includedInBcis: boolean;
        includedInEpc: boolean;
    }>;
}
interface FloorLevel {
    id: UUID;
    projectId: UUID;
    name: string;
    levelIndex: number;
    elevationMm: number;
    defaultWallHeightMm: number;
    defaultExternalWallThicknessMm: number;
    defaultInternalWallThicknessMm: number;
    vertices: Vertex[];
    walls: WallEdge[];
    rooms: RoomSpace[];
    internalFeatures: InternalFeature[];
    defectPins: DefectPin[];
    areaSummary?: FloorAreaSummary;
    updatedAt: string;
    version: number;
}
interface PlanProject {
    id: UUID;
    surveyReference: string;
    propertyAddress: string;
    postcode: string;
    clientName: string;
    ricsSurveyLevel: 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3';
    uprn?: string;
    levels: FloorLevel[];
    createdAt: string;
    updatedAt: string;
    lastSyncedSequence: number;
}
type DiscrepancySeverity = 'INFO' | 'WARNING' | 'ERROR';
type DiscrepancyCode = 'OPEN_PERIMETER_VERTEX' | 'SELF_INTERSECTING_WALLS' | 'DUPLICATE_COLLINEAR_SEGMENT' | 'UNCLOSED_ROOM_POLYGON' | 'AREA_DISCREPANCY_GAP';
interface DiscrepancyWarning {
    id: string;
    severity: DiscrepancySeverity;
    code: DiscrepancyCode;
    message: string;
    affectedEntityIds: UUID[];
    pointMm?: Point2D;
}
type SyncEntityType = 'PROJECT' | 'FLOOR_LEVEL' | 'VERTEX' | 'WALL_EDGE' | 'ROOM_SPACE' | 'INTERNAL_FEATURE' | 'DEFECT_PIN' | 'MEDIA_ATTACHMENT';
type SyncOperationType = 'UPSERT' | 'DELETE';
interface SyncMutationRecord<TPayload = Record<string, unknown>> {
    mutationId: UUID;
    projectId: UUID;
    entityType: SyncEntityType;
    entityId: UUID;
    operation: SyncOperationType;
    clientTimestamp: string;
    baseVersion: number;
    deviceId: string;
    payload: TPayload;
}

interface DirectedHalfEdge {
    id: string;
    wallEdgeId: UUID;
    originVertexId: UUID;
    targetVertexId: UUID;
    twinHalfEdgeId: string;
    /** Angle in radians (-PI, PI] from origin to target */
    angleRad: number;
    thicknessMm: number;
}
interface DetectedFaceCycle {
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
declare class PlanarGraph {
    private vertices;
    private walls;
    private readonly floorLevelId;
    constructor(floorLevelId: UUID, initialVertices?: Vertex[], initialWalls?: WallEdge[]);
    getVertices(): Vertex[];
    getVertex(id: UUID): Vertex | undefined;
    getWalls(): WallEdge[];
    getWall(id: UUID): WallEdge | undefined;
    upsertVertex(vertex: Vertex): Vertex;
    moveVertex(vertexId: UUID, newPos: Point2D): Vertex | undefined;
    addWall(params: {
        id: UUID;
        startVertexId: UUID;
        endVertexId: UUID;
        thicknessMm: number;
        heightMm: number;
        wallType?: WallType;
        isExternalPerimeter?: boolean;
    }): WallEdge;
    updateWallThickness(wallId: UUID, thicknessMm: number): WallEdge | undefined;
    /**
     * Splits an existing WallEdge at `splitPoint` (creating a new Vertex or reusing `splitVertexId`)
     * and returns the new vertex plus the two resulting WallEdges.
     * Opening features are proportionally re-parameterized onto the appropriate child segment.
     */
    splitWallAtPoint(wallId: UUID, splitPoint: Point2D, newVertexId: UUID, firstWallId: UUID, secondWallId: UUID, endpointSnapToleranceMm?: number): {
        splitVertex: Vertex;
        walls: [WallEdge, WallEdge] | [WallEdge];
    };
    /**
     * Merges two walls that share a degree-2 vertex and are collinear within `angleToleranceDeg`.
     */
    mergeCollinearWallsAtVertex(sharedVertexId: UUID, mergedWallId: UUID, angleToleranceDeg?: number): WallEdge | null;
    static extractMinimalFaces(vertices: readonly Vertex[], walls: readonly WallEdge[]): DetectedFaceCycle[];
    static syncRooms(params: {
        floorLevelId: UUID;
        vertices: readonly Vertex[];
        walls: readonly WallEdge[];
        existingRooms?: RoomSpace[];
    }): RoomSpace[];
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
    detectInteriorRoomCycles(): DetectedFaceCycle[];
    /**
     * Synchronizes detected planar cycles into `RoomSpace` domain objects,
     * preserving existing room names/categories when boundary vertices overlap.
     */
    buildRoomSpaces(existingRooms?: RoomSpace[]): RoomSpace[];
}

type SnapKind = 'VERTEX' | 'EDGE_PROJECTION' | 'AXIS_ALIGNMENT' | 'ANGLE_CONSTRAINT' | 'GRID' | 'RAW';
interface SnapConfig {
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
interface SnapResult {
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
declare const DEFAULT_SNAP_CONFIG: SnapConfig;
/**
 * High-precision CAD Snapping Solver for 2D Wall & Feature placement.
 * Priority Order:
 * 1. Existing Vertex magnetic snap (`VERTEX`)
 * 2. Orthogonal X/Y alignment with existing vertices (`AXIS_ALIGNMENT`)
 * 3. Wall Edge perpendicular projection (`EDGE_PROJECTION`)
 * 4. 0° / 45° / 90° / 135° / 180° polar angle constraint relative to active drawing anchor (`ANGLE_CONSTRAINT`)
 * 5. Metric Grid quantization (`GRID`)
 */
declare class SnapSolver {
    private config;
    constructor(config?: Partial<SnapConfig>);
    updateConfig(partial: Partial<SnapConfig>): void;
    getConfig(): SnapConfig;
    static solveSnap(params: {
        rawPoint: Point2D;
        vertices: readonly Vertex[];
        walls: readonly WallEdge[];
        anchorPoint?: Point2D;
        excludeVertexIds?: ReadonlySet<UUID>;
        config?: Partial<SnapConfig>;
    }): SnapResult;
    /**
     * Resolves a raw cursor point (in mm) to the highest-priority geometric snap target.
     */
    solve(rawPoint: Point2D, vertices: readonly Vertex[], walls: readonly WallEdge[], anchorPoint?: Point2D, excludeVertexIds?: ReadonlySet<UUID>): SnapResult;
    /**
     * Computes a point at an exact distance (e.g., from a BLE laser distance meter)
     * along the current vector from `anchorPoint` to `cursorPoint` (with angle snapping).
     */
    applyLaserDistanceFromAnchor(anchorPoint: Point2D, cursorPoint: Point2D, laserDistanceMm: number): Point2D;
    private quantizeToGrid;
    /**
     * Locks vector (anchor -> target) to nearest multiple of 45° (0°, ±45°, ±90°, ±135°, 180°)
     * when within `angleSnapToleranceDeg`.
     */
    private applyAngleConstraint;
    private computePolarMetrics;
    static projectPointOntoSegment(p: Point2D, a: Point2D, b: Point2D): {
        point: Point2D;
        t: number;
        distance: number;
    };
}

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
declare class AreaEngine {
    private static readonly MM2_PER_SQM;
    /**
     * Computes signed area in square millimeters (mm²) via the Shoelace formula:
     * A = 0.5 * sum_{i=0}^{n-1} (x_i * y_{i+1} - x_{i+1} * y_i)
     * Positive when vertices are ordered counter-clockwise (CCW) in standard Cartesian coordinates.
     */
    static computeSignedPolygonAreaMm2(polygon: readonly Point2D[]): number;
    /**
     * Computes unsigned area in square meters (m²) rounded to 2 decimal places.
     */
    static computePolygonAreaSqm(polygon: readonly Point2D[]): number;
    static mm2ToSqm(areaMm2: number): number;
    static computePolygonPerimeterMeters(polygon: readonly Point2D[]): number;
    /**
     * Offsets a closed polygon inward (toward its interior) by `0.5 * wallThickness[i]`
     * along each edge `i = (v_i -> v_{i+1})`, computing mitered corner intersections.
     * Used to derive the true inner-face polygon (GIA) from wall centerlines.
     */
    static offsetPolygonInwardByWallThickness(centerlinePolygon: readonly Point2D[], edgeThicknessesMm: readonly number[]): Point2D[];
    /**
     * Offsets a closed polygon outward (away from its interior) by `0.5 * wallThickness[i]`
     * along each edge `i = (v_i -> v_{i+1})`, computing mitered corner intersections.
     * Used to derive the true outer-face building footprint (GEA) from external wall centerlines.
     */
    static offsetPolygonOutwardByWallThickness(centerlinePolygon: readonly Point2D[], edgeThicknessesMm: readonly number[]): Point2D[];
    private static offsetPolygonByHalfThickness;
    /**
     * Evaluates whether a RoomSpace is included in BCIS Reinstatement Cost floor area.
     * BCIS rules:
     * - Respects explicit surveyor toggle (`inclusionRules.includeInBcis`)
     * - Excludes open balconies/terraces and internal voids/atria by default
     */
    static isIncludedInBcis(room: RoomSpace): boolean;
    /**
     * Evaluates whether a RoomSpace is included in EPC (RdSAP) Total Floor Area.
     * RdSAP conventions:
     * - Respects explicit surveyor toggle (`inclusionRules.includeInEpc`)
     * - Excludes garages (integral or detached), external porches, balconies, voids, and external stores
     * - Excludes conservatories that are thermally separated from the main dwelling
     */
    static isIncludedInEpc(room: RoomSpace): boolean;
    /**
     * Computes complete RICS Code of Measuring Practice (6th Ed) / IPMS Floor Area Summary
     * for a given FloorLevel:
     * - GEA (Gross External Area): Area bounded by the outer face of external perimeter walls,
     *   or sum of outer-offset room footprints + internal partition footprints.
     * - GIA (Gross Internal Area): Area bounded by the internal face of external perimeter walls
     *   (sum of net room inner areas + internal partition wall footprints, minus GIA deductions).
     * - BCIS Area & EPC Total Floor Area with per-room inclusion rules applied.
     */
    static calculateFloorAreaSummary(params: {
        floorLevelId: UUID;
        vertices: readonly Vertex[];
        walls: readonly WallEdge[];
        rooms: readonly RoomSpace[];
        internalFeatures?: readonly InternalFeature[];
    }): FloorAreaSummary;
    /**
     * Ray-casting algorithm to test whether point pt is strictly inside or on the boundary of polygon.
     * Useful for room selection, defect pin mapping, and touch-hit tests.
     */
    static isPointInsidePolygon(pt: Point2D, polygon: readonly Point2D[]): boolean;
    /**
     * Computes the geometric centroid (center of mass) of any simple polygon.
     */
    static computePolygonCentroid(polygon: readonly Point2D[]): Point2D;
    /**
     * Proportional 2-Point scale calculation for calibrated blueprints & underlays:
     * scaleMmPerPx = currentScale * (targetRealWorldMm / measuredSpanMm)
     */
    static computeCalibrationScale(params: {
        currentScaleMmPerPx: number;
        measuredSpanMm: number;
        targetRealWorldMm: number;
    }): number;
    /**
     * Computes bounding centroid and span radius across multi-storey vertices/draft polygons
     * for automatic 3D & 2D camera viewport framing.
     */
    static computeBuildingBoundingBox(points: readonly Point2D[]): {
        minX: number;
        maxX: number;
        minY: number;
        maxY: number;
        centerX: number;
        centerY: number;
        spanMeters: number;
    };
}

interface DiscrepancyValidationResult {
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
declare class DiscrepancyEngine {
    /**
     * Evaluates graph topology against architectural integrity rules.
     */
    static validateTopology(vertices: readonly Vertex[], walls: readonly WallEdge[]): DiscrepancyValidationResult;
    /**
     * Returns intersection point if segments (a -> b) and (c -> d) strictly intersect
     * (excluding endpoint touching).
     */
    static segmentProperIntersection(a: Point2D, b: Point2D, c: Point2D, d: Point2D): Point2D | null;
}

export { AreaEngine, type ConditionRating, DEFAULT_SNAP_CONFIG, type DefectPin, type DetectedFaceCycle, type DirectedHalfEdge, type DiscrepancyCode, DiscrepancyEngine, type DiscrepancySeverity, type DiscrepancyValidationResult, type DiscrepancyWarning, type FloorAreaSummary, type FloorLevel, type InclusionRulesConfig, type InternalFeature, type InternalFeatureKind, type MediaAttachment, type OpeningFeature, type PlanProject, PlanarGraph, type Point2D, type Point3D, type RoomCategory, type RoomSpace, type SnapConfig, type SnapKind, type SnapResult, SnapSolver, type SyncEntityType, type SyncMutationRecord, type SyncOperationType, type TSRReportSectionCode, type TSRReportSectionRef, type UUID, type Vertex, type WallEdge, type WallType, type typeOpeningKind };
