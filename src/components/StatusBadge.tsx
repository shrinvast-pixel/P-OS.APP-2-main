import type { TaskStatus } from '@/types';
import { STATUS_STYLES, type StatusStyle } from '@/utils';

const DEFAULT_STYLE: StatusStyle = {
  badge: 'bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-300 ring-1 ring-slate-500/20 dark:ring-slate-500/30',
  dot: 'bg-slate-400',
  label: 'Pending',
};

interface StatusBadgeProps {
  status: TaskStatus;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const s = (status && STATUS_STYLES[status]) || DEFAULT_STYLE;
  const padding = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${padding} ${s.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}
