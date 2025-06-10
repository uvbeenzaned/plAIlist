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

      // Load client credentials first (required for token refresh)
      await this.loadClientCredentials();

      // Load stored credentials (with graceful error handling)
      await this.loadStoredCredentials();

      // Set up event listeners
      this.setupEventListeners();
    } catch (error) {
      // Don't throw initialization errors, just log them
      // The app should still be usable for authentication
      console.warn("Spotify initialization warning:", error.message);
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

        // Validate required fields
        if (!credentials.accessToken || !credentials.refreshToken || !credentials.tokenExpiry) {
          console.warn("Incomplete stored credentials, clearing...");
          this.clearStoredCredentials();
          return;
        }

        this.accessToken = credentials.accessToken;
        this.refreshToken = credentials.refreshToken;
        this.tokenExpiry = new Date(credentials.tokenExpiry);

        // Check if stored credentials are too old (more than 30 days)
        const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
        const savedAt = credentials.savedAt ? new Date(credentials.savedAt) : new Date(0);
        if (Date.now() - savedAt.getTime() > maxAge) {
          console.warn("Stored credentials are too old, clearing...");
          this.clearStoredCredentials();
          return;
        }

        // Check if token is still valid
        if (this.tokenExpiry > new Date()) {
          this.isConnected = true;
          this.updateConnectionStatus();
          this.startPlaybackPolling();
          console.log("Using valid stored credentials");
        } else if (this.refreshToken) {
          console.log("Token expired, attempting refresh...");
          try {
            await this.refreshAccessToken();
            this.startPlaybackPolling();
          } catch (refreshError) {
            console.error("Failed to refresh token:", refreshError);
            // Refresh failed, clear stored credentials and allow re-authentication
            this.clearStoredCredentials();
            this.showNotification("Session expired. Please reconnect to Spotify.", "warning");
          }
        }
      } catch (error) {
        console.error("Error loading stored credentials:", error);
        // Invalid stored credentials, clear them
        this.clearStoredCredentials();
      }
    }
  }
  saveCredentials() {
    try {
      const credentials = {
        accessToken: this.accessToken,
        refreshToken: this.refreshToken,
        tokenExpiry: this.tokenExpiry?.toISOString(),
        savedAt: new Date().toISOString()
      };
      localStorage.setItem("spotifyCredentials", JSON.stringify(credentials));
      console.log("Credentials saved successfully");
    } catch (error) {
      console.error("Failed to save credentials:", error);
    }
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

    if (!this.clientId || !this.clientSecret) {
      throw new Error("Client credentials not loaded");
    }

    try {
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
        console.error("Token refresh failed:", response.status, errorData);

        // Clear invalid credentials
        this.clearStoredCredentials();
        this.disconnect();
        this.showNotification("Session expired. Please reconnect to Spotify.", "warning");

        throw new Error(`Failed to refresh token: ${response.status} ${errorData}`);
      }

      const data = await response.json();
      this.accessToken = data.access_token;
      this.tokenExpiry = new Date(Date.now() + data.expires_in * 1000);

      // Some refresh responses don't include a new refresh token
      if (data.refresh_token) {
        this.refreshToken = data.refresh_token;
      }

      this.saveCredentials();
      this.isConnected = true;
      this.updateConnectionStatus();

      console.log("Token refreshed successfully, expires at:", this.tokenExpiry);
    } catch (error) {
      console.error("Error refreshing token:", error);
      this.clearStoredCredentials();
      this.disconnect();
      throw error;
    }
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
  async makeApiRequest(endpoint, options = {}, retryCount = 0) {
    if (!this.accessToken) {
      throw new Error("Not authenticated with Spotify");
    }

    // Check if token needs refresh (refresh 5 minutes before expiry)
    const refreshBuffer = 5 * 60 * 1000; // 5 minutes
    if (this.tokenExpiry && this.tokenExpiry <= new Date(Date.now() + refreshBuffer)) {
      try {
        await this.refreshAccessToken();
      } catch (refreshError) {
        // If refresh fails, let the 401 handler below deal with it
        console.warn("Proactive token refresh failed:", refreshError.message);
      }
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
      if (response.status === 401 && retryCount === 0) {
        // Token expired or invalid - try to refresh once
        try {
          await this.refreshAccessToken();
          // Retry the request with the new token
          return this.makeApiRequest(endpoint, options, 1);
        } catch (refreshError) {
          this.disconnect();
          throw new Error("Authentication expired. Please reconnect.");
        }
      } else if (response.status === 401) {
        // Already retried, authentication is truly invalid
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

      // Try to extract detailed error message from response body
      let errorMessage = `Spotify API error: ${response.status} ${response.statusText}`;
      try {
        const errorBody = await response.text();
        if (errorBody) {
          const errorData = JSON.parse(errorBody);
          if (errorData.error && errorData.error.message) {
            errorMessage = `${response.status} ${response.statusText}: ${errorData.error.message}`;
          }
        }
      } catch (parseError) {
        // If we can't parse the error body, use the generic message
      }

      throw new Error(errorMessage);
    }

    // Handle specific case for /me/player/next if it returns 200 OK instead of 204
    if (endpoint === "/me/player/next" && response.status === 200) {
      console.log(
        `SpotifyAPI: Endpoint ${endpoint} returned 200 OK (expected 204). Treating as success without content.`
      );
      // Attempt to consume the body to prevent issues, but don't parse if not expected.
      try {
        await response.text(); // Consume the body
      } catch (e) {
        // Ignore errors consuming an unexpected body
      }
      return {}; // Return empty object as if it were a 204
    }

    // Some Spotify endpoints return empty responses (like PUT requests)
    const contentLength = response.headers.get("content-length");
    console.log(
      `SpotifyAPI: makeApiRequest for ${endpoint} - Status: ${response.status}, Content-Length: ${contentLength}`
    ); // ADD THIS LOG

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
      // Don't try to update if not connected
      if (!this.isConnected || !this.accessToken) {
        this.currentPlayback = null;
        if (this.playbackCallback) {
          this.playbackCallback(null);
        }
        return;
      }

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
      } else if (error.message.includes("Authentication expired")) {
        // Authentication failed - stop polling
        console.warn("Authentication expired, stopping playback polling");
        this.stopPlaybackPolling();
        this.currentPlayback = null;
        if (this.playbackCallback) {
          this.playbackCallback(null);
        }
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

      // Play the full list of URIs, starting at the specified startIndex
      await this.makeApiRequest("/me/player/play", {
        method: "PUT",
        body: JSON.stringify({
          uris: trackUris, // Send the full list of URIs
          offset: { position: startIndex } // Specify the starting position
        })
      });
    } catch (error) {
      console.error("Failed to play track in context:", error);
      throw error;
    }
  }

  async queueTrack(trackUri) {
    try {
      await this.ensureActiveDevice();
      // The endpoint is /me/player/queue and requires the track URI as a query parameter
      await this.makeApiRequest(`/me/player/queue?uri=${encodeURIComponent(trackUri)}`, {
        method: "POST"
        // No body is needed for this request
      });
      console.log(`SpotifyAPI: Successfully queued track ${trackUri}`);
    } catch (error) {
      console.error("Failed to queue track:", error);
      if (error.message.includes("No active Spotify device")) {
        this.showNotification(
          "No active Spotify device found. Please open Spotify on your phone or computer first.",
          "error"
        );
      } else if (error.message.includes("403") || error.message.includes("Premium required")) {
        this.showNotification("Spotify Premium is required to queue tracks.", "error");
      } else if (error.message.includes("404") && error.message.includes("Device not found")) {
        this.showNotification(
          "No active Spotify device found. Please open Spotify on your phone or computer first.",
          "error"
        );
      }
      // Do not re-throw for queueing, as it's a non-critical enhancement.
      // The main playlist modification will still proceed.
      // throw error; // Optional: re-throw if queueing failure should halt other processes
    }
  }

  // Audio Features Analysis
  async getAudioFeatures(trackId) {
    try {
      const features = await this.makeApiRequest(`/audio-features/${trackId}`);
      return features;
    } catch (error) {
      // Handle specific cases where audio features are not available
      if (error.message.includes("403") || error.message.includes("Forbidden")) {
        console.warn(`Audio features not available for track ${trackId} (restricted content)`);
        return null; // Return null instead of throwing
      } else if (error.message.includes("404") || error.message.includes("Not Found")) {
        console.warn(`Audio features not found for track ${trackId}`);
        return null;
      }
      console.error("Failed to get audio features:", error);
      throw error;
    }
  }
  async getTrackDetails(trackId) {
    try {
      const track = await this.makeApiRequest(`/tracks/${trackId}`);
      return track;
    } catch (error) {
      console.error("Failed to get track details:", error);
      if (
        error.message.includes("403") ||
        error.message.includes("Forbidden") ||
        error.message.includes("404") ||
        error.message.includes("Not Found")
      ) {
        console.warn(`Track details not available for track ${trackId}`);
        return null;
      }
      throw error;
    }
  }

  async getArtistDetails(artistId) {
    try {
      const artist = await this.makeApiRequest(`/artists/${artistId}`);
      return artist;
    } catch (error) {
      console.error("Failed to get artist details:", error);
      if (
        error.message.includes("403") ||
        error.message.includes("Forbidden") ||
        error.message.includes("404") ||
        error.message.includes("Not Found")
      ) {
        console.warn(`Artist details not available for artist ${artistId}`);
        return null;
      }
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
