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
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: "1.5rem",
          background: "linear-gradient(180deg, rgba(20,22,28,0.92), rgba(12,14,20,0.92))",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
          color: "rgba(255,255,255,0.94)",
        },
      }}
      slotProps={{
        backdrop: {
          sx: {
            backgroundColor: "rgba(8,9,12,0.72)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          },
        },
      }}
    >
      <DialogTitle sx={{ fontWeight: 700, color: "rgba(255,255,255,0.94)" }}>Import PGN Repertoire</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2, color: "rgba(255,255,255,0.62)" }}>
          Paste your PGN or upload a .pgn file. The moves will be converted into
          flashcard-style drills with spaced repetition.
        </Typography>

        <TextField
          label="Repertoire Name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          fullWidth
          size="small"
          sx={{
            mb: 2,
            "& .MuiOutlinedInput-root": {
              bgcolor: "rgba(255,255,255,0.03)",
              "& fieldset": { borderColor: "rgba(255,255,255,0.1)" },
              "&:hover fieldset": { borderColor: "rgba(255,255,255,0.2)" },
              "&.Mui-focused fieldset": { borderColor: "rgba(249,115,22,0.55)" },
            },
            "& .MuiInputLabel-root": {
              color: "rgba(255,255,255,0.55)",
              "&.Mui-focused": { color: "#FB923C" },
            },
            "& .MuiInputBase-input": { color: "rgba(255,255,255,0.94)" },
            "& .MuiInputBase-input::placeholder": { color: "rgba(255,255,255,0.4)", opacity: 1 },
          }}
          placeholder="e.g., My Sicilian Setup"
        />

        <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.62)", mb: 0.5, display: "block" }}>
          Which color are you practicing?
        </Typography>
        <ToggleButtonGroup
          value={color}
          exclusive
          onChange={(_, val) => val && setColor(val)}
          size="small"
          sx={{
            mb: 2,
            bgcolor: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: "999px",
            p: 0.5,
            "& .MuiToggleButtonGroup-grouped": {
              border: 0,
              borderRadius: "999px !important",
              color: "rgba(255,255,255,0.62)",
              "&.Mui-selected": {
                bgcolor: "rgba(249,115,22,0.18)",
                border: "1px solid rgba(249,115,22,0.4)",
                color: "#FB923C",
                "&:hover": { bgcolor: "rgba(249,115,22,0.18)" },
              },
            },
          }}
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
          sx={{
            mb: 1,
            "& .MuiOutlinedInput-root": {
              bgcolor: "rgba(255,255,255,0.03)",
              "& fieldset": { borderColor: "rgba(255,255,255,0.1)" },
              "&:hover fieldset": { borderColor: "rgba(255,255,255,0.2)" },
              "&.Mui-focused fieldset": { borderColor: "rgba(249,115,22,0.55)" },
            },
            "& .MuiInputLabel-root": {
              color: "rgba(255,255,255,0.55)",
              "&.Mui-focused": { color: "#FB923C" },
            },
            "& .MuiInputBase-input": {
              color: "rgba(255,255,255,0.94)",
              fontFamily: "Monaco, Menlo, monospace",
            },
            "& .MuiInputBase-input::placeholder": { color: "rgba(255,255,255,0.4)", opacity: 1 },
          }}
        />

        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
          <Button
            component="label"
            variant="text"
            startIcon={<UploadFileIcon sx={{ color: "#FB923C" }} />}
            size="small"
            sx={{
              textTransform: "none",
              color: "rgba(255,255,255,0.8)",
              "&:hover": { bgcolor: "rgba(255,255,255,0.04)" },
              "&.Mui-disabled": { color: "rgba(255,255,255,0.4)" },
            }}
          >
            Upload .pgn file
            <input type="file" accept=".pgn,.txt" hidden onChange={handleFileUpload} />
          </Button>
          <Button
            variant="text"
            size="small"
            onClick={handleValidate}
            disabled={!pgn.trim()}
            sx={{
              textTransform: "none",
              color: "rgba(255,255,255,0.8)",
              "&:hover": { bgcolor: "rgba(255,255,255,0.04)" },
              "&.Mui-disabled": { color: "rgba(255,255,255,0.4)" },
            }}
          >
            Validate
          </Button>
        </Box>

        {error && (
          <Alert
            severity="error"
            sx={{
              mb: 1,
              bgcolor: "rgba(248,113,113,0.12)",
              color: "#FCA5A5",
              border: "1px solid rgba(248,113,113,0.35)",
              borderRadius: "12px",
              "& .MuiAlert-icon": { color: "#FCA5A5" },
            }}
          >
            {error}
          </Alert>
        )}
        {validationInfo && (
          <Alert
            severity="success"
            sx={{
              mb: 1,
              bgcolor: "rgba(74,222,128,0.12)",
              color: "#86EFAC",
              border: "1px solid rgba(74,222,128,0.35)",
              borderRadius: "12px",
              "& .MuiAlert-icon": { color: "#86EFAC" },
            }}
          >
            {validationInfo}
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button
          onClick={handleClose}
          sx={{
            textTransform: "none",
            color: "rgba(255,255,255,0.62)",
            "&:hover": { color: "rgba(255,255,255,0.9)" },
          }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleImport}
          disabled={!pgn.trim()}
          sx={{
            textTransform: "none",
            fontWeight: 700,
            bgcolor: "#F97316",
            color: "#0A0A0A",
            borderRadius: "999px",
            boxShadow: "0 6px 18px rgba(249,115,22,0.32)",
            "&:hover": { bgcolor: "#FB923C" },
            "&.Mui-disabled": {
              bgcolor: "rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.4)",
              boxShadow: "none",
            },
          }}
        >
          Import & Drill
        </Button>
      </DialogActions>
    </Dialog>
  );
}
