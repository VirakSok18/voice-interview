import React, { useState } from 'react';
import VoiceOrb from './components/VoiceOrb';
import { useVoiceInterview } from './hooks/useVoiceInterview';
import { PanelLeft, Plus, MessageSquare, Trash2, X } from 'lucide-react';

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

  // Format relative time for sidebar items
  const formatSessionMeta = (session) => {
    const count = Array.isArray(session.history) ? session.history.length : 0;
    if (count === 0) return 'Not started yet';
    return `${Math.ceil(count / 2)} Q&A turns`;
  };

  return (
    <main className="relative w-screen h-[100dvh] overflow-hidden bg-[#06080f] text-slate-100 flex flex-col items-center justify-center px-6 select-none">
      {/* Subtle Ambient Glow */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            'radial-gradient(circle at 50% 42%, rgba(99, 102, 241, 0.14) 0%, rgba(14, 165, 233, 0.05) 38%, rgba(6, 8, 15, 1) 75%)'
        }}
      />

      {/* Minimal Floating Sidebar Toggle Button (Top-Left) */}
      <button
        onClick={() => setIsSidebarOpen(true)}
        aria-label="Open interview history sidebar"
        title="Interview History"
        className="fixed top-5 left-5 z-30 w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-slate-300 hover:text-white transition-all active:scale-95 cursor-pointer backdrop-blur-md"
      >
        <PanelLeft size={19} />
      </button>

      {/* ChatGPT-Style Interview History Sidebar Drawer */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
          />

          {/* Sidebar Panel */}
          <aside className="relative z-10 w-72 sm:w-80 h-full bg-[#0b0e17]/95 backdrop-blur-2xl border-r border-white/10 flex flex-col justify-between p-4 shadow-2xl">
            {/* Top Bar: New Interview + Close */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 px-1">
                  Interview History
                </span>
                <button
                  onClick={() => setIsSidebarOpen(false)}
                  className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer"
                  aria-label="Close sidebar"
                >
                  <X size={17} />
                </button>
              </div>

              <button
                onClick={() => {
                  createNewInterviewSession();
                  setIsSidebarOpen(false);
                }}
                className="w-full py-2.5 px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] text-white text-sm font-semibold flex items-center gap-2.5 shadow-lg shadow-indigo-600/20 transition-all cursor-pointer"
              >
                <Plus size={17} />
                <span>New Interview</span>
              </button>
            </div>

            {/* Saved Sessions List */}
            <div className="flex-1 overflow-y-auto my-4 space-y-1.5 pr-1">
              {sessions.map((session) => {
                const isSelected = session.id === activeSessionId;
                return (
                  <div
                    key={session.id}
                    onClick={() => {
                      selectInterviewSession(session.id);
                      setIsSidebarOpen(false);
                    }}
                    className={`group flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-all border ${
                      isSelected
                        ? 'bg-white/12 border-white/15 text-white'
                        : 'bg-transparent border-transparent hover:bg-white/6 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <MessageSquare
                        size={15}
                        className={isSelected ? 'text-indigo-400 shrink-0' : 'text-slate-500 shrink-0'}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {session.title || 'New Interview'}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate">
                          {formatSessionMeta(session)}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteInterviewSession(session.id);
                      }}
                      title="Delete interview"
                      className="opacity-70 sm:opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 transition-all cursor-pointer shrink-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Bottom Browser Memory Note */}
            <div className="pt-3 border-t border-white/10 text-[11px] text-slate-400 flex items-center justify-between px-1">
              <span>Saved automatically in this browser</span>
            </div>
          </aside>
        </div>
      )}

      {/* Center Interactive 3D Voice Bubble (Tap to Start / Tap to Close Voice) */}
      <div
        onClick={handleOrbClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') handleOrbClick();
        }}
        aria-label={isSessionActive ? 'Tap bubble to stop voice' : 'Tap bubble to start talking'}
        className="relative z-10 w-full max-w-[340px] sm:max-w-[440px] aspect-square flex items-center justify-center cursor-pointer transition-transform duration-300 active:scale-95"
      >
        <VoiceOrb status={status} audioLevel={audioLevel} />
      </div>

      {/* Floating Clean Text-Only Subtitles Directly Below Bubble (No Box or Background) */}
      <div className="relative z-20 w-full max-w-2xl min-h-[6.5rem] flex flex-col items-center justify-start text-center mt-2 px-4 pointer-events-none">
        {!isSessionActive ? (
          <p className="text-base sm:text-xl text-slate-400 font-medium tracking-wide">
            {customRoleTitle && history.length > 0
              ? `Tap the bubble to continue your ${customRoleTitle} interview`
              : 'Tap the bubble to start talking'}
          </p>
        ) : micWarning ? (
          <p className="text-base sm:text-lg text-amber-300 font-medium leading-relaxed">
            {micWarning}
          </p>
        ) : liveUserText ? (
          <p className="text-xl sm:text-2xl text-emerald-300 font-semibold leading-relaxed tracking-tight drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]">
            {liveUserText}
          </p>
        ) : status === 'thinking' ? (
          <p className="text-lg sm:text-xl text-cyan-300/90 font-medium leading-relaxed animate-pulse">
            ...
          </p>
        ) : aiResponse ? (
          <p className="text-xl sm:text-2xl text-white font-semibold leading-relaxed tracking-tight drop-shadow-[0_2px_14px_rgba(0,0,0,0.95)]">
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
