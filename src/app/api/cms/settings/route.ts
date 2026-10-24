import { requireUser } from '@/server/auth';
import { getSiteSettings, saveSiteSettings } from '@/server/settings';
import { api, json, readJson, sameOrigin } from '@/server/http';
import { saveSettingsSchema } from '@/server/validation';
import { invalidatePublicContent } from '@/server/public-cache';
export const runtime = 'nodejs';
export const GET = api(async () => { await requireUser(); return json({ settings: await getSiteSettings() }); });
export const PUT = api(async request => { sameOrigin(request); await requireUser(); const settings = await saveSiteSettings(saveSettingsSchema.parse(await readJson(request))); invalidatePublicContent(); return json({ settings }); });
