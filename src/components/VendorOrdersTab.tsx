import { Package, Truck, Clock, CheckCircle2, AlertCircle, Search, FileText, Store, User } from 'lucide-react';
import type { PaintProject, VendorOrder } from '@/types';
import { fmtNum, ORDER_STATUS_STYLES } from '@/utils';

interface VendorOrdersTabProps {
  project: PaintProject;
}

export function VendorOrdersTab({ project }: VendorOrdersTabProps) {
  const orders = project.vendorOrders ?? [];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Active Vendor Orders</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Track and manage all purchase orders placed with local stores</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-400">
          <Package size={14} />
          {orders.length} Total Orders
        </div>
      </div>

      <div className="grid gap-4">
        {orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 py-12 dark:border-slate-800">
            <div className="mb-3 rounded-full bg-slate-100 p-4 dark:bg-slate-800">
              <Package size={32} className="text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-500">No vendor orders placed yet</p>
            <p className="text-xs text-slate-400">Orders placed from the BOM tab will appear here</p>
          </div>
        ) : (
          orders.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))
        )}
      </div>
    </div>
  );
}

function OrderCard({ order }: { order: VendorOrder }) {
  const statusStyle = ORDER_STATUS_STYLES[order.status] ?? ORDER_STATUS_STYLES.ORDERED;
  const isDelivered = order.status === 'DELIVERED_AT_SITE';

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-card transition-all hover:border-brand-200 hover:shadow-card-hover dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${isDelivered ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400' : 'bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400'}`}>
            {isDelivered ? <CheckCircle2 size={24} /> : <Truck size={24} />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-800 dark:text-slate-100">{order.materialName}</h3>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusStyle.badge}`}>
                {statusStyle.label}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <p className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                <Store size={14} className="text-slate-400" />
                {order.vendorName}
              </p>
              <p className="flex items-center gap-1.5 font-semibold text-brand-600 dark:text-brand-400">
                <Package size={14} />
                {fmtNum(order.orderQty)} {order.unit}
              </p>
            </div>
          </div>
        </div>
        <div className="text-right sm:block">
          <p className="flex items-center justify-end gap-1.5 text-xs text-slate-400">
            <Clock size={12} />
            Ordered: {new Date(order.orderedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </p>
          {order.deliveredAt && (
            <p className="mt-1 flex items-center justify-end gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 size={12} />
              Delivered: {new Date(order.deliveredAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
            </p>
          )}
        </div>
      </div>

      {order.notes && (
        <div className="mt-4 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            <FileText size={12} />
            Notes / Instructions
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">{order.notes}</p>
        </div>
      )}

      {/* Decorative background icon */}
      <div className="absolute -bottom-4 -right-4 opacity-[0.03] dark:opacity-[0.05]">
        <Package size={100} />
      </div>
    </div>
  );
}
