import 'server-only';
import { z } from 'zod';
import type { Document } from 'mongodb';
import { contentTypes, corePageIds } from '@/lib/cms-types';
import { canManageUser, canPermanentlyDelete, resolveCmsRole, type CmsRole } from '@/lib/cms-roles';
import { cmsTrashKinds, cmsTrashPageSize, emptyCmsTrashCounts, type CmsTrashItem, type CmsTrashKind, type CmsTrashPage, type CmsTrashQuery } from '@/lib/cms-trash';
import { escapeInboxSearch } from '@/lib/inbox-query';
import { collections, ensureIndexes, getDb, type UserDocument } from './db';
import { digest } from './auth';
import { HttpError } from './http';
import { mediaFolder } from './media';

type TrashRow = {
  kind: CmsTrashKind; id: string; key: string; title: string; titleTh?: string;
  image?: string; deletedAt: string; purgeAt?: string | null; revision?: number;
  role?: CmsRole; parentId?: string; mediaState?: string; managed?: boolean;
};
type TrashFacet = { items: TrashRow[]; total: { value: number }[]; counts: { _id: CmsTrashKind; value: number }[] };

const cursorSchema = z.strictObject({ key: z.string().min(1).max(120), deletedAt: z.string().datetime(), scope: z.string().regex(/^[a-f0-9]{16}$/) });
function cursorScope(query: CmsTrashQuery, actor: UserDocument) {
  return digest(JSON.stringify([query.kind, query.q.toLowerCase(), query.item, actor._id, resolveCmsRole(actor.role)])).slice(0, 16);
}
function nextCursor(item: Pick<TrashRow, 'key' | 'deletedAt'>, scope: string) {
  return Buffer.from(JSON.stringify({ key: item.key, deletedAt: item.deletedAt, scope })).toString('base64url');
}
function readCursor(raw: string | null, scope: string) {
  if (!raw) return null;
  try {
    const cursor = cursorSchema.parse(JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')));
    if (cursor.scope !== scope || nextCursor(cursor, scope) !== raw) throw new Error();
    return cursor;
  } catch { throw new HttpError(400, 'This page cursor is invalid. Refresh the list.'); }
}

const dateString = (input: unknown) => ({ $dateToString: { date: { $convert: { input, to: 'date', onError: null, onNull: null } }, format: '%Y-%m-%dT%H:%M:%S.%LZ', timezone: 'UTC', onNull: null } });
const searchFields = (...fields: string[]) => fields.map(field => ({ $ifNull: [`$${field}`, ''] }));

/** One read combines safe projections; the database limits the merged result before returning it. */
export async function getCmsTrashPage(query: CmsTrashQuery, actor: UserDocument): Promise<CmsTrashPage> {
  const role = resolveCmsRole(actor.role);
  const managesUsers = canManageUser(role, 'Operator');
  const scope = cursorScope(query, actor);
  const cursor = readCursor(query.cursor, scope);
  await ensureIndexes();
  const c = collections(await getDb());
  const now = new Date();
  const retained = { $or: [{ purgeAt: { $exists: false } }, { purgeAt: { $gt: now } }] };
  const pipeline: Document[] = [
    { $match: { type: { $in: contentTypes }, deletedAt: { $exists: true }, ...retained } },
    { $project: {
      _id: 0, kind: '$type', id: 1, key: { $concat: ['$type', ':', '$id'] }, title: 1, titleTh: 1, image: 1, revision: 1, parentId: 1,
      deletedAt: dateString('$deletedAt'), purgeAt: dateString('$purgeAt'),
      searchFields: searchFields('title', 'titleTh', 'id', 'category', 'categoryTh', 'parentId'),
    } },
    { $unionWith: { coll: 'moe_media', pipeline: [
      { $match: { $or: [{ state: 'trashed' }, { state: 'deleting', trashedAt: { $exists: true } }] } },
      { $project: {
        _id: 0, kind: { $literal: 'Image' }, id: 1, key: { $concat: ['Image:', '$id'] }, title: 1, image: '$url', mediaState: '$state',
        deletedAt: dateString({ $ifNull: ['$trashedAt', '$createdAt'] }),
        managed: { $regexMatch: { input: { $ifNull: ['$publicId', ''] }, regex: `^${escapeInboxSearch(mediaFolder())}/` } },
        searchFields: searchFields('title', 'id'),
      } },
    ] } },
  ];
  if (managesUsers) pipeline.push({ $unionWith: { coll: 'moe_users', pipeline: [
    { $match: { deletedAt: { $exists: true }, ...retained } },
    // Inclusive projection is deliberate: password hashes and account/session metadata never enter the merged stream.
    { $project: {
      _id: 0, kind: { $literal: 'User' }, id: '$_id', key: { $concat: ['User:', '$_id'] }, title: '$username', role: 1, image: '$avatar',
      deletedAt: dateString('$deletedAt'), purgeAt: dateString('$purgeAt'), searchFields: searchFields('username', '_id', 'role'),
    } },
  ] } });
  const filtered: Document = query.item ? { key: query.item } : {
    ...(query.kind === 'All' ? {} : { kind: query.kind }),
    ...(query.q ? { searchFields: { $regex: escapeInboxSearch(query.q), $options: 'i' } } : {}),
  };
  const pageStages: Document[] = [{ $match: filtered }];
  if (cursor) pageStages.push({ $match: { $or: [{ deletedAt: { $lt: cursor.deletedAt } }, { deletedAt: cursor.deletedAt, key: { $gt: cursor.key } }] } });
  pageStages.push({ $sort: { deletedAt: -1, key: 1 } }, { $limit: cmsTrashPageSize + 1 }, { $unset: 'searchFields' });
  pipeline.push(
    { $match: { deletedAt: { $type: 'string' } } },
    { $facet: {
      items: pageStages,
      total: [{ $match: filtered }, { $count: 'value' }],
      counts: [{ $group: { _id: '$kind', value: { $sum: 1 } } }],
    } },
  );
  const result = (await c.content.aggregate<TrashFacet>(pipeline).toArray())[0];
  const counts = emptyCmsTrashCounts();
  for (const count of result?.counts ?? []) if (cmsTrashKinds.includes(count._id)) { counts[count._id] = count.value; counts.All += count.value; }
  const rows = (result?.items ?? []).slice(0, cmsTrashPageSize);
  const pageIds = rows.filter(item => item.kind === 'Page').map(item => item.id);
  const parentIds = rows.filter(item => item.kind === 'Section' && item.parentId && item.parentId !== 'shared').map(item => item.parentId!);
  const imageUrls = rows.filter(item => item.kind === 'Image' && item.image).map(item => item.image!);
  const [linkedPageIds, activeParents, referencedImageUrls, profileImageUrls] = await Promise.all([
    pageIds.length ? c.content.distinct('parentId', { type: 'Section', parentId: { $in: pageIds } }) : [],
    parentIds.length ? c.content.distinct('id', { type: 'Page', id: { $in: parentIds }, deletedAt: { $exists: false }, ...retained }) : [],
    imageUrls.length ? c.content.aggregate<{ _id: string }>([
      { $match: { $or: [{ image: { $in: imageUrls } }, { mobileImage: { $in: imageUrls } }, { 'gallery.url': { $in: imageUrls } }, { 'heroSlides.url': { $in: imageUrls } }] } },
      { $project: { urls: { $setIntersection: [imageUrls, { $concatArrays: [[{ $ifNull: ['$image', ''] }, { $ifNull: ['$mobileImage', ''] }], { $ifNull: ['$gallery.url', []] }, { $ifNull: ['$heroSlides.url', []] }] }] } } },
      { $unwind: '$urls' }, { $group: { _id: '$urls' } },
    ]).toArray() : [],
    imageUrls.length ? c.users.distinct('avatar', { avatar: { $in: imageUrls } }) : [],
  ]);
  const linked = new Set(linkedPageIds);
  const availableParents = new Set(activeParents);
  const referencedImages = new Set([...referencedImageUrls.map(item => item._id), ...profileImageUrls]);
  const items: CmsTrashItem[] = rows.map(row => {
    const base = { id: row.id, key: row.key, title: row.title, ...(row.titleTh ? { titleTh: row.titleTh } : {}), ...(row.image ? { image: row.image } : {}), deletedAt: row.deletedAt, ...(row.purgeAt ? { purgeAt: row.purgeAt } : {}) };
    let restoreBlockedReason: string | undefined;
    let deleteBlockedReason: string | undefined = canPermanentlyDelete(role) ? undefined : 'Only Dev and Admin can permanently delete items from Trash.';
    if (row.kind === 'User') {
      const targetRole = resolveCmsRole(row.role);
      if (!canManageUser(role, targetRole)) restoreBlockedReason = deleteBlockedReason = 'Only Dev can manage Dev accounts.';
      if (row.id === actor._id) restoreBlockedReason = deleteBlockedReason = 'You cannot remove your own account.';
      return { ...base, kind: 'User', role: targetRole, canRestore: !restoreBlockedReason, canDelete: !deleteBlockedReason, ...(restoreBlockedReason ? { restoreBlockedReason } : {}), ...(deleteBlockedReason ? { deleteBlockedReason } : {}) };
    }
    if (row.kind === 'Image') {
      if (row.mediaState !== 'trashed') restoreBlockedReason = 'This image is waiting for permanent deletion. Retry deleting it to finish.';
      if (!row.managed) deleteBlockedReason = 'This image is outside the managed library.';
      else if (row.image && referencedImages.has(row.image)) deleteBlockedReason = 'This image is used by content or a user profile, including Trash. Replace it there before removing it.';
    } else {
      if (row.kind === 'Page' && (corePageIds as readonly string[]).includes(row.id)) deleteBlockedReason = 'Core website pages cannot be permanently deleted. Restore this page instead.';
      else if (row.kind === 'Page' && linked.has(row.id)) deleteBlockedReason = 'This page still has content areas. Restore it or remove those areas from Trash first.';
      if (row.kind === 'Section' && row.parentId !== 'shared' && (!row.parentId || !availableParents.has(row.parentId))) restoreBlockedReason = 'Restore the parent page before restoring this content area.';
    }
    return { ...base, kind: row.kind, ...(row.kind !== 'Image' ? { revision: row.revision!, ...(row.parentId ? { parentId: row.parentId } : {}) } : {}), canRestore: !restoreBlockedReason, canDelete: !deleteBlockedReason, ...(restoreBlockedReason ? { restoreBlockedReason } : {}), ...(deleteBlockedReason ? { deleteBlockedReason } : {}) } as CmsTrashItem;
  });
  return { items, total: result?.total[0]?.value ?? 0, counts, nextCursor: (result?.items.length ?? 0) > cmsTrashPageSize ? nextCursor(rows[rows.length - 1], scope) : null };
}
