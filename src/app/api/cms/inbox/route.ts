import { requireUser } from '@/server/auth';
import { getEnquiry, getEnquiryPage, updateEnquiry } from '@/server/enquiries';
import { z } from 'zod';
import { api, HttpError, json, readJson, sameOrigin } from '@/server/http';
import { inboxSchema } from '@/server/validation';
import { parseInboxQuery } from '@/lib/inbox-query';
export const runtime = 'nodejs';
export const GET = api(async request => {
  await requireUser();
  const params = new URL(request.url).searchParams;
  if (params.has('id')) {
    if (params.size !== 1) throw new HttpError(400, 'Use a single enquiry ID to refresh an enquiry.');
    return json({ enquiry: await getEnquiry(z.uuid().parse(params.get('id'))) });
  }
  return json(await getEnquiryPage(parseInboxQuery(params)));
});
export const PATCH = api(async request => { sameOrigin(request); await requireUser(); return json({ enquiry: await updateEnquiry(inboxSchema.parse(await readJson(request))) }); });
