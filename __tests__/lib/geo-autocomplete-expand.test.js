const { autocompleteAddressSalta } = require('../../shared/geo/nominatim');

describe('autocomplete sin Places', () => {
  beforeEach(() => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ([]),
      text: async () => '[]',
    }));
  });

  it('ni la búsqueda ampliada llama a Places Autocomplete', async () => {
    await autocompleteAddressSalta('grido', 60, {
      sessionToken: 'sesion',
      expand: true,
      near: { latitude: -24.79, longitude: -65.41 },
    });

    const calls = global.fetch.mock.calls.filter(([url]) => String(url).includes('places:autocomplete'));
    expect(calls).toHaveLength(0);
  });
});
