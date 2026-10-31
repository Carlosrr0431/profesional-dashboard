'use client';

import { useEffect, useState } from 'react';
import { spaJson } from './api';
import { getDriverSupabase } from '../conductor/driverSupabase';

export function isWhatsAppDriverTrip(trip) {
  const notes = String(trip?.notes || '');
  if (/\[(PASSENGER_APP|DASHBOARD|STREET_HAIL)\]/i.test(notes)) return false;
  return /\[(WHATSAPP|APPROACH_ONLY)\]/i.test(notes) || /\[SCHEDULED_SOURCE\]\s*whatsapp/i.test(notes);
}

export default function SpaWhatsAppThread({ tripId, enabled = true }) {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    if (!enabled || !tripId) {
      setMessages([]);
      return undefined;
    }
    let cancelled = false;

    const load = async () => {
      const supabase = getDriverSupabase();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token || cancelled) return;
      const { ok, data } = await spaJson(`/api/driver/trip-whatsapp?tripId=${encodeURIComponent(tripId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (cancelled || !ok || !Array.isArray(data?.messages)) return;
      setMessages(data.messages);
    };

    load();
    const timer = setInterval(load, 12000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled, tripId]);

  if (!enabled || messages.length === 0) return null;

  return (
    <div className="grid gap-2 rounded-2xl bg-slate-50 px-3 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">WhatsApp de este viaje</p>
      {messages.map((item) => {
        const incoming = item.direction === 'incoming';
        return (
          <div
            key={item.id || item.whatsapp_message_id}
            className={incoming ? 'justify-self-start max-w-[92%]' : 'justify-self-end max-w-[92%]'}
          >
            <div className={incoming ? 'rounded-2xl bg-white px-3 py-2' : 'rounded-2xl bg-emerald-600 px-3 py-2 text-white'}>
              <p className={incoming ? 'text-[10px] font-semibold text-slate-400' : 'text-[10px] font-semibold text-emerald-100'}>
                {incoming ? 'Pasajero' : 'Agencia'}
              </p>
              <p className="whitespace-pre-wrap text-[14px] leading-5">{item.body}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
