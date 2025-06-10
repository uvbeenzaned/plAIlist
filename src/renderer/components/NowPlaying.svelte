<script>
  // Props
  let {
    spotifyAPI,
    currentPlayback = $bindable(),
    behaviorTracker,
    learningEnabled,
    analyzeCurrentTrack,
    currentPlaylist = $bindable(),
    onAutoAdaptation
  } = $props();

  // State management
  let isVisible = $state(false);
  let currentTrack = $state(null);
  let playbackProgress = $state(0);
  let currentTime = $state("0:00");
  let totalTime = $state("0:00");
  let isPlaying = $state(false);
  let progressInterval = null;

  // Reactive updates when currentPlayback changes
  $effect(() => {
    if (currentPlayback && currentPlayback.item) {
      updateNowPlayingState(currentPlayback);
      isVisible = true;
    } else {
      isVisible = false;
      clearProgressInterval();
    }
  });

  // Cleanup on component destroy
  $effect(() => {
    return () => {
      clearProgressInterval();
    };
  });

  function updateNowPlayingState(playback) {
    currentTrack = {
      name: playback.item.name,
      artist: playback.item.artists.map((a) => a.name).join(", "),
      album: playback.item.album.name,
      artwork: playback.item.album.images[0]?.url || null,
      duration_ms: playback.item.duration_ms,
      external_urls: playback.item.external_urls
    };

    isPlaying = playback.is_playing;

    // Calculate initial progress
    updateProgress(playback.progress_ms, playback.item.duration_ms);

    // Start progress tracking if playing
    if (isPlaying) {
      startProgressTracking(playback.progress_ms, playback.item.duration_ms);
    } else {
      clearProgressInterval();
    }
  }

  function updateProgress(progressMs, durationMs) {
    playbackProgress = (progressMs / durationMs) * 100;
    currentTime = formatTime(progressMs);
    totalTime = formatTime(durationMs);
  }

  function startProgressTracking(initialProgressMs, durationMs) {
    clearProgressInterval();

    let currentProgressMs = initialProgressMs;

    progressInterval = setInterval(() => {
      if (isPlaying && currentProgressMs < durationMs) {
        currentProgressMs += 1000; // Increment by 1 second
        updateProgress(currentProgressMs, durationMs);
      }
    }, 1000);
  }

  function clearProgressInterval() {
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
  }

  function formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  }

  async function togglePlayback() {
    try {
      if (!spotifyAPI) return;
      await spotifyAPI.togglePlayback();
      // Note: isPlaying state will be updated via currentPlayback prop updates
    } catch (error) {
      console.error("Failed to toggle playback:", error);
    }
  }
  async function skipTrack() {
    try {
      if (!spotifyAPI) return;

      // Track behavior for learning if enabled and we have current track info
      if (behaviorTracker && learningEnabled && currentTrack) {
        behaviorTracker.trackSkip(currentTrack, "manual_skip");

        // Trigger auto-adaptation if enabled and we have a current playlist
        if (behaviorTracker.isAutoAdaptEnabled() && currentPlaylist) {
          console.log("▶️ NowPlaying: Attempting auto-adaptation due to manual skip."); // DIAGNOSTIC LOG
          try {
            const adaptationActions = await behaviorTracker.handleAutoAdaptation(
              currentTrack,
              currentPlaylist,
              "manual_skip"
            );

            if (adaptationActions && onAutoAdaptation) {
              // Call the parent handler to actually modify the playlist
              await onAutoAdaptation(adaptationActions);
            }
          } catch (error) {
            console.error("Auto-adaptation failed:", error);
          }
        }
      }

      await spotifyAPI.skipTrack();
    } catch (error) {
      console.error("Failed to skip track:", error);
    }
  }

  function openInSpotify() {
    if (currentTrack?.external_urls?.spotify) {
      window.electronAPI?.openExternal?.(currentTrack.external_urls.spotify) ||
        window.open(currentTrack.external_urls.spotify, "_blank");
    }
  }

  // Cleanup on component destroy
  $effect(() => {
    return () => {
      clearProgressInterval();
    };
  });
</script>

{#if isVisible && currentTrack}
  <div class="card mb-3">
    <div class="card-header">
      <div class="d-flex justify-content-between align-items-center">
        <h6 class="card-title mb-0">
          <i class="bi bi-music-note-beamed me-2"></i>
          Now Playing
        </h6>
        <button
          class="btn btn-outline-light btn-sm"
          onclick={openInSpotify}
          title="Open in Spotify"
          aria-label="Open current track in Spotify"
        >
          <i class="bi bi-spotify"></i>
        </button>
      </div>
    </div>
    <div class="card-body">
      <!-- Track info and artwork -->
      <div class="d-flex align-items-center mb-3">
        <div class="me-3">
          {#if currentTrack.artwork}
            <img
              src={currentTrack.artwork}
              alt="Album artwork"
              class="rounded shadow-sm"
              width="60"
              height="60"
            />
          {:else}
            <div
              class="d-flex align-items-center justify-content-center bg-dark rounded"
              style="width: 60px; height: 60px;"
            >
              <i class="bi bi-music-note-beamed text-muted fs-4"></i>
            </div>
          {/if}
        </div>

        <div class="flex-grow-1 min-width-0">
          <div class="fw-bold text-light mb-1 text-truncate">
            {currentTrack.name}
          </div>
          <div class="text-muted mb-1 text-truncate">
            {currentTrack.artist}
          </div>
          <div class="text-muted small text-truncate">
            {currentTrack.album}
          </div>
        </div>
      </div>

      <!-- Progress bar -->
      <div class="mb-3">
        <div class="progress mb-2" style="height: 4px;">
          <div
            class="progress-bar bg-success"
            role="progressbar"
            style="width: {playbackProgress}%"
            aria-valuenow={playbackProgress}
            aria-valuemin="0"
            aria-valuemax="100"
          ></div>
        </div>
        <div class="d-flex justify-content-between">
          <small class="text-muted">{currentTime}</small>
          <small class="text-muted">{totalTime}</small>
        </div>
      </div>

      <!-- Playback controls -->
      <div class="d-flex justify-content-center gap-2">
        <button
          class="btn btn-outline-light btn-sm"
          onclick={togglePlayback}
          title={isPlaying ? "Pause" : "Play"}
        >
          {#if isPlaying}
            <i class="bi bi-pause-fill"></i>
          {:else}
            <i class="bi bi-play-fill"></i>
          {/if}
        </button>
        <button
          class="btn btn-outline-light btn-sm"
          onclick={skipTrack}
          title="Skip track"
          aria-label="Skip track"
        >
          <i class="bi bi-skip-end-fill"></i>
        </button>
        {#if analyzeCurrentTrack}
          <button
            class="btn btn-outline-primary btn-sm"
            onclick={analyzeCurrentTrack}
            title="Analyze track and generate playlist suggestions"
            aria-label="Analyze track"
          >
            <i class="bi bi-graph-up"></i>
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .min-width-0 {
    min-width: 0;
  }

  .text-truncate {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .btn-outline-light:hover {
    background-color: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.5);
  }

  .progress-bar {
    transition: width 0.3s ease;
  }
</style>
