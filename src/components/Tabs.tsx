import { LayoutDashboard, ListChecks, Package, Users, Truck, ClipboardCheck } from 'lucide-react';

export type TabId = 'overview' | 'tasks' | 'bom' | 'vendor-orders' | 'inspections' | 'supervisors';

interface TabsProps {
  active: TabId;
  onChange: (tab: TabId) => void;
}

const TABS: { id: TabId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'tasks', label: 'Tasks Breakdown', icon: ListChecks },
  { id: 'bom', label: 'Material BOM', icon: Package },
  { id: 'vendor-orders', label: 'Vendor Orders', icon: Truck },
  { id: 'inspections', label: 'Completed & Approved Inspections', icon: ClipboardCheck },
  { id: 'supervisors', label: 'Supervisors', icon: Users },
];

export function Tabs({ active, onChange }: TabsProps) {
  return (
    <div className="sticky top-[105px] z-10 -mx-4 mb-6 border-b border-slate-200 bg-slate-100/90 px-4 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/90 sm:top-[97px] sm:mx-0 sm:rounded-xl sm:border sm:px-2">
      <nav className="flex gap-1 overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={`relative flex shrink-0 items-center gap-2 whitespace-nowrap px-4 py-3 text-sm font-medium transition-colors ${
                isActive
                  ? 'text-brand-600 dark:text-brand-400'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <Icon size={16} />
              {tab.label}
              {isActive && (
                <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand-500" />
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
