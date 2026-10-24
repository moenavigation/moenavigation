import type { Metadata } from 'next';
import CmsDemo from '@/components/CmsDemo';
import { CmsLocaleProvider } from '@/lib/cms-locale';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'MOE Navigation · จัดการเนื้อหา', robots: { index: false, follow: false } };

export default function CmsPage() {
  return <CmsLocaleProvider><CmsDemo /></CmsLocaleProvider>;
}
