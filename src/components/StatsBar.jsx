import { useMemo } from 'react';

export default function StatsBar({ drivers }) {
  const stats = useMemo(() => {
    const total = drivers.length;
    const inTrip = drivers.filter((d) => d.activeTrip).length;
    const online = drivers.filter((d) => d.isOnline && !d.activeTrip).length;
    const offline = drivers.filter((d) => !d.isOnline).length;
    return { total, online, offline, inTrip };
  }, [drivers]);

  return (
    <div className="flex items-center gap-5">
      <Stat value={stats.total} label="choferes" dotClass="bg-navy-700" />
      <Stat value={stats.online} label="libres" dotClass="bg-online" pulse />
      <Stat value={stats.inTrip} label="en viaje" dotClass="bg-accent" />
      <Stat value={stats.offline} label="offline" dotClass="bg-offline" />
    </div>
  );
}

function Stat({ value, label, dotClass, pulse = false }) {
  return (
    <div className="flex items-center gap-2">
      <span className="relative flex h-2 w-2 flex-shrink-0">
        {pulse && value > 0 && (
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${dotClass} opacity-60`} />
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${dotClass}`} />
      </span>
      <span className="text-[13px] font-bold text-navy-900 tabular-nums">{value}</span>
      <span className="text-[11px] text-gray-400">{label}</span>
    </div>
  );
}
