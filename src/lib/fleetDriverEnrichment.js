/** Copia vehículo y número de móvil del dueño sobre la fila del asignado (snake_case BD). */
export function mergeAssignedDriverWithOwner(driver, owner) {
  if (!driver || !owner || !driver.is_assigned_driver) return driver;

  const coalesce = (primary, fallback) => {
    if (primary != null && primary !== '') return primary;
    return fallback ?? null;
  };

  return {
    ...driver,
    driver_number: coalesce(driver.driver_number, owner.driver_number),
    vehicle_brand: coalesce(driver.vehicle_brand, owner.vehicle_brand),
    vehicle_model: coalesce(driver.vehicle_model, owner.vehicle_model),
    vehicle_year: coalesce(driver.vehicle_year, owner.vehicle_year),
    vehicle_plate: coalesce(driver.vehicle_plate, owner.vehicle_plate),
    vehicle_color: coalesce(driver.vehicle_color, owner.vehicle_color),
    vehicle_photo_url: coalesce(driver.vehicle_photo_url, owner.vehicle_photo_url),
    vehicle_type: coalesce(driver.vehicle_type, owner.vehicle_type) || 'auto',
  };
}

export function buildFleetOwnersById(driverRows) {
  const map = {};
  for (const row of driverRows || []) {
    if (row?.id && !row.is_assigned_driver && !row.owner_id) {
      map[row.id] = row;
    }
  }
  return map;
}
