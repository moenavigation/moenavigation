import type { ContentRecord, ContentType } from './cms-types';

// Cards and browser-side filters use these fields. Large article bodies and
// vessel galleries/specifications belong to detail views; maps add route geometry.
function summary(record: ContentRecord): ContentRecord {
  return {
    id: record.id, type: record.type, status: record.status, revision: record.revision,
    title: record.title, titleTh: record.titleTh,
    description: record.description, descriptionTh: record.descriptionTh,
    image: record.image, imageAlt: record.imageAlt, imageAltTh: record.imageAltTh,
    category: record.category, categoryTh: record.categoryTh,
    order: record.order, date: record.date, icon: record.icon,
  };
}

/** Select the public records consumed by this page before crossing the client boundary. */
export function selectPublicPageRecords(records: ContentRecord[], page: string, slug?: string): ContentRecord[] {
  const pageId = page || 'home';
  const visible = records.filter(record => record.status === 'Published' && !record.deletedAt);
  const collection = (type: ContentType) => visible.filter(record => record.type === type).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const selected = new Set<ContentRecord>();
  const full = new Set<ContentRecord>();
  const include = (items: ContentRecord[], withDetails = false) => {
    for (const item of items) {
      selected.add(item);
      if (withDetails) full.add(item);
    }
  };

  include(visible.filter(record => record.type === 'Page' && record.id === pageId), true);
  // Shared content includes the footer and editor-created sections on every page.
  include(visible.filter(record => record.type === 'Section' && record.parentId === 'shared'), true);
  const detailPlanning: Record<string, string> = { services: 'service-planning', fleet: 'vessel-planning', projects: 'project-planning' };
  const isDetail = Boolean(slug && ['services', 'fleet', 'projects', 'news'].includes(pageId));
  const sections = visible.filter(record => record.type === 'Section' && record.parentId === pageId);
  include(isDetail ? sections.filter(record => record.id === detailPlanning[pageId]) : sections, true);

  if (pageId === 'home') {
    const hasSection = (id: string) => sections.some(section => section.id === id);
    if (hasSection('home-expertise')) include(collection('Service').slice(0, 4));
    if (hasSection('home-fleet')) include(collection('Vessel').slice(0, 3));
    if (hasSection('home-news')) include(collection('News').slice(0, 3));
    if (hasSection('home-connections')) include(collection('Route'));
  } else if (pageId === 'routes') {
    // Selection changes without fetching a new page, so all routes need their geometry and copy.
    include(collection('Route'), true);
  } else {
    const types: Record<string, ContentType> = { services: 'Service', fleet: 'Vessel', projects: 'Project', news: 'News' };
    const type = types[pageId];
    if (type) {
      const items = collection(type);
      if (!slug) {
        // Keep all summaries for bilingual search and category filters.
        include(items);
      } else {
        include(items.filter(record => record.id === slug), true);
        if (pageId === 'services') include(items.filter(record => record.id !== slug).slice(0, 3));
        // Article detail links preserve the category filter, including when the
        // selected category belongs to a sibling rather than the current item.
        if (pageId === 'projects' || pageId === 'news') include(items);
      }
    }
  }

  // Preserve input order, including ties in editorial ordering, without mutating the cached snapshot.
  return visible.filter(record => selected.has(record)).map(record => {
    if (full.has(record)) return record;
    if (record.type === 'Route' && pageId === 'home') return { ...summary(record), origin: record.origin, destination: record.destination, waypoints: record.waypoints };
    return summary(record);
  });
}
