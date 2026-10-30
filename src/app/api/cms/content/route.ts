import { requireUser } from '@/server/auth';
import { getCmsContentOverview, getCmsContentPage, getCmsTrashRecords, getContentRecords, saveCmsContent } from '@/server/content';
import { api, HttpError, json, readJson, sameOrigin } from '@/server/http';
import { saveSchema } from '@/server/validation';
import { invalidatePublicContent } from '@/server/public-cache';
import { z } from 'zod';
export const runtime = 'nodejs';
const collectionQuerySchema = z.strictObject({
  type: z.enum(['Vessel', 'Route', 'Project', 'Service', 'News']),
  q: z.string().trim().max(200).refine(value => !value.includes('\0')).optional().default(''),
  status: z.enum(['All', 'Published', 'Draft']).optional().default('All'),
  cursor: z.string().min(1).max(400).regex(/^[A-Za-z0-9_-]+$/).optional().transform(value => value ?? null),
});
export const GET = api(async request => {
  const actor = await requireUser();
  const params = new URL(request.url).searchParams;
  if (params.size === 0) return json({ records: await getContentRecords() });
  if (params.size === 1 && params.get('scope') === 'overview') return json(await getCmsContentOverview(actor.role));
  if (params.size === 1 && params.get('scope') === 'trash') return json({ records: await getCmsTrashRecords() });
  const entries = [...params.entries()];
  if (entries.some(([key], index) => !['type', 'q', 'status', 'cursor'].includes(key) || entries.findIndex(([other]) => other === key) !== index)) {
    throw new HttpError(400, 'Content list filters are invalid. Refresh the list.');
  }
  return json(await getCmsContentPage(collectionQuerySchema.parse(Object.fromEntries(entries))));
});
export const POST = api(async request => { sameOrigin(request); const user = await requireUser(); const input = saveSchema.parse(await readJson(request)); const record = await saveCmsContent(input, user); invalidatePublicContent(); return json({ record }); });
