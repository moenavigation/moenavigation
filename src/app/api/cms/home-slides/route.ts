import { requireUser } from '@/server/auth';
import { getCmsHomeSlides, saveHomeSlides } from '@/server/home-slides';
import { api, json, readJson, sameOrigin } from '@/server/http';
import { invalidatePublicContent } from '@/server/public-cache';
import { saveHomeSlidesSchema } from '@/server/validation';

export const runtime = 'nodejs';

export const GET = api(async () => {
  await requireUser();
  return json({ record: await getCmsHomeSlides() });
});

export const PUT = api(async request => {
  sameOrigin(request);
  const actor = await requireUser();
  const input = saveHomeSlidesSchema.parse(await readJson(request));
  const record = await saveHomeSlides(input, actor);
  invalidatePublicContent();
  return json({ record });
});
