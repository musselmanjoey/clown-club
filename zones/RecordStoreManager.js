/**
 * RecordStoreManager - Handles Record Store zone socket events
 *
 * Manages:
 * - Spotify playback sync across all players in the records zone
 * - Vinyl collection browsing
 * - Record reviews
 *
 * Event prefix: rs:
 */

const spotifyManager = require('../core/SpotifyManager');
const vinylService = require('../services/vinylService');

class RecordStoreManager {
  constructor(io, roomManager) {
    this.io = io;
    this.roomManager = roomManager;
    // Track which rooms have active record store sync
    this.activeSyncs = new Set();
  }

  /**
   * Handle incoming rs: socket events
   * @param {Socket} socket - Socket.IO socket
   * @param {string} event - Event name (e.g., 'rs:play')
   * @param {Object} data - Event data
   */
  handleEvent(socket, event, data) {
    const roomCode = this.getRoomCode(socket);
    if (!roomCode) {
      socket.emit('rs:error', { error: 'Not in a room' });
      return;
    }

    switch (event) {
      case 'rs:authenticate':
        this.handleAuthenticate(socket, roomCode, data);
        break;
      case 'rs:request-state':
        this.handleRequestState(socket, roomCode);
        break;
      case 'rs:play':
        this.handlePlay(socket, roomCode, data);
        break;
      case 'rs:pause':
        this.handlePause(socket, roomCode);
        break;
      case 'rs:skip':
        this.handleSkip(socket, roomCode);
        break;
      case 'rs:previous':
        this.handlePrevious(socket, roomCode);
        break;
      case 'rs:queue-track':
        this.handleQueueTrack(socket, roomCode, data);
        break;
      case 'rs:browse-vinyl':
        this.handleBrowseVinyl(socket, roomCode, data);
        break;
      case 'rs:view-review':
        this.handleViewReview(socket, roomCode, data);
        break;
      default:
        console.warn(`[RecordStore] Unknown event: ${event}`);
    }
  }

  /**
   * Get room code for a socket
   */
  getRoomCode(socket) {
    return this.roomManager.playerRooms.get(socket.id) ||
           this.roomManager.spectators.get(socket.id);
  }

  /**
   * Get zone room name for broadcasting
   */
  getZoneRoom(roomCode) {
    return `${roomCode}:records`;
  }

  /**
   * Broadcast to all players in the records zone
   */
  broadcast(roomCode, event, data) {
    this.io.to(this.getZoneRoom(roomCode)).emit(event, data);
  }

  // ========== Spotify Authentication ==========

  /**
   * Handle Spotify authentication from host
   */
  handleAuthenticate(socket, roomCode, data) {
    const { tokens } = data;

    if (!tokens?.access_token || !tokens?.refresh_token) {
      socket.emit('rs:error', { error: 'Invalid token data' });
      return;
    }

    // Store tokens with host socket ID
    spotifyManager.setTokens(roomCode, tokens, socket.id);

    // Start playback sync for this room
    this.startPlaybackSync(roomCode);

    socket.emit('rs:auth-complete', { success: true });
    console.log(`[RecordStore] Spotify authenticated for room ${roomCode}`);
  }

  // ========== Playback State ==========

  /**
   * Handle request for current playback state
   */
  async handleRequestState(socket, roomCode) {
    const state = spotifyManager.getPlaybackState(roomCode);

    if (state) {
      socket.emit('rs:state-update', spotifyManager.formatPlaybackState(state));
    } else if (spotifyManager.isAuthenticated(roomCode)) {
      // Fetch fresh state
      const freshState = await spotifyManager.fetchPlaybackState(roomCode);
      if (freshState) {
        socket.emit('rs:state-update', spotifyManager.formatPlaybackState(freshState));
      } else {
        socket.emit('rs:state-update', { isPlaying: false, track: null });
      }
    } else {
      socket.emit('rs:state-update', {
        isPlaying: false,
        track: null,
        authenticated: false,
      });
    }
  }

  /**
   * Start periodic playback sync for a room
   */
  startPlaybackSync(roomCode) {
    if (this.activeSyncs.has(roomCode)) return;

    this.activeSyncs.add(roomCode);

    spotifyManager.startSync(roomCode, (state) => {
      this.broadcast(roomCode, 'rs:state-update', state);
    }, 1000);
  }

  /**
   * Stop playback sync for a room
   */
  stopPlaybackSync(roomCode) {
    this.activeSyncs.delete(roomCode);
    spotifyManager.stopSync(roomCode);
  }

  // ========== Playback Controls ==========

  /**
   * Handle play command
   */
  async handlePlay(socket, roomCode, data) {
    if (!spotifyManager.isAuthenticated(roomCode)) {
      socket.emit('rs:error', { error: 'Spotify not connected' });
      return;
    }

    const options = {};
    if (data?.uri) options.uris = [data.uri];
    if (data?.context_uri) options.context_uri = data.context_uri;

    const success = await spotifyManager.executeCommand(roomCode, 'play', options);

    if (!success) {
      socket.emit('rs:error', { error: 'Failed to play' });
    }
  }

  /**
   * Handle pause command
   */
  async handlePause(socket, roomCode) {
    if (!spotifyManager.isAuthenticated(roomCode)) {
      socket.emit('rs:error', { error: 'Spotify not connected' });
      return;
    }

    const success = await spotifyManager.executeCommand(roomCode, 'pause');

    if (!success) {
      socket.emit('rs:error', { error: 'Failed to pause' });
    }
  }

  /**
   * Handle skip to next track
   */
  async handleSkip(socket, roomCode) {
    if (!spotifyManager.isAuthenticated(roomCode)) {
      socket.emit('rs:error', { error: 'Spotify not connected' });
      return;
    }

    const success = await spotifyManager.executeCommand(roomCode, 'next');

    if (!success) {
      socket.emit('rs:error', { error: 'Failed to skip' });
    }
  }

  /**
   * Handle previous track
   */
  async handlePrevious(socket, roomCode) {
    if (!spotifyManager.isAuthenticated(roomCode)) {
      socket.emit('rs:error', { error: 'Spotify not connected' });
      return;
    }

    const success = await spotifyManager.executeCommand(roomCode, 'previous');

    if (!success) {
      socket.emit('rs:error', { error: 'Failed to go to previous' });
    }
  }

  /**
   * Handle adding track to queue
   */
  async handleQueueTrack(socket, roomCode, data) {
    if (!spotifyManager.isAuthenticated(roomCode)) {
      socket.emit('rs:error', { error: 'Spotify not connected' });
      return;
    }

    if (!data?.uri) {
      socket.emit('rs:error', { error: 'No track URI provided' });
      return;
    }

    const success = await spotifyManager.executeCommand(roomCode, 'queue', { uri: data.uri });

    if (success) {
      socket.emit('rs:queue-added', { uri: data.uri });
    } else {
      socket.emit('rs:error', { error: 'Failed to add to queue' });
    }
  }

  // ========== Vinyl Collection ==========

  /**
   * Handle browsing vinyl collection
   */
  async handleBrowseVinyl(socket, roomCode, data) {
    try {
      const { genre, limit, offset } = data || {};
      const vinyl = await vinylService.getVinylCollection({ genre, limit, offset });

      socket.emit('rs:vinyl-data', {
        vinyl,
        total: vinyl.length,
      });
    } catch (err) {
      console.error('[RecordStore] Failed to fetch vinyl:', err);
      socket.emit('rs:error', { error: 'Failed to load vinyl collection' });
    }
  }

  /**
   * Handle viewing a record review
   */
  async handleViewReview(socket, roomCode, data) {
    try {
      const { albumId } = data;

      const review = await vinylService.getReview(albumId);

      if (review) {
        socket.emit('rs:review-data', { review });
      } else {
        socket.emit('rs:review-data', { review: null, message: 'No review found' });
      }
    } catch (err) {
      console.error('[RecordStore] Failed to fetch review:', err);
      socket.emit('rs:error', { error: 'Failed to load review' });
    }
  }

  // ========== Player Zone Events ==========

  /**
   * Called when a player enters the records zone
   */
  onPlayerEnter(roomCode, socketId) {
    // Start sync if Spotify is authenticated and not already syncing
    if (spotifyManager.isAuthenticated(roomCode) && !this.activeSyncs.has(roomCode)) {
      this.startPlaybackSync(roomCode);
    }
  }

  /**
   * Called when a player leaves the records zone
   */
  onPlayerLeave(roomCode, socketId) {
    // Check if anyone is still in the zone
    const zoneRoom = this.getZoneRoom(roomCode);
    const sockets = this.io.sockets.adapter.rooms.get(zoneRoom);

    // If no one left in zone, stop sync
    if (!sockets || sockets.size === 0) {
      this.stopPlaybackSync(roomCode);
    }
  }

  /**
   * Called when a room is closed
   */
  onRoomClose(roomCode) {
    this.stopPlaybackSync(roomCode);
    spotifyManager.clearTokens(roomCode);
  }
}

module.exports = RecordStoreManager;
