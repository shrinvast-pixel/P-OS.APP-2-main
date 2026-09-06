import type { PaintProject } from '../types';
import { parseProjectJson } from '../parser';

/**
 * Paint Pro / Joplin Pro JSON importer.
 *
 * These exports use a flatter, room-centric shape that the main parser
 * (`parseProjectJson`) does not fully understand on its own:
 *   - the project identity lives at the *root* (`name` / `projectName` /
 *     `clientName`) or nested under `project`
 *   - rooms carry a single `sqft` / `areaSqft` / `area` field (not the
 *     `totalSqft` / `interiorArea` aliases the main parser reads), and an
 *     explicit `steps` / `treatments` array
 *   - legacy exports instead keep a `finishing` object (`putty` / `primer` /
 *     `paint` with `on` flags) and a `project`-wrapped hierarchy
 *
 * This module normalizes those quirks into the alias-rich shape the main parser
 * already accepts, then delegates to `parseProjectJson` so every downstream
 * surface (materials, exterior floor, supervisor resolution, …) works unchanged.
 */

type Json = Record<string, unknown>;

function asNum(v: unknown): number | undefined {
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return undefined;
}

function asStr(v: unknown): string | undefined {
  if (typeof v === 'string' && v.trim() !== '') return v;
  return undefined;
}

/** First positive number out of a list of candidates. */
function firstPositive(...values: unknown[]): number | undefined {
  for (const v of values) {
    const n = asNum(v);
    if (n != null && n > 0) return n;
  }
  return undefined;
}

interface LegacyFinishingItem {
  on?: boolean;
  area?: number;
  sqft?: number;
  product?: string;
  brand?: string;
  surface?: string;
  coats?: number;
  coatNumber?: number;
  [key: string]: unknown;
}

interface LegacyFinishing {
  putty?: LegacyFinishingItem;
  primer?: LegacyFinishingItem;
  paint?: LegacyFinishingItem;
  [key: string]: LegacyFinishingItem | undefined;
}

interface LegacyRoom {
  id?: string;
  name?: string;
  roomName?: string;
  type?: string;
  roomType?: string;
  sqft?: number;
  areaSqft?: number;
  totalSqft?: number;
  area?: number;
  interiorSqft?: number;
  interiorArea?: number;
  exteriorSqft?: number;
  exteriorArea?: number;
  finishing?: LegacyFinishing;
  finishingSteps?: unknown;
  steps?: unknown;
  treatments?: unknown;
  tasks?: unknown;
  [key: string]: unknown;
}

/**
 * Canonical coatings, used both for legacy `finishing`-based step generation and
 * as the default execution process when a room has neither steps nor finishing.
 */
const FINISH_ORDER: { key: string; label: string; coat: number }[] = [
  { key: 'putty', label: 'Putty Coat', coat: 1 },
  { key: 'primer', label: 'Primer Coat', coat: 1 },
  { key: 'paint', label: 'Emulsion Coat', coat: 2 },
];

/**
 * Resolve a room's area in sqft. Falls back to the largest `finishing` area
 * (putty → primer → paint) when the direct `sqft` / `areaSqft` / `area` field
 * is missing or resolves to 0.
 */
function resolveRoomSqft(room: LegacyRoom): number {
  const direct = firstPositive(room.sqft, room.areaSqft, room.totalSqft, room.area);
  if (direct != null) return direct;

  const finishing = (room.finishing ?? {}) as LegacyFinishing;
  for (const { key } of FINISH_ORDER) {
    const item = finishing[key];
    const fromFinishing = firstPositive(item?.area, item?.sqft);
    if (fromFinishing != null) return fromFinishing;
  }
  return 0;
}

/**
 * Auto-generate `finishingSteps` when a room has no explicit steps:
 *   1. If the room has a `finishing` object, emit a step for every treatment
 *      whose `on` flag is true.
 *   2. Otherwise fall back to the default execution process (Putty Coat,
 *      Primer Coat, Emulsion Coat).
 */
function generateStepsFromFinishing(room: LegacyRoom, roomSqft: number): Json[] {
  const finishing = (room.finishing ?? {}) as LegacyFinishing;
  const hasFinishing = Object.keys(finishing).length > 0;
  const surface = asStr(room.name) ?? asStr(room.roomName) ?? asStr(room.type) ?? 'Wall';
  const steps: Json[] = [];

  if (hasFinishing) {
    for (const { key, label, coat } of FINISH_ORDER) {
      const item = finishing[key];
      if (!item || item.on !== true) continue;
      steps.push({
        id: `gen-${key}`,
        name: label,
        surface,
        stepSqft: firstPositive(item.area, item.sqft) ?? (roomSqft > 0 ? roomSqft : undefined),
        coatNumber: item.coatNumber ?? item.coats ?? coat,
        status: 'NOT_STARTED',
        brand: asStr(item.brand),
        productLine: asStr(item.product),
      });
    }
  }

  if (steps.length === 0) {
    for (const { label, coat } of FINISH_ORDER) {
      steps.push({
        id: `gen-${label.toLowerCase().replace(/\s+/g, '-')}`,
        name: label,
        surface,
        stepSqft: roomSqft > 0 ? roomSqft : undefined,
        coatNumber: coat,
        status: 'NOT_STARTED',
      });
    }
  }

  return steps;
}

function mapLegacyRoom(raw: unknown): Json {
  const room = (raw ?? {}) as LegacyRoom;
  const sqft = resolveRoomSqft(room);

  const explicitSteps = room.steps ?? room.finishingSteps ?? room.treatments ?? room.tasks;
  const hasSteps = Array.isArray(explicitSteps) && explicitSteps.length > 0;
  const steps: unknown[] = hasSteps ? (explicitSteps as unknown[]) : generateStepsFromFinishing(room, sqft);

  return {
    ...room,
    name: asStr(room.name) ?? asStr(room.roomName) ?? asStr(room.type),
    type: asStr(room.type) ?? asStr(room.roomType),
    // Requirement 1: parsed room always carries a numeric sqft.
    sqft: Number(room.sqft ?? room.areaSqft ?? 0),
    totalSqft: firstPositive(room.sqft, room.areaSqft, room.totalSqft, room.area) ?? (sqft > 0 ? sqft : undefined),
    interiorSqft:
      firstPositive(room.interiorSqft, room.interiorArea, room.area, room.areaSqft, room.sqft) ??
      (sqft > 0 ? sqft : undefined),
    areaSqft: firstPositive(room.areaSqft, room.sqft) ?? (sqft > 0 ? sqft : undefined),
    exteriorSqft: asNum(room.exteriorSqft) ?? asNum(room.exteriorArea),
    // Requirement 2: keep explicit steps (or pass generated ones) so the main
    // parser always builds a non-empty `finishingSteps` array.
    steps,
  };
}

function extractFloors(obj: Json, project: Json): Json[] {
  const legacyFloors = obj.floors ?? obj.floorList ?? project.floors;
  if (Array.isArray(legacyFloors)) {
    return (legacyFloors as unknown[]).map((f, i) => {
      const floor = (f ?? {}) as Json;
      const rooms = (floor.rooms ?? floor.roomList ?? []) as unknown[];
      return {
        ...floor,
        name: asStr(floor.name) ?? asStr(floor.floorName) ?? `Floor ${i + 1}`,
        rooms: rooms.map(mapLegacyRoom),
      };
    });
  }

  const legacyRooms = obj.rooms ?? project.rooms;
  if (Array.isArray(legacyRooms)) {
    return [{ name: 'Floor 1', rooms: (legacyRooms as unknown[]).map(mapLegacyRoom) }];
  }

  return [];
}

function sumRoomSqft(floors: Json[], predicate?: (room: Json) => boolean): number {
  return floors.reduce((sum, f) => {
    const rooms = (f.rooms ?? []) as Json[];
    return (
      sum +
      rooms.reduce((rs, r) => {
        if (predicate && !predicate(r)) return rs;
        return rs + (firstPositive(r.sqft, r.totalSqft, r.interiorSqft) ?? 0);
      }, 0)
    );
  }, 0);
}

function isExteriorRoom(room: Json): boolean {
    const name = String(room.name ?? room.type ?? '').toLowerCase();
    const type = String((room as Json).type ?? '').toLowerCase();
    return name.includes('exterior') || name.includes('elevation') || type.includes('exterior');
}

/**
 * Normalize a legacy Joplin Pro / Paint Pro project object to ensure the
 * exteriorWork block is parsed correctly (both when it lives at the root and
 * when it is nested under the project key). This function:
 *   1. Extracts exteriorWork from either obj.exteriorWork or project.exteriorWork
 *   2. If no explicit treatments exist but sides have area > 0, generates default
 *      Putty, Primer, Emulsion treatments (2 coats each except Primer 1 coat)
 *   3. Ensures every exterior side emits at least one finishing step when area > 0
 */
function normalizeExteriorWork(obj: Json, project: Json): Json {
    // Prefer root-level exteriorWork, fall back to project-level
    const exteriorWork = (obj.exteriorWork ?? project.exteriorWork ?? {}) as Json;

    // If there's no exteriorWork at all, nothing to do
    if (!exteriorWork || Object.keys(exteriorWork).length === 0) {
        return obj;
    }

    // Work on a copy so we don't mutate the original
    const normalizedWork = { ...exteriorWork } as Json;

    // Ensure sides array exists
    const sides = (normalizedWork.sides ?? normalizedWork.sideList ?? []) as Json[];
    if (!Array.isArray(sides) || sides.length === 0) {
        // Nothing to normalize if there are no sides
        normalizedWork.sides = sides;
        return { ...obj, exteriorWork: normalizedWork };
    }

    // Process each side to ensure finishing steps exist when area > 0
    const processedSides = sides.map((side, index) => {
        const sideObj = (side ?? {}) as Json;
        const areaSqft = asNum(sideObj.areaSqft) ?? asNum(sideObj.area) ?? asNum(sideObj.sqft) ?? asNum(sideObj.totalSqft) ?? 0;

        // If area is 0 or less, keep as-is (no steps needed)
        if (areaSqft <= 0) {
            return sideObj;
        }

        // Check if there are already explicit treatments/steps
        const hasExplicitTreatments =
            Array.isArray(sideObj.treatments) && sideObj.treatments.length > 0;
        const hasExplicitSteps =
            Array.isArray(sideObj.steps) && sideObj.steps.length > 0;

        // If there are already explicit treatments or steps, keep as-is
        if (hasExplicitTreatments || hasExplicitSteps) {
            return sideObj;
        }

        // Generate default treatments: Putty (2 coats), Primer (1 coat), Emulsion (2 coats)
        const defaultTreatments: Json[] = [
            {
                id: `gen-putty-${index}`,
                name: 'Putty Coat',
                status: 'NOT_STARTED',
                brand: undefined,
                productLine: undefined,
            },
            {
                id: `gen-primer-${index}`,
                name: 'Primer Coat',
                status: 'NOT_STARTED',
                brand: undefined,
                productLine: undefined,
            },
            {
                id: `gen-emulsion-${index}`,
                name: 'Emulsion Coat',
                status: 'NOT_STARTED',
                brand: undefined,
                productLine: undefined,
            },
            {
                id: `gen-emulsion-${index}-2`,
                name: 'Emulsion Coat 2',
                status: 'NOT_STARTED',
                brand: undefined,
                productLine: undefined,
            },
        ];

        return {
            ...sideObj,
            treatments: defaultTreatments,
        };
    });

    // Put the processed sides back into the work object
    normalizedWork.sides = processedSides;

    // Return the object with normalized exteriorWork at the root level
    // (the main parser will find it here; we also keep it under project for safety)
    return {
        ...obj,
        exteriorWork: normalizedWork,
        // Also ensure it's available under project if that's where the parser might look
        project: {
            ...(obj.project ?? {}),
            exteriorWork: normalizedWork,
        },
    };
}

/**
 * Normalize a legacy Joplin Pro / Paint Pro project object into the shape
 * consumed by `parseProjectJson`. Returns the raw, normalized input so it can be
 * inspected or passed straight into the main parser.
 */
export function normalizeLegacyJoplinPro(raw: unknown): unknown {
  const obj = (raw ?? {}) as Json;
  const project = (obj.project ?? obj.projectInfo ?? obj.projectDetails ?? {}) as Json;
  const topCustomer = (obj.customer ?? obj.customerDetails ?? {}) as Json;
  const projCustomer = (project.customer ?? project.customerDetails ?? {}) as Json;
  const customer = { ...projCustomer, ...topCustomer } as Json;

  // Identity: root-level `name`/`projectName`/`clientName` OR nested under `project`.
  const projectName =
    asStr(obj.projectName) ?? asStr(obj.name) ?? asStr(obj.clientName) ?? asStr(project.projectName) ?? asStr(project.name);
  const clientName =
    asStr(obj.clientName) ?? asStr(obj.name) ?? asStr(obj.projectName) ?? asStr(project.clientName) ?? asStr(project.name);

  const floors = extractFloors(obj, project);

  // Ensure exteriorWork is properly normalized (extracted from root or project,
  // and sides with area > 0 but no treatments get default finishing steps).
  const withExterior = normalizeExteriorWork(obj, project);

  const rawTotal = firstPositive(obj.totalSqft, obj.totalArea, project.totalSqft, project.totalArea);
  const interiorSum = sumRoomSqft(floors, (r) => !isExteriorRoom(r));
  const exteriorSum = sumRoomSqft(floors, (r) => isExteriorRoom(r));
  const overallSum = interiorSum + exteriorSum;

  // Requirement 3: project total SqFt falls back to totalArea, then to the sum
  // of calculated room sqfts, when the root total is missing or 0.
  const resolvedTotal = rawTotal ?? (overallSum > 0 ? overallSum : undefined);

  const normalizedProject: Json = {
    ...project,
    ...withExterior,
    projectName: projectName ?? asStr(project.clientName) ?? asStr(customer.name),
    clientName,
    totalSqft: resolvedTotal,
    totalArea: asNum(obj.totalArea) ?? asNum(project.totalArea) ?? resolvedTotal,
  };

  const normalizedCustomer: Json = {
    ...customer,
    name: clientName ?? asStr(customer.name),
  };

  return {
    ...withExterior,
    project: normalizedProject,
    customer: normalizedCustomer,
    floors,
  };
}

/**
 * Parse a legacy Joplin Pro / Paint Pro JSON export into a fully-resolved
 * `PaintProject`.
 */
export function parseJoplinProJson(raw: unknown): PaintProject {
  return parseProjectJson(normalizeLegacyJoplinPro(raw));
}

export { generateTaskBreakdownFromJSON } from '../parser';
