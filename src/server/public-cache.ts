import 'server-only';
import { revalidatePath, revalidateTag } from 'next/cache';

export const PUBLIC_CONTENT_TAG = 'moe-public-content-v1';
export const PUBLIC_CACHE_SECONDS = 86400;

// Call only after a committed CMS operation. Expire immediately so a removed
// page cannot be served stale, and new URLs can replace cached 404 responses.
export function invalidatePublicContent() {
  revalidateTag(PUBLIC_CONTENT_TAG, { expire: 0 });
  revalidatePath('/', 'layout');
  revalidatePath('/sitemap.xml');
}
