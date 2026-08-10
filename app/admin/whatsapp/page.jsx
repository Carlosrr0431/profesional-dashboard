'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../../src/lib/supabase';
import Link from 'next/link';

// ─── Constantes ───────────────────────────────────────────────────────────────

const QR_EXPIRE_SECONDS = 55; // segundos antes de auto-refrescar el QR (~60s es el límite real)
const STATUS_POLL_MS = 2500;  // polling rápido mientras el modal QR está abierto

// ─── Helpers ──────────────────────────────────────────────────────────────────

const LABELS = {
  connected: 'Conectado',
  connecting: 'Conectando…',
  disconnected: 'Desconectado',
  logged_out: 'Sesión cerrada',
  expired: 'Sesión expirada',
  need_scan: 'Esperando escaneo QR',
  unknown: 'Verificando…',
};

function statusBadge(status) {
  if (status === 'connected') return { color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', dot: 'bg-emerald-400' };
  if (status === 'need_scan' || status === 'connecting') return { color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', dot: 'bg-amber-400 animate-pulse' };
  return { color: 'bg-red-500/20 text-red-400 border-red-500/30', dot: 'bg-red-400' };
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
  return `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=8&data=${encodeURIComponent(qr)}`;
}

async function getAuthHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// ─── Modal QR ─────────────────────────────────────────────────────────────────

function QrModal({ modal, onClose, onRefresh }) {
  const [countdown, setCountdown] = useState(QR_EXPIRE_SECONDS);
  const timerRef = useRef(null);
  const src = buildQrSrc(modal.qr);

  // Reiniciar countdown cada vez que llega un QR nuevo
  useEffect(() => {
    setCountdown(QR_EXPIRE_SECONDS);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          onRefresh(); // auto-refresh antes de expirar
          return QR_EXPIRE_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [modal.qr, onRefresh]);

  // Estado de éxito: auto-cierre después de 2 s
  useEffect(() => {
    if (!modal.connected) return;
    const t = setTimeout(onClose, 2000);
    return () => clearTimeout(t);
  }, [modal.connected, onClose]);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className={`relative w-full max-w-sm rounded-2xl shadow-2xl transition-all duration-300 ${
        modal.connected
          ? 'bg-[#0d1f14] border border-emerald-600/40 p-8'
          : 'bg-[#111827] border border-white/10 p-6'
      }`}>

        {/* Botón cerrar (solo antes de conectar) */}
        {!modal.connected && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        {modal.connected ? (
          /* ── Estado éxito ── */
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="w-18 h-18 rounded-full bg-emerald-500/20 flex items-center justify-center ring-2 ring-emerald-500/30 p-4">
              <svg className="w-10 h-10 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-emerald-300 font-bold text-2xl">¡Conectado!</p>
              <p className="text-gray-400 text-sm mt-1">{modal.lineName}</p>
            </div>
          </div>
        ) : (
          /* ── Estado QR ── */
          <>
            {/* Título */}
            <div className="mb-5 pr-8">
              <h3 className="text-white font-bold text-lg">Escanear código QR</h3>
              <p className="text-gray-400 text-sm">{modal.lineName} · {formatPhone(modal.phone)}</p>
            </div>

            {/* QR */}
            <div className="flex justify-center mb-5">
              {src ? (
                <div className="rounded-2xl bg-white p-3 shadow-xl shadow-black/40">
                  <img
                    src={src}
                    alt="Código QR WhatsApp"
                    className="w-60 h-60 object-contain"
                    key={src}
                  />
                </div>
              ) : (
                <div className="w-60 h-60 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                  <svg className="w-10 h-10 text-gray-600 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </div>
              )}
            </div>

            {/* Instrucciones */}
            <ol className="text-gray-400 text-xs space-y-1.5 list-decimal list-inside mb-5">
              <li>Abrí <strong className="text-white">WhatsApp</strong> en tu teléfono</li>
              <li>Ir a <strong className="text-white">Ajustes → Dispositivos vinculados</strong></li>
              <li>Tocá <strong className="text-white">Vincular dispositivo</strong> y escaneá</li>
            </ol>

            {/* Footer: pulse + countdown + refresh */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs text-gray-400">Esperando escaneo...</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500">
                  Expira en{' '}
                  <span className={`font-mono font-semibold ${countdown <= 10 ? 'text-amber-400' : 'text-gray-400'}`}>
                    {countdown}s
                  </span>
                </span>
                <button
                  type="button"
                  onClick={onRefresh}
                  className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Actualizar
                </button>
              </div>
            </div>
          </>
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

  const snap = localSnap || lineData;
  const badge = statusBadge(snap.status);

  const lineNames = {
    1: { name: 'Nueva línea', icon: '🧳', desc: 'Agente IA — reservas WhatsApp + OTPs de la app' },
    2: { name: 'Línea Principal', icon: '🚕', desc: 'Agente IA — reservas por WhatsApp' },
  };
  const meta = lineNames[snap.index] || { name: `Línea ${snap.index}`, icon: '📱', desc: '' };

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
        onRefresh?.();
        // Si la respuesta trae QR, abrir modal en el padre
        if (json.qr) {
          onQrReady?.({ agentCode: snap.agentCode, qr: json.qr, lineName: meta.name, phone: snap.phone });
        }
      }
    } catch (err) {
      setLocalError(err?.message || 'Error de red');
    } finally {
      setActing(false);
    }
  }

  // Sincronizar snap externo cuando lineData cambia (ej: polling detecta connected)
  useEffect(() => {
    if (lineData.connected && localSnap && !localSnap.connected) {
      setLocalSnap(null); // ceder control al lineData actualizado
    }
  }, [lineData.connected, localSnap]);

  function copyWebhook() {
    navigator.clipboard.writeText(snap.webhookUrl || '').then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className={`flex flex-col gap-4 rounded-2xl border p-6 transition-all ${
      snap.connected
        ? 'bg-[#0d1f14]/60 border-emerald-600/30'
        : 'bg-[#111827]/70 border-white/10'
    }`}>

      {/* Encabezado */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-2xl select-none">{meta.icon}</span>
          <div className="min-w-0">
            <h2 className="text-white font-bold text-base truncate">{meta.name}</h2>
            <p className="text-gray-400 text-xs mt-0.5 leading-relaxed">{meta.desc}</p>
          </div>
        </div>
        <span className={`shrink-0 inline-flex items-center gap-1.5 border rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.color}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
          {LABELS[snap.status] || snap.status}
        </span>
      </div>

      {/* Teléfono + agent code */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-black/30 rounded-xl p-3 border border-white/5">
          <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-1">Número</p>
          <p className="text-white text-sm font-mono">{formatPhone(snap.phone)}</p>
        </div>
        <div className="bg-black/30 rounded-xl p-3 border border-white/5">
          <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-1">Agent Code</p>
          <p className="text-white text-sm font-mono truncate">{snap.agentCode}</p>
        </div>
      </div>

      {/* Webhook URL */}
      <div className="bg-black/30 rounded-xl p-3 border border-white/5">
        <div className="flex items-center justify-between gap-2 mb-1">
          <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider">Webhook URL</p>
          <button
            type="button"
            onClick={copyWebhook}
            className="text-[10px] font-semibold text-sky-400 hover:text-sky-300 transition-colors shrink-0"
          >
            {copied ? '¡Copiado!' : 'Copiar'}
          </button>
        </div>
        <p className="text-gray-300 text-[11px] font-mono break-all leading-relaxed">{snap.webhookUrl}</p>
      </div>

      {/* Estado conectado */}
      {snap.connected && (
        <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
          <svg className="w-5 h-5 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-emerald-300 text-sm font-semibold">Teléfono conectado y listo</p>
        </div>
      )}

      {/* Error */}
      {localError && (
        <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
          {localError}
        </p>
      )}

      {/* Botones */}
      <div className="flex gap-2 mt-auto pt-1">
        {!snap.connected && (
          <button
            type="button"
            disabled={acting}
            onClick={() => callAction('connect')}
            className="flex-1 flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold py-2.5 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {acting ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Conectando…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                Conectar
              </>
            )}
          </button>
        )}
        {snap.connected && (
          <button
            type="button"
            disabled={acting}
            onClick={() => callAction('connect')}
            className="flex items-center justify-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 text-xs font-medium py-2 px-3 rounded-lg transition-all disabled:opacity-50"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Reconectar
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function WhatsAppAdminPage() {
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState(null);
  const [qrModal, setQrModal] = useState(null); // { agentCode, qr, phone, lineName, connected }
  const pollRef = useRef(null);
  const qrPollRef = useRef(null); // polling rápido mientras el modal está abierto

  const fetchLines = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/whatsapp/lines', { headers });
      const json = await res.json();
      if (json.ok && Array.isArray(json.lines)) {
        setLines(json.lines);
        setError('');
        return json.lines;
      } else {
        setError(json.error || 'Error al cargar las líneas');
      }
    } catch (err) {
      setError(err?.message || 'Error de red');
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
    return null;
  }, []);

  // Carga inicial
  useEffect(() => {
    fetchLines();
  }, [fetchLines]);

  // Polling lento (5s) mientras alguna línea no está conectada Y el modal QR no está abierto
  useEffect(() => {
    clearInterval(pollRef.current);
    const needsPoll = (lines.length === 0 || lines.some((l) => !l.connected)) && !qrModal;
    if (!needsPoll) return;
    pollRef.current = setInterval(fetchLines, 5000);
    return () => clearInterval(pollRef.current);
  }, [lines, fetchLines, qrModal]);

  // Polling rápido (2.5s) mientras el modal QR está abierto para detectar conexión
  useEffect(() => {
    clearInterval(qrPollRef.current);
    if (!qrModal || qrModal.connected) return;

    qrPollRef.current = setInterval(async () => {
      const updated = await fetchLines();
      if (!updated) return;
      const line = updated.find((l) => l.agentCode === qrModal.agentCode);
      if (line?.connected) {
        setQrModal((prev) => prev ? { ...prev, connected: true } : null);
      }
    }, STATUS_POLL_MS);

    return () => clearInterval(qrPollRef.current);
  }, [qrModal, fetchLines]);

  // Handler para refrescar el QR desde el modal
  const handleQrRefresh = useCallback(async () => {
    if (!qrModal?.agentCode) return;
    try {
      const headers = await getAuthHeaders();
      // Intentar refresh-qr primero (QR ya generado por la sesión activa)
      const res = await fetch('/api/whatsapp/lines', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'refresh-qr', agentCode: qrModal.agentCode }),
      });
      const json = await res.json();
      if (json.ok && json.qr) {
        setQrModal((prev) => prev ? { ...prev, qr: json.qr } : null);
        return;
      }
      // Si refresh-qr falla o no devuelve QR (ok:false cuando expiró),
      // reconectar para generar uno nuevo
      const res2 = await fetch('/api/whatsapp/lines', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'connect', agentCode: qrModal.agentCode }),
      });
      const json2 = await res2.json();
      if (json2.ok && json2.qr) {
        setQrModal((prev) => prev ? { ...prev, qr: json2.qr } : null);
      }
    } catch {
      // silencioso
    }
  }, [qrModal?.agentCode]);

  const closeModal = useCallback(() => {
    clearInterval(qrPollRef.current);
    setQrModal(null);
  }, []);

  const allConnected = lines.length > 0 && lines.every((l) => l.connected);

  return (
    <div className="min-h-dvh bg-[#070d1a] px-4 py-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/admin/dashboard" className="text-gray-500 hover:text-gray-300 transition-colors text-sm">
                ← Dashboard
              </Link>
            </div>
            <h1 className="text-white text-2xl font-bold flex items-center gap-2">
              <svg className="w-6 h-6 text-green-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              Conexión WhatsApp
            </h1>
            <p className="text-gray-400 text-sm mt-1">
              Vinculá los dos teléfonos escaneando el código QR con WhatsApp.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {lastRefresh && (
              <span className="text-gray-600 text-xs hidden sm:block">
                Actualizado {lastRefresh.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button
              type="button"
              onClick={() => { setLoading(true); fetchLines(); }}
              className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-sm font-medium py-2 px-3 rounded-xl transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Actualizar
            </button>
          </div>
        </div>

        {/* Banner de éxito global */}
        {allConnected && (
          <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/25 rounded-2xl px-5 py-4 mb-6">
            <svg className="w-5 h-5 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-emerald-300 font-semibold">Ambas líneas están conectadas y operativas.</p>
          </div>
        )}

        {/* Instrucciones */}
        {!allConnected && !loading && lines.length > 0 && (
          <div className="bg-sky-500/10 border border-sky-500/20 rounded-2xl px-5 py-4 mb-6">
            <p className="text-sky-300 text-sm font-semibold mb-1">Cómo conectar</p>
            <ol className="text-sky-200/70 text-xs space-y-1 list-decimal list-inside">
              <li>Abrí WhatsApp en el teléfono correspondiente.</li>
              <li>Ir a <strong>Ajustes → Dispositivos vinculados → Vincular dispositivo</strong>.</li>
              <li>Tocá <strong>Conectar</strong> en la tarjeta y escaneá el QR que aparece.</li>
            </ol>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <svg className="w-8 h-8 text-sky-400 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-gray-400 text-sm">Cargando estado de las líneas…</p>
          </div>
        )}

        {/* Error global */}
        {!loading && error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl px-5 py-4 mb-6">
            <p className="text-red-400 font-semibold text-sm mb-1">Error al cargar</p>
            <p className="text-red-300/70 text-xs">{error}</p>
            <p className="text-red-300/50 text-xs mt-2">
              Revisá que las variables de entorno <code>WHATSMEOW_AGENT_CODE</code>, <code>WHATSMEOW_PHONE</code>,{' '}
              <code>WHATSMEOW_AGENT_CODE_2</code>, <code>WHATSMEOW_PHONE_2</code> y <code>WHATSMEOW_API_KEY</code> estén configuradas en Vercel.
            </p>
          </div>
        )}

        {/* Tarjetas de líneas */}
        {!loading && lines.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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

        {/* Variables de entorno requeridas */}
        {!loading && (
          <div className="mt-10 bg-[#0f1729]/60 border border-white/5 rounded-2xl p-5">
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-4">Variables de entorno requeridas (Vercel)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wider mb-2">Línea 1 — Nueva línea (Agente IA + OTPs)</p>
                <div className="space-y-1.5">
                  {[
                    ['WHATSMEOW_AGENT_CODE', 'Profesional_Pasajeros'],
                    ['WHATSMEOW_PHONE', '+5493872138777'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-baseline gap-2">
                      <code className="text-sky-400 text-[10px] font-mono">{k}</code>
                      <span className="text-gray-600 text-[10px]">=</span>
                      <code className="text-gray-400 text-[10px] font-mono">{v}</code>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wider mb-2">Línea 2 — Principal (Agente IA)</p>
                <div className="space-y-1.5">
                  {[
                    ['WHATSMEOW_AGENT_CODE_2', 'Profesional_1'],
                    ['WHATSMEOW_PHONE_2', '+5493873088777'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-baseline gap-2">
                      <code className="text-sky-400 text-[10px] font-mono">{k}</code>
                      <span className="text-gray-600 text-[10px]">=</span>
                      <code className="text-gray-400 text-[10px] font-mono">{v}</code>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-white/5">
              <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wider mb-2">Compartidas</p>
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                {[
                  ['WHATSMEOW_API_KEY', '(de Railway)'],
                  ['WHATSMEOW_API_URL', 'https://whatsmeow-api-production.up.railway.app'],
                  ['WHATSMEOW_WEBHOOK_SECRET', '(opcional, secreto)'],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-baseline gap-2">
                    <code className="text-sky-400 text-[10px] font-mono">{k}</code>
                    <span className="text-gray-600 text-[10px]">=</span>
                    <code className="text-gray-400 text-[10px] font-mono">{v}</code>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal QR — centrado sobre toda la página */}
      {qrModal && (
        <QrModal
          modal={qrModal}
          onClose={closeModal}
          onRefresh={handleQrRefresh}
        />
      )}
    </div>
  );
}
