import type { CmsLocale } from './cms-locale';

/** Field-specific guidance only; these examples are never saved as input values. */
const placeholders = {
  newUsername: { en: '3–40: A–Z, 0–9, . _ -', th: '3–40 ตัว: A–Z, 0–9, . _ -' },
  loginUsername: { en: 'Your CMS username', th: 'ชื่อผู้ใช้ CMS ของคุณ' },
  loginPassword: { en: 'Your CMS password', th: 'รหัสผ่าน CMS ของคุณ' },
  currentPassword: { en: 'Your current password', th: 'รหัสผ่านปัจจุบันของคุณ' },
  newPassword: { en: 'At least 14 characters', th: 'อย่างน้อย 14 ตัวอักษร' },
  confirmPassword: { en: 'Re-enter the new password', th: 'กรอกรหัสผ่านใหม่อีกครั้ง' },
  bannerDescriptionEn: { en: 'Describe the banner in English', th: 'อธิบายภาพแบนเนอร์เป็นภาษาอังกฤษ' },
  bannerDescriptionTh: { en: 'Describe the banner in Thai', th: 'อธิบายภาพแบนเนอร์เป็นภาษาไทย' },
  recipientEmail: { en: 'e.g. alerts@example.com', th: 'เช่น alerts@example.com' },
  transferUsage: { en: 'Usage in GB', th: 'ปริมาณที่ใช้ (GB)' },
  requestUsage: { en: 'Total requests', th: 'จำนวนคำขอทั้งหมด' },
  reportingPeriod: { en: 'e.g. 1–30 September', th: 'เช่น 1–30 กันยายน' },
  storageAllowance: { en: 'Allowance in MiB', th: 'โควตาหน่วย MiB' },
  transferAllowance: { en: 'Allowance in GB', th: 'โควตาหน่วย GB' },
  requestAllowance: { en: 'Allowed request count', th: 'จำนวนคำขอที่อนุญาต' },
  companyNameEn: { en: 'Company name in English', th: 'ชื่อบริษัทภาษาอังกฤษ' },
  companyNameTh: { en: 'Company name in Thai', th: 'ชื่อบริษัทภาษาไทย' },
  officeAddressEn: { en: 'Full office address in English', th: 'ที่อยู่สำนักงานภาษาอังกฤษ' },
  officeAddressTh: { en: 'Full office address in Thai', th: 'ที่อยู่สำนักงานภาษาไทย' },
  publicPhone: { en: 'Phone with country code', th: 'เบอร์โทรพร้อมรหัสประเทศ' },
  publicEmail: { en: 'e.g. contact@example.com', th: 'เช่น contact@example.com' },
  officeMap: { en: 'Paste the office map HTTPS link', th: 'วางลิงก์ HTTPS ของแผนที่สำนักงาน' },
  imageName: { en: 'e.g. Cargo vessel at port', th: 'เช่น เรือสินค้าที่ท่าเรือ' },
} satisfies Record<string, Record<CmsLocale, string>>;

export type CmsInputPlaceholder = keyof typeof placeholders;
export function cmsInputPlaceholder(locale: CmsLocale, field: CmsInputPlaceholder) {
  return placeholders[field][locale];
}
