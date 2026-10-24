import { requireUser } from '@/server/auth';
import { getContentRecords, saveContent } from '@/server/content';
import { api, json, readJson, sameOrigin } from '@/server/http';
import { saveSchema } from '@/server/validation';
import { invalidatePublicContent } from '@/server/public-cache';
export const runtime = 'nodejs';
export const GET = api(async () => { await requireUser(); return json({ records: await getContentRecords() }); });
export const POST = api(async request => { sameOrigin(request); const user = await requireUser(); const input = saveSchema.parse(await readJson(request)); const record = await saveContent(input, user._id); invalidatePublicContent(); return json({ record }); });
