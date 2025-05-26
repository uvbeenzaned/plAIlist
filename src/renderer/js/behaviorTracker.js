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
      learningEnabled: true
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
    const defaultData = this.loadBehaviorData();
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
        genres: track.genres || [],
        audioFeatures: null, // Will be fetched later
        popularity: track.popularity,
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

    // Weight for preference updates (likes = +2, partials = +1, skips = -1)
    const weight = behavior === "like" ? 2 : behavior === "partial" ? 1 : -1;

    // Update artist preferences
    trackInfo.artists.forEach((artist) => {
      preferences.artists[artist] = (preferences.artists[artist] || 0) + weight;
    });

    // Update genre preferences
    trackInfo.genres.forEach((genre) => {
      preferences.genres[genre] = (preferences.genres[genre] || 0) + weight;
    });

    // Update time of day preferences
    const timeKey = context.timeOfDay;
    if (!preferences.timeOfDay[timeKey]) {
      preferences.timeOfDay[timeKey] = { likes: 0, skips: 0, partials: 0 };
    }
    preferences.timeOfDay[timeKey][behavior]++;

    // Energy preference (simplified)
    if (trackInfo.popularity > 70) {
      preferences.energy.high += weight;
    } else if (trackInfo.popularity > 40) {
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
    const skippedTracks = recentInteractions.filter((i) => i.behavior === "skip");

    // Find common patterns in skipped tracks
    const skipReasons = {};

    skippedTracks.forEach((interaction) => {
      // Analyze common characteristics of skipped tracks
      const { trackInfo } = interaction;

      // Low popularity songs get skipped more
      if (trackInfo.popularity < 30) {
        skipReasons["lowPopularity"] = (skipReasons["lowPopularity"] || 0) + 1;
      }

      // Genre-based skipping
      trackInfo.genres.forEach((genre) => {
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
  }

  // Generate AI-powered recommendations based on behavior
  async generateRecommendations() {
    if (!this.aiGenerator || !this.config.learningEnabled) {
      return this.generateAlgorithmicRecommendations();
    }

    try {
      const behaviorSummary = this.createBehaviorSummary();
      const prompt = this.createRecommendationPrompt(behaviorSummary);

      const response = await this.aiGenerator.makeAIRequest(prompt);
      return this.parseAIRecommendations(response);
    } catch (error) {
      console.warn("AI recommendations failed, using algorithmic fallback:", error);
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
}

export default BehaviorTracker;
