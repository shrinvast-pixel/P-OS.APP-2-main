import { useMemo, useState, useEffect } from 'react';
import { Sun, CircleCheck as CheckCircle2, Clock, ClipboardList, Layers, Brush, CircleUser as UserCircle2, TrendingUp, Calendar, CalendarClock, Users, TriangleAlert as AlertTriangle, FileText, ClipboardCheck, ChevronDown, Check, Target, Plus, Ruler, LogIn, LogOut, MapPin, Timer, Coffee, X, Camera, ImageOff, Hourglass, AlarmClock, ZoomIn, ZoomOut, Eye } from 'lucide-react';
import type {
  PaintProject,
  Supervisor,
  FinishingStep,
  TaskStatus,
  DailyLog,
  Painter,
  ClockState,
  SupervisorSessionState,
} from '@/types';
import { StatusBadge } from './StatusBadge';
import { DailyLogModal, type DailyLogForm } from './DailyLogModal';
import { QaInspectionModal, type QaForm } from './QaInspectionModal';
import { ErrorBoundary } from './ErrorBoundary';
import {
  progressToStatus,
  statusToProgress,
  todayISO,
  isStockPhotoUrl,
  getRealPhotoUrl,
  formatSchedDate,
  formatDateTime,
  computeSla,
  logDateHeader,
  isExteriorMaterial,
  isInteriorMaterial,
  filterExteriorMaterials,
  filterInteriorMaterials,
  estimateHours,
  getStepProductivity,
  maxDailySqft,
  PAINTER_DAILY_CAPACITY_HOURS,
} from '@/utils';

interface SupervisorPortalProps {
  project: PaintProject;
  supervisor: Supervisor;
  onTaskProgress: (floorId: string, roomId: string, stepId: string, progressPct: number, status: TaskStatus) => void;
  onPainterAssign: (floorId: string, roomId: string, stepId: string, painterIds: string[]) => void;
  onUpdateTaskStep: (floorId: string, roomId: string, stepId: string, updates: Partial<FinishingStep>) => void;
  onQaApprove: (floorId: string, roomId: string, stepId: string, form: QaForm) => void;
  onAssignDailyTarget: (painterId: string, floorId: string, roomId: string, stepId: string, targetSqft: number, targetHours?: number) => void;
  onTogglePainterCheckIn: (painterId: string) => void;
  onClockChange: (painterId: string, state: ClockState) => void;
  onPhotoAudit: (floorId: string, roomId: string, stepId: string, approved: boolean) => void;
  onUpdatePhoto: (floorId: string, roomId: string, stepId: string, photoUrl: string, type: 'before' | 'after') => void;
  onSubmitDailyLog: (log: Omit<DailyLog, 'id' | 'supervisorId' | 'supervisorName' | 'submittedAt'>) => void;
  onSessionChange: (supervisorId: string, state: SupervisorSessionState) => void;
}

const STEP_ICONS: Record<string, string> = {
  putty: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  primer: 'bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400',
  emulsion: 'bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400',
  sanding: 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
  cleaning: 'bg-cyan-100 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400',
  touchup: 'bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400',
  qa: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
};

function stepIconClass(name: string | undefined): string {
  const key = (name || '').toLowerCase();
  for (const k of Object.keys(STEP_ICONS)) {
    if (key.includes(k)) return STEP_ICONS[k];
  }
  return 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400';
}

function getInitials(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Clean SVG-style placeholder shown when no real painter photo has been uploaded. */
function NoPhotoPlaceholder({ label = 'No Photo Uploaded' }: { label?: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-600/60 bg-slate-800/40 px-2 py-2 text-slate-500">
      <ImageOff size={18} className="text-slate-500" />
      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
    </div>
  );
}

/** Initials avatar — replaces hardcoded stock avatar URLs. */
function InitialsAvatar({ name, size = 32, className = '' }: { name?: string | null; size?: number; className?: string }) {
  return (
    <div
      className={`grid shrink-0 place-items-center rounded-full bg-brand-500/15 font-black text-brand-400 ring-1 ring-brand-500/30 ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {getInitials(name)}
    </div>
  );
}

/** Red/green SLA badge: "Took N Days" or "Delayed by N Days". */
function SlaBadge({ sla }: { sla: ReturnType<typeof computeSla> }) {
  if (!sla) return null;
  if (sla.delayed) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-red-500/15 px-1.5 py-0.5 text-[9px] font-black uppercase text-red-400 ring-1 ring-red-500/30">
        <AlarmClock size={11} />
        Delayed by {sla.delayDays} Day{sla.delayDays > 1 ? 's' : ''}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-black uppercase text-emerald-400 ring-1 ring-emerald-500/30">
      <Hourglass size={11} />
      Took {sla.actualDays} Day{sla.actualDays > 1 ? 's' : ''}
    </span>
  );
}

/** Compact metadata badges for a step: Scheduled, Completed, SLA, Painter. */
function TaskMetaBadges({
  step,
  painters,
}: {
  step: FinishingStep;
  painters: Painter[];
}) {
  const sla = computeSla(step);
  const painterNames = painters
    .filter((p) => step.painterIds?.includes(p.id))
    .map((p) => p.name);
  const painterLabel = painterNames.length ? painterNames.join(', ') : 'Unassigned';
  const completedTs = step.completedAt ?? step.afterPhotoAt;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 rounded-md bg-slate-700/40 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-300">
        <Calendar size={11} />
        Sched: {formatSchedDate(step.scheduledDate)}
      </span>
      {completedTs && (
        <span className="inline-flex items-center gap-1 rounded-md bg-slate-700/40 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-300">
          <CalendarClock size={11} />
          Done: {formatDateTime(completedTs)}
        </span>
      )}
      {sla && <SlaBadge sla={sla} />}
      <span className="inline-flex items-center gap-1 rounded-md bg-brand-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-brand-300 ring-1 ring-brand-500/20">
        <Users size={11} />
        {painterLabel}
      </span>
    </div>
  );
}

export function SupervisorPortal({
  project,
  supervisor,
  onTaskProgress,
  onPainterAssign,
  onUpdateTaskStep,
  onQaApprove,
  onAssignDailyTarget,
  onTogglePainterCheckIn,
  onClockChange,
  onPhotoAudit,
  onUpdatePhoto,
  onSubmitDailyLog,
  onSessionChange,
}: SupervisorPortalProps) {
  const [checkInTime, setCheckInTime] = useState<string | null>(null);
  const [showDailyLog, setShowDailyLog] = useState(false);
  const [showTargetAllocator, setShowTargetAllocator] = useState(false);
  const [activeTab, setActiveTab] = useState<'rooms' | 'weekly' | 'agenda' | 'logs'>('rooms');
  const [logFilterDate, setLogFilterDate] = useState<string>('');
  const [photoUploadTarget, setPhotoUploadTarget] = useState<{ floorId: string; roomId: string; step: FinishingStep } | null>(null);
  const [qaTarget, setQaTarget] = useState<{ floorId: string; roomId: string; step: FinishingStep; roomName: string } | null>(null);
  const [openFloors, setOpenFloors] = useState<Set<string>>(new Set());
  const [openRooms, setOpenRooms] = useState<Set<string>>(new Set());
  const [taskDetailTarget, setTaskDetailTarget] = useState<{ floorId: string; roomId: string; step: FinishingStep; roomName: string; roomSqft?: number } | null>(null);
  const [weeklyDrawerData, setWeeklyDrawerData] = useState<{
    title: string;
    floorName?: string;
    tasks: { floorId: string; floorName: string; roomId: string; roomName: string; roomSqft?: number; step: FinishingStep }[];
    pct?: number;
  } | null>(null);
  const [approvalLightboxTarget, setApprovalLightboxTarget] = useState<{
    audit: {
      floorId: string;
      floorName: string;
      roomId: string;
      roomName: string;
      roomSqft?: number;
      step: FinishingStep;
      painterName: string;
    };
    initialMode: 'before' | 'after' | 'compare';
  } | null>(null);
  const [, setTick] = useState(0);

  const toggleFloor = (id: string) =>
    setOpenFloors((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleRoom = (id: string) =>
    setOpenRooms((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // All tasks for this project (supervisor sees all tasks for their project)
  const allTasks = useMemo(() => {
    const result: { floorId: string; floorName: string; roomId: string; roomName: string; roomSqft?: number; step: FinishingStep }[] = [];
    for (const floor of project.floors ?? []) {
      if (!floor) continue;
      const exteriorZone = floor.isExterior || floor.id === 'floor-exterior';
      for (const room of floor.rooms ?? []) {
        if (!room) continue;
        const isExteriorRoom = exteriorZone || Boolean(room.isExterior);
        for (const step of room.finishingSteps ?? []) {
          if (!step) continue;
          result.push({ 
            floorId: floor.id, 
            floorName: floor.name, 
            roomId: room.id, 
            roomName: room.name, 
            roomSqft: isExteriorRoom ? (room.exteriorSqft ?? room.totalSqft ?? room.interiorSqft ?? 0) : (room.interiorSqft ?? room.totalSqft ?? 0),
            step 
          });
        }
      }
    }
    return result;
  }, [project]);

  const totalAssigned = allTasks.length;
  const completedTasks = allTasks.filter((t) => t.step.status === 'COMPLETED').length;
  const inProgressTasks = allTasks.filter((t) => t.step.status === 'IN_PROGRESS').length;
  const avgProgress = totalAssigned
    ? Math.round(
        allTasks.reduce((a, t) => a + (t.step.progressPct ?? statusToProgress(t.step.status)), 0) / totalAssigned,
      )
    : 0;

  const painters = project.painters ?? [];
  const activePainters = painters.filter((p) => p.clockState === 'CLOCKED_IN' || p.clockState === 'ON_BREAK' || p.checkedIn);
  const todaysTargets = (project.dailyTargets ?? []).filter((t) => t.date === todayISO());

  const completedSqFtToday = useMemo(() => {
    return allTasks.reduce((sum, t) => {
      const status = t.step.status;
      const isDone = status === 'COMPLETED' || status === 'PENDING_INSPECTION';
      
      const completionDate = t.step.completedAt 
        ? new Date(t.step.completedAt).toISOString().slice(0, 10) 
        : null;
      const afterPhotoDate = t.step.afterPhotoAt 
        ? new Date(t.step.afterPhotoAt).toISOString().slice(0, 10) 
        : null;

      const isToday = completionDate === todayISO() || 
                      afterPhotoDate === todayISO() ||
                      todaysTargets.some(tgt => tgt.stepId === t.step.id);
      
      if (isDone && isToday) {
        return sum + (t.step.areaCompleted || t.step.completedSqft || t.step.stepSqft || t.roomSqft || 0);
      }
      return sum;
    }, 0);
  }, [allTasks, todaysTargets]);

  const handleConfirmDailyLog = (form: DailyLogForm) => {
    onSubmitDailyLog(form);
    setShowDailyLog(false);
  };

  useEffect(() => {
    const anyActive = painters.some((p) => p.clockState && p.clockState !== 'CLOCKED_OUT');
    if (!anyActive) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [painters]);

  // Pending site approvals queue harmonized directly with global project state
  const pendingApprovals = useMemo(() => {
    const result: {
      floorId: string;
      floorName: string;
      roomId: string;
      roomName: string;
      roomSqft?: number;
      step: FinishingStep;
      painterName: string;
    }[] = [];

    if (!project || !Array.isArray(project.floors)) return result;

    for (const floor of project.floors) {
      if (!floor || !Array.isArray(floor.rooms)) continue;
      for (const room of floor.rooms) {
        if (!room || !Array.isArray(room.finishingSteps)) continue;
        for (const step of room.finishingSteps) {
          if (!step) continue;
          const isPending =
            step.status === 'PENDING_INSPECTION' ||
            step.photoAuditStatus === 'PENDING_REVIEW';
          if (isPending) {
            const painter = (project.painters ?? []).find((p) =>
              p?.id && Array.isArray(step.painterIds) && step.painterIds.includes(p.id)
            );

            // Extract before and after photo URLs directly from global state, falling back to proofPhotos.
            // Stock/demo URLs are stripped so only REAL uploaded painter photos are shown.
            const rawBeforePhoto =
              step.beforePhoto ||
              step.beforePhotoUrl ||
              (Array.isArray(step.proofPhotos) && step.proofPhotos.length > 0
                ? step.proofPhotos[0]
                : undefined);

            const rawAfterPhoto =
              step.afterPhoto ||
              step.completionPhoto ||
              step.afterPhotoUrl ||
              (Array.isArray(step.proofPhotos) && step.proofPhotos.length > 1
                ? step.proofPhotos[1]
                : Array.isArray(step.proofPhotos) && step.proofPhotos.length === 1 && !rawBeforePhoto
                ? step.proofPhotos[0]
                : undefined);

            const beforePhoto = isStockPhotoUrl(rawBeforePhoto) ? undefined : rawBeforePhoto;
            const afterPhoto = isStockPhotoUrl(rawAfterPhoto) ? undefined : rawAfterPhoto;

            result.push({
              floorId: floor.id || '',
              floorName: floor.name || 'Floor',
              roomId: room.id || '',
              roomName: room.name || 'Room',
              roomSqft: room.exteriorSqft || room.interiorSqft,
              step: {
                ...step,
                beforePhoto,
                beforePhotoUrl: beforePhoto,
                afterPhoto,
                afterPhotoUrl: afterPhoto,
                completionPhoto: step.completionPhoto || afterPhoto,
              },
              painterName: painter?.name ?? 'Unassigned Painter',
            });
          }
        }
      }
    }
    return result;
  }, [project]);

  const activeTaskDetailStep = useMemo(() => {
    if (!taskDetailTarget) return null;
    const found = allTasks.find(
      (t) =>
        t.floorId === taskDetailTarget.floorId &&
        t.roomId === taskDetailTarget.roomId &&
        t.step.id === taskDetailTarget.step.id
    );
    return found ? found.step : taskDetailTarget.step;
  }, [allTasks, taskDetailTarget]);

  // Real-time Pace & Delays Alert: tasks that are overdue (not finished past scheduled date)
  // or that breached their estimated duration. Surfaces lagging/lazy painters.
  const delayedTasks = useMemo(() => {
    const today = todayISO();
    const result: {
      floorId: string;
      floorName: string;
      roomId: string;
      roomName: string;
      roomSqft?: number;
      step: FinishingStep;
      painterNames: string[];
      reason: 'breached' | 'overdue';
      label: string;
    }[] = [];

    for (const t of allTasks) {
      const step = t.step;
      const painterNames = painters
        .filter((p) => step.painterIds?.includes(p.id))
        .map((p) => p.name);
      const sla = computeSla(step);
      const isCompleted = step.status === 'COMPLETED';
      const overdueOpen = !isCompleted && Boolean(step.scheduledDate) && step.scheduledDate! < today;
      const breached = Boolean(sla?.delayed);

      if (breached) {
        result.push({ ...t, painterNames, reason: 'breached', label: `Delayed by ${sla!.delayDays} Day${sla!.delayDays > 1 ? 's' : ''}` });
      } else if (overdueOpen) {
        result.push({ ...t, painterNames, reason: 'overdue', label: 'Overdue vs Schedule' });
      }
    }

    return result.sort((a, b) => (a.reason === 'breached' ? -1 : 1) - (b.reason === 'breached' ? -1 : 1));
  }, [allTasks, painters]);

  interface LogEntry {
    id: string;
    timestamp: number;
    dateISO: string;
    taskName: string;
    roomName: string;
    floorName: string;
    painterName: string;
    sqft: number;
    consumed: number;
    isManual?: boolean;
    notes?: string;
    issues?: string;
    supervisorName?: string;
    materials?: { name: string; qty: number; unit?: string }[];
  }

  // Historical audit trail: group every automated task execution + supervisor report by date.
  const groupedLogEntries = useMemo(() => {
    const entries: LogEntry[] = [];

    for (const t of allTasks) {
      const ts = t.step.completedAt ?? t.step.afterPhotoAt;
      if (!ts) continue;
      if (t.step.status !== 'COMPLETED' && t.step.status !== 'PENDING_INSPECTION') continue;
      const painterName = painters.filter((p) => t.step.painterIds?.includes(p.id)).map((p) => p.name).join(', ') || 'Unassigned';
      entries.push({
        id: `auto-${t.step.id}`,
        timestamp: ts,
        dateISO: new Date(ts).toISOString().slice(0, 10),
        taskName: t.step.name,
        roomName: t.roomName,
        floorName: t.floorName,
        painterName,
        sqft: t.step.areaCompleted || t.step.completedSqft || t.step.stepSqft || t.roomSqft || 0,
        consumed: t.step.consumedQuantity || 0,
      });
    }

    for (const log of project.dailyLogs ?? []) {
      const ts = new Date(log.submittedAt).getTime();
      const dateISO = (log.date || '').slice(0, 10);
      const materials = (log.consumption ?? []).map((c) => ({ name: c.materialName, qty: c.quantityUsed, unit: c.unit }));
      const totalConsumed = materials.reduce((a, m) => a + m.qty, 0);
      entries.push({
        id: `manual-${log.id}`,
        timestamp: Number.isNaN(ts) ? Date.now() : ts,
        dateISO: dateISO || (Number.isNaN(ts) ? todayISO() : new Date(ts).toISOString().slice(0, 10)),
        taskName: 'Supervisor Daily Report',
        roomName: 'Site-wide',
        floorName: 'All Floors',
        painterName: log.supervisorName || 'Supervisor',
        sqft: log.attendanceCount || 0,
        consumed: totalConsumed,
        isManual: true,
        notes: log.notes,
        issues: log.issues,
        supervisorName: log.supervisorName,
        materials,
      });
    }

    const filtered = logFilterDate ? entries.filter((e) => e.dateISO === logFilterDate) : entries;

    const groups = new Map<string, LogEntry[]>();
    for (const e of filtered) {
      if (!groups.has(e.dateISO)) groups.set(e.dateISO, []);
      groups.get(e.dateISO)!.push(e);
    }
    const sortedDates = Array.from(groups.keys()).sort((a, b) => (a < b ? 1 : -1));
    return sortedDates.map((date) => ({
      date,
      entries: (groups.get(date) ?? []).sort((a, b) => b.timestamp - a.timestamp),
    }));
  }, [allTasks, painters, project.dailyLogs, logFilterDate]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 animate-fade-in px-4">
      {/* 1. Metrics Top */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-900 p-5 text-white shadow-sm dark:border-slate-800">
          <div className="flex items-center gap-3 opacity-80 mb-4">
            <TrendingUp size={18} className="text-brand-400" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Global Progress</span>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-3xl font-bold">{avgProgress}%</p>
              <p className="text-xs text-slate-400">Overall Project</p>
            </div>
          </div>
          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div className="h-full bg-brand-500" style={{ width: `${avgProgress}%` }} />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3 text-slate-500 mb-4">
            <Target size={18} className="text-emerald-500" />
            <span className="text-[10px] font-bold uppercase tracking-wider">SqFt Done Today</span>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-3xl font-bold text-slate-800 dark:text-slate-100">{completedSqFtToday.toLocaleString()}</p>
              <p className="text-xs text-slate-500">Metric sum</p>
            </div>
            <TrendingUp size={20} className="text-emerald-500 mb-1" />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3 text-slate-500 mb-4">
            <Layers size={18} className="text-amber-500" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Total Steps</span>
          </div>
          <div>
            <p className="text-3xl font-bold text-slate-800 dark:text-slate-100">{totalAssigned}</p>
            <p className="text-xs text-slate-500">
              Steps: <span className="text-emerald-600">{completedTasks} Comp</span> / <span className="text-amber-600">{inProgressTasks} InProg</span> / {totalAssigned - completedTasks - inProgressTasks} NotStarted
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3 text-slate-500 mb-4">
            <UserCircle2 size={18} className="text-brand-500" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Project Lead</span>
          </div>
          <div className="flex items-center gap-3">
            <InitialsAvatar name={supervisor.name} size={40} className="ring-2 ring-slate-100 dark:ring-slate-800" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{supervisor.name}</p>
              <div className="flex items-center gap-1.5">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    supervisor.sessionState === 'LOGGED_IN'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
                      : 'bg-slate-100 text-slate-500 dark:bg-slate-700/50 dark:text-slate-400'
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${supervisor.sessionState === 'LOGGED_IN' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                  {supervisor.sessionState === 'LOGGED_IN' ? 'On Site' : 'Logged Out'}
                </span>
                <button
                  onClick={() =>
                    onSessionChange(
                      supervisor.id,
                      supervisor.sessionState === 'LOGGED_IN' ? 'LOGGED_OUT' : 'LOGGED_IN',
                    )
                  }
                  className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  {supervisor.sessionState === 'LOGGED_IN' ? <LogOut size={10} /> : <LogIn size={10} />}
                  {supervisor.sessionState === 'LOGGED_IN' ? 'Log Out' : 'Log In'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pace & Delays Alert — real-time lagging/lazy painter detector */}
      <div className="rounded-2xl border border-red-500/30 bg-red-950/10 p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-red-500/15 text-red-400 grid place-items-center">
              <AlarmClock size={20} />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-red-400">Pace &amp; Delays Alert</h3>
              <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Currently delayed / lagging tasks across site</p>
            </div>
          </div>
          <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${delayedTasks.length ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
            {delayedTasks.length ? `${delayedTasks.length} Flagged` : 'All On Track'}
          </span>
        </div>
        {delayedTasks.length === 0 ? (
          <div className="py-6 text-center text-xs text-emerald-400/80 italic">No delayed or overdue tasks — site pace is healthy.</div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {delayedTasks.map((d) => (
              <button
                key={`${d.roomId}-${d.step.id}`}
                onClick={() => setTaskDetailTarget({ floorId: d.floorId, roomId: d.roomId, step: d.step, roomName: d.roomName, roomSqft: d.roomSqft })}
                className="flex items-center justify-between gap-3 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-left transition-colors hover:bg-red-500/10"
              >
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-black text-zinc-100">{d.step.name}</p>
                  <p className="truncate text-[9px] uppercase font-bold text-zinc-400">{d.floorName} — {d.roomName} · {d.painterNames.join(', ') || 'Unassigned'}</p>
                </div>
                <span className="shrink-0 rounded-md bg-red-500/20 px-2 py-1 text-[9px] font-black uppercase text-red-400">{d.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 2. Middle Section: Attendance & Action Queue */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Attendance (3/5) */}
        <div className="lg:col-span-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100">Painter Attendance & GPS Tracker</h3>
            <button
              onClick={() => setShowTargetAllocator(true)}
              className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-brand-600"
            >
              Allocate Daily Targets
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {painters.map((p) => {
              const cState = p.clockState ?? 'CLOCKED_OUT';
              const isActive = cState !== 'CLOCKED_OUT';
              return (
                <div key={p.id} className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/30">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="h-8 w-8 rounded-full bg-slate-200 grid place-items-center text-xs font-bold text-slate-500">
                      {p.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800 dark:text-zinc-100">{p.name}</p>
                      <p className="text-[9px] text-slate-500 dark:text-zinc-400 uppercase">Painter Photo</p>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[9px] font-bold">
                      <span className={`flex items-center gap-1 ${p.checkedIn ? 'text-emerald-500' : 'text-zinc-500'}`}>
                        <MapPin size={10} /> Site Check-In
                      </span>
                      <span className={`flex items-center gap-1 ${isActive ? 'text-emerald-500' : 'text-zinc-500'}`}>
                        <Clock size={10} /> On The Clock
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[9px] font-bold">
                      <span className="text-amber-400 uppercase">Clock State: {cState.replace('_', ' ')}</span>
                      {p.clockInAt && <span className="text-zinc-200">{fmtDuration(Date.now() - p.clockInAt)}</span>}
                    </div>
                    <div className="flex items-center justify-between text-[9px] font-bold text-zinc-400 uppercase">
                      <span>GPS: {p.siteLabel ?? 'Bengaluru'}</span>
                      {p.clockInAt && <span className="text-zinc-200">{new Date(p.clockInAt).toLocaleDateString()} {new Date(p.clockInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Action Queue (2/5) */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100">Pending Site Approvals</h3>
            <span className="text-xs text-slate-400">(Total: {pendingApprovals.length})</span>
          </div>
          <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
            {pendingApprovals.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400 italic">No pending inspections today</div>
            ) : (
              pendingApprovals.map((audit) => {
                const step = audit?.step;
                const beforeImg = getRealPhotoUrl(step, 'before');
                const afterImg = getRealPhotoUrl(step, 'after');
                const hasAnyPhoto = Boolean(beforeImg || afterImg);

                const stepNameLower = (step?.name || '').toLowerCase();
                const isSandingOrPutty = stepNameLower.includes('sanding') || stepNameLower.includes('putty');

                return (
                  <div key={step?.id || audit.floorId} className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/30">
                    <div className="flex gap-3 mb-3">
                      <InitialsAvatar name={audit?.painterName} size={32} className="ring-2 ring-white" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-bold text-slate-800 dark:text-white truncate">{step?.name || 'Task'}</p>
                        <p className="text-[9px] text-zinc-400 uppercase font-black tracking-wider">{audit?.floorName || 'Floor'} - {audit?.roomName || 'Room'} | {step?.areaCompleted || step?.completedSqft || step?.stepSqft || audit?.roomSqft || 0} sqft</p>
                      </div>
                    </div>

                    {/* Submitted Photos or Fallback Badge */}
                    {hasAnyPhoto ? (
                      <div className="flex gap-2 mb-3">
                        {beforeImg && (
                          <button
                            type="button"
                            onClick={() => setApprovalLightboxTarget({ audit, initialMode: 'before' })}
                            className="relative flex-1 h-20 overflow-hidden rounded-xl border border-slate-700/80 cursor-pointer group hover:border-brand-500 transition-all text-left focus:outline-none bg-slate-900"
                          >
                            <img src={beforeImg} className="h-full w-full object-cover group-hover:scale-105 transition-transform" alt="Before Photo" />
                            <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-[10px] font-bold gap-1 backdrop-blur-[1px]">
                              <ZoomIn size={14} /> Zoom
                            </div>
                            <span className="absolute bottom-1.5 left-1.5 bg-black/75 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase">
                              Before
                            </span>
                          </button>
                        )}
                        {afterImg && (
                          <button
                            type="button"
                            onClick={() => setApprovalLightboxTarget({ audit, initialMode: 'after' })}
                            className="relative flex-1 h-20 overflow-hidden rounded-xl border border-slate-700/80 cursor-pointer group hover:border-emerald-500 transition-all text-left focus:outline-none bg-slate-900"
                          >
                            <img src={afterImg} className="h-full w-full object-cover group-hover:scale-105 transition-transform" alt="After Photo" />
                            <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-[10px] font-bold gap-1 backdrop-blur-[1px]">
                              <ZoomIn size={14} /> Zoom & Compare
                            </div>
                            <span className="absolute bottom-1.5 left-1.5 bg-black/75 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase">
                              After
                            </span>
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="mb-3 h-20">
                        <NoPhotoPlaceholder label={isSandingOrPutty ? 'No Photo Uploaded (Routine Step)' : 'No Photo Uploaded'} />
                      </div>
                    )}

                    <div className="mb-3 text-[9px] font-bold text-zinc-400 uppercase tracking-tight flex justify-between items-center bg-slate-800/40 p-2 rounded-lg">
                      <div>
                        <span>Assigned: <strong className="text-zinc-200">{audit?.painterName || 'Unassigned'}</strong></span>
                        <br />
                        <span>Reported: <strong className="text-zinc-200">{new Date(step?.afterPhotoAt || step?.completedAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong></span>
                      </div>
                      {beforeImg && afterImg && (
                        <button
                          type="button"
                          onClick={() => setApprovalLightboxTarget({ audit, initialMode: 'compare' })}
                          className="flex items-center gap-1 text-brand-400 hover:text-brand-300 font-black text-[9px] bg-brand-500/10 px-2 py-1 rounded-md border border-brand-500/20"
                        >
                          <Eye size={12} /> Compare
                        </button>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          if (audit?.floorId && audit?.roomId && step?.id) {
                            onPhotoAudit?.(audit.floorId, audit.roomId, step.id, false);
                          }
                        }}
                        className="flex-1 rounded-lg bg-red-500/20 border border-red-500/40 py-2 text-[10px] font-bold text-red-400 hover:bg-red-500 hover:text-white transition-all shadow-sm"
                      >
                        Reject & Rework
                      </button>
                      <button
                        onClick={() => {
                          if (audit?.floorId && audit?.roomId && step?.id) {
                            onPhotoAudit?.(audit.floorId, audit.roomId, step.id, true);
                          }
                        }}
                        className="flex-1 rounded-lg bg-emerald-500 py-2 text-[10px] font-bold text-white shadow-sm hover:bg-emerald-600 transition-all"
                      >
                        Approve Quality
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* 3. Bottom Section: Floor & Room Accordions */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
          <button
            onClick={() => setActiveTab('rooms')}
            className={`px-6 py-3 text-xs font-bold uppercase tracking-wider transition-all ${
              activeTab === 'rooms' ? 'text-brand-600 border-b-2 border-brand-500' : 'text-slate-400'
            }`}
          >
            Floor & Rooms
          </button>
          <button
            onClick={() => setActiveTab('weekly')}
            className={`px-6 py-3 text-xs font-bold uppercase tracking-wider transition-all ${
              activeTab === 'weekly' ? 'text-brand-600 border-b-2 border-brand-500' : 'text-slate-400'
            }`}
          >
            Weekly View
          </button>
          <button
            onClick={() => setActiveTab('agenda')}
            className={`px-6 py-3 text-xs font-bold uppercase tracking-wider transition-all ${
              activeTab === 'agenda' ? 'text-brand-600 border-b-2 border-brand-500' : 'text-slate-400'
            }`}
          >
            Daily Agenda
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-6 py-3 text-xs font-bold uppercase tracking-wider transition-all ${
              activeTab === 'logs' ? 'text-brand-600 border-b-2 border-brand-500' : 'text-slate-400'
            }`}
          >
            Daily Logs
          </button>
        </div>

        <div className="grid lg:grid-cols-4 min-h-[500px]">
          {activeTab === 'rooms' && (
            <>
              {/* Floor Sidebar */}
              <div className="lg:col-span-1 border-r border-slate-100 dark:border-slate-800 p-4 space-y-2">
                {(project.floors ?? []).map((floor) => (
                  <button
                    key={floor.id}
                    onClick={() => toggleFloor(floor.id)}
                    className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${
                      openFloors.has(floor.id) 
                        ? 'bg-slate-900 text-white dark:bg-slate-800' 
                        : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300'
                    }`}
                  >
                    <div className="text-left">
                      <p className="text-sm font-black">{floor.name}</p>
                      <p className={`text-[10px] font-bold uppercase tracking-tighter ${openFloors.has(floor.id) ? 'text-zinc-400' : 'text-zinc-500'}`}>
                        {floor.id === 'floor-generated-tasks'
                          ? `${floor.rooms.length} Items (Joinery & Special) • ${floor.rooms.reduce((acc, r) => acc + r.finishingSteps.length, 0)} Steps`
                          : floor.isExterior || floor.id === 'floor-exterior'
                            ? `${floor.rooms.length} Elevations • ${floor.rooms.reduce((acc, r) => acc + r.finishingSteps.length, 0)} Steps`
                            : `${floor.rooms.length} Rooms • ${floor.rooms.reduce((acc, r) => acc + r.finishingSteps.length, 0)} Steps`}
                      </p>
                    </div>
                    <ChevronDown size={14} className={`transition-transform ${openFloors.has(floor.id) ? 'rotate-180 text-white' : 'text-zinc-500'}`} />
                  </button>
                ))}
              </div>

              {/* Room & Tasks Area */}
              <div className="lg:col-span-3 p-6 space-y-4">
                {(project.floors ?? [])
                  .filter(f => openFloors.has(f.id))
                  .map(floor => (
                    <div key={floor.id} className="space-y-4">
                      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${
                        floor.id === 'floor-generated-tasks'
                          ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          : floor.isExterior || floor.id === 'floor-exterior'
                            ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400'
                            : 'bg-brand-500/10 text-brand-600 dark:text-brand-400'
                      }`}>
                        {floor.id === 'floor-generated-tasks'
                          ? '[ WOOD, METAL & SPECIAL JOINERY ]'
                          : floor.isExterior || floor.id === 'floor-exterior'
                            ? '[ EXTERIOR ELEVATIONS ]'
                            : '[ INTERIOR WALLS & CEILINGS ]'}
                      </div>
                      {floor.rooms.map(room => (
                        <div key={room.id} className="rounded-2xl border border-slate-100 bg-slate-50/50 overflow-hidden dark:border-slate-800 dark:bg-slate-800/20">
                          <button
                            onClick={() => toggleRoom(room.id)}
                            className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-100/50 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <ChevronDown size={16} className={`text-zinc-500 transition-transform ${openRooms.has(room.id) ? 'rotate-180 text-brand-500' : ''}`} />
                              <span className="text-sm font-black text-zinc-100">
                                 {floor.name} — {room.name} <span className="text-zinc-500 font-bold ml-1 text-[11px] uppercase tracking-widest">({room.totalSqft || room.sqft || room.exteriorSqft || room.interiorSqft || 0} sqft)</span>
                              </span>
                            </div>
                            <div className="flex items-center gap-4 text-[10px] font-black uppercase text-brand-500 tracking-widest">
                              <span>{room.finishingSteps.filter(s => s.status === 'COMPLETED').length}/{room.finishingSteps.length} STEPS DONE</span>
                            </div>
                          </button>

                          {openRooms.has(room.id) && (
                            <div className="px-5 pb-5">
                              <table className="w-full text-left text-[11px]">
                                <thead>
                                  <tr className="text-zinc-500 uppercase tracking-widest font-black border-b border-slate-800">
                                    <th className="py-3 w-12">Task</th>
                                    <th className="py-3">Process Detail</th>
                                    <th className="py-3">Current Status</th>
                                    <th className="py-3 text-center">Before Photo</th>
                                    <th className="py-3 text-center">Final Approval</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800">
                                  {room.finishingSteps.map((step, idx) => {
                                    return (
                                      <tr 
                                        key={step.id} 
                                        onClick={() => setTaskDetailTarget({ floorId: floor.id, roomId: room.id, step, roomName: room.name, roomSqft: room.exteriorSqft || room.interiorSqft })}
                                        className={`group cursor-pointer transition-colors ${
                                          step.status === 'COMPLETED' 
                                            ? 'bg-emerald-950/20 hover:bg-emerald-900/30' 
                                            : 'hover:bg-slate-800/50'
                                        }`}
                                      >
                                        <td className="py-4 text-zinc-500 font-black">{idx + 1}.</td>
                                        <td className="py-4">
                                          <div className="flex items-center gap-2">
                                            <div className={`h-6 w-6 rounded-lg grid place-items-center ${stepIconClass(step.name)} opacity-80 group-hover:opacity-100`}>
                                              <Brush size={12} />
                                            </div>
                                            <div>
                                              <span className="font-black text-zinc-100 tracking-tight block">{step.name}</span>
                                              <TaskMetaBadges step={step} painters={painters} />
                                            </div>
                                          </div>
                                        </td>
                                        <td className="py-4">
                                          <div className="space-y-1">
                                            <StatusBadge status={step.status} size="sm" />
                                            {step.status === 'COMPLETED' && (
                                              <div className="text-[9px] font-bold text-emerald-400">
                                                 {step.areaCompleted || step.completedSqft || step.stepSqft || room.exteriorSqft || room.interiorSqft || 0} sqft · {step.consumedQuantity || 0} L
                                              </div>
                                            )}
                                          </div>
                                        </td>
                                        <td className="py-4 text-center">
                                          {(() => {
                                            const img = getRealPhotoUrl(step, 'before');
                                            return img ? (
                                              <div className="mx-auto h-7 w-7 rounded-lg overflow-hidden border border-emerald-500/50 shadow-md">
                                                <img src={img} className="h-full w-full object-cover" alt="" />
                                              </div>
                                            ) : (
                                              <div className="mx-auto h-7 w-7 rounded-lg overflow-hidden border border-dashed border-zinc-700 bg-zinc-800/60 grid place-items-center text-zinc-600">
                                                <ImageOff size={12} />
                                              </div>
                                            );
                                          })()}
                                        </td>
                                        <td className="py-4">
                                          <div className="flex justify-center items-center gap-1.5">
                                            {(() => {
                                              const img = getRealPhotoUrl(step, 'after');
                                              return img ? (
                                                <div className="h-7 w-7 rounded-lg overflow-hidden border border-emerald-500/50 shadow-md">
                                                  <img src={img} className="h-full w-full object-cover" alt="" />
                                                </div>
                                              ) : (
                                                <div className="h-7 w-7 rounded-lg overflow-hidden border border-dashed border-zinc-700 bg-zinc-800/60 grid place-items-center text-zinc-600">
                                                  <ImageOff size={12} />
                                                </div>
                                              );
                                            })()}
                                            {step.status === 'COMPLETED' && (
                                              <div className="h-5 w-5 rounded-full bg-emerald-500 grid place-items-center text-white shadow-lg shadow-emerald-500/20">
                                                <CheckCircle2 size={12} />
                                              </div>
                                            )}
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                
                {openFloors.size === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 py-20">
                    <Layers size={48} className="opacity-20 mb-4" />
                    <p className="text-sm font-medium">Select a floor from the sidebar to view tasks</p>
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'weekly' && (
            <div className="lg:col-span-4 p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-black uppercase tracking-widest text-zinc-100">Weekly Execution Grid Timeline</h4>
                  <p className="text-xs text-zinc-400">Click progress bars or day cells to open full painter & task audit breakdown</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  <span className="text-[10px] font-bold text-zinc-400 uppercase">Interactive Timeline</span>
                </div>
              </div>

              {/* Horizontal Compact Grid Timeline */}
              <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60 shadow-xl">
                <table className="w-full min-w-[750px] border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-800/50 text-[10px] font-black uppercase tracking-widest text-zinc-400">
                      <th className="p-3 w-40">Floor / Section</th>
                      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, idx) => {
                        const dayDate = new Date();
                        dayDate.setDate(dayDate.getDate() - dayDate.getDay() + (idx + 1));
                        const dateStr = dayDate.toISOString().slice(0, 10);
                        const isToday = dateStr === todayISO();
                        return (
                          <th key={day} className={`p-3 text-center ${isToday ? 'text-brand-400 bg-brand-500/10' : ''}`}>
                            <p>{day}</p>
                            <p className="text-[9px] text-zinc-500 font-bold">{dayDate.getDate()} {dayDate.toLocaleDateString([], { month: 'short' })}</p>
                          </th>
                        );
                      })}
                      <th className="p-3 text-right w-32">Total Progress</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {(project.floors ?? []).map(floor => {
                      const floorTasks = allTasks.filter(t => t.floorId === floor.id);
                      const floorComp = floorTasks.filter(t => t.step.status === 'COMPLETED').length;
                      const floorTotal = floorTasks.length;
                      const floorPct = floorTotal ? Math.round((floorComp / floorTotal) * 100) : 0;

                      return (
                        <tr key={floor.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="p-3 font-black text-zinc-200">
                            <span className="block truncate">{floor.name}</span>
                            <span className="text-[9px] font-bold text-zinc-500 uppercase">{floorTotal} Tasks Total</span>
                          </td>
                          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, idx) => {
                            const dayDate = new Date();
                            dayDate.setDate(dayDate.getDate() - dayDate.getDay() + (idx + 1));
                            const dateStr = dayDate.toISOString().slice(0, 10);
                            const isToday = dateStr === todayISO();

                            const dayDoneTasks = floorTasks.filter(t => {
                              const doneDate = t.step.completedAt ? new Date(t.step.completedAt).toISOString().slice(0, 10) : (t.step.afterPhotoAt ? new Date(t.step.afterPhotoAt).toISOString().slice(0, 10) : null);
                              return doneDate === dateStr;
                            });

                            return (
                              <td 
                                key={day} 
                                onClick={() => {
                                  if (dayDoneTasks.length > 0) {
                                    setWeeklyDrawerData({
                                      title: `${floor.name} Tasks — ${day} (${dateStr})`,
                                      floorName: floor.name,
                                      tasks: dayDoneTasks
                                    });
                                  }
                                }}
                                className={`p-2 text-center align-middle cursor-pointer transition-colors ${isToday ? 'bg-brand-500/5' : ''} ${dayDoneTasks.length > 0 ? 'hover:bg-brand-500/10' : ''}`}
                              >
                                {dayDoneTasks.length > 0 ? (
                                  <div className="inline-flex flex-col items-center justify-center p-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                                    <span className="text-[10px] font-black">{dayDoneTasks.length} Done</span>
                                    <span className="text-[8px] font-bold text-zinc-400">Click Drawer</span>
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-zinc-600 font-bold">—</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="p-3 text-right">
                            <button
                              onClick={() => {
                                setWeeklyDrawerData({
                                  title: `${floor.name} Complete Floor Progress Audit`,
                                  floorName: floor.name,
                                  tasks: floorTasks,
                                  pct: floorPct
                                });
                              }}
                              className="w-full text-left space-y-1 group p-1.5 rounded-xl hover:bg-slate-800/80 transition-all"
                            >
                              <div className="flex justify-between items-center text-[10px] font-black">
                                <span className="text-brand-400 group-hover:underline">{floorPct}%</span>
                                <span className="text-zinc-500">{floorComp}/{floorTotal}</span>
                              </div>
                              <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden border border-slate-700/50">
                                <div className="h-full bg-brand-500 transition-all duration-500 group-hover:bg-brand-400" style={{ width: `${floorPct}%` }} />
                              </div>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Overall Project Progress Summary Bars */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {(project.floors ?? []).map(floor => {
                  const floorTasks = allTasks.filter(t => t.floorId === floor.id);
                  const floorComp = floorTasks.filter(t => t.step.status === 'COMPLETED').length;
                  const floorTotal = floorTasks.length;
                  const floorPct = floorTotal ? Math.round((floorComp / floorTotal) * 100) : 0;
                  
                  return (
                    <div 
                      key={floor.id} 
                      onClick={() => {
                        setWeeklyDrawerData({
                          title: `${floor.name} Full Progress Audit`,
                          floorName: floor.name,
                          tasks: floorTasks,
                          pct: floorPct
                        });
                      }}
                      className="p-4 rounded-2xl border border-slate-800 bg-slate-900 shadow-lg cursor-pointer hover:border-brand-500/50 transition-all"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <h5 className="text-xs font-black text-zinc-100 uppercase">{floor.name} Progress</h5>
                        <span className="text-xs font-black text-brand-400">{floorPct}%</span>
                      </div>
                      <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden mb-2">
                        <div className="h-full bg-brand-500 transition-all duration-500" style={{ width: `${floorPct}%` }} />
                      </div>
                      <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">{floorComp} / {floorTotal} Steps Finished • Click for Drawer</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'agenda' && (
            <div className="lg:col-span-4 p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-black uppercase tracking-widest text-zinc-100">Today's Target Agenda</h4>
                  <p className="text-xs text-zinc-400">Active painter assignments & daily targets</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-400 font-bold uppercase tracking-wider">{todaysTargets.length} Active Targets</span>
                  <button
                    onClick={() => setShowTargetAllocator(true)}
                    className="flex items-center gap-1.5 rounded-xl bg-brand-500 px-3.5 py-2 text-xs font-black text-white hover:bg-brand-600 shadow-md transition-all"
                  >
                    <Target size={14} /> Allocate New Target
                  </button>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {todaysTargets.length === 0 ? (
                  <div className="col-span-full py-16 text-center text-zinc-500 border border-dashed border-slate-800 rounded-2xl">
                    <Target size={32} className="mx-auto mb-2 opacity-30" />
                    <p className="text-xs font-black uppercase tracking-widest">No targets allocated for today</p>
                    <p className="text-[10px] text-zinc-600 mt-1">Click 'Allocate New Target' above to set daily goals for painters.</p>
                  </div>
                ) : (
                  todaysTargets.map(tgt => {
                    const task = allTasks.find(t => t.step.id === tgt.stepId);
                    const painter = painters.find(p => p.id === tgt.painterId);
                    return (
                      <div 
                        key={tgt.id} 
                        onClick={() => {
                          if (task) {
                            setTaskDetailTarget({
                              floorId: task.floorId,
                              roomId: task.roomId,
                              step: task.step,
                              roomName: task.roomName,
                              roomSqft: task.roomSqft
                            });
                          }
                        }}
                        className="p-4 rounded-2xl border border-slate-800 bg-slate-900/60 space-y-3 cursor-pointer hover:border-brand-500/50 hover:bg-slate-800/50 transition-all shadow-lg"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase tracking-widest text-brand-400">{task?.step.name}</span>
                          <StatusBadge status={task?.step.status || 'ASSIGNED'} size="sm" />
                        </div>
                        <p className="text-xs font-black text-zinc-100">{task?.floorName} — {task?.roomName}</p>
                        
                        <div className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-700/40 flex justify-between items-center text-[10px]">
                          <span className="text-zinc-400 font-bold uppercase">Target Area:</span>
                          <span className="font-black text-amber-400">{tgt.targetSqft} SqFt</span>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full bg-brand-500/20 grid place-items-center text-[9px] font-black uppercase text-brand-400">
                              {painter?.name.charAt(0)}
                            </div>
                            <div>
                              <span className="text-[11px] font-bold text-zinc-200 block">{painter?.name}</span>
                              <span className="text-[9px] font-medium text-zinc-500 uppercase">{painter?.clockState || 'OFFLINE'}</span>
                            </div>
                          </div>
                          <span className="text-[9px] font-bold text-zinc-400 uppercase">View Task &rarr;</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="lg:col-span-4 p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold uppercase tracking-widest text-slate-800 dark:text-zinc-100">Daily Submission Logs</h4>
                  <p className="text-xs text-zinc-400">Automated and supervisor-submitted daily logs</p>
                </div>
                <button 
                  onClick={() => setShowDailyLog(true)}
                  className="rounded-xl bg-brand-500 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-brand-600 transition-all active:scale-95"
                >
                  + Create Manual Log
                </button>
              </div>

              <div className="space-y-4">
                {/* Date Picker / Calendar Filter */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                  <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                    <Calendar size={16} className="text-brand-400" />
                    {logFilterDate ? `Viewing: ${logDateHeader(logFilterDate)}` : 'Showing all historical logs (grouped by date)'}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs font-bold text-zinc-200 cursor-pointer hover:border-brand-500/50 transition-colors">
                      <Calendar size={14} className="text-brand-400" />
                      <span className="text-[10px] uppercase tracking-wider text-zinc-400">Select Date to View Logs</span>
                      <input
                        type="date"
                        value={logFilterDate}
                        onChange={(e) => setLogFilterDate(e.target.value)}
                        className="bg-transparent text-zinc-100 outline-none cursor-pointer"
                      />
                    </label>
                    {logFilterDate && (
                      <button
                        onClick={() => setLogFilterDate('')}
                        className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold text-zinc-300 hover:bg-slate-800 transition-colors"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                {groupedLogEntries.length === 0 ? (
                  <div className="py-16 text-center text-zinc-500 border border-dashed border-slate-800 rounded-2xl">
                    <FileText size={32} className="mx-auto mb-2 opacity-30" />
                    <p className="text-xs font-black uppercase tracking-widest">No logs found{logFilterDate ? ' for this date' : ''}</p>
                  </div>
                ) : (
                  groupedLogEntries.map((group) => (
                    <div key={group.date} className="rounded-2xl border border-slate-800 bg-slate-900/60 shadow-lg overflow-hidden">
                      <div className="flex items-center gap-3 border-b border-slate-800 bg-slate-800/40 px-5 py-3">
                        <CalendarClock size={16} className="text-brand-400" />
                        <h5 className="text-xs font-black uppercase tracking-widest text-zinc-100">{logDateHeader(group.date)}</h5>
                        <span className="ml-auto rounded-full bg-slate-800 px-2.5 py-0.5 text-[10px] font-black text-zinc-400">
                          {group.entries.length} Entr{group.entries.length > 1 ? 'ies' : 'y'}
                        </span>
                      </div>
                      <div className="divide-y divide-slate-800/70">
                        {group.entries.map((entry) => (
                          <div
                            key={entry.id}
                            onClick={() => {
                              if (!entry.isManual) {
                                const t = allTasks.find((x) => `auto-${x.step.id}` === entry.id);
                                if (t) setTaskDetailTarget({ floorId: t.floorId, roomId: t.roomId, step: t.step, roomName: t.roomName, roomSqft: t.roomSqft });
                              }
                            }}
                            className={`p-4 ${entry.isManual ? '' : 'cursor-pointer hover:bg-slate-800/40 transition-colors'}`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-xs font-black text-zinc-100">
                                  <span className="text-brand-400">{entry.taskName}</span>
                                  {!entry.isManual && <span className="text-zinc-400 font-bold"> · {entry.floorName} — {entry.roomName}</span>}
                                </p>
                                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-bold text-zinc-400">
                                  <span className="inline-flex items-center gap-1"><Users size={11} /> {entry.painterName}</span>
                                  <span className="inline-flex items-center gap-1"><Clock size={11} /> {formatDateTime(entry.timestamp)}</span>
                                  <span className="inline-flex items-center gap-1 text-emerald-400"><Ruler size={11} /> {entry.sqft} SqFt</span>
                                  <span className="inline-flex items-center gap-1 text-amber-400"><Brush size={11} /> {entry.consumed} {entry.isManual ? 'units' : 'L'} Consumed</span>
                                </div>
                              </div>
                              {entry.isManual && (
                                <span className="rounded-lg bg-slate-800 px-2.5 py-1 text-[9px] font-black uppercase text-brand-400">Supervisor Report</span>
                              )}
                            </div>
                            {entry.materials && entry.materials.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {entry.materials.map((m, i) => (
                                  <span key={`${m.name}-${i}`} className="rounded-md bg-slate-800/60 px-2 py-0.5 text-[9px] font-bold text-zinc-300">
                                    {m.name}: {m.qty}{m.unit ? ` ${m.unit}` : ''}
                                  </span>
                                ))}
                              </div>
                            )}
                            {entry.notes && (
                              <p className="mt-2 text-xs text-zinc-300 bg-slate-800/50 p-2.5 rounded-xl italic border-l-4 border-brand-500">"{entry.notes}"</p>
                            )}
                            {entry.issues && (
                              <div className="mt-2 flex items-center gap-2 p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold">
                                <AlertTriangle size={14} />
                                <span>Reported Issues: {entry.issues}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-center p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
          <button 
            onClick={() => setShowDailyLog(true)}
            className="rounded-lg bg-brand-500 px-8 py-2.5 text-sm font-bold text-white shadow-md hover:bg-brand-600 transition-all active:scale-95"
          >
            SUBMIT DAILY LOG
          </button>
        </div>
      </div>

      {/* Modals & Drawers */}
      {approvalLightboxTarget && approvalLightboxTarget.audit && approvalLightboxTarget.audit.step && (
        <ErrorBoundary fallbackTitle="Lightbox Preview Error">
          <ApprovalLightboxModal
            audit={approvalLightboxTarget.audit}
            initialMode={approvalLightboxTarget.initialMode || 'compare'}
            onClose={() => setApprovalLightboxTarget(null)}
            onApprove={() => {
              const audit = approvalLightboxTarget?.audit;
              if (audit?.floorId && audit?.roomId && audit?.step?.id) {
                onPhotoAudit?.(
                  audit.floorId,
                  audit.roomId,
                  audit.step.id,
                  true
                );
              }
              setApprovalLightboxTarget(null);
            }}
            onReject={() => {
              const audit = approvalLightboxTarget?.audit;
              if (audit?.floorId && audit?.roomId && audit?.step?.id) {
                onPhotoAudit?.(
                  audit.floorId,
                  audit.roomId,
                  audit.step.id,
                  false
                );
              }
              setApprovalLightboxTarget(null);
            }}
          />
        </ErrorBoundary>
      )}
      {weeklyDrawerData && (
        <WeeklyDetailDrawer
          title={weeklyDrawerData.title}
          tasks={weeklyDrawerData.tasks}
          painters={painters}
          pct={weeklyDrawerData.pct}
          onClose={() => setWeeklyDrawerData(null)}
          onSelectTask={(task) => {
            setWeeklyDrawerData(null);
            setTaskDetailTarget({
              floorId: task.floorId,
              roomId: task.roomId,
              step: task.step,
              roomName: task.roomName,
              roomSqft: task.roomSqft
            });
          }}
        />
      )}
      {showDailyLog && (
        <DailyLogModal
          materials={project.materialBillOfQuantities}
          supervisorName={supervisor.name}
          onClose={() => setShowDailyLog(false)}
          onConfirm={handleConfirmDailyLog}
        />
      )}
      {showTargetAllocator && (
        <DailyTargetAllocatorModal
          project={project}
          painters={activePainters}
          onClose={() => setShowTargetAllocator(false)}
          onAssign={onAssignDailyTarget}
        />
      )}
      {taskDetailTarget && activeTaskDetailStep && (
        <TaskDetailModal
          floorId={taskDetailTarget.floorId}
          roomId={taskDetailTarget.roomId}
          step={activeTaskDetailStep}
          roomName={taskDetailTarget.roomName}
          roomSqft={taskDetailTarget.roomSqft}
          painters={painters}
          onClose={() => setTaskDetailTarget(null)}
          onTaskProgress={onTaskProgress}
          onPainterAssign={onPainterAssign}
          onUpdateTaskStep={onUpdateTaskStep}
          onQaApprove={onQaApprove}
          onUpdatePhoto={onUpdatePhoto}
        />
      )}
    </div>
  );
}

/**
 * Task Detail Modal for Supervisor actions
 */
function TaskDetailModal({
  floorId,
  roomId,
  step,
  roomName,
  roomSqft,
  painters,
  onClose,
  onTaskProgress,
  onPainterAssign,
  onUpdateTaskStep,
  onQaApprove,
  onUpdatePhoto,
}: {
  floorId: string;
  roomId: string;
  step: FinishingStep;
  roomName: string;
  roomSqft?: number;
  painters: Painter[];
  onClose: () => void;
  onTaskProgress: (floorId: string, roomId: string, stepId: string, progressPct: number, status: TaskStatus) => void;
  onPainterAssign: (floorId: string, roomId: string, stepId: string, painterIds: string[]) => void;
  onUpdateTaskStep: (floorId: string, roomId: string, stepId: string, updates: Partial<FinishingStep>) => void;
  onQaApprove: (floorId: string, roomId: string, stepId: string, form: QaForm) => void;
  onUpdatePhoto: (floorId: string, roomId: string, stepId: string, photoUrl: string, type: 'before' | 'after') => void;
}) {
  const [painterMenuOpen, setPainterMenuOpen] = useState(false);
  const [showQaModal, setShowQaModal] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState<'before' | 'after' | null>(null);

  const assignedPainters = painters.filter(p => step.painterIds?.includes(p.id));

  const handleTogglePainter = (pId: string) => {
    const current = step.painterIds ?? [];
    const next = current.includes(pId) ? current.filter(id => id !== pId) : [...current, pId];
    onPainterAssign(floorId, roomId, step.id, next);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900 overflow-hidden">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className={`h-12 w-12 rounded-2xl grid place-items-center shadow-lg ${stepIconClass(step.name)}`}>
              <Brush size={24} />
            </div>
            <div>
              <h3 className="text-xl font-black text-zinc-100 tracking-tight">{step.name}</h3>
              <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">{roomName} • Target: <span className="text-brand-400">{step.stepSqft || roomSqft || 0} sqft</span></p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-zinc-500 hover:bg-slate-800 rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="space-y-6 max-h-[75vh] overflow-y-auto pr-2 custom-scrollbar">
          {/* Status & Schedule Date Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2 p-4 rounded-2xl bg-slate-800/50 border border-slate-700/50">
              <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Current Status</span>
              <StatusBadge status={step.status} size="md" />
            </div>
            <div className="flex flex-col gap-2 p-4 rounded-2xl bg-slate-800/50 border border-slate-700/50">
              <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Schedule Execution</span>
              <input 
                type="date" 
                value={step.scheduledDate || todayISO()}
                onChange={(e) => onUpdateTaskStep(floorId, roomId, step.id, { scheduledDate: e.target.value })}
                className="bg-transparent text-sm font-black text-zinc-100 outline-none focus:text-brand-400 cursor-pointer"
              />
            </div>
          </div>

          {/* Painter Assignment */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">Assigned Painter Team</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setPainterMenuOpen(!painterMenuOpen)}
                className="w-full flex items-center justify-between px-4 py-4 rounded-2xl border border-slate-700 bg-slate-800/50 shadow-sm hover:border-brand-500/50 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-xl bg-brand-500/10 grid place-items-center">
                    <Users size={18} className="text-brand-400" />
                  </div>
                  <span className="text-sm font-bold text-zinc-200">
                    {assignedPainters.length > 0 ? assignedPainters.map(p => p.name).join(', ') : 'Assign Painters...'}
                  </span>
                </div>
                <ChevronDown size={18} className={`text-zinc-500 transition-transform duration-300 ${painterMenuOpen ? 'rotate-180 text-brand-400' : ''}`} />
              </button>
              {painterMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setPainterMenuOpen(false)} />
                  <div className="absolute top-full left-0 right-0 mt-3 z-50 max-h-64 overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl p-2 animate-in fade-in slide-in-from-top-4 duration-200">
                    {painters.map(p => {
                      const isSelected = step.painterIds?.includes(p.id) ?? false;
                      return (
                        <div
                          key={p.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTogglePainter(p.id);
                          }}
                          className={`w-full flex items-center justify-between px-3 py-3 rounded-xl transition-all mb-1 cursor-pointer select-none ${isSelected ? 'bg-brand-500/10 border border-brand-500/20' : 'hover:bg-slate-800 border border-transparent'}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`h-9 w-9 rounded-full grid place-items-center text-xs font-black ${isSelected ? 'bg-brand-500 text-white' : 'bg-slate-800 text-zinc-400'}`}>
                              {p.name.charAt(0)}
                            </div>
                            <div className="text-left">
                              <p className={`text-sm font-black ${isSelected ? 'text-brand-400' : 'text-zinc-200'}`}>{p.name}</p>
                              <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-tighter">Painter ID: {p.id}</p>
                            </div>
                          </div>
                          <div 
                            className={`h-6 w-6 rounded-full border-2 grid place-items-center transition-all ${isSelected ? 'bg-brand-500 border-brand-500 scale-110 shadow-lg shadow-brand-500/20' : 'border-slate-700'}`}
                          >
                            {isSelected && <Check size={14} className="text-white" strokeWidth={4} />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Photos */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">Pre-Work Evidence</label>
              <button 
                onClick={() => setShowPhotoModal('before')}
                className="w-full aspect-video rounded-2xl border-2 border-dashed border-slate-700 bg-slate-800/30 flex flex-col items-center justify-center gap-2 hover:border-brand-500 hover:bg-brand-500/5 transition-all group overflow-hidden"
              >
                {getRealPhotoUrl(step, 'before') ? (
                  <img src={getRealPhotoUrl(step, 'before')} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" alt="" />
                ) : (
                  <>
                    <Camera size={28} className="text-zinc-600 group-hover:text-brand-400 transition-colors" />
                    <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest group-hover:text-brand-400">Upload Before</span>
                  </>
                )}
              </button>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">Completion Evidence</label>
              <button 
                onClick={() => setShowPhotoModal('after')}
                className="w-full aspect-video rounded-2xl border-2 border-dashed border-slate-700 bg-slate-800/30 flex flex-col items-center justify-center gap-2 hover:border-emerald-500 hover:bg-emerald-500/5 transition-all group overflow-hidden"
              >
                {getRealPhotoUrl(step, 'after') ? (
                  <img src={getRealPhotoUrl(step, 'after')} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" alt="" />
                ) : (
                  <>
                    <Camera size={28} className="text-zinc-600 group-hover:text-emerald-400 transition-colors" />
                    <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest group-hover:text-emerald-400">Upload After</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Execution & Completion Details Summary */}
          <div className="p-4 rounded-2xl bg-slate-800/40 border border-slate-700/50 space-y-2 text-xs">
            <p className="text-[10px] font-black text-brand-400 uppercase tracking-wider">Completion & Consumption Audit</p>
            <div className="grid grid-cols-2 gap-2 text-zinc-300 font-medium">
              <div>
                <span className="text-zinc-500 block text-[10px]">Area Completed:</span>
                <span className="font-bold text-zinc-100">{step.areaCompleted || step.completedSqft || step.stepSqft || roomSqft || 0} SqFt</span>
              </div>
              <div>
                <span className="text-zinc-500 block text-[10px]">Material Consumed:</span>
                <span className="font-bold text-zinc-100">{step.consumedQuantity || 0} L</span>
              </div>
              <div>
                <span className="text-zinc-500 block text-[10px]">Assigned Team:</span>
                <span className="font-bold text-zinc-100">{assignedPainters.length > 0 ? assignedPainters.map(p => p.name).join(', ') : 'Unassigned'}</span>
              </div>
              <div>
                <span className="text-zinc-500 block text-[10px]">Scheduled Date:</span>
                <span className="font-bold text-zinc-100">{formatSchedDate(step.scheduledDate)}</span>
              </div>
              <div>
                <span className="text-zinc-500 block text-[10px]">Completed Date/Time:</span>
                <span className="font-bold text-zinc-100">
                  {step.completedAt ? new Date(step.completedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : (step.afterPhotoAt ? new Date(step.afterPhotoAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'Pending Execution')}
                </span>
              </div>
            </div>
            {(() => {
              const sla = computeSla(step);
              if (!sla) return null;
              return (
                <div className="pt-1">
                  <SlaBadge sla={sla} />
                </div>
              );
            })()}
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-800">
            <button
              onClick={() => {
                const isStart = step.status === 'NOT_STARTED' || step.status === 'ASSIGNED';
                const nextStatus = isStart ? 'IN_PROGRESS' : 'PENDING_INSPECTION';
                onTaskProgress(floorId, roomId, step.id, isStart ? 50 : 90, nextStatus);
              }}
              className="flex items-center justify-center gap-2 rounded-2xl border border-slate-700 py-4 text-xs font-black uppercase tracking-widest text-zinc-300 hover:bg-slate-800 hover:text-white transition-all active:scale-95"
            >
              {step.status === 'NOT_STARTED' || step.status === 'ASSIGNED' ? 'START EXECUTION' : 'SUBMIT INSPECTION'}
            </button>
            <button
              onClick={() => setShowQaModal(true)}
              disabled={step.status === 'COMPLETED'}
              className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-4 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 transition-all active:scale-95 disabled:opacity-50 disabled:grayscale"
            >
              <ClipboardCheck size={18} />
              APPROVE SITE
            </button>
          </div>
        </div>

        {showQaModal && (
          <QaInspectionModal
            stepName={step.name}
            roomName={roomName}
            onClose={() => setShowQaModal(false)}
            onApprove={(form) => {
              onQaApprove(floorId, roomId, step.id, form);
              setShowQaModal(false);
              onClose();
            }}
          />
        )}

        {showPhotoModal && (
          <PhotoProofModal
            stepName={step.name}
            onClose={() => setShowPhotoModal(null)}
            onUpload={(url) => {
              onUpdatePhoto(floorId, roomId, step.id, url, showPhotoModal);
              setShowPhotoModal(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

function WeeklyDetailDrawer({
  title,
  tasks,
  painters,
  pct,
  onClose,
  onSelectTask,
}: {
  title: string;
  tasks: { floorId: string; floorName: string; roomId: string; roomName: string; roomSqft?: number; step: FinishingStep }[];
  painters: Painter[];
  pct?: number;
  onClose: () => void;
  onSelectTask: (task: { floorId: string; floorName: string; roomId: string; roomName: string; roomSqft?: number; step: FinishingStep }) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md h-full bg-slate-900 border-l border-slate-800 p-6 shadow-2xl flex flex-col justify-between animate-in slide-in-from-right duration-300">
        <div className="space-y-6 overflow-y-auto custom-scrollbar pr-1">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-black text-zinc-100">{title}</h3>
              {pct !== undefined && <p className="text-xs font-bold text-brand-400 mt-0.5">{pct}% Total Floor Completion</p>}
            </div>
            <button onClick={onClose} className="p-2 text-zinc-400 hover:bg-slate-800 rounded-full">
              <X size={20} />
            </button>
          </div>

          <div className="space-y-3">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Task Audit Breakdown ({tasks.length} Items)</h4>
            {tasks.length === 0 ? (
              <p className="text-xs text-zinc-500 italic py-8 text-center">No tasks recorded for this selection.</p>
            ) : (
              tasks.map((t) => {
                const assignedPainters = painters.filter((p) => t.step.painterIds?.includes(p.id));
                const compTimeStr = t.step.completedAt
                  ? new Date(t.step.completedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
                  : (t.step.afterPhotoAt ? new Date(t.step.afterPhotoAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'Pending');

                return (
                  <div
                    key={t.step.id}
                    onClick={() => onSelectTask(t)}
                    className="p-4 rounded-2xl border border-slate-800 bg-slate-800/40 hover:bg-slate-800 hover:border-brand-500/50 cursor-pointer transition-all space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-zinc-100">{t.floorName} — {t.roomName}</span>
                      <StatusBadge status={t.step.status} size="sm" />
                    </div>
                    <p className="text-xs font-bold text-brand-400">{t.step.name}</p>

                    <div className="grid grid-cols-2 gap-2 text-[10px] bg-slate-900/60 p-2.5 rounded-xl text-zinc-300">
                      <div>
                        <span className="text-zinc-500 block">Painter Team:</span>
                        <span className="font-bold text-zinc-100">{assignedPainters.map((p) => p.name).join(', ') || 'Unassigned'}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block">Area Done:</span>
                        <span className="font-bold text-emerald-400">{t.step.areaCompleted || t.step.completedSqft || t.step.stepSqft || t.roomSqft || 0} SqFt</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block">Material Consumed:</span>
                        <span className="font-bold text-zinc-100">{t.step.consumedQuantity || 0} L</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block">Completion Date:</span>
                        <span className="font-bold text-zinc-100">{compTimeStr}</span>
                      </div>
                    </div>

                    {(getRealPhotoUrl(t.step, 'before') || getRealPhotoUrl(t.step, 'after')) && (
                      <div className="flex gap-2 pt-1">
                        {getRealPhotoUrl(t.step, 'before') && (
                          <div className="h-12 w-16 rounded-lg overflow-hidden border border-slate-700">
                            <img src={getRealPhotoUrl(t.step, 'before')} className="h-full w-full object-cover" alt="Before" />
                          </div>
                        )}
                        {getRealPhotoUrl(t.step, 'after') && (
                          <div className="h-12 w-16 rounded-lg overflow-hidden border border-slate-700">
                            <img src={getRealPhotoUrl(t.step, 'after')} className="h-full w-full object-cover" alt="After" />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full mt-4 rounded-xl bg-slate-800 py-3 text-xs font-black uppercase text-zinc-300 hover:bg-slate-700 transition-colors"
        >
          Close Drawer
        </button>
      </div>
    </div>
  );
}

function DailyTargetAllocatorModal({
  project,
  painters,
  onClose,
  onAssign,
}: {
  project: PaintProject;
  painters: Painter[];
  onClose: () => void;
  onAssign: (painterId: string, floorId: string, roomId: string, stepId: string, targetSqft: number, targetHours?: number) => void;
}) {
  const [selectedPainter, setSelectedPainter] = useState<string>(painters[0]?.id ?? '');
  const [selectedFloor, setSelectedFloor] = useState<string>('');
  const [selectedRoom, setSelectedRoom] = useState<string>('');
  const [selectedStep, setSelectedStep] = useState<string>('');
  const [targetSqft, setTargetSqft] = useState<number>(0);
  const [targetHours, setTargetHours] = useState<number>(0);
  const [warningAlert, setWarningAlert] = useState<string | null>(null);

  const floors = project.floors ?? [];
  const selectedFloorObj = floors.find((f) => f.id === selectedFloor);
  const rooms = selectedFloorObj?.rooms ?? [];
  const selectedRoomObj = rooms.find((r) => r.id === selectedRoom);
  const steps = selectedRoomObj?.finishingSteps ?? [];

  const handleStepChange = (stepId: string) => {
    setSelectedStep(stepId);
    if (!stepId) {
      setWarningAlert(null);
      return;
    }
    const step = steps.find((s) => s.id === stepId);
    if (step) {
      if (step.status === 'COMPLETED' || step.status === 'IN_PROGRESS' || step.status === 'PENDING_INSPECTION') {
        const assignedPainters = painters
          .filter((p) => step.painterIds?.includes(p.id))
          .map((p) => p.name);
        const painterName = assignedPainters.length > 0 ? assignedPainters.join(', ') : 'Unassigned Painter';
        const timestampRaw = step.completedAt ?? step.afterPhotoAt ?? step.beforePhotoAt;
        const timestamp = timestampRaw
          ? new Date(timestampRaw).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
          : 'recently';
        const roomName = selectedRoomObj?.name ?? 'Selected Room';

        setWarningAlert(
          `Task Already Completed / In Progress! ${step.name} for ${roomName} was completed on ${timestamp} by ${painterName}. Please allocate the next step.`
        );
      } else {
        setWarningAlert(null);
      }

      const roomArea = selectedRoomObj?.totalSqft ?? selectedRoomObj?.netWallSqft ?? selectedRoomObj?.interiorSqft ?? selectedRoomObj?.exteriorSqft ?? selectedRoomObj?.sqft ?? 0;
      const stepArea = step.stepSqft ?? roomArea;
      if (stepArea) setTargetSqft(stepArea);
      // Pre-fill target hours with system recommendation
      setTargetHours(estimateHours(step.name, stepArea || 0));
    }
  };

  const handleAssign = () => {
    if (!selectedPainter || !selectedFloor || !selectedRoom || !selectedStep || targetSqft <= 0) return;
    const step = steps.find((s) => s.id === selectedStep);
    if (step && (step.status === 'COMPLETED' || step.status === 'IN_PROGRESS' || step.status === 'PENDING_INSPECTION')) {
      const assignedPainters = painters
        .filter((p) => step.painterIds?.includes(p.id))
        .map((p) => p.name);
      const painterName = assignedPainters.length > 0 ? assignedPainters.join(', ') : 'Unassigned Painter';
      const timestampRaw = step.completedAt ?? step.afterPhotoAt ?? step.beforePhotoAt;
      const timestamp = timestampRaw
        ? new Date(timestampRaw).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
        : 'recently';
      const roomName = selectedRoomObj?.name ?? 'Selected Room';

      setWarningAlert(
        `Task Already Completed / In Progress! ${step.name} for ${roomName} was completed on ${timestamp} by ${painterName}. Please allocate the next step.`
      );
      return;
    }

    onAssign(selectedPainter, selectedFloor, selectedRoom, selectedStep, targetSqft, targetHours || undefined);
    setSelectedStep('');
    setTargetSqft(0);
    setTargetHours(0);
    setWarningAlert(null);
  };

  const currentSelectedStepObj = steps.find((s) => s.id === selectedStep);
  const isStepBlocked = currentSelectedStepObj && (currentSelectedStepObj.status === 'COMPLETED' || currentSelectedStepObj.status === 'IN_PROGRESS' || currentSelectedStepObj.status === 'PENDING_INSPECTION');

  // Productivity capacity calculations
  const stepName = currentSelectedStepObj?.name;
  const productivityRate = getStepProductivity(stepName);
  const estimatedHrs = estimateHours(stepName, targetSqft);
  const dailyMaxSqft = maxDailySqft(stepName);
  // Sum existing targets for this painter today (reference only, never blocks)
  const painterExistingHours = (project.dailyTargets ?? [])
    .filter((t) => t.painterId === selectedPainter && t.date === todayISO() && t.stepId !== selectedStep)
    .reduce((sum, t) => {
      let existingStepName: string | undefined;
      for (const f of project.floors ?? []) {
        for (const r of f.rooms ?? []) {
          const s = (r.finishingSteps ?? []).find((fs) => fs.id === t.stepId);
          if (s) { existingStepName = s.name; break; }
        }
        if (existingStepName) break;
      }
      return sum + estimateHours(existingStepName, t.targetSqft);
    }, 0);
  const totalHoursWithNew = painterExistingHours + (targetHours || estimatedHrs);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 overflow-hidden">
        
        {/* Duplicate Assignment Alert Modal */}
        {warningAlert && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setWarningAlert(null)} />
            <div className="relative w-full max-w-md rounded-2xl border border-amber-500/60 bg-slate-900 p-6 shadow-2xl space-y-4 text-left border-t-4 border-t-amber-500 animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center gap-3 text-amber-400">
                <div className="h-10 w-10 rounded-xl bg-amber-500/20 grid place-items-center shrink-0">
                  <AlertTriangle size={22} />
                </div>
                <div>
                  <h4 className="text-base font-black text-white">Target Allocation Guard</h4>
                  <p className="text-[10px] uppercase font-bold text-amber-400/80">Duplicate Assignment Prevented</p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-500/30 text-xs font-semibold text-amber-100 leading-relaxed">
                {warningAlert}
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => {
                    setWarningAlert(null);
                    setSelectedStep('');
                  }}
                  className="rounded-xl bg-amber-500 px-5 py-2.5 text-xs font-black text-slate-950 hover:bg-amber-400 transition-all shadow-lg shadow-amber-500/20"
                >
                  Acknowledge & Select Next Step
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
              <Target size={18} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Daily SqFt Target Allocator</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Assign today's target to checked-in painters</p>
            </div>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          {/* Warning Banner Inline */}
          {warningAlert && (
            <div className="p-3.5 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-200 text-xs flex items-start gap-2.5">
              <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-bold text-amber-300">Target Allocation Guard</p>
                <p className="mt-0.5 opacity-90">{warningAlert}</p>
              </div>
            </div>
          )}

          {/* Painter selection */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
              <Users size={12} className="mr-1 inline" />
              Assign Painter (Checked In)
            </label>
            <select
              value={selectedPainter}
              onChange={(e) => setSelectedPainter(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-brand-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              {painters.map((p) => {
                const cState = p.clockState ?? 'CLOCKED_OUT';
                const statusLabel = cState === 'CLOCKED_IN' ? '● Active' : cState === 'ON_BREAK' ? '○ Break' : '◌ Off';
                return (
                  <option key={p.id} value={p.id}>
                    {p.name} ({statusLabel})
                  </option>
                );
              })}
            </select>
          </div>

          {/* Floor selection */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">Floor Location</label>
            <select
              value={selectedFloor}
              onChange={(e) => { setSelectedFloor(e.target.value); setSelectedRoom(''); setSelectedStep(''); setWarningAlert(null); }}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-brand-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="">Select floor...</option>
              {floors.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>

          {/* Room selection */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">Room / Area</label>
            <select
              value={selectedRoom}
              onChange={(e) => { setSelectedRoom(e.target.value); setSelectedStep(''); setWarningAlert(null); }}
              disabled={!selectedFloor}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-brand-400 focus:outline-none disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="">Select room...</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>{r.name} ({r.totalSqft ?? r.netWallSqft ?? r.interiorSqft ?? r.exteriorSqft ?? r.sqft ?? 0} sqft)</option>
              ))}
            </select>
          </div>

          {/* Step selection */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">Specific Task Step</label>
            <select
              value={selectedStep}
              onChange={(e) => handleStepChange(e.target.value)}
              disabled={!selectedRoom}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-brand-400 focus:outline-none disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="">Select step...</option>
              {steps.map((s) => {
                const isComp = s.status === 'COMPLETED';
                const isProg = s.status === 'IN_PROGRESS' || s.status === 'PENDING_INSPECTION';
                const statusBadge = isComp
                  ? ' — [✓ ALREADY COMPLETED]'
                  : isProg
                  ? ' — [⏳ IN PROGRESS]'
                  : '';
                return (
                  <option 
                    key={s.id} 
                    value={s.id}
                    disabled={isComp}
                    className={isComp ? 'font-bold text-slate-400 bg-slate-800' : isProg ? 'text-amber-400' : ''}
                  >
                    {s.stepNumber}. {s.name} ({s.stepSqft ?? selectedRoomObj?.totalSqft ?? selectedRoomObj?.netWallSqft ?? selectedRoomObj?.interiorSqft ?? selectedRoomObj?.exteriorSqft ?? selectedRoomObj?.sqft ?? 0} sqft){statusBadge}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Target SqFt */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
              <Target size={12} className="mr-1 inline" />
              Target SqFt to Achieve Today
            </label>
            <input
              type="number"
              value={targetSqft === 0 ? '' : targetSqft}
              onChange={(e) => {
                const sqft = parseInt(e.target.value) || 0;
                setTargetSqft(sqft);
                // Auto-update hours recommendation when sqft changes
                if (sqft > 0) setTargetHours(estimateHours(stepName, sqft));
              }}
              min={0}
              placeholder="e.g. 500"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-brand-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
            {/* Allocated Target Hours (editable override) */}
            {selectedStep && targetSqft > 0 && (
              <div className="mt-3">
                <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  <Timer size={12} className="mr-1 inline" />
                  Allocated Target Hours
                  <span className="ml-1.5 text-[10px] font-normal text-slate-400">(system suggests {estimatedHrs}h — adjust for site conditions)</span>
                </label>
                <input
                  type="number"
                  value={targetHours === 0 ? '' : targetHours}
                  onChange={(e) => setTargetHours(parseFloat(e.target.value) || 0)}
                  min={0}
                  step={0.5}
                  placeholder={`e.g. ${estimatedHrs}`}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-brand-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                />
              </div>
            )}
            {/* Productivity & Capacity Info (reference only, never blocks) */}
            {selectedStep && targetSqft > 0 && (
              <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-500 dark:text-slate-400">{productivityRate.label} Rate</span>
                  <span className="font-bold text-slate-700 dark:text-slate-200">{productivityRate.sqftPerHour} sqft/hr</span>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-500 dark:text-slate-400">Painter Daily Max (reference)</span>
                  <span className="font-bold text-slate-700 dark:text-slate-200">{dailyMaxSqft} sqft ({PAINTER_DAILY_CAPACITY_HOURS}h shift)</span>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-500 dark:text-slate-400">Painter Total Today (incl. new)</span>
                  <span className="text-slate-700 dark:text-slate-200">{Math.round(totalHoursWithNew * 10) / 10} / {PAINTER_DAILY_CAPACITY_HOURS} hrs</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4 dark:border-slate-800">
          <button onClick={onClose} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            Close
          </button>
          <button
            onClick={handleAssign}
            disabled={!selectedPainter || !selectedStep || targetSqft <= 0 || Boolean(isStepBlocked)}
            className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-brand-500/20 hover:bg-brand-600 active:scale-[0.98] disabled:opacity-50"
          >
            <Plus size={15} />
            Assign Target
          </button>
        </div>
      </div>
    </div>
  );
}

function ApprovalLightboxModal({
  audit,
  initialMode = 'compare',
  onClose,
  onApprove,
  onReject,
}: {
  audit: {
    floorId: string;
    floorName: string;
    roomId: string;
    roomName: string;
    roomSqft?: number;
    step: FinishingStep;
    painterName: string;
  };
  initialMode?: 'before' | 'after' | 'compare';
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const step = audit?.step;
  const beforeImg = getRealPhotoUrl(step, 'before');
  const afterImg = getRealPhotoUrl(step, 'after');

  const [mode, setMode] = useState<'compare' | 'before' | 'after'>(
    beforeImg && afterImg ? initialMode : (afterImg ? 'after' : 'before')
  );
  const [zoom, setZoom] = useState<number>(1);

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.5, 3));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.5, 1));
  const handleResetZoom = () => setZoom(1);

  const formattedTime = step?.afterPhotoAt
    ? new Date(step.afterPhotoAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
    : 'Recently reported';

  if (!audit || !step) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-3xl border border-slate-800 bg-slate-900 text-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 px-6 py-4 bg-slate-900/90">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase tracking-widest text-brand-400">{step.name || 'Task'}</span>
              <span className="text-xs text-slate-500">•</span>
              <span className="text-xs font-bold text-slate-300">{audit.floorName || 'Floor'} — {audit.roomName || 'Room'}</span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium mt-0.5">
              Assigned: <span className="text-slate-200 font-bold">{audit.painterName || 'Unassigned'}</span> | Reported: <span className="text-slate-200">{formattedTime}</span> | Area: <span className="text-emerald-400 font-bold">{step.areaCompleted || step.completedSqft || step.stepSqft || audit.roomSqft || 0} SqFt</span>
            </p>
          </div>

          {/* Controls Bar: Mode & Zoom */}
          <div className="flex items-center gap-3">
            {/* View Mode Toggle */}
            <div className="flex rounded-xl bg-slate-800/80 p-1 border border-slate-700/60">
              {beforeImg && afterImg && (
                <button
                  type="button"
                  onClick={() => setMode('compare')}
                  className={`px-3 py-1.5 text-[11px] font-black uppercase rounded-lg transition-all ${
                    mode === 'compare' ? 'bg-brand-500 text-white shadow-md' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Side-By-Side
                </button>
              )}
              {beforeImg && (
                <button
                  type="button"
                  onClick={() => setMode('before')}
                  className={`px-3 py-1.5 text-[11px] font-black uppercase rounded-lg transition-all ${
                    mode === 'before' ? 'bg-brand-500 text-white shadow-md' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Before
                </button>
              )}
              {afterImg && (
                <button
                  type="button"
                  onClick={() => setMode('after')}
                  className={`px-3 py-1.5 text-[11px] font-black uppercase rounded-lg transition-all ${
                    mode === 'after' ? 'bg-brand-500 text-white shadow-md' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  After
                </button>
              )}
            </div>

            {/* Zoom Controls */}
            <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700/60">
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={zoom <= 1}
                className="p-1.5 text-slate-300 hover:text-white disabled:opacity-30 transition-colors"
                title="Zoom Out"
              >
                <ZoomOut size={16} />
              </button>
              <button
                type="button"
                onClick={handleResetZoom}
                className="px-2 py-1 text-[10px] font-black text-brand-400 hover:text-brand-300"
                title="Reset Zoom"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                onClick={handleZoomIn}
                disabled={zoom >= 3}
                className="p-1.5 text-slate-300 hover:text-white disabled:opacity-30 transition-colors"
                title="Zoom In"
              >
                <ZoomIn size={16} />
              </button>
            </div>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Modal Image View Area */}
        <div className="flex-1 min-h-[350px] max-h-[60vh] overflow-auto p-6 bg-slate-950/60 flex items-center justify-center">
          {mode === 'compare' && beforeImg && afterImg ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full h-full">
              {/* Before Photo */}
              <div className="flex flex-col items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest bg-slate-800 text-amber-400 px-3 py-1 rounded-full border border-amber-500/20">
                  Before Work Photo
                </span>
                <div className="relative w-full h-full min-h-[250px] rounded-2xl overflow-hidden border border-slate-800 bg-slate-900 flex items-center justify-center">
                  <div
                    className="w-full h-full flex items-center justify-center transition-transform duration-200"
                    style={{ transform: `scale(${zoom})` }}
                  >
                    <img
                      src={beforeImg}
                      alt="Before"
                      className="max-h-[45vh] w-auto object-contain rounded-xl"
                    />
                  </div>
                </div>
              </div>

              {/* After Photo */}
              <div className="flex flex-col items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest bg-slate-800 text-emerald-400 px-3 py-1 rounded-full border border-emerald-500/20">
                  After Work Photo
                </span>
                <div className="relative w-full h-full min-h-[250px] rounded-2xl overflow-hidden border border-slate-800 bg-slate-900 flex items-center justify-center">
                  <div
                    className="w-full h-full flex items-center justify-center transition-transform duration-200"
                    style={{ transform: `scale(${zoom})` }}
                  >
                    <img
                      src={afterImg}
                      alt="After"
                      className="max-h-[45vh] w-auto object-contain rounded-xl"
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 w-full h-full">
              <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border ${
                mode === 'before' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              }`}>
                {mode === 'before' ? 'Before Work High-Res Preview' : 'After Work High-Res Preview'}
              </span>
              <div className="relative w-full h-full min-h-[300px] rounded-2xl overflow-hidden border border-slate-800 bg-slate-900 flex items-center justify-center">
                <div
                  className="w-full h-full flex items-center justify-center transition-transform duration-200"
                  style={{ transform: `scale(${zoom})` }}
                >
                  <img
                    src={mode === 'before' ? beforeImg : afterImg}
                    alt={mode}
                    className="max-h-[50vh] w-auto object-contain rounded-xl shadow-2xl"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer / Actions */}
        <div className="flex items-center justify-between border-t border-slate-800 px-6 py-4 bg-slate-900">
          <p className="text-xs text-slate-400">
            Review quality details above using Zoom & Compare before decision.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                onReject();
                onClose();
              }}
              className="rounded-xl bg-red-500/20 border border-red-500/40 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-red-400 hover:bg-red-500 hover:text-white transition-all shadow-md active:scale-95"
            >
              Reject & Rework
            </button>
            <button
              type="button"
              onClick={() => {
                onApprove();
                onClose();
              }}
              className="rounded-xl bg-emerald-500 px-6 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-emerald-500/25 hover:bg-emerald-600 transition-all active:scale-95"
            >
              Approve Quality
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-4 py-3 text-center">
      <p className="text-xl font-bold text-white">{value}</p>
      <p className="text-[10px] font-medium uppercase tracking-wider text-white/60">{label}</p>
    </div>
  );
}

function QuickMetricCard({
  icon,
  label,
  value,
  unit,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  unit?: string;
  color: 'brand' | 'amber' | 'emerald';
}) {
  const colors = {
    brand: 'bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400 border-brand-100 dark:border-brand-500/20',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400 border-amber-100 dark:border-amber-500/20',
    emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/20',
  };

  return (
    <div className={`rounded-xl border p-3 ${colors[color]}`}>
      <div className="mb-1.5 flex items-center gap-1.5 opacity-80">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-lg font-bold">
        {value}
        {unit && <span className="ml-0.5 text-xs font-medium opacity-70">{unit}</span>}
      </p>
    </div>
  );
}

function fmtDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function PhotoProofModal({
  stepName,
  onClose,
  onUpload,
}: {
  stepName: string;
  onClose: () => void;
  onUpload: (url: string) => void;
}) {
  const [url, setUrl] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // In a real app, we'd upload to S3/Cloudinary. 
      // For this demo, we'll use a local object URL or a placeholder.
      const objectUrl = URL.createObjectURL(file);
      onUpload(objectUrl);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Upload Photo Proof</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X size={20} />
          </button>
        </div>
        
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          Add a photo proof for <span className="font-semibold text-brand-500">{stepName}</span>
        </p>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
              Option 1: Upload File
            </label>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 py-8 transition-colors hover:border-brand-400 hover:bg-brand-50 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-brand-500/40">
              <Camera size={24} className="text-slate-400" />
              <span className="text-xs font-medium text-slate-500">Click to capture or upload</span>
              <input 
                type="file" 
                accept="image/*" 
                capture="environment"
                className="hidden" 
                onChange={handleFileChange}
              />
            </label>
          </div>

          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200 dark:border-slate-700"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-slate-400 dark:bg-slate-900">Or</span>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
              Option 2: Paste Image URL
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/image.jpg"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-brand-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={() => url && onUpload(url)}
            disabled={!url}
            className="flex-1 rounded-lg bg-brand-500 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-500/20 hover:bg-brand-600 disabled:opacity-50"
          >
            Save Photo
          </button>
        </div>
      </div>
    </div>
  );
}

function PhotoAuditCard({
  floorName,
  roomName,
  step,
  painterName,
  onApprove,
  onReject,
}: {
  floorName: string;
  roomName: string;
  step: FinishingStep;
  painterName: string;
  onApprove: () => void;
  onReject: () => void;
}) {
  const timestamp = step.afterPhotoAt ?? step.beforePhotoAt;
  const timeStr = timestamp
    ? new Date(timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
    : 'Unknown';

  return (
    <div className="overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-card dark:border-amber-500/30 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className={`grid h-9 w-9 place-items-center rounded-lg ${stepIconClass(step.name)}`}>
            <Brush size={16} />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{step.name}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{floorName} · {roomName}</p>
          </div>
        </div>
        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
          Pending Review
        </span>
      </div>

      <div className="p-4">
        {/* Photos */}
        <div className="flex gap-3">
          {step.beforePhotoUrl && (
            <div className="relative flex-1 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
              <img src={step.beforePhotoUrl} alt="Before" className="h-32 w-full object-cover" />
              <span className="absolute bottom-0 left-0 bg-slate-900/70 px-2 py-0.5 text-[10px] font-medium text-white">Before</span>
            </div>
          )}
          {step.afterPhotoUrl && (
            <div className="relative flex-1 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
              <img src={step.afterPhotoUrl} alt="After" className="h-32 w-full object-cover" />
              <span className="absolute bottom-0 left-0 bg-slate-900/70 px-2 py-0.5 text-[10px] font-medium text-white">After</span>
            </div>
          )}
        </div>

        {/* Metadata */}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1">
            <UserCircle2 size={12} />
            {painterName}
          </span>
          <span className="flex items-center gap-1">
            <Clock size={12} />
            {timeStr}
          </span>
          {((step.areaCompleted || 0) > 0 || (step.completedSqft || 0) > 0) && (
            <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <Ruler size={12} />
              {step.areaCompleted || step.completedSqft || 0} sqft
            </span>
          )}
          {(step.consumedQuantity || 0) > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <Brush size={12} />
              {step.consumedQuantity || 0} {(step.name || '').toLowerCase().includes('putty') || (step.name || '').toLowerCase().includes('powder') ? 'kg' : 'L'}
            </span>
          )}
          {step.photoGpsVerified && (
            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <MapPin size={12} />
              GPS Verified
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="mt-4 flex gap-2">
          <button
            onClick={onReject}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-300 bg-red-50 py-3 text-sm font-bold text-red-600 transition-colors hover:bg-red-100 active:scale-[0.98] dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400"
          >
            <X size={16} />
            Reject & Rework
          </button>
          <button
            onClick={onApprove}
            className="flex flex-[2] items-center justify-center gap-1.5 rounded-xl bg-emerald-500 py-3 text-sm font-bold text-white shadow-md shadow-emerald-500/20 transition-colors hover:bg-emerald-600 active:scale-[0.98]"
          >
            <CheckCircle2 size={18} />
            Approve Quality
          </button>
        </div>
      </div>
    </div>
  );
}
