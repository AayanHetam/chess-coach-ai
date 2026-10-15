import { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Box,
  ToggleButtonGroup,
  ToggleButton,
  Alert,
} from "@mui/material";
import { Upload } from "lucide-react";
import { parsePgnToRepertoire, validatePgn } from "@/lib/repertoireParser";
import type { OpeningRepertoire } from "@/types/openings";
import { FONT_MONO, TEXT, TYPE } from "@/theme/tokens";

interface RepertoireImportProps {
  open: boolean;
  onClose: () => void;
  onImport: (repertoire: OpeningRepertoire) => void;
}

export default function RepertoireImport({
  open,
  onClose,
  onImport,
}: RepertoireImportProps) {
  const [pgn, setPgn] = useState("");
  const [name, setName] = useState("");
  const [color, setColor] = useState<"white" | "black">("white");
  const [error, setError] = useState<string | null>(null);
  const [validationInfo, setValidationInfo] = useState<string | null>(null);

  const handleValidate = () => {
    setError(null);
    setValidationInfo(null);
    const result = validatePgn(pgn);
    if (result.valid) {
      setValidationInfo(`Valid PGN with ${result.moveCount} moves`);
    } else {
      setError(result.error || "Invalid PGN");
    }
  };

  const handleImport = () => {
    setError(null);
    const repertoire = parsePgnToRepertoire(pgn, name || undefined, color);
    if (!repertoire) {
      setError("Could not parse PGN into a repertoire. Check the format.");
      return;
    }
    onImport(repertoire);
    handleClose();
  };

  const handleClose = () => {
    setPgn("");
    setName("");
    setColor("white");
    setError(null);
    setValidationInfo(null);
    onClose();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text === "string") {
        setPgn(text);
        setError(null);
        setValidationInfo(null);
      }
    };
    reader.readAsText(file);
  };

  return (
    // The paper, the scrim, the inputs, the toggle group, the alerts and the
    // buttons are all styled by the theme.
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Import a PGN repertoire</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2, color: TEXT.secondary }}>
          Paste your PGN or upload a .pgn file. The moves become flashcard-style
          drills with spaced repetition.
        </Typography>

        <TextField
          label="Repertoire name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          fullWidth
          size="small"
          sx={{ mb: 2 }}
          placeholder="My Sicilian setup"
        />

        <Typography
          sx={{
            ...TYPE.label,
            color: TEXT.secondary,
            mb: 0.5,
            display: "block",
          }}
        >
          Which color are you practicing?
        </Typography>
        <ToggleButtonGroup
          value={color}
          exclusive
          onChange={(_, val) => val && setColor(val)}
          size="small"
          sx={{ mb: 2 }}
        >
          <ToggleButton value="white" sx={{ px: 3 }}>
            White
          </ToggleButton>
          <ToggleButton value="black" sx={{ px: 3 }}>
            Black
          </ToggleButton>
        </ToggleButtonGroup>

        <TextField
          label="PGN"
          value={pgn}
          onChange={(e) => {
            setPgn(e.target.value);
            setError(null);
            setValidationInfo(null);
          }}
          fullWidth
          multiline
          rows={8}
          placeholder={
            '[Event "My Repertoire"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6'
          }
          sx={{ mb: 1, "& .MuiInputBase-input": { fontFamily: FONT_MONO } }}
        />

        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
          <Button
            component="label"
            variant="text"
            startIcon={<Upload size={16} strokeWidth={1.75} aria-hidden />}
            size="small"
          >
            Upload .pgn file
            <input
              type="file"
              accept=".pgn,.txt"
              hidden
              onChange={handleFileUpload}
            />
          </Button>
          <Button
            variant="text"
            size="small"
            onClick={handleValidate}
            disabled={!pgn.trim()}
          >
            Validate
          </Button>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 1 }}>
            {error}
          </Alert>
        )}
        {validationInfo && (
          <Alert severity="success" sx={{ mb: 1 }}>
            {validationInfo}
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="text" onClick={handleClose}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleImport}
          disabled={!pgn.trim()}
        >
          Import and drill
        </Button>
      </DialogActions>
    </Dialog>
  );
}
