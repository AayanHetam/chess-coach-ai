import NavLink from "@/components/NavLink";
import { Icon } from "@iconify/react";
import {
  Box,
  Divider,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
} from "@mui/material";
import ChatHistoryList from "@/components/chat/ChatHistoryList";
import { useViewer } from "@/hooks/useViewer";

const MenuOptions = [
  { text: "Home", icon: "mdi:home-outline", href: "/" },
  { text: "Play", icon: "streamline:chess-pawn", href: "/play" },
  { text: "Analysis", icon: "streamline:magnifying-glass-solid", href: "/analysis" },
  {
    text: "Practice",
    icon: "mdi:puzzle",
    href: "/practice",
  },
  {
    text: "Openings",
    icon: "mdi:book-open-variant",
    href: "/openings",
  },
  {
    text: "Scout",
    icon: "mdi:binoculars",
    href: "/scout",
  },
  {
    text: "Database",
    icon: "streamline:database",
    href: "/database",
  },
  {
    text: "Player Feedback",
    icon: "streamline:chart-line-up",
    href: "/feedback",
  },
  {
    text: "Site Stats",
    icon: "mdi:chart-line",
    href: "/site-stats",
  },
  {
    text: "Profile",
    icon: "mdi:account-circle-outline",
    href: "/profile",
  },
];

// Resolved 2026-05-17: when isIntern, hide everything except these three.
// Profile + account settings stay reachable via the UserMenu avatar dropdown,
// not the burger nav, to remove noise from the daily flag-and-author surface.
const INTERN_VISIBLE_HREFS = new Set(["/", "/play", "/analysis"]);

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function NavMenu({ open, onClose }: Props) {
  const { isIntern } = useViewer();
  const items = isIntern
    ? MenuOptions.filter((o) => INTERN_VISIBLE_HREFS.has(o.href))
    : MenuOptions;

  return (
    <Drawer anchor="left" open={open} onClose={onClose}>
      <Toolbar />
      <Box sx={{ width: 280, display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
        <List sx={{ flexShrink: 0 }}>
          {items.map(({ text, icon, href }) => (
            <ListItem key={text} disablePadding sx={{ margin: 0.7 }}>
              <NavLink href={href}>
                <ListItemButton onClick={onClose}>
                  <ListItemIcon style={{ paddingLeft: "0.5em" }}>
                    <Icon icon={icon} height="1.5em" />
                  </ListItemIcon>
                  <ListItemText primary={text} />
                </ListItemButton>
              </NavLink>
            </ListItem>
          ))}
        </List>
        <Divider sx={{ flexShrink: 0 }} />
        <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          <ChatHistoryList onNavigate={onClose} />
        </Box>
      </Box>
    </Drawer>
  );
}
