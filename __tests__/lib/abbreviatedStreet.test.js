const { expandAbbreviatedStreetQueries } = require('../../shared/salta-address');

describe('abreviaturas de calle para Georef', () => {
  test('iniciales, títulos y "al" se buscan también sin el prefijo', () => {
    const cases = [
      ['J. M. Leguizamon 1455', 'Leguizamon 1455'],
      ['J.M. Leguizamon 1455', 'Leguizamon 1455'],
      ['JM Leguizamon 1455', 'Leguizamon 1455'],
      ['Cnel. Moldes al 200', 'Moldes 200'],
      ['Dr. Luis Güemes 500', 'Luis Güemes 500'],
      ['Av. Sarmiento 1200', 'Sarmiento 1200'],
      ['Pje. España 40', 'España 40'],
      ['Ing. Carlos Bianchi 300, Salta', 'Carlos Bianchi 300'],
      ['J. M. AV SARMIENTO 495', 'AV SARMIENTO 495'],
      ['J. M. ANGEL DE ROSA 360', 'ANGEL DE ROSA 360'],
    ];
    for (const [typed, plain] of cases) {
      expect(expandAbbreviatedStreetQueries(typed).map((item) => item.toLowerCase()))
        .toContain(plain.toLowerCase());
    }
  });
});
