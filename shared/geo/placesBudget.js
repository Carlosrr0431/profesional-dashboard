/** Tope mensual de llamadas HTTP a Places API (New). El recargo empieza en 10.000. */
const PLACES_MONTHLY_CALL_LIMIT = 9000;

function placesBillingPeriod(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  const safe = Number.isNaN(value.getTime()) ? new Date() : value;
  const month = String(safe.getUTCMonth() + 1).padStart(2, '0');
  return `${safe.getUTCFullYear()}-${month}`;
}

/** El número que devuelve la base es el total DESPUÉS de sumar esta llamada. */
function interpretPlacesConsume(data, limit = PLACES_MONTHLY_CALL_LIMIT) {
  if (data == null || data === '') return { allowed: false, count: null };
  const count = Number(data);
  if (!Number.isFinite(count)) return { allowed: false, count: null };
  return { allowed: count <= limit, count };
}

module.exports = {
  PLACES_MONTHLY_CALL_LIMIT,
  placesBillingPeriod,
  interpretPlacesConsume,
};
