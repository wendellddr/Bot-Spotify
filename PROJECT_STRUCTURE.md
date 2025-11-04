# Project Structure

This document explains the organization of the MusicMaestro project.

## 📁 Directory Structure

```
MusicMaestro/
├── src/                          # Source code
│   ├── bot/                      # Discord bot core
│   │   └── index.js             # Main bot entry point
│   ├── server/                   # Web server
│   │   └── web-server.js        # Express server for web interface
│   └── utils/                    # Utility modules
│       └── youtube-extractor.js # YouTube extractor utility
│
├── public/                        # Web interface files
│   ├── css/                      # Stylesheets
│   │   └── style.css
│   ├── js/                       # Client-side JavaScript
│   │   └── app.js
│   ├── index.html               # Main web interface
│   └── login.html               # Login page
│
├── docs/                         # Documentation
│   ├── DEPLOY.md
│   ├── DEPLOY-RAILWAY.md
│   ├── QUICK-START.md
│   ├── INSTALACAO-INTERFACE-WEB.md
│   └── ...                       # Other documentation files
│
├── scripts/                       # Utility scripts
│   └── install-ytdlp.ps1        # Installation script for yt-dlp
│
├── assets/                        # Static assets
│   └── logo_music_maestro.png
│
├── .env.example                  # Environment variables example
├── package.json                  # Node.js dependencies
├── nixpacks.toml                 # Railway deployment config
├── README.md                     # Main project README
└── yt-dlp.exe                    # YouTube downloader binary
```

## 🚀 Getting Started

### Installation

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.example` to `.env` and configure:
```bash
cp .env.example .env
```

3. Start the bot:
```bash
npm start
```

This will start both:
- **Discord Bot** - Handles Discord interactions and music playback
- **Web Server** - Provides web interface at `http://localhost:3000` (default)

## 📝 Key Files

- `src/bot/index.js` - Main bot logic, commands, and event handlers
- `src/server/web-server.js` - Express server for web interface
- `src/utils/youtube-extractor.js` - YouTube extraction utility
- `public/` - Web interface files served by Express

## 🔧 Development

- `npm start` - Start bot and web server
- `npm run dev` - Start with nodemon for auto-reload

## 📚 Documentation

All documentation files are in the `docs/` directory:
- Deployment guides
- Feature documentation
- Setup instructions

