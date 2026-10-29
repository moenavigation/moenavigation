import type { ContentRecord } from '../../src/lib/cms-types';

// Client-supplied vessel names and types, received 29 October 2026.
// Keep existing URL identities. Photos and technical particulars were not supplied.
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

export const clientFleetRecords: ContentRecord[] = vessels.map(([id, title, titleTh, category], index) => ({
  id, type: 'Vessel', title, titleTh, category, ...categories[category],
  image: '', imageAlt: '', imageAltTh: '', mobileImage: '', gallery: [],
  body: '', bodyTh: '', bodyHeading: '', bodyHeadingTh: '',
  order: index + 1, status: 'Published', revision: 1,
}));

export const clientFleetPageCopy = {
  description: 'Explore our container vessels, crane vessel and tanker.',
  descriptionTh: 'ทำความรู้จักเรือคอนเทนเนอร์ เรือเครน และเรือแทงเกอร์ในกองเรือของเรา',
};
