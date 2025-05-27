<script>
  // Svelte 5 runes syntax for state and props
  let spotifyClientId = $state("");
  let spotifyClientSecret = $state("");
  let openaiApiKey = $state("");
  let isSaving = $state(false);
  let saveError = $state("");
  let saveSuccess = $state(false);

  // Load current config from Electron main process
  async function loadConfig() {
    try {
      const config = await window.electronAPI?.getConfig?.();
      if (config) {
        // Extract from nested structure
        spotifyClientId = config.spotify?.clientId || "";
        spotifyClientSecret = config.spotify?.clientSecret || "";
        openaiApiKey = config.ai?.openaiApiKey || "";
      }
    } catch (e) {
      saveError = "Failed to load configuration.";
    }
  }

  $effect(() => {
    loadConfig();
  });
  async function saveKeys() {
    isSaving = true;
    saveError = "";
    saveSuccess = false;
    try {
      const result = await window.electronAPI?.setApiKeys?.({
        spotifyClientId,
        spotifyClientSecret,
        openaiApiKey
      });

      if (result?.success) {
        saveSuccess = true;
      } else {
        saveError = result?.message || "Failed to save API keys.";
      }
    } catch (e) {
      saveError = "Failed to save API keys.";
    } finally {
      isSaving = false;
    }
  }
</script>

<div
  class="p-4 bg-dark text-light border-0 shadow-lg"
  style="border-radius: 0 0 8px 8px; background-color: #181a1b;"
>
  <div class="d-flex flex-column align-items-center mb-3">
    <i class="bi bi-music-note-beamed" style="font-size:2.5rem;"></i>
  </div>
  <h2 class="h4 mb-4 text-center">API Key Configuration</h2>
  <form
    onsubmit={(e) => {
      e.preventDefault();
      saveKeys();
    }}
    autocomplete="off"
  >
    <div class="mb-3">
      <label class="form-label">Spotify Client ID</label>
      <input
        class="form-control bg-dark text-light border-secondary dark-placeholder"
        bind:value={spotifyClientId}
        placeholder="Enter Spotify Client ID"
        required
      />
    </div>
    <div class="mb-3">
      <label class="form-label">Spotify Client Secret</label>
      <input
        class="form-control bg-dark text-light border-secondary dark-placeholder"
        bind:value={spotifyClientSecret}
        placeholder="Enter Spotify Client Secret"
        required
        type="password"
      />
    </div>
    <div class="mb-3">
      <label class="form-label">OpenAI API Key</label>
      <input
        class="form-control bg-dark text-light border-secondary dark-placeholder"
        bind:value={openaiApiKey}
        placeholder="Enter OpenAI API Key"
        required
        type="password"
      />
    </div>
    {#if saveError}
      <div class="alert alert-danger">{saveError}</div>
    {/if}
    {#if saveSuccess}
      <div class="alert alert-success">API keys saved successfully.</div>
    {/if}
    <button class="btn btn-primary w-100 mt-2" type="submit" disabled={isSaving}>
      {isSaving ? "Saving..." : "Save"}
    </button>
  </form>
</div>

<style>
  .dark-placeholder::placeholder {
    color: #9ca3af !important;
    opacity: 1;
  }

  .dark-placeholder::-webkit-input-placeholder {
    color: #9ca3af !important;
    opacity: 1;
  }

  .dark-placeholder::-moz-placeholder {
    color: #9ca3af !important;
    opacity: 1;
  }

  .dark-placeholder:-ms-input-placeholder {
    color: #9ca3af !important;
    opacity: 1;
  }
</style>
