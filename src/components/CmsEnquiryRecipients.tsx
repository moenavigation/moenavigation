'use client';

import { useEffect, useId, useRef, useState, type FormEvent, type RefObject } from 'react';
import { Mail, Plus, Trash2, X } from 'lucide-react';
import { enquiryRecipientLimit, saveEnquiryRecipientsSchema, type EnquiryRecipientSettings } from '@/lib/enquiry-email';
import type { CmsRole } from '@/lib/cms-roles';
import { cmsErrorText, CmsRequestError, cmsRequest } from '@/lib/cms-client';
import { useCmsLocale } from '@/lib/cms-locale';
import { containDialogFocus } from '@/lib/dialog-focus';
import { useCmsDeadline } from './useCmsEmailSetup';
import styles from './CmsEnquiryRecipients.module.css';

export default function CmsEnquiryRecipients({ role, onSaved }: { role: CmsRole; onSaved: () => void }) {
  const { t } = useCmsLocale();
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  if (role !== 'Dev' && role !== 'Admin') return null;
  return <div className={styles.launcher}>
    <button ref={trigger} type="button" className="button secondary" onClick={() => { setNotice(false); setOpen(true); }}><Mail size={18} aria-hidden="true" />{t('Notification recipients')}</button>
    {notice && <p role="status">{t('Notification recipients saved.')}</p>}
    {open && <RecipientDialog onClose={() => setOpen(false)} onSaved={() => { setOpen(false); setNotice(true); onSaved(); }} trigger={trigger} />}
  </div>;
}

function RecipientDialog({ onClose, onSaved, trigger }: { onClose: () => void; onSaved: () => void; trigger: RefObject<HTMLButtonElement | null> }) {
  const { t } = useCmsLocale();
  const title = useId();
  const modal = useRef<HTMLDialogElement>(null);
  const request = useRef<AbortController | null>(null);
  const alive = useRef(false);
  const loadAfter = useRef(0);
  const [saved, setSaved] = useState<EnquiryRecipientSettings | null>(null);
  const [rows, setRows] = useState<{ id: string; email: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [loadUntil, setLoadUntil] = useState(0);
  const coolingDown = useCmsDeadline(loadUntil);
  const dirty = saved !== null && JSON.stringify(rows.map(row => row.email.trim())) !== JSON.stringify(saved.recipients);

  useEffect(() => {
    alive.current = true;
    const dialog = modal.current;
    const opener = trigger.current;
    const overflow = document.body.style.overflow;
    dialog?.showModal(); document.body.style.overflow = 'hidden';
    const timer = setTimeout(() => void load(), 0);
    return () => {
      alive.current = false; clearTimeout(timer); request.current?.abort(); request.current = null;
      dialog?.close(); document.body.style.overflow = overflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
    // Each dialog opening owns a new draft and request lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    if (request.current || Date.now() < loadAfter.current) return;
    const controller = new AbortController(); request.current = controller;
    loadAfter.current = Date.now() + 3000; setLoadUntil(loadAfter.current);
    setLoading(true); setError('');
    try {
      const result = await cmsRequest<EnquiryRecipientSettings>('/api/cms/email/recipients', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) });
      if (!alive.current || controller.signal.aborted || request.current !== controller) return;
      setSaved(result); setRows(result.recipients.map(email => ({ id: crypto.randomUUID(), email }))); setConflict(false);
    } catch (cause) {
      if (alive.current && !controller.signal.aborted && request.current === controller) setError(cmsErrorText(cause));
    } finally {
      if (alive.current && request.current === controller) { request.current = null; setLoading(false); }
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.current || !saved || !dirty || conflict) return;
    const parsed = saveEnquiryRecipientsSchema.safeParse({ expectedRevision: saved.revision, recipients: rows.map(row => row.email) });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message || 'Check each recipient email address.'); return; }
    const controller = new AbortController(); request.current = controller;
    setSaving(true); setError('');
    try {
      await cmsRequest<EnquiryRecipientSettings>('/api/cms/email/recipients', { method: 'PUT', body: JSON.stringify(parsed.data), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]) });
      if (!alive.current || controller.signal.aborted || request.current !== controller) return;
      onSaved();
    } catch (cause) {
      if (alive.current && !controller.signal.aborted && request.current === controller) { setError(cmsErrorText(cause)); setConflict(cause instanceof CmsRequestError && cause.status === 409); }
    } finally {
      if (alive.current && request.current === controller) { request.current = null; setSaving(false); }
    }
  }

  function add() {
    const id = crypto.randomUUID(); setRows(current => [...current, { id, email: '' }]);
    requestAnimationFrame(() => {
      const input = document.getElementById(id);
      input?.focus({ preventScroll: true });
      input?.scrollIntoView({ block: 'center', behavior: 'instant' });
    });
  }
  return <dialog ref={modal} className={styles.dialog} aria-labelledby={title} onKeyDown={containDialogFocus} onCancel={event => { event.preventDefault(); if (!saving) onClose(); }} onInvalidCapture={event => {
    const control = event.target;
    requestAnimationFrame(() => { if (control instanceof HTMLElement && control.isConnected && modal.current?.open) control.scrollIntoView({ block: 'center', behavior: 'instant' }); });
  }}>
    <header className={styles.header}><h2 id={title}>{t('Notification recipients')}</h2><button autoFocus type="button" className={styles.close} disabled={saving} onClick={onClose} aria-label={t('Close notification recipients')}><X size={20} aria-hidden="true" /></button></header>
    <form onSubmit={event => void save(event)}>
      <div className={styles.body}>
        <p>{t('Choose who receives website enquiry emails. Add, edit or remove addresses, then save your changes.')}</p>
        {loading ? <p role="status">{t('Loading recipients…')}</p> : saved && <>
          <div className={styles.list}>{rows.map((row, index) => <div key={row.id} className={styles.row}>
            <label className="field" htmlFor={row.id}>{t('Recipient email {number}', { number: index + 1 })}<input id={row.id} type="email" inputMode="email" autoComplete="off" spellCheck={false} required maxLength={254} value={row.email} disabled={saving} onChange={event => { const email = event.target.value; setRows(current => current.map(item => item.id === row.id ? { ...item, email } : item)); }} /></label>
            <button type="button" className={styles.remove} disabled={saving} onClick={() => setRows(current => current.filter(item => item.id !== row.id))} aria-label={t('Remove recipient {number}', { number: index + 1 })}><Trash2 size={19} aria-hidden="true" /></button>
          </div>)}</div>
          {!rows.length && <div className={styles.empty}><Mail size={28} aria-hidden="true" /><strong>{t('No notification recipients')}</strong><p>{t('An empty list pauses enquiry emails. Enquiries will still be saved in the CMS.')}</p></div>}
          <div className={styles.add}><button type="button" className="button secondary" disabled={saving || rows.length >= enquiryRecipientLimit} onClick={add}><Plus size={18} aria-hidden="true" />{t('Add email')}</button><span>{t('{count} of {limit} recipients', { count: rows.length, limit: enquiryRecipientLimit })}</span></div>
          <p className={styles.hint}>{t('New notifications go to everyone on the saved list. Recipients can see the other addresses. Earlier retries keep their original recipients to avoid duplicates.')}</p>
          <p className={styles.hint}>{t('Saving this list does not send an email. Resend still needs a configured API key and verified sender.')}</p>
        </>}
        {error && <div className={styles.error} role="alert"><p>{t(error)}</p>{(!saved || conflict) && <button type="button" className="button secondary" disabled={loading || saving || coolingDown} onClick={() => void load()}>{t(conflict ? 'Load latest list' : 'Try again')}</button>}{conflict && <p>{t('Loading the latest list replaces your unsaved changes.')}</p>}</div>}
      </div>
      <footer className={styles.footer}><button type="button" className="button secondary" disabled={saving} onClick={onClose}>{t('Cancel')}</button><button type="submit" className="button" disabled={loading || saving || !dirty || conflict}>{t(saving ? 'Saving…' : 'Save changes')}</button></footer>
    </form>
  </dialog>;
}
