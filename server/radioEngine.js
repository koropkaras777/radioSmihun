import { readdir } from 'fs/promises';
import { join, basename } from 'path'; 
import { parseFile } from 'music-metadata';

export class RadioEngine {
  constructor(musicPath) {
    this.musicPath = musicPath;
    this.dayStartHour = parseInt(process.env.DAY_START_HOUR) || 6;
    this.nightStartHour = parseInt(process.env.NIGHT_START_HOUR) || 0;
    this.playlist = [];
    this.trackMetadata = new Map();
    this.currentIndex = 0;
    this.startTime = null;
    this.isPlaying = false;
    this.currentTrack = null;
    this.currentTrackDuration = null;
    this.initialized = false;
    this.currentMode = null;
    this.isTransitioning = false; 
    this.minTrackPlayTime = 5000;
  }

  getDesiredMode() {
    const now = new Date();
    const kyivTime = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Kyiv',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false
    }).format(now);
  
    const [hour, minute] = kyivTime.split(':').map(Number);

    //return (hour >= this.nightStartHour && hour < this.dayStartHour) ? 'night' : 'day';
    return (minute >= this.nightStartHour && hour < this.dayStartHour) ? 'night' : 'day';
  }

  async initialize() {
    try {
      const mode = this.getDesiredMode();
      this.currentMode = mode;
      
      const modePath = join(this.musicPath, mode);
      
      const files = await readdir(modePath);

      this.playlist = files
        .filter(file => file.toLowerCase().endsWith('.ogg'))
        .map(file => join(mode, file).replace(/\\/g, '/'));
      
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

  async nextTrack(force = false) {
    const now = Date.now();
    const timePlayed = this.startTime ? now - this.startTime : 0;

    if (!force && timePlayed < this.minTrackPlayTime && this.currentTrack) {
      console.log(`[Radio] Prevented premature track skip. Played only ${timePlayed}ms`);
      return;
    }

    const desiredMode = this.getDesiredMode();

    if (this.currentMode !== desiredMode) {
      console.log(`[Radio] Mode switch detected: ${this.currentMode} -> ${desiredMode}`);
      
      this.isTransitioning = true; 
      this.isPlaying = false;
      this.currentTrack = null;

      try {
        await this.initialize(); 

        await new Promise(resolve => setTimeout(resolve, 3000));
        
        console.log(`[Radio] Transition to ${desiredMode} complete.`);
      } catch (err) {
        console.error('Transition error:', err);
      } finally {
        this.isTransitioning = false;
        this.start();
      }
    } else {
      this.currentIndex++;
      if (this.currentIndex >= this.playlist.length) {
        this.shuffle();
        this.currentIndex = 0;
      }
      this.currentTrack = this.playlist[this.currentIndex];
      this.currentTrackDuration = null;
      this.startTime = Date.now();
      console.log(`[Radio] Playing: ${this.currentTrack}`);
    }
  }
  
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
    if (this.isTransitioning || !this.currentTrack) {
      return { 
        track: null, 
        seek: 0, 
        isPlaying: false, 
        playlist: [], 
        mode: this.currentMode,
        isPreparing: true 
      };
    }

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
    this.nextTrack(false);
  }
}