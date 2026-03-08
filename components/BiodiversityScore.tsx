import React, { useState, useMemo, useCallback } from 'react';
import { Button } from './common/Button';
import { getGardenPlants } from '../services/gardenService';
import { getGardenInsights, QuotaExceededError } from '../services/geminiService';
import type { LocationData } from '../types';

// Classification helpers
const NATIVE_KW: Record<string, string[]> = {
  'north-america': ['toyon', 'manzanita', 'buckwheat', 'sage', 'monkeyflower', 'coneflower', 'aster', 'milkweed', 'goldenrod', 'switchgrass', 'blueberry', 'serviceberry', 'dogwood', 'redbud', 'oak', 'maple', 'birch', 'cedar', 'spruce', 'fir', 'sequoia', 'redwood', 'poppy', 'sunflower', 'black-eyed susan'],
  'europe': ['lavender', 'rosemary', 'thyme', 'oregano', 'elder', 'hawthorn', 'holly', 'primrose', 'foxglove', 'heather', 'bluebell', 'ivy', 'hazel', 'willow', 'birch', 'scots pine', 'yew'],
  'asia': ['bamboo', 'jasmine', 'camellia', 'chrysanthemum', 'ginkgo', 'wisteria', 'azalea', 'rhododendron', 'lotus', 'magnolia', 'cherry', 'peony'],
  'tropical': ['hibiscus', 'plumeria', 'bougainvillea', 'palm', 'banana', 'orchid', 'bird of paradise', 'frangipani'],
};
const POLLINATOR_KW = ['lavender', 'sunflower', 'daisy', 'marigold', 'sage', 'salvia', 'coneflower', 'milkweed', 'lilac', 'zinnia', 'cosmos', 'aster', 'monkeyflower', 'buckwheat', 'borage', 'rosemary', 'thyme', 'oregano', 'basil', 'mint', 'bee balm', 'clover', 'goldenrod', 'poppy', 'honeysuckle', 'jasmine', 'butterfly bush', 'verbena', 'heather', 'foxglove'];
const BIRD_KW = ['holly', 'elderberry', 'serviceberry', 'dogwood', 'sunflower', 'coneflower', 'toyon', 'manzanita', 'blueberry', 'mulberry', 'viburnum', 'hawthorn', 'pyracantha', 'cotoneaster'];
const TREE_KW = ['tree', 'oak', 'maple', 'pine', 'birch', 'palm', 'cedar', 'willow', 'elm', 'toyon', 'sequoia', 'redwood', 'spruce', 'fir', 'cypress'];
const SHRUB_KW = ['shrub', 'bush', 'hedge', 'lilac', 'boxwood', 'azalea', 'rhododendron', 'holly', 'manzanita'];
const GROUND_KW = ['clover', 'creeping', 'moss', 'groundcover', 'thyme', 'sedum', 'ajuga', 'vinca'];
const VINE_KW = ['vine', 'ivy', 'jasmine', 'clematis', 'wisteria', 'grape', 'honeysuckle'];
const NFIXER_KW = ['clover', 'bean', 'pea', 'lupin', 'lupine', 'wisteria', 'acacia', 'alder', 'alfalfa', 'vetch'];

const BLOOM_MONTHS: Record<string, number[]> = {
  'crocus': [1,2,3], 'snowdrop': [1,2], 'daffodil': [2,3,4], 'tulip': [3,4,5], 'lilac': [4,5],
  'rose': [5,6,7,8,9], 'lavender': [6,7,8], 'sunflower': [7,8,9], 'marigold': [5,6,7,8,9,10],
  'coneflower': [6,7,8,9], 'aster': [8,9,10], 'chrysanthemum': [9,10,11], 'camellia': [11,0,1,2],
  'jasmine': [5,6,7,8,9], 'cosmos': [6,7,8,9,10], 'zinnia': [6,7,8,9], 'dahlia': [7,8,9,10],
  'pansy': [2,3,4,10,11], 'sage': [5,6,7,8], 'rosemary': [2,3,4,5,10,11], 'thyme': [5,6,7],
  'oregano': [6,7,8], 'basil': [6,7,8,9], 'mint': [6,7,8], 'milkweed': [6,7,8],
  'goldenrod': [8,9,10], 'heather': [7,8,9,10,11], 'foxglove': [5,6,7], 'honeysuckle': [5,6,7,8],
  'monkeyflower': [4,5,6,7,8], 'poppy': [4,5,6], 'daisy': [5,6,7,8,9], 'borage': [5,6,7,8],
};

const SCORE_LABELS: { min: number; label: string; color: string; emoji: string }[] = [
  { min: 81, label: 'Ecological Haven', color: 'text-emerald-600', emoji: '🏆' },
  { min: 61, label: 'Thriving Ecosystem', color: 'text-green-600', emoji: '🌿' },
  { min: 41, label: 'Healthy Garden', color: 'text-amber-600', emoji: '✅' },
  { min: 21, label: 'Basic Green Cover', color: 'text-orange-600', emoji: '⚠️' },
  { min: 0, label: 'Ecological Desert', color: 'text-red-600', emoji: '🏜️' },
];

interface Props { onBack: () => void; location: LocationData | null; onQuotaError?: (msg?: string) => void; envProfile?: import('../types').EnvironmentalProfile | null; }

export const BiodiversityScore: React.FC<Props> = ({ onBack, location, onQuotaError, envProfile }) => {
  const plants = useMemo(() => getGardenPlants().filter(p => p.status === 'active'), []);
  const [suggestions, setSuggestions] = useState<string | null>(null);
  const [sugLoading, setSugLoading] = useState(false);

  const analysis = useMemo(() => {
    const n = plants.length;
    if (n === 0) return null;

    // Species Diversity (max 25pts)
    const families = new Set(plants.map(p => {
      const nm = p.commonName.toLowerCase();
      if (TREE_KW.some(k => nm.includes(k))) return 'tree';
      if (SHRUB_KW.some(k => nm.includes(k))) return 'shrub';
      if (GROUND_KW.some(k => nm.includes(k))) return 'ground';
      if (VINE_KW.some(k => nm.includes(k))) return 'vine';
      return 'herbaceous';
    }));
    const uniqueNames = new Set(plants.map(p => p.commonName.toLowerCase()));
    const diversityPts = Math.min(25, uniqueNames.size * 3 + families.size * 4);

    // Native Plant Percentage (max 20pts)
    const region = (location?.latitude ?? 40) > 0 ? 'north-america' : 'tropical';
    const regionNative = NATIVE_KW[region] || [];
    const allNative = [...regionNative, ...Object.values(NATIVE_KW).flat()];
    const nativeCount = plants.filter(p => allNative.some(k => p.commonName.toLowerCase().includes(k))).length;
    const nativePct = n > 0 ? Math.round((nativeCount / n) * 100) : 0;
    const nativePts = Math.min(20, Math.round(nativePct / 5));

    // Pollinator Support (max 20pts)
    const pollinatorCount = plants.filter(p => POLLINATOR_KW.some(k => p.commonName.toLowerCase().includes(k))).length;
    const bloomMonths = new Set<number>();
    for (const p of plants) {
      const nm = p.commonName.toLowerCase();
      for (const [key, months] of Object.entries(BLOOM_MONTHS)) {
        if (nm.includes(key)) months.forEach(m => bloomMonths.add(m));
      }
    }
    const coverageMonths = bloomMonths.size;
    const hungerGap = 12 - coverageMonths;
    const pollinatorPts = Math.min(20, pollinatorCount * 3 + coverageMonths);

    // Bird Habitat (max 15pts)
    const birdPlants = plants.filter(p => BIRD_KW.some(k => p.commonName.toLowerCase().includes(k))).length;
    const hasTree = plants.some(p => TREE_KW.some(k => p.commonName.toLowerCase().includes(k)));
    const hasShrub = plants.some(p => SHRUB_KW.some(k => p.commonName.toLowerCase().includes(k)));
    const birdPts = Math.min(15, birdPlants * 3 + (hasTree ? 4 : 0) + (hasShrub ? 3 : 0));

    // Soil Health (max 10pts)
    const nfixers = plants.filter(p => NFIXER_KW.some(k => p.commonName.toLowerCase().includes(k))).length;
    const groundCover = plants.filter(p => GROUND_KW.some(k => p.commonName.toLowerCase().includes(k))).length;
    const soilPts = Math.min(10, nfixers * 3 + groundCover * 3 + (n >= 3 ? 2 : 0));

    // Pest Resilience (max 10pts)
    const pestPts = Math.min(10, Math.round(uniqueNames.size * 1.5) + (families.size >= 3 ? 3 : 0));

    const total = Math.min(100, diversityPts + nativePts + pollinatorPts + birdPts + soilPts + pestPts);
    const classification = SCORE_LABELS.find(s => total >= s.min) || SCORE_LABELS[4];

    return {
      total, classification,
      diversity: { pts: diversityPts, species: uniqueNames.size, families: families.size },
      native: { pts: nativePts, count: nativeCount, pct: nativePct },
      pollinator: { pts: pollinatorPts, count: pollinatorCount, bloomMonths: coverageMonths, gap: hungerGap },
      bird: { pts: birdPts, count: birdPlants, hasTree, hasShrub },
      soil: { pts: soilPts, nfixers, groundCover },
      pest: { pts: pestPts, diverseEnough: uniqueNames.size >= 5 },
    };
  }, [plants, location]);

  const getImprovement = useCallback(async () => {
    if (!analysis) return;
    setSugLoading(true);
    try {
      const prompt = `You are an ecologist. A gardener has ${plants.length} plants: ${plants.map(p => p.commonName).join(', ')}.
Biodiversity score: ${analysis.total}/100. Native plants: ${analysis.native.pct}%. Bloom months: ${analysis.pollinator.bloomMonths}/12.
Pollinator plants: ${analysis.pollinator.count}. Bird-friendly: ${analysis.bird.count}. N-fixers: ${analysis.soil.nfixers}.${envProfile?.biodiversity ? `\nGBIF local data: ${envProfile.biodiversity.totalPlantSpecies} plant species observed within 10km. Key natives: ${envProfile.biodiversity.keyNativePlants.slice(0, 8).join(', ')}.` : ''}

Provide 4-5 specific, actionable improvement suggestions:
1. Species to ADD to fill bloom gaps (name exact species)
2. How to improve native plant percentage
3. Structural diversity improvements (trees, shrubs, ground cover)
4. Specific bird/pollinator habitat additions
5. Soil biology improvements

Be specific with plant names. Estimate the score increase each suggestion would provide. Under 250 words. Use emojis.`;
      setSuggestions(await getGardenInsights(prompt));
    } catch (err) { if (err instanceof QuotaExceededError) { onQuotaError?.(err.message); } setSuggestions('Unable to generate suggestions. Try again.'); }
    finally { setSugLoading(false); }
  }, [plants, analysis]);

  if (!analysis) {
    return (
      <div className="space-y-5 animate-fade-in">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">🦋 Biodiversity Score</h2>
          <Button onClick={onBack} variant="outline" size="sm">← Back</Button>
        </div>
        <div className="text-center py-12 bg-slate-50 dark:bg-slate-800/50 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600">
          <span className="text-5xl block mb-3">🌱</span>
          <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200">Add plants to see your biodiversity score</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Go to Garden → add plants, then come back here.</p>
        </div>
      </div>
    );
  }

  const Bar: React.FC<{ pts: number; max: number; color: string; label: string }> = ({ pts, max, color, label }) => (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px]">
        <span className="text-slate-600 dark:text-slate-300 font-medium">{label}</span>
        <span className="text-slate-400">{pts}/{max}</span>
      </div>
      <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-1000 ${color}`} style={{ width: `${(pts / max) * 100}%` }} />
      </div>
    </div>
  );

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2"><span>🦋</span> Biodiversity Score</h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">Ecosystem health analysis of your garden</p>
        </div>
        <Button onClick={onBack} variant="outline" size="sm">← Back</Button>
      </div>

      {/* Overall Score */}
      <div className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 rounded-xl p-5 sm:p-6 border border-emerald-200 dark:border-emerald-800 text-center shadow-sm">
        <p className="text-4xl sm:text-5xl mb-1">{analysis.classification.emoji}</p>
        <p className="text-5xl sm:text-6xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">{analysis.total}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">/ 100</p>
        <p className={`text-sm sm:text-base font-bold mt-1 ${analysis.classification.color}`}>{analysis.classification.label}</p>
      </div>

      {/* Breakdown Bars */}
      <div className="bg-white dark:bg-slate-800 rounded-xl p-4 sm:p-5 border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">📊 Detailed Breakdown</h3>
        <Bar pts={analysis.diversity.pts} max={25} color="bg-emerald-500" label={`🌿 Species Diversity (${analysis.diversity.species} species, ${analysis.diversity.families} structural layers)`} />
        <Bar pts={analysis.native.pts} max={20} color="bg-green-500" label={`🏠 Native Plants (${analysis.native.pct}% native)`} />
        <Bar pts={analysis.pollinator.pts} max={20} color="bg-amber-500" label={`🐝 Pollinator Support (${analysis.pollinator.count} pollinator plants, ${analysis.pollinator.bloomMonths}/12 bloom months)`} />
        <Bar pts={analysis.bird.pts} max={15} color="bg-blue-500" label={`🐦 Bird Habitat (${analysis.bird.count} food plants${analysis.bird.hasTree ? ', trees ✓' : ''}${analysis.bird.hasShrub ? ', shrubs ✓' : ''})`} />
        <Bar pts={analysis.soil.pts} max={10} color="bg-purple-500" label={`🌍 Soil Health (${analysis.soil.nfixers} N-fixers, ${analysis.soil.groundCover} ground cover)`} />
        <Bar pts={analysis.pest.pts} max={10} color="bg-orange-500" label={`🛡️ Pest Resilience (${analysis.pest.diverseEnough ? 'Good diversity' : 'Low diversity — add more species'})`} />
      </div>

      {/* Bloom Calendar */}
      <div className="bg-white dark:bg-slate-800 rounded-xl p-4 sm:p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">🌸 Bloom Calendar</h3>
        <div className="grid grid-cols-12 gap-0.5">
          {['J','F','M','A','M','J','J','A','S','O','N','D'].map((m, i) => {
            const hasBloom = (() => {
              for (const p of plants) {
                const nm = p.commonName.toLowerCase();
                for (const [key, months] of Object.entries(BLOOM_MONTHS)) {
                  if (nm.includes(key) && months.includes(i)) return true;
                }
              }
              return false;
            })();
            return (
              <div key={i} className={`text-center py-2 rounded-md text-[10px] font-medium ${hasBloom ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' : 'bg-slate-100 dark:bg-slate-700/30 text-slate-400'}`}>
                {m}
                <div className="text-xs mt-0.5">{hasBloom ? '🌼' : '—'}</div>
              </div>
            );
          })}
        </div>
        {analysis.pollinator.gap > 0 && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">⚠️ {analysis.pollinator.gap} month{analysis.pollinator.gap > 1 ? 's' : ''} without blooms — add plants that flower in those months.</p>
        )}
      </div>

      {/* AI Suggestions */}
      <div className="bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-xl p-4 sm:p-5 border border-blue-200 dark:border-blue-800 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-blue-700 dark:text-blue-400">💡 AI Improvement Suggestions</h3>
          <button onClick={getImprovement} disabled={sugLoading}
            className="text-xs px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50 transition-colors min-h-[32px]">
            {sugLoading ? '⏳ Analyzing...' : suggestions ? '🔄 Refresh' : '✨ Get Suggestions'}
          </button>
        </div>
        {suggestions ? (
          <div className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">{suggestions}</div>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400 italic">Get AI-powered suggestions to improve your biodiversity score.</p>
        )}
      </div>
    </div>
  );
};
