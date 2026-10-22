import type { Locale } from "./content";

const thaiCategoryNames: Record<string, string> = {
  All: "ทั้งหมด",
  Container: "เรือคอนเทนเนอร์",
  Tanker: "เรือบรรทุกน้ำมัน",
  Crane: "เครน",
  Bunkering: "เติมเชื้อเพลิง",
  Others: "อื่น ๆ",
  "Company News": "ข่าวบริษัท",
  "Company news": "ข่าวบริษัท",
  "Industry News": "ข่าวอุตสาหกรรม",
  "Industry insights": "มุมมองอุตสาหกรรม",
  Articles: "บทความ",
  Company: "บริษัท",
  Industry: "อุตสาหกรรม",
};

export function categoryName(locale: Locale, category: string, categoryTh?: string): string {
  return locale === "th" ? categoryTh?.trim() || thaiCategoryNames[category] || category : category;
}
