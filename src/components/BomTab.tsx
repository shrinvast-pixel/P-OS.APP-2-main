import { useMemo, useState, useEffect } from 'react';
import { Package, Store, Truck, CircleCheck as CheckCircle2, ClipboardList, Search, PackagePlus, ChevronDown, Plus, X, Phone, MapPin, CreditCard, Tag, User, Zap, Clock, MessageCircle, FileText } from 'lucide-react';
import type { PaintProject, MaterialItem, Vendor } from '@/types';
import { fmtNum, fmtINR, ORDER_STATUS_STYLES, genId } from '@/utils';
import { VendorOrderModal, type VendorOrderForm } from './VendorOrderModal';

type MetricFilter = 'all' | 'required' | 'ordered' | 'delivered' | 'pending' | 'transit';

/** Fallback title for BOM cards/headers so items never render blank or "-" titles. */
function displayTitle(item: { name?: string; category?: string; unit?: string }): string {
  return item.name && item.name !== '-' ? item.name : `${item.category ?? 'Material'} ${item.unit === 'rolls' ? 'Wallpaper' : 'Specialty Coating'}`;
}

interface BomTabProps {
  project: PaintProject;
  onPlaceVendorOrder: (form: VendorOrderForm) => void;
  onMarkDelivered: (materialId: string, deliveredQty: number) => void;
  onAddVendor: (vendor: Vendor) => void;
  onEmergencyPO?: (materialId: string, vendorId: string, qty: number) => void;
}

export function BomTab({ project, onPlaceVendorOrder, onMarkDelivered, onAddVendor, onEmergencyPO }: BomTabProps) {
  const [query, setQuery] = useState('');
  const [orderMaterial, setOrderMaterial] = useState<MaterialItem | null>(null);
  const [deliverMaterial, setDeliverMaterial] = useState<MaterialItem | null>(null);
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [vendorFilter, setVendorFilter] = useState<string>('all');
  const [emergencyVendor, setEmergencyVendor] = useState<Vendor | null>(null);
  const [metricFilter, setMetricFilter] = useState<MetricFilter | null>(null);
  const [poFlash, setPoFlash] = useState<string | null>(null);

  const materials = project.materialBillOfQuantities ?? [];
  const vendors = project.vendors ?? [];

  const filtered = useMemo(() => {
    let result = materials;
    if (vendorFilter !== 'all') {
      result = result.filter((m) => m.vendorName === vendorFilter);
    }
    if (!query.trim()) return result;
    const q = query.toLowerCase();
    return result.filter(
      (m) =>
        m.name?.toLowerCase().includes(q) ||
        m.brand?.toLowerCase().includes(q) ||
        m.vendorName?.toLowerCase().includes(q) ||
        m.category?.toLowerCase().includes(q),
    );
  }, [materials, query, vendorFilter]);

  const summary = useMemo(() => {
    let totalRequired = 0;
    let totalOrdered = 0;
    let totalDelivered = 0;
    let pendingOrderCount = 0;
    let orderedCount = 0;
    let deliveredCount = 0;
    for (const m of materials) {
      totalRequired += m.totalRequiredQty ?? 0;
      totalOrdered += m.orderedQty ?? 0;
      totalDelivered += m.deliveredQty ?? 0;
      if (m.orderStatus === 'PENDING_STORE_ORDER') pendingOrderCount++;
      else if (m.orderStatus === 'ORDERED') orderedCount++;
      else if (m.orderStatus === 'DELIVERED_AT_SITE') deliveredCount++;
    }
    return { totalRequired, totalOrdered, totalDelivered, pendingOrderCount, orderedCount, deliveredCount };
  }, [materials]);

  const auditFiltered = useMemo(() => {
    if (!metricFilter) return [];
    switch (metricFilter) {
      case 'all':
        return materials;
      case 'required':
        return materials.filter((m) => (m.totalRequiredQty ?? 0) > 0);
      case 'ordered':
        return materials.filter((m) => (m.orderedQty ?? 0) > 0);
      case 'delivered':
        return materials.filter((m) => (m.deliveredQty ?? 0) > 0);
      case 'pending':
        return materials.filter((m) => (m.orderStatus ?? 'PENDING_STORE_ORDER') === 'PENDING_STORE_ORDER');
      case 'transit':
        return materials.filter((m) => m.orderStatus === 'ORDERED');
      default:
        return materials;
    }
  }, [materials, metricFilter]);

  const toggleMetricFilter = (f: MetricFilter) =>
    setMetricFilter((prev) => (prev === f ? null : f));

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Summary banner — clickable filter cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <BannerStat icon={<Package size={16} />} label="Total Items" value={String(materials.length)} color="brand" active={metricFilter === 'all'} onClick={() => toggleMetricFilter('all')} />
        <BannerStat icon={<Package size={16} />} label="Total Required" value={fmtNum(summary.totalRequired)} color="slate" active={metricFilter === 'required'} onClick={() => toggleMetricFilter('required')} />
        <BannerStat icon={<Truck size={16} />} label="Ordered" value={fmtNum(summary.totalOrdered)} color="amber" active={metricFilter === 'ordered'} onClick={() => toggleMetricFilter('ordered')} />
        <BannerStat icon={<CheckCircle2 size={16} />} label="Delivered" value={fmtNum(summary.totalDelivered)} color="emerald" active={metricFilter === 'delivered'} onClick={() => toggleMetricFilter('delivered')} />
        <BannerStat icon={<Store size={16} />} label="Pending Order" value={String(summary.pendingOrderCount)} color="slate" active={metricFilter === 'pending'} onClick={() => toggleMetricFilter('pending')} />
        <BannerStat icon={<Truck size={16} />} label="In Transit" value={String(summary.orderedCount)} color="amber" active={metricFilter === 'transit'} onClick={() => toggleMetricFilter('transit')} />
      </div>

      {/* Emergency PO success flash */}
      {poFlash && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 animate-fade-in dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400">
          <CheckCircle2 size={16} />
          {poFlash}
        </div>
      )}

      {/* Site Material Audit List — appears when a metric card is selected */}
      {metricFilter && (
        <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white shadow-card dark:border-brand-500/30 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <ClipboardList size={16} className="text-brand-500" />
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Site Material Audit List</h3>
              <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-medium text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
                {auditFiltered.length} {auditFiltered.length === 1 ? 'item' : 'items'}
              </span>
            </div>
            <button
              onClick={() => setMetricFilter(null)}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <X size={14} />
              Clear Filter
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                  <th className="px-4 py-3 font-semibold">Item Name</th>
                  <th className="px-4 py-3 font-semibold">Category</th>
                  <th className="px-4 py-3 font-semibold">Required Qty</th>
                  <th className="px-4 py-3 font-semibold">Ordered Qty</th>
                  <th className="px-4 py-3 font-semibold">Delivered Qty</th>
                  <th className="px-4 py-3 font-semibold">Pending Qty</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Assigned Vendor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {auditFiltered.map((m) => {
                  const status = m.orderStatus ?? 'PENDING_STORE_ORDER';
                  const style = ORDER_STATUS_STYLES[status];
                  const pendingQty = Math.max(0, (m.totalRequiredQty ?? 0) - (m.orderedQty ?? 0));
                  return (
                    <tr key={m.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">{displayTitle(m)}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{m.category ?? '—'}</td>
                      <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">
                        {fmtNum(m.totalRequiredQty)} <span className="text-xs text-slate-400">{m.unit}</span>
                      </td>
                      <td className="px-4 py-3 text-amber-600 dark:text-amber-400">
                        {fmtNum(m.orderedQty)} <span className="text-xs text-slate-400">{m.unit}</span>
                      </td>
                      <td className="px-4 py-3 text-emerald-600 dark:text-emerald-400">
                        {fmtNum(m.deliveredQty)} <span className="text-xs text-slate-400">{m.unit}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {pendingQty > 0 ? (
                          <span className="font-medium text-slate-700 dark:text-slate-200">{fmtNum(pendingQty)} <span className="text-xs text-slate-400">{m.unit}</span></span>
                        ) : (
                          <span className="text-xs text-emerald-600 dark:text-emerald-400">Fully ordered</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${style.badge}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                          {style.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {m.vendorName ?? <span className="text-slate-400">Not assigned</span>}
                      </td>
                    </tr>
                  );
                })}
                {auditFiltered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-sm text-slate-400">
                      No materials match this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search materials, brands, vendors..."
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          />
        </div>
        <button
          onClick={() => setShowVendorModal(true)}
          className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white shadow-md shadow-brand-500/20 transition-colors hover:bg-brand-600 active:scale-[0.98]"
        >
          <Plus size={14} />
          Onboard New Vendor
        </button>
      </div>

      {/* Vendor filter chips */}
      {vendors.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setVendorFilter('all')}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              vendorFilter === 'all'
                ? 'bg-brand-500 text-white'
                : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700'
            }`}
          >
            All Vendors
          </button>
          {vendors.map((v) => (
            <button
              key={v.id}
              onClick={() => setVendorFilter(v.storeName)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                vendorFilter === v.storeName
                  ? 'bg-brand-500 text-white'
                  : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700'
              }`}
            >
              {v.storeName}
            </button>
          ))}
        </div>
      )}

      {/* Onboarded vendors list */}
      {vendors.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Local Vendor Directory</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {vendors.map((v) => (
              <div key={v.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-card dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-start gap-2.5">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
                    <Store size={17} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">{v.storeName}</p>
                    {v.contactPerson && (
                      <p className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                        <User size={10} />
                        {v.contactPerson}
                      </p>
                    )}
                  </div>
                  {v.distanceKm != null && (
                    <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
                      {v.distanceKm} km away
                    </span>
                  )}
                </div>
                <div className="mt-2.5 space-y-1 text-xs text-slate-500 dark:text-slate-400">
                  {v.gstin && (
                    <p className="flex items-center gap-1.5"><FileText size={11} className="text-slate-400" />GSTIN: {v.gstin}</p>
                  )}
                  {v.phone && (
                    <p className="flex items-center gap-1.5"><Phone size={11} className="text-slate-400" />{v.phone}</p>
                  )}
                  {v.address && (
                    <p className="flex items-center gap-1.5"><MapPin size={11} className="text-slate-400" />{v.address}</p>
                  )}
                  {v.minDeliveryHours != null && (
                    <p className="flex items-center gap-1.5"><Clock size={11} className="text-slate-400" />Min delivery: {v.minDeliveryHours} hrs</p>
                  )}
                  {v.creditDays != null && (
                    <p className="flex items-center gap-1.5"><CreditCard size={11} className="text-slate-400" />Credit: {v.creditDays} days</p>
                  )}
                </div>
                {v.brands && v.brands.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {v.brands.map((b) => (
                      <span key={b} className="inline-flex items-center gap-0.5 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        <Tag size={8} />
                        {b}
                      </span>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => setEmergencyVendor(v)}
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 py-2 text-xs font-bold text-amber-600 transition-colors hover:bg-amber-100 active:scale-[0.98] dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400"
                >
                  <Zap size={14} />
                  Emergency Instant PO
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                <th className="px-4 py-3 font-semibold">Material</th>
                <th className="px-4 py-3 font-semibold">Brand</th>
                <th className="px-4 py-3 font-semibold">Required</th>
                <th className="px-4 py-3 font-semibold">Vendor</th>
                <th className="px-4 py-3 font-semibold">Ordered</th>
                <th className="px-4 py-3 font-semibold">Delivered</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((m) => (
                <MaterialRow
                  key={m.id}
                  material={m}
                  onOrder={() => setOrderMaterial(m)}
                  onDeliver={() => setDeliverMaterial(m)}
                />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm text-slate-400">
                    No materials found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {orderMaterial && (
        <VendorOrderModal
          material={orderMaterial}
          onClose={() => setOrderMaterial(null)}
          onConfirm={(form) => {
            onPlaceVendorOrder(form);
            setOrderMaterial(null);
          }}
        />
      )}
      {deliverMaterial && (
        <DeliverModal
          material={deliverMaterial}
          onClose={() => setDeliverMaterial(null)}
          onConfirm={(qty) => {
            onMarkDelivered(deliverMaterial.id, qty);
            setDeliverMaterial(null);
          }}
        />
      )}
      {showVendorModal && (
        <VendorOnboardingModal
          onClose={() => setShowVendorModal(false)}
          onConfirm={(vendor) => {
            onAddVendor(vendor);
            setShowVendorModal(false);
          }}
        />
      )}
      {emergencyVendor && (
        <EmergencyInstantPOModal
          vendor={emergencyVendor}
          materials={materials}
          onClose={() => setEmergencyVendor(null)}
          onConfirm={(materialId, qty) => {
            if (onEmergencyPO) onEmergencyPO(materialId, emergencyVendor.id, qty);
            const vName = emergencyVendor.storeName;
            setEmergencyVendor(null);
            setPoFlash(`Emergency PO placed: ${qty} units ordered from ${vName}`);
            setTimeout(() => setPoFlash(null), 4000);
          }}
        />
      )}
    </div>
  );
}

function MaterialRow({
  material,
  onOrder,
  onDeliver,
}: {
  material: MaterialItem;
  onOrder: () => void;
  onDeliver: () => void;
}) {
  const status = material.orderStatus ?? 'PENDING_STORE_ORDER';
  const style = ORDER_STATUS_STYLES[status];
  const remaining = (material.totalRequiredQty ?? 0) - (material.orderedQty ?? 0);
  const canOrder = remaining > 0 && status !== 'DELIVERED_AT_SITE';
  const canDeliver = (material.orderedQty ?? 0) > (material.deliveredQty ?? 0) && status === 'ORDERED';

  return (
    <tr className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
      <td className="px-4 py-3">
        <p className="font-medium text-slate-700 dark:text-slate-200">{displayTitle(material)}</p>
        {material.category && (
          <p className="text-xs text-slate-400">{material.category}</p>
        )}
      </td>
      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{material.brand ?? '—'}</td>
      <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">
        {fmtNum(material.totalRequiredQty)} <span className="text-xs text-slate-400">{material.unit}</span>
      </td>
      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
        {material.vendorName ?? <span className="text-slate-400">Not assigned</span>}
      </td>
      <td className="px-4 py-3 text-amber-600 dark:text-amber-400">
        {fmtNum(material.orderedQty)} <span className="text-xs text-slate-400">{material.unit}</span>
      </td>
      <td className="px-4 py-3 text-emerald-600 dark:text-emerald-400">
        {fmtNum(material.deliveredQty)} <span className="text-xs text-slate-400">{material.unit}</span>
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${style.badge}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
          {style.label}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        {canOrder && (
          <button
            onClick={onOrder}
            className="inline-flex items-center gap-1 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-600 active:scale-[0.98]"
          >
            <PackagePlus size={13} />
            Order
          </button>
        )}
        {canDeliver && (
          <button
            onClick={onDeliver}
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-600 active:scale-[0.98]"
          >
            <CheckCircle2 size={13} />
            Mark Delivered
          </button>
        )}
        {status === 'DELIVERED_AT_SITE' && (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 size={14} />
            Done
          </span>
        )}
      </td>
    </tr>
  );
}

function BannerStat({
  icon,
  label,
  value,
  color,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: 'brand' | 'slate' | 'amber' | 'emerald';
  active?: boolean;
  onClick?: () => void;
}) {
  const colors = {
    brand: 'text-brand-600 dark:text-brand-400',
    slate: 'text-slate-600 dark:text-slate-300',
    amber: 'text-amber-600 dark:text-amber-400',
    emerald: 'text-emerald-600 dark:text-emerald-400',
  };
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border px-4 py-3 text-left transition-all active:scale-[0.98] ${
        active
          ? 'border-brand-400 bg-brand-50 ring-2 ring-brand-400/20 dark:border-brand-500 dark:bg-brand-500/10 dark:ring-brand-500/20'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-card-hover dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
      }`}
    >
      <div className={`mb-1 ${colors[color]}`}>{icon}</div>
      <p className={`text-lg font-bold ${colors[color]}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-slate-400">{label}</p>
    </button>
  );
}

function DeliverModal({
  material,
  onClose,
  onConfirm,
}: {
  material: MaterialItem;
  onClose: () => void;
  onConfirm: (qty: number) => void;
}) {
  const [qty, setQty] = useState<number>(
    (material.orderedQty ?? 0) - (material.deliveredQty ?? 0),
  );
  const pending = (material.orderedQty ?? 0) - (material.deliveredQty ?? 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
              <Truck size={18} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Mark Delivered to Site</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">{displayTitle(material)}</p>
            </div>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <ChevronDown size={16} />
          </button>
        </div>
        <div className="space-y-3 px-5 py-5">
          <div className="rounded-lg bg-slate-50 p-3 text-center dark:bg-slate-800/50">
            <p className="text-xs text-slate-400">Pending Delivery</p>
            <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{pending} {material.unit}</p>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Delivered Quantity ({material.unit})
            </label>
            <input
              type="number"
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
              min={0}
              max={pending}
              autoFocus
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-brand-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4 dark:border-slate-800">
          <button onClick={onClose} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(qty)}
            disabled={qty <= 0}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-emerald-500/20 hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-50"
          >
            Confirm Delivery
          </button>
        </div>
      </div>
    </div>
  );
}

function VendorOnboardingModal({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: (vendor: Vendor) => void;
}) {
  const [storeName, setStoreName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [brands, setBrands] = useState('');
  const [creditDays, setCreditDays] = useState('30');
  const [gstin, setGstin] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [distanceKm, setDistanceKm] = useState('');
  const [minDeliveryHours, setMinDeliveryHours] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSubmit = () => {
    if (!storeName.trim()) {
      setError('Store name is required.');
      return;
    }
    onConfirm({
      id: genId('ven'),
      storeName: storeName.trim(),
      ownerName: ownerName.trim() || undefined,
      phone: phone.trim() || undefined,
      address: address.trim() || undefined,
      brands: brands.split(',').map((b) => b.trim()).filter(Boolean),
      creditDays: Number(creditDays) || 0,
      gstin: gstin.trim() || undefined,
      contactPerson: contactPerson.trim() || undefined,
      distanceKm: distanceKm ? Number(distanceKm) : undefined,
      minDeliveryHours: minDeliveryHours ? Number(minDeliveryHours) : undefined,
      whatsappNumber: whatsappNumber.trim() || undefined,
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
              <Store size={18} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Onboard New Local Vendor</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Add a Bangalore hardware store to your vendor directory</p>
            </div>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">Store Name *</label>
            <input type="text" value={storeName} onChange={(e) => { setStoreName(e.target.value); setError(null); }} placeholder="e.g. Sri Lakshmi Hardware" className={inputClass} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">Owner Name</label>
              <input type="text" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="e.g. Lakshmi Narayan" className={inputClass} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">Contact Number</label>
              <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 80..." className={inputClass} />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">Bangalore Area / Address</label>
            <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. 4th Block, Koramangala, Bangalore" className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">GSTIN Number</label>
              <input type="text" value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="29ABCDE1234F1Z5" className={inputClass} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">Contact Person</label>
              <input type="text" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} placeholder="e.g. Ramesh" className={inputClass} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">Distance from Site (km)</label>
              <input type="number" value={distanceKm} onChange={(e) => setDistanceKm(e.target.value)} placeholder="0.8" min={0} step={0.1} className={inputClass} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">Min Delivery Time (hrs)</label>
              <input type="number" value={minDeliveryHours} onChange={(e) => setMinDeliveryHours(e.target.value)} placeholder="4" min={0} className={inputClass} />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">WhatsApp Number</label>
            <input type="text" value={whatsappNumber} onChange={(e) => setWhatsappNumber(e.target.value)} placeholder="+91 98..." className={inputClass} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">Associated Product Brands</label>
            <input type="text" value={brands} onChange={(e) => setBrands(e.target.value)} placeholder="e.g. Asian Paints, Birla White, Berger" className={inputClass} />
            <p className="mt-1 text-xs text-slate-400">Separate multiple brands with commas.</p>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">Credit Days</label>
            <input type="number" value={creditDays} onChange={(e) => setCreditDays(e.target.value)} min={0} placeholder="30" className={inputClass} />
          </div>
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
              {error}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-100 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
          <button onClick={onClose} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            Cancel
          </button>
          <button onClick={handleSubmit} className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-brand-500/20 hover:bg-brand-600 active:scale-[0.98]">
            <Plus size={15} />
            Add Vendor
          </button>
        </div>
      </div>
    </div>
  );
}

function EmergencyInstantPOModal({
  vendor,
  materials,
  onClose,
  onConfirm,
}: {
  vendor: Vendor;
  materials: MaterialItem[];
  onClose: () => void;
  onConfirm: (materialId: string, qty: number) => void;
}) {
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>(materials[0]?.id ?? '');
  const [qty, setQty] = useState<number>(1);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const selectedMaterial = materials.find((m) => m.id === selectedMaterialId);
  const estimatedCost = selectedMaterial ? (selectedMaterial.unitCost ?? 0) * qty : 0;

  const handleSendWhatsApp = () => {
    if (!selectedMaterial || qty <= 0) return;
    const msg = `URGENT ORDER from PaintOps:%0A%0AStore: ${vendor.storeName}%0AMaterial: ${selectedMaterial.name} (${selectedMaterial.brand ?? ''})%0AQty: ${qty} ${selectedMaterial.unit ?? ''}%0A%0APlease confirm availability and dispatch ASAP.`;
    const waNum = vendor.whatsappNumber ?? vendor.phone ?? '';
    const waUrl = waNum ? `https://wa.me/${waNum.replace(/[^0-9]/g, '')}?text=${msg}` : `https://wa.me/?text=${msg}`;
    window.open(waUrl, '_blank');
  };

  const handleConfirm = () => {
    if (!selectedMaterialId || qty <= 0) return;
    onConfirm(selectedMaterialId, qty);
  };

  const inputClass =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 transition-colors focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-amber-300 bg-white shadow-2xl dark:border-amber-500/30 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-amber-100 px-5 py-4 dark:border-amber-500/20">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
              <Zap size={18} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Emergency Instant PO</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">{vendor.storeName}</p>
            </div>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          {/* Vendor info */}
          <div className="rounded-lg bg-amber-50 p-3 dark:bg-amber-500/10">
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
              {vendor.distanceKm != null && (
                <span className="flex items-center gap-1"><MapPin size={11} className="text-amber-500" />{vendor.distanceKm} km away</span>
              )}
              {vendor.minDeliveryHours != null && (
                <span className="flex items-center gap-1"><Clock size={11} className="text-amber-500" />~{vendor.minDeliveryHours} hrs delivery</span>
              )}
              {vendor.phone && (
                <span className="flex items-center gap-1"><Phone size={11} className="text-amber-500" />{vendor.phone}</span>
              )}
            </div>
          </div>

          {/* Material selection */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">Select Material</label>
            <select
              value={selectedMaterialId}
              onChange={(e) => setSelectedMaterialId(e.target.value)}
              className={inputClass}
            >
              <option value="">Select material...</option>
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} {m.brand ? `(${m.brand})` : ''} — {fmtNum(m.totalRequiredQty)} {m.unit ?? ''}
                </option>
              ))}
            </select>
          </div>

          {/* Quantity */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">Quantity</label>
            <input
              type="number"
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
              min={1}
              autoFocus
              className={inputClass}
            />
          </div>

          {/* Cost estimate */}
          {selectedMaterial && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">Unit Cost</span>
                <span className="font-medium text-slate-700 dark:text-slate-200">{fmtINR(selectedMaterial.unitCost)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400">Estimated Total</span>
                <span className="text-lg font-bold text-amber-600 dark:text-amber-400">{fmtINR(estimatedCost)}</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-100 px-5 py-4 dark:border-slate-800 sm:flex-row sm:justify-end">
          <button
            onClick={handleSendWhatsApp}
            disabled={!selectedMaterialId || qty <= 0}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-600 transition-colors hover:bg-emerald-100 active:scale-[0.98] disabled:opacity-50 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400"
          >
            <MessageCircle size={15} />
            Send via WhatsApp
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedMaterialId || qty <= 0}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-amber-500/20 transition-colors hover:bg-amber-600 active:scale-[0.98] disabled:opacity-50"
          >
            <Zap size={15} />
            Place Emergency PO
          </button>
        </div>
      </div>
    </div>
  );
}
