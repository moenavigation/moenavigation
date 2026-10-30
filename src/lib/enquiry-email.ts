export type EmailSetupCheck = 'missing' | 'invalid' | 'added';

/** Safe setup information only; never include credentials or email addresses. */
export type EmailSetupStatus = {
  provider: 'Resend';
  configured: boolean;
  checks: { apiKey: EmailSetupCheck; sender: EmailSetupCheck; recipient: EmailSetupCheck };
};
import { z } from 'zod';

export const enquiryRecipientLimit = 50;
export const enquiryRecipientList = z.array(z.string().trim().pipe(z.email().max(254))).max(enquiryRecipientLimit).superRefine((values, context) => {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    const key = value.toLowerCase();
    if (seen.has(key)) context.addIssue({ code: 'custom', path: [index], message: 'Each recipient email must be different.' });
    seen.add(key);
  });
});
export type EnquiryRecipientSettings = { revision: number; recipients: string[] };
export const saveEnquiryRecipientsSchema = z.strictObject({ expectedRevision: z.number().int().nonnegative(), recipients: enquiryRecipientList });

