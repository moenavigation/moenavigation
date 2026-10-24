import { requireUser } from '@/server/auth';
import { api, json, sameOrigin } from '@/server/http';
import { invalidatePublicContent } from '@/server/public-cache';

export const runtime = 'nodejs';
// Administrator maintenance: refresh published pages after an import or restore
// performed outside the CMS API. Ordinary CMS saves invalidate automatically.
export const POST = api(async request => {
  sameOrigin(request);
  await requireUser();
  invalidatePublicContent();
  return json({ refreshed: true });
});
