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

function qrImageUrl(qr) {
  if (!qr) return null;
  return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(qr)}`;
}

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
  const autoConnectRef = useRef(false);
  const connectedNotifiedRef = useRef(false);

  const applySnapshot = useCallback((data) => {
    if (!data || data.ok === false) return;
    setSnapshot(data);
    const status = String(data.status || 'unknown');
    onStatusChange?.(status);
  }, [onStatusChange]);

  const load = useCallback(async () => {
    try {
      setError('');
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
      setActing(false);
    }
  }, [applySnapshot]);

  // Abrir: carga inicial + Realtime + polling rápido hasta conectar.
  useEffect(() => {
    if (!open) {
      autoConnectRef.current = false;
      connectedNotifiedRef.current = false;
      setJustConnected(false);
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      return undefined;
    }

    setLoading(true);
    load();

    const poll = setInterval(() => {
      load();
    }, 1200);

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
              setSnapshot((prev) => ({ ...(prev || {}), status: value, connected: value === 'connected' }));
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

    const needsQr = !snapshot.qr
      || ['logged_out', 'disconnected', 'expired', 'unknown', 'need_scan'].includes(snapshot.status);

    if (!needsQr && snapshot.status !== 'connecting') return;

    autoConnectRef.current = true;
    runAction({ action: 'connect', linkMethod: 'qr', force: true });
  }, [open, loading, snapshot, runAction]);

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

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      onClick={required ? undefined : () => onClose?.()}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="wa-session-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-black/40"
      >
        <div className="relative border-b border-slate-100 px-5 py-4 text-center">
          <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 4v-4z" />
            </svg>
          </div>
          <h2 id="wa-session-title" className="text-[18px] font-bold text-navy-900">
            {required ? 'Reconectá WhatsApp' : 'Sesión WhatsApp'}
          </h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-slate-500">
            {required
              ? 'Para usar el dashboard tenés que vincular WhatsApp otra vez. Escaneá el QR con el celular de la empresa.'
              : `Wasender · ${snapshot?.config?.phone || '+5493873088777'}`}
          </p>
          {required ? (
            <p className="mt-1 text-[11.5px] font-semibold text-rose-600">
              No podés operar el panel hasta completar la conexión.
            </p>
          ) : null}
          {!required ? (
            <button
              type="button"
              onClick={() => onClose?.()}
              className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
              aria-label="Cerrar"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          ) : null}
        </div>

        <div className="relative space-y-4 px-5 py-4">
          {loading && !snapshot ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-navy-900" />
              Consultando estado…
            </div>
          ) : justConnected || status === 'connected' ? (
            <div className={`rounded-xl border px-4 py-6 text-center ${toneClasses.ok}`}>
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
                <svg className="h-7 w-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-[16px] font-bold">WhatsApp conectado</p>
              <p className="mt-1 text-[12.5px] opacity-80">
                Ya podés usar el dashboard.
              </p>
            </div>
          ) : (
            <>
              <div className={`rounded-xl border px-3.5 py-3 ${toneClasses[tone]}`}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">Estado</p>
                    <p className="text-[15px] font-bold">
                      {STATUS_LABELS[status] || status}
                    </p>
                  </div>
                  {waitingScan ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-semibold">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
                      Detectando…
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-[11px] opacity-70">
                  {snapshot?.config?.phone || '+5493873088777'}
                </p>
              </div>

              {missingPat ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-[12.5px] text-amber-900">
                  Falta configurar
                  {' '}
                  <code className="rounded bg-white/80 px-1">WASENDER_PERSONAL_ACCESS_TOKEN</code>
                  {' '}
                  en el servidor.
                </div>
              ) : null}

              {error ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-[12.5px] text-rose-700">
                  {error}
                </div>
              ) : null}

              {snapshot?.liveError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-[12.5px] text-rose-700">
                  Wasender: {snapshot.liveError}
                </div>
              ) : null}

              {(canShowQr || snapshot?.canReconnect) ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                  {snapshot?.qr ? (
                    <div className="flex flex-col items-center gap-3">
                      <img
                        src={qrImageUrl(snapshot.qr)}
                        alt="Código QR de WhatsApp"
                        className="h-[220px] w-[220px] rounded-xl border border-white bg-white p-2 shadow-sm"
                      />
                      <p className="text-center text-[12.5px] font-medium text-slate-600">
                        WhatsApp → Dispositivos vinculados → Vincular dispositivo
                      </p>
                      <p className="text-center text-[11.5px] text-slate-500">
                        Al escanear, el panel se desbloquea solo.
                      </p>
                      <button
                        type="button"
                        disabled={acting || missingPat}
                        onClick={() => runAction({ action: 'refresh-qr' })}
                        className="text-[12px] font-semibold text-navy-900 underline-offset-2 hover:underline disabled:opacity-50"
                      >
                        Actualizar QR
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3 py-4">
                      <span className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-navy-900" />
                      <p className="text-center text-[12.5px] text-slate-500">
                        Generando código QR…
                      </p>
                    </div>
                  )}
                </div>
              ) : null}

              {showPasskey ? (
                <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-4">
                  <p className="text-[12px] font-semibold uppercase tracking-wide text-indigo-700">
                    Passkey
                  </p>
                  <p className="mt-1 text-[12.5px] text-indigo-900/80">
                    Pegá este token en la extensión Device Link Helper de Chrome.
                  </p>
                  {snapshot?.passkey?.token ? (
                    <div className="mt-3 rounded-lg border border-indigo-200 bg-white px-3 py-2 font-mono text-[12px] break-all text-slate-800">
                      {snapshot.passkey.token}
                    </div>
                  ) : (
                    <p className="mt-2 text-[12.5px] text-indigo-800">
                      Esperando token… {snapshot?.passkey?.error || ''}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
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
          <div className="flex flex-col gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-4 sm:flex-row sm:justify-center">
            <button
              type="button"
              disabled={acting || missingPat}
              onClick={() => {
                autoConnectRef.current = true;
                runAction({ action: 'connect', linkMethod: 'qr', force: true });
              }}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-navy-900 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-navy-900/90 disabled:opacity-50"
            >
              {acting ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : null}
              {snapshot?.qr ? 'Regenerar QR' : 'Generar QR'}
            </button>
            {!required ? (
              <button
                type="button"
                disabled={acting || missingPat}
                onClick={() => runAction({ action: 'connect', linkMethod: 'passkey', force: true })}
                className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
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
