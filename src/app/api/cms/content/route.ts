import { requireUser } from '@/server/auth';
import { getContentRecords, saveContent } from '@/server/content';
import { api, json, readJson, sameOrigin } from '@/server/http';
import { saveSchema } from '@/server/validation';
export const runtime = 'nodejs';
export const GET = api(async () => { await requireUser(); return json({ records: await getContentRecords() }); });
export const POST = api(async request => { sameOrigin(request); const user = await requireUser(); const input = saveSchema.parse(await readJson(request)); return json({ record: await saveContent(input, user._id) }); });
