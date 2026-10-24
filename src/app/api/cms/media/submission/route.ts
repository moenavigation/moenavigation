import { z } from 'zod';
import { requireUser } from '@/server/auth';
import { resolveMediaSubmission } from '@/server/media';
import { api, json, readJson, sameOrigin } from '@/server/http';
import { submissionSchema } from '@/server/validation';
import { invalidatePublicContent } from '@/server/public-cache';

export const runtime = 'nodejs';
const schema = z.object({ submissionId: submissionSchema, action: z.enum(['resolve', 'abort']) });

export const POST = api(async request => {
  sameOrigin(request);
  const user = await requireUser();
  const input = schema.parse(await readJson(request));
  const result = await resolveMediaSubmission(input.submissionId, user._id, input.action);
  if (result.record) invalidatePublicContent();
  return json(result);
});
