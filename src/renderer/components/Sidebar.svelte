<script>
  import NowPlaying from "./NowPlaying.svelte";
  // Props
  let {
    spotifyAPI,
    currentPlayback = $bindable(),
    recentPlaylists = $bindable(),
    clearPlaylistHistory,
    loadSavedPlaylist,
    behaviorInsights = null,
    learningEnabled = true,
    toggleLearningEnabled,
    refreshBehaviorInsights,
    behaviorStatistics = null,
    trackSkipAction,
    trackLikeAction,
    trackRemovalAction,
    behaviorTracker,
    analyzeCurrentTrack,
    currentPlaylist = $bindable(),
    handleAutoAdaptation
  } = $props();
  // State for sidebar controls using runes
  let autoAdaptEnabled = $state(true);
  let discoveryLevel = $state(30);

  // Load state from localStorage on mount
  $effect(() => {
    loadSidebarState();
  });
  function loadSidebarState() {
    try {
      autoAdaptEnabled = localStorage.getItem("autoAdaptEnabled") !== "false";
      discoveryLevel = parseInt(localStorage.getItem("discoveryLevel") || "30");

      // Sync with behaviorTracker if available
      if (behaviorTracker) {
        behaviorTracker.setAutoAdaptEnabled(autoAdaptEnabled);
      }
    } catch (error) {
      console.error("Failed to load sidebar state:", error);
    }
  }
  function toggleAutoAdapt() {
    localStorage.setItem("autoAdaptEnabled", autoAdaptEnabled.toString());

    // Connect to behaviorTracker
    if (behaviorTracker) {
      behaviorTracker.setAutoAdaptEnabled(autoAdaptEnabled);
    }

    if (autoAdaptEnabled) {
      showInfo("Auto-adapt mode enabled - playlist will adapt to your listening patterns");
    } else {
      showInfo("Auto-adapt mode disabled");
    }
  }
  function updateDiscoveryLevel() {
    localStorage.setItem("discoveryLevel", discoveryLevel.toString());
  }

  function handleClearHistory() {
    if (clearPlaylistHistory) {
      clearPlaylistHistory();
    }
  }

  function handleLoadPlaylist(playlist) {
    if (loadSavedPlaylist) {
      loadSavedPlaylist(playlist);
    }
  }
  function handleOpenInSpotify(url) {
    if (url) {
      window.electronAPI?.openExternal?.(url) || window.open(url, "_blank");
    }
  }

  async function handleDeletePlaylist(playlist) {
    if (!spotifyAPI) return;

    const confirmMessage = `Are you sure you want to delete "${playlist.name}"? This will remove it from Spotify and cannot be undone.`;

    if (confirm(confirmMessage)) {
      try {
        // Remove from Spotify
        await spotifyAPI.unfollowPlaylist(playlist.id);

        // Remove from local recent playlists
        const updatedPlaylists = recentPlaylists.filter((p) => p.id !== playlist.id);
        recentPlaylists = updatedPlaylists;
        localStorage.setItem("recentPlaylists", JSON.stringify(updatedPlaylists));

        showInfo(`Playlist "${playlist.name}" deleted successfully`);
      } catch (error) {
        console.error("Failed to delete playlist:", error);
        showInfo("Failed to delete playlist: " + error.message);
      }
    }
  }

  function formatRelativeTime(timestamp) {
    const now = new Date();
    const date = new Date(timestamp);
    const diffInMinutes = Math.floor((now - date) / (1000 * 60));

    if (diffInMinutes < 1) return "Just now";
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  }

  function showInfo(message) {
    console.log(message);
  }
</script>

<!-- Now Playing -->
<NowPlaying
  {spotifyAPI}
  bind:currentPlayback
  {behaviorTracker}
  {learningEnabled}
  {analyzeCurrentTrack}
  bind:currentPlaylist
  onAutoAdaptation={handleAutoAdaptation}
/>

<!-- Smart Controls -->
<div class="card bg-secondary mb-3">
  <div class="card-header">
    <h6 class="card-title mb-0">
      <i class="bi bi-sliders me-2"></i>
      Smart Controls
    </h6>
  </div>
  <div class="card-body">
    <!-- Behavior Learning Toggle -->
    <div class="mb-3">
      <div class="form-label">
        <i class="bi bi-brain me-1"></i>
        Behavior Learning
      </div>
      <div class="form-check form-switch">
        <input
          class="form-check-input"
          type="checkbox"
          id="learning-enabled-switch"
          bind:checked={learningEnabled}
          onchange={toggleLearningEnabled}
        />
        <label class="form-check-label" for="learning-enabled-switch">
          Learn from my listening patterns
        </label>
      </div>
      <small class="text-muted">
        AI tracks your skips, likes, and listening habits to improve recommendations
      </small>
    </div>

    <!-- Behavior Insights Display -->
    {#if learningEnabled && behaviorStatistics}
      <div class="mb-3">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <div class="form-label mb-0">
            <i class="bi bi-graph-up me-1"></i>
            Learning Stats
          </div>
          <button
            class="btn btn-outline-primary btn-sm"
            onclick={refreshBehaviorInsights}
            title="Refresh insights"
            aria-label="Refresh behavior insights"
          >
            <i class="bi bi-arrow-clockwise"></i>
          </button>
        </div>

        <div class="row g-2 mb-2">
          <div class="col-6">
            <div class="text-center p-2 bg-dark rounded">
              <div class="h6 mb-0 text-primary">{behaviorStatistics.totalTracks}</div>
              <small class="text-muted">Tracks analyzed</small>
            </div>
          </div>
          <div class="col-6">
            <div class="text-center p-2 bg-dark rounded">
              <div class="h6 mb-0 text-success">
                {behaviorStatistics.totalTracks > 0
                  ? Math.round(
                      (behaviorStatistics.totalLikes / behaviorStatistics.totalTracks) * 100
                    )
                  : 0}%
              </div>
              <small class="text-muted">Like rate</small>
            </div>
          </div>
        </div>

        {#if behaviorStatistics.optimalDiscoveryLevel}
          <div class="alert alert-info py-2 mb-2">
            <small>
              <i class="bi bi-lightbulb me-1"></i>
              Suggested discovery level:
              <strong>{behaviorStatistics.optimalDiscoveryLevel}%</strong>
            </small>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Auto-Adapt Mode -->
    <div class="mb-3">
      <div class="form-label">Auto-Adapt Mode</div>
      <div class="form-check form-switch">
        <input
          class="form-check-input"
          type="checkbox"
          id="auto-adapt-switch"
          bind:checked={autoAdaptEnabled}
          onchange={toggleAutoAdapt}
        />
        <label class="form-check-label" for="auto-adapt-switch"> Adapt to my listening </label>
      </div>
      <small class="text-muted"> Automatically adjust playlist based on skips and likes </small>
    </div>

    <!-- Discovery Level -->
    <div class="mb-3">
      <label class="form-label" for="discovery-level">Discovery Level</label>
      <input
        type="range"
        class="form-range"
        id="discovery-level"
        min="0"
        max="100"
        bind:value={discoveryLevel}
        oninput={updateDiscoveryLevel}
      />
      <div class="d-flex justify-content-between">
        <small class="text-muted">Familiar</small>
        <small class="text-muted">Adventurous</small>
      </div>
      <div class="text-center">
        <small class="text-info">{discoveryLevel}%</small>
      </div>
    </div>

    <!-- Behavior Insights Summary -->
    {#if learningEnabled && behaviorInsights}
      <div class="mb-3">
        <div class="form-label">
          <i class="bi bi-person-check me-1"></i>
          Your Preferences
        </div>

        {#if behaviorInsights.preferredGenres && behaviorInsights.preferredGenres.length > 0}
          <div class="mb-2">
            <small class="text-muted d-block">Top Genres:</small>
            <div class="d-flex flex-wrap gap-1">
              {#each behaviorInsights.preferredGenres.slice(0, 3) as genre}
                <span class="badge bg-primary">{genre.name}</span>
              {/each}
            </div>
          </div>
        {/if}

        {#if behaviorInsights.energyPreference && behaviorInsights.energyPreference.preference !== "unknown"}
          <div class="mb-2">
            <small class="text-muted d-block">Energy Preference:</small>
            <span class="badge bg-success">
              {behaviorInsights.energyPreference.preference} energy ({Math.round(
                behaviorInsights.energyPreference.confidence * 100
              )}% confidence)
            </span>
          </div>
        {/if}

        {#if behaviorInsights.recommendations && behaviorInsights.recommendations.length > 0}
          <div class="mt-2">
            <small class="text-muted d-block">AI Recommendations:</small>
            <div class="small text-info">
              • {behaviorInsights.recommendations[0]}
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<!-- Recent Playlists -->
<div class="card bg-secondary">
  <div class="card-header d-flex justify-content-between align-items-center">
    <h6 class="card-title mb-0">
      <i class="bi bi-clock-history me-2"></i>
      Recent Playlists
    </h6>
    <button
      class="btn btn-outline-danger btn-sm"
      onclick={handleClearHistory}
      title="Clear playlist history"
      aria-label="Clear playlist history"
    >
      <i class="bi bi-trash"></i>
    </button>
  </div>
  <div class="card-body">
    <div class="list-group list-group-flush">
      {#if recentPlaylists.length === 0}
        <div class="text-center py-3">
          <small class="text-muted">No recent playlists</small>
        </div>
      {:else}
        {#each recentPlaylists as playlist}
          <div class="list-group-item list-group-item-action bg-transparent border-0 px-0 py-2">
            <div class="d-flex justify-content-between align-items-start">
              <div class="flex-grow-1">
                <h6 class="mb-1">{playlist.name}</h6>
                <small class="text-muted">{playlist.trackCount} tracks</small>
              </div>
              <div class="d-flex flex-column align-items-end">
                <small class="text-muted">{formatRelativeTime(playlist.createdAt)}</small>
                <div class="btn-group btn-group-sm mt-1">
                  <button
                    class="btn btn-outline-light btn-sm"
                    onclick={() => handleLoadPlaylist(playlist)}
                    title="Load playlist"
                    aria-label="Load playlist"
                  >
                    <i class="bi bi-arrow-down-circle"></i>
                  </button>
                  <button
                    class="btn btn-outline-light btn-sm"
                    onclick={() => handleOpenInSpotify(playlist.url)}
                    title="Open in Spotify"
                    aria-label="Open in Spotify"
                  >
                    <i class="bi bi-spotify"></i>
                  </button>
                  <button
                    class="btn btn-outline-danger btn-sm"
                    onclick={() => handleDeletePlaylist(playlist)}
                    title="Delete playlist from Spotify"
                    aria-label="Delete playlist"
                  >
                    <i class="bi bi-trash"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>
        {/each}
      {/if}
    </div>
  </div>
</div>
