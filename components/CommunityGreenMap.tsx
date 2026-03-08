import React, { useState, useMemo, useCallback } from 'react';
import { Button } from './common/Button';
import { getGardenPlants } from '../services/gardenService';
import type { LocationData } from '../types';

// Storage keys
const MAP_KEY = 'plantpal-community-map';
const readMap = (): CommunityPin[] => { try { return JSON.parse(localStorage.getItem(MAP_KEY) || '[]'); } catch { return []; } };
const writeMap = (pins: CommunityPin[]) => { try { localStorage.setItem(MAP_KEY, JSON.stringify(pins)); } catch {} };

interface CommunityPin {
  id: string; area: string; plants: string[]; timestamp: string;
  visibility: 'anonymous' | 'neighborhood' | 'public';
  tips?: string; impactCo2?: number;
}

// Simulated nearby community data for demo
const DEMO_AREAS = [
  { area: 'Downtown Core', density: 'high', plants: ['Neem', 'Tulsi', 'Rose', 'Jasmine', 'Mango'], users: 24, co2: 145 },
  { area: 'Riverside District', density: 'medium', plants: ['Fern', 'Willow', 'Bamboo', 'Lily'], users: 11, co2: 78 },
  { area: 'University Quarter', density: 'high', plants: ['Sunflower', 'Lavender', 'Rosemary', 'Tomato'], users: 18, co2: 92 },
  { area: 'Industrial Zone', density: 'low', plants: ['Hardy Shrub'], users: 2, co2: 12 },
  { area: 'Old Town', density: 'medium', plants: ['Bougainvillea', 'Hibiscus', 'Curry Leaf'], users: 9, co2: 56 },
  { area: 'Tech Park Area', density: 'low', plants: ['Palm', 'Succulent'], users: 5, co2: 28 },
  { area: 'Garden Colony', density: 'high', plants: ['Mango', 'Guava', 'Banana', 'Papaya', 'Coconut Palm'], users: 31, co2: 210 },
  { area: 'Lake View', density: 'medium', plants: ['Lotus', 'Water Lily', 'Reed', 'Iris'], users: 7, co2: 34 },
];

const DENSITY_CONFIG = {
  high: { color: 'bg-emerald-500', ring: 'ring-emerald-300', text: 'text-emerald-700 dark:text-emerald-400', label: '🟢 High Density' },
  medium: { color: 'bg-amber-500', ring: 'ring-amber-300', text: 'text-amber-700 dark:text-amber-400', label: '🟡 Moderate' },
  low: { color: 'bg-slate-400', ring: 'ring-slate-300', text: 'text-slate-500 dark:text-slate-400', label: '⚪ Opportunity Zone' },
};

interface Props { onBack: () => void; location: LocationData | null; }

export const CommunityGreenMap: React.FC<Props> = ({ onBack, location }) => {
  const plants = useMemo(() => getGardenPlants().filter(p => p.status === 'active'), []);
  const [pins, setPins] = useState<CommunityPin[]>(() => readMap());
  const [selectedArea, setSelectedArea] = useState<typeof DEMO_AREAS[0] | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareVis, setShareVis] = useState<'anonymous' | 'neighborhood' | 'public'>('neighborhood');
  const [tip, setTip] = useState('');
  const [leaderTab, setLeaderTab] = useState<'map' | 'leaderboard' | 'discover'>('map');

  const totalUsers = DEMO_AREAS.reduce((s, a) => s + a.users, 0) + pins.length;
  const totalCo2 = DEMO_AREAS.reduce((s, a) => s + a.co2, 0);
  const sortedAreas = [...DEMO_AREAS].sort((a, b) => b.users - a.users);

  const shareToMap = useCallback(() => {
    if (plants.length === 0) return;
    const pin: CommunityPin = {
      id: `pin-${Date.now()}`, area: location?.name || 'My Area',
      plants: plants.map(p => p.commonName), timestamp: new Date().toISOString(),
      visibility: shareVis, tips: tip || undefined, impactCo2: plants.length * 5,
    };
    const updated = [...pins, pin];
    setPins(updated); writeMap(updated); setSharing(false); setTip('');
  }, [plants, location, shareVis, tip, pins]);

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2"><span>🗺️</span> Community Green Map</h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">See what your neighborhood is planting</p>
        </div>
        <Button onClick={onBack} variant="outline" size="sm">← Back</Button>
      </div>

      {/* Stats Banner */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Active Gardeners', val: totalUsers, icon: '👥' },
          { label: 'CO₂ Sequestered', val: `${totalCo2} kg`, icon: '🌿' },
          { label: 'Neighborhoods', val: DEMO_AREAS.length, icon: '📍' },
        ].map(s => (
          <div key={s.label} className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-center">
            <p className="text-lg">{s.icon}</p>
            <p className="text-base sm:text-lg font-bold text-slate-700 dark:text-slate-200">{s.val}</p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-700/30 rounded-lg p-1">
        {([['map', '🗺️ Map'], ['leaderboard', '🏆 Leaderboard'], ['discover', '🔍 Discover']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setLeaderTab(id)}
            className={`flex-1 text-xs py-2 rounded-md transition-all ${leaderTab === id ? 'bg-white dark:bg-slate-800 shadow-sm font-semibold text-slate-700 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}>
            {label}
          </button>
        ))}
      </div>

      {leaderTab === 'map' && (
        <>
          {/* Interactive Map Grid */}
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">📍 Neighborhood Activity</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {DEMO_AREAS.map(area => {
                const cfg = DENSITY_CONFIG[area.density as keyof typeof DENSITY_CONFIG];
                return (
                  <button key={area.area} onClick={() => setSelectedArea(selectedArea?.area === area.area ? null : area)}
                    className={`p-3 rounded-lg border text-left transition-all hover:shadow-md ${selectedArea?.area === area.area ? `ring-2 ${cfg.ring} border-transparent` : 'border-slate-200 dark:border-slate-700'}`}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className={`w-3 h-3 rounded-full ${cfg.color}`} />
                      <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-200 truncate">{area.area}</span>
                    </div>
                    <p className="text-[9px] text-slate-400">{area.users} gardeners · {area.co2} kg CO₂</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected Area Detail */}
          {selectedArea && (
            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 rounded-xl p-4 border border-emerald-200 dark:border-emerald-800 shadow-sm animate-fade-in">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{selectedArea.area}</h3>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${DENSITY_CONFIG[selectedArea.density as keyof typeof DENSITY_CONFIG].color} text-white`}>
                  {DENSITY_CONFIG[selectedArea.density as keyof typeof DENSITY_CONFIG].label}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mb-2">{selectedArea.users} users · {selectedArea.co2} kg CO₂/year</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">🌿 Popular plants:</p>
              <div className="flex flex-wrap gap-1">
                {selectedArea.plants.map(p => (
                  <span key={p} className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">{p}</span>
                ))}
              </div>
            </div>
          )}

          {/* Share Button */}
          {!sharing ? (
            <button onClick={() => setSharing(true)}
              className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-sm transition-colors shadow-lg shadow-emerald-500/20">
              📤 Share My Garden to Community Map
            </button>
          ) : (
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Share Your Garden</h3>
              <div>
                <label className="text-[10px] text-slate-500 dark:text-slate-400">Privacy Level</label>
                <div className="flex gap-1.5 mt-1">
                  {(['anonymous', 'neighborhood', 'public'] as const).map(v => (
                    <button key={v} onClick={() => setShareVis(v)}
                      className={`flex-1 text-[10px] py-1.5 rounded-lg border transition-all ${shareVis === v ? 'bg-emerald-500 text-white border-emerald-500' : 'border-slate-200 dark:border-slate-700 text-slate-500'}`}>
                      {v === 'anonymous' ? '🔒 Anonymous' : v === 'neighborhood' ? '📍 Area' : '🌐 Public'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 dark:text-slate-400">Local tip (optional)</label>
                <input value={tip} onChange={e => setTip(e.target.value)} placeholder="e.g., Great soil for tomatoes here!"
                  className="mt-1 w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200" />
              </div>
              <p className="text-[10px] text-slate-400">Sharing: {plants.length} plants from your garden</p>
              <div className="flex gap-2">
                <button onClick={shareToMap} disabled={plants.length === 0}
                  className="flex-1 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold disabled:opacity-50 transition-colors">✅ Share</button>
                <button onClick={() => setSharing(false)} className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-500">Cancel</button>
              </div>
            </div>
          )}

          {/* My Shares */}
          {pins.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">📌 My Shared Data</h3>
              {pins.map(pin => (
                <div key={pin.id} className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-50 dark:bg-slate-700/20 mb-1">
                  <div>
                    <span className="text-slate-600 dark:text-slate-300">{pin.area} · {pin.plants.length} plants</span>
                    <span className="text-[10px] text-slate-400 ml-2">{pin.visibility}</span>
                  </div>
                  <button onClick={() => { const u = pins.filter(p => p.id !== pin.id); setPins(u); writeMap(u); }}
                    className="text-red-400 hover:text-red-600 text-[10px]">🗑️ Remove</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {leaderTab === 'leaderboard' && (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">🏆 Neighborhood Leaderboard</h3>
          <div className="space-y-1.5">
            {sortedAreas.map((area, i) => (
              <div key={area.area} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-700/20">
                <span className="text-sm font-bold w-[24px] text-center">
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                </span>
                <span className="text-xs flex-1 font-medium text-slate-700 dark:text-slate-200">{area.area}</span>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">{area.users} gardeners</span>
                <div className="w-16 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(area.users / sortedAreas[0].users) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800">
            <p className="text-xs text-amber-700 dark:text-amber-400 font-semibold">🎯 Monthly Challenge</p>
            <p className="text-[10px] text-slate-600 dark:text-slate-300 mt-0.5">Can {sortedAreas[sortedAreas.length - 1].area} add 10 new plants this month? Help close the gap!</p>
          </div>
        </div>
      )}

      {leaderTab === 'discover' && (
        <div className="space-y-3">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">🌱 What's Thriving Near You</h3>
            <div className="space-y-1.5">
              {[...new Set(DEMO_AREAS.flatMap(a => a.plants))].slice(0, 8).map(plant => (
                <div key={plant} className="flex items-center gap-2 text-xs p-2 rounded-lg bg-emerald-50/50 dark:bg-emerald-900/10">
                  <span className="text-slate-600 dark:text-slate-300">{plant}</span>
                  <span className="text-[10px] text-emerald-500 ml-auto">✅ Thriving locally</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">🌿 Nearby Gardens to Visit</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 italic">No public gardens available yet. Be the first to share yours!</p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">🔄 Local Plant Swaps</h3>
            <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-900/10 border border-purple-200 dark:border-purple-800">
              <p className="text-xs text-purple-700 dark:text-purple-400 font-semibold">Weekend Plant Swap — This Saturday</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Community Garden, 10am-1pm · 8 users signed up</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
