import type { Instrumentation } from 'next';
import { safeErrorDetails } from './lib/error-reporting';

export const onRequestError: Instrumentation.onRequestError = (error, _request, context) => {
  // No messages, stack traces, URLs, headers or submitted form data are exported.
  console.error(JSON.stringify({ event: 'request_error', route: context.routePath, routeType: context.routeType, ...safeErrorDetails(error) }));
};
