'use client';

import { useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useCmsLocale } from '@/lib/cms-locale';
import { cmsInputPlaceholder } from '@/lib/cms-input-placeholders';
import styles from './CmsPasswordField.module.css';

export default function CmsPasswordField({ label, name, autoComplete, minLength, disabled = false }: {
  label: string;
  name: string;
  autoComplete: 'new-password' | 'current-password';
  minLength?: number;
  disabled?: boolean;
}) {
  const { t, locale } = useCmsLocale();
  const id = useId();
  const [visible, setVisible] = useState(false);
  const shown = visible && !disabled;
  const toggleLabel = `${t(shown ? 'Hide password' : 'Show password')}: ${t(label)}`;
  return <div className={styles.field}>
    <label htmlFor={id}>{t(label)}</label>
    <div className={styles.control}>
      <input placeholder={cmsInputPlaceholder(locale, name.startsWith('confirm') || label.startsWith('Confirm') ? 'confirmPassword' : autoComplete === 'new-password' ? 'newPassword' : 'currentPassword')} className={styles.input} id={id} name={name} type={shown ? 'text' : 'password'} autoComplete={autoComplete} required minLength={minLength} maxLength={200} disabled={disabled} />
      <button type="button" className={styles.toggle} onClick={() => setVisible(value => !value)} disabled={disabled} aria-controls={id} aria-label={toggleLabel} aria-pressed={shown} title={toggleLabel}>
        {shown ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </button>
    </div>
  </div>;
}
