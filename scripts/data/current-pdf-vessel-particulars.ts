import type { CurrentPdfVesselParticular } from './current-pdf-vessel-plan';

// Client-supplied sheets reviewed 24 November 2026. Both container sheets list
// two build years, so they do not establish a replacement for the existing year.
export const currentPdfVesselParticulars: readonly CurrentPdfVesselParticular[] = [
  {
    id: 'moe-line-4', expectedTitle: 'MOE LINE 4', expectedCategory: 'Crane',
    sourceFile: 'ML 4 - PARTICULAR.pdf', sourceSha256: 'a400759d197caa3dc97fb73ec174b673fa02a8492625c430af00f08fec78255a',
    specs: {
      officialNumber: '4800-00377', yearBuilt: 1988, flag: 'Thailand', flagTh: 'ไทย',
      lengthM: 55, beamM: 19, depthM: 4, grossTonnage: 1329, craneSwlT: 200,
    },
  },
  {
    id: 'moe-line-5', expectedTitle: 'MOE LINE 5', expectedCategory: 'Container',
    sourceFile: 'ML 5 - PARTICULAR.pdf', sourceSha256: 'cd5732dae3929825c63b492d37158cb4e98f64ef78a714ed2577b3d48d066757',
    specs: {
      imo: '1042457', officialNumber: '670000335', callSign: 'HSB9161', mmsi: '567003250', flag: 'Thailand', flagTh: 'ไทย',
      lengthM: 49.98, lbpM: 40.716, beamM: 14.8, depthM: 4.92, draftM: 3.52, capacityTeu: 120, reeferPlugs: 4,
      grossTonnage: 1163, netTonnage: 651, deadweightT: 1800, cargoCapacityT: 1750,
    },
  },
  {
    id: 'moe-line-6', expectedTitle: 'MOE LINE 6', expectedCategory: 'Container',
    sourceFile: 'ML 6 - PARTICULAR.pdf', sourceSha256: 'd2da038d57f9bf3de1205e273ccd2d14a5a8bbc0dc56aaa65bd0b605c0b3bd92',
    specs: {
      imo: '1042469', officialNumber: '670000953', callSign: 'HSB9157', mmsi: '567003240', flag: 'Thailand', flagTh: 'ไทย',
      lengthM: 49.98, lbpM: 47.8, beamM: 14.8, depthM: 4.62, draftM: 3.35, capacityTeu: 120, reeferPlugs: 4,
      grossTonnage: 1047, netTonnage: 592, deadweightT: 1800, cargoCapacityT: 1750,
    },
  },
  {
    id: 'dumai-moe', expectedTitle: 'DUMAI MOE', expectedCategory: 'Tanker',
    sourceFile: 'DMM - PARTICULAR.pdf', sourceSha256: 'c2d19f5fd3d1b5b337f195f94e051bd29e9fa4f07d8743a213a19b7c154956eb',
    specs: {
      imo: '9190975', officialNumber: '5900-02275', callSign: 'HSB 5602', mmsi: '567529000', yearBuilt: 1998, flag: 'Thailand', flagTh: 'ไทย',
      lengthM: 92, lbpM: 84.9, beamM: 14.02, depthM: 6.8, draftM: 5.612,
      tonnageBasis: 'international', grossTonnage: 2487, netTonnage: 909, deadweightT: 3526, cargoVolumeM3: 3330, cargoTanks: 10,
    },
  },
];
