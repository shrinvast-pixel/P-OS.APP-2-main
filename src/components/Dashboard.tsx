import { useMemo, useState } from 'react';
import type {
  PaintProject,
  Supervisor,
  DailyLog,
  TaskStatus,
  QaRecord,
  Painter,
  VendorOrder,
  Vendor,
  DailyTarget,
  OrderStatus,
  ClockState,
  FinishingStep,
  SupervisorSession,
  SupervisorActivityLog,
  SupervisorActivityType,
  SupervisorSessionState,
} from '@/types';
import { TopBar, type Role } from './TopBar';
import { Tabs, type TabId } from './Tabs';
import { OverviewTab } from './OverviewTab';
import { TasksTab } from './TasksTab';
import { BomTab } from './BomTab';
import { VendorOrdersTab } from './VendorOrdersTab';
import { SupervisorsTab } from './SupervisorsTab';
import { InspectionsTab } from './InspectionsTab';
import { SupervisorPortal } from './SupervisorPortal';
import { PainterPortal } from './PainterPortal';
import type { DailyLogForm } from './DailyLogModal';
import type { QaForm } from './QaInspectionModal';
import type { VendorOrderForm } from './VendorOrderModal';
import { genId, todayISO, getStepArea, ensureExteriorFloor } from '@/utils';

interface DashboardProps {
  projects: PaintProject[];
  onProjectsChange: (projects: PaintProject[]) => void;
}

export function Dashboard({ projects, onProjectsChange }: DashboardProps) {
  const [activeProjectId, setActiveProjectId] = useState<string>(
    () => projects[0]?.id ?? '',
  );
  const [tab, setTab] = useState<TabId>('overview');
  const [role, setRole] = useState<Role>('admin');
  const [activeSupervisorId, setActiveSupervisorId] = useState<string>('');
  const [activePainterId, setActivePainterId] = useState<string>('');

  const localProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? projects[0],
    [projects, activeProjectId],
  );

  if (!localProject) {
    return (
      <div className="grid min-h-screen place-items-center text-slate-500">
        No projects available.
      </div>
    );
  }

  const updateProject = (updater: (prev: PaintProject) => PaintProject) => {
    onProjectsChange(
      projects.map((p) => (p.id === localProject.id ? updater(p) : p)),
    );
  };

  const supervisors: Supervisor[] = localProject.supervisors ?? [];
  const painters: Painter[] = localProject.painters ?? [];

  const activeSupervisor =
    supervisors.find((s) => s.id === activeSupervisorId) ??
    supervisors.find((s) => s.id === localProject.leadSupervisorId) ??
    null;

  const activePainter =
    painters.find((p) => p.id === activePainterId) ?? painters[0] ?? null;

  /* ---------------- Supervisor audit trail helpers ---------------- */

  /**
   * Append a supervisor activity entry and refresh the supervisor's
   * "last active" heartbeat so Admin can track presence + activity logs.
   */
  const withSupervisorActivity = (
    prev: PaintProject,
    type: SupervisorActivityType,
    detail: string,
    supervisorOverride?: { id: string; name: string },
  ): PaintProject => {
    const actor =
      supervisorOverride ??
      (activeSupervisor ? { id: activeSupervisor.id, name: activeSupervisor.name } : null);
    if (!actor) return prev;
    const now = Date.now();
    const entry: SupervisorActivityLog = {
      id: genId('act'),
      supervisorId: actor.id,
      supervisorName: actor.name,
      type,
      detail,
      at: now,
      date: todayISO(),
    };
    return {
      ...prev,
      supervisorActivity: [...(prev.supervisorActivity ?? []), entry],
      supervisors: (prev.supervisors ?? []).map((s) =>
        s.id !== actor.id ? s : { ...s, lastActiveAt: now },
      ),
      supervisorSessions: (prev.supervisorSessions ?? []).map((sess) =>
        sess.supervisorId === actor.id && !sess.logoutAt
          ? { ...sess, actionCount: (sess.actionCount ?? 0) + 1 }
          : sess,
      ),
    };
  };

  /** Resolve a human readable "Floor — Room · Step" label for audit entries. */
  const describeStep = (floorId: string, roomId: string, stepId: string): string => {
    const floor = localProject.floors?.find((f) => f.id === floorId);
    const room = floor?.rooms?.find((r) => r.id === roomId);
    const step = room?.finishingSteps?.find((s) => s.id === stepId);
    return `${floor?.name ?? 'Floor'} — ${room?.name ?? 'Room'} · ${step?.name ?? 'Step'}`;
  };

  const handleSupervisorSessionChange = (
    supervisorId: string,
    state: SupervisorSessionState,
  ) => {
    const supervisor = supervisors.find((s) => s.id === supervisorId);
    if (!supervisor) return;
    const now = Date.now();

    updateProject((prev) => {
      const prevSup = (prev.supervisors ?? []).find((s) => s.id === supervisorId);
      const sessions = [...(prev.supervisorSessions ?? [])];

      if (state === 'LOGGED_IN') {
        const alreadyOpen = sessions.some((s) => s.supervisorId === supervisorId && !s.logoutAt);
        if (!alreadyOpen) {
          sessions.push({
            id: genId('sess'),
            supervisorId,
            supervisorName: supervisor.name,
            loginAt: now,
            date: todayISO(),
            siteLabel: prev.customerDetails?.address ?? prev.projectDetails?.name,
            actionCount: 0,
          });
        }
      } else {
        const openIdx = sessions.findIndex((s) => s.supervisorId === supervisorId && !s.logoutAt);
        if (openIdx !== -1) {
          const open = sessions[openIdx];
          sessions[openIdx] = { ...open, logoutAt: now, durationMs: now - open.loginAt };
        }
      }

      const next: PaintProject = {
        ...prev,
        supervisorSessions: sessions,
        supervisors: (prev.supervisors ?? []).map((s) =>
          s.id !== supervisorId
            ? s
            : state === 'LOGGED_IN'
              ? {
                  ...s,
                  sessionState: 'LOGGED_IN',
                  loginAt: now,
                  logoutAt: undefined,
                  lastActiveAt: now,
                  siteLabel: prev.customerDetails?.address ?? s.siteLabel,
                }
              : {
                  ...s,
                  sessionState: 'LOGGED_OUT',
                  logoutAt: now,
                  lastActiveAt: now,
                  totalSessionMs:
                    (s.totalSessionMs ?? 0) + (prevSup?.loginAt ? now - prevSup.loginAt : 0),
                },
        ),
      };

      return withSupervisorActivity(
        next,
        state === 'LOGGED_IN' ? 'LOGIN' : 'LOGOUT',
        state === 'LOGGED_IN' ? 'Logged in / checked in on site' : 'Logged out / ended site shift',
        { id: supervisorId, name: supervisor.name },
      );
    });
  };

  const handleRoleChange = (r: Role) => {
    setRole(r);
    if (r === 'supervisor') {
      const supId = activeSupervisorId || localProject.leadSupervisorId || supervisors[0]?.id || '';
      if (supId) setActiveSupervisorId(supId);
    }
    if (r === 'painter' && !activePainterId && painters.length > 0) {
      setActivePainterId(painters[0].id);
    }
  };

  const handleUpdateTaskStep = (
    floorId: string,
    roomId: string,
    stepId: string,
    updates: Partial<FinishingStep>,
  ) => {
    const label = describeStep(floorId, roomId, stepId);
    updateProject((prev) => {
      const next: PaintProject = {
        ...prev,
        floors: prev.floors.map((floor) =>
          floor.id !== floorId
            ? floor
            : {
                ...floor,
                rooms: floor.rooms.map((room) =>
                  room.id !== roomId
                    ? room
                    : {
                        ...room,
                        finishingSteps: room.finishingSteps.map((step) =>
                          step.id !== stepId ? step : { ...step, ...updates },
                        ),
                      },
                ),
              },
        ),
      };
      if (updates.scheduledDate) {
        return withSupervisorActivity(
          next,
          'SCHEDULE_UPDATE',
          `Scheduled ${label} for ${updates.scheduledDate}`,
        );
      }
      return next;
    });
  };

  const handleTaskProgress = (
    floorId: string,
    roomId: string,
    stepId: string,
    progressPct: number,
    status: TaskStatus,
    consumedQuantity?: number,
    areaCompleted?: number,
    pauseReason?: string,
  ) => {
    updateProject((prev) => ({
      ...prev,
      floors: prev.floors.map((floor) =>
        floor.id !== floorId
          ? floor
          : {
              ...floor,
              rooms: floor.rooms.map((room) =>
                room.id !== roomId
                  ? room
                  : {
                      ...room,
                      finishingSteps: room.finishingSteps.map((step) =>
                        step.id !== stepId
                          ? step
                          : {
                              ...step,
                              progressPct,
                              status,
                              consumedQuantity: consumedQuantity ?? step.consumedQuantity,
                              areaCompleted: areaCompleted ?? step.areaCompleted,
                              completedSqft: areaCompleted ?? step.completedSqft,
                              pauseReason: pauseReason || undefined,
                              photoAuditStatus: status === 'PENDING_INSPECTION' ? 'PENDING_REVIEW' : (status === 'IN_PROGRESS' ? undefined : step.photoAuditStatus),
                              // Painter picked the work back up → the rework flag is cleared.
                              reworkRequestedAt:
                                status === 'IN_PROGRESS' || status === 'PENDING_INSPECTION'
                                  ? undefined
                                  : step.reworkRequestedAt,
                              startedAt:
                                status === 'IN_PROGRESS' ? (step.startedAt ?? Date.now()) : step.startedAt,
                              afterPhotoAt: status === 'PENDING_INSPECTION' ? (step.afterPhotoAt ?? Date.now()) : step.afterPhotoAt,
                              // Ensure photo string references across all alias properties are preserved during state updates
                              beforePhoto: step.beforePhoto || step.beforePhotoUrl,
                              beforePhotoUrl: step.beforePhotoUrl || step.beforePhoto,
                              afterPhoto: step.afterPhoto || step.completionPhoto || step.afterPhotoUrl,
                              afterPhotoUrl: step.afterPhotoUrl || step.afterPhoto || step.completionPhoto,
                              completionPhoto: step.completionPhoto || step.afterPhoto || step.afterPhotoUrl,
                              proofPhotos: (step.proofPhotos && step.proofPhotos.length > 0)
                                ? step.proofPhotos
                                : Array.from(new Set([step.afterPhoto, step.completionPhoto, step.afterPhotoUrl, step.beforePhoto, step.beforePhotoUrl].filter(Boolean) as string[])),
                            },
                      ),
                    },
              ),
            },
      ),
      // Keep daily target KPIs (target vs actual) in sync with painter progress.
      dailyTargets: (prev.dailyTargets ?? []).map((t) => {
        if (t.stepId !== stepId) return t;
        if (status === 'COMPLETED' || status === 'PENDING_INSPECTION') {
          return {
            ...t,
            achievedSqft: areaCompleted ?? t.achievedSqft,
            status: status === 'COMPLETED' ? ('COMPLETED' as const) : ('IN_PROGRESS' as const),
          };
        }
        if (status === 'IN_PROGRESS') return { ...t, status: 'IN_PROGRESS' as const };
        return t;
      }),
    }));
  };

  /**
   * Supervisor assigns painters to a step.
   *
   * Status mapping is what the Painter Portal keys off, so an assignment must
   * always land the step in an actionable "today" state (ASSIGNED) and stamp
   * assignedAt + a schedule date. Newly assigned work must NEVER look like
   * pending rework — only an explicit rejection does that.
   */
  const handlePainterAssign = (
    floorId: string,
    roomId: string,
    stepId: string,
    painterIds: string[],
  ) => {
    const label = describeStep(floorId, roomId, stepId);
    const painterNames = painterIds
      .map((id) => painters.find((p) => p.id === id)?.name ?? id)
      .join(', ');

    updateProject((prev) => {
      const next: PaintProject = {
        ...prev,
        floors: prev.floors.map((floor) =>
          floor.id !== floorId
            ? floor
            : {
                ...floor,
                rooms: floor.rooms.map((room) =>
                  room.id !== roomId
                    ? room
                    : {
                        ...room,
                        finishingSteps: room.finishingSteps.map((step) => {
                          if (step.id !== stepId) return step;

                          const isAssigning = painterIds.length > 0;
                          const added = painterIds.some((id) => !(step.painterIds ?? []).includes(id));

                          if (!isAssigning) {
                            // Fully unassigned → back to the unscheduled pool.
                            return {
                              ...step,
                              painterIds: [],
                              status:
                                step.status === 'ASSIGNED' ? ('NOT_STARTED' as TaskStatus) : step.status,
                              assignedAt: undefined,
                              assignedBy: undefined,
                            };
                          }

                          const isFresh =
                            step.status === 'NOT_STARTED' ||
                            step.status === 'PENDING' ||
                            !step.status;

                          return {
                            ...step,
                            painterIds,
                            status: isFresh ? ('ASSIGNED' as TaskStatus) : step.status,
                            progressPct: isFresh ? Math.max(step.progressPct ?? 0, 5) : step.progressPct,
                            assignedAt: added ? Date.now() : (step.assignedAt ?? Date.now()),
                            assignedBy: activeSupervisor?.name ?? step.assignedBy,
                            // Make the task actionable today unless the supervisor
                            // deliberately scheduled it for a future date.
                            scheduledDate: step.scheduledDate ?? todayISO(),
                          };
                        }),
                      },
                ),
              },
        ),
      };

      return withSupervisorActivity(
        next,
        'ASSIGN_PAINTER',
        painterIds.length > 0
          ? `Assigned ${painterNames} to ${label}`
          : `Removed all painters from ${label}`,
      );
    });
  };

  const handleQaApprove = (
    floorId: string,
    roomId: string,
    stepId: string,
    form: QaForm,
  ) => {
    const approver = activeSupervisor?.name ?? 'Supervisor';
    const label = describeStep(floorId, roomId, stepId);
    const record: QaRecord = {
      id: genId('qa'),
      stepId,
      floorId,
      roomId,
      checklist: form.checklist,
      beforePhotoUrl: form.beforePhotoUrl || undefined,
      afterPhotoUrl: form.afterPhotoUrl || undefined,
      proofPhotos: form.proofPhotos,
      approvedBy: approver,
      approvedAt: new Date().toISOString(),
    };
    updateProject((prev) => {
      const now = Date.now();
      const next: PaintProject = {
        ...prev,
        floors: prev.floors.map((floor) =>
          floor.id !== floorId
            ? floor
            : {
                ...floor,
                rooms: floor.rooms.map((room) =>
                  room.id !== roomId
                    ? room
                    : {
                        ...room,
                        finishingSteps: room.finishingSteps.map((step) =>
                          step.id !== stepId
                            ? step
                            : {
                                ...step,
                                progressPct: 100,
                                status: 'COMPLETED' as TaskStatus,
                                qaVerified: true,
                                photoAuditStatus: 'APPROVED' as const,
                                approvedBy: approver,
                                approvedAt: now,
                                completedAt: now,
                                afterPhotoAt: step.afterPhotoAt ?? now,
                                areaCompleted:
                                  step.areaCompleted ?? step.completedSqft ?? getStepArea(step, room),
                                completedSqft:
                                  step.completedSqft ?? step.areaCompleted ?? getStepArea(step, room),
                                beforePhotoUrl: form.beforePhotoUrl || step.beforePhotoUrl,
                                afterPhotoUrl: form.afterPhotoUrl || step.afterPhotoUrl,
                                proofPhotos: Array.from(
                                  new Set([...(step.proofPhotos ?? []), ...(form.proofPhotos ?? [])]),
                                ),
                              },
                        ),
                      },
                ),
              },
        ),
        qaRecords: [...(prev.qaRecords ?? []), record],
        dailyTargets: (prev.dailyTargets ?? []).map((t) =>
          t.stepId !== stepId ? t : { ...t, status: 'COMPLETED' as const },
        ),
      };
      return withSupervisorActivity(next, 'QA_SIGNOFF', `QA signed off & approved ${label}`);
    });
  };

  const handlePainterPhotoUpload = (
    floorId: string,
    roomId: string,
    stepId: string,
    type: 'before' | 'after',
    url: string,
  ) => {
    updateProject((prev) => ({
      ...prev,
      floors: prev.floors.map((floor) =>
        floor.id !== floorId
          ? floor
          : {
              ...floor,
              rooms: floor.rooms.map((room) =>
                room.id !== roomId
                  ? room
                  : {
                      ...room,
                      finishingSteps: room.finishingSteps.map((step) =>
                        step.id !== stepId
                          ? step
                          : {
                              ...step,
                              ...(type === 'before'
                                ? {
                                    beforePhotoUrl: url || step.beforePhotoUrl,
                                    beforePhoto: url || step.beforePhoto,
                                    beforePhotoAt: Date.now(),
                                  }
                                : {
                                    afterPhotoUrl: url || step.afterPhotoUrl,
                                    afterPhoto: url || step.afterPhoto,
                                    completionPhoto: url || step.completionPhoto,
                                    afterPhotoAt: Date.now(),
                                  }),
                              proofPhotos: url
                                ? Array.from(new Set([...(step.proofPhotos ?? []), url]))
                                : step.proofPhotos,
                              photoGpsVerified: true,
                              photoAuditStatus: 'PENDING_REVIEW' as const,
                              // If they upload a 'before' photo, move from NOT_STARTED/ASSIGNED to IN_PROGRESS
                              // If they upload an 'after' photo, keep as IN_PROGRESS until supervisor approves
                              status: type === 'before' && (step.status === 'NOT_STARTED' || step.status === 'ASSIGNED') ? 'IN_PROGRESS' : step.status,
                              progressPct: type === 'before' && (step.status === 'NOT_STARTED' || step.status === 'ASSIGNED') ? 10 : step.progressPct,
                            },
                      ),
                    },
              ),
            },
      ),
    }));
  };

  const handleSupervisorPhotoUpdate = (
    floorId: string,
    roomId: string,
    stepId: string,
    url: string,
    type: 'before' | 'after',
  ) => {
    updateProject((prev) => ({
      ...prev,
      floors: prev.floors.map((floor) =>
        floor.id !== floorId
          ? floor
          : {
              ...floor,
              rooms: floor.rooms.map((room) =>
                room.id !== roomId
                  ? room
                  : {
                      ...room,
                      finishingSteps: room.finishingSteps.map((step) =>
                        step.id !== stepId
                          ? step
                          : {
                              ...step,
                              [type === 'before' ? 'beforePhotoUrl' : 'afterPhotoUrl']: url || undefined,
                              [type === 'before' ? 'beforePhotoAt' : 'afterPhotoAt']: Date.now(),
                              proofPhotos: [...(step.proofPhotos ?? []), url],
                            },
                      ),
                    },
              ),
            },
      ),
    }));
  };

  const handlePlaceVendorOrder = (form: VendorOrderForm) => {
    const order: VendorOrder = {
      id: genId('vord'),
      materialId: form.materialId,
      materialName: form.materialName,
      vendorName: form.vendorName,
      orderQty: form.orderQty,
      unit: form.unit,
      status: 'ORDERED',
      orderedAt: new Date().toISOString(),
      notes: form.notes || undefined,
    };
    updateProject((prev) => ({
      ...prev,
      vendorOrders: [...(prev.vendorOrders ?? []), order],
      materialBillOfQuantities: prev.materialBillOfQuantities.map((m) =>
        m.id !== form.materialId
          ? m
          : {
              ...m,
              orderedQty: (m.orderedQty ?? 0) + form.orderQty,
              orderStatus: 'ORDERED' as OrderStatus,
              vendorName: form.vendorName,
            },
      ),
    }));
  };

  const handleMarkDelivered = (materialId: string, deliveredQty: number) => {
    updateProject((prev) => ({
      ...prev,
      materialBillOfQuantities: prev.materialBillOfQuantities.map((m) =>
        m.id !== materialId
          ? m
          : {
              ...m,
              deliveredQty: (m.deliveredQty ?? 0) + deliveredQty,
              orderStatus: 'DELIVERED_AT_SITE' as OrderStatus,
            },
      ),
      vendorOrders: (prev.vendorOrders ?? []).map((o) =>
        o.materialId !== materialId
          ? o
          : {
              ...o,
              status: 'DELIVERED_AT_SITE' as OrderStatus,
              deliveredAt: new Date().toISOString(),
            },
      ),
    }));
  };

  const handleSubmitDailyLog = (
    form: DailyLogForm,
    supervisorId: string,
    supervisorName: string,
  ) => {
    const log: DailyLog = {
      id: genId('log'),
      supervisorId,
      supervisorName,
      date: form.date,
      attendanceCount: form.attendanceCount,
      notes: form.notes || undefined,
      issues: form.issues || undefined,
      consumption: form.consumption,
      submittedAt: new Date().toISOString(),
    };
    updateProject((prev) =>
      withSupervisorActivity(
        { ...prev, dailyLogs: [...(prev.dailyLogs ?? []), log] },
        'DAILY_LOG',
        `Submitted daily site log for ${form.date} (${form.attendanceCount} present)`,
        { id: supervisorId, name: supervisorName },
      ),
    );
  };

  const handleAssignDailyTarget = (
    painterId: string,
    floorId: string,
    roomId: string,
    stepId: string,
    targetSqft: number,
    targetHours?: number,
  ) => {
    const label = describeStep(floorId, roomId, stepId);
    const painterName = painters.find((p) => p.id === painterId)?.name ?? painterId;
    const target: DailyTarget = {
      id: genId('tgt'),
      painterId,
      floorId,
      roomId,
      stepId,
      targetSqft,
      targetHours,
      date: todayISO(),
      status: 'ASSIGNED',
      assignedAt: Date.now(),
      assignedBy: activeSupervisor?.name,
    };
    updateProject((prev) => {
      const next: PaintProject = {
        ...prev,
        dailyTargets: [...(prev.dailyTargets ?? []), target],
        floors: prev.floors.map((floor) =>
          floor.id !== floorId
            ? floor
            : {
                ...floor,
                rooms: floor.rooms.map((room) =>
                  room.id !== roomId
                    ? room
                    : {
                        ...room,
                        finishingSteps: room.finishingSteps.map((step) =>
                          step.id !== stepId
                            ? step
                            : {
                                ...step,
                                painterIds: [...new Set([...(step.painterIds ?? []), painterId])],
                                status:
                                  step.status === 'NOT_STARTED' || step.status === 'PENDING' || !step.status
                                    ? ('ASSIGNED' as TaskStatus)
                                    : step.status,
                                assignedAt: step.assignedAt ?? Date.now(),
                                assignedBy: activeSupervisor?.name ?? step.assignedBy,
                                targetSqft: targetSqft > 0 ? targetSqft : step.targetSqft,
                                targetHours: targetHours ?? step.targetHours,
                                // Allocated for today → make it today's agenda item.
                                scheduledDate: todayISO(),
                              },
                        ),
                      },
                ),
              },
        ),
      };
      return withSupervisorActivity(
        next,
        'ALLOCATE_TARGET',
        `Allocated ${targetSqft} sqft target to ${painterName} — ${label}`,
      );
    });
  };

  const handleTogglePainterCheckIn = (painterId: string) => {
    updateProject((prev) => ({
      ...prev,
      painters: (prev.painters ?? []).map((p) =>
        p.id !== painterId ? p : { ...p, checkedIn: !p.checkedIn },
      ),
    }));
  };

  const handleClockChange = (painterId: string, state: ClockState) => {
    updateProject((prev) => ({
      ...prev,
      painters: (prev.painters ?? []).map((p) => {
        if (p.id !== painterId) return p;
        const now = Date.now();
        const totalBreak = p.totalBreakMs ?? 0;
        if (state === 'CLOCKED_IN') {
          if (p.clockState === 'ON_BREAK' && p.breakStartAt) {
            return { ...p, clockState: state, totalBreakMs: totalBreak + (now - p.breakStartAt), breakStartAt: undefined, checkedIn: true };
          }
          return { ...p, clockState: state, clockInAt: now, clockOutAt: undefined, breakStartAt: undefined, gpsVerified: true, siteLabel: 'Koramangala Site', checkedIn: true };
        }
        if (state === 'ON_BREAK') {
          return { ...p, clockState: state, breakStartAt: now };
        }
        return { ...p, clockState: state, clockOutAt: now, breakStartAt: undefined, checkedIn: false };
      }),
    }));
  };

  const handleSetLeadSupervisor = (supervisorId: string) => {
    updateProject((prev) => ({
      ...prev,
      leadSupervisorId: supervisorId,
    }));
  };

  const handleUpdateProjectDetails = (updates: Partial<PaintProject['projectDetails']>) => {
    updateProject((prev) => ({
      ...prev,
      projectDetails: { ...prev.projectDetails, ...updates },
    }));
  };

  const handleAddVendor = (vendor: Vendor) => {
    updateProject((prev) => ({
      ...prev,
      vendors: [...(prev.vendors ?? []), vendor],
    }));
  };

  /**
   * Supervisor photo audit decision.
   * Approve → COMPLETED + approval trail. Reject → the ONLY path that flags a
   * task as rework for the Painter Portal.
   */
  const handlePhotoAudit = (
    floorId: string,
    roomId: string,
    stepId: string,
    approved: boolean,
    reason?: string,
  ) => {
    const approver = activeSupervisor?.name ?? 'Supervisor';
    const label = describeStep(floorId, roomId, stepId);
    updateProject((prev) => {
      const now = Date.now();
      const next: PaintProject = {
        ...prev,
        floors: prev.floors.map((floor) =>
          floor.id !== floorId
            ? floor
            : {
                ...floor,
                rooms: floor.rooms.map((room) =>
                  room.id !== roomId
                    ? room
                    : {
                        ...room,
                        finishingSteps: room.finishingSteps.map((step) =>
                          step.id !== stepId
                            ? step
                            : approved
                              ? {
                                  ...step,
                                  photoAuditStatus: 'APPROVED' as const,
                                  status: 'COMPLETED' as TaskStatus,
                                  progressPct: 100,
                                  qaVerified: true,
                                  approvedBy: approver,
                                  approvedAt: now,
                                  completedAt: step.completedAt ?? now,
                                  areaCompleted:
                                    step.areaCompleted ?? step.completedSqft ?? getStepArea(step, room),
                                  completedSqft:
                                    step.completedSqft ?? step.areaCompleted ?? getStepArea(step, room),
                                  reworkRequestedAt: undefined,
                                  reworkReason: undefined,
                                }
                              : {
                                  ...step,
                                  photoAuditStatus: 'REJECTED' as const,
                                  status: 'IN_PROGRESS' as TaskStatus,
                                  progressPct: Math.min(step.progressPct ?? 50, 50),
                                  qaVerified: false,
                                  approvedBy: undefined,
                                  approvedAt: undefined,
                                  completedAt: undefined,
                                  reworkRequestedAt: now,
                                  reworkReason: reason || step.reworkReason || 'Quality rejected by supervisor',
                                  reworkCount: (step.reworkCount ?? 0) + 1,
                                },
                        ),
                      },
                ),
              },
        ),
      };
      return withSupervisorActivity(
        next,
        approved ? 'APPROVE_QUALITY' : 'REJECT_REWORK',
        approved ? `Approved quality for ${label}` : `Rejected & sent back for rework: ${label}`,
      );
    });
  };

  const handleEmergencyPO = (materialId: string, vendorId: string, qty: number) => {
    const vendor = (localProject.vendors ?? []).find((v) => v.id === vendorId);
    const material = localProject.materialBillOfQuantities.find((m) => m.id === materialId);
    if (!vendor || !material) return;
    const order: VendorOrder = {
      id: genId('vord'),
      materialId,
      materialName: material.name,
      vendorName: vendor.storeName,
      orderQty: qty,
      unit: material.unit,
      status: 'ORDERED',
      orderedAt: new Date().toISOString(),
      notes: 'Emergency Instant PO',
    };
    updateProject((prev) => ({
      ...prev,
      vendorOrders: [...(prev.vendorOrders ?? []), order],
      materialBillOfQuantities: prev.materialBillOfQuantities.map((m) =>
        m.id !== materialId
          ? m
          : {
              ...m,
              orderedQty: (m.orderedQty ?? 0) + qty,
              orderStatus: 'ORDERED' as OrderStatus,
              vendorName: vendor.storeName,
              vendorId: vendor.id,
            },
      ),
    }));
  };

  const handleImportProject = (imported: PaintProject) => {
    const newProject: PaintProject = ensureExteriorFloor({
      ...imported,
      id: imported.id || genId('proj'),
      supervisors: imported.supervisors ?? localProject.supervisors ?? [],
      painters: imported.painters ?? localProject.painters ?? [],
      vendors: imported.vendors ?? localProject.vendors ?? [],
      leadSupervisorId: imported.leadSupervisorId ?? imported.supervisors?.[0]?.id,
      materialBillOfQuantities: imported.materialBillOfQuantities ?? [],
      vendorOrders: [],
      dailyLogs: [],
      qaRecords: [],
      dailyTargets: [],
      supervisorSessions: [],
      supervisorActivity: [],
    });
    onProjectsChange([...projects, newProject]);
    setActiveProjectId(newProject.id);
    setTab('overview');
  };

  return (
    <div className="min-h-screen">
      <TopBar
        project={localProject}
        projects={projects}
        activeProjectId={activeProjectId}
        onProjectChange={setActiveProjectId}
        role={role}
        activeSupervisor={activeSupervisor}
        activePainter={activePainter}
        onRoleChange={handleRoleChange}
        onSupervisorChange={setActiveSupervisorId}
        onPainterChange={setActivePainterId}
        onImportProject={handleImportProject}
      />
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {role === 'admin' && (
          <>
            <Tabs active={tab} onChange={setTab} />
            {tab === 'overview' && (
              <OverviewTab
                project={localProject}
                onRaisePurchaseOrder={() => setTab('bom')}
                onSetLeadSupervisor={handleSetLeadSupervisor}
                onUpdateProjectDetails={handleUpdateProjectDetails}
              />
            )}
            {tab === 'tasks' && (
              <TasksTab project={localProject} />
            )}
            {tab === 'bom' && (
              <BomTab
                project={localProject}
                onPlaceVendorOrder={(form) => {
                  handlePlaceVendorOrder(form);
                  setTab('vendor-orders');
                }}
                onMarkDelivered={handleMarkDelivered}
                onAddVendor={handleAddVendor}
                onEmergencyPO={handleEmergencyPO}
              />
            )}
            {tab === 'vendor-orders' && (
              <VendorOrdersTab project={localProject} />
            )}
            {tab === 'inspections' && (
              <InspectionsTab project={localProject} />
            )}
            {tab === 'supervisors' && (
              <SupervisorsTab
                supervisors={supervisors}
                project={localProject}
                onSetLeadSupervisor={handleSetLeadSupervisor}
                onSupervisorSessionChange={handleSupervisorSessionChange}
              />
            )}
          </>
        )}
        {role === 'supervisor' && activeSupervisor && (
          <SupervisorPortal
            project={localProject}
            supervisor={activeSupervisor}
            onTaskProgress={handleTaskProgress}
            onPainterAssign={handlePainterAssign}
            onUpdateTaskStep={handleUpdateTaskStep}
            onQaApprove={handleQaApprove}
            onAssignDailyTarget={handleAssignDailyTarget}
            onTogglePainterCheckIn={handleTogglePainterCheckIn}
            onClockChange={handleClockChange}
            onPhotoAudit={handlePhotoAudit}
            onUpdatePhoto={handleSupervisorPhotoUpdate}
            onSessionChange={handleSupervisorSessionChange}
            onSubmitDailyLog={(form) =>
              handleSubmitDailyLog(form, activeSupervisor.id, activeSupervisor.name)
            }
          />
        )}
        {role === 'painter' && activePainter && (
          <PainterPortal
            project={localProject}
            painter={activePainter}
            onTaskStatusChange={handleTaskProgress}
            onPhotoUpload={handlePainterPhotoUpload}
            onClockChange={handleClockChange}
          />
        )}
      </div>
    </div>
  );
}
