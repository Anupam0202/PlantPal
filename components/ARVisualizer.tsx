import React, { useState, useMemo, useCallback } from 'react';
import { Button } from './common/Button';
import { getGardenPlants } from '../services/gardenService';
import { getGardenInsights, QuotaExceededError } from '../services/geminiService';
import type { LocationData } from '../types';

// Plant size data for AR simulation (height in meters, spread in meters)
const PLANT_SIZES: Record<string, { heights: [number, number, number, number, number]; spread: number; type: 'tree' | 'shrub' | 'herb' | 'flower' | 'climber'; deciduous: boolean }> = {
  neem: { heights: [0.3, 1.5, 4, 8, 15], spread: 10, type: 'tree', deciduous: false },
  mango: { heights: [0.4, 2, 5, 8, 12], spread: 8, type: 'tree', deciduous: false },
  tulsi: { heights: [0.1, 0.3, 0.5, 0.6, 0.7], spread: 0.4, type: 'herb', deciduous: false },
  rose: { heights: [0.2, 0.5, 0.8, 1.0, 1.2], spread: 0.8, type: 'shrub', deciduous: true },
  tomato: { heights: [0.1, 0.6, 1.2, 1.5, 1.5], spread: 0.6, type: 'herb', deciduous: true },
  sunflower: { heights: [0.1, 1.0, 2.0, 2.5, 3.0], spread: 0.5, type: 'flower', deciduous: true },
  lavender: { heights: [0.1, 0.3, 0.5, 0.6, 0.7], spread: 0.6, type: 'shrub', deciduous: false },
  jasmine: { heights: [0.2, 0.8, 2.0, 3.0, 4.0], spread: 2, type: 'climber', deciduous: false },
  bamboo: { heights: [0.3, 2, 6, 10, 15], spread: 3, type: 'tree', deciduous: false },
  fern: { heights: [0.1, 0.3, 0.5, 0.7, 0.8], spread: 0.6, type: 'herb', deciduous: false },
  hibiscus: { heights: [0.2, 0.6, 1.5, 2.5, 3.5], spread: 2, type: 'shrub', deciduous: true },
  basil: { heights: [0.05, 0.2, 0.4, 0.5, 0.6], spread: 0.3, type: 'herb', deciduous: true },
  mint: { heights: [0.05, 0.15, 0.3, 0.4, 0.5], spread: 0.5, type: 'herb', deciduous: true },
  guava: { heights: [0.3, 1.5, 3, 5, 8], spread: 5, type: 'tree', deciduous: false },
  bougainvillea: { heights: [0.3, 1.5, 3, 5, 8], spread: 4, type: 'climber', deciduous: true },
};

const GROWTH_LABELS = ['Just Planted', '1 Year', '3 Years', '5 Years', 'Full Maturity'];
const SEASON_CONFIG = {
  spring: { label: '🌸 Spring', color: 'text-pink-600 dark:text-pink-400', foliage: 'bg-green-300', bloom: true },
  summer: { label: '☀️ Summer', color: 'text-amber-600 dark:text-amber-400', foliage: 'bg-green-500', bloom: true },
  autumn: { label: '🍂 Autumn', color: 'text-orange-600 dark:text-orange-400', foliage: 'bg-amber-500', bloom: false },
  winter: { label: '❄️ Winter', color: 'text-blue-600 dark:text-blue-400', foliage: 'bg-slate-400', bloom: false },
};
type Season = keyof typeof SEASON_CONFIG;

interface PlacedPlant { id: string; name: string; key: string; x: number; y: number; }

interface Props { onBack: () => void; location: LocationData | null; onQuotaError?: (msg?: string) => void; }

export const ARVisualizer: React.FC<Props> = ({ onBack, location, onQuotaError }) => {
  const gardenPlants = useMemo(() => getGardenPlants().filter(p => p.status === 'active'), []);
  const [growthStage, setGrowthStage] = useState(0);
  const [season, setSeason] = useState<Season>('summer');
  const [placed, setPlaced] = useState<PlacedPlant[]>([]);
  const [selectedPlant, setSelectedPlant] = useState<string | null>(null);
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [screenshotMode, setScreenshotMode] = useState(false);

  const getPlantData = (name: string) => {
    const nm = name.toLowerCase();
    const key = Object.keys(PLANT_SIZES).find(k => nm.includes(k));
    return key ? { key, ...PLANT_SIZES[key] } : { key: 'default', heights: [0.2, 0.5, 1.0, 1.5, 2.0] as [number, number, number, number, number], spread: 1, type: 'shrub' as const, deciduous: false };
  };

  const handlePlaceOnCanvas = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!selectedPlant) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const data = getPlantData(selectedPlant);
    setPlaced(prev => [...prev, { id: `p-${Date.now()}`, name: selectedPlant, key: data.key, x, y }]);
    setSelectedPlant(null);
  }, [selectedPlant]);

  const removePlant = useCallback((id: string) => {
    setPlaced(prev => prev.filter(p => p.id !== id));
  }, []);

  // Check for spacing conflicts
  const conflicts = useMemo(() => {
    const issues: string[] = [];
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i], b = placed[j];
        const dist = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
        const aData = getPlantData(a.name), bData = getPlantData(b.name);
        const minSpread = (aData.spread + bData.spread) * 2;
        if (dist < minSpread) {
          issues.push(`⚠️ ${a.name} and ${b.name} are too close (need ~${Math.round(minSpread * 10)}cm spacing for mature growth)`);
        }
        if (growthStage >= 3 && aData.type === 'tree' && bData.type !== 'tree') {
          const treeH = aData.heights[growthStage];
          if (treeH > 5) issues.push(`🌿 By ${GROWTH_LABELS[growthStage]}, ${a.name} (${treeH}m) will shade ${b.name}. Consider shade-tolerant alternatives.`);
        }
      }
    }
    // Height warnings
    for (const p of placed) {
      const data = getPlantData(p.name);
      const h = data.heights[growthStage];
      if (h > 3) issues.push(`📏 ${p.name} will reach ~${h}m at ${GROWTH_LABELS[growthStage]}. Ensure enough vertical clearance.`);
    }
    return issues;
  }, [placed, growthStage]);

  const getAIFeedback = useCallback(async () => {
    if (placed.length === 0) return;
    setAiLoading(true);
    try {
      const plantList = placed.map(p => {
        const d = getPlantData(p.name);
        return `${p.name} (${d.type}, mature height ${d.heights[4]}m, spread ${d.spread}m)`;
      }).join(', ');
      const prompt = `You are a landscape architect reviewing a garden AR layout.
Plants placed: ${plantList}
Location: ${location?.name || 'Unknown'}
Growth stage viewed: ${GROWTH_LABELS[growthStage]}, Season: ${season}

Provide:
1. 🏗️ Design compatibility analysis (spacing, sun requirements, aesthetics)
2. ⚠️ Any potential issues at ${GROWTH_LABELS[growthStage]} (shade conflicts, root competition, overcrowding)
3. 💡 2 suggestions to improve this layout
4. 📐 Recommended minimum spacing adjustments if any plants are too close

Keep response under 200 words. Use emojis.`;
      setAiFeedback(await getGardenInsights(prompt));
    } catch (err) { if (err instanceof QuotaExceededError) { onQuotaError?.(err.message); } setAiFeedback('Unable to analyze layout. Try again.'); }
    finally { setAiLoading(false); }
  }, [placed, growthStage, season, location]);

  const renderPlantVisual = (p: PlacedPlant) => {
    const data = getPlantData(p.name);
    const h = data.heights[growthStage];
    const baseSize = Math.max(20, Math.min(80, h * 15));
    const seasonCfg = SEASON_CONFIG[season];
    const isDeciduousWinter = data.deciduous && season === 'winter';
    const showBloom = seasonCfg.bloom && (data.type === 'flower' || data.type === 'shrub');

    return (
      <div key={p.id} className="absolute group cursor-pointer" style={{ left: `${p.x}%`, top: `${p.y}%`, transform: 'translate(-50%, -100%)' }}>
        {/* Plant visual */}
        <div className="flex flex-col items-center" style={{ width: baseSize, height: baseSize * 1.3 }}>
          {/* Canopy */}
          <div className={`rounded-full transition-all duration-500 ${isDeciduousWinter ? 'bg-slate-300 dark:bg-slate-600 opacity-40' : seasonCfg.foliage}`}
            style={{ width: baseSize, height: baseSize * 0.8, position: 'relative' }}>
            {showBloom && <div className="absolute top-1 right-1 w-2 h-2 bg-pink-400 rounded-full animate-pulse" />}
            {showBloom && <div className="absolute bottom-2 left-1 w-1.5 h-1.5 bg-yellow-400 rounded-full" />}
          </div>
          {/* Trunk */}
          {data.type === 'tree' && <div className="w-1.5 bg-amber-800 dark:bg-amber-700 rounded-sm" style={{ height: baseSize * 0.4 }} />}
        </div>
        {/* Shadow */}
        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-black/10 dark:bg-black/20 rounded-full" style={{ width: baseSize * 0.8, height: 4 }} />
        {/* Hover info */}
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 hidden group-hover:block bg-slate-800 text-white text-[9px] px-2 py-1 rounded whitespace-nowrap z-10">
          {p.name} · {h}m · {data.type}
          <button onClick={(e) => { e.stopPropagation(); removePlant(p.id); }} className="ml-1 text-red-300">✕</button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2"><span>🔮</span> AR Garden Visualizer</h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">Visualize plants in your space before planting</p>
        </div>
        <Button onClick={onBack} variant="outline" size="sm">← Back</Button>
      </div>

      {/* Plant Selector */}
      {!screenshotMode && (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">🌱 Select a Plant to Place</h3>
          <div className="flex flex-wrap gap-1.5">
            {gardenPlants.length > 0 ? gardenPlants.map(p => (
              <button key={p.id} onClick={() => setSelectedPlant(p.commonName)}
                className={`text-[10px] px-2.5 py-1.5 rounded-lg border transition-all ${selectedPlant === p.commonName ? 'bg-emerald-500 text-white border-emerald-500' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'}`}>
                {p.commonName}
              </button>
            )) : Object.keys(PLANT_SIZES).slice(0, 10).map(name => (
              <button key={name} onClick={() => setSelectedPlant(name.charAt(0).toUpperCase() + name.slice(1))}
                className={`text-[10px] px-2.5 py-1.5 rounded-lg border transition-all capitalize ${selectedPlant?.toLowerCase() === name ? 'bg-emerald-500 text-white border-emerald-500' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'}`}>
                {name}
              </button>
            ))}
          </div>
          {selectedPlant && <p className="text-[10px] text-emerald-500 mt-2 animate-pulse">👆 Click on the canvas below to place <strong>{selectedPlant}</strong></p>}
        </div>
      )}

      {/* AR Canvas */}
      <div className={`relative rounded-xl overflow-hidden border-2 ${selectedPlant ? 'border-emerald-400 dark:border-emerald-600 cursor-crosshair' : 'border-slate-200 dark:border-slate-700'} shadow-lg`}
        style={{ height: 320, background: season === 'winter' ? 'linear-gradient(180deg, #e2e8f0 0%, #f1f5f9 40%, #d1fae5 80%, #6b8e6b 100%)' : season === 'autumn' ? 'linear-gradient(180deg, #fef3c7 0%, #fde68a 30%, #d97706 60%, #92400e 100%)' : season === 'spring' ? 'linear-gradient(180deg, #dbeafe 0%, #bfdbfe 30%, #86efac 70%, #166534 100%)' : 'linear-gradient(180deg, #7dd3fc 0%, #38bdf8 20%, #86efac 65%, #166534 100%)' }}
        onClick={handlePlaceOnCanvas}>
        {/* Grid overlay */}
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'linear-gradient(to right, #000 1px, transparent 1px), linear-gradient(to bottom, #000 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
        {/* Ground plane */}
        <div className="absolute bottom-0 left-0 right-0 h-[40%] bg-gradient-to-t from-emerald-900/30 to-transparent" />
        {/* Placed plants */}
        {placed.map(p => renderPlantVisual(p))}
        {/* Empty state */}
        {placed.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-white/70 bg-black/20 px-4 py-2 rounded-lg backdrop-blur-sm">
              {selectedPlant ? `Tap to place ${selectedPlant}` : 'Select a plant above, then tap here to place it'}
            </p>
          </div>
        )}
        {/* Screenshot badge */}
        {screenshotMode && (
          <div className="absolute top-3 left-3 bg-black/50 text-white text-[10px] px-3 py-1 rounded-full backdrop-blur-sm">
            📸 Screenshot Mode — Right-click to save image
          </div>
        )}
      </div>

      {/* Controls Row */}
      {!screenshotMode && (
        <div className="space-y-3">
          {/* Time Slider */}
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">⏳ Growth Timeline</h3>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">{GROWTH_LABELS[growthStage]}</span>
            </div>
            <input type="range" min={0} max={4} value={growthStage} onChange={e => setGrowthStage(Number(e.target.value))}
              className="w-full accent-emerald-500 h-2" />
            <div className="flex justify-between text-[9px] text-slate-400 mt-1">{GROWTH_LABELS.map(l => <span key={l}>{l}</span>)}</div>
          </div>

          {/* Season Toggle */}
          <div className="flex gap-1 bg-slate-100 dark:bg-slate-700/30 rounded-lg p-1">
            {(Object.keys(SEASON_CONFIG) as Season[]).map(s => (
              <button key={s} onClick={() => setSeason(s)}
                className={`flex-1 text-xs py-2 rounded-md transition-all ${season === s ? 'bg-white dark:bg-slate-800 shadow-sm font-semibold text-slate-700 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}>
                {SEASON_CONFIG[s].label}
              </button>
            ))}
          </div>

          {/* Stats */}
          {placed.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-center">
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{placed.length}</p>
                <p className="text-[9px] text-slate-500">Plants Placed</p>
              </div>
              <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-center">
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{Math.max(...placed.map(p => getPlantData(p.name).heights[growthStage])).toFixed(1)}m</p>
                <p className="text-[9px] text-slate-500">Tallest Plant</p>
              </div>
              <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-center">
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{conflicts.length}</p>
                <p className="text-[9px] text-slate-500">Alerts</p>
              </div>
            </div>
          )}

          {/* Conflict Alerts */}
          {conflicts.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/10 rounded-xl p-3 border border-amber-200 dark:border-amber-800">
              <h3 className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1.5">🔔 Design Alerts</h3>
              {conflicts.map((c, i) => <p key={i} className="text-[10px] text-slate-600 dark:text-slate-300 mb-0.5">{c}</p>)}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2">
            {placed.length > 0 && (
              <>
                <button onClick={getAIFeedback} disabled={aiLoading}
                  className="flex-1 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold disabled:opacity-50 transition-colors">
                  {aiLoading ? '⏳ Analyzing...' : '🤖 AI Design Review'}
                </button>
                <button onClick={() => setScreenshotMode(true)}
                  className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold hover:bg-slate-200 transition-colors">
                  📸 Screenshot
                </button>
                <button onClick={() => setPlaced([])}
                  className="px-3 py-2 rounded-lg border border-red-200 dark:border-red-800 text-red-500 text-xs hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors">
                  🗑️
                </button>
              </>
            )}
          </div>

          {/* AI Feedback */}
          {aiFeedback && (
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-xl p-4 border border-indigo-200 dark:border-indigo-800 shadow-sm">
              <h3 className="text-sm font-semibold text-indigo-700 dark:text-indigo-400 mb-2">🤖 AI Design Review</h3>
              <div className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-line leading-relaxed">{aiFeedback}</div>
            </div>
          )}
        </div>
      )}

      {/* Screenshot mode overlay */}
      {screenshotMode && (
        <button onClick={() => setScreenshotMode(false)}
          className="w-full py-3 rounded-xl bg-slate-800 text-white text-sm font-semibold hover:bg-slate-700 transition-colors">
          ✅ Exit Screenshot Mode
        </button>
      )}
    </div>
  );
};
