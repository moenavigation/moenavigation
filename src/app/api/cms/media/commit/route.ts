import { z } from 'zod';
import { requireUser } from '@/server/auth';
import { commitMedia } from '@/server/media';
import { api, json, readJson, sameOrigin } from '@/server/http';
import { submissionSchema } from '@/server/validation';
export const runtime = 'nodejs';
const schema = z.object({ mediaId: z.string().regex(/^[a-f0-9]{64}$/), submissionId: submissionSchema, title: z.string().trim().min(1).max(160) });
export const POST = api(async request => { sameOrigin(request); const user = await requireUser(); const input = schema.parse(await readJson(request)); return json({ media: await commitMedia(input.mediaId, input.submissionId, input.title, user._id, user) }); });
