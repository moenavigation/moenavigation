'use client';

import Link from 'next/link';
import { Check, CircleAlert, Mail, RefreshCw } from 'lucide-react';
import type { EnquiryNotification } from '@/lib/cms-types';
import { useCmsLocale } from '@/lib/cms-locale';
import { useCmsDeadline, type CmsEmailSetupState } from './useCmsEmailSetup';
import styles from './CmsEmailSetup.module.css';

const checkLabels = { apiKey: 'Email connection', sender: 'Sender address', recipient: 'Notification recipients' };
const checkStates = { added: 'Added', missing: 'Not added', invalid: 'Needs correction' };
const setupHref = '/cms/setting#email-notifications';

function setupLabel(setup: CmsEmailSetupState) {
  return setup.loading ? 'Checking email setup…' : setup.error ? 'Email setup status unavailable' : setup.status?.configured ? 'Settings added' : 'Email setup incomplete';
}

export function CmsEmailSetupCard({ setup }: { setup: CmsEmailSetupState }) {
  const { t, locale } = useCmsLocale();
  return <section id="email-notifications" className={styles.card} aria-labelledby="email-notifications-title" tabIndex={-1}>
    <header className={styles.heading}><div><Mail size={22} aria-hidden="true" /><h2 id="email-notifications-title">{t('Email notifications')}</h2></div><button type="button" className={`button secondary ${styles.refresh}`} disabled={!setup.canRefresh} onClick={() => void setup.refresh()}><RefreshCw size={17} aria-hidden="true" />{t(setup.loading ? 'Checking…' : 'Refresh email setup')}</button></header>
    <p className={styles.description}>{t('Receive a notification when someone sends a website enquiry. Every enquiry stays saved in the CMS inbox.')}</p>
    <div className={styles.status} data-state={setup.error ? 'unavailable' : setup.status?.configured ? 'configured' : 'incomplete'} role="status"><strong>{t(setupLabel(setup))}</strong>{setup.error && <p>{t('The latest setup could not be checked. Refresh to try again. No email was sent.')}</p>}{!setup.loading && !setup.error && setup.status?.configured && <p>{t('The server settings are present. Sender verification and inbox delivery still need to be confirmed with a test enquiry.')}</p>}</div>
    {setup.status && <><p className={styles.caption}>{t(setup.error || setup.loading ? 'Last successful setup check' : 'Server settings')}</p><dl className={styles.checks}>{(Object.keys(checkLabels) as (keyof typeof checkLabels)[]).map(key => <div key={key}><dt>{t(checkLabels[key])}</dt><dd data-state={setup.status!.checks[key]}>{setup.status!.checks[key] === 'added' ? <Check size={17} aria-hidden="true" /> : <CircleAlert size={17} aria-hidden="true" />}{t(checkStates[setup.status!.checks[key]])}</dd></div>)}</dl></>}
    {setup.checkedAt && <p className={styles.caption}>{t('Last checked')}: {new Date(setup.checkedAt).toLocaleString(locale === 'th' ? 'th-TH' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</p>}
    <details className={styles.instructions}><summary>{t('How email setup works')}</summary><ol><li>{t('Your developer adds the Resend connection and verified sender securely on the server.')}</li><li>{t('The sender must be verified with Resend before notifications can be sent.')}</li><li>{t('After setup, send one test enquiry and confirm that its notification arrives in the intended inbox.')}</li></ol><p>{t('Dev and Admin manage notification recipients in Enquiries.')}</p><p>{t('The public email address in Website details is separate from the notification recipient.')}</p><p>{t('Older enquiries are not sent automatically. Open an enquiry to send an eligible notification individually.')}</p></details>
    <p className={styles.caption}>{t('Refreshing checks the server settings only. It does not send an email.')}</p>
  </section>;
}

export function CmsEmailSetupNotice({ setup }: { setup: CmsEmailSetupState }) {
  const { t } = useCmsLocale();
  return <aside className={styles.notice} aria-label={t('Email notifications')}><Mail size={21} aria-hidden="true" /><div><strong role="status">{t(setupLabel(setup))}</strong><p>{t(setup.status?.configured && !setup.error && !setup.loading ? 'Email notifications are separate from enquiry status. Your saved inbox remains the source of truth.' : 'Enquiries remain saved here while email setup is incomplete or unavailable.')}</p></div><Link href={setupHref} className={styles.setupLink}>{t('View email setup')}</Link></aside>;
}

export function CmsNotificationSend({ notification, setup, busy, sending, onSend, onOpenSetup }: {
  notification: EnquiryNotification | undefined;
  setup: CmsEmailSetupState;
  busy: boolean;
  sending: boolean;
  onSend: () => void;
  onOpenSetup: () => void;
}) {
  const { t, locale } = useCmsLocale();
  const parsedRetryAt = notification?.retryAt ? Date.parse(notification.retryAt) : 0;
  const waiting = useCmsDeadline(Number.isFinite(parsedRetryAt) ? parsedRetryAt : 0);
  if (!notification || notification.attempts >= 3 || !['not_configured', 'pending', 'failed'].includes(notification.status)) return null;
  return <div className={styles.sendAction}>
    <button type="button" className="button secondary" disabled={busy || !setup.canSend || waiting} onClick={onSend}><RefreshCw size={18} aria-hidden="true" />{t(sending ? 'Sending notification…' : notification.attempts === 0 ? 'Send notification' : 'Retry notification')}</button>
    {waiting && <p className={styles.caption} role="status">{t('You can retry after {time}.', { time: new Date(parsedRetryAt).toLocaleString(locale === 'th' ? 'th-TH' : 'en-GB', { dateStyle: 'short', timeStyle: 'medium' }) })}</p>}
    {!setup.canSend && <p className={styles.caption}>{t(setup.loading ? 'Checking email setup before sending.' : setup.error ? 'Refresh email setup before sending a notification.' : 'Complete email setup before sending a notification.')} <Link href={setupHref} onClick={onOpenSetup}>{t('View email setup')}</Link></p>}
  </div>;
}
