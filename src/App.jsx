import React, { useState } from 'react';
import VoiceOrb from './components/VoiceOrb';
import { useVoiceInterview } from './hooks/useVoiceInterview';

export default function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

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

  // Dynamic font sizing so even long explanations always fit inside the display cleanly
  const getDynamicSubtitleClass = (text) => {
    const len = (text || '').length;
    if (len > 340) {
      return 'text-xs sm:text-sm leading-snug';
    }
    if (len > 220) {
      return 'text-sm sm:text-base leading-normal';
    }
    if (len > 120) {
      return 'text-base sm:text-lg leading-relaxed';
    }
    return 'text-lg sm:text-2xl leading-relaxed';
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

      {/* Minimal Top-Left Menu Trigger (Two clean lines) */}
      <button
        onClick={() => setIsSidebarOpen(true)}
        aria-label="Toggle history"
        className="fixed top-6 left-6 z-30 p-2 text-slate-400 hover:text-white transition-colors cursor-pointer"
      >
        <div className="w-5 flex flex-col gap-1.5">
          <span className="w-5 h-[1.5px] bg-current rounded-full" />
          <span className="w-3.5 h-[1.5px] bg-current rounded-full" />
        </div>
      </button>

      {/* Backdrop with smooth fade */}
      <div
        onClick={() => setIsSidebarOpen(false)}
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-xs transition-opacity duration-300 ease-out ${
          isSidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Ultra-Clean Minimal Sidebar with Smooth Sliding Open & Close Animation */}
      <aside
        className={`fixed top-0 left-0 z-50 w-64 sm:w-72 h-full bg-[#080a11]/95 backdrop-blur-2xl border-r border-white/[0.06] flex flex-col p-6 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Top Action: Simple "New interview" */}
        <button
          onClick={() => {
            createNewInterviewSession();
            setIsSidebarOpen(false);
          }}
          className="w-full text-left py-2.5 px-3 rounded-lg text-sm font-medium text-slate-200 hover:text-white hover:bg-white/[0.05] transition-colors cursor-pointer mb-4"
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

      {/* Top Balance Spacer */}
      <div className="h-4 shrink-0" />

      {/* Center Interactive 3D Voice Bubble (Scales responsively to leave plenty of room for subtitles) */}
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

      {/* Dynamic Auto-Scaling Subtitle Area Directly Below Bubble (Always fits inside viewport!) */}
      <div className="relative z-20 w-full max-w-2xl h-[34dvh] max-h-[34dvh] flex flex-col items-center justify-center text-center px-3 overflow-y-auto">
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
          <p
            className={`${getDynamicSubtitleClass(
              liveUserText
            )} text-emerald-300 font-semibold tracking-tight break-words drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)] transition-all duration-150`}
          >
            {liveUserText}
          </p>
        ) : status === 'thinking' ? (
          <p className="text-lg sm:text-xl text-cyan-300/90 font-medium leading-relaxed animate-pulse">
            ...
          </p>
        ) : aiResponse ? (
          <p
            className={`${getDynamicSubtitleClass(
              aiResponse
            )} text-white font-semibold tracking-tight break-words drop-shadow-[0_2px_14px_rgba(0,0,0,0.95)] transition-all duration-150`}
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
