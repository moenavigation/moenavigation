import 'server-only';
import type { ContentRecord } from '@/lib/cms-types';
import { HttpError } from './http';

export function isFixedPageContent(type: ContentRecord['type']) {
  return type === 'Page' || type === 'Section';
}

/** Client editors may change copy and images, but cannot build or rearrange pages. */
export function assertCmsContentEdit(next: Omit<ContentRecord, 'revision'>, existing: ContentRecord | null) {
  if (!isFixedPageContent(next.type)) return;
  if (!existing) throw new HttpError(403, 'Pages and page sections can only be edited. New page elements cannot be added.');
  const structuralFields = ['id', 'type', 'parentId', 'order', 'icon', 'category', 'categoryTh'] as const;
  const value = (record: Omit<ContentRecord, 'revision'>, key: typeof structuralFields[number]) => record[key] ?? (key === 'order' ? 0 : '');
  if (structuralFields.some(key => value(next, key) !== value(existing, key))) {
    throw new HttpError(403, 'The page layout is fixed. Edit the existing text and images only.');
  }
}

export function assertCmsContentAction(type: ContentRecord['type'], action: 'trash' | 'restore') {
  if (action === 'trash' && isFixedPageContent(type)) {
    throw new HttpError(403, 'Pages and page sections cannot be removed. You can edit their text and images.');
  }
}
