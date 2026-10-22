import 'server-only';
import { ZodError } from 'zod';
import { randomUUID } from 'node:crypto';
import { safeErrorDetails } from '@/lib/error-reporting';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const expected = new URL(process.env.NEXT_PUBLIC_SITE_URL || request.url).origin;
  const actual = new URL(request.url).origin;
  // The configured origin covers reverse proxies; local development can use its actual port.
  const allowed = new Set([expected]);
  if (['localhost', '127.0.0.1', '[::1]'].includes(new URL(request.url).hostname)) allowed.add(actual);
  if (!origin || !allowed.has(origin) || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new HttpError(403, 'This request must come from this website. Refresh the page and try again.');
  }
}

export async function readBytes(request: Request, limit: number) {
  if (Number(request.headers.get('content-length')) > limit) throw new HttpError(413, 'The submitted file or content is too large.');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'A request body is required.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw new HttpError(413, 'The submitted file or content is too large.'); }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function readJson(request: Request) {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new HttpError(415, 'Send JSON content.');
  try { return JSON.parse((await readBytes(request, 256 * 1024)).toString('utf8')) as unknown; }
  catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(400, 'The submitted content could not be read.'); }
}

export function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

export function api(handler: (request: Request) => Promise<Response>) {
  return async (request: Request) => {
    try { return await handler(request); }
    catch (error) {
      if (error instanceof ZodError) {
        const fields = Object.fromEntries(error.issues.map(issue => [issue.path.join('.'), issue.message]));
        return json({ error: 'Please check the highlighted fields.', fields }, 400);
      }
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      if ((error as { code?: number })?.code === 11000) return json({ error: 'This item was created or changed by another request. Refresh the latest content and try again.' }, 409);
      // Provider error messages may contain connection strings or request credentials.
      const reference = randomUUID();
      console.error(JSON.stringify({ event: 'api_error', reference, path: new URL(request.url).pathname, ...safeErrorDetails(error) }));
      return json({ error: `The service is temporarily unavailable. Your input has been kept; please try again. Reference: ${reference}`, reference }, 503);
    }
  };
}
