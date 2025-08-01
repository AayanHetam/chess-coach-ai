#!/usr/bin/env node

/**
 * Test script for Principle Analysis Engine
 * Demonstrates the hybrid approach: Stockfish Depth Analysis + Principle Mapping
 */

const { Chess } = require('chess.js');

// Mock PrincipleAnalysisEngine for demonstration
class MockPrincipleAnalysisEngine {
  constructor() {
    this.chess = new Chess();
  }

  async analyzePositionAtDepths(fen, depths = [5, 10, 15, 20, 25]) {
    console.log(`\n🔍 Analyzing position at depths: ${depths.join(', ')}`);
    console.log(`FEN: ${fen}`);
    
    const analyses = [];
    
    for (const depth of depths) {
      // Simulate Stockfish analysis with realistic patterns
      const analysis = this.simulateStockfishAnalysis(fen, depth);
      analyses.push(analysis);
      
      console.log(`  Depth ${depth}: eval=${analysis.evaluation.toFixed(2)}, move=${analysis.bestMove}`);
    }
    
    return analyses;
  }

  findCriticalMoves(analyses) {
    console.log('\n🎯 Finding critical moves...');
    
    let maxChange = 0;
    let criticalDepth = 0;
    let moveChange = '';

    for (let i = 1; i < analyses.length; i++) {
      const evalChange = Math.abs(analyses[i].evaluation - analyses[i-1].evaluation);
      const moveChanged = analyses[i].bestMove !== analyses[i-1].bestMove;
      
      console.log(`  Depth ${analyses[i].depth}: eval change=${evalChange.toFixed(2)}, move changed=${moveChanged}`);
      
      if (evalChange > maxChange && moveChanged) {
        maxChange = evalChange;
        criticalDepth = analyses[i].depth;
        moveChange = `${analyses[i-1].bestMove} → ${analyses[i].bestMove}`;
      }
    }

    if (maxChange < 0.3) {
      console.log('  ❌ No significant critical moves found');
      return null;
    }

    console.log(`  ✅ Critical move found at depth ${criticalDepth}: ${moveChange}`);
    console.log(`  📊 Evaluation change: ${maxChange.toFixed(2)}`);

    return {
      position: this.chess.fen(),
      criticalDepth,
      evaluationChange: maxChange,
      moveChange,
      explanation: this.generateExplanation(analyses, criticalDepth),
      fenDifferences: this.analyzeFenDifferences(analyses, criticalDepth)
    };
  }

  mapFenToPrinciples(fenBefore, fenAfter) {
    console.log('\n🧠 Mapping FEN changes to chess principles...');
    
    this.chess.load(fenBefore);
    const before = this.extractPositionFeatures();
    
    this.chess.load(fenAfter);
    const after = this.extractPositionFeatures();

    const violations = [];

    // Analyze material changes
    const materialDiff = this.analyzeMaterialDifference(before, after);
    if (materialDiff.significant) {
      violations.push({
        principle: 'material_conservation',
        severity: materialDiff.severity,
        explanation: `Material advantage changed by ${materialDiff.difference} pawns`,
        suggestedCorrection: materialDiff.suggestion,
        fenEvidence: [fenBefore, fenAfter]
      });
    }

    // Analyze positional changes
    const positionalDiff = this.analyzePositionalDifference(before, after);
    if (positionalDiff.significant) {
      violations.push({
        principle: 'positional_play',
        severity: positionalDiff.severity,
        explanation: positionalDiff.explanation,
        suggestedCorrection: positionalDiff.suggestion,
        fenEvidence: [fenBefore, fenAfter]
      });
    }

    // Analyze development
    const developmentDiff = this.analyzeDevelopmentDifference(before, after);
    if (developmentDiff.significant) {
      violations.push({
        principle: 'piece_development',
        severity: developmentDiff.severity,
        explanation: developmentDiff.explanation,
        suggestedCorrection: developmentDiff.suggestion,
        fenEvidence: [fenBefore, fenAfter]
      });
    }

    return violations;
  }

  generateTrainingData(positions) {
    console.log('\n📚 Generating training data for principle violation detection...');
    
    const trainingData = [];

    for (const position of positions) {
      const violations = this.detectPrincipleViolations(position);
      
      for (const violation of violations) {
        trainingData.push({
          input: `Position: ${position.fen}\nMove: ${position.movePlayed?.san || 'N/A'}`,
          output: `Principle Violation: ${violation.principle}\nSeverity: ${violation.severity}\nExplanation: ${violation.explanation}`,
          metadata: {
            principle: violation.principle,
            violation: true,
            severity: violation.severity,
            fen: position.fen
          }
        });
      }
    }

    return trainingData;
  }

  // Helper methods
  simulateStockfishAnalysis(fen, depth) {
    // Simulate realistic Stockfish behavior
    const baseEval = Math.sin(depth * 0.1) * 0.5; // Oscillating evaluation
    const moveOptions = ['e4', 'Nf3', 'd4', 'O-O', 'Bc4', 'Nc3'];
    
    // Simulate move changes at certain depths
    let bestMove = moveOptions[0];
    if (depth >= 15) bestMove = moveOptions[1];
    if (depth >= 20) bestMove = moveOptions[2];
    
    return {
      depth,
      evaluation: baseEval + (Math.random() - 0.5) * 0.2,
      bestMove,
      pv: [bestMove, 'e5', 'Nf3'],
      nodes: depth * 1000,
      time: depth * 100
    };
  }

  generateExplanation(analyses, criticalDepth) {
    const critical = analyses.find(a => a.depth === criticalDepth);
    const previous = analyses.find(a => a.depth === criticalDepth - 5);
    
    if (!critical || !previous) return 'Unable to generate explanation';
    
    const evalChange = critical.evaluation - previous.evaluation;
    const moveChange = critical.bestMove !== previous.bestMove;
    
    if (moveChange && Math.abs(evalChange) > 0.3) {
      return `At depth ${criticalDepth}, Stockfish switches from ${previous.bestMove} to ${critical.bestMove} due to a ${evalChange > 0 ? 'tactical' : 'positional'} consideration that becomes clear at higher depths.`;
    }
    
    return `Evaluation stabilizes at depth ${criticalDepth} with ${critical.bestMove} as the best move.`;
  }

  analyzeFenDifferences(analyses, criticalDepth) {
    return {
      material: { white: 0, black: 0 },
      position: { center: 0, development: 0 },
      safety: { kingSafety: 0, pawnStructure: 0 }
    };
  }

  extractPositionFeatures() {
    return {
      material: { white: 0, black: 0 },
      center: 0,
      development: 0,
      kingSafety: 0.5,
      isolatedPawns: Math.floor(Math.random() * 3),
      undevelopedPieces: Math.floor(Math.random() * 4)
    };
  }

  detectPrincipleViolations(position) {
    const violations = [];
    const features = this.extractPositionFeatures();

    if (features.isolatedPawns > 2) {
      violations.push({
        principle: 'pawn_structure',
        severity: 'medium',
        explanation: `Too many isolated pawns (${features.isolatedPawns}) weaken the position`,
        suggestedCorrection: 'Maintain pawn structure and avoid creating isolated pawns',
        fenEvidence: [position.fen]
      });
    }

    if (features.undevelopedPieces > 3) {
      violations.push({
        principle: 'piece_development',
        severity: 'high',
        explanation: `Too many undeveloped pieces (${features.undevelopedPieces}) in the middlegame`,
        suggestedCorrection: 'Develop pieces to active squares early in the game',
        fenEvidence: [position.fen]
      });
    }

    return violations;
  }

  analyzeMaterialDifference(before, after) {
    return { significant: false, difference: 0, severity: 'low', suggestion: '' };
  }

  analyzePositionalDifference(before, after) {
    return { significant: false, explanation: '', suggestion: '', severity: 'low' };
  }

  analyzeDevelopmentDifference(before, after) {
    return { significant: false, explanation: '', suggestion: '', severity: 'low' };
  }
}

// Test the hybrid approach
async function testPrincipleAnalysis() {
  console.log('🧠 Testing Hybrid Principle Analysis Approach\n');
  console.log('=' .repeat(60));
  
  const engine = new MockPrincipleAnalysisEngine();
  
  // Test position: Ruy Lopez opening
  const testFen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1';
  
  console.log('📊 Phase 1: Stockfish Depth Analysis');
  console.log('-'.repeat(40));
  
  // Step 1: Analyze at multiple depths
  const analyses = await engine.analyzePositionAtDepths(testFen, [5, 10, 15, 20, 25]);
  
  // Step 2: Find critical moves
  const criticalMove = engine.findCriticalMoves(analyses);
  
  if (criticalMove) {
    console.log('\n📊 Phase 2: Principle Mapping');
    console.log('-'.repeat(40));
    
    // Step 3: Map FEN changes to principles
    const violations = engine.mapFenToPrinciples(testFen, testFen); // Using same FEN for demo
    
    console.log(`Found ${violations.length} principle violations`);
    violations.forEach((violation, index) => {
      console.log(`  ${index + 1}. ${violation.principle} (${violation.severity}): ${violation.explanation}`);
    });
  }
  
  console.log('\n📊 Phase 3: Training Data Generation');
  console.log('-'.repeat(40));
  
  // Step 4: Generate training data
  const mockPositions = [
    { fen: testFen, movePlayed: { san: 'e4' } },
    { fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', movePlayed: { san: 'e5' } }
  ];
  
  const trainingData = engine.generateTrainingData(mockPositions);
  
  console.log(`Generated ${trainingData.length} training examples`);
  trainingData.forEach((example, index) => {
    console.log(`  Example ${index + 1}:`);
    console.log(`    Input: ${example.input.substring(0, 50)}...`);
    console.log(`    Output: ${example.output.substring(0, 50)}...`);
    console.log(`    Principle: ${example.metadata.principle}`);
  });
  
  console.log('\n🎯 Benefits of Hybrid Approach:');
  console.log('-'.repeat(40));
  console.log('✅ Combines quantitative (Stockfish) and qualitative (principles) analysis');
  console.log('✅ Identifies critical moves that cause evaluation changes');
  console.log('✅ Maps engine behavior to human-understandable principles');
  console.log('✅ Generates training data for principle violation detection');
  console.log('✅ Solves the core issue of model misidentification');
  
  console.log('\n🚀 Next Steps:');
  console.log('-'.repeat(40));
  console.log('1. Integrate with actual Stockfish engine');
  console.log('2. Implement detailed FEN difference analysis');
  console.log('3. Train model on principle-violation pairs');
  console.log('4. Validate against known principle violations');
  console.log('5. Deploy enhanced principle detection system');
}

testPrincipleAnalysis().catch(console.error); 