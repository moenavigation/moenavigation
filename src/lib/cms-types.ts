export const contentTypes = ['Vessel', 'Project', 'News', 'Service', 'Page', 'Route', 'Section'] as const;
export type ContentType = typeof contentTypes[number];
export type ContentImage = { url: string; alt: string; altTh: string };
export type RoutePort = { name: string; nameTh: string; country: string; countryTh: string };
export type VesselSpecs = {
  imo?: string;
  yearBuilt?: number;
  lengthM?: number;
  beamM?: number;
  draftM?: number;
  deadweightT?: number;
  capacityTeu?: number;
  flag?: string;
  flagTh?: string;
  availability?: string;
  availabilityTh?: string;
};
export const corePageIds = ['home', 'about', 'services', 'fleet', 'routes', 'projects', 'news', 'contact', 'privacy'] as const;

export type ContentRecord = {
  id: string;
  type: ContentType;
  title: string;
  titleTh: string;
  description: string;
  descriptionTh: string;
  image: string;
  category: string;
  categoryTh?: string;
  status: 'Published' | 'Draft';
  body?: string;
  bodyTh?: string;
  date?: string;
  imageAlt?: string;
  imageAltTh?: string;
  parentId?: string;
  order?: number;
  eyebrow?: string;
  eyebrowTh?: string;
  caption?: string;
  captionTh?: string;
  icon?: string;
  mobileImage?: string;
  gallery?: ContentImage[];
  bodyHeading?: string;
  bodyHeadingTh?: string;
  origin?: RoutePort;
  destination?: RoutePort;
  waypoints?: [number, number][];
  vesselSpecs?: VesselSpecs;
  deletedAt?: string;
  updatedAt?: string;
  revision: number;
};

export type MediaItem = {
  id: string;
  title: string;
  url: string;
  publicId?: string;
  state: 'staged' | 'committed';
  createdAt: string;
  sourcePath?: string;
};

export type EnquiryNotification = {
  status: 'not_configured' | 'pending' | 'sending' | 'sent' | 'failed' | 'review';
  attempts: number;
  lastAttemptAt?: string;
  sentAt?: string;
  message?: string;
};
export type Enquiry = {
  id: string;
  name: string;
  email: string;
  company: string;
  subject: string;
  message: string;
  locale: 'en' | 'th';
  status: 'New' | 'In progress' | 'Resolved';
  createdAt: string;
  updatedAt: string;
  revision: number;
  notification?: EnquiryNotification;
};

export type SiteSettings = {
  companyName: string;
  companyNameTh: string;
  officeAddress: string;
  officeAddressTh: string;
  phone: string;
  email: string;
  mapUrl: string;
  revision: number;
};
