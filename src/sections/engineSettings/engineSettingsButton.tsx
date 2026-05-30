import { Fab } from "@mui/material";
import { useState } from "react";
import dynamic from "next/dynamic";
import { Icon } from "@iconify/react";

// The dialog imports the Stockfish16_1 engine class (worker init code,
// arrow-overlay options, the full settings UI tree) — none of that is
// needed until the user actually clicks the FAB. Defer the load so
// /analysis's initial bundle doesn't carry it.
const EngineSettingsDialog = dynamic(() => import("./engineSettingsDialog"), {
  ssr: false,
});

export default function EngineSettingsButton() {
  const [openDialog, setOpenDialog] = useState(false);
  // Gate the dynamic-import render on first open. Without this gate,
  // <EngineSettingsDialog open={false}> would still mount the dynamic
  // wrapper on initial /analysis mount and fetch the chunk anyway —
  // defeating the deferral. Once `hasEverOpened` flips true we keep
  // the dialog component mounted so close/reopen is instant.
  const [hasEverOpened, setHasEverOpened] = useState(false);

  return (
    <>
      <Fab
        title="Engine settings"
        color="secondary"
        size="small"
        sx={{
          top: "auto",
          right: 16,
          bottom: 16,
          left: "auto",
          position: "fixed",
        }}
        onClick={() => {
          setHasEverOpened(true);
          setOpenDialog(true);
        }}
      >
        <Icon icon="mdi:settings" height={20} />
      </Fab>

      {hasEverOpened && (
        <EngineSettingsDialog
          open={openDialog}
          onClose={() => setOpenDialog(false)}
        />
      )}
    </>
  );
}
