import { isAssignedDriver } from './driverRoles';

export const DRIVER_DELETE_BLOCK_STATUSES = [
  'pending',
  'accepted',
  'going_to_pickup',
  'in_progress',
  'scheduled',
];

function rethrowDeleteError(error) {
  if (!error) return;
  if (error.code === '23503') {
    throw conflict('No se puede eliminar: hay viajes u otros registros asociados a este chofer.');
  }
  throw error;
}

export function collectDriverIdsToDelete(driver, assignedRows = []) {
  if (!driver?.id) return { targetIds: [], assignedIds: [] };
  if (isAssignedDriver(driver)) {
    return { targetIds: [driver.id], assignedIds: [] };
  }
  const assignedIds = (assignedRows || []).map((row) => row.id).filter(Boolean);
  return {
    targetIds: [driver.id, ...assignedIds],
    assignedIds,
  };
}

function conflict(message) {
  const err = new Error(message);
  err.code = 'CONFLICT';
  return err;
}

function notFound(message) {
  const err = new Error(message);
  err.code = 'NOT_FOUND';
  return err;
}

/**
 * Elimina un chofer y su usuario de Auth.
 * Si es titular, también elimina sus asignados (no a los socios).
 */
export async function deleteDriverCascade(supabase, driverId) {
  if (!supabase) throw new Error('deleteDriverCascade: falta cliente Supabase');
  const id = String(driverId || '').trim();
  if (!id) {
    const err = new Error('Falta el chofer a eliminar');
    err.code = 'BAD_REQUEST';
    throw err;
  }

  const { data: driver, error: fetchError } = await supabase
    .from('drivers')
    .select('id, user_id, full_name, owner_id, is_assigned_driver')
    .eq('id', id)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!driver) throw notFound('Chofer no encontrado');

  const assigned = isAssignedDriver(driver)
    ? []
    : await loadAssignedDrivers(supabase, driver.id);

  const { targetIds, assignedIds } = collectDriverIdsToDelete(driver, assigned);

  const { data: activeTrips, error: tripError } = await supabase
    .from('trips')
    .select('id')
    .in('driver_id', targetIds)
    .in('status', DRIVER_DELETE_BLOCK_STATUSES)
    .limit(1);

  if (tripError) throw tripError;
  if (activeTrips?.length) {
    throw conflict('No se puede eliminar: hay un viaje activo con este chofer o uno asignado.');
  }

  const rowsToDelete = isAssignedDriver(driver) ? [driver] : [...assigned, driver];
  for (const row of rowsToDelete) {
    if (row.user_id) {
      await supabase.auth.admin.deleteUser(row.user_id).catch(() => {});
    }
  }

  const nowIso = new Date().toISOString();

  await supabase
    .from('trips')
    .update({ driver_id: null })
    .in('driver_id', targetIds)
    .in('status', ['completed', 'cancelled']);

  if (isAssignedDriver(driver)) {
    const { error: deleteAssignedError } = await supabase
      .from('drivers')
      .delete()
      .eq('id', driver.id);

    rethrowDeleteError(deleteAssignedError);

    if (driver.owner_id) {
      await supabase
        .from('drivers')
        .update({ vehicle_operator_id: null, updated_at: nowIso })
        .eq('id', driver.owner_id)
        .eq('vehicle_operator_id', driver.id);
    }

    return {
      id: driver.id,
      full_name: driver.full_name,
      deletedAssignedCount: 0,
      deletedIds: targetIds,
    };
  }

  await supabase
    .from('drivers')
    .update({ vehicle_operator_id: null, updated_at: nowIso })
    .eq('id', driver.id);

  if (assignedIds.length) {
    const { error: deleteFleetError } = await supabase
      .from('drivers')
      .delete()
      .in('id', assignedIds)
      .eq('owner_id', driver.id)
      .eq('is_assigned_driver', true);

    rethrowDeleteError(deleteFleetError);
  }

  const { error: deleteOwnerError } = await supabase
    .from('drivers')
    .delete()
    .eq('id', driver.id);

  rethrowDeleteError(deleteOwnerError);

  return {
    id: driver.id,
    full_name: driver.full_name,
    deletedAssignedCount: assignedIds.length,
    deletedIds: targetIds,
  };
}

async function loadAssignedDrivers(supabase, ownerId) {
  const { data, error } = await supabase
    .from('drivers')
    .select('id, user_id, full_name, owner_id, is_assigned_driver')
    .eq('owner_id', ownerId)
    .eq('is_assigned_driver', true);

  if (error) throw error;
  return data || [];
}
