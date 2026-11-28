const { withSupabaseFallback } = require('../../src/lib/cloudflarePlatform');

describe('respaldo de Cloudflare', () => {
  it('si Cloudflare responde, no usa Supabase', async () => {
    let usedSupabase = false;
    const out = await withSupabaseFallback(
      'viajes',
      'leer',
      async () => ({ id: 'cf' }),
      async () => {
        usedSupabase = true;
        return { id: 'sb' };
      },
    );
    expect(out).toEqual({ source: 'cloudflare', result: { id: 'cf' } });
    expect(usedSupabase).toBe(false);
  });

  it('si Cloudflare falla, el usuario sigue viendo Supabase', async () => {
    const out = await withSupabaseFallback(
      'viajes',
      'leer',
      async () => {
        throw new Error('D1 caído');
      },
      async () => ({ id: 'sb' }),
    );
    expect(out.source).toBe('supabase');
    expect(out.result).toEqual({ id: 'sb' });
  });
});
