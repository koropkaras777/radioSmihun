import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { RadioEngine } from './radioEngine.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readdir } from 'fs/promises';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "https://radiosmihun.onrender.com",
    methods: ["GET", "POST"]
  }
});
const clientDistPath = path.join(__dirname, '../client/dist');

app.use(cors());
app.use(express.json());

app.use(express.static(clientDistPath));

app.get('*', (req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

express.static.mime.define({'audio/mpeg': ['mp3']});
// Static serve the music folder
app.use('/music', express.static(join(__dirname, 'music')));

// Initialize Radio Engine
const radioEngine = new RadioEngine(join(__dirname, 'music'));

// Initialize and start the radio
radioEngine.initialize().then(() => {
  console.log('Radio Engine initialized');
  radioEngine.start();
  
  // Broadcast state every 2 seconds
  setInterval(() => {
    const state = radioEngine.getState();
    io.emit('sync', state);
  }, 2000);
}).catch(err => {
  console.error('Failed to initialize radio engine:', err);
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Send current state immediately on connection
  const state = radioEngine.getState();
  socket.emit('sync', state);
  
  // Handle track end event from client
  socket.on('trackEnd', () => {
    radioEngine.onTrackEnd();
  });

  // Handle track duration from client
  socket.on('trackDuration', (duration) => {
    radioEngine.setTrackDuration(duration);
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});


const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Radio server running on port ${PORT}`);
  console.log(`Music files served at http://localhost:${PORT}/music/`);
});

