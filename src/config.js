/**
 * Configuration management for plAIlist
 * Handles environment variables and app settings
 */

const path = require("path");
const fs = require("fs");

class Config {
  constructor() {
    this.config = {};
    this.loadConfig();
  }
  loadConfig() {
    try {
      // Load .env file if it exists
      const envPath = path.join(__dirname, "..", ".env");
      if (fs.existsSync(envPath)) {
        require("dotenv").config({ path: envPath });
      }

      // Set configuration from environment variables
      this.config = {
        // Spotify Configuration
        spotify: {
          clientId: process.env.SPOTIFY_CLIENT_ID,
          clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
          redirectUri: process.env.SPOTIFY_REDIRECT_URI || "http://127.0.0.1:8080/callback"
        }, // AI Configuration
        ai: {
          openaiApiKey: process.env.OPENAI_API_KEY,
          anthropicApiKey: process.env.ANTHROPIC_API_KEY,
          googleAiApiKey: process.env.GOOGLE_AI_API_KEY,
          defaultProvider: "openai",
          model: process.env.AI_MODEL || "gpt-4.1" // Default to GPT-4.1
        }, // Application Settings
        app: {
          environment: process.env.NODE_ENV || "development",
          logLevel: process.env.LOG_LEVEL || "info",
          version: require("../package.json").version,
          isDevelopment: process.env.NODE_ENV === "development"
        },

        // Security Settings
        security: {
          enableCsp: true,
          allowedHosts: ["api.spotify.com", "accounts.spotify.com", "api.openai.com"],
          maxPlaylistSize: 100,
          rateLimitWindow: 60000, // 1 minute
          rateLimitRequests: 100
        }
      };

      console.log("Configuration loaded successfully");
    } catch (error) {
      console.error("Failed to load configuration:", error);
      this.config = this.getDefaultConfig();
    }
  }

  getDefaultConfig() {
    return {
      spotify: {
        clientId: null,
        clientSecret: null,
        redirectUri: "http://127.0.0.1:8080/callback"
      },
      ai: {
        openaiApiKey: null,
        anthropicApiKey: null,
        googleAiApiKey: null,
        defaultProvider: "openai",
        model: "gpt-3.5-turbo"
      },
      app: {
        environment: "development",
        logLevel: "info",
        version: "1.0.0",
        isDevelopment: true
      },
      security: {
        enableCsp: true,
        allowedHosts: ["api.spotify.com", "accounts.spotify.com", "api.openai.com"],
        maxPlaylistSize: 100,
        rateLimitWindow: 60000,
        rateLimitRequests: 100
      }
    };
  }

  get(section, key = null) {
    if (key) {
      return this.config[section]?.[key];
    }
    return this.config[section];
  }

  set(section, key, value) {
    if (!this.config[section]) {
      this.config[section] = {};
    }
    this.config[section][key] = value;
  }

  isConfigured() {
    return this.get("spotify", "clientId") && this.get("ai", "openaiApiKey");
  }

  getSpotifyConfig() {
    return this.get("spotify");
  }

  getAiConfig() {
    return this.get("ai");
  }

  getAppConfig() {
    return this.get("app");
  }

  getSecurityConfig() {
    return this.get("security");
  }

  validateConfiguration() {
    const errors = [];

    if (!this.get("spotify", "clientId")) {
      errors.push("Spotify Client ID is required");
    }

    if (!this.get("spotify", "clientSecret")) {
      errors.push("Spotify Client Secret is required");
    }

    if (!this.get("ai", "openaiApiKey")) {
      errors.push("OpenAI API Key is required for AI features");
    }

    return {
      isValid: errors.length === 0,
      errors: errors
    };
  } // Safely expose configuration to renderer process
  getRendererConfig() {
    return {
      spotify: {
        clientId: this.get("spotify", "clientId"),
        clientSecret: this.get("spotify", "clientSecret"), // Added for development
        redirectUri: this.get("spotify", "redirectUri")
      },
      ai: {
        hasApiKey: Boolean(this.get("ai", "openaiApiKey")),
        openaiApiKey: this.get("ai", "openaiApiKey"), // Added for development
        defaultProvider: this.get("ai", "defaultProvider"),
        model: this.get("ai", "model")
      },
      app: {
        version: this.get("app", "version"),
        isDevelopment: this.get("app", "isDevelopment")
      },
      security: {
        maxPlaylistSize: this.get("security", "maxPlaylistSize")
      }
    };
  }
}

module.exports = new Config();
