import { issueLoginChallenge } from '@/server/auth';
import { api, json } from '@/server/http';

export const runtime = 'nodejs';
export const GET = api(async () => json(await issueLoginChallenge()));
