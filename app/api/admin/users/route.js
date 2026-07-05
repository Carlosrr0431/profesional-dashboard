import { NextResponse } from 'next/server';
import { requireSuperAdminUser } from '../../../../src/lib/adminAuthServer';
import { getSupabaseAdmin } from '../../../../src/lib/supabaseAdmin';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizePassword(value) {
  return String(value || '');
}

export async function GET(request) {
  const auth = await requireSuperAdminUser(request);
  if (!auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) throw error;

    const users = (data?.users || []).map((user) => ({
      id: user.id,
      email: user.email,
      createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at,
      emailConfirmed: Boolean(user.email_confirmed_at),
    }));

    users.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return NextResponse.json({ users });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || 'No se pudieron listar los usuarios.' },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  const auth = await requireSuperAdminUser(request);
  if (!auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });
  }

  const email = normalizeEmail(body.email);
  const password = normalizePassword(body.password);

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Ingresá un email válido.' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres.' }, { status: 400 });
  }

  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: 'admin' },
    });
    if (error) throw error;

    return NextResponse.json({
      user: {
        id: data.user.id,
        email: data.user.email,
        createdAt: data.user.created_at,
        lastSignInAt: data.user.last_sign_in_at,
        emailConfirmed: Boolean(data.user.email_confirmed_at),
      },
    }, { status: 201 });
  } catch (error) {
    const message = String(error?.message || '');
    if (message.toLowerCase().includes('already registered')) {
      return NextResponse.json({ error: 'Ese email ya está registrado.' }, { status: 409 });
    }
    return NextResponse.json(
      { error: message || 'No se pudo crear el usuario.' },
      { status: 500 },
    );
  }
}
