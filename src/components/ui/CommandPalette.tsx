"use client";

import { Command } from "cmdk";
import { Box, Typography } from "@mui/material";
import { useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Crown,
  Flame,
  Lightbulb,
  MessageSquare,
  RefreshCw,
  RotateCw,
  Search,
  Target,
} from "lucide-react";
import {
  FONT_MONO,
  FONT_SANS,
  LINE,
  MATERIAL,
  RADIUS,
  SHADOW,
  SURFACE,
  TEXT,
  TYPE,
} from "@/theme/tokens";

export interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  // Wide enough to accept any lucide-react icon component
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon?: React.ComponentType<any>;
  shortcut?: string[];
  onSelect: () => void;
}

export interface CommandGroup {
  heading: string;
  items: CommandItem[];
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: CommandGroup[];
}

export function CommandPalette({
  open,
  onOpenChange,
  groups,
}: CommandPaletteProps) {
  // Global ⌘K / Ctrl+K to toggle
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      } else if (e.key === "Escape" && open) {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <Box
      onClick={() => onOpenChange(false)}
      sx={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        pt: { xs: 8, md: 16 },
        background: MATERIAL.scrim,
        animation: "fadeIn 180ms cubic-bezier(0.2, 0, 0, 1)",
        "@keyframes fadeIn": {
          "0%": { opacity: 0 },
          "100%": { opacity: 1 },
        },
      }}
    >
      <Box
        onClick={(e) => e.stopPropagation()}
        sx={{
          width: "100%",
          maxWidth: 600,
          mx: 2,
          borderRadius: `${RADIUS.sheet}px`,
          background: SURFACE.overlay,
          border: `1px solid ${LINE.hairline}`,
          boxShadow: SHADOW.modal,
          color: TEXT.primary,
          overflow: "hidden",
          transformOrigin: "top center",
          animation: "slideIn 180ms cubic-bezier(0.2, 0, 0, 1)",
          "@keyframes slideIn": {
            "0%": { opacity: 0, transform: "scale(0.98)" },
            "100%": { opacity: 1, transform: "scale(1)" },
          },
        }}
      >
        <Command label="Command Palette" shouldFilter style={{ width: "100%" }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              px: 2.5,
              py: 2,
              borderBottom: `1px solid ${LINE.hairline}`,
            }}
          >
            <Search size={18} strokeWidth={1.75} color={TEXT.secondary} />
            <Command.Input
              autoFocus
              placeholder="Search moves, actions, or ask the coach…"
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                color: TEXT.primary,
                fontSize: TYPE.body.fontSize,
                fontFamily: FONT_SANS,
                fontWeight: 400,
              }}
            />
            <Box
              sx={{
                px: 1.25,
                py: 0.4,
                borderRadius: `${RADIUS.small}px`,
                background: "rgba(255,255,255,0.06)",
                border: `1px solid ${LINE.hairline}`,
                fontSize: "0.7rem",
                fontWeight: 600,
                color: TEXT.secondary,
                fontFamily: FONT_MONO,
              }}
            >
              Esc
            </Box>
          </Box>

          <Command.List
            style={{
              maxHeight: 420,
              overflowY: "auto",
              padding: "8px",
            }}
          >
            <Command.Empty>
              <Box sx={{ px: 2, py: 4, textAlign: "center" }}>
                <Typography sx={{ ...TYPE.bodySmall, color: TEXT.secondary }}>
                  No results. Try a different search.
                </Typography>
              </Box>
            </Command.Empty>

            {groups.map((group) => (
              <Command.Group
                key={group.heading}
                heading={group.heading}
                style={
                  {
                    "--cmdk-group-heading-color": TEXT.secondary,
                  } as React.CSSProperties
                }
              >
                <Box
                  sx={{
                    px: 1.5,
                    pt: 1.5,
                    pb: 0.5,
                    ...TYPE.label,
                    color: TEXT.secondary,
                  }}
                >
                  {group.heading}
                </Box>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Command.Item
                      key={item.id}
                      value={`${item.label} ${item.hint ?? ""}`}
                      onSelect={() => {
                        item.onSelect();
                        onOpenChange(false);
                      }}
                      style={
                        {
                          padding: "10px 12px",
                          borderRadius: "10px",
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          cursor: "pointer",
                          fontSize: TYPE.bodySmall.fontSize,
                          color: TEXT.primary,
                          // cmdk applies [aria-selected="true"]
                          "--selected-bg": "rgba(255,255,255,0.1)",
                        } as React.CSSProperties
                      }
                    >
                      {Icon && (
                        <Icon
                          size={18}
                          strokeWidth={1.75}
                          color={TEXT.secondary}
                          style={{ flexShrink: 0 }}
                        />
                      )}
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box sx={{ fontWeight: 500, color: TEXT.primary }}>
                          {item.label}
                        </Box>
                        {item.hint && (
                          <Box
                            sx={{
                              ...TYPE.caption,
                              color: TEXT.secondary,
                              mt: 0.25,
                            }}
                          >
                            {item.hint}
                          </Box>
                        )}
                      </Box>
                      {item.shortcut && (
                        <Box sx={{ display: "flex", gap: 0.5 }}>
                          {item.shortcut.map((k, i) => (
                            <Box
                              key={i}
                              sx={{
                                px: 0.75,
                                py: 0.25,
                                borderRadius: `${RADIUS.small}px`,
                                background: "rgba(255,255,255,0.06)",
                                border: `1px solid ${LINE.hairline}`,
                                fontSize: "0.68rem",
                                fontWeight: 600,
                                color: TEXT.secondary,
                                fontFamily: FONT_MONO,
                              }}
                            >
                              {k}
                            </Box>
                          ))}
                        </Box>
                      )}
                    </Command.Item>
                  );
                })}
              </Command.Group>
            ))}
          </Command.List>

          <Box
            sx={{
              px: 2.5,
              py: 1.25,
              borderTop: `1px solid ${LINE.hairline}`,
              display: "flex",
              alignItems: "center",
              gap: 2,
              ...TYPE.caption,
              color: TEXT.secondary,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
              <Box
                component="span"
                sx={{
                  px: 0.75,
                  py: 0.15,
                  borderRadius: `${RADIUS.small}px`,
                  background: "rgba(255,255,255,0.06)",
                  border: `1px solid ${LINE.hairline}`,
                  fontFamily: FONT_MONO,
                  fontWeight: 600,
                }}
              >
                ↑↓
              </Box>
              navigate
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
              <Box
                component="span"
                sx={{
                  px: 0.75,
                  py: 0.15,
                  borderRadius: `${RADIUS.small}px`,
                  background: "rgba(255,255,255,0.06)",
                  border: `1px solid ${LINE.hairline}`,
                  fontFamily: FONT_MONO,
                  fontWeight: 600,
                }}
              >
                ↵
              </Box>
              select
            </Box>
            <Box sx={{ flex: 1 }} />
            <Box>Chess Masti</Box>
          </Box>
        </Command>
      </Box>

      {/* cmdk's aria-selected style override */}
      <style>{`
        [cmdk-item][aria-selected="true"] {
          background: rgba(255, 255, 255, 0.1) !important;
          color: ${TEXT.primary} !important;
        }
      `}</style>
    </Box>
  );
}

// Re-export icons commonly used so the page can build groups without
// importing lucide-react directly for these.
export const CommandIcons = {
  Start: ChevronsLeft,
  Prev: ChevronLeft,
  Next: ChevronRight,
  End: ChevronsRight,
  Flip: RotateCw,
  Reset: RefreshCw,
  Moment: Crown,
  Brilliant: Flame,
  Coach: MessageSquare,
  Hint: Lightbulb,
  Target,
};
