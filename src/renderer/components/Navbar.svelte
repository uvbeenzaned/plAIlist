<script>
  import { SpotifyAPI } from "../js/spotify.js";
  // Props
  let { spotifyConnected = $bindable(), spotifyAPI = $bindable(), onOpenSettings } = $props();
  // Spotify API instance
  let localSpotifyAPI = $state(null);

  // Theme state (dark/light)
  let theme = $state(localStorage.getItem("plailist-theme") || "dark");

  // Apply theme to <html> element and persist choice
  $effect(() => {
    document.documentElement.setAttribute("data-bs-theme", theme);
    localStorage.setItem("plailist-theme", theme);
  });

  function toggleTheme() {
    theme = theme === "dark" ? "light" : "dark";
    // The $effect above will handle applying the theme and saving to localStorage
  }

  // Reactive status text
  let statusText = $derived(spotifyConnected ? "Connected" : "Connect Spotify");
  let statusClass = $derived(spotifyConnected ? "spotify-connected" : "spotify-disconnected");
  // Initialize Spotify API only once
  $effect(() => {
    if (spotifyAPI && !localSpotifyAPI) {
      localSpotifyAPI = spotifyAPI;
      // Check if already connected
      if (localSpotifyAPI.isConnected) {
        spotifyConnected = true;
      }
    }
  });
  async function handleSpotifyConnect() {
    try {
      if (!localSpotifyAPI) {
        showNotification("Spotify API not initialized yet. Please wait...", "warning");
        return;
      }

      if (spotifyConnected) {
        // Disconnect
        localSpotifyAPI.disconnect();
        spotifyConnected = false;
      } else {
        // Connect
        await localSpotifyAPI.authenticate();
        spotifyConnected = localSpotifyAPI.isConnected;
      }
    } catch (error) {
      console.error("Failed to handle Spotify connection:", error);
      showNotification("Failed to connect to Spotify: " + error.message, "error");
    }
  }

  function showNotification(message, type = "info") {
    if (localSpotifyAPI) {
      localSpotifyAPI.showNotification(message, type);
    } else {
      console.log(`${type.toUpperCase()}: ${message}`);
    }
  }
</script>

<!-- Header/Navigation -->
<nav class="navbar navbar-expand-lg navbar-dark bg-primary mb-3">
  <div class="container-fluid">
    <span class="navbar-brand d-flex align-items-center">
      <i class="bi bi-music-note-beamed me-2"></i>
      <strong>plAIlist</strong>
    </span>

    <div class="navbar-nav ms-auto align-items-center" style="gap: 0.5rem;">
      <div class="nav-item">
        <button class="btn btn-sm {statusClass}" onclick={handleSpotifyConnect}>
          <i class="bi bi-spotify"></i>
          <span>{statusText}</span>
        </button>
      </div>
      <div class="nav-item">
        <button class="btn btn-sm" title="Toggle dark/light theme" onclick={toggleTheme}>
          {#if theme === "dark"}
            <i class="bi bi-moon"></i>
          {:else}
            <i class="bi bi-sun"></i>
          {/if}
        </button>
      </div>
      <div class="nav-item">
        <button
          class="btn btn-sm"
          title="Settings"
          aria-label="Open Settings"
          onclick={onOpenSettings}
        >
          <i class="bi bi-gear"></i>
        </button>
      </div>
    </div>
  </div>
</nav>
