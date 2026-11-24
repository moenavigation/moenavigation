import type { Locale } from './content';

export const companyNameEn = 'Moe Navigation Co.,Ltd.';
export const companyNameTh = 'บริษัท โม เนวิเกชั่น จำกัด';
export const companyPhone = '+66 2 427-5905';

export function formatCompanyPhone(phone = companyPhone) {
  const digits = phone.replace(/[+().\s-]/g, '');
  return /^(?:0|(?:00)?660?)24275905$/.test(digits) ? companyPhone : phone;
}

export function companyName(locale: Locale) {
  return locale === 'th' ? companyNameTh : companyNameEn;
}
