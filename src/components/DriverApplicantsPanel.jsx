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
      <aside className={`${selected ? 'hidden lg:flex' : 'flex'} w-full shrink-0 flex-col overflow-auto border-r border-slate-200 bg-white lg:w-80`}>
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

      <section className={`${selected ? 'flex' : 'hidden lg:flex'} min-h-0 min-w-0 flex-1 flex-col overflow-auto`}>
        {selected ? (
          <div className="flex min-h-full flex-col">
            <div className="border-b border-slate-200 bg-white px-5 py-5 sm:px-8">
              <button
                type="button"
                onClick={() => setOpenId(null)}
                className="mb-3 text-sm font-semibold text-slate-500 lg:hidden"
              >
                Volver al listado
              </button>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">{selectedName}</h2>
                  <p className="mt-1 text-base text-slate-600">
                    {STATUS_LABEL[selected.status] || selected.status}
                    {selected.submittedAt ? ` · ${formatWhen(selected.submittedAt)}` : ''}
                  </p>
                </div>
                {canDecide ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPending({ row: selected, decision: 'accepted' })}
                      className={`rounded-full px-5 py-2.5 text-sm font-bold ${selected.status === 'accepted' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'}`}
                    >
                      Aceptar
                    </button>
                    <button
                      type="button"
                      onClick={() => setPending({ row: selected, decision: 'rejected' })}
                      className={`rounded-full px-5 py-2.5 text-sm font-bold ${selected.status === 'rejected' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 hover:bg-red-100'}`}
                    >
                      Rechazar
                    </button>
                  </div>
                ) : null}
              </div>
              {notice ? <p className="mt-3 text-sm font-medium text-slate-700">{notice}</p> : null}
            </div>

            <div className="grid gap-3 px-5 py-5 sm:grid-cols-2 sm:px-8 xl:grid-cols-4">
              <Info label="Correo" value={selected.email || '—'} />
              <Info label="Teléfono" value={formatPhone(selected.phone)} />
              <Info label="DNI" value={selected.dni || '—'} />
              <Info label="Vehículo" value={vehicleLabel(selected)} />
            </div>

            <div className="grid gap-4 px-5 pb-8 sm:grid-cols-2 sm:px-8 xl:grid-cols-3">
              {steps.map((step) => {
                const files = selected.documents?.[step.key] || [];
                return (
                  <article key={step.key} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <h3 className="text-base font-bold text-slate-900">
                      {files.length > 0 ? '✓ ' : '○ '}
                      {step.title}
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">{step.hint}</p>
                    {files.length === 0 ? (
                      <p className="mt-3 text-sm text-slate-400">Sin archivos</p>
                    ) : (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {files.map((file, index) => (
                          file.url ? (
                            <a
                              key={file.id}
                              href={file.url}
                              target="_blank"
                              rel="noreferrer"
                              className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                            >
                              <img src={file.url} alt="" className="h-28 w-full object-cover" />
                              <span className="block truncate px-2 py-1.5 text-xs font-medium text-slate-700">
                                Foto {index + 1}
                              </span>
                            </a>
                          ) : (
                            <span key={file.id} className="rounded-xl bg-slate-100 px-2 py-3 text-xs text-slate-500">
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
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 break-all text-base font-semibold text-slate-900">{value}</p>
    </div>
  );
}
