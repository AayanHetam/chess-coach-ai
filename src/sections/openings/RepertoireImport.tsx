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
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { parsePgnToRepertoire, validatePgn } from "@/lib/repertoireParser";
import type { OpeningRepertoire } from "@/types/openings";

interface RepertoireImportProps {
  open: boolean;
  onClose: () => void;
  onImport: (repertoire: OpeningRepertoire) => void;
}

export default function RepertoireImport({ open, onClose, onImport }: RepertoireImportProps) {
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
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ fontWeight: 700 }}>Import PGN Repertoire</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Paste your PGN or upload a .pgn file. The moves will be converted into
          flashcard-style drills with spaced repetition.
        </Typography>

        <TextField
          label="Repertoire Name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          fullWidth
          size="small"
          sx={{ mb: 2 }}
          placeholder="e.g., My Sicilian Setup"
        />

        <Typography variant="caption" sx={{ color: "grey.500", mb: 0.5, display: "block" }}>
          Which color are you practicing?
        </Typography>
        <ToggleButtonGroup
          value={color}
          exclusive
          onChange={(_, val) => val && setColor(val)}
          size="small"
          sx={{ mb: 2 }}
        >
          <ToggleButton value="white" sx={{ textTransform: "none", px: 3 }}>White</ToggleButton>
          <ToggleButton value="black" sx={{ textTransform: "none", px: 3 }}>Black</ToggleButton>
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
          placeholder={'[Event "My Repertoire"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6...'}
          sx={{ mb: 1, fontFamily: "monospace" }}
        />

        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
          <Button
            component="label"
            variant="text"
            startIcon={<UploadFileIcon />}
            size="small"
            sx={{ textTransform: "none" }}
          >
            Upload .pgn file
            <input type="file" accept=".pgn,.txt" hidden onChange={handleFileUpload} />
          </Button>
          <Button
            variant="text"
            size="small"
            onClick={handleValidate}
            disabled={!pgn.trim()}
            sx={{ textTransform: "none" }}
          >
            Validate
          </Button>
        </Box>

        {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
        {validationInfo && <Alert severity="success" sx={{ mb: 1 }}>{validationInfo}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} sx={{ textTransform: "none" }}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleImport}
          disabled={!pgn.trim()}
          sx={{ textTransform: "none", fontWeight: 700 }}
        >
          Import & Drill
        </Button>
      </DialogActions>
    </Dialog>
  );
}
