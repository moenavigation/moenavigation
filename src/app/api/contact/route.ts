import { submitEnquiry } from '@/server/enquiries';
import { api, json, readJson, sameOrigin } from '@/server/http';
import { enquirySchema } from '@/server/validation';
import { after } from 'next/server';
import { deliverEnquiryNotification, emailSetupStatus } from '@/server/enquiry-notifications';
export const runtime = 'nodejs';
export const maxDuration = 30;
export const POST = api(async request => {
  sameOrigin(request);
  const result = await submitEnquiry(enquirySchema.parse(await readJson(request)));
  const checks = emailSetupStatus().checks;
  if (checks.apiKey === 'added' && checks.sender === 'added') after(async () => {
    try { await deliverEnquiryNotification(result.id); }
    catch { console.error('Enquiry notification processing unavailable; saved enquiry retained.'); }
  });
  return json(result, 201);
});
