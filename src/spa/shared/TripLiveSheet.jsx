'use client';

import { SpaButton, SpaIcon, SpaKicker, SpaPanel } from './ui';

function initials(name) {
  const text = String(name || '').trim();
  return (text.charAt(0) || '?').toUpperCase();
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
