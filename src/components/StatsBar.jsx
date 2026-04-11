import { useMemo } from 'react';

export default function StatsBar({ drivers }) {
  const stats = useMemo(() => {
    const total = drivers.length;
    const online = drivers.filter((d) => d.isOnline).length;
    const offline = total - online;
    return { total, online, offline };
  }, [drivers]);

  return (
    <div className="flex gap-3">
      <StatCard label="Total Choferes" value={stats.total} color="text-white" />
      <StatCard label="En línea" value={stats.online} color="text-online" dot="bg-online" />
      <StatCard label="Desconectados" value={stats.offline} color="text-offline" dot="bg-offline" />
    </div>
  );
}

function StatCard({ label, value, color, dot }) {
  return (
    <div className="flex-1 bg-dark-700 border border-dark-600 rounded-xl px-4 py-3 flex items-center gap-3">
      {dot && <span className={`w-2.5 h-2.5 rounded-full ${dot} animate-pulse`} />}
      <div>
        <p className={`text-2xl font-bold ${color}`}>{value}</p>
        <p className="text-xs text-gray-400">{label}</p>
      </div>
    </div>
  );
}
