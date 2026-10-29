import type { ContentRecord } from '../../src/lib/cms-types';

// Client-supplied vessel names and types, received 29 October 2026.
// Keep existing URL identities. Images are illustrative; actual vessel photos and
// technical particulars have not been supplied.
const vessels = [
  ['ranong-moe', 'RANONG MOE', 'ระนองโม', 'Container'],
  ['moe-line-2', 'MOE 2', 'โม2', 'Container'],
  ['moe-line-3', 'MOE 3', 'โม3', 'Container'],
  ['moe-line-4', 'MOE 4', 'โม4', 'Crane'],
  ['moe-line-5', 'MOE 5', 'โม5', 'Container'],
  ['moe-line-6', 'MOE 6', 'โม6', 'Container'],
  ['moe-line-7', 'MOE 7', 'โม7', 'Container'],
  ['dumai-moe', 'DUMAI MOE', 'Dumai Moe', 'Tanker'],
] as const;

const categories = {
  Container: { categoryTh: 'เรือคอนเทนเนอร์', description: 'Container vessel in the fleet of Moe Navigation Co.,Ltd.', descriptionTh: 'เรือคอนเทนเนอร์ในกองเรือของบริษัท โม เนวิเกชั่น จำกัด' },
  Crane: { categoryTh: 'เรือเครน', description: 'Crane vessel in the fleet of Moe Navigation Co.,Ltd.', descriptionTh: 'เรือเครนในกองเรือของบริษัท โม เนวิเกชั่น จำกัด' },
  Tanker: { categoryTh: 'เรือแทงเกอร์', description: 'Tanker in the fleet of Moe Navigation Co.,Ltd.', descriptionTh: 'เรือแทงเกอร์ในกองเรือของบริษัท โม เนวิเกชั่น จำกัด' },
};

const media = {
  'ranong-moe': ['container-vessel', 'container-deck-detail', 'port', 'vessel-deck'],
  'moe-line-2': ['port', 'logistics', 'container-deck-detail'],
  'moe-line-3': ['fleet/moe-3-container-illustration', 'container-deck-detail', 'port', 'logistics'],
  'moe-line-4': ['fleet/moe-4-crane-illustration', 'crane-lift-detail'],
  'moe-line-5': ['vessel-deck', 'container-deck-detail', 'port', 'logistics'],
  'moe-line-6': ['fleet/moe-6-container-illustration', 'container-deck-detail', 'port', 'logistics'],
  'moe-line-7': ['fleet/moe-7-container-illustration', 'container-deck-detail', 'port', 'logistics'],
  'dumai-moe': ['fleet/dumai-moe-tanker-illustration', 'tanker-deck-detail', 'tanker'],
} satisfies Record<typeof vessels[number][0], string[]>;

function illustrativeMedia(id: typeof vessels[number][0], title: string, titleTh: string) {
  const [main, ...gallery] = media[id];
  return {
    image: `/images/${main}.webp`,
    imageAlt: `${title} — illustrative maritime image, not a photograph of this vessel.`,
    imageAltTh: `${titleTh} — ภาพประกอบทางทะเล ไม่ใช่ภาพถ่ายของเรือลำนี้`,
    mobileImage: '',
    gallery: gallery.map((asset, index) => ({
      url: `/images/${asset}.webp`,
      alt: `${title} — illustrative maritime image ${index + 2}, not a photograph of this vessel.`,
      altTh: `${titleTh} — ภาพประกอบทางทะเล ${index + 2} ไม่ใช่ภาพถ่ายของเรือลำนี้`,
    })),
  };
}

export const clientFleetRecords: ContentRecord[] = vessels.map(([id, title, titleTh, category], index) => ({
  id, type: 'Vessel', title, titleTh, category, ...categories[category],
  ...illustrativeMedia(id, title, titleTh),
  body: '', bodyTh: '', bodyHeading: '', bodyHeadingTh: '',
  order: index + 1, status: 'Published', revision: 1,
}));

export const clientFleetPageCopy = {
  description: 'Explore our container vessels, crane vessel and tanker.',
  descriptionTh: 'ทำความรู้จักเรือคอนเทนเนอร์ เรือเครน และเรือแทงเกอร์ในกองเรือของเรา',
};
