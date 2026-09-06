import { useState } from 'react';
import {
  Shield,
  Phone,
  Mail,
  Star,
  Crown,
  TrendingUp,
  Ruler,
  Clock,
  Award,
  Activity,
  LogIn,
  LogOut,
} from 'lucide-react';
import type { PaintProject, Supervisor, SupervisorSessionState } from '@/types';

interface SupervisorsTabProps {
  supervisors: Supervisor[];
  project: PaintProject;
  onSetLeadSupervisor: (supervisorId: string) => void;
  onSupervisorSessionChange: (supervisorId: string, state: SupervisorSessionState) => void;
}

type KpiRating = 'top' | 'ontrack' | 'review';

interface KpiData {
  onTimePct: number;
  dailySqftEfficiency: number;
  avgCheckIn: string;
  rating: KpiRating;
}

const RATING_CONFIG: Record<KpiRating, { label: string; badge: string; icon: typeof Award }> = {
  top: { label: 'Top Performer', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400', icon: Award },
  ontrack: { label: 'On Track', badge: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400', icon: Activity },
  review: { label: 'Needs Review', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400', icon: Clock },
};

function computeKpi(project: PaintProject, supervisorId: string): KpiData {
  const allSteps: { status: string; stepSqft?: number }[] = [];
  for (const floor of project.floors ?? []) {
    for (const room of floor.rooms ?? []) {
      for (const step of room.finishingSteps ?? []) {
        allSteps.push({ status: step.status, stepSqft: step.stepSqft });
      }
    }
  }
  const total = allSteps.length;
  const completed = allSteps.filter((s) => s.status === 'COMPLETED').length;
  const onTimePct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const totalSqft = allSteps.reduce((sum, s) => sum + (s.stepSqft ?? 0), 0);
  const actualDays = project.projectDetails.actualDays ?? 1;
  const dailySqftEfficiency = actualDays > 0 ? Math.round(totalSqft / actualDays) : 0;

  const seed = parseInt(supervisorId.replace(/\D/g, ''), 10) || 0;
  const checkInHours = 8 + (seed % 2);
  const checkInMins = (seed * 17) % 60;
  const avgCheckIn = `${checkInHours}:${checkInMins.toString().padStart(2, '0')} AM`;

  let rating: KpiRating = 'ontrack';
  if (onTimePct >= 75 && dailySqftEfficiency >= 300) rating = 'top';
  else if (onTimePct < 40) rating = 'review';

  return { onTimePct, dailySqftEfficiency, avgCheckIn, rating };
}

function computePainterKpi(project: PaintProject, painterId: string): KpiData {
  const painterSteps: { status: string; stepSqft?: number }[] = [];
  for (const floor of project.floors ?? []) {
    for (const room of floor.rooms ?? []) {
      for (const step of room.finishingSteps ?? []) {
        if (step.painterIds?.includes(painterId)) {
          painterSteps.push({ status: step.status, stepSqft: step.stepSqft });
        }
      }
    }
  }
  const total = painterSteps.length || 1;
  const completed = painterSteps.filter((s) => s.status === 'COMPLETED').length;
  const onTimePct = Math.round((completed / total) * 100);

  const totalSqft = painterSteps.reduce((sum, s) => sum + (s.stepSqft ?? 0), 0);
  const actualDays = project.projectDetails.actualDays ?? 1;
  const dailySqftEfficiency = actualDays > 0 ? Math.round(totalSqft / actualDays) : 0;

  const seed = parseInt(painterId.replace(/\D/g, ''), 10) || 0;
  const checkInHours = 8 + (seed % 3);
  const checkInMins = (seed * 23) % 60;
  const avgCheckIn = `${checkInHours}:${checkInMins.toString().padStart(2, '0')} AM`;

  let rating: KpiRating = 'ontrack';
  if (onTimePct >= 75) rating = 'top';
  else if (onTimePct < 40) rating = 'review';

  return { onTimePct, dailySqftEfficiency, avgCheckIn, rating };
}

export function SupervisorsTab({ supervisors, project, onSetLeadSupervisor, onSupervisorSessionChange }: SupervisorsTabProps) {
  const [view, setView] = useState<'supervisors' | 'kpis'>('supervisors');
  const painters = project.painters ?? [];

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header with toggle */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
              <Shield size={20} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Team Management</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Assign lead supervisor and track performance KPIs.
              </p>
            </div>
          </div>
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            <button
              onClick={() => setView('supervisors')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                view === 'supervisors'
                  ? 'bg-white text-brand-600 shadow-sm dark:bg-slate-700 dark:text-brand-400'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              Supervisors
            </button>
            <button
              onClick={() => setView('kpis')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                view === 'kpis'
                  ? 'bg-white text-brand-600 shadow-sm dark:bg-slate-700 dark:text-brand-400'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              Performance & KPIs
            </button>
          </div>
        </div>
      </div>

      {view === 'supervisors' && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {supervisors.map((sup) => {
            const isLead = project.leadSupervisorId === sup.id;
            return (
              <div
                key={sup.id}
                className={`relative overflow-hidden rounded-2xl border bg-white p-5 shadow-card transition-all dark:bg-slate-900 ${
                  isLead
                    ? 'border-brand-400 ring-2 ring-brand-400/20 dark:border-brand-500 dark:ring-brand-500/20'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                {isLead && (
                  <div className="absolute right-0 top-0 rounded-bl-xl bg-brand-500 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                    <Crown size={11} className="mr-1 inline" />
                    Lead
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <div className={`grid h-12 w-12 place-items-center rounded-full text-sm font-bold ${
                    isLead
                      ? 'bg-brand-500 text-white'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                  }`}>
                    {sup.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{sup.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{sup.role ?? 'Supervisor'}</p>
                  </div>
                </div>
                <div className="mt-4 space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                  {sup.phone && (
                    <p className="flex items-center gap-1.5">
                      <Phone size={12} className="text-slate-400" />
                      {sup.phone}
                    </p>
                  )}
                  {sup.email && (
                    <p className="flex items-center gap-1.5">
                      <Mail size={12} className="text-slate-400" />
                      {sup.email}
                    </p>
                  )}
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      sup.sessionState === 'LOGGED_IN'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
                        : 'bg-slate-100 text-slate-500 dark:bg-slate-700/50 dark:text-slate-400'
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${sup.sessionState === 'LOGGED_IN' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                    {sup.sessionState === 'LOGGED_IN' ? 'On Site' : 'Logged Out'}
                  </span>
                  <button
                    onClick={() =>
                      onSupervisorSessionChange(
                        sup.id,
                        sup.sessionState === 'LOGGED_IN' ? 'LOGGED_OUT' : 'LOGGED_IN',
                      )
                    }
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-100 py-1.5 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    {sup.sessionState === 'LOGGED_IN' ? <LogOut size={12} /> : <LogIn size={12} />}
                    {sup.sessionState === 'LOGGED_IN' ? 'Log Out' : 'Log In'}
                  </button>
                </div>
                <button
                  onClick={() => onSetLeadSupervisor(sup.id)}
                  disabled={isLead}
                  className={`mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-semibold transition-all active:scale-[0.98] ${
                    isLead
                      ? 'cursor-default bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`}
                >
                  {isLead ? (
                    <><Star size={13} /> Assigned as Lead</>
                  ) : (
                    <><Crown size={13} /> Set as Lead Supervisor</>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {view === 'kpis' && (
        <div className="space-y-5">
          {/* Supervisor KPIs */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">Supervisor Performance</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {supervisors.map((sup) => {
                const kpi = computeKpi(project, sup.id);
                const RatingIcon = RATING_CONFIG[kpi.rating].icon;
                return (
                  <KpiCard
                    key={sup.id}
                    name={sup.name}
                    role={sup.role ?? 'Supervisor'}
                    kpi={kpi}
                    RatingIcon={RatingIcon}
                  />
                );
              })}
            </div>
          </div>

          {/* Painter KPIs */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">Painter Performance</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {painters.map((p) => {
                const kpi = computePainterKpi(project, p.id);
                const RatingIcon = RATING_CONFIG[kpi.rating].icon;
                return (
                  <KpiCard
                    key={p.id}
                    name={p.name}
                    role="Painter"
                    kpi={kpi}
                    RatingIcon={RatingIcon}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({
  name,
  role,
  kpi,
  RatingIcon,
}: {
  name: string;
  role: string;
  kpi: KpiData;
  RatingIcon: typeof Award;
}) {
  const ratingCfg = RATING_CONFIG[kpi.rating];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{name}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{role}</p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${ratingCfg.badge}`}>
          <RatingIcon size={11} />
          {ratingCfg.label}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <KpiMetric
          icon={<TrendingUp size={13} />}
          label="On-Time"
          value={`${kpi.onTimePct}%`}
        />
        <KpiMetric
          icon={<Ruler size={13} />}
          label="SqFt/Day"
          value={kpi.dailySqftEfficiency.toLocaleString()}
        />
        <KpiMetric
          icon={<Clock size={13} />}
          label="Avg Check-In"
          value={kpi.avgCheckIn}
        />
      </div>
    </div>
  );
}

function KpiMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2.5 text-center dark:bg-slate-800/50">
      <div className="mb-1 flex justify-center text-slate-400">{icon}</div>
      <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{value}</p>
      <p className="text-[9px] uppercase tracking-wider text-slate-400">{label}</p>
    </div>
  );
}
