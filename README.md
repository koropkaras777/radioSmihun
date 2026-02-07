# Synchronized Online Radio

A real-time synchronized online radio application built with Node.js (Express + Socket.io) and React.

## Features

- 🎵 Automatic playlist scanning from MP3 files
- 🔀 Shuffled playlist with auto-advance
- 🔄 Real-time synchronization across all clients
- 📡 WebSocket-based state broadcasting
- 🎨 Modern dark-mode UI with Tailwind CSS

## Project Structure

```
Radio/
├── server/           # Node.js backend
│   ├── music/        # Place your .mp3 files here
│   ├── index.js      # Express server with Socket.io
│   ├── radioEngine.js # Playlist and playback engine
│   └── package.json
└── client/           # React frontend
    ├── src/
    │   ├── App.jsx   # Main React component
    │   ├── main.jsx
    │   └── index.css
    └── package.json
```

## Setup Instructions

### 1. Install Server Dependencies

```bash
cd server
npm install
```

### 2. Install Client Dependencies

```bash
cd client
npm install
```

### 3. Add Music Files

Place your `.mp3` files in the `server/music/` directory.

### 4. Start the Server

```bash
cd server
npm start
```

The server will run on `http://localhost:3001`

### 5. Start the Client

In a new terminal:

```bash
cd client
npm run dev
```

The client will run on `http://localhost:3000`

## How It Works

### Backend

- **RadioEngine**: Manages the shuffled playlist and tracks the current playback position
- **Socket.io**: Broadcasts the current state (track, seek position, isPlaying) to all connected clients every 2 seconds
- **Static Serving**: Music files are served at `http://localhost:3001/music/[filename].mp3`

### Frontend

- **Audio Sync**: When the server sends a sync event, if the local playback time drifts more than 2 seconds from the server time, the audio element is force-synced
- **Auto-advance**: When a track ends, the client notifies the server, which advances to the next track
- **Join Button**: Handles browser autoplay policies by requiring user interaction before starting audio

## Usage

1. Start both server and client
2. Open `http://localhost:3000` in your browser
3. Click "Join Radio" to start listening
4. All connected clients will be synchronized to the same playback position

## Development

- Server: `npm run dev` (uses Node.js watch mode)
- Client: `npm run dev` (Vite dev server with hot reload)

