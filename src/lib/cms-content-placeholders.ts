import type { ContentType } from './cms-types';

type Language = 'en' | 'th';
type Hint = Record<Language, string>;

const titles: Record<ContentType, Hint> = {
  Page: { en: 'Page heading', th: 'หัวข้อหลักของหน้า' },
  Section: { en: 'Section heading', th: 'หัวข้อของส่วนนี้' },
  Service: { en: 'Service name', th: 'ชื่อบริการ' },
  Vessel: { en: 'Vessel name', th: 'ชื่อเรือ' },
  Project: { en: 'Project title', th: 'ชื่อโครงการ' },
  News: { en: 'News headline', th: 'หัวข้อข่าว' },
  Route: { en: 'Route name', th: 'ชื่อเส้นทาง' },
};

const summaries: Record<ContentType, Hint> = {
  Page: { en: 'Short introduction to this page', th: 'ข้อความแนะนำหน้านี้แบบสั้น ๆ' },
  Section: { en: 'Briefly describe this section', th: 'สรุปเนื้อหาของส่วนนี้สั้น ๆ' },
  Service: { en: 'Briefly describe this service', th: 'สรุปรายละเอียดบริการสั้น ๆ' },
  Vessel: { en: 'Briefly describe this vessel', th: 'สรุปรายละเอียดเรือสั้น ๆ' },
  Project: { en: 'Briefly describe this project', th: 'สรุปรายละเอียดโครงการสั้น ๆ' },
  News: { en: 'Summarize the main news', th: 'สรุปสาระสำคัญของข่าว' },
  Route: { en: 'Briefly describe this connection', th: 'สรุปรายละเอียดเส้นทางสั้น ๆ' },
};

const hints = {
  bodyHeading: { en: 'Heading for the detailed content', th: 'หัวข้อสำหรับเนื้อหารายละเอียด' },
  body: { en: 'Add details in short paragraphs', th: 'เพิ่มรายละเอียด แบ่งเป็นย่อหน้าสั้น ๆ' },
  eyebrow: { en: 'Short label above the heading', th: 'ข้อความสั้น ๆ เหนือหัวข้อหลัก' },
  caption: { en: 'Short caption for this image', th: 'คำบรรยายใต้ภาพสั้น ๆ' },
  imageAlt: { en: 'Describe what this image shows', th: 'อธิบายสิ่งที่ปรากฏในภาพ' },
  vesselType: { en: 'Vessel type or class', th: 'ประเภทหรือชนิดเรือ' },
  projectCategory: { en: 'Project category', th: 'หมวดหมู่โครงการ' },
  newsCategory: { en: 'News category', th: 'หมวดหมู่ข่าว' },
  imo: { en: '7-digit ship number', th: 'เลขประจำเรือ 7 หลัก' },
  yearBuilt: { en: '4-digit year (AD)', th: 'ปี ค.ศ. 4 หลัก' },
  lengthM: { en: 'Length in metres', th: 'ความยาวเป็นเมตร' },
  lbpM: { en: 'Distance in metres', th: 'ระยะเป็นเมตร' },
  craneSwlT: { en: 'Safe lifting capacity in tonnes', th: 'พิกัดยกที่ปลอดภัยเป็นตัน' },
  cargoVolumeM3: { en: 'Volume in cubic metres', th: 'ปริมาตรเป็นลูกบาศก์เมตร' },
  cargoTanks: { en: 'Number of tanks', th: 'จำนวนถัง' },
  beamM: { en: 'Width in metres', th: 'ความกว้างเป็นเมตร' },
  depthM: { en: 'Hull depth in metres', th: 'ความลึกตัวเรือเป็นเมตร' },
  draftM: { en: 'Draft in metres', th: 'ระยะกินน้ำลึกเป็นเมตร' },
  deadweightT: { en: 'Deadweight in tonnes', th: 'น้ำหนักบรรทุกเป็นตัน' },
  capacityTeu: { en: 'Whole TEU count', th: 'จำนวน TEU เต็มหน่วย' },
  reeferPlugs: { en: 'Whole reefer plug count', th: 'จำนวนจุดจ่ายไฟตู้เย็นเต็มหน่วย' },
  grossTonnage: { en: 'Gross tonnage', th: 'ค่าระวางตันกรอส' },
  netTonnage: { en: 'Net tonnage', th: 'ค่าระวางตันเนต' },
  cargoCapacityT: { en: 'Cargo capacity in tonnes', th: 'น้ำหนักสินค้าที่บรรทุกได้เป็นตัน' },
  flag: { en: 'Country of registry', th: 'ประเทศที่จดทะเบียนเรือ' },
  availability: { en: 'Current availability statement', th: 'ข้อความระบุความพร้อมของเรือ' },
  galleryAlt: { en: 'Describe this vessel photo', th: 'อธิบายภาพเรือภาพนี้' },
  distanceNm: { en: 'Distance in nautical miles', th: 'ระยะทางเป็นไมล์ทะเล' },
  capacityMinTeu: { en: 'Minimum whole TEU count', th: 'จำนวน TEU ต่ำสุดเต็มหน่วย' },
  capacityMaxTeu: { en: 'Maximum whole TEU count', th: 'จำนวน TEU สูงสุดเต็มหน่วย' },
  sailingMinHours: { en: 'Shortest sailing time in hours', th: 'เวลาเดินเรือน้อยที่สุดเป็นชั่วโมง' },
  sailingMaxHours: { en: 'Longest sailing time in hours', th: 'เวลาเดินเรือมากที่สุดเป็นชั่วโมง' },
  originName: { en: 'Origin port name', th: 'ชื่อท่าเรือต้นทาง' },
  originCountry: { en: 'Origin country', th: 'ประเทศต้นทาง' },
  destinationName: { en: 'Destination port name', th: 'ชื่อท่าเรือปลายทาง' },
  destinationCountry: { en: 'Destination country', th: 'ประเทศปลายทาง' },
  latitude: { en: 'e.g. 13.0865', th: 'เช่น 13.0865' },
  longitude: { en: 'e.g. 100.8946', th: 'เช่น 100.8946' },
  googleMapsLink: { en: 'Paste a Google Maps pin link', th: 'วางลิงก์หมุดจาก Google Maps' },
} satisfies Record<string, Hint>;

/** Content hints follow the field language; operational hints use the CMS locale. */
export function cmsContentPlaceholder(field: keyof typeof hints | 'title' | 'description', language: Language, type: ContentType = 'Page') {
  if (field === 'title') return titles[type][language];
  if (field === 'description') return summaries[type][language];
  return hints[field][language];
}
