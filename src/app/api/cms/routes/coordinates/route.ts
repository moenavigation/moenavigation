import { z } from 'zod';
import { MAX_GOOGLE_MAPS_URL_LENGTH } from '@/lib/google-maps';
import { requireUser, rateLimit } from '@/server/auth';
import { resolveGoogleMapsCoordinates } from '@/server/google-maps';
import { api, json, readJson, sameOrigin } from '@/server/http';

export const runtime = 'nodejs';
const inputSchema = z.strictObject({ url: z.string().trim().min(1).max(MAX_GOOGLE_MAPS_URL_LENGTH) });

export const POST = api(async request => {
  sameOrigin(request);
  const user = await requireUser();
  const { url } = inputSchema.parse(await readJson(request));
  await rateLimit(`map-coordinates:${user._id}`, 60, 60);
  await rateLimit('map-coordinates:global', 500, 60);
  return json(await resolveGoogleMapsCoordinates(url, { signal: request.signal }));
});
