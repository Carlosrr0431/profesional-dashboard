const { isPassengerOtpBypassPhone } = require('../../src/lib/passengerOtp');

describe('passenger OTP bypass phone', () => {
  test('acepta solo 3878630173 en cualquier formato válido', () => {
    expect(isPassengerOtpBypassPhone('3878630173')).toBe(true);
    expect(isPassengerOtpBypassPhone('543878630173')).toBe(true);
    expect(isPassengerOtpBypassPhone('5493878630173')).toBe(true);
    expect(isPassengerOtpBypassPhone('+54 9 387 863-0173')).toBe(true);
  });

  test('rechaza cualquier otro número', () => {
    expect(isPassengerOtpBypassPhone('3871234567')).toBe(false);
    expect(isPassengerOtpBypassPhone('5493871234567')).toBe(false);
    expect(isPassengerOtpBypassPhone('')).toBe(false);
  });
});
