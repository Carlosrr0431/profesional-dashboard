'use client';

import { useCallback, useEffect, useState } from 'react';

const STATUS_LABEL = {
  phone_verified: 'Verificó el teléfono',
  profile: 'Cargó sus datos',
  documents: 'Está subiendo archivos',
  submitted: 'Documentación completa',
  accepted: 'Aceptado',
  rejected: 'Rechazado',
};

function formatWhen(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}

function formatPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('54')) {
    const local = digits.slice(2);
    return `+54 ${local.slice(0, 3)} ${local.slice(3, 6)}-${local.slice(6)}`;
  }
  if (digits.length === 13 && digits.startsWith('549')) {
    const local = digits.slice(3);
    return `+54 9 ${local.slice(0, 3)} ${local.slice(3, 6)}-${local.slice(6)}`;
  }
  return phone || '—';
}

function vehicleLabel(row) {
  const kind = row.vehicleKind === 'moto' ? 'Moto' : row.vehicleKind === 'car' ? 'Más de dos ruedas' : 'Sin dato';
  const bits = [kind];
  if (row.vehicleYear) bits.push(String(row.vehicleYear));
  if (row.vehicleCc) bits.push(`${row.vehicleCc} cc`);
  return bits.join(' · ');
}

export default function DriverApplicantsPanel({ focusId = null }) {
  const [rows, setRows] = useState([]);
  const [steps, setSteps] = useState([]);
  const [unread, setUnread] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const response = await fetch('/api/driver-applicants', { cache: 'no-store' });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.message || 'No pudimos cargar los aspirantes.');
    }
    setRows(payload.applicants || []);
    setSteps(payload.steps || []);
    setUnread(payload.unread || []);
    return payload;
  }, []);

  useEffect(() => {
    let cancelled = false;
    load()
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    if (!focusId) return;
    setOpenId(focusId);
  }, [focusId]);

  const openApplicant = async (row) => {
    setOpenId(row.id);
    setNotice('');
    if (!row.unread) return;
    const note = unread.find((item) => item.applicantId === row.id);
    if (!note?.id) return;
    await fetch('/api/driver-applicants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationId: note.id }),
    });
    setUnread((current) => current.filter((item) => item.id !== note.id));
    setRows((current) => current.map((item) => (
      item.id === row.id ? { ...item, unread: false } : item
    )));
  };

  const confirmDecision = async () => {
    if (!pending || saving) return;
    setSaving(true);
    setNotice('');
    const response = await fetch('/api/driver-applicants/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicantId: pending.row.id, decision: pending.decision }),
    });
    const payload = await response.json().catch(() => null);
    setSaving(false);
    if (!response.ok || !payload?.ok) {
      setNotice(payload?.message || 'No pudimos guardar la decisión.');
      return;
    }
    setRows((current) => current.map((item) => (
      item.id === pending.row.id ? { ...item, status: payload.status } : item
    )));
    setNotice(payload.emailSent
      ? 'Listo. Le avisamos por correo.'
      : (payload.emailMessage || 'La decisión quedó guardada.'));
    setPending(null);
  };

  if (loading) {
    return <p className="p-6 text-sm text-slate-500">Cargando aspirantes…</p>;
  }
  if (error) {
    return <p className="p-6 text-sm text-red-600">{error}</p>;
  }
  if (rows.length === 0) {
    return (
      <p className="p-6 text-sm text-slate-500">
        Todavía no hay aspirantes. Cuando alguien termine la documentación, aparece acá.
      </p>
    );
  }

  const selected = rows.find((row) => row.id === openId) || null;
  const selectedName = selected
    ? (`${selected.firstName} ${selected.lastName}`.trim() || 'Sin nombre')
    : '';
  const canDecide = selected && ['submitted', 'accepted', 'rejected'].includes(selected.status);

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden bg-slate-50">
      <aside className={`${selected ? 'hidden lg:flex' : 'flex'} applicant-scroll w-full shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white lg:w-72`}>
        {rows.map((row) => {
          const active = row.id === openId;
          const name = `${row.firstName} ${row.lastName}`.trim() || 'Sin nombre';
          return (
            <button
              key={row.id}
              id={`aspirante-${row.id}`}
              type="button"
              onClick={() => openApplicant(row)}
              className={`border-b border-slate-100 px-4 py-4 text-left transition ${active ? 'bg-slate-50' : 'hover:bg-slate-50'}`}
            >
              <span className="flex items-center gap-2">
                <span className="text-base font-bold text-slate-900">{name}</span>
                {row.unread ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800">Nuevo</span>
                ) : null}
              </span>
              <span className="mt-1 block text-sm text-slate-600">
                {STATUS_LABEL[row.status] || row.status}
              </span>
            </button>
          );
        })}
      </aside>

      <section className={`${selected ? 'flex' : 'hidden lg:flex'} min-h-0 min-w-0 flex-1 flex-col overflow-hidden`}>
        {selected ? (
          <>
            <div className="shrink-0 border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
              <button
                type="button"
                onClick={() => setOpenId(null)}
                className="mb-2 text-sm font-semibold text-slate-500 lg:hidden"
              >
                Volver al listado
              </button>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-xl font-bold text-slate-900">{selectedName}</h2>
                  <p className="mt-0.5 text-sm text-slate-500">
                    {STATUS_LABEL[selected.status] || selected.status}
                    {selected.submittedAt ? ` · ${formatWhen(selected.submittedAt)}` : ''}
                  </p>
                </div>
                {canDecide ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPending({ row: selected, decision: 'accepted' })}
                      className={`rounded-full px-4 py-2 text-sm font-semibold ${selected.status === 'accepted' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'}`}
                    >
                      Aceptar
                    </button>
                    <button
                      type="button"
                      onClick={() => setPending({ row: selected, decision: 'rejected' })}
                      className={`rounded-full px-4 py-2 text-sm font-semibold ${selected.status === 'rejected' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 hover:bg-red-100'}`}
                    >
                      Rechazar
                    </button>
                  </div>
                ) : null}
              </div>
              {notice ? <p className="mt-2 text-sm font-medium text-slate-700">{notice}</p> : null}
            </div>

            <div className="applicant-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
              <div className="mb-4 flex flex-wrap gap-2">
                <Info label="Correo" value={selected.email || '—'} />
                <Info label="Teléfono" value={formatPhone(selected.phone)} />
                <Info label="DNI" value={selected.dni || '—'} />
                <Info label="Vehículo" value={vehicleLabel(selected)} />
              </div>

              <div className="flex flex-col gap-3 pb-6">
                {steps.map((step, stepIndex) => {
                  const files = selected.documents?.[step.key] || [];
                  const ready = files.length > 0;
                  return (
                    <article key={step.key} className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex items-start gap-3">
                        <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${ready ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                          {ready ? '✓' : stepIndex + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-[15px] font-semibold text-slate-900">{step.title}</h3>
                          <p className="mt-0.5 text-sm leading-5 text-slate-500">{step.hint}</p>
                        </div>
                      </div>
                      {files.length === 0 ? (
                        <p className="mt-3 pl-9 text-sm text-slate-400">Sin archivos</p>
                      ) : (
                        <div className="mt-3 flex gap-3 overflow-x-auto pl-9">
                          {files.map((file, index) => (
                            file.url ? (
                              <a
                                key={file.id}
                                href={file.url}
                                target="_blank"
                                rel="noreferrer"
                                className="w-44 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 transition hover:border-slate-300"
                              >
                                <img src={file.url} alt="" className="h-52 w-full bg-slate-100 object-contain" />
                                <span className="block px-2 py-1.5 text-xs font-medium text-slate-600">
                                  Foto {index + 1}
                                </span>
                              </a>
                            ) : (
                              <span key={file.id} className="rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-500">
                                {file.file_name || 'Archivo'}
                              </span>
                            )
                          ))}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center p-8 text-base text-slate-500">
            Elegí un aspirante para ver la documentación.
          </div>
        )}
      </section>

      {pending ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-slate-900">
              {pending.decision === 'accepted' ? 'Aceptar solicitud' : 'Rechazar solicitud'}
            </h3>
            <p className="mt-2 text-base leading-6 text-slate-600">
              {pending.decision === 'accepted'
                ? `¿Confirmás aceptar a ${selectedName}? Le avisamos por correo a ${pending.row.email || 'la dirección que cargó'}.`
                : `¿Confirmás rechazar a ${selectedName}? Le avisamos por correo a ${pending.row.email || 'la dirección que cargó'}.`}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setPending(null)}
                className="rounded-full px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={confirmDecision}
                className={`rounded-full px-5 py-2.5 text-sm font-bold text-white ${pending.decision === 'accepted' ? 'bg-emerald-600' : 'bg-red-600'} disabled:opacity-60`}
              >
                {saving ? 'Guardando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <span className="ml-2 text-sm font-semibold text-slate-900">{value}</span>
    </div>
  );
}
