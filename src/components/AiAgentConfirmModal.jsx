'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Modal de confirmación para activar/desactivar el agente IA de WhatsApp.
 */
export default function AiAgentConfirmModal({
  enabled,
  onConfirm,
  onCancel,
}) {
  const [saving, setSaving] = useState(false);
  const confirmRef = useRef(null);
  const willEnable = !enabled;

  useEffect(() => {
    confirmRef.current?.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !saving) onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel, saving]);

  const handleConfirm = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onConfirm(willEnable);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-agent-modal-title"
    >
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0 bg-navy-900/50 backdrop-blur-sm transition-opacity"
        onClick={() => {
          if (!saving) onCancel();
        }}
      />

      <div
        className="relative w-full max-w-[420px] overflow-hidden rounded-2xl border border-white/60 bg-white shadow-[0_24px_64px_rgba(15,23,42,0.28)]"
        style={{ animation: 'aiAgentModalIn 180ms ease-out' }}
      >
        <div
          className={`px-6 pt-6 pb-5 ${
            willEnable
              ? 'bg-gradient-to-br from-emerald-50 via-white to-white'
              : 'bg-gradient-to-br from-amber-50 via-white to-white'
          }`}
        >
          <div className="flex items-start gap-4">
            <div
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-sm ${
                willEnable
                  ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200/80'
                  : 'bg-amber-100 text-amber-700 ring-1 ring-amber-200/80'
              }`}
            >
              {willEnable ? (
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              ) : (
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">
                WhatsApp · Control seguro
              </p>
              <h2 id="ai-agent-modal-title" className="mt-1 text-lg font-bold tracking-tight text-navy-900">
                {willEnable ? '¿Activar Agente IA?' : '¿Desactivar Agente IA?'}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">
                {willEnable
                  ? 'El agente volverá a responder automáticamente los mensajes de WhatsApp de los pasajeros.'
                  : 'El agente dejará de responder por WhatsApp. Los mensajes entrantes no se atenderán de forma automática.'}
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-gray-100 bg-white/90 px-4 py-3 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-gray-500">Estado actual</span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                  enabled
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    enabled ? 'bg-emerald-500' : 'bg-gray-400'
                  }`}
                />
                {enabled ? 'Activo' : 'Inactivo'}
              </span>
            </div>
            <div className="mt-2.5 flex items-center justify-between gap-3 border-t border-gray-50 pt-2.5">
              <span className="text-xs font-medium text-gray-500">Después de confirmar</span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                  willEnable
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-amber-50 text-amber-700'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    willEnable ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                />
                {willEnable ? 'Activo' : 'Inactivo'}
              </span>
            </div>
          </div>

          {!willEnable ? (
            <p className="mt-3 text-[11px] leading-relaxed text-amber-800/90">
              Esta acción afecta el canal de atención automática. Podés reactivarlo en cualquier momento.
            </p>
          ) : (
            <p className="mt-3 text-[11px] leading-relaxed text-emerald-800/80">
              Solo operadores autorizados deberían cambiar este control.
            </p>
          )}
        </div>

        <div className="flex gap-2 border-t border-gray-100 bg-gray-50/80 px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={handleConfirm}
            disabled={saving}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition disabled:opacity-60 ${
              willEnable
                ? 'bg-emerald-600 hover:bg-emerald-700 hover:shadow-emerald-600/25'
                : 'bg-navy-900 hover:bg-navy-900/90'
            }`}
          >
            {saving
              ? 'Guardando…'
              : willEnable
                ? 'Sí, activar'
                : 'Sí, desactivar'}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes aiAgentModalIn {
          from {
            opacity: 0;
            transform: translateY(8px) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
}
