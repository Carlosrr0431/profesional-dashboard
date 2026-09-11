import { useMemo } from 'react';
import { isDriverLiveOnDashboard } from '../lib/driverPresence';

export default function StatsBar({ drivers }) {
  const stats = useMemo(() => {
    const live = drivers.filter((d) => isDriverLiveOnDashboard(d));
    const inTrip = live.filter((d) => d.activeTrip).length;
    const online = live.length - inTrip;
    return { total: live.length, online, inTrip };
  }, [drivers]);

  return (
    <div className="hidden lg:flex items-center gap-1.5 rounded-2xl border border-light-300/50 bg-light-100/80 px-2 py-1.5 shadow-sm">
      <StatPill value={stats.total} label="activos" tone="navy" />
      <Divider />
      <StatPill value={stats.online} label="libres" tone="online" pulse />
      <Divider />
      <StatPill value={stats.inTrip} label="en viaje" tone="accent" />
    </div>
  );
}

function Divider() {
  return <span className="h-4 w-px bg-light-300/80" />;
}

function StatPill({ value, label, tone, pulse = false }) {
  const tones = {
    navy: 'text-navy-900',
    online: 'text-emerald-600',
    accent: 'text-accent',
    muted: 'text-gray-400',
  };

  const dots = {
    navy: 'bg-navy-700',
    online: 'bg-emerald-500',
    accent: 'bg-accent',
    muted: 'bg-gray-400',
  };

  return (
    <div className="flex items-center gap-2 px-2.5 py-1 rounded-xl">
      <span className="relative flex h-2 w-2 flex-shrink-0">
        {pulse && value > 0 && (
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${dots[tone]} opacity-50`} />
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${dots[tone]}`} />
      </span>
      <span className={`text-[13px] font-bold tabular-nums ${tones[tone]}`}>{value}</span>
      <span className="text-[11px] text-gray-400 font-medium">{label}</span>
    </div>
  );
}
