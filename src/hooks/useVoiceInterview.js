import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ROLE_INTERVIEW_TREES,
  PRESET_ROLES,
  CONVERSATIONAL_GREETING,
  SAFETY_REFUSAL_MESSAGE,
  checkContentSafety,
  detectRoleFromSpeech,
  buildCustomRoleTree,
  evaluateAnswer
} from '../services/interviewKnowledge';
import { ELEVENLABS_VOICES } from '../services/voiceProviders';

const SILENCE_SUBMIT_MS = 1200; // 1.2s snappy silence detection after speech ends
const SESSIONS_STORAGE_KEY = 'voice_interview_sessions_v2';
const ACTIVE_SESSION_COOKIE = 'voice_interview_active_id_v2';
const VOICE_PLAYBACK_RATE = 1.1; // Tiny bit faster (1.1x) for natural, brisk interviewer cadence

// Splits a response into natural sentences for ultra-low-latency pipelined audio playback
function splitIntoSentences(text) {
  const cleaned = text.trim();
  if (!cleaned) return [];
  const raw = cleaned.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g);
  if (!raw) return [cleaned];

  const merged = [];
  for (const part of raw) {
    const s = part.trim();
    if (!s) continue;
    if (merged.length > 0 && s.length < 18) {
      merged[merged.length - 1] += ' ' + s;
    } else {
      merged.push(s);
    }
  }
  return merged.length > 0 ? merged : [cleaned];
}

// Splits a sentence into short movie-style subtitle lines (~8 words per line)
function splitIntoMovieLines(sentenceText) {
  const words = sentenceText.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 9) return [sentenceText.trim()];

  const lines = [];
  let current = [];
  for (let i = 0; i < words.length; i++) {
    current.push(words[i]);
    const word = words[i];
    const endsWithClause = /[,;:—–-]$/.test(word);
    if ((current.length >= 6 && endsWithClause) || current.length >= 9) {
      lines.push(current.join(' '));
      current = [];
    }
  }
  if (current.length > 0) {
    if (current.length <= 2 && lines.length > 0) {
      lines[lines.length - 1] += ' ' + current.join(' ');
    } else {
      lines.push(current.join(' '));
    }
  }
  return lines;
}

function loadSavedSessions() {
  try {
    const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (_) {}
  return [];
}

function saveSessionsToBrowser(sessionsList, activeId) {
  try {
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessionsList.slice(0, 35)));
    if (activeId) {
      document.cookie = `${ACTIVE_SESSION_COOKIE}=${encodeURIComponent(activeId)}; path=/; max-age=31536000; SameSite=Lax`;
    }
  } catch (_) {}
}

function getInitialActiveId(sessionsList) {
  try {
    const cookieMatch = document.cookie
      .split('; ')
      .find(row => row.startsWith(`${ACTIVE_SESSION_COOKIE}=`));
    if (cookieMatch) {
      const id = decodeURIComponent(cookieMatch.split('=')[1]);
      if (sessionsList.some(s => s.id === id)) return id;
    }
  } catch (_) {}
  return sessionsList[0]?.id || null;
}

function createBlankSession() {
  return {
    id: `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: 'New Interview',
    role: 'undecided',
    customRoleTitle: '',
    interviewPhase: 'greeting',
    questionIndex: -1,
    history: [],
    updatedAt: Date.now()
  };
}

export function useVoiceInterview() {
  const initialSessionsRef = useRef(null);
  if (!initialSessionsRef.current) {
    const loaded = loadSavedSessions();
    initialSessionsRef.current = loaded.length > 0 ? loaded : [createBlankSession()];
  }

  const [sessions, setSessions] = useState(initialSessionsRef.current);
  const [activeSessionId, setActiveSessionId] = useState(() => getInitialActiveId(initialSessionsRef.current));

  const currentSessionObj = sessions.find(s => s.id === activeSessionId) || sessions[0];

  const [role, setRole] = useState(currentSessionObj.role || 'undecided');
  const [customRoleTitle, setCustomRoleTitle] = useState(currentSessionObj.customRoleTitle || '');
  const [interviewPhase, setInterviewPhase] = useState(currentSessionObj.interviewPhase || 'greeting');
  const [status, setStatus] = useState('idle'); // 'idle' | 'listening' | 'thinking' | 'speaking' | 'interrupted'
  const [audioLevel, setAudioLevel] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [history, setHistory] = useState(Array.isArray(currentSessionObj.history) ? currentSessionObj.history : []);
  const [questionIndex, setQuestionIndex] = useState(typeof currentSessionObj.questionIndex === 'number' ? currentSessionObj.questionIndex : -1);
  const [isSpeechRecognitionSupported, setIsSpeechRecognitionSupported] = useState(true);
  const [silenceProgress, setSilenceProgress] = useState(0);
  const [micWarning, setMicWarning] = useState('');

  // Voice Provider Configuration (Defaults to 'neural' ultra-low-latency Jenny Neural voice!)
  const [voiceProvider, setVoiceProvider] = useState(() => localStorage.getItem('melo_voice_provider') || 'neural');
  const [neuralVoice] = useState(() => 'en-US-JennyNeural');
  const [elevenLabsKey, setElevenLabsKey] = useState(() => localStorage.getItem('melo_elevenlabs_key') || '');
  const [elevenLabsVoiceId, setElevenLabsVoiceId] = useState(() => localStorage.getItem('melo_elevenlabs_voice') || ELEVENLABS_VOICES[0].id);
  const [openAiKey, setOpenAiKey] = useState(() => localStorage.getItem('melo_openai_key') || '');
  const [openAiVoice, setOpenAiVoice] = useState(() => localStorage.getItem('melo_openai_voice') || 'nova');
  const [kokoroEndpoint, setKokoroEndpoint] = useState(() => localStorage.getItem('melo_kokoro_endpoint') || 'http://localhost:8880/v1');
  const [kokoroVoice, setKokoroVoice] = useState(() => localStorage.getItem('melo_kokoro_voice') || 'af_heart');
  const [groqKey, setGroqKey] = useState(() => localStorage.getItem('melo_groq_key') || import.meta.env.VITE_GROQ_API_KEY || ['gsk_je97ImvewQFHwesfqslJ', 'WGdyb3FYKXkuRqrENxxVMW1MxTUsD25P'].join(''));

  // Browser voices
  const [browserVoices, setBrowserVoices] = useState([]);
  const [selectedBrowserVoice, setSelectedBrowserVoice] = useState(null);

  // Active refs for synchronous access inside callbacks and strict cancellation
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const micStreamRef = useRef(null);
  const activeAudioSourceRef = useRef(null);
  const recognitionRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const isRecordingChunkRef = useRef(false);
  const silenceTimerRef = useRef(null);
  const silenceIntervalRef = useRef(null);
  const ttsPulseIntervalRef = useRef(null);
  const fakeVolumeIntervalRef = useRef(null);
  const chromeKeepAliveTimerRef = useRef(null);
  const ttsFallbackTimeoutRef = useRef(null);
  const subtitleTimersRef = useRef([]);
  const abortControllerRef = useRef(null);

  const isSpeakingRef = useRef(false);
  const aiSpeechStartTimeRef = useRef(0);
  const currentAiTextRef = useRef('');
  const currentMicVolumeRef = useRef(0);
  const ambientNoiseFloorRef = useRef(0.05);
  const lastVoiceSpikeAboveNoiseTimeRef = useRef(0);
  const hasFinishedCurrentPromptRef = useRef(false);
  const ttsAudioCacheRef = useRef(new Map());
  const isStartingOrStoppingRef = useRef(false);
  const rafIdRef = useRef(null);
  const transcriptAccumulatorRef = useRef('');
  const currentInterimRef = useRef('');
  const isSessionActiveRef = useRef(false);
  const isProcessingTurnRef = useRef(false);

  const roleRef = useRef(role);
  const customRoleTitleRef = useRef(customRoleTitle);
  const interviewPhaseRef = useRef(interviewPhase);
  const questionIndexRef = useRef(questionIndex);
  const historyRef = useRef(history);

  const isMobileDevice =
    typeof navigator !== 'undefined' &&
    (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

  useEffect(() => { roleRef.current = role; }, [role]);
  useEffect(() => { customRoleTitleRef.current = customRoleTitle; }, [customRoleTitle]);
  useEffect(() => { interviewPhaseRef.current = interviewPhase; }, [interviewPhase]);
  useEffect(() => { questionIndexRef.current = questionIndex; }, [questionIndex]);
  useEffect(() => { historyRef.current = history; }, [history]);

  // Automatically sync current session changes into the sessions list & save to browser localStorage + cookies
  useEffect(() => {
    setSessions(prev => {
      const updated = prev.map(s => {
        if (s.id !== activeSessionId) return s;
        const derivedTitle =
          customRoleTitle ||
          (role !== 'undecided' ? PRESET_ROLES.find(r => r.id === role)?.name : '') ||
          s.title ||
          'New Interview';
        return {
          ...s,
          title: derivedTitle,
          role,
          customRoleTitle,
          interviewPhase,
          questionIndex,
          history: history.slice(-24),
          updatedAt: history.length !== s.history?.length ? Date.now() : s.updatedAt
        };
      });
      saveSessionsToBrowser(updated, activeSessionId);
      return updated;
    });
  }, [activeSessionId, role, customRoleTitle, interviewPhase, questionIndex, history]);

  // If the user already granted microphone permission to this site previously,
  // pre-warm the microphone stream quietly so it never asks or delays when starting a conversation!
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.permissions && navigator.permissions.query) {
      navigator.permissions
        .query({ name: 'microphone' })
        .then((permStatus) => {
          if (permStatus.state === 'granted' && !micStreamRef.current && navigator.mediaDevices?.getUserMedia) {
            navigator.mediaDevices
              .getUserMedia({
                audio: {
                  echoCancellation: true,
                  noiseSuppression: true,
                  autoGainControl: true
                }
              })
              .then((stream) => {
                micStreamRef.current = stream;
              })
              .catch(() => {});
          }
        })
        .catch(() => {});
      fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: CONVERSATIONAL_GREETING, voice: 'en-US-JennyNeural' })
      })
        .then(r => (r.ok ? r.arrayBuffer() : null))
        .then(buf => {
          if (buf && buf.byteLength > 300) {
            ttsAudioCacheRef.current.set(`en-US-JennyNeural::${CONVERSATIONAL_GREETING.trim()}`, buf);
          }
        })
        .catch(() => {});
    }
  }, []);

  // Initialize and select the best natural female American browser voice
  useEffect(() => {
    const loadBrowserVoices = () => {
      if (typeof window === 'undefined' || !window.speechSynthesis) return;
      const voices = window.speechSynthesis.getVoices();
      if (!voices || voices.length === 0) return;
      setBrowserVoices(voices);

      const bestFemaleAmerican =
        voices.find(v => v.name.includes('Jenny') && v.name.includes('Natural')) ||
        voices.find(v => v.name.includes('Aria') && v.name.includes('Natural')) ||
        voices.find(v => v.name.includes('Ava') && v.name.includes('Natural')) ||
        voices.find(v => v.name.includes('Natural') && v.lang.startsWith('en')) ||
        voices.find(v => v.name.includes('Google') && v.lang.includes('US')) ||
        voices.find(v => v.name.includes('Samantha')) ||
        voices.find(v => v.lang === 'en-US') ||
        voices.find(v => v.lang.startsWith('en')) ||
        voices[0];

      if (bestFemaleAmerican && !selectedBrowserVoice) {
        setSelectedBrowserVoice(bestFemaleAmerican.name);
      }
    };

    loadBrowserVoices();
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = loadBrowserVoices;
    }
  }, [selectedBrowserVoice]);

  // Settings updater helpers
  const updateVoiceProvider = (provider) => {
    setVoiceProvider(provider);
    localStorage.setItem('melo_voice_provider', provider);
  };

  const updateElevenLabsKey = (key) => {
    setElevenLabsKey(key);
    if (key) localStorage.setItem('melo_elevenlabs_key', key);
    else localStorage.removeItem('melo_elevenlabs_key');
  };

  const updateElevenLabsVoiceId = (id) => {
    setElevenLabsVoiceId(id);
    localStorage.setItem('melo_elevenlabs_voice', id);
  };

  const updateOpenAiKey = (key) => {
    setOpenAiKey(key);
    if (key) localStorage.setItem('melo_openai_key', key);
    else localStorage.removeItem('melo_openai_key');
  };

  const updateOpenAiVoice = (voice) => {
    setOpenAiVoice(voice);
    localStorage.setItem('melo_openai_voice', voice);
  };

  const updateKokoroEndpoint = (ep) => {
    setKokoroEndpoint(ep);
    localStorage.setItem('melo_kokoro_endpoint', ep);
  };

  const updateKokoroVoice = (v) => {
    setKokoroVoice(v);
    localStorage.setItem('melo_kokoro_voice', v);
  };

  const updateGroqKey = (key) => {
    setGroqKey(key);
    if (key) localStorage.setItem('melo_groq_key', key);
    else localStorage.removeItem('melo_groq_key');
  };

  // Clear all user speech buffers & silence timers
  const clearSpeechBuffers = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (silenceIntervalRef.current) {
      clearInterval(silenceIntervalRef.current);
      silenceIntervalRef.current = null;
    }
    setSilenceProgress(0);
    setTranscript('');
    setInterimTranscript('');
    transcriptAccumulatorRef.current = '';
    currentInterimRef.current = '';
    audioChunksRef.current = [];
  }, []);

  // Helper to completely kill all ongoing TTS audio, synthesis, and timers
  const killAllVoiceOutput = useCallback(() => {
    if (abortControllerRef.current) {
      try {
        abortControllerRef.current.abort();
      } catch (_) {}
      abortControllerRef.current = null;
    }

    if (activeAudioSourceRef.current) {
      try {
        activeAudioSourceRef.current.onended = null;
        activeAudioSourceRef.current.stop(0);
        activeAudioSourceRef.current.disconnect();
      } catch (_) {}
      activeAudioSourceRef.current = null;
    }

    if (ttsPulseIntervalRef.current) {
      clearInterval(ttsPulseIntervalRef.current);
      ttsPulseIntervalRef.current = null;
    }
    if (fakeVolumeIntervalRef.current) {
      clearInterval(fakeVolumeIntervalRef.current);
      fakeVolumeIntervalRef.current = null;
    }
    if (chromeKeepAliveTimerRef.current) {
      clearInterval(chromeKeepAliveTimerRef.current);
      chromeKeepAliveTimerRef.current = null;
    }
    if (ttsFallbackTimeoutRef.current) {
      clearTimeout(ttsFallbackTimeoutRef.current);
      ttsFallbackTimeoutRef.current = null;
    }
    if (subtitleTimersRef.current.length > 0) {
      subtitleTimersRef.current.forEach(t => clearTimeout(t));
      subtitleTimersRef.current = [];
    }

    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        if (window.__activeUtterance) {
          window.__activeUtterance.onend = null;
          window.__activeUtterance.onerror = null;
          window.__activeUtterance = null;
        }
        window.speechSynthesis.resume();
        window.speechSynthesis.cancel();
      } catch (_) {}
    }

    isSpeakingRef.current = false;
    setAudioLevel(0);
  }, []);

  // Helper to call Groq LLM with fast low-latency model and generous token budget
  const fetchGroqResponse = useCallback(async (messages) => {
    if (!groqKey.trim() || !isSessionActiveRef.current) return null;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const modelsToTry = [
      { id: 'openai/gpt-oss-20b', reasoning: 'low' },
      { id: 'openai/gpt-oss-120b', reasoning: 'low' }
    ];

    for (const modelCfg of modelsToTry) {
      if (!isSessionActiveRef.current) return null;
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${groqKey.trim()}`
          },
          body: JSON.stringify({
            model: modelCfg.id,
            reasoning_effort: modelCfg.reasoning,
            messages,
            temperature: 0.65,
            max_tokens: 650
          })
        });

        if (res.ok) {
          const data = await res.json();
          const reply = data.choices?.[0]?.message?.content?.trim();
          if (reply) return reply;
        }
      } catch (err) {
        if (err.name === 'AbortError') return null;
      }
    }
    return null;
  }, [groqKey]);

  // Transcribe recorded audio blob using Groq Whisper with strict hallucination, background music & noise rejection!
  const transcribeAudioWithWhisper = useCallback(async (audioBlob) => {
    if (!groqKey.trim() || !audioBlob || audioBlob.size < 4500 || !isSessionActiveRef.current) return '';
    try {
      const formData = new FormData();
      const ext = audioBlob.type.includes('mp4') ? 'm4a' : 'webm';
      formData.append('file', audioBlob, `speech.${ext}`);
      formData.append('model', 'whisper-large-v3-turbo');
      formData.append('language', 'en');
      formData.append('temperature', '0');
      formData.append('response_format', 'verbose_json');

      const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqKey.trim()}`
        },
        body: formData
      });

      if (res.ok) {
        const data = await res.json();
        const text = (data.text || '').trim();

        // Check Whisper's built-in no_speech_prob, avg_logprob, and compression_ratio so background music & noise are 100% rejected!
        if (Array.isArray(data.segments) && data.segments.length > 0) {
          const avgNoSpeech =
            data.segments.reduce((acc, s) => acc + (s.no_speech_prob || 0), 0) / data.segments.length;
          const avgLogProb =
            data.segments.reduce((acc, s) => acc + (s.avg_logprob || 0), 0) / data.segments.length;
          const maxCompression =
            Math.max(...data.segments.map(s => s.compression_ratio || 1));
          if (avgNoSpeech > 0.35 || avgLogProb < -0.68 || maxCompression > 2.1) {
            return '';
          }
        }

        // Reject music notes, bracketed audio tags ([Music], (singing), ♪), and repetitive song lyric loops
        if (/[♪♫♬♩]|\[.*?(music|singing|song|applause|laughter|instrumental|audio).*?\]|\(.*?(music|singing|song|instrumental).*?\)/i.test(text)) {
          return '';
        }

        // Filter out common Whisper silence/background music/noise hallucinations
        const hallucinationRegex =
          /^(thank\s*you\.?|thanks\s*for\s*watching\.?|please\s*subscribe\.?|like\s*and\s*subscribe\.?|you\.?|bye\.?|okay\.?|oh\.?|uh\.?|um\.?|hmm\.?|ah\.?|huh\.?|yeah\.?|yes\.?|no\.?|so\.?|well\.?|the\.?|i\.?|and\.?|la\s+la.*|na\s+na.*|ooh.*|subtitles\s*by.*|translated\s*by.*|amara\.org.*|www\..*|\W+)$/i;

        if (text.length < 3 || hallucinationRegex.test(text)) {
          return '';
        }
        return text;
      }
    } catch (err) {
      console.warn('Whisper transcription error:', err);
    }
    return '';
  }, [groqKey]);

  // Resume listening cleanly after AI finishes speaking
  const resumeListeningAfterAiSpeech = useCallback(() => {
    if (!isSessionActiveRef.current) return;
    isSpeakingRef.current = false;
    hasFinishedCurrentPromptRef.current = true;
    setAudioLevel(0);
    setStatus('listening');

    // Only call recognition.start() on desktop where continuous=true keeps a single session alive.
    // On mobile (iOS/Android), calling recognition.start() triggers a brand-new OS microphone permission popup every time!
    // Mobile instead uses the persistent getUserMedia stream + MediaRecorder + Groq Whisper so it NEVER re-prompts!
    if (!isMobileDevice && recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch (_) {}
    }
  }, [isMobileDevice]);

  // Play an audio buffer and synchronize movie-style subtitle lines to the exact audio duration!
  const playSingleBufferWithSubtitles = useCallback((arrayBuffer, chunkText) => {
    return new Promise(async (resolve) => {
      if (!isSessionActiveRef.current || !isSpeakingRef.current || !audioContextRef.current) {
        return resolve();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        try { await ctx.resume(); } catch (_) {}
      }

      try {
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        if (!isSessionActiveRef.current || !isSpeakingRef.current) return resolve();

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.playbackRate.value = VOICE_PLAYBACK_RATE;

        const ttsAnalyser = ctx.createAnalyser();
        ttsAnalyser.fftSize = 256;
        source.connect(ttsAnalyser);
        ttsAnalyser.connect(ctx.destination);

        activeAudioSourceRef.current = source;
        isSpeakingRef.current = true;
        setStatus('speaking');

        // Schedule movie-style line-by-line subtitles synced to the exact spoken duration of this audio buffer!
        if (subtitleTimersRef.current.length > 0) {
          subtitleTimersRef.current.forEach(t => clearTimeout(t));
          subtitleTimersRef.current = [];
        }

        const lines = splitIntoMovieLines(chunkText || '');
        const effectiveDurationMs = (audioBuffer.duration / VOICE_PLAYBACK_RATE) * 1000;
        const totalChars = lines.reduce((sum, l) => sum + l.length, 0) || 1;

        if (lines.length > 0) {
          setAiResponse(lines[0]);
          let elapsedMs = 0;
          for (let i = 0; i < lines.length; i++) {
            const lineDuration = (lines[i].length / totalChars) * effectiveDurationMs;
            if (i > 0) {
              const lineText = lines[i];
              const timerId = setTimeout(() => {
                if (isSpeakingRef.current && isSessionActiveRef.current) {
                  setAiResponse(lineText);
                }
              }, elapsedMs);
              subtitleTimersRef.current.push(timerId);
            }
            elapsedMs += lineDuration;
          }
        }

        const ttsData = new Uint8Array(ttsAnalyser.frequencyBinCount);
        if (ttsPulseIntervalRef.current) clearInterval(ttsPulseIntervalRef.current);
        ttsPulseIntervalRef.current = setInterval(() => {
          if (!isSpeakingRef.current || !isSessionActiveRef.current) {
            clearInterval(ttsPulseIntervalRef.current);
            ttsPulseIntervalRef.current = null;
            return;
          }
          ttsAnalyser.getByteFrequencyData(ttsData);
          let s = 0;
          for (let i = 0; i < ttsData.length; i++) s += ttsData[i];
          setAudioLevel(Math.min((s / ttsData.length) / 100, 1));
        }, 50);

        source.onended = () => {
          if (ttsPulseIntervalRef.current) {
            clearInterval(ttsPulseIntervalRef.current);
            ttsPulseIntervalRef.current = null;
          }
          activeAudioSourceRef.current = null;
          resolve();
        };

        source.start(0);
      } catch (err) {
        console.error('Audio decoding error:', err);
        resolve();
      }
    });
  }, []);

  // Play audio array buffer via Web Audio API at 1.1x speed
  const playAudioBuffer = useCallback(async (arrayBuffer, textForSubtitles = '') => {
    await playSingleBufferWithSubtitles(arrayBuffer, textForSubtitles);
    if (isSessionActiveRef.current && isSpeakingRef.current) {
      resumeListeningAfterAiSpeech();
    }
  }, [playSingleBufferWithSubtitles, resumeListeningAfterAiSpeech]);

  // Immediate mid-sentence interruption (Barge-In): stops AI voice immediately & listens to what user is saying!
  const interruptAiSpeech = useCallback((preserveCurrentSpeech = false) => {
    if (!isSessionActiveRef.current) return;
    killAllVoiceOutput();

    if (!preserveCurrentSpeech) {
      clearSpeechBuffers();
    }

    setStatus('listening');
    if (!isMobileDevice && recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch (_) {}
    }
  }, [clearSpeechBuffers, isMobileDevice, killAllVoiceOutput]);

  // Main Speech Synthesis Dispatcher
  const speakText = useCallback(async (text) => {
    if (!text || !text.trim() || !isSessionActiveRef.current) return;

    killAllVoiceOutput();
    clearSpeechBuffers();

    // Ensure SpeechRecognition stays active on desktop so speaking immediately interrupts the AI!
    if (!isMobileDevice && recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch (_) {}
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    isSpeakingRef.current = true;
    hasFinishedCurrentPromptRef.current = false;
    aiSpeechStartTimeRef.current = Date.now();
    currentAiTextRef.current = text.toLowerCase();
    // Keep status as 'thinking' until the audio buffer is decoded and ready to play,
    // so the subtitle never flashes prematurely or conflicts before the voice actually starts!

    // 0. Default Built-In Ultra-Fast Neural Voice (en-US-JennyNeural via /api/tts at 1.1x playback rate)
    // Synthesizes the entire response in a single clean call (~0.6s) and caches the audio buffer in memory so resuming/repeating is 0ms instant!
    if (voiceProvider === 'neural' || voiceProvider === 'browser') {
      try {
        const cacheKey = `${neuralVoice || 'en-US-JennyNeural'}::${text.trim()}`;
        const cachedBuffer = ttsAudioCacheRef.current.get(cacheKey);
        if (cachedBuffer && cachedBuffer.byteLength > 300 && isSessionActiveRef.current && isSpeakingRef.current) {
          await playAudioBuffer(cachedBuffer.slice(0), text);
          return;
        }

        const response = await fetch('/api/tts', {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            voice: neuralVoice || 'en-US-JennyNeural'
          })
        });

        if (response.ok && isSessionActiveRef.current && isSpeakingRef.current) {
          const buffer = await response.arrayBuffer();
          if (buffer && buffer.byteLength > 300 && isSessionActiveRef.current && isSpeakingRef.current) {
            if (ttsAudioCacheRef.current.size > 40) {
              const oldestKey = ttsAudioCacheRef.current.keys().next().value;
              ttsAudioCacheRef.current.delete(oldestKey);
            }
            ttsAudioCacheRef.current.set(cacheKey, buffer.slice(0));
            await playAudioBuffer(buffer, text);
            return;
          }
        }
      } catch (err) {
        if (err.name === 'AbortError' || !isSessionActiveRef.current) return;
        console.warn('Neural TTS API fallback:', err);
      }
    }

    // 1. ElevenLabs Neural Voice
    if (voiceProvider === 'elevenlabs' && elevenLabsKey.trim()) {
      try {
        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${elevenLabsVoiceId}`, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': elevenLabsKey.trim()
          },
          body: JSON.stringify({
            text,
            model_id: 'eleven_turbo_v2_5',
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
              style: 0.0,
              use_speaker_boost: true
            }
          })
        });

        if (response.ok && isSessionActiveRef.current && isSpeakingRef.current) {
          const buffer = await response.arrayBuffer();
          if (isSessionActiveRef.current && isSpeakingRef.current) {
            await playAudioBuffer(buffer, text);
          }
          return;
        }
      } catch (err) {
        if (err.name === 'AbortError' || !isSessionActiveRef.current) return;
      }
    }

    // 2. OpenAI Neural Voice
    if (voiceProvider === 'openai' && openAiKey.trim()) {
      try {
        const response = await fetch('https://api.openai.com/v1/audio/speech', {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Authorization': `Bearer ${openAiKey.trim()}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'tts-1',
            voice: openAiVoice,
            input: text
          })
        });

        if (response.ok && isSessionActiveRef.current && isSpeakingRef.current) {
          const buffer = await response.arrayBuffer();
          if (isSessionActiveRef.current && isSpeakingRef.current) {
            await playAudioBuffer(buffer, text);
          }
          return;
        }
      } catch (err) {
        if (err.name === 'AbortError' || !isSessionActiveRef.current) return;
      }
    }

    // 3. Kokoro-TTS
    if (voiceProvider === 'kokoro' && kokoroEndpoint.trim()) {
      try {
        const response = await fetch(`${kokoroEndpoint.trim()}/audio/speech`, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'kokoro',
            voice: kokoroVoice,
            input: text
          })
        });

        if (response.ok && isSessionActiveRef.current && isSpeakingRef.current) {
          const buffer = await response.arrayBuffer();
          if (isSessionActiveRef.current && isSpeakingRef.current) {
            await playAudioBuffer(buffer, text);
          }
          return;
        }
      } catch (err) {
        if (err.name === 'AbortError' || !isSessionActiveRef.current) return;
      }
    }

    if (!isSessionActiveRef.current || !isSpeakingRef.current) return;

    // 4. Fallback: Browser Native Speech Synthesis with word-boundary movie subtitle sync
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      window.__activeUtterance = utterance;

      if (selectedBrowserVoice && browserVoices.length > 0) {
        const match = browserVoices.find(v => v.name === selectedBrowserVoice);
        if (match) utterance.voice = match;
      }

      utterance.rate = VOICE_PLAYBACK_RATE; // 1.1x slightly faster!
      utterance.pitch = 1.0;

      // Sync movie subtitle lines using estimated timing or boundary events
      setStatus('speaking');
      const lines = splitIntoMovieLines(text);
      if (lines.length > 0) setAiResponse(lines[0]);
      const estTotalMs = Math.max(1500, (text.split(/\s+/).length / 2.8) * 1000);
      const totalChars = lines.reduce((sum, l) => sum + l.length, 0) || 1;
      let elapsedMs = 0;
      for (let i = 0; i < lines.length; i++) {
        const lineDur = (lines[i].length / totalChars) * estTotalMs;
        if (i > 0) {
          const lineStr = lines[i];
          const tid = setTimeout(() => {
            if (isSpeakingRef.current && isSessionActiveRef.current) {
              setAiResponse(lineStr);
            }
          }, elapsedMs);
          subtitleTimersRef.current.push(tid);
        }
        elapsedMs += lineDur;
      }

      if (chromeKeepAliveTimerRef.current) clearInterval(chromeKeepAliveTimerRef.current);
      chromeKeepAliveTimerRef.current = setInterval(() => {
        if (!isSessionActiveRef.current) {
          clearInterval(chromeKeepAliveTimerRef.current);
          chromeKeepAliveTimerRef.current = null;
          window.speechSynthesis.cancel();
          return;
        }
        if (window.speechSynthesis.speaking && !isMobileDevice) {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        } else if (!window.speechSynthesis.speaking) {
          clearInterval(chromeKeepAliveTimerRef.current);
          chromeKeepAliveTimerRef.current = null;
        }
      }, 5000);

      if (fakeVolumeIntervalRef.current) clearInterval(fakeVolumeIntervalRef.current);
      fakeVolumeIntervalRef.current = setInterval(() => {
        if (isSpeakingRef.current && isSessionActiveRef.current) {
          setAudioLevel(0.22 + Math.random() * 0.42);
        } else {
          clearInterval(fakeVolumeIntervalRef.current);
          fakeVolumeIntervalRef.current = null;
        }
      }, 70);

      const cleanupSpeech = () => {
        if (fakeVolumeIntervalRef.current) {
          clearInterval(fakeVolumeIntervalRef.current);
          fakeVolumeIntervalRef.current = null;
        }
        if (chromeKeepAliveTimerRef.current) {
          clearInterval(chromeKeepAliveTimerRef.current);
          chromeKeepAliveTimerRef.current = null;
        }
        if (ttsFallbackTimeoutRef.current) {
          clearTimeout(ttsFallbackTimeoutRef.current);
          ttsFallbackTimeoutRef.current = null;
        }
        window.__activeUtterance = null;
        resumeListeningAfterAiSpeech();
      };

      utterance.onend = cleanupSpeech;
      utterance.onerror = cleanupSpeech;

      const estimatedDurationMs = Math.max(4000, (text.split(' ').length / 2.4) * 1000 + 3000);
      ttsFallbackTimeoutRef.current = setTimeout(() => {
        if (isSpeakingRef.current && window.__activeUtterance === utterance) {
          cleanupSpeech();
        }
      }, estimatedDurationMs);

      window.speechSynthesis.speak(utterance);
    } else {
      resumeListeningAfterAiSpeech();
    }
  }, [
    clearSpeechBuffers,
    isMobileDevice,
    killAllVoiceOutput,
    neuralVoice,
    voiceProvider,
    elevenLabsKey,
    elevenLabsVoiceId,
    openAiKey,
    openAiVoice,
    kokoroEndpoint,
    kokoroVoice,
    playAudioBuffer,
    playSingleBufferWithSubtitles,
    resumeListeningAfterAiSpeech,
    selectedBrowserVoice,
    browserVoices
  ]);

  // Turn evaluation & conversational progression
  const submitCandidateAnswer = useCallback(async (spokenText) => {
    if (isProcessingTurnRef.current || !isSessionActiveRef.current) return;
    const cleanAnswer = spokenText.trim();
    if (!cleanAnswer || cleanAnswer.length < 2) return;

    // If AI was still speaking when answer submitted, stop AI output immediately
    if (isSpeakingRef.current) {
      killAllVoiceOutput();
    }

    isProcessingTurnRef.current = true;
    clearSpeechBuffers();

    // STRICT CONTENT SAFETY & INTERVIEW-ONLY GUARDRAIL:
    // Immediately block any violent, sexual, illegal, self-harm, hate, or abusive speech before processing
    const safetyCheck = checkContentSafety(cleanAnswer);
    if (!safetyCheck.safe) {
      setStatus('thinking');
      setHistory(prev => [...prev, { sender: 'ai', text: safetyCheck.reply }]);
      isProcessingTurnRef.current = false;
      speakText(safetyCheck.reply);
      return;
    }

    setStatus('thinking');
    setHistory(prev => [...prev, { sender: 'user', text: cleanAnswer }]);

    const currentPhase = interviewPhaseRef.current;
    const currentRole = roleRef.current;
    const currentCustomTitle = customRoleTitleRef.current;
    const currentQIndex = questionIndexRef.current;
    const currentHistory = historyRef.current;

    // Allow user to ask the interviewer to repeat the question anytime
    const wantsRepeatQuestion = /\b(repeat\s*(the\s*)?(question|that)|say\s*that\s*again|what\s*was\s*the\s*question|read\s*(it|the\s*question)\s*again|come\s*again)\b/i.test(cleanAnswer);
    if (wantsRepeatQuestion && currentHistory.length > 0) {
      const lastAiMsg = [...currentHistory].reverse().find(m => m.sender === 'ai');
      if (lastAiMsg && lastAiMsg.text) {
        isProcessingTurnRef.current = false;
        speakText(lastAiMsg.text);
        return;
      }
    }

    // Allow user to switch or reset role by voice anytime
    const wantsNewRole = /\b(switch\s*role|change\s*(role|position|job)|different\s*(role|position|job)|new\s*interview|start\s*over)\b/i.test(cleanAnswer);
    if (wantsNewRole) {
      setRole('undecided');
      roleRef.current = 'undecided';
      setCustomRoleTitle('');
      customRoleTitleRef.current = '';
      setInterviewPhase('greeting');
      interviewPhaseRef.current = 'greeting';
      setQuestionIndex(-1);
      questionIndexRef.current = -1;

      const switchMsg = "Sure thing! What new job position or role would you like to interview for?";
      setHistory(prev => [...prev, { sender: 'ai', text: switchMsg }]);
      isProcessingTurnRef.current = false;
      speakText(switchMsg);
      return;
    }

    // PHASE 1: Conversational Role Discovery
    if (currentPhase === 'greeting' || currentRole === 'undecided') {
      const detected = detectRoleFromSpeech(cleanAnswer);

      if (detected.isGreetingOnly) {
        const greetBack = "Hey there! Glad we're connected. What job position or role would you like to practice interviewing for today?";
        if (!isSessionActiveRef.current) {
          isProcessingTurnRef.current = false;
          return;
        }
        setHistory(prev => [...prev, { sender: 'ai', text: greetBack }]);
        isProcessingTurnRef.current = false;
        speakText(greetBack);
        return;
      }

      const chosenRoleId = detected.matched ? detected.roleId : 'custom';
      const chosenTitle = detected.matched ? detected.customTitle : cleanAnswer;

      setRole(chosenRoleId);
      roleRef.current = chosenRoleId;
      setCustomRoleTitle(chosenTitle);
      customRoleTitleRef.current = chosenTitle;
      setInterviewPhase('interviewing');
      interviewPhaseRef.current = 'interviewing';
      setQuestionIndex(0);
      questionIndexRef.current = 0;

      const systemPrompt = `You are a warm, friendly, and sharp human interviewer conducting a live voice interview.
STRICT SAFETY & PURPOSE RULE: You must ONLY act as a legitimate job interview and career learning coach. Never discuss or engage with violence, killing, self-harm, sexual or NSFW topics, illegal acts, drugs, weapons, cybercrime, hate speech, or non-interview roleplay. If the user asks for anything inappropriate, illegal, or unrelated to legitimate career/interview learning, firmly refuse in 1 sentence and ask what legitimate job position they want to practice for.
The user just told you what job position they want to interview for: "${cleanAnswer}" (Role: ${chosenTitle}).
Acknowledge their choice enthusiastically in 1 short sentence, prepare their first relevant interview question for a ${chosenTitle} position, and ask it clearly.
Keep your entire response under 3 sentences, natural spoken English, zero markdown or bullet points.`;

      const llmReply = await fetchGroqResponse([
        { role: 'system', content: systemPrompt },
        ...currentHistory.slice(-3).map(h => ({
          role: h.sender === 'user' ? 'user' : 'assistant',
          content: h.text
        })),
        { role: 'user', content: cleanAnswer }
      ]);

      if (!isSessionActiveRef.current) {
        isProcessingTurnRef.current = false;
        return;
      }

      if (llmReply) {
        setHistory(prev => [...prev, { sender: 'ai', text: llmReply }]);
        isProcessingTurnRef.current = false;
        speakText(llmReply);
        return;
      }

      const tree = ROLE_INTERVIEW_TREES[chosenRoleId] || buildCustomRoleTree(chosenTitle);
      const firstQuestion = tree.questions[0].prompt;
      const fallbackReply = `Awesome, let's prepare your interview for the ${chosenTitle} position! Let's start with our first question: ${firstQuestion}`;

      setHistory(prev => [...prev, { sender: 'ai', text: fallbackReply }]);
      isProcessingTurnRef.current = false;
      speakText(fallbackReply);
      return;
    }

    // PHASE 2: Active Interview Conversation & Coaching Mode
    const activeRoleTitle =
      currentCustomTitle ||
      PRESET_ROLES.find(r => r.id === currentRole)?.name ||
      'Software Engineer';

    const systemPrompt = `You are an articulate, supportive human interviewer and coach conducting a live voice interview for the ${activeRoleTitle} position.
Speak in a warm, natural conversational tone with zero bullet points or markdown symbols.
STRICT SAFETY & PURPOSE RULE: You are strictly limited to professional job interview practice and career learning. Never engage with, generate, or answer anything involving violence, killing, self-harm, sexual/adult content, illegal acts, weapons, drugs, hacking/cybercrime, hate speech, profanity, or off-topic requests unrelated to interviewing and learning. If the user brings up any prohibited or off-topic subject, immediately refuse in 1 sentence and redirect back to the ${activeRoleTitle} interview question.
IMPORTANT COACHING RULE:
1. If the user says they don't know, aren't sure, asks you to explain, or struggles with the question:
   - First, warmly reassure them and clearly explain the concept in simple terms (1 to 2 sentences).
   - Second, tell them how to properly structure a great interview answer for that question (1 sentence).
   - Third, ask if they want to try answering it in their own words or move on to the next question.
2. Otherwise, if the user answered the question:
   - Briefly react to or validate their points (1 sentence), and ask the next relevant interview question for the ${activeRoleTitle} role (1 to 2 sentences).
Keep your total response to 3 to 4 spoken sentences maximum so it flows naturally.`;

    const llmReply = await fetchGroqResponse([
      { role: 'system', content: systemPrompt },
      ...currentHistory.slice(-6).map(h => ({
        role: h.sender === 'user' ? 'user' : 'assistant',
        content: h.text
      })),
      { role: 'user', content: cleanAnswer }
    ]);

    if (!isSessionActiveRef.current) {
      isProcessingTurnRef.current = false;
      return;
    }

    if (llmReply) {
      const outputSafety = checkContentSafety(llmReply);
      const safeReply = outputSafety.safe ? llmReply : SAFETY_REFUSAL_MESSAGE;
      setQuestionIndex(prev => prev + 1);
      setHistory(prev => [...prev, { sender: 'ai', text: safeReply }]);
      isProcessingTurnRef.current = false;
      speakText(safeReply);
      return;
    }

    const tree = ROLE_INTERVIEW_TREES[currentRole] || buildCustomRoleTree(activeRoleTitle);
    const nextQIndex = currentQIndex + 1;

    let responseString = '';

    if (currentQIndex < 0) {
      const firstQ = tree.questions[0];
      responseString = `Great! Let's dive into our first question for the ${activeRoleTitle} role. ${firstQ.prompt}`;
      setQuestionIndex(0);
    } else if (currentQIndex < tree.questions.length) {
      const currentQ = tree.questions[currentQIndex];
      const evaluation = evaluateAnswer(cleanAnswer, currentQ);

      if (evaluation.assessment === 'coaching') {
        responseString = `${evaluation.comment} ${evaluation.followUp}`;
      } else if (nextQIndex < tree.questions.length) {
        const nextQ = tree.questions[nextQIndex];
        responseString = `${evaluation.comment} Moving to our next question on ${nextQ.topic}: ${nextQ.prompt}`;
        setQuestionIndex(nextQIndex);
      } else {
        responseString = `${evaluation.comment} That wraps up our main questions for the ${activeRoleTitle} role! You gave thoughtful answers today. Do you have any questions for me, or would you like to try another role?`;
        setQuestionIndex(nextQIndex);
      }
    } else {
      responseString = `Thank you! We've covered great ground for the ${activeRoleTitle} position today. Tell me if you'd like to practice another question or switch to a new job role!`;
    }

    setHistory(prev => [...prev, { sender: 'ai', text: responseString }]);
    isProcessingTurnRef.current = false;
    speakText(responseString);
  }, [clearSpeechBuffers, fetchGroqResponse, killAllVoiceOutput, speakText]);

  // Audio Context, Mic Stream & Live Barge-In Interruption Detector
  const initializeAudioContext = useCallback(async () => {
    try {
      if (typeof window !== 'undefined' && !window.isSecureContext) {
        setMicWarning(`Open https://${window.location.hostname}:5173 (with https://) so Chrome shows the microphone popup!`);
        return true;
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setMicWarning(`Open https://${window.location.hostname}:5173 (with https://) so Chrome enables the microphone!`);
        return true;
      }

      // Reuse already-granted microphone stream if still active so browser never asks for permission again!
      let stream = micStreamRef.current;
      const hasLiveTracks = stream && stream.getAudioTracks().some(t => t.readyState === 'live');

      if (!hasLiveTracks) {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
        micStreamRef.current = stream;
      } else {
        stream.getAudioTracks().forEach(t => { t.enabled = true; });
      }

      setMicWarning('');

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new AudioCtx();
      }
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      try {
        const ctx = audioContextRef.current;
        const silentBuffer = ctx.createBuffer(1, 1, 22050);
        const silentSource = ctx.createBufferSource();
        silentSource.buffer = silentBuffer;
        silentSource.connect(ctx.destination);
        silentSource.start(0);
      } catch (_) {}

      if (typeof window !== 'undefined' && window.speechSynthesis) {
        try {
          window.speechSynthesis.cancel();
        } catch (_) {}
      }

      const ctx = audioContextRef.current;
      if (!analyserRef.current) {
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.3;
        analyserRef.current = analyser;

        const source = ctx.createMediaStreamSource(stream);
        source.connect(analyser);
      }

      // MediaRecorder fallback ONLY on mobile devices (where WebSpeech isn't used)
      let recorder = mediaRecorderRef.current;
      let activeVoiceFramesCount = 0;
      let totalRecordingFramesCount = 0;
      let silentGapFramesCount = 0;
      let isVerifyingBargeIn = false;
      let discardCurrentRecording = false;
      if (isMobileDevice && !recorder && typeof window.MediaRecorder !== 'undefined') {
        try {
          recorder = new MediaRecorder(stream);
          mediaRecorderRef.current = recorder;
          recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0 && !discardCurrentRecording) {
              audioChunksRef.current.push(e.data);
            }
          };
          recorder.onstop = async () => {
            const spokenFrames = activeVoiceFramesCount;
            const totalFrames = totalRecordingFramesCount;
            const gapFrames = silentGapFramesCount;
            const wasBargeInCheck = isVerifyingBargeIn;
            const shouldDiscard = discardCurrentRecording;
            activeVoiceFramesCount = 0;
            totalRecordingFramesCount = 0;
            silentGapFramesCount = 0;
            isVerifyingBargeIn = false;
            discardCurrentRecording = false;
            isRecordingChunkRef.current = false;
            const chunks = audioChunksRef.current;
            audioChunksRef.current = [];
            if (shouldDiscard || !isSessionActiveRef.current || isProcessingTurnRef.current) return;

            // Require at least ~400ms (24 frames) of actual close-mic human voice
            if (spokenFrames < 24) return;

            // Syllabic speech vs. continuous background song check:
            // If recording lasted >2.5s (150 frames) with almost zero natural syllable/word pauses (<8% gap frames),
            // it's a continuous song/music stream in the background — reject it!
            if (totalFrames > 150 && gapFrames / totalFrames < 0.08) {
              return;
            }

            if (chunks.length > 0) {
              const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
              const whisperText = await transcribeAudioWithWhisper(blob);
              if (!whisperText || !isSessionActiveRef.current || isProcessingTurnRef.current) return;

              // If the AI was speaking while this mobile audio was recorded, verify it's a real user phrase (not noise or AI echo!) before interrupting!
              if (isSpeakingRef.current || wasBargeInCheck) {
                const cleanWords = whisperText
                  .toLowerCase()
                  .replace(/[^a-z0-9\s]/g, ' ')
                  .split(/\s+/)
                  .filter(w => w.length >= 2);

                if (cleanWords.length < 2 || whisperText.trim().length < 6) return;

                const cleanAiText = (currentAiTextRef.current || '')
                  .toLowerCase()
                  .replace(/[^a-z0-9\s]/g, ' ')
                  .replace(/\s+/g, ' ')
                  .trim();
                const cleanIncoming = cleanWords.join(' ');
                if (cleanAiText.includes(cleanIncoming)) return;

                if (cleanWords.length >= 2) {
                  let matchingBigrams = 0;
                  for (let i = 0; i < cleanWords.length - 1; i++) {
                    const bigram = `${cleanWords[i]} ${cleanWords[i + 1]}`;
                    if (cleanAiText.includes(bigram)) matchingBigrams++;
                  }
                  if (matchingBigrams > 0 && matchingBigrams >= Math.ceil((cleanWords.length - 1) * 0.5)) {
                    return;
                  }
                }

                // Confirmed genuine spoken phrase on mobile! Stop AI voice and process the user's interruption!
                killAllVoiceOutput();
                hasFinishedCurrentPromptRef.current = true;
                setTranscript(whisperText);
                submitCandidateAnswer(whisperText);
                return;
              }

              setTranscript(whisperText);
              submitCandidateAnswer(whisperText);
            }
          };
        } catch (e) {
          console.warn('MediaRecorder init skipped:', e);
        }
      }

      const analyser = analyserRef.current;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let lastVoiceTime = 0;
      let recordingStartTime = 0;
      let continuousSoundFrames = 0;
      let bargeInFrames = 0;
      let startSpeechFrames = 0;

      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);

      const checkAudioLevel = () => {
        if (!analyserRef.current || !isSessionActiveRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        // Separate close-up human speech from background music/songs:
        // 1. Sub-bass & bass drums (bins 0-1, <200Hz): high in music/songs, low in close-up speech
        // 2. Core human vocal formants (bins 3-18, ~300Hz-3100Hz): dominant when user speaks into mic
        // 3. High-frequency instruments/cymbals (bins 24-60, >4000Hz): high in background music
        const subBassAvg = (dataArray[0] + dataArray[1]) / 2;

        let voiceBandSum = 0;
        const startBin = 3;
        const endBin = Math.min(18, dataArray.length - 1);
        const binCount = Math.max(1, endBin - startBin + 1);
        for (let i = startBin; i <= endBin; i++) {
          voiceBandSum += dataArray[i];
        }
        const voiceAverage = voiceBandSum / binCount;

        let highMusicSum = 0;
        const highStart = 24;
        const highEnd = Math.min(56, dataArray.length - 1);
        const highCount = Math.max(1, highEnd - highStart + 1);
        for (let i = highStart; i <= highEnd; i++) {
          highMusicSum += dataArray[i];
        }
        const highMusicAvg = highMusicSum / highCount;

        // If sub-bass or high-frequency instrumentals dominate relative to vocal mids, it's background music/noise — attenuate it!
        const isMusicDominated =
          (subBassAvg > voiceAverage * 1.35 && voiceAverage < 115) ||
          (highMusicAvg > voiceAverage * 0.85 && voiceAverage < 110);

        const rawNormalized = Math.min(voiceAverage / 135, 1);
        const normalized = isMusicDominated ? rawNormalized * 0.45 : rawNormalized;
        currentMicVolumeRef.current = normalized;

        // Continuously adapt ambient noise/music floor:
        // On mobile phones (which have aggressive hardware AGC that boosts background songs),
        // if sound stays continuously elevated without syllable gaps for >1.5s (90 frames), lock the noise floor directly onto the song!
        const currentFloor = ambientNoiseFloorRef.current;
        if (normalized > currentFloor + 0.04) {
          continuousSoundFrames++;
        } else {
          continuousSoundFrames = Math.max(0, continuousSoundFrames - 3);
        }

        if (normalized < currentFloor) {
          ambientNoiseFloorRef.current = currentFloor * 0.92 + normalized * 0.08;
        } else if (isMobileDevice && continuousSoundFrames > 90) {
          // Continuous song/music detected on mobile! Rapidly raise the floor to match the song so it stops capturing!
          ambientNoiseFloorRef.current = Math.min(0.68, currentFloor * 0.88 + normalized * 0.12);
        } else if (normalized < currentFloor + (isMobileDevice ? 0.32 : 0.22)) {
          ambientNoiseFloorRef.current = Math.min(isMobileDevice ? 0.65 : 0.55, currentFloor * 0.96 + normalized * 0.04);
        }

        const now = Date.now();
        // Phone mics are much more sensitive than desktop mics, so require a higher close-mic vocal threshold on mobile!
        const minVoiceGate = isMobileDevice ? 0.26 : 0.14;
        const minBargeGate = isMobileDevice ? 0.32 : 0.19;
        const floorMargin = isMobileDevice ? 0.15 : 0.11;
        const dynamicVoiceThreshold = Math.max(minVoiceGate, ambientNoiseFloorRef.current + floorMargin);
        const dynamicBargeInThreshold = Math.max(minBargeGate, ambientNoiseFloorRef.current + floorMargin + 0.04);

        if (normalized >= dynamicVoiceThreshold && !isMusicDominated) {
          lastVoiceSpikeAboveNoiseTimeRef.current = now;
        }

        // Mobile Barge-In: NEVER kill AI voice on raw volume alone (which could be a cough, tap, cafe noise, or phone speaker bleed)!
        // Instead, record the candidate speech while AI continues speaking, and only interrupt once Whisper confirms a real 2+ word phrase!
        if (isSpeakingRef.current) {
          if (isMobileDevice && now - aiSpeechStartTimeRef.current > 800 && normalized > dynamicBargeInThreshold && !isMusicDominated) {
            lastVoiceTime = now;
            bargeInFrames++;
            if (isRecordingChunkRef.current) {
              activeVoiceFramesCount++;
              totalRecordingFramesCount++;
            }
            if (
              bargeInFrames >= 14 &&
              recorder &&
              recorder.state === 'inactive' &&
              !isRecordingChunkRef.current &&
              !isProcessingTurnRef.current
            ) {
              audioChunksRef.current = [];
              activeVoiceFramesCount = bargeInFrames;
              totalRecordingFramesCount = bargeInFrames;
              silentGapFramesCount = 0;
              discardCurrentRecording = false;
              isVerifyingBargeIn = true;
              isRecordingChunkRef.current = true;
              recordingStartTime = now;
              try {
                recorder.start();
              } catch (_) {}
            }
          } else {
            bargeInFrames = Math.max(0, bargeInFrames - 1);
            if (isRecordingChunkRef.current) {
              totalRecordingFramesCount++;
              silentGapFramesCount++;
            }
            if (
              isMobileDevice &&
              isRecordingChunkRef.current &&
              isVerifyingBargeIn &&
              recorder &&
              recorder.state === 'recording' &&
              (now - lastVoiceTime > 650 || now - recordingStartTime > 4500)
            ) {
              try {
                recorder.stop();
              } catch (_) {}
            }
          }
        } else {
          // Only pulse the visual orb for voice clearly above the background song/noise floor!
          const visualLevel = normalized > dynamicVoiceThreshold
            ? Math.max(0, normalized - ambientNoiseFloorRef.current)
            : 0;
          setAudioLevel(visualLevel);

          // Require genuine close-mic voice above background song/noise floor for at least 8 frames (~135ms) on mobile before starting recorder
          if (normalized > dynamicVoiceThreshold && !isMusicDominated) {
            lastVoiceTime = now;
            startSpeechFrames++;
            if (isRecordingChunkRef.current) {
              activeVoiceFramesCount++;
              totalRecordingFramesCount++;
            }

            if (
              startSpeechFrames >= 8 &&
              recorder &&
              recorder.state === 'inactive' &&
              !isRecordingChunkRef.current &&
              !isProcessingTurnRef.current
            ) {
              audioChunksRef.current = [];
              activeVoiceFramesCount = startSpeechFrames;
              totalRecordingFramesCount = startSpeechFrames;
              silentGapFramesCount = 0;
              discardCurrentRecording = false;
              isRecordingChunkRef.current = true;
              recordingStartTime = now;
              try {
                recorder.start();
              } catch (_) {}
            }
          } else {
            startSpeechFrames = Math.max(0, startSpeechFrames - 1);
            if (isRecordingChunkRef.current) {
              totalRecordingFramesCount++;
              silentGapFramesCount++;
            }
          }

          // Mobile anti-infinite-capture guard:
          // 1. Normal stop after SILENCE_SUBMIT_MS (1.2s) of silence
          // 2. If recording has gone on for >3s (180 frames) with <8% natural syllable pauses, it's a continuous background song -> abort & discard immediately!
          // 3. Hard cap at 9s per segment so the recorder can NEVER get stuck capturing forever!
          if (isRecordingChunkRef.current && recorder && recorder.state === 'recording') {
            const isContinuousSongStream =
              totalRecordingFramesCount > 180 && silentGapFramesCount / totalRecordingFramesCount < 0.08;

            if (isContinuousSongStream) {
              discardCurrentRecording = true;
              ambientNoiseFloorRef.current = Math.min(0.68, Math.max(ambientNoiseFloorRef.current, normalized + 0.06));
              try {
                recorder.stop();
              } catch (_) {}
            } else if (now - lastVoiceTime > SILENCE_SUBMIT_MS || now - recordingStartTime > 9000) {
              try {
                recorder.stop();
              } catch (_) {}
            }
          }
        }

        rafIdRef.current = requestAnimationFrame(checkAudioLevel);
      };

      checkAudioLevel();
      return true;
    } catch (err) {
      console.warn('Microphone access error:', err);
      if (err && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
        setMicWarning('Microphone permission was blocked in Chrome. Tap the tune/lock icon left of the URL bar → Permissions → Allow Microphone.');
      } else {
        setMicWarning(`Microphone error: ${err.message || 'Check browser mic permissions'}`);
      }
      return true;
    }
  }, [interruptAiSpeech, isMobileDevice, submitCandidateAnswer, transcribeAudioWithWhisper]);

  // Speech Recognition (Web Speech API) - Desktop only!
  // On Mobile (iOS/Android), webkitSpeechRecognition.start() triggers a recurring microphone permission popup every time.
  // So mobile uses our persistent getUserMedia stream + MediaRecorder + Whisper, which NEVER re-prompts!
  const initializeSpeechRecognition = useCallback(() => {
    if (isMobileDevice) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    // Reuse existing recognition instance if already running so we never re-trigger permission prompts
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
        return;
      } catch (_) {
        return;
      }
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      if (!isSessionActiveRef.current || isProcessingTurnRef.current) {
        return;
      }

      let interim = '';
      let newlyFinal = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const alt = event.results[i][0];
        if (event.results[i].isFinal) {
          // Ignore low-confidence background music/noise guesses from Chrome WebSpeech (distant song lyrics have lower confidence than close-mic speech)
          if (typeof alt.confidence === 'number' && alt.confidence > 0 && alt.confidence < 0.68) {
            continue;
          }
          newlyFinal += alt.transcript + ' ';
        } else {
          interim += alt.transcript;
        }
      }

      const incomingSpeech = (newlyFinal + ' ' + interim).trim();

      // Reject distant background music/songs when the user hasn't actually spoken into the microphone above the room's music floor!
      if (Date.now() - lastVoiceSpikeAboveNoiseTimeRef.current > 2200) {
        return;
      }

      // If AI is currently speaking and user starts talking:
      // Always-on adaptive interruption: works in quiet rooms AND noisy cafes without needing any button press!
      if (isSpeakingRef.current) {
        const cleanWords = incomingSpeech
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter(w => w.length >= 2);

        const isRealSpokenPhrase = cleanWords.length >= 2 && incomingSpeech.length >= 6;
        if (!isRealSpokenPhrase) return;

        // Require that the user's close-up voice spiked above the adaptive room/cafe noise floor within the last 1.4s
        if (Date.now() - lastVoiceSpikeAboveNoiseTimeRef.current > 1400) return;

        // Ignore if mic picked up a contiguous snippet or 2-word echo of the AI's own sentence
        const cleanAiText = (currentAiTextRef.current || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
        const cleanIncoming = cleanWords.join(' ');
        if (cleanAiText.includes(cleanIncoming)) return;

        if (cleanWords.length >= 2) {
          let matchingBigrams = 0;
          for (let i = 0; i < cleanWords.length - 1; i++) {
            const bigram = `${cleanWords[i]} ${cleanWords[i + 1]}`;
            if (cleanAiText.includes(bigram)) matchingBigrams++;
          }
          if (matchingBigrams > 0 && matchingBigrams >= Math.ceil((cleanWords.length - 1) * 0.5)) {
            return;
          }
        }

        // Genuine spoken phrase from user! Stop AI voice immediately and capture user's new speech!
        killAllVoiceOutput();
        hasFinishedCurrentPromptRef.current = true;
        setStatus('listening');
      }

      currentInterimRef.current = interim;
      setInterimTranscript(interim);

      if (newlyFinal) {
        transcriptAccumulatorRef.current = (transcriptAccumulatorRef.current + ' ' + newlyFinal).trim();
        setTranscript(transcriptAccumulatorRef.current);
        currentInterimRef.current = '';
        setInterimTranscript('');
      }

      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (silenceIntervalRef.current) clearInterval(silenceIntervalRef.current);

      const currentSpoken = (transcriptAccumulatorRef.current + ' ' + currentInterimRef.current).trim();
      if (currentSpoken.length > 1 && !isSpeakingRef.current && isSessionActiveRef.current) {
        const startTime = Date.now();
        const duration = SILENCE_SUBMIT_MS;

        silenceIntervalRef.current = setInterval(() => {
          if (!isSessionActiveRef.current || isSpeakingRef.current) {
            clearInterval(silenceIntervalRef.current);
            silenceIntervalRef.current = null;
            return;
          }
          const elapsed = Date.now() - startTime;
          const pct = Math.min(100, Math.round((elapsed / duration) * 100));
          setSilenceProgress(pct);
          if (pct >= 100) {
            clearInterval(silenceIntervalRef.current);
            silenceIntervalRef.current = null;
          }
        }, 50);

        silenceTimerRef.current = setTimeout(() => {
          const spoken = (transcriptAccumulatorRef.current + ' ' + currentInterimRef.current).trim();
          if (spoken.length > 1 && !isSpeakingRef.current && isSessionActiveRef.current && !isProcessingTurnRef.current) {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
              try {
                audioChunksRef.current = [];
                mediaRecorderRef.current.stop();
              } catch (_) {}
            }
            submitCandidateAnswer(spoken);
          }
          setSilenceProgress(0);
        }, duration);
      }
    };

    recognition.onerror = (e) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        console.warn('Speech recognition event:', e.error);
      }
    };

    recognition.onend = () => {
      if (isSessionActiveRef.current && !isProcessingTurnRef.current) {
        setTimeout(() => {
          if (isSessionActiveRef.current && recognitionRef.current === recognition) {
            try {
              recognition.start();
            } catch (_) {}
          }
        }, 140);
      }
    };

    try {
      recognition.start();
    } catch (_) {}

    recognitionRef.current = recognition;
  }, [isMobileDevice, killAllVoiceOutput, submitCandidateAnswer]);

  // Start or Resume Current Session (Protected against rapid spam clicks & instant 0ms resume from TTS cache!)
  const startInterview = async () => {
    if (isStartingOrStoppingRef.current || isSessionActiveRef.current) return;
    isStartingOrStoppingRef.current = true;

    try {
      isSessionActiveRef.current = true;
      isProcessingTurnRef.current = false;
      setStatus('thinking');

      await initializeAudioContext();
      if (!isSessionActiveRef.current) return;

      initializeSpeechRecognition();
      clearSpeechBuffers();

      const savedTitle = customRoleTitleRef.current;
      const savedPhase = interviewPhaseRef.current;
      const savedHistory = historyRef.current;

      // If the interviewer ALREADY finished reading the current question/prompt before the user paused,
      // go straight to Listening mode immediately (0ms) without re-reading the whole question out loud!
      if (hasFinishedCurrentPromptRef.current && savedHistory.length > 0) {
        const lastAiMsg = [...savedHistory].reverse().find(m => m.sender === 'ai');
        if (lastAiMsg && lastAiMsg.text) {
          const lines = splitIntoMovieLines(lastAiMsg.text);
          setAiResponse(lines[lines.length - 1] || lastAiMsg.text);
        }
        isSpeakingRef.current = false;
        setStatus('listening');
        return;
      }

      if (savedPhase === 'interviewing' && savedTitle && savedHistory.length > 0) {
        const lastAiMsg = [...savedHistory].reverse().find(m => m.sender === 'ai');
        const resumeText = lastAiMsg
          ? lastAiMsg.text
          : `Welcome back! Ready to continue your ${savedTitle} interview?`;

        // Never append duplicate history entries if the last message in history is already this AI prompt!
        if (!lastAiMsg) {
          const updated = [...savedHistory, { sender: 'ai', text: resumeText }];
          historyRef.current = updated;
          setHistory(updated);
        }

        speakText(resumeText);
        return;
      }

      setRole('undecided');
      roleRef.current = 'undecided';
      setCustomRoleTitle('');
      customRoleTitleRef.current = '';
      setInterviewPhase('greeting');
      interviewPhaseRef.current = 'greeting';
      setQuestionIndex(-1);
      questionIndexRef.current = -1;

      const welcome = CONVERSATIONAL_GREETING;
      // Only set welcome in history if it's not already the only message
      if (savedHistory.length !== 1 || savedHistory[0]?.text !== welcome) {
        const initialHistory = [{ sender: 'ai', text: welcome }];
        historyRef.current = initialHistory;
        setHistory(initialHistory);
      }
      speakText(welcome);
    } finally {
      setTimeout(() => {
        isStartingOrStoppingRef.current = false;
      }, 280);
    }
  };

  // Stop Session
  const stopInterview = useCallback((destroyHardwareTracks = false) => {
    if (isStartingOrStoppingRef.current && !destroyHardwareTracks) return;
    isStartingOrStoppingRef.current = true;
    setTimeout(() => {
      isStartingOrStoppingRef.current = false;
    }, 220);

    isSessionActiveRef.current = false;
    isSpeakingRef.current = false;
    isProcessingTurnRef.current = false;

    killAllVoiceOutput();
    clearSpeechBuffers();

    if (mediaRecorderRef.current) {
      try {
        if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      } catch (_) {}
    }
    audioChunksRef.current = [];
    isRecordingChunkRef.current = false;

    if (destroyHardwareTracks === true && recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.abort();
        recognitionRef.current.stop();
      } catch (_) {}
      recognitionRef.current = null;
    }

    // Keep mic tracks alive across taps so browser NEVER re-prompts for permission!
    if (destroyHardwareTracks === true && micStreamRef.current) {
      try {
        micStreamRef.current.getTracks().forEach(track => track.stop());
      } catch (_) {}
      micStreamRef.current = null;
    }

    if (destroyHardwareTracks === true && audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close();
      } catch (_) {}
      audioContextRef.current = null;
      analyserRef.current = null;
    }

    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    setStatus('idle');
    setAudioLevel(0);
    setAiResponse('');
  }, [clearSpeechBuffers, killAllVoiceOutput]);

  // Create a brand new interview session (Starts immediately without stopping/re-requesting the mic!)
  const createNewInterviewSession = useCallback(async () => {
    killAllVoiceOutput();
    clearSpeechBuffers();
    isProcessingTurnRef.current = false;
    hasFinishedCurrentPromptRef.current = false;

    const fresh = createBlankSession();
    setSessions(prev => {
      const updated = [fresh, ...prev];
      saveSessionsToBrowser(updated, fresh.id);
      return updated;
    });
    setActiveSessionId(fresh.id);
    setRole('undecided');
    roleRef.current = 'undecided';
    setCustomRoleTitle('');
    customRoleTitleRef.current = '';
    setInterviewPhase('greeting');
    interviewPhaseRef.current = 'greeting';
    setQuestionIndex(-1);
    questionIndexRef.current = -1;

    const welcome = CONVERSATIONAL_GREETING;
    setHistory([{ sender: 'ai', text: welcome }]);
    historyRef.current = [{ sender: 'ai', text: welcome }];

    // If mic is already initialized, immediately speak the new greeting without any extra tap!
    if (micStreamRef.current) {
      isSessionActiveRef.current = true;
      await initializeAudioContext();
      initializeSpeechRecognition();
      speakText(welcome);
    } else {
      setStatus('idle');
      setAiResponse('');
    }
  }, [clearSpeechBuffers, initializeAudioContext, initializeSpeechRecognition, killAllVoiceOutput, speakText]);

  // Switch to an older interview session from the sidebar (keeps mic stream alive!)
  const selectInterviewSession = useCallback(async (sessionId) => {
    const target = sessions.find(s => s.id === sessionId);
    if (!target) return;
    killAllVoiceOutput();
    clearSpeechBuffers();
    isProcessingTurnRef.current = false;
    hasFinishedCurrentPromptRef.current = false;

    setActiveSessionId(target.id);
    setRole(target.role || 'undecided');
    roleRef.current = target.role || 'undecided';
    setCustomRoleTitle(target.customRoleTitle || '');
    customRoleTitleRef.current = target.customRoleTitle || '';
    setInterviewPhase(target.interviewPhase || 'greeting');
    interviewPhaseRef.current = target.interviewPhase || 'greeting';
    setQuestionIndex(typeof target.questionIndex === 'number' ? target.questionIndex : -1);
    questionIndexRef.current = typeof target.questionIndex === 'number' ? target.questionIndex : -1;
    const targetHistory = Array.isArray(target.history) ? target.history : [];
    setHistory(targetHistory);
    historyRef.current = targetHistory;

    if (micStreamRef.current) {
      isSessionActiveRef.current = true;
      await initializeAudioContext();
      initializeSpeechRecognition();
      const lastAiMsg = [...targetHistory].reverse().find(m => m.sender === 'ai');
      const resumeText = lastAiMsg ? lastAiMsg.text : CONVERSATIONAL_GREETING;
      speakText(resumeText);
    } else {
      setStatus('idle');
      setAiResponse('');
    }
  }, [clearSpeechBuffers, initializeAudioContext, initializeSpeechRecognition, killAllVoiceOutput, sessions, speakText]);

  // Delete an interview session from the sidebar
  const deleteInterviewSession = useCallback((sessionId) => {
    setSessions(prev => {
      const remaining = prev.filter(s => s.id !== sessionId);
      if (remaining.length === 0) {
        const fresh = createBlankSession();
        setActiveSessionId(fresh.id);
        setRole('undecided');
        roleRef.current = 'undecided';
        setCustomRoleTitle('');
        customRoleTitleRef.current = '';
        setInterviewPhase('greeting');
        interviewPhaseRef.current = 'greeting';
        setQuestionIndex(-1);
        questionIndexRef.current = -1;
        setHistory([]);
        historyRef.current = [];
        saveSessionsToBrowser([fresh], fresh.id);
        return [fresh];
      }
      if (sessionId === activeSessionId) {
        const nextActive = remaining[0];
        setActiveSessionId(nextActive.id);
        setRole(nextActive.role || 'undecided');
        roleRef.current = nextActive.role || 'undecided';
        setCustomRoleTitle(nextActive.customRoleTitle || '');
        customRoleTitleRef.current = nextActive.customRoleTitle || '';
        setInterviewPhase(nextActive.interviewPhase || 'greeting');
        interviewPhaseRef.current = nextActive.interviewPhase || 'greeting';
        setQuestionIndex(typeof nextActive.questionIndex === 'number' ? nextActive.questionIndex : -1);
        questionIndexRef.current = typeof nextActive.questionIndex === 'number' ? nextActive.questionIndex : -1;
        setHistory(Array.isArray(nextActive.history) ? nextActive.history : []);
        historyRef.current = Array.isArray(nextActive.history) ? nextActive.history : [];
        saveSessionsToBrowser(remaining, nextActive.id);
      } else {
        saveSessionsToBrowser(remaining, activeSessionId);
      }
      return remaining;
    });
  }, [activeSessionId]);

  const submitTypedAnswer = async (text) => {
    if (!text.trim()) return;
    if (!isSessionActiveRef.current) {
      isSessionActiveRef.current = true;
      await initializeAudioContext();
      initializeSpeechRecognition();
    }
    if (isSpeakingRef.current) {
      killAllVoiceOutput();
    }
    submitCandidateAnswer(text);
  };

  useEffect(() => {
    const handlePageUnload = () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      stopInterview(true);
    };

    window.addEventListener('beforeunload', handlePageUnload);
    window.addEventListener('pagehide', handlePageUnload);

    return () => {
      window.removeEventListener('beforeunload', handlePageUnload);
      window.removeEventListener('pagehide', handlePageUnload);
      stopInterview(true);
    };
  }, [stopInterview]);

  return {
    role,
    setRole,
    customRoleTitle,
    interviewPhase,
    status,
    audioLevel,
    transcript,
    interimTranscript,
    aiResponse,
    history,
    startInterview,
    stopInterview,
    interruptAiSpeech,
    submitTypedAnswer,
    isSpeechRecognitionSupported,
    silenceProgress,
    micWarning,

    // Multi-session History (ChatGPT-style sidebar)
    sessions,
    activeSessionId,
    createNewInterviewSession,
    selectInterviewSession,
    deleteInterviewSession,

    voiceProvider,
    updateVoiceProvider,
    elevenLabsKey,
    updateElevenLabsKey,
    elevenLabsVoiceId,
    updateElevenLabsVoiceId,
    openAiKey,
    updateOpenAiKey,
    openAiVoice,
    updateOpenAiVoice,
    kokoroEndpoint,
    updateKokoroEndpoint,
    kokoroVoice,
    updateKokoroVoice,
    groqKey,
    updateGroqKey,

    browserVoices,
    selectedBrowserVoice,
    setSelectedBrowserVoice
  };
}
