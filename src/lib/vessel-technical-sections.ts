export const technicalSections = [
  { key: 'construction', keyTh: 'constructionTh', en: 'Construction and class', th: 'การต่อเรือและชั้นเรือ' },
  { key: 'machinery', keyTh: 'machineryTh', en: 'Machinery', th: 'เครื่องจักร' },
  { key: 'performance', keyTh: 'performanceTh', en: 'Speed and consumption', th: 'ความเร็วและอัตราสิ้นเปลือง' },
  { key: 'tankCapacities', keyTh: 'tankCapacitiesTh', en: 'Tank capacities', th: 'ความจุถัง' },
  { key: 'cargoHandling', keyTh: 'cargoHandlingTh', en: 'Cargo handling equipment', th: 'อุปกรณ์ขนถ่ายสินค้า' },
  { key: 'loadLines', keyTh: 'loadLinesTh', en: 'Load lines and hull particulars', th: 'แนวบรรทุกและรายละเอียดตัวเรือ' },
  { key: 'mooringSafety', keyTh: 'mooringSafetyTh', en: 'Mooring and safety equipment', th: 'อุปกรณ์ผูกเรือและความปลอดภัย' },
] as const;

export type TechnicalTextField = (typeof technicalSections)[number]['key' | 'keyTh'];
export const technicalTextLimit = 2000;
