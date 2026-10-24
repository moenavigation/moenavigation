import type { ReactNode } from 'react';
import { Noto_Sans_Thai } from 'next/font/google';
import '../globals.css';

const notoSansThai = Noto_Sans_Thai({ subsets: ['thai', 'latin'], display: 'swap', variable: '--font-noto-sans-thai' });
export default function CmsLayout({ children }: { children: ReactNode }) {
  return <html lang="th" data-scroll-behavior="smooth" className={notoSansThai.variable}><body>{children}</body></html>;
}
