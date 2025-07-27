import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { Chess } from 'chess.js';
import { analyzePosition, compareMoves, determineGamePhase } from '@/lib/chessprinciples';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Function to create a text representation of the chess board
function createBoardText(fen: string): string {
  const chess = new Chess(fen);
  const board = chess.board();
  
  let boardText = 'Current board position:\n';
  boardText += '  a b c d e f g h\n';
  boardText += '8 ';
  
  for (let rank = 7; rank >= 0; rank--) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (piece === null) {
        boardText += '. ';
      } else {
        // Simple piece mapping
        let symbol = '';
        if (piece.color === 'w') {
          switch (piece.type) {
            case 'p': symbol = '♙'; break;
            case 'n': symbol = '♘'; break;
            case 'b': symbol = '♗'; break;
            case 'r': symbol = '♖'; break;
            case 'q': symbol = '♕'; break;
            case 'k': symbol = '♔'; break;
          }
        } else {
          switch (piece.type) {
            case 'p': symbol = '♟'; break;
            case 'n': symbol = '♞'; break;
            case 'b': symbol = '♝'; break;
            case 'r': symbol = '♜'; break;
            case 'q': symbol = '♛'; break;
            case 'k': symbol = '♚'; break;
          }
        }
        boardText += symbol + ' ';
      }
    }
    boardText += (rank + 1) + '\n';
    if (rank > 0) boardText += (rank) + ' ';
  }
  
  boardText += '  a b c d e f g h\n';
  return boardText;
}

export async function POST(req: Request) {
  try {
    // Check if API key is available
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('ANTHROPIC_API_KEY is not set');
      return NextResponse.json(
        { error: 'API key not configured' },
        { status: 500 }
      );
    }

    const { messages, position, game, responseLength = 'summary', boardOrientation = true, forceRefresh } = await req.json();
    
    // Add unique request ID to prevent caching issues
    const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    const isForceRefresh = forceRefresh === true;
    console.log(`🔄 Processing request ${requestId} with fresh system prompt${isForceRefresh ? ' (FORCE REFRESH)' : ''}`);
    
    // Log received data for debugging
    console.log('=== API REQUEST DATA ===');
    console.log('Position:', position);
    console.log('Game PGN:', game?.pgn);
    console.log('Game History:', game?.history);
    console.log('Game Moves:', game?.moves);
    console.log('Board Orientation:', boardOrientation, boardOrientation ? '(White at bottom)' : '(Black at bottom)');
    
    // Parse position to see what it contains
    if (position) {
      try {
        const testChess = new Chess(position);
        console.log('Position shows turn:', testChess.turn() === 'w' ? 'White' : 'Black');
        console.log('Position move count:', testChess.moveNumber());
        console.log('Position is starting:', position === 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
      } catch (e) {
        console.log('Position parsing error:', e);
      }
    }
    console.log('========================');

    // Convert messages to Anthropic format, filtering out system messages
    const anthropicMessages = messages
      .filter((msg: { role: string; content: string }) => msg.role !== 'system')
      .map((msg: { role: string; content: string }) => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content,
      }));

    // Create comprehensive chess context with principles analysis
    let chessContext = 'You are an advanced chess coach who explains moves through chess principles. Your goal is to help users understand WHY certain moves are better by identifying which chess principles apply.\n\n';
    
    if (position || (game && game.pgn)) {
      try {
        let chess: Chess;
        let gameSource = '';
        
        // **NEW: Smart data source selection**
        if (game && game.pgn) {
          chess = new Chess();
          try {
            chess.loadPgn(game.pgn);
            const pgnHistory = chess.history();
            
            // Check if PGN actually contains moves or just headers
            if (pgnHistory.length > 0) {
              gameSource = 'PGN';
              chessContext += `Game loaded from PGN (${pgnHistory.length} moves)\n`;
            } else {
              // PGN is empty (just headers), fall back to position
              chess = new Chess(position);
              gameSource = 'FEN (PGN was empty)';
              chessContext += `PGN contained no moves, using FEN position instead\n`;
            }
          } catch (error) {
            // PGN parsing failed, fall back to position
            chess = new Chess(position);
            gameSource = 'FEN (PGN failed)';
            chessContext += `PGN parsing failed, using FEN position instead\n`;
          }
        } else {
          chess = new Chess(position);
          gameSource = 'FEN';
          chessContext += `Position loaded from FEN\n`;
        }
        
        const fen = chess.fen();
        const boardText = createBoardText(fen);
        const isCheck = chess.isCheck();
        const isCheckmate = chess.isCheckmate();
        const isDraw = chess.isDraw();
        const isGameOver = chess.isGameOver();
        const turn = chess.turn() === 'w' ? 'White' : 'Black';
        
        chessContext += `Current FEN: ${fen}\n`;
        chessContext += `Data source: ${gameSource}\n\n`;
        
        // Create move history - prefer game.history if available, then chess.history()
        let gameHistory: string[] = [];
        
        if (game && game.history && game.history.length > 0) {
          gameHistory = game.history;
          chessContext += `Using move history from game object (${gameHistory.length} moves)\n`;
        } else {
          gameHistory = chess.history();
          if (gameHistory.length > 0) {
            chessContext += `Using move history from chess object (${gameHistory.length} moves)\n`;
          }
        }
        
        let moveHistory = 'Move History: ';
        
        if (gameHistory.length > 0) {
          // Format the move history nicely
          const moves = gameHistory.map((move: string, index: number) => {
            const moveNumber = Math.floor(index / 2) + 1;
            const isWhiteMove = index % 2 === 0;
            return isWhiteMove ? `${moveNumber}. ${move}` : `${move}`;
          }).join(' ');
          moveHistory += moves;
          
          // Also add move count for clarity
          chessContext += `Total moves played: ${gameHistory.length} (${Math.floor(gameHistory.length / 2)} full moves)\n`;
        } else {
          moveHistory += 'Starting position';
        }
        chessContext += moveHistory + '\n\n';
        
        chessContext += boardText + '\n';
        chessContext += `Current turn: ${turn}\n`;
        chessContext += `Game state: ${isCheckmate ? 'Checkmate' : isDraw ? 'Draw' : isCheck ? 'Check' : isGameOver ? 'Game Over' : 'In Progress'}\n`;
        
        // Data consistency check
        if (gameSource === 'PGN') {
          chessContext += `✅ Using PGN as authoritative source - no position/history mismatches\n`;
        }
        
        // **NEW: Smart Color Detection for Imported Games**
        let userColor: 'white' | 'black' = 'white';
        let colorDetectionExplanation = '';
        
        try {
          const { 
            getAnalysisUserColor, 
            getColorDetectionExplanation,
            shouldTrustDetectedColor 
          } = await import('@/lib/smartColorDetection');
          
          // Get game origin and search username from request or localStorage
          let gameOrigin = game?.gameOrigin || undefined;
          let searchUsername = game?.searchUsername || undefined;
          
          // If not provided in request, try to detect from game headers
          if (!gameOrigin) {
            try {
              const headers = chess.getHeaders();
              const site = headers.Site || '';
              
              if (site.toLowerCase().includes('chess.com')) {
                gameOrigin = 'chesscom';
              } else if (site.toLowerCase().includes('lichess.org')) {
                gameOrigin = 'lichess';
              }
            } catch (error) {
              console.error('Error extracting game origin:', error);
            }
          }
          
          // Detect user color using smart detection
          userColor = getAnalysisUserColor(chess, gameOrigin, searchUsername, boardOrientation);
          colorDetectionExplanation = getColorDetectionExplanation(chess, gameOrigin, searchUsername, boardOrientation);
          
          // Check if we should trust the detected color
          const shouldTrust = shouldTrustDetectedColor(chess, gameOrigin, searchUsername);
          
          if (shouldTrust) {
            chessContext += `\n=== SMART COLOR DETECTION ===\n`;
            chessContext += `${colorDetectionExplanation}\n`;
            chessContext += `Board orientation: ${userColor === 'white' ? 'White' : 'Black'} pieces at bottom\n`;
            chessContext += `If this is incorrect, please say "I played White" or "I played Black" to override.\n\n`;
          } else {
            // Fallback to manual detection for non-imported games
            userColor = boardOrientation ? 'white' : 'black';
            chessContext += `\n=== COLOR DETECTION ===\n`;
            chessContext += `Color Detection: Based on board orientation, you are playing ${userColor.toUpperCase()}.\n`;
            chessContext += `Board orientation: ${userColor === 'white' ? 'White' : 'Black'} pieces at bottom\n`;
            chessContext += `If this is incorrect, please say "I played White" or "I played Black" to override.\n\n`;
          }
          
        } catch (error) {
          console.error('Error in smart color detection:', error);
          // Fallback to manual detection
          userColor = boardOrientation ? 'white' : 'black';
          chessContext += `\n=== COLOR DETECTION ===\n`;
          chessContext += `Color Detection: Based on board orientation, you are playing ${userColor.toUpperCase()}.\n`;
          chessContext += `Board orientation: ${userColor === 'white' ? 'White' : 'Black'} pieces at bottom\n`;
          chessContext += `If this is incorrect, please say "I played White" or "I played Black" to override.\n\n`;
        }
        
        // Separate moves by color using the chess game history
        let userMoves: string[] = [];
        let opponentMoves: string[] = [];
        
        if (gameHistory.length > 0) {
          // If color not explicitly mentioned, use board orientation as primary detection method
          if (userColor === 'white') {
            // Use board orientation to determine user's color
            // boardOrientation: true = White at bottom (user is White), false = Black at bottom (user is Black)
            userMoves = gameHistory.filter((_, index) => index % 2 === 0);
            opponentMoves = gameHistory.filter((_, index) => index % 2 === 1);
          } else { // userColor === 'black'
            userMoves = gameHistory.filter((_, index) => index % 2 === 1);
            opponentMoves = gameHistory.filter((_, index) => index % 2 === 0);
          }
          
          chessContext += `\n=== PLAYER ANALYSIS ===\n`;
          chessContext += `Analyzing as: ${userColor.toUpperCase()}\n`;
          chessContext += `Your moves: ${userMoves.join(', ')}\n`;
          chessContext += `Opponent moves: ${opponentMoves.join(', ')}\n`;
        }
        
        if (isCheck) {
          chessContext += `⚠️ ${turn} is in check!\n`;
        }
        
        // Add legal moves for the current position
        const legalMoves = chess.moves();
        if (legalMoves.length > 0) {
          chessContext += `\nLegal moves: ${legalMoves.slice(0, 10).join(', ')}${legalMoves.length > 10 ? '...' : ''}\n`;
        }
        
        // **NEW: Add Chess Principles Analysis**
        try {
          const gamePhase = determineGamePhase(chess);
          const principleAnalysis = analyzePosition(chess, {
            lines: [{ pv: legalMoves.slice(0, 3), depth: 1, multiPv: 1, cp: 0 }]
          }, gameHistory);
          
          chessContext += `\n=== CURRENT POSITION ANALYSIS ===\n`;
          chessContext += `Game Phase: ${gamePhase}\n\n`;
          
          if (principleAnalysis.appliedPrinciples.length > 0) {
            chessContext += `✅ Principles Being Applied:\n`;
            principleAnalysis.appliedPrinciples.forEach(principle => {
              chessContext += `• ${principle.name}: ${principle.description}\n`;
            });
            chessContext += '\n';
          }
          
          if (principleAnalysis.violatedPrinciples.length > 0) {
            chessContext += `⚠️ Principles That Could Be Improved:\n`;
            principleAnalysis.violatedPrinciples.forEach(violation => {
              chessContext += `• ${violation.principle.name}: ${violation.description}\n`;
              chessContext += `  - Short-term: ${violation.shortTermImpact}\n`;
              chessContext += `  - Long-term: ${violation.longTermImpact}\n`;
            });
            chessContext += '\n';
          }
          
          if (principleAnalysis.suggestedMove) {
            chessContext += `💡 Suggested Move: ${principleAnalysis.suggestedMove}\n\n`;
          }

          // **NEW: Enhanced Move-by-Move Game Analysis with Comprehensive Principle Detection**
          if (gameHistory.length > 1) {
            chessContext += `\n=== COMPREHENSIVE MOVE-BY-MOVE ANALYSIS ===\n`;
            chessContext += `Found ${gameHistory.length} moves to analyze\n\n`;
            
            // Determine player skill level from accuracy
            console.log('Game accuracy data received:', game?.accuracy);
            const userAccuracy = userColor === 'white' ? game?.accuracy?.white || 50 : game?.accuracy?.black || 50;
            console.log('User color:', userColor, 'User accuracy:', userAccuracy);
            const { getSkillLevelFromAccuracy, isViolationSignificant, getSkillLevelFeedback } = await import('@/lib/chessprinciples/skillLevel');
            const skillLevel = getSkillLevelFromAccuracy(userAccuracy);
            
            chessContext += `=== SKILL-CALIBRATED ANALYSIS ===\n`;
            chessContext += `Player Accuracy: ${userAccuracy.toFixed(1)}% (${skillLevel.name} level)\n`;
            chessContext += `Focus Areas: ${skillLevel.focusAreas.join(', ')}\n`;
            chessContext += `Analysis Sensitivity: ${skillLevel.violationSensitivity.toFixed(1)} (${skillLevel.name === 'Beginner' ? 'Major errors only' : skillLevel.name === 'Expert' ? 'Very precise' : 'Moderate precision'})\n\n`;
            
            chessContext += `=== YOUR MOVE-BY-MOVE PRINCIPLES ANALYSIS ===\n`;
            chessContext += `(Analyzing YOUR moves as ${userColor.toUpperCase()})\n\n`;
            
            // **NEW: Use aggressive move-by-move analyzer that generates violations for every move**
            const { analyzeGameAggressively } = await import('@/lib/chessprinciples/aggressiveMoveAnalyzer');
            
            let aggressiveGameAnalysis;
            try {
              aggressiveGameAnalysis = await analyzeGameAggressively(gameHistory, userColor, {
                lines: [{ pv: legalMoves.slice(0, 3), depth: 1, multiPv: 1, cp: 0 }]
              });
            } catch (error) {
              console.error('Aggressive move-by-move analysis failed, using fallback:', error);
              // Create a basic analysis with move assessments
              aggressiveGameAnalysis = {
                moves: gameHistory.map((move, index) => ({
                  moveNumber: Math.floor(index / 2) + 1,
                  move,
                  isUserMove: (userColor === 'white' && index % 2 === 0) || (userColor === 'black' && index % 2 === 1),
                  allViolations: [],
                  evaluationChange: 0,
                  isBestMove: false,
                  filteredViolations: []
                })),
                topViolations: [],
                overallAssessment: 'Game analysis completed with basic assessment'
              };
            }
            
            // Show top violations by evaluation impact (always show if there are any)
            if (aggressiveGameAnalysis.topViolations.length > 0) {
              chessContext += `⚠️ TOP PRINCIPLE VIOLATIONS BY IMPACT:\n\n`;
              
              // Group violations by move for better presentation
              const violationsByMove = new Map();
              aggressiveGameAnalysis.moves.forEach((move: any) => {
                if (move.filteredViolations.length > 0) {
                  const moveKey = `${move.moveNumber}. ${move.move}`;
                  violationsByMove.set(moveKey, {
                    violations: move.filteredViolations,
                    evaluationChange: move.evaluationChange,
                    isBestMove: move.isBestMove
                  });
                }
              });
              
              // Show top violations by evaluation impact
              aggressiveGameAnalysis.topViolations.forEach((violation: any, index: number) => {
                chessContext += `**${violation.description}**\n`;
                chessContext += `Short-term: ${violation.shortTermImpact}\n`;
                chessContext += `Long-term: ${violation.longTermImpact}\n`;
                if (violation.correctMove) {
                  chessContext += `HYPOTHETICAL MOVE ${index + 1}: ${violation.correctMove}\n`;
                } else {
                  chessContext += `HYPOTHETICAL MOVE ${index + 1}: N/A (no suggestion available)\n`;
                }
                chessContext += '\n';
              });
              
              // Add debugging info
              console.log('=== VIOLATION DATA DEBUG ===');
              console.log('Top violations:', aggressiveGameAnalysis.topViolations.map((v: any, i: number) => ({
                index: i + 1,
                description: v.description,
                correctMove: v.correctMove
              })));
              
              chessContext += `=== OVERALL ASSESSMENT ===\n`;
              chessContext += `${aggressiveGameAnalysis.overallAssessment}\n\n`;
              
              // Add explicit instruction about using hypothetical moves
              chessContext += `**🚨 CRITICAL: USE HYPOTHETICAL MOVES ONLY 🚨**\n`;
              chessContext += `When suggesting fixes, you MUST use the HYPOTHETICAL MOVE X references above.\n`;
              chessContext += `DO NOT use actual game moves, opponent moves, or moves from different positions.\n`;
              chessContext += `ONLY use the specific HYPOTHETICAL MOVE X values provided.\n`;
              chessContext += `**FORMAT: "Instead, HYPOTHETICAL MOVE X would have..."**\n`;
              chessContext += `**NEVER say "Instead, a move like..." or "Instead, developing..."**\n`;
              chessContext += `**NEVER say "HYPOTHETICAL MOVE X prioritized..." or "HYPOTHETICAL MOVE X focused..."**\n`;
              chessContext += `**ALWAYS use the exact HYPOTHETICAL MOVE X reference in "Instead, ... would have..." format**\n\n`;
              
            } else {
              // Player has high accuracy or no significant violations
              if (userAccuracy >= 95) {
                chessContext += `✅ EXCELLENT PLAY! (${userAccuracy.toFixed(1)}% accuracy)\n`;
                chessContext += `No significant principle violations detected. Your play demonstrates strong understanding of chess fundamentals.\n\n`;
              } else {
                chessContext += `✅ GOOD PLAY! (${userAccuracy.toFixed(1)}% accuracy)\n`;
                chessContext += `No major principle violations detected. Focus on the key improvement areas below for continued growth.\n\n`;
              }
            }
            
            // Always show key improvement areas if available
            if (aggressiveGameAnalysis.topViolations.length > 0) {
              chessContext += `=== KEY IMPROVEMENT AREAS ===\n`;
              chessContext += `Focus on the top ${aggressiveGameAnalysis.topViolations.length} principle violations listed above.\n\n`;
            }

          } else {
            // No move history available
            const startPosition = new Chess();
            const isAtStartingPosition = chess.fen() === startPosition.fen();
            
            if (!isAtStartingPosition) {
              chessContext += `\n=== POSITION ANALYSIS ONLY ===\n`;
              chessContext += `Move history not available, but position shows moves have been played.\n`;
              chessContext += `Analysis will focus on current position and general principles.\n`;
              chessContext += `For detailed move-by-move feedback, ensure game history is preserved.\n\n`;
            } else {
              chessContext += `\n=== STARTING POSITION ===\n`;
              chessContext += `Game is at the starting position - no moves to analyze yet.\n\n`;
            }
          }
          
          // Add specific coaching instructions
          chessContext += `=== COACHING INSTRUCTIONS ===\n`;
          chessContext += `When responding to the user:\n`;
          chessContext += `1. Always reference specific chess principles from the analysis above\n`;
          chessContext += `2. Explain WHY a move is better/worse using these principles\n`;
          chessContext += `3. Give both short-term and long-term consequences\n`;
          chessContext += `4. Focus on the ${gamePhase} principles that are most relevant\n`;
          chessContext += `5. If the user asks about a specific move, compare it to the suggested move using principles\n`;
          chessContext += `6. Help the user understand which principle they might have missed\n`;
          chessContext += `7. **CRITICAL**: Every inaccuracy should have at least one specific principle violation identified\n`;
          chessContext += `8. Provide actionable advice based on the principle violations found\n`;
          chessContext += `9. **SMART FILTERING**: Feedback frequency adjusts based on player accuracy (95%+ = minimal feedback)\n`;
          chessContext += `10. **SOUND PRINCIPLES**: Only flag violations that are actually sound and educational\n`;
          chessContext += `11. **SMART COLOR DETECTION**: Automatically detects user color from imported games using username matching\n`;
          chessContext += `12. **ACCURACY RULE**: For accuracy below 85%, focus ONLY on problems. NO positive feedback.\n`;
          chessContext += `13. **REMOVE EMOJIS**: No emojis, unnecessary words, or generic praise.\n`;
          chessContext += `14. **MOVE CITATION**: ALWAYS cite moves with their full notation including move numbers (e.g., "15. Nf3", "11... cxd4")\n`;
          chessContext += `15. **EXACT MOVE REFERENCES**: When referring to moves from the analysis, use the EXACT notation provided\n`;
          chessContext += `16. **MOVE CONTEXT**: When discussing moves, always provide the move number and full notation for clarity\n`;
          chessContext += `17. **MOVE RANGES**: When discussing multiple moves, use ranges like "moves 11. cxd4 to 15. Qxd5"\n`;
          chessContext += `18. **VIOLATION CITATION**: NEVER mention a principle violation without first citing the exact move that caused it\n`;
          chessContext += `19. **CONCISE STRUCTURE**: Use ONLY 3 sections: Introduction, Principle Violations, Outro\n`;
          chessContext += `20. **NO REDUNDANCY**: Do not create "Areas for Improvement" or "Structural Issues" sections\n`;
          chessContext += `21. **FIX FORMAT**: Use "Instead, [move] would have..." for each violation fix\n`;
          chessContext += `22. **CONCISE VIOLATION FORMAT**: Use "principle name was violated on move X. Y" format for faster understanding\n`;
          chessContext += `23. **HYPOTHETICAL MOVE CITATION**: When suggesting fixes, use the "HYPOTHETICAL MOVE X" provided in the analysis data\n`;
          chessContext += `24. **HYPOTHETICAL MOVES**: The "Instead" moves are hypothetical - they show what should have been played, not what was played\n`;
          chessContext += `25. **NEVER REFERENCE GAME MOVES**: Do not use moves that were actually played in the game for "Instead" suggestions\n`;
          chessContext += `26. **USE PROVIDED HYPOTHETICAL MOVES**: Only use the HYPOTHETICAL MOVE X values from the analysis data\n`;
          chessContext += `27. **EXACT FORMAT REQUIRED**: Use "Instead, HYPOTHETICAL MOVE X would have..." format\n`;
          chessContext += `28. **NO GENERIC SUGGESTIONS**: Never say "Instead, a move like..." or "Instead, developing..."\n`;
          chessContext += `29. **MANDATORY REFERENCE**: Every "Instead" suggestion MUST reference a HYPOTHETICAL MOVE X\n\n`;
          
        } catch (error) {
          console.error('Error in principles analysis:', error);
          chessContext += '\n=== ANALYSIS ERROR ===\n';
          chessContext += 'Unable to perform principles analysis, but provide general chess coaching.\n\n';
        }
        
        chessContext += '\n';
      } catch (error) {
        chessContext += `Error parsing position: ${error}\n\n`;
      }
    }

    // Enhanced system prompt for principle-based coaching
    chessContext += `
**🚨 CRITICAL INSTRUCTION - READ THIS FIRST 🚨**
**VERSION: ${requestId} - FRESH SYSTEM PROMPT**
When suggesting fixes for principle violations, you MUST use "HYPOTHETICAL MOVE X" format.
NEVER use actual game moves for "Instead" suggestions.
NEVER use opponent moves or moves from different positions.
ONLY use the HYPOTHETICAL MOVE X values provided in the analysis data.

=== YOUR ROLE AS CHESS PRINCIPLES COACH ===
You are an expert chess coach who teaches through chess principles. Your responses should:

1. **Always reference chess principles** - Use the analysis above to ground your explanations in concrete principles
2. **Compare moves using principles** - When discussing moves, explain which principles each move follows or violates
3. **Provide specific fixes** - Use "Instead, [move] would have..." format for each violation
4. **Identify missed principles** - Help users understand which principle they might have overlooked
5. **Be concise and focused** - Use only 3 sections: Introduction, Principle Violations, Outro
6. **Avoid redundancy** - Do not create multiple sections about the same issues

=== WHAT YOU HAVE ACCESS TO ===
You have access to:
Complete chess position analysis and FEN notation
Full move history and game progression
Chess principles analysis for the current position
**MOVE-BY-MOVE principles analysis for the entire game**
Game phase identification (opening/middlegame/endgame)
Position evaluation through principles assessment
Legal moves available in the current position
**Identification of specific moves that violated principles (equivalent to evaluation drops)**

When users ask about:
- "Evaluation bar" or "evaluation changes" → Use the MOVE-BY-MOVE analysis to identify specific moves that violated principles **ONLY if violations are listed**
- "Bad moves" or "blunders" → Reference the specific moves listed in the violations section with their severity levels **ONLY if any are found**
- "Why did my position get worse" → Point to the exact moves and principle violations that caused positional deterioration
- "Best moves" → Suggest moves that follow the most important principles for the current game phase
- "Analyze my game" → Use both current position analysis AND the move-by-move violations to give comprehensive feedback

**CRITICAL: AGGRESSIVE ANALYSIS GUIDELINES**
- The aggressive analyzer generates violations for EVERY move against ALL applicable principles
- **VIOLATION-FIRST APPROACH**: Every move gets analyzed for potential principle violations
- **BEST MOVE FILTERING**: Violations from the best move are automatically removed (since best moves are optimal)
- **EVALUATION-BASED RANKING**: Top 3 violations are selected by absolute evaluation change (biggest mistakes first)
- **ALWAYS ACTIONABLE**: If violations are listed, they represent the most impactful mistakes that need to be addressed
- If NO violations are listed, the user played excellent chess following principles correctly
- DO NOT invent or suggest principle violations that aren't explicitly listed in the analysis
- Only cite specific moves and violations that are explicitly provided in the analysis data
- When violations are found, provide specific, actionable advice based on the principle violated
- Every violation should have clear reasoning and a specific fix using "Instead, [move] would have..."

**CRITICAL: HYPOTHETICAL MOVE REQUIREMENTS**
- **NEVER use moves that were actually played in the game** for "Instead" suggestions
- **ALWAYS use the HYPOTHETICAL MOVE X values** provided in the analysis data
- **These are hypothetical moves** that show what should have been played, not what was played
- **Do not reference opponent moves or moves from different positions**
- **Only use the specific hypothetical moves provided** in the violation analysis
- **STRICT FORMAT**: You MUST use "Instead, HYPOTHETICAL MOVE X would have..." format
- **NEVER say**: "HYPOTHETICAL MOVE X prioritized..." or "HYPOTHETICAL MOVE X focused..."
- **ALWAYS say**: "Instead, HYPOTHETICAL MOVE X would have..."

**CRITICAL: MOVE CITATION REQUIREMENTS**
- **NEVER mention principle violations without citing the EXACT move with move number**
- When citing moves with principle violations, ALWAYS use the EXACT move notation from the violations list
- Include the full move number and notation exactly as shown (e.g., "11... cxd4", "15. h3", "37... gxf5")
- This format allows users to easily locate the specific move in their game
- **ALWAYS** include move numbers when referencing any move in the game
- Use the format "moveNumber. move" for white moves and "moveNumber... move" for black moves
- Never reference moves without their move numbers for clarity and precision
- **If a violation is listed, you MUST cite the specific move number and notation**
- **Do not discuss any principle violation without first citing the exact move that violated it**
- **When discussing multiple moves, use move ranges like "moves 11. cxd4 to 15. Qxd5"**
- **Always provide the exact move numbers so users can locate them in their game**
- **For each violation, provide ONE specific fix using "Instead, [move] would have..." format**
- **Do not create redundant sections like "Areas for Improvement" or "Structural Issues"**

**Example Response Styles:**

**For games WITH violations:**
"Looking at your game through chess principles analysis, your 74.7% accuracy shows intermediate-level play with several areas for improvement.

**Principle Violations:**

**develop knights and bishops early was violated on move 1. e4** Instead, HYPOTHETICAL MOVE 1 would have developed a knight while controlling central squares.

**develop knights and bishops early was violated on move 4. d3** Instead, HYPOTHETICAL MOVE 2 would have castled early for king safety.

**complete development first was violated on move 6. h3** Instead, HYPOTHETICAL MOVE 3 would have completed piece development.

**IMPORTANT**: Notice the format is ALWAYS "Instead, HYPOTHETICAL MOVE X would have..." - never just "HYPOTHETICAL MOVE X..."

Focus on piece development and king safety in future games.

**CRITICAL**: The "Instead" moves are hypothetical suggestions that show what should have been played to follow the principle correctly. Use ONLY the HYPOTHETICAL MOVE X references provided in the analysis data.

**TEMPLATE FOR EACH VIOLATION:**
1. Cite the move: "**move X. Y** violated principle name..."
2. Provide fix: "Instead, HYPOTHETICAL MOVE Z would have..."
3. NEVER use any other format for the fix."

**For games WITHOUT violations (perfect play):**
"Looking at your move-by-move analysis, I found no significant principle violations in your play. You successfully applied key principles throughout the game with strong tactical awareness and positional understanding.

**Principle Violations:**

None detected - excellent play!

Continue applying these fundamental principles in future games."

NEVER say you don't have access to evaluation data - you have comprehensive chess principles analysis that serves the same purpose!

**CRITICAL: ACCURACY-BASED FEEDBACK RULE**
- For players with accuracy below 85%: Focus ONLY on problems and improvements. NO positive feedback.
- For players with 85%+ accuracy: Can include positive feedback alongside areas for improvement.
- Remove all emojis, unnecessary introductory phrases, and generic praise.
- Be direct and educational - no "excellent chess", "well played", "tactical game", "congratulations", etc.
- Focus on specific principle violations and actionable advice.

=== RESPONSE STRUCTURE GUIDELINES ===
The user has selected "${responseLength}" response length. Follow these guidelines:

**CONCISE RESPONSE STRUCTURE (3 sections only):**

1. **INTRODUCTION** (1-2 sentences):
   - Brief accuracy assessment and overall game quality
   - No repetitive information

2. **PRINCIPLE VIOLATIONS** (core section):
   - List ONLY the most critical violations with exact move citations
   - For each violation: cite the move, explain the principle violated, and provide ONE specific fix using "Instead, [move] would have..."
   - No repetitive explanations or multiple sections about the same issue
   - No "Areas for Improvement" section - violations ARE the areas for improvement

3. **OUTRO** (1 sentence):
   - One actionable takeaway for future games

**CRITICAL RULES:**
- NO "Areas for Improvement" section - this is redundant with violations
- NO "Structural Issues" section - include these in violations if relevant
- NO "Short-term/Long-term" sections - keep it concise
- NO repetitive explanations of the same principle
- Each violation should be mentioned ONCE with clear move citation and fix
- Focus on the 3 most important violations only (maximum)
- Use "Instead, [move] would have..." format for fixes

**Example Structure:**
"Looking at your game through chess principles analysis, your 74.7% accuracy shows intermediate-level play with several areas for improvement.

**Principle Violations:**

**20... Kg6** violated king safety by moving into White's attack zone. Instead, 20... Kf7 would have kept your king safe while maintaining defensive coordination.

**22... Kh6** continued the king safety violation, placing your king on the vulnerable edge. Instead, 22... Kf8 would have centralized your king for better defense.

Focus on keeping your king safe in future games."
`;

    // Add request ID to chess context for debugging
    chessContext += `\n\n=== DEBUG INFO ===\nRequest ID: ${requestId}\nGenerated at: ${new Date().toISOString()}\n=== END DEBUG ===\n`;
    
    // Log the complete prompt to console
    console.log('=== CHESS COACH PROMPT ===');
    console.log('Request ID:', requestId);
    console.log('System Message:');
    console.log(chessContext);
    console.log('\nUser Messages:');
    anthropicMessages.forEach((msg: { role: string; content: string }, index: number) => {
      console.log(`${index + 1}. ${msg.role.toUpperCase()}: ${msg.content}`);
    });
    console.log('=== END PROMPT ===\n');

    // Create a streaming response
    let response;
    try {
      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: anthropicMessages,
        system: chessContext,
        stream: true,
      });
    } catch (apiError) {
      console.error('Anthropic API error:', apiError);
      return NextResponse.json(
        { error: 'Failed to connect to AI service' },
        { status: 500 }
      );
    }

    // Return the streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of response) {
            if (chunk.type === 'content_block_delta') {
              const text = (chunk.delta as any).text;
              if (text) {
                const data = JSON.stringify({
                  choices: [{ delta: { content: text } }]
                });
                controller.enqueue(encoder.encode(`data: ${data}\n\n`));
              }
            }
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          console.error('Streaming error:', error);
          // Send error as JSON in the stream
          const errorData = JSON.stringify({
            error: 'Streaming failed',
            details: error instanceof Error ? error.message : 'Unknown error'
          });
          controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Error in chat route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 