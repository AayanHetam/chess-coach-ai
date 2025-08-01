#!/usr/bin/env node

/**
 * Test script to verify clickable moves functionality
 * Tests the new "Move X: [move] - [principle] - [explanation] - [suggestion]" format
 */

console.log('🧪 Testing Clickable Moves Functionality');
console.log('=====================================\n');

// Test the regex pattern that should match the new AI response format
const aiMovePattern = /Move\s+(\d+):\s*([NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?|O-O(?:-O)?[+#]?)/gi;

// Test cases
const testCases = [
  {
    name: 'Standard move with principle violation',
    text: 'Move 15: Nf3 - Don\'t leave pieces hanging - Left knight undefended in center - Should have played Bc4 to defend',
    expected: {
      moveNumber: 15,
      move: 'Nf3',
      isBlackMove: false
    }
  },
  {
    name: 'Black move with principle violation',
    text: 'Move 16: cxd4 - Don\'t create weaknesses - Moved pawn that weakened king safety - Should have castled instead',
    expected: {
      moveNumber: 16,
      move: 'cxd4',
      isBlackMove: true
    }
  },
  {
    name: 'Castling move with principle violation',
    text: 'Move 23: O-O - Don\'t exchange pieces when behind - Gave up material advantage unnecessarily - Should have kept pieces for attack',
    expected: {
      moveNumber: 23,
      move: 'O-O',
      isBlackMove: false
    }
  },
  {
    name: 'Complex move with principle violation',
    text: 'Move 31: Qxd8+ - Don\'t leave pieces undefended - Queen was left hanging after exchange - Should have defended queen first',
    expected: {
      moveNumber: 31,
      move: 'Qxd8+',
      isBlackMove: false
    }
  }
];

console.log('📋 Testing AI Move Pattern Detection:\n');

let allTestsPassed = true;

testCases.forEach((testCase, index) => {
  console.log(`Test ${index + 1}: ${testCase.name}`);
  console.log(`Input: "${testCase.text}"`);
  
  // Reset regex state for each test
  aiMovePattern.lastIndex = 0;
  const match = aiMovePattern.exec(testCase.text);
  
  if (match) {
    const moveNumber = parseInt(match[1]);
    const move = match[2];
    const isBlackMove = moveNumber % 2 === 0;
    
    console.log(`✅ Match found:`);
    console.log(`   Move Number: ${moveNumber}`);
    console.log(`   Move: ${move}`);
    console.log(`   Is Black Move: ${isBlackMove}`);
    
    // Verify expected values
    if (moveNumber === testCase.expected.moveNumber && 
        move === testCase.expected.move && 
        isBlackMove === testCase.expected.isBlackMove) {
      console.log(`   ✅ All values match expected`);
    } else {
      console.log(`   ❌ Values don't match expected:`);
      console.log(`      Expected: ${testCase.expected.moveNumber}, ${testCase.expected.move}, ${testCase.expected.isBlackMove}`);
      console.log(`      Got: ${moveNumber}, ${move}, ${isBlackMove}`);
      allTestsPassed = false;
    }
  } else {
    console.log(`❌ No match found`);
    allTestsPassed = false;
  }
  
  console.log('');
});

// Test full AI response format
console.log('📝 Testing Full AI Response Format:\n');

const sampleAIResponse = `Top 2-3 Principle Violations:
- Move 15: Nf3 - Don't leave pieces hanging - Left knight undefended in center - Should have played Bc4 to defend
- Move 16: cxd4 - Don't create weaknesses - Moved pawn that weakened king safety - Should have castled instead
- Move 23: O-O - Don't exchange pieces when behind - Gave up material advantage unnecessarily - Should have kept pieces for attack`;

console.log('Sample AI Response:');
console.log(sampleAIResponse);
console.log('');

// Reset regex state
aiMovePattern.lastIndex = 0;

const matches = [];
let match;
while ((match = aiMovePattern.exec(sampleAIResponse)) !== null) {
  matches.push({
    moveNumber: parseInt(match[1]),
    move: match[2],
    isBlackMove: parseInt(match[1]) % 2 === 0
  });
}

console.log(`Found ${matches.length} clickable moves:`);
matches.forEach((moveInfo, index) => {
  console.log(`  ${index + 1}. Move ${moveInfo.moveNumber}${moveInfo.isBlackMove ? '...' : '.'} ${moveInfo.move}`);
});

if (matches.length === 3) {
  console.log('✅ All 3 moves detected correctly');
} else {
  console.log(`❌ Expected 3 moves, found ${matches.length}`);
  allTestsPassed = false;
}

console.log('\n🎯 Test Results:');
console.log('================');
if (allTestsPassed) {
  console.log('✅ All tests passed! Clickable moves should work correctly.');
} else {
  console.log('❌ Some tests failed. Clickable moves may not work properly.');
}

console.log('\n🚀 Next Steps:');
console.log('1. Test in actual browser component');
console.log('2. Verify move navigation works');
console.log('3. Check that moves display correctly');
console.log('4. Ensure PGN is available for move lookup'); 