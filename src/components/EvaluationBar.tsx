import React from 'react';
import { Box, Typography, LinearProgress } from '@mui/material';
import { styled } from '@mui/material/styles';

interface EvaluationBarProps {
  evaluation: number; // Centipawns, positive means white is better, negative means black is better
  maxEvaluation?: number; // Maximum evaluation to show on the scale
}

const EvaluationContainer = styled(Box)(({ theme }) => ({
  width: '100%',
  padding: theme.spacing(1),
  backgroundColor: theme.palette.background.paper,
  borderRadius: theme.shape.borderRadius,
}));

const StyledLinearProgress = styled(LinearProgress)(({ theme }) => ({
  height: 12,
  borderRadius: 6,
  backgroundColor: '#000000',
  '& .MuiLinearProgress-bar': {
    borderRadius: 6,
    backgroundColor: '#ffffff',
  },
}));

const EvaluationBar: React.FC<EvaluationBarProps> = ({ 
  evaluation, 
  maxEvaluation = 500 // Default max evaluation of 5 pawns
}) => {
  // Check if this is a mate score (very large evaluation)
  const isMate = Math.abs(evaluation) >= 10000;
  
  // For mate scores, we'll use a fixed percentage
  const normalizedEvaluation = isMate ? maxEvaluation : Math.min(Math.abs(evaluation), maxEvaluation);
  const percentage = (normalizedEvaluation / maxEvaluation) * 100;
  
  // Determine if white or black is better
  const isWhiteBetter = evaluation > 0;
  
  // Format the evaluation for display
  const formatEvaluation = (evalValue: number) => {
    if (isMate) {
      const mateValue = Math.abs(evalValue) === 10000 ? 1 : Math.abs(evalValue) / 10000;
      return `M${mateValue}`;
    }
    const pawns = Math.abs(evalValue) / 100;
    return `${isWhiteBetter ? '+' : '-'}${pawns.toFixed(1)}`;
  };

  // Calculate the actual percentage for the progress bar
  // When white is better, we want more white space
  // When black is better, we want more black space
  const progressPercentage = isWhiteBetter ? 50 + (percentage / 2) : 50 - (percentage / 2);

  return (
    <EvaluationContainer>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="body2" color="text.secondary">
          Black
        </Typography>
        <Typography 
          variant="body2" 
          color={isMate ? 'error' : 'text.secondary'} 
          sx={{ fontWeight: 'bold' }}
        >
          {formatEvaluation(evaluation)}
        </Typography>
      </Box>
      <StyledLinearProgress
        variant="determinate"
        value={progressPercentage}
        sx={{
          '& .MuiLinearProgress-bar': {
            backgroundColor: isMate ? '#ff0000' : '#ffffff',
            transform: 'none',
          },
        }}
      />
    </EvaluationContainer>
  );
};

export default EvaluationBar; 