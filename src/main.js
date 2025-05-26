const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const config = require("./config");

const isDev = config.get("app", "isDevelopment");

// Keep a global reference of the window object
let mainWindow;

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, "preload.js")
    },
    icon: path.join(__dirname, "renderer/assets/icon.png"), // We'll add this later
    show: false, // Don't show until ready
    titleBarStyle: "default"
  });
  // Load the app
  if (isDev) {
    // In development, load from Vite dev server
    mainWindow.loadURL("http://localhost:3000");
  } else {
    // In production, load built files
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  // Show window when ready to prevent visual flash
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();

    // Open DevTools in development
    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
  });

  // Handle window closed
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

// App event listeners
app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  // On macOS, keep app running even when all windows are closed
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  // On macOS, re-create window when dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC handlers for communication with renderer process
ipcMain.handle("get-app-version", () => {
  return app.getVersion();
});

ipcMain.handle("get-app-config", () => {
  return config.getRendererConfig();
});

ipcMain.handle("validate-config", () => {
  return config.validateConfiguration();
});

ipcMain.handle("spotify-auth", async (event, authUrl) => {
  // Handle Spotify OAuth flow
  return new Promise((resolve, reject) => {
    const authWindow = new BrowserWindow({
      width: 500,
      height: 600,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      },
      parent: mainWindow,
      modal: true,
      show: false
    });

    authWindow.loadURL(authUrl);
    authWindow.show(); // Listen for the callback URL
    authWindow.webContents.on("will-redirect", (event, navigationUrl) => {
      if (navigationUrl.startsWith("http://127.0.0.1:8080/callback")) {
        event.preventDefault(); // Prevent the actual navigation

        const url = new URL(navigationUrl);
        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");

        authWindow.close();

        if (error) {
          reject(new Error(error));
        } else {
          resolve(code);
        }
      }
    });

    // Also listen for failed loads (in case will-redirect doesn't catch it)
    authWindow.webContents.on(
      "did-fail-load",
      (event, errorCode, errorDescription, validatedURL) => {
        if (validatedURL.startsWith("http://127.0.0.1:8080/callback")) {
          const url = new URL(validatedURL);
          const code = url.searchParams.get("code");
          const error = url.searchParams.get("error");

          authWindow.close();

          if (error) {
            reject(new Error(error));
          } else if (code) {
            resolve(code);
          } else {
            reject(new Error("No authorization code received"));
          }
        }
      }
    );

    authWindow.on("closed", () => {
      reject(new Error("User closed the authentication window"));
    });
  });
});

// Security: Prevent new window creation
app.on("web-contents-created", (event, contents) => {
  contents.on("new-window", (event, navigationUrl) => {
    event.preventDefault();
    shell.openExternal(navigationUrl);
  });
});
