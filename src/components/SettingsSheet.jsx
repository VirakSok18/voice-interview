import React from 'react';
import { X, Volume2, Briefcase, FileText, Check, Sparkles, KeyRound, Cpu } from 'lucide-react';
import { PRESET_ROLES } from '../services/interviewKnowledge';
import { ELEVENLABS_VOICES, OPENAI_VOICES, KOKORO_VOICES } from '../services/voiceProviders';

export default function SettingsSheet({
  isOpen,
  onClose,
  currentRole,
  onSelectRole,
  voiceProvider,
  onUpdateVoiceProvider,
  elevenLabsKey,
  onUpdateElevenLabsKey,
  elevenLabsVoiceId,
  onUpdateElevenLabsVoiceId,
  openAiKey,
  onUpdateOpenAiKey,
  openAiVoice,
  onUpdateOpenAiVoice,
  kokoroEndpoint,
  onUpdateKokoroEndpoint,
  kokoroVoice,
  onUpdateKokoroVoice,
  groqKey,
  onUpdateGroqKey,
  browserVoices,
  selectedBrowserVoice,
  onSelectBrowserVoice,
  history
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end p-0 sm:p-4 bg-black/60 backdrop-blur-sm transition-opacity">
      <div 
        className="w-full sm:max-w-md h-full sm:h-[94vh] sm:rounded-3xl apple-glass flex flex-col overflow-hidden text-slate-200 border-l sm:border border-white/10 shadow-2xl animate-in slide-in-from-right duration-300"
        style={{ animationTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
          <div>
            <h2 className="text-lg font-semibold text-white tracking-tight">Voice & Audio Engine</h2>
            <p className="text-xs text-slate-400 mt-0.5">Configure human-grade neural voices</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 active:scale-95 transition-all text-slate-400 hover:text-white cursor-pointer"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-7">
          {/* Edge Tip Banner */}
          <div className="p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-400/20 text-xs text-indigo-200 leading-relaxed">
            <span className="font-semibold text-white">Free Human Voice Tip:</span> On Windows, open this app in <strong>Microsoft Edge</strong> to get <strong>Microsoft Jenny (Natural)</strong> for free with zero API keys. It sounds completely human, unlike Chrome's robotic fallback.
          </div>

          {/* Voice Engine Tabs */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Volume2 size={16} className="text-indigo-400" />
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Voice Synthesizer Provider
              </label>
            </div>

            {/* Provider Switcher */}
            <div className="grid grid-cols-4 gap-1 p-1 bg-black/40 rounded-2xl border border-white/10 mb-4 text-[11px]">
              <button
                onClick={() => onUpdateVoiceProvider('browser')}
                className={`py-2 px-1 text-center font-medium rounded-xl transition-all cursor-pointer ${
                  voiceProvider === 'browser'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Browser
              </button>
              <button
                onClick={() => onUpdateVoiceProvider('elevenlabs')}
                className={`py-2 px-1 text-center font-medium rounded-xl transition-all cursor-pointer ${
                  voiceProvider === 'elevenlabs'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                ElevenLabs
              </button>
              <button
                onClick={() => onUpdateVoiceProvider('openai')}
                className={`py-2 px-1 text-center font-medium rounded-xl transition-all cursor-pointer ${
                  voiceProvider === 'openai'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                OpenAI
              </button>
              <button
                onClick={() => onUpdateVoiceProvider('kokoro')}
                className={`py-2 px-1 text-center font-medium rounded-xl transition-all cursor-pointer ${
                  voiceProvider === 'kokoro'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Kokoro (OS)
              </button>
            </div>

            {/* Browser Voice */}
            {voiceProvider === 'browser' && (
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                <p className="text-xs text-slate-300 leading-relaxed">
                  Uses device text-to-speech. Select any Natural voice listed below:
                </p>
                <div className="space-y-1.5">
                  <label className="text-[11px] text-slate-400">Available Voices</label>
                  <select
                    value={selectedBrowserVoice || ''}
                    onChange={(e) => onSelectBrowserVoice(e.target.value)}
                    className="w-full bg-slate-900/90 border border-white/15 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-400 cursor-pointer"
                  >
                    {browserVoices
                      .filter(v => v.lang.startsWith('en'))
                      .map((v) => (
                        <option key={v.name} value={v.name}>
                          {v.name} {v.name.includes('Natural') ? '(Natural Neural)' : ''}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            )}

            {/* ElevenLabs */}
            {voiceProvider === 'elevenlabs' && (
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3.5">
                <div className="flex items-center gap-2 text-indigo-300 text-xs font-semibold">
                  <Sparkles size={14} />
                  <span>ElevenLabs Clear Female American Voices</span>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] text-slate-400">Select Voice</label>
                  <select
                    value={elevenLabsVoiceId}
                    onChange={(e) => onUpdateElevenLabsVoiceId(e.target.value)}
                    className="w-full bg-slate-900/90 border border-white/15 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-400 cursor-pointer"
                  >
                    {ELEVENLABS_VOICES.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] text-slate-400">ElevenLabs API Key</label>
                  <input
                    type="password"
                    placeholder="Enter xi-api-key"
                    value={elevenLabsKey}
                    onChange={(e) => onUpdateElevenLabsKey(e.target.value)}
                    className="w-full bg-slate-900/90 border border-white/15 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-400"
                  />
                </div>
              </div>
            )}

            {/* OpenAI */}
            {voiceProvider === 'openai' && (
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3.5">
                <div className="flex items-center gap-2 text-sky-300 text-xs font-semibold">
                  <Sparkles size={14} />
                  <span>ChatGPT Exact Voices</span>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] text-slate-400">Select Voice</label>
                  <select
                    value={openAiVoice}
                    onChange={(e) => onUpdateOpenAiVoice(e.target.value)}
                    className="w-full bg-slate-900/90 border border-white/15 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-sky-400 cursor-pointer"
                  >
                    {OPENAI_VOICES.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] text-slate-400">OpenAI API Key</label>
                  <input
                    type="password"
                    placeholder="sk-..."
                    value={openAiKey}
                    onChange={(e) => onUpdateOpenAiKey(e.target.value)}
                    className="w-full bg-slate-900/90 border border-white/15 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-400"
                  />
                </div>
              </div>
            )}

            {/* Kokoro Open Source */}
            {voiceProvider === 'kokoro' && (
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3.5">
                <div className="flex items-center gap-2 text-emerald-300 text-xs font-semibold">
                  <Cpu size={14} />
                  <span>Kokoro-82M Open-Source Neural Voice</span>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] text-slate-400">Voice</label>
                  <select
                    value={kokoroVoice}
                    onChange={(e) => onUpdateKokoroVoice(e.target.value)}
                    className="w-full bg-slate-900/90 border border-white/15 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-400 cursor-pointer"
                  >
                    {KOKORO_VOICES.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] text-slate-400">Local or Remote Kokoro Endpoint URL</label>
                  <input
                    type="text"
                    placeholder="http://localhost:8880/v1"
                    value={kokoroEndpoint}
                    onChange={(e) => onUpdateKokoroEndpoint(e.target.value)}
                    className="w-full bg-slate-900/90 border border-white/15 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-400"
                  />
                  <p className="text-[10px] text-slate-500">
                    Run free locally: <code>docker run -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-cpu:latest</code>
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Target Role Selector */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Briefcase size={16} className="text-indigo-400" />
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Target Job Role
              </label>
            </div>
            <div className="space-y-2">
              {PRESET_ROLES.map((r) => {
                const isSelected = r.id === currentRole;
                return (
                  <button
                    key={r.id}
                    onClick={() => onSelectRole(r.id)}
                    className={`w-full text-left p-3.5 rounded-2xl transition-all border ${
                      isSelected
                        ? 'bg-indigo-500/15 border-indigo-400/40 text-white shadow-sm'
                        : 'bg-white/5 border-white/5 hover:bg-white/8 text-slate-300'
                    } active:scale-[0.98] cursor-pointer`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{r.name}</span>
                      {isSelected && <Check size={16} className="text-indigo-400" />}
                    </div>
                    <p className="text-xs text-slate-400 mt-1 line-clamp-1">{r.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Groq Key for Brain */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <KeyRound size={16} className="text-amber-400" />
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Groq API Key (AI Reasoning)
              </label>
            </div>
            <input
              type="password"
              placeholder="gsk_..."
              value={groqKey}
              onChange={(e) => onUpdateGroqKey(e.target.value)}
              className="w-full bg-slate-900/90 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-400"
            />
          </div>

          {/* Transcript History */}
          {history.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <FileText size={16} className="text-emerald-400" />
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Current Session Transcript
                </label>
              </div>
              <div className="space-y-3 bg-black/30 rounded-2xl p-4 border border-white/5 max-h-56 overflow-y-auto text-xs leading-relaxed">
                {history.map((item, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-xl ${
                      item.sender === 'ai'
                        ? 'bg-indigo-950/40 text-indigo-200 border border-indigo-500/15'
                        : 'bg-white/5 text-slate-300'
                    }`}
                  >
                    <div className="font-semibold text-[10px] uppercase tracking-wider mb-1 opacity-70">
                      {item.sender === 'ai' ? 'Interviewer' : 'Candidate'}
                    </div>
                    <div>{item.text}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-white/10 bg-black/20 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-full bg-white text-slate-950 text-sm font-semibold hover:bg-slate-200 active:scale-95 transition-all shadow-md cursor-pointer"
          >
            Save & Close
          </button>
        </div>
      </div>
    </div>
  );
}
