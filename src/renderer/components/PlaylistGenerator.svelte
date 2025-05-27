<script>
  // Props
  let {
    isGenerating = $bindable(),
    currentPlaylist = $bindable(),
    aiGenerator,
    spotifyConnected,
    onPlaylistGenerated,
    // New props for behavior integration
    behaviorTracker = null,
    learningEnabled = false
  } = $props();
  // Form state using runes
  let playlistDescription = $state("");
  let playlistLength = $state("25");
  let playlistName = $state("");
  let errorMessage = $state("");
  let successMessage = $state("");

  // Template definitions
  const templates = [
    {
      id: "workout",
      icon: "bi-lightning-charge",
      label: "Workout",
      description: "High-energy music perfect for exercise and fitness routines"
    },
    {
      id: "study",
      icon: "bi-book",
      label: "Study",
      description: "Calm, instrumental music ideal for focus and concentration"
    },
    {
      id: "party",
      icon: "bi-people",
      label: "Party",
      description: "Upbeat dance tracks to get everyone moving and energized"
    },
    {
      id: "chill",
      icon: "bi-cloud",
      label: "Chill",
      description: "Relaxed, laid-back vibes for unwinding and relaxation"
    },
    {
      id: "focus",
      icon: "bi-target",
      label: "Focus",
      description: "Ambient and minimal music for deep work and productivity"
    },
    {
      id: "romantic",
      icon: "bi-heart",
      label: "Romantic",
      description: "Love songs and romantic ballads for special moments"
    },
    {
      id: "roadtrip",
      icon: "bi-car-front",
      label: "Road Trip",
      description: "Feel-good anthems perfect for long drives and adventures"
    },
    {
      id: "nostalgia",
      icon: "bi-clock-history",
      label: "Nostalgia",
      description: "Classic hits and throwback songs from past decades"
    }
  ];

  // Selected template state
  let selectedTemplate = $state(null);

  function selectTemplate(template) {
    selectedTemplate = template;
    playlistDescription = template.description;
  }
  async function handleGenerate(event) {
    event.preventDefault();

    if (!playlistDescription.trim()) {
      showError("Please describe your playlist or select a template");
      return;
    }

    isGenerating = true;
    try {
      // Step 1: Generate base playlist concept using AI
      let playlistConcept = await aiGenerator.generatePlaylistConcept(
        playlistDescription,
        parseInt(playlistLength)
      );

      // Step 2: Enhance concept with behavior insights if learning is enabled
      if (behaviorTracker && learningEnabled) {
        try {
          const enhancedConcept = behaviorTracker.enhancePlaylistGeneration(playlistConcept);
          playlistConcept = enhancedConcept;

          // Set playlist context for better tracking
          behaviorTracker.setPlaylistContext({
            description: playlistDescription,
            generatedAt: Date.now(),
            templateUsed: selectedTemplate?.id || null
          });
        } catch (error) {
          console.warn("Failed to enhance playlist with behavior insights:", error);
          // Continue with original concept
        }
      }

      // Step 3: Find tracks using enhanced concept
      const tracks = await aiGenerator.findTracksFromConcept(playlistConcept);

      // Step 4: Create playlist name and generate final playlist
      const finalPlaylistName =
        playlistName || (await aiGenerator.generatePlaylistName(playlistDescription));

      const playlist = await aiGenerator.spotifyAPI.createPlaylist(
        finalPlaylistName,
        `AI-generated playlist: ${playlistDescription}`,
        tracks.map((track) => track.uri)
      );

      const result = {
        playlist: playlist,
        tracks: tracks,
        concept: playlistConcept
      };

      currentPlaylist = result;

      // Call the callback to save the playlist to recent playlists
      if (onPlaylistGenerated) {
        onPlaylistGenerated(result);
      }

      showSuccess("Playlist generated successfully!");

      // Clear the form
      playlistDescription = "";
      playlistName = "";
      selectedTemplate = null;
    } catch (error) {
      console.error("Playlist generation failed:", error);
      showError("Failed to generate playlist: " + error.message);
    } finally {
      isGenerating = false;
    }
  }
  function showError(message) {
    // Display error in UI instead of alert
    errorMessage = message;
    setTimeout(() => {
      errorMessage = "";
    }, 5000);
  }

  function showSuccess(message) {
    // Display success in UI instead of console
    successMessage = message;
    setTimeout(() => {
      successMessage = "";
    }, 3000);
  }
</script>

<div class="card h-100">
  <div class="card-header">
    <h5 class="card-title mb-0">
      <i class="bi bi-magic me-2"></i>
      Generate Playlist
    </h5>
  </div>
  <div class="card-body">
    <!-- Playlist Templates -->
    <div class="mb-4">
      <div class="form-label">
        <i class="bi bi-collection me-1"></i>
        Quick Templates
      </div>
      <div class="row g-2">
        {#each templates as template}
          <div class="col-6">
            <button
              type="button"
              class="btn btn-outline-light btn-sm w-100 template-btn"
              class:btn-primary={selectedTemplate?.id === template.id}
              onclick={() => selectTemplate(template)}
            >
              <i class="bi {template.icon}"></i>
              {template.label}
            </button>
          </div>
        {/each}
      </div>
      <div class="mt-2">
        <small class="text-muted">Or describe your own playlist below</small>
      </div>
    </div>
    <!-- Playlist Generation Form -->
    <form onsubmit={handleGenerate}>
      <div class="mb-3">
        <label for="playlistDescription" class="form-label">
          Describe your perfect playlist:
        </label>
        <textarea
          class="form-control"
          id="playlistDescription"
          rows="4"
          placeholder="e.g., Upbeat indie rock for a road trip, chill lo-fi for studying, energetic workout music..."
          bind:value={playlistDescription}
          required
        ></textarea>
      </div>

      <div class="mb-3">
        <label for="playlistLength" class="form-label">Playlist Length:</label>
        <select class="form-select" id="playlistLength" bind:value={playlistLength}>
          <option value="15">15 songs (~1 hour)</option>
          <option value="25">25 songs (~1.5 hours)</option>
          <option value="40">40 songs (~2.5 hours)</option>
          <option value="60">60 songs (~4 hours)</option>
        </select>
      </div>

      <div class="mb-3">
        <label for="playlistName" class="form-label">Playlist Name (optional):</label>
        <input
          type="text"
          class="form-control"
          id="playlistName"
          placeholder="Auto-generated if empty"
          bind:value={playlistName}
        />
      </div>

      <button type="submit" class="btn btn-primary w-100" disabled={isGenerating}>
        {#if isGenerating}
          <i class="bi bi-hourglass-split me-2"></i>
          Generating...
        {:else}
          <i class="bi bi-stars me-2"></i>
          Generate Playlist
        {/if}
      </button>
    </form>

    <!-- Success and Error Messages -->
    {#if successMessage}
      <div class="alert alert-success mt-3" role="alert">
        <i class="bi bi-check-circle me-2"></i>
        {successMessage}
      </div>
    {/if}

    {#if errorMessage}
      <div class="alert alert-danger mt-3" role="alert">
        <i class="bi bi-exclamation-triangle me-2"></i>
        {errorMessage}
      </div>
    {/if}

    {#if isGenerating}
      <div class="mt-3">
        <div class="d-flex align-items-center">
          <div class="spinner-border spinner-border-sm me-2" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
          <span>Generating your playlist...</span>
        </div>
      </div>
    {/if}
  </div>
</div>
