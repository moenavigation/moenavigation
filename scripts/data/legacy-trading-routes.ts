// Source-backed legacy route content for reviewed maintenance imports and
// isolated fixtures. Do not import this module into the public application.
import type { ContentRecord, RoutePort, RouteSpecs } from '../../src/lib/cms-types';

type Point = [number, number];
type LegacyPort = RoutePort & {
  coordinates: Point;
  reference: string;
  locationScope: string;
  sourceUrls: string[];
};

const hydro = 'https://hydro.navy.mi.th/storage/frontend/article';
const yangonChart = 'https://www.mpa.gov.mm/wp-content/uploads/2025/04/မြန်မာ-ကိုးရီးယား-ဒလတံတား-လက်ကမ်းကြော်ငြာစာ-3-2025.pdf';
const wpiLayer = 'https://arcgis.netl.doe.gov/server/rest/services/Hosted/CCS_EJ_SJ_Data/FeatureServer/17';

// Pins identify documented harbour-area references, not a confirmed vessel
// terminal, berth, live position or navigational waypoint. DMS conversions are
// retained at six decimal places; that does not imply survey-level accuracy.
export const legacyRoutePorts: Record<string, LegacyPort> = {
  bangkok: {
    name: 'Bangkok Port', nameTh: 'ท่าเรือกรุงเทพ', country: 'Thailand', countryTh: 'ไทย',
    coordinates: [13.701667, 100.58], reference: 'Bangkok Port hydrographic tide station: 13°42′06″N 100°34′48″E',
    locationScope: 'Named port-area hydrographic reference; exact operating berth unconfirmed.',
    sourceUrls: [`${hydro}/22986/file/th/BH2026.pdf`],
  },
  laemChabang: {
    name: 'Laem Chabang Port', nameTh: 'ท่าเรือแหลมฉบัง', country: 'Thailand', countryTh: 'ไทย',
    coordinates: [13.056111, 100.887222], reference: 'Laem Chabang hydrographic tide station: 13°03′22″N 100°53′14″E',
    locationScope: 'Named port-area hydrographic reference; no terminal is assigned to the legacy service.',
    sourceUrls: [`${hydro}/22996/file/th/LC2026.pdf`],
  },
  suratThani: {
    name: 'Surat Thani port area', nameTh: 'พื้นที่ท่าเรือสุราษฎร์ธานี', country: 'Thailand', countryTh: 'ไทย',
    coordinates: [9.265, 99.434444], reference: 'Ko Prap (Surat Thani) hydrographic tide station: 09°15′54″N 99°26′04″E',
    locationScope: 'Bandon Bay / Tapi approach-area reference at Ko Prap. The legacy source does not identify a terminal; this is not a claim that Ko Prap is the loading berth.',
    sourceUrls: [`${hydro}/23018/file/th/KP2026.pdf`],
  },
  songkhla: {
    name: 'Songkhla Port', nameTh: 'ท่าเรือสงขลา', country: 'Thailand', countryTh: 'ไทย',
    coordinates: [7.216944, 100.58], reference: 'Songkhla hydrographic tide station: 07°13′01″N 100°34′48″E',
    locationScope: 'Named harbour-area hydrographic reference; exact operating berth unconfirmed.',
    sourceUrls: [`${hydro}/23024/file/th/SK2026.pdf`],
  },
  ranong: {
    name: 'Ranong port area', nameTh: 'พื้นที่ท่าเรือระนอง', country: 'Thailand', countryTh: 'ไทย',
    coordinates: [10.006944, 98.608056], reference: 'Pak Nam Ranong hydrographic tide station: 10°00′25″N 98°36′29″E',
    locationScope: 'Documented Ranong port-area hydrographic reference; exact operating berth unconfirmed.',
    sourceUrls: [`${hydro}/23030/file/th/RN2026.pdf`],
  },
  yangon: {
    name: 'Yangon port area', nameTh: 'พื้นที่ท่าเรือย่างกุ้ง', country: 'Myanmar', countryTh: 'เมียนมา',
    coordinates: [16.766667, 96.166667], reference: 'MPA Yangon (Rangoon) hydrographic reference: 16°46′N 96°10′E; WPI 49650.',
    locationScope: 'Yangon Inner Harbour area reference at one-arcminute source precision. The old service does not identify an inner-harbour or Thilawa terminal.',
    sourceUrls: [yangonChart, 'https://www.mpa.gov.mm/yangon-ports/', `${wpiLayer}/query?where=wpinumber%3D49650&outFields=wpinumber,main_port_name,alternate_name,unlocode&outSR=4326&f=json`],
  },
  sihanoukville: {
    name: 'Sihanoukville Port', nameTh: 'ท่าเรือสีหนุวิลล์', country: 'Cambodia', countryTh: 'กัมพูชา',
    coordinates: [10.633333, 103.5], reference: 'NGA World Port Index 57485: Kampong Saom, alternate name Sihanoukville, KH KOS.',
    locationScope: 'Published harbour-area reference at one-arcminute source precision, not a confirmed individual terminal or berth.',
    sourceUrls: [`${wpiLayer}/query?where=wpinumber%3D57485&outFields=wpinumber,main_port_name,alternate_name,unlocode&outSR=4326&f=json`, 'https://vcps.nga.mil/nauticalpubs-feature/rest/services/WPI/World_Port_Index_Viewer/MapServer'],
  },
};

export const legacyRoutesPageCopy = {
  title: 'Trading Routes', titleTh: 'เส้นทางการเดินเรือ',
  eyebrow: 'TRADING ROUTES', eyebrowTh: 'เส้นทางการเดินเรือ',
  description: 'Explore container connections across Thailand and regional routes to Myanmar and Cambodia. Confirm current service availability and sailing arrangements for your cargo.',
  descriptionTh: 'สำรวจเส้นทางขนส่งตู้คอนเทนเนอร์ในประเทศไทยและเส้นทางภูมิภาคสู่เมียนมาและกัมพูชา โปรดยืนยันความพร้อมให้บริการและแผนการเดินเรือสำหรับสินค้าของคุณ',
};

type LegacyRouteDefinition = {
  id: string; title: string; titleTh: string; origin: string; destination: string;
  distanceNm: number; sailing?: [number, number]; international?: boolean;
  description: string; descriptionTh: string;
};

const definitions: LegacyRouteDefinition[] = [
  { id: 'bkk-lcb', title: 'Bangkok – Laem Chabang', titleTh: 'กรุงเทพฯ – แหลมฉบัง', origin: 'laemChabang', destination: 'bangkok', distanceNm: 58, sailing: [8, 10],
    description: 'Container connection between Bangkok Port and Laem Chabang, linking the Chao Phraya river port with the eastern seaboard.',
    descriptionTh: 'เส้นทางขนส่งตู้คอนเทนเนอร์ระหว่างท่าเรือกรุงเทพกับแหลมฉบัง เชื่อมท่าเรือแม่น้ำเจ้าพระยากับชายฝั่งทะเลตะวันออก' },
  { id: 'bkk-lcb-suratthani', title: 'Laem Chabang – Surat Thani', titleTh: 'แหลมฉบัง – สุราษฎร์ธานี', origin: 'laemChabang', destination: 'suratThani', distanceNm: 261,
    description: 'Container connection from Laem Chabang to the Surat Thani port area. The marker identifies the Bandon Bay approach area; the operating terminal is not specified.',
    descriptionTh: 'เส้นทางขนส่งตู้คอนเทนเนอร์จากแหลมฉบังสู่พื้นที่ท่าเรือสุราษฎร์ธานี จุดบนแผนที่อ้างอิงบริเวณทางเข้าอ่าวบ้านดอน โดยยังไม่ได้ระบุท่าเทียบเรือที่ใช้งาน' },
  { id: 'bkk-lcb-songkhla', title: 'Laem Chabang – Songkhla', titleTh: 'แหลมฉบัง – สงขลา', origin: 'laemChabang', destination: 'songkhla', distanceNm: 361, sailing: [52, 54],
    description: 'Coastal container connection from Laem Chabang to Songkhla on Thailand’s southern Gulf coast.',
    descriptionTh: 'เส้นทางขนส่งตู้คอนเทนเนอร์ชายฝั่งจากแหลมฉบังสู่สงขลา บนชายฝั่งอ่าวไทยตอนใต้' },
  { id: 'ranong-yangon', title: 'Ranong – Yangon', titleTh: 'ระนอง – ย่างกุ้ง', origin: 'ranong', destination: 'yangon', distanceNm: 459, sailing: [65, 65], international: true,
    description: 'Regional container connection between Ranong and the Yangon port area in Myanmar. The marker identifies the inner-harbour area; the operating terminal is not specified.',
    descriptionTh: 'เส้นทางขนส่งตู้คอนเทนเนอร์ระหว่างระนองกับพื้นที่ท่าเรือย่างกุ้งในเมียนมา จุดบนแผนที่อ้างอิงบริเวณท่าเรือชั้นใน โดยยังไม่ได้ระบุท่าเทียบเรือที่ใช้งาน' },
  { id: 'lcb-sihanoukville', title: 'Laem Chabang – Sihanoukville', titleTh: 'แหลมฉบัง – สีหนุวิลล์', origin: 'laemChabang', destination: 'sihanoukville', distanceNm: 248, sailing: [31, 33], international: true,
    description: 'Regional container connection from Laem Chabang to Sihanoukville, Cambodia, across the eastern Gulf of Thailand.',
    descriptionTh: 'เส้นทางขนส่งตู้คอนเทนเนอร์จากแหลมฉบังสู่สีหนุวิลล์ ประเทศกัมพูชา ผ่านฝั่งตะวันออกของอ่าวไทย' },
];

export const legacyTradingRouteFacts: Record<string, RouteSpecs & { sources: string[]; reviewNotes: string[] }> = Object.fromEntries(definitions.map(route => [route.id, {
  distanceNm: route.distanceNm, capacityMinTeu: 72, capacityMaxTeu: 120,
  ...(route.sailing ? { sailingMinHours: route.sailing[0], sailingMaxHours: route.sailing[1] } : {}),
  sources: ['https://www.moe-line.com/trading-routes/', 'https://www.moe-line.com/th/trading-routes/', `https://www.moe-line.com/trading-routes/${route.id}/`, `https://www.moe-line.com/th/trading-routes/${route.id}/`],
  reviewNotes: route.id === 'bkk-lcb-suratthani'
    ? ['Sailing time intentionally omitted: listing says 34–36 hours; both EN/TH detail pages say 8–10 hours.', 'Heading says BKK/LCB, but the endpoint row identifies Laem Chabang. No separate Bangkok-origin figures are inferred.', 'Surat Thani terminal is unidentified; marker is the documented Ko Prap approach-area reference.']
    : [route.id === 'bkk-lcb' ? 'Heading order is BKK–LCB; endpoint text is Laem Chabang to Bangkok. Direction and schedule remain subject to confirmation.' : 'Published legacy particulars do not establish a current sailing schedule.'],
}]));

// Reviewed website illustrations combine the maritime network with mapped
// river centerlines and broad harbour/open-water approach control points.
// See docs/research/legacy-moe-line-2026-11-16/route-geography.json for sources,
// attribution and the coarse land-mask limitations. These are not voyage plans.
const paths: Record<string, Point[]> = {
  "bkk-lcb": [
    [
      13.056111,
      100.887222
    ],
    [
      12.792021,
      100.604426
    ],
    [
      13,
      100.4
    ],
    [
      13.521,
      100.602
    ],
    [
      13.542163,
      100.594549
    ],
    [
      13.54927,
      100.584821
    ],
    [
      13.552051,
      100.581508
    ],
    [
      13.554496,
      100.579468
    ],
    [
      13.556891,
      100.578019
    ],
    [
      13.562105,
      100.576358
    ],
    [
      13.565535,
      100.576305
    ],
    [
      13.568409,
      100.576698
    ],
    [
      13.572299,
      100.577852
    ],
    [
      13.574649,
      100.579067
    ],
    [
      13.577468,
      100.581068
    ],
    [
      13.586464,
      100.588245
    ],
    [
      13.590516,
      100.590541
    ],
    [
      13.594831,
      100.591958
    ],
    [
      13.597511,
      100.59249
    ],
    [
      13.601745,
      100.592494
    ],
    [
      13.605361,
      100.591508
    ],
    [
      13.607376,
      100.590295
    ],
    [
      13.60845,
      100.589211
    ],
    [
      13.610018,
      100.585816
    ],
    [
      13.610757,
      100.581053
    ],
    [
      13.610463,
      100.573558
    ],
    [
      13.611361,
      100.565306
    ],
    [
      13.611945,
      100.563165
    ],
    [
      13.613817,
      100.559054
    ],
    [
      13.617238,
      100.553045
    ],
    [
      13.618565,
      100.551273
    ],
    [
      13.623945,
      100.545491
    ],
    [
      13.628472,
      100.541458
    ],
    [
      13.630431,
      100.54018
    ],
    [
      13.63563,
      100.537471
    ],
    [
      13.640445,
      100.53547
    ],
    [
      13.648715,
      100.534052
    ],
    [
      13.65218,
      100.534033
    ],
    [
      13.65585,
      100.535138
    ],
    [
      13.659373,
      100.537326
    ],
    [
      13.660587,
      100.539279
    ],
    [
      13.660823,
      100.542144
    ],
    [
      13.660593,
      100.543769
    ],
    [
      13.658041,
      100.549919
    ],
    [
      13.655983,
      100.556002
    ],
    [
      13.655714,
      100.558945
    ],
    [
      13.656308,
      100.563258
    ],
    [
      13.657711,
      100.566485
    ],
    [
      13.660389,
      100.570471
    ],
    [
      13.663725,
      100.574247
    ],
    [
      13.669198,
      100.579342
    ],
    [
      13.676025,
      100.584871
    ],
    [
      13.679752,
      100.587328
    ],
    [
      13.68419,
      100.589125
    ],
    [
      13.686874,
      100.589243
    ],
    [
      13.690042,
      100.588549
    ],
    [
      13.69422,
      100.586095
    ],
    [
      13.698042,
      100.581873
    ],
    [
      13.700006,
      100.578191
    ],
    [
      13.701667,
      100.58
    ]
  ],
  "bkk-lcb-suratthani": [
    [
      13.056111,
      100.887222
    ],
    [
      12.792021,
      100.604426
    ],
    [
      13,
      100.4
    ],
    [
      10.106933,
      100.54421
    ],
    [
      10.1,
      100.4
    ],
    [
      10,
      100.1
    ],
    [
      9.95,
      99.8
    ],
    [
      9.65,
      99.63
    ],
    [
      9.35,
      99.5
    ],
    [
      9.265,
      99.434444
    ]
  ],
  "bkk-lcb-songkhla": [
    [
      13.056111,
      100.887222
    ],
    [
      12.792021,
      100.604426
    ],
    [
      13,
      100.4
    ],
    [
      7.318,
      100.682
    ],
    [
      7.251,
      100.613
    ],
    [
      7.245,
      100.598
    ],
    [
      7.24,
      100.59
    ],
    [
      7.236,
      100.582
    ],
    [
      7.234,
      100.577
    ],
    [
      7.232,
      100.573
    ],
    [
      7.229,
      100.571
    ],
    [
      7.225,
      100.57
    ],
    [
      7.22,
      100.574
    ],
    [
      7.216944,
      100.58
    ]
  ],
  "ranong-yangon": [
    [
      10.006944,
      98.608056
    ],
    [
      10.007511,
      98.590786
    ],
    [
      9.99993,
      98.587222
    ],
    [
      9.997293,
      98.584832
    ],
    [
      9.990271,
      98.581487
    ],
    [
      9.986287,
      98.57947
    ],
    [
      9.977776,
      98.576517
    ],
    [
      9.969463,
      98.573687
    ],
    [
      9.961136,
      98.569579
    ],
    [
      9.958462,
      98.569663
    ],
    [
      9.93,
      98.52
    ],
    [
      9.91,
      98.46
    ],
    [
      9.91,
      98.35
    ],
    [
      9.8,
      98.3
    ],
    [
      9.7,
      98.1
    ],
    [
      10.006944,
      97
    ],
    [
      11.125,
      97
    ],
    [
      13.788,
      97
    ],
    [
      14.151,
      96.404
    ],
    [
      15.084,
      94.871
    ],
    [
      16.392,
      96.381
    ],
    [
      16.45,
      96.35
    ],
    [
      16.514949,
      96.327278
    ],
    [
      16.522563,
      96.317861
    ],
    [
      16.535341,
      96.302055
    ],
    [
      16.563263,
      96.267524
    ],
    [
      16.602625,
      96.251562
    ],
    [
      16.606962,
      96.252226
    ],
    [
      16.632892,
      96.256197
    ],
    [
      16.649061,
      96.254564
    ],
    [
      16.653286,
      96.254137
    ],
    [
      16.674141,
      96.236068
    ],
    [
      16.683454,
      96.227998
    ],
    [
      16.69489,
      96.218088
    ],
    [
      16.744705,
      96.2059
    ],
    [
      16.74886,
      96.206146
    ],
    [
      16.7602,
      96.206607
    ],
    [
      16.765,
      96.183
    ],
    [
      16.766667,
      96.166667
    ]
  ],
  "lcb-sihanoukville": [
    [
      13.056111,
      100.887222
    ],
    [
      12.792021,
      100.604426
    ],
    [
      10.2195,
      103.12
    ],
    [
      10.637892,
      103.494733
    ],
    [
      10.633333,
      103.5
    ]
  ]
};

function portText(port: LegacyPort): RoutePort {
  return { name: port.name, nameTh: port.nameTh, country: port.country, countryTh: port.countryTh };
}

export const legacyTradingRouteRecords: ContentRecord[] = definitions.map((route, index) => {
  const origin = legacyRoutePorts[route.origin], destination = legacyRoutePorts[route.destination];
  const routeSpecs: RouteSpecs = {
    distanceNm: route.distanceNm, capacityMinTeu: 72, capacityMaxTeu: 120,
    ...(route.sailing ? { sailingMinHours: route.sailing[0], sailingMaxHours: route.sailing[1] } : {}),
  };
  return {
    id: route.id, type: 'Route', title: route.title, titleTh: route.titleTh,
    description: route.description, descriptionTh: route.descriptionTh,
    image: '/images/port.webp', imageAlt: 'Illustrative port image', imageAltTh: 'ภาพประกอบท่าเรือ',
    category: route.international ? 'Regional connections' : 'Domestic connections', categoryTh: route.international ? 'เส้นทางภูมิภาค' : 'เส้นทางในประเทศ',
    body: '', bodyTh: '',
    origin: portText(origin), destination: portText(destination), routeSpecs,
    waypoints: (paths[route.id] || [origin.coordinates, destination.coordinates]).map(point => [...point] as Point),
    order: index + 1, status: 'Published', revision: 1,
  };
});
