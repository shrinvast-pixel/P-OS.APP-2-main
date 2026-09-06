import type {
  PaintProject,
  Floor,
  Room,
  FinishingStep,
  MaterialItem,
  Supervisor,
  TaskStatus,
  ExteriorWork,
  ExteriorSide,
  ExteriorTreatment,
  WoodAndMetalItem,
  JoineryType,
  SpecialFeatures,
  WallpaperItem,
  TextureItem,
  Vendor,
  SurfaceType,
} from './types';
import { ensureExteriorFloor, isExteriorFloor, computeEstimatedDays, addWorkingDays } from './utils';

/**
 * Aggregate material line items by name + category, summing quantities and
 * keeping the first non-empty brand/vendor/unit. Prevents duplicate BOM entries
 * from imported JSON + computed materials.
 */
const COATING_CATEGORIES = new Set([
  'putty',
  'primer',
  'emulsion',
  'exterior putty',
  'exterior primer',
  'exterior emulsion',
]);

function deduplicateMaterials(materials: MaterialItem[]): MaterialItem[] {
  const map = new Map<string, MaterialItem>();
  for (const m of materials) {
    const cat = (m.category ?? '').toLowerCase().trim();
    const key = COATING_CATEGORIES.has(cat) ? cat : `${(m.name ?? '').toLowerCase().trim()}|${cat}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...m });
    } else {
      existing.totalRequiredQty = Math.round(((existing.totalRequiredQty ?? 0) + (m.totalRequiredQty ?? 0)) * 100) / 100;
      if (!existing.brand && m.brand) existing.brand = m.brand;
      if (!existing.vendorName && m.vendorName) existing.vendorName = m.vendorName;
      if (!existing.vendorId && m.vendorId) existing.vendorId = m.vendorId;
      if (!existing.unit && m.unit) existing.unit = m.unit;
      if (!existing.packSize && m.packSize) existing.packSize = m.packSize;
      if (!existing.unitCost && m.unitCost) existing.unitCost = m.unitCost;
    }
  }
  return Array.from(map.values());
}

const VALID_STATUSES: TaskStatus[] = ['NOT_STARTED', 'ASSIGNED', 'IN_PROGRESS', 'PAUSED', 'PENDING_INSPECTION', 'COMPLETED'];
const VALID_JOINERY: JoineryType[] = ['DOOR', 'WINDOW', 'GRILL', 'SHUTTER', 'OTHER'];

function uid(prefix: string, i: number): string {
  return `${prefix}-${i}-${Math.random().toString(36).slice(2, 8)}`;
}

function asNum(v: unknown): number | undefined {
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return undefined;
}

function asStr(v: unknown): string | undefined {
  if (typeof v === 'string' && v.trim() !== '') return v;
  return undefined;
}

function coerceStatus(v: unknown): TaskStatus {
  if (typeof v === 'string') {
    const up = v.toUpperCase().replace(/[\s-]/g, '_');
    if (VALID_STATUSES.includes(up as TaskStatus)) return up as TaskStatus;
    if (up === 'DONE' || up === 'COMPLETE') return 'COMPLETED';
    if (up === 'STARTED' || up === 'ONGOING') return 'IN_PROGRESS';
  }
  return 'NOT_STARTED';
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function normalizeSideName(name: string): string {
  const lower = name.toLowerCase().trim();
  if (lower === 'front' || lower.startsWith('front')) return 'Front';
  if (lower === 'rear' || lower.startsWith('rear') || lower.includes('back')) return 'Rear';
  if (lower === 'left' || lower.startsWith('left')) return 'Left';
  if (lower === 'right' || lower.startsWith('right')) return 'Right';
  return capitalize(name);
}

function coerceJoineryType(v: unknown): JoineryType {
  if (typeof v === 'string') {
    const up = v.toUpperCase().replace(/[\s-]/g, '_');
    if (VALID_JOINERY.includes(up as JoineryType)) return up as JoineryType;
    if (up.includes('DOOR')) return 'DOOR';
    if (up.includes('WINDOW')) return 'WINDOW';
    if (up.includes('GRILL') || up.includes('GRILLE')) return 'GRILL';
    if (up.includes('SHUTTER')) return 'SHUTTER';
  }
  return 'OTHER';
}

function parseFinishingSteps(raw: unknown, roomPrefix: string): FinishingStep[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s, i) => {
    const obj = (s ?? {}) as Record<string, unknown>;
    const product = asStr(obj.product);
    const service = asStr(obj.service) ?? asStr(obj.name) ?? asStr(obj.step);
    const isNone = (v?: string) => !v || v.toLowerCase() === 'none';
    const name =
      (!isNone(product) ? product : undefined) ??
      (!isNone(service) ? capitalize(service!) : undefined) ??
      'Unnamed Step';
    return {
      id: asStr(obj.id) || uid(roomPrefix, i),
      name,
      surface: asStr(obj.surface) || asStr(obj.surfaceName) || '—',
      surfaceType: asStr(obj.surfaceType) as FinishingStep['surfaceType'] | undefined,
      coatNumber: asNum(obj.coatNumber) ?? asNum(obj.coats) ?? asNum(obj.coat),
      status: coerceStatus(obj.status),
      brand: asStr(obj.brand),
      productLine: asStr(obj.productLine),
      stepSqft: asNum(obj.stepSqft) ?? asNum(obj.sqft),
      stepNumber: asNum(obj.stepNumber) ?? asNum(obj.stepNo),
      enabled: obj.enabled != null ? Boolean(obj.enabled) : true,
    } satisfies FinishingStep;
  });
}

function parseRooms(raw: unknown, floorPrefix: string): Room[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r, i) => {
    const obj = (r ?? {}) as Record<string, unknown>;
    const stepsRaw = obj.finishingSteps ?? obj.steps ?? obj.treatments ?? obj.tasks ?? [];
    const totalSqft =
      asNum(obj.totalSqft) ?? asNum(obj.areaSqft) ?? asNum(obj.sqft) ?? asNum(obj.totalArea);
    const netWallSqft = asNum(obj.netWallSqft) ?? asNum(obj.netWallArea);
    const interiorSqft =
      asNum(obj.interiorSqft) ??
      asNum(obj.interiorArea) ??
      asNum(obj.area) ??
      asNum(obj.areaSqft) ??
      asNum(obj.sqft) ??
      totalSqft;
    const resolvedSqft = totalSqft ?? interiorSqft;
    const type = asStr(obj.type) ?? asStr(obj.roomType);
    const id = asStr(obj.id) || uid(floorPrefix, i);
    return {
      id,
      name: type || id,
      type,
      sqft: asNum(obj.sqft) ?? asNum(obj.areaSqft) ?? (resolvedSqft != null ? Math.round(resolvedSqft * 100) / 100 : undefined),
      totalSqft,
      netWallSqft,
      interiorSqft,
      exteriorSqft: asNum(obj.exteriorSqft) ?? asNum(obj.exteriorArea),
      doorsCount: asNum(obj.doorsCount) ?? asNum(obj.doors),
      windowsCount: asNum(obj.windowsCount) ?? asNum(obj.windows),
      finishingSteps: parseFinishingSteps(stepsRaw, `${floorPrefix}-r${i}`),
    } satisfies Room;
  });
}

function parseFloors(raw: unknown): Floor[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((f, i) => {
    const obj = (f ?? {}) as Record<string, unknown>;
    const roomsRaw = obj.rooms ?? obj.roomList ?? [];
    return {
      id: asStr(obj.id) || uid('floor', i),
      name: asStr(obj.floorName) ?? asStr(obj.name) ?? `Floor ${i + 1}`,
      level: asNum(obj.level) ?? i,
      rooms: parseRooms(roomsRaw, `f${i}`),
    } satisfies Floor;
  });
}

function parseMaterials(raw: unknown): MaterialItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((m, i) => {
    const obj = (m ?? {}) as Record<string, unknown>;
    const id = asStr(obj.id) || asStr(obj.materialId);
    
    let name = asStr(obj.productName) ?? asStr(obj.name) ?? asStr(obj.materialName);
    const category = asStr(obj.category) ?? asStr(obj.materialCategory);
    const unit = asStr(obj.unit) ?? asStr(obj.uom);

    if (id === 'MAT-WHITE-CEMENT-PUTTY-01') name = 'White Cement Putty (Interior)';
    else if (id === 'MAT-INTERIOR-PRIMER-02') name = 'Interior Wall Primer';
    else if (id === 'MAT-ECONOMY-EMULSION-03') name = 'Interior Emulsion Paint';
    
    if (!name || name === '-') {
      name = category ? `${category} ${unit === 'rolls' ? 'Wallpaper' : 'Specialty Coating'}` : 'Unnamed Material';
    }

    let resolvedUnit = unit;

    const lowerName = name.toLowerCase();
    const lowerCat = (category ?? '').toLowerCase();

    if (lowerName.includes('putty') || lowerCat.includes('putty') || lowerName.includes('powder') || lowerCat.includes('powder')) {
      resolvedUnit = 'kg';
    } else if (
      lowerName.includes('emulsion') || lowerCat.includes('emulsion') ||
      lowerName.includes('primer') || lowerCat.includes('primer') ||
      lowerName.includes('enamel') || lowerCat.includes('enamel') ||
      lowerName.includes('stainer') || lowerCat.includes('stainer') ||
      lowerName.includes('paint') || lowerCat.includes('paint')
    ) {
      resolvedUnit = 'L';
    } else if (lowerName.includes('wallpaper') || lowerCat.includes('wallpaper')) {
      resolvedUnit = 'rolls';
    } else if (
      lowerName.includes('roller') || lowerCat.includes('roller') ||
      lowerName.includes('brush') || lowerCat.includes('brush') ||
      lowerCat.includes('consumable') || lowerName.includes('tape')
    ) {
      resolvedUnit = 'Pcs';
    } else if (lowerCat.includes('joinery') || lowerName.includes('door') || lowerName.includes('window') || lowerName.includes('grill')) {
      resolvedUnit = (lowerName.includes('paint') || lowerName.includes('enamel') || lowerName.includes('polish')) ? 'L' : 'Pcs';
    }

    if (!resolvedUnit || resolvedUnit.toLowerCase() === 'sqft') {
      resolvedUnit = (lowerCat.includes('paint') || lowerCat.includes('emulsion') || lowerCat.includes('primer')) ? 'L' : 'Pcs';
    }

    const rawQty =
      asNum(obj.totalQuantity) ??
      asNum(obj.estimatedQty) ??
      asNum(obj.totalRequiredQty) ??
      asNum(obj.requiredQuantity) ??
      asNum(obj.quantity);
    const qty = rawQty != null ? Number(rawQty.toFixed(2)) : undefined;

    return {
      id: id || uid('mat', i),
      name,
      category,
      brand: asStr(obj.brand) ?? asStr(obj.manufacturer) ?? 'Standard',
      totalRequiredQty: qty,
      unit: resolvedUnit,
      packSize: asStr(obj.packSize) ?? asStr(obj.packaging),
      vendorName: asStr(obj.vendorName) ?? asStr(obj.vendor),
      orderedQty: asNum(obj.orderedQty) ?? asNum(obj.ordered),
      deliveredQty: asNum(obj.deliveredQty) ?? asNum(obj.delivered),
      orderStatus: asStr(obj.orderStatus) as MaterialItem['orderStatus'] | undefined,
      unitCost: asNum(obj.unitCost) ?? asNum(obj.cost),
    } satisfies MaterialItem;
  });
}

function parseSupervisors(raw: unknown): Supervisor[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s, i) => {
    const obj = (s ?? {}) as Record<string, unknown>;
    return {
      id: asStr(obj.id) || uid('sup', i),
      name: asStr(obj.name) || asStr(obj.supervisorName) || `Supervisor ${i + 1}`,
      role: asStr(obj.role) ?? asStr(obj.designation),
      phone: asStr(obj.phone) ?? asStr(obj.mobile),
      email: asStr(obj.email),
    } satisfies Supervisor;
  });
}

function parseVendors(raw: unknown): Vendor[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((v, i) => {
    const obj = (v ?? {}) as Record<string, unknown>;
    return {
      id: asStr(obj.id) || uid('ven', i),
      storeName: asStr(obj.storeName) || asStr(obj.name) || `Vendor ${i + 1}`,
      ownerName: asStr(obj.ownerName) ?? asStr(obj.owner),
      phone: asStr(obj.phone) ?? asStr(obj.contact),
      address: asStr(obj.address) ?? asStr(obj.location),
      brands: Array.isArray(obj.brands) ? obj.brands.map((b) => asStr(b)).filter((b): b is string => !!b) : undefined,
      creditDays: asNum(obj.creditDays),
      gstin: asStr(obj.gstin) ?? asStr(obj.gstNumber),
      contactPerson: asStr(obj.contactPerson) ?? asStr(obj.contactName),
      distanceKm: asNum(obj.distanceKm) ?? asNum(obj.distance),
      minDeliveryHours: asNum(obj.minDeliveryHours) ?? asNum(obj.deliveryHours),
      whatsappNumber: asStr(obj.whatsappNumber) ?? asStr(obj.whatsapp),
    } satisfies Vendor;
  });
}

function parseExteriorTreatments(raw: unknown, sidePrefix: string): ExteriorTreatment[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((t, i) => {
    const obj = (t ?? {}) as Record<string, unknown>;
    return {
      id: asStr(obj.id) || uid(`${sidePrefix}-tr`, i),
      name: asStr(obj.name) ?? asStr(obj.treatment) ?? asStr(obj.step) ?? `Treatment ${i + 1}`,
      status: coerceStatus(obj.status),
      brand: asStr(obj.brand),
      productLine: asStr(obj.productLine),
    } satisfies ExteriorTreatment;
  });
}

/**
 * Derive the status for a canonical exterior coating step from the side's
 * treatment list. A treatment is matched when its name contains one of the
 * provided keywords; the first match wins. Falls back to 'NOT_STARTED' so the
 * progress bar always receives one of the strings it expects
 * (NOT_STARTED / IN_PROGRESS / COMPLETED).
 */
function deriveExteriorStepStatus(treatments: ExteriorTreatment[], keywords: RegExp[]): TaskStatus {
  for (const t of treatments) {
    const n = (t.name ?? '').toLowerCase();
    if (keywords.some((k) => k.test(n))) return t.status ?? 'NOT_STARTED';
  }
  return 'NOT_STARTED';
}

/**
 * Build the canonical 3-step exterior coating process (Putty Coat, Primer Coat,
 * Paint/Finish) for a side. Status is inherited from any matching treatment so
 * the progress bar stays in sync with the imported exterior work.
 */
function buildCanonicalExteriorSteps(side: ExteriorSide, index: number, area: number): FinishingStep[] {
  const treatments = side.treatments ?? [];
  const sideLabel = side.label ?? side.name;
  const mk = (key: string, name: string, status: TaskStatus, stepNumber: number) => ({
    id: `ext-step-${side.id ?? `side-${index}`}-${key}`,
    name,
    surface: sideLabel,
    surfaceType: 'EXTERIOR' as SurfaceType,
    status,
    stepNumber,
    stepSqft: area > 0 ? area : undefined,
    targetSqft: area > 0 ? area : undefined,
    isExterior: true,
    enabled: true,
  });
  return [
    mk('putty', 'Putty Coat', deriveExteriorStepStatus(treatments, [/putty/, /filler/, /crack\s*filing/]), 1),
    mk('primer', 'Primer Coat', deriveExteriorStepStatus(treatments, [/primer/]), 2),
    mk('paint', 'Paint/Finish', deriveExteriorStepStatus(treatments, [/emulsion/, /finish\s*coat/, /weathercoat\s*finish/, /paint/]), 3),
  ];
}

function parseExteriorSides(raw: unknown): ExteriorSide[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s, i) => {
    const obj = (s ?? {}) as Record<string, unknown>;
    const rawName = asStr(obj.sideName) ?? asStr(obj.name) ?? asStr(obj.side) ?? asStr(obj.label) ?? `Side ${i + 1}`;
    const name = normalizeSideName(rawName);
    const treatmentsRaw = obj.treatments ?? obj.steps ?? [];
    const areaSqft = asNum(obj.netSqft) ?? asNum(obj.netArea) ?? asNum(obj.areaSqft) ?? asNum(obj.area) ?? asNum(obj.sqft) ?? asNum(obj.totalSqft) ?? 0;
    const treatments = parseExteriorTreatments(treatmentsRaw, `s${i}`);
    const side: ExteriorSide = {
      id: asStr(obj.id) || uid('side', i),
      name,
      label: asStr(obj.label),
      netSqft: areaSqft > 0 ? areaSqft : undefined,
      areaSqft,
      condition: asStr(obj.condition) ?? asStr(obj.surfaceCondition),
      treatments,
    };
    return {
      ...side,
      finishingSteps: buildCanonicalExteriorSteps(side, i, areaSqft),
    };
  });
}

function parseExteriorWork(raw: unknown): ExteriorWork {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const sidesRaw = obj.sides ?? obj.sideList ?? [];
  const sides = parseExteriorSides(sidesRaw);
  const totalFromSides = sides.reduce((sum, s) => sum + (s.areaSqft ?? 0), 0);
  return {
    totalAreaSqft: asNum(obj.totalAreaSqft) ?? (totalFromSides > 0 ? totalFromSides : undefined),
    sides,
  };
}

const EXTERIOR_MATERIAL_RULES: { match: RegExp; category: string; coveragePerSqft: number; unit: string }[] = [
  { match: /exterior\s*emulsion|exterior\s*paint|weathercoat\s*finish|emulsion|premium\s*exterior/i, category: 'Exterior Emulsion', coveragePerSqft: 0.12, unit: 'L' },
  { match: /exterior\s*primer|weathercoat\s*primer|primer\s*coat|primer/i, category: 'Exterior Primer', coveragePerSqft: 0.08, unit: 'L' },
  { match: /texture|stucco/i, category: 'Texture', coveragePerSqft: 0.15, unit: 'kg' },
  { match: /putty|filler|crack\s*filing/i, category: 'Exterior Putty', coveragePerSqft: 0.05, unit: 'kg' },
  { match: /sealer|sealant/i, category: 'Sealer', coveragePerSqft: 0.04, unit: 'L' },
];

function compileExteriorMaterials(ew: ExteriorWork, fallbackVendors?: Vendor[]): MaterialItem[] {
  const sides = ew.sides ?? [];
  if (sides.length === 0) return [];
  const totalArea = ew.totalAreaSqft ?? sides.reduce((sum, s) => sum + (s.areaSqft ?? 0), 0);
  if (!totalArea) return [];

  const out: MaterialItem[] = [];
  let idx = 0;

  // Derive from canonical finishingSteps (Putty Coat, Primer Coat, Paint/Finish)
  // instead of raw treatment names, so every exterior coating gets its own BOM
  // line item — even when treatment labels use non-standard wording.
  const hasExteriorPrimer = sides.some((s) =>
    (s.finishingSteps ?? []).some((step) => /primer/i.test(step.name ?? '')),
  );
  const hasExteriorPutty = sides.some((s) =>
    (s.finishingSteps ?? []).some((step) => /putty/i.test(step.name ?? '')),
  );
  const hasExteriorEmulsion = sides.some((s) =>
    (s.finishingSteps ?? []).some((step) => /emulsion|paint|finish/i.test(step.name ?? '')),
  );

  // Helper to pick a fallback vendor for a given category
  const pickVendor = (category: string): Vendor | undefined => {
    if (!fallbackVendors || fallbackVendors.length === 0) return undefined;
    const byDistance = [...fallbackVendors].sort(
      (a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity),
    );
    // Prefer a vendor that stocks the matching brand
    const brandMap: Record<string, string[]> = {
      'Exterior Primer': ['Berger', 'Asian Paints'],
      'Exterior Emulsion': ['Berger', 'Asian Paints'],
      'Exterior Putty': ['Birla White', 'Berger'],
      'Texture': ['Asian Paints', 'Berger'],
      'Sealer': ['Asian Paints', 'Berger'],
    };
    const wantedBrands = brandMap[category] ?? [];
    const match = fallbackVendors.find((v) =>
      v.brands?.some((b) => wantedBrands.some((wb) => b.toLowerCase().includes(wb.toLowerCase()))),
    );
    return match ?? byDistance[0];
  };

  // Coverage formulas (real-world):
  //   Exterior Primer:  totalArea / 120  (Litres, 1 coat)
  //   Exterior Putty:   totalArea / 15   (kg, 2 coats)
  //   Exterior Emulsion: totalArea / 55  (Litres, 2 coats)

  // Exterior Primer (1 coat)
  if (hasExteriorPrimer) {
    const qty = Math.round((totalArea / 120) * 100) / 100;
    const v = pickVendor('Exterior Primer');
    out.push({
      id: uid('extmat', idx++),
      name: 'Exterior Primer: 1 coat',
      category: 'Exterior Primer',
      brand: 'Berger',
      totalRequiredQty: qty,
      unit: 'L',
      packSize: '20L',
      vendorName: v?.storeName,
      vendorId: v?.id,
      orderedQty: undefined,
      deliveredQty: undefined,
      orderStatus: undefined,
      unitCost: 250,
    } satisfies MaterialItem);
  }

  // Exterior Putty (2 coats)
  if (hasExteriorPutty) {
    const qty = Math.round((totalArea / 15) * 100) / 100;
    const v = pickVendor('Exterior Putty');
    out.push({
      id: uid('extmat', idx++),
      name: 'Exterior Putty: 2 coats',
      category: 'Exterior Putty',
      brand: 'Birla White',
      totalRequiredQty: qty,
      unit: 'kg',
      packSize: '40kg',
      vendorName: v?.storeName,
      vendorId: v?.id,
      orderedQty: undefined,
      deliveredQty: undefined,
      orderStatus: undefined,
      unitCost: 150,
    } satisfies MaterialItem);
  }

  // Exterior Emulsion (2 coats)
  if (hasExteriorEmulsion) {
    const qty = Math.round((totalArea / 55) * 100) / 100;
    const v = pickVendor('Exterior Emulsion');
    out.push({
      id: uid('extmat', idx++),
      name: 'Exterior Emulsion: 2 coats',
      category: 'Exterior Emulsion',
      brand: 'Berger',
      totalRequiredQty: qty,
      unit: 'L',
      packSize: '20L',
      vendorName: v?.storeName,
      vendorId: v?.id,
      orderedQty: undefined,
      deliveredQty: undefined,
      orderStatus: undefined,
      unitCost: 380,
    } satisfies MaterialItem);
  }

  // If nothing matched, fall back to a generic Exterior Emulsion for the total area
  if (out.length === 0) {
    const defaultQty = Math.round((totalArea / 55) * 100) / 100;
    const v = pickVendor('Exterior Emulsion');
    out.push({
      id: uid('extmat', 0),
      name: 'Exterior Emulsion',
      category: 'Exterior Emulsion',
      brand: 'Berger',
      totalRequiredQty: defaultQty,
      unit: 'L',
      packSize: '20L',
      vendorName: v?.storeName,
      vendorId: v?.id,
      orderedQty: undefined,
      deliveredQty: undefined,
      orderStatus: undefined,
      unitCost: 380,
    } satisfies MaterialItem);
  }

  return out;
}

function parseWoodAndMetalItems(raw: unknown): WoodAndMetalItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((w, i) => {
    const obj = (w ?? {}) as Record<string, unknown>;
    const dimsObj = (obj.dimensions ?? {}) as Record<string, unknown>;
    const width = asNum(dimsObj.widthFt) ?? asNum(dimsObj.width) ?? asNum(obj.width) ?? asNum(obj.widthFt);
    const height = asNum(dimsObj.heightFt) ?? asNum(dimsObj.height) ?? asNum(obj.height) ?? asNum(obj.heightFt);
    const dims = (width != null && height != null ? `${width} x ${height} ft` : undefined) ??
      asStr(obj.dimensions);
    const count = asNum(obj.count) ?? asNum(obj.quantity) ?? 1;
    const totalSqft = asNum(dimsObj.totalSqft) ?? asNum(obj.totalSqft) ??
      (width != null && height != null ? Math.round(width * height * count * 100) / 100 : undefined);
    const nameRaw = asStr(obj.productName) ?? asStr(obj.name) ?? asStr(obj.itemName) ?? asStr(obj.customLabel) ?? asStr(obj.finishType);
    const name = nameRaw ? capitalize(nameRaw) : `Item ${i + 1}`;
    return {
      id: asStr(obj.id) || uid('joi', i),
      name,
      type: coerceJoineryType(obj.type ?? obj.itemType ?? obj.category),
      dimensions: dims,
      width,
      height,
      totalSqft,
      finishType: asStr(obj.finishType) ?? asStr(obj.finish) ?? asStr(obj.treatment),
      count,
      status: coerceStatus(obj.status),
    } satisfies WoodAndMetalItem;
  });
}

function parseWallpapers(raw: unknown): WallpaperItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((w, i) => {
    const obj = (w ?? {}) as Record<string, unknown>;
    const wallDims = (obj.wallDimensionsFt ?? {}) as Record<string, unknown>;
    const totalSqft = asNum(wallDims.totalSqft) ?? asNum(obj.totalSqft) ?? asNum(obj.areaSqft) ?? asNum(obj.area);
    return {
      id: asStr(obj.id) || uid('wp', i),
      name: asStr(obj.name) ?? asStr(obj.wallpaperName) ?? `Wallpaper ${i + 1}`,
      rolls: asNum(obj.rollsRequired) ?? asNum(obj.rolls) ?? asNum(obj.rollCount) ?? asNum(obj.qty),
      roomName: asStr(obj.roomName) ?? asStr(obj.room),
      areaSqft: totalSqft,
      totalSqft,
      brand: asStr(obj.brand),
    } satisfies WallpaperItem;
  });
}

function parseTextures(raw: unknown): TextureItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((t, i) => {
    const obj = (t ?? {}) as Record<string, unknown>;
    const wallDims = (obj.wallDimensionsFt ?? {}) as Record<string, unknown>;
    const totalSqft = asNum(wallDims.totalSqft) ?? asNum(obj.totalSqft) ?? asNum(obj.areaSqft) ?? asNum(obj.area) ?? asNum(obj.sqft);
    const textureType = asStr(obj.textureType) ?? asStr(obj.type);
    const name = asStr(obj.name) ?? textureType ?? asStr(obj.textureName) ?? `Texture ${i + 1}`;
    return {
      id: asStr(obj.id) || uid('tex', i),
      name,
      textureType,
      areaSqft: totalSqft,
      totalSqft,
      roomName: asStr(obj.roomName) ?? asStr(obj.room),
      brand: asStr(obj.brand),
    } satisfies TextureItem;
  });
}

function parseSpecialFeatures(raw: unknown): SpecialFeatures {
  const obj = (raw ?? {}) as Record<string, unknown>;
  return {
    wallpapers: parseWallpapers(obj.wallpapers ?? obj.wallpaperList),
    textures: parseTextures(obj.textures ?? obj.textureList),
  };
}

function findSupervisorName(raw: unknown): string {
  const candidates: string[] = [];

  function visit(node: unknown, depth = 0) {
    if (depth > 8 || node == null) return;
    if (typeof node === 'string') return;
    if (Array.isArray(node)) {
      node.forEach((child) => visit(child, depth + 1));
      return;
    }
    if (typeof node !== 'object') return;
    const rec = node as Record<string, unknown>;
    const directKeys = [
      'leadSupervisor',
      'leadSupervisorName',
      'supervisorName',
      'supervisor',
      'projectManager',
      'fieldManager',
    ] as const;
    for (const k of directKeys) {
      const v = asStr(rec[k]);
      if (v) candidates.push(v);
    }
    const sups = rec.supervisors ?? rec.supervisorList;
    if (Array.isArray(sups) && sups.length > 0) {
      const first = (sups[0] ?? {}) as Record<string, unknown>;
      const v = asStr(first.name) ?? asStr(first.supervisorName);
      if (v) candidates.push(v);
    }
    for (const k of Object.keys(rec)) {
      visit(rec[k], depth + 1);
    }
  }

  visit(raw);
  return candidates[0] ?? '';
}

export function generateTaskBreakdownFromJSON(surveyData: {
  floors: Floor[];
  exteriorWork?: ExteriorWork;
  woodAndMetalItems?: WoodAndMetalItem[];
  specialFeatures?: SpecialFeatures;
}): { generated: Room[] } {
  const JOINERY_TO_SURFACE: Record<JoineryType, SurfaceType> = {
    DOOR: 'DOOR',
    WINDOW: 'WINDOW',
    GRILL: 'METAL',
    SHUTTER: 'OTHER',
    OTHER: 'OTHER',
  };
  const generated: Room[] = [];

  for (const item of surveyData.woodAndMetalItems ?? []) {
    const area = item.totalSqft ?? 0;
    const surfaceType = JOINERY_TO_SURFACE[item.type];
    const steps: FinishingStep[] = [
      {
        id: `gen-joi-prep-${item.id}`,
        name: `Surface Preparation - ${item.name}`,
        surface: item.name,
        surfaceType,
        status: 'NOT_STARTED',
        stepNumber: 1,
        stepSqft: area > 0 ? area : undefined,
        targetSqft: area > 0 ? area : undefined,
      },
      {
        id: `gen-joi-sanding-${item.id}`,
        name: `Sanding - ${item.name}`,
        surface: item.name,
        surfaceType,
        status: 'NOT_STARTED',
        stepNumber: 2,
        stepSqft: area > 0 ? area : undefined,
        targetSqft: area > 0 ? area : undefined,
      },
      {
        id: `gen-joi-primer-${item.id}`,
        name: `Primer Coat - ${item.name}`,
        surface: item.name,
        surfaceType,
        status: 'NOT_STARTED',
        stepNumber: 3,
        stepSqft: area > 0 ? area : undefined,
        targetSqft: area > 0 ? area : undefined,
      },
      {
        id: `gen-joi-paint-${item.id}`,
        name: `Paint/Finish - ${item.name}`,
        surface: item.name,
        surfaceType,
        status: 'NOT_STARTED',
        stepNumber: 4,
        stepSqft: area > 0 ? area : undefined,
        targetSqft: area > 0 ? area : undefined,
      },
    ];
    generated.push({
      id: `gen-joi-room-${item.id}`,
      name: `${item.type}: ${item.name}`,
      type: item.type,
      totalSqft: area > 0 ? area : undefined,
      netWallSqft: area > 0 ? area : undefined,
      sqft: area > 0 ? area : undefined,
      finishingSteps: steps,
      isExterior: false,
    });
  }

  for (const wp of surveyData.specialFeatures?.wallpapers ?? []) {
    const area = wp.totalSqft ?? wp.areaSqft ?? 0;
    const steps: FinishingStep[] = [
      {
        id: `gen-wp-prep-${wp.id}`,
        name: `Wall Preparation - ${wp.name}`,
        surface: wp.roomName ?? wp.name,
        status: 'NOT_STARTED',
        stepNumber: 1,
        stepSqft: area > 0 ? area : undefined,
        targetSqft: area > 0 ? area : undefined,
      },
      {
        id: `gen-wp-install-${wp.id}`,
        name: `Wallpaper Installation - ${wp.name}`,
        surface: wp.roomName ?? wp.name,
        status: 'NOT_STARTED',
        stepNumber: 2,
        stepSqft: area > 0 ? area : undefined,
        targetSqft: area > 0 ? area : undefined,
      },
    ];
    generated.push({
      id: `gen-wp-room-${wp.id}`,
      name: `Wallpaper: ${wp.name}`,
      type: 'Wallpaper',
      totalSqft: area > 0 ? area : undefined,
      netWallSqft: area > 0 ? area : undefined,
      sqft: area > 0 ? area : undefined,
      finishingSteps: steps,
      isExterior: false,
    });
  }

  for (const tex of surveyData.specialFeatures?.textures ?? []) {
    const area = tex.totalSqft ?? tex.areaSqft ?? 0;
    const steps: FinishingStep[] = [
      {
        id: `gen-tex-prep-${tex.id}`,
        name: `Surface Prep - ${tex.name}`,
        surface: tex.roomName ?? tex.name,
        status: 'NOT_STARTED',
        stepNumber: 1,
        stepSqft: area > 0 ? area : undefined,
        targetSqft: area > 0 ? area : undefined,
      },
      {
        id: `gen-tex-apply-${tex.id}`,
        name: `Texture Application - ${tex.name}`,
        surface: tex.roomName ?? tex.name,
        surfaceType: 'WALL',
        status: 'NOT_STARTED',
        stepNumber: 2,
        stepSqft: area > 0 ? area : undefined,
        targetSqft: area > 0 ? area : undefined,
      },
    ];
    generated.push({
      id: `gen-tex-room-${tex.id}`,
      name: `Texture: ${tex.name}`,
      type: 'Texture',
      totalSqft: area > 0 ? area : undefined,
      netWallSqft: area > 0 ? area : undefined,
      sqft: area > 0 ? area : undefined,
      finishingSteps: steps,
      isExterior: false,
    });
  }

  return { generated };
}

export function parseProjectJson(raw: unknown): PaintProject {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const pd = (obj.projectInfo ?? obj.projectDetails ?? obj.project ?? {}) as Record<string, unknown>;
  const cd = (obj.customer ?? obj.customerDetails ?? {}) as Record<string, unknown>;
  const sm = (obj.summaryMetrics ?? {}) as Record<string, unknown>;
  const ew = parseExteriorWork(obj.exteriorWork ?? {});

  const floorsParsed = parseFloors(obj.floors ?? obj.floorList);
  const materialsParsed = parseMaterials(
    obj.materialBillOfQuantities ?? obj.materials ?? obj.bom,
  );
  const exteriorParsed = ew;
  const woodAndMetalParsed = parseWoodAndMetalItems(obj.woodAndMetalItems ?? obj.joinery ?? obj.joineryItems);
  const specialsParsed = parseSpecialFeatures(obj.specialFeatures ?? obj.specials);
  const supervisorsParsed = parseSupervisors(obj.supervisors ?? obj.supervisorList);
  const vendorsParsed = parseVendors(obj.vendors ?? obj.vendorList ?? obj.vendorDirectory);
  const projectInfo = pd.projectInfo as Record<string, unknown> | undefined;
  const createdAtFromInfo = projectInfo?.createdAt as string | undefined;

  const firstSupName = supervisorsParsed.length > 0 ? supervisorsParsed[0].name : undefined;

  const assignedSupRaw = obj.assignedSupervisor ?? pd.assignedSupervisor;
  const assignedSupObj =
    assignedSupRaw != null && typeof assignedSupRaw === 'object' && !Array.isArray(assignedSupRaw)
      ? (assignedSupRaw as Record<string, unknown>)
      : undefined;
  const assignedSupName = assignedSupObj ? asStr(assignedSupObj.name) : asStr(assignedSupRaw);

  const leadSupervisorName =
    asStr(obj.leadSupervisor) ?? asStr(pd.leadSupervisor) ??
    asStr(obj.leadSupervisorName) ?? asStr(pd.leadSupervisorName) ??
    assignedSupName ??
    asStr(obj.supervisorName) ?? asStr(pd.supervisorName) ??
    asStr(obj.supervisor) ?? asStr(pd.supervisor) ??
    asStr(obj.projectManager) ?? asStr(pd.projectManager) ??
    asStr(obj.fieldManager) ?? asStr(pd.fieldManager) ??
    firstSupName ??
    findSupervisorName(raw) ?? '';
  let leadSupervisorIdResolved =
    asStr(obj.leadSupervisorId) ?? asStr(pd.leadSupervisorId) ??
    (assignedSupObj ? asStr(assignedSupObj.id) : undefined) ??
    asStr(assignedSupObj ? assignedSupObj.id : undefined) ??
    asStr(obj.assignedSupervisor) ?? asStr(pd.assignedSupervisor) ??
    (supervisorsParsed.length > 0 ? supervisorsParsed[0].id : undefined);
  if (leadSupervisorName && !supervisorsParsed.some((s) => s.name === leadSupervisorName)) {
    const leadSup = {
      id: uid('sup-lead', 0),
      name: leadSupervisorName,
      role: 'Lead Supervisor',
      phone: undefined,
      email: undefined,
    } satisfies Supervisor;
    supervisorsParsed.push(leadSup);
    if (!leadSupervisorIdResolved) leadSupervisorIdResolved = leadSup.id;
  }

  const exteriorMaterials = compileExteriorMaterials(exteriorParsed, vendorsParsed);

  function compileInteriorMaterials(floors: Floor[]): MaterialItem[] {
    // Coverage formulas (real-world):
    //   Interior Putty:   sqft / 15   (kg)
    //   Interior Primer:  sqft / 140  (Litres)
    //   Interior Emulsion: sqft / 120 (Litres, 2 coats)
    let totalPuttySqft = 0;
    let totalPrimerSqft = 0;
    let totalEmulsionSqft = 0;
    for (const f of floors) {
      if (isExteriorFloor(f)) continue;
      for (const r of f.rooms) {
        if (r.isExterior) continue;
        for (const s of r.finishingSteps) {
          if (s.isExterior) continue;
          const stepArea = s.stepSqft ?? r.interiorSqft ?? 0;
          const lower = s.name.toLowerCase();
          if (lower.includes('putty')) totalPuttySqft += stepArea;
          else if (lower.includes('primer')) totalPrimerSqft += stepArea;
          else if (lower.includes('emulsion') || lower.includes('paint') || lower.includes('finish') || lower.includes('coat')) totalEmulsionSqft += stepArea;
        }
      }
    }
    const out: MaterialItem[] = [];
    if (totalPuttySqft > 0) {
      out.push({
        id: uid('intputty', 0),
        name: 'Wall Putty',
        category: 'Putty',
        brand: 'Birla White',
        totalRequiredQty: Math.round((totalPuttySqft / 15) * 100) / 100,
        unit: 'kg',
        packSize: '40kg',
        vendorName: undefined,
        orderedQty: undefined,
        deliveredQty: undefined,
        orderStatus: undefined,
        unitCost: 25,
      } satisfies MaterialItem);
    }
    if (totalPrimerSqft > 0) {
      out.push({
        id: uid('intprimer', 0),
        name: 'Interior Primer',
        category: 'Primer',
        brand: 'Asian Paints',
        totalRequiredQty: Math.round((totalPrimerSqft / 140) * 100) / 100,
        unit: 'L',
        packSize: '20L',
        vendorName: undefined,
        orderedQty: undefined,
        deliveredQty: undefined,
        orderStatus: undefined,
        unitCost: 180,
      } satisfies MaterialItem);
    }
    if (totalEmulsionSqft > 0) {
      out.push({
        id: uid('intemulsion', 0),
        name: 'Interior Emulsion Paint',
        category: 'Emulsion',
        brand: 'Asian Paints',
        totalRequiredQty: Math.round((totalEmulsionSqft / 120) * 100) / 100,
        unit: 'L',
        packSize: '20L',
        vendorName: undefined,
        orderedQty: undefined,
        deliveredQty: undefined,
        orderStatus: undefined,
        unitCost: 520,
      } satisfies MaterialItem);
    }
    return out;
  }

  function compileSpecialMaterials(specials: SpecialFeatures, joinery: WoodAndMetalItem[]): MaterialItem[] {
    const out: MaterialItem[] = [];
    let idx = 0;
    // Enamel / Oil Paint / Water-based Wood Coating: ~100 sqft per Litre (2 coats)
    for (const w of joinery) {
      const sqft = w.totalSqft ?? 0;
      const qty = Math.ceil((sqft / 100) * 10) / 10;
      if (qty <= 0) continue;
      out.push({
        id: uid('joinmat', idx++),
        name: `${w.name} (${w.type.toLowerCase()})`,
        category: 'Joinery',
        brand: undefined,
        totalRequiredQty: qty,
        unit: 'L',
        packSize: undefined,
        vendorName: undefined,
        orderedQty: undefined,
        deliveredQty: undefined,
        orderStatus: undefined,
        unitCost: 50,
      } satisfies MaterialItem);
    }
    for (const wp of specials.wallpapers ?? []) {
      const rolls = wp.rolls ?? 0;
      if (rolls <= 0) continue;
      out.push({
        id: uid('wpmat', idx++),
        name: wp.name,
        category: 'Wallpaper',
        brand: wp.brand,
        totalRequiredQty: rolls,
        unit: 'rolls',
        packSize: undefined,
        vendorName: undefined,
        orderedQty: undefined,
        deliveredQty: undefined,
        orderStatus: undefined,
        unitCost: 1200,
      } satisfies MaterialItem);
    }
    for (const t of specials.textures ?? []) {
      const sqft = t.totalSqft ?? t.areaSqft ?? 0;
      const qty = Math.round(sqft * 100) / 100;
      if (qty <= 0) continue;
      out.push({
        id: uid('texmat', idx++),
        name: t.name,
        category: t.textureType ? `Texture (${t.textureType})` : 'Texture',
        brand: t.brand,
        totalRequiredQty: qty,
        unit: 'kg',
        packSize: undefined,
        vendorName: undefined,
        orderedQty: undefined,
        deliveredQty: undefined,
        orderStatus: undefined,
        unitCost: 35,
      } satisfies MaterialItem);
    }
    return out;
  }

  const interiorMaterials = compileInteriorMaterials(floorsParsed);
  const specialMaterials = compileSpecialMaterials(specialsParsed, woodAndMetalParsed);
  const allMaterials = deduplicateMaterials([...materialsParsed, ...exteriorMaterials, ...interiorMaterials, ...specialMaterials]);

  // Assign fallback vendors to materials missing a vendor, using the nearest vendor
  // from the project's vendor list (by distanceKm).
  if (vendorsParsed && vendorsParsed.length > 0) {
    allMaterials.forEach((m) => {
      if (!m.vendorName) {
        const preferred = vendorsParsed.find((v) =>
          (v.brands ?? []).some((b) =>
            (m.brand ?? '').toLowerCase().includes(b.toLowerCase()) ||
            (m.category ?? '').toLowerCase().includes(b.toLowerCase()),
          ),
        );
        m.vendorName = preferred?.storeName ?? (vendorsParsed[0]?.storeName ?? undefined);
        if (preferred) m.vendorId = preferred.id;
      }
    });
  }

  const interiorFromFloors = floorsParsed.reduce((s, f) => s + (f.rooms ?? []).reduce((rs, r) => rs + (r.totalSqft ?? r.interiorSqft ?? 0), 0), 0);
  const interiorSqftRaw = asNum(sm.totalInteriorSqft);
  const interiorSqftResolved = interiorSqftRaw != null ? interiorSqftRaw : interiorFromFloors;
  const exteriorSqftRaw = asNum(sm.totalExteriorSqft);
  const exteriorSqftResolved = exteriorSqftRaw != null ? exteriorSqftRaw : exteriorParsed.totalAreaSqft;

  const totalSqftResolved = asNum(sm.totalInteriorSqft) ?? asNum(pd.totalSqft) ?? asNum(pd.totalArea) ??
    interiorFromFloors +
    (exteriorParsed.totalAreaSqft ?? 0);

  const estimatedDaysResolved = asNum(sm.estimatedTotalDays) ?? asNum(pd.estimatedDays) ?? asNum(pd.duration) ??
    (totalSqftResolved > 0 ? Math.max(1, Math.ceil(totalSqftResolved / 100)) : 30);

  const materialCostEstimate = allMaterials.reduce((s, m) => s + (m.totalRequiredQty ?? 0) * (m.unitCost ?? 0), 0);
  const laborCostEstimate = totalSqftResolved > 0 ? Math.round(totalSqftResolved * 12) : 0;
  const totalBudgetResolved = asNum(projectInfo?.totalBudget ?? pd.totalBudget) ?? asNum(pd.budget) ?? (materialCostEstimate + laborCostEstimate > 0 ? Math.round((materialCostEstimate + laborCostEstimate) * 1.3) : 124489);

  const parsedProject: PaintProject = {
    id: asStr(obj.id) || asStr(pd.id) || uid('proj', 0),
    projectDetails: {
      name: asStr(pd.projectName) ?? asStr(pd.name) ?? 'Untitled Project',
      status: asStr(pd.status) ?? 'Draft',
      totalSqft: totalSqftResolved,
      estimatedDays: estimatedDaysResolved,
      actualDays: asNum(pd.actualDays) ?? asNum(pd.actualDuration),
      startDate: asStr(pd.startDate ?? createdAtFromInfo ?? new Date().toISOString().split('T')[0]),
      endDate: asStr(pd.endDate ?? createdAtFromInfo ?? new Date().toISOString().split('T')[0]),
      totalBudget: totalBudgetResolved,
      totalMaterialCost: asNum(pd.totalMaterialCost) ?? (materialCostEstimate > 0 ? materialCostEstimate : undefined),
      totalLaborCost: asNum(pd.totalLaborCost) ?? (laborCostEstimate > 0 ? laborCostEstimate : undefined),
      estimatedProfitMargin: asNum(pd.estimatedProfitMargin) ?? (totalBudgetResolved && materialCostEstimate + laborCostEstimate > 0 ? Math.round(((totalBudgetResolved - materialCostEstimate - laborCostEstimate) / totalBudgetResolved) * 1000) / 10 : undefined),
      dailyPainterRate: asNum(pd.dailyPainterRate) ?? 850,
      createdAt: asStr(pd.createdAt) ?? asStr(pd.createdOn) ?? asStr(pd.createdDate) ?? asStr(obj.createdAt) ?? asStr(obj.createdOn) ?? asStr(obj.createdDate),
    },
    customerDetails: {
      name: asStr(cd.name) ?? asStr(cd.customerName),
      phone: asStr(cd.phone),
      email: asStr(cd.email),
      address: asStr(cd.address) ?? asStr(cd.location),
    },
    summaryMetrics: {
      totalInteriorSqft: asNum(sm.totalInteriorSqft),
      totalExteriorSqft: asNum(sm.totalExteriorSqft) ?? ew.totalAreaSqft,
      totalDoorsWindowsQty: asNum(sm.totalDoorsWindowsQty),
      estimatedTotalDays: asNum(sm.estimatedTotalDays),
    },
    exteriorWork: exteriorParsed,
    floors: floorsParsed,
    materialBillOfQuantities: allMaterials,
    materials: allMaterials,
    woodAndMetalItems: woodAndMetalParsed,
    specialFeatures: specialsParsed,
    supervisors: supervisorsParsed,
    leadSupervisorId: leadSupervisorIdResolved,
    leadSupervisor: leadSupervisorName,
    supervisorName: leadSupervisorName,
    supervisor: leadSupervisorName,
    assignedSupervisor: assignedSupObj ? {
      ...assignedSupObj,
      name: assignedSupObj.name ?? assignedSupName,
    } as PaintProject['assignedSupervisor'] : undefined,
    interiorSqft: interiorSqftResolved,
    exteriorSqft: exteriorSqftResolved,
    vendorOrders: [],
    dailyLogs: [],
    qaRecords: [],
    dailyTargets: [],
    supervisorSessions: [],
    supervisorActivity: [],
  };

  const { generated: generatedRooms } = generateTaskBreakdownFromJSON({
    floors: floorsParsed,
    exteriorWork: exteriorParsed,
    woodAndMetalItems: woodAndMetalParsed,
    specialFeatures: specialsParsed,
  });

  let finalFloors = parsedProject.floors ?? [];
  if (generatedRooms.length > 0) {
    const maxLevel = finalFloors.reduce((max, f) => Math.max(max, f.level ?? 0), 0);
    const generatedFloor: Floor = {
      id: 'floor-generated-tasks',
      name: 'Generated Tasks',
      level: maxLevel + 1,
      rooms: generatedRooms,
      isExterior: false,
    };
    finalFloors = [...finalFloors, generatedFloor];
  }

  const withGenerated = { ...parsedProject, floors: finalFloors };
  // Exterior walls/areas arrive in exteriorWork.sides[].
  // ensureExteriorFloor handles building and attaching canonical exterior rooms cleanly.
  const withExterior = ensureExteriorFloor(withGenerated);

  // Override JSON estimated days when implausibly low: if the source value is
  // less than 5 days for a project over 1000 sqft, recompute from actual scope.
  const sourceDays = withExterior.projectDetails.estimatedDays ?? 0;
  const computedDays = computeEstimatedDays(withExterior);
  const shouldOverride = totalSqftResolved > 1000 && sourceDays < 5;
  const finalDays = shouldOverride || sourceDays === 0 ? computedDays : sourceDays;

  const startDateStr = withExterior.projectDetails.startDate
    ?? withExterior.projectDetails.createdAt
    ?? new Date().toISOString().split('T')[0];
  const computedEndDate = addWorkingDays(startDateStr, finalDays);

  return {
    ...withExterior,
    projectDetails: {
      ...withExterior.projectDetails,
      estimatedDays: finalDays,
      endDate: computedEndDate,
    },
    summaryMetrics: {
      ...withExterior.summaryMetrics,
      estimatedTotalDays: finalDays,
    },
  };
}
