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
  },
  // NEW PRINCIPLES ADDED
  {
    id: 'develop-toward-center',
    name: 'Develop toward the center',
    description: 'Position pieces to influence central squares, increasing their scope',
    category: 'opening',
    priority: 7
  },
  {
    id: 'avoid-premature-attacks',
    name: 'Avoid premature attacks',
    description: 'Ensure sufficient development before launching aggressive moves',
    category: 'opening',
    priority: 7
  },
  {
    id: 'control-d-e-files',
    name: 'Control the d-file and e-file',
    description: 'Place pieces to contest or occupy these key files early',
    category: 'opening',
    priority: 6
  },
  {
    id: 'avoid-king-pawn-weakness',
    name: 'Avoid weakening the king\'s pawn shield',
    description: 'Refrain from moving pawns in front of your king unless necessary',
    category: 'opening',
    priority: 8
  },
  {
    id: 'prepare-pawn-breaks',
    name: 'Prepare pawn breaks early',
    description: 'Set up potential pawn advances (e.g., c4 or f4) to open lines later',
    category: 'opening',
    priority: 5
  },
  {
    id: 'anticipate-opponent-setup',
    name: 'Anticipate opponent\'s setup',
    description: 'Choose moves that counter the opponent\'s opening system',
    category: 'opening',
    priority: 6
  },
  {
    id: 'secure-knight-outpost',
    name: 'Secure the knight\'s outpost',
    description: 'Develop knights to squares like e5 or d5, supported by pawns',
    category: 'opening',
    priority: 6
  },
  {
    id: 'avoid-pinned-pieces',
    name: 'Avoid pinned pieces early',
    description: 'Be cautious of moves that allow pins, like placing a knight on f3 before castling',
    category: 'opening',
    priority: 7
  },
  {
    id: 'use-tempo-gaining-moves',
    name: 'Use tempo-gaining moves',
    description: 'Make moves that force the opponent to respond, gaining time',
    category: 'opening',
    priority: 6
  },
  {
    id: 'balance-development-defense',
    name: 'Balance development and defense',
    description: 'Protect key squares while advancing your pieces',
    category: 'opening',
    priority: 7
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
  },
  // NEW PRINCIPLES ADDED
  {
    id: 'be-aware-tactical-threats',
    name: 'Be aware of tactical threats',
    description: 'Calculate for forks, pins, skewers, and discovered attacks to avoid blunders',
    category: 'middlegame',
    priority: 9
  },
  {
    id: 'create-threats',
    name: 'Create threats',
    description: 'Generate constant pressure to force opponent mistakes',
    category: 'middlegame',
    priority: 7
  },
  {
    id: 'restrict-opponent-mobility',
    name: 'Restrict opponent piece mobility',
    description: 'Limit the opponent\'s pieces by controlling key squares or creating pawn barriers',
    category: 'middlegame',
    priority: 7
  },
  {
    id: 'evaluate-bishop-pair',
    name: 'Evaluate the bishop pair',
    description: 'The two bishops together are often stronger than two knights or a knight and bishop',
    category: 'middlegame',
    priority: 6
  },
  {
    id: 'consider-knight-vs-bishop',
    name: 'Consider knight vs. bishop',
    description: 'Knights excel in closed positions, bishops in open ones',
    category: 'middlegame',
    priority: 6
  },
  {
    id: 'overprotect-key-points',
    name: 'Overprotect key points',
    description: 'Protect critical squares or pieces more than necessary to gain flexibility',
    category: 'middlegame',
    priority: 6
  },
  {
    id: 'exploit-space-advantages',
    name: 'Exploit space advantages',
    description: 'Use extra space to maneuver pieces and cramp the opponent\'s position',
    category: 'middlegame',
    priority: 7
  },
  {
    id: 'target-opponent-king',
    name: 'Target the opponent\'s king',
    description: 'Create threats against the king, especially if it\'s exposed or uncastled',
    category: 'middlegame',
    priority: 8
  },
  {
    id: 'double-rooks-open-files',
    name: 'Double rooks on open files',
    description: 'Stack rooks to increase pressure and penetrate the opponent\'s position',
    category: 'middlegame',
    priority: 7
  },
  {
    id: 'use-queen-actively-safely',
    name: 'Use the queen actively but safely',
    description: 'Position the queen to support attacks without exposing it to traps',
    category: 'middlegame',
    priority: 7
  },
  {
    id: 'exploit-pinned-pieces',
    name: 'Exploit pinned pieces',
    description: 'Use pins to immobilize opponent pieces and create tactical opportunities',
    category: 'middlegame',
    priority: 7
  },
  {
    id: 'create-pawn-weaknesses',
    name: 'Create pawn weaknesses',
    description: 'Force the opponent to overextend or create isolated/doubled pawns',
    category: 'middlegame',
    priority: 6
  },
  {
    id: 'improve-piece-placement',
    name: 'Improve piece placement',
    description: 'Reposition pieces to better squares, even if it takes an extra move',
    category: 'middlegame',
    priority: 7
  },
  {
    id: 'attack-weak-color-complexes',
    name: 'Attack weak color complexes',
    description: 'Target squares of one color if the opponent lacks a bishop to defend them',
    category: 'middlegame',
    priority: 6
  },
  {
    id: 'force-pawn-moves',
    name: 'Force pawn moves',
    description: 'Provoke pawn advances that weaken the opponent\'s structure',
    category: 'middlegame',
    priority: 6
  },
  {
    id: 'support-minor-pieces',
    name: 'Support minor pieces with major pieces',
    description: 'Use rooks or queens to back up knights and bishops in attacks',
    category: 'middlegame',
    priority: 6
  },
  {
    id: 'evaluate-trade-opportunities',
    name: 'Evaluate trade opportunities',
    description: 'Trade pieces to simplify when ahead or to disrupt opponent coordination',
    category: 'middlegame',
    priority: 6
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
  },
  // NEW PRINCIPLES ADDED
  {
    id: 'know-key-endgame-positions',
    name: 'Know key endgame positions',
    description: 'Understand techniques like the Lucena or Philidor positions in rook endgames',
    category: 'endgame',
    priority: 7
  },
  {
    id: 'exploit-two-weaknesses',
    name: 'Exploit the principle of two weaknesses',
    description: 'Create multiple weaknesses to stretch the opponent\'s defense',
    category: 'endgame',
    priority: 7
  },
  {
    id: 'set-up-fortresses',
    name: 'Set up fortresses',
    description: 'In defensive positions, create structures that are hard to break',
    category: 'endgame',
    priority: 6
  },
  {
    id: 'cut-off-opponent-king',
    name: 'Cut off the opponent\'s king',
    description: 'Use pieces to restrict the opponent\'s king from entering the game',
    category: 'endgame',
    priority: 7
  },
  {
    id: 'use-rooks-behind-pawns',
    name: 'Use rooks behind passed pawns',
    description: 'Place rooks behind your passed pawns to support their advance',
    category: 'endgame',
    priority: 7
  },
  {
    id: 'avoid-passive-rook-positions',
    name: 'Avoid passive rook positions',
    description: 'Keep rooks active, avoiding placement in front of your own pawns',
    category: 'endgame',
    priority: 6
  },
  {
    id: 'master-rook-endgames',
    name: 'Master rook endgames',
    description: 'Understand techniques like checking from the side or cutting off the king',
    category: 'endgame',
    priority: 7
  },
  {
    id: 'centralize-minor-pieces',
    name: 'Centralize minor pieces in endgames',
    description: 'Knights and bishops are more effective in the center',
    category: 'endgame',
    priority: 6
  },
  {
    id: 'avoid-pawn-trades-behind',
    name: 'Avoid pawn trades when behind',
    description: 'Keep pawns on the board to create counterplay in losing positions',
    category: 'endgame',
    priority: 6
  },
  {
    id: 'know-when-trade-minor-pieces',
    name: 'Know when to trade minor pieces',
    description: 'Trade to simplify when ahead, but retain pieces for attack when behind',
    category: 'endgame',
    priority: 6
  },
  {
    id: 'use-zugzwang-minor-pieces',
    name: 'Use zugzwang in minor piece endgames',
    description: 'Force the opponent to move into a losing position',
    category: 'endgame',
    priority: 5
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
  },
  // NEW PRINCIPLES ADDED
  {
    id: 'evaluate-material-imbalances',
    name: 'Evaluate material imbalances',
    description: 'Consider specific trade-offs, like two minor pieces vs. a rook',
    category: 'general',
    priority: 7
  },
  {
    id: 'make-positional-sacrifices',
    name: 'Make positional sacrifices',
    description: 'Sacrifice material for long-term advantages, like opening lines or gaining the initiative',
    category: 'general',
    priority: 7
  },
  {
    id: 'assess-king-exposure',
    name: 'Assess king exposure',
    description: 'Evaluate how open or vulnerable each king is, even in the middlegame',
    category: 'general',
    priority: 8
  },
  {
    id: 'avoid-overextension',
    name: 'Avoid overextension',
    description: 'Don\'t push pawns or pieces too far without sufficient support',
    category: 'general',
    priority: 7
  },
  {
    id: 'prioritize-piece-safety',
    name: 'Prioritize piece safety',
    description: 'Avoid leaving pieces undefended or exposed to capture',
    category: 'general',
    priority: 8
  },
  {
    id: 'evaluate-tempo',
    name: 'Evaluate tempo',
    description: 'Make moves that gain time or force the opponent to lose tempo',
    category: 'general',
    priority: 7
  },
  {
    id: 'adapt-to-position-type',
    name: 'Adapt to position type',
    description: 'Play dynamically in open positions and patiently in closed ones',
    category: 'general',
    priority: 6
  },
  {
    id: 'exploit-opponent-mistakes',
    name: 'Exploit opponent mistakes',
    description: 'Capitalize on errors like weak pawn moves or exposed pieces',
    category: 'general',
    priority: 7
  },
  {
    id: 'plan-for-transitions',
    name: 'Plan for transitions',
    description: 'Anticipate how the game might shift from opening to middlegame or middlegame to endgame',
    category: 'general',
    priority: 6
  },
  {
    id: 'use-least-active-piece',
    name: 'Use the principle of least active piece',
    description: 'Improve the position of your least active piece first',
    category: 'general',
    priority: 7
  },
  {
    id: 'control-seventh-rank',
    name: 'Control the seventh rank',
    description: 'Place rooks on the opponent\'s second rank to attack pawns or trap the king',
    category: 'general',
    priority: 7
  },
  {
    id: 'avoid-unnecessary-pawn-weaknesses',
    name: 'Avoid unnecessary pawn weaknesses',
    description: 'Don\'t create holes or weak squares without compensation',
    category: 'general',
    priority: 7
  },
  {
    id: 'assess-piece-mobility',
    name: 'Assess piece mobility',
    description: 'Favor moves that increase your pieces\' scope and restrict the opponent\'s',
    category: 'general',
    priority: 7
  },
  {
    id: 'use-discovered-attacks',
    name: 'Use discovered attacks',
    description: 'Position pieces to uncover threats, especially with bishops or queens',
    category: 'general',
    priority: 7
  },
  {
    id: 'evaluate-king-activity-middlegame',
    name: 'Evaluate king activity in middlegames',
    description: 'In safe positions, consider subtle king moves to improve position',
    category: 'general',
    priority: 5
  },
  {
    id: 'exploit-pinned-pieces-tactically',
    name: 'Exploit pinned pieces tactically',
    description: 'Use pins to win material or gain positional advantages',
    category: 'general',
    priority: 7
  },
  {
    id: 'create-mating-threats',
    name: 'Create mating threats',
    description: 'Even in middlegames, set up potential checkmate patterns',
    category: 'general',
    priority: 7
  },
  {
    id: 'use-rooks-support-pawns',
    name: 'Use rooks to support pawn advances',
    description: 'Place rooks behind advancing pawns to increase their power',
    category: 'general',
    priority: 6
  },
  {
    id: 'avoid-trading-worse-endgames',
    name: 'Avoid trading into worse endgames',
    description: 'Don\'t trade pieces if it leads to a losing endgame structure',
    category: 'general',
    priority: 6
  },
  {
    id: 'understand-pawn-structure-dynamics',
    name: 'Understand pawn structure dynamics',
    description: 'Recognize when to keep pawns fluid or locked',
    category: 'general',
    priority: 6
  },
  {
    id: 'attack-with-purpose',
    name: 'Attack with a purpose',
    description: 'Ensure attacks target specific weaknesses or create lasting advantages',
    category: 'general',
    priority: 7
  },
  {
    id: 'use-knights-closed-positions',
    name: 'Use knights in closed positions',
    description: 'Knights thrive in positions with locked pawn structures',
    category: 'general',
    priority: 6
  },
  {
    id: 'evaluate-open-vs-closed',
    name: 'Evaluate open vs. closed positions',
    description: 'Choose moves that suit the position\'s nature (e.g., bishops in open games)',
    category: 'general',
    priority: 6
  },
  {
    id: 'stay-alert-sacrifices',
    name: 'Stay alert for sacrifices',
    description: 'Look for tactical sacrifices that open lines or expose the opponent\'s king',
    category: 'general',
    priority: 7
  }
]; 