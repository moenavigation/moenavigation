import 'server-only';
import { appendAuditEvent, auditActor } from './audit';
import { cache } from 'react';
import type { z } from 'zod';
import type { SiteSettings } from '@/lib/cms-types';
import { companyNameEn, companyNameTh } from '@/lib/company';
import { collections, getDb, transaction } from './db';
import { HttpError } from './http';
import { saveSettingsSchema } from './validation';

const defaults: SiteSettings = { companyName: companyNameEn, companyNameTh, officeAddress: '', officeAddressTh: '', phone: '', email: '', mapUrl: '', revision: 0 };
export const getSiteSettings = cache(async (): Promise<SiteSettings> => {
  const saved = await collections(await getDb()).settings.findOne({ _id: 'website' });
  if (!saved) return defaults;
  const { _id, ...settings } = saved;
  void _id;
  return settings;
});
export async function saveSiteSettings(input: z.infer<typeof saveSettingsSchema>, actor?: import('./db').UserDocument) {
  return transaction(async (db, session) => {
    const c = collections(db);
    const existing = await c.settings.findOne({ _id: 'website' }, { session });
    if ((existing?.revision || 0) !== input.expectedRevision) throw new HttpError(409, 'Website details changed elsewhere. Refresh them before saving.');
    const settings: SiteSettings = { ...input.settings, revision: input.expectedRevision + 1 };
    await c.settings.replaceOne({ _id: 'website' }, settings, { upsert: true, session });
    if (actor) await appendAuditEvent(db, session, { action: 'settings.updated', actor: auditActor(actor), target: { type: 'Settings', id: 'website' } });
    return settings;
  });
}
