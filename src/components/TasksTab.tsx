import { useState } from 'react';
import { Layers, ChevronDown, Ruler, CircleCheck as CheckCircle2, Clock, Circle, Package, Check, Camera, ClipboardCheck, Users, Brush } from 'lucide-react';
import type { PaintProject, FinishingStep, TaskStatus, Painter } from '@/types';
import { StatusBadge } from './StatusBadge';
import { progressToStatus, statusToProgress, getRoomArea } from '@/utils';

interface TasksTabProps {
  project: PaintProject;
  onTaskChange?: (floorId: string, roomId: string, stepId: string, progressPct: number, status: TaskStatus) => void;
  // Supervisor specific props
  painters?: Painter[];
  onPainterAssign?: (floorId: string, roomId: string, stepId: string, painterIds: string[]) => void;
  onQaRequired?: (step: FinishingStep, floorId: string, roomId: string, roomName: string) => void;
  onUpdatePhoto?: (floorId: string, roomId: string, stepId: string, photoUrl: string, type: 'before' | 'after') => void;
  onUploadPhotoRequested?: (step: FinishingStep, floorId: string, roomId: string) => void;
}

const STATUS_FILTERS: { id: 'ALL' | TaskStatus; label: string }[] = [
  { id: 'ALL', label: 'All Steps' },
  { id: 'NOT_STARTED', label: 'Not Started' },
  { id: 'ASSIGNED', label: 'Assigned' },
  { id: 'IN_PROGRESS', label: 'In Progress' },
  { id: 'PAUSED', label: 'Paused' },
  { id: 'PENDING_INSPECTION', label: 'Pending Inspection' },
  { id: 'COMPLETED', label: 'Completed' },
];

export function TasksTab({ 
  project, 
  onTaskChange,
  painters,
  onPainterAssign,
  onQaRequired,
  onUpdatePhoto,
  onUploadPhotoRequested
}: TasksTabProps) {
  const [filter, setFilter] = useState<'ALL' | TaskStatus>('ALL');
  const [openFloors, setOpenFloors] = useState<Set<string>>(
    () => new Set(project.floors?.map((f) => f.id) ?? []),
  );

  const toggleFloor = (id: string) =>
    setOpenFloors((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Filter bar */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              filter === f.id
                ? 'bg-brand-500 text-white shadow-sm'
                : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Floor → Room → 10-step workflow */}
      <div className="space-y-3">
        {(project.floors ?? []).map((floor) => {
          const open = openFloors.has(floor.id);
          const rooms = floor.rooms ?? [];
          const allSteps = rooms.flatMap((r) => r.finishingSteps ?? []);
          const visibleSteps = filter === 'ALL' ? allSteps : allSteps.filter((s) => s.status === filter);

          return (
            <div
              key={floor.id}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card dark:border-slate-800 dark:bg-slate-900"
            >
              <button
                onClick={() => toggleFloor(floor.id)}
                className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <div className="flex items-center gap-2.5">
                  <Layers size={15} className="text-brand-500" />
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{floor.name}</span>
                  <span className="text-xs text-slate-400">{rooms.length} rooms</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400">{visibleSteps.length} steps</span>
                  <ChevronDown size={15} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                </div>
              </button>

              {open && (
                <div className="space-y-4 border-t border-slate-100 p-4 dark:border-slate-800">
                  {rooms.map((room) => {
                    const steps = room.finishingSteps ?? [];
                    const visible = filter === 'ALL' ? steps : steps.filter((s) => s.status === filter);
                    if (visible.length === 0) return null;

                    return (
                      <div key={room.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/30">
                        <div className="mb-3 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{room.name}</span>
                            <span className="flex items-center gap-1 text-xs text-slate-400">
                              <Ruler size={11} />
                              {room.sqft || room.totalSqft || room.netWallSqft || (room.finishingSteps && room.finishingSteps[0]?.targetSqft) || 0} sqft
                            </span>
                          </div>
                          <span className="text-xs text-slate-400">
                            {steps.filter((s) => s.status === 'COMPLETED').length}/{steps.length} done
                          </span>
                        </div>

                        {/* Sequential 10-step workflow */}
                        <div className="space-y-2">
                          {visible.map((step) => (
                            <StepRow
                              key={step.id}
                              step={step}
                              floorId={floor.id}
                              roomId={room.id}
                              roomName={room.name}
                              roomSqft={getRoomArea(room, Boolean(floor.isExterior || room.isExterior))}
                              onTaskChange={onTaskChange}
                              painters={painters}
                              onPainterAssign={onPainterAssign}
                              onQaRequired={onQaRequired}
                              onUpdatePhoto={onUpdatePhoto}
                              onUploadPhotoRequested={onUploadPhotoRequested}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StepRow({
  step,
  floorId,
  roomId,
  roomName,
  roomSqft,
  onTaskChange,
  painters,
  onPainterAssign,
  onQaRequired,
  onUpdatePhoto,
  onUploadPhotoRequested,
}: {
  step: FinishingStep;
  floorId: string;
  roomId: string;
  roomName: string;
  roomSqft?: number;
  onTaskChange?: (floorId: string, roomId: string, stepId: string, progressPct: number, status: TaskStatus) => void;
  painters?: Painter[];
  onPainterAssign?: (floorId: string, roomId: string, stepId: string, painterIds: string[]) => void;
  onQaRequired?: (step: FinishingStep, floorId: string, roomId: string, roomName: string) => void;
  onUpdatePhoto?: (floorId: string, roomId: string, stepId: string, photoUrl: string, type: 'before' | 'after') => void;
  onUploadPhotoRequested?: (step: FinishingStep, floorId: string, roomId: string) => void;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [painterMenuOpen, setPainterMenuOpen] = useState(false);
  const isSupervisor = !!onPainterAssign;

  const currentProgress = step.progressPct ?? statusToProgress(step.status);

  const handleStatusChange = (newStatus: TaskStatus) => {
    if (!onTaskChange) return;
    const progress = newStatus === 'COMPLETED' ? 100 : newStatus === 'IN_PROGRESS' ? 50 : 0;
    
    if (progress >= 100 && !step.qaVerified && onQaRequired) {
      onQaRequired(step, floorId, roomId, roomName);
      setIsMenuOpen(false);
      return;
    }

    onTaskChange(floorId, roomId, step.id, progress, newStatus);
    setIsMenuOpen(false);
  };

  const setProgress = (pct: number) => {
    if (!onTaskChange) return;
    const status = progressToStatus(pct);
    if (pct >= 100 && !step.qaVerified && onQaRequired) {
      onQaRequired({ ...step, progressPct: pct, status }, floorId, roomId, roomName);
      return;
    }
    onTaskChange(floorId, roomId, step.id, pct, status);
  };

  const togglePainter = (painterId: string) => {
    if (!onPainterAssign) return;
    const current = step.painterIds ?? [];
    const next = current.includes(painterId) ? current.filter((id) => id !== painterId) : [...current, painterId];
    onPainterAssign(floorId, roomId, step.id, next);
  };

  const statusOptions: { id: TaskStatus; label: string }[] = [
    { id: 'NOT_STARTED', label: 'Not Started' },
    { id: 'ASSIGNED', label: 'Assigned' },
    { id: 'IN_PROGRESS', label: 'In Progress' },
    { id: 'PAUSED', label: 'Paused' },
    { id: 'PENDING_INSPECTION', label: 'Pending Inspection' },
    { id: 'COMPLETED', label: 'Completed' },
  ];

  const assignedPainters = painters?.filter((p) => step.painterIds?.includes(p.id)) ?? [];
  const stages = [
    { label: 'Pending Inspection', pct: 100 },
  ];

  return (
    <div className={`rounded-xl border transition-all ${isSupervisor ? 'border-slate-200 bg-slate-50/50 p-4 dark:border-slate-700/70 dark:bg-slate-800/30' : 'flex items-center gap-3 border-slate-100 bg-white px-3 py-2.5 hover:border-slate-200 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-slate-600'}`}>
      <div className={`flex items-start justify-between gap-2 ${isSupervisor ? '' : 'flex-1'}`}>
        <div className="flex items-center gap-2.5">
          {!isSupervisor && (
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-500 dark:bg-slate-700 dark:text-slate-300">
              {step.stepNumber ?? ''}
            </span>
          )}
          {isSupervisor && (
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <Brush size={16} />
            </div>
          )}
          <div>
            <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{step.name}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {step.surface} {step.brand && `· ${step.brand}`}
            </p>
          </div>
        </div>
        
        {/* Status badge — INTERACTIVE for Supervisor, READ ONLY for Admin */}
        <div className="relative shrink-0">
          {onTaskChange ? (
            <div className="relative">
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="flex items-center gap-1.5 rounded-lg transition-all hover:ring-2 hover:ring-brand-500/20 active:scale-95"
              >
                <StatusBadge status={step.status} size="sm" />
                <ChevronDown size={12} className={`text-slate-400 transition-transform ${isMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {isMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsMenuOpen(false)} />
                  <div className="absolute right-0 top-full z-50 mt-1 min-w-[120px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800">
                    {statusOptions.map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => handleStatusChange(opt.id)}
                        className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs transition-colors hover:bg-slate-50 dark:hover:bg-slate-700 ${
                          step.status === opt.id ? 'font-bold text-brand-600 dark:text-brand-400' : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {opt.label}
                        {step.status === opt.id && <Check size={12} />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <StatusBadge status={step.status} size="sm" />
          )}
        </div>
      </div>

      {!isSupervisor && (
        <div className="mt-0.5 flex items-center gap-3 text-xs text-slate-400">
          {step.stepSqft != null && (
            <span className="flex items-center gap-1">
              <Ruler size={10} />
              {step.stepSqft} sqft
            </span>
          )}
          {step.productLine && <span className="truncate">{step.productLine}</span>}
          {step.qaVerified && (
            <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 size={11} />
              QA
            </span>
          )}
        </div>
      )}

      {isSupervisor && (
        <>
          {step.qaVerified && (
            <div className="mt-2 inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
              <ClipboardCheck size={11} />
              QA Verified
            </div>
          )}

          {/* Room Grouping Label */}
          <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3 dark:border-slate-700/70">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Location / Room</span>
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
              {roomName} — {step.stepSqft || roomSqft || 0} sqft
            </span>
          </div>

          {/* Painter allocation */}
          {painters != null && onPainterAssign != null && (
            <div className="mt-3">
              <div className="relative">
                <button
                  onClick={() => setPainterMenuOpen((o) => !o)}
                  className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  <span className="flex items-center gap-1.5">
                    <Users size={13} className="text-brand-500" />
                    {assignedPainters.length > 0 ? assignedPainters.map((p) => p.name).join(', ') : 'Assign Painter'}
                  </span>
                  <ChevronDown size={13} className="text-slate-400" />
                </button>
                {painterMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setPainterMenuOpen(false)} />
                    <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800">
                      {painters.map((p) => {
                        const checked = step.painterIds?.includes(p.id) ?? false;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePainter(p.id);
                            }}
                            className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs transition-colors hover:bg-slate-50 dark:hover:bg-slate-700 ${
                              checked ? 'text-brand-700 dark:text-brand-400' : 'text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            <span className={`grid h-4 w-4 shrink-0 place-items-center rounded border-2 transition-colors ${
                              checked ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-300 dark:border-slate-600'
                            }`}>
                              {checked && <Check size={11} />}
                            </span>
                            {p.name}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Photo Proof & Sign-off */}
          <div className="mt-4 flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {onUploadPhotoRequested && (
                <button
                  onClick={() => onUploadPhotoRequested(step, floorId, roomId)}
                  className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold uppercase tracking-tight text-slate-600 transition-colors hover:bg-slate-50 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  <Camera size={14} className="text-brand-500" />
                  Upload Proof Photo
                </button>
              )}
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-[11px] font-bold uppercase tracking-tight text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={currentProgress === 100}
                  onChange={(e) => setProgress(e.target.checked ? 100 : 75)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-900"
                />
                Supervisor Sign-off
              </label>
            </div>

            {/* Thumbnails */}
            {(step.beforePhotoUrl || step.afterPhotoUrl || (step.proofPhotos && step.proofPhotos.length > 0)) && (
              <div className="flex flex-wrap gap-2">
                {step.beforePhotoUrl && (
                  <div className="relative h-12 w-12 overflow-hidden rounded-md border border-slate-200 dark:border-slate-700">
                    <img src={step.beforePhotoUrl} alt="Before" className="h-full w-full object-cover" />
                    <span className="absolute bottom-0 left-0 right-0 bg-slate-900/60 text-[8px] font-bold text-white text-center">Before</span>
                  </div>
                )}
                {step.afterPhotoUrl && (
                  <div className="relative h-12 w-12 overflow-hidden rounded-md border border-slate-200 dark:border-slate-700">
                    <img src={step.afterPhotoUrl} alt="After" className="h-full w-full object-cover" />
                    <span className="absolute bottom-0 left-0 right-0 bg-slate-900/60 text-[8px] font-bold text-white text-center">After</span>
                  </div>
                )}
                {step.proofPhotos?.map((url, i) => (
                  <div key={i} className="relative h-12 w-12 overflow-hidden rounded-md border border-slate-200 dark:border-slate-700">
                    <img src={url} alt={`Proof ${i + 1}`} className="h-full w-full object-cover" />
                    <span className="absolute bottom-0 left-0 right-0 bg-slate-900/60 text-[8px] font-bold text-white text-center">Proof {i + 1}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Execution Stages */}
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {stages.map((stage) => (
              <button
                key={stage.pct}
                onClick={() => setProgress(stage.pct)}
                className={`rounded-lg border py-2 text-[10px] font-bold uppercase tracking-tighter transition-all ${
                  currentProgress === stage.pct
                    ? 'border-brand-500 bg-brand-500 text-white shadow-md shadow-brand-500/20'
                    : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
                }`}
              >
                {stage.label}
              </button>
            ))}
            <button
              onClick={() => setProgress(100)}
              disabled={!step.qaVerified}
              className={`rounded-lg border py-2 text-[10px] font-bold uppercase tracking-tighter transition-all ${
                step.qaVerified
                  ? 'border-emerald-500 bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                  : 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed dark:border-slate-700 dark:bg-slate-800/50'
              }`}
            >
              {step.qaVerified ? 'Approved' : 'Awaiting QA'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
