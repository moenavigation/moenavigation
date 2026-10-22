import { z } from 'zod';
import type { Enquiry } from './cms-types';

export const inboxStatuses = ['All', 'New', 'In progress', 'Resolved'] as const;
export type InboxStatus = typeof inboxStatuses[number];
export type InboxFilters = { q: string; status: InboxStatus };
export type EnquiryPage = {
  enquiries: Enquiry[];
  nextCursor: string | null;
  total: number;
  totalAll: number;
  newCount: number;
};

const searchSchema = z.string().trim().max(200).refine(value => !value.includes('\0'), 'Search cannot contain a null character.').nullish().transform(value => value ?? '');
const statusSchema = z.enum(inboxStatuses).nullish().transform(value => value ?? 'All');
const filtersSchema = z.strictObject({ q: searchSchema, status: statusSchema });
const querySchema = filtersSchema.extend({
  cursor: z.string().min(1).max(400).regex(/^[A-Za-z0-9_-]+$/).nullable().default(null),
});
const queryEntriesSchema = z.array(z.tuple([z.enum(['q', 'status', 'cursor']), z.string()])).superRefine((entries, context) => {
  const seen = new Set<string>();
  for (const [key] of entries) {
    if (seen.has(key)) context.addIssue({ code: 'custom', path: [key], message: 'Each inbox query parameter must appear only once.' });
    seen.add(key);
  }
});

export type InboxQuery = InboxFilters & { cursor: string | null };

export function normalizeInboxFilters(input: { q?: string | null; status?: string | null } = {}): InboxFilters {
  return filtersSchema.parse(input);
}

export function parseInboxQuery(params: URLSearchParams): InboxQuery {
  const entries = queryEntriesSchema.parse(Array.from(params.entries()));
  return querySchema.parse(Object.fromEntries(entries));
}

export function escapeInboxSearch(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
