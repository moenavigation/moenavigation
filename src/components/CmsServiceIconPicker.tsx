'use client';

import { useId } from 'react';
import { Check } from 'lucide-react';
import { useCmsLocale } from '@/lib/cms-locale';
import { ServiceIcon, serviceIconOptions } from '@/lib/service-icons';
import styles from './CmsServiceIconPicker.module.css';

export default function CmsServiceIconPicker({ value, disabled, onChange }: {
  value?: string;
  disabled: boolean;
  onChange: (icon: string) => void;
}) {
  const { t } = useCmsLocale();
  const id = useId();
  const current = serviceIconOptions.find(option => option.value === (value || 'Ship'));

  return <fieldset className={styles.fieldset} disabled={disabled} aria-describedby={`${id}-hint`}>
    <legend>{t('Service icon')}</legend>
    <p className={styles.hint} id={`${id}-hint`}>{t('Choose the symbol shown beside this service. Save to apply.')}</p>
    {!current && <p className={styles.current}><ServiceIcon name={value} size={24} aria-hidden="true" /><span><strong>{t('Current icon')}</strong><span>{t('The current icon is kept until you choose a replacement.')}</span></span></p>}
    <div className={styles.options}>{serviceIconOptions.map(option => {
      const selected = current?.value === option.value;
      return <label className={styles.option} key={option.value}>
        <input type="radio" name={`${id}-icon`} value={option.value} checked={selected} onChange={() => onChange(option.value)} />
        <option.Icon className={styles.icon} size={26} aria-hidden="true" />
        <span>{t(option.label)}</span>
        {selected && <Check className={styles.check} size={16} aria-hidden="true" />}
      </label>;
    })}</div>
  </fieldset>;
}
