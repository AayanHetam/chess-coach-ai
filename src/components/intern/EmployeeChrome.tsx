"use client";

import { useEffect, type PropsWithChildren } from "react";
import { useViewer } from "@/hooks/useViewer";

/**
 * Top-level wrapper that activates the site-wide intern (employee) experience.
 *
 * - Stamps `data-viewer="intern"` on <html> so CSS / styled-components can
 *   key off it for theme variant overrides.
 * - Re-renders children unchanged; chrome additions (header pill, internal
 *   nav, internal home card, footer line) are mounted in their respective
 *   parent components, all of which read useViewer() themselves.
 *
 * Mounted from both layouts:
 *   - src/app/layout.tsx     (App Router routes)
 *   - src/pages/_app.tsx     (Pages Router routes; via Layout wrapper)
 *
 * Theme-color swap (orange → deep blue) is implemented at the MUI
 * ThemeProvider level inside src/sections/layout/index.tsx and inside
 * src/components/ThemeRegistry.tsx, both of which read useViewer().isIntern.
 */
export function EmployeeChrome({ children }: PropsWithChildren) {
  const { isIntern } = useViewer();

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (isIntern) {
      document.documentElement.setAttribute("data-viewer", "intern");
    } else {
      document.documentElement.removeAttribute("data-viewer");
    }
    return () => {
      // Defensive: if this wrapper unmounts (it shouldn't), drop the attribute
      // so future customer renders aren't tainted by a stale flag.
      document.documentElement.removeAttribute("data-viewer");
    };
  }, [isIntern]);

  return <>{children}</>;
}
