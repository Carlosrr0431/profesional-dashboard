export const OTP_RESEND_SECONDS = 60;

export function formatOtpClock(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

/** Reloj visible solo para esperas cortas (reenvío). */
export function resolveOtpRetrySeconds(data, status) {
  const fromApi = Number(data?.retryAfterSeconds);
  if (Number.isFinite(fromApi) && fromApi > 0 && fromApi <= 120) {
    return Math.round(fromApi);
  }
  if (status === 429 || status === 502) return OTP_RESEND_SECONDS;
  return 0;
}

export function isOtpCooldownWait(data, status) {
  if (status !== 429) return false;
  const seconds = resolveOtpRetrySeconds(data, status);
  return seconds > 0 && seconds <= 120;
}
