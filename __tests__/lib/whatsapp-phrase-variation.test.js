/**
 * @jest-environment node
 */

jest.mock('../../src/lib/deepseekClient', () => ({
  DEEPSEEK_PRO_MODEL: 'deepseek-v4-pro',
  isDeepSeekConfigured: jest.fn(() => true),
  deepseekChatCompletion: jest.fn(),
}));

const {
  lockedFragments,
  isCannedWhatsappSpam,
  phraseKeepsFacts,
  varyWhatsappPhrase,
  buildPassengerAckReply,
  resetWhatsappPhraseMemory,
} = require('../../src/lib/whatsappPhraseVariation');
const { deepseekChatCompletion, isDeepSeekConfigured } = require('../../src/lib/deepseekClient');

const SOURCE = 'Listo, tu viaje quedó confirmado. Chofer: *Ana Pérez*. Retiro: *Mitre 200*. Precio: *$1.500,00*';

describe('whatsappPhraseVariation', () => {
  beforeEach(() => {
    resetWhatsappPhraseMemory();
    isDeepSeekConfigured.mockReturnValue(true);
    deepseekChatCompletion.mockReset();
  });

  test('frena las frases repetidas de las capturas', () => {
    expect(isCannedWhatsappSpam('Ya te mando el móvil')).toBe(true);
    expect(isCannedWhatsappSpam('Tu pedido ya está tomado, esperando confirmación del chofer.')).toBe(true);
    expect(isCannedWhatsappSpam('Ya estás en la cola de espera. Te avisamos en cuanto haya un chofer disponible')).toBe(true);
    expect(isCannedWhatsappSpam('¡Hola Pasajero! Gracias por viajar con nosotros')).toBe(true);
    expect(isCannedWhatsappSpam('Tu viaje está confirmado. Seguí el móvil acá:\nhttps://www.profesionalviajes.com.ar/seguimiento/abc')).toBe(false);
    expect(isCannedWhatsappSpam('Buenas tardes')).toBe(true);
    expect(isCannedWhatsappSpam('¡Buenísimo! ¿Te mando un móvil? Pasame la calle y altura.')).toBe(true);
    expect(isCannedWhatsappSpam('Buenas tardes 👋\nSoy Betto, de Profesional Viajes\n\n¿Dónde te buscamos?\nO compartí tu *ubicación GPS*')).toBe(false);
  });

  test('el aviso de viaje derivado sale al instante', async () => {
    const notice = 'El viaje ya está derivado';
    const out = await varyWhatsappPhrase(notice, { phone: '5493870000098' });
    expect(out).toBe(notice);
    expect(deepseekChatCompletion).not.toHaveBeenCalled();
  });

  test('el link de seguimiento sale tal cual', async () => {
    const tracking = 'Tu viaje está confirmado. Seguí el móvil acá:\nhttps://www.profesionalviajes.com.ar/seguimiento/abc';
    const out = await varyWhatsappPhrase(tracking, { phone: '5493870000099' });
    expect(out).toBe(tracking);
    expect(deepseekChatCompletion).not.toHaveBeenCalled();
  });

  test('guarda precios, nombres y direcciones', () => {
    const tokens = lockedFragments(SOURCE);
    expect(tokens).toEqual(expect.arrayContaining(['Ana Pérez', 'Mitre 200', '$1.500,00']));
    expect(phraseKeepsFacts(SOURCE, 'Tu remis ya está confirmado. Te busca *Ana Pérez* en *Mitre 200*. Sale *$1.500,00*.')).toBe(true);
    expect(phraseKeepsFacts(SOURCE, 'Tu remis ya está confirmado.')).toBe(false);
  });

  test('una pregunta sigue siendo pregunta', () => {
    expect(phraseKeepsFacts('¿Confirmás el viaje por *$2.000*?', 'Dale, el viaje queda en *$2.000*.')).toBe(false);
  });

  test('DeepSeek Pro cambia la frase y conserva los datos', async () => {
    deepseekChatCompletion.mockResolvedValue({
      content: 'Quedó confirmado el viaje. Te pasa a buscar *Ana Pérez* por *Mitre 200*. El valor es *$1.500,00*.',
    });
    const out = await varyWhatsappPhrase(SOURCE, { phone: '5493870000000' });
    expect(out).toContain('Ana Pérez');
    expect(out).toContain('$1.500,00');
    expect(out).not.toBe(SOURCE);
    expect(deepseekChatCompletion).toHaveBeenCalledWith(expect.objectContaining({
      model: 'deepseek-v4-pro',
      purpose: 'whatsapp_phrase',
    }));
  });

  test('si la respuesta pierde un dato, se envía el texto original', async () => {
    deepseekChatCompletion.mockResolvedValue({ content: 'Listo, ya salió el móvil.' });
    const out = await varyWhatsappPhrase(SOURCE, { phone: '5493870000001' });
    expect(out).toBe(SOURCE);
  });

  test('sin DeepSeek configurado no cambia el texto', async () => {
    isDeepSeekConfigured.mockReturnValue(false);
    const out = await varyWhatsappPhrase(SOURCE, { phone: '5493870000002' });
    expect(out).toBe(SOURCE);
    expect(deepseekChatCompletion).not.toHaveBeenCalled();
  });

  test('un gracias no repite la confirmación y usa la frase de DeepSeek', async () => {
    deepseekChatCompletion.mockResolvedValue({ content: 'De nada Silvia, cualquier cosa me escribís' });
    const out = await buildPassengerAckReply({
      passengerText: 'Gracias',
      tripStatus: 'accepted',
      pickup: 'general Güemes 2046',
    });
    expect(out).toBe('De nada Silvia, cualquier cosa me escribís');
    expect(out).not.toMatch(/seguimiento|confirmado/i);
    const prompt = deepseekChatCompletion.mock.calls[0][0].userContent;
    expect(prompt).toContain('Gracias');
    expect(prompt).toContain('Güemes 2046');
  });

  test('si DeepSeek repite el link, queda una frase corta de respaldo', async () => {
    deepseekChatCompletion.mockResolvedValue({
      content: 'Tu viaje está confirmado. Seguí el móvil acá: https://www.profesionalviajes.com.ar/seguimiento/abc',
    });
    const out = await buildPassengerAckReply({
      passengerText: 'Gracias',
      tripStatus: 'going_to_pickup',
    });
    expect(out).not.toMatch(/https?:\/\//);
    expect(out.length).toBeGreaterThan(8);
  });
});
