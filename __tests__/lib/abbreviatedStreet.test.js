const { expandAbbreviatedStreetQueries } = require('../../shared/salta-address');

describe('abreviaturas de calle para Georef', () => {
  test('J. M. Leguizamon 1455 también se busca como Leguizamon 1455', () => {
    expect(expandAbbreviatedStreetQueries('J. M. Leguizamon 1455')).toEqual([
      'J. M. Leguizamon 1455',
      'Leguizamon 1455',
    ]);
  });
});
