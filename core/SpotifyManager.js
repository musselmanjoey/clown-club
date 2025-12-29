/**
 * SpotifyManager - Manages Spotify tokens and playback state per room
 *
 * Supports two modes:
 * 1. Per-room tokens (each room host authenticates separately)
 * 2. Global host mode (single account used by all rooms - for party DJ setup)
 *
 * Use GLOBAL_HOST as roomCode for single-account mode.
 */

const SPOTIFY_API_URL = 'https://api.spotify.com/v1';
const TOKEN_REFRESH_MARGIN = 5 * 60 * 1000; // Refresh 5 minutes before expiry
const GLOBAL_HOST = '__GLOBAL_HOST__';

class SpotifyManager {
  constructor() {
    // Map of roomCode -> token data
    this.roomTokens = new Map();
    // Map of roomCode -> playback state
    this.playbackStates = new Map();
    // Map of roomCode -> sync interval ID
    this.syncIntervals = new Map();
    // Whether to use global host mode (single Spotify account for all rooms)
    this.useGlobalHost = false;
  }

  /**
   * Enable global host mode - all rooms share one Spotify account
   */
  enableGlobalHost() {
    this.useGlobalHost = true;
  }

  /**
   * Disable global host mode - each room has separate Spotify auth
   */
  disableGlobalHost() {
    this.useGlobalHost = false;
  }

  /**
   * Get the effective room key (global or room-specific)
   * @param {string} roomCode - Original room code
   * @returns {string} The key to use for token lookup
   */
  getEffectiveRoomKey(roomCode) {
    if (this.useGlobalHost && this.roomTokens.has(GLOBAL_HOST)) {
      return GLOBAL_HOST;
    }
    return roomCode;
  }

  /**
   * Store tokens for a room
   * @param {string} roomCode - Room code
   * @param {Object} tokens - Token data from OAuth
   * @param {string} hostSocketId - Socket ID of the host who authenticated
   */
  setTokens(roomCode, tokens, hostSocketId) {
    this.roomTokens.set(roomCode, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expires_at || Date.now() + (tokens.expires_in || 3600) * 1000,
      hostSocketId,
    });
    console.log(`[Spotify] Tokens set for room ${roomCode}`);
  }

  /**
   * Store tokens for global host (single-account mode)
   * @param {Object} tokens - Token data from OAuth
   * @param {string} hostSocketId - Socket ID of the host who authenticated
   */
  setGlobalTokens(tokens, hostSocketId) {
    this.setTokens(GLOBAL_HOST, tokens, hostSocketId);
    this.enableGlobalHost();
    console.log(`[Spotify] Global host tokens set`);
  }

  /**
   * Get access token for global host
   * @returns {Promise<string|null>}
   */
  async getGlobalAccessToken() {
    return this.getAccessToken(GLOBAL_HOST);
  }

  /**
   * Check if room has valid Spotify authentication
   * @param {string} roomCode - Room code
   * @returns {boolean}
   */
  isAuthenticated(roomCode) {
    const key = this.getEffectiveRoomKey(roomCode);
    return this.roomTokens.has(key);
  }

  /**
   * Check if global host is authenticated
   * @returns {boolean}
   */
  isGlobalAuthenticated() {
    return this.roomTokens.has(GLOBAL_HOST);
  }

  /**
   * Get access token, refreshing if needed
   * @param {string} roomCode - Room code
   * @returns {Promise<string|null>} Access token or null if not authenticated
   */
  async getAccessToken(roomCode) {
    const key = this.getEffectiveRoomKey(roomCode);
    const tokens = this.roomTokens.get(key);
    if (!tokens) return null;

    // Check if token needs refresh
    if (Date.now() > tokens.expiresAt - TOKEN_REFRESH_MARGIN) {
      try {
        await this.refreshTokens(key);
      } catch (err) {
        console.error(`[Spotify] Failed to refresh token for room ${key}:`, err);
        return null;
      }
    }

    return this.roomTokens.get(key)?.accessToken || null;
  }

  /**
   * Refresh tokens using refresh token
   * @param {string} roomCode - Room code
   */
  async refreshTokens(roomCode) {
    const tokens = this.roomTokens.get(roomCode);
    if (!tokens?.refreshToken) {
      throw new Error('No refresh token available');
    }

    // Call Next.js API route to refresh (keeps client credentials server-side)
    const baseUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/spotify/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: tokens.refreshToken }),
    });

    if (!response.ok) {
      throw new Error('Token refresh failed');
    }

    const newTokens = await response.json();

    this.roomTokens.set(roomCode, {
      ...tokens,
      accessToken: newTokens.access_token,
      refreshToken: newTokens.refresh_token || tokens.refreshToken,
      expiresAt: newTokens.expires_at,
    });

    console.log(`[Spotify] Tokens refreshed for room ${roomCode}`);
  }

  /**
   * Clear tokens for a room
   * @param {string} roomCode - Room code
   */
  clearTokens(roomCode) {
    this.roomTokens.delete(roomCode);
    this.playbackStates.delete(roomCode);
    this.stopSync(roomCode);
    console.log(`[Spotify] Tokens cleared for room ${roomCode}`);
  }

  /**
   * Get host socket ID for a room
   * @param {string} roomCode - Room code
   * @returns {string|null}
   */
  getHostSocketId(roomCode) {
    return this.roomTokens.get(roomCode)?.hostSocketId || null;
  }

  // ========== Playback Control ==========

  /**
   * Fetch current playback state from Spotify
   * @param {string} roomCode - Room code
   * @returns {Promise<Object|null>}
   */
  async fetchPlaybackState(roomCode) {
    const accessToken = await this.getAccessToken(roomCode);
    if (!accessToken) return null;

    try {
      const response = await fetch(`${SPOTIFY_API_URL}/me/player`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (response.status === 204) {
        // No active device
        return { is_playing: false, device: null };
      }

      if (!response.ok) return null;

      const state = await response.json();
      this.playbackStates.set(roomCode, state);
      return state;
    } catch (err) {
      console.error(`[Spotify] Failed to fetch playback state:`, err);
      return null;
    }
  }

  /**
   * Get cached playback state
   * @param {string} roomCode - Room code
   * @returns {Object|null}
   */
  getPlaybackState(roomCode) {
    return this.playbackStates.get(roomCode) || null;
  }

  /**
   * Execute a playback command
   * @param {string} roomCode - Room code
   * @param {string} action - play, pause, next, previous, queue
   * @param {Object} options - Additional options (uri for queue, etc.)
   * @returns {Promise<boolean>}
   */
  async executeCommand(roomCode, action, options = {}) {
    const accessToken = await this.getAccessToken(roomCode);
    if (!accessToken) return false;

    try {
      let endpoint;
      let method = 'PUT';
      let body;

      switch (action) {
        case 'play':
          endpoint = '/me/player/play';
          if (options.uris || options.context_uri) {
            body = JSON.stringify({
              ...(options.context_uri && { context_uri: options.context_uri }),
              ...(options.uris && { uris: options.uris }),
              ...(options.position_ms && { position_ms: options.position_ms }),
            });
          }
          break;
        case 'pause':
          endpoint = '/me/player/pause';
          break;
        case 'next':
          endpoint = '/me/player/next';
          method = 'POST';
          break;
        case 'previous':
          endpoint = '/me/player/previous';
          method = 'POST';
          break;
        case 'queue':
          if (!options.uri) return false;
          endpoint = `/me/player/queue?uri=${encodeURIComponent(options.uri)}`;
          method = 'POST';
          break;
        default:
          return false;
      }

      const response = await fetch(`${SPOTIFY_API_URL}${endpoint}`, {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        ...(body && { body }),
      });

      return response.ok || response.status === 204;
    } catch (err) {
      console.error(`[Spotify] Command ${action} failed:`, err);
      return false;
    }
  }

  // ========== Sync Management ==========

  /**
   * Start periodic playback state sync for a room
   * @param {string} roomCode - Room code
   * @param {Function} callback - Called with playback state
   * @param {number} intervalMs - Sync interval (default 1000ms)
   */
  startSync(roomCode, callback, intervalMs = 1000) {
    this.stopSync(roomCode); // Clear existing interval

    const syncFn = async () => {
      const state = await this.fetchPlaybackState(roomCode);
      if (state) {
        callback(this.formatPlaybackState(state));
      }
    };

    // Initial sync
    syncFn();

    // Periodic sync
    const intervalId = setInterval(syncFn, intervalMs);
    this.syncIntervals.set(roomCode, intervalId);

    console.log(`[Spotify] Started sync for room ${roomCode}`);
  }

  /**
   * Stop playback state sync for a room
   * @param {string} roomCode - Room code
   */
  stopSync(roomCode) {
    const intervalId = this.syncIntervals.get(roomCode);
    if (intervalId) {
      clearInterval(intervalId);
      this.syncIntervals.delete(roomCode);
      console.log(`[Spotify] Stopped sync for room ${roomCode}`);
    }
  }

  /**
   * Format Spotify API response to a cleaner structure
   * @param {Object} state - Raw Spotify playback state
   * @returns {Object}
   */
  formatPlaybackState(state) {
    if (!state || !state.item) {
      return {
        isPlaying: false,
        track: null,
        device: state?.device?.name || null,
      };
    }

    return {
      isPlaying: state.is_playing,
      track: {
        id: state.item.id,
        name: state.item.name,
        artist: state.item.artists?.map((a) => a.name).join(', ') || 'Unknown',
        album: state.item.album?.name || 'Unknown',
        albumArt: state.item.album?.images?.[0]?.url || null,
        duration: state.item.duration_ms,
        progress: state.progress_ms,
      },
      device: state.device?.name || null,
      shuffleState: state.shuffle_state,
      repeatState: state.repeat_state,
    };
  }
}

const spotifyManager = new SpotifyManager();

module.exports = spotifyManager;
module.exports.GLOBAL_HOST = GLOBAL_HOST;
