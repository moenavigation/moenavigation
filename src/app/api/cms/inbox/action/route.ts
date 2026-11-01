import { requireUser } from '@/server/auth';
import { cmsEnquiryAction, enquiryActionSchema } from '@/server/enquiry-trash';
import { api, json, readJson, sameOrigin } from '@/server/http';

export const runtime = 'nodejs';
export const POST = api(async request => {
  sameOrigin(request);
  const user = await requireUser();
  const enquiry = await cmsEnquiryAction(enquiryActionSchema.parse(await readJson(request)), user);
  return json({ enquiry });
});
