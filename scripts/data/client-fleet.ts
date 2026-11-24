import type { ContentRecord } from '../../src/lib/cms-types';
import { applyLegacyVesselSpecs } from './legacy-vessel-particulars';
import { currentPdfVesselParticulars } from './current-pdf-vessel-particulars';
import { fleetPhotos } from '../../src/lib/fleet-photos';

// Preserve each vessel URL when the client updates a display name.
// Each vessel with a client sheet gets its particulars directly from that sheet.
const vessels = [
  ['ranong-moe', 'RANONG MOE', 'ระนองโม', 'Container'],
  ['moe-line-2', 'MOE LINE 2', 'โมไลน์ 2', 'Container'],
  ['moe-line-3', 'MOE LINE 3', 'โมไลน์ 3', 'Container'],
  ['moe-line-4', 'MOE LINE 4', 'โมไลน์ 4', 'Crane'],
  ['moe-line-5', 'MOE LINE 5', 'โมไลน์ 5', 'Container'],
  ['moe-line-6', 'MOE LINE 6', 'โมไลน์ 6', 'Container'],
  ['moe-line-7', 'MOE LINE 7', 'โมไลน์ 7', 'Container'],
  ['dumai-moe', 'DUMAI MOE', 'Dumai Moe', 'Tanker'],
] as const;

const categories = {
  Container: { categoryTh: 'เรือคอนเทนเนอร์', description: 'Container vessel in the fleet of Moe Navigation Co.,Ltd.', descriptionTh: 'เรือคอนเทนเนอร์ในกองเรือของบริษัท โม เนวิเกชั่น จำกัด' },
  Crane: { categoryTh: 'เรือเครน', description: 'Crane vessel in the fleet of Moe Navigation Co.,Ltd.', descriptionTh: 'เรือเครนในกองเรือของบริษัท โม เนวิเกชั่น จำกัด' },
  Tanker: { categoryTh: 'เรือแทงเกอร์', description: 'Tanker in the fleet of Moe Navigation Co.,Ltd.', descriptionTh: 'เรือแทงเกอร์ในกองเรือของบริษัท โม เนวิเกชั่น จำกัด' },
};

function vesselMedia(id: keyof typeof fleetPhotos) {
  const [main, ...gallery] = fleetPhotos[id];
  return { image: main.url, imageAlt: main.alt, imageAltTh: main.altTh, mobileImage: '', gallery };
}

export const clientFleetRecords: ContentRecord[] = vessels.map(([id, title, titleTh, category], index) => {
  const record: ContentRecord = {
    id, type: 'Vessel', title, titleTh, category, ...categories[category],
    ...vesselMedia(id),
    body: '', bodyTh: '', bodyHeading: '', bodyHeadingTh: '',
    order: index + 1, status: 'Published', revision: 1,
  };
  const sheet = currentPdfVesselParticulars.find(source => source.id === id);
  return sheet ? { ...record, vesselSpecs: { ...sheet.specs } } : applyLegacyVesselSpecs(record).record;
});

export const clientFleetPageCopy = {
  description: 'Explore our container vessels, crane vessel and tanker.',
  descriptionTh: 'ทำความรู้จักเรือคอนเทนเนอร์ เรือเครน และเรือแทงเกอร์ในกองเรือของเรา',
};
