import { requireUser } from '@/server/auth';
import { getContentRecords } from '@/server/content';
import { getMedia } from '@/server/media';
import { getEnquiries } from '@/server/enquiries';
import { getSiteSettings } from '@/server/settings';
import { api } from '@/server/http';
import { appendAuditEvent, auditActor } from '@/server/audit';
import { transaction } from '@/server/db';
export const runtime = 'nodejs';
export const GET = api(async () => {
  const user = await requireUser();
  const [records, media, enquiries, settings] = await Promise.all([getContentRecords(), getMedia(), getEnquiries(), getSiteSettings()]);
  await transaction((db, session) => appendAuditEvent(db, session, { action: 'settings.exported', actor: auditActor(user), target: { type: 'Settings', id: 'website' } }));
  return new Response(JSON.stringify({ format: 'moe-export-v1', exportedAt: new Date().toISOString(), records, media, enquiries, settings }, null, 2), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Content-Disposition': 'attachment; filename="moe-content-export.json"', 'X-Content-Type-Options': 'nosniff' } });
});
