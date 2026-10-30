import { z } from 'zod';
import { requireUser } from '@/server/auth';
import { getCmsContentRecord } from '@/server/content';
import { api, HttpError, json } from '@/server/http';
import { contentTypes } from '@/lib/cms-types';
import { idSchema } from '@/lib/validation';

export const runtime = 'nodejs';
const querySchema = z.strictObject({ type: z.enum(contentTypes), id: idSchema });

export const GET = api(async request => {
  await requireUser();
  const params = new URL(request.url).searchParams;
  const entries = [...params.entries()];
  if (entries.length !== 2 || params.getAll('type').length !== 1 || params.getAll('id').length !== 1) {
    throw new HttpError(400, 'Choose one content item to edit.');
  }
  const { type, id } = querySchema.parse(Object.fromEntries(entries));
  const record = await getCmsContentRecord(type, id);
  if (!record) throw new HttpError(404, 'This content is no longer available for editing.');
  return json({ record });
});
