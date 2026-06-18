/** Precio en pesos argentinos sin decimales (ej. $12.500). */
export function formatArs(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '$—';
  const rounded = Math.round(n);
  const formatted = rounded.toLocaleString('es-AR', { maximumFractionDigits: 0 });
  return `$${formatted}`;
}
