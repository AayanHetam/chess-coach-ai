import { Button, Typography } from "@mui/material";
import { useState } from "react";
import NewGameDialog from "./loadGameDialog";
import { Chess } from "chess.js";
import { useUsernameSavedNote } from "@/components/ui/UsernameSavedNote";

interface Props {
  setGame?: (game: Chess) => Promise<void>;
  label?: string;
  size?: "small" | "medium" | "large";
}

export default function LoadGameButton({ setGame, label, size }: Props) {
  const [openDialog, setOpenDialog] = useState(false);
  const savedNote = useUsernameSavedNote();

  return (
    <>
      <Button
        variant="contained"
        onClick={() => setOpenDialog(true)}
        size={size}
      >
        <Typography fontSize="0.9em" fontWeight="500" lineHeight="1.4em">
          {label || "Add game"}
        </Typography>
      </Button>

      <NewGameDialog
        open={openDialog}
        onClose={() => setOpenDialog(false)}
        setGame={setGame}
        onUsernameSaved={savedNote.show}
      />
      {savedNote.element}
    </>
  );
}
