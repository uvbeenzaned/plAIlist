<script>
  // Import necessary components and stores
  import PlaylistGenerator from "./components/PlaylistGenerator.svelte";
  import CurrentPlaylist from "./components/CurrentPlaylist.svelte";
  import Sidebar from "./components/Sidebar.svelte";
  import Navbar from "./components/Navbar.svelte";

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
</script>

<svelte:head>
  <title>plAIlist - AI-Powered Spotify Playlist Manager</title>
</svelte:head>

<!-- Main Container -->
<div class="container-fluid h-100">
  <!-- Header/Navigation -->
  <Navbar bind:spotifyConnected bind:spotifyAPI />

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
      />
    </div>
  </div>
</div>

<style>
  /* Styles are imported in main.js */
</style>
