'use client';

import { useCmsLocale } from '@/lib/cms-locale';
import WorkingPanel, { type WorkingPanelProps } from './WorkingPanel';

export default function CmsWorkingPanel({ title, description, ...props }: Omit<WorkingPanelProps, 'locale'>) {
  const { t, locale } = useCmsLocale();
  return <WorkingPanel {...props} title={title ? t(title) : undefined} description={description ? t(description) : undefined} locale={locale} />;
}
