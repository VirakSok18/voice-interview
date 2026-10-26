import React, { useState, useRef, useEffect } from 'react';
import VoiceOrb from './components/VoiceOrb';
import { useVoiceInterview } from './hooks/useVoiceInterview';

export default function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);
  const transcriptEndRef = useRef(null);

  const {
    customRoleTitle,
    status,
    audioLevel,
    transcript,
    interimTranscript,
    aiResponse,
    history,
    startInterview,
    stopInterview,
    micWarning,
    sessions,
    activeSessionId,
    createNewInterviewSession,
    selectInterviewSession,
    deleteInterviewSession
  } = useVoiceInterview();

  const isSessionActive = status !== 'idle';

  // Auto-scroll the right transcript drawer whenever new messages arrive
  useEffect(() => {
    if (isTranscriptOpen && transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [history, isTranscriptOpen]);

  // Tap directly on the voice bubble to start or stop/close voice
  const handleOrbClick = () => {
    if (!isSessionActive) {
      startInterview();
    } else {
      stopInterview();
    }
  };

  // Current active subtitle text to display below the bubble
  const liveUserText = `${transcript} ${interimTranscript}`.trim();

  // For user's live speech, show only the latest ~9 words like a live movie caption line
  const getLiveUserMovieLine = (text) => {
    const words = text.trim().split(/\s+/).filter(Boolean);
    if (words.length <= 10) return text;
    return words.slice(-10).join(' ');
  };

  return (
    <main className="relative w-screen h-[100dvh] overflow-hidden bg-[#06080f] text-slate-100 flex flex-col items-center justify-between py-8 sm:py-12 px-5 select-none">
      {/* Subtle Ambient Glow */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            'radial-gradient(circle at 50% 42%, rgba(99, 102, 241, 0.14) 0%, rgba(14, 165, 233, 0.05) 38%, rgba(6, 8, 15, 1) 75%)'
        }}
      />

      {/* Minimal Top-Left Menu Trigger (Past Interviews Sidebar) */}
      <button
        onClick={() => {
          setIsTranscriptOpen(false);
          setIsSidebarOpen(true);
        }}
        aria-label="Toggle history"
        className="fixed top-6 left-6 z-30 p-2 text-slate-400 hover:text-white transition-colors cursor-pointer"
      >
        <div className="w-5 flex flex-col gap-1.5">
          <span className="w-5 h-[1.5px] bg-current rounded-full" />
          <span className="w-3.5 h-[1.5px] bg-current rounded-full" />
        </div>
      </button>

      {/* Minimal Top-Right Trigger (Current Interview Back-and-Forth Transcript) */}
      <button
        onClick={() => {
          setIsSidebarOpen(false);
          setIsTranscriptOpen(true);
        }}
        aria-label="Open conversation transcript"
        className="fixed top-6 right-6 z-30 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white border border-white/10 hover:border-white/25 bg-white/[0.02] hover:bg-white/[0.06] transition-all cursor-pointer"
      >
        Transcript
      </button>

      {/* Shared Backdrop with smooth fade */}
      <div
        onClick={() => {
          setIsSidebarOpen(false);
          setIsTranscriptOpen(false);
        }}
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-xs transition-opacity duration-300 ease-out ${
          isSidebarOpen || isTranscriptOpen
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Left Sidebar: Past Interviews History */}
      <aside
        className={`fixed top-0 left-0 z-50 w-64 sm:w-72 h-full bg-[#080a11]/95 backdrop-blur-2xl border-r border-white/[0.06] flex flex-col p-6 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Top Action: Outlined "New interview" Button */}
        <button
          onClick={() => {
            createNewInterviewSession();
            setIsSidebarOpen(false);
          }}
          className="w-full text-center py-2.5 px-4 rounded-xl text-sm font-medium text-slate-100 border border-white/20 bg-white/[0.04] hover:bg-white/[0.1] hover:border-white/35 active:scale-[0.98] transition-all cursor-pointer mb-5"
        >
          + New interview
        </button>

        {/* Clean List of Past Interviews */}
        <div className="flex-1 overflow-y-auto space-y-1">
          {sessions.map((session) => {
            const isSelected = session.id === activeSessionId;
            return (
              <div
                key={session.id}
                onClick={() => {
                  selectInterviewSession(session.id);
                  setIsSidebarOpen(false);
                }}
                className={`group flex items-center justify-between px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-white/[0.08] text-white font-medium'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                }`}
              >
                <span className="truncate pr-2">
                  {session.title || 'New Interview'}
                </span>

                {sessions.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteInterviewSession(session.id);
                    }}
                    aria-label="Remove"
                    className="opacity-60 sm:opacity-0 group-hover:opacity-100 text-xs text-slate-500 hover:text-slate-200 px-1.5 py-0.5 transition-opacity cursor-pointer shrink-0"
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      {/* Right Drawer: Full Back-and-Forth Conversation Transcript */}
      <aside
        className={`fixed top-0 right-0 z-50 w-80 sm:w-96 h-full bg-[#080a11]/95 backdrop-blur-2xl border-l border-white/[0.06] flex flex-col p-6 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] select-text ${
          isTranscriptOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/[0.08]">
          <span className="text-sm font-medium text-slate-200">
            {customRoleTitle || 'Conversation'}
          </span>
          <button
            onClick={() => setIsTranscriptOpen(false)}
            className="text-sm text-slate-400 hover:text-white px-2 py-0.5 cursor-pointer"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {history.length === 0 ? (
            <p className="text-xs text-slate-500 text-center mt-10">
              No messages yet. Tap the bubble to start talking.
            </p>
          ) : (
            history.map((item, idx) => {
              const isAi = item.sender === 'ai';
              return (
                <div
                  key={idx}
                  className={`flex flex-col ${isAi ? 'items-start' : 'items-end'}`}
                >
                  <span className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 px-1">
                    {isAi ? 'Interviewer' : 'You'}
                  </span>
                  <div
                    className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm leading-relaxed ${
                      isAi
                        ? 'bg-white/[0.06] text-slate-200 border border-white/[0.08]'
                        : 'bg-indigo-500/20 text-indigo-100 border border-indigo-400/25'
                    }`}
                  >
                    {item.text}
                  </div>
                </div>
              );
            })
          )}
          <div ref={transcriptEndRef} />
        </div>
      </aside>

      {/* Top Balance Spacer */}
      <div className="h-4 shrink-0" />

      {/* Center Interactive 3D Voice Bubble */}
      <div
        onClick={handleOrbClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') handleOrbClick();
        }}
        aria-label={isSessionActive ? 'Tap bubble to stop voice' : 'Tap bubble to start talking'}
        className="relative z-10 w-full max-w-[270px] sm:max-w-[380px] max-h-[46dvh] aspect-square flex items-center justify-center cursor-pointer transition-transform duration-300 active:scale-95 shrink-0"
      >
        <VoiceOrb status={status} audioLevel={audioLevel} />
      </div>

      {/* Movie-Style Line-by-Line Subtitle Display Directly Below Bubble */}
      <div className="relative z-20 w-full max-w-2xl h-[24dvh] flex flex-col items-center justify-center text-center px-4 pointer-events-none">
        {!isSessionActive ? (
          <p className="text-base sm:text-xl text-slate-400 font-medium tracking-wide">
            {customRoleTitle && history.length > 0
              ? `Tap the bubble to continue your ${customRoleTitle} interview`
              : 'Tap the bubble to start talking'}
          </p>
        ) : micWarning ? (
          <p className="text-sm sm:text-base text-amber-300 font-medium leading-relaxed">
            {micWarning}
          </p>
        ) : liveUserText ? (
          <p className="text-lg sm:text-2xl text-emerald-300 font-semibold leading-relaxed tracking-tight drop-shadow-[0_2px_12px_rgba(0,0,0,0.95)] transition-all duration-150">
            {getLiveUserMovieLine(liveUserText)}
          </p>
        ) : status === 'thinking' ? (
          <p className="text-lg sm:text-xl text-cyan-300/90 font-medium leading-relaxed animate-pulse">
            ...
          </p>
        ) : aiResponse ? (
          <p
            key={aiResponse}
            className="text-lg sm:text-2xl text-white font-semibold leading-relaxed tracking-tight drop-shadow-[0_2px_14px_rgba(0,0,0,0.95)] animate-in fade-in duration-150"
          >
            {aiResponse}
          </p>
        ) : (
          <p className="text-base sm:text-xl text-slate-400 font-medium leading-relaxed">
            Listening...
          </p>
        )}
      </div>
    </main>
  );
}
