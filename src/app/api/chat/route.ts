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
    const { messages, position, game } = await req.json();
    
    // Log received data for debugging
    console.log('=== API REQUEST DATA ===');
    console.log('Position:', position);
    console.log('Game PGN:', game?.pgn);
    console.log('Game History:', game?.history);
    console.log('Game Moves:', game?.moves);
    
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
        
        // **NEW: Determine user's color based on move history and messages**
        let userColor: 'white' | 'black' | 'unknown' = 'unknown';
        let userMoves: string[] = [];
        let opponentMoves: string[] = [];
        
        // Check if user explicitly mentioned their color in recent messages
        const recentMessages = messages.slice(-3); // Check last 3 messages
        for (const msg of recentMessages) {
          const content = msg.content.toLowerCase();
          if (content.includes('i am black') || content.includes("i'm black") || content.includes('playing black')) {
            userColor = 'black';
            break;
          } else if (content.includes('i am white') || content.includes("i'm white") || content.includes('playing white')) {
            userColor = 'white';
            break;
          }
        }
        
        if (gameHistory.length > 0) {
          // If color not explicitly mentioned, assume user is the player to move
          if (userColor === 'unknown') {
            const currentPlayerToMove = chess.turn();
            userColor = currentPlayerToMove === 'w' ? 'white' : 'black';
          }
          
          // Separate moves by color using the chess game history
          for (let i = 0; i < gameHistory.length; i++) {
            const move = gameHistory[i];
            const isWhiteMove = i % 2 === 0;
            
            if ((userColor === 'white' && isWhiteMove) || (userColor === 'black' && !isWhiteMove)) {
              userMoves.push(move);
            } else {
              opponentMoves.push(move);
            }
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

          // **NEW: Move-by-Move Game Analysis with Skill-Level Calibration**
          if (gameHistory.length > 1) {
            chessContext += `\n=== MOVE-BY-MOVE ANALYSIS ENABLED ===\n`;
            chessContext += `Found ${gameHistory.length} moves to analyze\n\n`;
            
            // Determine player skill level from accuracy
            const userAccuracy = userColor === 'white' ? game?.accuracy?.white || 50 : game?.accuracy?.black || 50;
            const { getSkillLevelFromAccuracy, isViolationSignificant, getSkillLevelFeedback } = require('@/lib/chessprinciples/skillLevel');
            const skillLevel = getSkillLevelFromAccuracy(userAccuracy);
            
            chessContext += `=== SKILL-CALIBRATED ANALYSIS ===\n`;
            chessContext += `Player Accuracy: ${userAccuracy.toFixed(1)}% (${skillLevel.name} level)\n`;
            chessContext += `Focus Areas: ${skillLevel.focusAreas.join(', ')}\n`;
            chessContext += `Analysis Sensitivity: ${skillLevel.violationSensitivity.toFixed(1)} (${skillLevel.name === 'Beginner' ? 'Major errors only' : skillLevel.name === 'Expert' ? 'Very precise' : 'Moderate precision'})\n\n`;
            
            chessContext += `=== YOUR MOVE-BY-MOVE PRINCIPLES ANALYSIS ===\n`;
            chessContext += `(Analyzing YOUR moves as ${userColor.toUpperCase()})\n\n`;
            
            const gameAnalysis = new Chess();
            const userMoveViolations: Array<{
              moveNumber: number;
              move: string;
              violations: any[];
              severity: 'minor' | 'moderate' | 'major';
              isUserMove: boolean;
              bestMove?: string;
              assessment?: string;
            }> = [];
            
            // Analyze each move in the game using consistent history
            for (let i = 0; i < gameHistory.length; i++) {
              const move = gameHistory[i];
              const moveNumber = Math.floor(i / 2) + 1;
              const isWhiteMove = i % 2 === 0;
              const isUserMove = (userColor === 'white' && isWhiteMove) || (userColor === 'black' && !isWhiteMove);
              
              // Get position before the move
              const beforePosition = new Chess(gameAnalysis.fen());
              
              // Make the move
              try {
                gameAnalysis.move(move);
                
                // Only analyze user's moves for violations
                if (isUserMove) {
                  // Get available moves in the position before the user's move
                  const availableMoves = beforePosition.moves();
                  
                  // **NEW: Enhanced Principle Analysis**
                  // Instead of blind principle checking, analyze if violations were actually harmful
                  
                  // Analyze the position after the move with enhanced context
                  const afterAnalysis = analyzePosition(gameAnalysis, {
                    lines: [{ pv: [], depth: 1, multiPv: 1, cp: 0 }]
                  }, gameHistory.slice(0, i + 1));
                  
                                     // Apply intelligent filtering to avoid false positives like the king safety issue
                   const contextualViolations = afterAnalysis.violatedPrinciples.filter(v => {
                     
                                           // Special case: King safety violations - only flag if truly problematic
                      if (v.principle.id === 'castle-early' || v.principle.id === 'maintain-king-safety') {
                        // Only flag king safety if the king is actually in immediate danger
                        const kingInImmediateDanger = gameAnalysis.isCheck();
                        
                        // Don't flag king safety violations if the king isn't actually in check
                        if (!kingInImmediateDanger) {
                          return false;
                        }
                      }
                     
                     // Only flag violations in positions with meaningful alternatives
                     const isInTacticalPosition = availableMoves.some(m => {
                       try {
                         const testPos = new Chess(beforePosition.fen());
                         testPos.move(m);
                         return testPos.isCheck() || testPos.isCheckmate();
                       } catch {
                         return false;
                       }
                     });
                     
                                        // Be very conservative - filter based on skill level and position context
                   const isSignificantForSkillLevel = isViolationSignificant(v.severity, skillLevel);
                   
                   // Import move validation functions
                   const { shouldFlagViolation } = require('@/lib/chessprinciples/moveValidation');
                   
                   // Create before and after positions for validation
                   const positionBefore = new Chess(gameAnalysis.fen());
                   const positionAfter = new Chess(gameAnalysis.fen());
                   try {
                     positionAfter.move(move);
                   } catch {
                     return false; // Invalid move, skip
                   }
                   
                   // Validate that the violation makes sense for this move
                   const isValidViolation = shouldFlagViolation(
                     move,
                     moveNumber,
                     positionBefore,
                     positionAfter,
                     v.principle.id,
                     v.description,
                     v.severity,
                     skillLevel
                   );
                   
                   return isSignificantForSkillLevel && 
                          isValidViolation &&
                          !isInTacticalPosition && 
                          availableMoves.length >= 10; // Require many alternatives
                   });
                   
                   if (contextualViolations.length > 0) {
                     userMoveViolations.push({
                       moveNumber,
                       move: `${isWhiteMove ? moveNumber + '.' : moveNumber + '...'} ${move}`,
                       violations: contextualViolations,
                       severity: 'major',
                       isUserMove: true
                     });
                   }
                }
              } catch (error) {
                // Skip invalid moves
                continue;
              }
            }
            
            // Report the most problematic moves
            if (userMoveViolations.length > 0) {
              chessContext += `🔍 YOUR Moves with Significant Principle Violations:\n\n`;
              
              // Sort by severity and take top 5
              userMoveViolations
                .sort((a: any, b: any) => {
                  const severityOrder: { [key: string]: number } = { major: 3, moderate: 2, minor: 1 };
                  return severityOrder[b.severity] - severityOrder[a.severity];
                })
                .slice(0, 5)
                .forEach((violation: any) => {
                  chessContext += `${violation.severity === 'major' ? '🚨' : '⚠️'} ${violation.move} (${violation.severity.toUpperCase()}):\n`;
                  violation.violations.forEach((v: any) => {
                    chessContext += `  • ${v.principle.name}: ${v.description}\n`;
                  });
                  chessContext += '\n';
                });
            } else {
              chessContext += `✅ No major principle violations detected in YOUR moves.\n\n`;
            }
            
            // Add skill-level specific feedback
            chessContext += `=== SKILL-LEVEL COACHING FEEDBACK ===\n`;
            chessContext += getSkillLevelFeedback(skillLevel, userMoveViolations.length > 0) + '\n\n';
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
          chessContext += `6. Help the user understand which principle they might have missed\n\n`;
          
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
=== YOUR ROLE AS CHESS PRINCIPLES COACH ===
You are an expert chess coach who teaches through chess principles. Your responses should:

1. **Always reference chess principles** - Use the analysis above to ground your explanations in concrete principles
2. **Compare moves using principles** - When discussing moves, explain which principles each move follows or violates
3. **Provide both short and long-term analysis** - Explain immediate consequences and strategic implications
4. **Identify missed principles** - Help users understand which principle they might have overlooked
5. **Be educational** - Don't just say "this move is better," explain WHY using principles

=== WHAT YOU HAVE ACCESS TO ===
You have access to:
✅ Complete chess position analysis and FEN notation
✅ Full move history and game progression
✅ Chess principles analysis for the current position
✅ **MOVE-BY-MOVE principles analysis for the entire game**
✅ Game phase identification (opening/middlegame/endgame)
✅ Position evaluation through principles assessment
✅ Legal moves available in the current position
✅ **Identification of specific moves that violated principles (equivalent to evaluation drops)**

When users ask about:
- "Evaluation bar" or "evaluation changes" → Use the MOVE-BY-MOVE analysis to identify specific moves that violated principles **ONLY if violations are listed**
- "Bad moves" or "blunders" → Reference the specific moves listed in the violations section with their severity levels **ONLY if any are found**
- "Why did my position get worse" → Point to the exact moves and principle violations that caused positional deterioration
- "Best moves" → Suggest moves that follow the most important principles for the current game phase
- "Analyze my game" → Use both current position analysis AND the move-by-move violations to give comprehensive feedback

**CRITICAL: PERFECT PLAY GUIDELINES**
- If NO violations are listed in the move-by-move analysis, the user played excellent chess following principles correctly
- DO NOT invent or suggest principle violations that aren't explicitly listed in the analysis
- If the violations section shows "✅ No major principle violations detected in YOUR moves", celebrate their excellent play
- Only cite specific moves and violations that are explicitly provided in the analysis data
- When no violations are found, focus on explaining the principles they applied well rather than looking for problems

**Example Response Styles:**

**For games WITH violations:**
"Looking at your game through chess principles analysis, I found a few moves where principles could have been applied better:

Move 15: h3 violated the opening principle of 'develop knights and bishops early' because it was a non-developing pawn move when you had undeveloped pieces. In the short term, this lost tempo and gave your opponent a developmental advantage. In the long term, you struggled to coordinate your pieces.

Instead, a move like Bc4 would have followed the principle of piece development while supporting central control."

**For games WITHOUT violations (perfect play):**
"Excellent chess! Looking at your move-by-move analysis, I found no significant principle violations in your play. You successfully applied key principles throughout the game:

✅ You controlled the center effectively with your pawn moves
✅ Your piece development followed sound opening principles  
✅ You maintained material balance while creating good positions
✅ Your moves were tactically accurate and principled

This demonstrates strong understanding of chess fundamentals. Keep up the excellent play!"

NEVER say you don't have access to evaluation data - you have comprehensive chess principles analysis that serves the same purpose!
Always be encouraging while being educational about chess principles!
`;

    // Log the complete prompt to console
    console.log('=== CHESS COACH PROMPT ===');
    console.log('System Message:');
    console.log(chessContext);
    console.log('\nUser Messages:');
    anthropicMessages.forEach((msg: { role: string; content: string }, index: number) => {
      console.log(`${index + 1}. ${msg.role.toUpperCase()}: ${msg.content}`);
    });
    console.log('=== END PROMPT ===\n');

    // Create a streaming response
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: anthropicMessages,
      system: chessContext,
      stream: true,
    });

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
          controller.error(error);
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