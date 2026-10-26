import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ROLE_INTERVIEW_TREES,
  PRESET_ROLES,
  CONVERSATIONAL_GREETING,
  detectRoleFromSpeech,
  buildCustomRoleTree,
  evaluateAnswer
} from '../services/interviewKnowledge';
import { ELEVENLABS_VOICES } from '../services/voiceProviders';

const SILENCE_SUBMIT_MS = 4000; // Wait 4 full seconds after user stops talking before submitting
const POST_SPEECH_COOLDOWN_MS = 900; // Ignore room echo for 0.9s right after AI finishes speaking

export function useVoiceInterview() {
  const [role, setRole] = useState('undecided');
  const [customRoleTitle, setCustomRoleTitle] = useState('');
  const [interviewPhase, setInterviewPhase] = useState('greeting'); // 'greeting' | 'interviewing'
  const [status, setStatus] = useState('idle'); // 'idle' | 'listening' | 'thinking' | 'speaking' | 'interrupted'
  const [audioLevel, setAudioLevel] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [history, setHistory] = useState([]);
  const [questionIndex, setQuestionIndex] = useState(-1);
  const [isSpeechRecognitionSupported, setIsSpeechRecognitionSupported] = useState(true);
  const [silenceProgress, setSilenceProgress] = useState(0);
  const [micWarning, setMicWarning] = useState('');

  // Voice Provider Configuration
  const [voiceProvider, setVoiceProvider] = useState(() => localStorage.getItem('melo_voice_provider') || 'browser');
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
  const abortControllerRef = useRef(null);
  const ignoreMicUntilRef = useRef(0);

  const isSpeakingRef = useRef(false);
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

  const isMobileDevice = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  useEffect(() => { roleRef.current = role; }, [role]);
  useEffect(() => { customRoleTitleRef.current = customRoleTitle; }, [customRoleTitle]);
  useEffect(() => { interviewPhaseRef.current = interviewPhase; }, [interviewPhase]);
  useEffect(() => { questionIndexRef.current = questionIndex; }, [questionIndex]);
  useEffect(() => { historyRef.current = history; }, [history]);

  // Check SpeechRecognition browser support
  useEffect(() => {
    const hasSpeechRec = typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
    setIsSpeechRecognitionSupported(hasSpeechRec);
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

  // Helper to call Groq LLM with automatic model fallback
  const fetchGroqResponse = useCallback(async (messages) => {
    if (!groqKey.trim() || !isSessionActiveRef.current) return null;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const modelsToTry = ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];

    for (const modelName of modelsToTry) {
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
            model: modelName,
            messages,
            temperature: 0.7,
            max_tokens: 180
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

  // Transcribe recorded mobile/desktop audio blob using Groq Whisper (Fallback for mobile Chrome)
  const transcribeAudioWithWhisper = useCallback(async (audioBlob) => {
    if (!groqKey.trim() || !audioBlob || audioBlob.size < 2500 || !isSessionActiveRef.current) return '';
    try {
      const formData = new FormData();
      const ext = audioBlob.type.includes('mp4') ? 'm4a' : 'webm';
      formData.append('file', audioBlob, `speech.${ext}`);
      formData.append('model', 'whisper-large-v3-turbo');
      formData.append('language', 'en');
      formData.append('response_format', 'json');

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
        // Filter out common Whisper silence/background noise hallucinations
        if (
          text.length < 3 ||
          /^(thank you\.?|thanks for watching\.?|you\.?|bye\.?|okay\.?|oh\.?|uh\.?|um\.?|hmm\.?|subtitles by.*|\.+)$/i.test(text)
        ) {
          return '';
        }
        return text;
      }
    } catch (err) {
      console.warn('Whisper transcription error:', err);
    }
    return '';
  }, [groqKey]);

  // Resume listening cleanly after AI finishes speaking (with cooldown to ignore room echo)
  const resumeListeningAfterAiSpeech = useCallback(() => {
    if (!isSessionActiveRef.current) return;
    isSpeakingRef.current = false;
    setAudioLevel(0);
    clearSpeechBuffers();

    // Ignore mic input for 0.9s after AI stops speaking so speaker echo isn't picked up as user answer!
    ignoreMicUntilRef.current = Date.now() + POST_SPEECH_COOLDOWN_MS;
    setStatus('listening');

    setTimeout(() => {
      if (!isSessionActiveRef.current || isSpeakingRef.current) return;
      clearSpeechBuffers();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch (_) {}
      }
    }, 350);
  }, [clearSpeechBuffers]);

  // Play audio array buffer via Web Audio API
  const playAudioBuffer = useCallback(async (arrayBuffer) => {
    if (!isSessionActiveRef.current || !audioContextRef.current) {
      resumeListeningAfterAiSpeech();
      return;
    }
    const ctx = audioContextRef.current;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    try {
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      if (!isSessionActiveRef.current) return;

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;

      const ttsAnalyser = ctx.createAnalyser();
      ttsAnalyser.fftSize = 256;
      source.connect(ttsAnalyser);
      ttsAnalyser.connect(ctx.destination);

      activeAudioSourceRef.current = source;
      isSpeakingRef.current = true;
      setStatus('speaking');

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
        resumeListeningAfterAiSpeech();
      };

      source.start(0);
    } catch (err) {
      console.error('Audio decoding error:', err);
      resumeListeningAfterAiSpeech();
    }
  }, [resumeListeningAfterAiSpeech]);

  // Immediate mid-sentence interruption
  const interruptAiSpeech = useCallback(() => {
    if (!isSessionActiveRef.current) return;
    killAllVoiceOutput();
    clearSpeechBuffers();
    setStatus('interrupted');

    setTimeout(() => {
      if (isSessionActiveRef.current) {
        resumeListeningAfterAiSpeech();
      }
    }, 200);
  }, [clearSpeechBuffers, killAllVoiceOutput, resumeListeningAfterAiSpeech]);

  // Main Speech Synthesis Dispatcher
  const speakText = useCallback(async (text) => {
    if (!text || !text.trim() || !isSessionActiveRef.current) return;

    killAllVoiceOutput();
    clearSpeechBuffers();

    // Pause SpeechRecognition & MediaRecorder while AI speaks so the mic NEVER transcribes the AI's own voice!
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (_) {}
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        audioChunksRef.current = [];
        isRecordingChunkRef.current = false;
        mediaRecorderRef.current.stop();
      } catch (_) {}
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    isSpeakingRef.current = true;
    setStatus('speaking');
    setAiResponse(text);

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

        if (response.ok && isSessionActiveRef.current) {
          const buffer = await response.arrayBuffer();
          if (isSessionActiveRef.current) {
            await playAudioBuffer(buffer);
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

        if (response.ok && isSessionActiveRef.current) {
          const buffer = await response.arrayBuffer();
          if (isSessionActiveRef.current) {
            await playAudioBuffer(buffer);
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

        if (response.ok && isSessionActiveRef.current) {
          const buffer = await response.arrayBuffer();
          if (isSessionActiveRef.current) {
            await playAudioBuffer(buffer);
          }
          return;
        }
      } catch (err) {
        if (err.name === 'AbortError' || !isSessionActiveRef.current) return;
      }
    }

    if (!isSessionActiveRef.current) return;

    // 4. Fallback: Browser Native Speech Synthesis
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      window.__activeUtterance = utterance;

      if (selectedBrowserVoice && browserVoices.length > 0) {
        const match = browserVoices.find(v => v.name === selectedBrowserVoice);
        if (match) utterance.voice = match;
      }

      utterance.rate = 1.02;
      utterance.pitch = 1.0;

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

      const estimatedDurationMs = Math.max(4000, (text.split(' ').length / 2.2) * 1000 + 3000);
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
    voiceProvider,
    elevenLabsKey,
    elevenLabsVoiceId,
    openAiKey,
    openAiVoice,
    kokoroEndpoint,
    kokoroVoice,
    playAudioBuffer,
    resumeListeningAfterAiSpeech,
    selectedBrowserVoice,
    browserVoices
  ]);

  // Turn evaluation & conversational progression
  const submitCandidateAnswer = useCallback(async (spokenText) => {
    if (isProcessingTurnRef.current || !isSessionActiveRef.current || isSpeakingRef.current) return;
    const cleanAnswer = spokenText.trim();
    if (!cleanAnswer || cleanAnswer.length < 2) return;

    isProcessingTurnRef.current = true;
    clearSpeechBuffers();

    setStatus('thinking');
    setHistory(prev => [...prev, { sender: 'user', text: cleanAnswer }]);

    const currentPhase = interviewPhaseRef.current;
    const currentRole = roleRef.current;
    const currentCustomTitle = customRoleTitleRef.current;
    const currentQIndex = questionIndexRef.current;
    const currentHistory = historyRef.current;

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

    // PHASE 2: Active Interview Conversation
    const activeRoleTitle =
      currentCustomTitle ||
      PRESET_ROLES.find(r => r.id === currentRole)?.name ||
      'Software Engineer';

    const systemPrompt = `You are an articulate, supportive human interviewer conducting a live voice interview for the ${activeRoleTitle} position.
Speak in a warm, natural conversational tone. Keep your response concise (2 to 3 sentences max), spoken-friendly, with zero bullet points or markdown symbols.
Briefly react to or evaluate the candidate's answer, and then ask the next relevant interview question or a deeper follow-up question for the ${activeRoleTitle} role.`;

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
      setQuestionIndex(prev => prev + 1);
      setHistory(prev => [...prev, { sender: 'ai', text: llmReply }]);
      isProcessingTurnRef.current = false;
      speakText(llmReply);
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

      if (nextQIndex < tree.questions.length) {
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
  }, [clearSpeechBuffers, fetchGroqResponse, speakText]);

  // Audio Context, Mic Stream & Mobile Whisper Voice-Activity Recorder
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

      // Request microphone FIRST inside user gesture
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      setMicWarning('');
      micStreamRef.current = stream;

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new AudioCtx();
      }
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      if (typeof window !== 'undefined' && window.speechSynthesis) {
        try {
          window.speechSynthesis.cancel();
        } catch (_) {}
      }

      const ctx = audioContextRef.current;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.3;
      analyserRef.current = analyser;

      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);

      // MediaRecorder fallback ONLY for mobile devices where Web Speech API might fail
      let recorder = null;
      if (isMobileDevice && typeof window.MediaRecorder !== 'undefined') {
        try {
          recorder = new MediaRecorder(stream);
          mediaRecorderRef.current = recorder;
          recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0 && !isSpeakingRef.current) {
              audioChunksRef.current.push(e.data);
            }
          };
          recorder.onstop = async () => {
            isRecordingChunkRef.current = false;
            const chunks = audioChunksRef.current;
            audioChunksRef.current = [];
            if (!isSessionActiveRef.current || isProcessingTurnRef.current || isSpeakingRef.current) return;

            const existingWebSpeech = (transcriptAccumulatorRef.current + ' ' + currentInterimRef.current).trim();
            if (existingWebSpeech.length > 1) return;

            if (chunks.length > 0) {
              const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
              const whisperText = await transcribeAudioWithWhisper(blob);
              if (whisperText && isSessionActiveRef.current && !isProcessingTurnRef.current && !isSpeakingRef.current) {
                setTranscript(whisperText);
                submitCandidateAnswer(whisperText);
              }
            }
          };
        } catch (e) {
          console.warn('MediaRecorder init skipped:', e);
        }
      }

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let lastVoiceTime = 0;

      const checkAudioLevel = () => {
        if (!analyserRef.current || !isSessionActiveRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        const normalized = Math.min(average / 128, 1);

        const now = Date.now();
        const isInCooldown = now < ignoreMicUntilRef.current;

        if (!isSpeakingRef.current && !isInCooldown) {
          setAudioLevel(normalized);

          // If user is actively making voice sounds while a 4-second silence timer is counting down,
          // keep resetting the 4-second countdown so it NEVER cuts them off mid-thought!
          if (normalized > 0.08) {
            lastVoiceTime = now;

            if (
              recorder &&
              recorder.state === 'inactive' &&
              !isRecordingChunkRef.current &&
              !isProcessingTurnRef.current
            ) {
              audioChunksRef.current = [];
              isRecordingChunkRef.current = true;
              try {
                recorder.start();
              } catch (_) {}
            }
          } else if (
            isRecordingChunkRef.current &&
            recorder &&
            recorder.state === 'recording' &&
            now - lastVoiceTime > SILENCE_SUBMIT_MS
          ) {
            // Wait full 4.0 seconds of silence before stopping mobile fallback recorder
            try {
              recorder.stop();
            } catch (_) {}
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
  }, [isMobileDevice, submitCandidateAnswer, transcribeAudioWithWhisper]);

  // Speech Recognition (Web Speech API) - Waits 4.0 full seconds after user stops talking
  const initializeSpeechRecognition = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.abort();
      } catch (_) {}
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = !isMobileDevice;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      // Strictly ignore any microphone results while AI is speaking or during post-speech echo cooldown!
      if (
        !isSessionActiveRef.current ||
        isSpeakingRef.current ||
        isProcessingTurnRef.current ||
        Date.now() < ignoreMicUntilRef.current
      ) {
        return;
      }

      let interim = '';
      let newlyFinal = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          newlyFinal += event.results[i][0].transcript + ' ';
        } else {
          interim += event.results[i][0].transcript;
        }
      }

      currentInterimRef.current = interim;
      setInterimTranscript(interim);

      if (newlyFinal) {
        transcriptAccumulatorRef.current = (transcriptAccumulatorRef.current + ' ' + newlyFinal).trim();
        setTranscript(transcriptAccumulatorRef.current);
        currentInterimRef.current = '';
        setInterimTranscript('');
      }

      // Reset the 4-second silence timer every single time a word or syllable is heard
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (silenceIntervalRef.current) clearInterval(silenceIntervalRef.current);

      const currentSpoken = (transcriptAccumulatorRef.current + ' ' + currentInterimRef.current).trim();
      if (currentSpoken.length > 1 && !isSpeakingRef.current && isSessionActiveRef.current) {
        const startTime = Date.now();
        const duration = SILENCE_SUBMIT_MS; // 4000ms (4 seconds)

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
      if (isSessionActiveRef.current && !isSpeakingRef.current && !isProcessingTurnRef.current) {
        setTimeout(() => {
          if (isSessionActiveRef.current && !isSpeakingRef.current && recognitionRef.current === recognition) {
            try {
              recognition.start();
            } catch (_) {}
          }
        }, 150);
      }
    };

    recognitionRef.current = recognition;
  }, [isMobileDevice, submitCandidateAnswer]);

  // Start Session
  const startInterview = async () => {
    isSessionActiveRef.current = true;
    isProcessingTurnRef.current = false;

    await initializeAudioContext();
    if (!isSessionActiveRef.current) return;

    initializeSpeechRecognition();
    clearSpeechBuffers();

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
    speakText(welcome);
  };

  // Stop Session - Immediately kills ALL voice, synthesis, streams, and timers
  const stopInterview = useCallback(() => {
    isSessionActiveRef.current = false;
    isSpeakingRef.current = false;
    isProcessingTurnRef.current = false;

    killAllVoiceOutput();
    clearSpeechBuffers();

    if (mediaRecorderRef.current) {
      try {
        mediaRecorderRef.current.ondataavailable = null;
        mediaRecorderRef.current.onstop = null;
        if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      } catch (_) {}
      mediaRecorderRef.current = null;
    }
    audioChunksRef.current = [];
    isRecordingChunkRef.current = false;

    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.abort();
        recognitionRef.current.stop();
      } catch (_) {}
      recognitionRef.current = null;
    }

    if (micStreamRef.current) {
      try {
        micStreamRef.current.getTracks().forEach(track => track.stop());
      } catch (_) {}
      micStreamRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close();
      } catch (_) {}
      audioContextRef.current = null;
    }

    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    setStatus('idle');
    setAudioLevel(0);
    setAiResponse('');
  }, [clearSpeechBuffers, killAllVoiceOutput]);

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
      stopInterview();
    };

    window.addEventListener('beforeunload', handlePageUnload);
    window.addEventListener('pagehide', handlePageUnload);

    return () => {
      window.removeEventListener('beforeunload', handlePageUnload);
      window.removeEventListener('pagehide', handlePageUnload);
      stopInterview();
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
