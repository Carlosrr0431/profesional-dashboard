import { createSupabaseServerClient } from './supabase/server';
import { getSupabaseAdmin } from './supabaseAdmin';

function getBearerToken(request) {
  const authHeader = String(request.headers.get('authorization') || '');
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  return token || null;
}

export async function requireAdminUser(request) {
  const bearer = getBearerToken(request);
  if (bearer) {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.auth.getUser(bearer);
    if (!error && data?.user) {
      return { user: data.user, error: null, status: 200 };
    }
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    return { user: null, error: 'No autorizado', status: 401 };
  }

  return { user: data.user, error: null, status: 200 };
}
