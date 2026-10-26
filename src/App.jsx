import React from 'react';
import VoiceOrb from './components/VoiceOrb';
import { useVoiceInterview } from './hooks/useVoiceInterview';

export default function App() {
  const {
    status,
    audioLevel,
    transcript,
    interimTranscript,
    aiResponse,
    startInterview,
    stopInterview,
    micWarning
  } = useVoiceInterview();

  const isSessionActive = status !== 'idle';

  // Tap directly on the voice bubble to start or stop/close voice
  const handleOrbClick = () => {
    if (!isSessionActive) {
      startInterview('undecided');
    } else {
      stopInterview();
    }
  };

  // Current active subtitle text to display below the bubble
  const liveUserText = `${transcript} ${interimTranscript}`.trim();

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
            Tap the bubble to start talking
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
