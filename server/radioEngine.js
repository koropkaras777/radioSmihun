import { readdir } from 'fs/promises';
import { join } from 'path';
import { parseFile } from 'music-metadata';

export class RadioEngine {
  constructor(musicPath) {
    this.musicPath = musicPath;
    this.playlist = [];
    this.trackMetadata = new Map(); // Map filename -> {title, artist}
    this.currentIndex = 0;
    this.startTime = null;
    this.isPlaying = false;
    this.currentTrack = null;
    this.currentTrackDuration = null;
    this.initialized = false;
  }

  async initialize() {
    try {
      const files = await readdir(this.musicPath);
      this.playlist = files
        .filter(file => file.toLowerCase().endsWith('.ogg'))
        .map(file => file);
      
      if (this.playlist.length === 0) {
        throw new Error('No OGG files found in music directory');
      }
      
      // Extract metadata for all tracks
      console.log('Extracting metadata from OGG files...');
      await this.extractMetadata();
      
      this.shuffle();
      this.initialized = true;
      console.log(`Found ${this.playlist.length} OGG files`);
    } catch (error) {
      console.error('Error reading music directory:', error);
      throw error;
    }
  }

  async extractMetadata() {
    const metadataPromises = this.playlist.map(async (filename) => {
      try {
        const filePath = join(this.musicPath, filename);
        const metadata = await parseFile(filePath);
        
        const title = metadata.common.title || filename.replace('.ogg', '');
        const artist = metadata.common.artist || 'Unknown Artist';
        
        this.trackMetadata.set(filename, { title, artist });
        return { filename, title, artist };
      } catch (error) {
        console.warn(`Failed to extract metadata for ${filename}:`, error.message);
        // Fallback to filename if metadata extraction fails
        const title = filename.replace('.ogg', '');
        this.trackMetadata.set(filename, { title, artist: 'Unknown Artist' });
        return { filename, title, artist: 'Unknown Artist' };
      }
    });

    await Promise.all(metadataPromises);
    console.log('Metadata extraction complete');
  }

  getTrackMetadata(filename) {
    return this.trackMetadata.get(filename) || {
      title: filename.replace('.ogg', ''),
      artist: 'Unknown Artist'
    };
  }

  shuffle() {
    // Fisher-Yates shuffle algorithm
    for (let i = this.playlist.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.playlist[i], this.playlist[j]] = [this.playlist[j], this.playlist[i]];
    }
    this.currentIndex = 0;
  }

  start() {
    if (!this.initialized || this.playlist.length === 0) {
      console.error('Radio engine not initialized or no tracks available');
      return;
    }
    
    this.isPlaying = true;
    this.currentTrack = this.playlist[this.currentIndex];
    this.startTime = Date.now();
    const metadata = this.getTrackMetadata(this.currentTrack);
    console.log(`Now playing: ${metadata.artist} - ${metadata.title}`);
  }

  pause() {
    this.isPlaying = false;
  }

  resume() {
    if (!this.isPlaying && this.currentTrack) {
      this.isPlaying = true;
      // Adjust start time to account for pause duration
      const pauseDuration = Date.now() - (this.startTime + this.getSeek() * 1000);
      this.startTime = Date.now() - (this.getSeek() * 1000);
    }
  }

  getSeek() {
    if (!this.isPlaying || !this.startTime || !this.currentTrack) {
      return 0;
    }
    
    const elapsed = (Date.now() - this.startTime) / 1000;
    
    // Cap at duration if we know it
    if (this.currentTrackDuration && elapsed >= this.currentTrackDuration) {
      return this.currentTrackDuration;
    }
    
    return Math.max(0, elapsed);
  }

  checkAndAdvanceTrack() {
    // Check if current track should advance based on duration
    if (this.isPlaying && this.currentTrack && this.currentTrackDuration) {
      const seek = this.getSeek();
      if (seek >= this.currentTrackDuration - 0.1) {
        this.nextTrack();
        return true;
      }
    }
    return false;
  }

  setTrackDuration(duration) {
    this.currentTrackDuration = duration;
  }

  getState() {
    // Check if we need to advance to next track
    this.checkAndAdvanceTrack();

    if (!this.currentTrack) {
      return {
        track: null,
        seek: 0,
        isPlaying: false,
        playlist: []
      };
    }

    const seek = this.getSeek();
    const currentMetadata = this.getTrackMetadata(this.currentTrack);
    
    // Get upcoming songs (next 10 tracks) with metadata
    const upcoming = [];
    for (let i = 1; i <= 10 && i < this.playlist.length; i++) {
      const idx = (this.currentIndex + i) % this.playlist.length;
      const trackFile = this.playlist[idx];
      const metadata = this.getTrackMetadata(trackFile);
      upcoming.push({
        filename: trackFile,
        title: metadata.title,
        artist: metadata.artist
      });
    }

    return {
      track: this.currentTrack,
      title: currentMetadata.title,
      artist: currentMetadata.artist,
      seek: seek,
      isPlaying: this.isPlaying,
      playlist: upcoming,
      currentIndex: this.currentIndex,
      totalTracks: this.playlist.length
    };
  }


  nextTrack() {
    this.currentIndex++;
    
    if (this.currentIndex >= this.playlist.length) {
      // Re-shuffle and start over
      this.shuffle();
      this.currentIndex = 0;
    }
    
    this.currentTrack = this.playlist[this.currentIndex];
    this.currentTrackDuration = null; // Reset duration, will be set by client
    this.startTime = Date.now();
    const metadata = this.getTrackMetadata(this.currentTrack);
    console.log(`Now playing: ${metadata.artist} - ${metadata.title}`);
  }

  // Method to handle track end (called when client detects end)
  onTrackEnd() {
    this.nextTrack();
  }
}

