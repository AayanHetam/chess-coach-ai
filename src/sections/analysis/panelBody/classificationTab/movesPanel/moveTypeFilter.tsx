import { Box, Chip, Stack, Typography } from "@mui/material";
import { MoveClassification } from "@/types/enums";
import { CLASSIFICATION_COLORS } from "@/constants";
import { useState } from "react";
import Image from "next/image";

interface Props {
  onFilterChange: (selectedTypes: MoveClassification[]) => void;
}

// Chess.com-style move type labels and descriptions
const MOVE_TYPE_INFO: Record<MoveClassification, { label: string; description: string }> = {
  [MoveClassification.Brilliant]: { label: "Brilliant", description: "Excellent piece sacrifice" },
  [MoveClassification.Great]: { label: "Great", description: "Critical move for game outcome" },
  [MoveClassification.Best]: { label: "Best", description: "Engine's top choice" },
  [MoveClassification.Excellent]: { label: "Excellent", description: "Very strong move" },
  [MoveClassification.Good]: { label: "Good", description: "Solid move" },
  [MoveClassification.Okay]: { label: "Okay", description: "Acceptable move" },
  [MoveClassification.Opening]: { label: "Opening", description: "Book opening move" },
  [MoveClassification.Inaccuracy]: { label: "Inaccuracy", description: "Slight mistake" },
  [MoveClassification.Mistake]: { label: "Mistake", description: "Significant error" },
  [MoveClassification.Blunder]: { label: "Blunder", description: "Major mistake" },
  [MoveClassification.Miss]: { label: "Miss", description: "Missed opportunity" },
  [MoveClassification.Forced]: { label: "Forced", description: "Only legal move" },
};

// Order similar to Chess.com
const FILTER_ORDER: MoveClassification[] = [
  MoveClassification.Brilliant,
  MoveClassification.Great,
  MoveClassification.Best,
  MoveClassification.Excellent,
  MoveClassification.Good,
  MoveClassification.Okay,
  MoveClassification.Opening,
  MoveClassification.Inaccuracy,
  MoveClassification.Mistake,
  MoveClassification.Blunder,
  MoveClassification.Miss,
  MoveClassification.Forced,
];

export default function MoveTypeFilter({ onFilterChange }: Props) {
  const [selectedTypes, setSelectedTypes] = useState<MoveClassification[]>(FILTER_ORDER);

  const handleTypeToggle = (type: MoveClassification) => {
    const newSelected = selectedTypes.includes(type)
      ? selectedTypes.filter(t => t !== type)
      : [...selectedTypes, type];
    
    setSelectedTypes(newSelected);
    onFilterChange(newSelected);
  };

  const handleSelectAll = () => {
    setSelectedTypes(FILTER_ORDER);
    onFilterChange(FILTER_ORDER);
  };

  const handleSelectNone = () => {
    setSelectedTypes([]);
    onFilterChange([]);
  };

  return (
    <Box sx={{ mb: 1, p: 0.5 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={0.5}>
        <Typography variant="caption" fontWeight="bold" color="text.secondary">
          Filter Moves
        </Typography>
        <Stack direction="row" spacing={0.3}>
          <Chip
            label="All"
            size="small"
            variant={selectedTypes.length === FILTER_ORDER.length ? "filled" : "outlined"}
            onClick={handleSelectAll}
            sx={{ fontSize: '0.6rem', height: '20px', minWidth: '30px' }}
          />
          <Chip
            label="None"
            size="small"
            variant={selectedTypes.length === 0 ? "filled" : "outlined"}
            onClick={handleSelectNone}
            sx={{ fontSize: '0.6rem', height: '20px', minWidth: '30px' }}
          />
        </Stack>
      </Stack>
      
      <Stack direction="row" flexWrap="wrap" gap={0.3}>
        {FILTER_ORDER.map((type) => {
          const isSelected = selectedTypes.includes(type);
          const info = MOVE_TYPE_INFO[type];
          
          return (
            <Chip
              key={type}
              label={info.label}
              size="small"
              variant={isSelected ? "filled" : "outlined"}
              onClick={() => handleTypeToggle(type)}
              sx={{
                fontSize: '0.6rem',
                height: '22px',
                backgroundColor: isSelected ? CLASSIFICATION_COLORS[type] : 'transparent',
                color: isSelected ? 'white' : CLASSIFICATION_COLORS[type],
                borderColor: CLASSIFICATION_COLORS[type],
                '&:hover': {
                  backgroundColor: isSelected ? CLASSIFICATION_COLORS[type] : `${CLASSIFICATION_COLORS[type]}20`,
                },
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                minWidth: '40px',
              }}
              icon={
                <Image
                  src={`/icons/${type}.png`}
                  alt={type}
                  width={10}
                  height={10}
                  style={{ filter: isSelected ? 'brightness(0) invert(1)' : 'none' }}
                />
              }
              title={info.description}
            />
          );
        })}
      </Stack>
    </Box>
  );
} 