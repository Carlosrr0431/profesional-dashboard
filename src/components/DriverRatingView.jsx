import { summarizeDriverRating } from '../../shared/driver-rating';

function StarIcon({ className = 'h-3.5 w-3.5' }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

function StarRow({ average, size = 'h-3.5 w-3.5' }) {
  const value = Number(average) || 0;
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden>
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = value >= star - 0.25;
        return (
          <StarIcon
            key={star}
            className={`${size} ${filled ? 'text-amber-400' : 'text-slate-300'}`}
          />
        );
      })}
    </span>
  );
}

export function DriverRatingChip({ driver, compact = false }) {
  const summary = summarizeDriverRating(driver);

  if (!summary.hasRatings) {
    return (
      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
        Nuevo
      </span>
    );
  }

  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 ring-1 ring-amber-100">
      <StarIcon className="h-3 w-3 shrink-0 text-amber-400" />
      <span className="truncate text-xs font-bold text-navy-900">{summary.averageLabel}</span>
      {compact ? null : (
        <span className="hidden truncate text-[10px] text-slate-500 sm:inline">{summary.countLabel}</span>
      )}
    </span>
  );
}

export function DriverRatingBreakdown({ driver }) {
  const summary = summarizeDriverRating(driver);

  return (
    <div className="rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50/80 to-white p-4">
      <div className="flex flex-col gap-4 min-[380px]:flex-row min-[380px]:items-center">
        <div className="flex shrink-0 items-center gap-3">
          <p className="text-4xl font-bold tracking-tight text-navy-900">{summary.averageLabel}</p>
          <div className="min-w-0">
            {summary.hasRatings ? <StarRow average={summary.average} /> : null}
            <p className="mt-0.5 text-[11px] text-slate-500">{summary.countLabel}</p>
          </div>
        </div>

        {summary.hasRatings ? (
          <div className="min-w-0 flex-1 space-y-1.5">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = summary.histogram[star - 1] || 0;
              const pct = summary.count > 0 ? Math.round((count / summary.count) * 100) : 0;
              return (
                <div key={star} className="flex items-center gap-2">
                  <span className="w-3 text-right text-[10px] font-semibold text-slate-500">{star}</span>
                  <StarIcon className="h-2.5 w-2.5 text-amber-400" />
                  <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-amber-400"
                      style={{ width: `${Math.max(pct, count > 0 ? 8 : 0)}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-[10px] text-slate-400">
                    {count > 0 ? `${pct}%` : ''}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs leading-5 text-slate-500">
            Todavía no tiene reseñas de pasajeros. El promedio aparece cuando califican un viaje.
          </p>
        )}
      </div>
    </div>
  );
}
