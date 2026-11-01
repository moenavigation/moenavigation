import { z } from 'zod';
import { requireUser, rateLimit } from '@/server/auth';
import { generateSeaRoute } from '@/server/sea-route';
import { api, json, readJson, sameOrigin } from '@/server/http';

export const runtime = 'nodejs';
const point = z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)]);
const inputSchema = z.strictObject({ origin: point, destination: point });

export const POST = api(async request => {
  sameOrigin(request);
  const user = await requireUser();
  const { origin, destination } = inputSchema.parse(await readJson(request));
  await rateLimit(`sea-route:${user._id}`, 12, 60);
  await rateLimit('sea-route:global', 60, 60);
  request.signal.throwIfAborted();
  const result = await generateSeaRoute(origin, destination);
  request.signal.throwIfAborted();
  return json(result);
});
