import { z } from 'zod';
import { cmsRoles, type CmsRole } from './cms-roles';
import { contentTypes } from './cms-types';

export const cmsLogActions = [
  'auth.login', 'auth.logout', 'auth.password_changed',
  'content.created', 'content.updated', 'content.trashed', 'content.restored', 'content.deleted',
  'user.created', 'user.updated', 'user.profile_updated', 'user.password_reset', 'user.trashed', 'user.restored', 'user.deleted',
  'settings.updated', 'settings.exported', 'settings.usage_updated', 'settings.email_recipients_updated', 'enquiry.status_changed', 'enquiry.notification_requested',
  'media.uploaded', 'media.trashed', 'media.restored', 'media.deleted', 'media.upload_discarded', 'media.cleanup', 'media.delete_failed',
] as const;
export const cmsLogCategories = ['auth', 'content', 'user', 'settings', 'enquiry', 'media'] as const;
export const cmsLogCategoryFilters = ['All', ...cmsLogCategories] as const;
export const cmsLogTargetTypes = [...contentTypes, 'Image', 'User', 'Settings', 'Enquiry', 'Session', 'MediaLibrary'] as const;
export const cmsLogOutcomes = ['success', 'denied', 'failed'] as const;
export const cmsLogPageSize = 30;
export type CmsLogAction = typeof cmsLogActions[number];
export type CmsLogCategory = typeof cmsLogCategories[number];
export type CmsLogTargetType = typeof cmsLogTargetTypes[number];
export type CmsLogActor = { id: string; username: string; role: CmsRole } | { system: true };
export type CmsLogTarget = { type: CmsLogTargetType; id: string; label?: string };
export type CmsLogEvent = { action: CmsLogAction; actor: CmsLogActor; target: CmsLogTarget; outcome?: typeof cmsLogOutcomes[number] };
export type CmsLogItem = Omit<CmsLogEvent, 'outcome'> & { id: string; occurredAt: string; expiresAt: string; category: CmsLogCategory; outcome: typeof cmsLogOutcomes[number]; summary: string };
export type CmsLogPage = { items: CmsLogItem[]; total: number; nextCursor: string | null };
export type CmsLogQuery = { q: string; category: typeof cmsLogCategoryFilters[number]; action: CmsLogAction | 'All'; cursor: string | null };

export const cmsLogActionLabels: Record<CmsLogAction, string> = {
  'auth.login': 'Signed in', 'auth.logout': 'Signed out', 'auth.password_changed': 'Changed own password',
  'content.created': 'Added content', 'content.updated': 'Updated content', 'content.trashed': 'Moved content to Trash',
  'content.restored': 'Restored content', 'content.deleted': 'Permanently deleted content',
  'user.created': 'Added user', 'user.updated': 'Updated user', 'user.profile_updated': 'Updated profile photo', 'user.password_reset': 'Reset user password',
  'user.trashed': 'Moved user to Trash', 'user.restored': 'Restored user', 'user.deleted': 'Permanently deleted user',
  'settings.updated': 'Updated settings', 'settings.exported': 'Exported CMS data', 'settings.usage_updated': 'Updated monitoring settings', 'settings.email_recipients_updated': 'Updated notification recipients', 'enquiry.status_changed': 'Updated enquiry status', 'enquiry.notification_requested': 'Requested enquiry notification',
  'media.uploaded': 'Added image', 'media.trashed': 'Moved image to Trash', 'media.restored': 'Restored image',
  'media.deleted': 'Permanently deleted image', 'media.upload_discarded': 'Discarded unfinished upload',
  'media.cleanup': 'Cleaned unused images', 'media.delete_failed': 'Image deletion failed',
};

export function cmsLogCategory(action: CmsLogAction): CmsLogCategory {
  return action.split('.')[0] as CmsLogCategory;
}
export function cmsLogSummary(action: CmsLogAction, outcome: typeof cmsLogOutcomes[number]): string {
  if (action === 'auth.login' && outcome !== 'success') return outcome === 'denied' ? 'Sign-in denied' : 'Sign-in failed';
  if (action === 'media.cleanup' && outcome === 'failed') return 'Image cleanup incomplete';
  return cmsLogActionLabels[action];
}

const identifier = z.string().min(1).max(140).regex(/^[A-Za-z0-9_-]+$/);
const actorSchema = z.union([
  z.strictObject({ id: identifier, username: z.string().min(1).max(80).regex(/^[A-Za-z0-9@._-]+$/), role: z.enum(cmsRoles) }),
  z.strictObject({ system: z.literal(true) }),
]);
const targetSchema = z.strictObject({
  type: z.enum(cmsLogTargetTypes), id: identifier,
  // Labels are existing public titles or account names, never request bodies or enquiry details.
  label: z.string().transform(value => value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160)).optional(),
});
export const cmsLogEventSchema = z.strictObject({
  action: z.enum(cmsLogActions), actor: actorSchema, target: targetSchema, outcome: z.enum(cmsLogOutcomes).default('success'),
}).superRefine((event, context) => {
  const category = cmsLogCategory(event.action);
  const allowed = category === 'content' ? (contentTypes as readonly string[]).includes(event.target.type)
    : category === 'user' || event.action === 'auth.password_changed' ? event.target.type === 'User'
    : category === 'auth' ? event.target.type === 'Session' && event.target.id === 'cms'
    : category === 'settings' ? event.target.type === 'Settings'
    : category === 'enquiry' ? event.target.type === 'Enquiry'
    : event.action === 'media.cleanup' ? event.target.type === 'MediaLibrary' && event.target.id === 'library'
    : event.target.type === 'Image';
  if (!allowed) context.addIssue({ code: 'custom', path: ['target'], message: 'Choose the matching activity target.' });
  if (event.target.label !== undefined && ['Enquiry', 'Session', 'MediaLibrary', 'Settings'].includes(event.target.type)) {
    context.addIssue({ code: 'custom', path: ['target', 'label'], message: 'This activity target cannot contain a label.' });
  }
});

const querySchema = z.strictObject({
  q: z.string().trim().max(160).refine(value => !value.includes('\0'), 'Search cannot contain a null character.').default(''),
  category: z.enum(cmsLogCategoryFilters).default('All'),
  action: z.enum(['All', ...cmsLogActions]).default('All'),
  cursor: z.string().min(1).max(512).regex(/^[A-Za-z0-9_-]+$/).nullable().default(null),
});
const queryEntries = z.array(z.tuple([z.enum(['q', 'category', 'action', 'cursor']), z.string()])).superRefine((entries, context) => {
  const seen = new Set<string>();
  for (const [key] of entries) {
    if (seen.has(key)) context.addIssue({ code: 'custom', path: [key], message: 'Each activity query parameter must appear only once.' });
    seen.add(key);
  }
});
export function parseCmsLogQuery(params: URLSearchParams): CmsLogQuery {
  return querySchema.parse(Object.fromEntries(queryEntries.parse([...params.entries()])));
}
