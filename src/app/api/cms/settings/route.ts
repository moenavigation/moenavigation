import { requireUser } from '@/server/auth';
import { getSiteSettings, saveSiteSettings } from '@/server/settings';
import { api, json, readJson, sameOrigin } from '@/server/http';
import { saveSettingsSchema } from '@/server/validation';
export const runtime = 'nodejs';
export const GET = api(async () => { await requireUser(); return json({ settings: await getSiteSettings() }); });
export const PUT = api(async request => { sameOrigin(request); await requireUser(); return json({ settings: await saveSiteSettings(saveSettingsSchema.parse(await readJson(request))) }); });
