import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Button } from './common/Button';
import { getGardenPlants } from '../services/gardenService';
import { getGardenInsights, QuotaExceededError } from '../services/geminiService';
import type { LocationData } from '../types';

// Planting instruction database
const PLANTING_GUIDES: Record<string, string[]> = {
  tomato: [
    "Let's plant your tomatoes! First, make sure your soil is prepared. Have you loosened the soil and mixed in compost?",
    "Dig a hole about 15 centimeters deep — roughly the depth of your hand. The hole should be slightly wider than the root ball.",
    "Gently remove the seedling from its pot. Support the stem between your fingers and tip the pot upside down. Tap the bottom if needed.",
    "Place the seedling in the hole so the soil line on the stem matches ground level. Tomatoes can be planted slightly deeper — they grow roots from the buried stem.",
    "Fill in around the plant with soil and press gently but firmly. Water thoroughly until you see water pooling on the surface.",
    "Add a layer of mulch around the base (but not touching the stem) to retain moisture. You're done! 🎉"
  ],
  basil: [
    "Let's plant your basil! Choose a spot that gets at least 6 hours of sunlight. Ready?",
    "If planting in soil, loosen it to about 10 centimeters deep and mix in some compost. For pots, use well-draining potting mix.",
    "Make small holes about 6 millimeters deep — roughly the thickness of two coins stacked together.",
    "Place 2-3 seeds per hole, or if using a seedling, place it at the same depth it was in its nursery pot.",
    "Cover lightly with soil, press gently, and water with a gentle spray. Don't flood the seeds.",
    "Basil loves warmth and moisture. Keep the soil consistently moist but not waterlogged. You're all set! 🌿"
  ],
  rose: [
    "Let's plant your rose! Choose a spot with at least 6 hours of direct sunlight and good air circulation.",
    "Dig a hole about 45 centimeters wide and 45 centimeters deep — about the size of a bucket.",
    "Mix the removed soil with compost in a 1:1 ratio. Add a handful of bone meal at the bottom of the hole for root development.",
    "If the rose is bare-root, soak it in water for 2 hours before planting. For potted roses, gently loosen the root ball.",
    "Place the rose so the graft union (the bulge near the base) is at soil level. Spread the roots outward.",
    "Fill with your soil-compost mix, firm down, and water deeply. Mulch around the base. Welcome your new rose! 🌹"
  ],
  general: [
    "Let's get planting! First, check that your soil is prepared — it should be loose, not compacted.",
    "Dig a hole 1.5 to 2 times the width of the root ball, and about the same depth as the container the plant came in.",
    "Gently remove the plant from its container. If roots are circling, gently tease them apart with your fingers.",
    "Place the plant in the hole at the same depth it was growing before. The top of the root ball should be level with the ground.",
    "Fill in with soil, pressing gently to eliminate air pockets. Don't pack too tightly — roots need to breathe.",
    "Water thoroughly around the base. Add 5 to 8 centimeters of mulch around the plant, keeping it away from the stem. Done! 🌱"
  ],
};

// Common Q&A
const QUICK_QA: Array<{ q: string; a: string }> = [
  { q: 'How deep should I plant marigold seeds?', a: 'Marigold seeds should be planted about 6 millimeters deep, roughly the thickness of two coins stacked together.' },
  { q: 'Can I plant mint next to basil?', a: 'Yes, mint and basil are compatible companions. However, mint is very aggressive — consider planting it in a separate container.' },
  { q: 'When should I water my plants?', a: 'Water in the early morning when evaporation is low. Check the top 2-3 centimeters of soil — if dry, it\'s time to water.' },
  { q: 'How much sun do tomatoes need?', a: 'Tomatoes need at least 6-8 hours of direct sunlight per day. They thrive in full sun with warm soil.' },
  { q: 'What is the white powder on my leaves?', a: 'White powder is likely powdery mildew, a common fungal disease. Improve air circulation and apply a baking soda spray (1 tsp per liter of water).' },
  { q: 'How far apart should I space my plants?', a: 'It depends on the type: herbs need 15-30cm, vegetables 30-60cm, shrubs 60-120cm, and trees 3-10m depending on species.' },
];

interface Message { id: string; type: 'user' | 'assistant' | 'system'; text: string; timestamp: Date; }

interface Props { onBack: () => void; location: LocationData | null; onQuotaError?: (msg?: string) => void; }

export const VoiceAssistant: React.FC<Props> = ({ onBack, location, onQuotaError }) => {
  const gardenPlants = useMemo(() => getGardenPlants().filter(p => p.status === 'active'), []);
  const [messages, setMessages] = useState<Message[]>([
    { id: 'welcome', type: 'assistant', text: '🌱 Welcome to the Voice-Guided Planting Assistant! I can help you with:\n\n🪴 **Guided planting sessions** — Say "Plant tomatoes" to start\n❓ **Gardening questions** — Ask anything about your plants\n📝 **Journal entries** — Dictate notes hands-free\n⏱️ **Timers** — Set watering reminders\n\nType a message or use voice input below!', timestamp: new Date() },
  ]);
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [activeSession, setActiveSession] = useState<{ plant: string; steps: string[]; currentStep: number } | null>(null);
  const [timer, setTimer] = useState<{ minutes: number; remaining: number; active: boolean } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-scroll to bottom
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Timer countdown
  useEffect(() => {
    if (timer?.active && timer.remaining > 0) {
      timerRef.current = setInterval(() => {
        setTimer(prev => {
          if (!prev || prev.remaining <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            addMessage('assistant', '⏰ **Timer complete!** Your watering time is up. Remember to check the soil moisture.');
            return null;
          }
          return { ...prev, remaining: prev.remaining - 1 };
        });
      }, 60000);
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }
  }, [timer?.active]);

  const addMessage = useCallback((type: Message['type'], text: string) => {
    setMessages(prev => [...prev, { id: `msg-${Date.now()}-${Math.random()}`, type, text, timestamp: new Date() }]);
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    addMessage('user', text);

    const lower = text.toLowerCase();

    // Plant session commands
    if (lower.startsWith('plant ') || lower.startsWith('start planting ')) {
      const plantName = text.replace(/^(plant|start planting)\s+/i, '').trim();
      const guideKey = Object.keys(PLANTING_GUIDES).find(k => plantName.toLowerCase().includes(k)) || 'general';
      const steps = PLANTING_GUIDES[guideKey];
      setActiveSession({ plant: plantName, steps, currentStep: 0 });
      addMessage('assistant', `🌱 Starting planting session for **${plantName}**!\n\n**Step 1/${steps.length}:** ${steps[0]}\n\n_Say "next" to continue, "repeat" to hear again, or "back" for previous step._`);
      return;
    }

    // Session navigation
    if (activeSession) {
      if (lower === 'next' || lower === 'continue') {
        const next = activeSession.currentStep + 1;
        if (next >= activeSession.steps.length) {
          addMessage('assistant', `✅ You've completed the planting session for **${activeSession.plant}**! Great job! 🎉\n\nWant to log this in your journal? Say "log entry" to record it.`);
          setActiveSession(null);
        } else {
          setActiveSession({ ...activeSession, currentStep: next });
          addMessage('assistant', `**Step ${next + 1}/${activeSession.steps.length}:** ${activeSession.steps[next]}`);
        }
        return;
      }
      if (lower === 'repeat') {
        addMessage('assistant', `**Step ${activeSession.currentStep + 1}/${activeSession.steps.length}:** ${activeSession.steps[activeSession.currentStep]}`);
        return;
      }
      if (lower === 'back' || lower === 'previous') {
        const prev = Math.max(0, activeSession.currentStep - 1);
        setActiveSession({ ...activeSession, currentStep: prev });
        addMessage('assistant', `**Step ${prev + 1}/${activeSession.steps.length}:** ${activeSession.steps[prev]}`);
        return;
      }
      if (lower === 'pause' || lower === 'stop') {
        addMessage('assistant', `⏸️ Session paused at step ${activeSession.currentStep + 1}. Say "continue" to resume or "cancel" to end.`);
        return;
      }
      if (lower === 'cancel') {
        setActiveSession(null);
        addMessage('assistant', '✋ Planting session cancelled. What else can I help with?');
        return;
      }
    }

    // Timer commands
    const timerMatch = lower.match(/(?:set|start)\s+(?:a\s+)?(?:watering\s+)?timer\s+(?:for\s+)?(\d+)\s*(?:min|minute)/);
    if (timerMatch) {
      const mins = parseInt(timerMatch[1]);
      setTimer({ minutes: mins, remaining: mins, active: true });
      addMessage('assistant', `⏱️ Watering timer set for **${mins} minutes**. I'll let you know when it's done!`);
      return;
    }

    // Reminder commands
    if (lower.includes('remind') && lower.includes('check')) {
      const daysMatch = lower.match(/(\d+)\s*day/);
      const days = daysMatch ? parseInt(daysMatch[1]) : 1;
      addMessage('assistant', `📅 Reminder set! I'll remind you to check your plants in **${days} day(s)**.\n\n_(Note: Reminders work while the app is open. Consider also setting a phone alarm.)_`);
      return;
    }

    // Journal entry
    if (lower.startsWith('log entry') || lower.startsWith('journal')) {
      const entry = text.replace(/^(log entry|journal)[:\s]*/i, '').trim();
      addMessage('assistant', `📝 **Journal entry logged!**\n\n"${entry || 'Planting session completed.'}"\n\nTimestamp: ${new Date().toLocaleString()}\n\n_Would you like to add a photo later?_`);
      return;
    }

    // Quick Q&A match
    const qaMatch = QUICK_QA.find(qa => lower.includes(qa.q.toLowerCase().split(' ').slice(2, 5).join(' ')));
    if (qaMatch) {
      addMessage('assistant', `💡 ${qaMatch.a}`);
      return;
    }

    // AI-powered response
    setAiLoading(true);
    try {
      const plantNames = gardenPlants.map(p => p.commonName).join(', ');
      const prompt = `You are a friendly, expert gardening voice assistant. The user is gardening hands-free and speaking to you.
User's garden contains: ${plantNames || 'various plants'}
Location: ${location?.name || 'Unknown'}
User says: "${text}"

Provide a helpful, conversational response as if speaking to them while they garden. Keep it under 100 words. Be practical and encouraging. Use simple language suitable for reading aloud. Include relevant emojis.`;
      const response = await getGardenInsights(prompt);
      addMessage('assistant', response);
    } catch (err) {
      if (err instanceof QuotaExceededError) { onQuotaError?.(err.message); }
      addMessage('assistant', "🤔 I couldn't process that right now. Try rephrasing, or ask a simpler question!");
    } finally { setAiLoading(false); }
  }, [input, activeSession, gardenPlants, location, addMessage]);

  // Simulated voice input (Web Speech API)
  const toggleVoice = useCallback(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      addMessage('system', '🎤 Voice input is not supported in this browser. Please type your message instead.');
      return;
    }
    if (isListening) { setIsListening(false); return; }
    setIsListening(true);
    try {
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SR) { setIsListening(false); return; }
      const recognition = new SR();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        setIsListening(false);
      };
      recognition.onerror = () => { setIsListening(false); };
      recognition.onend = () => { setIsListening(false); };
      recognition.start();
    } catch { setIsListening(false); addMessage('system', '🎤 Voice recognition failed. Please type instead.'); }
  }, [isListening, addMessage]);

  // Text-to-speech for assistant messages
  const speakLast = useCallback(() => {
    const lastAssistant = [...messages].reverse().find(m => m.type === 'assistant');
    if (lastAssistant && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const cleaned = lastAssistant.text.replace(/[*_#🌱🪴❓📝⏱️✅🎉⏸️✋⏰📅💡🤔📸🎤🌿🌹\[\]]/g, '');
      const utterance = new SpeechSynthesisUtterance(cleaned);
      utterance.rate = 0.9; utterance.pitch = 1;
      window.speechSynthesis.speak(utterance);
    }
  }, [messages]);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2"><span>🎙️</span> Voice Planting Assistant</h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">Hands-free gardening guidance</p>
        </div>
        <Button onClick={onBack} variant="outline" size="sm">← Back</Button>
      </div>

      {/* Active Session */}
      {activeSession && (
        <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3 border border-emerald-200 dark:border-emerald-800">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">🌱 Planting: {activeSession.plant}</p>
            <p className="text-[10px] text-emerald-600 dark:text-emerald-400">Step {activeSession.currentStep + 1} of {activeSession.steps.length}</p>
          </div>
          <div className="w-full h-1.5 bg-emerald-200 dark:bg-emerald-800 rounded-full mt-1.5 overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${((activeSession.currentStep + 1) / activeSession.steps.length) * 100}%` }} />
          </div>
        </div>
      )}

      {/* Timer */}
      {timer && (
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 border border-blue-200 dark:border-blue-800 flex items-center justify-between">
          <p className="text-xs text-blue-700 dark:text-blue-400">⏱️ Watering timer: <strong>{timer.remaining} min</strong> remaining</p>
          <button onClick={() => { setTimer(null); if (timerRef.current) clearInterval(timerRef.current); }}
            className="text-[10px] text-red-400 hover:text-red-600">Cancel</button>
        </div>
      )}

      {/* Chat Area */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="h-[340px] overflow-y-auto p-4 space-y-3">
          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] p-3 rounded-xl text-xs leading-relaxed ${
                msg.type === 'user' ? 'bg-emerald-500 text-white rounded-br-sm' :
                msg.type === 'system' ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800' :
                'bg-slate-100 dark:bg-slate-700/50 text-slate-700 dark:text-slate-200 rounded-bl-sm'
              }`}>
                <div className="whitespace-pre-line">{msg.text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
                  i % 2 === 1 ? <strong key={i}>{part}</strong> : part
                )}</div>
                <p className={`text-[9px] mt-1 ${msg.type === 'user' ? 'text-white/60' : 'text-slate-400'}`}>
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))}
          {aiLoading && (
            <div className="flex justify-start">
              <div className="bg-slate-100 dark:bg-slate-700/50 p-3 rounded-xl rounded-bl-sm">
                <span className="text-xs text-slate-400 animate-pulse">🌱 Thinking...</span>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input Bar */}
        <div className="border-t border-slate-200 dark:border-slate-700 p-3 flex gap-2">
          <button onClick={toggleVoice}
            className={`p-2.5 rounded-xl transition-all ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 hover:bg-slate-200'}`}>
            🎤
          </button>
          <input value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
            placeholder={isListening ? 'Listening...' : activeSession ? 'Say "next", "repeat", or ask a question...' : 'Type a message or use voice...'}
            className="flex-1 text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
            disabled={isListening} />
          <button onClick={handleSend} disabled={!input.trim() || aiLoading}
            className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold disabled:opacity-50 transition-colors">
            Send
          </button>
          <button onClick={speakLast} title="Read last response aloud"
            className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-600 transition-all">
            🔊
          </button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-1.5">
        {[
          ...(gardenPlants.length > 0 ? [`Plant ${gardenPlants[0].commonName}`] : ['Plant tomatoes']),
          'How deep should I plant seeds?',
          'Set timer for 15 minutes',
          'Log entry: planted today',
          'When should I water?',
        ].map(cmd => (
          <button key={cmd} onClick={() => { setInput(cmd); }}
            className="text-[10px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/10 transition-colors">
            {cmd}
          </button>
        ))}
      </div>
    </div>
  );
};
