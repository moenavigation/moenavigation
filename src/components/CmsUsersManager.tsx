'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Check, Plus, RefreshCw, Trash2, UserRound, X } from 'lucide-react';
import { cmsErrorText, cmsRequest } from '@/lib/cms-client';
import { useCmsLocale } from '@/lib/cms-locale';
import styles from './CmsUsersManager.module.css';

type Admin = { id: string; username: string; createdAt: string; current: boolean };
type Action = { mode: 'reset' | 'remove'; user: Admin } | null;

export default function CmsUsersManager() {
  const { t, locale } = useCmsLocale();
  const [users, setUsers] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [action, setAction] = useState<Action>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try { setUsers((await cmsRequest<{ users: Admin[] }>('/api/cms/users')).users); setError(''); }
    catch (cause) { setError(cmsErrorText(cause)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    let active = true;
    cmsRequest<{ users: Admin[] }>('/api/cms/users').then(result => { if (active) setUsers(result.users); })
      .catch(cause => { if (active) setError(cmsErrorText(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const password = String(data.get('password') || '');
    if (password !== data.get('confirmPassword')) { setError('Passwords do not match.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      await cmsRequest('/api/cms/users', { method: 'POST', body: JSON.stringify({ username: data.get('username'), password, currentPassword: data.get('currentPassword') }) });
      form.reset(); setNotice('Administrator added. Share the password privately.'); await load();
    } catch (cause) { setError(cmsErrorText(cause)); }
    finally { setBusy(false); }
  }
  async function manage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!action) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const password = String(data.get('password') || '');
    if (action.mode === 'reset' && password !== data.get('confirmPassword')) { setError('Passwords do not match.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      await cmsRequest('/api/cms/users', { method: action.mode === 'reset' ? 'PATCH' : 'DELETE', body: JSON.stringify({ id: action.user.id, currentPassword: data.get('currentPassword'), ...(action.mode === 'reset' ? { password } : {}) }) });
      setNotice(action.mode === 'reset' ? 'Password updated. Existing sessions for this administrator were signed out.' : 'Administrator removed.');
      setAction(null); await load();
    } catch (cause) { setError(cmsErrorText(cause)); }
    finally { setBusy(false); }
  }
  return <div className={styles.grid}>
    <section className={styles.panel} aria-labelledby="admin-list-heading">
      <div className={styles.heading}><div><h2 id="admin-list-heading">{t('Administrators')}</h2><p>{t('Each administrator can manage website content and other administrator accounts.')}</p></div><button type="button" className="button secondary" onClick={() => void load()} disabled={loading || busy} aria-label={t('Refresh administrators')}><RefreshCw size={18} />{t('Refresh')}</button></div>
      {loading && !users.length ? <p role="status">{t('Loading administrators…')}</p> : <ul className={styles.list}>{users.map(user => <li key={user.id}><div className={styles.identity}><span className={styles.avatar}><UserRound size={20} /></span><span><strong>{user.username}</strong><small>{user.current ? t('You') : t('Added {date}', { date: new Date(user.createdAt).toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-GB') })}</small></span></div><div className={styles.actions}>{!user.current && <><button type="button" className="button secondary" disabled={busy} onClick={() => { setAction({ mode: 'reset', user }); setError(''); setNotice(''); }}>{t('Reset password')}</button><button type="button" className={styles.remove} disabled={busy} onClick={() => { setAction({ mode: 'remove', user }); setError(''); setNotice(''); }} aria-label={t('Remove {name}', { name: user.username })}><Trash2 size={18} /></button></>}</div></li>)}</ul>}
      {notice && <p className={styles.success} role="status"><Check size={18} />{t(notice)}</p>}
    </section>
    <section className={styles.panel} aria-labelledby="admin-form-heading">
      {error && <p className={styles.error} role="alert">{t(error)}</p>}
      {action ? <><div className={styles.heading}><div><h2 id="admin-form-heading">{action.mode === 'reset' ? t('Reset password') : t('Remove administrator')}</h2><p>{action.user.username}</p></div><button type="button" className={styles.close} onClick={() => { setAction(null); setError(''); }} aria-label={t('Cancel')}><X size={20} /></button></div><form className={styles.form} onSubmit={manage} autoComplete="off">{action.mode === 'reset' && <><label>{t('New password')}<input name="password" type="password" autoComplete="new-password" required minLength={14} maxLength={200} disabled={busy} /></label><label>{t('Confirm new password')}<input name="confirmPassword" type="password" autoComplete="new-password" required minLength={14} maxLength={200} disabled={busy} /></label></>}<label>{t('Your current password')}<input name="currentPassword" type="password" autoComplete="current-password" required disabled={busy} /></label><p className={styles.hint}>{action.mode === 'remove' ? t('This administrator will lose CMS access immediately.') : t('Existing sessions for this administrator will be signed out.')}</p><button type="submit" className="button" disabled={busy}>{busy ? t('Saving…') : action.mode === 'reset' ? t('Save new password') : t('Remove administrator')}</button></form></> : <><div className={styles.heading}><div><h2 id="admin-form-heading">{t('Add administrator')}</h2><p>{t('Use a unique username and a password of at least 14 characters.')}</p></div><Plus size={22} /></div><form className={styles.form} onSubmit={create} autoComplete="off"><label>{t('Username')}<input name="username" autoComplete="off" required minLength={3} maxLength={40} pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{2,39}" disabled={busy} /></label><label>{t('Password')}<input name="password" type="password" autoComplete="new-password" required minLength={14} maxLength={200} disabled={busy} /></label><label>{t('Confirm password')}<input name="confirmPassword" type="password" autoComplete="new-password" required minLength={14} maxLength={200} disabled={busy} /></label><label>{t('Your current password')}<input name="currentPassword" type="password" autoComplete="current-password" required disabled={busy} /></label><button type="submit" className="button" disabled={busy}><Plus size={18} />{busy ? t('Saving…') : t('Add administrator')}</button></form></>}
    </section>
  </div>;
}
