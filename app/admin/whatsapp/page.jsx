'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../../src/lib/supabase';
import Link from 'next/link';

const QR_EXPIRE_SECONDS = 55;
const STATUS_POLL_MS = 2500;

const LABELS = {
  connected: 'Conectado',
  connecting: 'Conectando…',
  disconnected: 'Desconectado',
  logged_out: 'Sesión cerrada',
  expired: 'Sesión expirada',
  need_scan: 'Esperando QR',
  unknown: 'Verificando…',
};

const LINE_META = {
  1: {
    name: 'Nueva línea',
    desc: 'Reservas por WhatsApp + OTPs de la app',
    accent: 'from-emerald-500/20 to-teal-500/5',
    ring: 'ring-emerald-500/20',
    iconBg: 'bg-emerald-500/15 text-emerald-400',
  },
  2: {
    name: 'Línea Principal',
    desc: 'Agente IA — reservas por WhatsApp',
    accent: 'from-sky-500/20 to-blue-500/5',
    ring: 'ring-sky-500/20',
    iconBg: 'bg-sky-500/15 text-sky-400',
  },
};

function statusStyle(status) {
  if (status === 'connected') {
    return {
      badge: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30',
      dot: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]',
      bar: 'bg-emerald-400',
    };
  }
  if (status === 'need_scan' || status === 'connecting') {
    return {
      badge: 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30',
      dot: 'bg-amber-400 animate-pulse',
      bar: 'bg-amber-400',
    };
  }
  return {
    badge: 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30',
    dot: 'bg-rose-400',
    bar: 'bg-rose-400',
  };
}

function formatPhone(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('549') && d.length === 13) return `+54 9 ${d.slice(3, 7)} ${d.slice(7, 9)}-${d.slice(9)}`;
  if (d.startsWith('54') && d.length === 12) return `+54 ${d.slice(2, 6)} ${d.slice(6, 8)}-${d.slice(8)}`;
  return `+${d}`;
}

function buildQrSrc(qr) {
  if (!qr) return null;
  if (qr.startsWith('data:image') || qr.startsWith('http')) return qr;
  return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=8&data=${encodeURIComponent(qr)}`;
}

async function getAuthHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function PhoneIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
    </svg>
  );
}

function WhatsAppIcon({ className = 'w-6 h-6' }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function CountdownRing({ seconds, total }) {
  const r = 14;
  const c = 2 * Math.PI * r;
  const progress = Math.max(0, Math.min(1, seconds / total));
  const urgent = seconds <= 10;
  return (
    <div className="relative w-9 h-9 flex items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 36 36">
        <circle cx="18" cy="18" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2.5" />
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          stroke={urgent ? '#fbbf24' : '#34d399'}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - progress)}
          className="transition-[stroke-dashoffset] duration-1000 linear"
        />
      </svg>
      <span className={`text-[10px] font-mono font-bold ${urgent ? 'text-amber-300' : 'text-white/80'}`}>
        {seconds}
      </span>
    </div>
  );
}

// ─── Modal QR ─────────────────────────────────────────────────────────────────

function QrModal({ modal, onClose, onRefresh, refreshing }) {
  const [countdown, setCountdown] = useState(QR_EXPIRE_SECONDS);
  const timerRef = useRef(null);
  const src = buildQrSrc(modal.qr);
  const showSpinner = refreshing || !src;

  useEffect(() => {
    if (refreshing || !modal.qr) return undefined;
    setCountdown(QR_EXPIRE_SECONDS);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          onRefresh();
          return QR_EXPIRE_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [modal.qr, onRefresh, refreshing]);

  useEffect(() => {
    if (refreshing) clearInterval(timerRef.current);
  }, [refreshing]);

  useEffect(() => {
    if (!modal.connected) return;
    const t = setTimeout(onClose, 2200);
    return () => clearTimeout(t);
  }, [modal.connected, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-[#020617]/80 backdrop-blur-md" onClick={refreshing ? undefined : onClose} />
      <div
        className={`relative w-full max-w-sm max-h-[min(88dvh,640px)] overflow-y-auto overscroll-contain rounded-2xl border shadow-2xl transition-all duration-300 ${
          modal.connected
            ? 'border-emerald-500/40 bg-gradient-to-b from-emerald-950/90 to-[#0a1628]'
            : 'border-white/10 bg-gradient-to-b from-[#122033] to-[#0a1220]'
        }`}
      >
        {!modal.connected && (
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent" />
        )}

        {!modal.connected && (
          <button
            type="button"
            onClick={onClose}
            disabled={refreshing}
            className="absolute top-2.5 right-2.5 z-10 rounded-lg p-1.5 text-white/40 hover:bg-white/5 hover:text-white/80 transition-colors disabled:opacity-30"
            aria-label="Cerrar"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        {modal.connected ? (
          <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 ring-2 ring-emerald-400/40">
              <svg className="w-7 h-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-xl font-bold text-white tracking-tight">¡Listo!</p>
              <p className="mt-0.5 text-emerald-300/90 text-sm font-medium">{modal.lineName} vinculada</p>
              <p className="mt-0.5 text-white/40 text-xs font-mono">{formatPhone(modal.phone)}</p>
            </div>
          </div>
        ) : (
          <div className="p-4 sm:p-5">
            <div className="mb-3 pr-7">
              <h3 className="text-base font-bold text-white tracking-tight">Escaneá el código QR</h3>
              <p className="mt-0.5 text-xs text-white/45">
                {modal.lineName}
                <span className="mx-1 text-white/20">·</span>
                <span className="font-mono text-white/60">{formatPhone(modal.phone)}</span>
              </p>
            </div>

            <div className="flex justify-center mb-3">
              {showSpinner ? (
                <div className="flex h-56 w-56 flex-col items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] sm:h-60 sm:w-60">
                  <svg className="h-7 w-7 animate-spin text-emerald-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <p className="text-[11px] text-white/50">
                    {refreshing ? 'Generando QR…' : 'Preparando…'}
                  </p>
                </div>
              ) : (
                <div className="rounded-xl bg-white p-2.5 shadow-[0_12px_32px_-16px_rgba(16,185,129,0.5)]">
                  <img
                    src={src}
                    alt="Código QR WhatsApp"
                    className="h-56 w-56 object-contain sm:h-60 sm:w-60"
                    key={src}
                  />
                </div>
              )}
            </div>

            <p className="mb-3 text-center text-[11px] leading-relaxed text-white/40">
              WhatsApp → Dispositivos vinculados → Vincular dispositivo
            </p>

            <div className="flex items-center justify-between gap-2 rounded-xl border border-white/5 bg-black/20 px-2.5 py-2">
              <div className="flex items-center gap-2 min-w-0">
                {!refreshing && src ? (
                  <CountdownRing seconds={countdown} total={QR_EXPIRE_SECONDS} />
                ) : (
                  <div className="h-9 w-9 rounded-full border border-white/10" />
                )}
                <p className="truncate text-xs font-semibold text-white/75">
                  {refreshing ? 'Regenerando…' : 'Esperando escaneo'}
                </p>
              </div>
              <button
                type="button"
                onClick={onRefresh}
                disabled={refreshing}
                className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-300 ring-1 ring-white/10 hover:bg-emerald-500/15 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <svg className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Nuevo QR
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tarjeta por línea ────────────────────────────────────────────────────────

function LineCard({ lineData, onRefresh, onQrReady }) {
  const [acting, setActing] = useState(false);
  const [localError, setLocalError] = useState('');
  const [localSnap, setLocalSnap] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showWebhook, setShowWebhook] = useState(false);

  // Preferir el estado del servidor salvo mientras hay una acción en curso.
  const snap = acting && localSnap ? localSnap : (localSnap && localSnap.qr ? localSnap : lineData);
  const style = statusStyle(snap.status);
  const meta = LINE_META[snap.index] || {
    name: `Línea ${snap.index}`,
    desc: '',
    accent: 'from-white/10 to-transparent',
    ring: 'ring-white/10',
    iconBg: 'bg-white/10 text-white/70',
  };

  async function callAction(action) {
    if (acting) return;
    setActing(true);
    setLocalError('');
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/whatsapp/lines', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action, agentCode: snap.agentCode }),
      });
      const json = await res.json();
      if (!json.ok) {
        setLocalError(json.error || 'Error inesperado');
      } else {
        setLocalSnap(json);
        await onRefresh?.();
        if (action === 'reset' || action === 'logout') {
          setLocalSnap(null);
        }
        if (json.qr) {
          onQrReady?.({
            agentCode: snap.agentCode,
            qr: json.qr,
            lineName: meta.name,
            phone: snap.phone,
          });
        }
      }
    } catch (err) {
      setLocalError(err?.message || 'Error de red');
    } finally {
      setActing(false);
    }
  }

  useEffect(() => {
    // Si el servidor ya reporta desconectado/conectado, no conservar snap local viejo.
    if (!acting) {
      setLocalSnap(null);
    }
  }, [lineData.status, lineData.connected, lineData.agentCode, acting]);

  function copyWebhook() {
    navigator.clipboard.writeText(snap.webhookUrl || '').then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <article
      className={`group relative flex flex-col rounded-3xl border transition-all duration-300 ${
        snap.connected
          ? 'border-emerald-500/25 bg-[#0b1a14]/80 shadow-[0_0_40px_-20px_rgba(16,185,129,0.35)]'
          : 'border-white/[0.08] bg-[#0d1524]/80 hover:border-white/15'
      }`}
    >
      <div className={`pointer-events-none absolute inset-0 rounded-3xl bg-gradient-to-br ${meta.accent} opacity-80`} />
      <div className={`absolute left-0 top-0 h-full w-1 rounded-l-3xl ${style.bar}`} />

      <div className="relative flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${meta.iconBg} ring-1 ${meta.ring}`}>
              <PhoneIcon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold text-white tracking-tight">{meta.name}</h2>
              <p className="mt-0.5 text-xs text-white/40 leading-relaxed">{meta.desc}</p>
            </div>
          </div>
          <span className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${style.badge}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
            {LABELS[snap.status] || snap.status}
          </span>
        </div>

        <div className="rounded-2xl border border-white/[0.06] bg-black/25 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30 mb-1.5">Número</p>
          <p className="text-lg font-semibold tracking-tight text-white font-mono">{formatPhone(snap.phone)}</p>
          <div className="mt-3 flex items-center gap-2 border-t border-white/[0.05] pt-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30">Código</span>
            <code className="truncate text-xs text-white/55 font-mono">{snap.agentCode}</code>
          </div>
        </div>

        {snap.connected ? (
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20">
              <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-emerald-300">Operativa</p>
              <p className="text-[11px] text-emerald-300/50">Lista para recibir y enviar mensajes</p>
            </div>
          </div>
        ) : null}

        {localError ? (
          <p className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
            {localError}
          </p>
        ) : null}

        {/* Acciones siempre visibles, justo debajo del número */}
        <div className="flex flex-col gap-2">
          {!snap.connected ? (
            <button
              type="button"
              disabled={acting}
              onClick={() => callAction('connect')}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 py-3.5 text-sm font-bold text-white shadow-[0_10px_30px_-12px_rgba(16,185,129,0.7)] transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {acting ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Generando QR…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 15.75l2.25 2.25m0 0l2.25-2.25M16.5 18v-5.25" />
                  </svg>
                  Conectar con QR
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              disabled={acting}
              onClick={() => callAction('connect')}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.03] px-3.5 py-3 text-sm font-medium text-white/70 hover:bg-white/[0.06] hover:text-white transition-all disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Reconectar
            </button>
          )}
          <button
            type="button"
            disabled={acting}
            onClick={() => callAction('reset')}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-2xl border border-rose-500/25 bg-rose-500/10 px-3 py-2.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/15 transition-all disabled:opacity-50"
            title="Cierra la sesión en whatsmeow y deja la línea lista para un QR nuevo"
          >
            Reiniciar para escanear
          </button>
        </div>

        <div className="border-t border-white/[0.05] pt-3">
          <button
            type="button"
            onClick={() => setShowWebhook((v) => !v)}
            className="flex w-full items-center justify-between text-[11px] font-medium text-white/35 hover:text-white/60 transition-colors"
          >
            <span>Webhook técnico</span>
            <svg
              className={`w-3.5 h-3.5 transition-transform ${showWebhook ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showWebhook ? (
            <div className="mt-2 rounded-xl border border-white/[0.06] bg-black/30 p-3">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="text-[10px] uppercase tracking-wider text-white/30 font-semibold">URL</p>
                <button
                  type="button"
                  onClick={copyWebhook}
                  className="text-[10px] font-semibold text-emerald-400/90 hover:text-emerald-300"
                >
                  {copied ? 'Copiado' : 'Copiar'}
                </button>
              </div>
              <p className="break-all font-mono text-[10px] leading-relaxed text-white/45">{snap.webhookUrl}</p>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function WhatsAppAdminPage() {
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState(null);
  const [qrModal, setQrModal] = useState(null);
  const [qrRefreshing, setQrRefreshing] = useState(false);
  const [showEnvHelp, setShowEnvHelp] = useState(false);
  const [resettingAll, setResettingAll] = useState(false);
  const pollRef = useRef(null);
  const qrPollRef = useRef(null);
  const refreshLockRef = useRef(false);

  const fetchLines = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/whatsapp/lines', { headers });
      const json = await res.json();
      if (json.ok && Array.isArray(json.lines)) {
        setLines(json.lines);
        setError('');
        return json.lines;
      }
      setError(json.error || 'Error al cargar las líneas');
    } catch (err) {
      setError(err?.message || 'Error de red');
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
    return null;
  }, []);

  useEffect(() => {
    fetchLines();
  }, [fetchLines]);

  useEffect(() => {
    clearInterval(pollRef.current);
    const needsPoll = (lines.length === 0 || lines.some((l) => !l.connected)) && !qrModal;
    if (!needsPoll) return undefined;
    pollRef.current = setInterval(fetchLines, 5000);
    return () => clearInterval(pollRef.current);
  }, [lines, fetchLines, qrModal]);

  useEffect(() => {
    clearInterval(qrPollRef.current);
    if (!qrModal || qrModal.connected) return undefined;

    qrPollRef.current = setInterval(async () => {
      const updated = await fetchLines();
      if (!updated) return;
      const line = updated.find((l) => l.agentCode === qrModal.agentCode);
      if (line?.connected) {
        setQrModal((prev) => (prev ? { ...prev, connected: true } : null));
      }
    }, STATUS_POLL_MS);

    return () => clearInterval(qrPollRef.current);
  }, [qrModal, fetchLines]);

  const handleQrRefresh = useCallback(async () => {
    if (!qrModal?.agentCode || refreshLockRef.current) return;
    refreshLockRef.current = true;
    setQrRefreshing(true);
    setQrModal((prev) => (prev ? { ...prev, qr: null } : null));
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/whatsapp/lines', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'refresh-qr', agentCode: qrModal.agentCode }),
      });
      const json = await res.json();
      if (json.ok && json.qr) {
        setQrModal((prev) => (prev ? { ...prev, qr: json.qr } : null));
      } else {
        const res2 = await fetch('/api/whatsapp/lines', {
          method: 'POST',
          headers,
          body: JSON.stringify({ action: 'connect', agentCode: qrModal.agentCode }),
        });
        const json2 = await res2.json();
        if (json2.ok && json2.qr) {
          setQrModal((prev) => (prev ? { ...prev, qr: json2.qr } : null));
        }
      }
    } catch {
      // silencioso
    } finally {
      setQrRefreshing(false);
      refreshLockRef.current = false;
    }
  }, [qrModal?.agentCode]);

  const closeModal = useCallback(() => {
    clearInterval(qrPollRef.current);
    setQrRefreshing(false);
    refreshLockRef.current = false;
    setQrModal(null);
  }, []);

  const handleResetAll = useCallback(async () => {
    if (resettingAll) return;
    setResettingAll(true);
    setError('');
    closeModal();
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/whatsapp/lines', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'reset-all' }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error || 'No se pudieron reiniciar las líneas');
      }
      await fetchLines();
    } catch (err) {
      setError(err?.message || 'Error de red al reiniciar');
    } finally {
      setResettingAll(false);
    }
  }, [resettingAll, closeModal, fetchLines]);

  const connectedCount = lines.filter((l) => l.connected).length;
  const allConnected = lines.length > 0 && connectedCount === lines.length;

  return (
    <div className="relative min-h-dvh w-full overflow-x-hidden overflow-y-auto bg-[#060b14] text-white">
      <div className="pointer-events-none fixed inset-0 -z-0">
        <div className="absolute -top-32 left-1/2 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-sky-500/5 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '28px 28px',
          }}
        />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-6xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-28">
        <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link
              href="/admin/dashboard"
              className="mb-3 inline-flex items-center gap-1.5 text-sm text-white/35 hover:text-white/70 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Dashboard
            </Link>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/25">
                <WhatsAppIcon className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Conexión WhatsApp</h1>
                <p className="mt-0.5 text-sm text-white/40">
                  Vinculá los teléfonos del Agente IA con un escaneo.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {!loading && lines.length > 0 && (
              <div className="hidden sm:flex items-center gap-2 rounded-2xl border border-white/8 bg-white/[0.03] px-3.5 py-2">
                <div className="flex -space-x-1">
                  {lines.map((l) => (
                    <span
                      key={l.agentCode}
                      className={`h-2.5 w-2.5 rounded-full ring-2 ring-[#060b14] ${
                        l.connected ? 'bg-emerald-400' : 'bg-white/20'
                      }`}
                    />
                  ))}
                </div>
                <span className="text-xs text-white/50">
                  <span className="font-semibold text-white/80">{connectedCount}</span>
                  /{lines.length} activas
                </span>
              </div>
            )}
            {lastRefresh && (
              <span className="hidden md:block text-[11px] text-white/25">
                {lastRefresh.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button
              type="button"
              disabled={resettingAll || loading}
              onClick={handleResetAll}
              className="inline-flex items-center gap-1.5 rounded-2xl border border-rose-500/25 bg-rose-500/10 px-3.5 py-2 text-sm font-medium text-rose-200 hover:bg-rose-500/15 transition-all disabled:opacity-50"
              title="Logout + disconnect en ambas líneas"
            >
              {resettingAll ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : null}
              Reiniciar ambas
            </button>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                fetchLines();
              }}
              className="inline-flex items-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-2 text-sm font-medium text-white/70 hover:bg-white/[0.07] hover:text-white transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Actualizar
            </button>
          </div>
        </div>

        {allConnected && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-5 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20">
              <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-emerald-300">Todas las líneas están operativas</p>
              <p className="text-xs text-emerald-300/50">WhatsApp listo para reservas y notificaciones.</p>
            </div>
          </div>
        )}

        {!allConnected && !loading && lines.length > 0 && (
          <div className="mb-5 hidden gap-2 sm:grid sm:grid-cols-3">
            {[
              ['1', 'Elegí la línea', 'Tocá Conectar en la tarjeta'],
              ['2', 'Abrí WhatsApp', 'Dispositivos vinculados'],
              ['3', 'Escaneá el QR', 'El modal se cierra solo'],
            ].map(([n, title, sub]) => (
              <div
                key={n}
                className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] text-xs font-bold text-white/50">
                  {n}
                </span>
                <div>
                  <p className="text-xs font-semibold text-white/80">{title}</p>
                  <p className="text-[11px] text-white/35">{sub}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center gap-4 py-24">
            <svg className="h-8 w-8 animate-spin text-emerald-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm text-white/40">Consultando estado de las líneas…</p>
          </div>
        )}

        {!loading && error && (
          <div className="mb-6 rounded-2xl border border-rose-500/25 bg-rose-500/10 px-5 py-4">
            <p className="text-sm font-semibold text-rose-300 mb-1">No se pudo cargar</p>
            <p className="text-xs text-rose-200/60">{error}</p>
          </div>
        )}

        {!loading && lines.length > 0 && (
          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
            {lines.map((line) => (
              <LineCard
                key={line.agentCode}
                lineData={line}
                onRefresh={fetchLines}
                onQrReady={setQrModal}
              />
            ))}
          </div>
        )}

        {!loading && (
          <div className="mt-10">
            <button
              type="button"
              onClick={() => setShowEnvHelp((v) => !v)}
              className="flex items-center gap-2 text-xs font-medium text-white/30 hover:text-white/55 transition-colors"
            >
              <svg
                className={`w-3.5 h-3.5 transition-transform ${showEnvHelp ? 'rotate-90' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              Variables de entorno (referencia)
            </button>
            {showEnvHelp ? (
              <div className="mt-3 rounded-2xl border border-white/[0.05] bg-white/[0.02] p-5">
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div>
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/30">Línea 1</p>
                    <div className="space-y-1.5 font-mono text-[11px]">
                      <p><span className="text-emerald-400/80">WHATSMEOW_AGENT_CODE</span> <span className="text-white/25">=</span> <span className="text-white/50">Profesional_Pasajeros</span></p>
                      <p><span className="text-emerald-400/80">WHATSMEOW_PHONE</span> <span className="text-white/25">=</span> <span className="text-white/50">+5493872138777</span></p>
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/30">Línea 2</p>
                    <div className="space-y-1.5 font-mono text-[11px]">
                      <p><span className="text-emerald-400/80">WHATSMEOW_AGENT_CODE_2</span> <span className="text-white/25">=</span> <span className="text-white/50">Profesional_1</span></p>
                      <p><span className="text-emerald-400/80">WHATSMEOW_PHONE_2</span> <span className="text-white/25">=</span> <span className="text-white/50">+5493873088777</span></p>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {qrModal && (
        <QrModal
          modal={qrModal}
          onClose={closeModal}
          onRefresh={handleQrRefresh}
          refreshing={qrRefreshing}
        />
      )}
    </div>
  );
}
