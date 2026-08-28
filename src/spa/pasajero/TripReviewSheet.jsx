'use client';

import { SpaButton } from '../shared/ui';
import { formatArs } from '../shared/money';

function shortAddress(value) {
  return String(value || '').split(',')[0] || value || '—';
}

export default function TripReviewSheet({
  pickupAddress,
  destinationAddress,
  quote,
  busy = false,
  onConfirm,
  onSchedule,
  onEdit,
  onCancel,
}) {
  const km = Number(quote?.distanceKm);
  const minutes = Number(quote?.durationMinutes);
  const meta = [
    Number.isFinite(km) ? `${km.toFixed(1)} km` : null,
    Number.isFinite(minutes) ? `${Math.round(minutes)} min` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="spa-review">
      <button type="button" className="spa-review-route" onClick={onEdit}>
        <div className="spa-route spa-route--offer">
          <p className="spa-route-line">
            <span className="spa-route-dot" />
            <span>{shortAddress(pickupAddress)}</span>
          </p>
          <p className="spa-route-line">
            <span className="spa-route-dot spa-route-dot--dest" />
            <span>{shortAddress(destinationAddress)}</span>
          </p>
        </div>
        <p className="spa-review-edit">Tocá para editar</p>
      </button>

      <div className="spa-review-fare">
        <div>
          <p className="spa-review-kicker">Precio del viaje</p>
          <p className="spa-review-price">
            {quote?.price != null ? formatArs(quote.price) : 'Calculando…'}
          </p>
        </div>
        {meta ? <p className="spa-review-meta">{meta}</p> : null}
      </div>

      <SpaButton disabled={busy || quote?.price == null} onClick={onConfirm}>
        {busy ? 'Confirmando…' : quote?.price != null ? `Confirmar · ${formatArs(quote.price)}` : 'Confirmar viaje'}
      </SpaButton>

      <button type="button" className="spa-review-schedule" disabled={busy} onClick={onSchedule}>
        Programar para más tarde
      </button>

      <button type="button" className="spa-review-cancel" disabled={busy} onClick={onCancel}>
        Cancelar viaje
      </button>
    </div>
  );
}
