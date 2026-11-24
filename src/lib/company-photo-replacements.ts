import type { ContentImage } from './cms-types';
import { originalFleetPhotos as fleetPhotos } from './fleet-photos';

function companyPhoto(file: string, alt: string, altTh: string): ContentImage {
  return { url: `/images/company-originals/${file}.webp`, alt, altTh };
}

export function contentPhotoFields({ url, alt, altTh }: ContentImage) {
  return { image: url, imageAlt: alt, imageAltTh: altTh };
}

export const companyPhotos = {
  wheelhouse: companyPhoto('wheelhouse', 'Navigation instruments and the crew inside a vessel’s wheelhouse', 'เครื่องมือเดินเรือและเจ้าหน้าที่ภายในห้องบังคับการเรือ'),
  tanker: fleetPhotos['dumai-moe'][0],
  officeMeeting: companyPhoto('office-meeting', 'A team reviewing a presentation around a meeting table', 'ทีมงานกำลังดูงานนำเสนอร่วมกันในห้องประชุม'),
  containerDeck: companyPhoto('container-deck', 'An overhead view of containers arranged on a vessel’s deck', 'ภาพมุมสูงของตู้คอนเทนเนอร์ที่เรียงอยู่บนดาดฟ้าเรือ'),
  containerVessel: fleetPhotos['moe-line-5'][0],
  craneDetail: fleetPhotos['moe-line-4'][1],
  craneVessel: fleetPhotos['moe-line-4'][0],
  containerVesselBow: fleetPhotos['moe-line-5'][1],
  riverPassage: companyPhoto('river-passage', 'A container vessel following the river between waterfront wharves', 'เรือบรรทุกตู้คอนเทนเนอร์แล่นในแม่น้ำระหว่างท่าเทียบเรือสองฝั่ง'),
  coastalBerth: companyPhoto('coastal-berth', 'Vessels moored at a coastal berth beside a wooded hillside', 'เรือจอดเทียบท่าชายฝั่งใกล้เนินเขาที่มีต้นไม้ปกคลุม'),
  containerTerminal: companyPhoto('container-terminal', 'MOE LINE 4 alongside a container terminal and its cargo yards', 'เรือเครนโมไลน์ 4 เทียบท่าริมลานตู้คอนเทนเนอร์'),
  mooringLines: companyPhoto('mooring-lines', 'Two crew members handling a mooring line on deck', 'เจ้าหน้าที่สองคนกำลังจัดเชือกผูกเรือบนดาดฟ้า'),
  quaysideInspection: companyPhoto('quayside-inspection', 'A crew member in a hard hat stands beside the cargo hold of a moored vessel', 'เจ้าหน้าที่สวมหมวกนิรภัยยืนข้างระวางสินค้าของเรือที่จอดเทียบท่า'),
  officeExterior: companyPhoto('office-exterior', 'The entrance and upper floors of the office building', 'ทางเข้าและชั้นบนของอาคารสำนักงาน'),
} satisfies Record<string, ContentImage>;

// The keys identify earlier pictures. The text describes the actual replacement.
export const companyPhotoReplacements: Readonly<Record<string, ContentImage>> = {
  '/images/bridge.webp': companyPhotos.wheelhouse,
  '/images/bunkering.webp': companyPhotos.tanker,
  '/images/consulting.webp': companyPhotos.officeMeeting,
  '/images/container-deck-detail.webp': companyPhotos.containerDeck,
  '/images/container-vessel.webp': companyPhotos.containerVessel,
  '/images/crane-lift-detail.webp': companyPhotos.craneDetail,
  '/images/crane.webp': companyPhotos.craneVessel,
  '/images/hero-mobile.webp': companyPhotos.containerVesselBow,
  '/images/hero.webp': companyPhotos.riverPassage,
  '/images/logistics.webp': companyPhotos.coastalBerth,
  '/images/port.webp': companyPhotos.containerTerminal,
  '/images/tanker-deck-detail.webp': companyPhotos.tanker,
  '/images/tanker.webp': companyPhotos.tanker,
  '/images/tugboat.webp': companyPhotos.mooringLines,
  '/images/vessel-deck.webp': companyPhotos.quaysideInspection,
  '/images/contact-thai-planning.webp': companyPhotos.officeExterior,
  '/images/about/shoreside-coordination.webp': companyPhotos.officeMeeting,
};
