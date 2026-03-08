import React, { useState, useMemo, useCallback } from 'react';
import { Button } from './common/Button';
import { COMPANION_DB } from '../constants';
import { getGardenInsights, QuotaExceededError } from '../services/geminiService';
import type { CompanionRelation, GardenPlant } from '../types';
import * as garden from '../services/gardenService';

const REL_CONFIG: Record<CompanionRelation, { icon: string; label: string; color: string; bg: string; cellBg: string }> = {
  good: { icon: '💚', label: 'Companion', color: 'text-emerald-600', bg: 'bg-emerald-100 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-700', cellBg: 'bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40' },
  bad: { icon: '⚠️', label: 'Antagonist', color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700', cellBg: 'bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40' },
  neutral: { icon: '➖', label: 'Neutral', color: 'text-slate-500', bg: 'bg-slate-100 dark:bg-slate-700/50 border-slate-300 dark:border-slate-600', cellBg: 'bg-slate-50 dark:bg-slate-800/30 hover:bg-slate-100 dark:hover:bg-slate-700/40' },
};

const lookupRelation = (a: string, b: string): { rel: CompanionRelation; why: string } => {
  const aLow = a.toLowerCase();
  const bLow = b.toLowerCase();
  const match = COMPANION_DB.find(
    (e) => (aLow.includes(e.a) || e.a.includes(aLow)) && (bLow.includes(e.b) || e.b.includes(bLow)) ||
            (aLow.includes(e.b) || e.b.includes(aLow)) && (bLow.includes(e.a) || e.a.includes(bLow))
  );
  return match ? { rel: match.rel, why: match.why } : { rel: 'neutral', why: 'No known strong interaction between these plants. They can be planted at a normal distance.' };
};

interface Props { onBack: () => void; onQuotaError?: (msg?: string) => void; }

export const CompanionMatrix: React.FC<Props> = ({ onBack, onQuotaError }) => {
  const [plants, setPlants] = useState<GardenPlant[]>(() => garden.getGardenPlants().filter((p) => p.status === 'active'));
  const [customPlant, setCustomPlant] = useState('');
  const [selectedPair, setSelectedPair] = useState<{ a: string; b: string; rel: CompanionRelation; why: string } | null>(null);
  const [layoutSuggestion, setLayoutSuggestion] = useState<string | null>(null);
  const [layoutLoading, setLayoutLoading] = useState(false);

  const plantNames = useMemo(() => plants.map((p) => p.commonName), [plants]);

  const matrix = useMemo(() => {
    const result: Record<string, Record<string, { rel: CompanionRelation; why: string }>> = {};
    for (const a of plantNames) {
      result[a] = {};
      for (const b of plantNames) {
        if (a === b) { result[a][b] = { rel: 'neutral', why: 'Same plant.' }; }
        else { result[a][b] = lookupRelation(a, b); }
      }
    }
    return result;
  }, [plantNames]);

  const stats = useMemo(() => {
    let good = 0, bad = 0;
    for (let i = 0; i < plantNames.length; i++) {
      for (let j = i + 1; j < plantNames.length; j++) {
        const r = matrix[plantNames[i]]?.[plantNames[j]]?.rel;
        if (r === 'good') good++;
        if (r === 'bad') bad++;
      }
    }
    return { good, bad, total: (plantNames.length * (plantNames.length - 1)) / 2 };
  }, [matrix, plantNames]);

  const addCustomPlant = useCallback(() => {
    const name = customPlant.trim();
    if (!name || plants.some((p) => p.commonName.toLowerCase() === name.toLowerCase())) return;
    const newPlant: GardenPlant = { id: `custom-${Date.now()}`, commonName: name, dateAdded: new Date().toISOString(), status: 'active' };
    setPlants([...plants, newPlant]);
    setCustomPlant('');
  }, [customPlant, plants]);

  const removePlant = useCallback((id: string) => {
    setPlants(plants.filter((p) => p.id !== id));
    setSelectedPair(null);
  }, [plants]);

  const generateLayout = useCallback(async () => {
    if (plantNames.length < 2) return;
    setLayoutLoading(true);
    try {
      const pairs = plantNames.flatMap((a, i) =>
        plantNames.slice(i + 1).map((b) => {
          const r = matrix[a]?.[b];
          return `${a} + ${b}: ${r?.rel || 'neutral'} — ${r?.why || 'No data'}`;
        })
      );
      const prompt = `You are a companion planting expert. Based on these plant relationships, create a garden layout suggestion.

Plants: ${plantNames.join(', ')}

Relationships:
${pairs.join('\n')}

Provide a concise layout plan:
1. Group companions together
2. Separate antagonists
3. Place taller plants on the north side
4. Include specific spacing suggestions in cm/inches
Keep response under 200 words. Use emojis for visual appeal.`;
      const result = await getGardenInsights(prompt);
      setLayoutSuggestion(result);
    } catch (err) { if (err instanceof QuotaExceededError) { onQuotaError?.(err.message); } setLayoutSuggestion('Unable to generate layout. Please try again.'); }
    finally { setLayoutLoading(false); }
  }, [plantNames, matrix]);

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2"><span>🔗</span> Companion Planting Matrix</h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">See which plants thrive together and which to keep apart</p>
        </div>
        <Button onClick={onBack} variant="outline" size="sm">← Back</Button>
      </div>

      {/* Add Plants */}
      <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">🌿 Your Plants ({plantNames.length})</h3>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {plants.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-xs font-medium">
              {p.commonName}
              <button onClick={() => removePlant(p.id)} className="text-emerald-500 hover:text-red-500 ml-0.5 text-[10px]">✕</button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={customPlant} onChange={(e) => setCustomPlant(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCustomPlant()}
            placeholder="Add a plant..." className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-700 dark:text-slate-200 min-h-[40px]" />
          <Button onClick={addCustomPlant} variant="primary" size="sm" disabled={!customPlant.trim()}>+ Add</Button>
        </div>
      </div>

      {/* Stats */}
      {plantNames.length >= 2 && (
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800">
            <p className="text-lg font-bold text-emerald-600">{stats.good}</p><p className="text-[10px] text-slate-500">Companions 💚</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800">
            <p className="text-lg font-bold text-red-600">{stats.bad}</p><p className="text-[10px] text-slate-500">Antagonists ⚠️</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-slate-50 dark:bg-slate-700/30 border border-slate-200 dark:border-slate-700">
            <p className="text-lg font-bold text-slate-600 dark:text-slate-300">{stats.total - stats.good - stats.bad}</p><p className="text-[10px] text-slate-500">Neutral ➖</p>
          </div>
        </div>
      )}

      {/* Compatibility Matrix */}
      {plantNames.length >= 2 ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-3 sm:p-4 border border-slate-200 dark:border-slate-700 shadow-sm overflow-x-auto">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">📊 Compatibility Grid</h3>
          <div className="overflow-x-auto scrollbar-thin">
            <table className="text-xs border-collapse w-full min-w-[300px]">
              <thead>
                <tr>
                  <th className="p-1.5 text-left text-[10px] text-slate-500 dark:text-slate-400 font-medium sticky left-0 bg-white dark:bg-slate-800 z-10 min-w-[80px]"></th>
                  {plantNames.map((name) => (
                    <th key={name} className="p-1.5 text-center font-medium text-slate-600 dark:text-slate-300 min-w-[60px]">
                      <span className="inline-block max-w-[60px] truncate text-[10px] sm:text-xs" title={name}>{name}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {plantNames.map((rowName) => (
                  <tr key={rowName}>
                    <td className="p-1.5 font-medium text-slate-600 dark:text-slate-300 text-[10px] sm:text-xs sticky left-0 bg-white dark:bg-slate-800 z-10 truncate max-w-[80px]" title={rowName}>{rowName}</td>
                    {plantNames.map((colName) => {
                      const data = matrix[rowName]?.[colName];
                      const cfg = data ? REL_CONFIG[data.rel] : REL_CONFIG.neutral;
                      const isSame = rowName === colName;
                      return (
                        <td key={colName}
                          className={`p-1.5 text-center cursor-pointer transition-colors border border-slate-100 dark:border-slate-700/50 ${isSame ? 'bg-slate-100 dark:bg-slate-700/30' : cfg.cellBg} ${selectedPair?.a === rowName && selectedPair?.b === colName ? 'ring-2 ring-emerald-400' : ''}`}
                          onClick={() => !isSame && data && setSelectedPair({ a: rowName, b: colName, rel: data.rel, why: data.why })}
                          title={`${rowName} × ${colName}`}
                        >
                          <span className="text-sm">{isSame ? '·' : cfg.icon}</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
            {Object.entries(REL_CONFIG).map(([key, cfg]) => (
              <span key={key} className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400"><span>{cfg.icon}</span> {cfg.label}</span>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-10 bg-slate-50 dark:bg-slate-800/50 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600">
          <span className="text-4xl block mb-3">🌱</span>
          <p className="text-sm text-slate-500 dark:text-slate-400">Add at least 2 plants to see the compatibility matrix</p>
        </div>
      )}

      {/* Detail Panel */}
      {selectedPair && (
        <div className={`p-4 rounded-xl border-2 ${REL_CONFIG[selectedPair.rel].bg} animate-fade-in`}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">{REL_CONFIG[selectedPair.rel].icon}</span>
            <h4 className={`text-sm font-semibold ${REL_CONFIG[selectedPair.rel].color}`}>{selectedPair.a} × {selectedPair.b} — {REL_CONFIG[selectedPair.rel].label}</h4>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{selectedPair.why}</p>
          <button onClick={() => setSelectedPair(null)} className="mt-2 text-[10px] text-slate-400 hover:text-slate-600">✕ Close</button>
        </div>
      )}

      {/* Layout Suggestion */}
      {plantNames.length >= 2 && (
        <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-xl p-4 sm:p-5 border border-purple-200 dark:border-purple-800 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm sm:text-base font-semibold text-purple-700 dark:text-purple-400">🗺️ AI Garden Layout Suggestion</h3>
            <button onClick={generateLayout} disabled={layoutLoading}
              className="text-xs px-3 py-1.5 rounded-lg bg-purple-500 hover:bg-purple-600 text-white disabled:opacity-50 transition-colors min-h-[32px]">
              {layoutLoading ? '⏳ Generating...' : layoutSuggestion ? '🔄 Regenerate' : '✨ Generate Layout'}
            </button>
          </div>
          {layoutSuggestion ? (
            <div className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">{layoutSuggestion}</div>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400 italic">Click "Generate Layout" for an AI-powered planting arrangement based on your plants' compatibility.</p>
          )}
        </div>
      )}
    </div>
  );
};
