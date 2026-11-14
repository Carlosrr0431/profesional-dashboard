'use client';

import { useEffect, useRef } from 'react';
import { useToast } from '../context/ToastContext';

const LOOKBACK_MS = 15 * 60 * 1000;

export default function ApplicantAlerts() {
  const toast = useToast();
  const seenRef = useRef(new Set());
  const readyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      try {
        const response = await fetch('/api/driver-applicants', { cache: 'no-store' });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok || cancelled) return;
        const unread = payload.unread || [];
        const now = Date.now();
        for (const note of unread) {
          if (seenRef.current.has(note.id)) continue;
          seenRef.current.add(note.id);
          const created = new Date(note.createdAt).getTime();
          const recent = Number.isFinite(created) && now - created < LOOKBACK_MS;
          if (readyRef.current || recent) {
            toast.info(note.message || 'Un aspirante cargó su documentación.');
          }
        }
        readyRef.current = true;
      } catch {
        // El panel sigue usable si la consulta falla.
      }
    };

    tick();
    const timer = setInterval(tick, 25000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [toast]);

  return null;
}
