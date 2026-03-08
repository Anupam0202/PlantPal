import React, { useState, useMemo, useCallback } from 'react';
import { Button } from './common/Button';
import { getGardenPlants } from '../services/gardenService';
import { getGardenInsights, QuotaExceededError } from '../services/geminiService';
import type { LocationData } from '../types';

const HARVEST_KEY = 'plantpal-harvests';

interface HarvestEntry {
  id: string; plantName: string; harvestedAt: string;
  quantity: number; unit: string; notes: string;
}

const readHarvests = (): HarvestEntry[] => { try { return JSON.parse(localStorage.getItem(HARVEST_KEY) || '[]'); } catch { return []; } };
const writeHarvests = (h: HarvestEntry[]) => { try { localStorage.setItem(HARVEST_KEY, JSON.stringify(h)); } catch {} };

// Edible plant data: days to maturity, harvest guidance, storage tips, nutrition
const EDIBLE_DATA: Record<string, { daysToMaturity: number; harvestTip: string; storage: string; nutrition: string; recipes: string[]; emoji: string }> = {
  tomato: { daysToMaturity: 70, harvestTip: 'Pick when fully colored but slightly firm. Twist gently — should detach easily from stem.', storage: 'Room temp for flavor (1 wk). Refrigerate only if overripe.', nutrition: 'Rich in lycopene, Vitamin C, potassium', recipes: ['Caprese Salad', 'Marinara Sauce', 'Bruschetta', 'Sun-Dried Tomatoes', 'Gazpacho'], emoji: '🍅' },
  pepper: { daysToMaturity: 65, harvestTip: 'Can harvest green or wait until fully colored for maximum sweetness.', storage: 'Refrigerate in produce bag (1-2 weeks). Freeze chopped for months.', nutrition: 'Very high in Vitamin C, Vitamin A', recipes: ['Stuffed Peppers', 'Stir Fry', 'Roasted Pepper Soup', 'Fajitas'], emoji: '🌶️' },
  basil: { daysToMaturity: 25, harvestTip: 'Pinch from the top to encourage bushier growth. Never remove more than 1/3 at once.', storage: 'Keep stems in water at room temperature. Freezes well in olive oil.', nutrition: 'Vitamin K, antioxidants, anti-inflammatory', recipes: ['Pesto', 'Caprese Salad', 'Thai Basil Chicken', 'Infused Water'], emoji: '🌿' },
  lettuce: { daysToMaturity: 45, harvestTip: 'Cut outer leaves from the base, leaving center to regrow (cut-and-come-again method).', storage: 'Wash, dry, wrap in towel. Refrigerate in sealed container (5-7 days).', nutrition: 'Vitamin A, Vitamin K, folate', recipes: ['Garden Salad', 'Lettuce Wraps', 'Caesar Salad', 'BLT Sandwich'], emoji: '🥬' },
  carrot: { daysToMaturity: 75, harvestTip: 'Harvest when tops are finger-thick. They sweeten after light frost. Loosen soil, pull gently.', storage: 'Remove greens. Store in sand or refrigerate in damp towel (2-3 weeks).', nutrition: 'Very high in Vitamin A (beta-carotene), fiber', recipes: ['Carrot Soup', 'Roasted Carrots', 'Carrot Cake', 'Pickled Carrots', 'Juice'], emoji: '🥕' },
  spinach: { daysToMaturity: 40, harvestTip: 'Pick outer leaves when at least 5cm long. Bolts in heat — harvest before flowering.', storage: 'Refrigerate unwashed in bag (5-7 days). Blanch and freeze for months.', nutrition: 'Iron, folate, Vitamin K, Vitamin C', recipes: ['Palak Paneer', 'Spinach Smoothie', 'Sautéed Spinach', 'Spinach Dip'], emoji: '🍃' },
  mint: { daysToMaturity: 20, harvestTip: 'Cut stems just above a leaf node. Harvest regularly to prevent legginess.', storage: 'Stems in water (1 week). Dry or freeze in ice cubes for months.', nutrition: 'Menthol, antioxidants, digestive support', recipes: ['Mint Chutney', 'Mojito', 'Mint Tea', 'Raita', 'Fruit Salad'], emoji: '🌿' },
  cucumber: { daysToMaturity: 55, harvestTip: 'Pick when firm and 15-20cm. Harvest frequently — overripe ones inhibit new fruit.', storage: 'Wrap individually. Refrigerate (1 week). Best eaten fresh.', nutrition: 'Hydrating, Vitamin K, potassium', recipes: ['Cucumber Salad', 'Pickles', 'Tzatziki', 'Cucumber Water'], emoji: '🥒' },
  rosemary: { daysToMaturity: 30, harvestTip: 'Snip sprigs from stem tips. Best harvested in the morning when oils are concentrated.', storage: 'Wrap in damp paper towel, refrigerate (2 weeks). Dries beautifully.', nutrition: 'Antioxidants, anti-inflammatory, iron', recipes: ['Rosemary Focaccia', 'Herb Butter', 'Roasted Potatoes', 'Infused Oil'], emoji: '🌿' },
  bean: { daysToMaturity: 55, harvestTip: 'Pick when pods are firm but snap cleanly. Don\'t wait for seeds to bulge.', storage: 'Refrigerate unwashed (1 week). Blanch and freeze for months.', nutrition: 'Protein, fiber, folate, iron', recipes: ['Stir-Fried Beans', 'Bean Salad', 'Bean Soup', 'Green Bean Casserole'], emoji: '🫘' },
  pea: { daysToMaturity: 60, harvestTip: 'Pick when pods are plump for shelling peas, or flat for snow peas.', storage: 'Best eaten immediately. Blanch and freeze within hours of picking.', nutrition: 'Protein, Vitamin C, fiber, iron', recipes: ['Pea Soup', 'Matar Paneer', 'Stir-Fried Peas', 'Pea Risotto'], emoji: '🟢' },
  onion: { daysToMaturity: 100, harvestTip: 'Harvest when tops fall over and brown. Let cure in sun for 2-3 days.', storage: 'Cool, dry, ventilated area. Do NOT refrigerate. Lasts 2-3 months.', nutrition: 'Quercetin, Vitamin C, prebiotic fiber', recipes: ['Onion Rings', 'French Onion Soup', 'Caramelized Onions', 'Bhaji'], emoji: '🧅' },
};

const EDIBLE_KEYWORDS = Object.keys(EDIBLE_DATA);

interface Props { onBack: () => void; location: LocationData | null; onQuotaError?: (msg?: string) => void; envProfile?: import('../types').EnvironmentalProfile | null; }

export const HarvestTracker: React.FC<Props> = ({ onBack, location, onQuotaError, envProfile }) => {
  const plants = useMemo(() => getGardenPlants().filter(p => p.status === 'active'), []);
  const [harvests, setHarvests] = useState<HarvestEntry[]>(() => readHarvests());
  const [tab, setTab] = useState<'calendar' | 'log' | 'recipes'>('calendar');
  const [aiRecipes, setAiRecipes] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [logForm, setLogForm] = useState({ plantName: '', quantity: 0, unit: 'kg', notes: '' });

  // Identify edible plants in garden
  const edibles = useMemo(() => {
    return plants.map(p => {
      const nm = p.commonName.toLowerCase();
      const match = EDIBLE_KEYWORDS.find(k => nm.includes(k));
      if (!match) return null;
      const data = EDIBLE_DATA[match];
      const plantedAt = p.dateAdded ? new Date(p.dateAdded) : new Date(Date.now() - 30 * 86400000);
      const daysGrown = Math.round((Date.now() - plantedAt.getTime()) / 86400000);
      const daysLeft = Math.max(0, data.daysToMaturity - daysGrown);
      const estimatedDate = new Date(plantedAt.getTime() + data.daysToMaturity * 86400000);
      const isReady = daysLeft === 0;
      return { plant: p, edibleKey: match, data, daysGrown, daysLeft, estimatedDate, isReady };
    }).filter(Boolean) as { plant: typeof plants[0]; edibleKey: string; data: typeof EDIBLE_DATA[string]; daysGrown: number; daysLeft: number; estimatedDate: Date; isReady: boolean }[];
  }, [plants]);

  const readyCount = edibles.filter(e => e.isReady).length;

  // Nutrition summary from harvest log
  const nutrition = useMemo(() => {
    const weekAgo = Date.now() - 7 * 86400000;
    const recent = harvests.filter(h => new Date(h.harvestedAt).getTime() > weekAgo);
    return { totalKg: recent.reduce((s, h) => s + h.quantity, 0), count: recent.length, unique: new Set(recent.map(h => h.plantName)).size };
  }, [harvests]);

  const logHarvest = useCallback(() => {
    if (!logForm.plantName.trim() || logForm.quantity <= 0) return;
    const entry: HarvestEntry = { id: `h-${Date.now()}`, ...logForm, harvestedAt: new Date().toISOString() };
    const updated = [...harvests, entry];
    setHarvests(updated); writeHarvests(updated);
    setLogForm({ plantName: '', quantity: 0, unit: 'kg', notes: '' });
  }, [logForm, harvests]);

  const getRecipes = useCallback(async () => {
    setAiLoading(true);
    try {
      const readyPlants = edibles.filter(e => e.isReady).map(e => e.plant.commonName);
      const recentHarvest = harvests.slice(-5).map(h => h.plantName);
      const allAvailable = [...new Set([...readyPlants, ...recentHarvest])];
      const envContext = envProfile?.historicalClimate 
        ? `Local season context: ~${envProfile.historicalClimate.frostDates.growingSeasonDays} growing days/year. First fall frost: ${envProfile.historicalClimate.frostDates.firstFallFrost}. ` 
        : '';
      const prompt = `You are a chef and nutritionist. A home gardener has these fresh ingredients available from their garden: ${allAvailable.join(', ') || 'various herbs and vegetables'}.
Location: ${location?.name || 'Unknown'}. ${envContext}

Provide:
1. 🥗 3 recipe suggestions using ONLY their garden ingredients (name the recipe, list ingredients highlighting garden-grown ones with 🌿, give brief steps, prep time, difficulty)
2. 📊 Nutritional highlights of cooking with these home-grown ingredients
3. 🥫 1 preservation idea if there's excess produce
4. 💡 A tip about maximizing freshness from garden to table

Keep under 300 words. Use emojis.`;
      setAiRecipes(await getGardenInsights(prompt));
    } catch (err) { if (err instanceof QuotaExceededError) { onQuotaError?.(err.message); } setAiRecipes('Unable to generate recipes. Try again.'); }
    finally { setAiLoading(false); }
  }, [edibles, harvests, location]);

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2"><span>🥗</span> Harvest Tracker</h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">From garden to table</p>
        </div>
       <Button onClick={onBack} variant="outline" size="sm">← Back</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { icon: '🌱', val: edibles.length, label: 'Edible Plants' },
          { icon: '✅', val: readyCount, label: 'Ready Now' },
          { icon: '📊', val: `${nutrition.totalKg.toFixed(1)} kg`, label: 'Harvested (7d)' },
        ].map(s => (
          <div key={s.label} className="p-3 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 text-center">
            <p className="text-lg">{s.icon}</p>
            <p className="text-base font-bold text-slate-700 dark:text-slate-200">{s.val}</p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-700/30 rounded-lg p-1">
        {([['calendar', '📅 Calendar'], ['log', '📝 Harvest Log'], ['recipes', '🍳 Recipes']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex-1 text-xs py-2 rounded-md transition-all ${tab === id ? 'bg-white dark:bg-slate-800 shadow-sm font-semibold text-slate-700 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'calendar' && (
        <div className="space-y-3">
          {edibles.length === 0 ? (
            <div className="text-center py-10 bg-slate-50 dark:bg-slate-800/50 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600">
              <span className="text-5xl block mb-3">🥬</span>
              <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200">No edible plants found</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Add vegetables, herbs, or fruit to your garden.</p>
            </div>
          ) : (
            <>
              {/* Ready Now */}
              {edibles.filter(e => e.isReady).length > 0 && (
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl p-4 border border-green-200 dark:border-green-800">
                  <h3 className="text-sm font-semibold text-green-700 dark:text-green-400 mb-2">✅ Ready to Harvest!</h3>
                  {edibles.filter(e => e.isReady).map(e => (
                    <div key={e.edibleKey} className="p-2.5 bg-white/60 dark:bg-slate-800/40 rounded-lg mb-1.5">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">{e.data.emoji}</span>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{e.plant.commonName}</span>
                        <span className="text-[10px] text-green-500 ml-auto">🟢 Ready</span>
                      </div>
                      <p className="text-[10px] text-slate-600 dark:text-slate-300"><strong>How to pick:</strong> {e.data.harvestTip}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5"><strong>Storage:</strong> {e.data.storage}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Coming Soon */}
              {edibles.filter(e => !e.isReady).length > 0 && (
                <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">⏳ Coming Soon</h3>
                  {edibles.filter(e => !e.isReady).sort((a, b) => a.daysLeft - b.daysLeft).map(e => (
                    <div key={e.edibleKey} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-700/20 mb-1">
                      <span className="text-lg">{e.data.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-700 dark:text-slate-200">{e.plant.commonName}</p>
                        <p className="text-[10px] text-slate-400">{e.daysGrown} days grown · ~{e.daysLeft} days left</p>
                      </div>
                      <div className="w-16 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${Math.min(100, (e.daysGrown / e.data.daysToMaturity) * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Nutrition Info */}
              <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">🧬 Nutritional Highlights</h3>
                <div className="space-y-1.5">
                  {edibles.slice(0, 6).map(e => (
                    <div key={e.edibleKey} className="flex items-start gap-2 text-[10px] text-slate-600 dark:text-slate-300">
                      <span>{e.data.emoji}</span>
                      <span className="font-medium w-16 flex-shrink-0">{e.plant.commonName}</span>
                      <span className="text-slate-400">{e.data.nutrition}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'log' && (
        <div className="space-y-3">
          {/* Log Entry Form */}
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm space-y-2.5">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">📝 Log a Harvest</h3>
            <div className="flex gap-2">
              <select value={logForm.plantName} onChange={e => setLogForm({ ...logForm, plantName: e.target.value })}
                className="flex-1 text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200">
                <option value="">Select plant...</option>
                {edibles.map(e => <option key={e.edibleKey} value={e.plant.commonName}>{e.data.emoji} {e.plant.commonName}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <input type="number" min={0} step={0.1} value={logForm.quantity || ''} onChange={e => setLogForm({ ...logForm, quantity: Number(e.target.value) })} placeholder="Qty"
                className="flex-1 text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200" />
              <select value={logForm.unit} onChange={e => setLogForm({ ...logForm, unit: e.target.value })}
                className="w-20 text-xs px-2 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200">
                {['kg', 'g', 'pieces', 'bunches'].map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <input value={logForm.notes} onChange={e => setLogForm({ ...logForm, notes: e.target.value })} placeholder="Notes (optional)"
              className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200" />
            <button onClick={logHarvest} disabled={!logForm.plantName || logForm.quantity <= 0}
              className="w-full py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold disabled:opacity-50 transition-colors">🥕 Log Harvest</button>
          </div>

          {/* History */}
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">📜 Harvest History</h3>
            {harvests.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-4 text-center">No harvests logged yet.</p>
            ) : (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {[...harvests].reverse().map(h => (
                  <div key={h.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-700/20 text-xs">
                    <div>
                      <span className="font-medium text-slate-700 dark:text-slate-200">{h.plantName}</span>
                      <span className="text-slate-400 ml-1">{h.quantity} {h.unit}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400">{new Date(h.harvestedAt).toLocaleDateString()}</span>
                      <button onClick={() => { const u = harvests.filter(x => x.id !== h.id); setHarvests(u); writeHarvests(u); }}
                        className="text-red-400 text-[10px]">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Weekly summary */}
          {nutrition.count > 0 && (
            <div className="bg-gradient-to-r from-green-50 to-lime-50 dark:from-green-900/20 dark:to-lime-900/20 rounded-xl p-4 border border-green-200 dark:border-green-800">
              <h3 className="text-sm font-semibold text-green-700 dark:text-green-400 mb-1">📊 This Week's Harvest</h3>
              <p className="text-xs text-slate-600 dark:text-slate-300">{nutrition.totalKg.toFixed(1)} kg from {nutrition.unique} different plants in {nutrition.count} harvests.</p>
            </div>
          )}
        </div>
      )}

      {tab === 'recipes' && (
        <div className="space-y-3">
          {/* Quick Recipe Cards */}
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">🍳 Quick Ideas</h3>
            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {edibles.slice(0, 8).map(e => (
                <div key={e.edibleKey} className="p-2 rounded-lg bg-slate-50 dark:bg-slate-700/20">
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-200">{e.data.emoji} {e.plant.commonName}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {e.data.recipes.map(r => (
                      <span key={r} className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400">{r}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* AI Recipes */}
          <div className="bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 rounded-xl p-4 sm:p-5 border border-orange-200 dark:border-orange-800 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-orange-700 dark:text-orange-400">🧑‍🍳 AI Recipe & Nutrition Engine</h3>
              <button onClick={getRecipes} disabled={aiLoading}
                className="text-xs px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50 transition-colors min-h-[32px]">
                {aiLoading ? '⏳ Cooking...' : aiRecipes ? '🔄 Refresh' : '🍳 Get Recipes'}
              </button>
            </div>
            {aiRecipes ? (
              <div className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">{aiRecipes}</div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400 italic">Get AI-powered recipes based on what's ready in your garden.</p>
            )}
          </div>

          {/* Preservation Guide */}
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">🥫 Storage & Preservation</h3>
            <div className="space-y-1.5">
              {edibles.filter(e => e.isReady).slice(0, 5).map(e => (
                <div key={e.edibleKey} className="text-[10px] text-slate-600 dark:text-slate-300 p-2 rounded-lg bg-slate-50 dark:bg-slate-700/20">
                  <span className="font-medium">{e.data.emoji} {e.plant.commonName}:</span> {e.data.storage}
                </div>
              ))}
              {edibles.filter(e => e.isReady).length === 0 && (
                <p className="text-xs text-slate-400 italic">No plants ready yet — storage tips will appear when crops mature.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
