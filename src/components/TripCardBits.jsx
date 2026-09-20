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

export function DriverMobileCorner({ assigned, children }) {
  return (
    <div className="flex shrink-0 flex-col items-end gap-1 text-right">
      {assigned?.number ? (
        <p
          title={assigned.name ? `Móvil ${assigned.number} · ${assigned.name}` : `Móvil ${assigned.number}`}
          className="text-[18px] font-black leading-none tabular-nums tracking-tight text-navy-900"
        >
          {assigned.number}
        </p>
      ) : null}
      {children}
      {assigned?.name ? (
        <p className="max-w-[7.5rem] truncate text-[10px] font-medium leading-tight text-slate-500">
          {assigned.name}
        </p>
      ) : null}
    </div>
  );
}
