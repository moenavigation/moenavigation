import assert from 'node:assert/strict';
import test from 'node:test';
import type { ContentRecord, ContentType } from '../src/lib/cms-types';
import { projectPublicContent } from '../src/lib/public-content';
import { selectPublicPageRecords } from '../src/lib/public-page-content';

function record(type: ContentType, id: string, patch: Partial<ContentRecord> = {}): ContentRecord {
  return {
    type, id, title: id, titleTh: `ไทย ${id}`, description: `Description ${id}`, descriptionTh: `รายละเอียด ${id}`,
    image: `/images/${id}.webp`, imageAlt: `Image ${id}`, imageAltTh: `ภาพ ${id}`, category: 'Marine', categoryTh: 'ทะเล',
    status: 'Published', revision: 1, body: `Long body ${id}`, bodyTh: `เนื้อหา ${id}`, ...patch,
  };
}
const shared = [record('Section', 'footer', { parentId: 'shared' }), record('Section', 'extra-shared', { parentId: 'shared' })];

test('privacy, contact and custom pages include their editorial content and shared sections only', () => {
  for (const page of ['privacy', 'contact', 'custom-page']) {
    const current = record('Page', page);
    const section = record('Section', `${page}-section`, { parentId: page });
    const records = [...shared, current, section, record('Page', 'about'), record('Service', 'service'), record('News', 'article'), record('Section', 'about-section', { parentId: 'about' })];
    assert.deepEqual(selectPublicPageRecords(records, page), [...shared, current, section]);
  }
});

test('unpublished and trashed records never enter page payloads', () => {
  const records = [record('Page', 'home'), record('Section', 'home-fleet', { parentId: 'home' }), record('Vessel', 'draft', { status: 'Draft' }), record('Vessel', 'deleted', { deletedAt: '2026-10-22' }), record('Section', 'hidden', { parentId: 'shared', status: 'Draft' })];
  assert.deepEqual(selectPublicPageRecords(records, 'home').map(item => item.id), ['home', 'home-fleet']);
});

test('home selects the displayed ordered cards and route geometry without long detail payloads', () => {
  const records = [record('Page', 'home'), ...shared,
    ...['home-expertise', 'home-fleet', 'home-news', 'home-connections'].map(id => record('Section', id, { parentId: 'home' })),
    ...Array.from({ length: 6 }, (_, index) => record('Service', `service-${index}`, { order: 5 - index })),
    ...Array.from({ length: 5 }, (_, index) => record('Vessel', `vessel-${index}`, { gallery: [{ url: '/huge-gallery.webp', alt: '', altTh: '' }] })),
    ...Array.from({ length: 5 }, (_, index) => record('News', `news-${index}`)),
    record('Project', 'project'), record('Route', 'route', { origin: { name: 'A', nameTh: 'ก', country: 'Thailand', countryTh: 'ไทย' }, destination: { name: 'B', nameTh: 'ข', country: 'Vietnam', countryTh: 'เวียดนาม' }, waypoints: [[13, 100], [10, 107]], gallery: [{ url: '/route-gallery.webp', alt: '', altTh: '' }] }),
  ];
  const selected = selectPublicPageRecords(records, '');
  const content = projectPublicContent(selected);
  assert.deepEqual(content.services.map(item => item.id), ['service-5', 'service-4', 'service-3', 'service-2']);
  assert.equal(content.vessels.length, 3);
  assert.equal(content.news.length, 3);
  assert.equal(content.projects.length, 0);
  assert.equal(content.routes[0].origin?.countryTh, 'ไทย');
  assert.equal(content.routes[0].destination?.country, 'Vietnam');
  assert.deepEqual(content.routes[0].waypoints, [[13, 100], [10, 107]]);
  assert.equal(content.routes[0].body, undefined);
  assert.equal(content.routes[0].bodyTh, undefined);
  assert.equal(content.routes[0].gallery, undefined);
  assert.deepEqual(content.vessels[0].gallery, []);
  assert.deepEqual(content.news[0].body, { en: '', th: '' });
  assert.ok(selected.indexOf(selected.find(item => item.id === 'service-2')!) < selected.indexOf(selected.find(item => item.id === 'service-5')!));
});

test('home omits collections when their displaying sections are absent', () => {
  const records = [record('Page', 'home'), record('Vessel', 'vessel'), record('Service', 'service'), record('News', 'news'), record('Route', 'route')];
  assert.deepEqual(selectPublicPageRecords(records, 'home').map(item => item.id), ['home']);
});

test('listing summaries retain all bilingual search fields but discard long bodies, galleries and specs', () => {
  for (const [page, type] of [['fleet', 'Vessel'], ['projects', 'Project'], ['news', 'News'], ['services', 'Service']] as const) {
    const cards = Array.from({ length: 10 }, (_, index) => record(type, `item-${index}`, { body: 'x'.repeat(10000), bodyTh: 'ท'.repeat(10000), gallery: [{ url: '/gallery.webp', alt: '', altTh: '' }], vesselSpecs: { imo: '1234567' } }));
    const records = [record('Page', page), ...cards];
    const before = JSON.stringify(records);
    const selected = selectPublicPageRecords(records, page).filter(item => item.type === type);
    assert.equal(selected.length, cards.length);
    for (const [index, card] of selected.entries()) {
      for (const field of ['id', 'title', 'titleTh', 'description', 'descriptionTh', 'category', 'categoryTh', 'image', 'imageAlt', 'imageAltTh'] as const) assert.equal(card[field], cards[index][field]);
      assert.equal(card.body, undefined);
      assert.equal(card.bodyTh, undefined);
      assert.equal(card.gallery, undefined);
      assert.equal(card.vesselSpecs, undefined);
    }
    assert.equal(JSON.stringify(records), before);
    assert.ok(JSON.stringify(selected).length < before.length / 10);
  }
});

test('vessel detail retains its full gallery/specifications and planning section', () => {
  const vessel = record('Vessel', 'chosen', { gallery: [{ url: '/gallery.webp', alt: 'Gallery', altTh: 'แกลเลอรี' }], vesselSpecs: { lengthM: 90, capacityTeu: 100 } });
  const page = record('Page', 'fleet');
  const planning = record('Section', 'vessel-planning', { parentId: 'fleet' });
  const records = [page, vessel, record('Vessel', 'other'), planning, record('Section', 'fleet-only', { parentId: 'fleet' }), ...shared];
  assert.deepEqual(selectPublicPageRecords(records, 'fleet', 'chosen'), [page, vessel, planning, ...shared]);
});

test('service detail retains the target and first three related links in editorial order', () => {
  const target = record('Service', 'target', { bodyHeading: 'Details', bodyHeadingTh: 'รายละเอียด' });
  const records = [target, ...Array.from({ length: 5 }, (_, index) => record('Service', `other-${index}`, { order: 5 - index })), record('Section', 'service-planning', { parentId: 'services' })];
  const selected = selectPublicPageRecords(records, 'services', 'target');
  const content = projectPublicContent(selected);
  assert.equal(selected.find(item => item.id === 'target'), target);
  assert.deepEqual(content.services.filter(item => item.id !== 'target').map(item => item.id), ['other-4', 'other-3', 'other-2']);
  assert.equal(content.services.find(item => item.id === 'other-4')?.body.en, '');
  assert.equal(content.sections[0].id, 'service-planning');
});

test('article detail retains sibling categories for filter context and the next article link', () => {
  const records = [record('News', 'target'), record('News', 'next', { category: 'Operations' }), record('News', 'last', { category: 'Industry' }), record('Project', 'irrelevant')];
  const selected = selectPublicPageRecords(records, 'news', 'target');
  assert.deepEqual(selected.map(item => item.id), ['target', 'next', 'last']);
  assert.equal(selected[0].body, records[0].body);
  assert.equal(selected[1].body, undefined);
  assert.equal(selected[2].category, 'Industry');
});

test('routes retain all coordinates and descriptions for interactive selection', () => {
  const routes = [record('Route', 'mapped', { waypoints: [[13, 100], [10, 107]] }), record('Route', 'unmapped')];
  assert.deepEqual(selectPublicPageRecords([...routes, record('Vessel', 'unrelated')], 'routes'), routes);
});
