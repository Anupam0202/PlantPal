import React, { useState, useMemo, useCallback } from 'react';
import { Button } from './common/Button';
import { getGardenPlants } from '../services/gardenService';
import { getGardenInsights, QuotaExceededError } from '../services/geminiService';
import type { LocationData, WeatherData } from '../types';

// Simplified climate trend data (based on global averages; a real app would use historical API data)
const TREND_FACTORS: Record<string, { tempRise: number; rainChange: number; extremeIncrease: number; seasonExtend: number }> = {
  tropical: { tempRise: 1.2, rainChange: 5, extremeIncrease: 20, seasonExtend: 0 },
  subtropical: { tempRise: 1.5, rainChange: -5, extremeIncrease: 25, seasonExtend: 10 },
  temperate: { tempRise: 1.8, rainChange: 3, extremeIncrease: 30, seasonExtend: 18 },
  continental: { tempRise: 2.2, rainChange: -8, extremeIncrease: 35, seasonExtend: 22 },
  polar: { tempRise: 3.0, rainChange: 10, extremeIncrease: 40, seasonExtend: 30 },
};

const getClimateZone = (lat: number): string => {
  const abs = Math.abs(lat);
  if (abs < 23.5) return 'tropical';
  if (abs < 35) return 'subtropical';
  if (abs < 55) return 'temperate';
  if (abs < 66.5) return 'continental';
  return 'polar';
};

// Plant heat/drought tolerance classification
const HEAT_TOLERANT_KW = ['lavender', 'rosemary', 'sage', 'thyme', 'oregano', 'cactus', 'succulent', 'agave', 'olive', 'palm', 'bougainvillea', 'hibiscus', 'pomegranate', 'fig', 'citrus', 'manzanita', 'buckwheat'];
const COLD_DEPENDENT_KW = ['maple', 'birch', 'apple', 'cherry', 'peony', 'tulip', 'crocus', 'daffodil', 'blueberry', 'raspberry', 'lilac', 'hydrangea', 'rhododendron'];
const DROUGHT_TOLERANT_KW = ['lavender', 'rosemary', 'sage', 'thyme', 'cactus', 'succulent', 'agave', 'olive', 'manzanita', 'buckwheat', 'yucca', 'sedum'];
const WATER_DEPENDENT_KW = ['fern', 'moss', 'willow', 'iris', 'hosta', 'hydrangea', 'azalea', 'rhododendron', 'astilbe', 'ligularia'];

type Viability = 'excellent' | 'good' | 'at-risk' | 'high-risk';

const VIABILITY_CONFIG: Record<Viability, { label: string; color: string; bg: string; icon: string }> = {
  'excellent': { label: 'Excellent', color: 'text-emerald-600', bg: 'bg-emerald-100 dark:bg-emerald-900/30', icon: '✅' },
  'good': { label: 'Good', color: 'text-green-600', bg: 'bg-green-100 dark:bg-green-900/30', icon: '👍' },
  'at-risk': { label: 'At Risk', color: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-900/30', icon: '⚠️' },
  'high-risk': { label: 'High Risk', color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-900/30', icon: '🔴' },
};

interface Props { onBack: () => void; location: LocationData | null; weatherData: WeatherData | null; onQuotaError?: (msg?: string) => void; envProfile?: import('../types').EnvironmentalProfile | null; }

export const ClimateTrendForecaster: React.FC<Props> = ({ onBack, location, weatherData, onQuotaError, envProfile }) => {
  const lat = location?.latitude ?? 40;
  const zone = getClimateZone(lat);
  const trends = TREND_FACTORS[zone];
  const plants = useMemo(() => getGardenPlants().filter(p => p.status === 'active'), []);
  const [adaptiveAlts, setAdaptiveAlts] = useState<string | null>(null);
  const [altLoading, setAltLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const currentTemp = weatherData?.current?.temperature_2m ?? 22;
  const projected2035 = Math.round((currentTemp + trends.tempRise * 0.5) * 10) / 10;
  const projected2045 = Math.round((currentTemp + trends.tempRise) * 10) / 10;
  const projected2055 = Math.round((currentTemp + trends.tempRise * 1.5) * 10) / 10;

  const plantViability = useMemo(() => {
    return plants.map(p => {
      const nm = p.commonName.toLowerCase();
      const isHeatTolerant = HEAT_TOLERANT_KW.some(k => nm.includes(k));
      const isColdDependent = COLD_DEPENDENT_KW.some(k => nm.includes(k));
      const isDroughtTolerant = DROUGHT_TOLERANT_KW.some(k => nm.includes(k));
      const isWaterDependent = WATER_DEPENDENT_KW.some(k => nm.includes(k));

      let shortTerm: Viability = 'excellent';
      let medTerm: Viability = 'excellent';
      let longTerm: Viability = 'excellent';

      // Short-term (1-5 years): mostly fine
      if (isColdDependent && trends.tempRise > 2) shortTerm = 'good';

      // Medium-term (5-15 years)
      if (isColdDependent && trends.tempRise > 1.5) medTerm = 'at-risk';
      else if (isWaterDependent && trends.rainChange < -5) medTerm = 'at-risk';
      else if (isHeatTolerant) medTerm = 'excellent';
      else medTerm = 'good';

      // Long-term (15-30 years)
      if (isColdDependent && trends.tempRise > 1.2) longTerm = 'high-risk';
      else if (isWaterDependent && trends.rainChange < -3) longTerm = 'at-risk';
      else if (isHeatTolerant && isDroughtTolerant) longTerm = 'excellent';
      else if (isHeatTolerant) longTerm = 'good';
      else longTerm = 'at-risk';

      return { plant: p, shortTerm, medTerm, longTerm, isHeatTolerant, isDroughtTolerant, isColdDependent, isWaterDependent };
    });
  }, [plants, trends]);

  const atRiskCount = plantViability.filter(v => v.longTerm === 'at-risk' || v.longTerm === 'high-risk').length;
  const resilientCount = plantViability.filter(v => v.longTerm === 'excellent').length;

  const getAlternatives = useCallback(async () => {
    setAltLoading(true);
    try {
      const atRisk = plantViability.filter(v => v.longTerm === 'at-risk' || v.longTerm === 'high-risk');
      const prompt = `You are a climate adaptation horticulturist. Location: ${location?.name || `latitude ${lat}`}, climate zone: ${zone}.${envProfile?.usdaZone ? ` USDA Zone: ${envProfile.usdaZone}.` : ''}${envProfile?.koppenClass ? ` Köppen: ${envProfile.koppenClass}.` : ''}
Projected warming: +${trends.tempRise}°C over 20 years. Rainfall change: ${trends.rainChange > 0 ? '+' : ''}${trends.rainChange}%.${envProfile?.historicalClimate ? `\nHistorical 30yr trend: ${envProfile.historicalClimate.tempTrend30yr > 0 ? '+' : ''}${envProfile.historicalClimate.tempTrend30yr}°C. Growing season: ~${envProfile.historicalClimate.frostDates.growingSeasonDays} days (${envProfile.historicalClimate.frostDates.lastSpringFrost} to ${envProfile.historicalClimate.frostDates.firstFallFrost}).` : ''}

These plants are AT RISK in the long term:
${atRisk.map(v => `- ${v.plant.commonName} (${v.isColdDependent ? 'cold-dependent' : ''}${v.isWaterDependent ? 'water-dependent' : ''})`).join('\n') || 'None identified'}

All garden plants: ${plants.map(p => p.commonName).join(', ')}

For each at-risk plant, suggest 1-2 climate-resilient alternatives that provide similar benefits (shade, food, beauty, wildlife). Also suggest 2-3 general strategies for climate-proofing this garden.

Keep under 250 words. Use emojis. Be specific with plant names.`;
      setAdaptiveAlts(await getGardenInsights(prompt));
    } catch (err) { if (err instanceof QuotaExceededError) { onQuotaError?.(err.message); } setAdaptiveAlts('Unable to generate alternatives.'); }
    finally { setAltLoading(false); }
  }, [plantViability, plants, location, lat, zone, trends]);

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2"><span>📈</span> Climate Trend Forecaster</h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">Future-proof your planting decisions</p>
        </div>
        <Button onClick={onBack} variant="outline" size="sm">← Back</Button>
      </div>

      {/* Climate Trend Dashboard */}
      <div className="bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 rounded-xl p-4 sm:p-5 border border-orange-200 dark:border-orange-800 shadow-sm">
        <h3 className="text-sm font-semibold text-orange-700 dark:text-orange-400 mb-3">🌡️ Climate Trends — {location?.name || `Lat ${lat.toFixed(1)}°`}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {[
            { label: 'Temp Rise (20yr)', val: `+${trends.tempRise}°C`, icon: '🌡️', sub: 'Average warming' },
            { label: 'Rainfall Change', val: `${trends.rainChange > 0 ? '+' : ''}${trends.rainChange}%`, icon: '🌧️', sub: 'Annual total' },
            { label: 'Extreme Events', val: `+${trends.extremeIncrease}%`, icon: '⚡', sub: 'Heat/storm freq.' },
            { label: 'Season Extension', val: `+${trends.seasonExtend}d`, icon: '📅', sub: 'Extra frost-free days' },
          ].map(m => (
            <div key={m.label} className="p-3 rounded-lg bg-white/70 dark:bg-slate-800/50 border border-orange-100 dark:border-orange-900/30 text-center">
              <p className="text-lg">{m.icon}</p>
              <p className="text-base sm:text-lg font-bold text-slate-700 dark:text-slate-200">{m.val}</p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">{m.label}</p>
              <p className="text-[9px] text-slate-400">{m.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Temperature Projection */}
      <div className="bg-white dark:bg-slate-800 rounded-xl p-4 sm:p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">📊 Temperature Projection</h3>
        <div className="flex items-end justify-between gap-2 h-32 px-2">
          {[
            { label: 'Now', temp: currentTemp, color: 'bg-emerald-500' },
            { label: '2035', temp: projected2035, color: 'bg-amber-500' },
            { label: '2045', temp: projected2045, color: 'bg-orange-500' },
            { label: '2055', temp: projected2055, color: 'bg-red-500' },
          ].map(b => {
            const height = Math.max(20, Math.min(100, (b.temp / 45) * 100));
            return (
              <div key={b.label} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300">{b.temp}°C</span>
                <div className={`w-full rounded-t-lg ${b.color} transition-all duration-1000`} style={{ height: `${height}%` }} />
                <span className="text-[10px] text-slate-500 dark:text-slate-400">{b.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Hardiness Zone Shift */}
      <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">🗺️ Hardiness Zone Shift</h3>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">Your zone (<strong>{zone}</strong>) is projected to shift toward warmer conditions. Plants from regions ~{Math.round(trends.tempRise * 100)}km closer to the equator may become viable here, while some cold-loving species may struggle.</p>
      </div>

      {/* Plant Viability Table */}
      {plants.length > 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 sm:p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">🌿 Plant Future-Viability</h3>
          <p className="text-[10px] text-slate-400 mb-3">{resilientCount} resilient · {atRiskCount} at risk</p>
          <div className="space-y-1.5 max-h-64 overflow-y-auto scrollbar-thin">
            {plantViability.map(v => {
              const isExp = expanded === v.plant.id;
              return (
                <div key={v.plant.id} className="border border-slate-100 dark:border-slate-700 rounded-lg overflow-hidden">
                  <div className="flex items-center gap-2 p-2.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/30" onClick={() => setExpanded(isExp ? null : v.plant.id)}>
                    <span className="text-xs flex-1 font-medium text-slate-700 dark:text-slate-200 truncate">{v.plant.commonName}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${VIABILITY_CONFIG[v.shortTerm].bg} ${VIABILITY_CONFIG[v.shortTerm].color}`}>{VIABILITY_CONFIG[v.shortTerm].icon} 1-5yr</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${VIABILITY_CONFIG[v.medTerm].bg} ${VIABILITY_CONFIG[v.medTerm].color}`}>{VIABILITY_CONFIG[v.medTerm].icon} 5-15yr</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${VIABILITY_CONFIG[v.longTerm].bg} ${VIABILITY_CONFIG[v.longTerm].color}`}>{VIABILITY_CONFIG[v.longTerm].icon} 15-30yr</span>
                  </div>
                  {isExp && (
                    <div className="px-3 pb-2.5 pt-0 text-[10px] text-slate-500 dark:text-slate-400 space-y-0.5 border-t border-slate-100 dark:border-slate-700">
                      {v.isHeatTolerant && <p>🔥 Heat-tolerant — well-suited for warming conditions</p>}
                      {v.isDroughtTolerant && <p>💧 Drought-tolerant — handles reduced rainfall</p>}
                      {v.isColdDependent && <p>❄️ Cold-dependent — may struggle as winters shorten</p>}
                      {v.isWaterDependent && <p>🌊 Water-dependent — vulnerable to drying trends</p>}
                      {!v.isHeatTolerant && !v.isColdDependent && !v.isWaterDependent && <p>General adaptability — monitor as conditions change</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="text-center py-8 bg-slate-50 dark:bg-slate-800/50 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600">
          <span className="text-4xl block mb-3">🌱</span>
          <p className="text-sm text-slate-500 dark:text-slate-400">Add plants to see future viability assessments</p>
        </div>
      )}

      {/* Adaptive Alternatives */}
      {plants.length > 0 && (
        <div className="bg-gradient-to-r from-teal-50 to-emerald-50 dark:from-teal-900/20 dark:to-emerald-900/20 rounded-xl p-4 sm:p-5 border border-teal-200 dark:border-teal-800 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-teal-700 dark:text-teal-400">🔄 AI Climate-Resilient Alternatives</h3>
            <button onClick={getAlternatives} disabled={altLoading}
              className="text-xs px-3 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-600 text-white disabled:opacity-50 transition-colors min-h-[32px]">
              {altLoading ? '⏳...' : adaptiveAlts ? '🔄 Refresh' : '✨ Get Alternatives'}
            </button>
          </div>
          {adaptiveAlts ? (
            <div className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">{adaptiveAlts}</div>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400 italic">Get AI-powered climate-resilient plant alternatives for at-risk species.</p>
          )}
        </div>
      )}
    </div>
  );
};
