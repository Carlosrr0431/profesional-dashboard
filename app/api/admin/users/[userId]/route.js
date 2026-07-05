import { NextResponse } from 'next/server';
import { requireSuperAdminUser } from '../../../../../src/lib/adminAuthServer';
import { getSupabaseAdmin } from '../../../../../src/lib/supabaseAdmin';

function normalizePassword(value) {
  return String(value || '');
}

export async function PATCH(request, { params }) {
  const auth = await requireSuperAdminUser(request);
  if (!auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const userId = String(params?.userId || '').trim();
  if (!userId) {
    return NextResponse.json({ error: 'Usuario inválido' }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });
  }

  const password = normalizePassword(body.password);
  if (password.length < 8) {
    return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres.' }, { status: 400 });
  }

  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.auth.admin.updateUserById(userId, { password });
    if (error) throw error;

    return NextResponse.json({
      user: {
        id: data.user.id,
        email: data.user.email,
        createdAt: data.user.created_at,
        lastSignInAt: data.user.last_sign_in_at,
        emailConfirmed: Boolean(data.user.email_confirmed_at),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || 'No se pudo actualizar la contraseña.' },
      { status: 500 },
    );
  }
}

export async function DELETE(request, { params }) {
  const auth = await requireSuperAdminUser(request);
  if (!auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const userId = String(params?.userId || '').trim();
  if (!userId) {
    return NextResponse.json({ error: 'Usuario inválido' }, { status: 400 });
  }

  if (auth.user.id === userId) {
    return NextResponse.json({ error: 'No podés eliminar tu propio usuario.' }, { status: 400 });
  }

  try {
    const admin = getSupabaseAdmin();
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || 'No se pudo eliminar el usuario.' },
      { status: 500 },
    );
  }
}
