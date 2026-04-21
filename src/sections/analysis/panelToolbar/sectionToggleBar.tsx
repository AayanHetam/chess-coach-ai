import { Box, Stack, Tooltip, IconButton, useTheme } from "@mui/material";
import { Icon } from "@iconify/react";
import { useAtom } from "jotai";
import {
  AnalysisSectionId,
  visibleSectionsAtom,
} from "../states";

interface SectionDef {
  id: AnalysisSectionId;
  label: string;
  icon: string;
}

const SECTIONS: SectionDef[] = [
  { id: "graph", label: "Evaluation Graph", icon: "mdi:chart-line" },
  { id: "engine", label: "Engine Analysis", icon: "mdi:fish" },
  { id: "stats", label: "Game Statistics", icon: "mdi:chart-bar" },
  { id: "gameInfo", label: "Game Info", icon: "mdi:information-outline" },
  { id: "moves", label: "Moves Played", icon: "mdi:format-list-bulleted" },
];

export default function SectionToggleBar() {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === "dark";
  const [visible, setVisible] = useAtom(visibleSectionsAtom);

  const toggle = (id: AnalysisSectionId) => {
    setVisible((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  return (
    <Stack direction="row" spacing={0.75} alignItems="center">
      {SECTIONS.map(({ id, label, icon }) => {
        const active = visible.includes(id);
        return (
          <Tooltip key={id} title={`${active ? "Hide" : "Show"} ${label}`}>
            <IconButton
              size="small"
              onClick={() => toggle(id)}
              sx={{
                width: 32,
                height: 32,
                borderRadius: 1,
                border: "1.5px solid",
                borderColor: active
                  ? "primary.main"
                  : isDarkMode
                  ? "rgba(255,255,255,0.25)"
                  : "rgba(0,0,0,0.25)",
                backgroundColor: active
                  ? isDarkMode
                    ? "rgba(255,107,53,0.15)"
                    : "rgba(255,107,53,0.10)"
                  : "transparent",
                color: active
                  ? "primary.main"
                  : isDarkMode
                  ? "rgba(255,255,255,0.65)"
                  : "rgba(0,0,0,0.55)",
                transition: "all 0.15s ease",
                "&:hover": {
                  borderColor: "primary.main",
                  backgroundColor: isDarkMode
                    ? "rgba(255,107,53,0.12)"
                    : "rgba(255,107,53,0.08)",
                },
              }}
            >
              <Icon icon={icon} height={18} />
            </IconButton>
          </Tooltip>
        );
      })}
    </Stack>
  );
}
