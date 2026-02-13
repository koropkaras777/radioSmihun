import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [isJoined, setIsJoined] = useState(false);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [currentTitle, setCurrentTitle] = useState(null);
  const [currentArtist, setCurrentArtist] = useState(null);
  const [seek, setSeek] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [playlist, setPlaylist] = useState([]);
  const [duration, setDuration] = useState(0);
  const [radioName, setRadioName] = useState('is loading...');
  const [listeners, setListeners] = useState([]);
  const [showOnlyOne, setShowOnlyOne] = useState(false);
  const [isBlurred, setIsBlurred] = useState(true);
  const [volume, setVolume] = useState(0.5);
  const [isMuted, setIsMuted] = useState(false);
  const [showVolumeBar, setShowVolumeBar] = useState(false);
  
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
    if (!socketRef.current) {
      socketRef.current = io(SERVER_URL);
    }

    const socket = socketRef.current;

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));

    socket.on('usersUpdate', (users) => {
      setListeners(users);
    });

    return () => {
      if (socket) {
        socket.off('connect');
        socket.off('disconnect');
        socket.off('usersUpdate');
      }
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  useEffect(() => {
    if (!socketRef.current) return;

    const handleSync = (state) => {
      if (!audioRef.current) return;

      const { track, title, artist, seek: serverSeek, isPlaying: serverIsPlaying, playlist: upcoming, mode, isPreparing } = state;

      if (isPreparing) {
        setRadioName("PREPARING MODE...");
        setCurrentTitle("Please wait...");
        setCurrentArtist("System");
        return; 
      }
      
      if (mode) {
        setRadioName(mode === 'night' ? 'Radio SOSUN' : 'Radio SMIHUN');
      }

      lastServerSeekRef.current = serverSeek;

      if (title) setCurrentTitle(title);
      if (artist) setCurrentArtist(artist);

      if (title && artist) {
        const mode = radioName.includes('SMIHUN') ? 'SMIHUN' : 'SOSUN';
        document.title = `${title} - ${artist} · Radio ${mode}`;
      } else {
        document.title = "Radio SMIHUN";
      }

      if (favicon) {
        const timestamp = new Date().getTime();
        const iconPath = radioName.includes('SMIHUN') ? '/icon-smihun-192.png' : '/icon-sosun-192.png';
        favicon.href = `${iconPath}?v=${timestamp}`;
      }

      if (!isJoined && track && serverSeek !== undefined) {
        initialServerSeekRef.current = serverSeek;
      }

      if (track && track !== currentTrack) {
        setCurrentTrack(track);
        hasInitialSyncedRef.current = false; // Reset for new track
        const audioUrl = `${SERVER_URL}/music/${encodeURIComponent(track)}`;
        if (audioRef.current.src !== audioUrl) {
          audioRef.current.src = audioUrl;
          audioRef.current.load();

          audioRef.current.addEventListener('loadeddata', () => {
            if (audioRef.current && serverIsPlaying && isJoined && !isPaused) {
              const targetSeek = initialServerSeekRef.current !== null ? initialServerSeekRef.current : serverSeek;
              audioRef.current.currentTime = targetSeek;
              hasInitialSyncedRef.current = true;

              if (audioRef.current.paused) {
                audioRef.current.play().catch(err => console.error('Play error:', err));
              }
            }
          }, { once: true });
        }
      } else if (track && isJoined && !audioRef.current.src) {
        const audioUrl = `${SERVER_URL}/music/${encodeURIComponent(track)}`;
        audioRef.current.src = audioUrl;
        audioRef.current.load();
      }

      setPlaylist(upcoming || []);

      if (isJoined && !isPaused) {
        if (serverIsPlaying !== isPlaying) {
          setIsPlaying(serverIsPlaying);
          if (serverIsPlaying) {
            if (audioRef.current.paused) {
              audioRef.current.play().catch(err => console.error('Play error:', err));
            }
          } else {
            if (!audioRef.current.paused) {
              audioRef.current.pause();
            }
          }
        }

        if (audioRef.current && audioRef.current.readyState >= 2 && !isSyncingRef.current) {
          const localSeek = audioRef.current.currentTime;
          const drift = Math.abs(localSeek - serverSeek);
          const now = Date.now();

          if (!hasInitialSyncedRef.current && isJoined) {
            const targetSeek = initialServerSeekRef.current !== null ? initialServerSeekRef.current : serverSeek;
            if (Math.abs(localSeek - targetSeek) > 0.5) {
              isSyncingRef.current = true;
              audioRef.current.currentTime = targetSeek;
              setSeek(targetSeek);
              hasInitialSyncedRef.current = true;
              lastSyncTimeRef.current = now;
              isSyncingRef.current = false;
              return; 
            } else {
              hasInitialSyncedRef.current = true;
            }
          }

          const timeSinceJoin = now - joinTimeRef.current;
          const timeSinceLastSync = now - lastSyncTimeRef.current;
          const shouldSkipSync = timeSinceJoin < 2000 || timeSinceLastSync < 2000;

          const justResumed = resumeTimeRef.current !== null && (now - resumeTimeRef.current) < 2000;
          if (justResumed && drift > 1 && !audioRef.current.paused && !isPaused) {
            isSyncingRef.current = true;
            audioRef.current.currentTime = serverSeek;
            setSeek(serverSeek);
            lastSyncTimeRef.current = now;
            resumeTimeRef.current = null; 
            isSyncingRef.current = false;
            return;
          }

          if (resumeTimeRef.current !== null && (now - resumeTimeRef.current) >= 2000) {
            resumeTimeRef.current = null;
          }

          if (!shouldSkipSync && drift > 5 && serverIsPlaying && !isPaused) {
            isSyncingRef.current = true;

            requestAnimationFrame(() => {
              if (audioRef.current && !audioRef.current.paused) {
                audioRef.current.currentTime = serverSeek;
                setSeek(serverSeek);
                lastSyncTimeRef.current = now;
              }
              isSyncingRef.current = false;
            });
          } else {
            setSeek(localSeek);
          }
        } else if (!audioRef.current.src || audioRef.current.readyState < 2) {
          setSeek(serverSeek);
        }
      }
    };

    socketRef.current.on('sync', handleSync);

    return () => {
      if (socketRef.current) {
        socketRef.current.off('sync', handleSync);
      }
    };
  }, [isJoined, isPaused, currentTrack]);
  
  const handleLoadedMetadata = () => {
    if (audioRef.current && socketRef.current) {
      const trackDuration = audioRef.current.duration;
      setDuration(trackDuration);
      // Send duration to server
      socketRef.current.emit('trackDuration', trackDuration);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current && isJoined && !isSyncingRef.current) {
      setSeek(audioRef.current.currentTime);
    }
  };

  const handleEnded = () => {
    if (socketRef.current) {
      socketRef.current.emit('trackEnd');
    }
  };

  const handleJoinRadio = async () => {
    setIsJoined(true);
    joinTimeRef.current = Date.now();
  };

  useEffect(() => {
    if (!isJoined || !audioRef.current || !currentTrack || hasStartedPlaybackRef.current || isPaused) return;

    const audioUrl = `${SERVER_URL}/music/${encodeURIComponent(currentTrack)}`;

    if (audioRef.current.src !== audioUrl) {
      audioRef.current.src = audioUrl;
      audioRef.current.load();
    }

    const startPlayback = () => {
      if (audioRef.current && isPlaying && !hasStartedPlaybackRef.current) {
        hasStartedPlaybackRef.current = true;

        const targetSeek = initialServerSeekRef.current !== null ? initialServerSeekRef.current : 0;
        if (targetSeek > 0 && audioRef.current.readyState >= 2) {
          audioRef.current.currentTime = targetSeek;
          hasInitialSyncedRef.current = true;
        }
        audioRef.current.play()
          .then(() => {
            //console.log('Joined radio - playback started');
          })
          .catch(err => {
            console.error('Failed to start audio:', err);
            hasStartedPlaybackRef.current = false;
          });
      }
    };

    if (audioRef.current.readyState >= 2) {
      startPlayback();
    } else {
      const handleLoad = () => {
        startPlayback();
        audioRef.current.removeEventListener('loadeddata', handleLoad);
        audioRef.current.removeEventListener('canplay', handleLoad);
      };
      audioRef.current.addEventListener('loadeddata', handleLoad, { once: true });
      audioRef.current.addEventListener('canplay', handleLoad, { once: true });
    }
  }, [isJoined, currentTrack, isPlaying]);

  useEffect(() => {
    if (currentTrack) {
      hasStartedPlaybackRef.current = false;
      hasInitialSyncedRef.current = false;
      initialServerSeekRef.current = null;
    }
  }, [currentTrack]);

  const handlePausePlay = () => {
    if (!audioRef.current) return;
    
    if (isPaused) {
      const localSeek = audioRef.current.currentTime;
      const serverSeek = lastServerSeekRef.current;
      const drift = Math.abs(localSeek - serverSeek);

      if (drift > 1) {
        audioRef.current.currentTime = serverSeek;
        setSeek(serverSeek);
        lastSyncTimeRef.current = Date.now();
      }

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
      pauseTimeRef.current = Date.now();
      pauseServerSeekRef.current = lastServerSeekRef.current;
      audioRef.current.pause();
      setIsPaused(true);
    }
  };

  const formatTime = (seconds) => {
    if (!isFinite(seconds) || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const displayLimit = 3;
  const visibleListeners = listeners.slice(0, displayLimit);
  const hiddenListeners = listeners.slice(displayLimit);
  const hiddenCount = hiddenListeners.length;

  const isNight = radioName === 'Radio SOSUN';

  return (
    <div className={`min-h-screen transition-colors duration-1000 ${
      isNight ? 'bg-[#0f0505]' : 'bg-gray-900'
    } text-white`}>
      <div className="flex justify-between items-start mb-4 p-4">
        <div className="flex flex-col items-start">
          <span className={`text-[10px] uppercase tracking-widest font-bold mb-2 ${
            isNight ? 'text-gray-500' : 'text-gray-500' //night text-red-900/60
          }`}>
            Сміхун Channel
          </span>
          <a 
            href="https://t.me/+RzdT3M2lQA4hFMA3" 
            target="_blank" 
            rel="noopener noreferrer"
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95 shadow-lg ${
              isNight ? 'bg-[#24A1DE] hover:bg-[#28b1f5]' : 'bg-[#24A1DE] hover:bg-[#28b1f5]' //night bg-[#4a0404] hover:bg-[#600505]
            }`}
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              width="28" 
              height="28" 
              fill="white" 
              className="bi bi-telegram" 
              viewBox="0 0 16 16"
            >
              <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0M8.287 5.906q-1.168.486-4.666 2.01-.567.225-.595.442c-.03.243.275.339.69.47l.175.055c.408.133.958.288 1.243.294q.39.01.868-.32 3.269-2.206 3.374-2.23c.05-.012.12-.026.166.016s.042.12.037.141c-.03.129-1.227 1.241-1.846 1.817-.193.18-.33.307-.358.336a8 8 0 0 1-.188.186c-.38.366-.664.64.015 1.088.327.216.589.393.85.571.284.194.568.387.936.629q.14.092.27.187c.331.236.63.448.997.414.214-.02.435-.22.547-.82.265-1.417.786-4.486.906-5.751a1.4 1.4 0 0 0-.013-.315.34.34 0 0 0-.114-.217.53.53 0 0 0-.31-.093c-.3.005-.763.166-2.984 1.09"/>
            </svg>
          </a>
        </div>

        <div className="flex flex-col items-end relative">
          <span className={`text-[9px] uppercase tracking-[0.2em] font-black  px-1 ${
            isNight ? 'text-red-900/60' : 'text-gray-500'
          }`}>
            Anonymous listeners
          </span>

          <div className="flex justify-end items-center gap-2 mb-4 pt-2 pr-1 relative">
            {/* Відображаємо перших трьох */}
            {visibleListeners.map((user, i) => (
              <div 
              key={i} 
              className="group relative flex items-center justify-center shrink-0"
              tabIndex="0" // Важливо для роботи фокусу на мобільних
            >
              <div 
                className="w-10 h-10 rounded-full border-2 overflow-hidden flex items-center justify-center transition-transform group-hover:scale-110 group-active:scale-95 shadow-sm"
                style={{ 
                  backgroundColor: user.color, 
                  borderColor: isNight ? '#4a0404' : '#fff',
                  cursor: 'pointer'
                }}
              >
                {user.img ? (
                  <img 
                    src={`${SERVER_URL}/avatars/${user.img}`} 
                    alt={user.name}
                    className="w-full h-full object-cover block"
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.nextSibling.style.display = 'flex';
                    }}
                  />
                ) : null}
                <span className="flex items-center justify-center w-full h-full text-[10px] font-bold"
                      style={{ display: user.img ? 'none' : 'flex' }}>
                  {user.name.split(' ')[1]?.[0] || user.name[0]}
                </span>
              </div>
            
              {/* Універсальна підказка: hover для ПК, focus/active для мобільних */}
              <div className={`absolute -bottom-10 right-0 px-2 py-1 rounded-md text-[10px] font-bold whitespace-nowrap z-50 pointer-events-none 
                opacity-0 translate-y-2 
                group-hover:opacity-100 group-hover:translate-y-0 
                group-focus:opacity-100 group-focus:translate-y-0 
                transition-all duration-200 shadow-lg ${
                isNight ? 'bg-[#4a0404] text-red-200 border border-red-900' : 'bg-gray-800 text-white'
              }`}>
                {user.name}
                
                <div className={`absolute -top-1 right-4 w-2 h-2 rotate-45 ${
                  isNight ? 'bg-[#4a0404]' : 'bg-gray-800'
                }`}></div>
              </div>
            </div>
            ))}

            {/* Якщо є більше 3 користувачів, показуємо лічильник з випадаючим списком */}
            {hiddenCount > 0 && (
              <div className="group relative">
                <div 
                  className={`w-10 h-10 rounded-full border-2 flex items-center justify-center text-xs font-bold cursor-pointer transition-all ${
                    isNight 
                      ? 'bg-[#3d1414]/80 border-[#4a0404] text-[#ff0000]' 
                      : 'bg-gray-700/80 border-white text-white'
                  }`}
                >
                  +{hiddenCount}
                </div>

                {/* Випадаючий список при наведенні (Tooltip) */}
                <div className={`absolute right-0 top-full mt-2 w-56 rounded-xl shadow-2xl p-3 z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 backdrop-blur-md ${
                  isNight 
                    ? 'bg-[#1a0505]/70 border border-[#4a0404]/50' 
                    : 'bg-white/70 border border-gray-200/50'
                }`}>
                  <p className={`text-[10px] uppercase tracking-wider font-black mb-3 pb-1 border-b ${
                    isNight ? 'text-red-900 border-red-900/30' : 'text-gray-800 border-gray-100'
                  }`}>
                    Other listeners
                  </p>
                  <ul className="max-h-60 overflow-y-auto space-y-3 custom-scrollbar">
                    {hiddenListeners.map((user, i) => (
                      <li key={i} className="flex items-center gap-3 group/item">
                        {/* Кружок з фото або літерою */}
                        <div 
                          className="w-8 h-8 rounded-full border flex items-center justify-center text-[10px] font-bold shrink-0 overflow-hidden relative"
                          style={{ 
                            backgroundColor: user.color, 
                            borderColor: isNight ? '#4a0404' : '#fff' 
                          }}
                        >
                          {user.img ? (
                            <img 
                              src={`${SERVER_URL}/avatars/${user.img}`} 
                              alt={user.name}
                              className="w-full h-full object-cover block"
                              onError={(e) => {
                                e.target.style.display = 'none';
                                e.target.nextSibling.style.display = 'flex';
                              }}
                            />
                          ) : null}

                          {/* Заглушка, якщо фото немає або воно не завантажилось */}
                          <span 
                            className="flex items-center justify-center w-full h-full"
                            style={{ display: user.img ? 'none' : 'flex' }}
                          >
                            {user.name.split(' ')[1]?.[0] || user.name[0]}
                          </span>
                        </div>

                        <span className={`text-xs font-medium truncate ${
                          isNight ? 'text-gray-200' : 'text-gray-700'
                        }`}>
                          {user.name}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <h1 
          className={`text-5xl font-extrabold mb-8 text-center transition-all duration-1000 tracking-wider`}
          style={{
            color: isNight ? '#bc0000' : '#ffffff', 
            WebkitTextStroke: isNight ? '1px #4a0404' : 'none', 
            textShadow: isNight ? '0 0 15px rgba(188, 0, 0, 0.3)' : 'none', 
            fontFamily: "'Segoe UI', Roboto, sans-serif"
          }}
        >{radioName}</h1>

        <div className="mb-6 text-center">
          <span className={`inline-block px-4 py-2 rounded-full text-sm ${
            isConnected ? 'bg-green-600' : 'bg-red-600'
          }`}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>

        <audio
          ref={audioRef}
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          preload="auto"
        />

        {!isJoined && (
          <div className="text-center mb-8">
            <button
              onClick={handleJoinRadio}
              className={`px-8 py-4 rounded-lg text-xl font-semibold transition-all ${
                isNight 
                  ? 'bg-[#8a0303] hover:bg-[#a00404] shadow-[0_0_15px_rgba(138,3,3,0.4)]' 
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              Join Radio
            </button>
          </div>
        )}

        {isJoined && currentTrack && (
          <div className="bg-gray-800 rounded-lg p-6 mb-6">
            <h2 className="text-2xl font-semibold mb-4">Now Playing</h2>
            <div className="mb-4">
              {currentTitle && (
                <p className={`text-2xl font-bold mb-1 transition-colors ${
                  isNight ? 'text-[#bc0000]' : 'text-blue-400'
                }`}>{currentTitle}</p>
              )}
              {currentArtist && (
                <p className="text-lg text-gray-300">{currentArtist}</p>
              )}
              {!currentTitle && (
                <p className="text-xl text-blue-400">{currentTrack}</p>
              )}
            </div>

            <div className="mb-2">
              <div className={`w-full rounded-full h-2 ${isNight ? 'bg-[#2d1212]' : 'bg-gray-700'}`}>
                <div
                  className={`h-2 rounded-full transition-all duration-300 ${
                    isNight ? 'bg-[#bc0000] shadow-[0_0_8px_rgba(188,0,0,0.5)]' : 'bg-blue-600'
                  }`}
                  style={{ width: `${duration > 0 ? (seek / duration) * 100 : 0}%` }}
                />
              </div>
            </div>

            <div className="flex justify-between text-sm text-gray-400">
              <span>{formatTime(seek)}</span>
              <span>{formatTime(duration)}</span>
            </div>

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
            </div>
          </div>
        )}

        {isJoined && (
          <div 
            className="fixed bottom-6 left-6 z-50 flex flex-col-reverse items-center group"
            onMouseEnter={() => setShowVolumeBar(true)}
            onMouseLeave={() => setShowVolumeBar(false)}
          >
            <button
              onClick={() => setIsMuted(!isMuted)}
              className={`relative z-20 w-14 h-14 flex items-center justify-center rounded-full shadow-2xl transition-all duration-300 active:scale-95 ${
                radioName.includes('SMIHUN') 
                  ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-900/40' 
                  : 'bg-red-600 hover:bg-red-500 shadow-red-900/40'
              }`}
            >
              <span className="text-2xl select-none">
                {isMuted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
              </span>
            </button>

            <div className={`relative flex flex-col items-center backdrop-blur-xl border transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] overflow-hidden w-14 ${
              showVolumeBar ? 'h-48 opacity-90 mb-[-25px]' : 'h-0 opacity-0 mb-[-56px] pointer-events-none'
            } ${
              radioName.includes('SMIHUN') 
                ? 'bg-blue-950/90 border-blue-400/30 rounded-t-2xl' 
                : 'bg-red-950/90 border-red-500/30 rounded-t-2xl'
            }`}>
              
              <div className="relative w-full h-full mt-4">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={isMuted ? 0 : volume}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setVolume(v);
                    if (v > 0) setIsMuted(false);
                  }}
                  className={`absolute inset-0 w-full h-full appearance-none bg-transparent cursor-pointer z-30 transition-colors duration-300 ${
                    radioName.includes('SMIHUN') ? 'accent-blue-500' : 'accent-red-500'
                  }`}
                  style={{ 
                    WebkitAppearance: 'slider-vertical', 
                    appearance: 'slider-vertical' 
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {isJoined && playlist.length > 0 && (
          <div className="bg-gray-800 rounded-lg p-6 mt-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-semibold text-gray-400">Upcoming Songs</h2>
              
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-400 hover:text-white transition-colors">
                  <input 
                    type="checkbox" 
                    checked={showOnlyOne}
                    onChange={(e) => setShowOnlyOne(e.target.checked)}
                    className={`w-4 h-4 rounded border-gray-600 bg-gray-700 focus:ring-0 ${
                      showOnlyOne ? (radioName.includes('SMIHUN') ? 'text-blue-500' : 'text-red-500') : ''
                    }`}
                  />
                  Only one
                </label>

                <button 
                  onClick={() => setIsBlurred(!isBlurred)}
                  className={`p-2 rounded-full transition-all duration-300 ${
                    isBlurred 
                      ? (radioName.includes('SMIHUN') 
                          ? 'bg-blue-900/40 text-blue-400 border border-blue-500/30'
                          : 'bg-red-900/40 text-red-500 border border-red-500/30')
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                  title={isBlurred ? "Show titles" : "Hide titles"}
                >
                  <span className="text-lg leading-none flex items-center justify-center">
                    {isBlurred ? '👁️‍🗨️' : '👁️'}
                  </span>
                </button>
              </div>
            </div>

            <ul className="space-y-2 mt-4">
              {playlist.slice(0, showOnlyOne ? 1 : 10).map((track, index) => (
                <li
                  key={`${track.filename || track}-${index}`}
                  className={`p-3 rounded transition-all duration-300 ${
                    isBlurred 
                      ? (radioName.includes('SMIHUN') ? 'bg-blue-900/10 border border-blue-900/20' : 'bg-red-900/10 border border-red-900/20') 
                      : 'bg-gray-700'
                  }`}
                >
                  <div className={`flex items-center gap-3 transition-all duration-500 ${isBlurred ? 'blur-md select-none opacity-50' : 'blur-0'}`}>
                    <span className="text-gray-500 font-mono text-xs">#{index + 1}</span>
                    <div>
                      <span className="font-semibold block leading-tight">{track.title || track.filename}</span>
                      <span className="text-gray-400 text-xs">{track.artist || 'Unknown Artist'}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

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