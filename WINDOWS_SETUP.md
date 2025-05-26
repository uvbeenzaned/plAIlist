# Windows Setup Guide for plAIlist

This guide will walk you through setting up plAIlist on Windows step-by-step.

## Prerequisites

### 1. Install Node.js

1. Go to [nodejs.org](https://nodejs.org/)
2. Download the LTS version for Windows
3. Run the installer and follow the setup wizard
4. Verify installation by opening PowerShell and running:
   ```powershell
   node --version
   npm --version
   ```

## Project Setup

### 1. Open PowerShell in the Project Directory

1. Open Windows Explorer and navigate to your plAIlist folder
2. Hold Shift and right-click in the folder
3. Select "Open PowerShell window here"

### 2. Install Dependencies

```powershell
npm install
```

### 3. Set Up Environment Configuration

1. Copy the example environment file:

   ```powershell
   Copy-Item .env.example .env
   ```

2. Open the `.env` file in Notepad or VS Code:
   ```powershell
   notepad .env
   ```

## API Configuration

### 1. Spotify API Setup

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Log in with your Spotify account
3. Click "Create an App"
4. Fill in the details:
   - App name: "plAIlist"
   - App description: "AI-powered playlist manager"
   - Website: Leave blank
   - Redirect URI: `http://127.0.0.1:8080/callback`
5. Check the boxes for Terms of Service
6. Click "Create"
7. Copy your Client ID and Client Secret
8. In your `.env` file, replace:
   ```
   SPOTIFY_CLIENT_ID=your_spotify_client_id_here
   SPOTIFY_CLIENT_SECRET=your_spotify_client_secret_here
   ```

### 2. OpenAI API Setup

1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Sign up or log in
3. Go to [API Keys](https://platform.openai.com/api-keys)
4. Click "Create new secret key"
5. Copy the key (starts with `sk-`)
6. In your `.env` file, replace:
   ```
   OPENAI_API_KEY=your_openai_api_key_here
   ```

### 3. Important Security Notes

- **Never share your API keys**
- **Never commit the .env file to version control**
- **The .env file should only exist on your local machine**

## Running the Application

### Development Mode (with debugging)

```powershell
npm run dev
```

### Production Mode

```powershell
npm start
```

## Testing the Setup

1. **Start the application** using one of the commands above
2. **Check for configuration warnings** - if you see yellow warning messages, double-check your .env file
3. **Connect to Spotify** - click the "Connect Spotify" button and authorize the app
4. **Test playlist generation** - describe a playlist like "upbeat indie rock" and click "Generate Playlist"

## Troubleshooting

### Common Issues

**"Spotify Client ID not configured"**

- Check that your `.env` file exists in the root folder
- Verify that `SPOTIFY_CLIENT_ID` is set correctly
- Make sure there are no extra spaces or quotes around the value

**"Authentication expired"**

- Try clicking "Connect Spotify" again
- Check that your redirect URI in Spotify dashboard is exactly: `http://127.0.0.1:8080/callback`

**"AI API key not configured"**

- Verify that `OPENAI_API_KEY` is set in your `.env` file
- Make sure you have credits in your OpenAI account
- Check that the API key starts with `sk-`

**Application won't start**

- Make sure you ran `npm install` first
- Check that Node.js is properly installed
- Try deleting `node_modules` folder and running `npm install` again:
  ```powershell
  Remove-Item -Recurse -Force node_modules
  npm install
  ```

**Port already in use**

- Make sure you don't have another instance of the app running
- Check if another application is using port 3000

### Getting Help

If you encounter issues:

1. Check the console for error messages (press F12 in the app)
2. Verify all API keys are correctly set in the `.env` file
3. Make sure your Spotify account has Premium (required for playback control)
4. Check the README.md file for additional troubleshooting

## Next Steps

Once everything is working:

1. Try generating different types of playlists
2. Experiment with the auto-adapt and discovery settings
3. Test the playback controls with Spotify running
4. Check out the keyboard shortcuts (Ctrl+N for new playlist, Space for play/pause)

Enjoy your AI-powered music experience! 🎵
