import { companyName } from '@/lib/company';
import type { Locale } from '@/lib/content';

export default function BrandMark({ className, locale = 'en', alt = companyName(locale) }: { className?: string; locale?: Locale; alt?: string }) {
  // This local SVG needs no raster optimization and must also work in root error boundaries.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={className} src="/brand/moe-logo.svg" alt={alt} width={805} height={365} />;
}
