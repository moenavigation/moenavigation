export type Locale = "th" | "en";
export type Bilingual = { en: string; th: string };
export function local(locale: Locale, en: string, th: string) { return locale === "en" ? en : th; }
export function href(locale: Locale, path = "") { return `${locale === "en" ? "/en" : ""}${path ? `/${path.replace(/^\/+/, "")}` : ""}` || "/"; }
export const navigation = [
  { id: "", title: { en: "Home", th: "หน้าหลัก" } },
  { id: "about", title: { en: "About us", th: "เกี่ยวกับเรา" } },
  { id: "services", title: { en: "Services", th: "บริการ" } },
  { id: "fleet", title: { en: "Fleet", th: "กองเรือ" } },
  { id: "routes", title: { en: "Routes", th: "เส้นทาง" } },
  { id: "projects", title: { en: "Projects", th: "โครงการ" } },
  { id: "news", title: { en: "News", th: "ข่าวสาร" } },
];
export const services = [
  { id: "vessel-services", title: { en: "Vessel services", th: "บริการเรือ" }, description: { en: "Dependable support for your vessels and marine operations.", th: "การสนับสนุนเรือและการปฏิบัติงานทางทะเลอย่างเป็นระบบ" }, image: "/images/container-vessel.webp", icon: "Ship" },
  { id: "bunkering", title: { en: "Bunkering", th: "บริการเชื้อเพลิงเรือ" }, description: { en: "Coordinated marine fuel supply, at sea and in port.", th: "ประสานงานจัดหาเชื้อเพลิงสำหรับเรือทั้งในท่าเรือและในทะเล" }, image: "/images/bunkering.webp", icon: "Fuel" },
  { id: "logistics-support", title: { en: "Logistics support", th: "สนับสนุนโลจิสติกส์" }, description: { en: "Connected cargo planning from port to destination.", th: "วางแผนและประสานงานขนส่งสินค้าจากท่าเรือถึงปลายทาง" }, image: "/images/logistics.webp", icon: "Container" },
  { id: "ship-management", title: { en: "Ship management", th: "บริหารจัดการเรือ" }, description: { en: "Careful planning for your vessel, crew and operations.", th: "วางแผนการดูแลเรือ ลูกเรือ และการปฏิบัติงาน" }, image: "/images/bridge.webp", icon: "Anchor" },
  { id: "marine-consulting", title: { en: "Marine consulting", th: "ที่ปรึกษาทางทะเล" }, description: { en: "Practical guidance for maritime projects and decisions.", th: "คำแนะนำสำหรับการวางแผนและตัดสินใจในโครงการทางทะเล" }, image: "/images/consulting.webp", icon: "Compass" },
  { id: "marine-support", title: { en: "Marine support", th: "สนับสนุนงานทางทะเล" }, description: { en: "Support shaped around your marine requirements.", th: "การสนับสนุนที่ปรับให้เหมาะกับความต้องการของงานทางทะเล" }, image: "/images/tugboat.webp", icon: "LifeBuoy" },
] as const;
export const vessels = [
  { id: "ranong-moe", name: "RANONG MOE", type: "Container", image: "/images/container-vessel.webp", description: { en: "A container vessel concept for regional cargo operations.", th: "ตัวอย่างเรือบรรทุกตู้คอนเทนเนอร์สำหรับการขนส่งในภูมิภาค" } },
  { id: "moe-line-2", name: "MOE LINE 2", type: "Container", image: "/images/port.webp", description: { en: "A regional container transport concept.", th: "ตัวอย่างเรือขนส่งตู้คอนเทนเนอร์ในภูมิภาค" } },
  { id: "moe-line-3", name: "MOE LINE 3", type: "Tanker", image: "/images/tanker.webp", description: { en: "A marine tanker concept for liquid cargo.", th: "ตัวอย่างเรือบรรทุกสินค้าของเหลว" } },
  { id: "moe-line-5", name: "MOE LINE 5", type: "Container", image: "/images/vessel-deck.webp", description: { en: "A container vessel concept with flexible cargo planning.", th: "ตัวอย่างเรือบรรทุกตู้คอนเทนเนอร์สำหรับการวางแผนขนส่ง" } },
  { id: "moe-line-6", name: "MOE LINE 6", type: "Tanker", image: "/images/bunkering.webp", description: { en: "A fuel supply vessel concept.", th: "ตัวอย่างเรือสนับสนุนการจัดหาเชื้อเพลิง" } },
  { id: "moe-line-7", name: "MOE LINE 7", type: "Crane", image: "/images/crane.webp", description: { en: "A heavy lift and marine project concept.", th: "ตัวอย่างงานยกสินค้าหนักและโครงการทางทะเล" } },
] as const;
export const projects = [
  { id: "bunkering-operation", title: { en: "Bunkering operation", th: "ปฏิบัติการเติมเชื้อเพลิง" }, description: { en: "Coordinating fuel supply alongside a vessel in port.", th: "ประสานงานจัดหาเชื้อเพลิงให้เรือภายในท่าเรือ" }, image: "/images/bunkering.webp", category: "Bunkering" },
  { id: "port-operation-support", title: { en: "Port operation support", th: "สนับสนุนปฏิบัติการท่าเรือ" }, description: { en: "Connecting vessel movements, cargo handling and port teams.", th: "ประสานการเคลื่อนย้ายเรือ การจัดการสินค้า และทีมงานท่าเรือ" }, image: "/images/port.webp", category: "Container" },
  { id: "logistics-project", title: { en: "Logistics project", th: "โครงการโลจิสติกส์" }, description: { en: "Planning the connections between sea and land transport.", th: "วางแผนเชื่อมต่อการขนส่งทางทะเลและทางบก" }, image: "/images/logistics.webp", category: "Container" },
  { id: "vessel-charter", title: { en: "Vessel charter", th: "เช่าเหมาลำเรือ" }, description: { en: "A coordinated approach to project cargo requirements.", th: "แนวทางการประสานงานสำหรับความต้องการขนส่งสินค้า" }, image: "/images/tanker.webp", category: "Tanker" },
  { id: "crane-operation", title: { en: "Crane operation", th: "ปฏิบัติการยกสินค้า" }, description: { en: "Careful lift planning for industrial cargo.", th: "วางแผนยกสินค้าอุตสาหกรรมอย่างรอบคอบ" }, image: "/images/crane.webp", category: "Others" },
  { id: "marine-support", title: { en: "Marine support", th: "สนับสนุนงานทางทะเล" }, description: { en: "Harbor support for vessel arrival and departure.", th: "สนับสนุนเรือระหว่างการเข้าและออกจากท่าเรือ" }, image: "/images/tugboat.webp", category: "Others" },
] as const;
export const news = [
  { id: "connected-ports", title: { en: "Connecting ports. Creating possibilities.", th: "เชื่อมต่อท่าเรือ สร้างโอกาสใหม่" }, description: { en: "Explore how coordinated port planning supports a smoother cargo journey.", th: "เรียนรู้ว่าการวางแผนท่าเรือช่วยให้การขนส่งสินค้าราบรื่นขึ้นได้อย่างไร" }, image: "/images/container-deck-detail.webp", category: "Industry insights", date: "2026-10-01" },
  { id: "planning-a-voyage", title: { en: "What goes into planning a voyage?", th: "การวางแผนการเดินเรือต้องคำนึงถึงอะไร" }, description: { en: "A closer look at the people and preparation behind marine operations.", th: "ทำความรู้จักทีมงานและการเตรียมพร้อมเบื้องหลังการปฏิบัติงานทางทะเล" }, image: "/images/bridge.webp", category: "Articles", date: "2026-09-24" },
  { id: "maritime-partnerships", title: { en: "Maritime support, built around you.", th: "การสนับสนุนทางทะเลที่เข้าใจคุณ" }, description: { en: "A preview of the services and capabilities on our new website.", th: "ตัวอย่างบริการและความสามารถบนเว็บไซต์ใหม่ของเรา" }, image: "/images/consulting.webp", category: "Company news", date: "2026-09-18" },
] as const;
