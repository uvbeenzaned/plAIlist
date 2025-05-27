<script>
  import Settings from "./components/Settings.svelte";
  import PlaylistGenerator from "./components/PlaylistGenerator.svelte";
  import CurrentPlaylist from "./components/CurrentPlaylist.svelte";
  import Sidebar from "./components/Sidebar.svelte";
  import Navbar from "./components/Navbar.svelte";

  // Settings modal state
  let showSettings = $state(false);

  function openSettings() {
    showSettings = true;
  }

  function closeSettings() {
    showSettings = false;
  }

  // Import API classes
  import { SpotifyAPI } from "./js/spotify.js";
  import { AIPlaylistGenerator } from "./js/ai.js";
  import BehaviorTracker from "./js/behaviorTracker.js"; // Svelte 5 runes for state management
  let spotifyConnected = $state(false);
  let currentPlaylist = $state(null);
  let isGenerating = $state(false);
  let spotifyAPI = $state(null);
  let aiGenerator = $state(null);
  let behaviorTracker = $state(null);
  let currentPlayback = $state(null);
  let recentPlaylists = $state([]);
  let behaviorInsights = $state(null);
  let learningEnabled = $state(true); // Initialize the app only once when component mounts
  let initialized = $state(false);

  $effect(() => {
    if (!initialized) {
      initializeApp();
    }
  });

  // Watch for Spotify connection changes and update child components
  $effect(() => {
    if (spotifyConnected && spotifyAPI) {
      // Spotify connected - components can now use spotifyAPI
      console.log("Spotify connected, updating child components");
    }
  });

  async function initializeApp() {
    try {
      // Check configuration first
      const configValidation = await window.electronAPI.validateConfig();
      if (!configValidation.isValid) {
        showConfigurationWarning(configValidation.errors);
      } // Initialize Spotify API
      spotifyAPI = new SpotifyAPI();
      aiGenerator = new AIPlaylistGenerator(spotifyAPI); // Initialize behavior tracker
      behaviorTracker = new BehaviorTracker(spotifyAPI, aiGenerator);

      // Load learning settings
      learningEnabled = localStorage.getItem("learningEnabled") !== "false";

      // Set up playback callback to update currentPlayback state and behavior tracking
      spotifyAPI.setPlaybackCallback((playback) => {
        currentPlayback = playback;

        // Pass playback data to behavior tracker for analysis
        if (behaviorTracker && learningEnabled) {
          behaviorTracker.handlePlaybackUpdate(playback);
        }
      });

      // Set up connection callback to update spotifyConnected state
      spotifyAPI.setConnectionCallback((connected) => {
        spotifyConnected = connected;
      });

      // Wait for AI generator to fully initialize before checking quota
      setTimeout(async () => {
        await checkAIQuotaStatus();
      }, 1000);

      // Load any saved state
      await loadAppState();

      // Set up behavior insights update interval
      if (behaviorTracker && learningEnabled) {
        // Update insights every 5 minutes
        setInterval(
          async () => {
            try {
              behaviorInsights = await behaviorTracker.generateInsights();
            } catch (error) {
              console.warn("Failed to update behavior insights:", error);
            }
          },
          5 * 60 * 1000
        );

        // Generate initial insights if we have enough data
        if (behaviorTracker.getStatistics().totalTracks > 5) {
          behaviorInsights = await behaviorTracker.generateInsights();
        }
      }

      console.log("plAIlist app initialized");
      showWelcomeMessage();
      initialized = true;
    } catch (error) {
      console.error("Failed to initialize app:", error);
      showError("Failed to initialize application: " + error.message);
      initialized = true; // Set even on error to prevent re-attempts
    }
  }
  function showConfigurationWarning(errors) {
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

  async function checkAIQuotaStatus() {
    if (!aiGenerator || !aiGenerator.hasApiKey) return;

    try {
      // Test the AI API with a minimal request
      await aiGenerator.makeAIRequest("Test");
    } catch (error) {
      if (error.code === "QUOTA_EXCEEDED") {
        showAIQuotaWarning();
      } else if (error.message.includes("insufficient_quota")) {
        showAIQuotaWarning();
      }
      // Ignore other errors - they'll be handled during actual usage
    }
  }

  function showAIQuotaWarning() {
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
      showNotification(
        "AI quota exceeded. Using algorithmic playlist generation. Add OpenAI credits to restore AI features.",
        "warning"
      );
    }, 1000);
  }

  async function loadAppState() {
    try {
      // Load recent playlists from localStorage
      const saved = localStorage.getItem("recentPlaylists");
      if (saved) {
        recentPlaylists = JSON.parse(saved);
      }
    } catch (error) {
      console.error("Failed to load app state:", error);
    }
  }

  function saveRecentPlaylist(result) {
    try {
      const playlistInfo = {
        id: result.playlist.id,
        name: result.playlist.name,
        description: result.playlist.description,
        trackCount: result.tracks.length,
        createdAt: new Date().toISOString(),
        url: result.playlist.external_urls.spotify,
        tracks: result.tracks,
        concept: result.concept
      };

      // Add to beginning and limit to 10
      recentPlaylists.unshift(playlistInfo);
      recentPlaylists = recentPlaylists.slice(0, 10);

      // Save to localStorage
      localStorage.setItem("recentPlaylists", JSON.stringify(recentPlaylists));
    } catch (error) {
      console.error("Failed to save recent playlist:", error);
    }
  }
  function clearPlaylistHistory() {
    recentPlaylists = [];
    localStorage.removeItem("recentPlaylists");
  }

  async function loadSavedPlaylist(savedPlaylist) {
    try {
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
      currentPlaylist = playlistResult;

      showNotification(
        `Loaded "${savedPlaylist.name}" with ${savedPlaylist.trackCount} tracks`,
        "success"
      );
    } catch (error) {
      console.error("Failed to load saved playlist:", error);
      showNotification("Failed to load playlist: " + error.message, "error");
    }
  }

  // Behavior tracker management functions
  function toggleLearningEnabled() {
    learningEnabled = !learningEnabled;
    localStorage.setItem("learningEnabled", learningEnabled.toString());

    if (behaviorTracker) {
      behaviorTracker.setLearningEnabled(learningEnabled);
    }

    showInfo(learningEnabled ? "Behavior learning enabled" : "Behavior learning disabled");
  }

  async function refreshBehaviorInsights() {
    if (behaviorTracker && learningEnabled) {
      try {
        behaviorInsights = await behaviorTracker.generateInsights();
        showInfo("Behavior insights updated");
      } catch (error) {
        console.error("Failed to refresh insights:", error);
        showError("Failed to update behavior insights");
      }
    }
  }

  function getBehaviorStatistics() {
    return behaviorTracker ? behaviorTracker.getStatistics() : null;
  }

  // Track manual user actions
  function trackSkipAction(trackInfo, reason = "manual") {
    if (behaviorTracker && learningEnabled) {
      behaviorTracker.trackSkip(trackInfo, reason);
    }
  }

  function trackLikeAction(trackInfo, reason = "manual") {
    if (behaviorTracker && learningEnabled) {
      behaviorTracker.trackLike(trackInfo, reason);
    }
  }

  function trackRemovalAction(trackInfo, reason = "removed_from_playlist") {
    if (behaviorTracker && learningEnabled) {
      behaviorTracker.trackRemoval(trackInfo, reason);
    }
  }

  // Auto-adaptation handler - called when auto-adapt mode triggers
  async function handleAutoAdaptation(adaptationActions) {
    if (!currentPlaylist || !adaptationActions || !behaviorTracker?.isAutoAdaptEnabled()) {
      return;
    }

    try {
      let modified = false;
      const tracksToRemove = adaptationActions.remove || [];
      const tracksToAdd = adaptationActions.add || [];

      console.log("🔄 Auto-Adapt: Starting playlist adaptation", {
        toRemove: tracksToRemove.length,
        toAdd: tracksToAdd.length
      });

      // Step 1: Remove tracks based on skip patterns
      if (tracksToRemove.length > 0) {
        for (const removeItem of tracksToRemove) {
          const trackIndex = currentPlaylist.tracks.findIndex((t) => t.id === removeItem.track.id);

          if (trackIndex !== -1) {
            const track = currentPlaylist.tracks[trackIndex];

            // Remove from Spotify playlist if it exists
            if (spotifyAPI && currentPlaylist.playlist?.id && track?.uri) {
              try {
                await spotifyAPI.removeTracksFromPlaylist(currentPlaylist.playlist.id, [track.uri]);
              } catch (error) {
                console.warn("Failed to remove track from Spotify playlist:", error);
              }
            }

            // Remove from local array
            currentPlaylist.tracks.splice(trackIndex, 1);
            modified = true;

            console.log(`🗑️ Auto-Adapt: Removed "${track.name}" - ${removeItem.reason}`);
          }
        }
      }

      // Step 2: Add new tracks based on user preferences
      if (tracksToAdd.length > 0) {
        for (const addItem of tracksToAdd) {
          const newTrack = addItem.track;

          // Add to Spotify playlist if it exists
          if (spotifyAPI && currentPlaylist.playlist?.id && newTrack?.uri) {
            try {
              await spotifyAPI.addTracksToPlaylist(currentPlaylist.playlist.id, [newTrack.uri]);
            } catch (error) {
              console.warn("Failed to add track to Spotify playlist:", error);
            }
          }

          // Add to local array
          currentPlaylist.tracks.push(newTrack);
          modified = true;

          console.log(`➕ Auto-Adapt: Added "${newTrack.name}" - ${addItem.reason}`);
        }
      }

      // Step 3: Update playlist state and show notification
      if (modified) {
        currentPlaylist = { ...currentPlaylist }; // Trigger reactivity

        const removeCount = tracksToRemove.length;
        const addCount = tracksToAdd.length;
        let message = "🎵 Auto-Adapt: ";

        if (removeCount > 0 && addCount > 0) {
          message += `Removed ${removeCount} track(s) and added ${addCount} better match(es)`;
        } else if (removeCount > 0) {
          message += `Removed ${removeCount} track(s) based on your skip patterns`;
        } else if (addCount > 0) {
          message += `Added ${addCount} track(s) matching your preferences`;
        }

        showNotification(message, "success");

        // Show reasoning if available
        if (adaptationActions.reasoning?.length > 0) {
          console.log("🔄 Auto-Adapt reasoning:", adaptationActions.reasoning);
        }
      }
    } catch (error) {
      console.error("Auto-adaptation failed:", error);
      showNotification("Auto-adaptation failed: " + error.message, "error");
    }
  }
  // Notification helper functions
  function showNotification(message, type = "info") {
    // Create a notification element
    const notification = document.createElement("div");
    notification.className = `alert alert-${type === "success" ? "success" : type === "error" ? "danger" : type === "warning" ? "warning" : "info"} alert-dismissible fade show position-fixed`;
    notification.style.cssText = "top: 20px; right: 20px; z-index: 9999; min-width: 300px;";
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

  function showSuccess(message) {
    showNotification(message, "success");
  }

  function showError(message) {
    showNotification(message, "error");
  }

  function showInfo(message) {
    showNotification(message, "info");
  }

  function showWelcomeMessage() {
    showNotification("Welcome to plAIlist! Connect to Spotify to get started.", "info");
  } // AI Track Analysis & Prompt Generation
  async function analyzeCurrentTrack() {
    if (!currentPlayback || !currentPlayback.item || !spotifyAPI || !aiGenerator) {
      showError("No track currently playing or services not available");
      return;
    }

    try {
      const track = currentPlayback.item;
      showInfo("Analyzing track metadata...");

      // Get detailed track information (handle potential null responses)
      const [audioFeatures, trackDetails, artistDetails] = await Promise.all([
        spotifyAPI.getAudioFeatures(track.id).catch(() => null),
        spotifyAPI.getTrackDetails(track.id).catch(() => null),
        spotifyAPI.getArtistDetails(track.artists[0].id).catch(() => null)
      ]);

      // Check if we have enough data to proceed
      if (!audioFeatures && !trackDetails && !artistDetails) {
        showError("Unable to analyze this track - audio features and metadata are not available");
        return;
      }

      if (!audioFeatures) {
        showInfo("Audio features not available for this track, using basic metadata analysis...");
      }

      // Generate analysis-based prompt suggestions
      const suggestions = generateTrackAnalysisPrompts(
        track,
        audioFeatures,
        trackDetails,
        artistDetails
      );

      // Display suggestions to user
      displayTrackAnalysis(track, audioFeatures, suggestions);
    } catch (error) {
      console.error("Failed to analyze track:", error);
      showError("Failed to analyze track: " + error.message);
    }
  }
  function generateTrackAnalysisPrompts(track, audioFeatures, trackDetails, artistDetails) {
    const suggestions = [];

    // Build characteristics based on audio features (if available)
    const characteristics = [];

    if (audioFeatures) {
      if (audioFeatures.energy > 0.7) characteristics.push("high-energy");
      else if (audioFeatures.energy < 0.3) characteristics.push("low-energy", "chill");

      if (audioFeatures.valence > 0.7) characteristics.push("upbeat", "happy");
      else if (audioFeatures.valence < 0.3) characteristics.push("melancholic", "emotional");

      if (audioFeatures.danceability > 0.7) characteristics.push("danceable");
      if (audioFeatures.acousticness > 0.7) characteristics.push("acoustic");
      if (audioFeatures.instrumentalness > 0.5) characteristics.push("instrumental");

      // Tempo-based characteristics
      if (audioFeatures.tempo > 140) characteristics.push("fast-paced");
      else if (audioFeatures.tempo < 80) characteristics.push("slow");
    } else {
      // Fallback characteristics based on basic metadata when audio features are unavailable
      characteristics.push("similar style");
    }

    // Build genre information
    const genres = artistDetails?.genres || [];
    const primaryGenre = genres[0] || "popular music";

    // Generate different types of suggestions
    if (characteristics.length > 0) {
      suggestions.push({
        type: "Similar Vibe",
        prompt:
          "Find " +
          characteristics.slice(0, 2).join(" and ") +
          " " +
          primaryGenre +
          " songs similar to " +
          track.name +
          " by " +
          track.artists[0].name,
        reasoning: audioFeatures
          ? "Based on the track's " + characteristics.slice(0, 2).join(" and ") + " characteristics"
          : "Based on the artist and genre similarities"
      });
    }

    // Energy-based suggestion (only if audio features are available)
    if (audioFeatures) {
      suggestions.push({
        type: "Same Genre, Different Artist",
        prompt:
          "Create a " +
          primaryGenre +
          " playlist with songs that have " +
          Math.round(audioFeatures.energy * 100) +
          "% energy level, avoiding " +
          track.artists[0].name,
        reasoning:
          "Explores the same genre (" + primaryGenre + ") with similar energy but different artists"
      });

      suggestions.push({
        type: "Mood Match",
        prompt:
          "Find songs with " +
          Math.round(audioFeatures.valence * 100) +
          "% positivity and " +
          Math.round(audioFeatures.energy * 100) +
          "% energy for " +
          getTimeBasedContext(),
        reasoning:
          "Matches the emotional characteristics: " +
          (audioFeatures.valence > 0.5 ? "positive" : "introspective") +
          " mood with " +
          (audioFeatures.energy > 0.5 ? "energetic" : "calm") +
          " energy"
      });
    } else {
      // Fallback suggestions when audio features are not available
      suggestions.push({
        type: "Same Genre, Different Artist",
        prompt:
          "Create a " +
          primaryGenre +
          " playlist with songs similar to " +
          track.name +
          ", avoiding " +
          track.artists[0].name,
        reasoning:
          "Explores the same genre (" +
          primaryGenre +
          ") with different artists (audio features not available)"
      });

      suggestions.push({
        type: "Artist & Genre Match",
        prompt:
          "Find " +
          primaryGenre +
          " songs with similar style to " +
          track.artists[0].name +
          " for " +
          getTimeBasedContext(),
        reasoning: "Matches the artist's style and genre (using basic metadata analysis)"
      });
    }

    // Multi-genre suggestion
    if (genres.length > 1) {
      suggestions.push({
        type: "Genre Fusion",
        prompt:
          "Mix " +
          genres.slice(0, 2).join(" and ") +
          (characteristics.length > 0
            ? " with " + characteristics.slice(0, 1) + " characteristics"
            : ""),
        reasoning: "Combines multiple genres from this artist: " + genres.slice(0, 2).join(", ")
      });
    }

    // Decade-based suggestion if release date available
    if (trackDetails?.album?.release_date) {
      const year = new Date(trackDetails.album.release_date).getFullYear();
      const decade = Math.floor(year / 10) * 10;
      suggestions.push({
        type: "Era Explorer",
        prompt:
          "Discover " +
          decade +
          "s " +
          primaryGenre +
          (characteristics.length > 0
            ? " with similar " + characteristics.slice(0, 1) + " vibe"
            : " music"),
        reasoning: "Explores the same era (" + decade + "s) with similar musical characteristics"
      });
    }

    // Ensure we always return at least one suggestion
    if (suggestions.length === 0) {
      suggestions.push({
        type: "Basic Similar",
        prompt: "Find songs similar to " + track.name + " by " + track.artists[0].name,
        reasoning: "Basic similarity search using available track metadata"
      });
    }

    return suggestions;
  }

  function getTimeBasedContext() {
    const hour = new Date().getHours();
    if (hour < 6) return "late night listening";
    if (hour < 12) return "morning energy";
    if (hour < 17) return "afternoon focus";
    if (hour < 21) return "evening relaxation";
    return "nighttime vibes";
  }

  function displayTrackAnalysis(track, audioFeatures, suggestions) {
    // Display a simple notification with the first suggestion
    const primarySuggestion = suggestions[0];
    const message = 'Track Analysis Complete! Suggested prompt: "' + primarySuggestion.prompt + '"';

    // Copy the best suggestion to the playlist generator
    setTimeout(() => {
      const promptInput = document.querySelector("#playlistDescription");
      if (promptInput) {
        promptInput.value = primarySuggestion.prompt;
        promptInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }, 100);

    showSuccess(message);
    showInfo("Suggested prompt has been loaded into the playlist generator!");
  }

  // ...existing code...
</script>

<svelte:head>
  <title>plAIlist - AI-Powered Spotify Playlist Manager</title>
</svelte:head>

<!-- Main Container -->
<div class="container-fluid h-100">
  <!-- Header/Navigation -->
  <Navbar bind:spotifyConnected bind:spotifyAPI onOpenSettings={openSettings} />
  {#if showSettings}
    <div class="modal fade show d-block" tabindex="-1" style="background:rgba(0,0,0,0.5);">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content bg-dark text-light border-0">
          <div class="modal-header bg-dark text-light border-0">
            <h5 class="modal-title text-light">Settings</h5>
            <button
              type="button"
              class="btn-close btn-close-white"
              aria-label="Close settings"
              onclick={closeSettings}
            ></button>
          </div>
          <div class="modal-body bg-dark text-light p-0">
            <Settings />
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Main Content -->
  <div class="row h-100">
    <!-- Left Sidebar - Playlist Generation -->
    <div class="col-md-4 col-lg-3">
      <PlaylistGenerator
        bind:isGenerating
        bind:currentPlaylist
        {aiGenerator}
        {spotifyConnected}
        onPlaylistGenerated={saveRecentPlaylist}
        {behaviorTracker}
        {learningEnabled}
      />
    </div>

    <!-- Center - Current Playlist & Player -->
    <div class="col-md-8 col-lg-6">
      <CurrentPlaylist bind:currentPlaylist {spotifyAPI} {behaviorTracker} {learningEnabled} />
    </div>
    <!-- Right Sidebar - Controls & History -->
    <div class="col-lg-3 d-none d-lg-block">
      <Sidebar
        {spotifyAPI}
        bind:currentPlayback
        bind:recentPlaylists
        {clearPlaylistHistory}
        {loadSavedPlaylist}
        {behaviorInsights}
        {learningEnabled}
        {toggleLearningEnabled}
        {refreshBehaviorInsights}
        behaviorStatistics={getBehaviorStatistics()}
        {trackSkipAction}
        {trackLikeAction}
        {trackRemovalAction}
        {behaviorTracker}
        {analyzeCurrentTrack}
        bind:currentPlaylist
        {handleAutoAdaptation}
      />
    </div>
  </div>
</div>

<style>
  /* Styles are imported in main.js */
</style>
