import React, { useState, useCallback } from 'react';
import { Button } from './common/Button';
import { getGardenInsights, QuotaExceededError } from '../services/geminiService';
import { ZONE_PRESETS } from '../constants';
import type { MicroClimateZone, ZoneDirection, WindExposure, DrainageSpeed, LocationData, WeatherData } from '../types';

const STORAGE_KEY = 'plantpal-microclimate-zones';
const readZones = (): MicroClimateZone[] => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; } };
const saveZones = (z: MicroClimateZone[]) => localStorage.setItem(STORAGE_KEY, JSON.stringify(z));

const DIR_LABELS: Record<ZoneDirection, string> = { north: '⬆️ North', south: '⬇️ South', east: '➡️ East', west: '⬅️ West', northeast: '↗️ NE', northwest: '↖️ NW', southeast: '↘️ SE', southwest: '↙️ SW' };
const WIND_LABELS: Record<WindExposure, { text: string; icon: string }> = { sheltered: { text: 'Sheltered', icon: '🏠' }, moderate: { text: 'Moderate', icon: '🌬️' }, exposed: { text: 'Exposed', icon: '💨' } };
const DRAIN_LABELS: Record<DrainageSpeed, { text: string; icon: string }> = { collects: { text: 'Water Collects', icon: '🌊' }, normal: { text: 'Normal', icon: '💧' }, fast: { text: 'Drains Fast', icon: '⚡' } };

interface Props { onBack: () => void; location: LocationData | null; weatherData: WeatherData | null; onQuotaError?: (msg?: string) => void; envProfile?: import('../types').EnvironmentalProfile | null; }

export const MicroClimateMapper: React.FC<Props> = ({ onBack, location, weatherData, onQuotaError, envProfile }) => {
  const [zones, setZones] = useState<MicroClimateZone[]>(readZones);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Form state
  const [fName, setFName] = useState('');
  const [fDir, setFDir] = useState<ZoneDirection>('south');
  const [fWind, setFWind] = useState<WindExposure>('moderate');
  const [fStruct, setFStruct] = useState(false);
  const [fDrain, setFDrain] = useState<DrainageSpeed>('normal');
  const [fShade, setFShade] = useState(false);

  const resetForm = useCallback(() => {
    setFName(''); setFDir('south'); setFWind('moderate'); setFStruct(false); setFDrain('normal'); setFShade(false);
    setShowForm(false); setEditing(null);
  }, []);

  const applyPreset = useCallback((preset: typeof ZONE_PRESETS[0]) => {
    setFName(preset.name);
    setFDir(preset.direction);
    setFWind(preset.wind);
    setFStruct(preset.nearStructure);
    setFDrain(preset.drainage);
    setFShade(preset.hasShade);
    setShowForm(true);
  }, []);

  const saveZone = useCallback(() => {
    if (!fName.trim()) return;
    const zone: MicroClimateZone = {
      id: editing || `zone-${Date.now()}`,
      name: fName.trim(),
      direction: fDir,
      wind: fWind,
      nearStructure: fStruct,
      drainage: fDrain,
      hasShade: fShade,
    };
    let updated: MicroClimateZone[];
    if (editing) {
      updated = zones.map((z) => z.id === editing ? zone : z);
    } else {
      updated = [...zones, zone];
    }
    setZones(updated);
    saveZones(updated);
    resetForm();
  }, [fName, fDir, fWind, fStruct, fDrain, fShade, editing, zones, resetForm]);

  const deleteZone = useCallback((id: string) => {
    const updated = zones.filter((z) => z.id !== id);
    setZones(updated);
    saveZones(updated);
    if (expanded === id) setExpanded(null);
  }, [zones, expanded]);

  const editZone = useCallback((zone: MicroClimateZone) => {
    setFName(zone.name);
    setFDir(zone.direction);
    setFWind(zone.wind);
    setFStruct(zone.nearStructure);
    setFDrain(zone.drainage);
    setFShade(zone.hasShade);
    setEditing(zone.id);
    setShowForm(true);
  }, []);

  const analyzeZone = useCallback(async (zone: MicroClimateZone) => {
    setAnalyzing(zone.id);
    try {
      const lat = location?.latitude ?? 40;
      const weatherCtx = weatherData
        ? `Current weather: ${weatherData.current.temperature_2m}°C, ${weatherData.current.relative_humidity_2m}% humidity.`
        : '';
      const sunCtx = envProfile?.sunMoon
        ? `Current daylight: ${envProfile.sunMoon.dayLength}h (sunrise ${envProfile.sunMoon.sunrise}, sunset ${envProfile.sunMoon.sunset}).`
        : '';
      const elevCtx = envProfile?.elevation ? `Elevation: ${envProfile.elevation.elevation}m.` : '';

      const prompt = `You are a professional landscape designer expert in micro-climates. Analyze this property zone and provide specific plant recommendations.

Zone: "${zone.name}"
- Facing: ${zone.direction}
- Wind: ${zone.wind}
- Near building/wall: ${zone.nearStructure ? 'Yes' : 'No'}
- Drainage: ${zone.drainage === 'collects' ? 'Water collects' : zone.drainage === 'fast' ? 'Drains quickly' : 'Normal'}
- Existing shade: ${zone.hasShade ? 'Yes' : 'No'}
- Latitude: ${lat.toFixed(1)}°
${weatherCtx} ${sunCtx} ${elevCtx}

Provide:
1. 🌡️ Micro-climate profile: estimated temperature offset, sun hours by season, key characteristics
2. 🌿 Top 5 plant recommendations specifically suited to THIS zone (with brief reason for each)
3. ⚠️ Plants to AVOID in this zone (and why)
4. 💡 One optimization tip (how to improve this zone for more plant options)

Keep response under 250 words. Be specific to this exact micro-climate combination.`;

      const result = await getGardenInsights(prompt);

      const updated = zones.map((z) => z.id === zone.id ? { ...z, aiAnalysis: result, recommendedPlants: result } : z);
      setZones(updated);
      saveZones(updated);
      setExpanded(zone.id);
    } catch (err) {
      if (err instanceof QuotaExceededError) { onQuotaError?.(err.message); }
      const updated = zones.map((z) => z.id === zone.id ? { ...z, aiAnalysis: 'Unable to analyze. Please try again.' } : z);
      setZones(updated);
    }
    finally { setAnalyzing(null); }
  }, [zones, location, weatherData]);

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2"><span>🏙️</span> Micro-Climate Mapper</h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">Map zones on your property for precision plant placement</p>
        </div>
        <Button onClick={onBack} variant="outline" size="sm">← Back</Button>
      </div>

      {/* Presets */}
      {!showForm && (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">⚡ Quick-Add from Presets</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {ZONE_PRESETS.map((preset, i) => (
              <button key={i} onClick={() => applyPreset(preset)}
                className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-left hover:bg-emerald-50 dark:hover:bg-emerald-900/10 hover:border-emerald-300 dark:hover:border-emerald-700 transition-all text-xs min-h-[44px]">
                <span className="text-base">{preset.icon}</span>
                <p className="font-medium text-slate-700 dark:text-slate-200 mt-0.5 truncate">{preset.name}</p>
              </button>
            ))}
          </div>
          <button onClick={() => setShowForm(true)} className="mt-2 w-full py-2.5 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 text-xs text-slate-500 hover:border-emerald-400 hover:text-emerald-600 transition-colors min-h-[44px]">+ Add Custom Zone</button>
        </div>
      )}

      {/* Zone Form */}
      {showForm && (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 sm:p-5 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm sm:text-base font-semibold text-slate-700 dark:text-slate-200">{editing ? '✏️ Edit Zone' : '➕ New Zone'}</h3>
            <button onClick={resetForm} className="text-xs text-slate-400 hover:text-red-500">✕ Cancel</button>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">Zone Name</label>
            <input value={fName} onChange={(e) => setFName(e.target.value)} placeholder="e.g. Sunny back patio" className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-700 dark:text-slate-200 min-h-[40px]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">Direction Facing</label>
              <select value={fDir} onChange={(e) => setFDir(e.target.value as ZoneDirection)} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-700 dark:text-slate-200 min-h-[40px]">
                {(Object.entries(DIR_LABELS) as [ZoneDirection, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">Wind Exposure</label>
              <select value={fWind} onChange={(e) => setFWind(e.target.value as WindExposure)} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-700 dark:text-slate-200 min-h-[40px]">
                {(Object.entries(WIND_LABELS) as [WindExposure, { text: string; icon: string }][]).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.text}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/30 min-h-[44px]">
              <input type="checkbox" checked={fStruct} onChange={(e) => setFStruct(e.target.checked)} className="w-4 h-4 rounded text-emerald-500" />
              <span className="text-xs text-slate-600 dark:text-slate-300">🧱 Near wall/building</span>
            </label>
            <label className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/30 min-h-[44px]">
              <input type="checkbox" checked={fShade} onChange={(e) => setFShade(e.target.checked)} className="w-4 h-4 rounded text-emerald-500" />
              <span className="text-xs text-slate-600 dark:text-slate-300">🌳 Has existing shade</span>
            </label>
            <div>
              <select value={fDrain} onChange={(e) => setFDrain(e.target.value as DrainageSpeed)} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-xs text-slate-600 dark:text-slate-300 min-h-[44px]">
                {(Object.entries(DRAIN_LABELS) as [DrainageSpeed, { text: string; icon: string }][]).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.text}</option>)}
              </select>
            </div>
          </div>
          <Button onClick={saveZone} variant="primary" size="md" disabled={!fName.trim()}>💾 {editing ? 'Update Zone' : 'Save Zone'}</Button>
        </div>
      )}

      {/* Zone List */}
      {zones.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">📍 Your Zones ({zones.length})</h3>
          {zones.map((zone) => (
            <div key={zone.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
              <div className="p-3 sm:p-4 flex items-center justify-between gap-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                onClick={() => setExpanded(expanded === zone.id ? null : zone.id)}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-lg">{DIR_LABELS[zone.direction].split(' ')[0]}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{zone.name}</p>
                    <div className="flex gap-2 mt-0.5 flex-wrap">
                      <span className="text-[10px] text-slate-400">{WIND_LABELS[zone.wind].icon} {WIND_LABELS[zone.wind].text}</span>
                      {zone.nearStructure && <span className="text-[10px] text-slate-400">🧱 Structure</span>}
                      {zone.hasShade && <span className="text-[10px] text-slate-400">🌳 Shade</span>}
                      <span className="text-[10px] text-slate-400">{DRAIN_LABELS[zone.drainage].icon} {DRAIN_LABELS[zone.drainage].text}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={(e) => { e.stopPropagation(); analyzeZone(zone); }} disabled={analyzing === zone.id}
                    className="text-[10px] px-2 py-1 rounded-md bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-200 transition-colors min-h-[28px]">
                    {analyzing === zone.id ? '⏳' : zone.aiAnalysis ? '🔄' : '✨'} Analyze
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); editZone(zone); }} className="text-[10px] px-2 py-1 rounded-md bg-blue-100 dark:bg-blue-900/30 text-blue-600 hover:bg-blue-200 transition-colors min-h-[28px]">✏️</button>
                  <button onClick={(e) => { e.stopPropagation(); deleteZone(zone.id); }} className="text-[10px] px-2 py-1 rounded-md bg-red-100 dark:bg-red-900/30 text-red-600 hover:bg-red-200 transition-colors min-h-[28px]">🗑️</button>
                </div>
              </div>
              {expanded === zone.id && zone.aiAnalysis && (
                <div className="px-3 sm:px-4 pb-4 pt-0 border-t border-slate-100 dark:border-slate-700">
                  <div className="mt-3 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">{zone.aiAnalysis}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {zones.length === 0 && !showForm && (
        <div className="text-center py-8 bg-slate-50 dark:bg-slate-800/50 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600">
          <span className="text-4xl block mb-3">🏡</span>
          <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200">No zones yet</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">Use the presets above or add a custom zone to map the micro-climates on your property.</p>
        </div>
      )}
    </div>
  );
};
