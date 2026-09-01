import { supabase } from './supabase';

export async function cancelTripAsOperator(tripId) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  const response = await fetch('/api/trips/cancel-operator', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ trip_id: tripId }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.message || 'No se pudo cancelar el viaje');
  }

  return payload;
}
