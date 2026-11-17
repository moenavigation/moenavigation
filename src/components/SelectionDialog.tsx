'use client';

import { useId, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import Dialog from './Dialog';
import styles from './SelectionDialog.module.css';

export type SelectionOption = { value: string; label: string; disabled?: boolean };
type Props = {
  id?: string;
  label: string;
  value: string;
  options: readonly SelectionOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  closeLabel: string;
  searchPlaceholder?: string;
  triggerLabel?: string;
  className?: string;
};

export default function SelectionDialog({ id, label, value, options, onChange, disabled = false, closeLabel, searchPlaceholder, triggerLabel, className = '' }: Props) {
  const generatedId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find(option => option.value === value);
  const valueDescription = selected?.label || value;
  const valueDescriptionId = `${generatedId}-selected-value`;
  const searchable = options.length > 12 && Boolean(searchPlaceholder);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visible = searchable && normalizedQuery ? options.filter(option => option.label.toLocaleLowerCase().includes(normalizedQuery)) : options;
  const close = () => setOpen(false);

  return <>
    <button ref={trigger} id={id || generatedId} type="button" className={`${styles.trigger} ${className}`} disabled={disabled}
      aria-label={label} aria-describedby={valueDescription ? valueDescriptionId : undefined} aria-haspopup="dialog" aria-expanded={open} data-selection-value={value}
      onClick={() => { setQuery(''); setOpen(true); }}>
      {triggerLabel || selected?.label || value || label}
    </button>
    {valueDescription && <span id={valueDescriptionId} className="sr-only">{valueDescription}</span>}
    <Dialog open={open} onClose={close} triggerRef={trigger} title={label} closeLabel={closeLabel} className={styles.dialog}>
      <div className={styles.choices}>
        {searchable && <input className={styles.search} type="search" aria-label={searchPlaceholder} placeholder={searchPlaceholder} value={query} onChange={event => setQuery(event.target.value)} />}
        <div className={styles.options}>{visible.map(option => <button key={option.value} type="button" className={styles.option}
          aria-pressed={option.value === value} data-selection-option={option.value} disabled={disabled || option.disabled}
          onClick={() => { if (disabled || option.disabled) return; setOpen(false); onChange(option.value); }}>
          <span>{option.label}</span>{option.value === value && <Check className={styles.check} size={19} aria-hidden="true" />}
        </button>)}</div>
      </div>
    </Dialog>
  </>;
}
