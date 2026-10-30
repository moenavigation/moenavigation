import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Noto_Sans_Thai } from 'next/font/google';
import CmsWorkspace from '@/components/CmsWorkspace';
import { CmsLocaleProvider } from '@/lib/cms-locale';
import { companyNameEn } from '@/lib/company';
import '../globals.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: `${companyNameEn} · จัดการเนื้อหา`, robots: { index: false, follow: false } };

const notoSansThai = Noto_Sans_Thai({ subsets: ['thai', 'latin'], display: 'swap', variable: '--font-noto-sans-thai' });
export default function CmsLayout({ children }: { children: ReactNode }) {
  return <html lang="th" data-scroll-behavior="smooth" className={notoSansThai.variable}><body><CmsLocaleProvider><CmsWorkspace />{children}</CmsLocaleProvider></body></html>;
}
