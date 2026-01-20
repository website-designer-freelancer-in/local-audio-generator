import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  GoogleGenAI, 
  Modality
} from "@google/genai";
import { 
  Play, 
  Pause, 
  Download, 
  Settings, 
  Mic, 
  History, 
  Trash2, 
  Loader2, 
  Volume2, 
  Music, 
  Sparkles,
  ChevronRight,
  Languages,
  Clock,
  ExternalLink
} from 'lucide-react';

// --- Types ---
interface AudioHistoryItem {
  id: string;
  text: string;
  voice: string;
  timestamp: string;
  audioData: string; // Base64
}

type Tab = 'editor' | 'history';

// --- Utils ---
const decode = (base64: string) => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

// --- App Component ---
const VoiceForge = () => {
  const [activeTab, setActiveTab] = useState<Tab>('editor');
  const [text, setText] = useState('');
  const [voice, setVoice] = useState('Zephyr');
  const [isGenerating, setIsGenerating] = useState(false);
  const [history, setHistory] = useState<AudioHistoryItem[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);

  const voices = [
    { id: 'Zephyr', label: 'Zephyr (Warm & Clear)', gender: 'Male' },
    { id: 'Kore', label: 'Kore (Cheerful & Bright)', gender: 'Female' },
    { id: 'Puck', label: 'Puck (Youthful & Energetic)', gender: 'Male' },
    { id: 'Charon', label: 'Charon (Deep & Professional)', gender: 'Male' },
    { id: 'Fenrir', label: 'Fenrir (Mature & Serious)', gender: 'Male' },
  ];

  useEffect(() => {
    const saved = localStorage.getItem('voiceforge_history');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
  }, []);

  const saveToHistory = (item: AudioHistoryItem) => {
    const newHistory = [item, ...history].slice(0, 20);
    setHistory(newHistory);
    localStorage.setItem('voiceforge_history', JSON.stringify(newHistory));
  };

  const handleClearHistory = () => {
    setHistory([]);
    localStorage.removeItem('voiceforge_history');
  };

  const generateTTS = async () => {
    if (!text.trim() || isGenerating) return;

    setIsGenerating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const newItem: AudioHistoryItem = {
          id: Date.now().toString(),
          text: text,
          voice: voice,
          timestamp: new Date().toLocaleTimeString(),
          audioData: base64Audio
        };
        saveToHistory(newItem);
        playFromBase64(base64Audio);
      }
    } catch (error) {
      console.error("TTS Generation failed:", error);
      alert("Error generating speech. Long texts may require splitting if they exceed the model's capacity.");
    } finally {
      setIsGenerating(false);
    }
  };

  const playFromBase64 = async (base64: string) => {
    if (sourceNodeRef.current) {
      sourceNodeRef.current.stop();
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }

    const ctx = audioContextRef.current;
    const audioBuffer = await decodeAudioData(decode(base64), ctx, 24000, 1);
    
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    
    source.onended = () => setIsPlaying(false);
    
    source.start(0);
    sourceNodeRef.current = source;
    setIsPlaying(true);
  };

  const downloadAudio = (item: AudioHistoryItem) => {
    const pcmData = decode(item.audioData);
    const wavBlob = createWavBlob(pcmData, 24000);
    const url = URL.createObjectURL(wavBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `VoiceForge-${item.id}.wav`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const createWavBlob = (pcmData: Uint8Array, sampleRate: number) => {
    const header = new ArrayBuffer(44);
    const view = new DataView(header);
    view.setUint32(0, 0x52494646, false);
    view.setUint32(4, 36 + pcmData.length, true);
    view.setUint32(8, 0x57415645, false);
    view.setUint32(12, 0x666d7420, false);
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    view.setUint32(36, 0x64617461, false);
    view.setUint32(40, pcmData.length, true);
    return new Blob([header, pcmData], { type: 'audio/wav' });
  };

  return (
    <div className="flex h-screen bg-[#080b14] text-gray-100 overflow-hidden">
      {/* Sidebar */}
      <div className="w-80 glass-panel border-r border-white/5 flex flex-col p-6 z-20">
        <div className="flex items-center gap-3 mb-10 px-2">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Mic className="text-white w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">VoiceForge</h1>
        </div>

        <nav className="flex-1 space-y-2">
          <button 
            onClick={() => setActiveTab('editor')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
              activeTab === 'editor' ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/20' : 'text-gray-500 hover:bg-white/5'
            }`}
          >
            <Settings size={20} />
            <span className="font-semibold">Speech Editor</span>
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
              activeTab === 'history' ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/20' : 'text-gray-500 hover:bg-white/5'
            }`}
          >
            <History size={20} />
            <span className="font-semibold">Recent Captures</span>
            {history.length > 0 && (
              <span className="ml-auto text-xs bg-indigo-500/20 px-2 py-0.5 rounded-full">{history.length}</span>
            )}
          </button>
        </nav>

        <div className="mt-auto p-4 bg-white/5 rounded-2xl border border-white/5">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
            <Sparkles size={12} className="text-indigo-400" />
            <span className="uppercase tracking-widest font-bold">Unlimited Engine</span>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed mb-3">Create long-form narration with high-fidelity Gemini 2.5 TTS.</p>
          <a href="https://speechma.com" target="_blank" className="text-[10px] text-indigo-400 hover:underline flex items-center gap-1">
            Inspired by Speechma <ExternalLink size={8} />
          </a>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        {/* Background Gradients */}
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-20">
          <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-600 blur-[120px] rounded-full"></div>
          <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-purple-600 blur-[120px] rounded-full"></div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-10 z-10">
          <div className="max-w-4xl mx-auto w-full">
            {activeTab === 'editor' ? (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <header>
                  <h2 className="text-3xl font-bold mb-2">Speech Studio</h2>
                  <p className="text-gray-500">Unlimited character input for professional narration.</p>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Text Input Area */}
                  <div className="glass-panel p-6 rounded-3xl border border-white/10 space-y-4 md:col-span-2 lg:col-span-1">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Script Content</label>
                      <span className="text-xs text-indigo-400 font-medium">{text.length.toLocaleString()} characters</span>
                    </div>
                    <textarea 
                      className="w-full h-80 bg-transparent border-none outline-none text-lg resize-none placeholder:text-gray-700 leading-relaxed custom-scrollbar"
                      placeholder="Start typing or paste your long-form script here..."
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                    />
                  </div>

                  {/* Settings Column */}
                  <div className="space-y-6">
                    <div className="glass-panel p-6 rounded-3xl border border-white/10 space-y-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Volume2 size={16} className="text-indigo-400" />
                        <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Voice Persona</label>
                      </div>
                      <div className="space-y-2">
                        {voices.map((v) => (
                          <button
                            key={v.id}
                            onClick={() => setVoice(v.id)}
                            className={`w-full flex items-center gap-3 p-3 rounded-2xl border transition-all ${
                              voice === v.id ? 'bg-indigo-600/10 border-indigo-500/50 text-white shadow-lg' : 'bg-white/5 border-transparent text-gray-400 hover:bg-white/10'
                            }`}
                          >
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${voice === v.id ? 'bg-indigo-600 text-white' : 'bg-gray-700'}`}>
                              {v.label[0]}
                            </div>
                            <div className="text-left">
                              <p className="text-sm font-semibold">{v.label.split('(')[0]}</p>
                              <p className="text-[10px] opacity-50">{v.label.split('(')[1].replace(')', '')}</p>
                            </div>
                            {voice === v.id && <ChevronRight size={14} className="ml-auto text-indigo-400" />}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="glass-panel p-6 rounded-3xl border border-white/10 space-y-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Languages size={16} className="text-indigo-400" />
                        <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Language</label>
                      </div>
                      <select className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm outline-none appearance-none focus:ring-2 focus:ring-indigo-500 transition-all">
                        <option value="en">English (US)</option>
                        <option value="es">Spanish</option>
                        <option value="fr">French</option>
                        <option value="de">German</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-4">
                  <button 
                    onClick={generateTTS}
                    disabled={isGenerating || !text.trim()}
                    className="group relative overflow-hidden bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-10 py-5 rounded-2xl font-bold text-lg transition-all shadow-2xl shadow-indigo-600/20 flex items-center gap-3 active:scale-95"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                    {isGenerating ? <Loader2 className="animate-spin" size={24} /> : <Play size={24} className="fill-white" />}
                    {isGenerating ? 'Synthesizing...' : 'Generate Full Audio'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <header className="flex items-center justify-between">
                  <div>
                    <h2 className="text-3xl font-bold mb-2">Recent Captures</h2>
                    <p className="text-gray-500">Revisit your generated long-form audio assets.</p>
                  </div>
                  {history.length > 0 && (
                    <button 
                      onClick={handleClearHistory}
                      className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 transition-colors"
                    >
                      <Trash2 size={16} /> Clear All
                    </button>
                  )}
                </header>

                <div className="space-y-4">
                  {history.length === 0 ? (
                    <div className="glass-panel p-20 rounded-[3rem] flex flex-col items-center justify-center border border-dashed border-white/10 opacity-30">
                      <History size={64} className="mb-4" />
                      <p className="text-xl font-medium">History empty</p>
                      <p className="text-sm mt-2">Generate your first speech to see it here.</p>
                    </div>
                  ) : (
                    history.map((item) => (
                      <div key={item.id} className="glass-panel p-6 rounded-3xl border border-white/10 flex items-center gap-6 group hover:border-indigo-500/30 transition-all">
                        <button 
                          onClick={() => playFromBase64(item.audioData)}
                          className="w-14 h-14 bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white rounded-full flex items-center justify-center transition-all shadow-xl"
                        >
                          <Play size={24} className="ml-1" />
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate text-lg">{item.text.slice(0, 100)}...</p>
                          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                            <span className="flex items-center gap-1"><Mic size={12} /> {item.voice}</span>
                            <span className="flex items-center gap-1"><Clock size={12} /> {item.timestamp}</span>
                            <span className="flex items-center gap-1 text-indigo-400 font-bold uppercase tracking-tighter">Unlimited Length</span>
                          </div>
                        </div>
                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => downloadAudio(item)}
                            className="p-3 bg-white/5 hover:bg-indigo-600/20 text-gray-400 hover:text-indigo-400 rounded-xl transition-all border border-white/5"
                            title="Download WAV"
                          >
                            <Download size={20} />
                          </button>
                          <button 
                            className="p-3 bg-white/5 hover:bg-red-600/20 text-gray-400 hover:text-red-400 rounded-xl transition-all border border-white/5"
                            onClick={() => {
                              const newHistory = history.filter(h => h.id !== item.id);
                              setHistory(newHistory);
                              localStorage.setItem('voiceforge_history', JSON.stringify(newHistory));
                            }}
                          >
                            <Trash2 size={20} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Global Player Overlay */}
        {isPlaying && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 glass-panel px-8 py-4 rounded-full border border-indigo-500/30 shadow-2xl z-50 animate-in slide-in-from-bottom-10 duration-500 flex items-center gap-6">
            <div className="flex items-end gap-1 h-6">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="w-1 bg-indigo-500 rounded-full animate-wave" style={{ animationDelay: `${i * 0.1}s`, height: '30%' }}></div>
              ))}
            </div>
            <p className="text-sm font-bold tracking-widest uppercase text-indigo-400">Playing Narration</p>
            <button 
              onClick={() => {
                if(sourceNodeRef.current) sourceNodeRef.current.stop();
                setIsPlaying(false);
              }}
              className="bg-red-500/10 hover:bg-red-500/20 text-red-500 p-2 rounded-full transition-colors"
            >
              <Pause size={18} />
            </button>
          </div>
        )}
      </main>

      <style>{`
        @keyframes wave {
          0%, 100% { height: 30%; }
          50% { height: 100%; }
        }
        .animate-wave {
          animation: wave 1s ease-in-out infinite;
        }
        .animate-in {
          animation-fill-mode: forwards;
        }
      `}</style>
    </div>
  );
};

// --- Render ---
createRoot(document.getElementById('root')!).render(<VoiceForge />);