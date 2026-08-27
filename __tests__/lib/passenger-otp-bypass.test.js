const { isPassengerOtpBypassPhone } = require('../../src/lib/passengerOtp');

describe('passenger OTP bypass phone', () => {
  const original = process.env.PASSENGER_OTP_BYPASS_PHONE;

  afterEach(() => {
    if (original == null) delete process.env.PASSENGER_OTP_BYPASS_PHONE;
    else process.env.PASSENGER_OTP_BYPASS_PHONE = original;
  });

  test('sin env no saltea ningún número, incluido el de prueba local', () => {
    delete process.env.PASSENGER_OTP_BYPASS_PHONE;
    expect(isPassengerOtpBypassPhone('3878630173')).toBe(false);
    expect(isPassengerOtpBypassPhone('543878630173')).toBe(false);
  });

  test('con env acepta solo ese número en cualquier formato válido', () => {
    process.env.PASSENGER_OTP_BYPASS_PHONE = '3878630173';
    expect(isPassengerOtpBypassPhone('3878630173')).toBe(true);
    expect(isPassengerOtpBypassPhone('543878630173')).toBe(true);
    expect(isPassengerOtpBypassPhone('5493878630173')).toBe(true);
    expect(isPassengerOtpBypassPhone('+54 9 387 863-0173')).toBe(true);
    expect(isPassengerOtpBypassPhone('3871234567')).toBe(false);
    expect(isPassengerOtpBypassPhone('5493871234567')).toBe(false);
    expect(isPassengerOtpBypassPhone('')).toBe(false);
  });
});
