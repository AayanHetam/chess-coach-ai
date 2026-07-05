import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import {
  glassDialogPaperSx,
  glassBackdropSx,
  glassInputSx,
  glassListRowSx,
  glassPrimaryBtnSx,
  glassOutlineBtnSx,
} from "../glassTheme";

// Isolate the dialog from IndexedDB / next-router (via useGameDatabase) and
// Sentry so the render exercises only the theme-driven view logic.
vi.mock("@/hooks/useGameDatabase", () => ({
  useGameDatabase: () => ({ addGame: vi.fn() }),
}));
vi.mock("@sentry/react", () => ({ setContext: vi.fn() }));

/**
 * Theme coverage for the shared load-game dialog (commit 2743d91's glass work).
 *
 * The repo's vitest env is `node` with no jsdom / testing-library, and MUI's
 * Dialog mounts through a Portal that renders to empty markup under the SSR
 * renderer — so a deep DOM-assertion render test isn't possible without new
 * deps (out of scope). We cover "renders correctly in BOTH themes" two ways:
 *
 *  1. Deterministic contract on glassTheme.ts — the single source of the
 *     dialog's theme-conditional appearance. Every helper is keyed on
 *     `dark`; dark ⇒ glass treatment, light ⇒ MUI defaults (`{}`, or the
 *     minimal positional object for the paper). This is the real guarantee
 *     that light theme is untouched and dark gets glass.
 *  2. A render-path smoke: NewGameDialog is rendered inside a light-mode and a
 *     dark-mode ThemeProvider and must execute its body (useTheme →
 *     glass* selection, hooks, JSX) without throwing in either theme.
 */

describe("glassTheme — per-theme contract", () => {
  const helpers = {
    glassDialogPaperSx,
    glassBackdropSx,
    glassInputSx,
    glassListRowSx,
    glassPrimaryBtnSx,
    glassOutlineBtnSx,
  } as const;

  it("every helper returns a non-empty glass object in dark mode", () => {
    for (const [name, fn] of Object.entries(helpers)) {
      const sx = fn(true) as Record<string, unknown>;
      expect(sx, `${name}(true)`).toBeTypeOf("object");
      expect(Object.keys(sx).length, `${name}(true) should have styles`).toBeGreaterThan(0);
    }
  });

  it("light mode leaves MUI defaults untouched (no glass)", () => {
    // Backdrop/input/list/buttons must be exactly {} in light so the legacy
    // light pages get zero visual change.
    expect(glassBackdropSx(false)).toEqual({});
    expect(glassInputSx(false)).toEqual({});
    expect(glassListRowSx(false)).toEqual({});
    expect(glassPrimaryBtnSx(false)).toEqual({});
    expect(glassOutlineBtnSx(false)).toEqual({});
    // The paper keeps only its positional layout in light (no glass surface).
    const paper = glassDialogPaperSx(false) as Record<string, unknown>;
    expect(paper).toEqual({ position: "fixed", top: 0 });
    expect(paper.backdropFilter).toBeUndefined();
    expect(paper.background).toBeUndefined();
  });

  it("dark paper/backdrop actually apply the glass blur that light omits", () => {
    const darkPaper = glassDialogPaperSx(true) as Record<string, unknown>;
    const darkBackdrop = glassBackdropSx(true) as Record<string, unknown>;
    expect(darkPaper.backdropFilter).toContain("blur");
    expect(darkBackdrop.backdropFilter).toContain("blur");
  });
});

describe("NewGameDialog — renders in both themes", () => {
  const renderInTheme = async (mode: "light" | "dark") => {
    const { default: NewGameDialog } = await import("../loadGameDialog");
    const theme = createTheme({ palette: { mode } });
    return renderToStaticMarkup(
      createElement(
        ThemeProvider,
        { theme },
        createElement(NewGameDialog, { open: true, onClose: () => {} }),
      ),
    );
  };

  it("does not throw in light mode", async () => {
    await expect(renderInTheme("light")).resolves.toBeTypeOf("string");
  });

  it("does not throw in dark mode", async () => {
    await expect(renderInTheme("dark")).resolves.toBeTypeOf("string");
  });
});
