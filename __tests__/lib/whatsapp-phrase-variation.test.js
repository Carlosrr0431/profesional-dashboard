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
  phraseKeepsFacts,
  varyWhatsappPhrase,
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
});
