'use client';

import React, { useState } from 'react';
import { Box, Grid, Paper, IconButton, Button, ButtonGroup } from '@mui/material';
import { Chessboard } from 'react-chessboard';
import { Chess, Square } from 'chess.js';
import AICoachChat from '@/components/AICoachChat';
import FlipCameraAndroidIcon from '@mui/icons-material/FlipCameraAndroid';
import EditIcon from '@mui/icons-material/Edit';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';

export default function CoachPage() {
  const [game, setGame] = useState(new Chess());
  const [position, setPosition] = useState(game.fen());
  const [isAnalysisMode, setIsAnalysisMode] = useState(false);
  const [boardOrientation, setBoardOrientation] = useState<'white' | 'black'>('white');

  const handlePieceDrop = (sourceSquare: string, targetSquare: string) => {
    if (isAnalysisMode) {
      // In analysis mode, just update the position without move validation
      const newGame = new Chess(position);
      newGame.move({
        from: sourceSquare as Square,
        to: targetSquare as Square,
        promotion: 'q', // Always promote to queen for simplicity
      });
      setPosition(newGame.fen());
      return true;
    }

    try {
      const move = game.move({
        from: sourceSquare as Square,
        to: targetSquare as Square,
        promotion: 'q', // Always promote to queen for simplicity
      });

      if (move === null) return false;
      setPosition(game.fen());
      return true;
    } catch (error) {
      return false;
    }
  };

  const handleKeyPress = (e: KeyboardEvent) => {
    // Implement keyboard shortcuts for piece placement
    const key = e.key.toLowerCase();
    const pieceMap: { [key: string]: string } = {
      'p': 'P', // pawn
      'n': 'N', // knight
      'b': 'B', // bishop
      'r': 'R', // rook
      'q': 'Q', // queen
      'k': 'K', // king
    };

    if (pieceMap[key]) {
      // Get the current square under the mouse
      const square = document.elementFromPoint(e.clientX, e.clientY)?.getAttribute('data-square');
      if (square) {
        const color = game.turn();
        const piece = color === 'w' ? pieceMap[key] : pieceMap[key].toLowerCase();
        game.put({ type: piece.toLowerCase() as any, color }, square as Square);
        setPosition(game.fen());
      }
    }
  };

  const handleFlipBoard = () => {
    setBoardOrientation(prev => prev === 'white' ? 'black' : 'white');
  };

  const handleResetBoard = () => {
    const newGame = new Chess();
    setGame(newGame);
    setPosition(newGame.fen());
  };

  // Add keyboard event listener
  React.useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [game]);

  return (
    <Box sx={{ height: '100vh', p: 2 }}>
      <Grid container spacing={2} sx={{ height: '100%' }}>
        <Grid item xs={12} md={8}>
          <Paper elevation={3} sx={{ height: '100%', p: 2, display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <ButtonGroup variant="contained" size="small">
                <Button
                  startIcon={isAnalysisMode ? <PlayArrowIcon /> : <EditIcon />}
                  onClick={() => setIsAnalysisMode(!isAnalysisMode)}
                >
                  {isAnalysisMode ? 'Game Mode' : 'Analysis Mode'}
                </Button>
                <Button onClick={handleResetBoard}>
                  Reset Board
                </Button>
              </ButtonGroup>
              <IconButton onClick={handleFlipBoard} color="primary">
                <FlipCameraAndroidIcon />
              </IconButton>
            </Box>
            <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <Chessboard
                position={position}
                onPieceDrop={handlePieceDrop}
                boardWidth={600}
                boardOrientation={boardOrientation}
                arePiecesDraggable={true}
                areArrowsAllowed={isAnalysisMode}
                showBoardNotation={true}
              />
            </Box>
          </Paper>
        </Grid>
        <Grid item xs={12} md={4}>
          <AICoachChat position={position} />
        </Grid>
      </Grid>
    </Box>
  );
} 