/**
 * Spotify Web API Integration for plAIlist
 */

class SpotifyAPI {
  constructor() {
    this.clientId = null; // Will be set from environment
    this.clientSecret = null; // Will be set from environment
    this.redirectUri = "http://127.0.0.1:8080/callback";
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = null;
    this.isConnected = false;
    this.currentPlayback = null;
    this.pollingInterval = null;
    this.playbackCallback = null; // Callback for playback state updates
    this.connectionCallback = null; // Callback for connection state updates

    // Required scopes for the application
    this.scopes = [
      "user-read-playback-state",
      "user-modify-playback-state",
      "user-read-currently-playing",
      "playlist-read-private",
      "playlist-modify-private",
      "playlist-modify-public",
      "user-read-recently-played",
      "user-library-read",
      "user-top-read"
    ];
    this.init();
  }
  // Set callback for playback state updates
  setPlaybackCallback(callback) {
    this.playbackCallback = callback;
  }

  // Set callback for connection state updates
  setConnectionCallback(callback) {
    this.connectionCallback = callback;
  }
  async init() {
    try {
      // Load app configuration
      this.appConfig = await window.electronAPI.getAppConfig();

      // Load stored credentials (with graceful error handling)
      await this.loadStoredCredentials();

      // Set up event listeners
      this.setupEventListeners();
    } catch (error) {
      // Don't throw initialization errors, just log them
      // The app should still be usable for authentication
    }
  }

  setupEventListeners() {
    // Handle Spotify connect button
    const connectBtn = document.getElementById("spotifyConnectBtn");
    if (connectBtn) {
      connectBtn.addEventListener("click", () => {
        if (this.isConnected) {
          this.disconnect();
        } else {
          this.authenticate();
        }
      });
    }

    // Handle playback controls
    const playPauseBtn = document.getElementById("playPauseBtn");
    if (playPauseBtn) {
      playPauseBtn.addEventListener("click", () => this.togglePlayback());
    }

    const skipBtn = document.getElementById("skipBtn");
    if (skipBtn) {
      skipBtn.addEventListener("click", () => this.skipTrack());
    }
  }
  async loadStoredCredentials() {
    // Load from localStorage or secure storage
    const stored = localStorage.getItem("spotifyCredentials");
    if (stored) {
      try {
        const credentials = JSON.parse(stored);
        this.accessToken = credentials.accessToken;
        this.refreshToken = credentials.refreshToken;
        this.tokenExpiry = new Date(credentials.tokenExpiry); // Check if token is still valid
        if (this.tokenExpiry > new Date()) {
          this.isConnected = true;
          this.updateConnectionStatus();
          this.startPlaybackPolling();
        } else if (this.refreshToken) {
          try {
            await this.refreshAccessToken();
          } catch (refreshError) {
            // Refresh failed, clear stored credentials and allow re-authentication
            this.clearStoredCredentials();
            this.showNotification("Session expired. Please reconnect to Spotify.", "warning");
          }
        }
      } catch (error) {
        // Invalid stored credentials, clear them
        this.clearStoredCredentials();
      }
    }
  }

  saveCredentials() {
    const credentials = {
      accessToken: this.accessToken,
      refreshToken: this.refreshToken,
      tokenExpiry: this.tokenExpiry?.toISOString()
    };
    localStorage.setItem("spotifyCredentials", JSON.stringify(credentials));
  }

  clearStoredCredentials() {
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = null;
    this.isConnected = false;
    localStorage.removeItem("spotifyCredentials");
    this.updateConnectionStatus();
    this.stopPlaybackPolling();
  }

  async authenticate() {
    try {
      // Get client credentials from environment
      await this.loadClientCredentials();

      if (!this.clientId) {
        throw new Error("Spotify Client ID not configured");
      }

      // Build authorization URL
      const authUrl = this.buildAuthUrl();

      // Open authentication window
      const authCode = await window.electronAPI.spotifyAuth(authUrl);

      if (authCode) {
        await this.exchangeCodeForToken(authCode);
        this.isConnected = true;
        this.updateConnectionStatus();
        this.startPlaybackPolling();
        this.showNotification("Connected to Spotify successfully!", "success");
      }
    } catch (error) {
      console.error("Authentication failed:", error);
      this.showNotification("Failed to connect to Spotify: " + error.message, "error");
    }
  }
  async loadClientCredentials() {
    // Load from app configuration
    if (this.appConfig?.spotify) {
      this.clientId = this.appConfig.spotify.clientId;
      this.clientSecret = this.appConfig.spotify.clientSecret;
      this.redirectUri = this.appConfig.spotify.redirectUri;
    }

    if (!this.clientId) {
      throw new Error("Spotify Client ID not configured. Please check your .env file.");
    }

    if (!this.clientSecret) {
      throw new Error("Spotify Client Secret not configured. Please check your .env file.");
    }
  }

  buildAuthUrl() {
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: "code",
      redirect_uri: this.redirectUri,
      scope: this.scopes.join(" "),
      show_dialog: "true"
    });

    return `https://accounts.spotify.com/authorize?${params.toString()}`;
  }
  async exchangeCodeForToken(code) {
    // Note: In production, token exchange should be done in the main process for security
    // This is a simplified implementation for development
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(this.clientId + ":" + this.clientSecret)}`
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: this.redirectUri
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("Token exchange failed:", errorData);
      throw new Error(
        "Failed to exchange code for token. Please check your Spotify app configuration."
      );
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token;
    this.tokenExpiry = new Date(Date.now() + data.expires_in * 1000);

    this.saveCredentials();
  }
  async refreshAccessToken() {
    if (!this.refreshToken) {
      throw new Error("No refresh token available");
    }

    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(this.clientId + ":" + this.clientSecret)}`
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: this.refreshToken
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Failed to refresh token: ${response.status} ${errorData}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiry = new Date(Date.now() + data.expires_in * 1000);

    if (data.refresh_token) {
      this.refreshToken = data.refresh_token;
    }
    this.saveCredentials();
    this.isConnected = true;
    this.updateConnectionStatus();
  }

  disconnect() {
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = null;
    this.isConnected = false;
    this.currentPlayback = null;

    localStorage.removeItem("spotifyCredentials");
    this.stopPlaybackPolling();
    this.updateConnectionStatus();
    this.showNotification("Disconnected from Spotify", "info");
  }
  updateConnectionStatus() {
    // In Svelte version, connection status is managed by reactive state
    // This method is kept for compatibility but doesn't manipulate DOM directly
    console.log(`Spotify connection status: ${this.isConnected ? "Connected" : "Disconnected"}`);

    // Notify connection state change if callback is set
    if (this.connectionCallback) {
      this.connectionCallback(this.isConnected);
    }
  }

  async makeApiRequest(endpoint, options = {}) {
    if (!this.accessToken) {
      throw new Error("Not authenticated with Spotify");
    }

    // Check if token needs refresh
    if (this.tokenExpiry && this.tokenExpiry <= new Date()) {
      await this.refreshAccessToken();
    }

    const response = await fetch(`https://api.spotify.com/v1${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...options.headers
      }
    });
    if (!response.ok) {
      if (response.status === 401) {
        // Token expired or invalid
        this.disconnect();
        throw new Error("Authentication expired. Please reconnect.");
      }
      if (response.status === 429) {
        // Rate limited - include retry-after information if available
        const retryAfter = response.headers.get("retry-after");
        throw new Error(
          `Spotify API rate limit: 429 (retry after ${retryAfter || "unknown"} seconds)`
        );
      }
      if (response.status === 204) {
        // No content - valid response for some endpoints
        return {};
      }
      throw new Error(`Spotify API error: ${response.status} ${response.statusText}`);
    }

    // Some Spotify endpoints return empty responses (like PUT requests)
    const contentLength = response.headers.get("content-length");
    if (contentLength === "0" || response.status === 204) {
      return {}; // Return empty object for empty responses
    }

    try {
      return await response.json();
    } catch (error) {
      // If JSON parsing fails, return empty object
      console.warn("Failed to parse JSON response, returning empty object");
      return {};
    }
  }
  // Playback monitoring
  startPlaybackPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }

    // Reduce polling frequency to avoid rate limits
    this.pollingInterval = setInterval(async () => {
      try {
        await this.updatePlaybackState();
      } catch (error) {
        console.error("Failed to update playback state:", error);

        // If we hit rate limits, increase polling interval temporarily
        if (error.message.includes("429")) {
          console.log("Rate limited, increasing polling interval for 30 seconds");
          clearInterval(this.pollingInterval);
          setTimeout(() => {
            this.startPlaybackPolling();
          }, 30000); // Wait 30 seconds before resuming normal polling
        }
      }
    }, 3000); // Poll every 3 seconds instead of 1 to reduce API calls
  }

  stopPlaybackPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }
  async updatePlaybackState() {
    try {
      const playback = await this.makeApiRequest("/me/player");

      if (playback && playback.item) {
        this.currentPlayback = playback;

        // Use callback to update component state
        if (this.playbackCallback) {
          this.playbackCallback(playback);
        }
      } else {
        this.currentPlayback = null;

        // Notify component that playback stopped
        if (this.playbackCallback) {
          this.playbackCallback(null);
        }
      }
    } catch (error) {
      // Handle case where no active device (204 response)
      if (error.message.includes("204") || error.message.includes("No Content")) {
        this.currentPlayback = null;

        if (this.playbackCallback) {
          this.playbackCallback(null);
        }
      } else if (error.message.includes("429")) {
        // Rate limited - don't update state, just throw to trigger backoff
        throw error;
      } else {
        console.warn("Playback state update failed:", error.message);
        // For other errors, we might still want to clear the current playback
        this.currentPlayback = null;
        if (this.playbackCallback) {
          this.playbackCallback(null);
        }
      }
    }
  }
  formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  }

  // Playback controls
  async togglePlayback() {
    try {
      await this.ensureActiveDevice();

      if (this.currentPlayback?.is_playing) {
        await this.makeApiRequest("/me/player/pause", { method: "PUT" });
      } else {
        await this.makeApiRequest("/me/player/play", { method: "PUT" });
      }
    } catch (error) {
      console.error("Failed to toggle playback:", error);

      if (error.message.includes("No active Spotify device")) {
        this.showNotification(
          "No active Spotify device found. Please open Spotify on your phone or computer first.",
          "error"
        );
      } else if (error.message.includes("403") || error.message.includes("Premium required")) {
        this.showNotification("Spotify Premium is required for playback control.", "error");
      } else {
        this.showNotification("Failed to control playback: " + error.message, "error");
      }
    }
  }

  async skipTrack() {
    try {
      await this.ensureActiveDevice();
      await this.makeApiRequest("/me/player/next", { method: "POST" });
    } catch (error) {
      console.error("Failed to skip track:", error);

      if (error.message.includes("No active Spotify device")) {
        this.showNotification(
          "No active Spotify device found. Please open Spotify on your phone or computer first.",
          "error"
        );
      } else if (error.message.includes("403") || error.message.includes("Premium required")) {
        this.showNotification("Spotify Premium is required for playback control.", "error");
      } else {
        this.showNotification("Failed to skip track: " + error.message, "error");
      }
    }
  }

  async setShuffle(state = true) {
    try {
      await this.ensureActiveDevice();
      await this.makeApiRequest(`/me/player/shuffle?state=${state}`, { method: "PUT" });
      return state; // Return the new state
    } catch (error) {
      console.error("Failed to set shuffle:", error);

      if (error.message.includes("No active Spotify device")) {
        this.showNotification(
          "No active Spotify device found. Please open Spotify on your phone or computer first.",
          "error"
        );
      } else if (error.message.includes("403") || error.message.includes("Premium required")) {
        this.showNotification("Spotify Premium is required for playback control.", "error");
      } else {
        this.showNotification("Failed to set shuffle: " + error.message, "error");
      }
      throw error;
    }
  }

  async toggleShuffle() {
    try {
      // Get current playback state to determine current shuffle status
      const playback = await this.makeApiRequest("/me/player");
      const currentShuffleState = playback?.shuffle_state || false;
      const newState = !currentShuffleState;

      await this.setShuffle(newState);
      return newState;
    } catch (error) {
      console.error("Failed to toggle shuffle:", error);
      throw error;
    }
  }

  getCurrentShuffleState() {
    return this.currentPlayback?.shuffle_state || false;
  }

  async setRepeat(state = "context") {
    try {
      await this.ensureActiveDevice();
      // state can be "track", "context", or "off"
      await this.makeApiRequest(`/me/player/repeat?state=${state}`, { method: "PUT" });
    } catch (error) {
      console.error("Failed to set repeat:", error);

      if (error.message.includes("No active Spotify device")) {
        this.showNotification(
          "No active Spotify device found. Please open Spotify on your phone or computer first.",
          "error"
        );
      } else if (error.message.includes("403") || error.message.includes("Premium required")) {
        this.showNotification("Spotify Premium is required for playback control.", "error");
      } else {
        this.showNotification("Failed to set repeat: " + error.message, "error");
      }
      throw error;
    }
  }
  // Device management
  async getAvailableDevices() {
    try {
      const response = await this.makeApiRequest("/me/player/devices");
      return response.devices || [];
    } catch (error) {
      console.error("Failed to get devices:", error);
      return [];
    }
  }

  async getActiveDevice() {
    const devices = await this.getAvailableDevices();
    return devices.find((device) => device.is_active) || devices[0] || null;
  }

  async ensureActiveDevice() {
    const device = await this.getActiveDevice();
    if (!device) {
      throw new Error(
        "No active Spotify device found. Please open Spotify on your phone, computer, or another device and start playing something first."
      );
    }
    return device;
  }

  // Playlist management
  async getPlaylist(playlistId) {
    try {
      const playlist = await this.makeApiRequest(`/playlists/${playlistId}`);
      const tracksResponse = await this.makeApiRequest(`/playlists/${playlistId}/tracks`);

      return {
        playlist: playlist,
        tracks: tracksResponse.items.map((item) => item.track)
      };
    } catch (error) {
      console.error("Failed to get playlist:", error);
      throw error;
    }
  }

  async createPlaylist(name, description, tracks = []) {
    try {
      // Get current user
      const user = await this.makeApiRequest("/me");

      // Create playlist
      const playlist = await this.makeApiRequest(`/users/${user.id}/playlists`, {
        method: "POST",
        body: JSON.stringify({
          name: name,
          description: description,
          public: false
        })
      });

      // Add tracks if provided
      if (tracks.length > 0) {
        await this.addTracksToPlaylist(playlist.id, tracks);
      }

      return playlist;
    } catch (error) {
      console.error("Failed to create playlist:", error);
      throw error;
    }
  }

  async unfollowPlaylist(playlistId) {
    try {
      await this.makeApiRequest(`/playlists/${playlistId}/followers`, {
        method: "DELETE"
      });
    } catch (error) {
      console.error("Failed to unfollow playlist:", error);
      throw error;
    }
  }

  async addTracksToPlaylist(playlistId, trackUris) {
    try {
      // Spotify API limits to 100 tracks per request
      const chunks = this.chunkArray(trackUris, 100);

      for (const chunk of chunks) {
        await this.makeApiRequest(`/playlists/${playlistId}/tracks`, {
          method: "POST",
          body: JSON.stringify({
            uris: chunk
          })
        });
      }
    } catch (error) {
      throw error;
    }
  }

  async removeTracksFromPlaylist(playlistId, trackUris) {
    try {
      // Spotify API limits to 100 tracks per request
      const chunks = this.chunkArray(trackUris, 100);

      for (const chunk of chunks) {
        await this.makeApiRequest(`/playlists/${playlistId}/tracks`, {
          method: "DELETE",
          body: JSON.stringify({
            tracks: chunk.map((uri) => ({ uri }))
          })
        });
      }
    } catch (error) {
      throw error;
    }
  }
  async searchTracks(query, limit = 20) {
    try {
      const params = new URLSearchParams({
        q: query,
        type: "track",
        limit: limit
      });

      const results = await this.makeApiRequest(`/search?${params.toString()}`);
      return results.tracks.items;
    } catch (error) {
      throw error;
    }
  }

  // Playback methods
  async playTrack(trackUri) {
    try {
      await this.ensureActiveDevice();

      await this.makeApiRequest("/me/player/play", {
        method: "PUT",
        body: JSON.stringify({
          uris: [trackUri]
        })
      });
    } catch (error) {
      console.error("Failed to play track:", error);
      throw error;
    }
  }

  async playPlaylist(playlistUri) {
    try {
      await this.ensureActiveDevice();

      await this.makeApiRequest("/me/player/play", {
        method: "PUT",
        body: JSON.stringify({
          context_uri: playlistUri
        })
      });
    } catch (error) {
      console.error("Failed to play playlist:", error);
      throw error;
    }
  }

  async playTrackInContext(trackUris, startIndex = 0) {
    try {
      await this.ensureActiveDevice();

      // Create a playlist starting from the specified index
      const tracksToPlay = trackUris.slice(startIndex);

      await this.makeApiRequest("/me/player/play", {
        method: "PUT",
        body: JSON.stringify({
          uris: tracksToPlay
        })
      });
    } catch (error) {
      console.error("Failed to play track in context:", error);
      throw error;
    }
  }

  // Utility methods
  chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  showNotification(message, type = "info") {
    // Create a simple notification
    const alertClass =
      type === "error"
        ? "alert-danger"
        : type === "success"
        ? "alert-success"
        : type === "warning"
        ? "alert-warning"
        : "alert-info";

    const notification = document.createElement("div");
    notification.className = `alert ${alertClass} alert-dismissible fade show position-fixed`;
    notification.style.cssText = "top: 20px; right: 20px; z-index: 1050; max-width: 400px;";
    notification.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;

    document.body.appendChild(notification);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 5000);
  }
}

// Export for use in other modules
export { SpotifyAPI };
