// Advanced User Behavior Learning System
// Tracks user interactions and provides data-driven insights for playlist optimization

class BehaviorTracker {
  constructor(spotifyAPI, aiGenerator) {
    this.spotifyAPI = spotifyAPI;
    this.aiGenerator = aiGenerator;
    this.behaviorData = this.loadBehaviorData();
    this.currentSession = {
      startTime: Date.now(),
      interactions: [],
      playbackEvents: []
    };

    // Behavior thresholds and parameters
    this.config = {
      skipThreshold: 0.3, // Skip if < 30% of track played
      likeThreshold: 0.8, // Like if > 80% of track played
      sessionTimeout: 30 * 60 * 1000, // 30 minutes
      maxBehaviorHistory: 1000, // Keep last 1000 interactions
      learningEnabled: true,
      // Auto-adaptation settings
      autoAdaptEnabled: false,
      adaptationCooldown: 2 * 60 * 1000, // 2 minutes between adaptations
      minTracksBeforeAdaptation: 3, // Minimum tracks in playlist before removing
      maxAdaptationsPerSession: 5, // Limit adaptations per session
      similarityThreshold: 0.7 // How similar tracks need to be for removal
    };

    // Auto-adaptation state
    this.adaptationState = {
      lastAdaptationTime: 0,
      adaptationsThisSession: 0,
      pendingAdaptations: [],
      currentPlaylistContext: null
    };

    this.setupEventTracking();
  }

  // Load stored behavior data
  loadBehaviorData() {
    try {
      const stored = localStorage.getItem("userBehaviorData");
      if (stored) {
        const data = JSON.parse(stored);
        // Validate and migrate old data if needed
        return this.validateBehaviorData(data);
      }
    } catch (error) {
      console.warn("Failed to load behavior data:", error);
    }

    return {
      preferences: {
        genres: {},
        artists: {},
        audioFeatures: {},
        timeOfDay: {},
        energy: { high: 0, medium: 0, low: 0 }
      },
      interactions: [],
      sessions: [],
      insights: {
        skipPatterns: [],
        favoriteArtists: [],
        preferredGenres: [],
        timePreferences: {},
        lastUpdated: Date.now()
      },
      statistics: {
        totalTracks: 0,
        totalSkips: 0,
        totalLikes: 0,
        avgListenTime: 0,
        sessionsCount: 0
      }
    };
  }
  validateBehaviorData(data) {
    // Ensure all required properties exist
    const defaultData = {
      preferences: {
        genres: {},
        artists: {},
        audioFeatures: {},
        timeOfDay: {},
        energy: { high: 0, medium: 0, low: 0 }
      },
      interactions: [],
      sessions: [],
      insights: {
        skipPatterns: [],
        favoriteFeatures: {},
        listeningHabits: {}
      },
      statistics: {
        totalPlays: 0,
        totalSkips: 0,
        averageSessionLength: 0,
        lastUpdated: Date.now()
      }
    };

    return {
      ...defaultData,
      ...data,
      preferences: { ...defaultData.preferences, ...(data.preferences || {}) },
      insights: { ...defaultData.insights, ...(data.insights || {}) },
      statistics: { ...defaultData.statistics, ...(data.statistics || {}) }
    };
  }

  // Save behavior data to localStorage
  saveBehaviorData() {
    try {
      // Clean old data before saving
      this.cleanOldData();
      localStorage.setItem("userBehaviorData", JSON.stringify(this.behaviorData));
    } catch (error) {
      console.error("Failed to save behavior data:", error);
    }
  }

  // Clean old data to prevent storage bloat
  cleanOldData() {
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
    const cutoff = Date.now() - maxAge;

    // Clean old interactions
    this.behaviorData.interactions = this.behaviorData.interactions
      .filter((interaction) => interaction.timestamp > cutoff)
      .slice(-this.config.maxBehaviorHistory);

    // Clean old sessions
    this.behaviorData.sessions = this.behaviorData.sessions
      .filter((session) => session.startTime > cutoff)
      .slice(-100); // Keep last 100 sessions
  }
  // Setup event tracking for user interactions
  setupEventTracking() {
    // Track when users skip tracks via playback monitoring
    if (this.spotifyAPI) {
      this.spotifyAPI.setPlaybackCallback((playback) => {
        this.handlePlaybackUpdate(playback);
      });
    }
  }

  // Ensure AI generator is ready before using it
  async ensureAIReady() {
    if (!this.aiGenerator) return false;

    // Wait for up to 3 seconds for AI to initialize
    const maxWaitTime = 3000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      if (this.aiGenerator.hasApiKey !== undefined) {
        return true;
      }
      // Wait 100ms before checking again
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return false;
  }

  // Handle playback state updates to detect skips and listening patterns
  handlePlaybackUpdate(playback) {
    if (!this.config.learningEnabled) return;

    const now = Date.now();
    const newTrack = playback ? playback.item : null;
    const newProgressMs = playback ? playback.progress_ms : 0;

    // Check if the track has changed or playback has stopped
    if (this.currentTrack) {
      // A track was previously playing
      if (!newTrack || (newTrack && newTrack.id !== this.currentTrack.id)) {
        // Scenario 1: Playback stopped (newTrack is null)
        // Scenario 2: Track changed (newTrack.id is different)
        console.log(
          `🔄 BehaviorTracker: Track changed or stopped. Analyzing previous track: ${this.currentTrack.name}`
        );
        // For a naturally completed track, progress should be its duration.
        // If playback stopped, lastProgressMs might be the point it stopped.
        // If a new track started, the previous one completed.
        const completionProgressMs =
          (!newTrack || (newTrack && newTrack.id !== this.currentTrack.id)) &&
          this.lastProgressMs >= this.currentTrack.duration_ms - 5000 // Allow 5s buffer for end
            ? this.currentTrack.duration_ms
            : this.lastProgressMs;

        this.analyzeTrackCompletion(this.currentTrack, this.trackStartTime, completionProgressMs);
      }
    }

    // Update current track info
    if (newTrack) {
      if (!this.currentTrack || newTrack.id !== this.currentTrack.id) {
        // This is a new track starting
        console.log(`🔄 BehaviorTracker: New track started: ${newTrack.name}`);
        this.currentTrack = newTrack;
        this.trackStartTime = now;
      }
      this.lastProgressMs = newProgressMs; // Always update progress for the current (or new) track
    } else {
      // Playback stopped, and no new track
      if (this.currentTrack) {
        // This means the previously playing track just ended and playback stopped.
        // analyzeTrackCompletion was called above.
        console.log(
          `🔄 BehaviorTracker: Playback stopped. Last track was: ${this.currentTrack.name}`
        );
      }
      this.currentTrack = null;
      this.trackStartTime = 0;
      this.lastProgressMs = 0;
    }

    // Log playback event (if there's a track)
    if (newTrack) {
      this.currentSession.playbackEvents.push({
        timestamp: now,
        trackId: newTrack.id,
        progressMs: newProgressMs,
        isPlaying: playback.is_playing
      });
    }
  }
  // Analyze how user interacted with a track (skip, like, complete)
  analyzeTrackCompletion(track, startTime, lastProgressMs) {
    if (!track) return;
    console.log(
      `🔄 BehaviorTracker: Analyzing track completion for "${track.name}". Start: ${startTime}, LastProgress: ${lastProgressMs}, Duration: ${track.duration_ms}`
    );

    const listenDuration = Date.now() - startTime; // This might be slightly off if polling is delayed
    // but lastProgressMs is more accurate for ratio.

    // Ensure lastProgressMs does not exceed track duration for ratio calculation
    const effectiveProgressMs = Math.min(lastProgressMs, track.duration_ms);
    const progressRatio = track.duration_ms > 0 ? effectiveProgressMs / track.duration_ms : 0;

    console.log(
      `🔄 BehaviorTracker: Calculated progressRatio: ${progressRatio} (effectiveProgressMs: ${effectiveProgressMs})`
    );

    const interaction = {
      timestamp: Date.now(),
      trackId: track.id,
      trackInfo: {
        name: track.name,
        artists: track.artists.map((a) => a.name),
        album: track.album.name,
        genres: this.extractGenresFromTrack(track), // Extract genres safely
        audioFeatures: null, // Will be fetched later
        popularity: track.popularity || 50, // Default popularity if missing
        duration_ms: track.duration_ms
      },
      listenDuration,
      progressRatio,
      behavior: this.categorizeBehavior(progressRatio),
      context: this.getCurrentContext()
    };

    this.recordInteraction(interaction);
    this.updatePreferences(interaction);
  }

  // Categorize user behavior based on listening patterns
  categorizeBehavior(progressRatio) {
    if (progressRatio < this.config.skipThreshold) {
      return "skip";
    } else if (progressRatio > this.config.likeThreshold) {
      return "like";
    } else {
      return "partial";
    }
  }

  // Get current context (time of day, playlist type, etc.)
  getCurrentContext() {
    const now = new Date();
    return {
      timeOfDay: this.getTimeOfDayCategory(now.getHours()),
      dayOfWeek: now.getDay(),
      hour: now.getHours(),
      playlistContext: this.currentPlaylistContext || "unknown"
    };
  }

  getTimeOfDayCategory(hour) {
    if (hour >= 6 && hour < 12) return "morning";
    if (hour >= 12 && hour < 17) return "afternoon";
    if (hour >= 17 && hour < 22) return "evening";
    return "night";
  }

  // Record user interaction
  recordInteraction(interaction) {
    this.behaviorData.interactions.push(interaction);
    this.currentSession.interactions.push(interaction);

    // Update statistics
    this.behaviorData.statistics.totalTracks++;
    if (interaction.behavior === "skip") {
      this.behaviorData.statistics.totalSkips++;
    } else if (interaction.behavior === "like") {
      this.behaviorData.statistics.totalLikes++;
    }

    // Calculate running average listen time based on actual content listened to
    const { avgListenTime, totalTracks } = this.behaviorData.statistics;
    // Ensure trackInfo and its properties are available
    const actualPlayTimeMs =
      interaction.trackInfo?.duration_ms && typeof interaction.progressRatio === "number"
        ? interaction.trackInfo.duration_ms * interaction.progressRatio
        : interaction.listenDuration; // Fallback to listenDuration if data is incomplete

    this.behaviorData.statistics.avgListenTime =
      (avgListenTime * (totalTracks - 1) + actualPlayTimeMs) / totalTracks;

    this.saveBehaviorData();
  }
  // Update user preferences based on interaction
  updatePreferences(interaction) {
    const { preferences } = this.behaviorData;
    const { trackInfo, behavior, context } = interaction;

    // Safety check for trackInfo
    if (!trackInfo) {
      console.warn("🚨 BehaviorTracker: trackInfo is missing, skipping preference update");
      return;
    }

    // Weight for preference updates (likes = +2, partials = +1, skips = -1)
    const weight = behavior === "like" ? 2 : behavior === "partial" ? 1 : -1;

    // Update artist preferences - safely extract artist names
    const artists = trackInfo.artists || [];
    artists.forEach((artist) => {
      const artistName = typeof artist === "string" ? artist : artist.name;
      if (artistName) {
        preferences.artists[artistName] = (preferences.artists[artistName] || 0) + weight;
      }
    });

    // Update genre preferences - use extractGenresFromTrack method
    const genres = this.extractGenresFromTrack(trackInfo);
    genres.forEach((genre) => {
      preferences.genres[genre] = (preferences.genres[genre] || 0) + weight;
    });

    // Update time of day preferences
    const timeKey = context?.timeOfDay || "unknown";
    if (!preferences.timeOfDay[timeKey]) {
      preferences.timeOfDay[timeKey] = { likes: 0, skips: 0, partials: 0 };
    }
    preferences.timeOfDay[timeKey][behavior]++; // Energy preference (simplified) - use default popularity if not available
    const popularity = trackInfo.popularity || 50;
    if (popularity > 70) {
      preferences.energy.high += weight;
    } else if (popularity > 40) {
      preferences.energy.medium += weight;
    } else {
      preferences.energy.low += weight;
    }
  }

  // Manually track user actions (for explicit feedback)
  trackSkip(trackInfo, reason = "manual") {
    const interaction = {
      timestamp: Date.now(),
      trackId: trackInfo.id,
      trackInfo,
      listenDuration: 0,
      progressRatio: 0,
      behavior: "skip",
      context: this.getCurrentContext(),
      explicit: true,
      reason
    };

    this.recordInteraction(interaction);
    this.updatePreferences(interaction);
  }

  trackLike(trackInfo, reason = "manual") {
    const interaction = {
      timestamp: Date.now(),
      trackId: trackInfo.id,
      trackInfo,
      listenDuration: trackInfo.duration_ms,
      progressRatio: 1.0,
      behavior: "like",
      context: this.getCurrentContext(),
      explicit: true,
      reason
    };

    this.recordInteraction(interaction);
    this.updatePreferences(interaction);
  }

  trackRemoval(trackInfo, reason = "removed_from_playlist") {
    this.trackSkip(trackInfo, reason);
  }

  // Generate insights from behavior data
  async generateInsights() {
    const insights = {
      preferredGenres: this.getTopPreferences("genres", 5),
      preferredArtists: this.getTopPreferences("artists", 10),
      skipPatterns: this.analyzeSkipPatterns(),
      timePreferences: this.analyzeTimePreferences(),
      energyPreference: this.analyzeEnergyPreference(),
      recommendations: await this.generateRecommendations(),
      lastUpdated: Date.now()
    };

    this.behaviorData.insights = insights;
    this.saveBehaviorData();

    return insights;
  }

  getTopPreferences(category, limit) {
    const prefs = this.behaviorData.preferences[category];
    return Object.entries(prefs)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .filter(([, score]) => score > 0)
      .map(([name, score]) => ({ name, score }));
  }

  analyzeSkipPatterns() {
    const recentInteractions = this.behaviorData.interactions.slice(-200);
    const skippedTracks = recentInteractions.filter((i) => i.behavior === "skip"); // Find common patterns in skipped tracks
    const skipReasons = {};

    skippedTracks.forEach((interaction) => {
      // Analyze common characteristics of skipped tracks
      const { trackInfo } = interaction;

      // Safety check for trackInfo
      if (!trackInfo) return;

      // Low popularity songs get skipped more
      if (trackInfo.popularity && trackInfo.popularity < 30) {
        skipReasons["lowPopularity"] = (skipReasons["lowPopularity"] || 0) + 1;
      }

      // Genre-based skipping - use extractGenresFromTrack method
      const genres = this.extractGenresFromTrack(trackInfo);
      genres.forEach((genre) => {
        skipReasons[`genre:${genre}`] = (skipReasons[`genre:${genre}`] || 0) + 1;
      });
    });

    return Object.entries(skipReasons)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([reason, count]) => ({
        reason,
        count,
        percentage: (count / skippedTracks.length) * 100
      }));
  }

  analyzeTimePreferences() {
    const timeData = this.behaviorData.preferences.timeOfDay;
    const preferences = {};

    Object.entries(timeData).forEach(([time, data]) => {
      const total = data.likes + data.partials + data.skips;
      if (total > 0) {
        preferences[time] = {
          likeRatio: data.likes / total,
          skipRatio: data.skips / total,
          engagement: total,
          preference: data.likes > data.skips ? "positive" : "negative"
        };
      }
    });

    return preferences;
  }

  analyzeEnergyPreference() {
    const { energy } = this.behaviorData.preferences;
    const total = Math.abs(energy.high) + Math.abs(energy.medium) + Math.abs(energy.low);

    if (total === 0)
      return { preference: "unknown", confidence: 0, scores: { high: 0, medium: 0, low: 0 } }; // Added scores for consistency

    const scores = {
      high: energy.high / total,
      medium: energy.medium / total,
      low: energy.low / total
    };

    const preferred = Object.entries(scores).reduce((a, b) =>
      scores[a[0]] > scores[b[0]] ? a : b
    );

    return {
      preference: preferred[0],
      confidence: Math.abs(preferred[1]),
      scores
    };
  } // Generate AI-powered recommendations based on behavior
  async generateRecommendations() {
    if (!this.aiGenerator || !this.config.learningEnabled) {
      return this.generateAlgorithmicRecommendations();
    }

    // Check if AI is actually configured before attempting to use it
    // Wait a moment for AI generator to finish initialization if needed
    await this.ensureAIReady();

    if (!this.aiGenerator.hasApiKey) {
      console.log("🎵 Using algorithmic recommendations (AI not configured)");
      return this.generateAlgorithmicRecommendations();
    }

    try {
      const behaviorSummary = this.createBehaviorSummary();
      const prompt = this.createRecommendationPrompt(behaviorSummary);

      const response = await this.aiGenerator.makeAIRequest(prompt);
      return this.parseAIRecommendations(response);
    } catch (error) {
      console.log("🎵 AI recommendations failed, using algorithmic fallback");
      return this.generateAlgorithmicRecommendations();
    }
  }

  createBehaviorSummary() {
    const { statistics, preferences } = this.behaviorData;

    return {
      totalTracks: statistics.totalTracks,
      skipRatio: statistics.totalTracks > 0 ? statistics.totalSkips / statistics.totalTracks : 0,
      likeRatio: statistics.totalTracks > 0 ? statistics.totalLikes / statistics.totalTracks : 0,
      avgListenTime: statistics.avgListenTime,
      topGenres: this.getTopPreferences("genres", 5),
      topArtists: this.getTopPreferences("artists", 5),
      energyPreference: this.analyzeEnergyPreference(),
      timePreferences: this.analyzeTimePreferences()
    };
  }

  createRecommendationPrompt(summary) {
    return `Based on the following user listening behavior, provide recommendations for improving playlist generation:

User Statistics:
- Total tracks heard: ${summary.totalTracks}
- Skip ratio: ${(summary.skipRatio * 100).toFixed(1)}%
- Like ratio: ${(summary.likeRatio * 100).toFixed(1)}%
- Average listen time: ${Math.round(summary.avgListenTime / 1000)}s

Preferred Genres: ${summary.topGenres.map((g) => g.name).join(", ")}
Preferred Artists: ${summary.topArtists.map((a) => a.name).join(", ")}
Energy Preference: ${summary.energyPreference.preference} (${(
      summary.energyPreference.confidence * 100
    ).toFixed(1)}% confidence)

Please provide:
1. 3 specific recommendations for playlist improvement
2. Suggested discovery level (0-100, where 0=familiar, 100=adventurous)
3. Recommended playlist characteristics
4. Time-based listening patterns to consider

Respond in JSON format:
{
  "recommendations": ["rec1", "rec2", "rec3"],
  "discoveryLevel": 50,
  "characteristics": ["characteristic1", "characteristic2"],
  "timePatterns": {"morning": "advice", "evening": "advice"}
}`;
  }

  parseAIRecommendations(response) {
    try {
      const cleaned = this.aiGenerator.cleanJSONResponse(response);
      return JSON.parse(cleaned);
    } catch (error) {
      console.warn("Failed to parse AI recommendations:", error);
      return this.generateAlgorithmicRecommendations();
    }
  }

  generateAlgorithmicRecommendations() {
    const { statistics } = this.behaviorData;
    const insights = this.behaviorData.insights || {};

    const recommendations = [];

    // High skip ratio recommendations
    if (statistics.totalTracks > 10 && statistics.totalSkips / statistics.totalTracks > 0.4) {
      recommendations.push("Reduce discovery level - you're skipping many new tracks");
      recommendations.push("Focus more on your preferred artists and genres");
    }

    // Low engagement recommendations
    if (statistics.totalLikes / statistics.totalTracks < 0.2) {
      recommendations.push("Try more variety in energy levels and genres");
    }

    // Based on energy preferences
    const energyPref = this.analyzeEnergyPreference();
    if (energyPref.confidence > 0.6) {
      recommendations.push(
        `Focus on ${energyPref.preference} energy tracks based on your preferences`
      );
    }

    return {
      recommendations: recommendations.slice(0, 3),
      discoveryLevel: this.calculateOptimalDiscoveryLevel(),
      characteristics: this.getRecommendedCharacteristics(),
      timePatterns: this.getTimeBasedRecommendations()
    };
  }

  calculateOptimalDiscoveryLevel() {
    const { statistics } = this.behaviorData;

    if (statistics.totalTracks < 10) return 30; // Default for new users

    const skipRatio = statistics.totalSkips / statistics.totalTracks;
    const likeRatio = statistics.totalLikes / statistics.totalTracks;

    // Higher skip ratio = lower discovery level
    // Higher like ratio = higher discovery level
    let discoveryLevel = 50 - skipRatio * 40 + likeRatio * 30;

    return Math.max(10, Math.min(90, Math.round(discoveryLevel)));
  }

  getRecommendedCharacteristics() {
    const topGenres = this.getTopPreferences("genres", 3);
    const energyPref = this.analyzeEnergyPreference();

    const characteristics = [];

    if (topGenres.length > 0) {
      characteristics.push(`Include ${topGenres[0].name} music`);
    }

    if (energyPref.preference !== "unknown") {
      characteristics.push(`Prefer ${energyPref.preference} energy tracks`);
    }

    return characteristics;
  }

  getTimeBasedRecommendations() {
    const timePrefs = this.analyzeTimePreferences();
    const recommendations = {};

    Object.entries(timePrefs).forEach(([time, data]) => {
      if (data.engagement > 5) {
        // Only if we have enough data
        if (data.likeRatio > 0.6) {
          recommendations[time] = `You seem to enjoy music during ${time}. Keep it up!`;
        } else if (data.skipRatio > 0.6) {
          recommendations[
            time
          ] = `You skip a lot during ${time}. Maybe try different genres or moods?`;
        }
      }
    });

    return recommendations;
  }

  // Get current behavior insights for UI display
  getInsights() {
    return this.behaviorData.insights;
  }

  // Get learning statistics for UI display
  getStatistics() {
    return {
      ...this.behaviorData.statistics,
      sessionsCount: this.behaviorData.sessions.length,
      dataPoints: this.behaviorData.interactions.length,
      optimalDiscoveryLevel: this.calculateOptimalDiscoveryLevel()
    };
  }

  // Apply behavior insights to playlist generation
  enhancePlaylistGeneration(originalConcept) {
    if (!this.config.learningEnabled) return originalConcept;

    const insights = this.behaviorData.insights;
    const enhanced = { ...originalConcept };

    // Enhance with preferred artists
    if (insights.preferredArtists && insights.preferredArtists.length > 0) {
      const topArtists = insights.preferredArtists.slice(0, 3).map((a) => a.name);
      enhanced.suggestedArtists = [...(enhanced.suggestedArtists || []), ...topArtists];
    }

    // Enhance with preferred genres
    if (insights.preferredGenres && insights.preferredGenres.length > 0) {
      const topGenres = insights.preferredGenres.slice(0, 2).map((g) => g.name);
      enhanced.suggestedGenres = [...(enhanced.suggestedGenres || []), ...topGenres];
    }

    // Adjust energy level based on preferences
    const energyPref = this.analyzeEnergyPreference();
    if (energyPref.confidence > 0.5) {
      enhanced.energyLevel = energyPref.preference;
    }

    // Adjust length based on listening patterns
    if (this.behaviorData.statistics.avgListenTime > 0) {
      const avgTrackLength = this.behaviorData.statistics.avgListenTime;
      if (avgTrackLength < 120000) {
        // < 2 minutes average
        enhanced.length = Math.max(15, (enhanced.length || 25) - 5); // Shorter playlists
      }
    }

    return enhanced;
  }

  // Set current playlist context for better tracking
  setPlaylistContext(context) {
    this.currentPlaylistContext = context;
  }

  // Enable/disable learning
  setLearningEnabled(enabled) {
    this.config.learningEnabled = enabled;
    this.saveBehaviorData();
  }

  isLearningEnabled() {
    return this.config.learningEnabled;
  }

  // Enable/disable auto-adaptation
  setAutoAdaptEnabled(enabled) {
    this.config.autoAdaptEnabled = enabled;
    this.saveBehaviorData();

    if (enabled) {
      console.log("🎵 Auto-Adapt Mode enabled - playlist will adapt to your listening patterns");
    } else {
      console.log("🎵 Auto-Adapt Mode disabled");
    }
  }

  isAutoAdaptEnabled() {
    return this.config.autoAdaptEnabled && this.config.learningEnabled;
  }

  // Start a new session
  startSession() {
    // Save previous session
    if (this.currentSession.interactions.length > 0) {
      this.behaviorData.sessions.push({
        ...this.currentSession,
        endTime: Date.now(),
        duration: Date.now() - this.currentSession.startTime
      });

      this.behaviorData.statistics.sessionsCount++;
      this.saveBehaviorData();
    }

    // Start new session
    this.currentSession = {
      startTime: Date.now(),
      interactions: [],
      playbackEvents: []
    };
  }

  // End current session
  endSession() {
    if (this.currentSession.interactions.length > 0) {
      this.behaviorData.sessions.push({
        ...this.currentSession,
        endTime: Date.now(),
        duration: Date.now() - this.currentSession.startTime
      });

      this.behaviorData.statistics.sessionsCount++;
      this.saveBehaviorData();
    }

    this.currentSession = {
      startTime: Date.now(),
      interactions: [],
      playbackEvents: []
    };
  }

  // Export behavior data for analysis
  exportData() {
    return {
      ...this.behaviorData,
      currentSession: this.currentSession,
      config: this.config
    };
  }

  // Clear all behavior data (for privacy)
  clearAllData() {
    this.behaviorData = this.loadBehaviorData();
    this.currentSession = {
      startTime: Date.now(),
      interactions: [],
      playbackEvents: []
    };
    localStorage.removeItem("userBehaviorData");
  }

  // AUTO-ADAPTATION METHODS

  // Main auto-adaptation handler called when user skips
  async handleAutoAdaptation(skippedTrack, currentPlaylist, reason = "manual_skip") {
    console.log("🔄 BehaviorTracker: handleAutoAdaptation called with:", {
      skippedTrackName: skippedTrack?.name,
      playlistName: currentPlaylist?.playlist?.name,
      reason
    });

    if (!this.isAutoAdaptEnabled()) {
      console.log("🔄 BehaviorTracker: Auto-Adapt is NOT enabled. Exiting handleAutoAdaptation.");
      return null;
    }
    if (!currentPlaylist) {
      console.log("🔄 BehaviorTracker: No current playlist. Exiting handleAutoAdaptation.");
      return null;
    }
    if (!skippedTrack || !skippedTrack.id) {
      // Ensure skippedTrack is a valid track object
      console.log("🔄 BehaviorTracker: No valid skipped track. Exiting handleAutoAdaptation.");
      return null;
    }

    // Check cooldown and session limits
    if (!this.canPerformAdaptation()) {
      console.log(
        "🔄 BehaviorTracker: Cannot perform adaptation due to cooldown or session limits. Exiting handleAutoAdaptation."
      );
      return null;
    }

    // Create a trackInfo object for the skipped track, similar to analyzeTrackCompletion
    // This ensures calculateTrackSimilarity receives the correct structure for track1
    const skippedTrackInfo = {
      id: skippedTrack.id,
      name: skippedTrack.name,
      artists: skippedTrack.artists?.map((a) => a.name) || [],
      album: skippedTrack.album?.name,
      genres: this.extractGenresFromTrack(skippedTrack),
      popularity: skippedTrack.popularity || 50,
      duration_ms: skippedTrack.duration_ms
    };
    console.log("🔄 BehaviorTracker: Created skippedTrackInfo for adaptation:", skippedTrackInfo);

    try {
      console.log(`🔄 Auto-adapting playlist based on skip: ${skippedTrackInfo.name}`);

      const adaptationActions = await this.calculateAdaptationActions(
        skippedTrackInfo, // Pass the processed trackInfo
        currentPlaylist,
        reason
      );

      console.log("🔄 BehaviorTracker: Calculated adaptationActions:", adaptationActions);

      if (adaptationActions.remove.length > 0 || adaptationActions.add.length > 0) {
        this.adaptationState.lastAdaptationTime = Date.now();
        this.adaptationState.adaptationsThisSession++;
        console.log("🔄 BehaviorTracker: Adaptation performed. New state:", this.adaptationState);
        return adaptationActions;
      } else {
        console.log("🔄 BehaviorTracker: No adaptation actions generated.");
      }
    } catch (error) {
      console.error("🚨 BehaviorTracker: Auto-adaptation failed in handleAutoAdaptation:", error);
    }

    return null;
  }

  // Check if adaptation can be performed (cooldown, limits, etc.)
  canPerformAdaptation() {
    const now = Date.now();
    const timeSinceLastAdaptation = now - this.adaptationState.lastAdaptationTime;
    const cooldownMet = timeSinceLastAdaptation >= this.config.adaptationCooldown;
    const sessionLimitMet =
      this.adaptationState.adaptationsThisSession < this.config.maxAdaptationsPerSession;

    console.log("🔄 BehaviorTracker: canPerformAdaptation checks:", {
      now,
      lastAdaptationTime: this.adaptationState.lastAdaptationTime,
      timeSinceLastAdaptation,
      adaptationCooldown: this.config.adaptationCooldown,
      cooldownMet,
      adaptationsThisSession: this.adaptationState.adaptationsThisSession,
      maxAdaptationsPerSession: this.config.maxAdaptationsPerSession,
      sessionLimitMet,
      result: cooldownMet && sessionLimitMet
    });

    return cooldownMet && sessionLimitMet;
  }

  // Calculate what tracks to remove and add based on user behavior
  async calculateAdaptationActions(skippedTrackInfo, currentPlaylist, reason) {
    // Renamed parameter
    console.log("🔄 BehaviorTracker: calculateAdaptationActions called with:", {
      skippedTrackName: skippedTrackInfo?.name, // Use info object
      playlistName: currentPlaylist?.playlist?.name,
      reason
    });
    const actions = {
      remove: [],
      add: [],
      reasoning: []
    };

    // Step 1: Find similar tracks to remove based on skip patterns
    const tracksToRemove = await this.findSimilarTracksToRemove(skippedTrackInfo, currentPlaylist); // Pass info object
    console.log("🔄 BehaviorTracker: Tracks found to remove:", tracksToRemove);

    // Step 2: Generate replacement tracks based on user preferences
    const tracksToAdd = await this.generateReplacementTracks(
      skippedTrackInfo, // Pass info object
      currentPlaylist,
      tracksToRemove.length // Pass how many were removed to potentially replace them
    );
    console.log("🔄 BehaviorTracker: Tracks generated to add:", tracksToAdd);

    actions.remove = tracksToRemove;
    actions.add = tracksToAdd;
    actions.reasoning = this.buildAdaptationReasoning(
      skippedTrackInfo,
      tracksToRemove,
      tracksToAdd
    ); // Pass info object

    return actions;
  }

  // Find tracks similar to the skipped track that should be removed
  async findSimilarTracksToRemove(skippedTrackInfo, currentPlaylist) {
    // Renamed parameter
    console.log(
      "🔄 BehaviorTracker: findSimilarTracksToRemove called for skipped track:",
      skippedTrackInfo?.name // Use info object
    );
    const tracksToRemove = [];
    const tracks = currentPlaylist.tracks || [];

    // Don't remove too many tracks
    const maxToRemove = Math.max(1, Math.min(3, Math.floor(tracks.length * 0.3)));
    console.log("🔄 BehaviorTracker: Max tracks to remove:", maxToRemove);

    // Check if playlist would have enough tracks left
    if (tracks.length - maxToRemove < this.config.minTracksBeforeAdaptation) {
      console.log(
        `🔄 Auto-Adapt: Playlist too short (current: ${tracks.length}, maxRemove: ${maxToRemove}, minAfterAdapt: ${this.config.minTracksBeforeAdaptation}). Cannot remove tracks.`
      );
      return []; // Don't remove if it would make playlist too small
    }

    // Get user's skip patterns to understand what they don't like
    const skipPatterns = this.analyzeSkipPatterns();
    console.log("🔄 BehaviorTracker: Analyzed skip patterns:", skipPatterns);

    for (const track of tracks) {
      if (tracksToRemove.length >= maxToRemove) {
        console.log("🔄 BehaviorTracker: Reached maxToRemove limit.");
        break;
      }
      if (track.id === skippedTrackInfo.id) {
        // Use info object's id
        console.log(`🔄 BehaviorTracker: Skipping the already skipped track: ${track.name}`);
        continue;
      }

      // Check similarity based on multiple factors
      // track1 (skippedTrackInfo) is already in trackInfo format
      // track2 (track from playlist) is a raw Spotify track object
      const similarity = this.calculateTrackSimilarity(skippedTrackInfo, track);
      console.log(
        `🔄 BehaviorTracker: Similarity between "${skippedTrackInfo.name}" and "${track.name}": ${similarity}` // Use info object
      );

      if (similarity >= this.config.similarityThreshold) {
        // Additional check: has this type of track been skipped before?
        const skipLikelihood = this.calculateSkipLikelihood(track, skipPatterns);
        console.log(`🔄 BehaviorTracker: Skip likelihood for "${track.name}": ${skipLikelihood}`);

        if (skipLikelihood > 0.6) {
          tracksToRemove.push({
            track: track,
            reason: `High skip likelihood (${(skipLikelihood * 100).toFixed(
              0
            )}%) and similar (similarity: ${similarity.toFixed(2)}) to skipped track.`,
            skipLikelihood: skipLikelihood,
            similarity: similarity
          });
          console.log(`🔄 BehaviorTracker: Marked "${track.name}" for removal.`);
        }
      }
    }

    return tracksToRemove.sort((a, b) => b.skipLikelihood - a.skipLikelihood);
  }
  // Calculate similarity between two tracks
  calculateTrackSimilarity(track1Info, track2Raw) {
    // Renamed parameters for clarity
    // track1Info is the skippedTrack's processed trackInfo
    // track2Raw is a raw track object from the current playlist
    // console.log("🔄 BehaviorTracker: calculateTrackSimilarity INPUTS:"); // Reduced verbosity
    // console.log("Track 1 (skippedTrack.trackInfo):", track1Info);
    // console.log("Track 2 (playlistTrack - raw):", track2Raw);

    let similarity = 0;
    let factors = 0;
    const details = {
      track1Name: track1Info?.name,
      track2Name: track2Raw?.name,
      artistSimilarityScore: 0,
      albumSimilarityScore: 0,
      genreSimilarityScore: 0,
      popularitySimilarityScore: 0,
      finalSimilarity: 0
    };

    // Artist similarity (highest weight)
    const track1Artists = track1Info.artists || []; // Array of names from trackInfo
    const track2ArtistObjs = track2Raw.artists || []; // Likely array of artist objects
    const track2Artists = track2ArtistObjs
      .map((artist) =>
        typeof artist === "string" ? artist.toLowerCase() : artist?.name?.toLowerCase()
      )
      .filter((name) => name);

    const commonArtists = track1Artists.filter((a1Name) =>
      track2Artists.includes(a1Name.toLowerCase())
    );
    if (commonArtists.length > 0) {
      similarity += 0.4; // Base score for any common artist
      details.artistSimilarityScore = 0.4;
      factors++;
    }
    // console.log("Artist comparison:", { // Reduced verbosity
    //   track1Artists,
    //   track2Artists,
    //   commonArtists,
    //   score: details.artistSimilarityScore
    // });

    // Album similarity
    const track1AlbumName = track1Info.album?.toLowerCase(); // trackInfo.album is just a name
    const track2AlbumName = track2Raw.album?.name?.toLowerCase(); // track2Raw.album is an object
    if (track1AlbumName && track2AlbumName && track1AlbumName === track2AlbumName) {
      similarity += 0.3;
      details.albumSimilarityScore = 0.3;
      factors++;
    }
    // console.log("Album comparison:", { // Reduced verbosity
    //   track1AlbumName,
    //   track2AlbumName,
    //   score: details.albumSimilarityScore
    // });

    // Genre similarity (if available)
    const track1Genres = track1Info.genres || []; // From extractGenresFromTrack on skippedTrackInfo
    const track2Genres = this.extractGenresFromTrack(track2Raw); // Extract genres for track2Raw

    if (track1Genres.length > 0 && track2Genres.length > 0) {
      const commonGenres = track1Genres.filter((g) => track2Genres.includes(g.toLowerCase())); // ensure comparison is case-insensitive
      if (commonGenres.length > 0) {
        const genreSimValue =
          0.2 * (commonGenres.length / Math.max(track1Genres.length, track2Genres.length));
        similarity += genreSimValue;
        details.genreSimilarityScore = genreSimValue;
        factors++;
      }
    }
    // console.log("Genre comparison:", { // Reduced verbosity
    //   track1Genres,
    //   track2Genres,
    //   score: details.genreSimilarityScore
    // });

    // Popularity similarity
    const track1Popularity = track1Info.popularity;
    const track2Popularity = track2Raw.popularity;
    if (typeof track1Popularity === "number" && typeof track2Popularity === "number") {
      const popularityDiff = Math.abs(track1Popularity - track2Popularity);
      if (popularityDiff < 20) {
        // Similar popularity
        similarity += 0.1;
        details.popularitySimilarityScore = 0.1;
        factors++;
      }
    }
    // console.log("Popularity comparison:", { // Reduced verbosity
    //   track1Popularity,
    //   track2Popularity,
    //   score: details.popularitySimilarityScore
    // });

    details.finalSimilarity = factors > 0 ? Math.min(similarity, 1.0) : 0; // Cap similarity at 1.0
    // console.log("🔄 BehaviorTracker: calculateTrackSimilarity details:", details); // Reduced verbosity
    return details.finalSimilarity;
  }

  // Calculate likelihood that user would skip this track
  calculateSkipLikelihood(track, skipPatterns) {
    let skipScore = 0;
    const reasons = [];

    // Check against known skip patterns
    for (const pattern of skipPatterns) {
      if (pattern.reason.includes("genre:")) {
        const genre = pattern.reason.replace("genre:", "");
        if (this.extractGenresFromTrack(track).includes(genre)) {
          // Use helper here
          skipScore += pattern.percentage / 100;
          reasons.push(
            `Matches skipped genre pattern: ${genre} (${pattern.percentage.toFixed(0)}%)`
          );
        }
      }

      if (pattern.reason === "lowPopularity" && track.popularity < 30) {
        skipScore += pattern.percentage / 100;
        reasons.push(`Matches low popularity skip pattern (${pattern.percentage.toFixed(0)}%)`);
      }
    } // Check against user's negative preferences
    // Safely extract artist names handling both string and object formats
    const getArtistName = (artist) => (typeof artist === "string" ? artist : artist?.name || "");
    const artists = track.artists?.map(getArtistName).filter((name) => name) || [];

    for (const artist of artists) {
      const artistScore = this.behaviorData.preferences.artists[artist] || 0;
      if (artistScore < -5) {
        // Negative preference
        skipScore += 0.3;
        reasons.push(`Negative preference for artist: ${artist} (score: ${artistScore})`);
      }
    }
    const finalSkipScore = Math.min(skipScore, 1.0);
    console.log(`🔄 BehaviorTracker: calculateSkipLikelihood for "${track?.name}":`, {
      finalSkipScore,
      reasons
    });
    return finalSkipScore; // Cap at 100%
  }

  // Generate replacement tracks based on user preferences
  async generateReplacementTracks(skippedTrackInfo, currentPlaylist, numRemoved = 0) {
    // Renamed parameter
    const baseNumToAdd = Math.min(2, Math.max(1, 5 - (currentPlaylist.tracks?.length || 0)));
    const numToAdd = Math.max(baseNumToAdd, numRemoved); // Try to replace at least as many as were removed, up to a reasonable limit
    console.log(
      `🔄 BehaviorTracker: generateReplacementTracks called. Skipped: "${skippedTrackInfo?.name}", Playlist items: ${currentPlaylist.tracks?.length}, Num removed: ${numRemoved}, Aiming to add: ${numToAdd}` // Use info object
    );

    if (numToAdd <= 0) {
      console.log("🔄 BehaviorTracker: No tracks to add (numToAdd is 0 or less).");
      return [];
    }

    let newTracksFormatted = []; // Store formatted tracks { track, reason, confidence }
    // This set will keep track of all IDs that should not be added:
    // 1. Tracks already in the playlist.
    // 2. The track that was just skipped.
    // 3. Tracks already selected to be added in this current adaptation action.
    const idsToExclude = new Set((currentPlaylist.tracks || []).map((t) => t.id));
    if (skippedTrackInfo) {
      // Use info object
      idsToExclude.add(skippedTrackInfo.id); // Ensure skipped track isn't re-added
    }

    // Try AI-driven suggestions first
    if (this.aiGenerator && this.config.learningEnabled && newTracksFormatted.length < numToAdd) {
      await this.ensureAIReady(); // Ensure AI generator is initialized
      if (this.aiGenerator.hasApiKey) {
        try {
          const insights = await this.generateInsights(); // Get fresh insights
          console.log("🔄 BehaviorTracker: Fresh insights for AI track generation:", insights);
          const aiSuggestedSpotifyTracks = await this.aiGenerator.generateAISuggestedTracks(
            insights, // Pass full insights object
            idsToExclude, // Pass current set of IDs to exclude
            numToAdd - newTracksFormatted.length // Request only the remaining needed tracks
          );
          console.log("🔄 BehaviorTracker: AI suggested Spotify tracks:", aiSuggestedSpotifyTracks);

          if (aiSuggestedSpotifyTracks.length > 0) {
            aiSuggestedSpotifyTracks.forEach((track) => {
              if (newTracksFormatted.length < numToAdd && !idsToExclude.has(track.id)) {
                newTracksFormatted.push({
                  track: track,
                  reason: "AI recommended based on your preferences",
                  confidence: this.calculateTrackFitScore(track)
                });
                idsToExclude.add(track.id); // Add to exclude set to prevent re-adding
              }
            });
            console.log(
              `🤖 BehaviorTracker: AI selected ${newTracksFormatted.length} track(s) so far.`
            );
          }
        } catch (aiError) {
          console.warn("🚨 BehaviorTracker: AI track replacement generation failed:", aiError);
        }
      } else {
        console.log("🎵 BehaviorTracker: AI not configured, using algorithmic track replacement.");
      }
    }

    // Fallback to algorithmic suggestions if AI didn't provide enough or is unavailable
    if (newTracksFormatted.length < numToAdd) {
      console.log(
        `⚙️ BehaviorTracker: Using algorithmic track replacement. Need ${
          numToAdd - newTracksFormatted.length
        } more tracks.`
      );
      try {
        const searchCriteria = this.buildSearchCriteriaFromPreferences();
        console.log("⚙️ BehaviorTracker: Algorithmic search criteria:", searchCriteria);
        // Pass the updated idsToExclude set
        const algorithmicTracks = await this.searchForBetterTracks(
          searchCriteria,
          numToAdd - newTracksFormatted.length, // Request only the remaining needed tracks
          idsToExclude // Pass the comprehensive set of IDs to exclude
        );
        console.log("⚙️ BehaviorTracker: Algorithmic tracks found:", algorithmicTracks);

        algorithmicTracks.forEach((track) => {
          if (newTracksFormatted.length < numToAdd && !idsToExclude.has(track.id)) {
            // Double check, though searchForBetterTracks should handle it
            newTracksFormatted.push({
              track: track,
              reason: this.getAdditionReason(track, searchCriteria),
              confidence: this.calculateTrackFitScore(track)
            });
            idsToExclude.add(track.id); // Add to exclude set
          }
        });
        console.log(
          `⚙️ BehaviorTracker: Algorithm selected additional tracks. Total now: ${newTracksFormatted.length}.`
        );
      } catch (error) {
        console.error(
          "🚨 BehaviorTracker: Algorithmic replacement track generation failed:",
          error
        );
      }
    }

    console.log("🔄 BehaviorTracker: Final new tracks to add:", newTracksFormatted);
    return newTracksFormatted; // Ensures we don't exceed numToAdd due to structure
  }

  // Search for tracks that better match user preferences
  async searchForBetterTracks(criteria, count, idsToExclude) {
    // Modified to accept idsToExclude
    const newTracks = [];
    // This set tracks IDs added *within this specific call* to searchForBetterTracks
    // to prevent adding the same track multiple times if it appears in different search query results.
    const newlyAddedTrackIdsThisCall = new Set();

    // Try different search strategies
    const searchQueries = [
      ...criteria.artists.map((artist) => `artist:${artist}`),
      ...criteria.genres.map((genre) => `genre:${genre}`),
      criteria.energyLevel === "high"
        ? "high energy"
        : criteria.energyLevel === "low"
        ? "chill ambient"
        : "popular music"
    ];

    for (const query of searchQueries.slice(0, 3)) {
      // Limit searches
      if (newTracks.length >= count) break;

      try {
        const results = await this.spotifyAPI.searchTracks(query, 10);

        for (const track of results) {
          if (newTracks.length >= count) break;
          // Check against comprehensive exclusion list AND tracks added in this specific call
          if (!idsToExclude.has(track.id) && !newlyAddedTrackIdsThisCall.has(track.id)) {
            newTracks.push(track);
            newlyAddedTrackIdsThisCall.add(track.id); // Track as added in this call
          }
        }
      } catch (error) {
        console.warn(`Search failed for query: ${query}`, error);
      }
    }

    return newTracks.slice(0, count);
  }

  // Calculate how well a track fits user preferences
  calculateTrackFitScore(track) {
    let score = 0;
    let factors = 0;

    const preferences = this.behaviorData.preferences; // Check artist preference
    // Safely extract artist names handling both string and object formats
    const getArtistName = (artist) => (typeof artist === "string" ? artist : artist?.name || "");
    const artists = track.artists?.map(getArtistName).filter((name) => name) || [];

    for (const artist of artists) {
      const artistScore = preferences.artists[artist] || 0;
      if (artistScore > 0) {
        score += Math.min(artistScore / 10, 0.4); // Cap at 0.4
        factors++;
      }
    }

    // Check genre preference (if available)
    // Ensure track.genres is an array of strings for comparison
    const trackGenres = this.extractGenresFromTrack(track); // Use helper
    if (trackGenres.length > 0) {
      for (const genre of trackGenres) {
        const genreScore = preferences.genres[genre.toLowerCase()] || 0; // Compare with lowercase
        if (genreScore > 0) {
          score += Math.min(genreScore / 10, 0.3); // Genre less weight than artist
          factors++;
        }
      }
    }

    // Popularity bonus for well-liked tracks
    if (track.popularity && track.popularity > 50) {
      score += 0.2;
      factors++;
    }

    // Baseline score if no specific preferences
    if (factors === 0) {
      score = 0.5; // Neutral score
    }

    return Math.min(score, 1.0);
  }

  // Build reasoning for adaptation decisions
  buildAdaptationReasoning(skippedTrackInfo, tracksToRemove, tracksToAdd) {
    // Renamed parameter
    const reasoning = [];

    if (tracksToRemove.length > 0) {
      reasoning.push(
        `Removing ${tracksToRemove.length} track(s) similar to "${skippedTrackInfo.name}" based on your skip patterns.`
      );
      tracksToRemove.forEach((item) => {
        reasoning.push(`• Removed "${item.track.name}" - ${item.reason}`);
      });
    }

    if (tracksToAdd.length > 0) {
      reasoning.push(`Adding ${tracksToAdd.length} track(s) that better match your preferences.`);
      tracksToAdd.forEach((item) => {
        reasoning.push(`• Added "${item.track.name}" - ${item.reason}`);
      });
    }

    if (tracksToRemove.length === 0 && tracksToAdd.length === 0) {
      reasoning.push(
        `No specific tracks were removed or added based on skipping "${skippedTrackInfo.name}", but your preferences have been updated.`
      );
    }

    return reasoning;
  }
  // Get human-readable reason for removing a track
  getRemovalReason(track, skippedTrackInfo, similarity) {
    // Renamed parameter
    const reasons = [];

    if (similarity > 0.7) {
      // Safely extract artist names handling both string and object formats
      const getArtistName = (artist) => (typeof artist === "string" ? artist : artist?.name || "");

      const commonArtists = track.artists?.filter((a1) =>
        skippedTrackInfo.artists?.some((a2Name) => {
          // skippedTrackInfo.artists is array of names
          const name1 = getArtistName(a1).toLowerCase();
          return name1 && a2Name.toLowerCase() === name1;
        })
      );

      if (commonArtists && commonArtists.length > 0) {
        const artistName = getArtistName(commonArtists[0]);
        if (artistName) {
          reasons.push(`similar artist (${artistName})`);
        }
      }

      if (
        track.album?.name &&
        skippedTrackInfo.album && // skippedTrackInfo.album is a string
        track.album.name.toLowerCase() === skippedTrackInfo.album.toLowerCase()
      ) {
        reasons.push("same album");
      }
    }

    return reasons.length > 0 ? reasons.join(", ") : "similar characteristics";
  }
  // Get human-readable reason for adding a track
  getAdditionReason(track, criteria) {
    const reasons = [];

    if (criteria.artists.length > 0) {
      // Safely extract artist names handling both string and object formats
      const getArtistName = (artist) => (typeof artist === "string" ? artist : artist?.name || "");

      const matchingArtist = track.artists?.find((a) => {
        const artistName = getArtistName(a).toLowerCase();
        return artistName && criteria.artists.some((ca) => ca.toLowerCase() === artistName);
      });

      if (matchingArtist) {
        const artistName = getArtistName(matchingArtist);
        if (artistName) {
          // Check if artistName is not empty
          reasons.push(`preferred artist (${artistName})`);
        }
      }
    }

    const trackGenres = this.extractGenresFromTrack(track);
    if (criteria.genres.length > 0 && trackGenres.length > 0) {
      const matchingGenre = trackGenres.find((g) =>
        criteria.genres.some((cg) => cg.toLowerCase() === g.toLowerCase())
      );
      if (matchingGenre) {
        reasons.push(`preferred genre (${matchingGenre})`);
      }
    }

    if (reasons.length === 0) {
      // Fallback reason if no specific criteria matched but track was selected
      reasons.push("matches your listening patterns");
    }

    return reasons.join(", ");
  }

  // Reset adaptation state for new session
  resetAdaptationState() {
    console.log("🔄 BehaviorTracker: Resetting adaptation state for new session.");
    this.adaptationState = {
      lastAdaptationTime: 0,
      adaptationsThisSession: 0,
      pendingAdaptations: [],
      currentPlaylistContext: null
    };
  }
  // Get adaptation statistics for UI
  getAdaptationStats() {
    const canAdapt = this.canPerformAdaptation(); // Call to log details
    return {
      isEnabled: this.isAutoAdaptEnabled(),
      adaptationsThisSession: this.adaptationState.adaptationsThisSession,
      maxAdaptationsPerSession: this.config.maxAdaptationsPerSession,
      cooldownRemaining: Math.max(
        0,
        this.config.adaptationCooldown - (Date.now() - this.adaptationState.lastAdaptationTime)
      ),
      canAdaptNow: canAdapt
    };
  }

  // Helper method to safely extract genres from track data
  extractGenresFromTrack(track) {
    if (!track) return [];
    // console.log("Extracting genres from track:", track); // DEBUG

    const genres = new Set();

    // Scenario 1: track.genres is already an array of strings (e.g., from trackInfo, or enriched track object)
    if (Array.isArray(track.genres) && track.genres.every((g) => typeof g === "string")) {
      track.genres.forEach((genre) => genres.add(genre.toLowerCase()));
    }

    // Scenario 2: track.album.genres (Spotify API sometimes has this on full album objects)
    // Ensure track.album exists and track.album.genres is an array
    if (track.album && Array.isArray(track.album.genres)) {
      track.album.genres.forEach((genre) => genres.add(genre.toLowerCase()));
    }

    // Scenario 3: track.artists might contain artist objects with their own genre arrays
    // This is less common for basic track objects but good to check for enriched objects.
    if (Array.isArray(track.artists)) {
      track.artists.forEach((artistObj) => {
        // Ensure artistObj exists and artistObj.genres is an array
        if (artistObj && Array.isArray(artistObj.genres)) {
          artistObj.genres.forEach((genre) => genres.add(genre.toLowerCase()));
        }
      });
    }

    // Fallback: if track object is a full Spotify track object, it might have album.artists[].genres
    // This is more complex and usually requires separate artist calls.
    // For now, we rely on the more direct genre properties.

    const finalGenres = [...genres];
    // console.log("Extracted genres:", finalGenres); // DEBUG
    return finalGenres;
  }
}

export default BehaviorTracker;
