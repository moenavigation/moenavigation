import type { ContentImage } from './cms-types';
import { ownerPhotos } from './owner-photos';

function photo(file: string, alt: string, altTh: string): ContentImage {
  return { url: `/images/fleet-originals/${file}.webp`, alt, altTh };
}

// Actual vessel photographs from the client particulars and the verified company archive.
export const originalFleetPhotos = {
  'ranong-moe': [
    photo('ranong-moe', 'RANONG MOE moored alongside a quay', 'เรือระนองโมจอดเทียบท่า'),
    photo('ranong-moe-stern', 'RANONG MOE viewed from above at the berth', 'เรือระนองโมขณะจอดที่ท่า มองจากมุมสูง'),
  ],
  'moe-line-2': [
    photo('moe-line-2', 'MOE LINE 2 carrying containers near a bridge', 'เรือโมไลน์ 2 บรรทุกตู้คอนเทนเนอร์ใกล้สะพาน'),
  ],
  'moe-line-3': [
    photo('moe-line-3', 'MOE LINE 3 underway with containers along the coast', 'เรือโมไลน์ 3 บรรทุกตู้คอนเทนเนอร์แล่นเลียบชายฝั่ง'),
    photo('moe-line-3-stern', 'Wake behind MOE LINE 3 at sea', 'แนวคลื่นท้ายเรือโมไลน์ 3 ขณะเดินทะเล'),
  ],
  'moe-line-4': [
    photo('moe-line-4', 'MOE LINE 4 crane barge alongside a container terminal', 'เรือเครนโมไลน์ 4 เทียบท่าที่ลานตู้คอนเทนเนอร์'),
    photo('moe-line-4-crane', 'The blue hull and red lifting crane of MOE LINE 4', 'ตัวเรือสีน้ำเงินและเครนยกสีแดงของเรือโมไลน์ 4'),
  ],
  'moe-line-5': [
    photo('moe-line-5', 'MOE LINE 5 carrying containers across open water', 'เรือโมไลน์ 5 บรรทุกตู้คอนเทนเนอร์กลางทะเล'),
    photo('moe-line-5-bow', 'Bow view of MOE LINE 5 underway', 'หัวเรือโมไลน์ 5 ขณะเดินเรือ'),
  ],
  'moe-line-6': [
    photo('moe-line-6', 'MOE LINE 6 carrying yellow and red containers', 'เรือโมไลน์ 6 บรรทุกตู้คอนเทนเนอร์สีเหลืองและแดง'),
    photo('moe-line-6-alternate', 'MOE LINE 6 viewed from the water', 'เรือโมไลน์ 6 มองจากผิวน้ำ'),
  ],
  'moe-line-7': [
    photo('moe-line-7', 'MOE LINE 7 on the river near a cable-stayed bridge', 'เรือโมไลน์ 7 ในแม่น้ำใกล้สะพานขึง'),
    photo('moe-line-7-profile', 'Side view of MOE LINE 7 with containers on deck', 'เรือโมไลน์ 7 มองจากด้านข้าง พร้อมตู้คอนเทนเนอร์บนดาดฟ้า'),
  ],
  'dumai-moe': [
    photo('dumai-moe', 'DUMAI MOE tanker with its red hull viewed from the bow', 'เรือบรรทุกน้ำมันDUMAI MOE ตัวเรือสีแดง มองจากด้านหัวเรือ'),
  ],
};

export const fleetPhotos = {
  ...originalFleetPhotos,
  'dumai-moe': [
    ownerPhotos['dumai-moe-bow-quarter'], ownerPhotos['dumai-moe-terminal-profile'],
    ownerPhotos['dumai-moe-pipe-deck'], ownerPhotos['dumai-moe-stern'],
    ownerPhotos['dumai-moe-anchorage'], ownerPhotos['dumai-moe-lifeboat'],
    ownerPhotos['dumai-moe-bow-view'], ownerPhotos['dumai-moe-deck-overview'],
  ],
  'moe-line-4': [
    ownerPhotos['moe-line-4-crane-berth'], ...originalFleetPhotos['moe-line-4'],
    ownerPhotos['moe-line-4-crane-deck'], ownerPhotos['moe-line-4-terminal-profile'],
    ownerPhotos['moe-line-4-cargo-hold'],
  ],
};

export function isBundledVesselPhoto(type: string, id: string, url: string) {
  return type === 'Vessel' && Object.hasOwn(fleetPhotos, id)
    && (fleetPhotos[id as keyof typeof fleetPhotos].some(photo => photo.url === url)
      || originalFleetPhotos[id as keyof typeof originalFleetPhotos].some(photo => photo.url === url));
}
