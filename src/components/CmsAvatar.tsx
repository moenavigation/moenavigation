/* eslint-disable @next/next/no-img-element */
'use client';
import { useState } from 'react';
import { useCmsLocale } from '@/lib/cms-locale';
import styles from './CmsAvatar.module.css';

function AvatarImage({ username, avatar }: { username: string; avatar: string }) {
  const { t } = useCmsLocale();
  const [failed, setFailed] = useState(false);
  return failed ? <span aria-hidden="true">{username.slice(0, 1).toUpperCase()}</span> : <img src={avatar} alt={t('Profile photo for {name}', { name: username })} onError={() => setFailed(true)} />;
}

export default function CmsAvatar({ username, avatar }: { username: string; avatar?: string }) {
  // A changed photo starts a fresh load attempt, including removing and reselecting it.
  return <span className={styles.avatar}>{avatar ? <AvatarImage key={avatar} username={username} avatar={avatar} /> : <span aria-hidden="true">{username.slice(0, 1).toUpperCase()}</span>}</span>;
}
