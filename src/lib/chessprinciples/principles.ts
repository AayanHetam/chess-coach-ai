import { ChessPrinciple } from './index';

export const openingPrinciples: ChessPrinciple[] = [
  {
    id: 'control-center-pawns',
    name: 'Control the center with pawns',
    description: 'Occupy or influence e4, d4, e5, or d5 to gain space and flexibility for piece play',
    category: 'opening',
    priority: 9
  },
  {
    id: 'develop-knights-bishops',
    name: 'Develop knights and bishops early',
    description: 'Move knights to f3/c3 (or f6/c6 for Black) and bishops to active squares like c4 or f4',
    category: 'opening',
    priority: 8
  },
  {
    id: 'complete-development-first',
    name: 'Complete development before attacking',
    description: 'Develop all minor pieces and castle before launching premature attacks',
    category: 'opening',
    priority: 8
  },
  {
    id: 'avoid-moving-same-piece',
    name: 'Avoid moving the same piece multiple times',
    description: 'Unless tactically justified, develop all pieces to avoid wasting time',
    category: 'opening',
    priority: 7
  },
  {
    id: 'castle-early',
    name: 'Castle early',
    description: 'Safeguard your king and connect rooks for better coordination',
    category: 'opening',
    priority: 8
  },
  {
    id: 'dont-bring-queen-early',
    name: "Don't bring the queen out too early",
    description: 'Early queen moves expose it to attacks, losing tempo',
    category: 'opening',
    priority: 7
  },
  {
    id: 'limit-pawn-moves',
    name: 'Limit excessive pawn moves',
    description: 'Focus on piece development rather than pushing too many pawns',
    category: 'opening',
    priority: 6
  },
  {
    id: 'connect-rooks',
    name: 'Connect rooks',
    description: 'Ensure rooks can support each other, often by castling or clearing the back rank',
    category: 'opening',
    priority: 6
  },
  {
    id: 'avoid-blocking-development',
    name: 'Avoid blocking development',
    description: "Keep central pawns and pieces free to move, e.g., don't block the c-pawn with a knight on c3 in some openings",
    category: 'opening',
    priority: 6
  },
  {
    id: 'plan-for-middlegame',
    name: 'Plan for the middlegame',
    description: 'Choose openings that align with your preferred style (open or closed positions)',
    category: 'opening',
    priority: 5
  },
  {
    id: 'flexible-pawn-structure',
    name: 'Be flexible with pawn structure',
    description: 'Avoid early commitments that limit your options, like overextending pawns',
    category: 'opening',
    priority: 5
  }
];

export const middlegamePrinciples: ChessPrinciple[] = [
  {
    id: 'maximize-piece-activity',
    name: 'Maximize piece activity',
    description: 'Place pieces on squares where they control the most squares or attack weaknesses',
    category: 'middlegame',
    priority: 9
  },
  {
    id: 'improve-worst-piece',
    name: 'Improve your worst piece',
    description: 'Identify and activate your least active piece to improve overall coordination',
    category: 'middlegame',
    priority: 8
  },
  {
    id: 'centralize-pieces',
    name: 'Centralize pieces',
    description: 'Knights and bishops are often strongest in the center (e.g., d4, e5)',
    category: 'middlegame',
    priority: 8
  },
  {
    id: 'coordinate-pieces',
    name: 'Coordinate pieces',
    description: 'Ensure pieces work together, e.g., a bishop and queen targeting the same diagonal',
    category: 'middlegame',
    priority: 8
  },
  {
    id: 'think-prophylactically',
    name: 'Think prophylactically',
    description: 'Consider and prevent your opponent\'s plans before executing your own',
    category: 'middlegame',
    priority: 7
  },
  {
    id: 'knights-on-outposts',
    name: 'Place knights on outposts',
    description: "Position knights on squares (like e5 or d5) where they can't be easily dislodged by pawns",
    category: 'middlegame',
    priority: 7
  },
  {
    id: 'bishops-long-diagonals',
    name: 'Use bishops on long diagonals',
    description: 'Position bishops to control long, open diagonals for maximum influence',
    category: 'middlegame',
    priority: 7
  },
  {
    id: 'control-open-files',
    name: 'Control open files with rooks',
    description: "Place rooks on open or semi-open files to penetrate the opponent's position",
    category: 'middlegame',
    priority: 8
  },
  {
    id: 'exploit-weak-pawns',
    name: 'Exploit weak pawns',
    description: 'Target isolated, doubled, or backward pawns to create weaknesses',
    category: 'middlegame',
    priority: 7
  },
  {
    id: 'create-passed-pawns',
    name: 'Create passed pawns',
    description: 'Advance pawns to create passed pawns, especially in positions transitioning to the endgame',
    category: 'middlegame',
    priority: 6
  },
  {
    id: 'maintain-king-safety',
    name: 'Maintain king safety',
    description: 'Keep your king behind a solid pawn structure, avoiding weaknesses like open lines to the king',
    category: 'middlegame',
    priority: 9
  },
  {
    id: 'seize-initiative',
    name: 'Seize the initiative',
    description: 'Make moves that force your opponent to respond, keeping them on the defensive',
    category: 'middlegame',
    priority: 7
  },
  {
    id: 'plan-pawn-breaks',
    name: 'Plan pawn breaks',
    description: "Use pawn advances (e.g., f4-f5 or c4-c5) to open lines or disrupt the opponent's structure",
    category: 'middlegame',
    priority: 6
  },
  {
    id: 'control-key-squares',
    name: 'Control key squares',
    description: 'Dominate central or strategic squares (like d5 or e4) to limit opponent options',
    category: 'middlegame',
    priority: 8
  }
];

export const endgamePrinciples: ChessPrinciple[] = [
  {
    id: 'activate-king',
    name: 'Activate the king',
    description: 'Centralize your king to support pawns or attack weak points',
    category: 'endgame',
    priority: 9
  },
  {
    id: 'create-outside-passed-pawns',
    name: 'Create outside passed pawns',
    description: "These distract the opponent's king, creating winning chances",
    category: 'endgame',
    priority: 8
  },
  {
    id: 'support-passed-pawns',
    name: 'Support passed pawns',
    description: 'Use pieces to escort passed pawns toward promotion',
    category: 'endgame',
    priority: 8
  },
  {
    id: 'blockade-opponent-pawns',
    name: "Blockade opponent's passed pawns",
    description: 'Place pieces (especially knights) to stop enemy pawns from advancing',
    category: 'endgame',
    priority: 7
  },
  {
    id: 'simplify-when-ahead',
    name: 'Simplify when ahead',
    description: 'Trade pieces to reduce complexity and convert material advantages',
    category: 'endgame',
    priority: 7
  },
  {
    id: 'use-opposition',
    name: 'Use the opposition',
    description: 'In pawn endgames, control key squares to outmaneuver the opponent\s king',
    category: 'endgame',
    priority: 6
  },
  {
    id: 'apply-triangulation',
    name: 'Apply triangulation',
    description: 'Maneuver your king to force the opponent into a worse position',
    category: 'endgame',
    priority: 5
  },
  {
    id: 'force-zugzwang',
    name: 'Force zugzwang',
    description: 'Create positions where any opponent move worsens their situation',
    category: 'endgame',
    priority: 6
  },
  {
    id: 'use-pawn-majorities',
    name: 'Use pawn majorities',
    description: 'Advance pawn majorities (e.g., 3 vs. 2 on one side) to create passed pawns',
    category: 'endgame',
    priority: 7
  }
];

export const generalPrinciples: ChessPrinciple[] = [
  {
    id: 'dont-hang-pieces',
    name: 'Don\'t hang pieces',
    description: 'Always check that your pieces are defended before moving, scan for undefended pieces',
    category: 'general',
    priority: 10
  },
  {
    id: 'look-for-basic-tactics',
    name: 'Look for basic tactics',
    description: 'Scan for tactical motifs like forks, pins, skewers, and discovered attacks',
    category: 'general',
    priority: 9
  },
  {
    id: 'maintain-material-balance',
    name: 'Maintain material balance',
    description: 'Only sacrifice material for clear positional or tactical gains',
    category: 'general',
    priority: 9
  },
  {
    id: 'understand-piece-values',
    name: 'Understand piece values',
    description: 'Use approximate values (pawn=1, knight=3, bishop=3, rook=5, queen=9) to assess trades',
    category: 'general',
    priority: 8
  },
  {
    id: 'control-space',
    name: 'Control space',
    description: "Dominate central and key squares to give your pieces more room and limit the opponent's",
    category: 'general',
    priority: 8
  },
  {
    id: 'create-counterplay',
    name: 'Create counterplay',
    description: "Generate threats to offset the opponent's advantages, especially in worse positions",
    category: 'general',
    priority: 6
  },
  {
    id: 'assess-pawn-structure',
    name: 'Assess pawn structure',
    description: "Avoid weaknesses like isolated or doubled pawns, and exploit them in the opponent's position",
    category: 'general',
    priority: 7
  },
  {
    id: 'calculate-accurately',
    name: 'Calculate accurately',
    description: 'Ensure moves are tactically sound by checking for checks, captures, and threats',
    category: 'general',
    priority: 9
  }
]; 