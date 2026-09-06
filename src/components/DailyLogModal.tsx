import { useEffect, useState } from 'react';
import { X, ClipboardList, CircleAlert as AlertCircle, Plus, Trash2, Calendar, Users } from 'lucide-react';
import type { MaterialItem, MaterialConsumptionEntry } from '@/types';
import { fmtNum } from '@/utils';

export interface DailyLogForm {
  date: string;
  attendanceCount: number;
  notes?: string;
  issues?: string;
  consumption: MaterialConsumptionEntry[];
}

interface DailyLogModalProps {
  materials: MaterialItem[];
  supervisorName: string;
  onClose: () => void;
  onConfirm: (form: DailyLogForm) => void;
}

export function DailyLogModal({
  materials,
  supervisorName,
  onClose,
  onConfirm,
}: DailyLogModalProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [attendance, setAttendance] = useState('');
  const [notes, setNotes] = useState('');
  const [issues, setIssues] = useState('');
  const [consumption, setConsumption] = useState<MaterialConsumptionEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const deliveredMaterials = materials.filter((m) => (m.deliveredQty ?? 0) > 0);

  const addConsumption = () => {
    setConsumption((prev) => [
      ...prev,
      { materialId: '', materialName: '', quantityUsed: 0, unit: '' },
    ]);
  };

  const updateConsumption = (idx: number, materialId: string) => {
    const mat = materials.find((m) => m.id === materialId);
    setConsumption((prev) =>
      prev.map((c, i) =>
        i !== idx
          ? c
          : {
              ...c,
              materialId,
              materialName: mat?.name ?? '',
              unit: mat?.unit ?? '',
            },
      ),
    );
  };

  const updateQty = (idx: number, qty: string) => {
    const n = Number(qty);
    setConsumption((prev) =>
      prev.map((c, i) => (i !== idx ? c : { ...c, quantityUsed: Number.isNaN(n) ? 0 : n })),
    );
  };

  const removeConsumption = (idx: number) => {
    setConsumption((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = () => {
    const a = Number(attendance);
    if (!attendance.trim() || Number.isNaN(a) || a < 0) {
      setError('Enter a valid painter attendance count.');
      return;
    }
    const validConsumption = consumption.filter((c) => c.materialId && c.quantityUsed > 0);
    onConfirm({
      date,
      attendanceCount: a,
      notes: notes.trim(),
      issues: issues.trim(),
      consumption: validConsumption,
    });
  };

  const inputClass =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 transition-colors focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
              <ClipboardList size={18} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Submit Daily Site Log
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {supervisorName} · {new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          {/* Date & Attendance */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
                <Calendar size={12} className="mr-1 inline" />
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
                <Users size={12} className="mr-1 inline" />
                Painters on Site
              </label>
              <input
                type="number"
                value={attendance === '0' ? '' : attendance}
                onChange={(e) => {
                  setAttendance((parseInt(e.target.value) || 0).toString());
                  setError(null);
                }}
                placeholder="0"
                className={inputClass}
              />
            </div>
          </div>

          {/* Material Consumption */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Material Consumed Today
              </label>
              <button
                onClick={addConsumption}
                disabled={deliveredMaterials.length === 0}
                className="flex items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-600 transition-colors hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-brand-500/10 dark:text-brand-400 dark:hover:bg-brand-500/20"
              >
                <Plus size={13} />
                Add Material
              </button>
            </div>
            {deliveredMaterials.length === 0 ? (
              <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-400 dark:bg-slate-800/50 dark:text-slate-500">
                No delivered materials available to consume.
              </p>
            ) : (
              <div className="space-y-2">
                {consumption.map((c, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <select
                      value={c.materialId}
                      onChange={(e) => updateConsumption(idx, e.target.value)}
                      className="flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <option value="">Select material…</option>
                      {deliveredMaterials.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({fmtNum(m.deliveredQty)} {m.unit} delivered)
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={c.quantityUsed === 0 ? '' : c.quantityUsed}
                      onChange={(e) => updateQty(idx, e.target.value)}
                      placeholder="Qty"
                      className="w-20 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    />
                    <button
                      onClick={() => removeConsumption(idx)}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                {consumption.length === 0 && (
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    No materials added yet.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Site Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="General progress notes for today…"
              rows={2}
              className={`${inputClass} resize-none`}
            />
          </div>

          {/* Issues */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Issue Reporting
            </label>
            <textarea
              value={issues}
              onChange={(e) => setIssues(e.target.value)}
              placeholder='e.g. "Wall dampness in Master Bedroom"'
              rows={2}
              className={`${inputClass} resize-none`}
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-100 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-brand-500/20 transition-colors hover:bg-brand-600 active:scale-[0.98]"
          >
            Submit Daily Log
          </button>
        </div>
      </div>
    </div>
  );
}
