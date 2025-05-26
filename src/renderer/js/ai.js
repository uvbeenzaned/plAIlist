/**
 * AI Playlist Generation for plAIlist
 */

class AIPlaylistGenerator {
  constructor(spotifyAPI) {
    this.spotifyAPI = spotifyAPI;
    this.apiKey = null; // Will be set from environment
    this.baseURL = "https://api.openai.com/v1"; // Can be changed to other AI providers
    this.model = "gpt-4o-mini"; // Default to GPT-4o-mini (most cost-effective)

    this.init();
  }

  async init() {
    try {
      // Load app configuration
      this.appConfig = await window.electronAPI.getAppConfig(); // Load AI API credentials
      await this.loadAPICredentials();
    } catch (error) {
      console.error("Failed to initialize AI Playlist Generator:", error);
    }
  }

  async loadAPICredentials() {
    // Check if AI API is configured
    if (this.appConfig?.ai?.openaiApiKey) {
      this.hasApiKey = true;
      this.apiKey = this.appConfig.ai.openaiApiKey;
      // Try GPT-4o-mini first (most cost-effective), fallback to GPT-4o, then others
      this.model = this.appConfig.ai.model || "gpt-4o-mini";
    } else {
      this.hasApiKey = false;
      console.warn("AI API key not configured. AI features will use fallback algorithms.");
    }
  }
  async generatePlaylist(description, length = 25, playlistName = null) {
    try {
      // Step 1: Generate playlist concept and search terms using AI
      const playlistConcept = await this.generatePlaylistConcept(description, length);

      // Step 2: Search for tracks based on AI suggestions
      const tracks = await this.findTracksFromConcept(playlistConcept);

      // Step 3: Create the playlist name if not provided
      const finalPlaylistName = playlistName || (await this.generatePlaylistName(description)); // Step 4: Create playlist on Spotify
      const playlist = await this.spotifyAPI.createPlaylist(
        finalPlaylistName,
        `AI-generated playlist: ${description}`,
        tracks.map((track) => track.uri)
      );

      return {
        playlist: playlist,
        tracks: tracks,
        concept: playlistConcept
      };
    } catch (error) {
      console.error("❌ Failed to generate playlist:", error);
      throw error;
    }
  }

  async generatePlaylistConcept(description, length) {
    const prompt = `You are a music expert helping to create the perfect Spotify playlist. 

User Request: "${description}"
Playlist Length: ${length} songs

Please provide a detailed playlist concept that includes:
1. Overall theme and mood
2. 8-12 specific search terms/queries that would help find relevant tracks on Spotify
3. Suggested genres, artists, or specific songs that fit
4. Energy level and progression throughout the playlist
5. Any specific era, style, or characteristics to focus on

Format your response as JSON with this structure:
{
    "theme": "Brief description of the overall theme",
    "mood": "Mood description",
    "searchQueries": ["query1", "query2", "query3", ...],
    "suggestedGenres": ["genre1", "genre2", ...],
    "suggestedArtists": ["artist1", "artist2", ...],
    "energyLevel": "low/medium/high",
    "characteristics": ["characteristic1", "characteristic2", ...],
    "progression": "How the playlist should flow"
}

Make the search queries specific enough to find good results but broad enough to get variety.`;
    try {
      const response = await this.makeAIRequest(prompt);
      const cleanedResponse = this.cleanJSONResponse(response);
      const concept = JSON.parse(cleanedResponse);
      return concept;
    } catch (error) {
      // Handle quota errors gracefully
      if (error.code === "QUOTA_EXCEEDED") {
        console.warn(
          "⚠️ OpenAI quota exceeded. Using fallback algorithm for playlist concept generation."
        );
      } else if (error instanceof SyntaxError) {
        console.error("❌ JSON parsing failed for AI response:", error.message);
        console.error("Raw AI response was:", response?.substring(0, 500) + "...");
      } else {
        console.error("❌ Failed to generate playlist concept:", error);
      }

      return this.generateFallbackConcept(description, length);
    }
  }

  generateFallbackConcept(description, length) {
    // Enhanced fallback when AI is not available
    const words = description.toLowerCase().split(" ");
    const genres = this.extractGenres(words);
    const mood = this.extractMood(words);
    const decade = this.extractDecade(words);
    const artists = this.extractArtists(words); // Generate more sophisticated search queries
    const searchQueries = [
      description, // Original description
      ...genres.slice(0, 3), // Top genres
      `${mood} music`,
      `${genres[0] || "popular"} hits`,
      decade ? `${decade} music` : "recent hits",
      ...artists.slice(0, 2), // Top artists if mentioned
      `${mood} ${genres[0] || "pop"}`,
      `best ${genres[0] || "music"} songs`
    ];

    // Add genre-specific enhanced searches
    if (genres.includes("metalcore") || genres.includes("metal")) {
      searchQueries.push(
        "metalcore bands",
        "metal driving songs",
        "heavy rock anthems",
        "modern metal hits"
      );
    }

    if (words.includes("drive") || words.includes("driving")) {
      searchQueries.push(
        "driving songs",
        "road trip anthems",
        `${genres[0] || "rock"} driving music`
      );
    } // Add fallback searches
    searchQueries.push("popular music", "top charts");

    const finalQueries = searchQueries.filter(Boolean).slice(0, 12); // Limit to 12 queries for better variety

    return {
      theme: description,
      mood: mood,
      searchQueries: finalQueries,
      suggestedGenres: genres,
      suggestedArtists: artists,
      energyLevel: this.determineEnergyLevel(mood, words),
      characteristics: this.extractCharacteristics(words),
      progression: this.determineProgression(mood, length),
      decade: decade
    };
  }

  extractDecade(words) {
    const decades = {
      "60s": "1960s",
      sixties: "1960s",
      "1960s": "1960s",
      "70s": "1970s",
      seventies: "1970s",
      "1970s": "1970s",
      "80s": "1980s",
      eighties: "1980s",
      "1980s": "1980s",
      "90s": "1990s",
      nineties: "1990s",
      "1990s": "1990s",
      "2000s": "2000s",
      "00s": "2000s",
      "2010s": "2010s",
      "10s": "2010s",
      "2020s": "2020s",
      "20s": "2020s"
    };

    for (const word of words) {
      if (decades[word]) {
        return decades[word];
      }
    }
    return null;
  }

  extractArtists(words) {
    // Common artist names that might appear in descriptions
    const commonArtists = [
      "taylor swift",
      "drake",
      "billie eilish",
      "the beatles",
      "queen",
      "michael jackson",
      "madonna",
      "prince",
      "elvis",
      "beyonce",
      "kanye west",
      "eminem",
      "jay-z",
      "rihanna",
      "ariana grande",
      "ed sheeran",
      "adele",
      "bruno mars",
      "lady gaga",
      "justin bieber"
    ];

    const text = words.join(" ");
    return commonArtists.filter((artist) => text.includes(artist.toLowerCase()));
  }

  determineEnergyLevel(mood, words) {
    const highEnergyWords = ["party", "dance", "workout", "energetic", "upbeat", "pump", "hype"];
    const lowEnergyWords = ["chill", "relax", "calm", "peaceful", "ambient", "sleep", "study"];

    const hasHighEnergy = words.some((word) => highEnergyWords.includes(word));
    const hasLowEnergy = words.some((word) => lowEnergyWords.includes(word));

    if (hasHighEnergy) return "high";
    if (hasLowEnergy) return "low";
    if (mood.includes("upbeat") || mood.includes("intense")) return "high";
    if (mood.includes("chill") || mood.includes("calm")) return "low";
    return "medium";
  }

  extractCharacteristics(words) {
    return words
      .filter((word) => word.length > 3) // Filter short words
      .filter((word) => !["music", "song", "songs", "playlist", "play", "list"].includes(word)) // Filter common words
      .slice(0, 8); // Limit characteristics
  }

  determineProgression(mood, length) {
    if (length > 30) {
      return "Gradual build with dynamic progression throughout";
    } else if (mood.includes("party") || mood.includes("workout")) {
      return "High energy throughout with peak moments";
    } else if (mood.includes("chill") || mood.includes("study")) {
      return "Consistent calm energy with subtle variations";
    } else {
      return "Balanced progression with variety";
    }
  }
  extractGenres(words) {
    const knownGenres = [
      "rock",
      "pop",
      "hip-hop",
      "rap",
      "jazz",
      "classical",
      "electronic",
      "indie",
      "folk",
      "country",
      "r&b",
      "blues",
      "metal",
      "metalcore",
      "deathcore",
      "hardcore",
      "post-hardcore",
      "progressive",
      "prog",
      "alternative",
      "grunge",
      "punk",
      "post-punk",
      "emo",
      "screamo",
      "shoegaze",
      "dream-pop",
      "reggae",
      "latin",
      "world",
      "ambient",
      "house",
      "techno",
      "dubstep",
      "trap",
      "drill",
      "lo-fi",
      "synthwave",
      "vaporwave",
      "funk",
      "disco",
      "soul",
      "gospel",
      "experimental",
      "industrial",
      "garage",
      "britpop",
      "showtunes",
      "soundtrack"
    ];

    return words.filter((word) => knownGenres.includes(word));
  }
  extractMood(words) {
    const moodWords = {
      upbeat: [
        "upbeat",
        "energetic",
        "happy",
        "cheerful",
        "lively",
        "pump",
        "hype",
        "drive",
        "driving"
      ],
      chill: ["chill", "relaxing", "calm", "peaceful", "mellow", "ambient", "study", "focus"],
      sad: ["sad", "melancholy", "depressing", "somber", "emotional"],
      intense: ["intense", "aggressive", "powerful", "dramatic", "heavy", "brutal", "hardcore"],
      romantic: ["romantic", "love", "intimate", "sensual"],
      nostalgic: ["nostalgic", "throwback", "classic", "vintage", "retro"],
      party: ["party", "dance", "club", "celebration", "festival"],
      workout: ["workout", "gym", "fitness", "exercise", "training", "running"]
    };

    for (const [mood, synonyms] of Object.entries(moodWords)) {
      if (words.some((word) => synonyms.includes(word))) {
        return mood;
      }
    }

    return "medium energy";
  }
  async findTracksFromConcept(concept) {
    const allTracks = [];
    const trackIds = new Set(); // Prevent duplicates

    try {
      // Search using different strategies
      const searchStrategies = [
        ...concept.searchQueries,
        ...concept.suggestedGenres.map((genre) => `genre:${genre}`),
        ...concept.suggestedArtists.map((artist) => `artist:${artist}`)
      ];

      for (const query of searchStrategies) {
        if (allTracks.length >= concept.searchQueries.length * 5) break; // Limit total searches

        try {
          const tracks = await this.spotifyAPI.searchTracks(query, 10);

          for (const track of tracks) {
            if (!trackIds.has(track.id) && allTracks.length < 100) {
              trackIds.add(track.id);
              allTracks.push(track);
            }
          }
        } catch (error) {
          // Skip failed search queries silently
        }
      }

      // If we don't have enough tracks, try more generic searches
      if (allTracks.length < 20) {
        const genericQueries = [
          "popular music",
          "top hits",
          "best songs",
          concept.suggestedGenres[0] || "pop"
        ];

        for (const query of genericQueries) {
          const tracks = await this.spotifyAPI.searchTracks(query, 15);

          for (const track of tracks) {
            if (!trackIds.has(track.id) && allTracks.length < 50) {
              trackIds.add(track.id);
              allTracks.push(track);
            }
          }
        }
      }

      // Rank and select the best tracks
      const rankedTracks = await this.rankTracks(allTracks, concept);
      return rankedTracks.slice(0, concept.length || 25);
    } catch (error) {
      throw error;
    }
  }

  async rankTracks(tracks, concept) {
    // Simple ranking algorithm (can be enhanced with AI)
    return tracks
      .map((track) => ({
        ...track,
        score: this.calculateTrackScore(track, concept)
      }))
      .sort((a, b) => b.score - a.score);
  }

  calculateTrackScore(track, concept) {
    let score = 0;

    // Base popularity score
    score += track.popularity * 0.3;

    // Check if track matches suggested artists
    const trackArtists = track.artists.map((a) => a.name.toLowerCase());
    const suggestedArtists = concept.suggestedArtists.map((a) => a.toLowerCase());
    if (trackArtists.some((artist) => suggestedArtists.includes(artist))) {
      score += 20;
    }

    // Check if track name or artist contains keywords from characteristics
    const trackText = `${track.name} ${trackArtists.join(" ")}`.toLowerCase();
    const characteristics = concept.characteristics.map((c) => c.toLowerCase());
    const matchingCharacteristics = characteristics.filter((char) =>
      trackText.includes(char)
    ).length;
    score += matchingCharacteristics * 10;

    // Energy level matching (simplified)
    if (concept.energyLevel === "high" && track.popularity > 70) score += 10;
    if (concept.energyLevel === "low" && track.popularity < 80) score += 5;

    // Prefer tracks with good audio features (if available)
    if (track.preview_url) score += 5; // Has preview

    // Avoid explicit content for certain moods
    if (track.explicit && (concept.mood.includes("chill") || concept.mood.includes("romantic"))) {
      score -= 10;
    }

    return score;
  }

  async generatePlaylistName(description) {
    const prompt = `Generate a creative, catchy playlist name for a Spotify playlist described as: "${description}"

The name should be:
- Creative and memorable
- 2-5 words long
- Capture the essence of the description
- Sound like something you'd actually see on Spotify

Respond with just the playlist name, nothing else.`;

    try {
      const name = await this.makeAIRequest(prompt);
      const cleanedName = this.cleanTextResponse(name);
      return cleanedName;
    } catch (error) {
      if (error.code === "QUOTA_EXCEEDED") {
        console.warn("OpenAI quota exceeded. Using fallback for playlist name generation.");
      } else {
        console.warn("Failed to generate playlist name with AI, using fallback");
      }
      return this.generateFallbackName(description);
    }
  }

  generateFallbackName(description) {
    // Enhanced fallback name generation
    const words = description.toLowerCase().split(" ");
    const genres = this.extractGenres(words);
    const mood = this.extractMood(words);
    const decade = this.extractDecade(words);

    // Creative name templates
    const templates = [
      () => {
        const key = words.find((w) => w.length > 4) || words[0];
        return `${this.capitalize(key)} Vibes`;
      },
      () => {
        const genre = genres[0];
        const moodWord = mood.split(" ")[0];
        return genre
          ? `${this.capitalize(moodWord)} ${this.capitalize(genre)}`
          : `${this.capitalize(moodWord)} Mix`;
      },
      () => {
        return decade
          ? `${decade} ${this.capitalize(mood)}`
          : `${this.capitalize(mood)} Collection`;
      },
      () => {
        const keyWords = words.filter((w) => w.length > 3).slice(0, 2);
        return keyWords.map((w) => this.capitalize(w)).join(" ") + " Playlist";
      },
      () => {
        return `My ${this.capitalize(mood)} Mix`;
      }
    ];

    // Try templates in order until we get a good name
    for (const template of templates) {
      try {
        const name = template();
        if (name && name.length > 5 && name.length < 50) {
          return name;
        }
      } catch (e) {
        continue;
      }
    }

    // Final fallback
    const capitalized = words.slice(0, 3).map((word) => this.capitalize(word));
    return capitalized.join(" ") + " Mix";
  }

  capitalize(word) {
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }

  async makeAIRequest(prompt) {
    if (!this.hasApiKey) {
      throw new Error("AI API key not configured. Please check your .env file.");
    }

    // List of models to try in order of preference (cost-optimized)
    const modelsToTry = ["gpt-4o-mini", "gpt-4o", "gpt-4.1", "gpt-3.5-turbo"];

    // Start with the configured model, then try fallbacks
    const modelList = [this.model, ...modelsToTry.filter((m) => m !== this.model)];
    for (const model of modelList) {
      try {
        const response = await fetch(`${this.baseURL}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: model,
            messages: [
              {
                role: "system",
                content:
                  "You are a music expert and playlist curator with deep knowledge of all genres, artists, and music trends."
              },
              {
                role: "user",
                content: prompt
              }
            ],
            max_tokens: 1000,
            temperature: 0.7
          })
        });

        if (response.ok) {
          const data = await response.json();

          if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            throw new Error("Invalid response format from AI API");
          } // Success! Update our preferred model for future requests
          this.model = model;

          const content = data.choices[0].message.content;

          return content;
        } else {
          // Log the error but try next model
          const errorBody = await response.text();

          // Parse error details
          let errorData = {};
          try {
            errorData = JSON.parse(errorBody);
          } catch (e) {
            // Ignore JSON parse errors
          }

          // If it's a model-not-found error, try the next model
          if (response.status === 404 || response.status === 400) {
            continue;
          } // If it's a quota/rate limit error, try next model but warn user
          else if (response.status === 429) {
            if (errorData.error?.code === "insufficient_quota") {
              // Quota exceeded - try next model
            }
            continue;
          } else {
            // For other errors (auth, server errors, etc.), don't try other models
            throw new Error(
              `AI API error: ${response.status} ${response.statusText} - ${errorBody}`
            );
          }
        }
      } catch (error) {
        // If it's a network error or similar, try next model
        if (error.message.includes("fetch") || error.message.includes("network")) {
          continue;
        }

        // If it's the last model, throw the error
        if (model === modelList[modelList.length - 1]) {
          throw error;
        }
      }
    } // If all models failed due to quota, provide helpful message
    const quotaMessage =
      "OpenAI quota exceeded. Using fallback algorithm for playlist generation. Please add credits to your OpenAI account for AI-powered features.";

    // Throw a specific quota error that can be handled gracefully
    const quotaError = new Error(quotaMessage);
    quotaError.code = "QUOTA_EXCEEDED";
    throw quotaError;
  }

  async adaptPlaylistBasedOnBehavior(playlistId, userBehavior) {
    // This would analyze user behavior (skips, likes, listening time)
    // and suggest modifications to the playlist

    const { skippedTracks, likedTracks, partiallyListened } = userBehavior;

    // Generate insights
    const insights = await this.analyzeUserBehavior(userBehavior);

    // Suggest new tracks or replacements
    const suggestions = await this.generateAdaptationSuggestions(insights);

    return suggestions;
  }

  async analyzeUserBehavior(behavior) {
    // Analyze patterns in user behavior
    // This is a simplified version - could be much more sophisticated

    const insights = {
      preferredGenres: [],
      avoidedGenres: [],
      preferredArtists: [],
      energyPreference: "medium",
      timeOfDayPattern: null
    };

    // Analyze skipped vs completed tracks
    // This would require more data about the tracks

    return insights;
  }

  async generateAdaptationSuggestions(insights) {
    // Generate suggestions based on insights
    const suggestions = {
      tracksToRemove: [],
      tracksToAdd: [],
      reasoning: ""
    };

    // This would use AI to generate smart suggestions
    return suggestions;
  }

  // Helper function to clean JSON responses that might be wrapped in markdown
  cleanJSONResponse(response) {
    // Remove markdown code block formatting
    let cleaned = response.trim();

    // Remove ```json and ``` wrapping
    if (cleaned.startsWith("```json")) {
      cleaned = cleaned.substring(7);
    } else if (cleaned.startsWith("```")) {
      cleaned = cleaned.substring(3);
    }

    if (cleaned.endsWith("```")) {
      cleaned = cleaned.substring(0, cleaned.length - 3);
    }

    return cleaned.trim();
  }

  // Helper function to clean plain text responses
  cleanTextResponse(response) {
    // Clean plain text responses (remove markdown, quotes, etc.)
    let cleaned = response.trim();

    // Remove markdown code block formatting if present
    if (cleaned.startsWith("```")) {
      const firstNewline = cleaned.indexOf("\n");
      if (firstNewline !== -1) {
        cleaned = cleaned.substring(firstNewline + 1);
      }
    }

    if (cleaned.endsWith("```")) {
      cleaned = cleaned.substring(0, cleaned.length - 3);
    }

    // Remove surrounding quotes
    cleaned = cleaned.replace(/^["']|["']$/g, "");

    return cleaned.trim();
  }
}

// Export for use in other modules
export { AIPlaylistGenerator };
