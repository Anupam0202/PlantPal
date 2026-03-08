import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Button } from './common/Button';
import { getGardenPlants } from '../services/gardenService';
import { getGardenInsights, QuotaExceededError } from '../services/geminiService';
import type { LocationData } from '../types';

// Research-based per-plant-type annual impact estimates
const PLANT_DATA: Record<string, { co2Kg: number; o2Kg: number; waterL: number; pm25g: number; category: string }> = {
  tree: { co2Kg: 22, o2Kg: 100, waterL: 3800, pm25g: 65, category: '🌳 Tree' },
  shrub: { co2Kg: 4, o2Kg: 18, waterL: 600, pm25g: 12, category: '🌿 Shrub' },
  herb: { co2Kg: 0.5, o2Kg: 2.5, waterL: 50, pm25g: 1.5, category: '🌱 Herb' },
  flower: { co2Kg: 1.2, o2Kg: 5, waterL: 120, pm25g: 3, category: '🌸 Flower' },
  vegetable: { co2Kg: 0.8, o2Kg: 3, waterL: 80, pm25g: 2, category: '🥬 Vegetable' },
  grass: { co2Kg: 0.3, o2Kg: 1.5, waterL: 40, pm25g: 1, category: '🌾 Grass' },
  vine: { co2Kg: 2, o2Kg: 8, waterL: 200, pm25g: 5, category: '🌿 Vine' },
  default: { co2Kg: 1.5, o2Kg: 6, waterL: 150, pm25g: 3, category: '🪴 Plant' },
};

const TREE_KW = ['tree', 'oak', 'maple', 'pine', 'birch', 'palm', 'cedar', 'willow', 'elm', 'toyon', 'sequoia', 'redwood', 'spruce', 'fir', 'cypress'];
const SHRUB_KW = ['shrub', 'bush', 'hedge', 'lilac', 'boxwood', 'azalea', 'rhododendron', 'holly', 'monkeyflower', 'buckwheat', 'manzanita'];
const HERB_KW = ['herb', 'basil', 'mint', 'rosemary', 'thyme', 'oregano', 'sage', 'parsley', 'cilantro', 'dill', 'chive'];
const FLOWER_KW = ['rose', 'lily', 'daisy', 'sunflower', 'tulip', 'marigold', 'lavender', 'orchid', 'poppy', 'cosmos', 'zinnia', 'aster'];
const VEG_KW = ['tomato', 'pepper', 'bean', 'cucumber', 'lettuce', 'carrot', 'spinach', 'pea', 'squash', 'onion', 'potato', 'kale'];
const GRASS_KW = ['grass', 'fescue', 'ryegrass', 'bermuda'];
const VINE_KW = ['vine', 'ivy', 'jasmine', 'clematis', 'wisteria', 'grape', 'honeysuckle'];

const classifyPlant = (name: string): typeof PLANT_DATA[string] => {
  const n = name.toLowerCase();
  if (TREE_KW.some(k => n.includes(k))) return PLANT_DATA.tree;
  if (SHRUB_KW.some(k => n.includes(k))) return PLANT_DATA.shrub;
  if (HERB_KW.some(k => n.includes(k))) return PLANT_DATA.herb;
  if (FLOWER_KW.some(k => n.includes(k))) return PLANT_DATA.flower;
  if (VEG_KW.some(k => n.includes(k))) return PLANT_DATA.vegetable;
  if (GRASS_KW.some(k => n.includes(k))) return PLANT_DATA.grass;
  if (VINE_KW.some(k => n.includes(k))) return PLANT_DATA.vine;
  return PLANT_DATA.default;
};

// Animated counter hook
const useCounter = (target: number, duration: number = 1200): number => {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (target === 0) { setVal(0); return; }
    let start = 0;
    const step = target / (duration / 16);
    const id = setInterval(() => {
      start += step;
      if (start >= target) { setVal(target); clearInterval(id); }
      else setVal(Math.round(start * 10) / 10);
    }, 16);
    return () => clearInterval(id);
  }, [target, duration]);
  return val;
};

const Ring: React.FC<{ pct: number; color: string; label: string; size?: number }> = ({ pct, color, label, size = 80 }) => {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(1, pct / 100));
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={6} className="text-slate-200 dark:text-slate-700" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={6}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-1000" />
      </svg>
      <span className="text-[10px] text-slate-500 dark:text-slate-400 text-center">{label}</span>
    </div>
  );
};

interface Props { onBack: () => void; location: LocationData | null; onQuotaError?: (msg?: string) => void; envProfile?: import('../types').EnvironmentalProfile | null; }

export const CarbonDashboard: React.FC<Props> = ({ onBack, location, onQuotaError, envProfile }) => {
  const plants = useMemo(() => getGardenPlants().filter(p => p.status === 'active'), []);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const metrics = useMemo(() => {
    let co2 = 0, o2 = 0, water = 0, pm25 = 0;
    const breakdown: { name: string; cat: string; co2: number }[] = [];
    for (const p of plants) {
      const d = classifyPlant(p.commonName);
      co2 += d.co2Kg; o2 += d.o2Kg; water += d.waterL; pm25 += d.pm25g;
      breakdown.push({ name: p.commonName, cat: d.category, co2: d.co2Kg });
    }
    const carsDriven = co2 / 4.6; // ~4600 kg CO2 per car per year → fraction of a car
    const kmAvoided = co2 * 5.6; // ~0.18 kg CO2 per km → km equivalent
    const peopleBreathe = o2 / 365; // ~365 kg O2 per person per year
    const pollinators = Math.min(50, Math.round(plants.length * 3.2));
    const birds = Math.min(25, Math.round(plants.length * 1.5));
    const propValue = plants.length > 0 ? 5 + Math.min(10, plants.length * 0.5) : 0;
    const coolingEffect = plants.filter(p => classifyPlant(p.commonName) === PLANT_DATA.tree).length * 1.5 + plants.length * 0.3;
    return { co2: Math.round(co2 * 10) / 10, o2: Math.round(o2), water: Math.round(water), pm25: Math.round(pm25), kmAvoided: Math.round(kmAvoided), carsDriven: Math.round(carsDriven * 100) / 100, peopleBreathe: Math.round(peopleBreathe * 10) / 10, pollinators, birds, propValue: Math.round(propValue), coolingC: Math.round(coolingEffect * 10) / 10, breakdown, co210yr: Math.round(co2 * 10 * 1.15) };
  }, [plants]);

  const aCo2 = useCounter(metrics.co2);
  const aO2 = useCounter(metrics.o2);
  const aWater = useCounter(metrics.water);
  const aKm = useCounter(metrics.kmAvoided);

  const genInsight = useCallback(async () => {
    setAiLoading(true);
    try {
      const prompt = `You are an environmental scientist. A home gardener has ${plants.length} plants: ${plants.map(p => p.commonName).join(', ')}.
Estimated CO₂ sequestered: ${metrics.co2} kg/year. O₂ produced: ${metrics.o2} kg/year. Rainwater absorbed: ${metrics.water} L/year.
Location: ${location?.name || 'Unknown'}.${envProfile?.airQuality ? `\nLocal air quality: AQI ${envProfile.airQuality.aqi}, PM2.5: ${envProfile.airQuality.pm25} µg/m³, PM10: ${envProfile.airQuality.pm10} µg/m³.` : ''}${envProfile?.historicalClimate ? `\nAvg annual temperature: ${envProfile.historicalClimate.avgAnnualTempC}°C, Avg rainfall: ${envProfile.historicalClimate.avgAnnualRainMm}mm.` : ''}

Provide 3-4 brief insights about:
1. How this garden compares to average urban gardens${envProfile?.airQuality ? ' and how it helps with local air quality' : ''}
2. One specific action to increase environmental impact the most
3. A fun fact about one of their plants' environmental contribution
4. A 10-year cumulative projection

Keep under 200 words. Use emojis.`;
      setAiInsight(await getGardenInsights(prompt));
    } catch (err) { if (err instanceof QuotaExceededError) { onQuotaError?.(err.message); } setAiInsight('Unable to generate insight. Try again later.'); }
    finally { setAiLoading(false); }
  }, [plants, metrics, location]);

  if (plants.length === 0) {
    return (
      <div className="space-y-5 animate-fade-in">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">🌍 Carbon Dashboard</h2>
          <Button onClick={onBack} variant="outline" size="sm">← Back</Button>
        </div>
        <div className="text-center py-12 bg-slate-50 dark:bg-slate-800/50 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600">
          <span className="text-5xl block mb-3">🌱</span>
          <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200">Add plants to see your impact</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Go to Garden → add plants, then come back here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2"><span>🌍</span> Carbon & Impact Dashboard</h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">Your garden's measurable environmental contribution</p>
        </div>
        <Button onClick={onBack} variant="outline" size="sm">← Back</Button>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {[
          { label: 'CO₂ Absorbed', val: `${aCo2} kg`, sub: '/year', icon: '🌿', color: 'from-emerald-500 to-green-600' },
          { label: 'O₂ Produced', val: `${aO2} kg`, sub: '/year', icon: '💨', color: 'from-blue-500 to-cyan-600' },
          { label: 'Rain Absorbed', val: `${aWater} L`, sub: '/year', icon: '💧', color: 'from-sky-500 to-indigo-600' },
          { label: 'Dust Filtered', val: `${metrics.pm25} g`, sub: '/year', icon: '🌫️', color: 'from-purple-500 to-violet-600' },
        ].map(m => (
          <div key={m.label} className="rounded-xl p-3 sm:p-4 text-white bg-gradient-to-br shadow-lg relative overflow-hidden" style={{ backgroundImage: `linear-gradient(135deg, var(--tw-gradient-stops))` }}>
            <div className={`absolute inset-0 bg-gradient-to-br ${m.color} opacity-100`} />
            <div className="relative z-10">
              <p className="text-xl sm:text-2xl mb-0.5">{m.icon}</p>
              <p className="text-lg sm:text-xl font-extrabold tracking-tight">{m.val}</p>
              <p className="text-[10px] opacity-80">{m.sub}</p>
              <p className="text-[10px] sm:text-xs font-medium mt-1 opacity-90">{m.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Equivalence Cards */}
      <div className="bg-white dark:bg-slate-800 rounded-xl p-4 sm:p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">📊 What This Means</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {[
            { icon: '🚗', text: `Driving ${aKm.toFixed(0)} fewer km/year`, sub: `= ${metrics.carsDriven.toFixed(2)} cars off the road` },
            { icon: '🫁', text: `O₂ for ${metrics.peopleBreathe.toFixed(1)} people to breathe`, sub: 'for an entire year' },
            { icon: '🌡️', text: `Cooling effect: ~${metrics.coolingC.toFixed(1)}°C`, sub: 'Reduces summer air temp nearby' },
            { icon: '🏡', text: `Property value +${metrics.propValue}%`, sub: 'Estimated from landscaping research' },
            { icon: '🦋', text: `~${metrics.pollinators} pollinator species supported`, sub: 'Bees, butterflies, moths' },
            { icon: '🐦', text: `~${metrics.birds} bird species attracted`, sub: 'Food, shelter, nesting' },
          ].map((c, i) => (
            <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-700/30 border border-slate-100 dark:border-slate-700">
              <span className="text-lg flex-shrink-0">{c.icon}</span>
              <div><p className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200">{c.text}</p><p className="text-[10px] text-slate-400">{c.sub}</p></div>
            </div>
          ))}
        </div>
      </div>

      {/* Impact Rings */}
      <div className="bg-white dark:bg-slate-800 rounded-xl p-4 sm:p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">🎯 Impact Levels</h3>
        <div className="flex justify-around flex-wrap gap-3">
          <Ring pct={Math.min(100, metrics.co2 / 0.5)} color="#10b981" label="Carbon" />
          <Ring pct={Math.min(100, metrics.o2 / 2)} color="#3b82f6" label="Oxygen" />
          <Ring pct={Math.min(100, metrics.water / 20)} color="#6366f1" label="Water" />
          <Ring pct={Math.min(100, metrics.pollinators * 2)} color="#f59e0b" label="Biodiversity" />
        </div>
      </div>

      {/* 10-Year Projection */}
      <div className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 rounded-xl p-4 sm:p-5 border border-emerald-200 dark:border-emerald-800 shadow-sm">
        <h3 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 mb-2">📈 10-Year Projection</h3>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">Over 10 years, your garden will absorb <strong className="text-emerald-600">{metrics.co210yr} kg</strong> of CO₂ (accounting for plant maturation), produce <strong className="text-blue-600">{Math.round(metrics.o2 * 10)} kg</strong> of oxygen, and absorb <strong className="text-sky-600">{(metrics.water * 10 / 1000).toFixed(1)} m³</strong> of rainwater.</p>
      </div>

      {/* Per-Plant Breakdown */}
      <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">🪴 Per-Plant CO₂ Breakdown</h3>
        <div className="space-y-1.5 max-h-48 overflow-y-auto scrollbar-thin">
          {metrics.breakdown.sort((a, b) => b.co2 - a.co2).map((p, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="text-[10px] text-slate-400 w-[18px] text-right">{i + 1}.</span>
              <span className="text-slate-600 dark:text-slate-300 flex-1 truncate">{p.name}</span>
              <span className="text-[10px] text-slate-400">{p.cat}</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400 w-[50px] text-right">{p.co2} kg</span>
            </div>
          ))}
        </div>
      </div>

      {/* AI Insight */}
      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-xl p-4 sm:p-5 border border-purple-200 dark:border-purple-800 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-purple-700 dark:text-purple-400">✨ AI Environmental Insight</h3>
          <button onClick={genInsight} disabled={aiLoading}
            className="text-xs px-3 py-1.5 rounded-lg bg-purple-500 hover:bg-purple-600 text-white disabled:opacity-50 transition-colors min-h-[32px]">
            {aiLoading ? '⏳ Analyzing...' : aiInsight ? '🔄 Refresh' : '✨ Generate'}
          </button>
        </div>
        {aiInsight ? (
          <div className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">{aiInsight}</div>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400 italic">Get AI-powered analysis of your garden's environmental contribution.</p>
        )}
      </div>
    </div>
  );
};
