# plAIlist - AI-Powered Spotify Playlist Manager

**plAIlist** is an Electron desktop application that uses AI to automatically generate and manage Spotify playlists based on natural language descriptions. The app monitors your listening behavior and dynamically adapts playlists like a smart radio.

## Features

- 🎵 **AI-Driven Playlist Generation**: Describe your mood and get perfect playlists
- 🔄 **Dynamic Management**: Real-time playlist adaptation based on listening behavior
- 📱 **Playback Monitoring**: Track current playback state and user engagement
- 🎛️ **Spotify Integration**: Full Spotify Web API integration
- 🎨 **Modern UI**: Beautiful Bootstrap 5 interface
- ⚡ **Desktop App**: Built with Electron for Windows, macOS, and Linux

## Prerequisites

Before running plAIlist, you'll need:

1. **Node.js** (v16 or later)
2. **Spotify Premium Account** (required for playback control)
3. **Spotify Developer App** (for API access)
4. **OpenAI API Key** (for AI playlist generation)

## Setup Instructions

### 1. Clone and Install

```bash
git clone <repository-url>
cd plAIlist
npm install
```

### 2. Configure Spotify API

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create a new app
3. Add `http://127.0.0.1:8080/callback` to Redirect URIs
4. Note your Client ID and Client Secret

### 3. Get OpenAI API Key

1. Go to [OpenAI API Keys](https://platform.openai.com/api-keys)
2. Create a new API key
3. Note the key (starts with `sk-`)

### 4. Configure Environment

1. Copy `.env.example` to `.env`:

   ```bash
   copy .env.example .env
   ```

2. Edit `.env` and add your API keys:
   ```
   SPOTIFY_CLIENT_ID=your_client_id_here
   SPOTIFY_CLIENT_SECRET=your_client_secret_here
   OPENAI_API_KEY=your_openai_api_key_here
   ```

### 5. Run the Application

```bash
# Development mode (with DevTools)
npm run dev

# Production mode
npm start
```

## Usage

### Getting Started

1. **Connect Spotify**: Click "Connect Spotify" and authorize the app
2. **Describe Your Playlist**: Enter a description like "upbeat indie rock for a road trip"
3. **Generate**: Click "Generate Playlist" and watch AI create your perfect playlist
4. **Play & Enjoy**: Control playback directly from the app

### Example Descriptions

- "Chill lo-fi beats for studying and focus"
- "High-energy workout music with electronic and hip-hop"
- "Romantic jazz and soul for a dinner date"
- "90s alternative rock nostalgia"
- "Ambient electronic music for coding"

### Smart Features

- **Auto-Adapt Mode**: Automatically adjusts playlists based on skips and listening behavior
- **Discovery Level**: Control how adventurous vs. familiar your music recommendations are
- **Recent Playlists**: Quick access to previously generated playlists
- **Playback Monitoring**: Real-time display of current track and progress

## Project Structure

```
plAIlist/
├── src/
│   ├── main.js              # Electron main process
│   ├── preload.js           # Secure IPC communication
│   └── renderer/
│       ├── index.html       # Main UI
│       ├── css/
│       │   └── style.css    # Custom styles
│       └── js/
│           ├── app.js       # Main application logic
│           ├── spotify.js   # Spotify API integration
│           └── ai.js        # AI playlist generation
├── package.json
├── .env.example             # Environment template
└── README.md
```

## API Integration

### Spotify Web API

The app uses these Spotify endpoints:

- Authentication & token management
- Playlist creation and modification
- Playback control and monitoring
- Track search and recommendations
- User profile and listening history

### OpenAI API

- GPT-4 for intelligent playlist concept generation
- Natural language processing for user descriptions
- Smart track selection and ranking algorithms

## Development

### Available Scripts

- `npm start` - Run the app in production mode
- `npm run dev` - Run with development tools enabled
- `npm run build` - Build the app for distribution (coming soon)

### Architecture

- **Main Process**: Handles window management, security, and system integration
- **Renderer Process**: Contains the UI and application logic
- **Preload Script**: Secure bridge between main and renderer processes
- **IPC Communication**: Safe inter-process communication for sensitive operations

## Security

- No Node.js APIs exposed to renderer process
- Secure token storage in local storage
- OAuth flow handled in separate window
- Content Security Policy implemented
- All external links open in default browser

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Troubleshooting

### Common Issues

**"Spotify Client ID not configured"**

- Make sure your `.env` file has the correct `SPOTIFY_CLIENT_ID`

**"Authentication expired"**

- Try disconnecting and reconnecting your Spotify account

**"Failed to generate playlist"**

- Check your OpenAI API key and ensure you have credits
- Verify your internet connection

**No playback controls**

- Ensure you have Spotify Premium
- Make sure Spotify is running on at least one device

### Debug Mode

Run with debug mode for detailed logging:

```bash
npm run dev
```

## License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Spotify Web API](https://developer.spotify.com/documentation/web-api/) for music data and playback control
- [OpenAI API](https://platform.openai.com/) for AI-powered playlist generation
- [Electron](https://www.electronjs.org/) for the desktop app framework
- [Bootstrap 5](https://getbootstrap.com/) for the beautiful UI components
