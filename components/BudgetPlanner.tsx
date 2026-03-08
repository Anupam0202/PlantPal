import React, { useState, useMemo } from 'react';
import { Button } from './common/Button';
import { getGardenPlants } from '../services/gardenService';
import type { LocationData } from '../types';

// Cost database per plant category (in local currency units)
const PLANT_COSTS: Record<string, { seedling: number; mature: number; seeds: number; soilPerSqm: number; waterPerYear: number; fertPerYear: number }> = {
  tree: { seedling: 250, mature: 2500, seeds: 50, soilPerSqm: 200, waterPerYear: 800, fertPerYear: 300 },
  shrub: { seedling: 150, mature: 1200, seeds: 30, soilPerSqm: 150, waterPerYear: 400, fertPerYear: 200 },
  herb: { seedling: 50, mature: 200, seeds: 15, soilPerSqm: 100, waterPerYear: 200, fertPerYear: 100 },
  flower: { seedling: 80, mature: 400, seeds: 20, soilPerSqm: 120, waterPerYear: 300, fertPerYear: 150 },
  vegetable: { seedling: 40, mature: 150, seeds: 10, soilPerSqm: 180, waterPerYear: 500, fertPerYear: 250 },
};

// Edible yield values (kg/plant/year, value per kg)
const YIELD_DATA: Record<string, { yield: number; valuePerKg: number }> = {
  tomato: { yield: 5, valuePerKg: 60 }, pepper: { yield: 3, valuePerKg: 80 }, basil: { yield: 0.5, valuePerKg: 400 },
  mint: { yield: 0.4, valuePerKg: 300 }, spinach: { yield: 2, valuePerKg: 80 }, lettuce: { yield: 1.5, valuePerKg: 100 },
  cucumber: { yield: 4, valuePerKg: 50 }, bean: { yield: 2, valuePerKg: 90 }, pea: { yield: 1.5, valuePerKg: 120 },
  carrot: { yield: 3, valuePerKg: 60 }, onion: { yield: 4, valuePerKg: 40 }, rosemary: { yield: 0.3, valuePerKg: 500 },
};

const TOOL_KIT = { economy: 500, standard: 1500, premium: 4000 };
const IRRIGATION = { economy: 0, standard: 2000, premium: 8000 };
const CONTAINER_COST = { none: 0, basic: 300, raised: 1500, premium: 3000 };

type Tier = 'economy' | 'standard' | 'premium';
type PlantCategory = keyof typeof PLANT_COSTS;

interface Props { onBack: () => void; location: LocationData | null; }

export const BudgetPlanner: React.FC<Props> = ({ onBack }) => {
  const gardenPlants = useMemo(() => getGardenPlants().filter(p => p.status === 'active'), []);
  const [tier, setTier] = useState<Tier>('standard');
  const [areaSqm, setAreaSqm] = useState(10);
  const [containers, setContainers] = useState<'none' | 'basic' | 'raised' | 'premium'>('none');
  const [years, setYears] = useState(5);

  // Classify plants
  const categorized = useMemo(() => {
    return gardenPlants.map(p => {
      const nm = p.commonName.toLowerCase();
      let cat: PlantCategory = 'shrub';
      if (['neem', 'mango', 'guava', 'bamboo', 'palm', 'coconut', 'fig', 'banyan'].some(t => nm.includes(t))) cat = 'tree';
      else if (['basil', 'mint', 'rosemary', 'tulsi', 'fern', 'thyme', 'oregano', 'parsley'].some(t => nm.includes(t))) cat = 'herb';
      else if (['rose', 'sunflower', 'marigold', 'lavender', 'jasmine', 'lily', 'dahlia'].some(t => nm.includes(t))) cat = 'flower';
      else if (['tomato', 'pepper', 'spinach', 'lettuce', 'cucumber', 'bean', 'pea', 'carrot', 'onion'].some(t => nm.includes(t))) cat = 'vegetable';
      const edibleKey = Object.keys(YIELD_DATA).find(k => nm.includes(k));
      return { plant: p, category: cat, edibleData: edibleKey ? YIELD_DATA[edibleKey] : null };
    });
  }, [gardenPlants]);

  // Cost calculations
  const costs = useMemo(() => {
    const plantCost = categorized.reduce((sum, c) => {
      const cd = PLANT_COSTS[c.category];
      return sum + (tier === 'economy' ? cd.seeds : tier === 'standard' ? cd.seedling : cd.mature);
    }, 0);
    const soilCost = areaSqm * (PLANT_COSTS.shrub.soilPerSqm * (tier === 'economy' ? 0.5 : tier === 'standard' ? 1 : 1.5));
    const toolsCost = TOOL_KIT[tier];
    const irrigCost = IRRIGATION[tier];
    const contCost = CONTAINER_COST[containers] * Math.ceil(areaSqm / 2);
    const startup = plantCost + soilCost + toolsCost + irrigCost + contCost;

    const annualWater = categorized.reduce((s, c) => s + PLANT_COSTS[c.category].waterPerYear, 0) * (tier === 'economy' ? 0.6 : tier === 'standard' ? 1 : 0.8);
    const annualFert = categorized.reduce((s, c) => s + PLANT_COSTS[c.category].fertPerYear, 0) * (tier === 'economy' ? 0.5 : 1);
    const annualReplace = plantCost * 0.1;
    const annualTotal = annualWater + annualFert + annualReplace;

    return { plantCost, soilCost, toolsCost, irrigCost, contCost, startup, annualWater, annualFert, annualReplace, annualTotal };
  }, [categorized, tier, areaSqm, containers]);

  // Returns calculations
  const returns = useMemo(() => {
    const annualFood = categorized.reduce((s, c) => s + (c.edibleData ? c.edibleData.yield * c.edibleData.valuePerKg : 0), 0);
    const hasTrees = categorized.some(c => c.category === 'tree');
    const annualCooling = hasTrees ? 3000 * categorized.filter(c => c.category === 'tree').length * 0.15 : 0;
    const propertyValue = areaSqm > 5 ? areaSqm * 500 : 0;
    const annualStormwater = areaSqm * 20;
    return { annualFood, annualCooling, propertyValue, annualStormwater, annualTotal: annualFood + annualCooling + annualStormwater };
  }, [categorized, areaSqm]);

  // ROI timeline
  const roiTimeline = useMemo(() => {
    const timeline: { year: number; cumCost: number; cumReturn: number; net: number }[] = [];
    for (let y = 0; y <= years; y++) {
      const cumCost = costs.startup + costs.annualTotal * y;
      const cumReturn = returns.annualTotal * y + (y >= 3 ? returns.propertyValue : 0);
      timeline.push({ year: y, cumCost, cumReturn, net: cumReturn - cumCost });
    }
    return timeline;
  }, [costs, returns, years]);

  const breakeven = roiTimeline.find(t => t.net >= 0)?.year;
  const maxCost = Math.max(...roiTimeline.map(t => Math.max(t.cumCost, t.cumReturn)));

  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : Math.round(n).toString();

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2"><span>💰</span> Green Budget Planner</h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">Plan costs & calculate your garden ROI</p>
        </div>
        <Button onClick={onBack} variant="outline" size="sm">← Back</Button>
      </div>

      {/* Configuration */}
      <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">⚙️ Project Setup</h3>
        {/* Budget Tier */}
        <div>
          <label className="text-[10px] text-slate-500 dark:text-slate-400 mb-1 block">Budget Tier</label>
          <div className="flex gap-1.5">
            {(['economy', 'standard', 'premium'] as const).map(t => (
              <button key={t} onClick={() => setTier(t)}
                className={`flex-1 text-xs py-2 rounded-lg border transition-all capitalize ${tier === t ? 'bg-emerald-500 text-white border-emerald-500' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}>
                {t === 'economy' ? '💵 Economy' : t === 'standard' ? '⭐ Standard' : '💎 Premium'}
              </button>
            ))}
          </div>
        </div>
        {/* Area & Containers */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-slate-500 dark:text-slate-400">Area (m²)</label>
            <input type="number" min={1} max={500} value={areaSqm} onChange={e => setAreaSqm(Number(e.target.value))}
              className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200" />
          </div>
          <div>
            <label className="text-[10px] text-slate-500 dark:text-slate-400">Containers</label>
            <select value={containers} onChange={e => setContainers(e.target.value as typeof containers)}
              className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200">
              {[['none', 'None (ground)'], ['basic', 'Basic pots'], ['raised', 'Raised beds'], ['premium', 'Designer planters']].map(([v, l]) =>
                <option key={v} value={v}>{l}</option>
              )}
            </select>
          </div>
        </div>
        <p className="text-[10px] text-slate-400">Based on {categorized.length} plants from your garden</p>
      </div>

      {/* Startup Costs */}
      <div className="bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 rounded-xl p-4 border border-red-200 dark:border-red-800 shadow-sm">
        <h3 className="text-sm font-semibold text-red-700 dark:text-red-400 mb-2">💸 Startup Costs</h3>
        <div className="space-y-1">
          {[
            ['🌱 Plants', costs.plantCost], ['🧱 Soil & Amendments', costs.soilCost],
            ['🔧 Tools', costs.toolsCost], ['💧 Irrigation', costs.irrigCost],
            ['🪴 Containers', costs.contCost],
          ].map(([label, val]) => (
            <div key={label as string} className="flex justify-between text-xs text-slate-600 dark:text-slate-300">
              <span>{label}</span><span className="font-semibold">₹{fmt(val as number)}</span>
            </div>
          ))}
          <div className="border-t border-red-200 dark:border-red-800 pt-1 mt-1 flex justify-between text-sm font-bold text-red-700 dark:text-red-400">
            <span>Total Startup</span><span>₹{fmt(costs.startup)}</span>
          </div>
        </div>
      </div>

      {/* Annual Costs */}
      <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">📅 Annual Ongoing Costs</h3>
        <div className="space-y-1">
          {[['💧 Water', costs.annualWater], ['🧪 Fertilizer', costs.annualFert], ['🔄 Replacements', costs.annualReplace]].map(([l, v]) => (
            <div key={l as string} className="flex justify-between text-xs text-slate-600 dark:text-slate-300">
              <span>{l}</span><span className="font-semibold">₹{fmt(v as number)}/yr</span>
            </div>
          ))}
          <div className="border-t border-slate-200 dark:border-slate-700 pt-1 mt-1 flex justify-between text-xs font-bold text-slate-700 dark:text-slate-200">
            <span>Annual Total</span><span>₹{fmt(costs.annualTotal)}/yr</span>
          </div>
        </div>
      </div>

      {/* Returns */}
      <div className="bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20 rounded-xl p-4 border border-emerald-200 dark:border-emerald-800 shadow-sm">
        <h3 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 mb-2">📈 Annual Returns</h3>
        <div className="space-y-1">
          {[['🥗 Food Value', returns.annualFood], ['❄️ Cooling Savings', returns.annualCooling],
            ['💧 Stormwater Savings', returns.annualStormwater],
          ].map(([l, v]) => (
            <div key={l as string} className="flex justify-between text-xs text-slate-600 dark:text-slate-300">
              <span>{l}</span><span className="font-semibold text-emerald-600">₹{fmt(v as number)}/yr</span>
            </div>
          ))}
          {returns.propertyValue > 0 && (
            <div className="flex justify-between text-xs text-slate-600 dark:text-slate-300">
              <span>🏠 Property Value (one-time, Yr 3+)</span><span className="font-semibold text-emerald-600">₹{fmt(returns.propertyValue)}</span>
            </div>
          )}
          <div className="border-t border-emerald-200 dark:border-emerald-800 pt-1 mt-1 flex justify-between text-xs font-bold text-emerald-700 dark:text-emerald-400">
            <span>Annual Returns</span><span>₹{fmt(returns.annualTotal)}/yr</span>
          </div>
        </div>
      </div>

      {/* ROI Timeline Chart */}
      <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">📊 ROI Timeline</h3>
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-slate-400">Years:</label>
            <input type="range" min={3} max={20} value={years} onChange={e => setYears(Number(e.target.value))}
              className="w-24 accent-emerald-500 h-1.5" />
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold w-6">{years}</span>
          </div>
        </div>
        <div className="space-y-1">
          {roiTimeline.map(t => (
            <div key={t.year} className="flex items-center gap-2 text-[10px]">
              <span className="w-8 text-slate-400 text-right font-mono">Yr {t.year}</span>
              <div className="flex-1 h-4 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden relative">
                <div className="absolute inset-y-0 left-0 bg-red-400/70 rounded-full transition-all" style={{ width: `${(t.cumCost / maxCost) * 100}%` }} />
                <div className="absolute inset-y-0 left-0 bg-emerald-500/80 rounded-full transition-all" style={{ width: `${(t.cumReturn / maxCost) * 100}%` }} />
              </div>
              <span className={`w-14 text-right font-semibold ${t.net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                {t.net >= 0 ? '+' : ''}₹{fmt(t.net)}
              </span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 mt-2 text-[9px] text-slate-400">
          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-red-400/70 rounded-full" /> Cumulative Cost</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-emerald-500/80 rounded-full" /> Cumulative Return</span>
        </div>
        {breakeven !== undefined && (
          <div className="mt-2 p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800">
            <p className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold">✅ Breakeven at Year {breakeven}! Your garden pays for itself.</p>
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-xl p-4 border border-indigo-200 dark:border-indigo-800 shadow-sm">
        <h3 className="text-sm font-semibold text-indigo-700 dark:text-indigo-400 mb-2">💡 Financial Summary</h3>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2 rounded-lg bg-white/60 dark:bg-slate-800/40">
            <p className="text-[10px] text-slate-400">Total {years}-Year Cost</p>
            <p className="font-bold text-red-600">₹{fmt(costs.startup + costs.annualTotal * years)}</p>
          </div>
          <div className="p-2 rounded-lg bg-white/60 dark:bg-slate-800/40">
            <p className="text-[10px] text-slate-400">Total {years}-Year Return</p>
            <p className="font-bold text-emerald-600">₹{fmt(returns.annualTotal * years + (years >= 3 ? returns.propertyValue : 0))}</p>
          </div>
        </div>
        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-2 italic">
          💡 {tier === 'economy' ? 'Starting from seeds and DIY composting keeps costs minimal but requires patience.' : tier === 'standard' ? 'A balanced approach with young plants and drip irrigation gives reliable results.' : 'Premium setup with mature plants and automated irrigation for instant impact.'}
        </p>
      </div>
    </div>
  );
};
