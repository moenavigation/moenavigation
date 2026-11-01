import { removeEnquirySchema, removeTrashedEnquiry } from '@/server/enquiry-trash';
import { api, json, readJson, sameOrigin } from '@/server/http';
import { requireTrashManager } from '@/server/trash-permissions';

export const runtime = 'nodejs';
export const POST = api(async request => {
  sameOrigin(request);
  const actor = await requireTrashManager();
  return json(await removeTrashedEnquiry(removeEnquirySchema.parse(await readJson(request)), actor));
});
