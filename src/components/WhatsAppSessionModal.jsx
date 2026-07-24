import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const STATUS_LABELS = {
  connected: 'Conectada',
  connecting: 'Conectando…',
  disconnected: 'Desconectada',
  logged_out: 'Sesión cerrada',
  expired: 'Expirada',
  need_scan: 'Esperando escaneo QR',
  need_passkey: 'Esperando Passkey',
  unknown: 'Desconocido',
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

export default function WhatsAppSessionModal({ open, onClose }) {
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState('');
  const [snapshot, setSnapshot] = useState(null);
  const [copied, setCopied] = useState(false);

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
      setSnapshot(data);
    } catch (err) {
      setError(err?.message || 'Error al cargar la sesión');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    setLoading(true);
    load();

    const poll = setInterval(load, 5000);
    const channel = supabase
      .channel('wasender_session_settings')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'settings' },
        (payload) => {
          const key = payload?.new?.key || payload?.old?.key;
          if (String(key || '').startsWith('wasender_session_')) {
            load();
          }
        }
      )
      .subscribe();

    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [open, load]);

  const runAction = async (body) => {
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
      setSnapshot(data);
    } catch (err) {
      setError(err?.message || 'Error al vincular');
    } finally {
      setActing(false);
    }
  };

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
  const tone = statusTone(status);
  const toneClasses = {
    ok: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warn: 'bg-amber-50 text-amber-800 border-amber-200',
    bad: 'bg-rose-50 text-rose-700 border-rose-200',
  };
  const canShowQr = Boolean(snapshot?.qr) || status === 'need_scan' || status === 'logged_out' || status === 'disconnected' || status === 'expired';
  const showPasskey = status === 'need_passkey' || Boolean(snapshot?.passkey?.token);
  const missingPat = snapshot?.config && !snapshot.config.hasPersonalAccessToken;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="wa-session-title"
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/20"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 id="wa-session-title" className="text-[17px] font-bold text-navy-900">
              Sesión WhatsApp
            </h2>
            <p className="mt-0.5 text-[12.5px] text-slate-500">
              Wasender · {snapshot?.config?.phone || '+5493873088777'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
            aria-label="Cerrar"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {loading && !snapshot ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-navy-900" />
              Consultando estado…
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
                  <button
                    type="button"
                    onClick={load}
                    disabled={acting}
                    className="rounded-lg border border-current/20 bg-white/50 px-2.5 py-1.5 text-[11px] font-semibold hover:bg-white/80 disabled:opacity-50"
                  >
                    Actualizar
                  </button>
                </div>
                {snapshot?.updatedAt ? (
                  <p className="mt-1 text-[11px] opacity-70">
                    Última actualización: {new Date(snapshot.updatedAt).toLocaleString('es-AR')}
                  </p>
                ) : null}
              </div>

              {missingPat ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-[12.5px] text-amber-900">
                  Para generar el QR necesitás configurar en el servidor
                  {' '}
                  <code className="rounded bg-white/80 px-1">WASENDER_PERSONAL_ACCESS_TOKEN</code>
                  {' '}
                  y, opcionalmente,
                  {' '}
                  <code className="rounded bg-white/80 px-1">WASENDER_SESSION_ID</code>.
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

              {status === 'connected' ? (
                <p className="text-[13px] leading-relaxed text-slate-600">
                  La sesión está activa. El agente de WhatsApp puede enviar y recibir mensajes.
                </p>
              ) : (
                <p className="text-[13px] leading-relaxed text-slate-600">
                  La sesión está cerrada o desconectada. Generá un QR, escanealo con WhatsApp
                  (Dispositivos vinculados) y esperá a que el estado pase a Conectada.
                </p>
              )}

              {(canShowQr || snapshot?.canReconnect) && status !== 'connected' ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                  {snapshot?.qr ? (
                    <div className="flex flex-col items-center gap-3">
                      <img
                        src={qrImageUrl(snapshot.qr)}
                        alt="Código QR de WhatsApp"
                        className="h-[220px] w-[220px] rounded-xl border border-white bg-white p-2 shadow-sm"
                      />
                      <p className="text-center text-[12px] text-slate-500">
                        Escaneá este QR desde WhatsApp → Dispositivos vinculados
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
                    <div className="flex flex-col items-center gap-3 py-2">
                      <div className="flex h-28 w-28 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white text-slate-400" style={{ width: 112, height: 112 }}>
                        <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2M8 8h.01M12 8h.01M16 8h.01M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01" />
                        </svg>
                      </div>
                      <p className="text-center text-[12.5px] text-slate-500">
                        Todavía no hay un QR disponible. Tocá el botón para generarlo.
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
                    Pegá este token en la extensión Device Link Helper de Chrome para completar la vinculación.
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

        <div className="flex flex-col gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-4 sm:flex-row sm:justify-end">
          {status !== 'connected' ? (
            <>
              <button
                type="button"
                disabled={acting || missingPat}
                onClick={() => runAction({ action: 'connect', linkMethod: 'qr', force: true })}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-navy-900 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-navy-900/90 disabled:opacity-50"
              >
                {acting ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                ) : (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m0 14v1m8-8h1M3 12h1m15.364 6.364l.707.707M5.636 5.636l.707.707m12.728 0l.707-.707M5.636 18.364l.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                )}
                Generar QR / Vincular
              </button>
              <button
                type="button"
                disabled={acting || missingPat}
                onClick={() => runAction({ action: 'connect', linkMethod: 'passkey', force: true })}
                className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Vincular con Passkey
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-xl bg-navy-900 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-navy-900/90"
            >
              Listo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
