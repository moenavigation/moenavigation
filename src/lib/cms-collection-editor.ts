import type { ContentRecord } from './cms-types';

const names: Partial<Record<ContentRecord['type'], string>> = {
  Vessel: 'vessel', Route: 'route', Project: 'project', Service: 'service', News: 'news',
};

export function collectionEditorTitle(type: ContentRecord['type'], existing: boolean) {
  const name = names[type];
  return name ? `${existing ? 'Edit' : 'Add'} ${name}` : existing ? 'Edit content' : 'Create content';
}

export function newCollectionDraft(type: ContentRecord['type'], records: ContentRecord[], today = new Date(), nextOrder?: number) : ContentRecord {
  const lastOrder = Math.max(-1, ...records.filter(record => record.type === type).map(record => record.order ?? 0));
  return {
    id: '', type, title: '', titleTh: '', description: '', descriptionTh: '', image: '',
    category: type === 'Service' ? 'Maritime services' : type === 'Route' ? 'Port connections' : '',
    categoryTh: type === 'Service' ? 'บริการทางทะเล' : type === 'Route' ? 'เส้นทางเชื่อมต่อท่าเรือ' : '',
    order: nextOrder ?? Math.min(10000, lastOrder + 1), status: 'Published', revision: 0,
    ...(type === 'News' ? { date: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}` } : {}),
  };
}

/** Allocate once at first Save, then retain the identity through retries and title edits. */
export function createCollectionId(type: ContentRecord['type'], title: string, token: string) {
  const suffix = token.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 12);
  const stem = title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').slice(0, 86).replace(/^-+|-+$/g, '') || names[type] || 'item';
  return `${stem}-${suffix}`;
}
