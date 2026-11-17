"use client";

import { createContext, useMemo, type ReactNode } from "react";
import type { ContentRecord, SiteSettings } from "./cms-types";
import { projectPublicContent, type PublicContent } from "./public-content";

export const PublicContentContext = createContext<(PublicContent & { settings: SiteSettings; fleetCount: number }) | null>(null);

export function PublicContentProvider({ records, settings, fleetCount, children }: { records: ContentRecord[]; settings: SiteSettings; fleetCount: number; children: ReactNode }) {
  const content = useMemo(() => ({ ...projectPublicContent(records), settings, fleetCount }), [records, settings, fleetCount]);
  return <PublicContentContext.Provider value={content}>{children}</PublicContentContext.Provider>;
}
