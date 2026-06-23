import { FormControl, TextField, useTheme } from "@mui/material";
import { glassInputSx } from "./glassTheme";

interface Props {
  pgn: string;
  setPgn: (pgn: string) => void;
}

export default function GamePgnInput({ pgn, setPgn }: Props) {
  const dark = useTheme().palette.mode === "dark";
  return (
    <FormControl fullWidth>
      <TextField
        label="Enter PGN here..."
        variant="outlined"
        multiline
        value={pgn}
        onChange={(e) => setPgn(e.target.value)}
        sx={glassInputSx(dark)}
      />
    </FormControl>
  );
}
