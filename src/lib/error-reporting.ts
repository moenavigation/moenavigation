const knownErrors = new Set(['Error', 'TypeError', 'RangeError', 'AbortError', 'TimeoutError', 'MongoNetworkError', 'MongoServerError', 'MongoServerSelectionError']);
export function safeErrorDetails(error: unknown) {
  const type = error instanceof Error && knownErrors.has(error.name) ? error.name : 'UnknownError';
  const digest = typeof error === 'object' && error !== null && 'digest' in error && typeof error.digest === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(error.digest) ? error.digest : undefined;
  return { type, ...(digest ? { digest } : {}) };
}
