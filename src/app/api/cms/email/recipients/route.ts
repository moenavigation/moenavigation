import { requireRole, rateLimit } from '@/server/auth';
import { api, HttpError, json, readJson, sameOrigin } from '@/server/http';
import { saveEnquiryRecipientsSchema } from '@/lib/enquiry-email';
import { readEnquiryRecipients, saveEnquiryRecipients } from '@/server/enquiry-recipients';

export const runtime = 'nodejs';
export const GET = api(async request => {
  await requireRole('Dev', 'Admin');
  if (new URL(request.url).search) throw new HttpError(400, 'Use the recipient dialog to load the list.');
  return json(await readEnquiryRecipients());
});
export const PUT = api(async request => {
  sameOrigin(request);
  const actor = await requireRole('Dev', 'Admin');
  const input = saveEnquiryRecipientsSchema.parse(await readJson(request));
  await rateLimit(`email-recipients:${actor._id}`, 30, 60 * 60);
  return json(await saveEnquiryRecipients(input, actor));
});
