'use client';

import { useRef, useState, type FormEvent } from 'react';
import { Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { useCmsLocale } from '@/lib/cms-locale';
import styles from './CmsWorkspace.module.css';

const usernameKey = 'moe-cms-remembered-username';

function rememberedUsername() {
  try {
    const value = window.localStorage.getItem(usernameKey) || '';
    return /^[a-z0-9@._-]{3,80}$/.test(value) ? value : '';
  } catch { return ''; }
}

export default function CmsLoginForm({ busy, error, onSignIn }: {
  busy: boolean;
  error: string;
  onSignIn: (username: string, password: string) => Promise<string | null>;
}) {
  const { t } = useCmsLocale();
  // This form mounts after the session check. Only a username is retained;
  // passwords stay in the native input and the browser's own password manager.
  const [savedUsername] = useState(rememberedUsername);
  const [remember, setRemember] = useState(Boolean(savedUsername));
  const [showPassword, setShowPassword] = useState(false);
  const submitting = useRef(false);

  function changeRemember(checked: boolean) {
    setRemember(checked);
    if (!checked) {
      try { window.localStorage.removeItem(usernameKey); } catch { /* Storage may be blocked. */ }
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || submitting.current) return;
    submitting.current = true;
    setShowPassword(false);
    const fields = new FormData(event.currentTarget);
    try {
      const username = await onSignIn(String(fields.get('username') || ''), String(fields.get('password') || ''));
      if (username) {
        try {
          if (remember) window.localStorage.setItem(usernameKey, username);
          else window.localStorage.removeItem(usernameKey);
        } catch { /* Remembering a username must never prevent sign-in. */ }
      }
    } finally { submitting.current = false; }
  }

  return <section className={styles.loginCard}>
    <span className={`eyebrow ${styles.loginEyebrow}`}>CMS</span>
    <h1>{t('Welcome back')}</h1>
    <p className={styles.loginIntro}>{t('Sign in to manage your website content and enquiries.')}</p>
    <form className={styles.editor} method="post" onSubmit={submit} autoComplete="on" aria-busy={busy}>
      <label htmlFor="cms-login-username">{t('Username')}
        <input id="cms-login-username" name="username" required autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={80} defaultValue={savedUsername} readOnly={busy} />
      </label>
      <div className={styles.loginPasswordField}>
        <label htmlFor="cms-login-password">{t('Password')}</label>
        <div className={styles.loginPasswordInput}>
          <input id="cms-login-password" type={showPassword ? 'text' : 'password'} name="password" required autoComplete="current-password" autoCapitalize="none" spellCheck={false} maxLength={200} readOnly={busy} />
          <button className={styles.passwordToggle} type="button" onClick={() => setShowPassword(value => !value)} disabled={busy} aria-controls="cms-login-password" aria-label={t(showPassword ? 'Hide password' : 'Show password')} title={t(showPassword ? 'Hide password' : 'Show password')}>
            {showPassword ? <EyeOff size={21} aria-hidden="true" /> : <Eye size={21} aria-hidden="true" />}
          </button>
        </div>
      </div>
      <div className={styles.loginRemember}>
        <label><input type="checkbox" checked={remember} disabled={busy} onChange={event => changeRemember(event.target.checked)} />{t('Remember username on this device')}</label>
        <p className={styles.loginHelp}>{t("To remember your password, use your browser's password manager.")}</p>
      </div>
      {error && <div className={styles.error} role="alert">{t(error)}</div>}
      <button type="submit" className="button" disabled={busy}>{busy ? <><LoaderCircle className={styles.spinner} size={20} aria-hidden="true" />{t('Signing in…')}</> : t('Sign in')}</button>
    </form>
  </section>;
}
