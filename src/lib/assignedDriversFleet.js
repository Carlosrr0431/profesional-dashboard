const ACTIVE_TRIP_STATUSES = ['accepted', 'going_to_pickup', 'in_progress'];

export function getFleetRootId(driverRow) {
  return driverRow?.owner_id || driverRow?.id || null;
}

export async function fetchFleetRoot(supabase, driverId) {
  const { data, error } = await supabase
    .from('drivers')
    .select('id, owner_id, is_assigned_driver')
    .eq('id', driverId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const fleetRootId = getFleetRootId(data);
  if (!fleetRootId) return null;

  const { data: owner, error: ownerError } = await supabase
    .from('drivers')
    .select('*')
    .eq('id', fleetRootId)
    .maybeSingle();

  if (ownerError) throw ownerError;
  return owner;
}

export async function assertFleetRootOwner(supabase, ownerId) {
  const { data: owner, error } = await supabase
    .from('drivers')
    .select('*')
    .eq('id', ownerId)
    .maybeSingle();

  if (error) throw error;
  if (!owner) {
    const err = new Error('Chofer propietario no encontrado');
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (owner.is_assigned_driver || owner.owner_id) {
    const err = new Error('Solo el dueño del vehículo puede tener choferes asignados');
    err.code = 'FORBIDDEN';
    throw err;
  }
  return owner;
}

export async function setFleetDriverOnlineStatus(supabase, driverId, online) {
  const { data: driver, error: driverError } = await supabase
    .from('drivers')
    .select('id, owner_id, is_assigned_driver')
    .eq('id', driverId)
    .maybeSingle();

  if (driverError) throw driverError;
  if (!driver) {
    const err = new Error('Chofer no encontrado');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const fleetRootId = getFleetRootId(driver);

  if (online) {
    const { data: fleetRoot, error: rootError } = await supabase
      .from('drivers')
      .select('id, vehicle_operator_id')
      .eq('id', fleetRootId)
      .maybeSingle();

    if (rootError) throw rootError;

    if (fleetRoot?.vehicle_operator_id && fleetRoot.vehicle_operator_id !== driverId) {
      const { data: currentOperator, error: operatorError } = await supabase
        .from('drivers')
        .select('id, is_available')
        .eq('id', fleetRoot.vehicle_operator_id)
        .maybeSingle();

      if (operatorError) throw operatorError;

      if (currentOperator?.is_available) {
        const err = new Error('El vehículo ya está en uso por otro chofer. Solo uno puede operarlo a la vez.');
        err.code = 'CONFLICT';
        throw err;
      }

      await supabase
        .from('drivers')
        .update({ vehicle_operator_id: null, updated_at: new Date().toISOString() })
        .eq('id', fleetRootId)
        .eq('vehicle_operator_id', fleetRoot.vehicle_operator_id);
    }

    const { data: busyDrivers, error: busyError } = await supabase
      .from('drivers')
      .select('id')
      .or(`id.eq.${fleetRootId},owner_id.eq.${fleetRootId}`)
      .eq('is_available', true)
      .neq('id', driverId)
      .limit(1);

    if (busyError) throw busyError;
    if (busyDrivers?.length) {
      const err = new Error('Otro chofer del mismo vehículo ya está en línea.');
      err.code = 'CONFLICT';
      throw err;
    }

    const fleetIds = [fleetRootId];
    const { data: assignedRows } = await supabase
      .from('drivers')
      .select('id')
      .eq('owner_id', fleetRootId)
      .eq('is_assigned_driver', true);

    const allFleetIds = [...fleetIds, ...(assignedRows || []).map((row) => row.id)];
    const otherFleetIds = allFleetIds.filter((id) => id !== driverId);

    if (otherFleetIds.length) {
      const { data: activeTrips, error: tripError } = await supabase
        .from('trips')
        .select('id')
        .in('driver_id', otherFleetIds)
        .in('status', ACTIVE_TRIP_STATUSES)
        .limit(1);

      if (tripError) throw tripError;
      if (activeTrips?.length) {
        const err = new Error('Hay un viaje activo con otro chofer de este vehículo.');
        err.code = 'CONFLICT';
        throw err;
      }
    }

    const { error: onlineError } = await supabase
      .from('drivers')
      .update({ is_available: true, updated_at: new Date().toISOString() })
      .eq('id', driverId);

    if (onlineError) throw onlineError;

    await supabase
      .from('drivers')
      .update({ vehicle_operator_id: driverId, updated_at: new Date().toISOString() })
      .eq('id', fleetRootId);

    return { success: true, is_available: true };
  }

  const { error: offlineError } = await supabase
    .from('drivers')
    .update({ is_available: false, updated_at: new Date().toISOString() })
    .eq('id', driverId);

  if (offlineError) throw offlineError;

  await supabase
    .from('drivers')
    .update({ vehicle_operator_id: null, updated_at: new Date().toISOString() })
    .eq('id', fleetRootId)
    .eq('vehicle_operator_id', driverId);

  return { success: true, is_available: false };
}
