'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { useToast } from '../context/ToastContext';
import {
  BULK_CHANNEL_SMS,
  BULK_CHANNEL_WHATSAPP,
  bulkMaxBody,
  bulkMaxRecipients,
  composeBulkSmsText,
  estimateBulkSmsDurationMs,
  formatPhoneLocal,
  normalizeHttpUrl,
  parseBulkSmsRecipients,
  recipientReasonLabel,
  smsSegmentCount,
} from '../lib/bulkSms';

function formatWhen(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('es-AR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(ms) {
  const total = Math.max(0, Math.round(Number(ms) / 1000));
  if (total < 60) return `${total} s`;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes < 60) return seconds ? `${minutes} min ${seconds} s` : `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function statusLabel(status) {
  if (status === 'queued') return 'En cola';
  if (status === 'running') return 'Enviando';
  if (status === 'done') return 'Listo';
  if (status === 'cancelled') return 'Cancelado';
  return status || '—';
}

function statusClass(status) {
  if (status === 'running' || status === 'queued') return 'bg-sky-50 text-sky-800 border-sky-100';
  if (status === 'done') return 'bg-emerald-50 text-emerald-800 border-emerald-100';
  if (status === 'cancelled') return 'bg-slate-100 text-slate-600 border-slate-200';
  return 'bg-light-100 text-gray-600 border-light-300';
}

function channelLabel(channel) {
  return channel === BULK_CHANNEL_WHATSAPP ? 'WhatsApp' : 'SMS';
}

export default function BulkSmsPanel({ onBack }) {
  const toast = useToast();
  const { getAccessToken } = useAdminAuth();
  const [channel, setChannel] = useState(BULK_CHANNEL_SMS);
  const [phones, setPhones] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [respectQuietHours, setRespectQuietHours] = useState(true);
  const [campaigns, setCampaigns] = useState([]);
  const [gatewayConfigured, setGatewayConfigured] = useState(true);
  const [whatsappConfigured, setWhatsappConfigured] = useState(true);
  const [loadingList, setLoadingList] = useState(true);
  const [missingTable, setMissingTable] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const isWhatsapp = channel === BULK_CHANNEL_WHATSAPP;
  const parsed = useMemo(() => parseBulkSmsRecipients(phones), [phones]);
  const composedText = useMemo(
    () => composeBulkSmsText({ body, link, imageUrl, channel }),
    [body, link, imageUrl, channel],
  );
  const previewImage = normalizeHttpUrl(imageUrl);
  const segments = smsSegmentCount(composedText);
  const maxRecipients = bulkMaxRecipients(channel);
  const sendableCount = Math.min(parsed.valid.length, maxRecipients);
  const eta = formatDuration(estimateBulkSmsDurationMs(sendableCount, channel));
  const channelReady = isWhatsapp ? whatsappConfigured : gatewayConfigured;
  const hasContent = Boolean(composedText) || (isWhatsapp && Boolean(previewImage));

  const authHeaders = useCallback(async () => {
    const token = await getAccessToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }, [getAccessToken]);

  const loadCampaigns = useCallback(async () => {
    try {
      const response = await fetch('/api/sms-campaigns', { headers: await authHeaders() });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 503 && payload.missingTable) {
        setMissingTable(true);
        setCampaigns([]);
        return;
      }
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error || 'No se pudieron cargar las campañas');
      }
      setMissingTable(false);
      setCampaigns(Array.isArray(payload.campaigns) ? payload.campaigns : []);
      setGatewayConfigured(payload.gatewayConfigured !== false);
      setWhatsappConfigured(payload.whatsappConfigured !== false);
    } catch (error) {
      toast.error(error.message || 'Error al cargar la difusión');
    } finally {
      setLoadingList(false);
    }
  }, [authHeaders, toast]);

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  useEffect(() => {
    const active = campaigns.some((row) => row.status === 'queued' || row.status === 'running');
    if (!active) return undefined;
    const timer = setInterval(() => {
      loadCampaigns();
    }, 8000);
    return () => clearInterval(timer);
  }, [campaigns, loadCampaigns]);

  const canSubmit = sendableCount > 0 && hasContent && !submitting && channelReady && !missingTable;

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const response = await fetch('/api/sms-campaigns', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          phones,
          body,
          link,
          imageUrl,
          channel,
          respectQuietHours,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'No se pudo encolar el envío');
      }
      toast.success(
        isWhatsapp
          ? `Encolados ${payload.queuedCount} WhatsApp. Salen uno cada 30 s, sin mezclarse con los viajes.`
          : `Encolados ${payload.queuedCount} SMS. Salen de a uno, sin saturar el celular.`,
      );
      setConfirmOpen(false);
      setPhones('');
      await loadCampaigns();
    } catch (error) {
      toast.error(error.message || 'No se pudo enviar');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (campaignId) => {
    setBusyId(campaignId);
    try {
      const response = await fetch(`/api/sms-campaigns/${campaignId}`, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ action: 'cancel' }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'No se pudo cancelar');
      }
      toast.success('Se canceló lo que todavía no había salido');
      await loadCampaigns();
    } catch (error) {
      toast.error(error.message || 'No se pudo cancelar');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[linear-gradient(180deg,#f8f9fc_0%,#eef1f6_100%)]">
      <div className="flex-shrink-0 px-5 py-4 border-b border-light-300/50 bg-white/90 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="w-9 h-9 rounded-xl border border-light-300/60 bg-white text-navy-900 hover:bg-light-100 transition-colors"
            title="Volver al mapa"
          >
            ←
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold text-navy-900 tracking-tight">Difusión masiva</h1>
            <p className="text-[12px] text-gray-500 mt-0.5">
              SMS o WhatsApp, en cola lenta, sin reenviar el mismo contenido y sin pisar OTP ni viajes.
            </p>
          </div>
          <button
            type="button"
            onClick={loadCampaigns}
            className="h-9 px-3 rounded-xl border border-light-300/60 bg-white text-[12px] font-medium text-navy-900 hover:bg-light-100"
          >
            Actualizar
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-5">
        <div className="mx-auto w-full max-w-6xl space-y-5">
          {missingTable ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Falta ejecutar <code className="font-mono">supabase/bulk_sms_queue.sql</code> en el editor SQL de Supabase.
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <ChannelCard
              active={channel === BULK_CHANNEL_SMS}
              title="SMS"
              subtitle="Texto + link. 1 cada 12 s. La foto viaja como URL."
              ready={gatewayConfigured}
              readyLabel="SMSGate listo"
              blockedLabel="Falta configurar SMSGate"
              onClick={() => setChannel(BULK_CHANNEL_SMS)}
            />
            <ChannelCard
              active={channel === BULK_CHANNEL_WHATSAPP}
              title="WhatsApp"
              subtitle="Texto + imagen real. 1 cada 30 s. No usa la cola de viajes."
              ready={whatsappConfigured}
              readyLabel="Línea de negocio lista"
              blockedLabel="Falta línea de WhatsApp de negocio"
              onClick={() => setChannel(BULK_CHANNEL_WHATSAPP)}
            />
          </div>

          {!channelReady ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {isWhatsapp
                ? 'No hay una línea de WhatsApp de negocio. La de OTP de pasajeros no se usa para difusión, para no arriesgar bloqueos.'
                : 'SMSGate no está configurado. El OTP y el SMS masivo usan el mismo celular.'}
            </div>
          ) : null}

          <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
            <section className="rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-sm shadow-navy-900/5 sm:p-6">
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-slate-500">Destinatarios</p>
              <p className="mt-1 text-[14px] text-slate-500">
                Copiá y pegá. Se aceptan saltos de línea, comas o punto y coma. Se normalizan a celular argentino.
              </p>
              <textarea
                value={phones}
                onChange={(event) => setPhones(event.target.value)}
                rows={10}
                placeholder={'3878630173\n+54 9 387 555-0100\n3875550200'}
                className="mt-4 min-h-[220px] w-full resize-y rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 font-mono text-[13px] text-navy-900 outline-none transition focus:border-navy-900/35 focus:bg-white focus:ring-4 focus:ring-navy-900/8"
              />
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Válidos" value={parsed.valid.length} tone="navy" />
                <Stat label="Inválidos" value={parsed.invalid.length} tone="rose" />
                <Stat label="Repetidos" value={parsed.duplicates.length} tone="slate" />
                <Stat label="Máximo" value={maxRecipients} tone="slate" />
              </div>
              {parsed.valid.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {parsed.valid.slice(0, 12).map((item) => (
                    <span
                      key={item.local}
                      className="rounded-full border border-navy-900/10 bg-navy-900/[0.04] px-3 py-1 text-[12px] font-medium tabular-nums text-navy-900"
                    >
                      {formatPhoneLocal(item.local)}
                    </span>
                  ))}
                  {parsed.valid.length > 12 ? (
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-[12px] text-slate-500">
                      +{parsed.valid.length - 12}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {parsed.invalid.length > 0 ? (
                <p className="mt-3 text-[12px] text-rose-600">
                  {parsed.invalid.slice(0, 4).map((item) => item.raw).join(' · ')}
                  {parsed.invalid.length > 4 ? ` y ${parsed.invalid.length - 4} más` : ''} no se van a enviar.
                </p>
              ) : null}
            </section>

            <section className="rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-sm shadow-navy-900/5 sm:p-6">
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-slate-500">Mensaje</p>
              <label className="mt-4 flex flex-col gap-2">
                <span className="text-[13px] font-medium text-navy-900">Texto</span>
                <textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  rows={5}
                  maxLength={bulkMaxBody(channel)}
                  placeholder={isWhatsapp ? 'Hola, te escribimos de Profesional Viajes…' : 'Hola, te escribimos de Profesional Viajes…'}
                  className="w-full resize-y rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-[15px] text-navy-900 outline-none transition focus:border-navy-900/35 focus:bg-white focus:ring-4 focus:ring-navy-900/8"
                />
              </label>
              <label className="mt-4 flex flex-col gap-2">
                <span className="text-[13px] font-medium text-navy-900">Link o URL</span>
                <input
                  type="url"
                  value={link}
                  onChange={(event) => setLink(event.target.value)}
                  placeholder="https://www.profesionalviajes.com.ar"
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50/70 px-4 text-[15px] text-navy-900 outline-none transition focus:border-navy-900/35 focus:bg-white focus:ring-4 focus:ring-navy-900/8"
                />
              </label>
              <label className="mt-4 flex flex-col gap-2">
                <span className="text-[13px] font-medium text-navy-900">
                  {isWhatsapp ? 'URL de imagen (se envía como foto)' : 'URL de imagen (opcional)'}
                </span>
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(event) => setImageUrl(event.target.value)}
                  placeholder="https://…"
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50/70 px-4 text-[15px] text-navy-900 outline-none transition focus:border-navy-900/35 focus:bg-white focus:ring-4 focus:ring-navy-900/8"
                />
              </label>
              {isWhatsapp && previewImage ? (
                <img
                  src={previewImage}
                  alt="Vista previa de la foto"
                  className="mt-3 h-36 w-full rounded-2xl object-cover bg-slate-100"
                />
              ) : null}
              <div className="mt-4 rounded-2xl bg-navy-900 px-4 py-4 text-white">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">
                  {isWhatsapp ? 'WhatsApp manda la foto' : 'El SMS no manda fotos'}
                </p>
                <p className="mt-1 text-[13px] leading-5 text-white/75">
                  {isWhatsapp
                    ? 'La imagen se descarga y se envía como multimedia, con el texto de pie. Ritmo de 30 segundos para no parecer spam ni bloquear la línea.'
                    : 'SMSGate solo envía texto. Si pegás una imagen, va el enlace dentro del mensaje.'}
                </p>
              </div>
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-slate-500">Vista previa</p>
                  <p className="text-[12px] tabular-nums text-slate-500">
                    {composedText.length}/{bulkMaxBody(channel)}
                    {isWhatsapp ? '' : ` · ${segments} SMS`}
                  </p>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-[14px] leading-6 text-navy-900">
                  {composedText || (isWhatsapp && previewImage ? 'La foto va con este texto vacío, solo como imagen.' : 'El mensaje va a aparecer acá.')}
                </p>
              </div>
              <label className="mt-4 flex items-start gap-3 rounded-2xl border border-slate-200 px-4 py-3">
                <input
                  type="checkbox"
                  checked={respectQuietHours}
                  onChange={(event) => setRespectQuietHours(event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-navy-900 focus:ring-navy-900"
                />
                <span>
                  <span className="block text-[13px] font-medium text-navy-900">No enviar de noche</span>
                  <span className="block text-[12px] text-slate-500">
                    Entre 21:00 y 09:00 (Salta) la cola espera a la mañana.
                  </span>
                </span>
              </label>
              <button
                type="button"
                disabled={!canSubmit}
                onClick={() => setConfirmOpen(true)}
                className="mt-5 h-12 w-full rounded-2xl bg-navy-900 text-[15px] font-semibold text-white transition hover:bg-navy-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Encolar {sendableCount} {isWhatsapp ? 'WhatsApp' : 'SMS'}
              </button>
              {sendableCount > 0 ? (
                <p className="mt-2 text-center text-[12px] text-slate-500">
                  {isWhatsapp ? 'Ritmo de 1 cada 30 s' : 'Ritmo de 1 cada 12 s'} · estimado {eta} · sin reenviar el mismo contenido en 24 h
                </p>
              ) : null}
            </section>
          </div>

          <section className="rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-sm shadow-navy-900/5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-slate-500">Campañas</p>
              <span className="text-[12px] text-slate-400">{campaigns.length} recientes</span>
            </div>
            {loadingList ? (
              <p className="mt-6 text-sm text-slate-400">Cargando campañas…</p>
            ) : campaigns.length === 0 ? (
              <p className="mt-6 text-sm text-slate-500">Todavía no hay envíos masivos.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {campaigns.map((campaign) => {
                  const counts = campaign.counts || {};
                  const total = (counts.queued || 0) + (counts.sending || 0) + (counts.sent || 0) + (counts.failed || 0) + (counts.skipped || 0);
                  const done = (counts.sent || 0) + (counts.failed || 0) + (counts.skipped || 0);
                  const percent = total ? Math.round((done / total) * 100) : 0;
                  const canCancel = campaign.status === 'queued' || campaign.status === 'running';
                  return (
                    <article key={campaign.id} className="rounded-2xl border border-slate-200 px-4 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusClass(campaign.status)}`}>
                              {statusLabel(campaign.status)}
                            </span>
                            <span className="rounded-full border border-navy-900/10 bg-navy-900/[0.04] px-2.5 py-0.5 text-[11px] font-semibold text-navy-900">
                              {channelLabel(campaign.channel)}
                            </span>
                            <span className="text-[12px] text-slate-400">{formatWhen(campaign.created_at)}</span>
                          </div>
                          <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-[14px] text-navy-900">
                            {campaign.composed_text || (campaign.image_url ? 'Imagen de WhatsApp' : '—')}
                          </p>
                        </div>
                        {canCancel ? (
                          <button
                            type="button"
                            disabled={busyId === campaign.id}
                            onClick={() => handleCancel(campaign.id)}
                            className="h-9 rounded-xl border border-rose-200 px-3 text-[12px] font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                          >
                            Cancelar pendientes
                          </button>
                        ) : null}
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-navy-900 transition-all" style={{ width: `${percent}%` }} />
                      </div>
                      <p className="mt-2 text-[12px] tabular-nums text-slate-500">
                        {counts.sent || 0} enviados · {counts.queued || 0} en cola · {counts.failed || 0} fallidos · {counts.skipped || 0} omitidos
                      </p>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>

      {confirmOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-navy-900/50 backdrop-blur-[2px]"
            aria-label="Cancelar"
            onClick={() => setConfirmOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-[440px] rounded-[28px] bg-white p-6 shadow-2xl shadow-navy-900/20 ring-1 ring-slate-200"
          >
            <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-navy-900">Confirmar {channelLabel(channel)}</p>
            <p className="mt-2 text-[20px] font-semibold tracking-tight text-navy-900">
              {sendableCount} {isWhatsapp ? 'WhatsApp' : 'SMS'} en cola
            </p>
            <p className="mt-2 text-[14px] text-slate-500">
              {isWhatsapp
                ? `Salen de a uno cada 30 segundos${respectQuietHours ? ', y no de noche' : ''}. No se mezclan con los mensajes de viajes.`
                : `Salen de a uno cada 12 segundos${respectQuietHours ? ', y no de noche' : ''}. El OTP sigue teniendo prioridad.`}
            </p>
            <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-slate-50 px-4 py-3 text-[13px] text-navy-900">
              {composedText || '—'}
            </p>
            {isWhatsapp && previewImage ? (
              <p className="mt-2 text-[12px] text-slate-500">Incluye foto multimedia.</p>
            ) : null}
            {parsed.invalid.length > 0 ? (
              <p className="mt-3 text-[12px] text-rose-600">
                {parsed.invalid.length} número{parsed.invalid.length === 1 ? '' : 's'} inválido{parsed.invalid.length === 1 ? '' : 's'} se descartan.
              </p>
            ) : null}
            <p className="mt-1 text-[12px] text-slate-400">{recipientReasonLabel('cooldown')}.</p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="h-11 flex-1 rounded-2xl border border-slate-200 text-[14px] font-medium text-navy-900"
              >
                Volver
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleSubmit}
                className="h-11 flex-1 rounded-2xl bg-navy-900 text-[14px] font-semibold text-white disabled:bg-slate-300"
              >
                {submitting ? 'Encolando…' : 'Encolar ahora'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ChannelCard({ active, title, subtitle, ready, readyLabel, blockedLabel, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[24px] border px-5 py-4 text-left transition ${
        active
          ? 'border-navy-900 bg-navy-900 text-white shadow-lg shadow-navy-900/15'
          : 'border-slate-200 bg-white text-navy-900 hover:border-navy-900/30'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[18px] font-semibold tracking-tight">{title}</p>
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
          active
            ? (ready ? 'bg-white/15 text-white' : 'bg-rose-400/20 text-rose-100')
            : (ready ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700')
        }`}
        >
          {ready ? readyLabel : blockedLabel}
        </span>
      </div>
      <p className={`mt-2 text-[13px] leading-5 ${active ? 'text-white/70' : 'text-slate-500'}`}>{subtitle}</p>
    </button>
  );
}

function Stat({ label, value, tone }) {
  const toneClass = tone === 'navy'
    ? 'text-navy-900'
    : tone === 'rose'
      ? 'text-rose-600'
      : 'text-slate-600';
  return (
    <div className="rounded-2xl bg-slate-50 px-3 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-[22px] font-semibold tabular-nums leading-none ${toneClass}`}>{value}</p>
    </div>
  );
}
