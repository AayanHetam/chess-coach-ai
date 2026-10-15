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
 * Theme coverage for the shared load-game dialog.
 *
 * The repo's vitest env is `node` with no jsdom / testing-library, and MUI's
 * Dialog mounts through a Portal that renders to empty markup under the SSR
 * renderer — so a deep DOM-assertion render test isn't possible without new
 * deps (out of scope). We cover "renders correctly in BOTH themes" two ways:
 *
 *  1. Deterministic contract on glassTheme.ts — the helpers the dialog and
 *     its inputs apply. Since the 2026-10 redesign (docs/design/DESIGN_RULES.md)
 *     the theme styles the Dialog paper, backdrop, inputs and buttons, so the
 *     helpers add nothing beyond the paper's position and the list-row hover:
 *     no blur, no gradient, no glow, in either mode.
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

  it("every helper returns a plain style object in both modes", () => {
    for (const [name, fn] of Object.entries(helpers)) {
      for (const dark of [true, false]) {
        const sx = fn(dark) as Record<string, unknown>;
        expect(sx, `${name}(${dark})`).toBeTypeOf("object");
        expect(sx, `${name}(${dark})`).not.toBeNull();
      }
    }
  });

  it("light mode leaves MUI defaults untouched", () => {
    expect(glassBackdropSx(false)).toEqual({});
    expect(glassInputSx(false)).toEqual({});
    expect(glassListRowSx(false)).toEqual({});
    expect(glassPrimaryBtnSx(false)).toEqual({});
    expect(glassOutlineBtnSx(false)).toEqual({});
    // The paper keeps only its positional layout.
    const paper = glassDialogPaperSx(false) as Record<string, unknown>;
    expect(paper).toEqual({ position: "fixed", top: 0 });
  });

  it("dark mode adds no glass: the theme styles the paper, backdrop, inputs and buttons", () => {
    const darkPaper = glassDialogPaperSx(true) as Record<string, unknown>;
    expect(darkPaper).toEqual({ position: "fixed", top: 0 });
    expect(glassBackdropSx(true)).toEqual({});
    expect(glassInputSx(true)).toEqual({});
    expect(glassPrimaryBtnSx(true)).toEqual({});
    expect(glassOutlineBtnSx(true)).toEqual({});
    const serialised = JSON.stringify(
      Object.values(helpers).map((fn) => fn(true))
    );
    expect(serialised).not.toMatch(/blur|gradient|inset 0 1px 0/);
    expect(serialised).not.toMatch(/rgba\(249,115,22/);
  });

  it("dark list rows keep a hover and a hairline, nothing more", () => {
    const row = glassListRowSx(true) as Record<string, unknown>;
    expect(row["&:hover"]).toBeTypeOf("object");
    expect(row.boxShadow).toBeUndefined();
    expect(row.backdropFilter).toBeUndefined();
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
        createElement(NewGameDialog, { open: true, onClose: () => {} })
      )
    );
  };

  it("does not throw in light mode", async () => {
    await expect(renderInTheme("light")).resolves.toBeTypeOf("string");
  });

  it("does not throw in dark mode", async () => {
    await expect(renderInTheme("dark")).resolves.toBeTypeOf("string");
  });
});
