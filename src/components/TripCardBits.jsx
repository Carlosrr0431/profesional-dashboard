export function TripRouteLines({ pickup, dest }) {
  return (
    <div className="mt-2 space-y-1.5">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Origen</p>
        <p className="mt-0.5 line-clamp-2 text-[13px] font-semibold leading-snug text-slate-800">
          {pickup || '—'}
        </p>
      </div>
      {dest ? (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Destino</p>
          <p className="mt-0.5 line-clamp-2 text-[13px] font-medium leading-snug text-slate-700">
            {dest}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function DriverMobileBlock({ assigned }) {
  if (!assigned?.number && !assigned?.name) return null;

  return (
    <div className="mt-2 flex flex-col items-center justify-center rounded-xl bg-white px-3 py-2 text-center ring-1 ring-slate-200">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Móvil</p>
      {assigned.number ? (
        <p className="mt-0.5 text-[28px] font-black leading-none tabular-nums tracking-tight text-navy-900">
          {assigned.number}
        </p>
      ) : null}
      {assigned.name ? (
        <p className="mt-1 max-w-full truncate text-[12px] font-semibold text-slate-600">
          {assigned.name}
        </p>
      ) : null}
    </div>
  );
}
