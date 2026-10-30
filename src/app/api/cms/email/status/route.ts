import { requireUser } from '@/server/auth';
import { emailSetupStatus } from '@/server/enquiry-notifications';
import { api, HttpError, json } from '@/server/http';
import { readEnquiryRecipients } from '@/server/enquiry-recipients';

export const runtime = 'nodejs';

export const GET = api(async request => {
  await requireUser();
  if (new URL(request.url).search) throw new HttpError(400, 'Use the email setup controls to refresh.');
  return json(emailSetupStatus(process.env, (await readEnquiryRecipients()).recipients));
});
