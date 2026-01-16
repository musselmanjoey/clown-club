const BaseGame = require('../BaseGame');
const {
  ROLES,
  TEAM_SIZES,
  ROLE_PRESETS,
  getDifficultyModifier,
  getValidRoles,
  assignRoles,
  calculateVisiblePlayers,
} = require('./roles');
const {
  getQuestTeamSize,
  requiresTwoFails,
  questSucceeds,
  getQuestConfig,
  MAX_REJECTIONS,
} = require('./questConfig');

/**
 * AvalonGame - Social deduction game
 *
 * Players are secretly assigned to Good (Loyal Servants of Arthur) or Evil (Minions of Mordred).
 * Good team tries to complete 3 quests, Evil tries to sabotage.
 * If Good wins, Evil can still win by assassinating Merlin.
 *
 * Flow: lobby → night → team-building → voting → quest → quest-result → [repeat] → assassination/game-over
 * Uses 'av:' prefix for socket events
 *
 * Unlike other games, Avalon has no separate host screen - first player is host and also plays.
 */
class AvalonGame extends BaseGame {
  static gameName = 'Avalon';
  static description = 'Social deduction - find the traitors';
  static minPlayers = 5;
  static maxPlayers = 10;

  // Timer durations (ms)
  static TIMERS = {
    night: 10000,        // Role reveal
    teamBuilding: 90000, // Leader picks team
    voting: 30000,       // Vote on team
    quest: 30000,        // Submit quest cards
    questResult: 5000,   // Show result
    assassination: 60000, // Pick Merlin
    gameOver: 10000,     // Final screen
  };

  constructor(room, io) {
    super(room, io);

    // Host is first player (not a spectator)
    this.hostId = room.players[0]?.id;

    // Game configuration (set in lobby)
    this.selectedRoles = ['merlin', 'assassin']; // Default: basic setup

    // Role assignments (populated after game starts)
    this.roles = new Map(); // playerId → role object
    this.visibleTo = new Map(); // playerId → [playerIds they can see]

    // Seating order (for leader rotation)
    this.seating = []; // Ordered array of playerIds
    this.currentLeaderIndex = 0;

    // Quest tracking
    this.currentQuest = 0; // 0-4
    this.questResults = []; // Array of booleans (true = success)

    // Current round state
    this.proposedTeam = []; // PlayerIds on current quest team
    this.votes = new Map(); // playerId → boolean (approve/reject)
    this.questCards = new Map(); // playerId → boolean (success/fail)
    this.consecutiveRejections = 0;

    // Night phase tracking
    this.nightReady = new Set(); // Players who clicked continue

    // Game phase
    this.phase = 'lobby';
  }

  // ============ GAME FLOW ============

  start() {
    // Game starts in lobby - host configures roles
    this.startPhase('lobby');
  }

  startPhase(phase) {
    this.clearTimer();
    this.phase = phase;
    this.setState(phase);
    this.log(`Phase: ${phase}`);

    switch (phase) {
      case 'lobby':
        this.broadcastLobbyState();
        break;

      case 'night':
        this.startNightPhase();
        break;

      case 'team-building':
        this.startTeamBuildingPhase();
        break;

      case 'voting':
        this.startVotingPhase();
        break;

      case 'quest':
        this.startQuestPhase();
        break;

      case 'quest-result':
        this.startQuestResultPhase();
        break;

      case 'assassination':
        this.startAssassinationPhase();
        break;

      case 'game-over':
        this.startGameOverPhase();
        break;
    }
  }

  broadcastLobbyState() {
    const playerCount = this.getPlayerCount();
    const validRoles = getValidRoles(playerCount);
    const teamSize = TEAM_SIZES[playerCount] || { good: 0, evil: 0 };

    this.broadcast('av:phase-changed', {
      phase: 'lobby',
      hostId: this.hostId,
      players: this.room.players.map(p => ({ id: p.id, name: p.name })),
      selectedRoles: this.selectedRoles,
      difficultyModifier: getDifficultyModifier(this.selectedRoles),
      validRoles,
      teamSize,
      presets: ROLE_PRESETS,
      minPlayers: AvalonGame.minPlayers,
      canStart: playerCount >= AvalonGame.minPlayers,
    });
  }

  startNightPhase() {
    // Assign roles to players
    const playerIds = this.room.players.map(p => p.id);
    this.roles = assignRoles(playerIds, this.selectedRoles);

    // Calculate visibility for each player
    for (const [playerId, role] of this.roles) {
      const visible = calculateVisiblePlayers(role, this.roles);
      this.visibleTo.set(playerId, visible);
    }

    // Set seating order (randomized)
    this.seating = [...playerIds];
    this.shuffleArray(this.seating);
    this.currentLeaderIndex = 0;

    // Clear night ready state
    this.nightReady.clear();

    // Send personalized role info to each player
    for (const [playerId, role] of this.roles) {
      const visible = this.visibleTo.get(playerId) || [];
      const visibleNames = visible.map(id => {
        const player = this.getPlayer(id);
        return { id, name: player?.name || 'Unknown' };
      });

      // Percival sees Merlin and Morgana but doesn't know which is which
      let seesLabel = '';
      if (role.id === 'merlin') {
        seesLabel = 'You see the evil players (except Mordred)';
      } else if (role.id === 'percival') {
        seesLabel = 'You see Merlin (and Morgana if in play) - but which is which?';
      } else if (role.team === 'evil' && !role.hiddenFromEvil) {
        seesLabel = 'You see your fellow evil players (except Oberon)';
      }

      this.sendToPlayer(playerId, 'av:your-role', {
        role: {
          id: role.id,
          name: role.name,
          team: role.team,
          description: role.description,
        },
        sees: visibleNames,
        seesLabel,
      });
    }

    // Broadcast phase change with seating order
    this.broadcast('av:phase-changed', {
      phase: 'night',
      seating: this.seating.map(id => {
        const player = this.getPlayer(id);
        return { id, name: player?.name || 'Unknown' };
      }),
      timer: Math.ceil(AvalonGame.TIMERS.night / 1000),
    });

    // Auto-advance after timer
    this.startTimer(AvalonGame.TIMERS.night, () => {
      this.startPhase('team-building');
    }, 'av:timer');
  }

  startTeamBuildingPhase() {
    // Clear previous round state
    this.proposedTeam = [];
    this.votes.clear();
    this.questCards.clear();

    const leaderId = this.seating[this.currentLeaderIndex];
    const leader = this.getPlayer(leaderId);
    const teamSize = getQuestTeamSize(this.getPlayerCount(), this.currentQuest);

    this.broadcast('av:phase-changed', {
      phase: 'team-building',
      currentQuest: this.currentQuest + 1,
      questResults: this.questResults,
      leaderId,
      leaderName: leader?.name || 'Unknown',
      teamSize,
      seating: this.getSeatingInfo(),
      consecutiveRejections: this.consecutiveRejections,
      maxRejections: MAX_REJECTIONS,
      timer: Math.ceil(AvalonGame.TIMERS.teamBuilding / 1000),
    });

    this.startTimer(AvalonGame.TIMERS.teamBuilding, () => {
      // Auto-reject if leader doesn't propose
      this.consecutiveRejections++;
      this.advanceLeader();
      if (this.consecutiveRejections >= MAX_REJECTIONS) {
        this.evilWins('Too many rejected teams');
      } else {
        this.startPhase('team-building');
      }
    }, 'av:timer');
  }

  startVotingPhase() {
    this.votes.clear();

    const leaderId = this.seating[this.currentLeaderIndex];
    const leader = this.getPlayer(leaderId);
    const teamNames = this.proposedTeam.map(id => {
      const player = this.getPlayer(id);
      return { id, name: player?.name || 'Unknown' };
    });

    this.broadcast('av:phase-changed', {
      phase: 'voting',
      currentQuest: this.currentQuest + 1,
      questResults: this.questResults,
      leaderId,
      leaderName: leader?.name || 'Unknown',
      proposedTeam: teamNames,
      seating: this.getSeatingInfo(),
      consecutiveRejections: this.consecutiveRejections,
      maxRejections: MAX_REJECTIONS,
      timer: Math.ceil(AvalonGame.TIMERS.voting / 1000),
    });

    this.startTimer(AvalonGame.TIMERS.voting, () => {
      this.resolveVoting();
    }, 'av:timer');
  }

  resolveVoting() {
    // Count votes
    let approves = 0;
    let rejects = 0;

    for (const playerId of this.seating) {
      const vote = this.votes.get(playerId);
      if (vote === true) approves++;
      else rejects++; // Abstain counts as reject
    }

    const approved = approves > rejects;

    // Build vote results for display
    const voteResults = this.seating.map(id => {
      const player = this.getPlayer(id);
      return {
        id,
        name: player?.name || 'Unknown',
        vote: this.votes.get(id) ?? null,
      };
    });

    this.broadcast('av:vote-result', {
      approved,
      approves,
      rejects,
      voteResults,
    });

    if (approved) {
      this.consecutiveRejections = 0;
      // Short delay then start quest
      setTimeout(() => this.startPhase('quest'), 2000);
    } else {
      this.consecutiveRejections++;
      this.advanceLeader();

      if (this.consecutiveRejections >= MAX_REJECTIONS) {
        setTimeout(() => this.evilWins('Too many rejected teams'), 2000);
      } else {
        setTimeout(() => this.startPhase('team-building'), 2000);
      }
    }
  }

  startQuestPhase() {
    this.questCards.clear();

    const teamNames = this.proposedTeam.map(id => {
      const player = this.getPlayer(id);
      return { id, name: player?.name || 'Unknown' };
    });

    this.broadcast('av:phase-changed', {
      phase: 'quest',
      currentQuest: this.currentQuest + 1,
      questResults: this.questResults,
      questTeam: teamNames,
      requiresTwoFails: requiresTwoFails(this.getPlayerCount(), this.currentQuest),
      seating: this.getSeatingInfo(),
      timer: Math.ceil(AvalonGame.TIMERS.quest / 1000),
    });

    this.startTimer(AvalonGame.TIMERS.quest, () => {
      this.resolveQuest();
    }, 'av:timer');
  }

  resolveQuest() {
    // Count fail cards
    let failCount = 0;
    for (const playerId of this.proposedTeam) {
      const card = this.questCards.get(playerId);
      if (card === false) failCount++;
      // If player didn't submit, count as success (good players can't fail)
    }

    const success = questSucceeds(failCount, this.getPlayerCount(), this.currentQuest);
    this.questResults.push(success);

    this.broadcast('av:quest-complete', {
      questNumber: this.currentQuest + 1,
      success,
      failCount,
      questResults: this.questResults,
    });

    // Check win conditions
    const goodWins = this.questResults.filter(r => r === true).length;
    const evilWins = this.questResults.filter(r => r === false).length;

    if (goodWins >= 3) {
      // Good completed 3 quests - but evil can still assassinate Merlin
      setTimeout(() => this.startPhase('assassination'), 3000);
    } else if (evilWins >= 3) {
      setTimeout(() => this.evilWins('Failed 3 quests'), 3000);
    } else {
      // Next quest
      this.currentQuest++;
      this.advanceLeader();
      setTimeout(() => this.startPhase('team-building'), 3000);
    }
  }

  startAssassinationPhase() {
    // Find assassin
    let assassinId = null;
    for (const [playerId, role] of this.roles) {
      if (role.canAssassinate) {
        assassinId = playerId;
        break;
      }
    }

    // If no assassin, good wins
    if (!assassinId) {
      this.goodWins();
      return;
    }

    const assassin = this.getPlayer(assassinId);

    this.broadcast('av:phase-changed', {
      phase: 'assassination',
      assassinId,
      assassinName: assassin?.name || 'Unknown',
      questResults: this.questResults,
      seating: this.getSeatingInfo(),
      timer: Math.ceil(AvalonGame.TIMERS.assassination / 1000),
    });

    this.startTimer(AvalonGame.TIMERS.assassination, () => {
      // Time ran out - good wins
      this.goodWins();
    }, 'av:timer');
  }

  goodWins() {
    this.broadcast('av:game-result', {
      winner: 'good',
      reason: 'Completed 3 quests and Merlin survived',
    });
    this.startPhase('game-over');
  }

  evilWins(reason) {
    this.broadcast('av:game-result', {
      winner: 'evil',
      reason,
    });
    this.startPhase('game-over');
  }

  startGameOverPhase() {
    // Reveal all roles
    const roleReveal = this.seating.map(id => {
      const player = this.getPlayer(id);
      const role = this.roles.get(id);
      return {
        id,
        name: player?.name || 'Unknown',
        role: role ? {
          id: role.id,
          name: role.name,
          team: role.team,
        } : null,
      };
    });

    this.broadcast('av:phase-changed', {
      phase: 'game-over',
      questResults: this.questResults,
      roleReveal,
      hostId: this.hostId,
    });

    this.startTimer(AvalonGame.TIMERS.gameOver, () => {
      this.endGame();
    }, 'av:timer');
  }

  endGame() {
    this.setState('ended');
    this.log('Game ended');
    this.broadcast('game:ended', {
      gameType: 'avalon',
    });
  }

  // ============ HELPERS ============

  getSeatingInfo() {
    return this.seating.map((id, index) => {
      const player = this.getPlayer(id);
      const role = this.roles.get(id);
      return {
        id,
        name: player?.name || 'Unknown',
        isLeader: index === this.currentLeaderIndex,
        isOnTeam: this.proposedTeam.includes(id),
        // Don't reveal role during game
      };
    });
  }

  advanceLeader() {
    this.currentLeaderIndex = (this.currentLeaderIndex + 1) % this.seating.length;
  }

  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  // ============ EVENT HANDLERS ============

  handleEvent(socket, event, data) {
    switch (event) {
      case 'av:configure-roles':
        this.handleConfigureRoles(socket, data);
        break;
      case 'av:start-game':
        this.handleStartGame(socket);
        break;
      case 'av:night-ready':
        this.handleNightReady(socket);
        break;
      case 'av:propose-team':
        this.handleProposeTeam(socket, data);
        break;
      case 'av:update-team':
        this.handleUpdateTeam(socket, data);
        break;
      case 'av:vote':
        this.handleVote(socket, data);
        break;
      case 'av:quest-card':
        this.handleQuestCard(socket, data);
        break;
      case 'av:assassinate':
        this.handleAssassinate(socket, data);
        break;
      default:
        this.log(`Unknown event: ${event}`);
    }
  }

  handleConfigureRoles(socket, { roles }) {
    if (socket.id !== this.hostId) return;
    if (this.phase !== 'lobby') return;

    // Validate roles
    if (!Array.isArray(roles)) return;

    this.selectedRoles = roles;
    this.log(`Roles configured: ${roles.join(', ')}`);

    // Rebroadcast lobby state
    this.broadcastLobbyState();
  }

  handleStartGame(socket) {
    if (socket.id !== this.hostId) return;
    if (this.phase !== 'lobby') return;

    if (this.getPlayerCount() < AvalonGame.minPlayers) {
      socket.emit('av:error', {
        message: `Need at least ${AvalonGame.minPlayers} players to start`,
      });
      return;
    }

    this.log('Game starting');
    this.startPhase('night');
  }

  handleNightReady(socket) {
    if (this.phase !== 'night') return;

    this.nightReady.add(socket.id);

    // If all players ready, advance immediately
    if (this.nightReady.size >= this.getPlayerCount()) {
      this.clearTimer();
      this.startPhase('team-building');
    }
  }

  handleUpdateTeam(socket, { playerIds }) {
    if (this.phase !== 'team-building') return;

    const leaderId = this.seating[this.currentLeaderIndex];
    if (socket.id !== leaderId) return;

    // Validate player IDs
    if (!Array.isArray(playerIds)) return;

    const validIds = playerIds.filter(id => this.seating.includes(id));
    this.proposedTeam = validIds;

    // Broadcast team update to all players
    this.broadcast('av:team-update', {
      proposedTeam: this.proposedTeam.map(id => {
        const player = this.getPlayer(id);
        return { id, name: player?.name || 'Unknown' };
      }),
    });
  }

  handleProposeTeam(socket, { playerIds }) {
    if (this.phase !== 'team-building') return;

    const leaderId = this.seating[this.currentLeaderIndex];
    if (socket.id !== leaderId) return;

    // Validate player IDs
    if (!Array.isArray(playerIds)) return;

    const teamSize = getQuestTeamSize(this.getPlayerCount(), this.currentQuest);
    const validIds = playerIds.filter(id => this.seating.includes(id));

    if (validIds.length !== teamSize) {
      socket.emit('av:error', {
        message: `Team must have exactly ${teamSize} players`,
      });
      return;
    }

    this.proposedTeam = validIds;
    this.log(`Team proposed: ${validIds.join(', ')}`);

    this.clearTimer();
    this.startPhase('voting');
  }

  handleVote(socket, { approve }) {
    if (this.phase !== 'voting') return;

    if (!this.seating.includes(socket.id)) return;
    if (this.votes.has(socket.id)) return;

    this.votes.set(socket.id, approve === true);

    const player = this.getPlayer(socket.id);
    this.log(`${player?.name} voted ${approve ? 'approve' : 'reject'}`);

    // Broadcast vote progress (not individual votes yet)
    this.broadcast('av:vote-progress', {
      votesIn: this.votes.size,
      totalPlayers: this.seating.length,
    });

    // If all votes in, resolve
    if (this.votes.size >= this.seating.length) {
      this.clearTimer();
      this.resolveVoting();
    }
  }

  handleQuestCard(socket, { success }) {
    if (this.phase !== 'quest') return;

    if (!this.proposedTeam.includes(socket.id)) return;
    if (this.questCards.has(socket.id)) return;

    const role = this.roles.get(socket.id);

    // Good players MUST play success
    if (role?.team === 'good' && success === false) {
      socket.emit('av:error', { message: 'Loyal servants cannot fail quests' });
      return;
    }

    this.questCards.set(socket.id, success === true);

    const player = this.getPlayer(socket.id);
    this.log(`${player?.name} submitted quest card`);

    // Broadcast progress (not individual cards)
    this.broadcast('av:quest-progress', {
      cardsIn: this.questCards.size,
      teamSize: this.proposedTeam.length,
    });

    // If all cards in, resolve
    if (this.questCards.size >= this.proposedTeam.length) {
      this.clearTimer();
      this.resolveQuest();
    }
  }

  handleAssassinate(socket, { targetId }) {
    if (this.phase !== 'assassination') return;

    // Only assassin can assassinate
    const role = this.roles.get(socket.id);
    if (!role?.canAssassinate) return;

    // Validate target
    if (!this.seating.includes(targetId)) return;

    const target = this.getPlayer(targetId);
    const targetRole = this.roles.get(targetId);

    this.log(`Assassin targets ${target?.name}`);

    this.clearTimer();

    // Check if target is Merlin
    if (targetRole?.id === 'merlin') {
      this.broadcast('av:assassination-result', {
        targetId,
        targetName: target?.name || 'Unknown',
        wasMerlin: true,
      });
      setTimeout(() => this.evilWins('Assassin found Merlin'), 3000);
    } else {
      this.broadcast('av:assassination-result', {
        targetId,
        targetName: target?.name || 'Unknown',
        wasMerlin: false,
      });
      setTimeout(() => this.goodWins(), 3000);
    }
  }

  // ============ STATE GETTERS ============

  getHostState() {
    // Not really used since there's no separate host display
    return this.getGenericState();
  }

  getPlayerState(playerId) {
    const role = this.roles.get(playerId);
    const visible = this.visibleTo.get(playerId) || [];
    const leaderId = this.seating[this.currentLeaderIndex];
    const playerCount = this.getPlayerCount();

    return {
      gameType: 'avalon',
      phase: this.phase,
      isHost: playerId === this.hostId,
      hostId: this.hostId,
      isLeader: playerId === leaderId,
      leaderId: leaderId,
      isOnTeam: this.proposedTeam.includes(playerId),
      myRole: role ? {
        id: role.id,
        name: role.name,
        team: role.team,
        description: role.description,
      } : null,
      visiblePlayers: visible.map(id => {
        const player = this.getPlayer(id);
        return { id, name: player?.name || 'Unknown' };
      }),
      players: this.room.players.map(p => ({ id: p.id, name: p.name })),
      minPlayers: AvalonGame.minPlayers,
      canStart: playerCount >= AvalonGame.minPlayers,
      currentQuest: this.currentQuest + 1,
      questResults: this.questResults,
      seating: this.getSeatingInfo(),
      proposedTeam: this.proposedTeam.map(id => {
        const player = this.getPlayer(id);
        return { id, name: player?.name || 'Unknown' };
      }),
      hasVoted: this.votes.has(playerId),
      hasSubmittedCard: this.questCards.has(playerId),
      consecutiveRejections: this.consecutiveRejections,
      maxRejections: MAX_REJECTIONS,
      timer: this.getTimerRemaining(),
    };
  }

  getGenericState() {
    return {
      gameType: 'avalon',
      phase: this.phase,
      currentQuest: this.currentQuest + 1,
      questResults: this.questResults,
      seating: this.getSeatingInfo(),
      proposedTeam: this.proposedTeam.map(id => {
        const player = this.getPlayer(id);
        return { id, name: player?.name || 'Unknown' };
      }),
      consecutiveRejections: this.consecutiveRejections,
      timer: this.getTimerRemaining(),
    };
  }

  // ============ LIFECYCLE ============

  onPlayerDisconnect(playerId) {
    // Remove from tracking
    this.votes.delete(playerId);
    this.questCards.delete(playerId);
    this.nightReady.delete(playerId);

    // Remove from seating
    const seatIndex = this.seating.indexOf(playerId);
    if (seatIndex !== -1) {
      this.seating.splice(seatIndex, 1);

      // Adjust leader index if needed
      if (this.currentLeaderIndex >= this.seating.length) {
        this.currentLeaderIndex = 0;
      }
    }

    // Remove from proposed team
    this.proposedTeam = this.proposedTeam.filter(id => id !== playerId);

    // If host left, assign new host
    if (playerId === this.hostId && this.seating.length > 0) {
      this.hostId = this.seating[0];
      this.log(`New host: ${this.hostId}`);
    }

    // Check if game should end
    if (this.seating.length < AvalonGame.minPlayers) {
      this.log('Not enough players remaining, ending game');
      this.broadcast('av:error', { message: 'Not enough players remaining' });
      this.endGame();
    }
  }

  destroy() {
    this.clearTimer();
    super.destroy();
  }
}

module.exports = AvalonGame;
