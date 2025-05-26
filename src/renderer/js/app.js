/**
 * Main Application Logic for plAIlist
 */

class PlAIlistApp {
  constructor() {
    this.spotifyAPI = null;
    this.aiGenerator = null;
    this.currentPlaylist = null;
    this.userBehavior = {
      skippedTracks: [],
      likedTracks: [],
      partiallyListened: [],
      sessionStartTime: Date.now()
    };
    this.isGenerating = false;

    this.init();
  }
  async init() {
    try {
      // Check configuration first
      const configValidation = await window.electronAPI.validateConfig();
      if (!configValidation.isValid) {
        this.showConfigurationWarning(configValidation.errors);
      }

      // Initialize Spotify API
      this.spotifyAPI = new SpotifyAPI(); // Initialize AI Generator
      this.aiGenerator = new AIPlaylistGenerator(this.spotifyAPI);

      // Wait for AI generator to fully initialize before checking quota
      setTimeout(async () => {
        await this.checkAIQuotaStatus();
      }, 1000);

      // Set up event listeners
      this.setupEventListeners();

      // Load any saved state
      await this.loadAppState();

      console.log("plAIlist app initialized");
      this.showWelcomeMessage();
    } catch (error) {
      console.error("Failed to initialize app:", error);
      this.showError("Failed to initialize application: " + error.message);
    }
  }

  setupEventListeners() {
    // Playlist generation form
    const form = document.getElementById("playlistGeneratorForm");
    if (form) {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        this.handlePlaylistGeneration();
      });
    }

    // Template buttons
    const templateButtons = document.querySelectorAll(".template-btn");
    templateButtons.forEach((button) => {
      button.addEventListener("click", (e) => {
        const template = e.currentTarget.dataset.template;
        this.selectPlaylistTemplate(template);
      });
    });

    // Shuffle button
    const shuffleBtn = document.getElementById("shuffleBtn");
    if (shuffleBtn) {
      shuffleBtn.addEventListener("click", () => this.shuffleCurrentPlaylist());
    }

    // Refresh button
    const refreshBtn = document.getElementById("refreshBtn");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", () => this.refreshPlaylistView());
    }

    // Auto-adapt toggle
    const autoAdaptSwitch = document.getElementById("autoAdaptSwitch");
    if (autoAdaptSwitch) {
      autoAdaptSwitch.addEventListener("change", (e) => {
        this.toggleAutoAdapt(e.target.checked);
      });
    }

    // Discovery slider
    const discoverySlider = document.getElementById("discoverySlider");
    if (discoverySlider) {
      discoverySlider.addEventListener("input", (e) => {
        this.updateDiscoveryLevel(e.target.value);
      });
    }

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => {
      this.handleKeyboardShortcuts(e);
    });

    // Window resize
    window.addEventListener("resize", () => {
      this.handleWindowResize();
    }); // Device info button
    const deviceInfoBtn = document.getElementById("deviceInfoBtn");
    if (deviceInfoBtn) {
      deviceInfoBtn.addEventListener("click", () => this.showDeviceInfo());
    }

    // Clear history button
    const clearHistoryBtn = document.getElementById("clearHistoryBtn");
    if (clearHistoryBtn) {
      clearHistoryBtn.addEventListener("click", () => this.clearPlaylistHistory());
    }
  }

  async handlePlaylistGeneration() {
    if (this.isGenerating) return;

    if (!this.spotifyAPI.isConnected) {
      this.showError("Please connect to Spotify first");
      return;
    }

    const description = document.getElementById("playlistDescription").value.trim();
    const length = parseInt(document.getElementById("playlistLength").value);
    const name = document.getElementById("playlistName").value.trim();

    if (!description) {
      this.showError("Please describe the type of playlist you want");
      return;
    }

    this.isGenerating = true;
    this.showGenerationProgress("Generating your playlist...");

    try {
      // Generate the playlist
      const result = await this.aiGenerator.generatePlaylist(description, length, name);

      this.currentPlaylist = result;
      this.displayPlaylist(result);
      this.saveRecentPlaylist(result);
      this.showSuccess(
        `Created playlist "${result.playlist.name}" with ${result.tracks.length} tracks`
      );

      // Clear the form
      document.getElementById("playlistGeneratorForm").reset();
    } catch (error) {
      console.error("Playlist generation failed:", error);
      this.showError("Failed to generate playlist: " + error.message);
    } finally {
      this.isGenerating = false;
      this.hideGenerationProgress();
    }
  }

  displayPlaylist(result) {
    const container = document.getElementById("playlistContainer");
    if (!container) return;

    // Clear existing content
    container.innerHTML = "";

    // Add playlist header info
    const headerItem = document.createElement("div");
    headerItem.className = "list-group-item bg-secondary border-bottom";
    headerItem.innerHTML = `
            <div class="d-flex justify-content-between align-items-center">
                <div>
                    <h6 class="mb-1">${result.playlist.name}</h6>
                    <small class="text-muted">${
                      result.tracks.length
                    } tracks • ${this.calculateTotalDuration(result.tracks)}</small>
                </div>
                <div class="btn-group btn-group-sm">
                    <button class="btn btn-outline-success" onclick="app.playPlaylist()" title="Play Playlist">
                        <i class="bi bi-play-fill"></i>
                    </button>
                    <button class="btn btn-outline-primary" onclick="app.openInSpotify('${
                      result.playlist.external_urls.spotify
                    }')" title="Open in Spotify">
                        <i class="bi bi-spotify"></i>
                    </button>
                </div>
            </div>
        `;
    container.appendChild(headerItem);

    // Add tracks
    result.tracks.forEach((track, index) => {
      const trackItem = this.createTrackItem(track, index);
      container.appendChild(trackItem);
    });

    // Update playlist stats
    this.updatePlaylistStats(result);
  }

  createTrackItem(track, index) {
    const item = document.createElement("div");
    item.className = "list-group-item playlist-item bg-secondary";
    item.dataset.trackId = track.id;
    item.dataset.trackUri = track.uri;

    const artists = track.artists.map((a) => a.name).join(", ");
    const duration = this.formatDuration(track.duration_ms);
    const albumImage = track.album.images[2]?.url || track.album.images[0]?.url || "";

    item.innerHTML = `
            <div class="d-flex align-items-center">
                <div class="track-number me-3">
                    <small class="text-muted">${(index + 1).toString().padStart(2, "0")}</small>
                </div>
                <div class="track-artwork me-3">
                    <img src="${albumImage}" alt="Album artwork" class="rounded" width="40" height="40" 
                         onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIGZpbGw9IiM2NjYiIHZpZXdCb3g9IjAgMCAxNiAxNiI+PHBhdGggZD0iTTggMTVBNyA3IDAgMSAxIDggMWE3IDcgMCAwIDEgMCAxNHptMC0xQTYgNiAwIDEgMCA4IDJhNiA2IDAgMCAwIDAgMTJ6Ii8+PC9zdmc+'">
                </div>
                <div class="track-info flex-grow-1">
                    <div class="track-title">${this.escapeHtml(track.name)}</div>
                    <div class="track-artist text-muted">${this.escapeHtml(artists)}</div>
                </div>
                <div class="track-album me-3">
                    <small class="text-muted">${this.escapeHtml(track.album.name)}</small>
                </div>
                <div class="track-duration me-3">
                    <small class="text-muted">${duration}</small>
                </div>
                <div class="track-actions">
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-light" onclick="app.playTrack('${
                          track.uri
                        }')" title="Play Track">
                            <i class="bi bi-play-fill"></i>
                        </button>
                        <button class="btn btn-outline-light" onclick="app.removeTrack(${index})" title="Remove Track">
                            <i class="bi bi-x"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;

    // Add click handler for track selection
    item.addEventListener("click", (e) => {
      if (!e.target.closest(".track-actions")) {
        this.selectTrack(track, index);
      }
    });

    return item;
  }

  calculateTotalDuration(tracks) {
    const totalMs = tracks.reduce((sum, track) => sum + track.duration_ms, 0);
    const totalMinutes = Math.floor(totalMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }

  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  }

  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
  async playPlaylist() {
    if (!this.currentPlaylist || !this.spotifyAPI.isConnected) {
      this.showError("No playlist to play or Spotify not connected");
      return;
    }

    try {
      // Check for active device first
      await this.spotifyAPI.ensureActiveDevice();

      const trackUris = this.currentPlaylist.tracks.map((track) => track.uri);
      await this.spotifyAPI.makeApiRequest("/me/player/play", {
        method: "PUT",
        body: JSON.stringify({
          uris: trackUris
        })
      });
      this.showSuccess("Playlist started playing");
    } catch (error) {
      console.error("Failed to play playlist:", error);

      if (error.message.includes("No active Spotify device")) {
        this.showError(
          "No active Spotify device found. Please open Spotify on your phone or computer and start playing something first."
        );
      } else if (error.message.includes("403") || error.message.includes("Premium required")) {
        this.showError("Spotify Premium is required for playback control.");
      } else if (error.message.includes("404")) {
        this.showError(
          "Device not found. Please make sure Spotify is open and playing on one of your devices."
        );
      } else {
        this.showError("Failed to play playlist: " + error.message);
      }
    }
  }
  async playTrack(trackUri) {
    if (!this.spotifyAPI.isConnected) {
      this.showError("Spotify not connected");
      return;
    }

    try {
      // Check for active device first
      await this.spotifyAPI.ensureActiveDevice();

      // If we have a current playlist, play the track in context of the playlist
      if (this.currentPlaylist && this.currentPlaylist.tracks) {
        const trackIndex = this.currentPlaylist.tracks.findIndex((track) => track.uri === trackUri);

        if (trackIndex !== -1) {
          // Create playlist starting from the selected track
          const playlistFromTrack = this.currentPlaylist.tracks.slice(trackIndex);
          const trackUris = playlistFromTrack.map((track) => track.uri);

          await this.spotifyAPI.makeApiRequest("/me/player/play", {
            method: "PUT",
            body: JSON.stringify({
              uris: trackUris
            })
          });

          this.showSuccess(
            `Playing "${this.currentPlaylist.tracks[trackIndex].name}" and continuing with playlist`
          );
        } else {
          // Fallback to single track if not found in current playlist
          await this.spotifyAPI.makeApiRequest("/me/player/play", {
            method: "PUT",
            body: JSON.stringify({
              uris: [trackUri]
            })
          });
        }
      } else {
        // No current playlist, play single track
        await this.spotifyAPI.makeApiRequest("/me/player/play", {
          method: "PUT",
          body: JSON.stringify({
            uris: [trackUri]
          })
        });
      }

      this.markTrackAsPlaying(trackUri);
    } catch (error) {
      console.error("Failed to play track:", error);

      if (error.message.includes("No active Spotify device")) {
        this.showError(
          "No active Spotify device found. Please open Spotify on your phone or computer and start playing something first."
        );
      } else if (error.message.includes("403") || error.message.includes("Premium required")) {
        this.showError("Spotify Premium is required for playback control.");
      } else if (error.message.includes("404")) {
        this.showError(
          "Device not found. Please make sure Spotify is open and playing on one of your devices."
        );
      } else {
        this.showError("Failed to play track: " + error.message);
      }
    }
  }

  markTrackAsPlaying(trackUri) {
    // Remove previous playing indicators
    document.querySelectorAll(".playlist-item.playing").forEach((item) => {
      item.classList.remove("playing");
    });

    // Add playing indicator to current track
    const trackItem = document.querySelector(`[data-track-uri="${trackUri}"]`);
    if (trackItem) {
      trackItem.classList.add("playing");
    }
  }

  selectTrack(track, index) {
    // Handle track selection for additional actions
    console.log("Selected track:", track.name, "at index:", index);
  }

  removeTrack(index) {
    if (!this.currentPlaylist) return;

    const track = this.currentPlaylist.tracks[index];
    this.currentPlaylist.tracks.splice(index, 1);

    // Update the display
    this.displayPlaylist(this.currentPlaylist);

    this.showSuccess(`Removed "${track.name}" from playlist`);
  }

  async shuffleCurrentPlaylist() {
    if (!this.currentPlaylist) {
      this.showError("No playlist to shuffle");
      return;
    }

    // Shuffle the tracks array
    for (let i = this.currentPlaylist.tracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.currentPlaylist.tracks[i], this.currentPlaylist.tracks[j]] = [
        this.currentPlaylist.tracks[j],
        this.currentPlaylist.tracks[i]
      ];
    }

    this.displayPlaylist(this.currentPlaylist);
    this.showSuccess("Playlist shuffled");
  }

  refreshPlaylistView() {
    if (this.currentPlaylist) {
      this.displayPlaylist(this.currentPlaylist);
      this.showSuccess("Playlist view refreshed");
    }
  }

  openInSpotify(url) {
    window.electronAPI.shell?.openExternal(url) || window.open(url, "_blank");
  }

  // Progress and status methods
  showGenerationProgress(message) {
    const statusDiv = document.getElementById("generationStatus");
    const statusText = document.getElementById("statusText");
    const generateBtn = document.getElementById("generateBtn");

    if (statusDiv && statusText && generateBtn) {
      statusText.textContent = message;
      statusDiv.style.display = "block";
      generateBtn.disabled = true;
      generateBtn.innerHTML = '<i class="bi bi-hourglass-split me-2"></i>Generating...';
    }
  }

  hideGenerationProgress() {
    const statusDiv = document.getElementById("generationStatus");
    const generateBtn = document.getElementById("generateBtn");

    if (statusDiv && generateBtn) {
      statusDiv.style.display = "none";
      generateBtn.disabled = false;
      generateBtn.innerHTML = '<i class="bi bi-stars me-2"></i>Generate Playlist';
    }
  }

  // Notification methods
  showSuccess(message) {
    this.showNotification(message, "success");
  }

  showError(message) {
    this.showNotification(message, "error");
  }

  showInfo(message) {
    this.showNotification(message, "info");
  }

  showNotification(message, type = "info") {
    // Use the Spotify API's notification method
    if (this.spotifyAPI) {
      this.spotifyAPI.showNotification(message, type);
    } else {
      console.log(`${type.toUpperCase()}: ${message}`);
    }
  }
  showWelcomeMessage() {
    if (!localStorage.getItem("hasSeenWelcome")) {
      const message =
        "Welcome to plAIlist! Connect your Spotify account to start generating AI-powered playlists.";
      this.showInfo(message);
      localStorage.setItem("hasSeenWelcome", "true");
    }
  }
  showConfigurationWarning(errors) {
    const errorList = errors.join("<br>• ");
    const message = `
            <strong>Configuration Required</strong><br>
            Please configure the following in your .env file:<br>
            • ${errorList}<br><br>
            Copy .env.example to .env and add your API keys to enable all features.
        `;

    // Create a persistent warning
    const warningDiv = document.createElement("div");
    warningDiv.className = "alert alert-warning alert-dismissible fade show m-3";
    warningDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;

    // Insert at the top of the page
    document.body.insertBefore(warningDiv, document.body.firstChild);
  }

  async checkAIQuotaStatus() {
    if (!this.aiGenerator || !this.aiGenerator.hasApiKey) return;

    try {
      // Test the AI API with a minimal request
      await this.aiGenerator.makeAIRequest("Test");
    } catch (error) {
      if (error.code === "QUOTA_EXCEEDED") {
        this.showAIQuotaWarning();
      } else if (error.message.includes("insufficient_quota")) {
        this.showAIQuotaWarning();
      }
      // Ignore other errors - they'll be handled during actual usage
    }
  }

  showAIQuotaWarning() {
    const message = `
            <strong>OpenAI Quota Exceeded</strong><br>
            Your OpenAI API quota has been exceeded. Playlist generation will use fallback algorithms instead of AI.<br><br>
            To restore AI features:<br>
            • Visit <a href="https://platform.openai.com/account/billing" target="_blank">OpenAI Billing</a><br>
            • Add credits to your account<br>
            • Restart the app
        `;

    // Create a persistent warning that can be dismissed
    const warningDiv = document.createElement("div");
    warningDiv.className = "alert alert-warning alert-dismissible fade show m-3";
    warningDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;

    // Insert at the top of the page
    document.body.insertBefore(warningDiv, document.body.firstChild);

    // Also show a dismissible notification
    setTimeout(() => {
      this.showNotification(
        "AI quota exceeded. Using algorithmic playlist generation. Add OpenAI credits to restore AI features.",
        "warning"
      );
    }, 1000);
  }

  // User behavior tracking
  toggleAutoAdapt(enabled) {
    localStorage.setItem("autoAdaptEnabled", enabled.toString());
    if (enabled) {
      this.showInfo("Auto-adapt mode enabled");
    } else {
      this.showInfo("Auto-adapt mode disabled");
    }
  }

  updateDiscoveryLevel(level) {
    localStorage.setItem("discoveryLevel", level.toString());
    console.log("Discovery level set to:", level);
  }

  // State management
  async loadAppState() {
    try {
      // Load recent playlists
      const recentPlaylists = JSON.parse(localStorage.getItem("recentPlaylists") || "[]");
      this.displayRecentPlaylists(recentPlaylists);

      // Load settings
      const autoAdapt = localStorage.getItem("autoAdaptEnabled") !== "false";
      const discoveryLevel = localStorage.getItem("discoveryLevel") || "30";

      const autoAdaptSwitch = document.getElementById("autoAdaptSwitch");
      const discoverySlider = document.getElementById("discoverySlider");

      if (autoAdaptSwitch) autoAdaptSwitch.checked = autoAdapt;
      if (discoverySlider) discoverySlider.value = discoveryLevel;
    } catch (error) {
      console.error("Failed to load app state:", error);
    }
  }

  saveRecentPlaylist(result) {
    try {
      const recentPlaylists = JSON.parse(localStorage.getItem("recentPlaylists") || "[]");
      const playlistInfo = {
        id: result.playlist.id,
        name: result.playlist.name,
        description: result.playlist.description,
        trackCount: result.tracks.length,
        createdAt: new Date().toISOString(),
        url: result.playlist.external_urls.spotify,
        tracks: result.tracks, // Save full track data for reloading
        concept: result.concept // Save the AI concept for context
      };

      // Add to beginning and limit to 10
      recentPlaylists.unshift(playlistInfo);
      const limitedPlaylists = recentPlaylists.slice(0, 10);

      localStorage.setItem("recentPlaylists", JSON.stringify(limitedPlaylists));
      this.displayRecentPlaylists(limitedPlaylists);
    } catch (error) {
      console.error("Failed to save recent playlist:", error);
    }
  }
  displayRecentPlaylists(playlists) {
    const container = document.getElementById("recentPlaylists");
    if (!container) return;

    if (playlists.length === 0) {
      container.innerHTML =
        '<div class="text-center py-3"><small class="text-muted">No recent playlists</small></div>';
      return;
    }

    container.innerHTML = "";
    playlists.forEach((playlist) => {
      const item = document.createElement("div");
      item.className = "list-group-item list-group-item-action bg-transparent border-0 px-0 py-2";
      item.innerHTML = `
                <div class="d-flex justify-content-between align-items-start">
                    <div class="flex-grow-1">
                        <h6 class="mb-1">${this.escapeHtml(playlist.name)}</h6>
                        <small class="text-muted">${playlist.trackCount} tracks</small>
                    </div>
                    <div class="d-flex flex-column align-items-end">
                        <small class="text-muted">${this.formatRelativeTime(
                          playlist.createdAt
                        )}</small>
                        <div class="btn-group btn-group-sm mt-1" role="group">
                            <button class="btn btn-outline-primary btn-sm load-playlist-btn" 
                                    title="Load playlist into app">
                                <i class="bi bi-arrow-down-circle"></i>
                            </button>
                            <button class="btn btn-outline-success btn-sm open-spotify-btn" 
                                    title="Open in Spotify">
                                <i class="bi bi-spotify"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;

      // Add event listeners for the buttons
      const loadBtn = item.querySelector(".load-playlist-btn");
      const openBtn = item.querySelector(".open-spotify-btn");

      loadBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.loadSavedPlaylist(playlist);
      });

      openBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.openInSpotify(playlist.url);
      });

      container.appendChild(item);
    });
  }

  formatRelativeTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  // Keyboard shortcuts
  handleKeyboardShortcuts(e) {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case "n":
          e.preventDefault();
          document.getElementById("playlistDescription")?.focus();
          break;
        case "Enter":
          if (e.target.id === "playlistDescription") {
            e.preventDefault();
            this.handlePlaylistGeneration();
          }
          break;
      }
    }

    // Space bar for play/pause (when not in input)
    if (e.code === "Space" && !["INPUT", "TEXTAREA"].includes(e.target.tagName)) {
      e.preventDefault();
      this.spotifyAPI?.togglePlayback();
    }
  }

  handleWindowResize() {
    // Handle any responsive adjustments
    console.log("Window resized");
  }

  updatePlaylistStats(result) {
    // Update any playlist statistics displays
    console.log(`Playlist "${result.playlist.name}" loaded with ${result.tracks.length} tracks`);
  }

  async showDeviceInfo() {
    try {
      const devices = await this.spotifyAPI.getAvailableDevices();

      if (devices.length === 0) {
        this.showError(
          "No Spotify devices found. Please open Spotify on your phone, computer, or another device."
        );
        return;
      }

      const activeDevice = devices.find((device) => device.is_active);

      let message = "Available Spotify devices:\n";
      devices.forEach((device) => {
        const status = device.is_active ? " (ACTIVE)" : "";
        const type = device.type.toLowerCase();
        message += `• ${device.name} (${type})${status}\n`;
      });

      if (!activeDevice) {
        message +=
          "\nNo active device found. Please start playing something on one of your devices first.";
      }

      console.log(message);
      this.showInfo(message);
    } catch (error) {
      console.error("Failed to get device info:", error);
      this.showError("Failed to get device information: " + error.message);
    }
  }

  clearPlaylistHistory() {
    try {
      // Show confirmation dialog
      const confirmMessage =
        "Are you sure you want to clear all playlist history? This action cannot be undone.";

      if (confirm(confirmMessage)) {
        // Clear the localStorage
        localStorage.removeItem("recentPlaylists");

        // Update the display
        this.displayRecentPlaylists([]);

        this.showSuccess("Playlist history cleared successfully");
        console.log("Playlist history cleared");
      }
    } catch (error) {
      console.error("Failed to clear playlist history:", error);
      this.showError("Failed to clear playlist history: " + error.message);
    }
  }

  async loadSavedPlaylist(savedPlaylist) {
    try {
      // Set the playlist description in the form
      const descriptionInput = document.getElementById("playlistDescription");
      if (descriptionInput) {
        descriptionInput.value = savedPlaylist.description || "";
      }

      // Recreate the playlist result structure
      const playlistResult = {
        playlist: {
          id: savedPlaylist.id,
          name: savedPlaylist.name,
          external_urls: { spotify: savedPlaylist.url },
          description: savedPlaylist.description || "Loaded from plAIlist history"
        },
        tracks: savedPlaylist.tracks,
        concept: savedPlaylist.concept || {
          theme: "Loaded playlist",
          mood: "mixed",
          searchQueries: [],
          suggestedGenres: [],
          suggestedArtists: [],
          energyLevel: "medium",
          characteristics: [],
          progression: "varied"
        }
      };

      // Load it as the current playlist
      this.currentPlaylist = playlistResult;
      this.displayPlaylist(playlistResult);

      this.showSuccess(`Loaded "${savedPlaylist.name}" with ${savedPlaylist.trackCount} tracks`);
    } catch (error) {
      console.error("Failed to load saved playlist:", error);
      this.showError("Failed to load playlist: " + error.message);
    }
  }

  // Template functionality
  getPlaylistTemplates() {
    return {
      workout:
        "High-energy tracks perfect for an intense workout session. Include motivational and pump-up songs with strong beats and driving rhythms.",
      study:
        "Calm, focus-enhancing music ideal for studying or working. Include ambient, instrumental, and lo-fi tracks that promote concentration.",
      party:
        "Upbeat, danceable hits that get everyone moving. Include popular songs, dance tracks, and crowd-pleasers perfect for celebrations.",
      chill:
        "Relaxed, mellow vibes for unwinding and relaxation. Include smooth tracks, soft vocals, and laid-back rhythms for peaceful moments.",
      focus:
        "Minimal, ambient soundscapes for deep concentration. Include instrumental music, nature sounds, and meditative tracks for productivity.",
      romantic:
        "Intimate, heartfelt songs perfect for romantic moments. Include love ballads, smooth R&B, and emotionally resonant tracks.",
      "road-trip":
        "Feel-good anthems and sing-along favorites for long drives. Include classic road trip songs, rock hits, and uplifting melodies.",
      nostalgia:
        "Throwback hits and classic favorites that bring back memories. Include retro tracks, golden oldies, and timeless songs from past decades."
    };
  }

  selectPlaylistTemplate(templateName) {
    const templates = this.getPlaylistTemplates();
    const templateDescription = templates[templateName];

    if (!templateDescription) {
      console.error("Unknown template:", templateName);
      return;
    }

    // Fill the description input with the template
    const descriptionInput = document.getElementById("playlistDescription");
    if (descriptionInput) {
      descriptionInput.value = templateDescription;
      descriptionInput.focus();
    } // Add visual feedback - highlight selected template
    document.querySelectorAll(".template-btn").forEach((btn) => {
      btn.classList.remove("btn-primary", "selected");
      btn.classList.add("btn-outline-light");
    });

    const selectedButton = document.querySelector(`[data-template="${templateName}"]`);
    if (selectedButton) {
      selectedButton.classList.remove("btn-outline-light");
      selectedButton.classList.add("btn-primary", "selected");
    }

    // Show feedback to user
    const templateDisplayName = templateName
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");

    this.showInfo(`Selected ${templateDisplayName} template`);

    // Auto-scroll to the description input
    descriptionInput.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

// Initialize the app when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  window.app = new PlAIlistApp();
});

// Export for global access
window.PlAIlistApp = PlAIlistApp;
