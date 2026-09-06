import { useState } from 'react';
import { X, PackagePlus, Store, Truck } from 'lucide-react';
import type { MaterialItem } from '@/types';

export interface VendorOrderForm {
  materialId: string;
  materialName: string;
  vendorName: string;
  orderQty: number;
  unit?: string;
  notes?: string;
}

interface VendorOrderModalProps {
  material: MaterialItem;
  onClose: () => void;
  onConfirm: (form: VendorOrderForm) => void;
}

const STORES = [
  'Asian Paints Depot - Rajajinagar',
  'Sri Lakshmi Hardware & Paints',
  'Bangalore Paint House',
];

export function VendorOrderModal({ material, onClose, onConfirm }: VendorOrderModalProps) {
  const [vendorName, setVendorName] = useState(material.vendorName ?? STORES[0]);
  const [orderQty, setOrderQty] = useState<number>(
    (material.totalRequiredQty ?? 0) - (material.orderedQty ?? 0),
  );
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const remaining = (material.totalRequiredQty ?? 0) - (material.orderedQty ?? 0);

  const handleConfirm = () => {
    if (!vendorName.trim()) {
      setError('Vendor name is required.');
      return;
    }
    if (orderQty <= 0) {
      setError('Order quantity must be greater than 0.');
      return;
    }
    onConfirm({
      materialId: material.id,
      materialName: material.name,
      vendorName: vendorName.trim(),
      orderQty,
      unit: material.unit,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
              <PackagePlus size={18} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Place Direct Vendor Order
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {material.name} · {material.brand ?? ''}
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

        <div className="space-y-4 px-5 py-5">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-3 text-center dark:bg-slate-800/50">
            <div>
              <p className="text-[10px] uppercase text-slate-400">Required</p>
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                {material.totalRequiredQty ?? 0} {material.unit}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-slate-400">Ordered</p>
              <p className="text-sm font-bold text-amber-600 dark:text-amber-400">
                {material.orderedQty ?? 0} {material.unit}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-slate-400">Remaining</p>
              <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                {remaining} {material.unit}
              </p>
            </div>
          </div>

          {/* Vendor name */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
              <Store size={12} className="mr-1 inline" />
              Local Vendor / Store Name
            </label>
            <select
              value={vendorName}
              onChange={(e) => { setVendorName(e.target.value); setError(null); }}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              {STORES.map((store) => (
                <option key={store} value={store}>
                  {store}
                </option>
              ))}
            </select>
          </div>

          {/* Order qty */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
              <Truck size={12} className="mr-1 inline" />
              Order Quantity ({material.unit ?? 'pcs'})
            </label>
            <input
              type="number"
              value={orderQty}
              onChange={(e) => { setOrderQty(Number(e.target.value)); setError(null); }}
              min={0}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Notes / Instructions
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Delivery instructions, contact person, etc."
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4 dark:border-slate-800">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-brand-500/20 transition-colors hover:bg-brand-600 active:scale-[0.98]"
          >
            Place Order
          </button>
        </div>
      </div>
    </div>
  );
}
