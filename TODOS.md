# plAIlist - Feature Roadmap & TODOs

> **Current Status:** Production Ready ✅  
> **Last Updated:** May 29, 2025  
> **Git Repository:** https://github.com/uvbeenzaned/plAIlist

---

## 🔄 GIT WORKFLOW

### Development Process

- **Master Branch**: Production-ready code with complete features
- **Develop Branch**: Active development and feature integration
- **Feature Branches**: Individual feature development (when needed)

### Commit Standards

- Use conventional commit format: `feat:`, `fix:`, `docs:`, `refactor:`, etc.
- Include comprehensive commit messages with feature summaries
- Branch and push major feature completions for backup and collaboration

---

## 📊 DEVELOPMENT PROGRESS TRACKER

### 🏃‍♂️ Current Active Development

- **Feature**: Implement Behavior Learning & AI-Driven Adaptive Listening (and UI for Data Transparency)
- **Priority**: HIGH (core AI functionality)
- **Started**: May 29, 2025
- **Target**: May 31, 2025
- **Status**: In Progress - Integrating AI components & adding UI controls
- **Dependencies**: `ai.js`, `behaviorTracker.js`, `spotify.js`, `Sidebar.svelte`.
- **Progress**:
  - **`ai.js`**:
    - Core AI methods `analyzeUserBehavior` and `generateAISuggestedTracks` are implemented.
  - **`behaviorTracker.js` (Integration In Progress)**:
    - Modifying `generateReplacementTracks` to use new AI methods.
    - Fallback to algorithmic suggestions is planned.
  - **`Sidebar.svelte` (UI Enhancements In Progress)**:
    - Added "View My Data" button which triggers a modal to display `behaviorTracker.exportData()`.
    - Added "Clear My Data" button with confirmation, calling `behaviorTracker.clearAllData()` and then `refreshBehaviorInsights()`.
    - Modal for data display implemented.
    - Ensured `showNotification` prop from `App.svelte` is used for user feedback.
  - **Integration**:
    - Ensuring `App.svelte` correctly passes instances and notification functions.
  - **Overall**: AI components for behavior analysis are ready. Focus is on integrating these into `behaviorTracker.js` and providing user controls for data transparency in `Sidebar.svelte`.

### ✅ Recently Completed Features

- **Feature**: Fix Playback Context and AI Song Count Bugs
- **Priority**: HIGH (affecting core functionality)
- **Status**: Resolved
- **Details**:
  - **Playback Context Issue (`spotify.js`)**: Fixed the `playTrackInContext` method to correctly play the full context of a track.
  - **AI Song Count Mismatch (`ai.js`)**: Updated the `findTracksFromConcept` method to correctly use the user-requested song length.

### 🎨 UI/UX Enhancements

- [x] **Load Last Playlist on Startup** - Automatically load the most recently viewed/generated playlist when the app starts. _(Task added May 29, 2025, Verified May 29, 2025)_
- [ ] **Behavior Data Transparency Controls** - Add 'View My Data' and 'Clear My Data' options in Sidebar. _(Task added May 29, 2025)_
- [x] **Now Playing Component Redesign** - Redesign now playing display to match application styling and position in sidebar _(Completed: May 26, 2025)_

### 📝 Progress Notes

- 📅 **May 30, 2025 (Evening)**:
  - **Auto-Adaptation Playback Queueing**:
    - Added `queueTrack(trackUri)` method to `spotify.js` to allow adding tracks to Spotify's playback queue. This method includes error handling for active devices and premium requirements.
    - Modified `handleTrackSkip` in `App.svelte` so that when auto-adaptation successfully adds new tracks to the current playlist, these tracks are also automatically queued up for playback in Spotify. This ensures continuous listening after adaptation.
    - A small delay was added between queueing multiple tracks to potentially improve reliability with the Spotify API.
- 📅 **May 30, 2025 (Afternoon)**:
  - **Auto-Adaptation Duplicate Song Fix**:
    - Refined `generateReplacementTracks` in `behaviorTracker.js` to prevent adding the same song multiple times during consecutive skips.
    - A comprehensive `idsToExclude` set is now maintained throughout the `generateReplacementTracks` method. This set includes tracks already in the playlist, the currently skipped track, and any tracks selected for addition (by AI or algorithm) during the current adaptation event.
    - `searchForBetterTracks` was updated to accept this `idsToExclude` set and also uses an internal `newlyAddedTrackIdsThisCall` set to prevent adding the same track if it appears in results from multiple search queries within that single call.
    - This ensures that once a track is chosen for addition in an adaptation cycle, it won't be considered again by subsequent logic within that same cycle.
- 📅 **May 30, 2025**:
  - **Auto-Adaptation `skippedTrack` Handling**:
    - Modified `behaviorTracker.js` in `handleAutoAdaptation` to create a structured `skippedTrackInfo` object from the raw `skippedTrack` (Spotify track object). This `skippedTrackInfo` (containing correctly formatted `artists`, `album`, `genres`, `popularity`) is now passed through `calculateAdaptationActions` to `findSimilarTracksToRemove` and `calculateTrackSimilarity`.
    - This ensures that `calculateTrackSimilarity` receives the `skippedTrack` data in the expected `trackInfo` format for its `track1` parameter, resolving the issue where similarity scores were always 0 due to mismatched data structures. Parameter names in these functions were updated for clarity (e.g., `track1Info`, `track2Raw`).
  - **Spotify API `/me/player/next` Anomaly**:
    - Updated `makeApiRequest` in `spotify.js` to specifically handle cases where the `/me/player/next` endpoint returns a `200 OK` status (with a small body) instead of the documented `204 No Content`. The method now consumes the unexpected body and returns an empty object, preventing JSON parsing errors for this specific scenario.
- 📅 **May 29, 2025 (Late Evening)**:
  - **Refined Track Completion Detection**: Modified `handlePlaybackUpdate` in `behaviorTracker.js` to more accurately detect natural song endings and instances where playback stops. This ensures `analyzeTrackCompletion` is called with appropriate progress information, allowing for better tracking of 'like' or 'partial' listens for songs that aren't manually skipped. Added console logs to trace this specific logic.
- 📅 **May 29, 2025 (Evening)**:
  - **Auto-Adaptation Debugging**:
    - Refined `calculateTrackSimilarity` in `behaviorTracker.js` to more robustly compare artist, album, genre, and popularity data between the skipped track and playlist tracks. Added detailed logging to inspect track structures and comparison scores. This addresses the issue of similarity scores always being 0.
    - Improved `extractGenresFromTrack` to handle various ways genres might be stored on track objects.
  - **Spotify API Error Investigation**:
    - Added logging in `spotify.js`'s `makeApiRequest` to capture status and content-length before attempting to parse JSON. This aims to identify why a JSON parsing error occurs after track skipping (expected 204 response).
  - **AI Insights**: The "Insufficient insights" (specifically empty `preferredGenres`) for AI track generation is likely due to `behaviorTracker` not having access to detailed genre information for tracks processed during normal playback. Full genre enrichment typically requires dedicated API calls (e.g., `getTrackDetails`, `getArtistDetails`), which are not part of the standard playback update loop. This is a known area for future enhancement if more sophisticated genre-based learning is required.
- 📅 **May 29, 2025**: Enhanced debugging for auto-adaptation feature.
  - Added extensive `console.log` statements throughout the auto-adaptation pipeline in `behaviorTracker.js`.
  - This includes logging for:
    - Entry and exit points of key adaptation functions (`handleAutoAdaptation`, `canPerformAdaptation`, `calculateAdaptationActions`, `findSimilarTracksToRemove`, `calculateTrackSimilarity`, `calculateSkipLikelihood`, `generateReplacementTracks`, `resetAdaptationState`).
    - Details of parameters passed to these functions.
    - Results of conditional checks (e.g., `isAutoAdaptEnabled`, cooldown status, session limits).
    - Values of `maxToRemove`, similarity scores, skip likelihoods, and reasons for these scores.
    - Tracks being considered for removal or addition, along with their properties and reasons.
    - Choices between AI and algorithmic track generation, and the criteria/insights used.
    - Final actions taken (tracks added/removed) and adaptation state updates.
  - Restored previously commented-out `console.log` statements in `App.svelte` related to app initialization, Spotify connection, and auto-adaptation handling to provide more runtime insight.
- 📅 **May 29, 2025**: Verified and refined the "Load Last Playlist on Startup" feature.
  - Updated `initializeApp` in `App.svelte` to use the `loadSavedPlaylist` function for loading the most recent playlist from history. This ensures consistent loading logic and user notification.
  - Removed a few general `console.log` statements from `App.svelte` for cleaner output.
- 📅 **May 29, 2025**: Investigating persistent 403 Forbidden errors from Spotify API when fetching audio features (`/v1/audio-features/{id}`). This occurs for all tracks tried, not just restricted ones.
  - **Current App Behavior**: `spotify.js` correctly handles this by returning `null` for audio features, and `App.svelte` falls back to metadata-only analysis. The app does not crash.
  - **Issue**: The "Analyze Track" feature is less effective without audio features. The root cause of the consistent 403s needs to be identified.
  - **Potential External Causes**:
    - Spotify account limitations or specific regional API restrictions for the authenticated account.
    - Configuration issues in the Spotify Developer Dashboard for the plAIlist application.
    - Subtle issues with access token permissions despite no explicit scope being required for this endpoint.
  - **Recommended Investigation Steps (User-Side)**:
    1. Verify Spotify Developer Dashboard settings for the app.
    2. Test plAIlist with a different Spotify (Premium) account if possible.
    3. Test the `/v1/audio-features/{id}` endpoint directly using a tool like Postman/curl with a token for the affected user.
  - This issue is logged under "Bug Fixes & Improvements" for further monitoring.
- 📅 **May 29, 2025**: Refactored `Sidebar.svelte` and `App.svelte` to remove unused `trackSkipAction`, `trackLikeAction`, and `trackRemovalAction` props. These actions are expected to be handled directly by components like `NowPlaying.svelte` and `CurrentPlaylist.svelte` using the `behaviorTracker` instance, making the props redundant in `Sidebar.svelte`. This simplifies the component interface.

---

## 🐛 BUG FIXES & IMPROVEMENTS

### 🔍 Identified Issues

- [ ] **Persistent 403 Error on Audio Features API**: The Spotify API endpoint `/v1/audio-features/{id}` consistently returns a 403 Forbidden error for all tracks. While the app handles this by falling back to metadata-only analysis, the root cause needs investigation (potentially Spotify account/app config related). _(Noted: May 29, 2025)_
- [x] **Svelte Compilation/Accessibility Issues** - Navbar.svelte parse error and Settings.svelte accessibility warnings. _(Completed: May 29, 2025)_
