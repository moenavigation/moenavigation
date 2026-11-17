import type { ContentRecord } from '../../src/lib/cms-types';
import type { MigrationAsset } from '../lib/migration-media';

export const legacyAboutSourceUrls = ['https://www.moe-line.com/about-us/', 'https://www.moe-line.com/th/about-us/'] as const;
export const legacyAboutMediaSubmission = '6b3b756e-a6a6-41c1-9b95-507a38dd5d98';
export const legacyAboutMediaOwner = 'legacy-about-import-2026-11-17';
export type LegacyAboutImageKey = 'hero' | 'overview' | 'safety' | 'maintenance' | 'crew' | 'office';
export type LegacyAboutImage = MigrationAsset & { key: LegacyAboutImageKey; sourceUrl: string; title: string; alt: string; altTh: string };
const archive = '.local/legacy-moe-line-2026-11-16/assets/';
const uploads = 'https://www.moe-line.com/wp-content/uploads/2025/';

// Original WebP pixels, reviewed visually and for metadata. No certificate image
// is included. Neutral alternative text describes the scene without identifying
// people as current employees or claiming that a legacy legal entity is current.
export const legacyAboutImages: readonly LegacyAboutImage[] = [
  { key: 'hero', sourcePath: archive + '5a0f6ff89e-sld-022.webp', sourceUrl: uploads + '06/sld-022.webp', sha256: '00ab71ccf564c828bdf3833c28ddcd5795c1d698cca5aea327c13e838555d4b9', bytes: 177870, width: 1920, height: 1047, format: 'webp', title: 'About — port operations', alt: 'Container vessel and port operations', altTh: 'เรือขนส่งตู้คอนเทนเนอร์และงานท่าเรือ' },
  { key: 'overview', sourcePath: archive + '2e8220c141-sld-015.webp', sourceUrl: uploads + '06/sld-015.webp', sha256: '1e6d0bfd58cd93f29a5fc124e699f3c549e82ee3ef2e00f852a9e209b454bf99', bytes: 303212, width: 2501, height: 2560, format: 'webp', title: 'About — container vessel underway', alt: 'Moe Line 5 carrying containers on the water', altTh: 'เรือโมไลน์ 5 บรรทุกตู้คอนเทนเนอร์ขณะเดินเรือ' },
  { key: 'safety', sourcePath: archive + 'c24795a4ec-sld-026.webp', sourceUrl: uploads + '07/sld-026.webp', sha256: '085176a7434745daf0474d6a9887f41134161890ad6e6189bcbeddff21869c29', bytes: 135666, width: 1396, height: 1047, format: 'webp', title: 'About — onboard inspection', alt: 'People in hard hats inspecting a vessel beside containers', altTh: 'ผู้สวมหมวกนิรภัยตรวจงานบนเรือข้างตู้คอนเทนเนอร์' },
  { key: 'maintenance', sourcePath: archive + 'f13751dbee-sld-023.webp', sourceUrl: uploads + '06/sld-023.webp', sha256: '255e137219244399ad380a91e6a94db726d30d9f8cc1f0fa6a478295ef3a8a55', bytes: 107468, width: 1396, height: 1047, format: 'webp', title: 'About — machinery care', alt: 'A person inspecting machinery and wire-rope drums', altTh: 'ผู้ปฏิบัติงานตรวจเครื่องจักรและดรัมลวดสลิง' },
  { key: 'crew', sourcePath: archive + '664a3773b3-sld-0231.webp', sourceUrl: uploads + '08/sld-0231.webp', sha256: '6c3437091194d9c96da74f1054fe4c1b66782d15ef99f67884cb1d64d52243e4', bytes: 105468, width: 1396, height: 1047, format: 'webp', title: 'About — vessel team', alt: 'Six people in workwear and hard hats beside a moored vessel', altTh: 'ผู้สวมชุดปฏิบัติงานและหมวกนิรภัยหกคนยืนข้างเรือที่เทียบท่า' },
  { key: 'office', sourcePath: archive + '1f483a7015-sld-019.webp', sourceUrl: uploads + '06/sld-019.webp', sha256: '17976bb7b950b5fbc663f4e1dea0c110e30664288972302d3c271063026fba58', bytes: 24602, width: 800, height: 608, format: 'webp', title: 'About — shoreside coordination', alt: 'People in hard hats reviewing a tablet beside a port', altTh: 'ผู้สวมหมวกนิรภัยดูข้อมูลบนแท็บเล็ตบริเวณท่าเรือ' },
];

// Source themes adapted for the current identity. Deliberately excludes legacy
// founding dates, capital, director/bank/affiliate details, headcounts, formal
// certification claims, guaranteed outcomes and unconfirmed cargo acceptance.
export const legacyAboutCopy = {
  page: {
    title: 'About Moe Navigation Co.,Ltd.', titleTh: 'เกี่ยวกับ Moe Navigation Co.,Ltd.',
    eyebrow: 'ABOUT US', eyebrowTh: 'เกี่ยวกับเรา',
    description: 'Marine transport and logistics built around coastal connections, practical planning and the people who support every voyage.',
    descriptionTh: 'บริการขนส่งและโลจิสติกส์ทางทะเลที่ให้ความสำคัญกับการเชื่อมต่อชายฝั่ง การวางแผนที่เหมาะสม และผู้คนที่สนับสนุนทุกการเดินเรือ',
  },
  intro: {
    title: 'Moe Navigation Co.,Ltd.', titleTh: 'Moe Navigation Co.,Ltd.', eyebrow: 'WHO WE ARE', eyebrowTh: 'รู้จักเรา',
    description: 'Moe Navigation Co.,Ltd. supports marine transport and logistics for businesses moving cargo between ports. Our approach brings together vessel operations, ship management and shoreside coordination, with container transport linking coastal and inland waterways to wider shipping networks.',
    descriptionTh: 'Moe Navigation Co.,Ltd. สนับสนุนงานขนส่งและโลจิสติกส์ทางทะเลสำหรับธุรกิจที่ขนส่งสินค้าระหว่างท่าเรือ เราผสานงานปฏิบัติการเรือ การบริหารจัดการเรือ และการประสานงานบนฝั่ง โดยมีการขนส่งตู้คอนเทนเนอร์เชื่อมเส้นทางชายฝั่งและทางน้ำภายในประเทศเข้ากับเครือข่ายการเดินเรือที่กว้างขึ้น',
    body: 'We begin by understanding the cargo, port requirements and preferred timing. Clear communication between customers, vessel teams and office staff helps turn those requirements into a practical transport plan.',
    bodyTh: 'เราเริ่มจากการทำความเข้าใจสินค้า ข้อกำหนดของท่าเรือ และช่วงเวลาที่ต้องการ การสื่อสารที่ชัดเจนระหว่างลูกค้า ทีมงานประจำเรือ และเจ้าหน้าที่สำนักงาน ช่วยนำความต้องการเหล่านั้นมาจัดทำแผนขนส่งที่เหมาะสมกับงาน',
  },
  mission: {
    description: 'Provide marine transport that responds to customers’ needs, with attention to safe operations, service quality and responsible resource use.',
    descriptionTh: 'ให้บริการขนส่งทางทะเลที่ตอบสนองความต้องการของลูกค้า โดยใส่ใจการปฏิบัติงานอย่างปลอดภัย คุณภาพบริการ และการใช้ทรัพยากรอย่างรับผิดชอบ',
  },
  vision: {
    description: 'Strengthen connections between regional ports and local destinations through dependable coordination and continuous improvement.',
    descriptionTh: 'เสริมการเชื่อมต่อระหว่างท่าเรือในภูมิภาคกับจุดหมายปลายทางในพื้นที่ ด้วยการประสานงานที่เชื่อถือได้และการพัฒนาอย่างต่อเนื่อง',
  },
  safety: {
    title: 'Safety at every step', titleTh: 'ใส่ใจความปลอดภัยทุกขั้นตอน',
    description: 'Safety guides our approach to people, cargo, vessels and the marine environment, supported by clear procedures and operational awareness.',
    descriptionTh: 'เราให้ความสำคัญกับความปลอดภัยของผู้คน สินค้า เรือ และสิ่งแวดล้อมทางทะเล โดยมีขั้นตอนที่ชัดเจนและความตระหนักในการปฏิบัติงานเป็นส่วนสนับสนุน',
  },
  maintenance: {
    title: 'Vessel care', titleTh: 'การดูแลเรือ',
    description: 'Vessel care combines routine maintenance, condition monitoring and planned servicing to support reliable operations and identify issues early.',
    descriptionTh: 'การดูแลเรือผสานการบำรุงรักษาตามรอบ การติดตามสภาพ และการวางแผนเข้ารับบริการ เพื่อสนับสนุนการปฏิบัติงานที่เชื่อถือได้และตรวจพบปัญหาตั้งแต่ระยะแรก',
  },
  crew: {
    title: 'Onboard teams', titleTh: 'ทีมงานประจำเรือ',
    description: 'Onboard teams support navigation and cargo handling, with practical skills, communication and attention to each operation’s requirements.',
    descriptionTh: 'ทีมงานประจำเรือสนับสนุนการเดินเรือและการขนถ่ายสินค้า ด้วยทักษะการปฏิบัติงาน การสื่อสาร และความใส่ใจข้อกำหนดของแต่ละงาน',
  },
  office: {
    title: 'Shoreside coordination', titleTh: 'การประสานงานบนฝั่ง',
    description: 'Shore-based coordination supports vessel teams and customers with planning, operational follow-up and the information needed to keep work moving.',
    descriptionTh: 'การประสานงานบนฝั่งสนับสนุนทีมงานประจำเรือและลูกค้า ทั้งด้านการวางแผน การติดตามงาน และข้อมูลที่จำเป็นต่อการดำเนินงานอย่างต่อเนื่อง',
  },
} satisfies Record<string, Partial<ContentRecord>>;

export const legacyAboutReviewNotes = [
  'The legacy page names Moe Container Line; the supplied current identity is Moe Navigation Co.,Ltd. Only general operating themes are adapted.',
  'The About hero sld-022.webp is confirmed by the page-linked post-13.css, not only by the media library.',
  'Photographs establish their depicted scenes and legacy publication, not current employment, date, berth, ownership or certification.',
  'Existing public contact settings and all unrelated content, including about-values, remain unchanged.',
] as const;
