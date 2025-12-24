const BaseGame = require('../BaseGame');

/**
 * CaptionContestGame - Jackbox-style caption game with head-to-head voting
 *
 * Flow: intro → submitting → voting (per matchup) → matchup-result → round-summary
 * Uses 'cap:' prefix for socket events
 */
class CaptionContestGame extends BaseGame {
  static gameName = 'Caption Contest';
  static description = 'Submit funny captions and vote head-to-head!';
  static minPlayers = 1;
  static maxPlayers = 12;
  static totalRounds = 5;

  // Timer durations (ms)
  static TIMERS = {
    intro: 3000,
    submitting: 45000,
    voting: 12000,
    matchupResult: 4000,
    roundSummary: 5000,
    gameOver: 8000,
  };

  constructor(room, io) {
    super(room, io);

    this.currentRound = 0;
    this.phase = 'waiting';
    this.submissions = [];
    this.scores = new Map();
    this.currentImage = null;

    // Timer state
    this.timer = null;
    this.timerEnd = null;
    this.timerInterval = null;

    // Matchup state
    this.matchups = [];
    this.currentMatchupIndex = 0;
    this.matchupVotes = new Map();
    this.roundScores = new Map(); // Track points earned this round

    // Image management - per-instance, not shared across games
    this.images = [];

    // Initialize scores
    for (const player of room.players) {
      this.scores.set(player.id, 0);
    }
  }

  // ============ GAME FLOW ============

  start() {
    this.nextRound();
  }

  nextRound() {
    this.currentRound++;
    this.submissions = [];
    this.matchups = [];
    this.currentMatchupIndex = 0;
    this.roundScores = new Map();

    // Initialize round scores for all players
    for (const player of this.room.players) {
      this.roundScores.set(player.id, 0);
    }

    this.currentImage = this.getRandomImage();
    this.startPhase('intro');
  }

  startPhase(phase) {
    this.clearTimer();
    this.phase = phase;
    this.setState(phase);

    const duration = CaptionContestGame.TIMERS[phase];

    this.log(`Phase: ${phase} (${duration}ms)`);

    switch (phase) {
      case 'intro':
        this.broadcastPhase('intro', {
          round: this.currentRound,
          currentImage: this.currentImage,
        });
        this.startTimer(duration, () => this.startPhase('submitting'));
        break;

      case 'submitting':
        this.broadcastPhase('submitting', {
          round: this.currentRound,
          currentImage: this.currentImage,
          timer: Math.ceil(duration / 1000),
        });
        this.startTimer(duration, () => this.endSubmitting());
        break;

      case 'voting':
        this.startCurrentMatchup();
        break;

      case 'matchup-result':
        this.showMatchupResult();
        break;

      case 'round-summary':
        this.showRoundSummary();
        break;

      case 'game-over':
        this.showGameOver();
        break;
    }
  }

  // ============ SUBMITTING PHASE ============

  endSubmitting() {
    if (this.submissions.length === 0) {
      // No submissions - skip to round summary
      this.log('No submissions received');
      this.startPhase('round-summary');
      return;
    }

    if (this.submissions.length === 1) {
      // Only one submission - give them a point and skip to summary
      const sub = this.submissions[0];
      this.awardPoints(sub.playerId, 1);
      this.log('Single submission - awarding participation point');
      this.startPhase('round-summary');
      return;
    }

    // Generate matchups and start voting
    this.generateMatchups();
    this.startPhase('voting');
  }

  generateMatchups() {
    // Shuffle submissions
    const shuffled = [...this.submissions].sort(() => Math.random() - 0.5);

    this.matchups = [];
    for (let i = 0; i < shuffled.length; i += 2) {
      if (i + 1 < shuffled.length) {
        this.matchups.push({
          captionA: shuffled[i],
          captionB: shuffled[i + 1],
          votesA: 0,
          votesB: 0,
        });
      } else {
        // Odd one out - gets a bye with 1 bonus point
        this.awardPoints(shuffled[i].playerId, 1);
        this.log(`${shuffled[i].playerName} gets a bye (+1 point)`);
      }
    }

    this.currentMatchupIndex = 0;
    this.log(`Generated ${this.matchups.length} matchups`);
  }

  // ============ VOTING PHASE ============

  startCurrentMatchup() {
    if (this.currentMatchupIndex >= this.matchups.length) {
      // All matchups done
      this.startPhase('round-summary');
      return;
    }

    this.matchupVotes = new Map();
    const matchup = this.matchups[this.currentMatchupIndex];
    const duration = CaptionContestGame.TIMERS.voting;

    this.broadcastPhase('voting', {
      matchupIndex: this.currentMatchupIndex + 1,
      matchupTotal: this.matchups.length,
      captionA: matchup.captionA.caption,
      captionB: matchup.captionB.caption,
      idA: matchup.captionA.playerId,
      idB: matchup.captionB.playerId,
      timer: Math.ceil(duration / 1000),
    });

    this.startTimer(duration, () => this.endCurrentMatchup());
  }

  endCurrentMatchup() {
    const matchup = this.matchups[this.currentMatchupIndex];

    // Tally votes
    matchup.votesA = 0;
    matchup.votesB = 0;

    for (const [voterId, votedForId] of this.matchupVotes.entries()) {
      if (votedForId === matchup.captionA.playerId) {
        matchup.votesA++;
      } else if (votedForId === matchup.captionB.playerId) {
        matchup.votesB++;
      }
    }

    // Award points based on votes received
    this.awardPoints(matchup.captionA.playerId, matchup.votesA);
    this.awardPoints(matchup.captionB.playerId, matchup.votesB);

    this.startPhase('matchup-result');
  }

  showMatchupResult() {
    const matchup = this.matchups[this.currentMatchupIndex];
    const duration = CaptionContestGame.TIMERS.matchupResult;

    // Determine winner
    let winnerName = null;
    if (matchup.votesA > matchup.votesB) {
      winnerName = matchup.captionA.playerName;
    } else if (matchup.votesB > matchup.votesA) {
      winnerName = matchup.captionB.playerName;
    } else {
      winnerName = 'TIE!';
    }

    this.broadcastPhase('matchup-result', {
      matchupIndex: this.currentMatchupIndex + 1,
      matchupTotal: this.matchups.length,
      captionA: {
        text: matchup.captionA.caption,
        playerName: matchup.captionA.playerName,
        playerId: matchup.captionA.playerId,
      },
      captionB: {
        text: matchup.captionB.caption,
        playerName: matchup.captionB.playerName,
        playerId: matchup.captionB.playerId,
      },
      votesA: matchup.votesA,
      votesB: matchup.votesB,
      winnerName,
    });

    this.startTimer(duration, () => {
      this.currentMatchupIndex++;
      if (this.currentMatchupIndex < this.matchups.length) {
        this.startPhase('voting');
      } else {
        this.startPhase('round-summary');
      }
    });
  }

  showRoundSummary() {
    const duration = CaptionContestGame.TIMERS.roundSummary;

    // Build scores with round changes
    const scores = this.getScoreboard().map(s => ({
      ...s,
      roundScore: this.roundScores.get(
        this.room.players.find(p => p.name === s.name)?.id
      ) || 0,
    }));

    this.broadcastPhase('round-summary', {
      round: this.currentRound,
      totalRounds: CaptionContestGame.totalRounds,
      scores,
      isLastRound: this.currentRound >= CaptionContestGame.totalRounds,
    });

    // Don't auto-advance - wait for host to click next round
  }

  showGameOver() {
    const duration = CaptionContestGame.TIMERS.gameOver;
    const scores = this.getScoreboard();
    const winner = scores[0];

    this.broadcastPhase('game-over', {
      winner: winner ? { name: winner.name, score: winner.score } : null,
      finalScores: scores,
    });

    // End the game after displaying results
    this.startTimer(duration, () => {
      this.endGame();
    });
  }

  endGame() {
    this.setState('ended');
    this.log('Game ended');
    this.broadcast('game:ended', {
      gameType: 'caption-contest',
      finalScores: this.getScoreboard(),
    });
  }

  // ============ HELPERS ============

  awardPoints(playerId, points) {
    if (points <= 0) return;

    const currentScore = this.scores.get(playerId) || 0;
    this.scores.set(playerId, currentScore + points);

    const currentRoundScore = this.roundScores.get(playerId) || 0;
    this.roundScores.set(playerId, currentRoundScore + points);

    this.log(`Awarded ${points} points to ${playerId}`);
  }

  broadcastPhase(phase, data) {
    this.broadcast('cap:phase-changed', {
      phase,
      ...data,
    });
  }

  startTimer(duration, onComplete) {
    this.timerEnd = Date.now() + duration;

    // Broadcast timer updates every second
    this.timerInterval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((this.timerEnd - Date.now()) / 1000));
      this.broadcast('cap:timer', { secondsLeft: remaining });

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

  // ============ EVENT HANDLERS ============

  handleEvent(socket, event, data) {
    switch (event) {
      case 'cap:submit-caption':
        this.handleSubmitCaption(socket, data);
        break;
      case 'cap:vote-matchup':
        this.handleVoteMatchup(socket, data);
        break;
      case 'cap:next-round':
        this.handleNextRound(socket);
        break;
      case 'cap:get-images':
        socket.emit('cap:images-list', this.images);
        break;
      case 'cap:upload-image':
        this.handleUploadImage(socket, data);
        break;
      case 'cap:toggle-image-active':
        this.handleToggleImage(socket, data);
        break;
      case 'cap:delete-image':
        this.handleDeleteImage(socket, data);
        break;
      default:
        this.log(`Unknown event: ${event}`);
    }
  }

  handleSubmitCaption(socket, { caption }) {
    if (this.phase !== 'submitting') return;

    const player = this.getPlayer(socket.id);
    if (!player) return;

    // Check if already submitted
    if (this.submissions.some(s => s.playerId === socket.id)) return;

    const submission = {
      playerId: socket.id,
      playerName: player.name,
      caption: caption.trim(),
    };
    this.submissions.push(submission);

    this.log(`${player.name} submitted caption`);

    // Notify all players
    this.broadcast('cap:submission-received', {
      playerName: player.name,
      totalSubmissions: this.submissions.length,
      totalPlayers: this.getPlayerCount(),
    });

    // If everyone submitted, advance early
    if (this.submissions.length === this.getPlayerCount()) {
      this.clearTimer();
      this.endSubmitting();
    }
  }

  handleVoteMatchup(socket, { votedForId }) {
    if (this.phase !== 'voting') return;

    const matchup = this.matchups[this.currentMatchupIndex];
    if (!matchup) return;

    // Can't vote for yourself
    if (votedForId === socket.id) {
      socket.emit('cap:error', { message: "Can't vote for yourself!" });
      return;
    }

    // Must be one of the options
    if (votedForId !== matchup.captionA.playerId && votedForId !== matchup.captionB.playerId) {
      return;
    }

    // Check if already voted this matchup
    if (this.matchupVotes.has(socket.id)) return;

    this.matchupVotes.set(socket.id, votedForId);
    this.log(`Vote recorded from ${socket.id}`);

    // Count current votes for live display
    let votesA = 0, votesB = 0;
    for (const [, vid] of this.matchupVotes.entries()) {
      if (vid === matchup.captionA.playerId) votesA++;
      else if (vid === matchup.captionB.playerId) votesB++;
    }

    this.broadcast('cap:vote-update', {
      votesA,
      votesB,
      totalVotes: this.matchupVotes.size,
      totalVoters: this.getEligibleVoterCount(matchup),
    });

    // If everyone who can vote has voted, advance early
    if (this.matchupVotes.size >= this.getEligibleVoterCount(matchup)) {
      this.clearTimer();
      this.endCurrentMatchup();
    }
  }

  getEligibleVoterCount(matchup) {
    // Everyone except the two people in the matchup
    return Math.max(0, this.getPlayerCount() - 2);
  }

  handleNextRound(socket) {
    // Allow any player or spectator to advance
    if (this.phase !== 'round-summary') return;

    // Check if game is over
    if (this.currentRound >= CaptionContestGame.totalRounds) {
      this.startPhase('game-over');
    } else {
      this.nextRound();
    }
  }

  // ============ STATE GETTERS ============

  getHostState() {
    const matchup = this.matchups[this.currentMatchupIndex];

    return {
      gameType: 'caption-contest',
      phase: this.phase,
      round: this.currentRound,
      currentImage: this.currentImage,
      timer: this.timerEnd ? Math.max(0, Math.ceil((this.timerEnd - Date.now()) / 1000)) : null,
      submissions: this.submissions.map(s => ({
        playerName: s.playerName,
        playerId: s.playerId,
      })),
      submissionCount: this.submissions.length,
      playerCount: this.getPlayerCount(),
      scores: this.getScoreboard(),
      matchup: matchup ? {
        index: this.currentMatchupIndex + 1,
        total: this.matchups.length,
        captionA: { text: matchup.captionA.caption, playerName: matchup.captionA.playerName },
        captionB: { text: matchup.captionB.caption, playerName: matchup.captionB.playerName },
        votesA: matchup.votesA || 0,
        votesB: matchup.votesB || 0,
      } : null,
    };
  }

  getPlayerState(playerId) {
    const hasSubmitted = this.submissions.some(s => s.playerId === playerId);
    const hasVoted = this.matchupVotes.has(playerId);
    const matchup = this.matchups[this.currentMatchupIndex];

    // Check if this player is IN the current matchup (can't vote)
    const isInMatchup = matchup && (
      matchup.captionA.playerId === playerId ||
      matchup.captionB.playerId === playerId
    );

    return {
      gameType: 'caption-contest',
      phase: this.phase,
      round: this.currentRound,
      currentImage: this.currentImage,
      timer: this.timerEnd ? Math.max(0, Math.ceil((this.timerEnd - Date.now()) / 1000)) : null,
      hasSubmitted,
      hasVoted,
      isInMatchup,
      myScore: this.scores.get(playerId) || 0,
      matchup: matchup && !isInMatchup ? {
        index: this.currentMatchupIndex + 1,
        total: this.matchups.length,
        captionA: matchup.captionA.caption,
        captionB: matchup.captionB.caption,
        idA: matchup.captionA.playerId,
        idB: matchup.captionB.playerId,
      } : null,
    };
  }

  getScoreboard() {
    return this.room.players
      .map(p => ({
        name: p.name,
        score: this.scores.get(p.id) || 0,
      }))
      .sort((a, b) => b.score - a.score);
  }

  // ============ IMAGE MANAGEMENT ============

  getRandomImage() {
    const activeImages = this.images.filter(img => img.active);
    if (activeImages.length === 0) {
      return `https://picsum.photos/seed/${Date.now()}/800/600`;
    }
    const randomIndex = Math.floor(Math.random() * activeImages.length);
    return activeImages[randomIndex].url;
  }

  generateImageId() {
    return `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  handleUploadImage(socket, { image }) {
    try {
      if (!image || !image.startsWith('data:image/')) {
        socket.emit('cap:image-uploaded', { success: false, message: 'Invalid image' });
        return;
      }

      if (image.length > 10e6) {
        socket.emit('cap:image-uploaded', { success: false, message: 'Image too large' });
        return;
      }

      const newImage = {
        id: this.generateImageId(),
        url: image,
        active: true,
        uploadedAt: Date.now(),
      };

      this.images.push(newImage);
      socket.emit('cap:image-uploaded', { success: true, image: newImage });
      this.broadcast('cap:images-list', this.images);
    } catch (error) {
      socket.emit('cap:image-uploaded', { success: false, message: error.message });
    }
  }

  handleToggleImage(socket, { imageId }) {
    const image = this.images.find(img => img.id === imageId);
    if (image) {
      image.active = !image.active;
      this.broadcast('cap:images-list', this.images);
    }
  }

  handleDeleteImage(socket, { imageId }) {
    const index = this.images.findIndex(img => img.id === imageId);
    if (index !== -1) {
      this.images.splice(index, 1);
      this.broadcast('cap:images-list', this.images);
    }
  }

  // ============ LIFECYCLE ============

  onPlayerDisconnect(playerId) {
    this.submissions = this.submissions.filter(s => s.playerId !== playerId);
    this.matchupVotes.delete(playerId);
    this.scores.delete(playerId);
    this.roundScores.delete(playerId);
  }

  destroy() {
    this.clearTimer();
    super.destroy();
  }
}

module.exports = CaptionContestGame;
