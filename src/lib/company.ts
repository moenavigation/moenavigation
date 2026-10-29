import type { Locale } from './content';

export const companyNameEn = 'Moe Navigation Co.,Ltd.';
export const companyNameTh = 'บริษัท โม เนวิเกชั่น จำกัด';
export function companyName(locale: Locale) {
  return locale === 'th' ? companyNameTh : companyNameEn;
}
