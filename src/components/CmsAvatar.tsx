/* eslint-disable @next/next/no-img-element */
'use client';
import { useState } from 'react';
import { useCmsLocale } from '@/lib/cms-locale';
import styles from './CmsAvatar.module.css';

export default function CmsAvatar({ username, avatar }: { username: string; avatar?: string }) {
  const { t } = useCmsLocale();
  const [failed, setFailed] = useState('');
  return <span className={styles.avatar}>{avatar && avatar !== failed ? <img src={avatar} alt={t('Profile photo for {name}', { name: username })} onError={() => setFailed(avatar)} /> : <span aria-hidden="true">{username.slice(0, 1).toUpperCase()}</span>}</span>;
}
