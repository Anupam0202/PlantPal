import React, { useState, useMemo, useCallback } from 'react';
import { Button } from './common/Button';
import { getGardenPlants } from '../services/gardenService';
import { getGardenInsights, QuotaExceededError } from '../services/geminiService';
import type { LocationData } from '../types';

// Bloom month data for common plants
const BLOOM_DATA: Record<string, { months: number[]; nectar: 'high' | 'medium' | 'low'; pollinators: string[] }> = {
  'crocus': { months: [1,2,3], nectar: 'medium', pollinators: ['Early bumblebees'] },
  'snowdrop': { months: [1,2], nectar: 'low', pollinators: ['Early bumblebees'] },
  'daffodil': { months: [2,3,4], nectar: 'medium', pollinators: ['Bees'] },
  'tulip': { months: [3,4,5], nectar: 'low', pollinators: ['Bees'] },
  'lilac': { months: [4,5], nectar: 'high', pollinators: ['Butterflies', 'Bees'] },
  'rose': { months: [5,6,7,8,9], nectar: 'medium', pollinators: ['Bees', 'Beetles'] },
  'lavender': { months: [6,7,8], nectar: 'high', pollinators: ['Honeybees', 'Bumblebees', 'Butterflies'] },
  'sunflower': { months: [7,8,9], nectar: 'high', pollinators: ['Bees', 'Butterflies', 'Birds'] },
  'marigold': { months: [5,6,7,8,9,10], nectar: 'medium', pollinators: ['Bees', 'Hoverflies'] },
  'coneflower': { months: [6,7,8,9], nectar: 'high', pollinators: ['Butterflies', 'Bees'] },
  'aster': { months: [8,9,10], nectar: 'high', pollinators: ['Monarch butterflies', 'Bees'] },
  'chrysanthemum': { months: [9,10,11], nectar: 'medium', pollinators: ['Hoverflies', 'Bees'] },
  'camellia': { months: [11,0,1,2], nectar: 'medium', pollinators: ['Winter bees'] },
  'jasmine': { months: [5,6,7,8,9], nectar: 'high', pollinators: ['Moths', 'Bees'] },
  'cosmos': { months: [6,7,8,9,10], nectar: 'high', pollinators: ['Bees', 'Butterflies'] },
  'zinnia': { months: [6,7,8,9], nectar: 'high', pollinators: ['Swallowtail butterflies', 'Bees'] },
  'dahlia': { months: [7,8,9,10], nectar: 'medium', pollinators: ['Bees', 'Hoverflies'] },
  'sage': { months: [5,6,7,8], nectar: 'high', pollinators: ['Bees', 'Hummingbirds'] },
  'rosemary': { months: [2,3,4,5,10,11], nectar: 'medium', pollinators: ['Bees'] },
  'thyme': { months: [5,6,7], nectar: 'medium', pollinators: ['Small bees', 'Hoverflies'] },
  'oregano': { months: [6,7,8], nectar: 'medium', pollinators: ['Bees', 'Butterflies'] },
  'basil': { months: [6,7,8,9], nectar: 'medium', pollinators: ['Bees'] },
  'mint': { months: [6,7,8], nectar: 'medium', pollinators: ['Bees', 'Hoverflies'] },
  'milkweed': { months: [6,7,8], nectar: 'high', pollinators: ['Monarch butterflies (host plant!)', 'Bees'] },
  'goldenrod': { months: [8,9,10], nectar: 'high', pollinators: ['Bees', 'Butterflies'] },
  'heather': { months: [7,8,9,10,11], nectar: 'high', pollinators: ['Bees'] },
  'foxglove': { months: [5,6,7], nectar: 'high', pollinators: ['Bumblebees'] },
  'honeysuckle': { months: [5,6,7,8], nectar: 'high', pollinators: ['Hummingbirds', 'Moths'] },
  'monkeyflower': { months: [4,5,6,7,8], nectar: 'high', pollinators: ['Bees', 'Hummingbirds'] },
  'poppy': { months: [4,5,6], nectar: 'low', pollinators: ['Bees (pollen only)'] },
  'daisy': { months: [5,6,7,8,9], nectar: 'medium', pollinators: ['Hoverflies', 'Bees'] },
  'borage': { months: [5,6,7,8], nectar: 'high', pollinators: ['Bees (beloved by all bee species)'] },
  'butterfly bush': { months: [6,7,8,9], nectar: 'high', pollinators: ['Butterflies', 'Hummingbirds'] },
  'verbena': { months: [5,6,7,8,9], nectar: 'high', pollinators: ['Butterflies'] },
  'clover': { months: [4,5,6,7,8,9], nectar: 'high', pollinators: ['Bumblebees', 'Honeybees'] },
  'buckwheat': { months: [5,6,7,8], nectar: 'high', pollinators: ['Native bees', 'Hoverflies'] },
};

const HOST_PLANTS: Record<string, string> = {
  'milkweed': '🦋 Monarch butterfly caterpillars',
  'dill': '🐛 Swallowtail butterfly caterpillars',
  'fennel': '🐛 Swallowtail butterfly caterpillars',
  'parsley': '🐛 Black swallowtail caterpillars',
  'violet': '🟠 Fritillary butterfly caterpillars',
  'willow': '🦋 Mourning cloak, viceroy caterpillars',
  'oak': '🐛 500+ species of moths and butterflies',
  'cherry': '🐛 Tiger swallowtail caterpillars',
  'nettle': '🦋 Red admiral, painted lady caterpillars',
};

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_SHORT = ['J','F','M','A','M','J','J','A','S','O','N','D'];

interface Props { onBack: () => void; location: LocationData | null; onQuotaError?: (msg?: string) => void; envProfile?: import('../types').EnvironmentalProfile | null; }

export const PollinatorPathway: React.FC<Props> = ({ onBack, location, onQuotaError, envProfile }) => {
  const plants = useMemo(() => getGardenPlants().filter(p => p.status === 'active'), []);
  const [suggestions, setSuggestions] = useState<string | null>(null);
  const [sugLoading, setSugLoading] = useState(false);

  const bloomCalendar = useMemo(() => {
    const months: { month: number; plants: { name: string; nectar: string }[] }[] = Array.from({ length: 12 }, (_, i) => ({ month: i, plants: [] }));
    for (const p of plants) {
      const nm = p.commonName.toLowerCase();
      for (const [key, data] of Object.entries(BLOOM_DATA)) {
        if (nm.includes(key)) {
          for (const m of data.months) {
            months[m].plants.push({ name: p.commonName, nectar: data.nectar });
          }
        }
      }
    }
    return months;
  }, [plants]);

  const hungerGaps = useMemo(() => {
    return bloomCalendar.filter(m => m.plants.length === 0).map(m => m.month);
  }, [bloomCalendar]);

  const pollinatorSpecies = useMemo(() => {
    const species = new Set<string>();
    for (const p of plants) {
      const nm = p.commonName.toLowerCase();
      for (const [key, data] of Object.entries(BLOOM_DATA)) {
        if (nm.includes(key)) data.pollinators.forEach(sp => species.add(sp));
      }
    }
    return Array.from(species);
  }, [plants]);

  const hostPlantMatches = useMemo(() => {
    const matches: { plant: string; serves: string }[] = [];
    for (const p of plants) {
      const nm = p.commonName.toLowerCase();
      for (const [key, desc] of Object.entries(HOST_PLANTS)) {
        if (nm.includes(key)) matches.push({ plant: p.commonName, serves: desc });
      }
    }
    return matches;
  }, [plants]);

  const pathwayScore = useMemo(() => {
    const bloomCoverage = 12 - hungerGaps.length;
    const pollinatorDiv = pollinatorSpecies.length;
    const hostCount = hostPlantMatches.length;
    const nectarHigh = plants.filter(p => {
      const nm = p.commonName.toLowerCase();
      return Object.entries(BLOOM_DATA).some(([k, d]) => nm.includes(k) && d.nectar === 'high');
    }).length;

    let score = 0;
    score += Math.min(40, bloomCoverage * 3.3);   // max 40 for 12-month coverage
    score += Math.min(25, pollinatorDiv * 2.5);     // max 25 for 10+ species
    score += Math.min(15, hostCount * 5);           // max 15 for 3+ host plants
    score += Math.min(20, nectarHigh * 4);          // max 20 for 5+ high-nectar plants
    return Math.min(100, Math.round(score));
  }, [hungerGaps, pollinatorSpecies, hostPlantMatches, plants]);

  const getPathwaySuggestions = useCallback(async () => {
    setSugLoading(true);
    try {
      const envContext = envProfile?.biodiversity ? `GBIF Local Data: ${envProfile.biodiversity.totalAnimalSpecies} animal/insect species observed within 10km (potential pollinators).` : '';
      const prompt = `You are a pollinator conservation ecologist. A gardener has: ${plants.map(p => p.commonName).join(', ')}.
Location: ${location?.name || 'Unknown'}. ${envContext}
Bloom coverage: ${12 - hungerGaps.length}/12 months. Hunger gap months: ${hungerGaps.map(m => MONTH_NAMES[m]).join(', ') || 'None'}.
Pollinator species attracted: ${pollinatorSpecies.join(', ') || 'Unknown'}.
Host plants: ${hostPlantMatches.map(h => h.plant).join(', ') || 'None'}.
Pathway score: ${pathwayScore}/100.

Provide:
1. 🌸 Specific plants to add for each hunger gap month (exact species names)
2. 🐛 Host plants to add for local butterfly/moth species
3. 🔴 Underrepresented pollinator groups and plants to attract them (native bees, moths, hoverflies, beetles)
4. 🎨 Color suggestions (blue for bees, red for hummingbirds, white for moths)
5. 💧 One habitat addition (water dish, bare soil for ground-nesting bees, etc.)

Keep under 250 words. Use emojis.`;
      setSuggestions(await getGardenInsights(prompt));
    } catch (err) { if (err instanceof QuotaExceededError) { onQuotaError?.(err.message); } setSuggestions('Unable to generate suggestions.'); }
    finally { setSugLoading(false); }
  }, [plants, hungerGaps, pollinatorSpecies, hostPlantMatches, pathwayScore, location]);

  if (plants.length === 0) {
    return (
      <div className="space-y-5 animate-fade-in">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">🐝 Pollinator Pathway</h2>
          <Button onClick={onBack} variant="outline" size="sm">← Back</Button>
        </div>
        <div className="text-center py-12 bg-slate-50 dark:bg-slate-800/50 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600">
          <span className="text-5xl block mb-3">🦋</span>
          <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200">Add plants to design your pollinator pathway</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Go to Garden → add plants, then come back here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2"><span>🐝</span> Pollinator Pathway Designer</h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">Year-round food for pollinators</p>
        </div>
        <Button onClick={onBack} variant="outline" size="sm">← Back</Button>
      </div>

      {/* Pathway Score */}
      <div className="bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 rounded-xl p-5 sm:p-6 border border-amber-200 dark:border-amber-800 text-center shadow-sm">
        <p className="text-4xl mb-1">🐝</p>
        <p className="text-5xl sm:text-6xl font-black text-amber-600 dark:text-amber-400 tracking-tight">{pathwayScore}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">/ 100 Pathway Score</p>
        <p className="text-sm font-bold mt-1 text-amber-700 dark:text-amber-300">
          {pathwayScore >= 80 ? '🏆 Critical Pollinator Link' : pathwayScore >= 60 ? '🌿 Strong Contributor' : pathwayScore >= 40 ? '✅ Good Growing' : '⚠️ Needs More Diversity'}
        </p>
      </div>

      {/* Bloom Calendar */}
      <div className="bg-white dark:bg-slate-800 rounded-xl p-4 sm:p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">🌸 Bloom Calendar — Month by Month</h3>
        <div className="space-y-1">
          {bloomCalendar.map((m, i) => {
            const isGap = m.plants.length === 0;
            return (
              <div key={i} className={`flex items-center gap-2 p-2 rounded-lg transition-colors ${isGap ? 'bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/40' : 'bg-emerald-50/50 dark:bg-emerald-900/10'}`}>
                <span className={`text-[10px] font-bold w-[28px] text-center ${isGap ? 'text-red-500' : 'text-emerald-600'}`}>{MONTH_SHORT[i]}</span>
                <div className="flex-1 flex items-center gap-1 min-w-0 flex-wrap">
                  {isGap ? (
                    <span className="text-[10px] text-red-400 italic">⚠️ Hunger gap — no blooms</span>
                  ) : (
                    m.plants.map((p, j) => (
                      <span key={j} className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 truncate max-w-[100px]">{p.name}</span>
                    ))
                  )}
                </div>
                <div className="flex gap-0.5 flex-shrink-0">
                  {m.plants.length > 0 && Array.from({ length: Math.min(5, m.plants.length) }).map((_, j) => (
                    <span key={j} className="text-[8px]">🌼</span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        {hungerGaps.length > 0 && (
          <div className="mt-3 p-2.5 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800">
            <p className="text-xs text-red-600 dark:text-red-400">
              <strong>🚨 {hungerGaps.length} hunger gap{hungerGaps.length > 1 ? 's' : ''}:</strong> {hungerGaps.map(m => MONTH_NAMES[m]).join(', ')}. Pollinators have no food source during these months.
            </p>
          </div>
        )}
        {hungerGaps.length === 0 && (
          <div className="mt-3 p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800">
            <p className="text-xs text-emerald-600 dark:text-emerald-400">🎉 <strong>Year-round coverage!</strong> Your garden provides continuous food for pollinators in every month.</p>
          </div>
        )}
      </div>

      {/* Pollinator Species */}
      <div className="bg-white dark:bg-slate-800 rounded-xl p-4 sm:p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">🦋 Pollinators Attracted ({pollinatorSpecies.length})</h3>
        <div className="flex flex-wrap gap-1.5">
          {pollinatorSpecies.length > 0 ? pollinatorSpecies.map(sp => (
            <span key={sp} className="text-[10px] px-2 py-1 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800">{sp}</span>
          )) : (
            <p className="text-xs text-slate-400 italic">No known pollinators identified yet. Add flowering plants to attract them.</p>
          )}
        </div>
      </div>

      {/* Host Plants */}
      {hostPlantMatches.length > 0 && (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl p-4 border border-green-200 dark:border-green-800 shadow-sm">
          <h3 className="text-sm font-semibold text-green-700 dark:text-green-400 mb-2">🐛 Caterpillar Host Plants</h3>
          <div className="space-y-1.5">
            {hostPlantMatches.map((h, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <strong className="text-emerald-600 dark:text-emerald-400">{h.plant}</strong>
                <span className="text-slate-400">→</span>
                <span>{h.serves}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-slate-400 mt-2">Host plants feed caterpillars — essential for butterfly populations, not just nectar sources!</p>
        </div>
      )}

      {/* AI Suggestions */}
      <div className="bg-gradient-to-r from-pink-50 to-rose-50 dark:from-pink-900/20 dark:to-rose-900/20 rounded-xl p-4 sm:p-5 border border-pink-200 dark:border-pink-800 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-pink-700 dark:text-pink-400">🌺 AI Gap-Filling Suggestions</h3>
          <button onClick={getPathwaySuggestions} disabled={sugLoading}
            className="text-xs px-3 py-1.5 rounded-lg bg-pink-500 hover:bg-pink-600 text-white disabled:opacity-50 transition-colors min-h-[32px]">
            {sugLoading ? '⏳...' : suggestions ? '🔄 Refresh' : '✨ Fill Gaps'}
          </button>
        </div>
        {suggestions ? (
          <div className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">{suggestions}</div>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400 italic">Get AI-powered suggestions to fill bloom gaps and attract more pollinators.</p>
        )}
      </div>
    </div>
  );
};
