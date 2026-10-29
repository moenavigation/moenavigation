import type { Metadata } from 'next';
import CmsDemo from '@/components/CmsDemo';
import { CmsLocaleProvider } from '@/lib/cms-locale';
import { companyNameEn } from '@/lib/company';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: `${companyNameEn} · จัดการเนื้อหา`, robots: { index: false, follow: false } };

export default function CmsPage() {
  return <CmsLocaleProvider><CmsDemo /></CmsLocaleProvider>;
}
