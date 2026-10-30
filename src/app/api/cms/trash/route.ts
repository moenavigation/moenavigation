import { parseCmsTrashQuery } from '@/lib/cms-trash';
import { requireUser } from '@/server/auth';
import { api, json } from '@/server/http';
import { getCmsTrashPage } from '@/server/trash';

export const runtime = 'nodejs';

export const GET = api(async request => {
  const actor = await requireUser();
  return json(await getCmsTrashPage(parseCmsTrashQuery(new URL(request.url).searchParams), actor));
});
