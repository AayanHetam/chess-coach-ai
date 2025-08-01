#!/usr/bin/env node

/**
 * Test script to verify that duplicate links are eliminated
 * Tests the new unified approach that prevents overlapping matches
 */

console.log('🔗 Testing Duplicate Links Fix');
console.log('=============================\n');

// Simulate the unified approach from the component
const movePatterns = [
  // Priority 1: AI response format "Move X: [move] - [principle] - [explanation] - [suggestion]"
  {
    pattern: /Move\s+(\d+):\s*([NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?|O-O(?:-O)?[+#]?)/gi,
    type: 'ai',
    priority: 1
  },
  // Priority 2: Standard notation "15. Nf3" or "15... cxd4"
  {
    pattern: /(\d+)\.\.\.?\s*([NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?|O-O(?:-O)?[+#]?)/g,
    type: 'standard',
    priority: 2
  },
  // Priority 3: "move X" format
  {
    pattern: /move\s+(\d+)([wb])?:\s*([NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?|O-O(?:-O)?[+#]?)/gi,
    type: 'move',
    priority: 3
  }
];

function findMatches(text) {
  const allMatches = [];

  movePatterns.forEach((patternInfo) => {
    patternInfo.pattern.lastIndex = 0;
    let match;
    while ((match = patternInfo.pattern.exec(text)) !== null) {
      allMatches.push({
        match,
        pattern: patternInfo,
        index: match.index,
        priority: patternInfo.priority
      });
    }
  });

  // Sort matches by priority (lower number = higher priority) and then by position
  allMatches.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    return a.index - b.index;
  });

  return allMatches;
}

function processMatches(matches) {
  const processedRanges = [];
  const finalMatches = [];

  matches.forEach((matchInfo) => {
    const { match, pattern } = matchInfo;
    const fullMatch = match[0];
    const startIndex = match.index;
    const endIndex = startIndex + fullMatch.length;

    // Check if this range overlaps with any already processed range
    const overlaps = processedRanges.some(range => 
      (startIndex >= range.start && startIndex < range.end) ||
      (endIndex > range.start && endIndex <= range.end) ||
      (startIndex <= range.start && endIndex >= range.end)
    );

    if (!overlaps) {
      finalMatches.push(matchInfo);
      processedRanges.push({ start: startIndex, end: endIndex });
    }
  });

  return finalMatches;
}

// Test cases that previously caused duplicate links
const testCases = [
  {
    name: 'AI response with potential duplicates',
    text: 'Move 12: Ne5 - Don\'t leave pieces hanging - Left knight undefended - Should have played Bc4',
    expectedMatches: 1
  },
  {
    name: 'Mixed formats that could overlap',
    text: 'Move 15: Nf3 - Don\'t create weaknesses - Moved pawn that weakened king - Should have castled. Also 15. Nf3 was played.',
    expectedMatches: 1
  },
  {
    name: 'Multiple AI responses',
    text: 'Move 12: Ne5 - Don\'t leave pieces hanging - Left knight undefended - Should have played Bc4. Move 13: cxd4 - Don\'t create weaknesses - Moved pawn that weakened king - Should have castled.',
    expectedMatches: 2
  },
  {
    name: 'AI response with standard notation nearby',
    text: 'Move 12: Ne5 - Don\'t leave pieces hanging - Left knight undefended - Should have played Bc4. Later in the game, 12. Ne5 was played again.',
    expectedMatches: 1
  }
];

console.log('📋 Testing Duplicate Link Elimination:\n');

let allTestsPassed = true;

testCases.forEach((testCase, index) => {
  console.log(`Test ${index + 1}: ${testCase.name}`);
  console.log(`Input: "${testCase.text}"`);
  
  const allMatches = findMatches(testCase.text);
  const finalMatches = processMatches(allMatches);
  
  console.log(`Found ${allMatches.length} total matches, ${finalMatches.length} after deduplication`);
  
  if (allMatches.length > 0) {
    console.log('All matches found:');
    allMatches.forEach((matchInfo, i) => {
      const { match, pattern } = matchInfo;
      const moveNumber = parseInt(match[1]);
      const move = pattern.type === 'ai' ? match[2] : (pattern.type === 'standard' ? match[2] : match[3]);
      console.log(`  ${i + 1}. ${pattern.type} pattern: "${match[0]}" (Move ${moveNumber}: ${move})`);
    });
  }
  
  if (finalMatches.length > 0) {
    console.log('Final matches (after deduplication):');
    finalMatches.forEach((matchInfo, i) => {
      const { match, pattern } = matchInfo;
      const moveNumber = parseInt(match[1]);
      const move = pattern.type === 'ai' ? match[2] : (pattern.type === 'standard' ? match[2] : match[3]);
      console.log(`  ${i + 1}. ${pattern.type} pattern: "${match[0]}" (Move ${moveNumber}: ${move})`);
    });
  }
  
  if (finalMatches.length === testCase.expectedMatches) {
    console.log(`✅ Correct number of matches (${finalMatches.length}/${testCase.expectedMatches})`);
  } else {
    console.log(`❌ Wrong number of matches (${finalMatches.length}/${testCase.expectedMatches})`);
    allTestsPassed = false;
  }
  
  console.log('');
});

// Test the specific case mentioned by the user
console.log('🎯 Testing User\'s Specific Case:\n');

const userCase = 'Move 12: Ne5 - Don\'t leave pieces hanging - Left knight undefended - Should have played Bc4';
console.log(`User case: "${userCase}"`);

const userMatches = findMatches(userCase);
const userFinalMatches = processMatches(userMatches);

console.log(`Found ${userMatches.length} total matches, ${userFinalMatches.length} after deduplication`);

if (userFinalMatches.length === 1) {
  console.log('✅ User case fixed: Only one link will be displayed');
} else {
  console.log('❌ User case still has issues');
  allTestsPassed = false;
}

console.log('\n🎯 Test Results:');
console.log('================');
if (allTestsPassed) {
  console.log('✅ All tests passed! Duplicate links should be eliminated.');
} else {
  console.log('❌ Some tests failed. Duplicate links may still occur.');
}

console.log('\n🚀 Next Steps:');
console.log('1. Test in actual browser component');
console.log('2. Verify only one link per move is displayed');
console.log('3. Check that the correct link (highest priority) is shown');
console.log('4. Ensure no overlapping matches occur'); 