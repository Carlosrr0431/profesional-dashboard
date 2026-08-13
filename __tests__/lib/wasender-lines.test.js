const {
  listWasenderLines,
  resolveWasenderLine,
  resolveWhatsmeowLineByAgentCode,
  runWithWasenderLine,
  getWasenderApiKey,
  getActiveWasenderLinePhone,
  getActiveWhatsmeowAgentCode,
  injectWasenderLineIntoContext,
  extractWasenderLineFromContext,
  resolveWhatsmeowLineFromContext,
  buildTripWhatsmeowLineContext,
  resolveWhatsmeowLineForPassenger,
  hasAnyWasenderApiKey,
} = require('../../src/lib/wasenderLines');

describe('whatsmeowLines (compat wasenderLines)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    delete process.env.WHATSMEOW_LINES;
    delete process.env.WASENDER_LINES;
    delete process.env.WHATSMEOW_API_KEY;
    delete process.env.WHATSMEOW_AGENT_CODE;
    delete process.env.WHATSMEOW_PHONE;
    delete process.env.WHATSMEOW_AGENT_CODE_2;
    delete process.env.WHATSMEOW_PHONE_2;
    Object.assign(process.env, originalEnv);
  });

  test('lista dos líneas indexadas', () => {
    process.env.WHATSMEOW_API_KEY = 'shared-key';
    process.env.WHATSMEOW_PHONE = '+5493873088777';
    process.env.WHATSMEOW_AGENT_CODE = 'Agente_1';
    process.env.WHATSMEOW_PHONE_2 = '5493871112222';
    process.env.WHATSMEOW_AGENT_CODE_2 = 'Agente_2';
    delete process.env.WHATSMEOW_LINES;

    const lines = listWasenderLines();
    expect(lines).toHaveLength(2);
    expect(lines[0].phone).toBe('5493873088777');
    expect(lines[0].agentCode).toBe('Agente_1');
    expect(lines[0].apiKey).toBe('shared-key');
    expect(lines[1].phone).toBe('5493871112222');
    expect(lines[1].agentCode).toBe('Agente_2');
  });

  test('resuelve línea por slug de URL y por agent_code', () => {
    process.env.WHATSMEOW_API_KEY = 'shared-key';
    process.env.WHATSMEOW_PHONE = '5493873088777';
    process.env.WHATSMEOW_AGENT_CODE = 'Agente_1';
    process.env.WHATSMEOW_PHONE_2 = '5493871112222';
    process.env.WHATSMEOW_AGENT_CODE_2 = 'Agente_2';
    delete process.env.WHATSMEOW_LINES;

    expect(resolveWasenderLine('5493873088777')?.agentCode).toBe('Agente_1');
    expect(resolveWasenderLine('+54 9 387 111-2222')?.agentCode).toBe('Agente_2');
    expect(resolveWasenderLine('9999999999')).toBeNull();
    expect(resolveWhatsmeowLineByAgentCode('Agente_2')?.phone).toBe('5493871112222');
  });

  test('runWithWasenderLine fija agent_code y phone activos', async () => {
    process.env.WHATSMEOW_API_KEY = 'shared-key';
    process.env.WHATSMEOW_PHONE = '5493873088777';
    process.env.WHATSMEOW_AGENT_CODE = 'Agente_1';
    process.env.WHATSMEOW_PHONE_2 = '5493871112222';
    process.env.WHATSMEOW_AGENT_CODE_2 = 'Agente_2';
    delete process.env.WHATSMEOW_LINES;

    const line2 = resolveWasenderLine('5493871112222');
    const result = await runWithWasenderLine(line2, async () => ({
      key: getWasenderApiKey(),
      phone: getActiveWasenderLinePhone(),
      agent: getActiveWhatsmeowAgentCode(),
    }));

    expect(result).toEqual({
      key: 'shared-key',
      phone: '5493871112222',
      agent: 'Agente_2',
    });
  });

  test('inyecta y extrae wasender_line del contexto', () => {
    process.env.WHATSMEOW_API_KEY = 'shared-key';
    process.env.WHATSMEOW_PHONE = '5493873088777';
    process.env.WHATSMEOW_AGENT_CODE = 'Agente_1';
    delete process.env.WHATSMEOW_LINES;

    const ctx = runWithWasenderLine(resolveWasenderLine('5493873088777'), () =>
      injectWasenderLineIntoContext({ foo: 1 })
    );
    expect(ctx.foo).toBe(1);
    expect(ctx.wasender_line).toBe('5493873088777');
    expect(ctx.whatsmeow_agent).toBe('Agente_1');
    expect(extractWasenderLineFromContext(ctx)).toBe('5493873088777');
  });

  test('resuelve línea 2 desde wa_context del viaje', () => {
    process.env.WHATSMEOW_API_KEY = 'shared-key';
    process.env.WHATSMEOW_PHONE = '5493873088777';
    process.env.WHATSMEOW_AGENT_CODE = 'Profesional_1';
    process.env.WHATSMEOW_PHONE_2 = '5493872138777';
    process.env.WHATSMEOW_AGENT_CODE_2 = 'Profesional_Pasajeros';
    delete process.env.WHATSMEOW_LINES;

    const line = resolveWhatsmeowLineFromContext({
      wasender_line: '5493872138777',
      whatsmeow_agent: 'Profesional_Pasajeros',
    });
    expect(line?.agentCode).toBe('Profesional_Pasajeros');
    expect(line?.phone).toBe('5493872138777');
  });

  test('sella solo la línea activa en trips.wa_context', () => {
    process.env.WHATSMEOW_API_KEY = 'shared-key';
    process.env.WHATSMEOW_PHONE = '5493873088777';
    process.env.WHATSMEOW_AGENT_CODE = 'Profesional_1';
    process.env.WHATSMEOW_PHONE_2 = '5493872138777';
    process.env.WHATSMEOW_AGENT_CODE_2 = 'Profesional_Pasajeros';
    delete process.env.WHATSMEOW_LINES;

    const stamped = runWithWasenderLine(resolveWasenderLine('5493872138777'), () =>
      buildTripWhatsmeowLineContext({ pending_poll: { msg_id: 'x' } })
    );
    expect(stamped).toEqual({
      wasender_line: '5493872138777',
      whatsmeow_agent: 'Profesional_Pasajeros',
    });
  });

  test('resuelve línea del pasajero por conversación si el viaje no tiene wa_context', async () => {
    process.env.WHATSMEOW_API_KEY = 'shared-key';
    process.env.WHATSMEOW_PHONE = '5493873088777';
    process.env.WHATSMEOW_AGENT_CODE = 'Profesional_1';
    process.env.WHATSMEOW_PHONE_2 = '5493872138777';
    process.env.WHATSMEOW_AGENT_CODE_2 = 'Profesional_Pasajeros';
    delete process.env.WHATSMEOW_LINES;

    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: async () => ({
                  data: {
                    context: {
                      wasender_line: '5493872138777',
                      whatsmeow_agent: 'Profesional_Pasajeros',
                    },
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }),
    };

    const line = await resolveWhatsmeowLineForPassenger(supabase, {
      passengerPhone: '5493878630173',
      tripWaContext: null,
    });
    expect(line?.agentCode).toBe('Profesional_Pasajeros');
  });

  test('hasAnyWasenderApiKey requiere API key + agent', () => {
    delete process.env.WHATSMEOW_API_KEY;
    delete process.env.WHATSMEOW_AGENT_CODE;
    delete process.env.WHATSMEOW_PHONE;
    expect(hasAnyWasenderApiKey()).toBe(false);

    process.env.WHATSMEOW_API_KEY = 'shared-key';
    process.env.WHATSMEOW_AGENT_CODE = 'Agente_1';
    process.env.WHATSMEOW_PHONE = '5493873088777';
    expect(hasAnyWasenderApiKey()).toBe(true);
  });
});
