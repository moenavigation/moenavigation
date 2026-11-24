import type { CurrentPdfVesselParticular } from './current-pdf-vessel-plan';

// ML 5 and ML 6 each repeat BUILT with an unqualified 2008. The first row
// gives the build country and matches the earlier particulars: 2009 and 2006.
const containerMachinery = {
  machinery: [
    'Main engines — 2 × Cummins KTA 19M, 500 hp each.',
    'Generator 1 — Hino EK100, 350 hp, 150 kVA.',
    'Generator 2 — Hino EH700, 168 hp, 60 kVA.',
  ].join('\n'),
  machineryTh: [
    'เครื่องยนต์หลัก Cummins KTA 19M จำนวน 2 เครื่อง กำลังเครื่องละ 500 hp',
    'เครื่องกำเนิดไฟฟ้าที่ 1 ใช้ Hino EK100 กำลัง 350 hp ขนาด 150 kVA',
    'เครื่องกำเนิดไฟฟ้าที่ 2 ใช้ Hino EH700 กำลัง 168 hp ขนาด 60 kVA',
  ].join('\n'),
  performance: [
    'Speed — 7 knots.',
    'Main engine consumption — 65 L/h at 1,100 rpm.',
    'Generator consumption — 13 L/h for generator 1 and 9 L/h for generator 2.',
  ].join('\n'),
  performanceTh: [
    'ความเร็ว 7 นอต',
    'อัตราสิ้นเปลืองของเครื่องยนต์หลัก 65 ลิตร/ชม. ที่ 1,100 รอบ/นาที',
    'อัตราสิ้นเปลืองของเครื่องกำเนิดไฟฟ้าที่ 1 และ 2 เท่ากับ 13 และ 9 ลิตร/ชม. ตามลำดับ',
  ].join('\n'),
};

export const currentPdfVesselParticulars: readonly CurrentPdfVesselParticular[] = [
  {
    id: 'moe-line-4', expectedTitle: 'MOE LINE 4', expectedCategory: 'Crane',
    sourceFile: 'ML 4 - PARTICULAR.pdf', sourceSha256: 'a400759d197caa3dc97fb73ec174b673fa02a8492625c430af00f08fec78255a',
    specs: {
      officialNumber: '4800-00377', yearBuilt: 1988, flag: 'Thailand', flagTh: 'ไทย',
      lengthM: 55, beamM: 19, depthM: 4, tonnageBasis: 'register', grossTonnage: 1329, craneSwlT: 200,
      designType: 'Non-self-propelled floating crane barge', designTypeTh: 'เรือบาร์จเครนลอยน้ำ ไม่มีระบบขับเคลื่อนในตัว',
      construction: 'Class — TG.\nBuilt in Japan.',
      constructionTh: 'ชั้นเรือ TG\nต่อในประเทศญี่ปุ่น',
      machinery: 'Crane engine — Mitsubishi S6A2 MPTA, 470 PS.\nGenerators — 2 × Airman SDG 125 S, 235 kVA each.',
      machineryTh: 'เครื่องยนต์เครน Mitsubishi S6A2 MPTA กำลัง 470 PS\nเครื่องกำเนิดไฟฟ้า Airman SDG 125 S จำนวน 2 เครื่อง ขนาดเครื่องละ 235 kVA',
      cargoHandling: 'Revolving crane — Sumitomo SG1500 HDS.',
      cargoHandlingTh: 'เครนชนิดหมุน รุ่น Sumitomo SG1500 HDS',
      mooringSafety: 'Four anchor points and four winches.',
      mooringSafetyTh: 'จุดยึดสมอ 4 จุด และกว้าน 4 ตัว',
    },
  },
  {
    id: 'moe-line-5', expectedTitle: 'MOE LINE 5', expectedCategory: 'Container',
    sourceFile: 'ML 5 - PARTICULAR.pdf', sourceSha256: 'cd5732dae3929825c63b492d37158cb4e98f64ef78a714ed2577b3d48d066757',
    specs: {
      imo: '1042457', officialNumber: '670000335', callSign: 'HSB9161', mmsi: '567003250', yearBuilt: 2009, flag: 'Thailand', flagTh: 'ไทย',
      lengthM: 49.98, lbpM: 40.716, beamM: 14.8, depthM: 4.92, draftM: 3.52, capacityTeu: 120, reeferPlugs: 4,
      tonnageBasis: 'register', grossTonnage: 1163, netTonnage: 651, deadweightT: 1800, cargoCapacityT: 1750,
      designType: 'Coastal container vessel', designTypeTh: 'เรือคอนเทนเนอร์ชายฝั่ง',
      construction: 'Class — TG (Dangerous Good).\nBuilt in China.',
      constructionTh: 'ชั้นเรือ TG (สินค้าอันตราย)\nต่อในประเทศจีน',
      ...containerMachinery,
      tankCapacities: 'Bunker fuel — 50.378 m³.\nFresh water — 48.698 m³.\nBallast — 490.874 m³.',
      tankCapacitiesTh: 'น้ำมันเชื้อเพลิง 50.378 ม³\nน้ำจืด 48.698 ม³\nน้ำอับเฉา 490.874 ม³',
    },
  },
  {
    id: 'moe-line-6', expectedTitle: 'MOE LINE 6', expectedCategory: 'Container',
    sourceFile: 'ML 6 - PARTICULAR.pdf', sourceSha256: 'd2da038d57f9bf3de1205e273ccd2d14a5a8bbc0dc56aaa65bd0b605c0b3bd92',
    specs: {
      imo: '1042469', officialNumber: '670000953', callSign: 'HSB9157', mmsi: '567003240', yearBuilt: 2006, flag: 'Thailand', flagTh: 'ไทย',
      lengthM: 49.98, lbpM: 47.8, beamM: 14.8, depthM: 4.62, draftM: 3.35, capacityTeu: 120, reeferPlugs: 4,
      tonnageBasis: 'register', grossTonnage: 1047, netTonnage: 592, deadweightT: 1800, cargoCapacityT: 1750,
      designType: 'Local-trade container vessel', designTypeTh: 'เรือคอนเทนเนอร์สำหรับการขนส่งภายในประเทศ',
      construction: 'Class — TG.\nDangerous goods accepted in accordance with the IMDG Code.\nBuilt in China.',
      constructionTh: 'ชั้นเรือ TG\nรับสินค้าอันตรายตามข้อกำหนดของ IMDG Code\nต่อในประเทศจีน',
      ...containerMachinery,
      tankCapacities: 'Bunker fuel — 26.224 m³.\nFresh water — 27.40 m³.\nBallast — 492.328 m³.',
      tankCapacitiesTh: 'น้ำมันเชื้อเพลิง 26.224 ม³\nน้ำจืด 27.40 ม³\nน้ำอับเฉา 492.328 ม³',
    },
  },
  {
    id: 'dumai-moe', expectedTitle: 'DUMAI MOE', expectedCategory: 'Tanker',
    sourceFile: 'DMM - PARTICULAR.pdf', sourceSha256: 'c2d19f5fd3d1b5b337f195f94e051bd29e9fa4f07d8743a213a19b7c154956eb',
    specs: {
      imo: '9190975', officialNumber: '5900-02275', callSign: 'HSB 5602', mmsi: '567529000', yearBuilt: 1998, flag: 'Thailand', flagTh: 'ไทย',
      lengthM: 92, lbpM: 84.9, beamM: 14.02, depthM: 6.8, draftM: 5.612,
      tonnageBasis: 'international', grossTonnage: 2487, netTonnage: 909, deadweightT: 3526, cargoVolumeM3: 3330, cargoTanks: 10,
      designType: 'Oil/chemical tanker', designTypeTh: 'เรือบรรทุกน้ำมันและสารเคมี',
      construction: [
        'Double hull and double bottom.',
        'Class — TG Class (Oil/Chemical Tanker IMO II ESP), unrestricted navigation (A1+A2+A3).',
        'Port of registry — Bangkok.',
        'Built on 28 May 1998 by Kyoei Shipbuilding Co., Ltd.',
      ].join('\n'),
      constructionTh: [
        'ตัวเรือสองชั้นและท้องเรือสองชั้น',
        'ชั้นเรือ TG Class (Oil/Chemical Tanker IMO II ESP) เดินเรือไม่จำกัดเขต (A1+A2+A3)',
        'เมืองท่าจดทะเบียน กรุงเทพมหานคร',
        'ต่อโดย Kyoei Shipbuilding Co., Ltd. เมื่อวันที่ 28 พฤษภาคม ค.ศ. 1998',
      ].join('\n'),
      machinery: 'Main engine — Akasaka A-38 diesel, 2,800 PS (2,059 kW) at 240 rpm.\nDiesel generators — 2 × S6B3-MPTA, 360 PS at 1,200 rpm each.',
      machineryTh: 'เครื่องยนต์หลักดีเซล Akasaka A-38 กำลัง 2,800 PS (2,059 kW) ที่ 240 รอบ/นาที\nเครื่องกำเนิดไฟฟ้าดีเซล S6B3-MPTA จำนวน 2 เครื่อง กำลังเครื่องละ 360 PS ที่ 1,200 รอบ/นาที',
      performance: 'Maximum sea speed — 10 knots loaded and 10.5 knots in ballast.',
      performanceTh: 'ความเร็วสูงสุดในทะเล 10 นอตเมื่อบรรทุกสินค้า และ 10.5 นอตเมื่อถ่วงน้ำอับเฉา',
      tankCapacities: [
        'Ballast — 1,500.98 m³ across 10 tanks.',
        'Fresh water — cleaning tank 268.78 m³, APT 94.54 m³ and drinking water 31.84 m³.',
        'Low-sulphur fuel oil — 273.23 m³. Diesel oil — 64.98 m³.',
        'Lubricating oil — 5.35 m³. Cylinder oil — 4.53 m³.',
      ].join('\n'),
      tankCapacitiesTh: [
        'น้ำอับเฉา 10 ถัง ความจุรวม 1,500.98 ม³',
        'น้ำจืดสำหรับทำความสะอาด 268.78 ม³ ถัง APT 94.54 ม³ และน้ำดื่ม 31.84 ม³',
        'น้ำมันเตากำมะถันต่ำ 273.23 ม³ และน้ำมันดีเซล 64.98 ม³',
        'น้ำมันหล่อลื่น 5.35 ม³ และน้ำมันกระบอกสูบ 4.53 ม³',
      ].join('\n'),
      cargoHandling: [
        'Cargo and slop tanks — SUS316 stainless steel.',
        'Cargo pumps — 10 × 150 m³/h. Maximum loading rate — 200 m³/h per tank across 10 tanks.',
        'Cargo cleaning pump — 1 × 30 m³/h. Ballast pump — 1 × 300 m³/h.',
        'Pressure/vacuum valve — 0.02 MPa / −0.035 MPa.',
        'Hose-handling crane — 0.9 tonnes SWL, maximum outreach 8 m.',
      ].join('\n'),
      cargoHandlingTh: [
        'ถังสินค้าและถังสลอปใช้สเตนเลส SUS316',
        'ปั๊มสินค้า 10 ตัว อัตราสูบตัวละ 150 ม³/ชม. อัตรารับสินค้าสูงสุด 200 ม³/ชม. ต่อถัง จำนวน 10 ถัง',
        'ปั๊มล้างถังสินค้า 1 ตัว อัตราสูบ 30 ม³/ชม. และปั๊มน้ำอับเฉา 1 ตัว อัตราสูบ 300 ม³/ชม.',
        'วาล์วแรงดันและสุญญากาศ 0.02 MPa / −0.035 MPa',
        'เครนยกท่อสินค้า พิกัดยกที่ปลอดภัย 0.9 ตัน ระยะเอื้อมสูงสุด 8 ม.',
      ].join('\n'),
      loadLines: [
        'Summer, tropical, fresh-water summer and fresh-water tropical — draft 5.612 m, deadweight 3,526.32 tonnes.',
        'Winter — draft 5.459 m, deadweight 3,405.63 tonnes.',
        'Winter North Atlantic — draft 5.495 m, deadweight 3,405.51 tonnes.',
        'Maximum displacement — 5,057.51 tonnes. Lightship — 1,531.19 tonnes. Constant — 80 tonnes.',
        'Keel to masthead — 27.80 m. Bow to midship — 44.80 m.',
        'To bridge — 70.50 m from bow, 21.50 m from stern.',
        'To manifold — 39.70 m from bow, 52.30 m from stern.',
      ].join('\n'),
      loadLinesTh: [
        'ฤดูร้อน เขตร้อน น้ำจืดฤดูร้อน และน้ำจืดเขตร้อน กินน้ำลึก 5.612 ม. ระวางบรรทุก 3,526.32 ตัน',
        'ฤดูหนาว กินน้ำลึก 5.459 ม. ระวางบรรทุก 3,405.63 ตัน',
        'แอตแลนติกเหนือฤดูหนาว กินน้ำลึก 5.495 ม. ระวางบรรทุก 3,405.51 ตัน',
        'ระวางขับน้ำสูงสุด 5,057.51 ตัน น้ำหนักเรือเปล่า 1,531.19 ตัน และน้ำหนักคงที่ 80 ตัน',
        'จากกระดูกงูถึงยอดเสากระโดง 27.80 ม. จากหัวเรือถึงกึ่งกลางลำ 44.80 ม.',
        'ระยะถึงสะพานเดินเรือจากหัวเรือ 70.50 ม. และจากท้ายเรือ 21.50 ม.',
        'ระยะถึงท่อร่วมสินค้าจากหัวเรือ 39.70 ม. และจากท้ายเรือ 52.30 ม.',
      ].join('\n'),
      mooringSafety: [
        'Anchor chains — 2 × 220 m. Port and starboard anchors — 1,960 kg each.',
        'Mooring winch pull — 5 tonnes.',
        'Fire pump — 140 m³/h at 15 m head or 60 m³/h at 65 m head.',
        'Emergency fire pump — 50 m³/h. Foam pump — 100 m³/h.',
      ].join('\n'),
      mooringSafetyTh: [
        'โซ่สมอ 2 เส้น ยาวเส้นละ 220 ม. สมอกราบซ้ายและกราบขวาหนักตัวละ 1,960 กก.',
        'แรงดึงของกว้านผูกเรือ 5 ตัน',
        'ปั๊มดับเพลิงจ่ายน้ำได้ 140 ม³/ชม. ที่ความสูงส่งน้ำ 15 ม. หรือ 60 ม³/ชม. ที่ความสูงส่งน้ำ 65 ม.',
        'ปั๊มดับเพลิงฉุกเฉิน 50 ม³/ชม. และปั๊มโฟม 100 ม³/ชม.',
      ].join('\n'),
    },
  },
];
