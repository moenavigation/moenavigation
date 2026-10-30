import { parseCmsLogQuery } from '@/lib/cms-logs';
import { requireUser } from '@/server/auth';
import { getCmsLogPage } from '@/server/audit';
import { api, json } from '@/server/http';

export const runtime = 'nodejs';
export const GET = api(async request => {
  await requireUser();
  return json(await getCmsLogPage(parseCmsLogQuery(new URL(request.url).searchParams)));
});
