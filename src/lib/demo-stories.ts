import type { Bilingual } from "./content";

type DemoStory = {
  heading: Bilingual;
  paragraphs: [Bilingual, Bilingual];
};

// These editorial examples explain each demo card without claiming that MOE
// Navigation completed a project or published an official company update.
export const demoStories: Record<string, DemoStory> = {
  "projects/bunkering-operation": {
    heading: { en: "Planning a fuel transfer", th: "วางแผนการส่งมอบเชื้อเพลิง" },
    paragraphs: [
      { en: "In this example, a fuel request begins with the vessel's requirements, berth or anchorage, and preferred delivery window. Those details help the teams discuss a workable sequence before any transfer is arranged.", th: "ในตัวอย่างนี้ การขอรับเชื้อเพลิงเริ่มจากความต้องการของเรือ ตำแหน่งเทียบท่าหรือทอดสมอ และช่วงเวลาที่ต้องการส่งมอบ ข้อมูลเหล่านี้ช่วยให้ทุกฝ่ายหารือลำดับงานก่อนจัดการส่งมอบจริง" },
      { en: "Supplier availability, procedures and final timing would need confirmation for a real operation.", th: "สำหรับงานจริง ยังต้องยืนยันผู้จัดหา ขั้นตอนปฏิบัติ และช่วงเวลาดำเนินงานอีกครั้ง" },
    ],
  },
  "projects/port-operation-support": {
    heading: { en: "Coordinating a port call", th: "ประสานงานการเข้าเทียบท่า" },
    paragraphs: [
      { en: "A port call connects vessel movements, berth planning and cargo handling. This sample scenario shows why a shared view of arrival times and responsibilities can make each handoff clearer.", th: "การเข้าเทียบท่าเกี่ยวข้องกับการเคลื่อนย้ายเรือ การจัดท่า และการขนถ่ายสินค้า ตัวอย่างนี้แสดงให้เห็นว่าการทราบเวลาเข้าท่าและหน้าที่ของแต่ละฝ่ายช่วยให้การส่งต่องานชัดเจนขึ้น" },
      { en: "The actual port, participating teams and service scope would be defined for each enquiry.", th: "ท่าเรือ ทีมงานที่เกี่ยวข้อง และขอบเขตบริการจริงจะกำหนดตามคำขอแต่ละงาน" },
    ],
  },
  "projects/logistics-project": {
    heading: { en: "Connecting sea and land", th: "เชื่อมการขนส่งทางทะเลและทางบก" },
    paragraphs: [
      { en: "This example follows the handoff from vessel arrival to onward transport. Cargo details, documents and collection timing all shape a practical plan.", th: "ตัวอย่างนี้มองการส่งต่อสินค้าจากเรือไปยังการขนส่งต่อ ข้อมูลสินค้า เอกสาร และเวลารับสินค้าล้วนมีผลต่อแผนที่ใช้งานได้จริง" },
      { en: "Routes, partners and schedules shown in a future project record should come from verified operational data.", th: "เส้นทาง พันธมิตร และกำหนดการในข้อมูลโครงการจริงควรมาจากข้อมูลการปฏิบัติงานที่ตรวจสอบแล้ว" },
    ],
  },
  "projects/vessel-charter": {
    heading: { en: "Matching a vessel to the task", th: "เลือกเรือให้เหมาะกับงาน" },
    paragraphs: [
      { en: "A charter discussion starts with the cargo, expected route, timing and vessel requirements. This concept illustrates the questions to settle before commercial terms can be considered.", th: "การหารือเช่าเหมาลำเริ่มจากสินค้า เส้นทาง ช่วงเวลา และคุณสมบัติของเรือ ตัวอย่างนี้แสดงประเด็นที่ควรตกลงก่อนพิจารณาเงื่อนไขทางการค้า" },
      { en: "No vessel availability, capacity or charter offer is represented by this demo entry.", th: "รายการตัวอย่างนี้ไม่ได้ยืนยันความพร้อมเรือ ความจุ หรือข้อเสนอเช่าเหมาลำ" },
    ],
  },
  "projects/crane-operation": {
    heading: { en: "Preparing for a marine lift", th: "เตรียมงานยกสินค้าทางทะเล" },
    paragraphs: [
      { en: "A lift plan depends on load dimensions, weight, rigging, access and local conditions. The illustration highlights the need to coordinate those inputs before equipment is selected.", th: "แผนยกสินค้าขึ้นอยู่กับขนาด น้ำหนัก อุปกรณ์ยึดโยง การเข้าถึง และสภาพพื้นที่ ภาพตัวอย่างนี้ชี้ให้เห็นความสำคัญของการประสานข้อมูลก่อนเลือกอุปกรณ์" },
      { en: "Engineering review, safety controls and the final method would be specific to a verified job.", th: "การตรวจสอบทางวิศวกรรม มาตรการความปลอดภัย และวิธีดำเนินงานจริงต้องกำหนดตามงานที่ได้รับการยืนยัน" },
    ],
  },
  "projects/marine-support": {
    heading: { en: "Supporting a smooth harbor movement", th: "สนับสนุนการเคลื่อนย้ายเรือในท่า" },
    paragraphs: [
      { en: "Arrival and departure planning can involve berth windows, harbor conditions and several service teams. This example presents the value of a clear shared plan.", th: "การวางแผนเรือเข้าและออกจากท่าอาจเกี่ยวข้องกับช่วงเวลาเทียบท่า สภาพพื้นที่ และหลายทีมบริการ ตัวอย่างนี้นำเสนอประโยชน์ของแผนงานที่ทุกฝ่ายเข้าใจตรงกัน" },
      { en: "Specific harbor services and operational responsibilities would be confirmed before any real movement.", th: "บริการในท่าเรือและหน้าที่รับผิดชอบจริงต้องได้รับการยืนยันก่อนดำเนินงาน" },
    ],
  },
  "news/connected-ports": {
    heading: { en: "Why port handoffs matter", th: "ทำไมการส่งต่องานในท่าเรือจึงสำคัญ" },
    paragraphs: [
      { en: "A cargo journey rarely ends when a vessel reaches the berth. Terminal handling, documents and onward transport need to fit together so the next team has the information it needs.", th: "การขนส่งสินค้าไม่ได้สิ้นสุดเมื่อเรือถึงท่า การขนถ่าย เอกสาร และการขนส่งต่อควรเชื่อมกัน เพื่อให้ทีมถัดไปมีข้อมูลที่จำเป็น" },
      { en: "This is a sample industry explainer for the website preview, rather than a report about a specific port or completed company operation.", th: "นี่คือบทความอธิบายอุตสาหกรรมสำหรับเว็บไซต์ตัวอย่าง ไม่ใช่รายงานเกี่ยวกับท่าเรือแห่งใดหรือผลงานของบริษัท" },
    ],
  },
  "news/planning-a-voyage": {
    heading: { en: "A voyage starts before departure", th: "การเดินเรือเริ่มก่อนออกจากท่า" },
    paragraphs: [
      { en: "A useful voyage plan considers the vessel, cargo, destination, weather and port arrangements together. Clear communication helps teams revisit the plan when conditions change.", th: "แผนการเดินเรือที่เหมาะสมควรพิจารณาเรือ สินค้า ปลายทาง สภาพอากาศ และการจัดการท่าเรือร่วมกัน การสื่อสารที่ชัดเจนช่วยให้ทีมทบทวนแผนเมื่อสถานการณ์เปลี่ยน" },
      { en: "This educational preview does not provide navigation instructions or describe a scheduled MOE Navigation voyage.", th: "บทความตัวอย่างเพื่อการเรียนรู้นี้ไม่ใช่คำแนะนำด้านการนำทางหรือข้อมูลเที่ยวเรือที่กำหนดไว้ของ MOE Navigation" },
    ],
  },
  "news/maritime-partnerships": {
    heading: { en: "A clearer way to explore maritime services", th: "สำรวจบริการทางทะเลได้ชัดเจนขึ้น" },
    paragraphs: [
      { en: "This website preview brings example services, vessels and regional connections into one place. Each page is designed to help a visitor describe what they need before a direct conversation.", th: "เว็บไซต์ตัวอย่างนี้รวบรวมบริการ เรือ และการเชื่อมต่อในภูมิภาคไว้ในที่เดียว แต่ละหน้าช่วยให้ผู้เยี่ยมชมอธิบายความต้องการก่อนพูดคุยกับทีมงาน" },
      { en: "Company capabilities, fleet details and contact channels will be updated when verified information is supplied.", th: "ความสามารถของบริษัท รายละเอียดกองเรือ และช่องทางติดต่อจะปรับปรุงเมื่อได้รับข้อมูลที่ผ่านการยืนยัน" },
    ],
  },
};
