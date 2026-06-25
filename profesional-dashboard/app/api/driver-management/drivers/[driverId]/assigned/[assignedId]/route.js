import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../../../../src/lib/supabaseAdmin';
import { getAssignedDriverRegistrationStatus } from '../../../../../../../src/lib/driverRoles';
import {
  assertFleetRootOwner,
  setFleetDriverOnlineStatus,
} from '../../../../../../../src/lib/assignedDriversFleet';

function jsonError(message, code = 'SERVER_ERROR', status = 500) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

export async function PATCH(request, { params }) {
  try {
    const { driverId, assignedId } = await params;
    if (!driverId || !assignedId) {
      return jsonError('driverId y assignedId son requeridos', 'BAD_REQUEST', 400);
    }

    const body = await request.json();
    const isAvailable = body?.is_available ?? body?.isAvailable;

    if (typeof isAvailable !== 'boolean') {
      return jsonError('is_available es requerido (boolean)', 'BAD_REQUEST', 400);
    }

    const supabase = getSupabaseAdmin();
    await assertFleetRootOwner(supabase, driverId);

    const { data: assigned, error: assignedError } = await supabase
      .from('drivers')
      .select('id')
      .eq('id', assignedId)
      .eq('owner_id', driverId)
      .eq('is_assigned_driver', true)
      .maybeSingle();

    if (assignedError) throw assignedError;
    if (!assigned) return jsonError('Chofer asignado no encontrado', 'NOT_FOUND', 404);

    await setFleetDriverOnlineStatus(supabase, assignedId, isAvailable);

    const { data, error } = await supabase
      .from('drivers')
      .select('*')
      .eq('id', assignedId)
      .single();

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      data: {
        ...data,
        registration_status: getAssignedDriverRegistrationStatus(data),
      },
    });
  } catch (err) {
    if (err.code === 'NOT_FOUND') return jsonError(err.message, 'NOT_FOUND', 404);
    if (err.code === 'FORBIDDEN') return jsonError(err.message, 'FORBIDDEN', 403);
    if (err.code === 'CONFLICT') return jsonError(err.message, 'CONFLICT', 409);
    return jsonError(err?.message || 'Unexpected server error');
  }
}

export async function DELETE(_request, { params }) {
  try {
    const { driverId, assignedId } = await params;
    if (!driverId || !assignedId) {
      return jsonError('driverId y assignedId son requeridos', 'BAD_REQUEST', 400);
    }

    const supabase = getSupabaseAdmin();
    await assertFleetRootOwner(supabase, driverId);

    const { data: assigned, error: assignedError } = await supabase
      .from('drivers')
      .select('id, user_id, full_name')
      .eq('id', assignedId)
      .eq('owner_id', driverId)
      .eq('is_assigned_driver', true)
      .maybeSingle();

    if (assignedError) throw assignedError;
    if (!assigned) return jsonError('Chofer asignado no encontrado', 'NOT_FOUND', 404);

    if (assigned.user_id) {
      await supabase.auth.admin.deleteUser(assigned.user_id).catch(() => {});
    }

    const { error: deleteError } = await supabase
      .from('drivers')
      .delete()
      .eq('id', assignedId)
      .eq('owner_id', driverId)
      .eq('is_assigned_driver', true);

    if (deleteError) throw deleteError;

    await supabase
      .from('drivers')
      .update({ vehicle_operator_id: null, updated_at: new Date().toISOString() })
      .eq('id', driverId)
      .eq('vehicle_operator_id', assignedId);

    return NextResponse.json({ ok: true, data: { id: assignedId, full_name: assigned.full_name } });
  } catch (err) {
    if (err.code === 'NOT_FOUND') return jsonError(err.message, 'NOT_FOUND', 404);
    if (err.code === 'FORBIDDEN') return jsonError(err.message, 'FORBIDDEN', 403);
    return jsonError(err?.message || 'Unexpected server error');
  }
}
