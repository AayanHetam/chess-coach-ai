import { Box, IconButton, Stack, Typography, useTheme } from "@mui/material";
import { Icon } from "@iconify/react";
import { ReactNode } from "react";
import { useAtom } from "jotai";
import { AnalysisSectionId, visibleSectionsAtom } from "../states";

interface Props {
  id: AnalysisSectionId;
  title: string;
  icon: string;
  children: ReactNode;
  maxHeight?: number | string;
}

export default function SectionCard({
  id,
  title,
  icon,
  children,
  maxHeight,
}: Props) {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === "dark";
  const [visible, setVisible] = useAtom(visibleSectionsAtom);

  const onClose = () => setVisible((prev) => prev.filter((s) => s !== id));

  return (
    <Box
      sx={{
        width: "100%",
        borderRadius: 1.5,
        border: "1.5px solid",
        borderColor: isDarkMode
          ? "rgba(255,255,255,0.12)"
          : "rgba(255,107,53,0.25)",
        backgroundColor: isDarkMode
          ? "rgba(255,255,255,0.03)"
          : "rgba(255,248,245,0.6)",
        overflow: "hidden",
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{
          px: 1.25,
          py: 0.5,
          borderBottom: "1px solid",
          borderColor: isDarkMode
            ? "rgba(255,255,255,0.08)"
            : "rgba(255,107,53,0.15)",
        }}
      >
        <Stack direction="row" spacing={0.75} alignItems="center">
          <Icon icon={icon} height={14} />
          <Typography
            variant="subtitle2"
            sx={{ fontSize: "0.8rem", fontWeight: 600 }}
          >
            {title}
          </Typography>
        </Stack>
        <IconButton
          size="small"
          onClick={onClose}
          sx={{ width: 22, height: 22, color: "text.secondary" }}
        >
          <Icon icon="mdi:close" height={14} />
        </IconButton>
      </Stack>
      <Box
        sx={{
          p: 1,
          maxHeight,
          overflowY: maxHeight ? "auto" : "visible",
          scrollbarWidth: "thin",
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
