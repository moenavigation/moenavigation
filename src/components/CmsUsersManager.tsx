'use client';

import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react';
import { Check, LockKeyhole, Pencil, Plus, RefreshCw, Settings, ShieldCheck, Trash2, Camera, X } from 'lucide-react';
import { cmsErrorText, cmsRequest } from '@/lib/cms-client';
import { useCmsLocale } from '@/lib/cms-locale';
import { containDialogFocus } from '@/lib/dialog-focus';
import { cmsRoles, resolveCmsRole, canManageUser, canAssignRole, type CmsRole } from '@/lib/cms-roles';
import CmsAvatar from './CmsAvatar';
import CmsUserPhotoDialog from './CmsUserPhotoDialog';
import styles from './CmsUsersManager.module.css';

type CmsUser = { id: string; username: string; role: CmsRole; createdAt: string; current: boolean; avatar?: string; profileRevision?: number };
type Action = { mode: 'edit' | 'remove'; user: CmsUser } | null;
type CurrentUser = { id: string; username: string; role: CmsRole; avatar?: string; profileRevision?: number };
const roleDescriptions: Record<CmsRole, string> = {
  Dev: 'Dev can manage every user and permanently delete Trash items.',
  Admin: 'Admin can manage Admin and Operator users and permanently delete Trash items.',
  Operator: 'Operator can manage website content and change their own password.',
};

// An expired session invalidates pending callbacks immediately, before React
// unmounts this view. Each mounted lifetime gets a distinct object so an old
// request cannot become current again after a remount or Strict Mode cleanup.
function useUserViewLifetime() {
  const lifetime = useRef({ active: false });
  useEffect(() => {
    const current = { active: true };
    lifetime.current = current;
    const expire = () => { current.active = false; };
    window.addEventListener('moe-cms-session-expired', expire);
    return () => { current.active = false; window.removeEventListener('moe-cms-session-expired', expire); };
  }, []);
  return useCallback(() => lifetime.current, []);
}

function UserSettingsDialog({ username, avatar, onPhoto, open, onOpenChange, onUpdated, triggerRef, disabled }: { username: string; avatar?: string; onPhoto: () => void; open: boolean; onOpenChange: (open: boolean) => void; onUpdated: () => void; triggerRef: RefObject<HTMLButtonElement | null>; disabled: boolean }) {
  const { t } = useCmsLocale();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const backdropPointerRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const captureLifetime = useUserViewLifetime();
  const mutationRef = useRef(false);
  const titleId = useId();
  const pending = busy || disabled;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : triggerRef.current;
    const overflow = document.body.style.overflow;
    if (!dialog.open) dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (!document.querySelector('dialog[open]') && previousFocusRef.current?.isConnected) previousFocusRef.current.focus({ preventScroll: true });
      // A nested photo dialog restores the value it captured on mount. If both
      // dialogs unmount together, finish after that cleanup so it cannot leave
      // the body locked with the settings dialog's former "hidden" value.
      queueMicrotask(() => { if (!document.querySelector('dialog[open]')) document.body.style.overflow = overflow; });
    };
  }, [open, triggerRef]);

  function close() {
    if (busy || mutationRef.current) return;
    setError('');
    onOpenChange(false);
  }
  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const currentLifetime = captureLifetime();
    if (pending || mutationRef.current || !currentLifetime.active) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    if (fields.get('newPassword') !== fields.get('confirmPassword')) {
      setError('The new passwords do not match.');
      const confirmation = form.elements.namedItem('confirmPassword');
      if (confirmation instanceof HTMLInputElement) confirmation.focus();
      return;
    }
    mutationRef.current = true; setBusy(true); setError('');
    try {
      await cmsRequest('/api/cms/password', { method: 'POST', body: JSON.stringify({ currentPassword: fields.get('currentPassword'), newPassword: fields.get('newPassword') }) });
      if (!currentLifetime.active) return;
      form.reset(); onUpdated(); onOpenChange(false);
    } catch (cause) { if (currentLifetime.active) setError(cmsErrorText(cause)); }
    finally { mutationRef.current = false; if (currentLifetime.active) setBusy(false); }
  }

  return <dialog ref={dialogRef} className={styles.settingsDialog} aria-labelledby={titleId} onKeyDown={containDialogFocus} onCancel={event => { event.preventDefault(); close(); }} onPointerDown={event => { backdropPointerRef.current = event.target === event.currentTarget; }} onClick={event => { if (event.target === event.currentTarget && backdropPointerRef.current) close(); backdropPointerRef.current = false; }}>
    <div className={styles.settingsHeading}><h2 id={titleId}>{t('User settings')}</h2><button type="button" className={styles.close} aria-label={t('Close user settings')} disabled={busy} autoFocus onClick={close}><X size={20} aria-hidden="true" /></button></div>
    {open && <div className={styles.settingsBody}><p className={styles.signedIn}>{t('Signed in as')} <strong>{username}</strong></p><section className={styles.photoSettings} aria-label={t('Profile photo')}><span className={styles.settingsAvatar}><CmsAvatar username={username} avatar={avatar} /></span><div><h3>{t('Profile photo')}</h3><button type="button" className="button secondary" disabled={pending} onClick={event => { event.currentTarget.focus({ preventScroll: true }); onPhoto(); }}><Camera size={18} aria-hidden="true" />{t('Change profile photo')}</button></div></section><h3 className={styles.passwordHeading}><LockKeyhole size={20} aria-hidden="true" />{t('Change password')}</h3><p className={styles.hint}>{t('Use at least 14 characters for your new password.')}</p><form className={styles.form} onSubmit={changePassword} aria-busy={pending}><label>{t('Current password')}<input name="currentPassword" type="password" autoComplete="current-password" required maxLength={200} disabled={pending} /></label><label>{t('New password')}<input name="newPassword" type="password" autoComplete="new-password" required minLength={14} maxLength={200} disabled={pending} /></label><label>{t('Confirm new password')}<input name="confirmPassword" type="password" autoComplete="new-password" required minLength={14} maxLength={200} disabled={pending} /></label>{error && <p className={styles.error} role="alert">{t(error)}</p>}<div className={styles.settingsActions}><button type="button" className="button secondary" onClick={close} disabled={busy}>{t('Cancel')}</button><button type="submit" className="button" disabled={pending}>{busy ? t('Updating password…') : t('Update password')}</button></div></form></div>}
  </dialog>;
}

function UserManagementDialog({ title, closeLabel, busy, nested = false, onClose, children }: {
  title: string; closeLabel: string; busy: boolean; nested?: boolean; onClose: () => void; children: ReactNode;
}) {
  const { t } = useCmsLocale();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const backdropPointerRef = useRef(false);
  const titleId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    dialog?.showModal();
    // Edit owns the lock while either management dialog is open. Reset does
    // not capture/restore its parent's hidden value when both unmount at once.
    if (!nested) document.body.style.overflow = 'hidden';
    return () => {
      dialog?.close();
      if (!nested) document.body.style.overflow = overflow;
      queueMicrotask(() => {
        if (!nested && document.querySelector('dialog[open]')) return;
        if (previous?.isConnected && !previous.matches(':disabled')) previous.focus({ preventScroll: true });
        else if (!nested) document.getElementById('users-list-heading')?.focus({ preventScroll: true });
      });
    };
  }, [nested]);
  return <dialog ref={dialogRef} className={styles.settingsDialog + ' ' + styles.managementDialog} aria-labelledby={titleId} onKeyDown={containDialogFocus}
    onInvalidCapture={event => {
      const control = event.target;
      // Reveal the field after native validation positions focus; short
      // dialogs can otherwise leave it behind the sticky heading in WebKit.
      requestAnimationFrame(() => {
        if (control instanceof HTMLElement && control.isConnected && document.activeElement === control && dialogRef.current?.open) control.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      });
    }}
    onCancel={event => { event.preventDefault(); event.stopPropagation(); if (!busy) onClose(); }}
    onPointerDown={event => { backdropPointerRef.current = event.target === event.currentTarget; }}
    onClick={event => { if (event.target === event.currentTarget && backdropPointerRef.current && !busy) onClose(); backdropPointerRef.current = false; }}>
    <div className={styles.settingsHeading}><h2 id={titleId}>{t(title)}</h2><button type="button" className={styles.close} autoFocus disabled={busy} aria-label={t(closeLabel)} onClick={onClose}><X size={20} aria-hidden="true" /></button></div>
    <div className={styles.settingsBody}>{children}</div>
  </dialog>;
}

export default function CmsUsersManager({ username, role, settingsOpen, onSettingsOpenChange, onCurrentUserChange, onUserTrashed, targetUserId, onPhotoLinkClosed }: {
  username: string; role: CmsRole; settingsOpen: boolean;
  onSettingsOpenChange: (open: boolean) => void;
  onCurrentUserChange: (user: CurrentUser) => void;
  onUserTrashed: () => void;
  targetUserId?: string | null; onPhotoLinkClosed?: () => void;
}) {
  const { t, locale } = useCmsLocale();
  const [users, setUsers] = useState<CmsUser[]>([]);
  const [rosterRole, setRosterRole] = useState<CmsRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshCoolingDown, setRefreshCoolingDown] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [action, setAction] = useState<Action>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [editError, setEditError] = useState('');
  const [resetError, setResetError] = useState('');
  const [photoUser, setPhotoUser] = useState<CmsUser | null>(null);
  const handledPhotoTarget = useRef<string | null>(null);
  const [createRole, setCreateRole] = useState<CmsRole>('Operator');
  const [editRole, setEditRole] = useState<CmsRole>('Operator');
  const createRoleId = useId();
  const editRoleId = useId();
  const settingsTriggerRef = useRef<HTMLButtonElement>(null);
  const formHeadingRef = useRef<HTMLHeadingElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const mutationRef = useRef(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRefreshRef = useRef(0);
  const captureLifetime = useUserViewLifetime();
  const actorRole = rosterRole ?? resolveCmsRole(role);
  const canManage = canAssignRole(actorRole, 'Operator');
  const allowedRoles = cmsRoles.filter(value => canAssignRole(actorRole, value));
  const selectedUser = action ? users.find(user => user.id === action.user.id) : undefined;
  const selectedAction = selectedUser && canManageUser(actorRole, selectedUser.role) ? action : null;
  const pending = busy || loading;
  const currentAccount = users.find(user => user.current);
  const currentUsername = currentAccount?.username || username;
  const lastDev = selectedUser?.role === 'Dev' && users.filter(user => user.role === 'Dev').length === 1;
  const lastManager = selectedUser?.role === 'Admin' && !users.some(user => user.role === 'Dev') && users.filter(user => user.role === 'Admin').length === 1;

  const load = useCallback(async (manual = false) => {
    const currentLifetime = captureLifetime();
    if (!currentLifetime.active || requestRef.current) return;
    if (manual) {
      if (mutationRef.current || Date.now() - lastRefreshRef.current < 3000) return;
      lastRefreshRef.current = Date.now();
      setRefreshCoolingDown(true);
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => { if (currentLifetime.active) setRefreshCoolingDown(false); }, 3000);
    }
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    try {
      const result = await cmsRequest<{ users: CmsUser[]; actorRole: CmsRole }>('/api/cms/users', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(65_000)]) });
      if (controller.signal.aborted || !currentLifetime.active) return;
      setUsers(result.users.map(user => ({ ...user, role: resolveCmsRole(user.role) })));
      setRosterRole(resolveCmsRole(result.actorRole));
      const current = result.users.find(item => item.current);
      if (current) onCurrentUserChange({ id: current.id, username: current.username, role: resolveCmsRole(current.role), avatar: current.avatar, profileRevision: current.profileRevision });
      setError('');
    } catch (cause) { if (!controller.signal.aborted && currentLifetime.active) setError(cmsErrorText(cause)); }
    finally {
      if (requestRef.current === controller) { requestRef.current = null; if (currentLifetime.active) setLoading(false); }
    }
  }, [onCurrentUserChange, captureLifetime]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => {
      clearTimeout(timer); requestRef.current?.abort(); requestRef.current = null;
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [load]);
  useEffect(() => { if (action?.mode === 'remove') formHeadingRef.current?.focus(); }, [action]);

  useEffect(() => {
    if (!targetUserId) { handledPhotoTarget.current = null; return; }
    if (loading || handledPhotoTarget.current === targetUserId) return;
    const currentLifetime = captureLifetime();
    const timer = setTimeout(() => {
      if (!currentLifetime.active) return;
      handledPhotoTarget.current = targetUserId;
      const target = users.find(item => item.id === targetUserId);
      if (target && (target.current || canManageUser(actorRole, target.role))) setPhotoUser(target);
      else setNotice(target?.role === 'Dev' ? 'Only Dev can manage Dev accounts.' : 'User not found. Refresh the list.');
    }, 0);
    return () => clearTimeout(timer);
  }, [targetUserId, loading, users, actorRole, captureLifetime]);
  function acceptPhoto(saved: CurrentUser) {
    if (!captureLifetime().active) return;
    const target = users.find(item => item.id === saved.id);
    setUsers(previous => previous.map(item => item.id === saved.id ? { ...item, avatar: saved.avatar, profileRevision: saved.profileRevision } : item));
    if (target?.current) onCurrentUserChange(saved);
    setPhotoUser(null); setNotice('Profile photo saved.');
    if (targetUserId) onPhotoLinkClosed?.();
  }
  function selectAction(mode: NonNullable<Action>['mode'], user: CmsUser) {
    if (pending || !canManageUser(actorRole, user.role) || mode === 'remove' && user.current) return;
    setAction({ mode, user }); setResetOpen(false); setEditRole(user.role); setError(''); setEditError(''); setResetError(''); setNotice('');
  }
  function closeEdit() {
    if (busy || mutationRef.current) return;
    setAction(null); setResetOpen(false); setEditError(''); setResetError('');
  }
  function closeReset() {
    if (busy || mutationRef.current) return;
    setResetOpen(false); setResetError('');
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const currentLifetime = captureLifetime();
    if (!currentLifetime.active || pending || mutationRef.current || !canManage || !canAssignRole(actorRole, createRole)) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const password = String(data.get('password') || '');
    if (password !== data.get('confirmPassword')) { setError('Passwords do not match.'); return; }
    mutationRef.current = true; setBusy(true); setError(''); setNotice('');
    try {
      await cmsRequest('/api/cms/users', { method: 'POST', body: JSON.stringify({ username: data.get('username'), password, role: createRole, currentPassword: data.get('currentPassword') }) });
      if (!currentLifetime.active) return;
      form.reset(); setCreateRole('Operator'); setNotice('User added. Share the password privately.'); await load();
    } catch (cause) { if (currentLifetime.active) setError(cmsErrorText(cause)); }
    finally { mutationRef.current = false; if (currentLifetime.active) setBusy(false); }
  }
  async function manage(event: FormEvent<HTMLFormElement>, mode: 'edit' | 'reset' | 'remove') {
    event.preventDefault();
    const currentLifetime = captureLifetime();
    if (!currentLifetime.active || pending || mutationRef.current || !selectedAction || !selectedUser) return;
    if (mode === 'reset' ? selectedAction.mode !== 'edit' || !resetOpen || selectedUser.current : selectedAction.mode !== mode || resetOpen) return;
    if (mode === 'remove' && selectedUser.current) return;
    if (mode === 'edit' && !canAssignRole(actorRole, editRole)) return;
    const showError = mode === 'reset' ? setResetError : mode === 'edit' ? setEditError : setError;
    const form = event.currentTarget;
    const data = new FormData(form);
    const password = String(data.get('password') || '');
    if (mode === 'reset' && password !== data.get('confirmPassword')) {
      showError('Passwords do not match.');
      const confirmation = form.elements.namedItem('confirmPassword');
      if (confirmation instanceof HTMLInputElement) confirmation.focus();
      return;
    }
    mutationRef.current = true; setBusy(true); showError(''); setNotice('');
    try {
      const result = await cmsRequest<{ ok: true; user?: CurrentUser }>('/api/cms/users', {
        method: mode === 'remove' ? 'DELETE' : 'PATCH',
        body: JSON.stringify({
          id: selectedUser.id, currentPassword: data.get('currentPassword'),
          ...(mode === 'reset' ? { password } : mode === 'edit' ? { username: data.get('username'), role: editRole } : {}),
        }),
      });
      if (!currentLifetime.active) return;
      if (result.user) { setRosterRole(result.user.role); onCurrentUserChange(result.user); }
      if (mode === 'remove') onUserTrashed();
      setNotice(mode === 'reset' ? 'Password updated. Existing sessions for this user were signed out.' : mode === 'edit' ? 'User updated.' : 'User moved to Trash. Access is disabled until restored.');
      await load();
      if (!currentLifetime.active) return;
      // Restore focus only after the roster read has finished and the trigger
      // becomes enabled in the same commit as this dialog's successful close.
      if (mode === 'reset') setResetOpen(false);
      else setAction(null);
    } catch (cause) { if (currentLifetime.active) showError(cmsErrorText(cause)); }
    finally { mutationRef.current = false; if (currentLifetime.active) setBusy(false); }
  }
  return <div className={styles.grid + (!canManage ? ' ' + styles.readOnly : '')}>
    <section className={styles.panel} aria-labelledby="users-list-heading">
      <div className={styles.heading}>
        <div><h2 id="users-list-heading" tabIndex={-1}>{t('Users')}</h2><p>{t(roleDescriptions[actorRole])}</p></div>
        <button type="button" className={'button secondary ' + styles.refresh} onClick={() => void load(true)} disabled={pending || refreshCoolingDown} aria-label={t('Refresh users')}><RefreshCw size={18} /><span>{t('Refresh')}</span></button>
      </div>
      {loading && !users.length ? <p role="status">{t('Loading users…')}</p> : <ul className={styles.list}>{users.map(user => {
        const manageable = canManageUser(actorRole, user.role);
        return <li key={user.id}>
          <div className={styles.identity}><span className={styles.avatar}><CmsAvatar username={user.username} avatar={user.avatar} /></span><span><strong>{user.username}</strong><span className={styles.userMeta}><span className={styles.role + ' ' + styles['role' + user.role]}>{user.role}</span><small>{user.current ? t('You') : t('Added {date}', { date: new Date(user.createdAt).toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-GB') })}</small></span></span></div>
          <div className={styles.actions}>
            {user.current && <button ref={settingsTriggerRef} type="button" className="button secondary" disabled={pending} onClick={event => { event.currentTarget.focus({ preventScroll: true }); setNotice(''); onSettingsOpenChange(true); }}><Settings size={18} aria-hidden="true" />{t('User settings')}</button>}
            {(manageable || user.current) && <button type="button" className="button secondary" disabled={pending} aria-label={t('Change profile photo for {name}', { name: user.username })} onClick={event => { event.currentTarget.focus({ preventScroll: true }); setPhotoUser(user); }}><Camera size={17} aria-hidden="true" />{t('Photo')}</button>}
            {manageable && <button type="button" className="button secondary" disabled={pending} aria-label={t('Edit {name}', { name: user.username })} onClick={event => { event.currentTarget.focus({ preventScroll: true }); selectAction('edit', user); }}><Pencil size={17} aria-hidden="true" />{t('Edit')}</button>}
            {manageable && !user.current && <>
              <button type="button" className={styles.remove} disabled={pending} onClick={() => selectAction('remove', user)} aria-label={t('Move {name} to Trash', { name: user.username })}><Trash2 size={18} /></button>
            </>}
            {!manageable && user.role === 'Dev' && <span className={styles.protected}><ShieldCheck size={17} aria-hidden="true" />{t('Protected Dev account')}</span>}
          </div>
        </li>;
      })}</ul>}
      {notice && selectedAction?.mode !== 'edit' && <p className={styles.success} role="status"><Check size={18} />{t(notice)}</p>}
      {!canManage && error && <p className={styles.error} role="alert">{t(error)}</p>}
    </section>
    {canManage && <section className={styles.panel} aria-labelledby="users-form-heading">
      {error && <p className={styles.error} role="alert">{t(error)}</p>}
      {selectedAction?.mode === 'remove' && selectedUser ? <>
        <div className={styles.heading}><div><h2 id="users-form-heading" tabIndex={-1} ref={formHeadingRef}>{t('Move user to Trash')}</h2><p>{selectedUser.username}</p></div><button type="button" className={styles.close} disabled={busy} onClick={() => { setAction(null); setError(''); }} aria-label={t('Cancel')}><X size={20} /></button></div>
        <form key={selectedUser.id + ':remove'} className={styles.form} onSubmit={event => void manage(event, 'remove')} autoComplete="off" aria-busy={busy}>
          <label>{t('Your current password')}<input name="currentPassword" type="password" autoComplete="current-password" required maxLength={200} disabled={pending} /></label>
          <p className={styles.hint}>{t('This user will lose CMS access immediately and can be restored from Trash within 30 days.')}</p>
          <div className={styles.formActions}><button type="button" className="button secondary" disabled={pending} onClick={() => { setAction(null); setError(''); }}>{t('Cancel')}</button><button type="submit" className="button" disabled={pending}>{busy ? t('Saving…') : t('Move to Trash')}</button></div>
        </form>
      </> : <>
        <div className={styles.heading}><div><h2 id="users-form-heading">{t('Add user')}</h2><p>{t('Use a unique username and a password of at least 14 characters.')}</p></div><Plus size={22} /></div>
        <form className={styles.form} onSubmit={create} autoComplete="off" aria-busy={busy}>
          <label>{t('Username')}<input name="username" autoComplete="off" required minLength={3} maxLength={40} pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{2,39}" disabled={pending} /></label>
          <div className={styles.field}><label htmlFor={createRoleId}>{t('Role')}</label><select id={createRoleId} name="role" value={createRole} onChange={event => setCreateRole(event.target.value as CmsRole)} disabled={pending}>{allowedRoles.map(value => <option key={value} value={value}>{value}</option>)}</select></div>
          <p className={styles.hint}>{t(roleDescriptions[createRole])}</p>
          <label>{t('Password')}<input name="password" type="password" autoComplete="new-password" required minLength={14} maxLength={200} disabled={pending} /></label>
          <label>{t('Confirm password')}<input name="confirmPassword" type="password" autoComplete="new-password" required minLength={14} maxLength={200} disabled={pending} /></label>
          <label>{t('Your current password')}<input name="currentPassword" type="password" autoComplete="current-password" required maxLength={200} disabled={pending} /></label>
          <button type="submit" className="button" disabled={pending}><Plus size={18} />{busy ? t('Saving…') : t('Add user')}</button>
        </form>
      </>}
    </section>}
    {selectedAction?.mode === 'edit' && selectedUser && <>
      <UserManagementDialog key={'edit:' + selectedUser.id} title="Edit user" closeLabel="Close edit user" busy={busy} onClose={closeEdit}>
        <p className={styles.dialogTarget}>{selectedUser.username}</p>
        {notice && <p className={styles.success} role="status"><Check size={18} />{t(notice)}</p>}
        <form className={styles.form} onSubmit={event => void manage(event, 'edit')} autoComplete="off" aria-busy={busy}>
          <label>{t('Username')}<input name="username" autoComplete="off" defaultValue={selectedUser.username} required minLength={3} maxLength={40} pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{2,39}" disabled={pending} /></label>
          <div className={styles.field}><label htmlFor={editRoleId}>{t('Role')}</label><select id={editRoleId} name="role" value={editRole} onChange={event => setEditRole(event.target.value as CmsRole)} disabled={pending}>{allowedRoles.map(value => <option key={value} value={value} disabled={lastDev && value !== 'Dev' || lastManager && value === 'Operator'}>{value}</option>)}</select></div>
          <p className={styles.hint}>{t(roleDescriptions[editRole])}</p>
          {lastDev && <p className={styles.hint}>{t('Keep at least one Dev account.')}</p>}
          {lastManager && <p className={styles.hint}>{t('Keep at least one Dev or Admin account.')}</p>}
          <label>{t('Your current password')}<input name="currentPassword" type="password" autoComplete="current-password" required maxLength={200} disabled={pending} /></label>
          <p className={styles.hint}>{t(selectedUser.current ? 'Your current session stays signed in. Other sessions will be signed out.' : 'Existing sessions for this user will be signed out.')}</p>
          {editError && <p className={styles.error} role="alert">{t(editError)}</p>}
          <div className={styles.formActions}><button type="button" className="button secondary" disabled={busy} onClick={closeEdit}>{t('Cancel')}</button><button type="submit" className="button" disabled={pending}>{busy ? t('Saving…') : t('Save changes')}</button></div>
        </form>
        {!selectedUser.current && <section className={styles.passwordReset}><div><h3>{t('Password')}</h3><p className={styles.hint}>{t('Change the password for this user without saving changes to their username or role.')}</p></div><button type="button" className="button secondary" disabled={pending} onClick={event => { event.currentTarget.focus({ preventScroll: true }); setResetError(''); setResetOpen(true); }}><LockKeyhole size={18} aria-hidden="true" />{t('Reset password')}</button></section>}
      </UserManagementDialog>
      {resetOpen && !selectedUser.current && <UserManagementDialog key={'reset:' + selectedUser.id} title="Reset password" closeLabel="Close reset password" busy={busy} nested onClose={closeReset}>
        <p className={styles.dialogTarget}>{t('Reset password for {name}', { name: selectedUser.username })}</p>
        <p className={styles.hint}>{t('Use at least 14 characters for your new password.')}</p>
        <form className={styles.form} onSubmit={event => void manage(event, 'reset')} autoComplete="off" aria-busy={busy}>
          <label>{t('New password')}<input name="password" type="password" autoComplete="new-password" required minLength={14} maxLength={200} disabled={pending} /></label>
          <label>{t('Confirm new password')}<input name="confirmPassword" type="password" autoComplete="new-password" required minLength={14} maxLength={200} disabled={pending} /></label>
          <label>{t('Your current password')}<input name="currentPassword" type="password" autoComplete="current-password" required maxLength={200} disabled={pending} /></label>
          <p className={styles.hint}>{t('Existing sessions for this user will be signed out.')}</p>
          {resetError && <p className={styles.error} role="alert">{t(resetError)}</p>}
          <div className={styles.formActions}><button type="button" className="button secondary" disabled={busy} onClick={closeReset}>{t('Cancel')}</button><button type="submit" className="button" disabled={pending}>{busy ? t('Saving…') : t('Save new password')}</button></div>
        </form>
      </UserManagementDialog>}
    </>}
    {photoUser && <CmsUserPhotoDialog key={photoUser.id} user={photoUser} onClose={() => { setPhotoUser(null); if (targetUserId) onPhotoLinkClosed?.(); }} onSaved={acceptPhoto} />}
    <UserSettingsDialog username={currentUsername} avatar={currentAccount?.avatar} onPhoto={() => { if (currentAccount) setPhotoUser(currentAccount); }} open={settingsOpen} onOpenChange={onSettingsOpenChange} onUpdated={() => setNotice('Your password has been updated.')} triggerRef={settingsTriggerRef} disabled={busy || loading} />
  </div>;
}
