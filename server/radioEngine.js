import { readdir } from 'fs/promises';
import { join, basename } from 'path'; // Додав basename для чистих назв
import { parseFile } from 'music-metadata';

export class RadioEngine {
  constructor(musicPath) {
    this.musicPath = musicPath; // Це шлях до папки /music
    this.playlist = [];
    this.trackMetadata = new Map();
    this.currentIndex = 0;
    this.startTime = null;
    this.isPlaying = false;
    this.currentTrack = null;
    this.currentTrackDuration = null;
    this.initialized = false;
    this.currentMode = null; 
  }

  getDesiredMode() {
    const hour = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Kyiv',
      hour: 'numeric',
      hour12: false
    }).format(new Date());
    // 00:00 - 06:00 — Night (SOSUN), решта — Day (SMIHUN)
    return (hour >= 0 && hour < 6) ? 'night' : 'night';
  }

  async initialize() {
    try {
      const mode = this.getDesiredMode();
      this.currentMode = mode;
      
      // Склеюємо шлях: music + day/night
      const modePath = join(this.musicPath, mode);
      
      const files = await readdir(modePath);
      
      // Важливо: зберігаємо шлях як "day/track.ogg", 
      // щоб static server у index.js міг його знайти
      this.playlist = files
        .filter(file => file.toLowerCase().endsWith('.ogg'))
        .map(file => join(mode, file).replace(/\\/g, '/')); // Замінюємо зворотні слеші для URL
      
      if (this.playlist.length === 0) {
        throw new Error(`No OGG files found in ${modePath}`);
      }
      
      console.log(`[Radio] Loading ${mode} playlist (${this.playlist.length} tracks)`);
      
      await this.extractMetadata();
      this.shuffle();
      this.initialized = true;
    } catch (error) {
      console.error('Initialization error details:', error);
      throw error;
    }
  }

  async extractMetadata() {
    // Очищуємо стару карту метаданих перед завантаженням нових
    this.trackMetadata.clear();

    const metadataPromises = this.playlist.map(async (relativeFilePath) => {
      try {
        const fullPath = join(this.musicPath, relativeFilePath);
        const metadata = await parseFile(fullPath);
        
        const title = metadata.common.title || basename(relativeFilePath, '.ogg');
        const artist = metadata.common.artist || 'Unknown Artist';
        
        this.trackMetadata.set(relativeFilePath, { title, artist });
      } catch (error) {
        this.trackMetadata.set(relativeFilePath, { 
          title: basename(relativeFilePath, '.ogg'), 
          artist: 'Unknown Artist' 
        });
      }
    });

    await Promise.all(metadataPromises);
  }

  async nextTrack() {
    const desiredMode = this.getDesiredMode();

    if (this.currentMode !== desiredMode) {
      console.log(`[Radio] Mode switch: ${this.currentMode} -> ${desiredMode}`);
      await this.initialize();
      // initialize() скидає currentIndex на 0 і робить shuffle
    } else {
      this.currentIndex++;
      if (this.currentIndex >= this.playlist.length) {
        this.shuffle();
        this.currentIndex = 0;
      }
    }

    this.currentTrack = this.playlist[this.currentIndex];
    this.currentTrackDuration = null;
    this.startTime = Date.now();
  }

  // ... решта методів (getSeek, getState, shuffle, start) як у твоєму оригіналі
  // Тільки в getState переконайся, що він використовує оновлений плейлист
  
  getTrackMetadata(filename) {
    return this.trackMetadata.get(filename) || {
      title: basename(filename, '.ogg'),
      artist: 'Unknown Artist'
    };
  }
  
  shuffle() {
    for (let i = this.playlist.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.playlist[i], this.playlist[j]] = [this.playlist[j], this.playlist[i]];
    }
    this.currentIndex = 0;
  }

  start() {
    if (!this.initialized || this.playlist.length === 0) return;
    this.isPlaying = true;
    this.currentTrack = this.playlist[this.currentIndex];
    this.startTime = Date.now();
  }

  getSeek() {
    if (!this.isPlaying || !this.startTime || !this.currentTrack) return 0;
    const elapsed = (Date.now() - this.startTime) / 1000;
    if (this.currentTrackDuration && elapsed >= this.currentTrackDuration) return this.currentTrackDuration;
    return Math.max(0, elapsed);
  }

  setTrackDuration(duration) {
    this.currentTrackDuration = duration;
  }

  getState() {
    if (this.isPlaying && this.currentTrack && this.currentTrackDuration) {
      if (this.getSeek() >= this.currentTrackDuration - 0.1) {
        this.nextTrack();
      }
    }

    if (!this.currentTrack) return { track: null, seek: 0, isPlaying: false, playlist: [] };

    const seek = this.getSeek();
    const currentMetadata = this.getTrackMetadata(this.currentTrack);
    
    const upcoming = [];
    for (let i = 1; i <= 10 && i < this.playlist.length; i++) {
      const idx = (this.currentIndex + i) % this.playlist.length;
      const trackFile = this.playlist[idx];
      const metadata = this.getTrackMetadata(trackFile);
      upcoming.push({ filename: trackFile, title: metadata.title, artist: metadata.artist });
    }

    return {
      track: this.currentTrack,
      title: currentMetadata.title,
      artist: currentMetadata.artist,
      seek: seek,
      isPlaying: this.isPlaying,
      playlist: upcoming,
      currentIndex: this.currentIndex,
      totalTracks: this.playlist.length,
      mode: this.currentMode
    };
  }
  
  onTrackEnd() {
    this.nextTrack();
  }
}