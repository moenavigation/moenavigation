import { removeContentSchema, removeTrashedContent } from '@/server/content-trash';
import { requireTrashManager } from '@/server/trash-permissions';
import { api, json, readJson, sameOrigin } from '@/server/http';
import { invalidatePublicContent } from '@/server/public-cache';

export const runtime = 'nodejs';
export const POST = api(async request => {
  sameOrigin(request);
  const actor = await requireTrashManager();
  const input = removeContentSchema.parse(await readJson(request));
  const result = await removeTrashedContent(input, actor);
  invalidatePublicContent();
  return json(result);
});
