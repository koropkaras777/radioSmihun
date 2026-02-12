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
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

app.use('/music', express.static(join(__dirname, 'music')));

const clientDistPath = path.join(__dirname, '../client/dist');
app.use(express.static(clientDistPath));

const oligarchs = [
  { name: "Рінат Ахметов", img: "akhmetov.png" },
  { name: "Ігор Коломойський", img: "kolomoyskyi.png" },
  { name: "Петро Порошенко", img: "poroshenko.png" },
  { name: "Дмитро Фірташ", img: "firtash.png" },
  { name: "Віктор Пінчук", img: "pinchuk.png" },
  { name: "Вадим Новинський", img: "novynskyi.png" },
  { name: "Сергій Тарута", img: "taruta.png" },
  { name: "Геннадій Боголюбов", img: "boholyubov.png" },
  { name: "Сергій Льовочкін", img: "lyovochkin.png" },
  { name: "Григорій Суркіс", img: "surkis.png" },
  { name: "Ігор Суркіс", img: "isurkis.png" },
  { name: "Костянтин Жеваго", img: "zhevago.png" }
];
let activeUsers = {};

const radioEngine = new RadioEngine(join(__dirname, 'music'));

radioEngine.initialize().then(() => {
  console.log('Radio Engine initialized');
  radioEngine.start();

  setInterval(() => {
    const state = radioEngine.getState();
    io.emit('sync', state);
  }, 2000);
}).catch(err => {
  console.error('Failed to initialize radio engine:', err);
});

io.on('connection', (socket) => {
  const person = oligarchs[Math.floor(Math.random() * oligarchs.length)];
  activeUsers[socket.id] = { 
    name: person.name, 
    img: person.img, 
    color: '#' + Math.floor(Math.random()*16777215).toString(16) 
  };

  console.log('Client connected:', socket.id);

  io.emit('usersUpdate', Object.values(activeUsers));

  const state = radioEngine.getState();
  socket.emit('sync', state);

  socket.on('trackEnd', () => {
    radioEngine.onTrackEnd();
  });

  socket.on('trackDuration', (duration) => {
    radioEngine.setTrackDuration(duration);
  });
  
  socket.on('disconnect', () => {
    delete activeUsers[socket.id];
    io.emit('usersUpdate', Object.values(activeUsers));
    console.log('Client disconnected:', socket.id);
  });
});


const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Radio server running on port ${PORT}`);
  console.log(`Music files served at http://localhost:${PORT}/music/`);
});

app.use('/avatars', express.static(join(__dirname, 'public', 'avatars')));

app.get('*', (req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
});