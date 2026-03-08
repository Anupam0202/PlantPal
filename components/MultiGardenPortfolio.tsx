import React, { useState, useMemo, useCallback } from 'react';
import { Button } from './common/Button';
import { getGardenPlants } from '../services/gardenService';
import type { LocationData } from '../types';

const PORTFOLIO_KEY = 'plantpal-multi-gardens';

interface Garden {
  id: string; name: string; type: 'outdoor' | 'balcony' | 'rooftop' | 'indoor' | 'community';
  location: string; latitude?: number; longitude?: number;
  plantIds: string[]; createdAt: string; notes: string;
}

const readGardens = (): Garden[] => { try { return JSON.parse(localStorage.getItem(PORTFOLIO_KEY) || '[]'); } catch { return []; } };
const writeGardens = (g: Garden[]) => { try { localStorage.setItem(PORTFOLIO_KEY, JSON.stringify(g)); } catch {} };

const TYPE_CONFIG: Record<Garden['type'], { icon: string; label: string; color: string }> = {
  outdoor: { icon: '🏡', label: 'Backyard', color: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' },
  balcony: { icon: '🌺', label: 'Balcony', color: 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400' },
  rooftop: { icon: '🏙️', label: 'Rooftop', color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' },
  indoor: { icon: '🪴', label: 'Indoor', color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' },
  community: { icon: '👥', label: 'Community', color: 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400' },
};

// Simulated per-plant CO2 for aggregate stats
const estimateCo2 = (count: number) => Math.round(count * 5.2 * 10) / 10;

interface Props { onBack: () => void; location: LocationData | null; }

export const MultiGardenPortfolio: React.FC<Props> = ({ onBack, location }) => {
  const allPlants = useMemo(() => getGardenPlants().filter(p => p.status === 'active'), []);
  const [gardens, setGardens] = useState<Garden[]>(() => readGardens());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Omit<Garden, 'id' | 'plantIds' | 'createdAt'>>({ name: '', type: 'outdoor', location: location?.name || '', notes: '' });
  const [assigningTo, setAssigningTo] = useState<string | null>(null);

  const selected = gardens.find(g => g.id === selectedId);

  // Unassigned plants
  const assignedIds = useMemo(() => new Set(gardens.flatMap(g => g.plantIds)), [gardens]);
  const unassigned = allPlants.filter(p => !assignedIds.has(p.id));

  // Aggregate stats
  const totalPlants = gardens.reduce((s, g) => s + g.plantIds.length, 0);
  const totalCo2 = estimateCo2(totalPlants);
  const avgBio = gardens.length > 0 ? Math.round(50 + (totalPlants / gardens.length) * 3) : 0;

  const createGarden = useCallback(() => {
    if (!form.name.trim()) return;
    const garden: Garden = {
      id: `garden-${Date.now()}`, ...form, plantIds: [], createdAt: new Date().toISOString(),
    };
    const updated = [...gardens, garden];
    setGardens(updated); writeGardens(updated);
    setForm({ name: '', type: 'outdoor', location: location?.name || '', notes: '' });
    setCreating(false); setSelectedId(garden.id);
  }, [form, gardens, location]);

  const deleteGarden = useCallback((id: string) => {
    const updated = gardens.filter(g => g.id !== id);
    setGardens(updated); writeGardens(updated);
    if (selectedId === id) setSelectedId(null);
  }, [gardens, selectedId]);

  const assignPlant = useCallback((gardenId: string, plantId: string) => {
    const updated = gardens.map(g => {
      if (g.id === gardenId && !g.plantIds.includes(plantId)) return { ...g, plantIds: [...g.plantIds, plantId] };
      return g;
    });
    setGardens(updated); writeGardens(updated);
  }, [gardens]);

  const removePlant = useCallback((gardenId: string, plantId: string) => {
    const updated = gardens.map(g => {
      if (g.id === gardenId) return { ...g, plantIds: g.plantIds.filter(id => id !== plantId) };
      return g;
    });
    setGardens(updated); writeGardens(updated);
  }, [gardens]);

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2"><span>🗂️</span> Multi-Garden Portfolio</h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">Manage all your growing spaces</p>
        </div>
        <Button onClick={onBack} variant="outline" size="sm">← Back</Button>
      </div>

      {/* Aggregate Stats */}
      {gardens.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {[
            { icon: '🌿', val: gardens.length, label: 'Gardens' },
            { icon: '🪴', val: totalPlants, label: 'Total Plants' },
            { icon: '🌍', val: `${totalCo2} kg`, label: 'CO₂/year' },
            { icon: '🦋', val: avgBio, label: 'Avg Bio Score' },
          ].map(s => (
            <div key={s.label} className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 text-center">
              <p className="text-base">{s.icon}</p>
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{s.val}</p>
              <p className="text-[9px] text-slate-500 dark:text-slate-400">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Alert Summary */}
      {gardens.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/10 rounded-xl p-3 border border-amber-200 dark:border-amber-800">
          <h3 className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">🔔 Quick Status</h3>
          <div className="space-y-0.5">
            {gardens.map(g => {
              const pc = g.plantIds.length;
              return (
                <p key={g.id} className="text-[10px] text-slate-600 dark:text-slate-300">
                  {TYPE_CONFIG[g.type].icon} <strong>{g.name}:</strong> {pc} plants · {estimateCo2(pc)} kg CO₂/yr
                  {pc === 0 && <span className="text-amber-500 ml-1">⚠️ No plants assigned</span>}
                </p>
              );
            })}
          </div>
        </div>
      )}

      {/* Garden Cards */}
      {!selectedId && !creating && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {gardens.map(g => {
              const cfg = TYPE_CONFIG[g.type];
              const pc = g.plantIds.length;
              return (
                <button key={g.id} onClick={() => setSelectedId(g.id)}
                  className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-left hover:shadow-lg transition-all group">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">{cfg.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">{g.name}</p>
                      <p className="text-[10px] text-slate-400">{g.location || 'No location set'}</p>
                    </div>
                    <span className={`text-[9px] px-2 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-slate-500">
                    <span>🪴 {pc} plants</span>
                    <span>🌍 {estimateCo2(pc)} kg CO₂</span>
                    <span className="ml-auto text-emerald-500 group-hover:text-emerald-600">View →</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Unassigned Plants Notice */}
          {unassigned.length > 0 && (
            <div className="bg-blue-50 dark:bg-blue-900/10 rounded-xl p-3 border border-blue-200 dark:border-blue-800">
              <p className="text-xs text-blue-700 dark:text-blue-400">
                <strong>📋 {unassigned.length} unassigned plants</strong> in your main garden. Create a garden and assign them.</p>
            </div>
          )}

          {/* Create Button */}
          <button onClick={() => setCreating(true)}
            className="w-full py-3 rounded-xl border-2 border-dashed border-emerald-300 dark:border-emerald-700 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/10 text-sm font-semibold transition-colors">
            ➕ Create New Garden
          </button>
        </>
      )}

      {/* Create Form */}
      {creating && (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 sm:p-5 border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Create New Garden</h3>
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Garden name (e.g., Backyard Veggie Patch)"
            className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200" />
          <div className="grid grid-cols-5 gap-1">
            {(Object.keys(TYPE_CONFIG) as Garden['type'][]).map(t => (
              <button key={t} onClick={() => setForm({ ...form, type: t })}
                className={`text-center p-2 rounded-lg border text-[10px] transition-all ${form.type === t ? `${TYPE_CONFIG[t].color} border-current` : 'border-slate-200 dark:border-slate-700'}`}>
                <span className="block text-sm">{TYPE_CONFIG[t].icon}</span>{TYPE_CONFIG[t].label}
              </button>
            ))}
          </div>
          <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Location description"
            className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200" />
          <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Notes (optional)" rows={2}
            className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200" />
          <div className="flex gap-2">
            <button onClick={createGarden} disabled={!form.name.trim()}
              className="flex-1 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold disabled:opacity-50 transition-colors">✅ Create Garden</button>
            <button onClick={() => setCreating(false)} className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-500">Cancel</button>
          </div>
        </div>
      )}

      {/* Garden Detail View */}
      {selected && (
        <div className="space-y-3 animate-fade-in">
          <div className="flex items-center gap-2">
            <button onClick={() => { setSelectedId(null); setAssigningTo(null); }} className="text-xs px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-500">← All Gardens</button>
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">{TYPE_CONFIG[selected.type].icon} {selected.name}</h3>
            <button onClick={() => deleteGarden(selected.id)} className="ml-auto text-red-400 text-[10px] hover:text-red-600">🗑️ Delete</button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-center">
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{selected.plantIds.length}</p>
              <p className="text-[9px] text-slate-500">Plants</p>
            </div>
            <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-center">
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{estimateCo2(selected.plantIds.length)} kg</p>
              <p className="text-[9px] text-slate-500">CO₂/year</p>
            </div>
            <div className="p-2.5 rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 text-center">
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{selected.location || '—'}</p>
              <p className="text-[9px] text-slate-500">Location</p>
            </div>
          </div>

          {/* Plants in this garden */}
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">🪴 Plants</h3>
            {selected.plantIds.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-3 text-center">No plants assigned yet.</p>
            ) : (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {selected.plantIds.map(pid => {
                  const plant = allPlants.find(p => p.id === pid);
                  if (!plant) return null;
                  return (
                    <div key={pid} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-700/20 text-xs">
                      <span className="text-slate-700 dark:text-slate-200">{plant.commonName}</span>
                      <button onClick={() => removePlant(selected.id, pid)} className="text-red-400 text-[10px]">✕</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Assign Plants */}
          {assigningTo === selected.id ? (
            <div className="bg-emerald-50 dark:bg-emerald-900/10 rounded-xl p-4 border border-emerald-200 dark:border-emerald-800">
              <h3 className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-2">Select plants to add:</h3>
              {unassigned.length === 0 ? (
                <p className="text-[10px] text-slate-400 italic">All plants are assigned to gardens.</p>
              ) : (
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {unassigned.map(p => (
                    <button key={p.id} onClick={() => assignPlant(selected.id, p.id)}
                      className="w-full flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200 hover:bg-emerald-100 dark:hover:bg-emerald-900/20 transition-colors">
                      <span>{p.commonName}</span><span className="text-emerald-500">+ Add</span>
                    </button>
                  ))}
                </div>
              )}
              <button onClick={() => setAssigningTo(null)} className="mt-2 text-[10px] text-slate-500">Done</button>
            </div>
          ) : (
            <button onClick={() => setAssigningTo(selected.id)}
              className="w-full py-2 rounded-lg border border-dashed border-emerald-300 dark:border-emerald-700 text-emerald-600 dark:text-emerald-400 text-xs font-semibold hover:bg-emerald-50 dark:hover:bg-emerald-900/10 transition-colors">
              ➕ Assign Plants to This Garden
            </button>
          )}

          {/* Cross-Garden Insights */}
          {gardens.length >= 2 && (
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-xl p-4 border border-indigo-200 dark:border-indigo-800 shadow-sm">
              <h3 className="text-sm font-semibold text-indigo-700 dark:text-indigo-400 mb-2">🔍 Cross-Garden Insights</h3>
              <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                {gardens.filter(g => g.id !== selected.id).map(g => {
                  const shared = selected.plantIds.filter(pid => g.plantIds.includes(pid));
                  return (
                    <p key={g.id}>
                      {TYPE_CONFIG[g.type].icon} <strong>{g.name}</strong>: {g.plantIds.length} plants
                      {shared.length > 0 && <span className="text-indigo-500"> · {shared.length} shared species</span>}
                    </p>
                  );
                })}
                <p className="text-[10px] text-slate-400 mt-1 italic">💡 Compare performance of the same plants across different environments to optimize growing conditions.</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
