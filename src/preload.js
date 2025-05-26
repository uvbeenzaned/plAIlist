const { contextBridge, ipcRenderer } = require("electron");

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("electronAPI", {
  // App utilities
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  getAppConfig: () => ipcRenderer.invoke("get-app-config"),
  validateConfig: () => ipcRenderer.invoke("validate-config"),

  // Spotify authentication
  spotifyAuth: (authUrl) => ipcRenderer.invoke("spotify-auth", authUrl),

  // Window controls
  minimize: () => ipcRenderer.invoke("window-minimize"),
  maximize: () => ipcRenderer.invoke("window-maximize"),
  close: () => ipcRenderer.invoke("window-close"),

  // Environment info
  platform: process.platform,

  // Console logging for debugging
  log: (message) => console.log(message),

  // Event listeners
  on: (channel, callback) => {
    const validChannels = ["spotify-playback-update", "playlist-updated"];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, callback);
    }
  },

  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
});

// Security: Remove access to Node.js APIs in renderer process
delete window.require;
delete window.exports;
delete window.module;
