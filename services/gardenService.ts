import type { GardenPlant, JournalEntry, GardenProfile, GardenStats, WateringTask, WeatherAlert, CalendarEvent, WeatherData, EarnedBadge, WaterUsage, GrowthDataPoint, UpcomingTask, Season } from '../types';
import { BADGE_DEFINITIONS, XP_VALUES, LEVEL_THRESHOLDS, SEASONAL_CHALLENGES } from '../constants';

// ===== Storage =====
const KEYS = { plants: 'plantpal-garden-plants', journal: 'plantpal-garden-journal', profile: 'plantpal-garden-profile' };

const readJSON = <T>(key: string, fallback: T): T => {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback; } catch { return fallback; }
};
const writeJSON = <T>(key: string, data: T): void => {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch (e) { console.error('Garden storage error:', e); }
};

// ===== Garden Plants CRUD =====
export const getGardenPlants = (): GardenPlant[] => readJSON(KEYS.plants, []);

export const addGardenPlant = (plant: GardenPlant): void => {
  const plants = getGardenPlants();
  if (!plants.find(p => p.id === plant.id)) {
    plants.push(plant);
    writeJSON(KEYS.plants, plants);
    addXP(XP_VALUES.addPlant);
  }
};

export const updateGardenPlant = (id: string, updates: Partial<GardenPlant>): void => {
  writeJSON(KEYS.plants, getGardenPlants().map(p => p.id === id ? { ...p, ...updates } : p));
};

export const removeGardenPlant = (id: string): void => {
  updateGardenPlant(id, { status: 'removed' });
};

export const isPlantInGarden = (plantId: string): boolean => getGardenPlants().some(p => p.id === plantId);

// ===== Journal Entries CRUD =====
export const getJournalEntries = (plantId?: string): JournalEntry[] => {
  const all = readJSON<JournalEntry[]>(KEYS.journal, []);
  return plantId ? all.filter(e => e.plantId === plantId) : all;
};

export const addJournalEntry = (entry: JournalEntry): void => {
  const entries = readJSON<JournalEntry[]>(KEYS.journal, []);
  entries.push(entry);
  writeJSON(KEYS.journal, entries);
  addXP(XP_VALUES.logEntry);
  if (entry.photoUrl) addXP(XP_VALUES.addPhoto);
  updateStreak();
};

export const deleteJournalEntry = (id: string): void => {
  writeJSON(KEYS.journal, readJSON<JournalEntry[]>(KEYS.journal, []).filter(e => e.id !== id));
};

// ===== Profile & XP =====
const defaultProfile = (): GardenProfile => ({
  xp: 0, level: 1, streakDays: 0, joinedDate: new Date().toISOString(), earnedBadges: [],
});

export const getProfile = (): GardenProfile => readJSON(KEYS.profile, defaultProfile());
const saveProfile = (p: GardenProfile): void => writeJSON(KEYS.profile, p);

export const addXP = (amount: number): void => {
  const p = getProfile();
  p.xp += amount;
  for (const t of LEVEL_THRESHOLDS) { if (p.xp >= t.xp) p.level = t.level; }
  saveProfile(p);
};

export const updateStreak = (): void => {
  const p = getProfile();
  const today = new Date().toISOString().split('T')[0];
  if (p.lastActiveDate === today) return;
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  p.streakDays = p.lastActiveDate === yesterday ? p.streakDays + 1 : 1;
  p.lastActiveDate = today;
  saveProfile(p);
};

export const getLevelName = (level: number): string => {
  if (level <= 5) return 'Seedling';
  if (level <= 15) return 'Sprout';
  if (level <= 30) return 'Sapling';
  if (level <= 50) return 'Growing Tree';
  if (level <= 75) return 'Mature Tree';
  return 'Ancient Forest';
};

export const getXPProgress = (profile: GardenProfile): { current: number; next: number; pct: number } => {
  let cur = 0, nxt = 200;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (profile.xp >= LEVEL_THRESHOLDS[i].xp) {
      cur = LEVEL_THRESHOLDS[i].xp;
      nxt = i + 1 < LEVEL_THRESHOLDS.length ? LEVEL_THRESHOLDS[i + 1].xp : cur + 5000;
    }
  }
  const range = nxt - cur;
  return { current: profile.xp, next: nxt, pct: range > 0 ? Math.min(100, ((profile.xp - cur) / range) * 100) : 100 };
};

// ===== Achievements =====
const POLLINATOR_KEYWORDS = ['butterfly', 'bee', 'lavender', 'sunflower', 'daisy', 'marigold', 'sage', 'salvia', 'coneflower', 'milkweed', 'lilac', 'zinnia', 'cosmos', 'aster', 'monkeyflower', 'buckwheat'];
const TREE_KEYWORDS = ['tree', 'oak', 'maple', 'pine', 'birch', 'palm', 'cedar', 'willow', 'elm', 'toyon', 'sequoia', 'redwood', 'spruce', 'fir'];

export const checkAchievements = (): EarnedBadge[] => {
  const plants = getGardenPlants();
  const entries = getJournalEntries();
  const profile = getProfile();
  const newBadges: EarnedBadge[] = [];

  const pollinatorCount = plants.filter(p => POLLINATOR_KEYWORDS.some(k => p.commonName.toLowerCase().includes(k))).length;
  const treeCount = plants.filter(p => TREE_KEYWORDS.some(k => p.commonName.toLowerCase().includes(k))).length;
  const stats = getGardenStats();
  const healthHits = stats.healthScore >= 80 ? 1 : 0;
  const sharedCount = entries.filter(e => e.notes?.toLowerCase().includes('shared') || e.notes?.toLowerCase().includes('gave')).length;

  const counts: Record<string, number> = {
    'first-seed': plants.length,
    'green-thumb': entries.length,
    'first-bloom': entries.filter(e => e.type === 'first-flower').length,
    'harvest-hero': entries.filter(e => e.type === 'first-harvest').length,
    'streak-master': profile.streakDays,
    'plant-scholar': entries.filter(e => e.type === 'observation').length,
    'water-wise': entries.filter(e => e.type === 'watering').length,
    'measure-master': entries.filter(e => e.type === 'measurement').length,
    'pollinator-friend': pollinatorCount,
    'carbon-champion': treeCount,
    'community-grower': sharedCount,
    'master-gardener': healthHits,
  };

  for (const badge of BADGE_DEFINITIONS) {
    const count = counts[badge.id] || 0;
    for (const t of badge.tiers) {
      if (count >= t.target && !profile.earnedBadges.some(e => e.badgeId === badge.id && e.tier === t.tier)) {
        const earned: EarnedBadge = { badgeId: badge.id, tier: t.tier, earnedDate: new Date().toISOString() };
        profile.earnedBadges.push(earned);
        newBadges.push(earned);
        profile.xp += XP_VALUES.earnBadge;
      }
    }
  }
  if (newBadges.length > 0) {
    for (const t of LEVEL_THRESHOLDS) { if (profile.xp >= t.xp) profile.level = t.level; }
    saveProfile(profile);
  }
  return newBadges;
};

// ===== Water Usage =====
export const getWaterUsage = (): WaterUsage => {
  const entries = getJournalEntries();
  const plants = getGardenPlants().filter(p => p.status === 'active');
  const waterEntries = entries.filter(e => e.type === 'watering' && e.waterAmountLiters);
  const now = Date.now();
  const weekAgo = new Date(now - 7 * 86400000).toISOString();
  const monthAgo = new Date(now - 30 * 86400000).toISOString();

  const allTime = waterEntries.reduce((s, e) => s + (e.waterAmountLiters || 0), 0);
  const thisWeek = waterEntries.filter(e => e.date >= weekAgo).reduce((s, e) => s + (e.waterAmountLiters || 0), 0);
  const thisMonth = waterEntries.filter(e => e.date >= monthAgo).reduce((s, e) => s + (e.waterAmountLiters || 0), 0);

  return {
    thisWeek: Math.round(thisWeek * 10) / 10,
    thisMonth: Math.round(thisMonth * 10) / 10,
    allTime: Math.round(allTime * 10) / 10,
    avgPerPlant: plants.length > 0 ? Math.round((thisMonth / plants.length) * 10) / 10 : 0,
    entryCount: waterEntries.length,
  };
};

// ===== Growth Chart Data =====
export const getGrowthData = (plantId: string): GrowthDataPoint[] => {
  return getJournalEntries(plantId)
    .filter(e => e.measurements && (e.measurements.heightCm != null || e.measurements.spreadCm != null || e.measurements.leafCount != null))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(e => ({
      date: e.date,
      heightCm: e.measurements?.heightCm,
      spreadCm: e.measurements?.spreadCm,
      leafCount: e.measurements?.leafCount,
    }));
};

// ===== Upcoming Tasks =====
export const getUpcomingTasks = (_weather: WeatherData | null): UpcomingTask[] => {
  const plants = getGardenPlants().filter(p => p.status === 'active');
  const entries = getJournalEntries();
  const tasks: UpcomingTask[] = [];

  for (const plant of plants) {
    const plantEntries = entries.filter(e => e.plantId === plant.id);
    const waterings = plantEntries.filter(e => e.type === 'watering').sort((a, b) => b.date.localeCompare(a.date));
    const feedings = plantEntries.filter(e => e.type === 'feeding').sort((a, b) => b.date.localeCompare(a.date));
    const dateAdded = new Date(plant.dateAdded);
    const daysSincePlanted = Math.floor((Date.now() - dateAdded.getTime()) / 86400000);

    // Watering task
    const lastWater = waterings[0]?.date?.split('T')[0];
    const daysSinceWater = lastWater ? Math.floor((Date.now() - new Date(lastWater).getTime()) / 86400000) : 999;
    if (daysSinceWater >= 2) {
      tasks.push({ plantName: plant.commonName, task: 'Needs watering', dueDesc: daysSinceWater > 5 ? 'Overdue!' : 'Today', icon: '💧', priority: daysSinceWater > 5 ? 'high' : 'medium' });
    }

    // Feeding task (every 2 weeks)
    const lastFeed = feedings[0]?.date?.split('T')[0];
    const daysSinceFeed = lastFeed ? Math.floor((Date.now() - new Date(lastFeed).getTime()) / 86400000) : 999;
    if (daysSinceFeed >= 14) {
      tasks.push({ plantName: plant.commonName, task: 'Consider fertilizing', dueDesc: daysSinceFeed > 30 ? 'Overdue' : 'This week', icon: '🧪', priority: daysSinceFeed > 30 ? 'high' : 'low' });
    }

    // Harvest prediction (vegetables after ~60 days)
    const n = plant.commonName.toLowerCase();
    const isVeg = ['tomato', 'pepper', 'bean', 'cucumber', 'lettuce', 'basil', 'herb'].some(v => n.includes(v));
    if (isVeg && daysSincePlanted > 50 && daysSincePlanted < 90 && !plantEntries.some(e => e.type === 'first-harvest')) {
      const daysToHarvest = Math.max(0, 70 - daysSincePlanted);
      tasks.push({ plantName: plant.commonName, task: 'Harvest approaching', dueDesc: daysToHarvest > 0 ? `~${daysToHarvest} days` : 'Ready!', icon: '🍅', priority: daysToHarvest <= 7 ? 'high' : 'medium' });
    }
  }

  // Sort by priority
  const prio = { high: 0, medium: 1, low: 2 };
  return tasks.sort((a, b) => prio[a.priority] - prio[b.priority]).slice(0, 8);
};

// ===== Garden Stats =====
export const getGardenStats = (): GardenStats => {
  const plants = getGardenPlants();
  const entries = getJournalEntries();
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const weekEntries = entries.filter(e => e.date >= weekAgo);
  const active = plants.filter(p => p.status === 'active').length;

  let score = 50;
  if (active > 0) score += 10;
  if (active > 5) score += 10;
  if (weekEntries.length > 0) score += 15;
  if (weekEntries.length > 3) score += 10;
  if (entries.filter(e => e.type === 'watering').length > 0) score += 5;
  score = Math.min(100, score);

  return {
    totalPlants: plants.length, activePlants: active,
    dormantPlants: plants.filter(p => p.status === 'dormant').length,
    removedPlants: plants.filter(p => p.status === 'removed').length,
    totalEntries: entries.length,
    totalWaterings: entries.filter(e => e.type === 'watering').length,
    totalHarvests: entries.filter(e => e.type === 'first-harvest').length,
    healthScore: score, weekEntries,
    waterUsage: getWaterUsage(),
    upcomingTasks: getUpcomingTasks(null),
  };
};

// ===== Watering Plan =====
export const generateWateringPlan = (weather: WeatherData | null): WateringTask[] => {
  const plants = getGardenPlants().filter(p => p.status === 'active');
  const entries = getJournalEntries();

  return plants.map(plant => {
    const waterings = entries.filter(e => e.plantId === plant.id && e.type === 'watering')
      .sort((a, b) => b.date.localeCompare(a.date));
    const lastDate = waterings[0]?.date?.split('T')[0];
    const daysSince = lastDate ? Math.floor((Date.now() - new Date(lastDate).getTime()) / 86400000) : 999;

    const temp = weather?.current?.temperature_2m ?? 25;
    const isRainy = weather?.current?.weather_code ? weather.current.weather_code >= 51 && weather.current.weather_code <= 67 : false;
    const name = plant.commonName.toLowerCase();
    const isCactus = name.includes('cactus') || name.includes('succulent');
    const interval = isCactus ? 10 : temp > 30 ? 1 : temp > 20 ? 2 : 3;
    const needsWater = daysSince >= interval && !isRainy;
    const amount = isCactus ? 0.2 : temp > 30 ? 2.0 : 1.0;

    return {
      plantId: plant.id, plantName: plant.commonName,
      action: needsWater ? 'water' as const : 'skip' as const,
      amountLiters: needsWater ? amount : undefined,
      reason: isRainy ? 'Rain expected — skip today' : daysSince < interval ? `Watered ${daysSince}d ago — OK` : `${daysSince}d since last watering`,
      priority: needsWater && daysSince > interval * 2 ? 'high' as const : needsWater ? 'medium' as const : 'low' as const,
    };
  });
};

// ===== 7-Day Forecast Watering =====
export const generate7DayPlan = (weather: WeatherData | null): { day: string; needsWater: boolean; temp?: number; rain?: boolean }[] => {
  if (!weather?.daily) return [];
  const days: { day: string; needsWater: boolean; temp?: number; rain?: boolean }[] = [];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (let i = 0; i < Math.min(7, weather.daily.temperature_2m_max.length); i++) {
    const d = new Date(Date.now() + i * 86400000);
    const maxT = weather.daily.temperature_2m_max[i];
    const precip = weather.daily.precipitation_sum[i];
    days.push({
      day: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : dayNames[d.getDay()],
      needsWater: precip < 2 && maxT > 15,
      temp: Math.round(maxT),
      rain: precip >= 2,
    });
  }
  return days;
};

// ===== Weather Alerts =====
export const generateWeatherAlerts = (weather: WeatherData | null): WeatherAlert[] => {
  if (!weather) return [];
  const alerts: WeatherAlert[] = [];
  const temp = weather.current.temperature_2m;
  const code = weather.current.weather_code;
  const humidity = weather.current.relative_humidity_2m;

  if (temp > 38) alerts.push({ type: 'heat-wave', severity: 'critical', title: '🔥 Heat Wave Alert',
    description: `Temperature is ${temp}°C. Extreme heat stress on plants.`,
    actions: ['Increase watering frequency', 'Add mulch to retain moisture', 'Move pots to shade'] });
  else if (temp > 32) alerts.push({ type: 'heat-wave', severity: 'warning', title: '☀️ High Temperature',
    description: `Temperature is ${temp}°C. Monitor for wilting.`,
    actions: ['Water in early morning or evening', 'Provide afternoon shade for tender plants'] });

  if (temp < 2) alerts.push({ type: 'frost', severity: 'critical', title: '❄️ Frost Warning',
    description: `Temperature is ${temp}°C. Frost damage is likely.`,
    actions: ['Bring potted plants indoors', 'Cover ground plants with frost cloth', 'Avoid watering tonight'] });

  if (code >= 95) alerts.push({ type: 'storm', severity: 'critical', title: '⛈️ Storm Alert',
    description: 'Thunderstorms expected. Secure plants.',
    actions: ['Secure lightweight pots', 'Clear drainage holes', 'Postpone fertilizing'] });
  else if (code >= 80 && code <= 82) alerts.push({ type: 'storm', severity: 'warning', title: '🌧️ Heavy Rain',
    description: 'Heavy rain showers forecasted.',
    actions: ['Skip manual watering', 'Check drainage'] });

  // Drought detection: low humidity + no rain code + high temp
  if (humidity < 25 && temp > 28 && code <= 3) {
    alerts.push({ type: 'drought', severity: 'warning', title: '🏜️ Dry Conditions',
      description: `Humidity is ${humidity}% with ${temp}°C. Plants may need extra water.`,
      actions: ['Increase watering frequency', 'Apply mulch around plant bases', 'Consider shade cloths for tender plants'] });
  }

  return alerts;
};

// ===== Calendar Events =====
export const generateCalendarEvents = (latitude: number | null): CalendarEvent[] => {
  const plants = getGardenPlants().filter(p => p.status === 'active');
  if (!plants.length || latitude === null) return [];

  const isNorth = latitude >= 0;
  const isTropical = Math.abs(latitude) < 23.5;

  // Estimated frost months for critical-care
  const lastFrostMonth = isNorth ? (Math.abs(latitude) > 40 ? 4 : 2) : (Math.abs(latitude) > 40 ? 10 : 8);
  const firstFrostMonth = isNorth ? (Math.abs(latitude) > 40 ? 9 : 11) : (Math.abs(latitude) > 40 ? 3 : 5);

  return plants.flatMap(plant => {
    const n = plant.commonName.toLowerCase();
    const events: CalendarEvent[] = [];
    const isVeg = ['tomato', 'pepper', 'bean', 'cucumber', 'lettuce', 'carrot', 'basil', 'herb', 'spinach', 'pea'].some(v => n.includes(v));
    const isTree = ['tree', 'oak', 'maple', 'pine', 'birch', 'palm'].some(v => n.includes(v));
    const isFlower = ['rose', 'lily', 'daisy', 'sunflower', 'tulip', 'marigold', 'lavender', 'orchid'].some(v => n.includes(v));

    if (isTropical) {
      events.push({ plantName: plant.commonName, type: 'growing', monthStart: 0, monthEnd: 11, color: 'bg-emerald-400', label: 'Year-round Growing' });
    } else if (isNorth) {
      if (isVeg) {
        events.push({ plantName: plant.commonName, type: 'seed-start', monthStart: 1, monthEnd: 2, color: 'bg-purple-500', label: 'Start Seeds Indoors' });
        events.push({ plantName: plant.commonName, type: 'transplant', monthStart: 3, monthEnd: 4, color: 'bg-blue-500', label: 'Transplant Outdoors' });
        events.push({ plantName: plant.commonName, type: 'growing', monthStart: 4, monthEnd: 8, color: 'bg-emerald-400', label: 'Active Growing' });
        events.push({ plantName: plant.commonName, type: 'harvest', monthStart: 6, monthEnd: 9, color: 'bg-amber-500', label: 'Harvest Window' });
      } else if (isTree) {
        events.push({ plantName: plant.commonName, type: 'dormancy', monthStart: 11, monthEnd: 2, color: 'bg-gray-400', label: 'Dormancy' });
        events.push({ plantName: plant.commonName, type: 'growing', monthStart: 3, monthEnd: 10, color: 'bg-emerald-400', label: 'Growing Season' });
      } else if (isFlower) {
        events.push({ plantName: plant.commonName, type: 'direct-sow', monthStart: 2, monthEnd: 3, color: 'bg-green-600', label: 'Sow / Plant' });
        events.push({ plantName: plant.commonName, type: 'growing', monthStart: 3, monthEnd: 9, color: 'bg-emerald-400', label: 'Growing' });
        events.push({ plantName: plant.commonName, type: 'bloom', monthStart: 5, monthEnd: 8, color: 'bg-pink-500', label: 'Bloom Period' });
      } else {
        events.push({ plantName: plant.commonName, type: 'direct-sow', monthStart: 3, monthEnd: 4, color: 'bg-green-600', label: 'Plant' });
        events.push({ plantName: plant.commonName, type: 'growing', monthStart: 4, monthEnd: 9, color: 'bg-emerald-400', label: 'Growing' });
      }
      // Critical care: frost protection
      if (!isTropical) {
        events.push({ plantName: plant.commonName, type: 'critical-care', monthStart: firstFrostMonth, monthEnd: firstFrostMonth, color: 'bg-red-500', label: 'Frost Protection' });
        events.push({ plantName: plant.commonName, type: 'critical-care', monthStart: lastFrostMonth, monthEnd: lastFrostMonth, color: 'bg-red-500', label: 'Last Frost Care' });
      }
    } else {
      events.push({ plantName: plant.commonName, type: 'direct-sow', monthStart: 9, monthEnd: 10, color: 'bg-green-600', label: 'Plant' });
      events.push({ plantName: plant.commonName, type: 'growing', monthStart: 10, monthEnd: 3, color: 'bg-emerald-400', label: 'Growing' });
      if (!isTropical) {
        events.push({ plantName: plant.commonName, type: 'critical-care', monthStart: firstFrostMonth, monthEnd: firstFrostMonth, color: 'bg-red-500', label: 'Frost Protection' });
      }
    }
    return events;
  });
};

// ===== Seasonal Challenge Progress =====
export const getCurrentSeason = (): Season => {
  const m = new Date().getMonth();
  if (m >= 2 && m <= 4) return 'spring';
  if (m >= 5 && m <= 7) return 'summer';
  if (m >= 8 && m <= 10) return 'autumn';
  return 'winter';
};

export const getSeasonalChallengeProgress = (): { challenge: typeof SEASONAL_CHALLENGES[0]; progress: number; completed: boolean }[] => {
  const season = getCurrentSeason();
  const plants = getGardenPlants();
  const entries = getJournalEntries();
  const profile = getProfile();

  // Filter entries from this season
  const m = new Date().getMonth();
  const seasonStart = m >= 2 && m <= 4 ? 2 : m >= 5 && m <= 7 ? 5 : m >= 8 && m <= 10 ? 8 : 11;
  const seasonStartDate = new Date(new Date().getFullYear(), seasonStart, 1).toISOString();
  const seasonEntries = entries.filter(e => e.date >= seasonStartDate);
  const seasonPlants = plants.filter(p => p.dateAdded >= seasonStartDate);

  return SEASONAL_CHALLENGES.filter(c => c.season === season).map(challenge => {
    let progress = 0;
    switch (challenge.metric) {
      case 'plants-added': progress = seasonPlants.length; break;
      case 'entries-logged': progress = seasonEntries.length; break;
      case 'waterings': progress = seasonEntries.filter(e => e.type === 'watering').length; break;
      case 'harvests': progress = seasonEntries.filter(e => e.type === 'first-harvest').length; break;
      case 'streak': progress = profile.streakDays; break;
    }
    return { challenge, progress, completed: progress >= challenge.target };
  });
};

// ===== AI Garden Insights =====
export const buildInsightPrompt = (plantName?: string): string => {
  const plants = getGardenPlants().filter(p => p.status === 'active');
  const entries = plantName
    ? getJournalEntries().filter(e => plants.find(p => p.id === e.plantId && p.commonName === plantName))
    : getJournalEntries();
  const profile = getProfile();

  const plantSummary = plants.map(p => `- ${p.commonName}${p.scientificName ? ` (${p.scientificName})` : ''}, status: ${p.status}, added: ${new Date(p.dateAdded).toLocaleDateString()}`).join('\n');

  const recentEntries = entries
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 20)
    .map(e => {
      const plant = plants.find(p => p.id === e.plantId);
      let line = `[${new Date(e.date).toLocaleDateString()}] ${plant?.commonName || 'Unknown'}: ${e.type} — "${e.title}"`;
      if (e.measurements?.heightCm) line += `, height: ${e.measurements.heightCm}cm`;
      if (e.waterAmountLiters) line += `, water: ${e.waterAmountLiters}L`;
      if (e.weatherSnapshot) line += `, weather: ${e.weatherSnapshot.temperature}°C, ${e.weatherSnapshot.humidity}% humidity`;
      if (e.notes) line += `, notes: "${e.notes}"`;
      return line;
    }).join('\n');

  return `You are an expert gardener AI assistant. Analyze this garden journal data and provide 3-4 brief, specific, actionable insights. Keep each insight to 1-2 sentences. Be specific to the actual plants and data shown.

Garden Summary:
- ${plants.length} plants, ${entries.length} journal entries
- Gardener level: ${profile.level} (${getLevelName(profile.level)})
- Streak: ${profile.streakDays} days

Plants:
${plantSummary || 'No plants yet'}

Recent Journal Entries:
${recentEntries || 'No entries yet'}

Provide insights about:
1. Growth patterns and recommendations
2. Watering optimization
3. Seasonal care tips
4. Any concerns based on the data

Format each insight as a short paragraph starting with an emoji. Keep the total response under 300 words.`;
};
