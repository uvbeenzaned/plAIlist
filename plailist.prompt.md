# plAIlist - AI-Powered Spotify Playlist Manager - LLM Technical Guide

## 1. Project Overview

**plAIlist** is an Electron desktop app using AI (OpenAI API) to generate and manage Spotify playlists. It adapts playlists in real-time based on user input and listening patterns.
**Primary Goal**: Act as a dynamic, AI-driven radio.
**Key File**: `TODOS.md` is the **single source of truth** for features, priorities, and progress.

## 2. Core Technologies

- **Framework**: Electron (latest)
- **Frontend**: Svelte 5 (Runes), HTML5, CSS3, Bootstrap 5
- **Build Tool**: Vite
- **Backend**: Node.js
- **APIs**: Spotify Web API, OpenAI API (GPT-4o-mini primary)
- **Language**: JavaScript (ES2022+)

## 3. Svelte 5 Runes Syntax (MANDATORY)

**This project exclusively uses Svelte 5 with "runes" syntax. NO traditional Svelte reactivity (`$:`, `export let`).**

### Key Rune Patterns:

- **State**: `let count = $state(0);`
- **Derived State**: `let doubled = $derived(count * 2);`
- **Props**:
  ```javascript
  let {
    requiredProp,
    optionalProp = "default",
    bindableProp = $bindable() // For two-way binding
  } = $props();
  ```
- **Effects (Lifecycle & Reactivity)**:
  ```javascript
  $effect(() => {
    // Runs when dependencies change
    console.log("Prop changed:", requiredProp);
    return () => {
      /* cleanup */
    };
  });
  ```
- **Event Handling**: `<button onclick={handler}>` or `<button onclick={() => handler(arg)}>`. NOT `on:click`.

### Component Structure:

```svelte
<script>
  // Imports
  // let { prop1 = $bindable() } = $props();
  // let localState = $state(0);
  // let derived = $derived(localState * 2);
  // $effect(() => { /* ... */ });
  // function handleClick() { /* ... */ }
</script>
<!-- HTML -->
<!-- Use standard HTML comments for notes in the template. -->
<!-- Avoid inline comments within attribute values. -->
<!-- Example: <div class="my-class"> <!-- This is a good comment --> <!--</div> -->
```

- **HTML Comments**: In the template (markup) section of `.svelte` files, use standard HTML comments (`<!-- comment -->`) for commenting out HTML structure or adding descriptive notes.
  - Avoid using Svelte comments (`{/* comment */}`) for this purpose in the HTML block; reserve Svelte comments for the `<script>` tag or for commenting out Svelte-specific logic blocks (e.g., `{#if}`, `{#each}`).
  - Do not place comments directly inline within an element's attribute string (e.g., `class="btn <!-- avoid this -->"`). If a comment pertains to an attribute, place it before or after the attribute, or after the opening tag.

## 4. Project Structure (Key Files)

```
plAIlist/
├── src/
│   ├── main.js              # Electron main
│   ├── config.js            # Config loader
│   ├── preload.js           # Electron IPC bridge
│   └── renderer/
│       ├── App.svelte       # Root Svelte component
│       ├── components/      # Svelte components
│       └── js/              # Core JS modules
│           ├── spotify.js   # Spotify API logic
│           ├── ai.js        # OpenAI API logic
│           └── behaviorTracker.js # User behavior
├── TODOS.md                 # ⭐ MAIN DEVELOPMENT ROADMAP
└── plailist.prompt.md       # This file
```

## 5. Key Architecture Patterns

- **Electron Security**: Main (Node.js) ↔ Preload (IPC) ↔ Renderer (Sandboxed UI).
- **Svelte 5 State Flow**: `App.svelte` is main state hub. Props down, `$bindable()` for two-way.
- **API Classes**: `SpotifyAPI`, `AIPlaylistGenerator`, `BehaviorTracker` are stateful services.

## 6. LLM Technical Guidance

### Electron IPC:

- **Main**: `ipcMain.handle('channel', async (event, ...args) => { /* ... */ });`
- **Preload**: `contextBridge.exposeInMainWorld('electronAPI', { func: (...args) => ipcRenderer.invoke('channel', ...args) });`
- **Renderer**: `await window.electronAPI.func(...args);`

### API Class Structure (Example):

```javascript
class SpotifyAPI {
  // constructor, accessToken, refreshToken
  async makeApiRequest(endpoint, options) {
    /* Handles auth, errors, retries */
  }
  async getPlaybackState() {
    /* ... */
  }
}
```

### Component Communication:

- **Parent to Child**: Props (`<Child {prop} />`)
- **Child to Parent**: Callbacks (`<Child onEvent={handler} />`) or `$bindable()` props.

### Error Handling:

- **API Calls**: `try/catch`, check `response.ok`, handle 401 (token refresh).
- **UI**: Use `$state` for error messages, display reactively. Avoid `alert()`.

### Development Environment:

- `npm run dev` (Vite dev server)
- `npm run electron:dev` (Electron app in dev mode)

### Common Gotchas for LLMs:

- **ALWAYS use Svelte 5 Runes.** No `export let`, no `$:`.
- **NO direct DOM manipulation.** Use Svelte's reactive state.
- **Use `async/await`** for all API calls and IPC `invoke`.

### File Modification Guidelines:

- **Svelte Components**: Strict Runes syntax. Manage loading/error states.
- **API Classes**: Maintain error handling, auth flows.
- **New Features**:
  1. **Consult `TODOS.md`** for priority and notes.
  2. Follow existing patterns.
  3. Test thoroughly.

## 7. Development Workflow & Progress Tracking

**`TODOS.md` is the SINGLE SOURCE OF TRUTH for all development tasks, priorities, and progress.**

### Mandatory Workflow:

1.  **CHECK `TODOS.md`**: Identify current priorities (HIGH > MEDIUM > LOW) and next task.
2.  **UPDATE `TODOS.md`**:
    - Set the "Current Active Development" section.
    - Note start date, target, status.
3.  **IMPLEMENT**:
    - Follow Svelte 5 Runes and project patterns.
    - Implement robust error handling.
4.  **VALIDATE & UPDATE `TODOS.md`**:
    - Test thoroughly.
    - Mark feature `[x]` in `TODOS.md` with completion date.
    - Update "Completion Statistics" in `TODOS.md`.
    - Add a "Progress Note" in `TODOS.md`.
5.  **CODE CLEANUP**:
    - Remove `console.log` (except `error`/`warn`), `debugger`, temp comments.
    - Use PowerShell scripts (see below) for scanning if needed.
6.  **GIT WORKFLOW**:
    - Conventional commits (`feat:`, `fix:`, etc.).
    - Push to `develop` branch (or feature branch). `master` is for production-ready code.

### Git Workflow:

- **`master`**: Production-ready.
- **`develop`**: Active development, feature integration.
- **`feature/name`**: For larger, isolated features.

### Code Cleanup (Post-Feature):

- **Remove**: `console.log/debug`, `alert()`, `debugger`, `// DEBUG`, `// TEMP`.
- **Keep**: `console.error/warn` (for critical issues).
- **Scan (PowerShell example)**:
  ```powershell
  # Get-ChildItem -Path "src\" -Recurse -Include "*.js","*.svelte" | Select-String "console\.(log|debug)"
  # Get-ChildItem -Path "src\" -Recurse -Include "*.js","*.svelte" | Select-String "debugger|alert\("
  ```

### Development Rules:

1.  **`TODOS.md` FIRST**: No work without checking and updating it.
2.  **PRIORITIES**: Follow HIGH → MEDIUM → LOW from `TODOS.md`.
3.  **STATISTICS**: Keep `TODOS.md` statistics current.

## 8. Critical Svelte 5 Notes (from past issues)

- **`$derived.by(() => { ... })`**: Use for multi-line or complex derived calculations. Simple `$derived(expression)` is for single expressions. Incorrect usage can lead to UI rendering code fragments.
- **State Management**: Centralize shared state in parent components (e.g., `App.svelte`) and pass via props. Avoid isolated state for shared data.

---

**ALWAYS refer to `TODOS.md` for the most current feature list, priorities, detailed status, and implementation notes.** This `plailist.prompt.md` file provides overarching technical guidance and workflow.

_Last condensed: May 28, 2025_
