import { useState, useRef, useEffect } from 'react';
import { MapPin, CalendarDays, Ruler, Clock, ChevronDown, Shield, CircleUser as UserCircle2, Brush, Building2, Wallet, Check, Upload, X, TriangleAlert as AlertTriangle } from 'lucide-react';
import type { PaintProject, Supervisor, Painter } from '@/types';
import { fmtNum, fmtINR, computeMetrics } from '@/utils';
import { parseJoplinProJson } from '@/utils/jsonParser';

export type Role = 'admin' | 'supervisor' | 'painter';

interface TopBarProps {
  project: PaintProject;
  projects: PaintProject[];
  activeProjectId: string;
  role: Role;
  activeSupervisor: Supervisor | null;
  activePainter: Painter | null;
  onProjectChange: (id: string) => void;
  onRoleChange: (role: Role) => void;
  onSupervisorChange: (id: string) => void;
  onPainterChange: (id: string) => void;
  onImportProject?: (project: PaintProject) => void;
}

export function TopBar({
  project,
  projects,
  activeProjectId,
  role,
  activeSupervisor,
  activePainter,
  onProjectChange,
  onRoleChange,
  onSupervisorChange,
  onPainterChange,
  onImportProject,
}: TopBarProps) {
  const [projMenuOpen, setProjMenuOpen] = useState(false);
  const [supMenuOpen, setSupMenuOpen] = useState(false);
  const [ptrMenuOpen, setPtrMenuOpen] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const projRef = useRef<HTMLDivElement>(null);
  const supRef = useRef<HTMLDivElement>(null);
  const ptrRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (projRef.current && !projRef.current.contains(e.target as Node)) setProjMenuOpen(false);
      if (supRef.current && !supRef.current.contains(e.target as Node)) setSupMenuOpen(false);
      if (ptrRef.current && !ptrRef.current.contains(e.target as Node)) setPtrMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const pd = project.projectDetails;
  const cd = project.customerDetails;
  const supervisors = project.supervisors ?? [];
  const painters = project.painters ?? [];
  const leadSup = supervisors.find((s) => s.id === project.leadSupervisorId);
  const metrics = computeMetrics(project);
  const totalSqftCombined = (metrics.interiorSqft ?? 0) + (metrics.exteriorSqft ?? 0);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur-lg dark:border-slate-800 dark:bg-slate-950/80">
      <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
        {/* Row 1: Brand + project switcher + role switcher + user selector */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Brand */}
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-500 text-white shadow-md shadow-brand-500/20">
              <Brush size={18} />
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-bold tracking-tight text-slate-800 dark:text-slate-100">
                PaintShip OS
              </p>
              <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Field Operations
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Project Switcher */}
            <div className="relative" ref={projRef}>
              <button
                onClick={() => setProjMenuOpen((o) => !o)}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <Building2 size={14} className="text-brand-500" />
                <span className="max-w-[180px] truncate">{pd.name ?? 'Select Project'}</span>
                <ChevronDown size={13} className="text-slate-400" />
              </button>
              {projMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800">
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        onProjectChange(p.id);
                        setProjMenuOpen(false);
                      }}
                      className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs transition-colors hover:bg-slate-50 dark:hover:bg-slate-700 ${
                        p.id === activeProjectId
                          ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400'
                          : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <Building2 size={14} className="shrink-0 text-slate-400" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{p.projectDetails.name}</p>
                        <p className="truncate text-[10px] text-slate-400">
                          {p.customerDetails.address ?? '—'}
                        </p>
                      </div>
                      {p.id === activeProjectId && <Check size={14} className="shrink-0 text-brand-500" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Import Site JSON */}
            {onImportProject && (
              <button
                onClick={() => setShowImport(true)}
                className="flex items-center gap-1.5 rounded-lg border border-brand-300 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-600 transition-colors hover:bg-brand-100 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-400"
              >
                <Upload size={14} />
                <span className="hidden sm:inline">Import Site JSON</span>
              </button>
            )}

            {/* Role Switcher */}
            <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-800">
              <RoleButton active={role === 'admin'} onClick={() => onRoleChange('admin')} icon={<Shield size={14} />} label="Admin" />
              <RoleButton active={role === 'supervisor'} onClick={() => onRoleChange('supervisor')} icon={<UserCircle2 size={14} />} label="Supervisor" />
              <RoleButton active={role === 'painter'} onClick={() => onRoleChange('painter')} icon={<Brush size={14} />} label="Painter" />
            </div>

            {/* Supervisor selector */}
            {role === 'supervisor' && (
              <div className="relative" ref={supRef}>
                <button
                  onClick={() => setSupMenuOpen((o) => !o)}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  <UserCircle2 size={14} className="text-brand-500" />
                  {activeSupervisor?.name ?? 'Select'}
                  <ChevronDown size={13} className="text-slate-400" />
                </button>
                {supMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800">
                    {supervisors.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => { onSupervisorChange(s.id); setSupMenuOpen(false); }}
                        className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs transition-colors hover:bg-slate-50 dark:hover:bg-slate-700 ${
                          activeSupervisor?.id === s.id ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400' : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        <UserCircle2 size={14} className="text-slate-400" />
                        <div>
                          <p className="font-medium">{s.name}</p>
                          <p className="text-[10px] text-slate-400">{s.role}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Painter selector */}
            {role === 'painter' && (
              <div className="relative" ref={ptrRef}>
                <button
                  onClick={() => setPtrMenuOpen((o) => !o)}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  <Brush size={14} className="text-brand-500" />
                  {activePainter?.name ?? 'Select'}
                  <ChevronDown size={13} className="text-slate-400" />
                </button>
                {ptrMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800">
                    {painters.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => { onPainterChange(p.id); setPtrMenuOpen(false); }}
                        className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs transition-colors hover:bg-slate-50 dark:hover:bg-slate-700 ${
                          activePainter?.id === p.id ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400' : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        <Brush size={14} className="text-slate-400" />
                        <div>
                          <p className="font-medium">{p.name}</p>
                          {p.phone && <p className="text-[10px] text-slate-400">{p.phone}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Row 2: project + customer info (admin only) */}
        {role === 'admin' && (
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <MapPin size={13} className="text-brand-500" />
              {cd.address ?? '—'}
            </span>
            <span className="flex items-center gap-1.5">
              <UserCircle2 size={13} className="text-brand-500" />
              {cd.name ?? '—'}
            </span>
            <span className="flex items-center gap-1.5">
              <Ruler size={13} className="text-brand-500" />
              {fmtNum(totalSqftCombined)} sqft
            </span>
            <span className="flex items-center gap-1.5">
              <Wallet size={13} className="text-brand-500" />
              {fmtINR(pd.totalBudget)}
            </span>
            <span className="flex items-center gap-1.5">
              <CalendarDays size={13} className="text-brand-500" />
              {pd.startDate ?? '—'} → {pd.endDate ?? '—'}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock size={13} className="text-brand-500" />
              Est {pd.estimatedDays ?? '—'}d / Actual {pd.actualDays ?? '—'}d
            </span>
            {leadSup && (
              <span className="flex items-center gap-1.5">
                <Shield size={13} className="text-brand-500" />
                Lead: {leadSup.name}
              </span>
            )}
          </div>
        )}
      </div>
      {showImport && onImportProject && (
        <ImportJsonModal
          onClose={() => setShowImport(false)}
          onImport={(proj) => {
            onImportProject(proj);
            setShowImport(false);
          }}
        />
      )}
    </header>
  );
}

function ImportJsonModal({
  onClose,
  onImport,
}: {
  onClose: () => void;
  onImport: (project: PaintProject) => void;
}) {
  const [jsonText, setJsonText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleParse = (text: string) => {
    try {
      const parsed = JSON.parse(text);
      const project = parseJoplinProJson(parsed);
      if (!project.floors || project.floors.length === 0) {
        setError('No floors found in JSON. Please check your data format.');
        return;
      }
      onImport(project);
    } catch (e) {
      setError(`Invalid JSON: ${e instanceof Error ? e.message : 'Parse error'}`);
    }
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      setJsonText(text);
      handleParse(text);
    };
    reader.onerror = () => setError('Failed to read file.');
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && (file.type === 'application/json' || file.name.endsWith('.json'))) {
      handleFile(file);
    } else {
      setError('Please drop a JSON file.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
              <Upload size={18} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Import Site JSON</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Paste JSON or drop a file to auto-populate site data</p>
            </div>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X size={18} />
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        <div className="space-y-4 px-5 py-5">
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
              dragOver
                ? 'border-brand-400 bg-brand-50 dark:bg-brand-500/10'
                : 'border-slate-200 bg-slate-50 hover:border-brand-300 dark:border-slate-700 dark:bg-slate-800/50'
            }`}
          >
            <Upload size={28} className="mx-auto mb-2 text-slate-300 dark:text-slate-600" />
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Drop JSON file here or click to browse</p>
            <p className="mt-1 text-xs text-slate-400">Supports room measurements, total sqft, floors, materials</p>
          </div>
          {/* Or paste */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">Or paste JSON directly</label>
            <textarea
              value={jsonText}
              onChange={(e) => { setJsonText(e.target.value); setError(null); }}
              placeholder='{ "floors": [...] }'
              rows={6}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-mono text-xs text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
          </div>
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
              <AlertTriangle size={14} />
              {error}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4 dark:border-slate-800">
          <button onClick={onClose} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            Cancel
          </button>
          <button
            onClick={() => handleParse(jsonText)}
            disabled={!jsonText.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-brand-500/20 hover:bg-brand-600 active:scale-[0.98] disabled:opacity-50"
          >
            <Upload size={15} />
            Import & Populate
          </button>
        </div>
      </div>
    </div>
  );
}

function RoleButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
        active
          ? 'bg-brand-500 text-white shadow-sm'
          : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
      }`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
