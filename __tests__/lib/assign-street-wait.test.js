/** @jest-environment node */

import { waitForStreetAddress } from '../../src/lib/assignStreetWait';

describe('waitForStreetAddress', () => {
  it('devuelve la calle si llega dentro del tiempo', async () => {
    await expect(waitForStreetAddress(Promise.resolve('Juan Gálvez 500'), 200)).resolves.toBe('Juan Gálvez 500');
  });

  it('no bloquea si el geocoder tarda de más', async () => {
    const slow = new Promise((resolve) => {
      setTimeout(() => resolve('Calle tarde'), 250);
    });
    await expect(waitForStreetAddress(slow, 30)).resolves.toBeNull();
  });

  it('si el geocoder falla, sigue sin la calle', async () => {
    await expect(waitForStreetAddress(Promise.reject(new Error('caido')), 200)).resolves.toBeNull();
  });
});
