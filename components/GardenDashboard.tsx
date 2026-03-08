import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from './common/Button';
import type { GardenPlant, JournalEntry, GardenProfile, GardenStats, WateringTask, WeatherAlert, CalendarEvent, WeatherData, LocationData, MilestoneType, BadgeTier, GrowthDataPoint } from '../types';
import { BADGE_DEFINITIONS, MILESTONE_OPTIONS, CALENDAR_EVENT_COLORS, WATER_CONSERVATION_TIPS } from '../constants';
import * as garden from '../services/gardenService';
import { getGardenInsights, QuotaExceededError } from '../services/geminiService';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
type Tab = 'overview' | 'journal' | 'calendar' | 'achievements';

const tierColor = (t: BadgeTier) => t === 'gold' ? 'text-amber-500' : t === 'silver' ? 'text-slate-400' : 'text-amber-700';
const tierBg = (t: BadgeTier) => t === 'gold' ? 'bg-amber-100 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700' : t === 'silver' ? 'bg-slate-100 dark:bg-slate-700/50 border-slate-300 dark:border-slate-600' : 'bg-orange-100 dark:bg-orange-900/30 border-orange-300 dark:border-orange-700';

const StatCard: React.FC<{label:string; value:string|number; icon:string; color?:string; sub?:string}> = ({label,value,icon,color='text-emerald-500',sub}) => (
  <div className="bg-white dark:bg-slate-800 rounded-xl p-3 sm:p-4 border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow text-center">
    <span className="text-xl sm:text-2xl">{icon}</span>
    <p className={`text-xl sm:text-2xl font-bold mt-1 ${color}`}>{value}</p>
    <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5">{label}</p>
    {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
  </div>
);

interface Props { onBack: () => void; location: LocationData | null; weatherData: WeatherData | null; onQuotaError?: (msg?: string) => void; envProfile?: import('../types').EnvironmentalProfile | null; }

export const GardenDashboard: React.FC<Props> = ({ onBack, location, weatherData, onQuotaError, envProfile }) => {
  const [tab, setTab] = useState<Tab>('overview');
  const [plants, setPlants] = useState<GardenPlant[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [profile, setProfile] = useState<GardenProfile>(garden.getProfile());
  const [selPlantId, setSelPlantId] = useState<string|null>(null);
  const [showForm, setShowForm] = useState(false);
  const [fType, setFType] = useState<MilestoneType>('observation');
  const [fTitle, setFTitle] = useState('');
  const [fNotes, setFNotes] = useState('');
  const [fHeight, setFHeight] = useState('');
  const [fWater, setFWater] = useState('');
  const [fSpread, setFSpread] = useState('');
  const [fLeaves, setFLeaves] = useState('');
  const [fFlowers, setFFlowers] = useState('');
  const [fPhoto, setFPhoto] = useState('');
  const [aiInsight, setAiInsight] = useState<string|null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const refresh = useCallback(() => {
    setPlants(garden.getGardenPlants());
    setEntries(garden.getJournalEntries());
    garden.checkAchievements();
    setProfile(garden.getProfile());
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const stats = useMemo((): GardenStats => garden.getGardenStats(), [plants, entries]);
  const watering = useMemo((): WateringTask[] => garden.generateWateringPlan(weatherData), [plants, entries, weatherData]);
  const alerts = useMemo((): WeatherAlert[] => garden.generateWeatherAlerts(weatherData), [weatherData]);
  const calEvents = useMemo((): CalendarEvent[] => garden.generateCalendarEvents(location?.latitude ?? null), [plants, location]);
  const xp = useMemo(() => garden.getXPProgress(profile), [profile]);
  const selEntries = useMemo(() => entries.filter(e => e.plantId === selPlantId).sort((a,b) => b.date.localeCompare(a.date)), [entries, selPlantId]);
  const activePlants = useMemo(() => plants.filter(p => p.status === 'active'), [plants]);
  const growthData = useMemo((): GrowthDataPoint[] => selPlantId ? garden.getGrowthData(selPlantId) : [], [selPlantId, entries]);
  const forecast = useMemo(() => garden.generate7DayPlan(weatherData), [weatherData]);
  const seasonalProgress = useMemo(() => garden.getSeasonalChallengeProgress(), [plants, entries, profile]);

  const fetchInsights = useCallback(async () => {
    if (aiLoading || plants.length === 0) return;
    setAiLoading(true);
    try {
      const basePrompt = garden.buildInsightPrompt();
      const envContext = envProfile?.usdaZone ? `Local USDA Zone: ${envProfile.usdaZone}. Köppen Climate: ${envProfile.koppenClass || 'Unknown'}.` : '';
      const prompt = `${basePrompt}\n${envContext}`;
      const result = await getGardenInsights(prompt);
      setAiInsight(result);
    } catch (err) { if (err instanceof QuotaExceededError) { onQuotaError?.(err.message); } setAiInsight('Unable to generate insights right now. Try again later.'); }
    finally { setAiLoading(false); }
  }, [aiLoading, plants, envProfile]);

  const submitEntry = useCallback(() => {
    if (!selPlantId || !fTitle.trim()) return;
    const hasMeasurements = fHeight || fSpread || fLeaves || fFlowers;
    garden.addJournalEntry({
      id: `e-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
      plantId: selPlantId, date: new Date().toISOString(), type: fType,
      title: fTitle.trim(), notes: fNotes.trim() || undefined,
      photoUrl: fPhoto.trim() || undefined,
      measurements: hasMeasurements ? {
        heightCm: fHeight ? parseFloat(fHeight) : undefined,
        spreadCm: fSpread ? parseFloat(fSpread) : undefined,
        leafCount: fLeaves ? parseInt(fLeaves) : undefined,
        flowerCount: fFlowers ? parseInt(fFlowers) : undefined,
      } : undefined,
      waterAmountLiters: fWater ? parseFloat(fWater) : undefined,
      weatherSnapshot: weatherData ? { temperature: weatherData.current.temperature_2m, humidity: weatherData.current.relative_humidity_2m, description: weatherData.current.weather_description || '' } : undefined,
    });
    setFTitle(''); setFNotes(''); setFHeight(''); setFWater(''); setFSpread(''); setFLeaves(''); setFFlowers(''); setFPhoto(''); setShowForm(false);
    refresh();
  }, [selPlantId, fType, fTitle, fNotes, fHeight, fSpread, fLeaves, fFlowers, fWater, fPhoto, weatherData, refresh]);

  const toggleStatus = useCallback((id: string, status: 'active'|'dormant'|'removed') => {
    garden.updateGardenPlant(id, { status }); refresh();
  }, [refresh]);

  const tabs: {id:Tab; label:string; icon:string; shortLabel:string}[] = [
    {id:'overview',label:'Overview',icon:'🏠',shortLabel:'Home'},
    {id:'journal',label:'Journal',icon:'📓',shortLabel:'Journal'},
    {id:'calendar',label:'Calendar',icon:'📅',shortLabel:'Calendar'},
    {id:'achievements',label:'Achievements',icon:'🏆',shortLabel:'Awards'},
  ];

  const currentMonth = new Date().getMonth();

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <span className="text-2xl sm:text-3xl">🌿</span> My Garden
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">Your living garden companion — journal, calendar, watering &amp; achievements</p>
        </div>
        <Button onClick={onBack} variant="outline" size="sm" className="self-end sm:self-auto whitespace-nowrap">← Back to Planner</Button>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl overflow-x-auto scrollbar-thin">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 min-w-[70px] sm:min-w-[100px] flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-4 py-2.5 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap min-h-[44px] ${
              tab === t.id
                ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm ring-1 ring-emerald-200 dark:ring-emerald-800'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-700/50'
            }`}>
            <span>{t.icon}</span>
            <span className="hidden xs:inline sm:inline">{t.shortLabel}</span>
          </button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      <div className="min-h-[350px]">

        {/* ═══ OVERVIEW ═══ */}
        {tab === 'overview' && (
          <div className="space-y-5 animate-fade-in">
            {/* Quick Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              <StatCard label="Total Plants" value={stats.totalPlants} icon="🌱" sub={`${stats.dormantPlants} dormant`} />
              <StatCard label="Active" value={stats.activePlants} icon="🌿" color="text-green-500" />
              <StatCard label="Journal Entries" value={stats.totalEntries} icon="📝" color="text-blue-500" sub={`${stats.totalWaterings} waterings`} />
              <StatCard label="Streak" value={`${profile.streakDays}d`} icon="🔥" color="text-orange-500" sub={`Lv.${profile.level} ${garden.getLevelName(profile.level)}`} />
            </div>

            {/* Garden Health */}
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 sm:p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm sm:text-base font-semibold text-slate-700 dark:text-slate-200">🌡️ Garden Health Score</h3>
                <span className={`text-xl sm:text-2xl font-bold ${stats.healthScore >= 80 ? 'text-emerald-500' : stats.healthScore >= 50 ? 'text-amber-500' : 'text-red-500'}`}>{stats.healthScore}<span className="text-sm font-normal text-slate-400">/100</span></span>
              </div>
              <div className="w-full h-2.5 sm:h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-1000 ease-out ${stats.healthScore >= 80 ? 'bg-gradient-to-r from-emerald-400 to-emerald-600' : stats.healthScore >= 50 ? 'bg-gradient-to-r from-amber-400 to-amber-600' : 'bg-gradient-to-r from-red-400 to-red-600'}`} style={{width:`${stats.healthScore}%`}} />
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-2">{stats.healthScore >= 80 ? '🎉 Excellent! Your garden is thriving.' : stats.healthScore >= 50 ? '👍 Good progress. Keep logging entries to improve!' : '💡 Add plants and journal entries to boost your score.'}</p>
            </div>

            {/* Weather Alerts */}
            {alerts.length > 0 && <div className="space-y-2">{alerts.map((a,i) => (
              <div key={i} className={`p-3 sm:p-4 rounded-xl border ${a.severity === 'critical' ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'}`}>
                <h4 className={`text-sm font-semibold ${a.severity === 'critical' ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}`}>{a.title}</h4>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1">{a.description}</p>
                <ul className="mt-2 space-y-0.5">{a.actions.map((act,j) => <li key={j} className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">→ {act}</li>)}</ul>
              </div>
            ))}</div>}

            {/* Watering Plan */}
            {watering.length > 0 && (
              <div className="bg-white dark:bg-slate-800 rounded-xl p-4 sm:p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
                <h3 className="text-sm sm:text-base font-semibold text-slate-700 dark:text-slate-200 mb-3">💧 Today's Watering Plan</h3>
                <div className="space-y-2">{watering.map(w => (
                  <div key={w.plantId} className={`flex items-center justify-between p-2.5 sm:p-3 rounded-lg border ${w.action === 'water' ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' : 'bg-slate-50 dark:bg-slate-700/50 border-slate-200 dark:border-slate-700'}`}>
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-xs sm:text-sm text-slate-700 dark:text-slate-200 block truncate">{w.plantName}</span>
                      <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 truncate">{w.reason}</p>
                    </div>
                    <div className="ml-2 flex-shrink-0">
                      {w.action === 'water'
                        ? <span className={`text-[11px] sm:text-xs font-semibold px-2 sm:px-2.5 py-1 rounded-full whitespace-nowrap ${w.priority === 'high' ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'}`}>💧 {w.amountLiters}L</span>
                        : <span className="text-[11px] sm:text-xs font-semibold px-2 sm:px-2.5 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">✓ Skip</span>
                      }
                    </div>
                  </div>
                ))}</div>
              </div>
            )}

            {/* This Week */}
            {stats.weekEntries.length > 0 && (
              <div className="bg-white dark:bg-slate-800 rounded-xl p-4 sm:p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
                <h3 className="text-sm sm:text-base font-semibold text-slate-700 dark:text-slate-200 mb-3">📋 This Week in Your Garden</h3>
                <div className="space-y-1.5">{stats.weekEntries.slice(0,5).map(e => {
                  const mo = MILESTONE_OPTIONS.find(m => m.value === e.type);
                  return <div key={e.id} className="flex items-center gap-2 sm:gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"><span className="text-base sm:text-lg flex-shrink-0">{mo?.icon || '📝'}</span><div className="flex-1 min-w-0"><p className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{e.title}</p><p className="text-[10px] sm:text-xs text-slate-400">{new Date(e.date).toLocaleDateString()}</p></div></div>;
                })}</div>
              </div>
            )}

            {/* Upcoming Tasks */}
            {stats.upcomingTasks.length > 0 && (
              <div className="bg-white dark:bg-slate-800 rounded-xl p-4 sm:p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
                <h3 className="text-sm sm:text-base font-semibold text-slate-700 dark:text-slate-200 mb-3">📌 Upcoming Tasks</h3>
                <div className="space-y-1.5">{stats.upcomingTasks.slice(0,5).map((t,i) => (
                  <div key={i} className={`flex items-center gap-2 p-2 rounded-lg border ${t.priority === 'high' ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30'}`}>
                    <span className="text-base flex-shrink-0">{t.icon}</span>
                    <div className="flex-1 min-w-0"><p className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{t.plantName}: {t.task}</p></div>
                    <span className={`text-[10px] sm:text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${t.priority === 'high' ? 'bg-red-100 dark:bg-red-900/30 text-red-600' : t.priority === 'medium' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'}`}>{t.dueDesc}</span>
                  </div>
                ))}</div>
              </div>
            )}

            {/* 7-Day Forecast */}
            {forecast.length > 0 && (
              <div className="bg-white dark:bg-slate-800 rounded-xl p-4 sm:p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
                <h3 className="text-sm sm:text-base font-semibold text-slate-700 dark:text-slate-200 mb-3">📅 7-Day Watering Forecast</h3>
                <div className="grid grid-cols-7 gap-1">{forecast.map((d,i) => (
                  <div key={i} className={`text-center p-1.5 sm:p-2 rounded-lg border ${d.needsWater ? 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/10' : 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/10'}`}>
                    <p className="text-[10px] sm:text-xs font-medium text-slate-600 dark:text-slate-300">{d.day}</p>
                    <p className="text-base sm:text-lg mt-0.5">{d.rain ? '🌧️' : d.needsWater ? '💧' : '✅'}</p>
                    {d.temp != null && <p className="text-[10px] text-slate-400 mt-0.5">{d.temp}°C</p>}
                  </div>
                ))}</div>
              </div>
            )}

            {/* Water Usage Tracker */}
            {stats.waterUsage.entryCount > 0 && (
              <div className="bg-white dark:bg-slate-800 rounded-xl p-4 sm:p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
                <h3 className="text-sm sm:text-base font-semibold text-slate-700 dark:text-slate-200 mb-3">🚰 Water Usage Tracker</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-3">
                  <div className="text-center p-2 bg-blue-50 dark:bg-blue-900/10 rounded-lg"><p className="text-lg font-bold text-blue-600">{stats.waterUsage.thisWeek}L</p><p className="text-[10px] text-slate-400">This Week</p></div>
                  <div className="text-center p-2 bg-blue-50 dark:bg-blue-900/10 rounded-lg"><p className="text-lg font-bold text-blue-600">{stats.waterUsage.thisMonth}L</p><p className="text-[10px] text-slate-400">This Month</p></div>
                  <div className="text-center p-2 bg-blue-50 dark:bg-blue-900/10 rounded-lg"><p className="text-lg font-bold text-blue-600">{stats.waterUsage.allTime}L</p><p className="text-[10px] text-slate-400">All Time</p></div>
                  <div className="text-center p-2 bg-blue-50 dark:bg-blue-900/10 rounded-lg"><p className="text-lg font-bold text-blue-600">{stats.waterUsage.avgPerPlant}L</p><p className="text-[10px] text-slate-400">Avg/Plant/Mo</p></div>
                </div>
                <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 italic">{WATER_CONSERVATION_TIPS[Math.floor(Date.now() / 86400000) % WATER_CONSERVATION_TIPS.length]}</p>
              </div>
            )}

            {/* AI Insights */}
            {stats.totalPlants > 0 && (
              <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-xl p-4 sm:p-5 border border-purple-200 dark:border-purple-800 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm sm:text-base font-semibold text-purple-700 dark:text-purple-400">🤖 AI Garden Insights</h3>
                  <button onClick={fetchInsights} disabled={aiLoading} className="text-xs px-3 py-1.5 rounded-lg bg-purple-500 hover:bg-purple-600 text-white disabled:opacity-50 transition-colors min-h-[32px]">
                    {aiLoading ? '⏳ Analyzing...' : aiInsight ? '🔄 Refresh' : '✨ Generate'}
                  </button>
                </div>
                {aiInsight ? (
                  <div className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">{aiInsight}</div>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400 italic">Click "Generate" to get AI-powered insights based on your garden journal data, weather patterns, and plant health.</p>
                )}
              </div>
            )}

            {/* Empty State */}
            {stats.totalPlants === 0 && (
              <div className="text-center py-10 sm:py-14 bg-gradient-to-br from-slate-50 to-emerald-50/50 dark:from-slate-800/50 dark:to-emerald-900/10 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600">
                <span className="text-5xl sm:text-6xl block animate-float">🌱</span>
                <h3 className="text-base sm:text-lg font-semibold text-slate-700 dark:text-slate-200 mt-4">Your garden is empty</h3>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1.5 max-w-xs mx-auto px-4">Get plant recommendations first, then tap <strong>"+ My Garden"</strong> on any plant card to start tracking it here.</p>
                <Button onClick={onBack} variant="primary" size="md" className="mt-5">← Get Recommendations</Button>
              </div>
            )}
          </div>
        )}

        {/* ═══ JOURNAL ═══ */}
        {tab === 'journal' && (
          <div className="space-y-4 animate-fade-in">
            {activePlants.length > 0 ? (<>
              {/* Plant Selector Chips */}
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2 block">Select a plant:</label>
                <div className="flex flex-wrap gap-1.5 sm:gap-2">{plants.filter(p => p.status !== 'removed').map(p => (
                  <button key={p.id} onClick={() => { setSelPlantId(p.id); setShowForm(false); }}
                    className={`px-3 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all border min-h-[40px] ${selPlantId === p.id ? 'bg-emerald-500 text-white border-emerald-500 shadow-md scale-[1.02]' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-emerald-400 hover:shadow-sm'}`}>
                    {p.status === 'dormant' ? '💤 ' : '🌿 '}{p.commonName}
                  </button>
                ))}</div>
              </div>

              {/* Selected Plant Profile */}
              {selPlantId && (() => {
                const pl = plants.find(p => p.id === selPlantId);
                if (!pl) return null;
                return (
                  <div className="bg-white dark:bg-slate-800 rounded-xl p-4 sm:p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
                    {/* Plant Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-white truncate">{pl.commonName}</h3>
                        {pl.scientificName && <p className="text-xs sm:text-sm italic text-slate-500 dark:text-slate-400 truncate">{pl.scientificName}</p>}
                        <p className="text-[11px] sm:text-xs text-slate-400 mt-1">Added {new Date(pl.dateAdded).toLocaleDateString()} · <span className={pl.status === 'active' ? 'text-green-500 font-medium' : 'text-amber-500 font-medium'}>{pl.status}</span></p>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        {pl.status === 'active' && <button onClick={() => toggleStatus(pl.id,'dormant')} className="text-xs px-2 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-600 hover:bg-amber-200 transition-colors min-h-[32px]" title="Set Dormant">💤</button>}
                        {pl.status === 'dormant' && <button onClick={() => toggleStatus(pl.id,'active')} className="text-xs px-2 py-1.5 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-600 hover:bg-green-200 transition-colors min-h-[32px]" title="Set Active">🌿</button>}
                        <button onClick={() => { if(confirm('Remove this plant from your garden?')) toggleStatus(pl.id,'removed'); }} className="text-xs px-2 py-1.5 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 hover:bg-red-200 transition-colors min-h-[32px]" title="Remove">🗑️</button>
                      </div>
                    </div>

                    {/* Add Entry Toggle */}
                    <div className="mt-4">
                      <Button onClick={() => setShowForm(!showForm)} variant={showForm ? 'outline' : 'primary'} size="sm" className="w-full sm:w-auto">
                        {showForm ? '✕ Cancel' : '+ Add Journal Entry'}
                      </Button>
                    </div>

                    {/* Entry Form */}
                    {showForm && (
                      <div className="mt-4 p-3 sm:p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800 space-y-3">
                        <div>
                          <label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5 block">Milestone Type</label>
                          <div className="flex flex-wrap gap-1 sm:gap-1.5">{MILESTONE_OPTIONS.map(m => (
                            <button key={m.value} onClick={() => { setFType(m.value); setFTitle(m.label); }}
                              className={`text-[11px] sm:text-xs px-2 sm:px-2.5 py-1.5 rounded-lg transition-all min-h-[32px] ${fType === m.value ? 'bg-emerald-500 text-white shadow-sm' : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600'}`}>
                              {m.icon} {m.label}
                            </button>
                          ))}</div>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">Title</label>
                          <input value={fTitle} onChange={e => setFTitle(e.target.value)} className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all min-h-[44px]" placeholder="e.g. First sprout appeared!" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">Notes <span className="font-normal text-slate-400">(optional)</span></label>
                          <textarea value={fNotes} onChange={e => setFNotes(e.target.value)} rows={2} className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-white resize-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all" placeholder="Additional observations..." />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {fType === 'measurement' && <>
                            <div className="flex-1 min-w-[100px]"><label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">Height (cm)</label><input type="number" value={fHeight} onChange={e => setFHeight(e.target.value)} className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-white min-h-[44px]" /></div>
                            <div className="flex-1 min-w-[100px]"><label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">Spread (cm)</label><input type="number" value={fSpread} onChange={e => setFSpread(e.target.value)} className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-white min-h-[44px]" /></div>
                            <div className="flex-1 min-w-[80px]"><label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">Leaves</label><input type="number" value={fLeaves} onChange={e => setFLeaves(e.target.value)} className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-white min-h-[44px]" /></div>
                            <div className="flex-1 min-w-[80px]"><label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">Flowers</label><input type="number" value={fFlowers} onChange={e => setFFlowers(e.target.value)} className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-white min-h-[44px]" /></div>
                          </>}
                          {fType === 'watering' && <div className="flex-1"><label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">Water (liters)</label><input type="number" step="0.1" value={fWater} onChange={e => setFWater(e.target.value)} className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-white min-h-[44px]" /></div>}
                        </div>
                        <div>
                          <label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">📷 Photo URL <span className="font-normal text-slate-400">(optional)</span></label>
                          <input value={fPhoto} onChange={e => setFPhoto(e.target.value)} className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all min-h-[44px]" placeholder="https://example.com/my-plant-photo.jpg" />
                        </div>
                        {weatherData && <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 px-3 py-2 rounded-lg">🌡️ Weather: {weatherData.current.temperature_2m}°C, {weatherData.current.relative_humidity_2m}% humidity — auto-tagged</p>}
                        <Button onClick={submitEntry} variant="primary" size="sm" disabled={!fTitle.trim()} className="w-full sm:w-auto">💾 Save Entry</Button>
                      </div>
                    )}

                    {/* Growth Chart */}
                    {growthData.length >= 2 && (
                      <div className="mt-4 bg-slate-50 dark:bg-slate-700/30 rounded-lg p-3 sm:p-4">
                        <h4 className="text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-300 mb-2">📈 Growth Chart</h4>
                        <div className="flex items-end gap-1 h-24 sm:h-32">
                          {(() => {
                            const heights = growthData.filter(d => d.heightCm != null).map(d => d.heightCm!);
                            const maxH = Math.max(...heights, 1);
                            return growthData.filter(d => d.heightCm != null).map((d, i) => (
                              <div key={i} className="flex-1 flex flex-col items-center gap-0.5" title={`${new Date(d.date).toLocaleDateString()}: ${d.heightCm}cm`}>
                                <span className="text-[9px] text-slate-400">{d.heightCm}</span>
                                <div className="w-full bg-emerald-400 dark:bg-emerald-500 rounded-t-sm transition-all hover:bg-emerald-500" style={{height: `${(d.heightCm! / maxH) * 100}%`, minHeight: '4px'}} />
                                <span className="text-[8px] text-slate-400">{new Date(d.date).toLocaleDateString(undefined, {month:'short', day:'numeric'})}</span>
                              </div>
                            ));
                          })()}
                        </div>
                      </div>
                    )}

                    {/* Growth Timeline */}
                    <div className="mt-5 sm:mt-6">
                      <h4 className="text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-300 mb-3 flex items-center gap-1.5">📜 Growth Timeline <span className="text-slate-400 font-normal">({selEntries.length} entries)</span></h4>
                      {selEntries.length === 0 ? (
                        <div className="text-center py-6 bg-slate-50 dark:bg-slate-700/30 rounded-lg">
                          <p className="text-sm text-slate-400 italic">No entries yet. Add your first journal entry above!</p>
                        </div>
                      ) : (
                        <div className="relative pl-5 sm:pl-6 border-l-2 border-emerald-200 dark:border-emerald-800 space-y-3 sm:space-y-4">{selEntries.map(en => {
                          const mo = MILESTONE_OPTIONS.find(m => m.value === en.type);
                          return (
                            <div key={en.id} className="relative">
                              <div className="absolute -left-[21px] sm:-left-[25px] w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-800 shadow-sm" />
                              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-2.5 sm:p-3 border border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors">
                                <div className="flex items-start sm:items-center justify-between gap-2">
                                  <span className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200">{mo?.icon} {en.title}</span>
                                  <span className="text-[10px] sm:text-xs text-slate-400 whitespace-nowrap flex-shrink-0">{new Date(en.date).toLocaleDateString()}</span>
                                </div>
                                {en.notes && <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-1">{en.notes}</p>}
                                {en.photoUrl && <img src={en.photoUrl} alt="Plant photo" className="mt-2 rounded-lg max-h-32 object-cover border border-slate-200 dark:border-slate-600" onError={(e) => (e.currentTarget.style.display = 'none')} />}
                                <div className="flex flex-wrap gap-2 mt-1.5">
                                  {en.measurements?.heightCm != null && <span className="text-[11px] text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-1.5 py-0.5 rounded">📏 {en.measurements.heightCm}cm</span>}
                                  {en.measurements?.spreadCm != null && <span className="text-[11px] text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20 px-1.5 py-0.5 rounded">↔️ {en.measurements.spreadCm}cm</span>}
                                  {en.measurements?.leafCount != null && <span className="text-[11px] text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-1.5 py-0.5 rounded">🍃 {en.measurements.leafCount} leaves</span>}
                                  {en.measurements?.flowerCount != null && <span className="text-[11px] text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-900/20 px-1.5 py-0.5 rounded">🌸 {en.measurements.flowerCount} flowers</span>}
                                  {en.waterAmountLiters != null && <span className="text-[11px] text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 rounded">💧 {en.waterAmountLiters}L</span>}
                                  {en.weatherSnapshot && <span className="text-[11px] text-slate-400 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">🌡️ {en.weatherSnapshot.temperature}°C</span>}
                                </div>
                                <button onClick={() => { garden.deleteJournalEntry(en.id); refresh(); }} className="text-[11px] text-red-400 hover:text-red-600 mt-1.5 transition-colors">Delete</button>
                              </div>
                            </div>
                          );
                        })}</div>
                      )}
                    </div>
                  </div>
                );
              })()}
              {!selPlantId && (
                <div className="text-center py-10 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                  <span className="text-4xl block mb-2">👆</span>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Select a plant above to view its journal and timeline.</p>
                </div>
              )}
            </>) : (
              <div className="text-center py-12 bg-gradient-to-br from-slate-50 to-emerald-50/50 dark:from-slate-800/50 dark:to-emerald-900/10 rounded-xl border border-dashed border-slate-300 dark:border-slate-600">
                <span className="text-5xl block animate-float">📓</span>
                <h3 className="text-base sm:text-lg font-semibold text-slate-700 dark:text-slate-200 mt-3">No plants in your garden yet</h3>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 px-4">Add plants from your AI recommendations to start journaling.</p>
                <Button onClick={onBack} variant="primary" size="sm" className="mt-4">← Get Recommendations</Button>
              </div>
            )}
          </div>
        )}

        {/* ═══ CALENDAR ═══ */}
        {tab === 'calendar' && (
          <div className="space-y-4 animate-fade-in">
            <div>
              <h3 className="text-base sm:text-lg font-semibold text-slate-700 dark:text-slate-200">📅 Seasonal Planting Calendar</h3>
              <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5">Personalized for your location{location ? ` (${location.latitude.toFixed(1)}° lat)` : ''}</p>
            </div>

            {calEvents.length > 0 ? (<>
              {/* Legend */}
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] sm:text-xs bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-lg">{(Object.entries(CALENDAR_EVENT_COLORS) as [string,string][]).map(([k,c]) => (
                <span key={k} className="flex items-center gap-1"><span className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-sm ${c}`} /><span className="capitalize">{k.replace(/-/g,' ')}</span></span>
              ))}</div>

              {/* Calendar Gantt Chart */}
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 -mx-1 sm:mx-0">
                <div className="min-w-[600px] p-2 sm:p-3">
                  {/* Month headers */}
                  <div className="grid grid-cols-[100px_repeat(12,1fr)] sm:grid-cols-[140px_repeat(12,1fr)] gap-0.5 sm:gap-px mb-1">
                    <div className="text-[10px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400 px-1">Plant</div>
                    {MONTHS.map((m, mi) => (
                      <div key={m} className={`text-[10px] sm:text-xs font-medium text-center py-0.5 rounded ${mi === currentMonth ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 font-bold' : 'text-slate-500 dark:text-slate-400'}`}>{m}</div>
                    ))}
                  </div>

                  {/* Plant rows */}
                  {(() => {
                    const names = [...new Set(calEvents.map(e => e.plantName))];
                    return names.map((name, ri) => {
                      const evts = calEvents.filter(e => e.plantName === name);
                      return (
                        <div key={name} className={`grid grid-cols-[100px_repeat(12,1fr)] sm:grid-cols-[140px_repeat(12,1fr)] gap-0.5 sm:gap-px py-0.5 ${ri % 2 === 0 ? '' : 'bg-slate-50/50 dark:bg-slate-700/20 rounded'}`}>
                          <div className="text-[10px] sm:text-xs text-slate-700 dark:text-slate-300 font-medium px-1 truncate flex items-center" title={name}>🌿 {name}</div>
                          {MONTHS.map((_, mi) => {
                            const hit = evts.filter(ev => ev.monthStart <= ev.monthEnd ? mi >= ev.monthStart && mi <= ev.monthEnd : mi >= ev.monthStart || mi <= ev.monthEnd);
                            const top = hit[hit.length - 1];
                            return (
                              <div key={mi} className={`h-6 sm:h-7 flex items-center px-0.5 ${mi === currentMonth ? 'ring-1 ring-emerald-300 dark:ring-emerald-700 rounded' : ''}`} title={top ? `${name}: ${top.label}` : ''}>
                                {top ? <div className={`w-full h-4 sm:h-5 rounded-sm ${top.color} opacity-85 hover:opacity-100 transition-opacity`} /> : <div className="w-full h-4 sm:h-5 rounded-sm bg-slate-100 dark:bg-slate-800" />}
                              </div>
                            );
                          })}
                        </div>
                      );
                    });
                  })()}
                </div>
                <p className="text-[10px] text-slate-400 text-center pb-2 sm:hidden">← Scroll horizontally to see all months →</p>
              </div>

              {/* Smart Tips */}
              <div className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 rounded-xl p-3 sm:p-4 border border-emerald-200 dark:border-emerald-800">
                <h4 className="text-xs sm:text-sm font-semibold text-emerald-700 dark:text-emerald-400 mb-2">💡 Smart Planting Tips</h4>
                <ul className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-300 space-y-1">
                  <li>• Start seeds indoors 6–8 weeks before your local last frost date.</li>
                  <li>• Harden off seedlings by gradually exposing them outdoors over 7–10 days.</li>
                  <li>• Plant after all frost danger has passed — check local forecasts.</li>
                  {location && Math.abs(location.latitude) > 35 && <li>• At latitude {location.latitude.toFixed(1)}°, your growing season may be shorter. Choose faster-maturing varieties.</li>}
                  {location && Math.abs(location.latitude) < 23.5 && <li>• At your tropical latitude, most plants can grow year-round. Focus on monsoon and dry season timing.</li>}
                </ul>
              </div>
            </>) : (
              <div className="text-center py-12 bg-gradient-to-br from-slate-50 to-emerald-50/50 dark:from-slate-800/50 dark:to-emerald-900/10 rounded-xl border border-dashed border-slate-300 dark:border-slate-600">
                <span className="text-5xl block animate-float">📅</span>
                <h3 className="text-base sm:text-lg font-semibold text-slate-700 dark:text-slate-200 mt-3">No calendar data yet</h3>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 px-4">Add plants to your garden to see a personalized seasonal planting calendar.</p>
              </div>
            )}
          </div>
        )}

        {/* ═══ ACHIEVEMENTS ═══ */}
        {tab === 'achievements' && (
          <div className="space-y-5 animate-fade-in">
            {/* Level & XP Hero Card */}
            <div className="bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 rounded-xl p-4 sm:p-5 text-white shadow-lg shadow-emerald-500/20">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-[11px] sm:text-sm opacity-80 uppercase tracking-wide">Level {profile.level}</p>
                  <h3 className="text-lg sm:text-xl font-bold">{garden.getLevelName(profile.level)}</h3>
                </div>
                <div className="text-right">
                  <p className="text-xl sm:text-2xl font-bold">{profile.xp} <span className="text-sm font-normal opacity-80">XP</span></p>
                  <p className="text-[11px] sm:text-xs opacity-70">Next level: {xp.next} XP</p>
                </div>
              </div>
              <div className="w-full h-2.5 sm:h-3 bg-white/20 rounded-full overflow-hidden">
                <div className="h-full bg-white rounded-full transition-all duration-1000 ease-out" style={{width:`${xp.pct}%`}} />
              </div>
              <div className="flex justify-between mt-2 text-[11px] sm:text-xs opacity-80">
                <span>🔥 {profile.streakDays}-day streak</span>
                <span>{Math.round(xp.pct)}% to next level</span>
              </div>
            </div>

            {/* XP Guide */}
            <div className="bg-white dark:bg-slate-800 rounded-xl p-3 sm:p-4 border border-slate-200 dark:border-slate-700 shadow-sm">
              <h4 className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">⚡ How to Earn XP</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 sm:gap-2 text-[11px] sm:text-xs text-slate-600 dark:text-slate-300">
                <span className="flex items-center gap-1">🌱 Add plant: <strong className="text-emerald-600 dark:text-emerald-400">+20</strong></span>
                <span className="flex items-center gap-1">📝 Journal entry: <strong className="text-emerald-600 dark:text-emerald-400">+10</strong></span>
                <span className="flex items-center gap-1">📷 Add photo: <strong className="text-emerald-600 dark:text-emerald-400">+15</strong></span>
                <span className="flex items-center gap-1">💧 Watering logged: <strong className="text-emerald-600 dark:text-emerald-400">+5</strong></span>
                <span className="flex items-center gap-1">🏆 Earn a badge: <strong className="text-emerald-600 dark:text-emerald-400">+100</strong></span>
                <span className="flex items-center gap-1">🎯 Season challenge: <strong className="text-emerald-600 dark:text-emerald-400">+200</strong></span>
              </div>
            </div>

            {/* Seasonal Challenges */}
            {seasonalProgress.length > 0 && (
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-xl p-4 sm:p-5 border border-amber-200 dark:border-amber-800 shadow-sm">
                <h3 className="text-sm sm:text-base font-semibold text-amber-700 dark:text-amber-400 mb-3">🎯 Seasonal Challenges — {garden.getCurrentSeason().charAt(0).toUpperCase() + garden.getCurrentSeason().slice(1)}</h3>
                <div className="space-y-3">{seasonalProgress.map(sp => (
                  <div key={sp.challenge.id} className={`p-3 rounded-lg border ${sp.completed ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/10' : 'border-amber-200 dark:border-amber-700 bg-white dark:bg-slate-800'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200">{sp.challenge.icon} {sp.challenge.title}</span>
                      {sp.completed ? <span className="text-[10px] sm:text-xs font-bold text-green-600 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full">✅ Complete!</span>
                        : <span className="text-[10px] sm:text-xs text-amber-600">{sp.progress}/{sp.challenge.target}</span>}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-1.5">{sp.challenge.description}</p>
                    <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${sp.completed ? 'bg-green-500' : 'bg-amber-500'}`} style={{width: `${Math.min(100, (sp.progress / sp.challenge.target) * 100)}%`}} />
                    </div>
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">🎁 Reward: {sp.challenge.xpReward} XP</p>
                  </div>
                ))}</div>
              </div>
            )}

            {/* Badge Grid */}
            <div>
              <h3 className="text-sm sm:text-lg font-semibold text-slate-700 dark:text-slate-200 mb-3">🏅 Achievement Badges</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">{BADGE_DEFINITIONS.map(badge => {
                const earned = profile.earnedBadges.filter(e => e.badgeId === badge.id);
                const top = earned.length > 0 ? earned.sort((a,b) => ({gold:3,silver:2,bronze:1}[b.tier]||0) - ({gold:3,silver:2,bronze:1}[a.tier]||0))[0].tier : null;
                const pollinatorKw = ['butterfly','bee','lavender','sunflower','daisy','marigold','sage','lilac','zinnia','cosmos','monkeyflower'];
                const treeKw = ['tree','oak','maple','pine','birch','palm','cedar','willow','toyon','sequoia'];
                const counts: Record<string,number> = {'first-seed':plants.length,'green-thumb':entries.length,'first-bloom':entries.filter(e=>e.type==='first-flower').length,'harvest-hero':entries.filter(e=>e.type==='first-harvest').length,'streak-master':profile.streakDays,'plant-scholar':entries.filter(e=>e.type==='observation').length,'water-wise':entries.filter(e=>e.type==='watering').length,'measure-master':entries.filter(e=>e.type==='measurement').length,'pollinator-friend':plants.filter(p=>pollinatorKw.some(k=>p.commonName.toLowerCase().includes(k))).length,'carbon-champion':plants.filter(p=>treeKw.some(k=>p.commonName.toLowerCase().includes(k))).length,'community-grower':entries.filter(e=>e.notes?.toLowerCase().includes('shared')).length,'master-gardener':stats.healthScore>=80?1:0};
                const count = counts[badge.id] || 0;
                const next = badge.tiers.find(t => count < t.target) || badge.tiers[badge.tiers.length - 1];
                const pct = Math.min(100, (count / next.target) * 100);
                return (
                  <div key={badge.id} className={`p-3 sm:p-4 rounded-xl border-2 transition-all hover:shadow-md ${top ? tierBg(top) : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'}`}>
                    <div className="flex items-center gap-2.5 sm:gap-3">
                      <span className="text-2xl sm:text-3xl flex-shrink-0">{badge.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                          <span className="font-semibold text-xs sm:text-sm text-slate-800 dark:text-white">{badge.name}</span>
                          {top && <span className={`text-[10px] sm:text-xs font-bold uppercase ${tierColor(top)}`}>{top}</span>}
                        </div>
                        <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">{badge.description}</p>
                        <div className="mt-1.5 sm:mt-2 flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{width:`${pct}%`}} /></div>
                          <span className="text-[10px] sm:text-xs text-slate-400 whitespace-nowrap">{count}/{next.target}</span>
                        </div>
                        <div className="flex gap-1 mt-1.5">{badge.tiers.map(t => (
                          <span key={t.tier} className={`text-[10px] sm:text-xs px-1.5 py-0.5 rounded-md ${earned.some(e => e.tier === t.tier) ? t.tier === 'gold' ? 'bg-amber-500 text-white' : t.tier === 'silver' ? 'bg-slate-400 text-white' : 'bg-amber-700 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-400'}`}>{t.tier === 'gold' ? '🥇' : t.tier === 'silver' ? '🥈' : '🥉'} {t.target}</span>
                        ))}</div>
                      </div>
                    </div>
                  </div>
                );
              })}</div>
            </div>

            {/* Progress Garden Visual */}
            <div className="bg-gradient-to-br from-emerald-50 via-green-50 to-teal-50 dark:from-emerald-900/20 dark:via-green-900/20 dark:to-teal-900/20 rounded-xl p-5 sm:p-6 border border-emerald-200 dark:border-emerald-800 text-center shadow-sm">
              <h4 className="text-xs sm:text-sm font-semibold text-emerald-700 dark:text-emerald-400 mb-3">🌳 Your Progress Garden</h4>
              <div className="text-4xl sm:text-5xl leading-relaxed tracking-wider">
                {profile.level < 5 ? '🟫🌱' : profile.level < 15 ? '🌱🌿🌱' : profile.level < 30 ? '🌿🌻🌿🌱' : profile.level < 50 ? '🌳🌻🌿🌸🌱' : profile.level < 75 ? '🌳🌲🌻🌸🦋🌿' : '🌳🌲🌴🌻🌸🦋🐝🌿🍎'}
              </div>
              <p className="text-[11px] sm:text-xs text-emerald-600 dark:text-emerald-400 mt-3 max-w-sm mx-auto">
                {profile.level < 5 ? 'A single sprout in bare soil. Every garden starts somewhere — keep growing!' :
                 profile.level < 15 ? 'Small shoots are appearing. Your dedication is showing!' :
                 profile.level < 30 ? 'A flourishing patch is taking shape. Your garden is becoming diverse!' :
                 profile.level < 50 ? 'A thriving garden with real variety. Impressive commitment!' :
                 profile.level < 75 ? 'A mature garden buzzing with life and color!' :
                 'A magnificent forest ecosystem! You are a true master gardener. 🏆'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
