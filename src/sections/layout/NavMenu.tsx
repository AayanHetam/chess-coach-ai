import NavLink from "@/components/NavLink";
import { Icon } from "@iconify/react";
import {
  Box,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
} from "@mui/material";

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

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function NavMenu({ open, onClose }: Props) {
  return (
    <Drawer anchor="left" open={open} onClose={onClose}>
      <Toolbar />
      <Box sx={{ width: 250, overflow: "hidden" }}>
        <List>
          {MenuOptions.map(({ text, icon, href }) => (
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
      </Box>
    </Drawer>
  );
}
