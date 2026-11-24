"use client";

import { createContext, useMemo, type ReactNode } from "react";
import type { ContentRecord, SiteSettings } from "./cms-types";
import { projectPublicContent, type PublicContent } from "./public-content";
import type { FooterVesselLink } from "./footer-statistics";

export const PublicContentContext = createContext<(PublicContent & { settings: SiteSettings; fleetLinks: FooterVesselLink[] }) | null>(null);

export function PublicContentProvider({ records, settings, fleetLinks, children }: { records: ContentRecord[]; settings: SiteSettings; fleetLinks: FooterVesselLink[]; children: ReactNode }) {
  const content = useMemo(() => ({ ...projectPublicContent(records), settings, fleetLinks }), [records, settings, fleetLinks]);
  return <PublicContentContext.Provider value={content}>{children}</PublicContentContext.Provider>;
}
