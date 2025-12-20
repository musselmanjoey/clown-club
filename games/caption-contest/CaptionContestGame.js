const BaseGame = require('../BaseGame');

/**
 * CaptionContestGame - Players submit captions for images and vote on the best
 * Note: Uses 'cap:' prefix to avoid conflict with clown-club's 'cc:' prefix
 */
class CaptionContestGame extends BaseGame {
  static gameName = 'Caption Contest';
  static description = 'Submit funny captions for images and vote for the best one!';
  static minPlayers = 2;
  static maxPlayers = 12;

  constructor(room, io) {
    super(room, io);

    // Game-specific state
    this.currentRound = 0;
    this.submissions = [];
    this.votes = new Map();
    this.scores = new Map();
    this.currentImage = null;

    // Image management (shared across all games on this server instance)
    this.gameImages = CaptionContestGame.sharedImages;

    // Initialize scores for all players
    for (const player of room.players) {
      this.scores.set(player.id, 0);
    }
  }

  // Shared images storage (static so persists across game instances)
  static sharedImages = [];

  /**
   * Start the game
   */
  start() {
    this.nextRound();
  }

  /**
   * Start a new round
   */
  nextRound() {
    this.currentRound++;
    this.submissions = [];
    this.votes = new Map();
    this.currentImage = this.getRandomImage();
    this.setState('submitting');

    this.log(`Round ${this.currentRound} started`);
    this.broadcast('cap:game-state-changed', {
      gameState: 'submitting',
      currentImage: this.currentImage,
      round: this.currentRound
    });
  }

  /**
   * Get host state for TV display
   */
  getHostState() {
    return {
      state: this.state,
      round: this.currentRound,
      currentImage: this.currentImage,
      submissions: this.state === 'voting' || this.state === 'results'
        ? this.submissions.map(s => ({ caption: s.caption, playerId: s.playerId }))
        : [],
      submissionCount: this.submissions.length,
      voteCount: this.votes.size,
      playerCount: this.getPlayerCount(),
      scores: this.getScoreboard()
    };
  }

  /**
   * Get player state for phone controller
   */
  getPlayerState(playerId) {
    const hasSubmitted = this.submissions.some(s => s.playerId === playerId);
    const hasVoted = this.votes.has(playerId);

    return {
      state: this.state,
      round: this.currentRound,
      currentImage: this.currentImage,
      hasSubmitted,
      hasVoted,
      submissions: this.state === 'voting'
        ? this.submissions.filter(s => s.playerId !== playerId).map(s => ({ caption: s.caption, playerId: s.playerId }))
        : [],
      myScore: this.scores.get(playerId) || 0
    };
  }

  /**
   * Handle game-specific events
   */
  handleEvent(socket, event, data) {
    switch (event) {
      case 'cap:submit-caption':
        this.handleSubmitCaption(socket, data);
        break;
      case 'cap:vote-caption':
        this.handleVoteCaption(socket, data);
        break;
      case 'cap:next-round':
        this.handleNextRound(socket);
        break;
      case 'cap:get-images':
        socket.emit('cap:images-list', CaptionContestGame.sharedImages);
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

  /**
   * Handle caption submission
   */
  handleSubmitCaption(socket, { caption }) {
    if (this.state !== 'submitting') return;

    const player = this.getPlayer(socket.id);
    if (!player) return;

    // Check if already submitted
    if (this.submissions.some(s => s.playerId === socket.id)) return;

    const submission = {
      playerId: socket.id,
      playerName: player.name,
      caption: caption.trim()
    };
    this.submissions.push(submission);

    this.log(`${player.name} submitted caption`);

    // Notify all players
    this.broadcast('cap:submission-received', {
      playerName: player.name,
      totalSubmissions: this.submissions.length,
      totalPlayers: this.getPlayerCount()
    });

    // If everyone submitted, move to voting
    if (this.submissions.length === this.getPlayerCount()) {
      this.startVoting();
    }
  }

  /**
   * Start voting phase
   */
  startVoting() {
    this.setState('voting');
    this.votes = new Map();

    this.log('All submissions in, voting started');
    this.broadcast('cap:game-state-changed', {
      gameState: 'voting',
      submissions: this.submissions.map(s => ({
        caption: s.caption,
        playerId: s.playerId
      }))
    });
  }

  /**
   * Handle vote
   */
  handleVoteCaption(socket, { votedForId }) {
    if (this.state !== 'voting') return;

    // Can't vote for yourself
    if (votedForId === socket.id) {
      socket.emit('error', { message: "Can't vote for yourself!" });
      return;
    }

    // Check if already voted
    if (this.votes.has(socket.id)) return;

    this.votes.set(socket.id, votedForId);
    this.log('Vote recorded');

    // Notify vote count
    this.broadcast('cap:vote-recorded', {
      votesReceived: this.votes.size,
      totalPlayers: this.getPlayerCount()
    });

    // If everyone voted, show results
    if (this.votes.size === this.getPlayerCount()) {
      this.showResults();
    }
  }

  /**
   * Calculate and show results
   */
  showResults() {
    // Tally votes
    const voteCounts = new Map();
    for (const [voter, votedFor] of this.votes.entries()) {
      voteCounts.set(votedFor, (voteCounts.get(votedFor) || 0) + 1);
    }

    // Update scores
    for (const [playerId, voteCount] of voteCounts.entries()) {
      const currentScore = this.scores.get(playerId) || 0;
      this.scores.set(playerId, currentScore + voteCount);

      // Update player score in players array
      const player = this.getPlayer(playerId);
      if (player) player.score = currentScore + voteCount;
    }

    // Find winner of this round
    let maxVotes = 0;
    let winnerId = null;
    for (const [playerId, votes] of voteCounts.entries()) {
      if (votes > maxVotes) {
        maxVotes = votes;
        winnerId = playerId;
      }
    }

    const winner = this.getPlayer(winnerId);
    const winningSubmission = this.submissions.find(s => s.playerId === winnerId);

    this.setState('results');
    this.log(`Round ${this.currentRound} winner: ${winner?.name}`);

    this.broadcast('cap:game-state-changed', {
      gameState: 'results',
      winner: winner ? { id: winner.id, name: winner.name } : null,
      winningCaption: winningSubmission?.caption,
      allScores: this.getScoreboard(),
      voteCounts: Array.from(voteCounts.entries()).map(([id, count]) => {
        const player = this.getPlayer(id);
        const submission = this.submissions.find(s => s.playerId === id);
        return {
          playerName: player?.name,
          caption: submission?.caption,
          votes: count
        };
      })
    });
  }

  /**
   * Handle next round request (host only)
   */
  handleNextRound(socket) {
    if (!this.isHost(socket.id)) return;
    this.nextRound();
  }

  /**
   * Get scoreboard sorted by score
   */
  getScoreboard() {
    return this.room.players
      .map(p => ({
        name: p.name,
        score: this.scores.get(p.id) || 0
      }))
      .sort((a, b) => b.score - a.score);
  }

  // ============ Image Management ============

  getRandomImage() {
    const activeImages = CaptionContestGame.sharedImages.filter(img => img.active);
    if (activeImages.length === 0) {
      return `https://picsum.photos/seed/${Date.now()}/800/600`;
    }
    const randomIndex = Math.floor(Math.random() * activeImages.length);
    return activeImages[randomIndex].url;
  }

  generateImageId() {
    return `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  handleUploadImage(socket, { image, filename }) {
    try {
      if (!image) {
        socket.emit('cap:image-uploaded', { success: false, message: 'No image data provided' });
        return;
      }

      if (image.length > 10e6) {
        socket.emit('cap:image-uploaded', { success: false, message: 'Image too large (max 7MB)' });
        return;
      }

      if (!image.startsWith('data:image/')) {
        socket.emit('cap:image-uploaded', { success: false, message: 'Invalid image format' });
        return;
      }

      const newImage = {
        id: this.generateImageId(),
        url: image,
        active: true,
        uploadedAt: Date.now()
      };

      CaptionContestGame.sharedImages.push(newImage);
      this.log(`Image uploaded: ${newImage.id}`);

      socket.emit('cap:image-uploaded', { success: true, message: 'Image uploaded!', image: newImage });
      this.io.emit('cap:images-list', CaptionContestGame.sharedImages);
    } catch (error) {
      socket.emit('cap:image-uploaded', { success: false, message: `Upload failed: ${error.message}` });
    }
  }

  handleToggleImage(socket, { imageId }) {
    const image = CaptionContestGame.sharedImages.find(img => img.id === imageId);
    if (image) {
      image.active = !image.active;
      this.log(`Image ${imageId} ${image.active ? 'activated' : 'deactivated'}`);
      this.io.emit('cap:images-list', CaptionContestGame.sharedImages);
    }
  }

  handleDeleteImage(socket, { imageId }) {
    const index = CaptionContestGame.sharedImages.findIndex(img => img.id === imageId);
    if (index !== -1) {
      CaptionContestGame.sharedImages.splice(index, 1);
      this.log(`Image deleted: ${imageId}`);
      this.io.emit('cap:images-list', CaptionContestGame.sharedImages);
    }
  }

  /**
   * Handle player disconnection mid-game
   */
  onPlayerDisconnect(playerId) {
    // Remove their submission if in submitting phase
    if (this.state === 'submitting') {
      this.submissions = this.submissions.filter(s => s.playerId !== playerId);
    }

    // Remove their vote if in voting phase
    if (this.state === 'voting') {
      this.votes.delete(playerId);
    }

    // Remove their score
    this.scores.delete(playerId);
  }
}

module.exports = CaptionContestGame;
