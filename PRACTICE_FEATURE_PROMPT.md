# 🎯 Practice Feature Implementation Prompt

## Context
You are working on the `/workspace/chess-coach-ai` repository. This is a Next.js + TypeScript chess coaching application that uses:
- **Jotai** for state management
- **Material-UI** for components
- **chess.js** for chess logic
- **OpenAI API** for AI coaching
- Existing puzzle service at `src/lib/chessPuzzlesService.ts`

## Goal
Implement a **Practice** feature that allows users to practice puzzles based on skill gaps identified by the AI coach. When the AI detects a mistake and explains what the user missed, it should offer to gather practice puzzles. If accepted, users are redirected to a new Practice tab with a dedicated chessboard and puzzle list.

---

## 📋 Functional Requirements

### 1. AI Coach Practice Offer
**Location**: `src/components/AICoachChat.tsx`

After the AI coach identifies and explains a mistake (principle violation), it must:
- Ask: *"Could I gather for you a bunch of puzzles that help you fix this gap in understanding so you can find it next time?"*
- This question should appear naturally in the conversation flow
- The question should include context about what skill gap was identified (e.g., "fork patterns", "back rank weaknesses", "pin tactics")

**Implementation Notes**:
- The AI coach system prompt (around line 850-1022) needs to be updated to include instructions for offering practice
- When a mistake is detected, extract the tactical theme/skill gap from the analysis
- Format the practice offer as a conversational question in the AI response

### 2. User Acceptance Handler
**Location**: `src/components/AICoachChat.tsx`

When the user accepts the practice offer (e.g., responds "yes", "sure", "ok", "let's practice"):
- Extract the skill gap/tactical theme from the conversation context
- Generate or fetch puzzles matching that theme
- Store the puzzle set in application state
- Redirect user to Practice tab/page

**Implementation Notes**:
- Add a handler function that detects acceptance responses
- Use the existing `chessPuzzlesService.ts` to query puzzles by theme
- Create a new Jotai atom to store the current practice session data
- Use Next.js router to navigate to `/practice` route

### 3. Practice Tab/Page
**Location**: Create `src/pages/practice.tsx` (new page)

Create a new Practice page that includes:
- **Chessboard**: A new chess board instance (similar to the one in `src/sections/analysis/board/index.tsx`)
- **Puzzle List**: A list of puzzles filtered by the skill gap theme
- **Solved/Unsolved Status**: Each puzzle shows binary solved state (solved = true/false)
- **Practice Controls**: 
  - "Start Practice" button if no puzzle is selected
  - Ability to mark puzzles as solved/unsolved
  - Navigation between puzzles

**Implementation Notes**:
- Reuse the Board component from `src/sections/analysis/board/index.tsx` or create a practice-specific board
- Create a new component `src/sections/practice/PracticeBoard.tsx` for the practice board
- Create `src/sections/practice/PuzzleList.tsx` for the puzzle list component
- Use Jotai atoms to manage practice state (current puzzle, puzzle list, solved status)

### 4. Navigation Integration
**Location**: `src/sections/layout/NavMenu.tsx`

Add a new navigation item:
- **Text**: "Practice"
- **Icon**: Use an appropriate icon (e.g., `mdi:puzzle` or `mdi:school`)
- **Route**: `/practice`
- Position it logically in the menu (suggest after "Analysis" or before "Database")

**Implementation Notes**:
- Add to the `MenuOptions` array in `NavMenu.tsx`
- Ensure the route matches the new page

### 5. Puzzle State Management
**Location**: Create `src/sections/practice/states.ts` (new file)

Create Jotai atoms for:
- `practicePuzzlesAtom`: Array of puzzles for current practice session
- `currentPuzzleIndexAtom`: Index of currently active puzzle
- `puzzleSolvedStatusAtom`: Map/object tracking solved status (puzzleId -> boolean)
- `practiceThemeAtom`: Current practice theme/skill gap being practiced

**Puzzle Data Structure**:
```typescript
interface PracticePuzzle {
  id: string;
  fen: string;
  moves: string[]; // Solution moves
  rating: number;
  themes: string[]; // Tactical themes
  solution: string[]; // Full solution sequence
  solved: boolean; // Binary solved state
}
```

### 6. Auto-Redirect on Acceptance
**Location**: `src/components/AICoachChat.tsx`

When user accepts practice offer:
1. Extract skill gap theme from conversation
2. Query puzzles matching that theme using `chessPuzzlesService.ts`
3. Store puzzles in practice state atoms
4. Navigate to `/practice` route
5. Pre-select the first puzzle and load it on the board

**Implementation Notes**:
- Use `useRouter()` from `next/router` for navigation
- Set practice state atoms before navigation
- Pass theme/skill gap as URL query param or state for initial load

### 7. Puzzle Query Service
**Location**: `src/lib/chessPuzzlesService.ts` (extend existing)

Add a function to query puzzles by theme:
```typescript
async function getPuzzlesByTheme(
  theme: string,
  limit: number = 20
): Promise<PracticePuzzle[]>
```

**Implementation Notes**:
- Use the existing puzzle dataset (Lichess puzzles)
- Filter puzzles by matching themes array
- Return puzzles with all required fields
- Handle cases where no puzzles match (return empty array)

---

## 🎨 UI/UX Requirements

### Practice Page Layout
- **Left Side**: Chessboard (similar to analysis page board)
- **Right Side**: 
  - Puzzle list with solved/unsolved indicators
  - Current puzzle info (rating, theme, solution)
  - Practice controls (next puzzle, mark solved, etc.)
- **Responsive**: Should work on mobile (stack vertically)

### Puzzle List Display
- Show puzzle number, theme, rating
- Visual indicator for solved (✓) vs unsolved (○)
- Click to select puzzle
- Highlight currently active puzzle

### Chessboard Interaction
- Load puzzle position on board
- Allow user to make moves
- Validate moves against solution
- Show feedback when puzzle is solved correctly
- Allow "Show Solution" button

### Empty States
- If no puzzles available: Show friendly message "No puzzles found for this theme. Try practicing a different skill!"
- If no practice session active: Show "Start practicing by asking your AI coach to identify areas for improvement!"

---

## 🔧 Technical Implementation Steps

### Step 1: Update AI Coach Prompt
1. Open `src/components/AICoachChat.tsx`
2. Find the system prompt (around line 850)
3. Add instructions for offering practice after mistake explanation:
   ```
   PRACTICE OFFER PROTOCOL:
   - After explaining a mistake and what the user missed, offer practice puzzles
   - Use this exact phrasing: "Could I gather for you a bunch of puzzles that help you fix this gap in understanding so you can find it next time?"
   - Include the specific skill gap identified (e.g., "fork patterns", "back rank weaknesses")
   - Wait for user acceptance before proceeding
   ```

### Step 2: Create Practice State Atoms
1. Create `src/sections/practice/states.ts`
2. Define Jotai atoms for practice state management
3. Export atoms for use across components

### Step 3: Extend Puzzle Service
1. Open `src/lib/chessPuzzlesService.ts`
2. Add `getPuzzlesByTheme()` function
3. Ensure it returns puzzles in the `PracticePuzzle` format

### Step 4: Add Acceptance Handler
1. In `AICoachChat.tsx`, add handler to detect practice acceptance
2. Extract theme from conversation context
3. Query puzzles and store in state
4. Navigate to `/practice`

### Step 5: Create Practice Page
1. Create `src/pages/practice.tsx`
2. Set up layout with board and puzzle list
3. Connect to practice state atoms
4. Implement puzzle loading and navigation

### Step 6: Create Practice Components
1. `src/sections/practice/PracticeBoard.tsx` - Chessboard for practice
2. `src/sections/practice/PuzzleList.tsx` - Puzzle list component
3. `src/sections/practice/PuzzleInfo.tsx` - Current puzzle details

### Step 7: Add Navigation Item
1. Open `src/sections/layout/NavMenu.tsx`
2. Add "Practice" to `MenuOptions` array
3. Use appropriate icon

### Step 8: Implement Puzzle Solving Logic
1. Validate moves against solution sequence
2. Mark puzzle as solved when correct
3. Update solved status atom
4. Provide feedback to user

---

## ✅ Acceptance Criteria

### Must Have
- [ ] AI coach asks practice question after explaining mistakes
- [ ] User can accept practice offer naturally (yes/sure/ok responses)
- [ ] Practice tab exists in navigation menu
- [ ] Practice page shows chessboard and puzzle list
- [ ] Puzzles have binary solved/unsolved status
- [ ] User can mark puzzles as solved/unsolved
- [ ] Auto-redirect to Practice tab after acceptance
- [ ] Puzzles are filtered by skill gap theme
- [ ] Practice page is accessible directly (without AI recommendation)

### Should Have
- [ ] Puzzle list shows theme, rating, and solved status
- [ ] Chessboard validates moves against solution
- [ ] Visual feedback when puzzle is solved
- [ ] "Show Solution" button available
- [ ] Responsive design (mobile-friendly)
- [ ] Empty states for no puzzles/no session

### Nice to Have
- [ ] Progress tracking (X/Y puzzles solved)
- [ ] Difficulty filtering
- [ ] Practice statistics/history
- [ ] Ability to practice multiple themes simultaneously

---

## 🔍 Key Files to Modify/Create

### Files to Modify:
1. `src/components/AICoachChat.tsx` - Add practice offer logic and acceptance handler
2. `src/lib/chessPuzzlesService.ts` - Add theme-based puzzle query function
3. `src/sections/layout/NavMenu.tsx` - Add Practice navigation item

### Files to Create:
1. `src/pages/practice.tsx` - Main practice page
2. `src/sections/practice/states.ts` - Practice state atoms
3. `src/sections/practice/PracticeBoard.tsx` - Practice chessboard component
4. `src/sections/practice/PuzzleList.tsx` - Puzzle list component
5. `src/sections/practice/PuzzleInfo.tsx` - Puzzle details component

### Files to Reference:
- `src/sections/analysis/board/index.tsx` - Board component structure
- `src/pages/index.tsx` - Page layout structure
- `src/lib/chessPuzzlesService.ts` - Existing puzzle service patterns

---

## 🚀 Future Goals (Not in Scope)
These are mentioned for awareness but should NOT be implemented now:
- Large puzzle database in new DB section
- Opening courses with PGN reader (ChessBase/Chessly style)
- Advanced analytics and progress tracking

---

## 📝 Implementation Notes

### State Management Pattern
Follow existing patterns using Jotai atoms. See `src/sections/analysis/states.ts` for reference.

### Routing Pattern
Use Next.js router for navigation. See `src/pages/feedback.tsx` for example of programmatic navigation.

### Component Structure
Follow existing component patterns. See `src/sections/analysis/panelBody/` for tab component examples.

### Puzzle Data Source
The existing `chessPuzzlesService.ts` references Lichess puzzles dataset. Ensure puzzle queries use this dataset and match themes appropriately.

### Error Handling
- Handle cases where no puzzles match the theme
- Handle API failures gracefully
- Show user-friendly error messages

### Performance
- Lazy load puzzle data when needed
- Cache puzzle queries to avoid repeated API calls
- Optimize puzzle list rendering for large sets

---

## 🎯 Testing Checklist

After implementation, verify:
- [ ] AI coach offers practice after mistake explanation
- [ ] User acceptance triggers puzzle generation
- [ ] Redirect to Practice page works
- [ ] Puzzles load correctly on Practice page
- [ ] Chessboard displays puzzle positions
- [ ] Solved/unsolved status updates correctly
- [ ] Navigation to Practice tab works from menu
- [ ] Practice page accessible without AI recommendation
- [ ] Mobile responsive design works
- [ ] Empty states display correctly

---

## 💡 Prompt Engineering Tips for Cursor AI

When implementing:
1. **Start with state management** - Create atoms first, then build components that use them
2. **Reuse existing patterns** - Look at analysis page structure for layout inspiration
3. **Incremental development** - Build one component at a time, test as you go
4. **Type safety** - Define TypeScript interfaces for all puzzle data structures
5. **Error boundaries** - Add error handling early, don't leave it for later

---

**End of Prompt** - Follow this guide step-by-step to implement the Practice feature. Take your time and ensure each component works before moving to the next.