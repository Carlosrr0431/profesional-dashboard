'use client';

import { useEffect, useState } from 'react';
import { SpaButton, SpaIcon, SpaKicker, SpaPanel } from './ui';
import { formatArs } from './money';
import { buildWaitFeeView, isWaitTimerActive } from './waitFee';

function initials(name) {
  const text = String(name || '').trim();
  return (text.charAt(0) || '?').toUpperCase();
}

function WaitFeePanel({ trip }) {
  const live = isWaitTimerActive(trip);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!live) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live, trip?.driver_arrived_at, trip?.id]);

  const view = buildWaitFeeView(trip, now);
  if (!view.show) return null;

  const minuteLabel = view.minutes === 1 ? '1 minuto cobrado' : `${view.minutes} minutos cobrados`;

  return (
    <div className="spa-wait">
      {view.active ? (
        <>
          <p className="spa-wait-kicker">
            <span className="spa-wait-dot" />
            Tu chofer ya llegó y te espera
          </p>
          <p className="spa-wait-clock" aria-live="polite">{view.clock}</p>
          <p className="spa-wait-hint">
            {view.rate > 0
              ? `Recargo de ${formatArs(view.rate)} por cada minuto completo. Se suma al total al finalizar.`
              : 'El chofer te está esperando en el origen. Subí para que no se acumule recargo.'}
          </p>
          <div className="spa-wait-row">
            <span>{minuteLabel}</span>
            <strong>{formatArs(view.fee)}</strong>
          </div>
        </>
      ) : (
        <>
          <p className="spa-wait-kicker">
            {view.completed ? 'Espera incluida en el total' : 'Espera acumulada'}
          </p>
          {view.fee > 0 ? <p className="spa-wait-amount">{formatArs(view.fee)}</p> : null}
          {view.fee > 0 && !view.completed ? (
            <p className="spa-wait-hint">Este recargo se cobra al finalizar este viaje.</p>
          ) : null}
        </>
      )}
      {view.debtOnBill > 0 ? (
        <div className="spa-wait-debt">
          <p>Debés {formatArs(view.debtOnBill)} por espera</p>
          <span>
            {view.completed
              ? 'Se sumó al total de este viaje.'
              : 'Quedó de otro viaje y se cobra al finalizar este.'}
          </span>
        </div>
      ) : null}
    </div>
  );
}

export default function TripLiveSheet({
  statusLabel,
  statusDesc,
  progress = 0.5,
  personName,
  personMeta,
  plate,
  pickup,
  destination,
  priceLabel,
  canCancel = false,
  cancelLabel = 'Cancelar',
  chatAvailable = false,
  chatUnread = 0,
  onChat,
  onShare,
  onSos,
  onCancel,
  primaryAction,
  onPrimary,
  primaryVariant = 'primary',
  busy = false,
  waitTrip = null,
}) {
  const showChat = chatAvailable && typeof onChat === 'function';
  const actions = [
    showChat ? { id: 'chat', icon: 'chat', label: 'Chat', onClick: onChat, unread: chatUnread } : null,
    onShare ? { id: 'share', icon: 'share', label: 'Compartir', onClick: onShare } : null,
    onSos ? { id: 'sos', icon: 'sos', label: 'Emergencia', onClick: onSos, mute: true } : null,
    canCancel && onCancel ? { id: 'cancel', icon: 'close', label: cancelLabel, onClick: onCancel, danger: true } : null,
  ].filter(Boolean);

  return (
    <SpaPanel className="spa-panel--compact">
      <div className="spa-live-head">
        <div className="min-w-0 flex-1">
          <SpaKicker live>{statusLabel}</SpaKicker>
          <h2>{statusDesc}</h2>
        </div>
        {priceLabel ? <p className="shrink-0 text-[15px] font-semibold text-navy-900">{priceLabel}</p> : null}
      </div>

      <div className="spa-progress" aria-hidden="true">
        <span style={{ width: `${Math.min(100, Math.max(8, progress * 100))}%` }} />
      </div>

      {waitTrip ? <WaitFeePanel trip={waitTrip} /> : null}

      {personName ? (
        <div className="spa-person">
          <div className="spa-avatar">{initials(personName)}</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold text-navy-900">{personName}</p>
            {personMeta ? <p className="truncate text-[12px] text-slate-500">{personMeta}</p> : null}
          </div>
          {plate ? <span className="spa-plate">{plate}</span> : null}
        </div>
      ) : null}

      <div className="spa-route">
        {pickup ? (
          <p className="spa-route-line text-[13px] text-navy-900">
            <span className="spa-route-dot" />
            <span className="min-w-0 truncate">{pickup}</span>
          </p>
        ) : null}
        {destination ? (
          <p className="spa-route-line text-[13px] text-navy-900">
            <span className="spa-route-dot spa-route-dot--dest" />
            <span className="min-w-0 truncate">{destination}</span>
          </p>
        ) : null}
      </div>

      {actions.length > 0 ? (
        <div className="spa-actions">
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              disabled={busy}
              onClick={action.onClick}
              className={`spa-action ${action.danger ? 'spa-action--danger' : ''} ${action.mute ? 'spa-action--mute' : ''}`}
            >
              <SpaIcon name={action.icon} className="h-4 w-4" />
              <span>{action.label}</span>
              {action.unread > 0 ? (
                <span className="spa-badge">{action.unread > 9 ? '9+' : action.unread}</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}

      {primaryAction && onPrimary ? (
        <SpaButton variant={primaryVariant} disabled={busy} onClick={onPrimary} className="!min-h-11">
          {primaryAction}
        </SpaButton>
      ) : null}
    </SpaPanel>
  );
}
