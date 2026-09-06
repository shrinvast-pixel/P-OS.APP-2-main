import { useMemo, useState, useEffect, useRef } from 'react';
import { CircleUser as UserCircle2, Layers, Brush, Play, Pause, CircleCheck as CheckCircle2, Ruler, Target, Camera, X, ClipboardCheck, LogIn, LogOut, Coffee, MapPin, Timer, ChevronRight, AlertTriangle } from 'lucide-react';
import type { PaintProject, Painter, FinishingStep, TaskStatus, DailyTarget, ClockState } from '@/types';
import { ErrorBoundary } from './ErrorBoundary';
import { todayISO, compressImageBase64, distributeTasksIntoSlots, estimateHours, getStepProductivity, maxDailySqft } from '@/utils';

interface PainterPortalProps {
  project: PaintProject;
  painter: Painter;
  onTaskStatusChange: (
    floorId: string,
    roomId: string,
    stepId: string,
    progressPct: number,
    status: TaskStatus,
    consumedQuantity?: number,
    areaCompleted?: number,
    pauseReason?: string
  ) => void;
  onPhotoUpload: (floorId: string, roomId: string, stepId: string, type: 'before' | 'after', url: string) => void;
  onClockChange: (painterId: string, state: ClockState) => void;
}

const PAUSE_REASONS = [
  "Plumber/Electrician Block",
  "Material Shortage",
  "Lunch/Tea Break",
  "Site Access Issue",
  "Other"
];

const STEP_ICONS: Record<string, string> = {
  putty: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  primer: 'bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400',
  emulsion: 'bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400',
  sanding: 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
  cleaning: 'bg-cyan-100 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400',
  touchup: 'bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400',
  qa: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
};

function stepIconClass(name: string): string {
  const key = name.toLowerCase();
  for (const k of Object.keys(STEP_ICONS)) {
    if (key.includes(k)) return STEP_ICONS[k];
  }
  return 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400';
}

function getMaterialUnit(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('cement') || lower.includes('putty') || lower.includes('powder')) return 'kg';
  if (lower.includes('sanding') || lower.includes('cleaning') || lower.includes('prep') || lower.includes('paper')) return 'Pcs';
  if (
    lower.includes('paint') || 
    lower.includes('primer') || 
    lower.includes('emulsion') || 
    lower.includes('enamel') || 
    lower.includes('interior') || 
    lower.includes('exterior')
  ) return 'L';
  if (lower.includes('wallpaper')) return 'rolls';
  return 'L'; // Default to L
}

const SITE_LABEL = 'Koramangala Site';
const SITE_LAT = 12.9352;
const SITE_LNG = 77.6245;
const GPS_TOLERANCE_KM = 0.5;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fmtDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function PainterPortal({
  project,
  painter,
  onTaskStatusChange,
  onPhotoUpload,
  onClockChange,
}: PainterPortalProps) {
  const [photoStep, setPhotoStep] = useState<{
    floorId: string;
    roomId: string;
    step: FinishingStep;
    type: 'before' | 'after';
  } | null>(null);
  const [completionTask, setCompletionTask] = useState<{
    floorId: string;
    roomId: string;
    roomSqft?: number;
    step: FinishingStep;
  } | null>(null);
  const [pauseTask, setPauseTask] = useState<{
    floorId: string;
    roomId: string;
    step: FinishingStep;
  } | null>(null);
  const [, setTick] = useState(0);

  const clockState: ClockState = painter.clockState ?? 'CLOCKED_OUT';
  const clockInAt = painter.clockInAt ?? null;
  const breakStartAt = painter.breakStartAt ?? null;
  const totalBreakMs = painter.totalBreakMs ?? 0;
  const gpsVerified = painter.gpsVerified ?? false;

  useEffect(() => {
    if (clockState === 'CLOCKED_OUT') return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [clockState]);

  const handleQuickSubmit = (t: typeof assignedTasks[0]) => {
    // 1-click submit for routine steps: use target sqft and 0 material
    onTaskStatusChange(
      t.floorId,
      t.roomId,
      t.step.id,
      100,
      'PENDING_INSPECTION',
      0,
      t.targetSqft || t.step.stepSqft || t.roomInteriorSqft || 0
    );
  };

  const elapsedMs = clockInAt ? Date.now() - clockInAt - totalBreakMs - (breakStartAt ? Date.now() - breakStartAt : 0) : 0;

  const handlePunchIn = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          onClockChange(painter.id, 'CLOCKED_IN');
        },
        () => onClockChange(painter.id, 'CLOCKED_IN'),
        { enableHighAccuracy: true, timeout: 8000 },
      );
    } else {
      onClockChange(painter.id, 'CLOCKED_IN');
    }
  };

  const handleBreak = () => {
    onClockChange(painter.id, 'ON_BREAK');
  };

  const handleResumeFromBreak = () => {
    onClockChange(painter.id, 'CLOCKED_IN');
  };

  const handlePunchOut = () => {
    onClockChange(painter.id, 'CLOCKED_OUT');
  };

  const assignedTasks = useMemo(() => {
    const result: { floorId: string; floorName: string; roomId: string; roomName: string; roomInteriorSqft?: number; step: FinishingStep; targetSqft?: number }[] = [];
    for (const floor of project.floors ?? []) {
      const exteriorZone = floor.isExterior || floor.id === 'floor-exterior';
      for (const room of floor.rooms ?? []) {
        for (const step of room.finishingSteps ?? []) {
          if (step.painterIds?.includes(painter.id)) {
            const target = project.dailyTargets?.find(t => t.stepId === step.id && t.date === todayISO());
            const isExteriorRoom = exteriorZone || Boolean(room.isExterior);
            result.push({
              floorId: floor.id,
              floorName: floor.name,
              roomId: room.id,
              roomName: room.name,
              roomInteriorSqft: isExteriorRoom ? (room.exteriorSqft ?? room.totalSqft ?? room.interiorSqft) : (room.interiorSqft ?? room.totalSqft),
              step,
              targetSqft: target?.targetSqft
            });
          }
        }
      }
    }
    return result;
  }, [project, painter.id]);

  // Backlog: only tasks explicitly flagged as rejected/rework by a supervisor
  const backlogTasks = useMemo(() => {
    return assignedTasks.filter(t => t.step.photoAuditStatus === 'REJECTED');
  }, [assignedTasks]);

  // Today's schedule: tasks assigned for today (via daily targets OR scheduledDate on the step)
  const todayTasks = useMemo(() => {
    const today = todayISO();
    return assignedTasks.filter(t => {
      const hasDailyTarget = project.dailyTargets?.some(tgt => tgt.stepId === t.step.id && tgt.date === today);
      const isScheduledToday = t.step.scheduledDate === today;
      return hasDailyTarget || isScheduledToday;
    });
  }, [assignedTasks, project.dailyTargets]);

  // Group today's tasks into slots based on cumulative estimated hours
  const slots = useMemo(() => {
    return distributeTasksIntoSlots(todayTasks);
  }, [todayTasks]);

  const handleStartWork = (t: typeof assignedTasks[0]) => {
    onTaskStatusChange(t.floorId, t.roomId, t.step.id, 10, 'IN_PROGRESS');
  };

  const handleCompleteWork = (t: typeof assignedTasks[0]) => {
    // Open completion modal
    setCompletionTask({ floorId: t.floorId, roomId: t.roomId, roomSqft: t.roomInteriorSqft, step: t.step });
  };

  const handlePauseWork = (t: typeof assignedTasks[0]) => {
    setPauseTask({ floorId: t.floorId, roomId: t.roomId, step: t.step });
  };

  const otherScheduledTasks = useMemo(() => {
    if (!pauseTask) return [];
    return todayTasks.filter(t => t.step.id !== pauseTask.step.id && t.step.status !== 'COMPLETED' && t.step.status !== 'PENDING_INSPECTION');
  }, [todayTasks, pauseTask]);

  const handleResumeAndFix = (t: typeof assignedTasks[0]) => {
    onTaskStatusChange(t.floorId, t.roomId, t.step.id, 50, 'IN_PROGRESS');
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-fade-in pb-12">
      {/* 1. Header with Live Date & Shift Status */}
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="bg-slate-900 p-6 text-white dark:bg-slate-950">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
              <h2 className="text-2xl font-black tracking-tight text-white">{project.projectDetails?.name || SITE_LABEL}</h2>
            </div>
            <div className="flex items-center gap-3 text-right">
              <div className="hidden sm:block">
                <p className="text-sm font-black text-white">{painter.name}</p>
                <p className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Shift ID: {painter.id.slice(-6)}</p>
              </div>
              <div className="h-10 w-10 rounded-full border-2 border-brand-500 bg-slate-800 grid place-items-center shadow-lg shadow-brand-500/20">
                <UserCircle2 size={24} className="text-brand-400" />
              </div>
            </div>
          </div>
          
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl bg-white/5 p-4 border border-white/10 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className={`h-12 w-12 rounded-2xl grid place-items-center transition-all ${clockState !== 'CLOCKED_OUT' ? 'bg-emerald-500 shadow-lg shadow-emerald-500/20' : 'bg-slate-700'}`}>
                {clockState !== 'CLOCKED_OUT' ? <Timer size={24} className="animate-pulse text-white" /> : <LogOut size={24} className="text-zinc-400" />}
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Shift Status: <span className={clockState !== 'CLOCKED_OUT' ? 'text-emerald-400' : 'text-zinc-500'}>{clockState.replace('_', ' ')}</span></p>
                <p className="font-mono text-3xl font-black tracking-tighter text-white">
                  {clockState === 'CLOCKED_OUT' ? '--:--:--' : fmtDuration(elapsedMs)}
                </p>
              </div>
            </div>
            
            <div className="flex gap-2">
              {clockState === 'CLOCKED_OUT' ? (
                <button 
                  onClick={handlePunchIn} 
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-8 py-3.5 text-xs font-black uppercase tracking-widest text-white hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20 active:scale-95"
                >
                  <LogIn size={18} />
                  Start Shift
                </button>
              ) : (
                <>
                  <button 
                    onClick={clockState === 'ON_BREAK' ? handleResumeFromBreak : handleBreak} 
                    className={`flex-1 sm:flex-none flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-xs font-black uppercase tracking-widest text-white transition-all shadow-lg active:scale-95 ${clockState === 'ON_BREAK' ? 'bg-emerald-500 shadow-emerald-500/20' : 'bg-amber-500 shadow-amber-500/20'}`}
                  >
                    {clockState === 'ON_BREAK' ? <Play size={18} /> : <Coffee size={18} />}
                    {clockState === 'ON_BREAK' ? 'Resume' : 'Break'}
                  </button>
                  <button 
                    onClick={handlePunchOut} 
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 rounded-xl bg-slate-700 px-6 py-3.5 text-xs font-black uppercase tracking-widest text-zinc-100 hover:bg-slate-600 transition-all shadow-lg shadow-slate-900/20 active:scale-95"
                  >
                    <LogOut size={18} />
                    End Shift
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
        
        {clockState !== 'CLOCKED_OUT' && (
          <div className={`flex items-center justify-center gap-2 py-2 text-[10px] font-black uppercase tracking-widest ${gpsVerified ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
            <MapPin size={12} />
            {gpsVerified ? `GPS LOCKED: ${painter.siteLabel || 'KORAMANGALA SITE'}` : 'GPS VERIFYING...'}
          </div>
        )}
      </div>

      {/* 2. Time Slot Shift Timeline (Today's Schedule) */}
      <div className="space-y-4 px-2">
        <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-zinc-400">
          <Timer size={16} />
          Today's Shift Agenda
        </h3>

        {slots.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-800/20 p-16 text-center">
            <Layers size={48} className="mx-auto text-slate-700 mb-4 opacity-20" />
            <p className="text-sm font-bold text-zinc-500 uppercase tracking-widest">No tasks scheduled for today</p>
          </div>
        ) : (
          <div className="relative space-y-8 before:absolute before:left-4 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
            {slots.map((slot) => (
              <div key={slot.slotId} className="relative pl-10">
                <div className="absolute left-[13px] top-2 h-2.5 w-2.5 rounded-full border-2 border-slate-900 bg-brand-500 ring-4 ring-brand-500/10" />
                <div className="mb-4">
                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Slot {slot.slotId}: {slot.time}</span>
                  <span className="ml-2 text-[9px] font-bold text-brand-400">{slot.hoursUsed}h used / {slot.hoursRemaining}h free</span>
                </div>
                <div className="space-y-4">
                  {slot.tasks.map((t) => (
                    <ShiftTaskCard
                      key={t.step.id}
                      task={t}
                      isActive={t.step.status === 'IN_PROGRESS'}
                      onStart={() => handleStartWork(t)}
                      onPause={() => handlePauseWork(t)}
                      onSubmit={() => handleCompleteWork(t)}
                      onQuickSubmit={() => handleQuickSubmit(t)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. Yesterday's Backlog & Rework Section */}
      {backlogTasks.length > 0 && (
        <div className="space-y-4">
          <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-red-500">
            <AlertTriangle size={16} />
            Previous Logs & Pending Rework
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {backlogTasks.map((t) => (
              <BacklogTaskCard
                key={t.step.id}
                task={t}
                onFix={() => handleResumeAndFix(t)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      {photoStep && photoStep.step && (
        <ErrorBoundary fallbackTitle="Photo Upload Error">
          <PhotoUploadModal
            step={photoStep.step}
            type={photoStep.type}
            currentUrl={
              photoStep.type === 'before'
                ? photoStep.step?.beforePhoto || photoStep.step?.beforePhotoUrl || ''
                : photoStep.step?.afterPhoto || photoStep.step?.completionPhoto || photoStep.step?.afterPhotoUrl || ''
            }
            onClose={() => setPhotoStep(null)}
            onConfirm={(url) => {
              const step = photoStep?.step;
              if (step) {
                if (photoStep.type === 'before') {
                  step.beforePhoto = url;
                  step.beforePhotoUrl = url;
                } else {
                  step.afterPhoto = url;
                  step.afterPhotoUrl = url;
                  step.completionPhoto = url;
                }
                if (url) {
                  step.proofPhotos = Array.from(new Set([...(step.proofPhotos ?? []), url]));
                }
                onPhotoUpload?.(photoStep.floorId, photoStep.roomId, step.id, photoStep.type, url);
              }
              setPhotoStep(null);
            }}
          />
        </ErrorBoundary>
      )}

      {completionTask && completionTask.step && (
        <ErrorBoundary fallbackTitle="Submission Error">
          <MaterialConsumptionModal
            step={completionTask.step}
            roomSqft={completionTask.roomSqft}
            onClose={() => setCompletionTask(null)}
            onConfirm={(qty, area, photoUrl) => {
              const step = completionTask?.step;
              if (step) {
                if (photoUrl) {
                  // Explicitly attach captured image Base64/URL to BOTH afterPhoto and completionPhoto properties
                  step.afterPhoto = photoUrl;
                  step.completionPhoto = photoUrl;
                  step.afterPhotoUrl = photoUrl;
                  step.proofPhotos = Array.from(new Set([...(step.proofPhotos ?? []), photoUrl]));
                  onPhotoUpload?.(completionTask.floorId, completionTask.roomId, step.id, 'after', photoUrl);
                }
                onTaskStatusChange?.(completionTask.floorId, completionTask.roomId, step.id, 100, 'PENDING_INSPECTION', qty, area);
              }
              setCompletionTask(null);
            }}
          />
        </ErrorBoundary>
      )}

      {pauseTask && (
        <PauseReasonModal
          step={pauseTask.step}
          otherTasks={otherScheduledTasks}
          onClose={() => setPauseTask(null)}
          onConfirm={(reason, switchTaskId) => {
            onTaskStatusChange(pauseTask.floorId, pauseTask.roomId, pauseTask.step.id, pauseTask.step.progressPct || 50, 'PAUSED', undefined, undefined, reason);
            if (switchTaskId) {
              const nextTask = otherScheduledTasks.find(t => t.step.id === switchTaskId);
              if (nextTask) {
                onTaskStatusChange(nextTask.floorId, nextTask.roomId, nextTask.step.id, 10, 'IN_PROGRESS');
              }
            }
            setPauseTask(null);
          }}
        />
      )}
    </div>
  );
}

function ShiftTaskCard({
  task,
  isActive,
  onStart,
  onPause,
  onSubmit,
  onQuickSubmit,
}: {
  task: { floorName: string; roomName: string; roomInteriorSqft?: number; step: FinishingStep; targetSqft?: number };
  isActive: boolean;
  onStart: () => void;
  onPause: () => void;
  onSubmit: () => void;
  onQuickSubmit: () => void;
}) {
  const isPending = task.step.status === 'NOT_STARTED' || task.step.status === 'ASSIGNED';
  const isPaused = task.step.status === 'PAUSED';
  const isPendingInspection = task.step.status === 'PENDING_INSPECTION';
  const isCompleted = task.step.status === 'COMPLETED';

  const isSandingOrPutty = task.step.name.toLowerCase().includes('sanding') || task.step.name.toLowerCase().includes('putty');

  return (
    <div className={`group relative overflow-hidden rounded-2xl border transition-all ${isActive ? 'border-brand-500 bg-brand-50/30 ring-1 ring-brand-500/20 shadow-md' : 'border-slate-200 bg-white hover:border-slate-300 dark:bg-slate-900 dark:border-slate-800'}`}>
      {isActive && <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-brand-500" />}
      
      <div className="p-4">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`h-12 w-12 rounded-2xl grid place-items-center shadow-sm ${stepIconClass(task.step.name)}`}>
              <Brush size={24} />
            </div>
            <div>
              <h4 className="text-sm font-black text-slate-800 dark:text-zinc-100">{task.step.name}</h4>
              <p className="text-[10px] text-slate-500 dark:text-zinc-400 uppercase font-bold tracking-wider">{task.floorName} · {task.roomName} — {task.roomInteriorSqft || 0} sqft</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-black text-brand-600 dark:text-brand-400">{task.targetSqft || 0} sqft</p>
            <p className="text-[9px] text-slate-400 dark:text-zinc-500 uppercase font-black tracking-tighter">Daily Target</p>
            <p className="text-[8px] text-slate-400 dark:text-zinc-500 mt-0.5">
              {getStepProductivity(task.step.name).label}: {getStepProductivity(task.step.name).sqftPerHour} sqft/hr
              {(() => { const hrs = estimateHours(task.step.name, task.targetSqft || task.step.stepSqft || task.roomInteriorSqft || 0); return hrs > 0 ? " \u2248 " + hrs + "h" : ""; })()}
            </p>
          </div>
        </div>

        <div className="mb-4 flex items-center gap-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3 text-[10px] font-black uppercase tracking-wider">
          <div className="flex items-center gap-1.5 text-slate-500 dark:text-zinc-400">
            <Layers size={12} className="text-slate-400" />
            Status: <span className={isActive ? 'text-brand-600 dark:text-brand-400' : isPaused ? 'text-amber-600' : 'text-slate-700 dark:text-zinc-300'}>{task.step.status.replace('_', ' ')}</span>
          </div>
          {isPaused && task.step.pauseReason && (
            <div className="flex items-center gap-1.5 border-l border-slate-200 dark:border-slate-700 pl-3 text-amber-600 italic">
              <AlertTriangle size={12} />
              {task.step.pauseReason}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          {isPending || isPaused ? (
            <button
              onClick={(e) => { e.stopPropagation(); onStart(); }}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-brand-500 py-4 text-xs font-black uppercase tracking-widest text-white hover:bg-brand-600 transition-all active:scale-[0.98] shadow-lg shadow-brand-500/20"
            >
              <Play size={16} fill="currentColor" />
              {isPaused ? 'Resume Work' : 'Start Execution'}
            </button>
          ) : isActive ? (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); onPause(); }}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 py-4 text-xs font-black uppercase tracking-widest text-zinc-300 hover:bg-slate-700 transition-all active:scale-[0.98]"
              >
                <Pause size={16} fill="currentColor" />
                Pause
              </button>
              {isSandingOrPutty ? (
                <button
                  onClick={(e) => { e.stopPropagation(); onQuickSubmit(); }}
                  className="flex-[1.5] flex items-center justify-center gap-2 rounded-xl bg-brand-600 py-4 text-xs font-black uppercase tracking-widest text-white hover:bg-brand-700 transition-all shadow-lg shadow-brand-600/20 active:scale-[0.98]"
                >
                  <CheckCircle2 size={16} />
                  Quick Submit
                </button>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); onSubmit(); }}
                  className="flex-[1.5] flex items-center justify-center gap-2 rounded-xl bg-emerald-500 py-4 text-xs font-black uppercase tracking-widest text-white hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20 active:scale-[0.98]"
                >
                  <ClipboardCheck size={16} />
                  Submit Inspection
                </button>
              )}
            </>
          ) : isPendingInspection ? (
            <div className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-brand-500/10 py-4 text-xs font-black uppercase tracking-widest text-brand-400 border border-brand-500/20 shadow-sm">
              <Timer size={16} className="animate-pulse" />
              Awaiting Inspection
            </div>
          ) : isCompleted ? (
            <div className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-emerald-500/10 py-4 text-xs font-black uppercase tracking-widest text-emerald-400 border border-emerald-500/20 shadow-sm">
              <CheckCircle2 size={16} />
              Task Completed
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function BacklogTaskCard({
  task,
  onFix,
}: {
  task: { floorName: string; roomName: string; step: FinishingStep };
  onFix: () => void;
}) {
  const isRejected = task.step.photoAuditStatus === 'REJECTED';
  
  return (
    <div className="overflow-hidden rounded-2xl border border-red-100 bg-red-50/30 p-4 transition-all hover:border-red-200">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-red-100 text-red-600 grid place-items-center">
            <AlertTriangle size={20} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-800">{task.step.name}</h4>
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">{task.floorName} · {task.roomName}</p>
          </div>
        </div>
        {isRejected && (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[9px] font-bold uppercase text-red-600">Rejected</span>
        )}
      </div>
      
      {isRejected && task.step.pauseReason && (
        <div className="mb-4 rounded-xl bg-white p-3 text-[10px] text-red-600 border border-red-100 italic leading-relaxed">
          <span className="font-bold not-italic mr-1">Reason:</span>
          "{task.step.pauseReason}"
        </div>
      )}

      <button
        onClick={onFix}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-red-500 py-3 text-xs font-bold uppercase tracking-widest text-white hover:bg-red-600 transition-all shadow-lg shadow-red-500/20 active:scale-[0.98]"
      >
        <Play size={14} />
        Resume & Fix
      </button>
    </div>
  );
}

function PauseReasonModal({
  step,
  otherTasks,
  onClose,
  onConfirm,
}: {
  step: FinishingStep;
  otherTasks: { floorName: string; roomName: string; step: FinishingStep }[];
  onClose: () => void;
  onConfirm: (reason: string, switchTaskId?: string) => void;
}) {
  const [selectedReason, setSelectedReason] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-3xl bg-white shadow-2xl dark:bg-slate-900 overflow-hidden">
        <div className="bg-slate-900 px-6 py-4 text-white">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold">Pause Work</h3>
            <button onClick={onClose} className="p-2 text-slate-400 hover:bg-white/10 rounded-full"><X size="20" /></button>
          </div>
        </div>

        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {!selectedReason ? (
            <div className="space-y-3">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Select Pause Reason</label>
              <div className="grid gap-2">
                {PAUSE_REASONS.map((reason) => (
                  <button
                    key={reason}
                    onClick={() => setSelectedReason(reason)}
                    className="w-full flex items-center justify-between p-4 rounded-2xl border border-slate-100 bg-slate-50 text-left text-sm font-bold text-slate-700 hover:border-brand-500 hover:bg-brand-50 transition-all"
                  >
                    {reason}
                    <ChevronRight size={16} className="text-slate-400" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6 animate-in slide-in-from-right-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Selected Reason</label>
                  <button onClick={() => setSelectedReason(null)} className="text-[10px] font-bold text-brand-500 uppercase">Change</button>
                </div>
                <div className="p-4 rounded-2xl bg-brand-50 border border-brand-100 text-sm font-bold text-brand-700">
                  {selectedReason}
                </div>
              </div>

              {otherTasks.length > 0 && (
                <div className="space-y-3">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Switch to another task?</label>
                  <div className="grid gap-2">
                    {otherTasks.map((t) => (
                      <button
                        key={t.step.id}
                        onClick={() => onConfirm(selectedReason, t.step.id)}
                        className="w-full flex items-center gap-3 p-4 rounded-2xl border border-slate-100 bg-slate-50 text-left hover:border-emerald-500 hover:bg-emerald-50 transition-all group"
                      >
                        <div className="h-8 w-8 rounded-lg bg-white border border-slate-200 grid place-items-center text-slate-400 group-hover:border-emerald-200 group-hover:text-emerald-500">
                          <Play size={14} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-700">{t.step.name}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase">{t.roomName}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={() => onConfirm(selectedReason)}
                className="w-full py-4 rounded-2xl bg-slate-900 text-white text-sm font-bold uppercase tracking-widest shadow-lg shadow-slate-900/20 hover:bg-slate-800 active:scale-[0.98] transition-all"
              >
                Just Pause Work
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MaterialConsumptionModal({
  step,
  roomSqft,
  onClose,
  onConfirm,
}: {
  step: FinishingStep;
  roomSqft?: number;
  onClose: () => void;
  onConfirm: (qty: number, area: number, photoUrl?: string) => void;
}) {
  const [qty, setQty] = useState('');
  const [area, setArea] = useState((step.stepSqft || roomSqft || 0).toString());
  const [photoUrl, setPhotoUrl] = useState<string>(step.afterPhotoUrl || '');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const unit = getMaterialUnit(step.name);
  
  const isSandingOrPutty = step.name.toLowerCase().includes('sanding') || step.name.toLowerCase().includes('putty');
  const isSandingOrCleaning = isSandingOrPutty || step.name.toLowerCase().includes('cleaning') || step.name.toLowerCase().includes('prep');
  const isOptional = unit === 'Pcs' || isSandingOrCleaning;
  const showMaterialField = !(isSandingOrCleaning && unit === 'Pcs' && step.name.toLowerCase().includes('cleaning'));
  
  const label = `Material Consumed (${unit})${isOptional ? ' [Optional]' : ''}`;
  const totalScope = step.stepSqft || roomSqft || 0;
  const isOverScope = Number(area) > totalScope;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const rawBase64 = reader.result as string;
      const compressed = await compressImageBase64(rawBase64, 800, 600, 0.65);
      setPhotoUrl(compressed);
    };
    reader.readAsDataURL(file);
  };

  const triggerCamera = () => {
    if (fileInputRef.current) {
      fileInputRef.current.setAttribute('capture', 'environment');
      fileInputRef.current.click();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 overflow-hidden">
        <div className="bg-slate-900 px-5 py-4 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500 text-white shadow-lg shadow-emerald-500/20">
                <ClipboardCheck size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold">Submit for Inspection</h3>
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">{step.name}</p>
              </div>
            </div>
            <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:bg-white/10">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-5 space-y-6">
          {/* 1. Photo Proof */}
          <div className="space-y-3">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Step 1: Photo Proof {isSandingOrPutty && '[Optional]'}</label>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
            
            {photoUrl ? (
              <div className="relative aspect-video overflow-hidden rounded-2xl border border-slate-200">
                <img src={photoUrl} alt="Proof" className="h-full w-full object-cover" />
                <button 
                  onClick={() => setPhotoUrl('')}
                  className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-slate-900/70 text-white hover:bg-slate-900"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <button 
                onClick={triggerCamera}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 py-8 text-slate-400 hover:bg-slate-100 transition-colors"
              >
                <Camera size={32} />
                <span className="text-xs font-bold uppercase tracking-wider">Take Completion Photo</span>
              </button>
            )}
          </div>

          {/* 2. Completion Area */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Step 2: Area Completed</label>
              <span className="text-[10px] font-bold text-brand-500">Target: {totalScope} sqft</span>
            </div>
            <div className="relative">
              <input
                type="number"
                value={area === '0' ? '' : area}
                onChange={(e) => setArea((parseInt(e.target.value) || 0).toString())}
                className={`w-full rounded-2xl border ${isOverScope ? 'border-amber-400 bg-amber-50/30' : 'border-slate-200 bg-white'} px-4 py-4 text-sm font-bold text-slate-800 outline-none transition-all focus:border-emerald-500`}
              />
              <span className="absolute right-4 top-4 text-xs font-bold text-slate-400">sqft</span>
            </div>
            {isOverScope && (
              <p className="flex items-center gap-1 text-[9px] font-bold text-amber-600 uppercase">
                <AlertTriangle size={10} />
                Warning: Exceeds target scope
              </p>
            )}
          </div>

          {/* 3. Material Consumption */}
          {showMaterialField && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Step 3: {label}</label>
                {step.brand && (
                  <span className="text-[10px] font-bold text-slate-400">{step.brand}</span>
                )}
              </div>
              <div className="relative">
                <input
                  type="number"
                  value={qty === '0' ? '' : qty}
                  onChange={(e) => setQty((parseInt(e.target.value) || 0).toString())}
                  placeholder={isOptional ? "0" : `Qty in ${unit}`}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm font-bold text-slate-800 outline-none transition-all focus:border-emerald-500"
                />
                <span className="absolute right-4 top-4 text-xs font-bold text-slate-400">{unit}</span>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 p-5 bg-slate-50">
          <button
            onClick={() => onConfirm(Number(qty) || 0, Number(area) || 0, photoUrl)}
            disabled={(!isSandingOrPutty && !photoUrl) || (!isOptional && (!qty || isNaN(Number(qty)) || Number(qty) <= 0)) || !area || isNaN(Number(area)) || Number(area) <= 0}
            className="w-full flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-4 text-sm font-bold uppercase tracking-widest text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-50 disabled:shadow-none"
          >
            <CheckCircle2 size={18} />
            Confirm & Submit
          </button>
        </div>
      </div>
    </div>
  );
}

function ClockInCard({
  clockState,
  elapsedMs,
  gpsVerified,
  siteLabel,
  onPunchIn,
  onBreak,
  onResume,
  onPunchOut,
}: {
  clockState: ClockState;
  elapsedMs: number;
  gpsVerified: boolean;
  siteLabel: string;
  onPunchIn: () => void;
  onBreak: () => void;
  onResume: () => void;
  onPunchOut: () => void;
}) {
  const isOut = clockState === 'CLOCKED_OUT';
  const isIn = clockState === 'CLOCKED_IN';
  const isBreak = clockState === 'ON_BREAK';

  const stateConfig = {
    CLOCKED_OUT: { label: 'Clocked Out', color: 'text-slate-500', bg: 'bg-slate-100 dark:bg-slate-800', dot: 'bg-slate-400' },
    CLOCKED_IN: { label: 'On The Clock', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10', dot: 'bg-emerald-500' },
    ON_BREAK: { label: 'On Break', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-500/10', dot: 'bg-amber-500' },
  };
  const cfg = stateConfig[clockState];

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className={`grid h-9 w-9 place-items-center rounded-lg ${cfg.bg} ${cfg.color}`}>
            <Timer size={18} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Attendance & Hours</h3>
            <div className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${cfg.dot} ${isIn || isBreak ? 'animate-pulse' : ''}`} />
              <p className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</p>
            </div>
          </div>
        </div>
        {gpsVerified && (isIn || isBreak) && (
          <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
            <MapPin size={11} />
            GPS Verified
          </span>
        )}
      </div>

      <div className="p-5">
        {/* Live timer */}
        <div className="mb-4 rounded-xl bg-slate-50 p-4 text-center dark:bg-slate-800/50">
          <p className="text-[10px] uppercase tracking-wider text-slate-400">Working Hours Today</p>
          <p className={`mt-1 font-mono text-3xl font-bold ${isOut ? 'text-slate-400' : 'text-slate-800 dark:text-slate-100'}`}>
            {isOut ? '--:--:--' : fmtDuration(elapsedMs)}
          </p>
        </div>

        {/* GPS site label */}
        {(isIn || isBreak) && (
          <div className={`mb-4 flex items-center justify-center gap-1.5 rounded-lg ${cfg.bg} py-2 text-xs font-medium ${cfg.color}`}>
            <MapPin size={13} />
            {gpsVerified ? `On-Site (${siteLabel} GPS Verified)` : `On-Site (${siteLabel})`}
          </div>
        )}

        {/* Action buttons */}
        {isOut && (
          <button
            onClick={onPunchIn}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3.5 text-sm font-bold text-white shadow-md shadow-emerald-500/20 transition-all hover:bg-emerald-600 active:scale-[0.98]"
          >
            <LogIn size={20} />
            PUNCH IN
          </button>
        )}
        {isIn && (
          <div className="flex gap-2">
            <button
              onClick={onBreak}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 py-3.5 text-sm font-bold text-amber-600 transition-all hover:bg-amber-100 active:scale-[0.98] dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400"
            >
              <Coffee size={18} />
              TAKE BREAK
            </button>
            <button
              onClick={onPunchOut}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-3.5 text-sm font-bold text-slate-600 transition-all hover:bg-slate-50 active:scale-[0.98] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              <LogOut size={18} />
              PUNCH OUT
            </button>
          </div>
        )}
        {isBreak && (
          <div className="flex gap-2">
            <button
              onClick={onResume}
              className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3.5 text-sm font-bold text-white shadow-md shadow-emerald-500/20 transition-all hover:bg-emerald-600 active:scale-[0.98]"
            >
              <Play size={18} />
              RESUME WORK
            </button>
            <button
              onClick={onPunchOut}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-3.5 text-sm font-bold text-slate-600 transition-all hover:bg-slate-50 active:scale-[0.98] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              <LogOut size={18} />
              PUNCH OUT
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function DailyTargetCard({
  target,
  project,
  onStatusChange,
  onCompleteRequest,
}: {
  target: DailyTarget;
  project: PaintProject;
  onStatusChange: (floorId: string, roomId: string, stepId: string, progressPct: number, status: TaskStatus, consumedQuantity?: number, areaCompleted?: number) => void;
  onCompleteRequest: (floorId: string, roomId: string, step: FinishingStep, roomSqft?: number) => void;
}) {
  const floor = project.floors?.find((f) => f.id === target.floorId);
  const room = floor?.rooms?.find((r) => r.id === target.roomId);
  const step = room?.finishingSteps?.find((s) => s.id === target.stepId);

  if (!floor || !room || !step) return null;

  const status = (target.status || step.status) as TaskStatus;
  const isCompleted = status === 'COMPLETED';
  const isInProgress = status === 'IN_PROGRESS';
  const isPaused = status === 'PAUSED';
  const isPendingInspection = status === 'PENDING_INSPECTION';
  const isPending = status === 'NOT_STARTED' || status === 'ASSIGNED' || status === 'PENDING' || !status;

  const statusConfig = {
    NOT_STARTED: { label: 'Not Started', color: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
    ASSIGNED: { label: 'Assigned', color: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400' },
    PENDING: { label: 'Pending', color: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
    IN_PROGRESS: { label: 'In Progress', color: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' },
    PAUSED: { label: 'Paused', color: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400' },
    PENDING_INSPECTION: { label: 'Pending Inspection', color: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400' },
    COMPLETED: { label: 'Completed', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400' },
  };

  const cfg = statusConfig[status as keyof typeof statusConfig] || statusConfig.NOT_STARTED;

  return (
    <div className="overflow-hidden rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-4 shadow-card dark:border-brand-500/30 dark:from-brand-500/10 dark:to-slate-900">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-500 text-white">
            <Target size={16} />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{step.name}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {floor.name} · {room.name}
            </p>
          </div>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${cfg.color}`}>
          {cfg.label}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-4 rounded-lg bg-white/60 p-3 dark:bg-slate-800/50">
        <div className="flex items-center gap-1.5">
          <Ruler size={14} className="text-brand-500" />
          <span className="text-xs text-slate-500 dark:text-slate-400">Target:</span>
          <span className="text-sm font-bold text-brand-600 dark:text-brand-400">{target.targetSqft} sqft</span>
        </div>
        {step.brand && (
          <div className="flex items-center gap-1.5">
            <Brush size={14} className="text-slate-400" />
            <span className="text-xs text-slate-500 dark:text-slate-400">{step.brand}</span>
          </div>
        )}
      </div>

      <div className="mt-3">
        {(isPending || isPaused) && (
          <button
            onClick={() => {
              onStatusChange(target.floorId, target.roomId, target.stepId, 10, 'IN_PROGRESS');
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-3 text-sm font-bold text-white shadow-md shadow-brand-500/20 transition-all hover:bg-brand-600 active:scale-[0.98]"
          >
            <Play size={18} />
            {isPaused ? 'RESUME WORK' : 'START WORK'}
          </button>
        )}
        {isInProgress && (
          <div className="flex gap-2">
            <button
              onClick={() => onStatusChange(target.floorId, target.roomId, target.stepId, 0, 'PAUSED')}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-3 text-sm font-bold text-slate-600 transition-all hover:bg-slate-50 active:scale-[0.98] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              <Pause size={16} />
              PAUSE WORK
            </button>
            <button
              onClick={() => {
                const isExteriorRoom = floor.isExterior || floor.id === 'floor-exterior' || Boolean(room.isExterior);
                onCompleteRequest(target.floorId, target.roomId, step, isExteriorRoom ? (room.exteriorSqft ?? room.totalSqft ?? room.interiorSqft) : (room.interiorSqft ?? room.totalSqft));
              }}
              className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-bold text-white shadow-md shadow-emerald-500/20 transition-all hover:bg-emerald-600 active:scale-[0.98]"
            >
              <CheckCircle2 size={18} />
              COMPLETE TASK
            </button>
          </div>
        )}
        {isPendingInspection && (
          <div className="flex items-center justify-center gap-2 rounded-xl bg-blue-50 py-3 text-sm font-bold text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
            <Timer size={18} />
            PENDING INSPECTION
          </div>
        )}
        {isCompleted && (
          <div className="flex items-center justify-center gap-2 rounded-xl bg-emerald-50 py-3 text-sm font-bold text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
            <CheckCircle2 size={18} />
            TARGET COMPLETED
          </div>
        )}
      </div>
    </div>
  );
}

function PainterTaskCard({
  step,
  roomName,
  roomInteriorSqft,
  floorId,
  roomId,
  onStatusChange,
  onPhotoClick,
  onCompleteRequest,
}: {
  step: FinishingStep;
  roomName: string;
  roomInteriorSqft?: number;
  floorId: string;
  roomId: string;
  onStatusChange: (floorId: string, roomId: string, stepId: string, progressPct: number, status: TaskStatus, consumedQuantity?: number, areaCompleted?: number) => void;
  onPhotoClick: (type: 'before' | 'after') => void;
  onCompleteRequest: (floorId: string, roomId: string, step: FinishingStep, roomSqft?: number) => void;
}) {
  const status = step.status || 'NOT_STARTED';
  const isPending = status === 'NOT_STARTED' || status === 'ASSIGNED' || status === 'PENDING';
  const isInProgress = status === 'IN_PROGRESS';
  const isPaused = status === 'PAUSED';
  const isPendingInspection = status === 'PENDING_INSPECTION';
  const isCompleted = status === 'COMPLETED';

  const statusConfig = {
    NOT_STARTED: { label: 'Not Started', color: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300', icon: null },
    ASSIGNED: { label: 'Assigned', color: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400', icon: null },
    PENDING: { label: 'Pending', color: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300', icon: null },
    IN_PROGRESS: { label: 'In Progress', color: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400', icon: <Play size={12} className="animate-pulse" /> },
    PAUSED: { label: 'Paused', color: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400', icon: <Pause size={12} /> },
    PENDING_INSPECTION: { label: 'Pending Inspection', color: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400', icon: <Timer size={12} /> },
    COMPLETED: { label: 'Done', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400', icon: <CheckCircle2 size={12} /> },
  };

  const cfg = statusConfig[status as keyof typeof statusConfig] || statusConfig.NOT_STARTED;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700/70 dark:bg-slate-800/30">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className={`grid h-9 w-9 place-items-center rounded-lg ${stepIconClass(step.name)}`}>
            <Brush size={16} />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{step.name}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{roomName}</p>
          </div>
        </div>
        <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${cfg.color}`}>
          {cfg.icon}
          {cfg.label}
        </span>
      </div>

      <div className="mt-2.5 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
        <span>{step.surface}</span>
        {step.stepSqft != null && (
          <>
            <span className="text-slate-300 dark:text-slate-600">|</span>
            <span className="flex items-center gap-1">
              <Ruler size={12} />
              {step.stepSqft} sqft
            </span>
          </>
        )}
        {roomInteriorSqft != null && (
          <>
            <span className="text-slate-300 dark:text-slate-600">|</span>
            <span>Room: {roomInteriorSqft.toLocaleString()} sqft</span>
          </>
        )}
      </div>

      {step.brand && (
        <div className="mt-2 flex items-center gap-1.5 text-xs">
          <span className="rounded-md bg-brand-50 px-1.5 py-0.5 font-medium text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
            {step.brand}
          </span>
          {step.productLine && (
            <span className="text-slate-500 dark:text-slate-400">{step.productLine}</span>
          )}
        </div>
      )}

      {step.qaVerified && (
        <div className="mt-2 inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
          <ClipboardCheck size={11} />
          QA Verified
        </div>
      )}

      {/* Photo previews */}
      {(step?.beforePhotoUrl || step?.afterPhotoUrl || step?.beforePhoto || step?.afterPhoto || step?.completionPhoto) && (
        <div className="mt-3 flex gap-2">
          {(step?.beforePhotoUrl || step?.beforePhoto) && (
            <div className="relative flex-1 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
              <img src={step?.beforePhoto || step?.beforePhotoUrl} alt="Before" className="h-20 w-full object-cover" />
              <span className="absolute bottom-0 left-0 bg-slate-900/70 px-1.5 py-0.5 text-[9px] font-medium text-white">Before</span>
            </div>
          )}
          {(step?.afterPhotoUrl || step?.afterPhoto || step?.completionPhoto) && (
            <div className="relative flex-1 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
              <img src={step?.afterPhoto || step?.completionPhoto || step?.afterPhotoUrl} alt="After" className="h-20 w-full object-cover" />
              <span className="absolute bottom-0 left-0 bg-slate-900/70 px-1.5 py-0.5 text-[9px] font-medium text-white">After</span>
            </div>
          )}
        </div>
      )}

      <div className="mt-3.5">
        {(isPending || isPaused) && (
          <button
            onClick={() => {
              onStatusChange(floorId, roomId, step.id, 10, 'IN_PROGRESS');
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-3 text-sm font-bold text-white shadow-md shadow-brand-500/20 transition-all hover:bg-brand-600 active:scale-[0.98]"
          >
            <Play size={18} />
            {isPaused ? 'RESUME WORK' : 'START WORK'}
          </button>
        )}
        {isInProgress && (
          <div className="flex gap-2">
            <button
              onClick={() => onStatusChange(floorId, roomId, step.id, 0, 'PAUSED')}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-3 text-sm font-bold text-slate-600 transition-all hover:bg-slate-50 active:scale-[0.98] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              <Pause size={16} />
              PAUSE WORK
            </button>
            <button
              onClick={() => {
                onCompleteRequest(floorId, roomId, step, roomInteriorSqft);
              }}
              className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-bold text-white shadow-md shadow-emerald-500/20 transition-all hover:bg-emerald-600 active:scale-[0.98]"
            >
              <CheckCircle2 size={18} />
              COMPLETE TASK
            </button>
          </div>
        )}
        {isPendingInspection && (
          <div className="flex items-center justify-center gap-2 rounded-xl bg-blue-50 py-3 text-sm font-bold text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
            <Timer size={18} />
            PENDING INSPECTION
          </div>
        )}
        {isCompleted && (
          <div className="flex items-center justify-center gap-2 rounded-xl bg-emerald-50 py-3 text-sm font-bold text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
            <CheckCircle2 size={18} />
            TASK COMPLETED
          </div>
        )}
      </div>

      <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        <PhotoButton label="Before" url={step?.beforePhoto || step?.beforePhotoUrl} onClick={() => onPhotoClick('before')} />
        <PhotoButton label="After" url={step?.afterPhoto || step?.completionPhoto || step?.afterPhotoUrl} onClick={() => onPhotoClick('after')} />
      </div>
    </div>
  );
}

function PhotoButton({ label, url, onClick }: { label: string; url?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
    >
      <Camera size={13} className={url ? 'text-emerald-500' : 'text-slate-400'} />
      {label}
      {url && <CheckCircle2 size={11} className="text-emerald-500" />}
    </button>
  );
}

function PhotoUploadModal({
  step,
  type,
  currentUrl,
  onClose,
  onConfirm,
}: {
  step: FinishingStep;
  type: 'before' | 'after';
  currentUrl: string;
  onClose: () => void;
  onConfirm: (url: string) => void;
}) {
  const [preview, setPreview] = useState<string>(currentUrl);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be under 10MB.');
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = async () => {
      const rawBase64 = reader.result as string;
      const compressed = await compressImageBase64(rawBase64, 800, 600, 0.65);
      setPreview(compressed);
    };
    reader.readAsDataURL(file);
  };

  const triggerCamera = () => {
    if (fileInputRef.current) {
      fileInputRef.current.setAttribute('capture', 'environment');
      fileInputRef.current.click();
    }
  };

  const triggerFilePicker = () => {
    if (fileInputRef.current) {
      fileInputRef.current.removeAttribute('capture');
      fileInputRef.current.click();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
              <Camera size={18} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{type === 'before' ? 'Before' : 'After'} Photo</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">{step.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X size={18} />
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />
        <div className="space-y-3 px-5 py-5">
          {/* Preview */}
          {preview ? (
            <div className="relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
              <img src={preview} alt="Preview" className="h-48 w-full object-cover" />
              <button
                onClick={() => { setPreview(''); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-slate-900/70 text-white transition-colors hover:bg-slate-900"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <div className="grid h-48 place-items-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50">
              <div className="text-center">
                <Camera size={32} className="mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                <p className="text-xs text-slate-400">No photo selected</p>
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-500">{error}</p>
          )}

          {/* Upload buttons */}
          <div className="flex gap-2">
            <button
              onClick={triggerFilePicker}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white py-2.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <Camera size={14} />
              Choose File
            </button>
            <button
              onClick={triggerCamera}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-500 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-brand-600"
            >
              <Camera size={14} />
              Take Photo
            </button>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4 dark:border-slate-800">
          <button onClick={onClose} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(preview)}
            disabled={!preview}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-brand-500/20 hover:bg-brand-600 active:scale-[0.98] disabled:opacity-50"
          >
            Save Photo
          </button>
        </div>
      </div>
    </div>
  );
}
