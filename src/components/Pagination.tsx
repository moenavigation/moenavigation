'use client';

import { getPageNumbers, normalizePage } from '@/lib/pagination';
import styles from './Pagination.module.css';

type Props = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  label: string;
  previousLabel: string;
  nextLabel: string;
};

export default function Pagination({ page, totalPages, onPageChange, label, previousLabel, nextLabel }: Props) {
  const numbers = getPageNumbers(page, totalPages);
  if (!numbers.length) return null;
  const last = normalizePage(totalPages);
  const current = Math.min(normalizePage(page), last);
  return <nav className={styles.pagination} aria-label={label}>
    <button type="button" aria-label={previousLabel} disabled={current === 1} onClick={() => onPageChange(current - 1)}>{'<'}</button>
    <div className={styles.numbers}>{numbers.map((number, index) => number === 'ellipsis'
      ? <span className={styles.ellipsis} aria-hidden="true" key={`gap-${index}`}>…</span>
      : <button type="button" key={`page-${number}`} aria-current={number === current ? 'page' : undefined} onClick={() => onPageChange(number)}>{number}</button>)}</div>
    <button type="button" aria-label={nextLabel} disabled={current === last} onClick={() => onPageChange(current + 1)}>{'>'}</button>
  </nav>;
}
