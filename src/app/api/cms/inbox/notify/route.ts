import { z } from 'zod';
import { requireUser, rateLimit } from '@/server/auth';
import { cleanEnquiry, recordNotificationRequest } from '@/server/enquiries';
import { deliverEnquiryNotification } from '@/server/enquiry-notifications';
import { api, json, readJson, sameOrigin } from '@/server/http';
export const runtime = 'nodejs';
export const maxDuration = 30;
export const POST = api(async request => {
  sameOrigin(request);
  const user = await requireUser();
  const { id } = z.object({ id: z.uuid() }).strict().parse(await readJson(request));
  await rateLimit(`notification-retry:${user._id}`, 30, 60 * 60);
  await recordNotificationRequest(id, user);
  return json({ enquiry: cleanEnquiry(await deliverEnquiryNotification(id)) });
});
