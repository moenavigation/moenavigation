import { requireUser } from '@/server/auth';
import { getDashboardAttention, getDashboardData, parseAttentionQuery } from '@/server/dashboard';
import { api, json } from '@/server/http';

export const runtime = 'nodejs';
export const GET = api(async request => {
  await requireUser();
  const params = new URL(request.url).searchParams;
  return json(params.size ? await getDashboardAttention(parseAttentionQuery(params)) : await getDashboardData());
});
