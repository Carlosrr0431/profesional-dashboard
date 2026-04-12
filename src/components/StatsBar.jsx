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
    <div className="flex gap-3">
      <StatCard
        icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
        label="Total Choferes"
        value={stats.total}
        color="text-accent"
        bg="bg-accent-dim"
      />
      <StatCard
        icon={<span className="relative flex h-2.5 w-2.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-online opacity-75" /><span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-online" /></span>}
        label="Disponibles"
        value={stats.online}
        color="text-online"
        bg="bg-online-dim"
      />
      <StatCard
        icon={<span className="w-2.5 h-2.5 rounded-full bg-accent" />}
        label="En viaje"
        value={stats.inTrip}
        color="text-accent-light"
        bg="bg-accent-dim"
      />
      <StatCard
        icon={<span className="w-2.5 h-2.5 rounded-full bg-offline" />}
        label="Desconectados"
        value={stats.offline}
        color="text-offline"
        bg="bg-offline-dim"
      />
    </div>
  );
}

function StatCard({ icon, label, value, color, bg }) {
  return (
    <div className={`flex-1 ${bg} border border-light-300/50 rounded-xl px-4 py-3 flex items-center gap-3`}>
      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-light-200/80">
        {icon}
      </div>
      <div>
        <p className={`text-xl font-bold ${color}`}>{value}</p>
        <p className="text-[11px] text-gray-400 whitespace-nowrap">{label}</p>
      </div>
    </div>
  );
}
