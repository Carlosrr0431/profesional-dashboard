const { validateCronAuth } = require('../../src/lib/cronAuth');

describe('validateCronAuth', () => {
  const SECRET = 'test-cron-secret';

  it('permite Vercel cron con x-vercel-cron', () => {
    const result = validateCronAuth({
      headers: { 'x-vercel-cron': '1' },
      cronSecret: SECRET,
    });
    expect(result.ok).toBe(true);
    expect(result.viaVercelCron).toBe(true);
  });

  it('permite Bearer token', () => {
    const result = validateCronAuth({
      headers: { authorization: `Bearer ${SECRET}` },
      cronSecret: SECRET,
    });
    expect(result.ok).toBe(true);
    expect(result.authMode).toBe('bearer');
  });

  it('permite x-cron-secret (pg_net desde Supabase)', () => {
    const result = validateCronAuth({
      headers: { 'x-cron-secret': SECRET },
      cronSecret: SECRET,
    });
    expect(result.ok).toBe(true);
    expect(result.authMode).toBe('x_cron_secret');
  });

  it('permite cron_secret en query string', () => {
    const result = validateCronAuth({
      searchParams: new URLSearchParams(`cron_secret=${SECRET}`),
      cronSecret: SECRET,
    });
    expect(result.ok).toBe(true);
    expect(result.authMode).toBe('query_secret');
  });

  it('rechaza requests sin credenciales cuando hay CRON_SECRET', () => {
    const result = validateCronAuth({
      headers: {},
      cronSecret: SECRET,
    });
    expect(result.ok).toBe(false);
  });
});
