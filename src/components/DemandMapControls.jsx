'use client';

function Chip({ label, count, active, color, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-2xl border px-2.5 py-2 text-left transition ${
        active ? 'border-transparent text-white shadow-sm' : 'border-transparent bg-slate-50 text-slate-700 hover:bg-slate-100'
      }`}
      style={active ? { backgroundColor: color } : undefined}
    >
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold">{label}</span>
      <span className={`text-[12px] font-bold tabular-nums ${active ? 'text-white' : 'text-slate-400'}`}>{count}</span>
    </button>
  );
}

export default function DemandMapControls({
  summary,
  layers,
  onToggle,
  loading,
  error,
  selectedTrip,
  onCloseDetail,
}) {
  if (!summary) {
    return (
      <div className="pointer-events-auto w-full max-w-[34rem] rounded-[22px] border border-slate-200/80 bg-white/97 px-4 py-3 text-[13px] font-semibold text-slate-600 shadow-xl shadow-navy-900/10">
        {error || (loading ? 'Cargando demanda…' : 'Sin datos de demanda')}
      </div>
    );
  }

  return (
    <div className="pointer-events-auto w-full max-w-[34rem]">
      {selectedTrip && layers.scheduled ? (
        <div className="mb-2 rounded-2xl border border-slate-200/80 bg-white/97 p-3 shadow-xl shadow-navy-900/10">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-violet-700">Viaje programado</p>
              <p className="text-[15px] font-bold text-slate-900">{selectedTrip.label}</p>
            </div>
            <button
              type="button"
              onClick={onCloseDetail}
              className="rounded-full px-2 py-1 text-[12px] font-semibold text-slate-500 hover:bg-slate-100"
              aria-label="Cerrar detalle"
            >
              Cerrar
            </button>
          </div>
          <p className="mt-2 text-[11px] font-semibold text-slate-400">Retiro</p>
          <p className="text-[13px] text-slate-800">{selectedTrip.pickup || 'Sin dirección de retiro'}</p>
          <p className="mt-1 text-[11px] font-semibold text-slate-400">Destino</p>
          <p className="text-[13px] text-slate-800">{selectedTrip.destination || 'Sin destino'}</p>
          {selectedTrip.note ? (
            <>
              <p className="mt-1 text-[11px] font-semibold text-slate-400">Notas</p>
              <p className="text-[13px] text-slate-800">{selectedTrip.note}</p>
            </>
          ) : null}
        </div>
      ) : null}
      <div className="rounded-[22px] border border-slate-200/80 bg-white/97 p-2 shadow-xl shadow-navy-900/10">
        <div className="flex gap-2">
          <Chip label="Programados" count={summary.scheduled.length} active={layers.scheduled} color="#6D28D9" onClick={() => onToggle('scheduled')} />
          <Chip label="En cola" count={summary.queued.length} active={layers.queued} color="#C2410C" onClick={() => onToggle('queued')} />
        </div>
        <div className="mt-2 flex gap-2">
          <Chip label={summary.shiftLabel} count={summary.todayCount} active={layers.done} color="#15803D" onClick={() => onToggle('done')} />
          <Chip label="Zonas" count={summary.zones.length} active={layers.zones} color="#BE123C" onClick={() => onToggle('zones')} />
        </div>
        {error ? <p className="px-2 pt-2 text-[12px] font-medium text-rose-600">{error}</p> : null}
        {loading && !summary.todayCount && !summary.zones.length ? (
          <p className="px-2 pt-2 text-[12px] text-slate-500">Cargando demanda…</p>
        ) : null}
      </div>
    </div>
  );
}
