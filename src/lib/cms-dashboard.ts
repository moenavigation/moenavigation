import type { ContentRecord, Enquiry } from './cms-types';

export const attentionTypes = ['Vessel', 'Service', 'Project', 'News', 'Route', 'Page', 'Section'] as const;
export const attentionIssueCodes = ['translation', 'image', 'vessel_details'] as const;
export type AttentionIssueCode = typeof attentionIssueCodes[number];
export type AttentionIssue = { code: AttentionIssueCode; label: string };
export type AttentionItem = { record: ContentRecord; issues: AttentionIssue[] };
export type AttentionPage = { items: AttentionItem[]; total: number; nextCursor: string | null };
export type AttentionQuery = { q: string; type: 'All' | typeof attentionTypes[number]; issue: 'All' | AttentionIssueCode; cursor: string | null };
export type DashboardServiceStatus = {
  id: 'database' | 'images' | 'email';
  status: 'connected' | 'configured' | 'needs_setup' | 'unavailable' | 'unknown';
  label: string; detail: string; checkedAt: string;
};
export type DashboardData = {
  attentionCount: number; enquiries: Enquiry[]; enquiriesTotal: number;
  services: DashboardServiceStatus[]; checkedAt: string;
};

/** Suggestions only: optional fields and unused page image slots are not errors. */
export function getContentAttentionIssues(record: ContentRecord): AttentionIssue[] {
  if (record.deletedAt !== undefined || !(attentionTypes as readonly string[]).includes(record.type)) return [];
  const issues: AttentionIssue[] = [];
  const present = (value: unknown) => typeof value === 'string' && Boolean(value.trim());
  const titleComplete = present(record.title) && present(record.titleTh);
  const descriptionComplete = present(record.description) && present(record.descriptionTh);
  const footer = record.type === 'Section' && record.id === 'footer' && record.parentId === 'shared';
  const missingDescription = record.type === 'Section'
    ? !footer && (present(record.description) || present(record.descriptionTh)) && !descriptionComplete
    : !descriptionComplete;
  if (!titleComplete || missingDescription) {
    issues.push({ code: 'translation', label: 'Complete English and Thai text' });
  }
  if (!['Route', 'Page', 'Section'].includes(record.type) && !record.image?.trim()) issues.push({ code: 'image', label: 'Add a main image' });
  if (record.type === 'Vessel' && !Object.values(record.vesselSpecs ?? {}).some(value => typeof value === 'number' ? Number.isFinite(value) && value > 0 : typeof value === 'string' && value.trim())) {
    issues.push({ code: 'vessel_details', label: 'Add vessel details' });
  }
  return issues;
}
