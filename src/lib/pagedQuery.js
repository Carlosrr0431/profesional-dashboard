/** PostgREST corta cada respuesta en 1000 filas aunque el cliente pida más. */
export const SUPABASE_PAGE_SIZE = 1000;
const MAX_PAGES = 200;

export async function fetchAllPages(loadPage, pageSize = SUPABASE_PAGE_SIZE, concurrency = 1) {
  const rows = [];
  let from = 0;
  const width = Math.max(1, Math.floor(concurrency) || 1);

  for (let page = 0; page < MAX_PAGES;) {
    const count = Math.min(width, MAX_PAGES - page);
    const batches = await Promise.all(
      Array.from({ length: count }, (_, index) => {
        const start = from + index * pageSize;
        return loadPage(start, start + pageSize - 1);
      }),
    );

    for (const batch of batches) {
      const list = Array.isArray(batch) ? batch : [];
      rows.push(...list);
      page += 1;
      from += pageSize;
      if (list.length < pageSize) return rows;
    }
  }

  return rows;
}
