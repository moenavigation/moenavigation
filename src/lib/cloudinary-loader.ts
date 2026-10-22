'use client';

import type { ImageLoaderProps } from 'next/image';

/** Delivery derivatives only; original saved URLs and media references stay intact. */
export function cloudinaryLoader({ src, width }: ImageLoaderProps): string {
  let url: URL;
  try { url = new URL(src); } catch { return src; }
  if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com'
    || !/^\/[a-zA-Z0-9_-]+\/image\/upload\//.test(url.pathname)
    || url.pathname.includes('/s--') || url.search || url.hash) return src;
  const safeWidth = Math.min(3840, Math.max(32, Math.round(width || 640)));
  url.pathname = url.pathname.replace('/image/upload/', `/image/upload/f_auto,q_auto:good,c_limit,w_${safeWidth}/`);
  return url.href;
}

export default cloudinaryLoader;
