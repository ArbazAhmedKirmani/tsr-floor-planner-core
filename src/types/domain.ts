/**
 * @tsr/floor-planner-core — Comprehensive Domain Model & DTOs
 * Single Source of Truth (SSOT) for 2D CAD Geometry, Procedural 3D Extrusion,
 * RICS/BCIS/EPC Area Calculations, and TSR Defect Survey Mapping.
 *
 * Coordinate Convention:
 * - All linear lengths/coordinates (x, y, z, thickness, height) are in millimeters (mm)
 *   unless explicitly noted (e.g., area in m²).
 */

export type UUID = string;

export interface Point2D {
  x: number;
  y: number;
}

export interface Point3D extends Point2D {
  z: number;
}

/**
 * RICS Home Survey Standard Condition Ratings:
 * - CR1: No repair is currently needed.
 * - CR2: Defects that need repairing or replacing but are not considered to be either serious or urgent.
 * - CR3: Defects that are serious and/or need to be repaired, replaced or investigated urgently.
 * - NI: Not Inspected.
 */
export type ConditionRating = 'CR1' | 'CR2' | 'CR3' | 'NI';

/**
 * Standard TSR (The Survey Reporter) RICS Report Section Deep-Link Codes
 */
export type TSRReportSectionCode =
  | 'D1_CHIMNEY_STACKS'
  | 'D2_ROOF_COVERINGS'
  | 'D3_RAINWATER_PIPES_GUTTERS'
  | 'D4_MAIN_WALLS'
  | 'D5_WINDOWS'
  | 'D6_OUTSIDE_DOORS'
  | 'D7_CONSERVATORY_PORCH'
  | 'D8_OTHER_JOINERY_FINISHES'
  | 'E1_ROOF_STRUCTURE'
  | 'E2_CEILINGS'
  | 'E3_WALLS_AND_PARTITIONS'
  | 'E4_FLOORS'
  | 'E5_FIREPLACES_CHIMNEY_BREASTS'
  | 'E6_BUILT_IN_FITTINGS'
  | 'E7_WOODWORK'
  | 'E8_BATHROOM_FITTINGS'
  | 'E9_OTHER_INTERNAL'
  | 'F1_ELECTRICITY'
  | 'F2_GAS_OIL'
  | 'F3_WATER'
  | 'F4_HEATING'
  | 'F5_WATER_HEATING'
  | 'F6_DRAINAGE';

export interface TSRReportSectionRef {
  code: TSRReportSectionCode;
  label: string; // e.g., "E3 Walls and partitions"
  paragraphAnchorId?: string;
}

export interface Vertex {
  id: UUID;
  x: number; // mm
  y: number; // mm
  locked?: boolean;
  updatedAt: string; // ISO-8601
}

export type WallType =
  | 'EXTERNAL_CAVITY'
  | 'EXTERNAL_SOLID'
  | 'INTERNAL_LOAD_BEARING'
  | 'INTERNAL_STUD_PARTITION'
  | 'PARTY_WALL'
  | 'RETAINING_WALL';

export type typeOpeningKind = 'DOOR_SINGLE' | 'DOOR_DOUBLE' | 'DOOR_BIFOLD' | 'DOOR_SLIDING' | 'WINDOW_CASEMENT' | 'WINDOW_SASH' | 'WINDOW_BAY' | 'ARCHWAY';

export interface OpeningFeature {
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

export type InternalFeatureKind =
  | 'STAIRCASE_STRAIGHT'
  | 'STAIRCASE_WINDER'
  | 'CHIMNEY_BREAST'
  | 'FIREPLACE'
  | 'KITCHEN_ISLAND'
  | 'BOILER_UNIT'
  | 'CONSUMER_UNIT'
  | 'RADIATOR'
  | 'SANITARY_WC'
  | 'SANITARY_BASIN'
  | 'SANITARY_BATH'
  | 'SANITARY_SHOWER'
  | 'ROOF_LIGHT';

export interface InternalFeature {
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

export interface WallEdge {
  id: UUID;
  floorLevelId: UUID;
  startVertexId: UUID;
  endVertexId: UUID;
  thicknessMm: number; // e.g., 300mm external cavity, 100mm internal partition
  heightMm: number; // e.g., 2400mm standard storey height
  wallType: WallType;
  isExternalPerimeter: boolean;
  openings: OpeningFeature[];
  materialDescription?: string;
  updatedAt: string;
}

export type RoomCategory =
  | 'HABITABLE_LIVING'
  | 'HABITABLE_BEDROOM'
  | 'KITCHEN'
  | 'BATHROOM_WC'
  | 'CIRCULATION_HALL_LANDING'
  | 'UTILITY_PLANT'
  | 'CONSERVATORY'
  | 'GARAGE_INTEGRAL'
  | 'GARAGE_DETACHED'
  | 'PORCH_EXTERNAL'
  | 'BALCONY_TERRACE'
  | 'VOID_ATRIUM'
  | 'PLANT_EXTERNAL_STORE';

export interface InclusionRulesConfig {
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

export interface RoomSpace {
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

export interface MediaAttachment {
  id: UUID;
  defectPinId: UUID;
  mediaType: 'PHOTO' | 'VOICE_MEMO' | 'THERMAL_IMAGE' | 'MOISTURE_READING';
  localUri: string;
  remoteS3Key?: string;
  mimeType: string;
  durationMs?: number; // For voice memos
  caption?: string;
  capturedAt: string;
  syncStatus: 'LOCAL_ONLY' | 'UPLOADING' | 'SYNCED' | 'FAILED';
}

export interface DefectPin {
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
  dampMeterReadingWme?: number; // Wood Moisture Equivalent %
  crackWidthMm?: number; // BRE Digest 251 category metric
  media: MediaAttachment[];
  createdByUserId: string;
  updatedAt: string;
  version: number;
}

export interface FloorAreaSummary {
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

export interface FloorLevel {
  id: UUID;
  projectId: UUID;
  name: string; // e.g., "Ground Floor", "First Floor"
  levelIndex: number; // 0 = Ground, 1 = First, -1 = Basement
  elevationMm: number; // Z-offset from datum (0mm for Ground Floor)
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

export interface PlanProject {
  id: UUID;
  surveyReference: string; // e.g., "TSR-2026-08491"
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

export type DiscrepancySeverity = 'INFO' | 'WARNING' | 'ERROR';

export type DiscrepancyCode =
  | 'OPEN_PERIMETER_VERTEX'
  | 'SELF_INTERSECTING_WALLS'
  | 'DUPLICATE_COLLINEAR_SEGMENT'
  | 'UNCLOSED_ROOM_POLYGON'
  | 'AREA_DISCREPANCY_GAP';

export interface DiscrepancyWarning {
  id: string;
  severity: DiscrepancySeverity;
  code: DiscrepancyCode;
  message: string;
  affectedEntityIds: UUID[];
  pointMm?: Point2D;
}

export type SyncEntityType =
  | 'PROJECT'
  | 'FLOOR_LEVEL'
  | 'VERTEX'
  | 'WALL_EDGE'
  | 'ROOM_SPACE'
  | 'INTERNAL_FEATURE'
  | 'DEFECT_PIN'
  | 'MEDIA_ATTACHMENT';

export type SyncOperationType = 'UPSERT' | 'DELETE';

export interface SyncMutationRecord<TPayload = Record<string, unknown>> {
  mutationId: UUID;
  projectId: UUID;
  entityType: SyncEntityType;
  entityId: UUID;
  operation: SyncOperationType;
  clientTimestamp: string; // ISO-8601
  baseVersion: number;
  deviceId: string;
  payload: TPayload;
}
