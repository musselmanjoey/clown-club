const BaseGame = require('../BaseGame');

/**
 * AboutYouGame - "How Well Do You Know Me?" style party game
 *
 * One player is the Main Character. Everyone answers the same question simultaneously.
 * MC's answer is the "correct" answer, others try to match it.
 * Points awarded for matching (exact or host-approved).
 *
 * Flow: lobby (MC selection) → answering (everyone) → reveal → round-summary → [repeat] → game-over
 * Uses 'ay:' prefix for socket events
 */
class AboutYouGame extends BaseGame {
  static gameName = 'About You';
  static description = 'See how well you know your friends!';
  static minPlayers = 2;
  static maxPlayers = 12;

  // Timer durations (ms) - generous for older players
  static TIMERS = {
    answering: 60000,
    reveal: 8000,
    roundSummary: 5000,
    gameOver: 10000,
  };

  // Question types for abstraction (v1 only uses 'free')
  static QUESTION_TYPES = {
    FREE: 'free',           // Free text response
    MULTIPLE: 'multiple',   // Multiple choice (v2)
    BINARY: 'binary',       // This or that (v2)
    PLAYER: 'player',       // Pick a player (v2)
  };

  // Hardcoded question pool (v1 - free response only)
  static QUESTIONS = [
    { id: 'q1', type: 'free', prompt: 'If you won the lottery, what\'s the first thing you\'d buy?' },
    { id: 'q2', type: 'free', prompt: 'What superpower would you want?' },
    { id: 'q3', type: 'free', prompt: 'What actress/actor would play you in a movie?' },
    { id: 'q4', type: 'free', prompt: 'What\'s your favorite color?' },
    { id: 'q5', type: 'free', prompt: 'What was your favorite school subject?' },
    { id: 'q6', type: 'free', prompt: 'What app do you spend the most time on?' },
    { id: 'q7', type: 'free', prompt: 'What\'s your favorite holiday?' },
    { id: 'q8', type: 'free', prompt: 'What\'s your least favorite chore at home?' },
  ];

  constructor(room, io) {
    super(room, io);

    this.phase = 'lobby';
    this.mainCharacterId = null;
    this.mainCharacterName = null;

    // Question state
    this.questions = [...AboutYouGame.QUESTIONS];
    this.currentQuestionIndex = -1;
    this.currentQuestion = null;

    // Round state - everyone's answers stored here
    this.answers = new Map(); // playerId -> answer text (includes MC)
    this.approvedGuesses = new Set(); // playerIds manually approved by host

    // Scoring
    this.scores = new Map();
    for (const player of room.players) {
      this.scores.set(player.id, 0);
    }

    // Timer state
    this.timer = null;
    this.timerEnd = null;
    this.timerInterval = null;
  }

  // ============ GAME FLOW ============

  start() {
    // Game starts in lobby phase - host must select Main Character
    this.startPhase('lobby');
  }

  startPhase(phase) {
    this.clearTimer();
    this.phase = phase;
    this.setState(phase);

    this.log(`Phase: ${phase}`);

    switch (phase) {
      case 'lobby':
        this.broadcastPhase('lobby', {
          players: this.room.players.map(p => ({ id: p.id, name: p.name })),
          mainCharacterId: this.mainCharacterId,
          mainCharacterName: this.mainCharacterName,
        });
        break;

      case 'answering':
        this.startAnsweringPhase();
        break;

      case 'reveal':
        this.startRevealPhase();
        break;

      case 'round-summary':
        this.showRoundSummary();
        break;

      case 'game-over':
        this.showGameOver();
        break;
    }
  }

  startAnsweringPhase() {
    // Clear previous round's answers
    this.answers.clear();
    this.approvedGuesses.clear();

    const duration = AboutYouGame.TIMERS.answering;

    this.broadcastPhase('answering', {
      question: this.currentQuestion,
      questionNumber: this.currentQuestionIndex + 1,
      totalQuestions: this.questions.length,
      mainCharacterId: this.mainCharacterId,
      mainCharacterName: this.mainCharacterName,
      timer: Math.ceil(duration / 1000),
    });

    this.startTimer(duration, () => this.endAnsweringPhase());
  }

  endAnsweringPhase() {
    // Check if MC answered
    if (!this.answers.has(this.mainCharacterId)) {
      // MC didn't answer - skip to next question
      this.log('Main Character did not answer, skipping question');
      this.nextQuestion();
      return;
    }

    this.startPhase('reveal');
  }

  startRevealPhase() {
    const mcAnswer = this.answers.get(this.mainCharacterId);
    const matches = this.calculateMatches();
    const guesses = this.getGuessesForReveal();

    this.broadcastPhase('reveal', {
      question: this.currentQuestion,
      questionNumber: this.currentQuestionIndex + 1,
      totalQuestions: this.questions.length,
      mainCharacterId: this.mainCharacterId,
      mainCharacterName: this.mainCharacterName,
      mainCharacterAnswer: mcAnswer,
      guesses,
      matches,
      approvedGuesses: Array.from(this.approvedGuesses),
    });

    // Don't auto-advance - wait for host to approve fuzzy matches and click next
  }

  calculateMatches() {
    const matches = [];
    const mcAnswer = this.answers.get(this.mainCharacterId);
    const normalizedMcAnswer = mcAnswer?.toLowerCase().trim() || '';

    for (const [playerId, answer] of this.answers) {
      // Skip MC - they don't guess
      if (playerId === this.mainCharacterId) continue;

      const normalizedAnswer = answer?.toLowerCase().trim() || '';
      const isExactMatch = normalizedAnswer === normalizedMcAnswer;
      const isApproved = this.approvedGuesses.has(playerId);

      if (isExactMatch || isApproved) {
        matches.push(playerId);
      }
    }

    return matches;
  }

  awardRevealPoints() {
    const matches = this.calculateMatches();

    for (const playerId of matches) {
      const current = this.scores.get(playerId) || 0;
      this.scores.set(playerId, current + 1);
      this.log(`Awarded 1 point to ${playerId}`);
    }
  }

  showRoundSummary() {
    // Award points before showing summary
    this.awardRevealPoints();

    this.broadcastPhase('round-summary', {
      questionNumber: this.currentQuestionIndex + 1,
      totalQuestions: this.questions.length,
      scores: this.getScoreboard(),
      isLastQuestion: this.currentQuestionIndex >= this.questions.length - 1,
    });

    // Don't auto-advance - wait for host to click next
  }

  showGameOver() {
    const scores = this.getScoreboard();
    const winner = scores.filter(s => s.id !== this.mainCharacterId)[0]; // Exclude MC from winner

    this.broadcastPhase('game-over', {
      winner: winner ? { id: winner.id, name: winner.name, score: winner.score } : null,
      mainCharacterName: this.mainCharacterName,
      finalScores: scores,
    });

    this.startTimer(AboutYouGame.TIMERS.gameOver, () => this.endGame());
  }

  endGame() {
    this.setState('ended');
    this.log('Game ended');
    this.broadcast('game:ended', {
      gameType: 'about-you',
      finalScores: this.getScoreboard(),
    });
  }

  nextQuestion() {
    this.currentQuestionIndex++;

    if (this.currentQuestionIndex >= this.questions.length) {
      this.startPhase('game-over');
      return;
    }

    this.currentQuestion = this.questions[this.currentQuestionIndex];
    this.startPhase('answering');
  }

  // ============ HELPERS ============

  broadcastPhase(phase, data) {
    this.broadcast('ay:phase-changed', {
      phase,
      ...data,
    });
  }

  startTimer(duration, onComplete) {
    this.timerEnd = Date.now() + duration;

    // Broadcast timer updates every second
    this.timerInterval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((this.timerEnd - Date.now()) / 1000));
      this.broadcast('ay:timer', { secondsLeft: remaining });

      if (remaining <= 0) {
        this.clearTimer();
      }
    }, 1000);

    // Set the completion timer
    this.timer = setTimeout(() => {
      this.clearTimer();
      onComplete();
    }, duration);
  }

  clearTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  getGuessesForReveal() {
    const result = [];
    for (const [playerId, answer] of this.answers) {
      // Skip MC
      if (playerId === this.mainCharacterId) continue;

      const player = this.getPlayer(playerId);
      result.push({
        playerId,
        playerName: player?.name || 'Unknown',
        guess: answer,
      });
    }
    return result;
  }

  getScoreboard() {
    return this.room.players
      .map(p => ({
        id: p.id,
        name: p.name,
        score: this.scores.get(p.id) || 0,
        isMainCharacter: p.id === this.mainCharacterId,
      }))
      .sort((a, b) => {
        // MC always at bottom, then sort by score
        if (a.isMainCharacter) return 1;
        if (b.isMainCharacter) return -1;
        return b.score - a.score;
      });
  }

  // ============ EVENT HANDLERS ============

  handleEvent(socket, event, data) {
    switch (event) {
      case 'ay:select-main-character':
        this.handleSelectMainCharacter(socket, data);
        break;
      case 'ay:start-game':
        this.handleStartGame(socket);
        break;
      case 'ay:submit-answer':
        this.handleSubmitAnswer(socket, data);
        break;
      case 'ay:approve-guess':
        this.handleApproveGuess(socket, data);
        break;
      case 'ay:unapprove-guess':
        this.handleUnapproveGuess(socket, data);
        break;
      case 'ay:next-question':
        this.handleNextQuestion(socket);
        break;
      case 'ay:confirm-reveal':
        this.handleConfirmReveal(socket);
        break;
      default:
        this.log(`Unknown event: ${event}`);
    }
  }

  handleSelectMainCharacter(socket, { playerId }) {
    if (this.phase !== 'lobby') return;

    const player = this.getPlayer(playerId);
    if (!player) return;

    this.mainCharacterId = playerId;
    this.mainCharacterName = player.name;

    this.log(`Main Character selected: ${player.name}`);

    this.broadcastPhase('lobby', {
      players: this.room.players.map(p => ({ id: p.id, name: p.name })),
      mainCharacterId: this.mainCharacterId,
      mainCharacterName: this.mainCharacterName,
    });
  }

  handleStartGame(socket) {
    if (this.phase !== 'lobby') return;
    if (!this.mainCharacterId) {
      socket.emit('ay:error', { message: 'Please select a Main Character first' });
      return;
    }

    this.log('Game starting');
    this.nextQuestion();
  }

  handleSubmitAnswer(socket, { answer }) {
    if (this.phase !== 'answering') return;

    const player = this.getPlayer(socket.id);
    if (!player) return;

    // Check if already answered
    if (this.answers.has(socket.id)) return;

    this.answers.set(socket.id, answer.trim());
    this.log(`${player.name} answered: "${answer.trim()}"`);

    // Notify all players of progress
    this.broadcast('ay:answer-received', {
      playerId: socket.id,
      playerName: player.name,
      totalAnswers: this.answers.size,
      totalPlayers: this.getPlayerCount(),
    });

    // If everyone answered, advance early
    if (this.answers.size >= this.getPlayerCount()) {
      this.clearTimer();
      this.endAnsweringPhase();
    }
  }

  handleApproveGuess(socket, { playerId }) {
    if (this.phase !== 'reveal') return;

    this.approvedGuesses.add(playerId);
    this.log(`Approved guess from ${playerId}`);

    // Broadcast updated reveal state
    this.broadcastRevealUpdate();
  }

  handleUnapproveGuess(socket, { playerId }) {
    if (this.phase !== 'reveal') return;

    this.approvedGuesses.delete(playerId);
    this.log(`Unapproved guess from ${playerId}`);

    // Broadcast updated reveal state
    this.broadcastRevealUpdate();
  }

  broadcastRevealUpdate() {
    const mcAnswer = this.answers.get(this.mainCharacterId);

    this.broadcastPhase('reveal', {
      question: this.currentQuestion,
      questionNumber: this.currentQuestionIndex + 1,
      totalQuestions: this.questions.length,
      mainCharacterId: this.mainCharacterId,
      mainCharacterName: this.mainCharacterName,
      mainCharacterAnswer: mcAnswer,
      guesses: this.getGuessesForReveal(),
      matches: this.calculateMatches(),
      approvedGuesses: Array.from(this.approvedGuesses),
    });
  }

  handleConfirmReveal(socket) {
    if (this.phase !== 'reveal') return;

    this.startPhase('round-summary');
  }

  handleNextQuestion(socket) {
    if (this.phase !== 'round-summary') return;

    if (this.currentQuestionIndex >= this.questions.length - 1) {
      this.startPhase('game-over');
    } else {
      this.nextQuestion();
    }
  }

  // ============ STATE GETTERS ============

  getHostState() {
    const mcAnswer = this.answers.get(this.mainCharacterId);

    return {
      gameType: 'about-you',
      phase: this.phase,
      mainCharacterId: this.mainCharacterId,
      mainCharacterName: this.mainCharacterName,
      question: this.currentQuestion,
      questionNumber: this.currentQuestionIndex + 1,
      totalQuestions: this.questions.length,
      timer: this.timerEnd ? Math.max(0, Math.ceil((this.timerEnd - Date.now()) / 1000)) : null,
      mainCharacterAnswer: mcAnswer,
      guesses: this.getGuessesForReveal(),
      matches: this.calculateMatches(),
      approvedGuesses: Array.from(this.approvedGuesses),
      scores: this.getScoreboard(),
      players: this.room.players.map(p => ({ id: p.id, name: p.name })),
      answeredPlayers: Array.from(this.answers.keys()),
    };
  }

  getPlayerState(playerId) {
    const isMainCharacter = playerId === this.mainCharacterId;
    const hasAnswered = this.answers.has(playerId);
    const mcAnswer = this.answers.get(this.mainCharacterId);
    const myAnswer = this.answers.get(playerId);

    return {
      gameType: 'about-you',
      phase: this.phase,
      isMainCharacter,
      mainCharacterId: this.mainCharacterId,
      mainCharacterName: this.mainCharacterName,
      question: this.currentQuestion,
      questionNumber: this.currentQuestionIndex + 1,
      totalQuestions: this.questions.length,
      timer: this.timerEnd ? Math.max(0, Math.ceil((this.timerEnd - Date.now()) / 1000)) : null,
      hasAnswered,
      myScore: this.scores.get(playerId) || 0,
      // In reveal phase, show the MC answer and if player's guess was correct
      mainCharacterAnswer: this.phase === 'reveal' || this.phase === 'round-summary' || this.phase === 'game-over' ? mcAnswer : null,
      myAnswer: myAnswer || null,
      wasCorrect: this.calculateMatches().includes(playerId),
      scores: this.getScoreboard(),
      players: this.room.players.map(p => ({ id: p.id, name: p.name })),
    };
  }

  // ============ LIFECYCLE ============

  onPlayerDisconnect(playerId) {
    this.answers.delete(playerId);
    this.approvedGuesses.delete(playerId);
    this.scores.delete(playerId);

    // If MC disconnected, end the game
    if (playerId === this.mainCharacterId) {
      this.log('Main Character disconnected, ending game');
      this.broadcast('ay:error', { message: 'Main Character disconnected. Game ended.' });
      this.endGame();
    }
  }

  destroy() {
    this.clearTimer();
    super.destroy();
  }
}

module.exports = AboutYouGame;
