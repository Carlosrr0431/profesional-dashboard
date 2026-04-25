export function formatError(error) {
  if (!error) {
    return { message: 'Unknown error' };
  }

  if (typeof error === 'string') {
    return { message: error };
  }

  return {
    name: error?.name || null,
    message: error?.message || String(error),
    code: error?.code || error?.error?.code || null,
    type: error?.type || error?.error?.type || null,
    status: error?.status || null,
    details: error?.details || error?.error?.details || null,
    hint: error?.hint || error?.error?.hint || null,
  };
}