import { z } from 'zod';
import { contentTypes, type ContentType } from './cms-types';
import type { CmsRole } from './cms-roles';
import { idSchema } from './validation';

export const cmsTrashKinds = [...contentTypes, 'Image', 'User'] as const;
export const cmsTrashFilters = ['All', ...cmsTrashKinds] as const;
export const cmsTrashPageSize = 30;
export type CmsTrashKind = typeof cmsTrashKinds[number];
export type CmsTrashFilter = typeof cmsTrashFilters[number];

type TrashItemBase = {
  id: string;
  key: string;
  title: string;
  titleTh?: string;
  image?: string;
  deletedAt: string;
  purgeAt?: string;
  canRestore: boolean;
  canDelete: boolean;
  restoreBlockedReason?: string;
  deleteBlockedReason?: string;
};
export type CmsTrashItem =
  | (TrashItemBase & { kind: ContentType; revision: number; parentId?: string })
  | (TrashItemBase & { kind: 'Image' })
  | (TrashItemBase & { kind: 'User'; role: CmsRole });
export type CmsTrashPage = {
  items: CmsTrashItem[];
  total: number;
  counts: Record<CmsTrashFilter, number>;
  nextCursor: string | null;
};
export type CmsTrashQuery = { kind: CmsTrashFilter; q: string; item: string | null; cursor: string | null };

const targetSchema = z.string().max(120).refine(value => {
  const [kind, id, extra] = value.split(':');
  if (extra !== undefined || !cmsTrashKinds.includes(kind as CmsTrashKind) || !id) return false;
  if (kind === 'User') return z.uuid().safeParse(id).success;
  if (kind === 'Image') return /^[A-Za-z0-9_-]{1,100}$/.test(id);
  return idSchema.safeParse(id).success;
}, 'Choose a valid Trash item.');
const querySchema = z.strictObject({
  kind: z.enum(cmsTrashFilters).default('All'),
  q: z.string().trim().max(160).refine(value => !value.includes('\0'), 'Search cannot contain a null character.').default(''),
  item: targetSchema.nullable().default(null),
  cursor: z.string().min(1).max(512).regex(/^[A-Za-z0-9_-]+$/).nullable().default(null),
});
const entriesSchema = z.array(z.tuple([z.enum(['kind', 'q', 'item', 'cursor']), z.string()])).superRefine((entries, context) => {
  const seen = new Set<string>();
  for (const [key] of entries) {
    if (seen.has(key)) context.addIssue({ code: 'custom', path: [key], message: 'Each Trash query parameter must appear only once.' });
    seen.add(key);
  }
});

export function parseCmsTrashQuery(params: URLSearchParams): CmsTrashQuery {
  const query = querySchema.parse(Object.fromEntries(entriesSchema.parse([...params.entries()])));
  // A usage link points at one item regardless of previously selected filters.
  return query.item ? { ...query, kind: 'All', q: '' } : query;
}

export function emptyCmsTrashCounts(): Record<CmsTrashFilter, number> {
  return Object.fromEntries(cmsTrashFilters.map(kind => [kind, 0])) as Record<CmsTrashFilter, number>;
}
