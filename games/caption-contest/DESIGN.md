# Caption Contest - Jackbox-Style Revamp

## Overview

Transform Caption Contest from a basic submission/vote game into a polished Jackbox-style experience with timers, head-to-head matchups, animations, and dramatic reveals.

## Game Flow

```
┌──────────────────────────────────────────────────────────────┐
│                      GAME START                              │
│  - Initialize players, scores                                │
│  - Broadcast game:started                                    │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                    ROUND INTRO (3 sec)                       │
│  Phase: 'intro'                                              │
│  - Display "ROUND X" with animation                          │
│  - Build anticipation                                        │
│  - Auto-advance to submitting                                │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                  SUBMITTING (45 sec timer)                   │
│  Phase: 'submitting'                                         │
│                                                              │
│  PLAYER VIEW:                                                │
│  ┌────────────────────────────────┐                          │
│  │  [0:45] ← timer                │                          │
│  │  ┌──────────────────────────┐  │                          │
│  │  │                          │  │                          │
│  │  │      IMAGE (large)       │  │                          │
│  │  │                          │  │                          │
│  │  └──────────────────────────┘  │                          │
│  │  ┌──────────────────────────┐  │                          │
│  │  │ Write something funny... │  │                          │
│  │  └──────────────────────────┘  │                          │
│  │  [    SUBMIT CAPTION    ]      │                          │
│  └────────────────────────────────┘                          │
│                                                              │
│  HOST VIEW:                                                  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  ROUND 1 - WRITE YOUR CAPTIONS!        [0:45]          │  │
│  │  ┌──────────────────────────────────┐  ┌────────────┐  │  │
│  │  │                                  │  │ PLAYERS    │  │  │
│  │  │           IMAGE                  │  │ ✓ Alice    │  │  │
│  │  │                                  │  │ ○ Bob      │  │  │
│  │  └──────────────────────────────────┘  │ ✓ Carol    │  │  │
│  │                                        └────────────┘  │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  TRIGGERS:                                                   │
│  - All players submit → advance to voting                    │
│  - Timer expires → advance (skip non-submitters)             │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│              HEAD-TO-HEAD VOTING (15 sec per matchup)        │
│  Phase: 'voting'                                             │
│                                                              │
│  Matchup Generation:                                         │
│  - Pair up captions: (A vs B), (C vs D), etc.                │
│  - Odd number? Last one gets a "bye" (auto-advances)         │
│                                                              │
│  PLAYER VIEW:                                                │
│  ┌────────────────────────────────┐                          │
│  │  VOTE! Which is funnier?       │                          │
│  │  [0:15]                        │                          │
│  │  ┌──────────────────────────┐  │                          │
│  │  │ "Caption A text here"    │  │  ← tap to vote           │
│  │  └──────────────────────────┘  │                          │
│  │           VS                   │                          │
│  │  ┌──────────────────────────┐  │                          │
│  │  │ "Caption B text here"    │  │  ← tap to vote           │
│  │  └──────────────────────────┘  │                          │
│  └────────────────────────────────┘                          │
│                                                              │
│  HOST VIEW:                                                  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  MATCHUP 1 of 3                            [0:15]      │  │
│  │                                                        │  │
│  │  ┌─────────────────────┐   ┌─────────────────────┐     │  │
│  │  │                     │   │                     │     │  │
│  │  │  "Caption A"        │VS │  "Caption B"        │     │  │
│  │  │                     │   │                     │     │  │
│  │  │      [3 votes]      │   │      [2 votes]      │     │  │
│  │  └─────────────────────┘   └─────────────────────┘     │  │
│  │                                                        │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  TRIGGERS:                                                   │
│  - All players vote → reveal results                         │
│  - Timer expires → reveal with current votes                 │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│              MATCHUP RESULT (4 sec per matchup)              │
│  Phase: 'matchup-result'                                     │
│                                                              │
│  HOST VIEW:                                                  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                                                        │  │
│  │  ┌─────────────────────┐   ┌─────────────────────┐     │  │
│  │  │  "Caption A"        │   │  "Caption B"        │     │  │
│  │  │  by ALICE           │   │  by BOB             │     │  │
│  │  │  ████████ 5 votes   │   │  ███ 2 votes        │     │  │
│  │  │  +5 points!         │   │  +2 points          │     │  │
│  │  └─────────────────────┘   └─────────────────────┘     │  │
│  │                   ALICE WINS!                          │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  - Reveal who wrote each caption                             │
│  - Animate vote bars                                         │
│  - Award points (1 point per vote received)                  │
│  - Auto-advance to next matchup or round summary             │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                    ROUND SUMMARY (5 sec)                     │
│  Phase: 'round-summary'                                      │
│                                                              │
│  HOST VIEW:                                                  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │              ROUND 1 COMPLETE!                         │  │
│  │                                                        │  │
│  │  ┌─────────────────────────────────────────────────┐   │  │
│  │  │  1. Alice      15 pts  (+5 this round)          │   │  │
│  │  │  2. Carol      12 pts  (+4 this round)          │   │  │
│  │  │  3. Bob         8 pts  (+2 this round)          │   │  │
│  │  └─────────────────────────────────────────────────┘   │  │
│  │                                                        │  │
│  │              [ NEXT ROUND ]                            │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  PLAYER VIEW:                                                │
│  - Show their score and rank                                 │
│  - "Waiting for next round..."                               │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    (Loop back to ROUND INTRO)
```

## Socket Events

### New Events (cap: prefix)

```
Server → Client:
  cap:round-intro        { round: number }
  cap:timer-update       { phase: string, secondsLeft: number }
  cap:matchup-start      { matchupIndex: number, total: number, captionA: string, captionB: string, idA: string, idB: string }
  cap:vote-update        { votesA: number, votesB: number }
  cap:matchup-result     { winnerName: string, captionA: {...}, captionB: {...}, votesA: number, votesB: number }
  cap:round-summary      { scores: [...], roundScores: [...] }

Client → Server:
  cap:vote-matchup       { votedForId: string }  // replaces cap:vote-caption
```

### Modified Events

```
cap:game-state-changed now includes:
  {
    gameState: 'intro' | 'submitting' | 'voting' | 'matchup-result' | 'round-summary',
    timer?: number,
    currentMatchup?: { index: number, total: number, captionA: string, captionB: string },
    ...existing fields
  }
```

## Server State Machine

```javascript
// Game phases with timers
const TIMERS = {
  intro: 3000,           // 3 seconds
  submitting: 45000,     // 45 seconds
  voting: 15000,         // 15 seconds per matchup
  matchupResult: 4000,   // 4 seconds
  roundSummary: 5000,    // 5 seconds (or manual advance)
};

// State
this.phase = 'intro';
this.timer = null;
this.matchups = [];           // Array of {captionA, captionB, idA, idB}
this.currentMatchupIndex = 0;
this.matchupVotes = new Map(); // playerId -> votedForId (per matchup)
```

## Matchup Generation Algorithm

```javascript
generateMatchups(submissions) {
  // Shuffle submissions
  const shuffled = [...submissions].sort(() => Math.random() - 0.5);

  const matchups = [];
  for (let i = 0; i < shuffled.length; i += 2) {
    if (i + 1 < shuffled.length) {
      matchups.push({
        captionA: shuffled[i],
        captionB: shuffled[i + 1],
      });
    } else {
      // Odd one out - gets a "bye" with bonus point
      this.scores.set(shuffled[i].playerId,
        (this.scores.get(shuffled[i].playerId) || 0) + 1);
    }
  }
  return matchups;
}
```

## Animation Specs (Phaser Tweens)

### Round Intro
```javascript
// Scale up from 0, bounce
this.tweens.add({
  targets: roundText,
  scale: { from: 0, to: 1 },
  duration: 500,
  ease: 'Back.easeOut',
});
```

### Timer Pulse (last 5 seconds)
```javascript
// Red pulse when time is low
this.tweens.add({
  targets: timerText,
  scale: { from: 1, to: 1.2 },
  duration: 200,
  yoyo: true,
  repeat: -1,
});
```

### Vote Reveal
```javascript
// Vote bars grow from 0
this.tweens.add({
  targets: voteBar,
  scaleX: { from: 0, to: targetWidth },
  duration: 800,
  ease: 'Power2',
});
```

### Score Update
```javascript
// Points fly to scoreboard
this.tweens.add({
  targets: pointsText,
  x: scoreboardX,
  y: scoreboardY,
  alpha: 0,
  duration: 600,
  ease: 'Power2',
});
```

## File Changes Required

### 1. Server: CaptionContestGame.js
- Add timer management
- Add matchup generation
- Add new phases (intro, matchup-result, round-summary)
- Add per-matchup voting
- Emit timer updates every second

### 2. Player: CaptionContestScene.ts
- Larger image display
- Timer display with animations
- Head-to-head voting UI (A vs B)
- Better mobile layout
- Phase transition animations

### 3. Host: HostCaptionContestScene.ts
- Timer display
- Player submission indicators
- Head-to-head matchup display
- Vote bar animations
- Round summary with score changes
- Matchup result reveals

## Mobile Layout (Player - 800x600 canvas scaled to fit)

```
┌─────────────────────────────────┐
│ Round 1          Score: 5  0:30 │  <- Header (60px)
├─────────────────────────────────┤
│ ┌─────────────────────────────┐ │
│ │                             │ │
│ │                             │ │
│ │          IMAGE              │ │  <- Image (280px height)
│ │                             │ │
│ │                             │ │
│ └─────────────────────────────┘ │
├─────────────────────────────────┤
│ ┌─────────────────────────────┐ │
│ │ Write your caption...       │ │  <- Input (100px)
│ └─────────────────────────────┘ │
│                                 │
│ [      SUBMIT CAPTION       ]   │  <- Button (60px)
│                                 │
│ [        Leave Game         ]   │  <- Leave (40px)
└─────────────────────────────────┘
```

## Testing Checklist

- [ ] Single player mode (1 player) works
- [ ] Timer advances phases correctly
- [ ] Matchups generated correctly (even/odd players)
- [ ] Votes tallied per matchup
- [ ] Points awarded correctly
- [ ] Host displays sync with game state
- [ ] Player displays sync with game state
- [ ] Animations play smoothly
- [ ] Mobile layout works at 375px
- [ ] Disconnect mid-game handled gracefully
