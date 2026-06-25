import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../../../src/lib/supabaseAdmin';
import {
  MAX_ASSIGNED_DRIVERS,
  buildAssignedDriverAuthEmail,
  buildAssignedDriverInsertPayload,
  getAssignedDriverRegistrationStatus,
  normalizeDriverPhone,
} from '../../../../../../src/lib/driverRoles';
import { assertFleetRootOwner } from '../../../../../../src/lib/assignedDriversFleet';

function jsonError(message, code = 'SERVER_ERROR', status = 500) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

function enrichAssignedDriver(row) {
  return {
    ...row,
    registration_status: getAssignedDriverRegistrationStatus(row),
  };
}

export async function GET(_request, { params }) {
  try {
    const { driverId } = await params;
    if (!driverId) return jsonError('driverId is required', 'BAD_REQUEST', 400);

    const supabase = getSupabaseAdmin();
    await assertFleetRootOwner(supabase, driverId);

    const { data, error } = await supabase
      .from('drivers')
      .select('*')
      .eq('owner_id', driverId)
      .eq('is_assigned_driver', true)
      .order('full_name', { ascending: true });

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      data: (data || []).map(enrichAssignedDriver),
      meta: { max: MAX_ASSIGNED_DRIVERS, count: (data || []).length },
    });
  } catch (err) {
    if (err.code === 'NOT_FOUND') return jsonError(err.message, 'NOT_FOUND', 404);
    if (err.code === 'FORBIDDEN') return jsonError(err.message, 'FORBIDDEN', 403);
    return jsonError(err?.message || 'Unexpected server error');
  }
}

export async function POST(request, { params }) {
  try {
    const { driverId } = await params;
    if (!driverId) return jsonError('driverId is required', 'BAD_REQUEST', 400);

    const body = await request.json();
    const fullName = String(body?.fullName || body?.full_name || '').trim();
    const phone = String(body?.phone || '').trim();
    const normalizedPhone = normalizeDriverPhone(phone);

    if (!fullName) return jsonError('El nombre es requerido', 'BAD_REQUEST', 400);
    if (!normalizedPhone || normalizedPhone.length < 8) {
      return jsonError('Ingresá un teléfono válido', 'BAD_REQUEST', 400);
    }

    const supabase = getSupabaseAdmin();
    const owner = await assertFleetRootOwner(supabase, driverId);

    const { count, error: countError } = await supabase
      .from('drivers')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', driverId)
      .eq('is_assigned_driver', true);

    if (countError) throw countError;
    if ((count || 0) >= MAX_ASSIGNED_DRIVERS) {
      return jsonError(`Máximo ${MAX_ASSIGNED_DRIVERS} choferes asignados por vehículo`, 'LIMIT_REACHED', 409);
    }

    if (owner.role !== 'owner') {
      await supabase
        .from('drivers')
        .update({ role: 'owner', updated_at: new Date().toISOString() })
        .eq('id', driverId);
    }

    const authEmail = buildAssignedDriverAuthEmail(normalizedPhone);

    const { data: newDriver, error: insertError } = await supabase
      .from('drivers')
      .insert(
        buildAssignedDriverInsertPayload(owner, {
          fullName,
          phone,
          phoneNormalized: normalizedPhone,
          authEmail,
        }),
      )
      .select()
      .single();

    if (insertError) {
      if (insertError.message?.includes('idx_drivers_owner_phone_norm')) {
        return jsonError('Ya existe un chofer asignado con ese teléfono', 'DUPLICATE_PHONE', 409);
      }
      if (insertError.message?.includes('Máximo 3 choferes')) {
        return jsonError(insertError.message, 'LIMIT_REACHED', 409);
      }
      throw insertError;
    }

    return NextResponse.json({ ok: true, data: enrichAssignedDriver(newDriver) });
  } catch (err) {
    if (err.code === 'NOT_FOUND') return jsonError(err.message, 'NOT_FOUND', 404);
    if (err.code === 'FORBIDDEN') return jsonError(err.message, 'FORBIDDEN', 403);
    return jsonError(err?.message || 'Unexpected server error');
  }
}
