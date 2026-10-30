import { rateLimit, requireRole } from '@/server/auth';
import { api, HttpError, json, readJson, sameOrigin } from '@/server/http';
import { getUsageOverview, saveUsageSettings, usageSettingsInput } from '@/server/usage';
export const runtime = 'nodejs';
export const GET = api(async request => {
  await requireRole('Dev', 'Admin');
  if (new URL(request.url).search) throw new HttpError(400, 'Use the usage page controls to refresh.');
  return json(await getUsageOverview());
});
export const POST = api(async request => { sameOrigin(request); const actor = await requireRole('Dev', 'Admin'); await rateLimit(`usage:${actor._id}`, 20, 60); return json(await getUsageOverview(true)); });
export const PUT = api(async request => { sameOrigin(request); const actor = await requireRole('Dev', 'Admin'); const input = usageSettingsInput.parse(await readJson(request)); await rateLimit(`usage:${actor._id}`, 20, 60); await saveUsageSettings(input, actor); return json(await getUsageOverview()); });
