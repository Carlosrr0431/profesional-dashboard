const {
  CHATS_LINE_PHONE,
  isChatsLine,
  formatArMobile,
  chatMessagePreview,
} = require('../../src/lib/cloudflareChats');

describe('archivo de chats de la línea 3872 13-8777', () => {
  test('solo esa línea entra al archivo', () => {
    expect(isChatsLine('5493872138777')).toBe(true);
    expect(isChatsLine('+54 9 3872 13-8777')).toBe(true);
    expect(isChatsLine(CHATS_LINE_PHONE)).toBe(true);
    expect(isChatsLine('5493873088777')).toBe(false);
  });

  test('muestra el celular como en WhatsApp', () => {
    expect(formatArMobile('5493872138777')).toBe('+54 9 3872 13-8777');
  });

  test('un audio sin texto se ve como Audio', () => {
    expect(chatMessagePreview({ messageType: 'audio' })).toBe('Audio');
    expect(chatMessagePreview({ messageType: 'text', content: 'Hola, ¿dónde te buscamos?' }))
      .toBe('Hola, ¿dónde te buscamos?');
  });
});
