export type TaskStatus = 'NOT_STARTED' | 'PENDING' | 'ASSIGNED' | 'IN_PROGRESS' | 'PAUSED' | 'PENDING_INSPECTION' | 'COMPLETED';
export type SurfaceType = 'WALL' | 'CEILING' | 'DOOR' | 'WINDOW' | 'METAL' | 'WOOD' | 'EXTERIOR' | 'OTHER';
export type IndentUrgency = 'Normal' | 'Urgent';
export type IndentStatus = 'PENDING_APPROVAL' | 'APPROVED_DISPATCHED' | 'REJECTED';
export type OrderStatus = 'PENDING_STORE_ORDER' | 'ORDERED' | 'DELIVERED_AT_SITE';
export type ProjectWorkflowStatus = 'SURVEY_COMPLETE' | 'BOM_GENERATED' | 'PROCUREMENT_IN_PROGRESS' | 'LIVE_EXECUTION' | 'COMPLETED';
export type PhotoAuditStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
export type JoineryType = 'DOOR' | 'WINDOW' | 'GRILL' | 'SHUTTER' | 'OTHER';

export interface FinishingStep {
  id: string;
  name: string;
  surface: string;
  surfaceType?: SurfaceType;
  coatNumber?: number;
  status: TaskStatus;
  progressPct?: number;
  painterIds?: string[];
  qaVerified?: boolean;
  beforePhotoUrl?: string;
  afterPhotoUrl?: string;
  beforePhoto?: string;
  afterPhoto?: string;
  completionPhoto?: string;
  beforePhotoAt?: number;
  afterPhotoAt?: number;
  completedAt?: number;
  photoGpsVerified?: boolean;
  photoAuditStatus?: PhotoAuditStatus;
  proofPhotos?: string[];
  brand?: string;
  productLine?: string;
  stepSqft?: number;
  stepNumber?: number;
  areaCompleted?: number;
  completedSqft?: number;
  consumedQuantity?: number;
  pauseReason?: string;
  scheduledDate?: string;
  estimatedDurationDays?: number;
  startedAt?: number;
  /** Set when a supervisor assigns painters to this step (used by the Painter Portal agenda). */
  assignedAt?: number;
  assignedBy?: string;
  /** Set ONLY when a supervisor explicitly rejects / sends the step back for rework. */
  reworkRequestedAt?: number;
  reworkReason?: string;
  reworkCount?: number;
  /** Supervisor approval audit trail. */
  approvedBy?: string;
  approvedAt?: number;
  /** Target area (sqft) the step is expected to cover — resolved from room/side area when absent. */
  targetSqft?: number;
  /** Supervisor-allocated target hours (manual override of system estimate). */
  targetHours?: number;
  /** True for steps generated from the imported exteriorWork block. */
  isExterior?: boolean;
  /** Originating exterior treatment id (when isExterior). */
  sourceTreatmentId?: string;
  /** True when this step is active/enabled in the project schedule. */
  enabled?: boolean;
}

export interface Room {
  id: string;
  name: string;
  type?: string;
  /** Raw measured area (sqft). Mirrors incoming `sqft`/`areaSqft` so legacy imports always carry a numeric area. */
  sqft?: number;
  totalSqft?: number;
  netWallSqft?: number;
  interiorSqft?: number;
  exteriorSqft?: number;
  doorsCount?: number;
  windowsCount?: number;
  finishingSteps: FinishingStep[];
  /** True for exterior walls/sides surfaced as a room in the floor/zone navigation. */
  isExterior?: boolean;
  /** Originating exterior side id (when isExterior). */
  sourceSideId?: string;
  condition?: string;
}

export interface Floor {
  id: string;
  name: string;
  level?: number;
  rooms: Room[];
  /** True for the synthetic Exterior zone built from exteriorWork.sides. */
  isExterior?: boolean;
}

export interface MaterialItem {
  id: string;
  name: string;
  category?: string;
  brand?: string;
  totalRequiredQty?: number;
  unit?: string;
  packSize?: string;
  vendorName?: string;
  vendorId?: string;
  unitCost?: number;
  orderedQty?: number;
  deliveredQty?: number;
  orderStatus?: OrderStatus;
}

export interface Vendor {
  id: string;
  storeName: string;
  ownerName?: string;
  phone?: string;
  address?: string;
  brands?: string[];
  creditDays?: number;
  gstin?: string;
  contactPerson?: string;
  distanceKm?: number;
  minDeliveryHours?: number;
  whatsappNumber?: string;
}

export interface VendorOrder {
  id: string;
  materialId: string;
  materialName: string;
  vendorName: string;
  orderQty: number;
  unit?: string;
  status: OrderStatus;
  orderedAt: string;
  deliveredAt?: string;
  notes?: string;
}

export interface CustomerDetails {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
}

export interface ProjectDetails {
  name?: string;
  status?: string;
  workflowStatus?: ProjectWorkflowStatus;
  totalSqft?: number;
  estimatedDays?: number;
  actualDays?: number;
  startDate?: string;
  endDate?: string;
  totalBudget?: number;
  totalMaterialCost?: number;
  totalLaborCost?: number;
  estimatedProfitMargin?: number;
  dailyPainterRate?: number;
  /** ISO timestamp the project was first created. Used as the source-of-truth
   *  for default start/end dates and the "current year" reference across the
   *  Overview tab — never hardcode a year here. */
  createdAt?: string;
}

export interface SummaryMetrics {
  totalInteriorSqft?: number;
  totalExteriorSqft?: number;
  totalDoorsWindowsQty?: number;
  estimatedTotalDays?: number;
  estimatedWorkersPerDay?: number;
}

export interface ExteriorTreatment {
  id: string;
  name: string;
  status?: TaskStatus;
  brand?: string;
  productLine?: string;
}

export interface ExteriorSide {
  id: string;
  name: string;
  label?: string;
  areaSqft?: number;
  /** Net (paintable) square footage for the side — used by the Floor Breakdown Exterior card. */
  netSqft?: number;
  condition?: string;
  treatments?: ExteriorTreatment[];
  /** Flattened finishing steps for the side — used by the Floor Breakdown Exterior card. */
  finishingSteps?: FinishingStep[];
}

export interface ExteriorWork {
  totalAreaSqft?: number;
  sides?: ExteriorSide[];
}

export interface WoodAndMetalItem {
  id: string;
  name: string;
  type: JoineryType;
  dimensions?: string;
  width?: number;
  height?: number;
  totalSqft?: number;
  finishType?: string;
  count?: number;
  status?: TaskStatus;
}

export interface WallpaperItem {
  id: string;
  name: string;
  rolls?: number;
  roomName?: string;
  areaSqft?: number;
  totalSqft?: number;
  brand?: string;
}

export interface TextureItem {
  id: string;
  name: string;
  textureType?: string;
  areaSqft?: number;
  totalSqft?: number;
  roomName?: string;
  brand?: string;
}

export interface SpecialFeatures {
  wallpapers?: WallpaperItem[];
  textures?: TextureItem[];
}

export type SupervisorSessionState = 'LOGGED_OUT' | 'LOGGED_IN';

export interface Supervisor {
  id: string;
  name: string;
  role?: string;
  phone?: string;
  email?: string;
  /** Live presence for admin tracking (mirrors painter clock-in behaviour). */
  sessionState?: SupervisorSessionState;
  loginAt?: number;
  logoutAt?: number;
  lastActiveAt?: number;
  totalSessionMs?: number;
  siteLabel?: string;
}

/** One supervisor login → logout window. */
export interface SupervisorSession {
  id: string;
  supervisorId: string;
  supervisorName: string;
  loginAt: number;
  logoutAt?: number;
  durationMs?: number;
  date: string;
  siteLabel?: string;
  actionCount?: number;
}

export type SupervisorActivityType =
  | 'LOGIN'
  | 'LOGOUT'
  | 'ASSIGN_PAINTER'
  | 'ALLOCATE_TARGET'
  | 'APPROVE_QUALITY'
  | 'REJECT_REWORK'
  | 'QA_SIGNOFF'
  | 'SCHEDULE_UPDATE'
  | 'DAILY_LOG';

/** Append-only supervisor activity log used by the Admin audit trail. */
export interface SupervisorActivityLog {
  id: string;
  supervisorId: string;
  supervisorName: string;
  type: SupervisorActivityType;
  detail: string;
  at: number;
  date: string;
}

export type ClockState = 'CLOCKED_OUT' | 'CLOCKED_IN' | 'ON_BREAK';

export interface Painter {
  id: string;
  name: string;
  phone?: string;
  checkedIn?: boolean;
  clockState?: ClockState;
  clockInAt?: number;
  clockOutAt?: number;
  breakStartAt?: number;
  totalBreakMs?: number;
  gpsVerified?: boolean;
  siteLabel?: string;
}

export interface DailyTarget {
  id: string;
  painterId: string;
  floorId: string;
  roomId: string;
  stepId: string;
  targetSqft: number;
  /** Supervisor-allocated target hours (manual override of system estimate). */
  targetHours?: number;
  date: string;
  achievedSqft?: number;
  status: 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED';
  assignedAt?: number;
  assignedBy?: string;
}

export interface MaterialConsumptionEntry {
  materialId: string;
  materialName: string;
  quantityUsed: number;
  unit?: string;
}

export interface DailyLog {
  id: string;
  supervisorId: string;
  supervisorName: string;
  date: string;
  attendanceCount: number;
  notes?: string;
  issues?: string;
  consumption: MaterialConsumptionEntry[];
  submittedAt: string;
}

export interface QaChecklist {
  surfaceSanded: boolean;
  uniformCoverage: boolean;
  noRollerMarks: boolean;
  edgesTrimClean: boolean;
}

export interface QaRecord {
  id: string;
  stepId: string;
  floorId: string;
  roomId: string;
  checklist: QaChecklist;
  beforePhotoUrl?: string;
  afterPhotoUrl?: string;
  proofPhotos?: string[];
  approvedBy: string;
  approvedAt: string;
}

export interface PaintProject {
  id: string;
  projectDetails: ProjectDetails;
  customerDetails: CustomerDetails;
  summaryMetrics?: SummaryMetrics;
  exteriorWork?: ExteriorWork;
  floors: Floor[];
  materialBillOfQuantities: MaterialItem[];
  materials?: any[];
  woodAndMetalItems?: WoodAndMetalItem[];
  specialFeatures?: SpecialFeatures;
  leadSupervisorId?: string;
  leadSupervisor?: string;
  supervisorName?: string;
  supervisor?: string;
  assignedSupervisor?: { id?: string; name?: string };
  interiorSqft?: number;
  exteriorSqft?: number;
  supervisors?: Supervisor[];
  painters?: Painter[];
  vendors?: Vendor[];
  vendorOrders?: VendorOrder[];
  dailyLogs?: DailyLog[];
  qaRecords?: QaRecord[];
  dailyTargets?: DailyTarget[];
  supervisorSessions?: SupervisorSession[];
  supervisorActivity?: SupervisorActivityLog[];
}
