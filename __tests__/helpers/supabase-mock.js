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
 * Uso con RPCs personalizados:
 *   const sb = createSupabaseMock({}, {
 *     rpcResults: {
 *       append_whatsapp_message: { data: [{ inserted: true, conversation_id: 'conv-001' }] },
 *     }
 *   });
 *
 * Sobreescribir el resultado de .single():
 *   const builder = sb.from('trips');
 *   builder.single.mockResolvedValueOnce({ data: { id: 'x' }, error: null });
 *
 * RPCs conocidos con respuesta por defecto (para que el flujo completo funcione en tests):
 *   - append_whatsapp_message   → { inserted: true, conversation_id: 'conv-mock-001' }
 *   - claim_whatsapp_conversation_batch → { id: 'conv-mock-001', status: 'collecting', phone: '5493878630173', push_name: 'Test', context: '{}', messages: '[]' }
 *   - lock_queue_item / release_queue_item → null (flujo de cola no activo en agente_ia)
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
 * Respuestas por defecto para RPCs conocidos de la aplicación.
 * Permite que el flujo completo de route.js se ejecute en tests sin que
 * appendIncomingMessage o claimConversationBatch fallen silenciosamente.
 */
const DEFAULT_RPC_RESULTS = {
  append_whatsapp_message: {
    data: [{ inserted: true, conversation_id: 'conv-mock-001' }],
    error: null,
  },
  claim_whatsapp_conversation_batch: {
    data: [{
      id: 'conv-mock-001',
      status: 'collecting',
      phone: '5493878630173',
      push_name: 'Pasajero Test',
      context: JSON.stringify({ awaiting_gps: false, pending_poll: null }),
      messages: JSON.stringify([
        { role: 'user', content: 'necesito un remis' },
      ]),
    }],
    error: null,
  },
};

/**
 * Crea un cliente Supabase completo mockeado.
 * @param {Record<string, {data: any, error: any}>} tableResults
 *   Mapa de nombre de tabla → resultado por defecto.
 * @param {object} [options]
 * @param {Record<string, {data: any, error: any}>} [options.rpcResults]
 *   Overrides por nombre de RPC (se fusionan con DEFAULT_RPC_RESULTS).
 * @param {string} [options.conversationId]
 *   ID de conversación que devuelve append_whatsapp_message (por defecto 'conv-mock-001').
 */
function createSupabaseMock(tableResults = {}, { rpcResults = {}, conversationId = 'conv-mock-001' } = {}) {
  const mergedRpcResults = {
    ...DEFAULT_RPC_RESULTS,
    // Reemplazar la conversación por defecto con el ID pedido
    append_whatsapp_message: {
      data: [{ inserted: true, conversation_id: conversationId }],
      error: null,
    },
    claim_whatsapp_conversation_batch: {
      data: [{
        ...DEFAULT_RPC_RESULTS.claim_whatsapp_conversation_batch.data[0],
        id: conversationId,
      }],
      error: null,
    },
    ...rpcResults,
  };

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
    rpc: jest.fn().mockImplementation((fnName) => {
      const result = mergedRpcResults[fnName];
      if (result !== undefined) return Promise.resolve(result);
      return Promise.resolve({ data: null, error: null });
    }),
  };

  return client;
}

module.exports = { createSupabaseMock, createQueryBuilder };
