/** @jest-environment node */

import { fetchAllPages } from '../../src/lib/pagedQuery';

describe('fetchAllPages', () => {
  it('junta las páginas que quedan después del tope de 1000', async () => {
    const pages = [
      Array.from({ length: 1000 }, (_, i) => ({ id: `a${i}` })),
      Array.from({ length: 1000 }, (_, i) => ({ id: `b${i}` })),
      Array.from({ length: 213 }, (_, i) => ({ id: `c${i}` })),
    ];
    const seen = [];
    const rows = await fetchAllPages((from, to) => {
      seen.push([from, to]);
      return pages[seen.length - 1] || [];
    });

    expect(seen).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    expect(rows).toHaveLength(2213);
    expect(rows[0].id).toBe('a0');
    expect(rows[2212].id).toBe('c212');
  });

  it('corta en la primera página corta', async () => {
    const rows = await fetchAllPages(() => [{ id: 'only' }]);
    expect(rows).toEqual([{ id: 'only' }]);
  });

  it('pide varias páginas juntas y no suma lo que viene después de una página corta', async () => {
    const calls = [];
    const rows = await fetchAllPages((from) => {
      calls.push(from);
      if (from === 0 || from === 1000) {
        return Array.from({ length: 1000 }, (_, i) => ({ id: `${from}-${i}` }));
      }
      if (from === 2000) return [{ id: 'last' }];
      return [{ id: `extra-${from}` }];
    }, 1000, 4);

    expect(calls).toEqual([0, 1000, 2000, 3000]);
    expect(rows).toHaveLength(2001);
    expect(rows[2000].id).toBe('last');
  });
});
