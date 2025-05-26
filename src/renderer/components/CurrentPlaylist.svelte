<script>
  // Props
  let { currentPlaylist = $bindable(), spotifyAPI, behaviorTracker, learningEnabled } = $props(); // Derived state for tracks
  let tracks = $derived(currentPlaylist?.tracks || []);
  let playlistInfo = $derived(currentPlaylist?.playlist || null);

  // State for shuffle functionality
  let isShuffleActive = $state(false);

  // Calculate total duration
  let totalDuration = $derived.by(() => {
    if (!tracks.length) return "0:00";
    const totalMs = tracks.reduce((sum, track) => sum + track.duration_ms, 0);
    const minutes = Math.floor(totalMs / 60000);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (hours > 0) {
      return `${hours}:${remainingMinutes.toString().padStart(2, "0")}h`;
    } else {
      return `${minutes}m`;
    }
  });
  async function playPlaylist() {
    try {
      if (!spotifyAPI || !currentPlaylist) return;
      await spotifyAPI.playPlaylist(currentPlaylist.playlist.uri);
    } catch (error) {
      // Handle error silently for now
    }
  }
  async function playTrack(trackUri) {
    try {
      if (!spotifyAPI || !currentPlaylist) return;

      // Find the track index in the current playlist
      const trackIndex = tracks.findIndex((track) => track.uri === trackUri);

      if (trackIndex !== -1) {
        // Get all track URIs from the current playlist
        const allTrackUris = tracks.map((track) => track.uri);

        // Play starting from the selected track using the new context method
        await spotifyAPI.playTrackInContext(allTrackUris, trackIndex);

        showSuccess(`Playing "${tracks[trackIndex].name}" and continuing with playlist`);
      } else {
        // Fallback to single track if not found in current playlist
        await spotifyAPI.playTrack(trackUri);
        showSuccess("Playing track");
      }
    } catch (error) {
      console.error("Failed to play track:", error);
      showError("Failed to play track: " + error.message);
    }
  }
  async function removeTrack(index) {
    if (currentPlaylist && currentPlaylist.tracks) {
      const track = currentPlaylist.tracks[index];

      try {
        // Track behavior for learning if enabled
        if (behaviorTracker && learningEnabled && track) {
          behaviorTracker.trackRemoval(track, "removed_from_playlist");
        }

        // Remove from Spotify playlist if it exists
        if (spotifyAPI && currentPlaylist.playlist?.id && track?.uri) {
          await spotifyAPI.removeTracksFromPlaylist(currentPlaylist.playlist.id, [track.uri]);
        }

        // Remove from local array
        currentPlaylist.tracks.splice(index, 1);
        // Trigger reactivity
        currentPlaylist = { ...currentPlaylist };
      } catch (error) {
        // Handle error silently for now
      }
    }
  }

  function openInSpotify(url) {
    if (url) {
      window.electronAPI?.openExternal?.(url) || window.open(url, "_blank");
    }
  }

  function formatDuration(ms) {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
  function showSuccess(message) {
    if (spotifyAPI) {
      spotifyAPI.showNotification(message, "success");
    }
  }
  function showError(message) {
    if (spotifyAPI) {
      spotifyAPI.showNotification(message, "error");
    }
  }

  // Update shuffle state based on Spotify playback
  $effect(() => {
    if (spotifyAPI?.currentPlayback) {
      isShuffleActive = spotifyAPI.currentPlayback.shuffle_state || false;
    }
  });

  async function shufflePlaylist() {
    if (!spotifyAPI || !currentPlaylist) return;

    try {
      // Toggle shuffle state using Spotify's API
      const newShuffleState = await spotifyAPI.toggleShuffle();
      isShuffleActive = newShuffleState;

      // If shuffle was turned on and there's a playlist context, start playing it to activate shuffle
      if (newShuffleState && currentPlaylist.playlist?.uri) {
        await spotifyAPI.playPlaylist(currentPlaylist.playlist.uri);
      }

      // Show success feedback
      showSuccess(newShuffleState ? "Shuffle enabled" : "Shuffle disabled");
    } catch (error) {
      console.error("Failed to toggle shuffle:", error);
      showError("Failed to toggle shuffle. Make sure Spotify is open and connected.");
    }
  }

  async function refreshPlaylist() {
    if (!currentPlaylist) return;

    try {
      // If we have a Spotify playlist ID, fetch fresh data from Spotify
      if (spotifyAPI && currentPlaylist.playlist?.id) {
        const updatedPlaylist = await spotifyAPI.getPlaylist(currentPlaylist.playlist.id);
        if (updatedPlaylist) {
          currentPlaylist = updatedPlaylist;
          return;
        }
      }

      // Otherwise, just trigger reactivity for local updates
      currentPlaylist = { ...currentPlaylist };
    } catch (error) {
      // Handle error silently for now - just trigger reactivity
      currentPlaylist = { ...currentPlaylist };
    }
  }

  function clearCurrentPlaylist() {
    if (!currentPlaylist) return;

    const confirmMessage = `Are you sure you want to clear the current playlist view? This will only clear the view, not delete the playlist from Spotify.`;

    if (confirm(confirmMessage)) {
      currentPlaylist = null;
      showSuccess("Playlist view cleared");
    }
  }
</script>

<div class="card bg-secondary h-100">
  <div class="card-header d-flex justify-content-between align-items-center">
    <h5 class="card-title mb-0">
      <i class="bi bi-music-note-list me-2"></i>
      Current Playlist
    </h5>
    <div class="btn-group btn-group-sm" role="group">
      <button
        class="btn {isShuffleActive ? 'btn-warning' : 'btn-outline-light'}"
        onclick={shufflePlaylist}
        title={isShuffleActive ? "Disable Shuffle" : "Enable Shuffle"}
        aria-label={isShuffleActive ? "Disable shuffle" : "Enable shuffle"}
      >
        <i class="bi bi-shuffle"></i>
        {#if isShuffleActive}
          <i class="bi bi-check-circle-fill ms-1" style="font-size: 0.75em;"></i>
        {/if}
      </button>
      <button
        class="btn btn-outline-light"
        onclick={refreshPlaylist}
        title="Refresh"
        aria-label="Refresh playlist"
      >
        <i class="bi bi-arrow-clockwise"></i>
      </button>
      <button
        class="btn btn-outline-danger"
        onclick={clearCurrentPlaylist}
        title="Clear Playlist View"
        aria-label="Clear playlist view"
      >
        <i class="bi bi-x-circle"></i>
      </button>
    </div>
  </div>
  <div class="card-body p-0">
    <div class="list-group list-group-flush">
      {#if !currentPlaylist}
        <!-- Empty state -->
        <div class="list-group-item bg-secondary text-center py-5">
          <i class="bi bi-music-note-beamed display-4 text-muted"></i>
          <p class="text-muted mt-3 mb-0">Generate a playlist to get started!</p>
        </div>
      {:else}
        <!-- Playlist header -->
        <div class="list-group-item bg-secondary border-bottom">
          <div class="d-flex justify-content-between align-items-center">
            <div>
              <h6 class="mb-1">{playlistInfo?.name || "Generated Playlist"}</h6>
              <small class="text-muted">
                {tracks.length} tracks • {totalDuration}
              </small>
            </div>
            <div class="btn-group btn-group-sm">
              <button
                class="btn btn-outline-success"
                onclick={playPlaylist}
                title="Play Playlist"
                aria-label="Play playlist"
              >
                <i class="bi bi-play-fill"></i>
              </button>
              {#if playlistInfo?.external_urls?.spotify}
                <button
                  class="btn btn-outline-primary"
                  onclick={() => openInSpotify(playlistInfo.external_urls.spotify)}
                  title="Open in Spotify"
                  aria-label="Open playlist in Spotify"
                >
                  <i class="bi bi-spotify"></i>
                </button>
              {/if}
            </div>
          </div>
        </div>

        <!-- Track list -->
        {#each tracks as track, index}
          <div class="list-group-item bg-secondary border-bottom track-item">
            <div class="d-flex align-items-center">
              <div class="track-number me-3">
                <small class="text-muted">{index + 1}</small>
              </div>
              <div class="track-artwork me-3">
                {#if track.album?.images?.[2]?.url || track.album?.images?.[0]?.url}
                  <img
                    src={track.album?.images?.[2]?.url || track.album?.images?.[0]?.url}
                    alt="Album artwork"
                    width="40"
                    height="40"
                    class="rounded track-artwork"
                  />
                {:else}
                  <div
                    class="d-flex align-items-center justify-content-center bg-dark rounded track-artwork"
                    style="width: 40px; height: 40px;"
                  >
                    <i class="bi bi-music-note-beamed text-muted fs-4"></i>
                  </div>
                {/if}
              </div>
              <div class="track-info flex-grow-1">
                <div class="track-title">{track.name}</div>
                <div class="track-artist text-muted">
                  {track.artists?.map((artist) => artist.name).join(", ") || "Unknown Artist"}
                </div>
              </div>
              <div class="track-album me-3">
                <small class="text-muted">{track.album?.name || "Unknown Album"}</small>
              </div>
              <div class="track-duration me-3">
                <small class="text-muted">{formatDuration(track.duration_ms)}</small>
              </div>
              <div class="track-actions">
                <div class="btn-group btn-group-sm">
                  <button
                    class="btn btn-outline-light"
                    onclick={() => playTrack(track.uri)}
                    title="Play Track"
                    aria-label="Play track"
                  >
                    <i class="bi bi-play-fill"></i>
                  </button>
                  <button
                    class="btn btn-outline-light"
                    onclick={() => removeTrack(index)}
                    title="Remove Track"
                    aria-label="Remove track"
                  >
                    <i class="bi bi-x"></i>
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

<style>
  .track-item {
    transition: background-color 0.2s ease;
  }

  .track-item:hover {
    background-color: rgba(255, 255, 255, 0.05) !important;
  }

  .track-artwork {
    border-radius: 4px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  }

  .track-title {
    font-weight: 600;
    margin-bottom: 2px;
  }

  .track-artist {
    color: #aaa;
    font-size: 0.9rem;
  }
</style>
