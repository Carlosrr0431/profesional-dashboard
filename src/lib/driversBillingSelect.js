/**
 * Select de choferes que no tumba el dispatch si aún no existen
 * billing_mode / commission_blocked en la tabla drivers.
 */

export const OPTIONAL_DRIVER_BILLING_COLUMNS = ['billing_mode', 'commission_blocked'];

export function isMissingDriverBillingColumnError(error) {
  const msg = String(error?.message || error?.details || '').toLowerCase();
  if (!msg.includes('does not exist')) return false;
  return OPTIONAL_DRIVER_BILLING_COLUMNS.some((col) => msg.includes(col));
}

export function withoutOptionalDriverBillingColumns(selectList) {
  return String(selectList || '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part && !OPTIONAL_DRIVER_BILLING_COLUMNS.includes(part))
    .join(', ');
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} selectList
 * @param {(query: object) => object} [apply]
 */
export async function selectDriversCompat(supabase, selectList, apply = (query) => query) {
  const run = (select) => apply(supabase.from('drivers').select(select));
  let result = await run(selectList);
  if (result?.error && isMissingDriverBillingColumnError(result.error)) {
    result = await run(withoutOptionalDriverBillingColumns(selectList));
  }
  return result;
}
