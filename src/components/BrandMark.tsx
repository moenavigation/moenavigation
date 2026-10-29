import { companyName } from '@/lib/company';
import type { Locale } from '@/lib/content';

export default function BrandMark({ className, locale = 'en' }: { className?: string; locale?: Locale }) {
  // This local SVG needs no raster optimization and must also work in root error boundaries.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={className} src="/brand/moe-logo.svg" alt={companyName(locale)} width={805} height={365} />;
}
