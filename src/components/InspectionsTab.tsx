import { useMemo, useState } from 'react';
import {
  ClipboardCheck,
  Camera,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Building2,
  Sun,
  Search,
  X,
  LogIn,
  LogOut,
  Activity,
  TrendingUp,
} from 'lucide-react';
import type {
  PaintProject,
  FinishingStep,
  Floor,
  Room,
  SupervisorSession,
  SupervisorActivityType,
} from '@/types';
import {
  getRealPhotoUrl,
  getStepArea,
  getCompletedArea,
  isExteriorFloor,
  fmtNum,
  formatDateTime,
  relativeDayLabel,
  computeSla,
} from '@/utils';
import { StatusBadge } from './StatusBadge';

interface InspectionsTabProps {
  project: PaintProject;
}

type InspectionState = 'APPROVED' | 'PENDING_REVIEW' | 'REJECTED' | 'NO_PHOTO';

interface InsRecord {
  key: string;
  floorName: string;
  roomName: string;
  isExterior: boolean;
  step: FinishingStep;
  painterNames: string[];
  targetSqft: number;
  completedSqft: number;
  state: InspectionState;
  approvedBy?: string;
  approvedAt?: number;
  reworkReason?: string;
  reworkCount?: number;
  beforePhoto?: string;
  afterPhoto?: string;
  slaDelayed?: boolean;
}

const ACTIVITY_LABELS: Record<SupervisorActivityType, string> = {
  LOGIN: 'Logged In',
  LOGOUT: 'Logged Out',
  ASSIGN_PAINTER: 'Assigned Painter',
  ALLOCATE_TARGET: 'Allocated Daily Target',
  APPROVE_QUALITY: 'Approved Quality',
  REJECT_REWORK: 'Rejected / Rework',
  QA_SIGNOFF: 'QA Sign-off',
  SCHEDULE_UPDATE: 'Schedule Update',
  DAILY_LOG: 'Daily Log Submitted',
};

const ACTIVITY_ICONS: Record<SupervisorActivityType, typeof LogIn> = {
  LOGIN: LogIn,
  LOGOUT: LogOut,
  ASSIGN_PAINTER: Activity,
  ALLOCATE_TARGET: TrendingUp,
  APPROVE_QUALITY: CheckCircle2,
  REJECT_REWORK: AlertTriangle,
  QA_SIGNOFF: CheckCircle2,
  SCHEDULE_UPDATE: Clock,
  DAILY_LOG: ClipboardCheck,
};

function painterNamesFor(project: PaintProject, ids?: string[]): string[] {
  if (!ids || ids.length === 0) return [];
  const map = new Map((project.painters ?? []).map((p) => [p.id, p.name]));
  return ids.map((id) => map.get(id) ?? 'Unknown Painter');
}

function classifyStep(step: FinishingStep): InspectionState {
  if (step.photoAuditStatus === 'REJECTED' || step.reworkRequestedAt) return 'REJECTED';
  if (step.photoAuditStatus === 'APPROVED' || step.approvedAt || step.qaVerified) return 'APPROVED';
  if (step.photoAuditStatus === 'PENDING_REVIEW' || step.status === 'PENDING_INSPECTION') return 'PENDING_REVIEW';
  if (getRealPhotoUrl(step, 'after')) return 'PENDING_REVIEW';
  return 'NO_PHOTO';
}

export function InspectionsTab({ project }: InspectionsTabProps) {
  const [filter, setFilter] = useState<InspectionState | 'ALL'>('ALL');
  const [query, setQuery] = useState('');
  const [lightbox, setLightbox] = useState<string | null>(null);

  const records = useMemo<InsRecord[]>(() => {
    const out: InsRecord[] = [];
    for (const floor of project.floors ?? []) {
      const floorIsExt = isExteriorFloor(floor);
      for (const room of floor.rooms ?? []) {
        for (const step of room.finishingSteps ?? []) {
          const after = getRealPhotoUrl(step, 'after');
          const before = getRealPhotoUrl(step, 'before');
          if (!after && !before && !step.qaVerified && !step.photoAuditStatus && !step.approvedAt) {
            // Still surface steps sent for rework even without photos.
            if (!step.reworkRequestedAt) continue;
          }
          const sla = computeSla(step);
          out.push({
            key: `${floor.id}/${room.id}/${step.id}`,
            floorName: floorIsExt ? 'Exterior' : floor.name,
            roomName: room.name,
            isExterior: floorIsExt || Boolean(room.isExterior) || Boolean(step.isExterior),
            step,
            painterNames: painterNamesFor(project, step.painterIds),
            targetSqft: getStepArea(step, room),
            completedSqft: getCompletedArea(step, room),
            state: classifyStep(step),
            approvedBy: step.approvedBy,
            approvedAt: step.approvedAt,
            reworkReason: step.reworkReason,
            reworkCount: step.reworkCount,
            beforePhoto: before,
            afterPhoto: after,
            slaDelayed: sla?.delayed,
          });
        }
      }
    }
    return out.sort((a, b) => {
      const atA = (b.approvedAt ?? b.step.completedAt ?? 0) - (a.approvedAt ?? a.step.completedAt ?? 0);
      if (atA !== 0) return atA;
      return a.key.localeCompare(b.key);
    });
  }, [project]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return records.filter((r) => {
      if (filter !== 'ALL' && r.state !== filter) return false;
      if (!q) return true;
      return (
        r.step.name.toLowerCase().includes(q) ||
        r.roomName.toLowerCase().includes(q) ||
        r.floorName.toLowerCase().includes(q) ||
        r.painterNames.join(' ').toLowerCase().includes(q)
      );
    });
  }, [records, filter, query]);

  const kpis = useMemo(() => {
    const total = records.length;
    const approved = records.filter((r) => r.state === 'APPROVED').length;
    const pending = records.filter((r) => r.state === 'PENDING_REVIEW').length;
    const rejected = records.filter((r) => r.state === 'REJECTED').length;
    const withPhoto = records.filter((r) => r.afterPhoto).length;
    const target = records.reduce((s, r) => s + r.targetSqft, 0);
    const completed = records.reduce((s, r) => s + r.completedSqft, 0);
    const delayed = records.filter((r) => r.slaDelayed).length;
    const approvalRate = total > 0 ? Math.round((approved / total) * 100) : 0;
    const coverage = target > 0 ? Math.round((completed / target) * 100) : 0;
    return { total, approved, pending, rejected, withPhoto, target, completed, delayed, approvalRate, coverage };
  }, [records]);

  const sessions = useMemo(
    () => [...(project.supervisorSessions ?? [])].sort((a, b) => b.loginAt - a.loginAt),
    [project.supervisorSessions],
  );

  const activity = useMemo(
    () => [...(project.supervisorActivity ?? [])].sort((a, b) => b.at - a.at),
    [project.supervisorActivity],
  );

  const FILTERS: { id: InspectionState | 'ALL'; label: string }[] = [
    { id: 'ALL', label: 'All' },
    { id: 'APPROVED', label: 'Approved' },
    { id: 'PENDING_REVIEW', label: 'Pending Review' },
    { id: 'REJECTED', label: 'Rework' },
    { id: 'NO_PHOTO', label: 'No Photo' },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2.5">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
            <ClipboardCheck size={20} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Completed &amp; Approved Inspections
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Admin KPI audit trail — painter photos, supervisor approvals, target vs actual sqft and SLA.
            </p>
          </div>
        </div>
      </div>

      {/* KPI summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard
          icon={<ClipboardCheck size={14} />}
          label="Total Records"
          value={fmtNum(kpis.total)}
          tone="slate"
        />
        <KpiCard
          icon={<CheckCircle2 size={14} />}
          label="Approved"
          value={fmtNum(kpis.approved)}
          tone="emerald"
        />
        <KpiCard
          icon={<Clock size={14} />}
          label="Pending Review"
          value={fmtNum(kpis.pending)}
          tone="amber"
        />
        <KpiCard
          icon={<AlertTriangle size={14} />}
          label="Rework"
          value={fmtNum(kpis.rejected)}
          tone="rose"
        />
        <KpiCard
          icon={<Camera size={14} />}
          label="With Photo"
          value={fmtNum(kpis.withPhoto)}
          tone="sky"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard
          icon={<TrendingUp size={14} />}
          label="Approval Rate"
          value={`${kpis.approvalRate}%`}
          tone="emerald"
        />
        <KpiCard
          icon={<Building2 size={14} />}
          label="Area Coverage"
          value={`${kpis.coverage}%`}
          sub={`${fmtNum(kpis.completed)} / ${fmtNum(kpis.target)} sqft`}
          tone="brand"
        />
        <KpiCard
          icon={<Clock size={14} />}
          label="SLA Breaches"
          value={fmtNum(kpis.delayed)}
          tone="rose"
        />
      </div>

      {/* Filters + search */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-card dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                filter === f.id
                  ? 'bg-brand-500 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search step, room, painter…"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs text-slate-700 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Inspection list */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
          <ClipboardCheck size={28} className="mx-auto mb-2 text-slate-300 dark:text-slate-600" />
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">No inspection records found.</p>
          <p className="mt-1 text-xs text-slate-400">Assign tasks and upload completion photos to populate the audit trail.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <InspectionCard key={r.key} record={r} onOpenPhoto={setLightbox} />
          ))}
        </div>
      )}

      {/* Supervisor session tracking (issue 5 visibility) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
            <LogIn size={16} className="text-brand-500" />
            Supervisor Sessions
          </div>
          {sessions.length === 0 ? (
            <p className="text-xs text-slate-400">No sessions recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {sessions.map((s: SupervisorSession) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800/50"
                >
                  <div>
                    <p className="font-medium text-slate-700 dark:text-slate-200">{s.supervisorName}</p>
                    <p className="text-slate-400">
                      {relativeDayLabel(s.date)} · {s.actionCount ?? 0} actions
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-slate-600 dark:text-slate-300">{formatDateTime(s.loginAt)}</p>
                    <p className="text-slate-400">
                      {s.logoutAt ? `Out ${formatDateTime(s.logoutAt)}` : <span className="text-emerald-500">Active</span>}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
            <Activity size={16} className="text-brand-500" />
            Activity Audit Log
          </div>
          {activity.length === 0 ? (
            <p className="text-xs text-slate-400">No activity logged yet.</p>
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {activity.slice(0, 40).map((a) => {
                const Icon = ACTIVITY_ICONS[a.type] ?? Activity;
                return (
                  <div
                    key={a.id}
                    className="flex items-start gap-2.5 rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800/50"
                  >
                    <div className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
                      <Icon size={12} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-slate-700 dark:text-slate-200">
                        <span className="text-brand-600 dark:text-brand-400">{a.supervisorName}</span> ·{' '}
                        {ACTIVITY_LABELS[a.type] ?? a.type}
                      </p>
                      <p className="truncate text-slate-400">{a.detail}</p>
                      <p className="text-slate-400">{formatDateTime(a.at)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Photo lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}
        >
          <img
            src={lightbox}
            alt="Inspection"
            className="max-h-[85vh] max-w-[90vw] rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
            onClick={() => setLightbox(null)}
          >
            <X size={18} />
          </button>
        </div>
      )}
    </div>
  );
}

function InspectionCard({
  record,
  onOpenPhoto,
}: {
  record: InsRecord;
  onOpenPhoto: (url: string) => void;
}) {
  const { step, floorName, roomName, isExterior, painterNames, targetSqft, completedSqft, state } = record;
  const variance = targetSqft > 0 ? Math.round((completedSqft / targetSqft) * 100) : 0;

  const stateBadge =
    state === 'APPROVED'
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
      : state === 'PENDING_REVIEW'
        ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'
        : state === 'REJECTED'
          ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400'
          : 'bg-slate-100 text-slate-500 dark:bg-slate-700/50 dark:text-slate-400';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card transition-all dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{step.name}</p>
            {isExterior && (
              <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-600 dark:bg-orange-500/15 dark:text-orange-400">
                <Sun size={10} /> Exterior
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {floorName} · {roomName} · <span className="capitalize">{step.surfaceType?.toLowerCase() ?? step.surface}</span>
          </p>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${stateBadge}`}>
          {state === 'APPROVED' && <CheckCircle2 size={11} />}
          {state === 'PENDING_REVIEW' && <Clock size={11} />}
          {state === 'REJECTED' && <AlertTriangle size={11} />}
          {state === 'NO_PHOTO' && <Camera size={11} />}
          {state === 'APPROVED'
            ? 'Approved'
            : state === 'PENDING_REVIEW'
              ? 'Pending Review'
              : state === 'REJECTED'
                ? 'Rework'
                : 'No Photo'}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <StatusBadge status={step.status} size="sm" />
        {record.slaDelayed && (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-600 dark:bg-rose-500/15 dark:text-rose-400">
            <Clock size={10} /> SLA Breach
          </span>
        )}
        {step.reworkCount ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
            Rework ×{step.reworkCount}
          </span>
        ) : null}
      </div>

      {/* Photos */}
      <div className="mt-3 flex gap-2">
        {record.beforePhoto ? (
          <button onClick={() => onOpenPhoto(record.beforePhoto!)} className="group relative">
            <img
              src={record.beforePhoto}
              alt="Before"
              className="h-20 w-28 rounded-lg border border-slate-200 object-cover dark:border-slate-700"
            />
            <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-medium text-white">
              Before
            </span>
          </button>
        ) : null}
        {record.afterPhoto ? (
          <button onClick={() => onOpenPhoto(record.afterPhoto!)} className="group relative">
            <img
              src={record.afterPhoto}
              alt="After"
              className="h-20 w-28 rounded-lg border border-slate-200 object-cover dark:border-slate-700"
            />
            <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-medium text-white">
              After
            </span>
          </button>
        ) : (
          <div className="grid h-20 w-28 place-items-center rounded-lg border border-dashed border-slate-200 text-[10px] text-slate-400 dark:border-slate-700">
            <Camera size={16} className="mb-1" /> No Photo
          </div>
        )}
      </div>

      {/* Metrics */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Target" value={`${fmtNum(targetSqft)} sqft`} />
        <Metric label="Completed" value={`${fmtNum(completedSqft)} sqft`} />
        <Metric label="Coverage" value={`${variance}%`} />
        <Metric
          label="Painter"
          value={painterNames.length ? painterNames.join(', ') : 'Unassigned'}
        />
      </div>

      {/* Audit trail bits */}
      <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
        {record.approvedAt && (
          <p className="flex items-center gap-1.5">
            <CheckCircle2 size={12} className="text-emerald-500" />
            Approved by <span className="font-medium text-slate-700 dark:text-slate-300">{record.approvedBy ?? 'Supervisor'}</span> ·{' '}
            {formatDateTime(record.approvedAt)}
          </p>
        )}
        {step.assignedAt && (
          <p className="flex items-center gap-1.5">
            <Clock size={12} className="text-slate-400" />
            Assigned {formatDateTime(step.assignedAt)} {step.assignedBy ? `by ${step.assignedBy}` : ''}
          </p>
        )}
        {record.reworkReason && (
          <p className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
            <AlertTriangle size={12} />
            Rework: {record.reworkReason}
          </p>
        )}
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone: 'slate' | 'emerald' | 'amber' | 'rose' | 'sky' | 'brand';
}) {
  const tones: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    emerald: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
    amber: 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
    rose: 'bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400',
    sky: 'bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400',
    brand: 'bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400',
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card dark:border-slate-800 dark:bg-slate-900">
      <div className={`mb-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold ${tones[tone]}`}>
        {icon}
        {label}
      </div>
      <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-slate-400">{sub}</p>}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800/50">
      <p className="text-[9px] uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold text-slate-700 dark:text-slate-200" title={value}>
        {value}
      </p>
    </div>
  );
}
