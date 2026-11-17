export function normalizePage(value: number | string | null | undefined) {
  const page = Number(value);
  return Number.isFinite(page) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(1, Math.floor(page))) : 1;
}

export function paginateItems<T>(items: readonly T[], requestedPage: number, pageSize: number) {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error('Page size must be a positive integer.');
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(normalizePage(requestedPage), totalPages);
  const offset = (page - 1) * pageSize;
  return { items: items.slice(offset, offset + pageSize), page, totalPages, total, offset };
}

/** Keep the rendered controls bounded even when a collection has many pages. */
export function getPageNumbers(requestedPage: number, requestedTotal: number): (number | 'ellipsis')[] {
  if (!Number.isFinite(requestedTotal) || requestedTotal < 1) return [];
  const total = normalizePage(requestedTotal);
  const page = Math.min(normalizePage(requestedPage), total);
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const start = Math.max(2, Math.min(page - 1, total - 4));
  const end = Math.min(total - 1, Math.max(page + 1, 5));
  const result: (number | 'ellipsis')[] = [1];
  if (start > 2) result.push('ellipsis');
  for (let number = start; number <= end; number++) result.push(number);
  if (end < total - 1) result.push('ellipsis');
  result.push(total);
  return result;
}
