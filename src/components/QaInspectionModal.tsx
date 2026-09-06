import { useEffect, useState } from 'react';
import { X, ClipboardCheck, Camera, CircleCheck as CheckCircle2, CircleAlert as AlertCircle } from 'lucide-react';
import type { QaChecklist } from '@/types';

export interface QaForm {
  checklist: QaChecklist;
  beforePhotoUrl: string;
  afterPhotoUrl: string;
  proofPhotos?: string[];
}

interface QaInspectionModalProps {
  stepName: string;
  roomName: string;
  onClose: () => void;
  onApprove: (form: QaForm) => void;
}

const CHECKLIST_ITEMS: { key: keyof QaChecklist; label: string }[] = [
  { key: 'surfaceSanded', label: 'Surface Sanded Clean' },
  { key: 'uniformCoverage', label: 'Uniform Coverage' },
  { key: 'noRollerMarks', label: 'No Roller Marks' },
  { key: 'edgesTrimClean', label: 'Edges & Trim Clean' },
];

export function QaInspectionModal({
  stepName,
  roomName,
  onClose,
  onApprove,
}: QaInspectionModalProps) {
  const [checklist, setChecklist] = useState<QaChecklist>({
    surfaceSanded: false,
    uniformCoverage: false,
    noRollerMarks: false,
    edgesTrimClean: false,
  });
  const [beforePhotoUrl, setBeforePhotoUrl] = useState('');
  const [afterPhotoUrl, setAfterPhotoUrl] = useState('');
  const [proofPhotos, setProofPhotos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const allChecked = Object.values(checklist).every(Boolean);

  const toggle = (key: keyof QaChecklist) => {
    setChecklist((prev) => ({ ...prev, [key]: !prev[key] }));
    setError(null);
  };

  const handleApprove = () => {
    if (!allChecked) {
      setError('All inspection items must be checked before approval.');
      return;
    }
    onApprove({ 
      checklist, 
      beforePhotoUrl: beforePhotoUrl.trim(), 
      afterPhotoUrl: afterPhotoUrl.trim(),
      proofPhotos
    });
  };

  const addProofPhoto = (url: string) => {
    if (url.trim()) {
      setProofPhotos(prev => [...prev, url.trim()]);
    }
  };

  const removeProofPhoto = (index: number) => {
    setProofPhotos(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
              <ClipboardCheck size={18} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                QA Inspection & Handover
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {stepName} · {roomName}
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
          {/* Checklist */}
          <div>
            <p className="mb-2 text-xs font-medium text-slate-600 dark:text-slate-300">
              Inspection Checklist
            </p>
            <div className="space-y-2">
              {CHECKLIST_ITEMS.map((item) => (
                <button
                  key={item.key}
                  onClick={() => toggle(item.key)}
                  className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                    checklist[item.key]
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-400'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`}
                >
                  <span
                    className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 transition-colors ${
                      checklist[item.key]
                        ? 'border-emerald-500 bg-emerald-500 text-white'
                        : 'border-slate-300 dark:border-slate-600'
                    }`}
                  >
                    {checklist[item.key] && <CheckCircle2 size={13} />}
                  </span>
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Photo uploads */}
          <div className="grid grid-cols-2 gap-3">
            <PhotoUpload label="Before Photo" url={beforePhotoUrl} onChange={setBeforePhotoUrl} />
            <PhotoUpload label="After Photo" url={afterPhotoUrl} onChange={setAfterPhotoUrl} />
          </div>

          {/* Proof Photos */}
          <div>
            <p className="mb-2 text-xs font-medium text-slate-600 dark:text-slate-300">
              Additional Proof Photos
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              {proofPhotos.map((url, i) => (
                <div key={i} className="relative h-16 w-16 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                  <img src={url} alt={`Proof ${i+1}`} className="h-full w-full object-cover" />
                  <button
                    onClick={() => removeProofPhoto(i)}
                    className="absolute right-0.5 top-0.5 grid h-4 w-4 place-items-center rounded-md bg-slate-900/60 text-white backdrop-blur-sm hover:bg-slate-900"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
              <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 transition-colors hover:border-brand-400 hover:bg-brand-50 dark:border-slate-700 dark:bg-slate-800/50">
                <Camera size={16} className="text-slate-400" />
                <span className="text-[9px] text-slate-400">Add Proof</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) addProofPhoto(URL.createObjectURL(file));
                  }}
                />
              </label>
            </div>
            <input
              type="text"
              placeholder="Or paste proof photo URL"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  addProofPhoto((e.target as HTMLInputElement).value);
                  (e.target as HTMLInputElement).value = '';
                }
              }}
              className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-600 focus:border-brand-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
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
            onClick={handleApprove}
            disabled={!allChecked}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-emerald-500/20 transition-colors hover:bg-emerald-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Approve Task QA
          </button>
        </div>
      </div>
    </div>
  );
}

function PhotoUpload({
  label,
  url,
  onChange,
}: {
  label: string;
  url: string;
  onChange: (url: string) => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
        {label}
      </label>
      {url ? (
        <div className="relative">
          <img
            src={url}
            alt={label}
            className="h-24 w-full rounded-lg border border-slate-200 object-cover dark:border-slate-700"
          />
          <button
            onClick={() => onChange('')}
            className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-md bg-slate-900/60 text-white backdrop-blur-sm transition-colors hover:bg-slate-900"
          >
            <X size={13} />
          </button>
        </div>
      ) : (
        <label className="flex h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 transition-colors hover:border-brand-400 hover:bg-brand-50 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-brand-500/40 dark:hover:bg-brand-500/5">
          <Camera size={20} className="text-slate-400" />
          <span className="text-[11px] text-slate-400 dark:text-slate-500">Upload photo</span>
          <input
            type="url"
            value={url}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Paste image URL"
            className="absolute -left-[9999px] w-px opacity-0"
          />
        </label>
      )}
      <input
        type="url"
        value={url}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Or paste image URL"
        className="mt-1.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-600 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
      />
    </div>
  );
}
