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
    if (!playback || !this.config.learningEnabled) return;

    const now = Date.now();
    const track = playback.item;

    // Store current playback for comparison
    if (this.currentTrack && this.currentTrack.id !== track.id) {
      // Track changed - analyze previous track behavior
      this.analyzeTrackCompletion(this.currentTrack, this.trackStartTime, this.lastProgressMs);
    }

    // Update current track info
    this.currentTrack = track;
    this.trackStartTime = now;
    this.lastProgressMs = playback.progress_ms;

    // Log playback event
    this.currentSession.playbackEvents.push({
      timestamp: now,
      trackId: track.id,
      progressMs: playback.progress_ms,
      isPlaying: playback.is_playing
    });
  }
  // Analyze how user interacted with a track (skip, like, complete)
  analyzeTrackCompletion(track, startTime, lastProgressMs) {
    if (!track) return;

    const listenDuration = Date.now() - startTime;
    const progressRatio = lastProgressMs / track.duration_ms;
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

    // Calculate running average listen time
    const { avgListenTime, totalTracks } = this.behaviorData.statistics;
    this.behaviorData.statistics.avgListenTime =
      (avgListenTime * (totalTracks - 1) + interaction.listenDuration) / totalTracks;

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

    if (total === 0) return { preference: "unknown", confidence: 0 };

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
          recommendations[time] = "Great listening time - maintain current approach";
        } else if (data.skipRatio > 0.5) {
          recommendations[time] = "Try different energy levels or genres during this time";
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
    if (!this.isAutoAdaptEnabled() || !currentPlaylist || !skippedTrack) return null;

    // Check cooldown and session limits
    if (!this.canPerformAdaptation()) {
      return null;
    }

    try {
      console.log(`🔄 Auto-adapting playlist based on skip: ${skippedTrack.name}`);

      const adaptationActions = await this.calculateAdaptationActions(
        skippedTrack,
        currentPlaylist,
        reason
      );

      if (adaptationActions.remove.length > 0 || adaptationActions.add.length > 0) {
        this.adaptationState.lastAdaptationTime = Date.now();
        this.adaptationState.adaptationsThisSession++;

        return adaptationActions;
      }
    } catch (error) {
      console.error("Auto-adaptation failed:", error);
    }

    return null;
  }

  // Check if adaptation can be performed (cooldown, limits, etc.)
  canPerformAdaptation() {
    const now = Date.now();
    const timeSinceLastAdaptation = now - this.adaptationState.lastAdaptationTime;

    return (
      timeSinceLastAdaptation >= this.config.adaptationCooldown &&
      this.adaptationState.adaptationsThisSession < this.config.maxAdaptationsPerSession
    );
  }

  // Calculate what tracks to remove and add based on user behavior
  async calculateAdaptationActions(skippedTrack, currentPlaylist, reason) {
    const actions = {
      remove: [],
      add: [],
      reasoning: []
    };

    // Step 1: Find similar tracks to remove based on skip patterns
    const tracksToRemove = await this.findSimilarTracksToRemove(skippedTrack, currentPlaylist);

    // Step 2: Generate replacement tracks based on user preferences
    const tracksToAdd = await this.generateReplacementTracks(skippedTrack, currentPlaylist);

    actions.remove = tracksToRemove;
    actions.add = tracksToAdd;
    actions.reasoning = this.buildAdaptationReasoning(skippedTrack, tracksToRemove, tracksToAdd);

    return actions;
  }

  // Find tracks similar to the skipped track that should be removed
  async findSimilarTracksToRemove(skippedTrack, currentPlaylist) {
    const tracksToRemove = [];
    const tracks = currentPlaylist.tracks || [];

    // Don't remove too many tracks
    const maxToRemove = Math.max(1, Math.min(3, Math.floor(tracks.length * 0.3)));

    // Check if playlist would have enough tracks left
    if (tracks.length - maxToRemove < this.config.minTracksBeforeAdaptation) {
      return []; // Don't remove if it would make playlist too small
    }

    // Get user's skip patterns to understand what they don't like
    const skipPatterns = this.analyzeSkipPatterns();

    for (const track of tracks) {
      if (tracksToRemove.length >= maxToRemove) break;
      if (track.id === skippedTrack.id) continue; // Skip the already skipped track

      // Check similarity based on multiple factors
      const similarity = this.calculateTrackSimilarity(skippedTrack, track);

      if (similarity >= this.config.similarityThreshold) {
        // Additional check: has this type of track been skipped before?
        const skipLikelihood = this.calculateSkipLikelihood(track, skipPatterns);

        if (skipLikelihood > 0.6) {
          // 60% chance user would skip this
          tracksToRemove.push({
            track: track,
            similarity: similarity,
            skipLikelihood: skipLikelihood,
            reason: this.getRemovalReason(track, skippedTrack, similarity)
          });
        }
      }
    }

    return tracksToRemove.sort((a, b) => b.skipLikelihood - a.skipLikelihood);
  }
  // Calculate similarity between two tracks
  calculateTrackSimilarity(track1, track2) {
    let similarity = 0;
    let factors = 0;

    // Artist similarity (highest weight)
    // Safely extract artist names handling both string and object formats
    const getArtistName = (artist) => (typeof artist === "string" ? artist : artist?.name || "");

    const commonArtists = track1.artists?.filter((a1) =>
      track2.artists?.some((a2) => {
        const name1 = getArtistName(a1).toLowerCase();
        const name2 = getArtistName(a2).toLowerCase();
        return name1 && name2 && name1 === name2;
      })
    );
    if (commonArtists && commonArtists.length > 0) {
      similarity += 0.4;
      factors++;
    }

    // Album similarity
    if (
      track1.album?.name &&
      track2.album?.name &&
      track1.album.name.toLowerCase() === track2.album.name.toLowerCase()
    ) {
      similarity += 0.3;
      factors++;
    }

    // Genre similarity (if available)
    if (track1.genres && track2.genres) {
      const commonGenres = track1.genres.filter((g) => track2.genres.includes(g));
      if (commonGenres.length > 0) {
        similarity +=
          0.2 * (commonGenres.length / Math.max(track1.genres.length, track2.genres.length));
        factors++;
      }
    }

    // Popularity similarity
    if (track1.popularity && track2.popularity) {
      const popularityDiff = Math.abs(track1.popularity - track2.popularity);
      if (popularityDiff < 20) {
        // Similar popularity
        similarity += 0.1;
        factors++;
      }
    }

    return factors > 0 ? similarity : 0;
  }

  // Calculate likelihood that user would skip this track
  calculateSkipLikelihood(track, skipPatterns) {
    let skipScore = 0;

    // Check against known skip patterns
    for (const pattern of skipPatterns) {
      if (pattern.reason.includes("genre:")) {
        const genre = pattern.reason.replace("genre:", "");
        if (track.genres?.includes(genre)) {
          skipScore += pattern.percentage / 100;
        }
      }

      if (pattern.reason === "lowPopularity" && track.popularity < 30) {
        skipScore += pattern.percentage / 100;
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
      }
    }

    return Math.min(skipScore, 1.0); // Cap at 100%
  }

  // Generate replacement tracks based on user preferences
  async generateReplacementTracks(skippedTrack, currentPlaylist) {
    try {
      const numToAdd = Math.min(2, 5 - (currentPlaylist.tracks?.length || 0)); // Add 1-2 tracks
      if (numToAdd <= 0) return [];

      // Build search criteria based on user's positive preferences
      const searchCriteria = this.buildSearchCriteriaFromPreferences();

      // Search for tracks that match user's preferences
      const newTracks = await this.searchForBetterTracks(searchCriteria, numToAdd, currentPlaylist);

      return newTracks.map((track) => ({
        track: track,
        reason: this.getAdditionReason(track, searchCriteria),
        confidence: this.calculateTrackFitScore(track)
      }));
    } catch (error) {
      console.error("Failed to generate replacement tracks:", error);
      return [];
    }
  }

  // Build search criteria from user's positive behavior patterns
  buildSearchCriteriaFromPreferences() {
    const preferences = this.behaviorData.preferences;
    const insights = this.behaviorData.insights;

    const criteria = {
      genres: [],
      artists: [],
      characteristics: [],
      energyLevel: "medium"
    };

    // Add preferred genres (top 3)
    if (insights.preferredGenres) {
      criteria.genres = insights.preferredGenres.slice(0, 3).map((g) => g.name);
    }

    // Add preferred artists (top 5)
    if (insights.preferredArtists) {
      criteria.artists = insights.preferredArtists.slice(0, 5).map((a) => a.name);
    }

    // Add energy preference
    if (insights.energyPreference && insights.energyPreference.confidence > 0.5) {
      criteria.energyLevel = insights.energyPreference.preference;
    }

    return criteria;
  }

  // Search for tracks that better match user preferences
  async searchForBetterTracks(criteria, count, currentPlaylist) {
    const existingTrackIds = new Set((currentPlaylist.tracks || []).map((t) => t.id));
    const newTracks = [];

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
          if (existingTrackIds.has(track.id)) continue;

          // Score the track against user preferences
          const fitScore = this.calculateTrackFitScore(track);
          if (fitScore > 0.6) {
            // Only add tracks with good fit
            newTracks.push(track);
            existingTrackIds.add(track.id);
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
    if (track.genres) {
      for (const genre of track.genres) {
        const genreScore = preferences.genres[genre] || 0;
        if (genreScore > 0) {
          score += Math.min(genreScore / 10, 0.3); // Cap at 0.3
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
  buildAdaptationReasoning(skippedTrack, tracksToRemove, tracksToAdd) {
    const reasoning = [];

    if (tracksToRemove.length > 0) {
      reasoning.push(
        `Removing ${tracksToRemove.length} similar track(s) based on your skip patterns`
      );
      tracksToRemove.forEach((item) => {
        reasoning.push(`• "${item.track.name}" - ${item.reason}`);
      });
    }

    if (tracksToAdd.length > 0) {
      reasoning.push(`Adding ${tracksToAdd.length} track(s) that better match your preferences`);
      tracksToAdd.forEach((item) => {
        reasoning.push(`• "${item.track.name}" - ${item.reason}`);
      });
    }

    return reasoning;
  }
  // Get human-readable reason for removing a track
  getRemovalReason(track, skippedTrack, similarity) {
    const reasons = [];

    if (similarity > 0.7) {
      // Safely extract artist names handling both string and object formats
      const getArtistName = (artist) => (typeof artist === "string" ? artist : artist?.name || "");

      const commonArtists = track.artists?.filter((a1) =>
        skippedTrack.artists?.some((a2) => {
          const name1 = getArtistName(a1).toLowerCase();
          const name2 = getArtistName(a2).toLowerCase();
          return name1 && name2 && name1 === name2;
        })
      );

      if (commonArtists && commonArtists.length > 0) {
        const artistName = getArtistName(commonArtists[0]);
        if (artistName) {
          reasons.push(`same artist (${artistName})`);
        }
      }

      if (
        track.album?.name &&
        skippedTrack.album?.name &&
        track.album.name === skippedTrack.album.name
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
          reasons.push(`you like ${artistName}`);
        }
      }
    }

    if (criteria.genres.length > 0 && track.genres) {
      const matchingGenre = track.genres.find((g) => criteria.genres.includes(g));
      if (matchingGenre) {
        reasons.push(`matches your ${matchingGenre} preference`);
      }
    }

    return reasons.length > 0 ? reasons.join(", ") : "matches your listening patterns";
  }

  // Reset adaptation state for new session
  resetAdaptationState() {
    this.adaptationState = {
      lastAdaptationTime: 0,
      adaptationsThisSession: 0,
      pendingAdaptations: [],
      currentPlaylistContext: null
    };
  }
  // Get adaptation statistics for UI
  getAdaptationStats() {
    return {
      isEnabled: this.isAutoAdaptEnabled(),
      adaptationsThisSession: this.adaptationState.adaptationsThisSession,
      maxAdaptationsPerSession: this.config.maxAdaptationsPerSession,
      cooldownRemaining: Math.max(
        0,
        this.config.adaptationCooldown - (Date.now() - this.adaptationState.lastAdaptationTime)
      ),
      canAdaptNow: this.canPerformAdaptation()
    };
  }

  // Helper method to safely extract genres from track data
  extractGenresFromTrack(track) {
    if (!track) return [];

    // Try different sources for genre information
    const genres = [];

    // Check track's album for genres
    if (track.album?.genres?.length > 0) {
      genres.push(...track.album.genres);
    }

    // Check track's artists for genres (may be available in artist details)
    if (track.artists) {
      for (const artist of track.artists) {
        if (artist.genres?.length > 0) {
          genres.push(...artist.genres);
        }
      }
    }

    // Check track itself for genres (may be populated by other API calls)
    if (track.genres?.length > 0) {
      genres.push(...track.genres);
    }

    // Remove duplicates and return
    return [...new Set(genres)];
  }
}

export default BehaviorTracker;
