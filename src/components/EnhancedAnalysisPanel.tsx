import React, { useState, useEffect } from 'react';
import { useAtom } from 'jotai';
import { Chess } from 'chess.js';
import { useEnhancedFenTracker } from '@/hooks/useEnhancedFenTracker';
import { PositionData } from '@/lib/enhancedFenTracker';
import { ChessAnalysisRequest } from '@/lib/enhancedOpenAIService';

interface EnhancedAnalysisPanelProps {
  gameAtom: any;
  openAIApiKey?: string;
  className?: string;
}

export const EnhancedAnalysisPanel: React.FC<EnhancedAnalysisPanelProps> = ({
  gameAtom,
  openAIApiKey,
  className = '',
}) => {
  const [game] = useAtom(gameAtom);
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedAnalysisType, setSelectedAnalysisType] = useState<ChessAnalysisRequest['analysisType']>('move_explanation');
  const [analysisResults, setAnalysisResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const {
    gameState,
    analyzeCurrentPosition,
    reviewEntireGame,
    exportTrainingData,
    getPositionAtMove,
    getMoveSequence,
    getPositionSequence,
  } = useEnhancedFenTracker(gameAtom, {
    enableRealTimeTracking: true,
    enableAIAnalysis: !!openAIApiKey,
    openAIApiKey,
    analysisInterval: 3000,
    maxPositionsToTrack: 500,
  });

  const handleAnalyzePosition = async () => {
    if (!openAIApiKey) {
      alert('OpenAI API key is required for analysis');
      return;
    }

    setIsLoading(true);
    try {
      const result = await analyzeCurrentPosition(selectedAnalysisType);
      if (result) {
        setAnalysisResults(prev => [result, ...prev.slice(0, 9)]); // Keep last 10 results
      }
    } catch (error) {
      console.error('Analysis failed:', error);
      alert('Analysis failed. Please check your API key and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReviewGame = async () => {
    if (!openAIApiKey) {
      alert('OpenAI API key is required for game review');
      return;
    }

    setIsLoading(true);
    try {
      const result = await reviewEntireGame((game as Chess).turn());
      if (result) {
        setAnalysisResults(prev => [result, ...prev.slice(0, 9)]);
      }
    } catch (error) {
      console.error('Game review failed:', error);
      alert('Game review failed. Please check your API key and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportData = () => {
    const data = exportTrainingData();
    if (data) {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chess-training-data-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const formatPositionMetadata = (metadata: PositionData['positionMetadata']) => {
    return {
      'Game Phase': metadata.gamePhase,
      'In Check': metadata.isInCheck ? 'Yes' : 'No',
      'Legal Moves': metadata.legalMovesCount,
      'Material (W)': `${metadata.materialCount.white.pawns}P ${metadata.materialCount.white.knights}N ${metadata.materialCount.white.bishops}B ${metadata.materialCount.white.rooks}R ${metadata.materialCount.white.queens}Q`,
      'Material (B)': `${metadata.materialCount.black.pawns}P ${metadata.materialCount.black.knights}N ${metadata.materialCount.black.bishops}B ${metadata.materialCount.black.rooks}R ${metadata.materialCount.black.queens}Q`,
    };
  };

  return (
    <div className={`bg-white border border-gray-200 rounded-lg shadow-sm ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            Enhanced Analysis Panel
          </h3>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-gray-500 hover:text-gray-700"
          >
            {isExpanded ? '−' : '+'}
          </button>
        </div>
        
        {/* Quick Stats */}
        <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
          <div className="text-center">
            <div className="font-semibold text-blue-600">{gameState.gameSummary.totalMoves}</div>
            <div className="text-gray-500">Moves</div>
          </div>
          <div className="text-center">
            <div className="font-semibold text-green-600">{gameState.gameSummary.totalPositions}</div>
            <div className="text-gray-500">Positions</div>
          </div>
          <div className="text-center">
            <div className="font-semibold text-purple-600">{gameState.gameSummary.gameResult}</div>
            <div className="text-gray-500">Status</div>
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* Current Position Info */}
          {gameState.currentPosition && (
            <div className="bg-gray-50 p-3 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-2">Current Position</h4>
              <div className="text-xs font-mono bg-white p-2 rounded border">
                {gameState.currentPosition.fen}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                {Object.entries(formatPositionMetadata(gameState.currentPosition.positionMetadata)).map(([key, value]) => (
                  <div key={key} className="flex justify-between">
                    <span className="text-gray-600">{key}:</span>
                    <span className="font-medium">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Analysis Controls */}
          <div className="space-y-3">
            <h4 className="font-medium text-gray-900">AI Analysis</h4>
            
            <div className="flex gap-2">
              <select
                value={selectedAnalysisType}
                onChange={(e) => setSelectedAnalysisType(e.target.value as ChessAnalysisRequest['analysisType'])}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="move_explanation">Move Explanation</option>
                <option value="position_evaluation">Position Evaluation</option>
                <option value="strategic_advice">Strategic Advice</option>
                <option value="opening_analysis">Opening Analysis</option>
                <option value="endgame_analysis">Endgame Analysis</option>
              </select>
              
              <button
                onClick={handleAnalyzePosition}
                disabled={isLoading || !openAIApiKey}
                className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Analyzing...' : 'Analyze Position'}
              </button>
            </div>

            <button
              onClick={handleReviewGame}
              disabled={isLoading || !openAIApiKey || gameState.allPositions.length < 2}
              className="w-full px-4 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Reviewing...' : 'Review Entire Game'}
            </button>

            <button
              onClick={handleExportData}
              className="w-full px-4 py-2 bg-purple-600 text-white rounded-md text-sm hover:bg-purple-700"
            >
              Export Training Data
            </button>
          </div>

          {/* Analysis Results */}
          {analysisResults.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-medium text-gray-900">Recent Analysis</h4>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {analysisResults.map((result, index) => (
                  <div key={index} className="bg-gray-50 p-3 rounded-lg text-sm">
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-medium text-gray-900">
                        {result.analysis?.modelUsed || 'Game Review'}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date().toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="text-gray-700">
                      {result.analysis?.analysis || result.overallAssessment || 'Analysis completed'}
                    </div>
                    {result.processingTime && (
                      <div className="text-xs text-gray-500 mt-1">
                        Processed in {result.processingTime}ms
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Position History Preview */}
          {gameState.allPositions.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-medium text-gray-900">Position History</h4>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {gameState.allPositions.slice(-5).map((pos, index) => (
                  <div key={index} className="flex items-center justify-between text-xs bg-gray-50 p-2 rounded">
                    <span className="font-mono">
                      {pos.moveNumber}.{pos.halfMoveNumber % 2 === 1 ? '' : '..'}
                      {pos.movePlayed?.san || 'Start'}
                    </span>
                    <span className="text-gray-500">{pos.positionMetadata.gamePhase}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* API Status */}
          <div className="text-xs text-gray-500">
            {openAIApiKey ? (
              <span className="text-green-600">✓ OpenAI API Connected</span>
            ) : (
              <span className="text-red-600">✗ OpenAI API Key Required</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}; 