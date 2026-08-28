'use client';

import { useEffect, useRef, useState } from 'react';
import { formatArs } from '../shared/money';
import { haptic } from '../shared/ui';
import {
  CANCEL_REASONS,
  TRIP_ACCEPT_TIMEOUT,
  formatOfferDistance,
  formatOfferDuration,
  getOfferDisplay,
  remainingAcceptSeconds,
} from './tripOffer';
import { startOfferAlert, stopOfferAlert, unlockOfferAlert } from './offerAlert';

export default function NewTripOffer({ trip, busy, onAccept, onReject }) {
  const [countdown, setCountdown] = useState(() => remainingAcceptSeconds(trip));
  const [showReasons, setShowReasons] = useState(false);
  const decidedRef = useRef(false);
  const onRejectRef = useRef(onReject);
  const tickRef = useRef(null);
  const timeoutRef = useRef(null);

  useEffect(() => { onRejectRef.current = onReject; }, [onReject]);

  const clearTimers = () => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    tickRef.current = null;
    timeoutRef.current = null;
  };

  const expireOffer = () => {
    if (decidedRef.current) return;
    decidedRef.current = true;
    clearTimers();
    stopOfferAlert();
    setCountdown(0);
    onRejectRef.current?.('Tiempo agotado');
  };

  const armTimers = (seconds) => {
    clearTimers();
    if (seconds <= 0) {
      expireOffer();
      return;
    }
    tickRef.current = setInterval(() => {
      setCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);
    timeoutRef.current = setTimeout(expireOffer, seconds * 1000);
  };

  useEffect(() => {
    decidedRef.current = false;
    setShowReasons(false);
    const initial = remainingAcceptSeconds(trip);
    setCountdown(initial);
    if (!trip?.id) {
      stopOfferAlert();
      return undefined;
    }
    unlockOfferAlert();
    startOfferAlert();
    haptic(40);
    armTimers(initial);
    return () => {
      clearTimers();
      stopOfferAlert();
    };
  }, [trip?.id, trip?.assigned_at]);

  if (!trip) return null;

  const display = getOfferDisplay(trip);
  const urgent = countdown <= 10;
  const progress = Math.max(0, (countdown / TRIP_ACCEPT_TIMEOUT) * 100);

  const accept = async () => {
    if (busy || decidedRef.current) return;
    decidedRef.current = true;
    clearTimers();
    stopOfferAlert();
    haptic(16);
    const ok = await onAccept?.();
    if (ok === false) {
      decidedRef.current = false;
      const remaining = remainingAcceptSeconds(trip);
      setCountdown(remaining);
      if (remaining > 0) {
        startOfferAlert();
        armTimers(remaining);
      } else {
        expireOffer();
      }
    }
  };

  const reject = (reason) => {
    if (busy || decidedRef.current) return;
    decidedRef.current = true;
    clearTimers();
    stopOfferAlert();
    haptic(20);
    setShowReasons(false);
    onReject?.(reason);
  };

  return (
    <div className="spa-offer">
      <div className="spa-offer-progress" aria-hidden="true">
        <span
          className={urgent ? 'is-urgent' : ''}
          style={{ width: `${progress}%` }}
        />
      </div>

      {showReasons ? (
        <div className="spa-offer-reasons">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[16px] font-semibold tracking-tight text-navy-900">Motivo del rechazo</h2>
            <button
              type="button"
              className="text-[13px] font-semibold text-slate-500"
              onClick={() => setShowReasons(false)}
            >
              Cerrar
            </button>
          </div>
          <div className="grid gap-1.5">
            {CANCEL_REASONS.map((reason) => (
              <button
                key={reason}
                type="button"
                disabled={busy}
                className="spa-offer-reason"
                onClick={() => reject(reason)}
              >
                {reason}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="spa-offer-head">
            <div className="min-w-0">
              <p className="spa-offer-title">
                {display.isAccumulated ? 'Viaje acumulado' : 'Nuevo viaje'}
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {display.passengerAppTrip ? <span className="spa-offer-chip">App</span> : null}
                {display.whatsAppTrip ? <span className="spa-offer-chip">WhatsApp</span> : null}
                {display.isAccumulated ? <span className="spa-offer-chip spa-offer-chip--warn">{display.stopCountLabel}</span> : null}
              </div>
            </div>
            <div className={`spa-offer-timer ${urgent ? 'is-urgent' : ''}`} aria-label={`${countdown} segundos para aceptar`}>
              {countdown}s
            </div>
          </div>

          <div className="spa-person">
            <span className="spa-avatar spa-avatar--lg">P</span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">Pasajero</p>
              <p className="truncate text-[16px] font-semibold text-navy-900">{trip.passenger_name || 'Pasajero'}</p>
            </div>
          </div>

          <div className="spa-route spa-route--offer">
            {display.pickupAddress ? (
              <p className="spa-route-line">
                <span className="spa-route-dot" />
                <span>{display.pickupAddress}</span>
              </p>
            ) : null}
            {display.waypoints.map((stop, index) => (
              <p key={`${stop.address || 'stop'}-${index}`} className="spa-route-line">
                <span className="spa-route-dot spa-route-dot--stop" />
                <span>{stop.address || `Parada ${index + 1}`}</span>
              </p>
            ))}
            <p className="spa-route-line">
              <span className="spa-route-dot spa-route-dot--dest" />
              <span>{display.destinationAddress}</span>
            </p>
          </div>

          <div className="spa-offer-stats">
            <div>
              <strong>{formatOfferDistance(trip.distance_km)}</strong>
              <span>Distancia</span>
            </div>
            <div>
              <strong>{formatOfferDuration(trip.duration_minutes)}</strong>
              <span>Duración</span>
            </div>
            <div className="is-price">
              <strong>{trip.price != null ? formatArs(trip.price) : 'A definir'}</strong>
              <span>{trip.price != null ? 'Total' : 'Al bajar'}</span>
            </div>
          </div>

          {display.notes ? (
            <p className="spa-offer-notes">{display.notes}</p>
          ) : null}

          <div className="spa-offer-actions">
            <button
              type="button"
              className="spa-offer-accept"
              disabled={busy}
              onClick={accept}
            >
              {busy ? 'Confirmando…' : 'Aceptar viaje'}
            </button>
            <button
              type="button"
              className="spa-offer-reject"
              disabled={busy}
              onClick={() => {
                haptic(8);
                setShowReasons(true);
              }}
            >
              Rechazar viaje
            </button>
          </div>
        </>
      )}
    </div>
  );
}
