'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

function noteFromRow(row) {
  if (!row?.id || row.read_at) return null;
  return {
    id: row.id,
    applicantId: row.applicant_id,
    message: row.message || 'Un aspirante cargó su documentación.',
    createdAt: row.created_at,
  };
}

function applicantName(message) {
  const match = String(message || '').match(/Nuevo aspirante:\s*(.+?)\s+cargó/i);
  const name = (match?.[1] || 'Nuevo aspirante').trim();
  return name.replace(/\s+/g, ' ');
}

export function useApplicantAlerts() {
  const [notes, setNotes] = useState([]);

  const addNotes = useCallback((incoming) => {
    const rows = (incoming || []).filter(Boolean);
    if (rows.length === 0) return;
    setNotes((current) => {
      const seen = new Set(current.map((item) => item.id));
      const next = [...current];
      for (const row of rows) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        next.push(row);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch('/api/driver-applicants', { cache: 'no-store' });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok || cancelled) return;
        addNotes(payload.unread || []);
      } catch {
        // El mapa sigue usable si la consulta falla.
      }
    };

    load();
    const timer = setInterval(load, 4000);
    const channel = supabase
      .channel('driver_applicant_notifications_live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'driver_applicant_notifications' },
        (payload) => {
          const note = noteFromRow(payload.new);
          if (note) addNotes([note]);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [addNotes]);

  const dismiss = useCallback(async (note) => {
    if (!note?.id) return;
    setNotes((current) => current.filter((item) => item.id !== note.id));
    try {
      await fetch('/api/driver-applicants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId: note.id }),
      });
    } catch {
      // Si falla el marcado, el aviso vuelve en la próxima lectura.
    }
  }, []);

  return { notes, dismiss };
}

export function ApplicantAlertButton({ note, count, mapFullscreen, onClick }) {
  if (!note) return null;
  const name = applicantName(note.message);
  return (
    <button
      type="button"
      onClick={onClick}
      title={note.message}
      className={`flex shrink-0 items-center rounded-full bg-amber-500 font-bold text-white shadow-xl shadow-amber-500/35 transition-all hover:bg-amber-400 active:scale-[0.97] ${
        mapFullscreen
          ? 'h-12 max-w-[18rem] gap-2 px-4 text-[14px] sm:h-14 sm:px-5'
          : 'h-10 max-w-[16rem] gap-1.5 px-3 text-[12px] sm:h-11 sm:px-3.5 sm:text-[12.5px]'
      }`}
    >
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-70" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
      </span>
      <span className="truncate">{name}</span>
      {count > 1 ? (
        <span className="shrink-0 rounded-full bg-white/25 px-1.5 py-0.5 text-[10px] tabular-nums">
          {count}
        </span>
      ) : null}
    </button>
  );
}
