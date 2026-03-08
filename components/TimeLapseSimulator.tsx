import React, { useState, useMemo, useCallback } from 'react';
import { Button } from './common/Button';
import { getGardenPlants } from '../services/gardenService';
import { getGardenInsights, QuotaExceededError } from '../services/geminiService';
import type { LocationData } from '../types';

// Plant growth data: max spread (m), max height (m), growth rate, shade cast radius at maturity (m)
const GROWTH_DB: Record<string, { maxH: number; maxSpread: number; rate: 'fast' | 'moderate' | 'slow'; shade: number; type: 'tree' | 'shrub' | 'herb' | 'flower'; deciduous: boolean; rootSpread: number }> = {
  neem: { maxH: 15, maxSpread: 10, rate: 'fast', shade: 8, type: 'tree', deciduous: false, rootSpread: 10 },
  mango: { maxH: 12, maxSpread: 8, rate: 'moderate', shade: 7, type: 'tree', deciduous: false, rootSpread: 8 },
  guava: { maxH: 8, maxSpread: 5, rate: 'moderate', shade: 4, type: 'tree', deciduous: false, rootSpread: 5 },
  bamboo: { maxH: 15, maxSpread: 3, rate: 'fast', shade: 2, type: 'tree', deciduous: false, rootSpread: 5 },
  rose: { maxH: 1.2, maxSpread: 0.8, rate: 'moderate', shade: 0.3, type: 'shrub', deciduous: true, rootSpread: 0.5 },
  tomato: { maxH: 1.5, maxSpread: 0.6, rate: 'fast', shade: 0.2, type: 'herb', deciduous: true, rootSpread: 0.3 },
  basil: { maxH: 0.6, maxSpread: 0.3, rate: 'fast', shade: 0, type: 'herb', deciduous: true, rootSpread: 0.2 },
  sunflower: { maxH: 3, maxSpread: 0.5, rate: 'fast', shade: 0.3, type: 'flower', deciduous: true, rootSpread: 0.3 },
  lavender: { maxH: 0.7, maxSpread: 0.6, rate: 'slow', shade: 0, type: 'shrub', deciduous: false, rootSpread: 0.4 },
  jasmine: { maxH: 4, maxSpread: 2, rate: 'moderate', shade: 1.5, type: 'shrub', deciduous: false, rootSpread: 1.5 },
  hibiscus: { maxH: 3.5, maxSpread: 2, rate: 'fast', shade: 1.5, type: 'shrub', deciduous: true, rootSpread: 1.5 },
  mint: { maxH: 0.5, maxSpread: 0.5, rate: 'fast', shade: 0, type: 'herb', deciduous: true, rootSpread: 1.0 },
  rosemary: { maxH: 0.7, maxSpread: 0.6, rate: 'slow', shade: 0, type: 'shrub', deciduous: false, rootSpread: 0.4 },
  bougainvillea: { maxH: 8, maxSpread: 4, rate: 'fast', shade: 3, type: 'shrub', deciduous: true, rootSpread: 3 },
  fern: { maxH: 0.8, maxSpread: 0.6, rate: 'slow', shade: 0, type: 'herb', deciduous: false, rootSpread: 0.3 },
};

const YEAR_LABELS = [0, 1, 3, 5, 10, 20];
const SEASON_COLORS = { spring: '#86efac', summer: '#16a34a', autumn: '#f59e0b', winter: '#94a3b8' };
type Season = keyof typeof SEASON_COLORS;

interface CanvasPlant { id: string; name: string; x: number; y: number; key: string; }

interface Props { onBack: () => void; location: LocationData | null; onQuotaError?: (msg?: string) => void; }

export const TimeLapseSimulator: React.FC<Props> = ({ onBack, location, onQuotaError }) => {
  const gardenPlants = useMemo(() => getGardenPlants().filter(p => p.status === 'active'), []);
  const [placed, setPlaced] = useState<CanvasPlant[]>([]);
  const [yearIdx, setYearIdx] = useState(0);
  const [season, setSeason] = useState<Season>('summer');
  const [selectedPlant, setSelectedPlant] = useState<string | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'top' | 'side'>('top');

  const year = YEAR_LABELS[yearIdx];

  const getPlantData = (name: string) => {
    const nm = name.toLowerCase();
    const key = Object.keys(GROWTH_DB).find(k => nm.includes(k));
    return key ? { key, ...GROWTH_DB[key] } : { key: 'default', maxH: 2, maxSpread: 1, rate: 'moderate' as const, shade: 0.5, type: 'shrub' as const, deciduous: false, rootSpread: 0.5 };
  };

  // Growth factor based on year (0–1 scale)
  const growthFactor = (rate: 'fast' | 'moderate' | 'slow', yr: number): number => {
    const maturityYear = rate === 'fast' ? 5 : rate === 'moderate' ? 10 : 15;
    return Math.min(1, yr / maturityYear);
  };

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!selectedPlant) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const data = getPlantData(selectedPlant);
    setPlaced(prev => [...prev, { id: `tp-${Date.now()}`, name: selectedPlant, x, y, key: data.key }]);
    setSelectedPlant(null);
  }, [selectedPlant]);

  // Detect conflicts at current year
  const conflicts = useMemo(() => {
    const issues: { type: 'overcrowding' | 'shade' | 'root' | 'height'; message: string; severity: 'warning' | 'danger' }[] = [];
    if (placed.length < 2) return issues;

    for (let i = 0; i < placed.length; i++) {
      const a = placed[i], aData = getPlantData(a.name);
      const aGF = growthFactor(aData.rate, year);
      const aSpread = aData.maxSpread * aGF;
      const aShade = aData.shade * aGF;

      for (let j = i + 1; j < placed.length; j++) {
        const b = placed[j], bData = getPlantData(b.name);
        const bGF = growthFactor(bData.rate, year);
        const bSpread = bData.maxSpread * bGF;
        const dist = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
        const overlap = (aSpread + bSpread) * 3 - dist;

        if (overlap > 0 && aSpread > 0.3 && bSpread > 0.3) {
          issues.push({ type: 'overcrowding', severity: overlap > 10 ? 'danger' : 'warning',
            message: `By Year ${year}, ${a.name} and ${b.name} will overlap by ~${Math.round(overlap * 3)}cm. Space them ${Math.round((overlap * 3) + 20)}cm further apart.` });
        }
        if (aShade > 1 && bData.type !== 'tree' && dist < aShade * 5) {
          issues.push({ type: 'shade', severity: 'warning',
            message: `By Year ${year}, ${a.name}'s canopy will shade ${b.name}. Consider relocating ${b.name} to a sunnier spot.` });
        }
      }
      if (aData.rootSpread * aGF > 2) {
        issues.push({ type: 'root', severity: 'warning',
          message: `${a.name}'s root system extends ~${(aData.rootSpread * aGF).toFixed(1)}m. Nearby plants may compete for water/nutrients.` });
      }
      if (aData.maxH * aGF > 3 && year >= 5) {
        issues.push({ type: 'height', severity: 'warning',
          message: `${a.name} will reach ~${(aData.maxH * aGF).toFixed(1)}m by Year ${year}. Check for view obstructions.` });
      }
    }
    return issues.slice(0, 6);
  }, [placed, year]);

  const getAISuggestions = useCallback(async () => {
    if (placed.length === 0) return;
    setAiLoading(true);
    try {
      const plantList = placed.map(p => {
        const d = getPlantData(p.name);
        return `${p.name} (${d.type}, max ${d.maxH}m tall, ${d.maxSpread}m spread, ${d.rate} grower)`;
      }).join(', ');
      const conflictText = conflicts.map(c => c.message).join('; ');
      const prompt = `You are a landscape designer analyzing a time-lapse garden simulation.
Plants: ${plantList}
Current simulation year: ${year}
Detected issues: ${conflictText || 'None'}
Location: ${location?.name || 'Unknown'}

Provide:
1. 🏗️ 2 design improvement suggestions to optimize this layout
2. 🌳 Which plants will conflict at maturity and how to prevent issues
3. 🌿 1 additional plant suggestion that would complement this layout
4. 📐 Any spacing changes recommended

Keep under 200 words. Be practical and specific.`;
      setAiSuggestions(await getGardenInsights(prompt));
    } catch (err) { if (err instanceof QuotaExceededError) { onQuotaError?.(err.message); } setAiSuggestions('Unable to generate suggestions. Try again.'); }
    finally { setAiLoading(false); }
  }, [placed, conflicts, year, location]);

  const renderPlant = (p: CanvasPlant) => {
    const data = getPlantData(p.name);
    const gf = growthFactor(data.rate, year);
    const isDecidWinter = data.deciduous && season === 'winter';
    const color = isDecidWinter ? SEASON_COLORS.winter : SEASON_COLORS[season];

    if (viewMode === 'top') {
      const size = Math.max(10, data.maxSpread * gf * 22);
      const shadeSize = data.shade * gf * 18;
      return (
        <div key={p.id} className="absolute group" style={{ left: `${p.x}%`, top: `${p.y}%`, transform: 'translate(-50%, -50%)' }}>
          {shadeSize > 5 && <div className="absolute rounded-full bg-black/5 dark:bg-black/15 -z-10" style={{ width: shadeSize * 2, height: shadeSize * 2, left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }} />}
          <div className="rounded-full border-2 border-emerald-800/30 transition-all duration-700 flex items-center justify-center"
            style={{ width: size, height: size, backgroundColor: color, opacity: gf < 0.1 ? 0.4 : 0.8 }}>
            {size > 20 && <span className="text-[8px] text-white font-bold drop-shadow-sm">{p.name.slice(0, 3)}</span>}
          </div>
          <div className="absolute -top-5 left-1/2 -translate-x-1/2 hidden group-hover:block bg-slate-800 text-white text-[8px] px-2 py-0.5 rounded whitespace-nowrap z-20">
            {p.name} · {(data.maxH * gf).toFixed(1)}m H · {(data.maxSpread * gf).toFixed(1)}m W
            <button onClick={(e) => { e.stopPropagation(); setPlaced(prev => prev.filter(x => x.id !== p.id)); }} className="ml-1 text-red-300">✕</button>
          </div>
        </div>
      );
    }

    // Side view
    const height = Math.max(8, data.maxH * gf * 18);
    const width = Math.max(8, data.maxSpread * gf * 16);
    return (
      <div key={p.id} className="absolute group" style={{ left: `${p.x}%`, bottom: '10%', transform: 'translateX(-50%)' }}>
        <div className="flex flex-col items-center">
          <div className="rounded-t-full transition-all duration-700" style={{ width, height: height * 0.7, backgroundColor: color, opacity: isDecidWinter ? 0.3 : 0.8 }} />
          {data.type === 'tree' && <div className="bg-amber-800 rounded-sm" style={{ width: Math.max(3, width * 0.15), height: height * 0.3 }} />}
        </div>
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 hidden group-hover:block bg-slate-800 text-white text-[8px] px-2 py-0.5 rounded whitespace-nowrap z-20">
          {p.name} · {(data.maxH * gf).toFixed(1)}m
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2"><span>⏳</span> Time-Lapse Growth Simulator</h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">See how your garden evolves over decades</p>
        </div>
        <Button onClick={onBack} variant="outline" size="sm">← Back</Button>
      </div>

      {/* Plant Palette */}
      <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">🌱 Place Plants on Canvas</h3>
        <div className="flex flex-wrap gap-1.5">
          {(gardenPlants.length > 0 ? gardenPlants.map(p => p.commonName) : Object.keys(GROWTH_DB).slice(0, 10).map(n => n.charAt(0).toUpperCase() + n.slice(1))).map(name => (
            <button key={name} onClick={() => setSelectedPlant(name)}
              className={`text-[10px] px-2.5 py-1.5 rounded-lg border transition-all ${selectedPlant === name ? 'bg-emerald-500 text-white border-emerald-500' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'}`}>
              {name}
            </button>
          ))}
        </div>
        {selectedPlant && <p className="text-[10px] text-emerald-500 mt-2 animate-pulse">👆 Tap the canvas to place <strong>{selectedPlant}</strong></p>}
      </div>

      {/* View Toggle */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-700/30 rounded-lg p-1">
        {([['top', '🔭 Top-Down'], ['side', '👁️ Side View']] as [typeof viewMode, string][]).map(([id, label]) => (
          <button key={id} onClick={() => setViewMode(id)}
            className={`flex-1 text-xs py-2 rounded-md transition-all ${viewMode === id ? 'bg-white dark:bg-slate-800 shadow-sm font-semibold text-slate-700 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Canvas */}
      <div className={`relative rounded-xl overflow-hidden border-2 ${selectedPlant ? 'border-emerald-400 cursor-crosshair' : 'border-slate-200 dark:border-slate-700'} shadow-lg`}
        style={{ height: 300, background: viewMode === 'top' ? 'linear-gradient(135deg, #d1fae5, #a7f3d0, #6ee7b7)' : 'linear-gradient(180deg, #7dd3fc 0%, #38bdf8 30%, #86efac 65%, #166534 100%)' }}
        onClick={handleCanvasClick}>
        {/* Grid */}
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: viewMode === 'top' ? 'radial-gradient(circle, #000 1px, transparent 1px)' : 'linear-gradient(to right, #000 1px, transparent 1px)', backgroundSize: viewMode === 'top' ? '30px 30px' : '30px 30px' }} />
        {placed.map(p => renderPlant(p))}
        {placed.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-emerald-800/50 dark:text-white/40 bg-white/30 px-4 py-2 rounded-lg">
              {selectedPlant ? `Tap to place ${selectedPlant}` : 'Select a plant, then tap here'}
            </p>
          </div>
        )}
        {/* Year label */}
        <div className="absolute top-3 right-3 bg-black/40 text-white text-sm px-3 py-1 rounded-full backdrop-blur-sm font-bold">
          Year {year}
        </div>
      </div>

      {/* Time Slider */}
      <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">⏳ Time Slider</h3>
          <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold">Year {year}</span>
        </div>
        <input type="range" min={0} max={5} value={yearIdx} onChange={e => setYearIdx(Number(e.target.value))}
          className="w-full accent-emerald-500 h-2" />
        <div className="flex justify-between text-[9px] text-slate-400 mt-1">{YEAR_LABELS.map(y => <span key={y}>Yr {y}</span>)}</div>
      </div>

      {/* Season Toggle */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-700/30 rounded-lg p-1">
        {(Object.keys(SEASON_COLORS) as Season[]).map(s => (
          <button key={s} onClick={() => setSeason(s)}
            className={`flex-1 text-xs py-2 rounded-md transition-all capitalize ${season === s ? 'bg-white dark:bg-slate-800 shadow-sm font-semibold text-slate-700 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>
            {s === 'spring' ? '🌸' : s === 'summer' ? '☀️' : s === 'autumn' ? '🍂' : '❄️'} {s}
          </button>
        ))}
      </div>

      {/* Conflict Alerts */}
      {conflicts.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/10 rounded-xl p-4 border border-amber-200 dark:border-amber-800 shadow-sm">
          <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-400 mb-2">⚠️ Conflict Alerts — Year {year}</h3>
          <div className="space-y-1">
            {conflicts.map((c, i) => (
              <div key={i} className={`flex items-start gap-1.5 text-[10px] p-1.5 rounded-lg ${c.severity === 'danger' ? 'bg-red-50 dark:bg-red-900/10 text-red-700 dark:text-red-400' : 'text-slate-600 dark:text-slate-300'}`}>
                <span>{c.type === 'overcrowding' ? '🌿' : c.type === 'shade' ? '☁️' : c.type === 'root' ? '🌱' : '📏'}</span>
                <span>{c.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats & Actions */}
      {placed.length > 0 && (
        <div className="flex gap-2">
          <button onClick={getAISuggestions} disabled={aiLoading}
            className="flex-1 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold disabled:opacity-50 transition-colors">
            {aiLoading ? '⏳ Analyzing...' : '🤖 AI Design Suggestions'}
          </button>
          <button onClick={() => setPlaced([])}
            className="px-4 py-2 rounded-lg border border-red-200 dark:border-red-800 text-red-500 text-xs hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors">
            🗑️ Clear
          </button>
        </div>
      )}

      {/* AI Suggestions */}
      {aiSuggestions && (
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-xl p-4 border border-indigo-200 dark:border-indigo-800 shadow-sm">
          <h3 className="text-sm font-semibold text-indigo-700 dark:text-indigo-400 mb-2">🤖 AI Design Suggestions</h3>
          <div className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-line leading-relaxed">{aiSuggestions}</div>
        </div>
      )}
    </div>
  );
};
