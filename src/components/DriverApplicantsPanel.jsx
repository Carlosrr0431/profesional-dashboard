'use client';

import { useCallback, useEffect, useState } from 'react';

const STATUS_LABEL = {
  phone_verified: 'Verificó el teléfono',
  profile: 'Cargó sus datos',
  documents: 'Está subiendo archivos',
  submitted: 'Documentación completa',
};

function formatWhen(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function DriverApplicantsPanel() {
  const [rows, setRows] = useState([]);
  const [steps, setSteps] = useState([]);
  const [unread, setUnread] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  const openApplicant = async (row) => {
    setOpenId((current) => (current === row.id ? null : row.id));
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

  return (
    <div className="flex-1 overflow-auto p-3 sm:p-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-3">
        {rows.map((row) => {
          const open = openId === row.id;
          const name = `${row.firstName} ${row.lastName}`.trim() || 'Sin nombre';
          return (
            <article key={row.id} className="rounded-2xl border border-slate-200 bg-white">
              <button
                type="button"
                onClick={() => openApplicant(row)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <span>
                  <span className="block text-sm font-semibold text-slate-900">
                    {name}
                    {row.unread ? (
                      <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800">
                        Nuevo
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {STATUS_LABEL[row.status] || row.status}
                    {' · '}
                    {row.phone}
                    {row.submittedAt ? ` · ${formatWhen(row.submittedAt)}` : ''}
                  </span>
                </span>
                <span className="text-xs text-slate-400">{open ? 'Ocultar' : 'Ver'}</span>
              </button>
              {open ? (
                <div className="border-t border-slate-100 px-4 py-3 text-sm text-slate-700">
                  <p>Correo: {row.email || '—'}</p>
                  <p>DNI: {row.dni || '—'}</p>
                  <p>
                    Vehículo: {row.vehicleKind === 'moto' ? 'Moto' : row.vehicleKind === 'car' ? 'Más de dos ruedas' : '—'}
                    {row.vehicleYear ? ` · ${row.vehicleYear}` : ''}
                    {row.vehicleCc ? ` · ${row.vehicleCc} cc` : ''}
                  </p>
                  <ul className="mt-3 flex flex-col gap-3">
                    {steps.map((step) => {
                      const files = row.documents?.[step.key] || [];
                      return (
                        <li key={step.key}>
                          <p className="font-medium text-slate-900">
                            {files.length > 0 ? '✓ ' : '○ '}
                            {step.title}
                          </p>
                          {files.length === 0 ? (
                            <p className="text-xs text-slate-400">Sin archivos</p>
                          ) : (
                            <div className="mt-1 flex flex-wrap gap-2">
                              {files.map((file) => (
                                file.url ? (
                                  <a
                                    key={file.id}
                                    href={file.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-xs font-medium text-navy-900 underline"
                                  >
                                    {file.file_name || 'Ver archivo'}
                                  </a>
                                ) : (
                                  <span key={file.id} className="text-xs text-slate-400">
                                    {file.file_name || 'Archivo'}
                                  </span>
                                )
                              ))}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
