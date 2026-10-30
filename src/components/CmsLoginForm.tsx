'use client';

import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import Image from 'next/image';
import { Eye, EyeOff, RefreshCw, X } from 'lucide-react';
import { cmsErrorText, cmsRequest } from '@/lib/cms-client';
import { useCmsLocale } from '@/lib/cms-locale';
import styles from './CmsWorkspace.module.css';

const usernameKey = 'moe-cms-remembered-username';
const puzzleImage = '/images/cms-login-maritime-puzzle.webp';

function rememberedUsername() {
  try {
    const value = window.localStorage.getItem(usernameKey) || '';
    return /^[a-z0-9@._-]{3,80}$/.test(value) ? value : '';
  } catch { return ''; }
}

export default function CmsLoginForm({ busy, error, onSignIn }: {
  busy: boolean;
  error: string;
  onSignIn: (username: string, password: string, challengeId: string, challengePosition: number) => Promise<string | null>;
}) {
  const { t } = useCmsLocale();
  // Only a username is retained; passwords stay in the native input and the browser's password manager.
  const [savedUsername] = useState(rememberedUsername);
  const [remember, setRemember] = useState(Boolean(savedUsername));
  const [showPassword, setShowPassword] = useState(false);
  const [challenge, setChallenge] = useState<{ id: string; target: number } | null>(null);
  const [aligned, setAligned] = useState(false);
  const [challengeError, setChallengeError] = useState('');
  const [challengeLoading, setChallengeLoading] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const signInRef = useRef<HTMLButtonElement>(null);
  const pieceRef = useRef<HTMLSpanElement>(null);
  const submitting = useRef(false);
  const challengeGeneration = useRef(0);

  function movePiece(input: HTMLInputElement) {
    const position = Number(input.value);
    // Keep dragging off React's render path; only alignment feedback needs state.
    // The piece is 20% of the board, so 400% translates across the remaining 80%.
    if (pieceRef.current) pieceRef.current.style.transform = `translate3d(${position * 4}%, 0, 0)`;
    setAligned(Boolean(challenge && Math.abs(challenge.target - Math.round(position)) <= 3));
  }

  async function refreshChallenge() {
    const generation = ++challengeGeneration.current;
    setChallenge(null);
    setAligned(false);
    setChallengeError('');
    setChallengeLoading(true);
    try {
      const next = await cmsRequest<{ id: string; target: number }>('/api/cms/login/challenge');
      if (generation === challengeGeneration.current) setChallenge(next);
    } catch (cause) {
      if (generation === challengeGeneration.current) setChallengeError(cmsErrorText(cause));
    } finally {
      if (generation === challengeGeneration.current) setChallengeLoading(false);
    }
  }

  function closeChallenge() {
    if (busy || submitting.current) return;
    dialogRef.current?.close();
  }

  function onDialogClose() {
    challengeGeneration.current++;
    setChallenge(null);
    setAligned(false);
    setChallengeError('');
    setChallengeLoading(false);
    signInRef.current?.focus();
  }

  function changeRemember(checked: boolean) {
    setRemember(checked);
    if (!checked) {
      try { window.localStorage.removeItem(usernameKey); } catch { /* Storage may be blocked. */ }
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || submitting.current || dialogRef.current?.open) return;
    setShowPassword(false);
    dialogRef.current?.showModal();
    void refreshChallenge();
  }

  async function verifyAndSignIn(releasedPosition: number) {
    const submittedPosition = Math.round(releasedPosition);
    if (busy || submitting.current || !challenge || Math.abs(challenge.target - submittedPosition) > 3 || !formRef.current) return;
    submitting.current = true;
    const fields = new FormData(formRef.current);
    try {
      const username = await onSignIn(String(fields.get('username') || ''), String(fields.get('password') || ''), challenge.id, submittedPosition);
      if (username) {
        try {
          if (remember) window.localStorage.setItem(usernameKey, username);
          else window.localStorage.removeItem(usernameKey);
        } catch { /* Remembering a username must never prevent sign-in. */ }
      }
      dialogRef.current?.close();
    } finally { submitting.current = false; }
  }

  function onSlideKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Fine pointer steps stay smooth; keyboard arrows retain useful 1% increments.
    const direction = ['ArrowRight', 'ArrowUp'].includes(event.key) ? 1 : ['ArrowLeft', 'ArrowDown'].includes(event.key) ? -1 : 0;
    if (direction) {
      event.preventDefault();
      event.currentTarget.value = String(Math.max(0, Math.min(100, Math.round(Number(event.currentTarget.value)) + direction)));
      movePiece(event.currentTarget);
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    void verifyAndSignIn(Number(event.currentTarget.value));
  }

  return <section className={styles.loginCard}>
    <span className={`eyebrow ${styles.loginEyebrow}`}>CMS</span>
    <h1>{t('Welcome back')}</h1>
    <p className={styles.loginIntro}>{t('Sign in to manage your website content and enquiries.')}</p>
    <form ref={formRef} className={styles.editor} method="post" onSubmit={submit} autoComplete="on" aria-busy={busy}>
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
      <button ref={signInRef} type="submit" className="button" disabled={busy}>{t('Sign in')}</button>
    </form>
    <dialog ref={dialogRef} className={styles.loginPuzzleDialog} aria-labelledby="cms-puzzle-title" aria-describedby="cms-puzzle-instructions" aria-busy={busy} onClose={onDialogClose} onCancel={event => { if (busy || submitting.current) event.preventDefault(); }} onClick={event => { if (event.target === dialogRef.current) closeChallenge(); }}>
      <div className={styles.loginPuzzleHeader}>
        <div><span className="eyebrow">MOE NAVIGATION</span><h2 id="cms-puzzle-title">{t('Complete the picture')}</h2></div>
        <button type="button" className={styles.loginPuzzleIconButton} onClick={closeChallenge} disabled={busy} aria-label={t('Close verification')}><X size={21} aria-hidden="true" /></button>
      </div>
      <p id="cms-puzzle-instructions" className={styles.loginPuzzleInstructions}>{t('Slide the picture piece into the matching shape to continue.')}</p>
      <div className={styles.loginPuzzleBoard} aria-hidden="true">
        <Image src={puzzleImage} alt="" fill unoptimized loading="eager" />
        {challenge && <>
          <span className={styles.loginPuzzleTarget} style={{ left: `${challenge.target * .8}%` }} />
          <span key={challenge.id} ref={pieceRef} className={styles.loginPuzzlePiece} style={{ backgroundPosition: `${challenge.target}% 50%` }}>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="M50 1 62 29 94 34 69 56 77 90 50 72 23 90 31 56 6 34 38 29Z" fill="none" stroke="white" strokeWidth="4" /></svg>
          </span>
        </>}
      </div>
      <div className={styles.loginPuzzleControls}>
        <div className={styles.loginPuzzleSliderRow}>
          <input key={challenge?.id ?? 'loading'} type="range" min="0" max="100" step="0.1" defaultValue="0" onInput={event => movePiece(event.currentTarget)} onPointerUp={event => void verifyAndSignIn(Number(event.currentTarget.value))} onKeyDown={onSlideKeyDown} disabled={busy || !challenge} aria-label={t('Slide verification')} aria-valuetext={aligned ? t('Aligned with marker') : t('Move to marker')} />
        </div>
        <div className={styles.loginPuzzleFeedback}>
          <span role="status">{busy ? t('Signing in…') : challengeError ? t(challengeError) : challengeLoading ? t('Loading slide…') : t('Release to sign in, or press Enter.')}</span>
          <button type="button" className={styles.loginPuzzleIconButton} onClick={() => void refreshChallenge()} disabled={busy || challengeLoading} aria-label={t('New slide challenge')} title={t('New slide challenge')}><RefreshCw size={19} aria-hidden="true" /></button>
        </div>
      </div>
    </dialog>
  </section>;
}
