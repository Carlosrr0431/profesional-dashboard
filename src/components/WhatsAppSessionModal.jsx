import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

const STATUS_LABELS = {
  connected: 'Conectada',
  connecting: 'Conectando…',
  disconnected: 'Desconectada',
  logged_out: 'Sesión cerrada',
  expired: 'Expirada',
  need_scan: 'Escaneá el código QR',
  need_passkey: 'Esperando Passkey',
  unknown: 'Verificando…',
};

function statusTone(status) {
  if (status === 'connected') return 'ok';
  if (status === 'connecting' || status === 'need_scan' || status === 'need_passkey') return 'warn';
  return 'bad';
}

function qrImageUrl(qr, bust) {
  if (!qr) return null;
  const base = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=8&data=${encodeURIComponent(qr)}`;
  return bust ? `${base}&t=${encodeURIComponent(bust)}` : base;
}

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function mergeSnapshot(prev, next) {
  if (!next || next.ok === false) return prev;
  // Evitar que un GET concurrente borre un QR recién generado.
  const keepQr = !next.qr
    && prev?.qr
    && next.status !== 'connected'
    && ['need_scan', 'connecting', 'logged_out', 'disconnected', 'expired', 'unknown'].includes(
      String(next.status || '')
    );
  return {
    ...next,
    qr: keepQr ? prev.qr : (next.qr || null),
  };
}

/**
 * Modal de sesión WhatsApp.
 * - required=true: bloquea el dashboard hasta reconectar (sin cerrar).
 * - Detecta conexión al instante vía Realtime + polling rápido.
 */
export default function WhatsAppSessionModal({
  open,
  onClose,
  onConnected,
  onStatusChange,
  required = false,
}) {
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState('');
  const [snapshot, setSnapshot] = useState(null);
  const [copied, setCopied] = useState(false);
  const [justConnected, setJustConnected] = useState(false);
  const [qrBust, setQrBust] = useState(0);
  const autoConnectRef = useRef(false);
  const connectedNotifiedRef = useRef(false);
  const actingRef = useRef(false);
  const lastQrRef = useRef(null);

  const applySnapshot = useCallback((data) => {
    if (!data || data.ok === false) return;
    setSnapshot((prev) => {
      const merged = mergeSnapshot(prev, data);
      const nextQr = merged?.qr || null;
      if (nextQr && nextQr !== lastQrRef.current) {
        lastQrRef.current = nextQr;
        setQrBust(Date.now());
      }
      if (!nextQr) lastQrRef.current = null;
      return merged;
    });
    const status = String(data.status || 'unknown');
    onStatusChange?.(status);
  }, [onStatusChange]);

  const load = useCallback(async () => {
    if (actingRef.current) return null;
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/whatsapp/session', {
        method: 'GET',
        headers,
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        throw new Error(data?.error || 'No se pudo consultar el estado de WhatsApp');
      }
      applySnapshot(data);
      return data;
    } catch (err) {
      setError(err?.message || 'Error al cargar la sesión');
      return null;
    } finally {
      setLoading(false);
    }
  }, [applySnapshot]);

  const runAction = useCallback(async (body) => {
    actingRef.current = true;
    setActing(true);
    setError('');
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/whatsapp/session', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        throw new Error(data?.error || 'No se pudo completar la acción');
      }
      applySnapshot(data);
      return data;
    } catch (err) {
      setError(err?.message || 'Error al vincular');
      return null;
    } finally {
      actingRef.current = false;
      setActing(false);
    }
  }, [applySnapshot]);

  const regenerateQr = useCallback(() => (
    runAction({ action: 'connect', linkMethod: 'qr', force: true })
  ), [runAction]);

  // Abrir: carga inicial + Realtime + polling rápido hasta conectar.
  useEffect(() => {
    if (!open) {
      autoConnectRef.current = false;
      connectedNotifiedRef.current = false;
      lastQrRef.current = null;
      setJustConnected(false);
      setQrBust(0);
      return undefined;
    }

    setLoading(true);
    load();

    const poll = setInterval(() => {
      load();
    }, 1500);

    const channel = supabase
      .channel(`wasender_session_modal_${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'settings' },
        (payload) => {
          const key = payload?.new?.key || payload?.old?.key;
          if (!String(key || '').startsWith('wasender_session_')) return;

          if (String(key) === 'wasender_session_status') {
            const value = String(payload?.new?.value || '').toLowerCase();
            if (value) {
              onStatusChange?.(value);
              setSnapshot((prev) => ({
                ...(prev || {}),
                status: value,
                connected: value === 'connected',
                ...(value === 'connected' ? { qr: null } : {}),
              }));
            }
          }

          if (String(key) === 'wasender_session_qr') {
            const qr = payload?.new?.value || '';
            if (qr) {
              setSnapshot((prev) => ({
                ...(prev || {}),
                status: prev?.status === 'connected' ? prev.status : 'need_scan',
                qr,
              }));
              if (qr !== lastQrRef.current) {
                lastQrRef.current = qr;
                setQrBust(Date.now());
              }
            }
          }

          load();
        }
      )
      .subscribe();

    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [open, load, onStatusChange]);

  // Auto-generar QR al abrir si hace falta reconectar.
  useEffect(() => {
    if (!open || loading || !snapshot) return;
    if (autoConnectRef.current) return;
    if (snapshot.connected || snapshot.status === 'connected') return;
    if (snapshot.config && !snapshot.config.hasPersonalAccessToken) return;

    // Si ya hay QR fresco en need_scan, no forzar otro connect.
    if (snapshot.qr && snapshot.status === 'need_scan') {
      autoConnectRef.current = true;
      return;
    }

    const needsConnect = !snapshot.qr
      || ['logged_out', 'disconnected', 'expired', 'unknown'].includes(snapshot.status);

    if (!needsConnect) return;

    autoConnectRef.current = true;
    regenerateQr();
  }, [open, loading, snapshot, regenerateQr]);

  // Detectar conexión al instante → feedback breve; el padre desbloquea el dashboard.
  useEffect(() => {
    if (!open) return;
    const status = snapshot?.status;
    if (status !== 'connected') return;
    if (connectedNotifiedRef.current) return;

    connectedNotifiedRef.current = true;
    setJustConnected(true);
    onStatusChange?.('connected');
    onConnected?.();
  }, [open, snapshot?.status, onConnected, onStatusChange]);

  const handleCopyPasskey = async () => {
    const token = snapshot?.passkey?.token;
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('No se pudo copiar el token. Copialo manualmente.');
    }
  };

  if (!open) return null;

  const status = snapshot?.status || 'unknown';
  const tone = justConnected ? 'ok' : statusTone(status);
  const toneClasses = {
    ok: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warn: 'bg-amber-50 text-amber-800 border-amber-200',
    bad: 'bg-rose-50 text-rose-700 border-rose-200',
  };
  const canShowQr = Boolean(snapshot?.qr)
    || status === 'need_scan'
    || status === 'logged_out'
    || status === 'disconnected'
    || status === 'expired';
  const showPasskey = status === 'need_passkey' || Boolean(snapshot?.passkey?.token);
  const missingPat = snapshot?.config && !snapshot.config.hasPersonalAccessToken;
  const waitingScan = status === 'need_scan' || status === 'connecting' || Boolean(snapshot?.qr);
  const qrUrl = qrImageUrl(snapshot?.qr, qrBust);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-950/70 px-3 py-3 backdrop-blur-sm sm:items-center sm:px-4 sm:py-6"
      onClick={required ? undefined : () => onClose?.()}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="wa-session-title"
        onClick={(e) => e.stopPropagation()}
        className="my-auto flex w-full max-w-md max-h-[min(92dvh,680px)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-black/40"
      >
        <div className="relative shrink-0 border-b border-slate-100 px-4 py-3 text-center sm:px-5 sm:py-3.5">
          <h2 id="wa-session-title" className="text-[16px] font-bold text-navy-900 sm:text-[17px]">
            {required ? 'Reconectá WhatsApp' : 'Sesión WhatsApp'}
          </h2>
          <p className="mt-0.5 text-[12px] leading-snug text-slate-500">
            {required
              ? 'Escaneá el QR con el celular de la empresa para usar el dashboard.'
              : `Wasender · ${snapshot?.config?.phone || '+5493873088777'}`}
          </p>
          {required ? (
            <p className="mt-1 text-[11px] font-semibold text-rose-600">
              El panel queda bloqueado hasta completar la conexión.
            </p>
          ) : null}
          {!required ? (
            <button
              type="button"
              onClick={() => onClose?.()}
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
              aria-label="Cerrar"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3 sm:px-5">
          {loading && !snapshot ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-navy-900" />
              Consultando estado…
            </div>
          ) : justConnected || status === 'connected' ? (
            <div className={`rounded-xl border px-4 py-5 text-center ${toneClasses.ok}`}>
              <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
                <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-[15px] font-bold">WhatsApp conectado</p>
              <p className="mt-1 text-[12px] opacity-80">Ya podés usar el dashboard.</p>
            </div>
          ) : (
            <>
              <div className={`rounded-xl border px-3 py-2.5 ${toneClasses[tone]}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80">Estado</p>
                    <p className="truncate text-[14px] font-bold">
                      {STATUS_LABELS[status] || status}
                    </p>
                    <p className="truncate text-[11px] opacity-70">
                      {snapshot?.config?.phone || '+5493873088777'}
                    </p>
                  </div>
                  {waitingScan ? (
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/70 px-2 py-1 text-[10px] font-semibold">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                      Detectando…
                    </span>
                  ) : null}
                </div>
              </div>

              {missingPat ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] text-amber-900">
                  Falta configurar
                  {' '}
                  <code className="rounded bg-white/80 px-1">WASENDER_PERSONAL_ACCESS_TOKEN</code>
                  {' '}
                  en el servidor.
                </div>
              ) : null}

              {error ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[12px] text-rose-700">
                  {error}
                </div>
              ) : null}

              {snapshot?.liveError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[12px] text-rose-700">
                  Wasender: {snapshot.liveError}
                </div>
              ) : null}

              {(canShowQr || snapshot?.canReconnect) ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                  {qrUrl ? (
                    <div className="flex flex-col items-center gap-2">
                      <img
                        key={`${qrBust}-${String(snapshot.qr).slice(0, 24)}`}
                        src={qrUrl}
                        alt="Código QR de WhatsApp"
                        className="h-[180px] w-[180px] rounded-xl border border-white bg-white p-1.5 shadow-sm sm:h-[190px] sm:w-[190px]"
                      />
                      <p className="text-center text-[11.5px] font-medium leading-snug text-slate-600">
                        WhatsApp → Dispositivos vinculados → Vincular dispositivo
                      </p>
                      <p className="text-center text-[11px] text-slate-500">
                        Al escanear, el panel se desbloquea solo.
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 py-3">
                      <span className="h-7 w-7 animate-spin rounded-full border-2 border-slate-300 border-t-navy-900" />
                      <p className="text-center text-[12px] text-slate-500">
                        Generando código QR…
                      </p>
                    </div>
                  )}
                </div>
              ) : null}

              {showPasskey ? (
                <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700">
                    Passkey
                  </p>
                  <p className="mt-1 text-[12px] text-indigo-900/80">
                    Pegá este token en la extensión Device Link Helper de Chrome.
                  </p>
                  {snapshot?.passkey?.token ? (
                    <div className="mt-2 rounded-lg border border-indigo-200 bg-white px-3 py-2 font-mono text-[11px] break-all text-slate-800">
                      {snapshot.passkey.token}
                    </div>
                  ) : (
                    <p className="mt-2 text-[12px] text-indigo-800">
                      Esperando token… {snapshot?.passkey?.error || ''}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={!snapshot?.passkey?.token || acting}
                      onClick={handleCopyPasskey}
                      className="rounded-lg bg-indigo-700 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-indigo-800 disabled:opacity-50"
                    >
                      {copied ? 'Copiado' : 'Copiar token'}
                    </button>
                    <button
                      type="button"
                      disabled={acting || missingPat}
                      onClick={() => runAction({ action: 'refresh-passkey' })}
                      className="rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-indigo-800 hover:bg-indigo-50 disabled:opacity-50"
                    >
                      Renovar token
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>

        {!justConnected && status !== 'connected' ? (
          <div className="shrink-0 border-t border-slate-100 bg-slate-50/90 px-4 py-3 sm:px-5">
            <button
              type="button"
              disabled={acting || missingPat}
              onClick={() => {
                autoConnectRef.current = true;
                regenerateQr();
              }}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-navy-900 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-navy-900/90 disabled:opacity-50"
            >
              {acting ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : null}
              {snapshot?.qr ? 'Actualizar QR' : 'Generar QR'}
            </button>
            {!required ? (
              <button
                type="button"
                disabled={acting || missingPat}
                onClick={() => runAction({ action: 'connect', linkMethod: 'passkey', force: true })}
                className="mt-2 inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Vincular con Passkey
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
