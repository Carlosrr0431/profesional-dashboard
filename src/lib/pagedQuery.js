/** PostgREST corta cada respuesta en 1000 filas aunque el cliente pida más. */
export const SUPABASE_PAGE_SIZE = 1000;
const MAX_PAGES = 200;

export async function fetchAllPages(loadPage, pageSize = SUPABASE_PAGE_SIZE) {
  const rows = [];
  let from = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const batch = await loadPage(from, from + pageSize - 1);
    const list = Array.isArray(batch) ? batch : [];
    rows.push(...list);
    if (list.length < pageSize) return rows;
    from += pageSize;
  }

  return rows;
}
