# About You - Game Specification

## Overview
A Jackbox-style party game where one player (the "Main Character") answers questions about themselves while all other players try to guess what their answers will be. The goal is to see how well you know your friends.

## Technical Context
- Integrates into existing Clown Club multiplayer infrastructure
- Phone-based interface (players join via room code on mobile devices)
- Shared game state displayed on host screen
- Built on existing Jackbox-style architecture from previous games

---

## Game Flow

### Lobby Phase
1. Host creates game, receives room code
2. Players join via room code on their phones
3. Host selects who will be the Main Character for this session
4. Host starts game when ready

### Question Round (repeats for each question)

**Step 1: Main Character Answers**
- Main Character sees the question on their phone
- They submit their honest answer
- Other players see a waiting screen ("Mary is answering...")

**Step 2: Guessers Submit**
- All other players see the same question
- They type what they think the Main Character answered
- Main Character sees a waiting screen ("Everyone is guessing...")

**Step 3: Reveal & Scoring**
- Host screen shows the Main Character's actual answer
- Each guesser's response is displayed
- System auto-matches exact answers (case-insensitive)
- **Admin UI**: Host can manually award points for close answers
- 1 point awarded per correct/approved guess
- Main Character does not score (game is about them)

**Step 4: Next Question**
- Proceed to next question
- Repeat until all questions complete

### End Game
- Final scoreboard displayed
- Shows ranking of who knows the Main Character best

---

## Question Types

### 1. Free Response
Open-ended questions where Main Character types anything.

**Examples:**
- "If you won the lottery, what's the first thing you'd buy?"
- "What superpower would you want?"
- "What actress would play you in a movie?"
- "What's your favorite color?"
- "What was your favorite school subject?"
- "What app do you spend the most time on?"
- "What's your favorite holiday?"
- "What's your least favorite chore at home?"

**Mechanics:**
- Main Character: free text input
- Guessers: free text input
- Matching: exact match (case-insensitive) + admin override for close answers

### 2. Multiple Choice
Predefined options that everyone picks from.

**Examples:**
- "Which merch would you want?" → Tote / Sweatshirt / Hat / T-shirt
- "Where would you like to run?" → Fall in a city / Spring mountain trail / Summer on the beach / Winter on the treadmill
- "Favorite movie theater snack?" → Soft drink / Chocolate candy / Popcorn / Gummy candy

**Mechanics:**
- Main Character: picks one option
- Guessers: pick one option
- Matching: exact match (automatic)

### 3. This or That
Binary choices.

**Examples:**
- Morning person / Night owl
- Guest / Host
- Hot / Cold
- Casual / Formal

**Mechanics:**
- Main Character: picks one
- Guessers: pick one
- Matching: exact match (automatic)

### 4. Which Player
Questions where the answer is one of the current players.

**Examples:**
- "Who would you ask for relationship advice?"
- "Who would you want to cook you a nice meal?"
- "Who would you want to exercise with?"
- "Who would you want with you in a stressful emergency?"
- "Who would you want as your financial planner?"

**Mechanics:**
- Options: dynamically populated from current player list
- Main Character: picks one player
- Guessers: pick one player
- Matching: exact match (automatic)

### 5. Team Builder (TODO: Flesh out roles)
Build a team by assigning players to specific roles.

**Scenarios:**
- Heist Crew (roles TBD - e.g., Driver, Hacker, Muscle, Mastermind)
- Zombie Apocalypse Squad (roles TBD)

**Mechanics:**
- Main Character: assigns one player per role
- Guessers: assign one player per role
- Scoring: TBD (points per correct assignment?)

---

## Admin UI Requirements

### In-Round Controls
- View all submitted guesses alongside Main Character's answer
- Toggle to manually mark a guess as "correct" (for close/fuzzy matches)
- Button to confirm scoring and proceed to next question

### Game Management
- Select Main Character before starting
- Ability to skip questions
- End game early option

---

## Scoring

| Event | Points |
|-------|--------|
| Correct guess (exact match) | +1 |
| Correct guess (admin approved) | +1 |
| Main Character | Does not score |

---

## Screen States

### Host/Shared Display
1. **Lobby**: Player list, room code, Main Character selection
2. **Answering**: "Mary is answering..." with question visible
3. **Guessing**: "Everyone is guessing..." with question visible
4. **Reveal**: Main Character's answer, all guesses, match indicators, admin controls
5. **Scoreboard**: Running scores after each question
6. **Final Results**: End-game rankings

### Main Character Phone
1. **Lobby**: Waiting for game start
2. **Answering**: Question + text input / option buttons
3. **Guessing**: "Everyone is guessing what you said..."
4. **Reveal**: See guesses about you
5. **Results**: See who knows you best

### Guesser Phone
1. **Lobby**: Waiting for game start
2. **Answering**: "Mary is answering..."
3. **Guessing**: Question + text input / option buttons
4. **Reveal**: See if you were right
5. **Results**: Your ranking

---

## Data Model (Conceptual)

```
Game {
  roomCode: string
  players: Player[]
  mainCharacterId: string
  currentQuestionIndex: number
  questions: Question[]
  scores: { [playerId]: number }
  phase: 'lobby' | 'answering' | 'guessing' | 'reveal' | 'finished'
}

Player {
  id: string
  name: string
  isHost: boolean
}

Question {
  id: string
  type: 'free' | 'multiple' | 'binary' | 'player' | 'team'
  prompt: string
  options?: string[]  // for multiple choice / binary
  roles?: string[]    // for team builder
}

Round {
  questionId: string
  mainCharacterAnswer: string | string[]  // string[] for team builder
  guesses: { [playerId]: string | string[] }
  approvedGuesses: string[]  // player IDs manually approved by admin
}
```

---

## Open Questions / TODO

1. **Team Builder roles**: Define specific roles for Heist and Zombie scenarios
2. **Team Builder scoring**: Points per correct role assignment, or all-or-nothing?
3. **Multiple Main Characters**: Support rotating Main Character within same game session?
4. **Question selection**: All questions played, or host picks subset?
5. **Timer**: Add optional time limits for answering/guessing phases?

---

## Initial Question Set

See question types above for the full seed set. To be expanded/customized per game session.
