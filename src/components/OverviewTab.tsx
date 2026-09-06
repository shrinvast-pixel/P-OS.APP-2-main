import { useState } from 'react';
import {
  Ruler,
  Layers,
  DoorOpen,
  Package,
  TrendingUp,
  Clock,
  Wallet,
  Shield,
  MapPin,
  User,
  ChevronDown,
  CalendarDays,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Banknote,
  ClipboardList,
  ShoppingBag,
  X,
  Ruler as RulerIcon,
  Frame,
  Paintbrush,
  Sparkles,
  Hash,
  PencilLine,
  Check,
  Users,
} from 'lucide-react';
import type { PaintProject, ProjectWorkflowStatus, MaterialItem, ExteriorSide, WoodAndMetalItem, WallpaperItem, TextureItem, Supervisor, QaRecord, TaskStatus } from '@/types';
import { computeMetrics, computeEstimatedDays, fmtNum, fmtINR, fmtPct, getRoomArea, isExteriorFloor, deduplicateMaterials } from '@/utils';
import { Camera, CircleCheck as CheckCircle2, Info } from 'lucide-react';

type DrilldownView = 'interior' | 'exterior' | 'joinery' | 'materials';

interface OverviewTabProps {
  project: PaintProject;
  onRaisePurchaseOrder?: () => void;
  onSetLeadSupervisor?: (supervisorId: string) => void;
  onUpdateProjectDetails?: (updates: Partial<PaintProject['projectDetails']>) => void;
}

const WORKFLOW_CONFIG: Record<ProjectWorkflowStatus, { label: string; color: string; bg: string; dot: string }> = {
  SURVEY_COMPLETE: { label: 'Survey Complete', color: 'text-slate-600 dark:text-slate-300', bg: 'bg-slate-100 dark:bg-slate-800', dot: 'bg-slate-400' },
  BOM_GENERATED: { label: 'BOM Generated', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-500/15', dot: 'bg-blue-500' },
  PROCUREMENT_IN_PROGRESS: { label: 'Procurement In Progress', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-500/15', dot: 'bg-amber-500' },
  LIVE_EXECUTION: { label: 'Live Execution', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-500/15', dot: 'bg-emerald-500' },
  COMPLETED: { label: 'Completed', color: 'text-brand-600 dark:text-brand-400', bg: 'bg-brand-100 dark:bg-brand-500/15', dot: 'bg-brand-500' },
};

const WORKFLOW_STEPS: ProjectWorkflowStatus[] = ['SURVEY_COMPLETE', 'BOM_GENERATED', 'PROCUREMENT_IN_PROGRESS', 'LIVE_EXECUTION', 'COMPLETED'];

function deriveWorkflowStatus(project: PaintProject): ProjectWorkflowStatus {
  if (project.projectDetails.workflowStatus) return project.projectDetails.workflowStatus;
  const materials = project.materialBillOfQuantities ?? [];
  const hasOrders = materials.some((m) => m.orderStatus === 'ORDERED' || m.orderStatus === 'DELIVERED_AT_SITE');
  const allDelivered = materials.length > 0 && materials.every((m) => m.orderStatus === 'DELIVERED_AT_SITE');
  const metrics = computeMetrics(project);
  if (metrics.completedTasks > 0 && metrics.completedTasks === metrics.totalTasks) return 'COMPLETED';
  if (metrics.completedTasks > 0 || metrics.inProgressTasks > 0) return 'LIVE_EXECUTION';
  if (allDelivered) return 'LIVE_EXECUTION';
  if (hasOrders) return 'PROCUREMENT_IN_PROGRESS';
  if (materials.length > 0) return 'BOM_GENERATED';
  return 'SURVEY_COMPLETE';
}

export function OverviewTab({ project, onRaisePurchaseOrder, onSetLeadSupervisor, onUpdateProjectDetails }: OverviewTabProps) {
  const metrics = computeMetrics(project);
  const pd = project.projectDetails;
  const cd = project.customerDetails;
  const supervisors = project.supervisors ?? [];
  const leadSup = supervisors.find((s) => s.id === project.leadSupervisorId);
  const leadSupervisorDisplayName = project.leadSupervisor ?? project.supervisorName ?? project.assignedSupervisor?.name ?? project.supervisor ?? '';
  const workflowStatus = deriveWorkflowStatus(project);
  const wfConfig = WORKFLOW_CONFIG[workflowStatus];
  const isEarlyStage = workflowStatus === 'SURVEY_COMPLETE' || workflowStatus === 'BOM_GENERATED';
  const hasPurchaseOrders = (project.materialBillOfQuantities ?? []).some(
    (m) => m.orderStatus === 'ORDERED' || m.orderStatus === 'DELIVERED_AT_SITE',
  );

  const [drilldown, setDrilldown] = useState<DrilldownView | null>(null);
  const [editingFields, setEditingFields] = useState(false);
  const createdYear = (() => {
    const ref = pd.createdAt ? new Date(pd.createdAt) : null;
    const y = ref && !Number.isNaN(ref.getTime()) ? ref.getFullYear() : new Date().getFullYear();
    return y;
  })();
  const defaultStartDate = `${createdYear}-01-01`;
  const defaultEndDate = `${createdYear}-12-31`;
  const [editStartDate, setEditStartDate] = useState(pd.startDate ?? defaultStartDate);
  const [editEndDate, setEditEndDate] = useState(pd.endDate ?? defaultEndDate);
  const [editBudget, setEditBudget] = useState(pd.totalBudget?.toString() ?? '');

  const missingDates = !pd.startDate || !pd.endDate;
  const missingBudget = pd.totalBudget == null;
  const canEdit = (onUpdateProjectDetails != null) && (missingDates || missingBudget || editingFields);

  const handleSaveFields = () => {
    const updates: Partial<PaintProject['projectDetails']> = {};
    if (editStartDate.trim()) updates.startDate = editStartDate.trim();
    if (editEndDate.trim()) updates.endDate = editEndDate.trim();
    if (editBudget.trim() && !Number.isNaN(Number(editBudget))) updates.totalBudget = Number(editBudget);
    onUpdateProjectDetails?.(updates);
    setEditingFields(false);
  };

  const toggleDrilldown = (view: DrilldownView) =>
    setDrilldown((prev) => (prev === view ? null : view));

  const workflowIdx = WORKFLOW_STEPS.indexOf(workflowStatus);

  const materials = deduplicateMaterials(project.materialBillOfQuantities ?? []);
  const bomTotal = materials.reduce((sum, m) => sum + (m.totalRequiredQty ?? 0) * (m.unitCost ?? 0), 0);

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Project overview card with workflow badge */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card dark:border-slate-800 dark:bg-slate-900">
        <div className="grid gap-4 p-5 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-brand-500">Project Overview</p>
                <h2 className="mt-0.5 text-xl font-bold text-slate-800 dark:text-slate-100">
                  {pd.name ?? 'Untitled Project'}
                </h2>
              </div>
              <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${wfConfig.bg} ${wfConfig.color}`}>
                <span className={`h-2 w-2 rounded-full ${wfConfig.dot} ${workflowStatus === 'LIVE_EXECUTION' ? 'animate-pulse' : ''}`} />
                {wfConfig.label}
              </span>
            </div>
            <div className="space-y-2 text-sm">
              <InfoRow icon={<User size={14} />} label="Client" value={cd.name ?? '—'} />
              <InfoRow icon={<MapPin size={14} />} label="Address" value={cd.address ?? '—'} />
              <InfoRow icon={<Ruler size={14} />} label="Total SqFt" value={`${fmtNum((metrics.interiorSqft ?? 0) + (metrics.exteriorSqft ?? 0))} sqft`} />
              <InfoRow icon={<Wallet size={14} />} label="Total Budget" value={fmtINR(pd.totalBudget)} />
              <SupervisorRow
                supervisors={supervisors}
                leadSup={leadSup}
                fallbackName={leadSupervisorDisplayName}
                onSetLeadSupervisor={onSetLeadSupervisor}
              />
            </div>
          </div>

          <div className="space-y-3">
            {canEdit ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-500/30 dark:bg-amber-500/5">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                  <PencilLine size={13} /> Edit Project Details
                </div>
                <div className="space-y-2.5">
                  <EditableField label="Start Date" type="date" value={editStartDate} onChange={setEditStartDate} />
                  <EditableField label="End Date" type="date" value={editEndDate} onChange={setEditEndDate} />
                  <EditableField label="Total Budget (₹)" type="number" value={editBudget} onChange={setEditBudget} placeholder={pd.totalBudget ? String(pd.totalBudget) : "Enter budget"} />
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={handleSaveFields}
                      className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-brand-600"
                    >
                      <Check size={13} /> Save
                    </button>
                    <button
                        onClick={() => { setEditStartDate(pd.startDate ?? defaultStartDate); setEditEndDate(pd.endDate ?? defaultEndDate); setEditBudget(pd.totalBudget != null ? String(pd.totalBudget) : ''); setEditingFields(false); }}
                      className="flex items-center gap-1.5 rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                    >
                      <X size={13} /> Cancel
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <TimelineCard icon={<CalendarDays size={16} />} label="Start Date" value={pd.startDate ?? '—'} />
                <TimelineCard icon={<CalendarDays size={16} />} label="End Date" value={pd.endDate ?? '—'} />
                <TimelineCard icon={<Clock size={16} />} label="Estimated Days" value={`${pd.estimatedDays ?? computeEstimatedDays(project) ?? '—'} days`} />
                <TimelineCard
                  icon={<Clock size={16} />}
                  label="Actual Days"
                  value={`${pd.actualDays ?? '—'} days`}
                  highlight={(pd.actualDays ?? 0) > (pd.estimatedDays ?? 0)}
                />
              </div>
            )}
            {onUpdateProjectDetails && !canEdit && (
              <button
                onClick={() => setEditingFields(true)}
                className="flex items-center gap-1.5 self-start rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <PencilLine size={13} /> Edit Dates & Budget
              </button>
            )}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  <TrendingUp size={15} className="text-brand-500" />
                  Overall Completion
                </span>
                <span className="text-lg font-bold text-brand-600 dark:text-brand-400">{metrics.overallPct}%</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-all duration-500"
                  style={{ width: `${metrics.overallPct}%` }}
                />
              </div>
              <div className="mt-2 flex gap-4 text-xs text-slate-500 dark:text-slate-400">
                <Legend color="bg-emerald-500" label={`Completed: ${metrics.completedTasks}`} />
                <Legend color="bg-amber-500" label={`In Progress: ${metrics.inProgressTasks}`} />
                <Legend color="bg-slate-400" label={`Other: ${metrics.totalTasks - metrics.completedTasks - metrics.inProgressTasks}`} />
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-1.5">
            {WORKFLOW_STEPS.map((step, idx) => {
              const cfg = WORKFLOW_CONFIG[step];
              const isDone = idx <= workflowIdx;
              const isCurrent = idx === workflowIdx;
              return (
                <div key={step} className="flex flex-1 items-center">
                  <div className="flex flex-col items-center gap-1">
                    <div className={`grid h-7 w-7 place-items-center rounded-full text-[10px] font-bold transition-all ${
                      isDone ? `${cfg.bg} ${cfg.color}` : 'bg-slate-100 text-slate-400 dark:bg-slate-800'
                    } ${isCurrent ? 'ring-2 ring-brand-400 ring-offset-1 dark:ring-offset-slate-900' : ''}`}>
                      {isDone ? '✓' : idx + 1}
                    </div>
                    <p className={`text-[9px] font-medium leading-tight text-center ${isDone ? cfg.color : 'text-slate-400'}`}>
                      {cfg.label.split(' ')[0]}
                    </p>
                  </div>
                  {idx < WORKFLOW_STEPS.length - 1 && (
                    <div className={`mx-1 h-0.5 flex-1 rounded-full ${idx < workflowIdx ? 'bg-brand-400' : 'bg-slate-200 dark:bg-slate-700'}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Metric cards — clickable drilldown toggles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          icon={<Ruler size={18} />}
          value={`${fmtNum(metrics.interiorSqft)}`}
          label="Interior SqFt"
          color="brand"
          active={drilldown === 'interior'}
          onClick={() => toggleDrilldown('interior')}
        />
        <MetricCard
          icon={<Layers size={18} />}
          value={`${fmtNum(metrics.exteriorSqft)}`}
          label="Exterior SqFt"
          color="sky"
          active={drilldown === 'exterior'}
          onClick={() => toggleDrilldown('exterior')}
        />
        <MetricCard
          icon={<DoorOpen size={18} />}
          value={fmtNum(metrics.doorsWindowsQty)}
          label="Doors & Windows"
          color="amber"
          active={drilldown === 'joinery'}
          onClick={() => toggleDrilldown('joinery')}
        />
        <MetricCard
          icon={<Package size={18} />}
          value={`${metrics.materialCount}`}
          label="Materials"
          color="emerald"
          active={drilldown === 'materials'}
          onClick={() => toggleDrilldown('materials')}
        />
      </div>

      {/* Drilldown panel */}
      {drilldown && (
        <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white shadow-card dark:border-brand-500/30 dark:bg-slate-900 animate-fade-in">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 dark:border-slate-800">
            <div className="flex items-center gap-2">
              {drilldown === 'interior' && <Ruler size={16} className="text-brand-500" />}
              {drilldown === 'exterior' && <Layers size={16} className="text-sky-500" />}
              {drilldown === 'joinery' && <Frame size={16} className="text-amber-500" />}
              {drilldown === 'materials' && <Sparkles size={16} className="text-emerald-500" />}
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {drilldown === 'interior' && 'Interior Room Breakdown'}
                {drilldown === 'exterior' && 'Exterior Side Breakdown'}
                {drilldown === 'joinery' && 'Joinery & Wood/Metal Items'}
                {drilldown === 'materials' && 'Special Features — Wallpapers & Textures'}
              </h3>
            </div>
            <button
              onClick={() => setDrilldown(null)}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <X size={14} />
              Close
            </button>
          </div>
          <div className="p-5">
            {drilldown === 'interior' && <InteriorDrilldown project={project} />}
            {drilldown === 'exterior' && <ExteriorDrilldown project={project} />}
            {drilldown === 'joinery' && <JoineryDrilldown project={project} />}
            {drilldown === 'materials' && <MaterialsDrilldown project={project} />}
          </div>
        </div>
      )}

      {/* Pre-Execution Audit & Planning Panel (early stages) — uses real BOM */}
      {isEarlyStage && (
        <PreExecutionPanel
          materials={materials}
          bomTotal={bomTotal}
          totalSqft={(metrics.interiorSqft ?? 0) + (metrics.exteriorSqft ?? 0)}
          onRaisePurchaseOrder={onRaisePurchaseOrder}
        />
      )}

      {/* P&L Card */}
      {hasPurchaseOrders && <PnLCard project={project} />}

      {/* Site Photo & QA Proof Log */}
      {(project.qaRecords ?? []).length > 0 && (
        <SitePhotoAndQaProofLog qaRecords={project.qaRecords!} floors={project.floors} />
      )}

      {/* Floor-by-floor breakdown */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Floor Breakdown</h3>
        {(project.floors ?? []).map((floor) => (
          <FloorAccordion
            key={floor.id}
            floor={floor}
            sides={isExteriorFloor(floor) ? (project.exteriorWork?.sides ?? []) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

/* ---------- Drilldown views ---------- */

function InteriorDrilldown({ project }: { project: PaintProject }) {
  const floors = project.floors ?? [];
  if (floors.length === 0) return <EmptyState text="No interior rooms found." />;
  return (
    <div className="space-y-4">
      {floors.map((floor) => {
        const rooms = floor.rooms ?? [];
        const floorTotal = rooms.reduce((s, r) => s + (r.totalSqft ?? r.interiorSqft ?? 0), 0);
        const floorNet = rooms.reduce((s, r) => s + (r.netWallSqft ?? 0), 0);
        return (
          <div key={floor.id} className="rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Layers size={15} className="text-brand-500" />
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{floor.name}</span>
                <span className="text-xs text-slate-400">{rooms.length} rooms</span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="font-medium text-slate-600 dark:text-slate-300">{fmtNum(floorTotal)} sqft</span>
                <span className="text-slate-400">Net wall: {fmtNum(floorNet)} sqft</span>
              </div>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {rooms.map((room) => {
                const steps = room.finishingSteps ?? [];
                const done = steps.filter((s) => s.status === 'COMPLETED').length;
                const displayArea = room.sqft || room.totalSqft || room.netWallSqft || (room.finishingSteps && room.finishingSteps[0]?.targetSqft) || 0;
                return (
                  <div key={room.id} className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{room.name}</p>
                        <div className="mt-0.5 flex items-center gap-3 text-xs text-slate-400">
                          <span className="flex items-center gap-1"><Ruler size={10} /> {fmtNum(displayArea)} sqft</span>
                          {room.netWallSqft != null && <span>Net wall: {fmtNum(room.netWallSqft)} sqft</span>}
                          <span>{done}/{steps.length} steps done</span>
                        </div>
                      </div>
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                        <div className="h-full rounded-full bg-brand-500" style={{ width: `${steps.length > 0 ? (done / steps.length) * 100 : 0}%` }} />
                      </div>
                    </div>
                    {steps.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {steps.map((s) => (
                          <span key={s.id} className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                            s.status === 'COMPLETED'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
                              : s.status === 'IN_PROGRESS'
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'
                                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                          }`}>
                            {s.stepNumber ?? ''}. {s.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ExteriorDrilldown({ project }: { project: PaintProject }) {
  const sides = project.exteriorWork?.sides ?? [];
  if (sides.length === 0) return <EmptyState text="No exterior sides found." />;
  const total = project.exteriorWork?.totalAreaSqft ?? sides.reduce((s, side) => s + (side.areaSqft ?? 0), 0);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-lg bg-sky-50 px-4 py-2.5 text-sm dark:bg-sky-500/10">
        <Layers size={15} className="text-sky-500" />
        <span className="font-semibold text-slate-700 dark:text-slate-200">Total Exterior Area: {fmtNum(total)} sqft</span>
        <span className="text-xs text-slate-400">· {sides.length} sides</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {sides.map((side: ExteriorSide) => {
          const treatments = side.treatments ?? [];
          const done = treatments.filter((t) => t.status === 'COMPLETED').length;
          return (
            <div key={side.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{side.name}</p>
                  {side.label && <p className="text-xs text-slate-400">{side.label}</p>}
                </div>
                <span className="rounded-lg bg-sky-50 px-2.5 py-1 text-sm font-bold text-sky-600 dark:bg-sky-500/10 dark:text-sky-400">
                  {fmtNum(side.areaSqft)} sqft
                </span>
              </div>
              {side.condition && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <MapPin size={12} className="mt-0.5 shrink-0 text-slate-400" />
                  {side.condition}
                </p>
              )}
              {treatments.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Treatments ({done}/{treatments.length} done)
                  </p>
                  {treatments.map((t) => (
                    <div key={t.id} className="flex items-center gap-2 text-xs">
                      <span className={`h-1.5 w-1.5 rounded-full ${
                        t.status === 'COMPLETED' ? 'bg-emerald-500'
                          : t.status === 'IN_PROGRESS' ? 'bg-amber-500'
                          : 'bg-slate-300 dark:bg-slate-600'
                      }`} />
                      <span className="text-slate-600 dark:text-slate-300">{t.name}</span>
                      {t.brand && <span className="text-slate-400">· {t.brand}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function JoineryDrilldown({ project }: { project: PaintProject }) {
  const items = project.woodAndMetalItems ?? [];
  if (items.length === 0) return <EmptyState text="No joinery items found." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
            <th className="px-4 py-3 font-semibold">Item</th>
            <th className="px-4 py-3 font-semibold">Type</th>
            <th className="px-4 py-3 font-semibold">Dimensions</th>
            <th className="px-4 py-3 font-semibold">Total SqFt</th>
            <th className="px-4 py-3 font-semibold">Qty</th>
            <th className="px-4 py-3 font-semibold">Finish</th>
            <th className="px-4 py-3 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {items.map((item: WoodAndMetalItem) => (
            <tr key={item.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">{item.name}</td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {item.type}
                </span>
              </td>
              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{item.dimensions ?? '—'}</td>
              <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">{item.totalSqft != null ? `${fmtNum(item.totalSqft)} sqft` : '—'}</td>
              <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">{item.count ?? 1}</td>
              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{item.finishType ?? '—'}</td>
              <td className="px-4 py-3">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                  item.status === 'COMPLETED'
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
                    : item.status === 'IN_PROGRESS'
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-300'
                }`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${
                    item.status === 'COMPLETED' ? 'bg-emerald-500'
                      : item.status === 'IN_PROGRESS' ? 'bg-amber-500'
                      : 'bg-slate-400'
                  }`} />
                  {item.status === 'COMPLETED' ? 'Completed' : item.status === 'IN_PROGRESS' ? 'In Progress' : 'Not Started'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MaterialsDrilldown({ project }: { project: PaintProject }) {
  const wallpapers = project.specialFeatures?.wallpapers ?? [];
  const textures = project.specialFeatures?.textures ?? [];
  if (wallpapers.length === 0 && textures.length === 0) return <EmptyState text="No special features found." />;
  const totalRolls = wallpapers.reduce((s, w) => s + (w.rolls ?? 0), 0);
  const totalTextureSqft = textures.reduce((s, t) => s + (t.totalSqft ?? t.areaSqft ?? 0), 0);
  return (
    <div className="space-y-5">
      {/* Wallpapers */}
      {wallpapers.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Hash size={15} className="text-brand-500" />
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Wallpapers</h4>
            <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-medium text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
              {totalRolls} rolls total
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {wallpapers.map((wp: WallpaperItem) => (
              <div key={wp.id} className="rounded-xl border border-slate-200 p-3.5 dark:border-slate-700">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{wp.name}</p>
                    {wp.roomName && <p className="text-xs text-slate-400">{wp.roomName}</p>}
                  </div>
                  <span className="rounded-lg bg-brand-50 px-2.5 py-1 text-sm font-bold text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
                    {wp.rolls ?? 0} rolls
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-3 text-xs text-slate-400">
                  {wp.totalSqft != null && <span className="flex items-center gap-1"><Ruler size={10} /> {fmtNum(wp.totalSqft)} sqft</span>}
                  {wp.brand && <span>· {wp.brand}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Textures */}
      {textures.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Paintbrush size={15} className="text-emerald-500" />
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Textures</h4>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
              {fmtNum(totalTextureSqft)} sqft total
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {textures.map((tex: TextureItem) => (
              <div key={tex.id} className="rounded-xl border border-slate-200 p-3.5 dark:border-slate-700">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{tex.name}</p>
                    {tex.textureType && <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{tex.textureType}</p>}
                    {tex.roomName && <p className="text-xs text-slate-400">{tex.roomName}</p>}
                  </div>
                  <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-sm font-bold text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
                    {fmtNum(tex.totalSqft ?? tex.areaSqft)} sqft
                  </span>
                </div>
                {tex.brand && <p className="mt-2 text-xs text-slate-400">Brand: {tex.brand}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 px-6 py-10 text-center text-sm text-slate-400 dark:border-slate-700 dark:text-slate-500">
      {text}
    </div>
  );
}

/* ---------- Pre-Execution Panel (uses real BOM data) ---------- */

function PreExecutionPanel({
  materials,
  bomTotal,
  totalSqft,
  onRaisePurchaseOrder,
}: {
  materials: MaterialItem[];
  bomTotal: number;
  totalSqft: number;
  onRaisePurchaseOrder?: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white shadow-card dark:border-blue-500/30 dark:from-blue-500/10 dark:to-slate-900">
      <div className="flex items-center gap-2.5 border-b border-blue-100 px-5 py-3.5 dark:border-blue-500/20">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400">
          <ClipboardList size={18} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Pre-Execution Audit & Planning</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Material requirements from project BOM · {fmtNum(totalSqft)} sqft scope</p>
        </div>
      </div>
      <div className="p-5">
        {materials.length > 0 ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {materials.map((m) => (
                <div key={m.id} className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-700 dark:bg-slate-800/50">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{m.name || (m.category ? m.category.charAt(0).toUpperCase() + m.category.slice(1) : 'Standard Material')}</p>
                      <p className="text-[10px] uppercase tracking-wider text-slate-400">{m.category ?? 'General'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-brand-600 dark:text-brand-400">{fmtNum(m.totalRequiredQty)} {m.unit}</p>
                      {m.unitCost != null && <p className="text-xs text-slate-500">{fmtINR((m.totalRequiredQty ?? 0) * (m.unitCost ?? 0))}</p>}
                    </div>
                  </div>
                  {m.brand && (
                    <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-400">
                      <Package size={10} />
                      {m.brand}{m.packSize ? ` · ${m.packSize}` : ''}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-col items-center justify-between gap-3 rounded-xl bg-slate-50 p-4 dark:bg-slate-800/50 sm:flex-row">
              <div className="text-center sm:text-left">
                <p className="text-xs text-slate-500 dark:text-slate-400">Estimated Material Cost</p>
                <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{fmtINR(bomTotal)}</p>
              </div>
              <button
                onClick={onRaisePurchaseOrder}
                className="flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-3 text-sm font-bold text-white shadow-md shadow-brand-500/20 transition-all hover:bg-brand-600 active:scale-[0.98]"
              >
                <ShoppingBag size={18} />
                Raise Purchase Order
              </button>
            </div>
          </>
        ) : (
          <p className="text-center text-sm text-slate-400 py-6">No BOM materials found. Import site JSON to populate.</p>
        )}
      </div>
    </div>
  );
}

/* ---------- Shared sub-components ---------- */

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-slate-400">{icon}</span>
      <span className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</span>
      <span className="ml-auto text-right text-sm font-medium text-slate-700 dark:text-slate-200">{value}</span>
    </div>
  );
}

function SupervisorRow({
  supervisors,
  leadSup,
  fallbackName,
  onSetLeadSupervisor,
}: {
  supervisors: Supervisor[];
  leadSup: Supervisor | undefined;
  fallbackName: string;
  onSetLeadSupervisor?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const displayName = leadSup?.name ?? fallbackName;
  if (!onSetLeadSupervisor || supervisors.length === 0) {
    return (
      <InfoRow
        icon={<Shield size={14} />}
        label="Lead Supervisor"
        value={displayName ? (leadSup ? `${displayName} (${leadSup.role})` : displayName) : 'Not Assigned'}
      />
    );
  }
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-slate-400"><Shield size={14} /></span>
      <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Lead Supervisor</span>
      <div className="relative ml-auto">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:border-brand-300 hover:bg-brand-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-brand-500/50 dark:hover:bg-brand-500/10"
        >
          <Users size={13} className="text-brand-500" />
          {displayName || 'Assign...'}
          <ChevronDown size={13} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
              {supervisors.map((sup) => (
                <button
                  key={sup.id}
                  onClick={() => { onSetLeadSupervisor(sup.id); setOpen(false); }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-brand-50 dark:hover:bg-brand-500/10 ${
                    sup.id === leadSup?.id ? 'font-semibold text-brand-600 dark:text-brand-400' : 'text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <span>{sup.name}</span>
                  <span className="text-xs text-slate-400">{sup.role}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function EditableField({ label, type, value, onChange, placeholder }: { label: string; type: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="flex items-center gap-2">
      <label className="w-20 shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 outline-none transition-colors focus:border-brand-400 focus:ring-1 focus:ring-brand-400/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
      />
    </div>
  );
}

function TimelineCard({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${highlight ? 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-500/10' : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50'}`}>
      <div className={`mb-1 ${highlight ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}`}>{icon}</div>
      <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-slate-400">{label}</p>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}

function MetricCard({
  icon,
  value,
  label,
  color,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  color: 'brand' | 'sky' | 'amber' | 'emerald';
  active?: boolean;
  onClick?: () => void;
}) {
  const colors = {
    brand: 'text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-500/10',
    sky: 'text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-500/10',
    amber: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10',
    emerald: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10',
  };
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border p-4 text-left shadow-card transition-all active:scale-[0.98] ${
        active
          ? 'border-brand-400 bg-brand-50 ring-2 ring-brand-400/20 dark:border-brand-500 dark:bg-brand-500/10 dark:ring-brand-500/20'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-card-hover dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
      }`}
    >
      <div className={`mb-2 grid h-9 w-9 place-items-center rounded-lg ${colors[color]}`}>{icon}</div>
      <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{value}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
    </button>
  );
}

function PnLCard({ project }: { project: PaintProject }) {
  const pd = project.projectDetails;
  const revenue = pd.totalBudget ?? 0;
  const materialSpend = pd.totalMaterialCost ?? (project.materialBillOfQuantities ?? []).reduce((sum, m) => sum + (m.orderedQty ?? 0) * (m.unitCost ?? 0), 0);
  const laborSpend = pd.totalLaborCost ?? (project.dailyLogs ?? []).reduce((sum, log) => sum + log.attendanceCount * (pd.dailyPainterRate ?? 0), 0);
  const totalCost = materialSpend + laborSpend;
  const netProfit = revenue - totalCost;
  const profitPct = revenue > 0 ? (netProfit / revenue) * 100 : 0;
  const isProfit = netProfit >= 0;
  const margin = pd.estimatedProfitMargin ?? 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
          <DollarSign size={18} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Project P&L & Cashflow</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Real-time financial overview</p>
        </div>
      </div>
      <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <PnLRow icon={<Banknote size={16} />} label="Budgeted Revenue" value={fmtINR(revenue)} color="text-slate-700 dark:text-slate-200" bg="bg-slate-100 dark:bg-slate-800" />
        <PnLRow icon={<ArrowUpRight size={16} />} label="Material Spend" value={fmtINR(materialSpend)} color="text-amber-600 dark:text-amber-400" bg="bg-amber-50 dark:bg-amber-500/10" />
        <PnLRow icon={<ArrowUpRight size={16} />} label="Labor Spend (Est.)" value={fmtINR(laborSpend)} color="text-orange-600 dark:text-orange-400" bg="bg-orange-50 dark:bg-orange-500/10" />
        <PnLRow
          icon={isProfit ? <ArrowDownRight size={16} /> : <ArrowUpRight size={16} />}
          label="Net Profit"
          value={fmtINR(netProfit)}
          subValue={`${profitPct.toFixed(1)}% margin`}
          color={isProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}
          bg={isProfit ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-red-50 dark:bg-red-500/10'}
        />
      </div>
      <div className="border-t border-slate-100 px-5 py-4 dark:border-slate-800">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-slate-500 dark:text-slate-400">
            Est. Profit Margin: <span className="font-semibold text-slate-700 dark:text-slate-200">{margin}%</span>
          </span>
          <span className={`font-semibold ${isProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
            {isProfit ? 'On Track' : 'Over Budget'}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <div className={`h-full rounded-full transition-all duration-500 ${isProfit ? 'bg-emerald-500' : 'bg-red-500'}`} style={{ width: `${Math.min(Math.abs(profitPct), 100)}%` }} />
        </div>
      </div>
    </div>
  );
}

function PnLRow({ icon, label, value, subValue, color, bg }: { icon: React.ReactNode; label: string; value: string; subValue?: string; color: string; bg: string }) {
  return (
    <div className="rounded-xl border border-slate-100 p-3.5 dark:border-slate-800">
      <div className={`mb-2 grid h-8 w-8 place-items-center rounded-lg ${bg} ${color}`}>{icon}</div>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-slate-400">{label}</p>
      {subValue && <p className={`mt-0.5 text-xs font-medium ${color}`}>{subValue}</p>}
    </div>
  );
}

function SitePhotoAndQaProofLog({ qaRecords, floors }: { qaRecords: QaRecord[]; floors: any[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-card dark:border-emerald-500/30 dark:bg-slate-900">
      <div className="flex items-center gap-2.5 border-b border-emerald-100 px-5 py-3.5 dark:border-emerald-500/20">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
          <Camera size={18} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Site Photo & QA Proof Log</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">{qaRecords.length} historical task proofs available</p>
        </div>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {qaRecords.slice().reverse().map((record) => {
          const floor = floors.find(f => f.id === record.floorId);
          const room = floor?.rooms?.find((r: any) => r.id === record.roomId);
          const step = room?.finishingSteps?.find((s: any) => s.id === record.stepId);
          
          return (
            <div key={record.id} className="p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{step?.name || 'Task'}</span>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">VERIFIED</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {floor?.name} · {room?.name}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    Approved by {record.approvedBy} on {new Date(record.approvedAt).toLocaleDateString()}
                  </p>
                </div>
                
                <div className="flex flex-wrap gap-2">
                  {record.beforePhotoUrl && (
                    <div className="relative h-20 w-20 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                      <img src={record.beforePhotoUrl} alt="Before" className="h-full w-full object-cover" />
                      <span className="absolute bottom-0 left-0 right-0 bg-slate-900/60 text-[8px] font-bold text-white text-center">Before</span>
                    </div>
                  )}
                  {record.afterPhotoUrl && (
                    <div className="relative h-20 w-20 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                      <img src={record.afterPhotoUrl} alt="After" className="h-full w-full object-cover" />
                      <span className="absolute bottom-0 left-0 right-0 bg-slate-900/60 text-[8px] font-bold text-white text-center">After</span>
                    </div>
                  )}
                  {record.proofPhotos?.map((url, i) => (
                    <div key={i} className="relative h-20 w-20 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                      <img src={url} alt={`Proof ${i+1}`} className="h-full w-full object-cover" />
                      <span className="absolute bottom-0 left-0 right-0 bg-slate-900/60 text-[8px] font-bold text-white text-center">Proof {i+1}</span>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {Object.entries(record.checklist).map(([key, checked]) => (
                  <div key={key} className={`flex items-center gap-1.5 text-[10px] font-medium ${checked ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                    <CheckCircle2 size={10} className={checked ? 'text-emerald-500' : 'text-slate-300'} />
                    {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FloorAccordion({ floor, sides }: { floor: NonNullable<PaintProject['floors'][number]>; sides?: ExteriorSide[] }) {
  const [open, setOpen] = useState(true);
  const isExt = isExteriorFloor(floor);
  const rooms = floor.rooms ?? [];

  // Always compute from the floor's own rooms so the header sqft matches the
  // sum of the cards below — regardless of whether the floor is interior,
  // exterior, or generated tasks.
  const totalSqft = rooms.reduce(
    (sum, r) => sum + getRoomArea(r, isExt),
    0,
  );
  const totalSteps = rooms.reduce(
    (sum, r) => sum + (r.finishingSteps?.length ?? 0), 0,
  );
  const completedSteps = rooms.reduce(
    (sum, r) => sum + (r.finishingSteps?.filter((s) => s.status === 'COMPLETED').length ?? 0), 0,
  );
  const cardCount = rooms.length;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card dark:border-slate-800 dark:bg-slate-900">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
      >
        <div className="flex items-center gap-2.5">
          <Layers size={15} className="text-brand-500" />
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{floor.name}</span>
          <span className="text-xs text-slate-400">{cardCount} {isExt ? 'elevations' : 'rooms'} · {fmtNum(totalSqft)} sqft</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{fmtPct(completedSteps, totalSteps)}</span>
          <ChevronDown size={15} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {open && (
        <div className="grid gap-3 border-t border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-3 dark:border-slate-800">
          {isExt
            ? rooms.map((room) => {
                const steps = room.finishingSteps ?? [];
                const completedCount = steps.filter((s) => s.status === 'COMPLETED').length;
                const totalCount = steps.length;
                const displayArea = getRoomArea(room, true);
                const pct = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
                return (
                  <div key={room.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/50">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{room.name}</p>
                    <div className="mt-1 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                      <span>{fmtNum(displayArea)} sqft</span>
                      <span>·</span>
                      <span>{completedCount}/{totalCount} steps</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                      <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })
            : rooms.map((room) => {
                const steps = room.finishingSteps ?? [];
                const completedCount = steps.filter((s) => s.status === 'COMPLETED').length;
                const totalCount = steps.length;
                const displayArea = getRoomArea(room, false);
                const pct = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
                return (
                  <div key={room.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/50">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{room.name}</p>
                    <div className="mt-1 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                      <span>{fmtNum(displayArea)} sqft</span>
                      <span>·</span>
                      <span>{completedCount}/{totalCount} steps</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                      <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
        </div>
      )}
    </div>
  );
}
