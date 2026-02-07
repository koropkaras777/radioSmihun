import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const SERVER_URL = 'http://localhost:3001';

function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [isJoined, setIsJoined] = useState(false);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [currentTitle, setCurrentTitle] = useState(null);
  const [currentArtist, setCurrentArtist] = useState(null);
  const [seek, setSeek] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false); // Local pause state
  const [playlist, setPlaylist] = useState([]);
  const [duration, setDuration] = useState(0);
  const [radioName, setRadioName] = useState('Radio SOSUN');
  
  const audioRef = useRef(null);
  const socketRef = useRef(null);
  const lastSyncTimeRef = useRef(0);
  const isSyncingRef = useRef(false);
  const hasStartedPlaybackRef = useRef(false);
  const joinTimeRef = useRef(0);
  const initialServerSeekRef = useRef(null);
  const hasInitialSyncedRef = useRef(false);
  const pauseTimeRef = useRef(null);
  const pauseServerSeekRef = useRef(null);
  const lastServerSeekRef = useRef(0);
  const resumeTimeRef = useRef(null);

  useEffect(() => {
    // Connect to Socket.io server
    socketRef.current = io(SERVER_URL);
    
    socketRef.current.on('connect', () => {
      console.log('Connected to server');
      setIsConnected(true);
    });

    socketRef.current.on('disconnect', () => {
      console.log('Disconnected from server');
      setIsConnected(false);
    });

    socketRef.current.on('sync', (state) => {
      if (!audioRef.current) return;

      const { track, title, artist, seek: serverSeek, isPlaying: serverIsPlaying, playlist: upcoming } = state;
      
      // Store last server seek position for resume sync
      lastServerSeekRef.current = serverSeek;
      
      // Update track metadata
      if (title) setCurrentTitle(title);
      if (artist) setCurrentArtist(artist);
      
      // Store initial server seek when first connecting (before joining)
      if (!isJoined && track && serverSeek !== undefined) {
        initialServerSeekRef.current = serverSeek;
      }

      // Update track if changed
      if (track && track !== currentTrack) {
        setCurrentTrack(track);
        hasInitialSyncedRef.current = false; // Reset for new track
        const audioUrl = `${SERVER_URL}/music/${encodeURIComponent(track)}`;
        if (audioRef.current.src !== audioUrl) {
          audioRef.current.src = audioUrl;
          audioRef.current.load();
          // Set initial seek position after loading
          audioRef.current.addEventListener('loadeddata', () => {
            if (audioRef.current && serverIsPlaying && isJoined) {
              // Use the stored initial seek or current server seek
              const targetSeek = initialServerSeekRef.current !== null ? initialServerSeekRef.current : serverSeek;
              audioRef.current.currentTime = targetSeek;
              hasInitialSyncedRef.current = true;
              // Only play if not already playing
              if (audioRef.current.paused) {
                audioRef.current.play().catch(err => console.error('Play error:', err));
              }
            }
          }, { once: true });
        }
      } else if (track && isJoined && !audioRef.current.src) {
        // Track is set but audio hasn't been loaded yet (user just joined)
        const audioUrl = `${SERVER_URL}/music/${encodeURIComponent(track)}`;
        audioRef.current.src = audioUrl;
        audioRef.current.load();
      }

      // Update playlist
      setPlaylist(upcoming || []);

      // Sync playback state (only if joined and not manually paused)
      if (isJoined && !isPaused) {
        if (serverIsPlaying !== isPlaying) {
          setIsPlaying(serverIsPlaying);
          if (serverIsPlaying) {
            // Only play if currently paused to avoid interrupting playback
            if (audioRef.current.paused) {
              audioRef.current.play().catch(err => console.error('Play error:', err));
            }
          } else {
            if (!audioRef.current.paused) {
              audioRef.current.pause();
            }
          }
        }

        // Sync seek position - only sync if drift is significant and not currently syncing
        if (audioRef.current && audioRef.current.readyState >= 2 && !isSyncingRef.current) {
          const localSeek = audioRef.current.currentTime;
          const drift = Math.abs(localSeek - serverSeek);
          const now = Date.now();
          
          // Initial sync: immediately sync when first joining (before audio starts)
          if (!hasInitialSyncedRef.current && isJoined) {
            const targetSeek = initialServerSeekRef.current !== null ? initialServerSeekRef.current : serverSeek;
            if (Math.abs(localSeek - targetSeek) > 0.5) {
              isSyncingRef.current = true;
              audioRef.current.currentTime = targetSeek;
              setSeek(targetSeek);
              hasInitialSyncedRef.current = true;
              lastSyncTimeRef.current = now;
              isSyncingRef.current = false;
              return; // Skip the rest of sync logic for initial sync
            } else {
              hasInitialSyncedRef.current = true;
            }
          }
          
          // Don't sync for the first 2 seconds after initial sync (grace period)
          const timeSinceJoin = now - joinTimeRef.current;
          const timeSinceLastSync = now - lastSyncTimeRef.current;
          const shouldSkipSync = timeSinceJoin < 2000 || timeSinceLastSync < 2000;
          
          // Check if we just resumed from pause (within last 2 seconds) - sync immediately if drift > 1s
          const justResumed = resumeTimeRef.current !== null && (now - resumeTimeRef.current) < 2000;
          if (justResumed && drift > 1 && !audioRef.current.paused && !isPaused) {
            isSyncingRef.current = true;
            audioRef.current.currentTime = serverSeek;
            setSeek(serverSeek);
            lastSyncTimeRef.current = now;
            resumeTimeRef.current = null; // Clear resume tracking after sync
            isSyncingRef.current = false;
            return;
          }
          
          // Clear resume tracking if enough time has passed
          if (resumeTimeRef.current !== null && (now - resumeTimeRef.current) >= 2000) {
            resumeTimeRef.current = null;
          }
          
          // Only sync if:
          // 1. Drift is greater than 5 seconds (very lenient threshold for smoothness)
          // 2. We haven't synced in the last 2 seconds (prevent rapid syncs)
          // 3. Audio is actually playing
          // 4. We're past the grace period after joining
          if (!shouldSkipSync && drift > 5 && serverIsPlaying && !isPaused) {
            isSyncingRef.current = true;
            console.log(`Drift detected: ${drift.toFixed(2)}s, syncing...`);
            
            // Use requestAnimationFrame for smoother sync
            requestAnimationFrame(() => {
              if (audioRef.current && !audioRef.current.paused) {
                // Only sync if playing - don't interrupt if paused
                audioRef.current.currentTime = serverSeek;
                setSeek(serverSeek);
                lastSyncTimeRef.current = now;
              }
              isSyncingRef.current = false;
            });
          } else {
            // No significant drift, use local time for smooth playback
            setSeek(localSeek);
          }
        } else if (!audioRef.current.src || audioRef.current.readyState < 2) {
          // Audio not ready yet, just show server time
          setSeek(serverSeek);
        }
      }
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [currentTrack, isPlaying, isJoined, isPaused]);

  // Handle audio metadata loaded
  const handleLoadedMetadata = () => {
    if (audioRef.current && socketRef.current) {
      const trackDuration = audioRef.current.duration;
      setDuration(trackDuration);
      // Send duration to server
      socketRef.current.emit('trackDuration', trackDuration);
    }
  };

  // Handle audio time update - let this run naturally for smooth playback
  const handleTimeUpdate = () => {
    if (audioRef.current && isJoined && !isSyncingRef.current) {
      // Only update if we're not currently syncing
      setSeek(audioRef.current.currentTime);
    }
  };

  // Handle track end
  const handleEnded = () => {
    // Notify server that track ended
    if (socketRef.current) {
      socketRef.current.emit('trackEnd');
      console.log('Track ended, notifying server');
    }
  };

  // Handle join radio button click
  const handleJoinRadio = async () => {
    setIsJoined(true);
    joinTimeRef.current = Date.now();
  };

  // Effect to handle starting playback when joining (only once)
  useEffect(() => {
    if (!isJoined || !audioRef.current || !currentTrack || hasStartedPlaybackRef.current) return;

    const audioUrl = `${SERVER_URL}/music/${encodeURIComponent(currentTrack)}`;
    
    // Load the track if not already loaded
    if (audioRef.current.src !== audioUrl) {
      audioRef.current.src = audioUrl;
      audioRef.current.load();
    }

    // Start playing when audio is ready (only once)
    const startPlayback = () => {
      if (audioRef.current && isPlaying && !hasStartedPlaybackRef.current) {
        hasStartedPlaybackRef.current = true;
        // Use the stored initial server seek position
        const targetSeek = initialServerSeekRef.current !== null ? initialServerSeekRef.current : 0;
        if (targetSeek > 0 && audioRef.current.readyState >= 2) {
          audioRef.current.currentTime = targetSeek;
          hasInitialSyncedRef.current = true;
        }
        audioRef.current.play()
          .then(() => {
            console.log('Joined radio - playback started');
          })
          .catch(err => {
            console.error('Failed to start audio:', err);
            hasStartedPlaybackRef.current = false; // Reset on error
          });
      }
    };

    if (audioRef.current.readyState >= 2) {
      // Audio is already loaded
      startPlayback();
    } else {
      // Wait for audio to load
      const handleLoad = () => {
        startPlayback();
        audioRef.current.removeEventListener('loadeddata', handleLoad);
        audioRef.current.removeEventListener('canplay', handleLoad);
      };
      audioRef.current.addEventListener('loadeddata', handleLoad, { once: true });
      audioRef.current.addEventListener('canplay', handleLoad, { once: true });
    }
  }, [isJoined, currentTrack, isPlaying]);

  // Reset playback flag when track changes
  useEffect(() => {
    if (currentTrack) {
      hasStartedPlaybackRef.current = false;
      hasInitialSyncedRef.current = false;
      initialServerSeekRef.current = null;
    }
  }, [currentTrack]);

  // Handle pause/play toggle
  const handlePausePlay = () => {
    if (!audioRef.current) return;
    
    if (isPaused) {
      // Resume playback - sync to server position if needed
      const localSeek = audioRef.current.currentTime;
      const serverSeek = lastServerSeekRef.current;
      const drift = Math.abs(localSeek - serverSeek);
      
      // If drift is more than 1 second, sync immediately on resume
      if (drift > 1) {
        audioRef.current.currentTime = serverSeek;
        setSeek(serverSeek);
        lastSyncTimeRef.current = Date.now();
        console.log(`Resuming after pause - syncing to server position (drift: ${drift.toFixed(2)}s)`);
      }
      
      // Clear pause tracking and mark resume time
      pauseTimeRef.current = null;
      pauseServerSeekRef.current = null;
      resumeTimeRef.current = Date.now();
      
      audioRef.current.play()
        .then(() => {
          setIsPaused(false);
        })
        .catch(err => {
          console.error('Failed to resume playback:', err);
        });
    } else {
      // Pause playback - store pause time and server position
      pauseTimeRef.current = Date.now();
      pauseServerSeekRef.current = lastServerSeekRef.current;
      audioRef.current.pause();
      setIsPaused(true);
    }
  };

  // Get radio name based on current time
  const getRadioName = () => {
    const now = new Date();
    const hours = now.getHours();
    // From 00:00 to 06:00 (0-5 hours) = Radio SOSUN
    // Other times = Radio SMIHUN
    return (hours >= 0 && hours < 6) ? 'Radio SOSUN' : 'Radio SMIHUN';
  };

  // Update radio name based on time
  useEffect(() => {
    // Set initial name
    setRadioName(getRadioName());

    // Update every minute to catch the 06:00 transition
    const interval = setInterval(() => {
      setRadioName(getRadioName());
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, []);

  // Format time helper
  const formatTime = (seconds) => {
    if (!isFinite(seconds) || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <h1 className="text-4xl font-bold mb-8 text-center">{radioName}</h1>
        
        {/* Connection Status */}
        <div className="mb-6 text-center">
          <span className={`inline-block px-4 py-2 rounded-full text-sm ${
            isConnected ? 'bg-green-600' : 'bg-red-600'
          }`}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>

        {/* Audio Element (hidden) */}
        <audio
          ref={audioRef}
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          preload="auto"
        />

        {/* Join Radio Button */}
        {!isJoined && (
          <div className="text-center mb-8">
            <button
              onClick={handleJoinRadio}
              className="bg-blue-600 hover:bg-blue-700 px-8 py-4 rounded-lg text-xl font-semibold transition-colors"
            >
              Join Radio
            </button>
          </div>
        )}

        {/* Current Track Info */}
        {isJoined && currentTrack && (
          <div className="bg-gray-800 rounded-lg p-6 mb-6">
            <h2 className="text-2xl font-semibold mb-4">Now Playing</h2>
            <div className="mb-4">
              {currentTitle && (
                <p className="text-2xl font-bold text-blue-400 mb-1">{currentTitle}</p>
              )}
              {currentArtist && (
                <p className="text-lg text-gray-300">{currentArtist}</p>
              )}
              {!currentTitle && (
                <p className="text-xl text-blue-400">{currentTrack}</p>
              )}
            </div>
            
            {/* Progress Bar */}
            <div className="mb-2">
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{ width: `${duration > 0 ? (seek / duration) * 100 : 0}%` }}
                />
              </div>
            </div>
            
            {/* Time Display */}
            <div className="flex justify-between text-sm text-gray-400">
              <span>{formatTime(seek)}</span>
              <span>{formatTime(duration)}</span>
            </div>

            {/* Play/Pause Controls */}
            <div className="mt-4 flex items-center justify-center gap-4">
              <button
                onClick={handlePausePlay}
                className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg text-lg font-semibold transition-colors flex items-center gap-2"
              >
                {isPaused ? (
                  <>
                    <span>▶</span>
                    <span>Play</span>
                  </>
                ) : (
                  <>
                    <span>⏸</span>
                    <span>Pause</span>
                  </>
                )}
              </button>
              <span className={`inline-block px-3 py-1 rounded text-sm ${
                isPaused ? 'bg-yellow-600' : (isPlaying ? 'bg-green-600' : 'bg-gray-600')
              }`}>
                {isPaused ? '⏸ Paused' : (isPlaying ? '▶ Playing' : '⏸ Stopped')}
              </span>
            </div>
          </div>
        )}

        {/* Upcoming Songs */}
        {isJoined && playlist.length > 0 && (
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-2xl font-semibold mb-4">Upcoming Songs</h2>
            <ul className="space-y-2">
              {playlist.map((track, index) => (
                <li
                  key={`${track.filename || track}-${index}`}
                  className="p-3 bg-gray-700 rounded hover:bg-gray-600 transition-colors"
                >
                  <span className="text-gray-400 mr-2">#{index + 1}</span>
                  {track.title && track.artist ? (
                    <div>
                      <span className="font-semibold">{track.title}</span>
                      <span className="text-gray-400 ml-2">by {track.artist}</span>
                    </div>
                  ) : (
                    <span>{track.filename || track}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Empty State */}
        {isJoined && !currentTrack && (
          <div className="bg-gray-800 rounded-lg p-6 text-center">
            <p className="text-gray-400">Waiting for music to start...</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;

