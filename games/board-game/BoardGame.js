const BaseGame = require('../BaseGame');
const boardConfig = require('../../data/board-config.json');
const triviaQuestions = require('../../data/trivia-questions.json');

// Player colors for board tokens
const PLAYER_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899',
  '#f43f5e', '#06b6d4', '#84cc16', '#a855f7'
];

/**
 * BoardGame - Chutes & Ladders with Trivia
 */
class BoardGame extends BaseGame {
  static gameName = 'Board Rush';
  static description = 'Race to the finish with dice rolls and trivia! Land on ladders to climb ahead.';
  static minPlayers = 1;  // Temporarily set to 1 for testing
  static maxPlayers = 12;

  constructor(room, io) {
    super(room, io);

    // Board configuration
    this.board = boardConfig;

    // Game state
    this.round = 0;
    this.playerPositions = new Map();
    this.playerColors = new Map();
    this.currentRolls = new Map();
    this.currentMovements = [];
    this.triviaAnswers = new Map();
    this.currentQuestion = null;
    this.usedQuestionIds = new Set();
    this.triviaTimeout = null;

    // Custom questions added by host
    this.customQuestions = [];

    // Initialize player positions and colors
    room.players.forEach((player, index) => {
      this.playerPositions.set(player.id, 1); // Start at space 1
      this.playerColors.set(player.id, PLAYER_COLORS[index % PLAYER_COLORS.length]);
    });
  }

  /**
   * Start the game
   */
  start() {
    this.log('Game started!');
    this.startRound();
  }

  /**
   * Start a new round
   */
  startRound() {
    this.round++;
    this.currentRolls = new Map();
    this.currentMovements = [];
    this.triviaAnswers = new Map();
    this.currentQuestion = null;

    this.setState('rolling');

    this.log(`Round ${this.round} started - Rolling phase`);
    this.broadcast('bg:round-started', {
      round: this.round,
      phase: 'rolling',
      positions: this.getPositionsArray()
    });
  }

  /**
   * Get host state for TV display
   */
  getHostState() {
    return {
      state: this.state,
      round: this.round,
      board: this.board,
      positions: this.getPositionsArray(),
      rolls: this.state === 'rolling' ? this.getRollsStatus() : null,
      movements: this.state === 'moving' || this.state === 'results' ? this.currentMovements : [],
      trivia: this.state === 'trivia' ? {
        question: this.currentQuestion?.question,
        options: this.currentQuestion?.options,
        answeredCount: this.triviaAnswers.size,
        totalPlayers: this.getPlayerCount()
      } : null,
      standings: this.getStandings()
    };
  }

  /**
   * Get player state for phone controller
   */
  getPlayerState(playerId) {
    const hasRolled = this.currentRolls.has(playerId);
    const hasAnswered = this.triviaAnswers.has(playerId);
    const myRoll = this.currentRolls.get(playerId);
    const myMovement = this.currentMovements.find(m => m.playerId === playerId);

    return {
      state: this.state,
      round: this.round,
      myPosition: this.playerPositions.get(playerId),
      myColor: this.playerColors.get(playerId),
      hasRolled,
      myRoll,
      myMovement,
      trivia: this.state === 'trivia' && !hasAnswered ? {
        question: this.currentQuestion?.question,
        options: this.currentQuestion?.options
      } : null,
      hasAnswered,
      standings: this.getStandings()
    };
  }

  /**
   * Handle game-specific events
   */
  handleEvent(socket, event, data) {
    switch (event) {
      case 'bg:roll-dice':
        this.handleRollDice(socket);
        break;
      case 'bg:submit-answer':
        this.handleSubmitAnswer(socket, data);
        break;
      case 'bg:next-round':
        this.handleNextRound(socket);
        break;
      case 'bg:add-question':
        this.handleAddQuestion(socket, data);
        break;
      default:
        this.log(`Unknown event: ${event}`);
    }
  }

  /**
   * Handle dice roll
   */
  handleRollDice(socket) {
    if (this.state !== 'rolling') return;
    if (this.currentRolls.has(socket.id)) return; // Already rolled

    const player = this.getPlayer(socket.id);
    if (!player) return;

    const roll = Math.floor(Math.random() * 6) + 1;
    this.currentRolls.set(socket.id, roll);

    this.log(`${player.name} rolled a ${roll}`);

    // Send roll result to the player
    this.sendToPlayer(socket.id, 'bg:your-roll', { roll });

    // Broadcast roll status to all
    this.broadcast('bg:player-rolled', {
      playerId: socket.id,
      playerName: player.name,
      roll,
      rollsRemaining: this.getPlayerCount() - this.currentRolls.size
    });

    // Check if all players have rolled
    if (this.currentRolls.size === this.getPlayerCount()) {
      // Broadcast that all players have rolled, with countdown
      this.broadcast('bg:all-rolled', { countdown: 5 });

      // Wait 5 seconds before processing movements so everyone can see their roll
      setTimeout(() => {
        this.processMovements();
      }, 5000);
    }
  }

  /**
   * Process all player movements
   */
  processMovements() {
    this.setState('moving');
    this.currentMovements = [];

    for (const player of this.room.players) {
      const roll = this.currentRolls.get(player.id);
      if (roll === undefined) continue;

      const movement = this.calculateMovement(player.id, roll);
      this.currentMovements.push(movement);

      // Update position
      this.playerPositions.set(player.id, movement.finalPosition);
    }

    this.log('All players moved');

    // Broadcast movements for animation
    this.broadcast('bg:movements', {
      movements: this.currentMovements,
      positions: this.getPositionsArray()
    });

    // Send personalized movement data to each player
    for (const movement of this.currentMovements) {
      this.sendToPlayer(movement.playerId, 'bg:your-movement', {
        roll: movement.roll,
        startPosition: movement.startPosition,
        endPosition: movement.endPosition,
        finalPosition: movement.finalPosition,
        trigger: movement.trigger
      });
    }

    // Check for winner
    const winner = this.checkForWinner();
    if (winner) {
      setTimeout(() => this.endGame(winner), 2000);
    } else {
      // After animation delay, start trivia
      setTimeout(() => this.startTrivia(), 3000);
    }
  }

  /**
   * Calculate movement for a player
   */
  calculateMovement(playerId, roll) {
    const startPosition = this.playerPositions.get(playerId);
    let newPosition = Math.min(startPosition + roll, this.board.winSpace);
    let finalPosition = newPosition;
    let trigger = null;

    // Check for ladder
    const ladder = this.board.ladders.find(l => l.start === newPosition);
    if (ladder) {
      finalPosition = ladder.end;
      trigger = {
        type: 'ladder',
        name: ladder.name,
        from: newPosition,
        to: ladder.end
      };
    }

    // Check for chute (slides you down!)
    const chute = this.board.chutes.find(c => c.start === newPosition);
    if (chute && !trigger) {
      finalPosition = chute.end;
      trigger = {
        type: 'chute',
        name: chute.name,
        from: newPosition,
        to: chute.end
      };
    }

    const player = this.getPlayer(playerId);
    return {
      playerId,
      playerName: player?.name,
      color: this.playerColors.get(playerId),
      roll,
      startPosition,
      endPosition: newPosition,
      finalPosition,
      trigger
    };
  }

  /**
   * Start trivia phase
   */
  startTrivia() {
    this.setState('trivia');
    this.triviaAnswers = new Map();
    this.currentQuestion = this.selectQuestion();

    this.log('Trivia phase started');

    this.broadcast('bg:trivia-question', {
      question: this.currentQuestion.question,
      options: this.currentQuestion.options,
      timeLimit: 30
    });

    // Auto-advance after timeout
    this.triviaTimeout = setTimeout(() => {
      this.endTrivia();
    }, 30000);
  }

  /**
   * Select a random trivia question
   */
  selectQuestion() {
    const allQuestions = [...triviaQuestions.questions, ...this.customQuestions];
    const available = allQuestions.filter(q => !this.usedQuestionIds.has(q.id));

    if (available.length === 0) {
      // Reset if all used
      this.usedQuestionIds.clear();
      return this.selectQuestion();
    }

    const question = available[Math.floor(Math.random() * available.length)];
    this.usedQuestionIds.add(question.id);
    return question;
  }

  /**
   * Handle trivia answer submission
   */
  handleSubmitAnswer(socket, { answerId }) {
    if (this.state !== 'trivia') return;
    if (this.triviaAnswers.has(socket.id)) return; // Already answered

    const player = this.getPlayer(socket.id);
    if (!player) return;

    const correct = answerId === this.currentQuestion.correctAnswerId;
    this.triviaAnswers.set(socket.id, { answerId, correct });

    this.log(`${player.name} answered ${correct ? 'correctly' : 'incorrectly'}`);

    // Bonus movement for correct answer (positive reinforcement)
    if (correct) {
      const bonus = 2;
      const currentPos = this.playerPositions.get(socket.id);
      const newPos = Math.min(currentPos + bonus, this.board.winSpace);
      this.playerPositions.set(socket.id, newPos);

      this.sendToPlayer(socket.id, 'bg:answer-result', {
        correct: true,
        bonusMovement: bonus,
        newPosition: newPos
      });
    } else {
      this.sendToPlayer(socket.id, 'bg:answer-result', {
        correct: false
      });
    }

    // Broadcast answer count
    this.broadcast('bg:answer-received', {
      answeredCount: this.triviaAnswers.size,
      totalPlayers: this.getPlayerCount()
    });

    // Check if all answered
    if (this.triviaAnswers.size === this.getPlayerCount()) {
      clearTimeout(this.triviaTimeout);
      this.endTrivia();
    }
  }

  /**
   * End trivia phase and show results
   */
  endTrivia() {
    if (this.triviaTimeout) {
      clearTimeout(this.triviaTimeout);
      this.triviaTimeout = null;
    }

    this.setState('results');

    // Build trivia results
    const triviaResults = [];
    for (const [playerId, answer] of this.triviaAnswers.entries()) {
      const player = this.getPlayer(playerId);
      triviaResults.push({
        playerId,
        playerName: player?.name,
        correct: answer.correct,
        bonusMovement: answer.correct ? 2 : 0
      });
    }

    // Check for winner after bonus movements
    const winner = this.checkForWinner();

    this.log('Round results');

    this.broadcast('bg:round-results', {
      round: this.round,
      movements: this.currentMovements,
      triviaResults,
      correctAnswer: {
        id: this.currentQuestion.correctAnswerId,
        text: this.currentQuestion.options.find(o => o.id === this.currentQuestion.correctAnswerId)?.text
      },
      positions: this.getPositionsArray(),
      standings: this.getStandings(),
      winner: winner ? { id: winner.id, name: winner.name } : null
    });

    if (winner) {
      setTimeout(() => this.endGame(winner), 3000);
    } else {
      // Auto-progress to next round after showing results
      setTimeout(() => {
        if (this.state === 'results') {
          this.log('Auto-advancing to next round');
          this.startRound();
        }
      }, 5000);
    }
  }

  /**
   * Handle next round request (host only)
   */
  handleNextRound(socket) {
    if (!this.isHost(socket.id)) return;
    if (this.state !== 'results') return;

    this.startRound();
  }

  /**
   * Handle adding a custom trivia question (host only)
   */
  handleAddQuestion(socket, { question, options, correctAnswerId }) {
    if (!this.isHost(socket.id)) return;

    const newQuestion = {
      id: `custom_${Date.now()}`,
      question,
      options,
      correctAnswerId
    };

    this.customQuestions.push(newQuestion);
    this.log(`Custom question added: ${question.substring(0, 30)}...`);

    socket.emit('bg:question-added', { success: true, question: newQuestion });
  }

  /**
   * Check if any player has won
   */
  checkForWinner() {
    for (const player of this.room.players) {
      const position = this.playerPositions.get(player.id);
      if (position >= this.board.winSpace) {
        return player;
      }
    }
    return null;
  }

  /**
   * End the game
   */
  endGame(winner) {
    this.setState('gameover');

    this.log(`Game over! Winner: ${winner.name}`);

    this.broadcast('bg:game-over', {
      winner: {
        id: winner.id,
        name: winner.name,
        color: this.playerColors.get(winner.id)
      },
      finalStandings: this.getStandings(),
      totalRounds: this.round
    });
  }

  /**
   * Get positions as array for broadcasting
   */
  getPositionsArray() {
    return this.room.players.map(p => ({
      playerId: p.id,
      playerName: p.name,
      position: this.playerPositions.get(p.id),
      color: this.playerColors.get(p.id)
    }));
  }

  /**
   * Get standings sorted by position
   */
  getStandings() {
    return this.room.players
      .map(p => ({
        playerId: p.id,
        playerName: p.name,
        position: this.playerPositions.get(p.id),
        color: this.playerColors.get(p.id)
      }))
      .sort((a, b) => b.position - a.position);
  }

  /**
   * Get roll status for UI
   */
  getRollsStatus() {
    return this.room.players.map(p => ({
      playerId: p.id,
      playerName: p.name,
      hasRolled: this.currentRolls.has(p.id),
      roll: this.currentRolls.get(p.id)
    }));
  }

  /**
   * Handle player disconnection
   */
  onPlayerDisconnect(playerId) {
    this.playerPositions.delete(playerId);
    this.playerColors.delete(playerId);
    this.currentRolls.delete(playerId);
    this.triviaAnswers.delete(playerId);

    // Remove from room players list
    this.room.players = this.room.players.filter(p => p.id !== playerId);

    this.log(`Player disconnected. ${this.getPlayerCount()} players remaining.`);

    // If no players left, game is over
    if (this.getPlayerCount() === 0) {
      this.log('No players remaining, ending game');
      return;
    }

    // If we were waiting for this player, check if we can advance
    if (this.state === 'rolling' && this.currentRolls.size === this.getPlayerCount()) {
      this.log('All remaining players have rolled, processing movements');
      this.processMovements();
    }
    if (this.state === 'trivia' && this.triviaAnswers.size === this.getPlayerCount()) {
      clearTimeout(this.triviaTimeout);
      this.endTrivia();
    }
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this.triviaTimeout) {
      clearTimeout(this.triviaTimeout);
    }
  }
}

module.exports = BoardGame;
