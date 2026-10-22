"use client";

import { createContext, useMemo, type ReactNode } from "react";
import type { ContentRecord, SiteSettings } from "./cms-types";
import { projectPublicContent, type PublicContent } from "./public-content";

export const PublicContentContext = createContext<(PublicContent & { settings: SiteSettings }) | null>(null);

export function PublicContentProvider({ records, settings, children }: { records: ContentRecord[]; settings: SiteSettings; children: ReactNode }) {
  const content = useMemo(() => ({ ...projectPublicContent(records), settings }), [records, settings]);
  return <PublicContentContext.Provider value={content}>{children}</PublicContentContext.Provider>;
}
