import { supabase } from './supabase';

export async function updateTripNotesAsOperator(tripId, notes) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  const response = await fetch('/api/trips/notes', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ trip_id: tripId, notes }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.message || 'No se pudieron enviar las notas');
  }

  return payload;
}
