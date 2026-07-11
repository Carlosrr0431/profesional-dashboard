'use client';

import QueuePanel from './QueuePanel';
import LiveTripsPanel from './LiveTripsPanel';

const TABS = [
  { id: 'cola', label: 'Cola' },
  { id: 'viajes', label: 'Viajes' },
];

function LiveDot() {
  return (
    <span className="relative flex items-center gap-1.5">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-online opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-online" />
      </span>
      <span className="text-[11px] font-medium text-online">En vivo</span>
    </span>
  );
}

export default function ViajesPanel({
  queueData,
  liveTripsData,
  onBack,
  activeTab = 'cola',
  onTabChange,
}) {
  const tab = activeTab;
  const setTab = onTabChange || (() => {});

  return (
    <div className="flex flex-col flex-1 w-full min-h-0 h-full bg-light-100/60 overflow-hidden">
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 lg:px-6 lg:py-4 bg-white/80 border-b border-light-300/60 backdrop-blur-sm flex-shrink-0">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="w-8 h-8 rounded-xl bg-light-100 border border-light-300/60 flex items-center justify-center text-gray-500 hover:text-navy-800 hover:bg-light-200 transition-all"
            title="Volver al mapa"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-navy-800 to-navy-900 flex items-center justify-center shadow-md shadow-navy-900/20">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10m16 0V8a1 1 0 00-1-1h-3.5M6 8h2" />
            </svg>
          </div>

          <div className="min-w-0">
            <h2 className="text-navy-900 font-bold text-base leading-tight">Viajes</h2>
            <p className="hidden text-[11px] text-gray-400 sm:block">
              Cola de espera y monitoreo en tiempo real
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <LiveDot />
          <div className="flex items-center gap-1 rounded-xl border border-gray-200/70 bg-gray-100/80 p-1">
            {TABS.map((item) => {
              const active = tab === item.id;
              const badge =
                item.id === 'cola'
                  ? queueData?.stats?.inQueue
                  : liveTripsData?.stats?.active;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-all ${
                    active
                      ? 'bg-white text-navy-900 shadow-sm'
                      : 'text-gray-500 hover:text-navy-800'
                  }`}
                >
                  {item.label}
                  {badge > 0 ? (
                    <span className={`min-w-[1.1rem] rounded-full px-1 text-[10px] font-bold leading-4 text-white ${
                      item.id === 'cola' ? 'bg-warning' : 'bg-blue-600'
                    }`}>
                      {badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {tab === 'cola' ? (
          <QueuePanel {...queueData} onBack={onBack} embedded />
        ) : (
          <LiveTripsPanel {...liveTripsData} />
        )}
      </div>
    </div>
  );
}
