import type { ContentRecord } from './cms-types';

type CopyField = 'eyebrow' | 'eyebrowTh' | 'title' | 'titleTh' | 'description' | 'descriptionTh' | 'caption' | 'captionTh';
type Revision = [previous: string | string[], revised: string];
const revisedCopy: Record<string, Partial<Record<CopyField, Revision>>> = {
  'footer': {
    title: ['People. Purpose. Every voyage.', 'Full-vessel chartering for container ships, crane vessels and tankers, with crew coordination and day-to-day vessel management.'],
    titleTh: ['ทีมงาน เป้าหมาย และทุกการเดินทาง', 'ให้บริการเช่าเรือคอนเทนเนอร์ เรือเครน และเรือแท็งเกอร์ทั้งลำ พร้อมจัดหาลูกเรือและดูแลการปฏิบัติงานของเรือตลอดระยะเวลาเช่า'],
  },
  'home': {
    eyebrow: [["Connected by the sea", "Beyond Shipping · Built on Trust"], "YOUR CARGO. OUR VESSEL. COMPLETE MANAGEMENT."],
    eyebrowTh: [["เชื่อมโยงทุกการเดินทางทางทะเล", "เชื่อมโยงกันด้วยท้องทะเล"], "สินค้าของคุณ เรือของเรา พร้อมบริการบริหารจัดการครบวงจร"],
    title: [["Your trusted maritime partner.", "Moe Navigation Co.,Ltd."], "Moe Navigation Co., Ltd."],
    titleTh: [["พันธมิตรที่คุณวางใจ ในทุกการเดินทาง", "พันธมิตรที่คุณวางใจในทุกการเดินทาง"], "บริษัท โม เนวิเกชั่น จำกัด"],
    description: [["Connecting people, vessels and possibilities. Maritime services built around your journey.", "Delivering seamless maritime solutions through trusted expertise, operational excellence, and an unwavering commitment to safety and reliability across every voyage."], "Established in 2022 by the founder of SSOT Group Co., Ltd., Moe Navigation provides full-vessel chartering solutions for container, crane and tanker vessels. We coordinate crew arrangements and manage vessel operations, giving our clients a dependable partner for their transportation needs."],
    descriptionTh: ["เชื่อมโยงผู้คน เรือ และโอกาสใหม่ ด้วยบริการทางทะเลที่พร้อมดูแลทุกการเดินทางของคุณ", "Moe Navigation ก่อตั้งขึ้นในปี 2022 โดยผู้ก่อตั้ง SSOT Group Co., Ltd. ให้บริการเช่าเรือทั้งลำสำหรับเรือคอนเทนเนอร์ เรือเครน และเรือแท็งเกอร์ พร้อมดูแลการจัดหาลูกเรือและบริหารจัดการการปฏิบัติงานบนเรือ เพื่อเป็นพันธมิตรที่ลูกค้าไว้วางใจในการขนส่งสินค้า"],
    caption: [["MARITIME SERVICES · REGIONAL CONNECTIONS", "Established in 2022 · by the founder of SSOT Group Co., Ltd."], "Three vessel types. One committed team managing the operation from vessel preparation to day-to-day coordination."],
    captionTh: ["บริการทางทะเล · เชื่อมต่อภูมิภาค", "เรือ 3 ประเภท ภายใต้ทีมงานที่ดูแลการดำเนินงาน ตั้งแต่การเตรียมความพร้อมของเรือไปจนถึงการประสานงานในแต่ละวัน"],
  },
  'home-expertise': {
    eyebrow: ["Our expertise", "OUR VESSEL CHARTERING SERVICES"],
    eyebrowTh: ["ความเชี่ยวชาญของเรา", "บริการเช่าเรือและบริหารจัดการเรือ"],
    title: ["Keeping your business moving.", "Your Cargo. Our Vessel. Complete Management."],
    titleTh: ["ขับเคลื่อนธุรกิจของคุณไปข้างหน้า", "สินค้าของคุณ เรือของเรา พร้อมบริการบริหารจัดการครบวงจร"],
  },
  'home-trust': {
    eyebrow: ["Our approach", "OUR APPROACH"],
    eyebrowTh: ["แนวทางของเรา", "แนวทางการดำเนินงานของเรา"],
    title: ["Built on trust.\nDriven by purpose.", "Reliable Vessel Chartering. Managed from Start to Finish."],
    titleTh: ["สร้างความไว้วางใจ\nขับเคลื่อนด้วยเป้าหมาย", "บริการเช่าเรือที่เชื่อถือได้ พร้อมดูแลการดำเนินงานตั้งแต่ต้นจนจบ"],
    description: ["Every operation starts with understanding your needs. Clear communication and careful planning connect every part of the journey.", ""],
    descriptionTh: [["ทุกการปฏิบัติงานเริ่มต้นจากการเข้าใจความต้องการของคุณ การสื่อสารที่ชัดเจนและการวางแผนอย่างรอบคอบเชื่อมต่อทุกขั้นตอนของการเดินทาง", "ทุกงานเริ่มจากการเข้าใจความต้องการของคุณ การสื่อสารที่ชัดเจนและการวางแผนอย่างรอบคอบช่วยให้ทุกขั้นตอนของการเดินทางเชื่อมโยงกัน"], ""],
  },
  'home-trust-safety': {
    title: ["Safety in focus", "Safety & Reliability"],
    titleTh: ["ใส่ใจความปลอดภัย", "ความปลอดภัยและความน่าเชื่อถือ"],
    description: ["Careful preparation at every stage.", "Safety is central to our vessel operations. We emphasize careful preparation, clear procedures and attentive coordination throughout each operation."],
    descriptionTh: ["เตรียมพร้อมอย่างรอบคอบในทุกขั้นตอน", "ความปลอดภัยคือหัวใจของการปฏิบัติงาน เราให้ความสำคัญกับการเตรียมความพร้อม ขั้นตอนการทำงานที่ชัดเจน และการประสานงานอย่างรอบคอบในทุกภารกิจ"],
  },
  'home-trust-practical': {
    title: ["A practical approach", "Professional Vessel Management"],
    titleTh: [["แนวทางที่ใช้งานได้จริง", "แนวทางที่ทำได้จริง"], "การบริหารจัดการเรืออย่างมืออาชีพ"],
    description: ["Support shaped around your operation.", "We coordinate crew arrangements and day-to-day vessel operations to support each charter and its operational requirements."],
    descriptionTh: ["การสนับสนุนที่เหมาะกับงานของคุณ", "เราดูแลการจัดหาลูกเรือและประสานงานการปฏิบัติงานประจำวันของเรือ เพื่อรองรับความต้องการของการเช่าเรือแต่ละครั้ง"],
  },
  'home-trust-partnerships': {
    title: ["Lasting partnerships", "Trusted Partnerships"],
    titleTh: ["ความร่วมมือระยะยาว", "ความร่วมมือที่ไว้วางใจได้"],
    description: ["Clear communication from start to finish.", "We work closely with our clients and maintain clear communication from planning through voyage completion."],
    descriptionTh: [["สื่อสารอย่างชัดเจนตั้งแต่เริ่มต้นจนจบ", "สื่อสารอย่างชัดเจนตั้งแต่เริ่มต้นจนเสร็จงาน"], "เราทำงานร่วมกับลูกค้าอย่างใกล้ชิด พร้อมสื่อสารอย่างชัดเจนตั้งแต่การวางแผนจนสิ้นสุดการเดินทาง"],
  },
};

type HomeContentIdentity = { type: string; id: string; parentId?: string };
export function hasRevisedHomepageCopy(record: HomeContentIdentity) {
  if (record.id === 'footer') return record.type === 'Section' && record.parentId === 'shared';
  return ((record.type === 'Page' && record.id === 'home') || (record.type === 'Section' && record.parentId === 'home')) && Object.hasOwn(revisedCopy, record.id);
}

/** Update each former default independently so translations and editorial changes survive. */
export function applyHomepageCopy<T extends HomeContentIdentity>(record: T): T {
  if (!hasRevisedHomepageCopy(record)) return record;
  const copy: Partial<Pick<ContentRecord, CopyField>> = {};
  for (const [field, [previous, revised]] of Object.entries(revisedCopy[record.id]) as [CopyField, Revision][]) {
    const current = record[field as keyof T];
    if (typeof current === 'string' && (Array.isArray(previous) ? previous.includes(current) : current === previous)) copy[field] = revised;
  }
  return { ...record, ...copy };
}

export const charterKinds = ['container', 'crane', 'tanker', 'management'] as const;
export type CharterKind = typeof charterKinds[number];
export type HomeCharterCopy = Record<CharterKind, Pick<ContentRecord, 'title' | 'titleTh' | 'description' | 'descriptionTh'>>;

export const defaultHomeCharters: HomeCharterCopy = {
  container: {
    title: 'Container Vessel Chartering', titleTh: 'บริการเช่าเรือคอนเทนเนอร์',
    description: 'Full-vessel chartering for container transportation, with crew arrangements and vessel operations managed by our team.',
    descriptionTh: 'บริการให้เช่าเรือคอนเทนเนอร์ทั้งลำ พร้อมจัดหาลูกเรือและดูแลการบริหารจัดการการปฏิบัติงานบนเรือ',
  },
  crane: {
    title: 'Crane Vessel / Crane Barge Chartering', titleTh: 'บริการเช่าเรือเครนและเรือปั้นจั่นลอยน้ำ',
    description: 'Crane vessel and crane barge chartering, with crew arrangements and vessel operations coordinated by our team.',
    descriptionTh: 'บริการให้เช่าเรือเครนและเรือปั้นจั่นลอยน้ำ พร้อมจัดหาลูกเรือและประสานงานการปฏิบัติงานบนเรือ',
  },
  tanker: {
    title: 'Tanker Vessel Chartering', titleTh: 'บริการเช่าเรือแท็งเกอร์',
    description: 'Full-vessel chartering for tanker operations, supported by crew arrangements and vessel management.',
    descriptionTh: 'บริการให้เช่าเรือแท็งเกอร์ทั้งลำ พร้อมจัดหาลูกเรือและบริหารจัดการเรือ',
  },
  management: {
    title: 'Full Vessel Management', titleTh: 'การบริหารจัดการเรือครบวงจร',
    description: 'Crew coordination and day-to-day vessel operations management throughout the charter period.',
    descriptionTh: 'บริการจัดหาลูกเรือ ประสานงาน และดูแลการบริหารจัดการการปฏิบัติงานบนเรือตลอดระยะเวลาการเช่า',
  },
};
