import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

const translations = {
  ua: {
    joinRadio: "Слухати радіо",
    nowPlaying: "Зараз грає",
    anonymouslisteners: "АНОНІМНІ СЛУХАЧІ",
    otherListeners: "Інші слухачі",
    smihunChannel: "КАНАЛ СМІХУН",
    radioNameDay: "Радіо СМІХУН",
    radioNameNight: "Радіо СОСУН",
    connected: "Підключено",
    disconnected: "Відключено",
    preparingMode: "Підготовка...",
    currentTitle: "Анонім",
    currentArtist: "Музика",
    currentAlbum: "вже близько",
    pause: "Пауза",
    play: "Грати",
    upcomingSongs: "Наступні пісні",
    onlyOne: "Лише одна",
    showTitles: "Показати назву",
    hideTitles: "Сховати назву",
    unknownArtist: "Невідомий виконавець",
    waitingMusic: "Очікуємо музику..."
  },
  en: {
    joinRadio: "Join Radio",
    anonymouslisteners: "Anonymous listeners",
    otherListeners: "Other listeners",
    smihunChannel: "Сміхун Channel",
    radioNameDay: "Radio SMIHUN",
    radioNameNight: "Radio SOSUN",
    connected: "Connected",
    disconnected: "Disconnected",
    preparingMode: "Preparing mode...",
    nowPlaying: "Now Playing",
    currentTitle: "Anonymous",
    currentArtist: "Music",
    currentAlbum: "is coming",
    pause: "Pause",
    play: "Play",
    upcomingSongs: "Upcoming Songs",
    onlyOne: "Only one",
    showTitles: "Show titles",
    hideTitles: "Hide titles",
    unknownArtist: "Unknown Artist",
    waitingMusic: "Waiting for music to start..."
  }
};

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
  const [showVolumeBar, setShowVolumeBar] = useState(false);
  const [currentCover, setCurrentCover] = useState(null);
  const [currentAlbum, setCurrentAlbum] = useState(null);
  const [lastTrackKey, setLastTrackKey] = useState("");
  const [isTitleMarquee, setIsTitleMarquee] = useState(false);
  const [isArtistMarquee, setIsArtistMarquee] = useState(false);
  const [showOnlyOne, setShowOnlyOne] = useState(() => {
    const saved = localStorage.getItem('radio_show_only_one');
    return saved !== null ? JSON.parse(saved) : false;
  });
  const [isBlurred, setIsBlurred] = useState(() => {
    const saved = localStorage.getItem('radio_is_blurred');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [volume, setVolume] = useState(() => {
    const savedVolume = localStorage.getItem('radio_volume');
    return savedVolume !== null ? parseFloat(savedVolume) : 0.5;
  });
  const [isMuted, setIsMuted] = useState(() => {
    const savedMute = localStorage.getItem('radio_is_muted');
    return savedMute !== null ? JSON.parse(savedMute) : false;
  });
  const [lang, setLang] = useState(() => {
    return localStorage.getItem('radio_lang') || 'ua';
  });
  
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
  const titleWrapperRef = useRef(null);
  const titleInnerRef = useRef(null);
  const artistWrapperRef = useRef(null);
  const artistInnerRef = useRef(null);

  const t = translations[lang];

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
    localStorage.setItem('radio_lang', lang);
  }, [lang]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  useEffect(() => {
    localStorage.setItem('radio_show_only_one', JSON.stringify(showOnlyOne));
  }, [showOnlyOne]);

  useEffect(() => {
    localStorage.setItem('radio_is_blurred', JSON.stringify(isBlurred));
  }, [isBlurred]);

  useEffect(() => {
    localStorage.setItem('radio_volume', volume.toString());
  }, [volume]);

  useEffect(() => {
    localStorage.setItem('radio_is_muted', JSON.stringify(isMuted));
  }, [isMuted]);

  useEffect(() => {
    const favicon = document.getElementById('favicon');
    if (!favicon) return;
  
    const mode = radioName.includes('SMIHUN') ? 'SMIHUN' : 'SOSUN';
    const timestamp = new Date().getTime();

    const iconPath = currentCover 
      ? currentCover 
      : (mode === 'SMIHUN' ? '/icon-smihun-192.png' : '/icon-sosun-192.png');
  
    favicon.href = currentCover ? iconPath : `${iconPath}?v=${timestamp}`;
  }, [currentCover, radioName]);
  
  useEffect(() => {
    if ('mediaSession' in navigator && isJoined) {
      const mode = radioName.includes('SMIHUN') ? 'SMIHUN' : 'SOSUN';

      const actionHandlers = [
        ['play', () => {
          if (isPaused) handlePausePlay();
        }],
        ['pause', () => {
          if (!isPaused) handlePausePlay(); 
        }],

        ['stop', () => {
          if (!isPaused) handlePausePlay();
        }]
      ];

      for (const [action, handler] of actionHandlers) {
        try {
          navigator.mediaSession.setActionHandler(action, handler);
        } catch (error) {
          console.log(`The ${action} is not supported by the browser`);
        }
      }

      navigator.mediaSession.playbackState = isPaused ? 'paused' : 'playing';

      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTitle || "Radio SMIHUN",
        artist: currentArtist || "Anonymous",
        album: currentAlbum || `Radio ${mode}`,
        artwork: [
          { 
            src: currentCover || (mode === 'SMIHUN' ? '/icon-smihun-192.png' : '/icon-sosun-192.png'), 
            sizes: '512x512', 
            type: 'image/png' 
          }
        ]
      });
    }
  }, [isPaused, isJoined, currentTitle, currentArtist, currentCover]);

  useEffect(() => {
    if (!socketRef.current) return;

    const handleSync = (state) => {
      if (!audioRef.current) return;

      const { track, title, artist, album, seek: serverSeek, isPlaying: serverIsPlaying, playlist: upcoming, mode, isPreparing } = state;

      if (isPreparing) {
        setRadioName(t.preparingMode);
        setCurrentTitle(t.currentTitle);
        setCurrentArtist(t.currentArtist);
        setCurrentAlbum(t.currentAlbum);
        setCurrentCover(null);
        return; 
      }
      
      if (mode) {
        setRadioName(mode === 'night' ? 'Radio SOSUN' : 'Radio SMIHUN');
      }

      lastServerSeekRef.current = serverSeek;

      if (title) setCurrentTitle(title);
      if (artist) setCurrentArtist(artist);
      if (album) setCurrentAlbum(album);

      const fetchCover = async (artist, title) => {
        try {
          const query = encodeURIComponent(`${artist} ${title}`);
          const response = await fetch(`https://itunes.apple.com/search?term=${query}&entity=song&limit=1`);
          const data = await response.json();
          
          if (data.results && data.results.length > 0) {
            const rawUrl = data.results[0].artworkUrl100;
            return rawUrl.replace('100x100bb', '512x512bb');
            //return data.results[0].artworkUrl100;
          }
        } catch (e) {
          console.error("Cover search error", e);
        }
        return null;
      };
  
      if (title && artist) {
        const trackKey = `${artist}-${title}`;
        const mode = radioName.includes('SMIHUN') ? 'SMIHUN' : 'SOSUN';

        document.title = `${title} - ${artist} · Radio ${mode}`;

        if (trackKey !== lastTrackKey) {
          setLastTrackKey(trackKey); 

          const updateIcon = async () => {
            const coverUrl = await fetchCover(artist, title);
            // console.log(coverUrl);
            setCurrentCover(coverUrl); 
          };
          
          updateIcon();
        }
      } else {
        document.title = "Radio SMIHUN";
        setCurrentCover(null);
        setLastTrackKey("");
      }

      if (!isJoined && track && serverSeek !== undefined) {
        initialServerSeekRef.current = serverSeek;
      }

      if (track && track !== currentTrack) {
        setCurrentTrack(track);
        hasInitialSyncedRef.current = false;
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

      socketRef.current.emit('trackDuration', trackDuration);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current && isJoined && !isSyncingRef.current) {
      setSeek(audioRef.current.currentTime);
    }
  };

  // const handleEnded = () => {
  //   if (socketRef.current) {
  //     socketRef.current.emit('trackEnd');
  //   }
  // };

  const handleJoinRadio = async () => {
    setIsJoined(true);
    joinTimeRef.current = Date.now();
  };

  useEffect(() => {
    const checkOverflow = () => {
      if (titleWrapperRef.current && titleInnerRef.current) {
        setIsTitleMarquee(titleInnerRef.current.offsetWidth > titleWrapperRef.current.offsetWidth);
      }
      if (artistWrapperRef.current && artistInnerRef.current) {
        setIsArtistMarquee(artistInnerRef.current.offsetWidth > artistWrapperRef.current.offsetWidth);
      }
    };

    const obs = new ResizeObserver(() => {
      window.requestAnimationFrame(checkOverflow);
    });
  
    if (titleWrapperRef.current) obs.observe(titleWrapperRef.current);
    if (artistWrapperRef.current) obs.observe(artistWrapperRef.current);

    const timeout = setTimeout(checkOverflow, 300);
  
    return () => {
      obs.disconnect();
      clearTimeout(timeout);
    };
  }, [currentTitle, currentArtist, currentAlbum, isJoined]);

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

  const handleVolumeClick = (e) => {
    e.stopPropagation(); 
    
    setShowVolumeBar(!showVolumeBar);
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

  const isRainbowActive = currentArtist?.toLowerCase().includes('rainbow');

  const isBibleBlack = currentTitle?.toLowerCase().includes('bible black');
  const isSabbathFamily = currentArtist?.toLowerCase().includes('black sabbath') || 
                          currentArtist?.toLowerCase().includes('heaven & hell');

  const henryProgress = (duration && seek) ? (seek / duration) * 100 : 0;

  let henryOpacity = 0;
  let henryTop = '100%';
  let henryFilter = 'sepia(0.2) brightness(1.2)';
  let henryShadow = 'none';

  if (isSabbathFamily && duration > 0) {
    if (henryProgress <= 33.3) {
        const phaseProgress = henryProgress / 33.3;
        henryOpacity = phaseProgress * 0.5;
        henryTop = `${100 - (phaseProgress * 50)}%`;
    } else if (henryProgress > 33.3 && henryProgress <= 66.6) {
        henryOpacity = 0.5;
        henryTop = '50%';
    } else {
        const phaseProgress = Math.min((henryProgress - 66.6) / 33.4, 1);
        henryOpacity = 0.5 * (1 - phaseProgress);
        henryTop = '50%';
    }

    if (isBibleBlack) {
      const startTime = 312; // 312
      const endTime = 323;   // 323

      if (seek >= startTime - 1 && seek <= endTime) {
          const fadeProgress = Math.min(seek - (startTime - 1), 1); 
          henryOpacity = 0.5 + (fadeProgress * 0.5);
          henryFilter = `brightness(${1 - fadeProgress})`;
          henryShadow = `drop-shadow(0 0 ${15 * fadeProgress}px rgba(255, 69, 0, 0.9))  drop-shadow(0 0 5px rgba(255, 140, 0, 1))`;
          henryTop = '50%';
      } 
      else if (seek > endTime) {
          const postEffectProgress = Math.min((seek - endTime) / (duration - endTime), 1);
          henryOpacity = 1 - postEffectProgress;
          henryFilter = 'brightness(0)';
          henryShadow = `drop-shadow(0 0 ${15 * (1 - postEffectProgress)}px rgba(255, 69, 0, 0.5))`;
          henryTop = '50%';
      }
    }
  }

  return (
    <div className={`min-h-screen transition-colors duration-1000 ${
      isNight ? 'bg-[#0f0505]' : 'bg-gray-900'
    } text-white`}>
      <div className="flex justify-between items-start mb-4 p-4">
        <div className="flex flex-col items-start">
          <span className={`text-[10px] uppercase tracking-widest font-bold mb-2 ${
            isNight ? 'text-gray-500' : 'text-gray-500' //night text-red-900/60
          }`}>
            {t.smihunChannel}
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
            {t.anonymouslisteners}
          </span>

          <div className="flex justify-end items-center gap-2 mb-4 pt-2 pr-1 relative">
            {visibleListeners.map((user, i) => (
              <div 
              key={i} 
              className="group relative flex items-center justify-center shrink-0"
              tabIndex="0"
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

                <div className={`absolute right-0 top-full mt-2 w-56 rounded-xl shadow-2xl p-3 z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 backdrop-blur-md ${
                  isNight 
                    ? 'bg-[#1a0505]/70 border border-[#4a0404]/50' 
                    : 'bg-white/70 border border-gray-200/50'
                }`}>
                  <p className={`text-[10px] uppercase tracking-wider font-black mb-3 pb-1 border-b ${
                    isNight ? 'text-red-900 border-red-900/30' : 'text-gray-800 border-gray-100'
                  }`}>
                    {t.otherListeners}
                  </p>
                  <ul className="max-h-60 overflow-y-auto space-y-3 custom-scrollbar">
                    {hiddenListeners.map((user, i) => (
                      <li key={i} className="flex items-center gap-3 group/item">
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

      <div className="relative container z-10 mx-auto px-4 py-8 max-w-4xl">
        <div className="title-container" style={{ position: 'relative', textAlign: 'center' }}>
          {isSabbathFamily && (
            <img 
              src="/svg/henry.svg" 
              alt="Sabbath Symbol"
              style={{
                position: 'absolute',
                left: '50%',
                top: henryTop,
                transform: 'translate(-50%, -50%)',
                width: '180px',
                opacity: henryOpacity,
                filter: isBibleBlack ? `${henryFilter} ${henryShadow}` : 'sepia(0.2) brightness(1.2)',
                zIndex: 0,
                pointerEvents: 'none',
                transition: 'filter 1s linear, opacity 1s linear'
              }}
            />
          )}

          <h1 
            className={`text-[44px] font-extrabold mb-8 text-center transition-all duration-1000 tracking-wider`}
            style={{
              position: 'relative',
              color: isNight ? '#bc0000' : '#ffffff', 
              WebkitTextStroke: isNight ? '1px #4a0404' : 'none', 
              textShadow: isNight ? '0 0 15px rgba(188, 0, 0, 0.3)' : 'none', 
              fontFamily: "'Segoe UI', Roboto, sans-serif",
              zIndex: 10,
            }}
          >{radioName == t.preparingMode ? t.preparingMode : (isNight? t.radioNameNight : t.radioNameDay)}</h1>
        </div>

        <div className="mb-6 text-center">
          <span className={`inline-block px-4 py-2 rounded-full text-sm ${
            isConnected ? 'bg-green-600' : 'bg-red-600'
          }`}>
            {isConnected ? t.connected : t.disconnected}
          </span>
        </div>

        <audio
          ref={audioRef}
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          //onEnded={handleEnded}
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
              {t.joinRadio}
            </button>
          </div>
        )}

        {isJoined && currentTrack && (
          <div className="relative bg-gray-800 rounded-lg p-6 mb-6">
            <div className={`absolute left-0 right-0 top-[] w-full aspect-[2/1] z-[-1] pointer-events-none -translate-y-full transition-opacity duration-1000 ${
              isRainbowActive ? 'opacity-100' : 'opacity-0'
            }`}>
              <svg 
                viewBox="0 0 100 50" 
                className="w-full h-full"
                style={{ display: 'block' }}
              >
                {[
                  { r: 48, color: "#c30b00" },
                  { r: 44, color: "#f1b03c" },
                  { r: 40, color: "#5a7331" },
                  { r: 36, color: "#130366" },
                  { r: 32, color: "#491c5f" }
                ].map((circle, i) => {
                  const circumference = Math.PI * circle.r;
                  const progress = duration > 0 ? (seek / duration) : 0;
                  const dashOffset = circumference * (1 - progress);

                  return (
                    <circle
                      key={i}
                      cx="50"
                      cy="50"
                      r={circle.r}
                      fill="none"
                      stroke={circle.color}
                      strokeWidth="4"
                      strokeDasharray={circumference}
                      style={{ 
                        strokeDashoffset: isRainbowActive ? dashOffset : circumference,
                        transition: 'stroke-dashoffset 0.5s linear' 
                      }}
                      strokeLinecap="round"
                      transform="rotate(-180 50 50)"
                    />
                  );
                })}
              </svg>
            </div>

            <h2 className="text-2xl font-semibold mb-4 text-gray-400">{t.nowPlaying}</h2>

            <div className="flex flex-row items-center gap-4 md:gap-6 mb-6 overflow-hidden">
              <div className="relative shrink-0">
                <img 
                  src={currentCover || (isNight ? '/icon-sosun-192.png' : '/icon-smihun-192.png')} 
                  alt="Cover"

                  className={`w-20 h-20 object-cover rounded-lg shadow-2xl border-2 transition-all duration-500 ${
                    isNight ? 'border-red-900/30' : 'border-blue-900/30'
                  }`}
                  onError={(e) => {
                    e.target.src = isNight ? '/icon-sosun-192.png' : '/icon-smihun-192.png';
                  }}
                />
              </div>

              <div className="flex-1 min-w-0 flex flex-col justify-center overflow-hidden">
                {currentTitle && (
                  <div ref={titleWrapperRef} className={`marquee-wrapper ${isTitleMarquee ? 'mask-active' : ''}`}>
                    <div 
                      className={`flex w-max ${isTitleMarquee ? 'animate-marquee' : ''} ${isNight ? 'text-[#bc0000]' : 'text-blue-400'} text-xl md:text-3xl font-black mb-1 transition-colors`}
                    >
                      <span ref={titleInnerRef}>{currentTitle}</span>
                      {isTitleMarquee && <span className="ml-12">{currentTitle}</span>}
                    </div>
                  </div>
                )}

                {(currentArtist || currentAlbum) && (
                  <div ref={artistWrapperRef} className={`marquee-wrapper ${isArtistMarquee ? 'mask-active' : ''}`}>
                    <div 
                      className={`flex w-max text-sm md:text-xl text-gray-300 font-medium ${isArtistMarquee ? 'animate-marquee' : ''}`}
                    >
                      <span ref={artistInnerRef}>{currentArtist}{currentAlbum && ` · ${currentAlbum}`}</span>
                      {isArtistMarquee && <span className="ml-12">{currentArtist}{currentAlbum && ` · ${currentAlbum}`}</span>}
                    </div>
                  </div>
                )}
              </div>
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

            <div className="flex justify-between text-sm text-gray-400 font-mono">
              <span>{formatTime(seek)}</span>
              <span>{formatTime(duration)}</span>
            </div>

            <div className="mt-6 flex items-center justify-center gap-4">
              <button
                onClick={handlePausePlay}
                className={`px-8 py-3 rounded-xl text-lg font-bold transition-all transform active:scale-95 flex items-center gap-2 shadow-lg ${
                  isNight ? 'bg-red-700 hover:bg-red-600' : 'bg-blue-600 hover:bg-blue-500'
                }`}
              >
                {isPaused ? (
                  <><span>▶</span><span>{t.play}</span></>
                ) : (
                  <><span>⏸</span><span>{t.pause}</span></>
                )}
              </button>
            </div>
          </div>
        )}

        {isJoined && (
          <div 
            className="fixed bottom-6 left-6 z-50 flex flex-col-reverse items-center group"
            onPointerEnter={(e) => e.pointerType === 'mouse' && setShowVolumeBar(true)}
            onPointerLeave={(e) => e.pointerType === 'mouse' && setShowVolumeBar(false)}
            onMouseLeave={() => setShowVolumeBar(false)}
          >
            <button
              onClick={() => setIsMuted(!isMuted)}
              onPointerDown={handleVolumeClick}
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
                  className={`absolute inset-0 w-full h-full [writing-mode:vertical-lr] [direction:rtl] bg-transparent cursor-pointer z-30 transition-colors duration-300 ${
                    radioName.includes('SMIHUN') ? 'accent-blue-500' : 'accent-red-500'
                  }`}
                />
              </div>
            </div>
          </div>
        )}

        {isJoined && playlist.length > 0 && (
          <div className="bg-gray-800 rounded-lg p-6 mt-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-semibold text-gray-400">{t.upcomingSongs}</h2>
              
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
                  {t.onlyOne}
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
                  title={isBlurred ? t.showTitles : t.hideTitles}
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
                      <span className="text-gray-400 text-xs">{track.artist || t.unknownArtist}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {isJoined && !currentTrack && (
          <div className="bg-gray-800 rounded-lg p-6 text-center">
            <p className="text-gray-400">{t.waitingMusic}</p>
          </div>
        )}
      </div>
      <div className="fixed bottom-6 right-6 z-50 flex items-center bg-gray-800/60 backdrop-blur-md p-1 rounded-full border border-white/10 shadow-lg">
        <button
          onClick={() => setLang('ua')}
          className={`px-3 py-1.5 rounded-full text-xs font-black transition-all duration-300 ${
            lang === 'ua' 
              ? ( isNight ? 'bg-red-700 text-white shadow-md' : 'bg-blue-600 text-white shadow-md')
              : 'text-gray-400 hover:text-white'
          }`}
        >
          UA
        </button>
        <button
          onClick={() => setLang('en')}
          className={`px-3 py-1.5 rounded-full text-xs font-black transition-all duration-300 ${
            lang === 'en' 
              ? ( isNight ? 'bg-red-700 text-white shadow-md' : 'bg-blue-600 text-white shadow-md')
              : 'text-gray-400 hover:text-white'
          }`}
        >
          EN
        </button>
      </div>
    </div>
  );
}

export default App;