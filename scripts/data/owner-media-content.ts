import type { ContentImage, ContentRecord, HomeSlide } from '../../src/lib/cms-types';
import { ownerPhotos } from '../../src/lib/owner-photos';
import { fleetPhotos, originalFleetPhotos } from '../../src/lib/fleet-photos';
import { defaultHomeSlides, fleetPhotoSlides, MAX_HOME_SLIDES } from '../../src/lib/home-slides';

export const ownerPhotoPaths = Object.values(ownerPhotos).map(photo => photo.url);
const archive = [
  ownerPhotos['archive-moe-line-1-river-bridge'], ownerPhotos['archive-moe-line-3-river-quay'],
  ownerPhotos['moe-line-4-cargo-hold'], ownerPhotos['archive-moe-line-1-container-bow'],
  ownerPhotos['archive-moe-line-3-hold-overhead'], ownerPhotos['dumai-moe-deck-overview'],
];

// A placement is eligible only while it still shows the reviewed previous image.
// Editors can keep a different cover on any page, even when the same old image is replaced elsewhere.
type Placement = [previous: string, replacement: keyof typeof ownerPhotos];
const covers: Record<string, Placement> = {
  'Page:home': ['/images/company-originals/river-passage.webp', 'dumai-moe-anchorage'],
  'Page:services': ['/images/fleet-originals/moe-line-5.webp', 'container-terminal-basin'],
  'Page:routes': ['/images/company-originals/river-passage.webp', 'coastal-port-approach'],
  'Page:projects': ['/images/company-originals/container-terminal.webp', 'moe-line-4-terminal-profile'],
  'Project:crane-operation': ['/images/fleet-originals/moe-line-4.webp', 'moe-line-4-crane-deck'],
  'Project:port-operation-support': ['/images/company-originals/container-terminal.webp', 'container-terminal-basin'],
  'Project:bunkering-operation': ['/images/fleet-originals/dumai-moe.webp', 'dumai-moe-pipe-deck'],
  'Project:vessel-charter': ['/images/fleet-originals/dumai-moe.webp', 'dumai-moe-terminal-profile'],
  'Service:logistics-support': ['/images/company-originals/coastal-berth.webp', 'container-terminal-basin'],
  'News:connected-ports': ['/images/company-originals/container-terminal.webp', 'coastal-port-approach'],
};

type PhotoRecord = { id: string; type: string; image: string } & Partial<Omit<ContentRecord,'id'|'type'|'image'>>;
const asStored = (url: string) => url;

function withPhotos(existing: ContentImage[], additions: ContentImage[], sourceFor: (url: string) => string) {
  const selected = new Set(existing.map(item => sourceFor(item.url)));
  return [...existing, ...additions.filter(item => !selected.has(sourceFor(item.url)))].slice(0, 12);
}

export function applyOwnerMedia<T extends PhotoRecord>(record: T, sourceFor = asStored): T {
  if (record.deletedAt || record.status === 'Draft') return record;
  const next = { ...record };
  const key = record.type + ':' + record.id;
  const cover = covers[key];
  let newCover: ContentImage | undefined;
  if (cover && sourceFor(record.image) === cover[0]) newCover = ownerPhotos[cover[1]];

  if (record.type === 'Vessel' && (record.id === 'dumai-moe' || record.id === 'moe-line-4')) {
    const originals = originalFleetPhotos[record.id];
    const [main, ...album] = fleetPhotos[record.id];
    if (sourceFor(record.image) === originals[0].url) {
      newCover = main;
      const existing = record.gallery || [];
      const custom = existing.filter(photo => !originals.some(original => original.url === sourceFor(photo.url)));
      const bySource = new Map(existing.map(photo => [sourceFor(photo.url), photo]));
      next.gallery = withPhotos(custom, album.map(photo => bySource.get(photo.url) || photo), sourceFor);
    }
  }
  if (newCover) {
    next.image = newCover.url;
    next.imageAlt = newCover.alt;
    next.imageAltTh = newCover.altTh;
  }
  if (key === 'Page:about' && !record.gallery?.length) next.gallery = archive;

  if (key === 'Page:home') {
    const existing = record.heroSlides || [];
    // The prior included MOE LINE 3 banner is a tighter crop of the same owner original.
    // Replace that rendition while retaining individually edited descriptions and custom selections.
    const legacy = fleetPhotoSlides[0];
    const ownerFrame = ownerPhotos['archive-moe-line-3-underway'];
    const custom: HomeSlide[] = existing.filter(slide => slide.url !== legacy.url);
    const oldBanner = existing.find(slide => slide.url === legacy.url);
    const customized = oldBanner && (oldBanner.alt !== legacy.alt || oldBanner.altTh !== legacy.altTh);
    if (customized && !custom.some(slide => slide.url === ownerFrame.url)) custom.push({ ...oldBanner, url: ownerFrame.url });
    const known = new Set(custom.map(slide => sourceFor(slide.url)));
    // Once owner media has been saved, a subsequent run must respect editorial removals.
    const alreadyCurated = existing.some(slide => defaultHomeSlides.some(owner => owner.url === sourceFor(slide.url)));
    if (!alreadyCurated) {
      const room = Math.max(0, MAX_HOME_SLIDES - custom.length);
      const additions = defaultHomeSlides.filter(slide => !known.has(slide.url)).slice(0, room);
      next.heroSlides = [...additions, ...custom];
    }
  }
  return next;
}
