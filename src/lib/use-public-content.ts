"use client";

import { useContext } from "react";
import { PublicContentContext } from "./public-content-provider";

// Public editorial content always comes from the server-provided database records.
export function usePublicContent() {
  const content = useContext(PublicContentContext);
  if (!content) throw new Error("Public content must be loaded by the page.");
  return content;
}
