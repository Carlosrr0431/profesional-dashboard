/**
 * supabase-mock.js — Factory para crear mocks del cliente Supabase v2.
 *
 * Soporta el patrón builder encadenable de Supabase:
 *   await supabase.from('trips').select('*').eq('id', x).single()
 *
 * Uso básico (datos por defecto null):
 *   const sb = createSupabaseMock();
 *
 * Uso con datos específicos por tabla:
 *   const sb = createSupabaseMock({
 *     trips: { data: [{ id: 'trip-1', status: 'pending' }], error: null },
 *     drivers: { data: [{ id: 'drv-1', is_online: true }], error: null },
 *   });
 *
 * Sobreescribir el resultado de .single():
 *   const builder = sb.from('trips');
 *   builder.single.mockResolvedValueOnce({ data: { id: 'x' }, error: null });
 */

function createQueryBuilder(resolvedValue = { data: null, error: null }) {
  // Hace que `await builder` resuelva a resolvedValue
  const thenable = {
    then: (onfulfilled, onrejected) =>
      Promise.resolve(resolvedValue).then(onfulfilled, onrejected),
    catch: (onrejected) =>
      Promise.resolve(resolvedValue).catch(onrejected),
    finally: (onfinally) =>
      Promise.resolve(resolvedValue).finally(onfinally),
  };

  const builder = {
    ...thenable,
    // Modificadores de consulta — todos devuelven el mismo builder (encadenable)
    select:       jest.fn(() => builder),
    insert:       jest.fn(() => builder),
    upsert:       jest.fn(() => builder),
    update:       jest.fn(() => builder),
    delete:       jest.fn(() => builder),
    eq:           jest.fn(() => builder),
    neq:          jest.fn(() => builder),
    in:           jest.fn(() => builder),
    is:           jest.fn(() => builder),
    gte:          jest.fn(() => builder),
    lte:          jest.fn(() => builder),
    gt:           jest.fn(() => builder),
    lt:           jest.fn(() => builder),
    ilike:        jest.fn(() => builder),
    like:         jest.fn(() => builder),
    or:           jest.fn(() => builder),
    order:        jest.fn(() => builder),
    limit:        jest.fn(() => builder),
    range:        jest.fn(() => builder),
    not:          jest.fn(() => builder),
    throwOnError: jest.fn(() => builder),
    // Terminadores — resuelven la promesa
    single:       jest.fn().mockResolvedValue(resolvedValue),
    maybeSingle:  jest.fn().mockResolvedValue(resolvedValue),
  };

  return builder;
}

/**
 * Crea un cliente Supabase completo mockeado.
 * @param {Record<string, {data: any, error: any}>} tableResults
 *   Mapa de nombre de tabla → resultado por defecto.
 */
function createSupabaseMock(tableResults = {}) {
  const client = {
    from: jest.fn((tableName) => {
      const result = tableResults[tableName] ?? { data: null, error: null };
      return createQueryBuilder(result);
    }),
    channel: jest.fn(() => ({
      on:          jest.fn().mockReturnThis(),
      subscribe:   jest.fn().mockReturnThis(),
      unsubscribe: jest.fn(),
    })),
    removeChannel: jest.fn(),
    storage: {
      from: jest.fn(() => ({
        upload:       jest.fn().mockResolvedValue({ data: null, error: null }),
        getPublicUrl: jest.fn().mockReturnValue({ data: { publicUrl: 'https://test.storage/file' } }),
      })),
    },
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
  };

  return client;
}

module.exports = { createSupabaseMock, createQueryBuilder };
