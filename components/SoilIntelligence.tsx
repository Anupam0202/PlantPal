import React, { useState, useCallback } from 'react';
import { Button } from './common/Button';
import { analyzeImageWithAI, getGardenInsights, QuotaExceededError } from '../services/geminiService';
import type { SoilProfile } from '../types';

const STORAGE_KEY = 'plantpal-soil-profiles';
const readProfiles = (): SoilProfile[] => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; } };
const saveProfiles = (p: SoilProfile[]) => localStorage.setItem(STORAGE_KEY, JSON.stringify(p));

type SoilTab = 'photo' | 'diy' | 'lab' | 'plan';
type DIYTest = 'jar' | 'squeeze' | 'ph' | 'drainage';

const DIY_GUIDES: Record<DIYTest, { title: string; icon: string; steps: string[]; question: string; options: { label: string; value: string }[] }> = {
  jar: { title: 'Jar Test', icon: '🫙', steps: ['Fill a clear jar 1/3 with soil', 'Add water to near the top', 'Shake vigorously for 2 minutes', 'Let it settle for 24 hours', 'Measure the 3 layers: sand (bottom), silt (middle), clay (top)'],
    question: 'Which layer is thickest?', options: [{ label: 'Bottom (Sandy soil)', value: 'Sandy' }, { label: 'Middle (Silty soil)', value: 'Silty' }, { label: 'Top (Clay soil)', value: 'Clay' }, { label: 'Even layers (Loam)', value: 'Loamy' }] },
  squeeze: { title: 'Squeeze Test', icon: '✊', steps: ['Take a handful of moist soil', 'Squeeze it firmly in your fist', 'Open your hand and observe'],
    question: 'What happened?', options: [{ label: 'Crumbles apart immediately → Sandy', value: 'Sandy' }, { label: 'Holds shape, feels gritty → Loamy', value: 'Loamy' }, { label: 'Holds shape, smooth/sticky → Clay', value: 'Clay' }, { label: 'Spongy, dark, lots of fibres → Peaty', value: 'Peaty' }] },
  ph: { title: 'pH Test', icon: '🧪', steps: ['Buy a soil pH test kit from a garden store', 'Follow the kit instructions', 'Compare the colour to the chart', 'Enter the reading below'],
    question: 'What pH did you get?', options: [{ label: 'Below 5.5 (Very Acidic)', value: '5.0' }, { label: '5.5–6.5 (Slightly Acidic — ideal)', value: '6.0' }, { label: '6.5–7.0 (Neutral)', value: '6.8' }, { label: '7.0–7.5 (Slightly Alkaline)', value: '7.2' }, { label: 'Above 7.5 (Alkaline)', value: '7.8' }] },
  drainage: { title: 'Drainage Test', icon: '💧', steps: ['Dig a hole 30cm deep × 30cm wide', 'Fill it completely with water', 'Let it drain, then fill again', 'Time how long the second fill takes to drain'],
    question: 'How long did it take?', options: [{ label: 'Under 30 minutes (Fast drainage)', value: 'Fast — sandy/gravelly soil' }, { label: '30 min – 4 hours (Good drainage)', value: 'Good — loamy soil' }, { label: '4+ hours (Poor drainage)', value: 'Poor — clay/compacted soil' }, { label: 'Still water after 12 hours', value: 'Very poor — heavy clay or hardpan' }] },
};

interface Props { onBack: () => void; onQuotaError?: (msg?: string) => void; envProfile?: import('../types').EnvironmentalProfile | null; }

export const SoilIntelligence: React.FC<Props> = ({ onBack, onQuotaError, envProfile }) => {
  const [activeTab, setActiveTab] = useState<SoilTab>('photo');
  const [profiles, setProfiles] = useState<SoilProfile[]>(readProfiles);

  // Auto-populate SoilGrids data as a "remote analysis" profile if available and no profiles exist yet
  const sg = envProfile?.soilGrids;
  const sc = envProfile?.soilConditions;

  // Photo tab
  const [imageData, setImageData] = useState<string | null>(null);
  const [imgMime, setImgMime] = useState('image/jpeg');
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoResult, setPhotoResult] = useState<string | null>(null);

  // DIY tab
  const [activeDIY, setActiveDIY] = useState<DIYTest>('jar');
  const [diyAnswer, setDiyAnswer] = useState<string | null>(null);
  const [diyStep, setDiyStep] = useState<'guide' | 'answer' | 'result'>('guide');

  // Lab tab
  const [labPH, setLabPH] = useState('');
  const [labN, setLabN] = useState('');
  const [labP, setLabP] = useState('');
  const [labK, setLabK] = useState('');
  const [labOM, setLabOM] = useState('');
  const [labSaved, setLabSaved] = useState(false);

  // Plan tab
  const [planLoading, setPlanLoading] = useState(false);
  const [plan, setPlan] = useState<string | null>(null);

  const handlePhotoFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) return;
    setImgMime(file.type);
    const reader = new FileReader();
    reader.onload = () => { setImageData((reader.result as string).split(',')[1]); setPhotoResult(null); };
    reader.readAsDataURL(file);
  }, []);

  const analyzePhoto = useCallback(async () => {
    if (!imageData) return;
    setPhotoLoading(true);
    try {
      const prompt = `You are an expert soil scientist. Analyze this soil photo and estimate:
- Soil type (Sandy, Silty, Clay, Loam, or combination)
- Organic matter content (Low, Moderate, High) based on color
- Moisture level (Dry, Moist, Wet)
- Visible compaction or structure
- Presence of stones, roots, or debris

Be transparent about confidence: "Based on visual analysis only. For precise results, a lab test is recommended."
Provide plant recommendations suited to this soil type.
Keep response under 250 words. Use emojis.`;
      const result = await analyzeImageWithAI(imageData, imgMime, prompt);
      setPhotoResult(result);
      const profile: SoilProfile = { id: `sp-${Date.now()}`, createdAt: new Date().toISOString(), method: 'photo-ai', aiAnalysis: result };
      const updated = [profile, ...profiles].slice(0, 20);
      setProfiles(updated);
      saveProfiles(updated);
    } catch (err) { if (err instanceof QuotaExceededError) { onQuotaError?.(err.message); } setPhotoResult('Unable to analyze soil photo. Please try again.'); }
    finally { setPhotoLoading(false); }
  }, [imageData, imgMime, profiles]);

  const saveDIYResult = useCallback(() => {
    if (!diyAnswer) return;
    const method = activeDIY === 'jar' || activeDIY === 'squeeze' ? (`diy-${activeDIY}` as SoilProfile['method']) : activeDIY === 'ph' ? 'diy-ph' : 'diy-drainage';
    const profile: SoilProfile = {
      id: `sp-${Date.now()}`, createdAt: new Date().toISOString(), method,
      soilType: activeDIY !== 'ph' && activeDIY !== 'drainage' ? diyAnswer : undefined,
      ph: activeDIY === 'ph' ? parseFloat(diyAnswer) : undefined,
      drainage: activeDIY === 'drainage' ? diyAnswer : undefined,
      notes: `${DIY_GUIDES[activeDIY].title}: ${diyAnswer}`,
    };
    const updated = [profile, ...profiles].slice(0, 20);
    setProfiles(updated);
    saveProfiles(updated);
    setDiyStep('result');
  }, [diyAnswer, activeDIY, profiles]);

  const saveLabResults = useCallback(() => {
    const profile: SoilProfile = {
      id: `sp-${Date.now()}`, createdAt: new Date().toISOString(), method: 'professional',
      ph: labPH ? parseFloat(labPH) : undefined,
      nutrients: (labN || labP || labK) ? { nitrogen: labN || 'unknown', phosphorus: labP || 'unknown', potassium: labK || 'unknown' } : undefined,
      organicMatter: labOM || undefined,
    };
    const updated = [profile, ...profiles].slice(0, 20);
    setProfiles(updated);
    saveProfiles(updated);
    setLabSaved(true);
    setTimeout(() => setLabSaved(false), 3000);
  }, [labPH, labN, labP, labK, labOM, profiles]);

  const generatePlan = useCallback(async () => {
    setPlanLoading(true);
    try {
      const profileSummary = profiles.slice(0, 5).map((p) => {
        const parts = [`Method: ${p.method}`];
        if (p.soilType) parts.push(`Type: ${p.soilType}`);
        if (p.ph) parts.push(`pH: ${p.ph}`);
        if (p.drainage) parts.push(`Drainage: ${p.drainage}`);
        if (p.organicMatter) parts.push(`Organic matter: ${p.organicMatter}`);
        if (p.nutrients) parts.push(`NPK: N=${p.nutrients.nitrogen}, P=${p.nutrients.phosphorus}, K=${p.nutrients.potassium}`);
        if (p.aiAnalysis) parts.push(`AI notes: ${p.aiAnalysis.substring(0, 100)}...`);
        return parts.join(', ');
      }).join('\n');

      const prompt = `You are a soil science expert. Based on these soil analysis results, create a soil improvement plan.

Soil Profiles:
${profileSummary || 'No soil data yet — provide general advice for a beginner gardener.'}

Provide:
1. 🌍 Overall soil assessment
2. 🧪 Amendments to add (compost, sand, lime, sulfur, etc.) with amounts per sq meter
3. 📅 When to apply each amendment
4. 🌱 Plants that would thrive in this soil
5. ⏱️ Expected improvement timeline

Keep response under 300 words.`;
      const result = await getGardenInsights(prompt);
      setPlan(result);
    } catch (err) { if (err instanceof QuotaExceededError) { onQuotaError?.(err.message); } setPlan('Unable to generate improvement plan. Please try again.'); }
    finally { setPlanLoading(false); }
  }, [profiles]);

  const tabs: { id: SoilTab; label: string; icon: string }[] = [
    { id: 'photo', label: 'Photo AI', icon: '📷' },
    { id: 'diy', label: 'DIY Tests', icon: '🔬' },
    { id: 'lab', label: 'Lab Results', icon: '📋' },
    { id: 'plan', label: 'Improve', icon: '📈' },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2"><span>🧪</span> Soil Intelligence</h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">Analyze your soil to get better plant recommendations</p>
        </div>
        <Button onClick={onBack} variant="outline" size="sm">← Back</Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl overflow-x-auto scrollbar-thin">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex-1 min-w-[70px] flex items-center justify-center gap-1 px-2 sm:px-4 py-2.5 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap min-h-[44px] ${
              activeTab === t.id ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm ring-1 ring-emerald-200 dark:ring-emerald-800' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}>
            <span>{t.icon}</span><span className="hidden xs:inline sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Saved profiles count */}
      {profiles.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800">
          <span className="text-xs text-emerald-700 dark:text-emerald-400">📊 {profiles.length} soil analysis {profiles.length === 1 ? 'record' : 'records'} saved</span>
        </div>
      )}

      {/* SoilGrids Satellite Data Banner */}
      {sg && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-800">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🛰️</span>
            <div>
              <h3 className="font-semibold text-amber-800 dark:text-amber-200 text-sm">Satellite Soil Analysis</h3>
              <p className="text-[10px] text-amber-600 dark:text-amber-400">From ISRIC SoilGrids (250m resolution) — your exact coordinates</p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="p-2 bg-white/60 dark:bg-slate-800/60 rounded-lg text-center">
              <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">Soil Type</p>
              <p className="font-bold text-sm text-amber-900 dark:text-amber-100">{sg.soilClass}</p>
            </div>
            <div className="p-2 bg-white/60 dark:bg-slate-800/60 rounded-lg text-center">
              <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">pH</p>
              <p className="font-bold text-sm text-amber-900 dark:text-amber-100">{sg.ph.toFixed(1)}</p>
              <p className="text-[9px] text-amber-500">{sg.ph < 6 ? 'Acidic' : sg.ph > 7.5 ? 'Alkaline' : 'Neutral'}</p>
            </div>
            <div className="p-2 bg-white/60 dark:bg-slate-800/60 rounded-lg text-center">
              <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">Texture</p>
              <p className="text-[10px] font-bold text-amber-900 dark:text-amber-100">Sand {sg.sand.toFixed(0)}% | Clay {sg.clay.toFixed(0)}% | Silt {sg.silt.toFixed(0)}%</p>
            </div>
            <div className="p-2 bg-white/60 dark:bg-slate-800/60 rounded-lg text-center">
              <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">Organic Carbon</p>
              <p className="font-bold text-sm text-amber-900 dark:text-amber-100">{sg.organicCarbon.toFixed(1)} g/kg</p>
            </div>
          </div>
          {sc && (
            <div className="grid grid-cols-3 gap-2 mt-2">
              <div className="p-2 bg-white/60 dark:bg-slate-800/60 rounded-lg text-center">
                <p className="text-[10px] text-orange-600 dark:text-orange-400 font-medium">Soil Temp (0-7cm)</p>
                <p className="font-bold text-xs text-orange-900 dark:text-orange-100">{sc.temperature0to7cm.toFixed(1)}°C</p>
              </div>
              <div className="p-2 bg-white/60 dark:bg-slate-800/60 rounded-lg text-center">
                <p className="text-[10px] text-orange-600 dark:text-orange-400 font-medium">Soil Moisture</p>
                <p className="font-bold text-xs text-orange-900 dark:text-orange-100">{(sc.moisture0to7cm * 100).toFixed(0)}%</p>
              </div>
              <div className="p-2 bg-white/60 dark:bg-slate-800/60 rounded-lg text-center">
                <p className="text-[10px] text-orange-600 dark:text-orange-400 font-medium">ET₀ Today</p>
                <p className="font-bold text-xs text-orange-900 dark:text-orange-100">{sc.evapotranspiration.toFixed(1)} mm</p>
              </div>
            </div>
          )}
          <p className="text-[9px] text-amber-500 dark:text-amber-600 mt-2 italic">
            💡 This is regional data from satellite analysis. Test your specific soil for more accurate results.
          </p>
        </div>
      )}

      {/* Photo Tab */}
      {activeTab === 'photo' && (
        <div className="space-y-4">
          <div className={`border-2 border-dashed rounded-xl p-6 sm:p-8 text-center transition-all ${imageData ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-900/10' : 'border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50'}`}
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); e.dataTransfer.files[0] && handlePhotoFile(e.dataTransfer.files[0]); }}>
            {imageData ? (
              <div className="space-y-4">
                <img src={`data:${imgMime};base64,${imageData}`} alt="Soil sample" className="max-h-48 mx-auto rounded-lg shadow-md object-contain" />
                <div className="flex gap-2 justify-center flex-wrap">
                  <Button onClick={analyzePhoto} variant="primary" size="md" disabled={photoLoading}>{photoLoading ? '⏳ Analyzing...' : '🔍 Analyze Soil'}</Button>
                  <Button onClick={() => { setImageData(null); setPhotoResult(null); }} variant="outline" size="sm">✕ Clear</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <span className="text-4xl block">🌍</span>
                <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200">Upload a Soil Photo</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">Take a photo of a handful of soil, a hole in your garden, or the surface of your bed.</p>
                <label className="cursor-pointer inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium transition-colors min-h-[44px]">
                  📁 Upload Photo
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handlePhotoFile(e.target.files[0])} />
                </label>
              </div>
            )}
          </div>
          {photoLoading && <div className="text-center py-4"><div className="w-10 h-10 border-4 border-emerald-200 border-t-emerald-500 rounded-full animate-spin mx-auto" /><p className="text-xs text-slate-400 mt-2">Analyzing soil composition...</p></div>}
          {photoResult && !photoLoading && (
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 sm:p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">🔬 AI Soil Analysis</h3>
              <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">{photoResult}</div>
            </div>
          )}
        </div>
      )}

      {/* DIY Tests Tab */}
      {activeTab === 'diy' && (
        <div className="space-y-4">
          <div className="flex gap-1.5 flex-wrap">
            {(Object.keys(DIY_GUIDES) as DIYTest[]).map((key) => (
              <button key={key} onClick={() => { setActiveDIY(key); setDiyStep('guide'); setDiyAnswer(null); }}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-all min-h-[36px] ${activeDIY === key ? 'bg-emerald-500 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'}`}>
                {DIY_GUIDES[key].icon} {DIY_GUIDES[key].title}
              </button>
            ))}
          </div>
          {(() => {
            const guide = DIY_GUIDES[activeDIY];
            return (
              <div className="bg-white dark:bg-slate-800 rounded-xl p-4 sm:p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
                <h3 className="text-sm sm:text-base font-semibold text-slate-700 dark:text-slate-200 mb-3">{guide.icon} {guide.title}</h3>
                {diyStep === 'guide' && (
                  <div className="space-y-3">
                    <ol className="space-y-2">{guide.steps.map((s, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 text-[10px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                        <span>{s}</span>
                      </li>
                    ))}</ol>
                    <Button onClick={() => setDiyStep('answer')} variant="primary" size="sm">✅ Done — Record Result</Button>
                  </div>
                )}
                {diyStep === 'answer' && (
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{guide.question}</p>
                    <div className="space-y-1.5">{guide.options.map((opt) => (
                      <button key={opt.value} onClick={() => setDiyAnswer(opt.value)}
                        className={`w-full text-left p-3 rounded-lg border text-xs sm:text-sm transition-all min-h-[44px] ${diyAnswer === opt.value ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-400' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/30'}`}>
                        {opt.label}
                      </button>
                    ))}</div>
                    {diyAnswer && <Button onClick={saveDIYResult} variant="primary" size="sm">💾 Save Result</Button>}
                  </div>
                )}
                {diyStep === 'result' && (
                  <div className="text-center py-4 space-y-2">
                    <span className="text-3xl">✅</span>
                    <p className="text-sm font-medium text-emerald-600">Result saved: {diyAnswer}</p>
                    <p className="text-xs text-slate-500">Go to the Improve tab for a soil improvement plan based on your results.</p>
                    <Button onClick={() => { setDiyStep('guide'); setDiyAnswer(null); }} variant="outline" size="sm">Run Another Test</Button>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Lab Results Tab */}
      {activeTab === 'lab' && (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 sm:p-5 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
          <h3 className="text-sm sm:text-base font-semibold text-slate-700 dark:text-slate-200">📋 Professional Soil Test Results</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Enter values from a professional lab soil test for precise analysis.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div><label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">pH Level</label>
              <input value={labPH} onChange={(e) => setLabPH(e.target.value)} type="number" step="0.1" min="0" max="14" placeholder="e.g. 6.5" className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-700 dark:text-slate-200 min-h-[40px]" /></div>
            <div><label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">Nitrogen (N) ppm</label>
              <input value={labN} onChange={(e) => setLabN(e.target.value)} type="text" placeholder="e.g. 40" className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-700 dark:text-slate-200 min-h-[40px]" /></div>
            <div><label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">Phosphorus (P) ppm</label>
              <input value={labP} onChange={(e) => setLabP(e.target.value)} type="text" placeholder="e.g. 25" className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-700 dark:text-slate-200 min-h-[40px]" /></div>
            <div><label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">Potassium (K) ppm</label>
              <input value={labK} onChange={(e) => setLabK(e.target.value)} type="text" placeholder="e.g. 150" className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-700 dark:text-slate-200 min-h-[40px]" /></div>
            <div><label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">Organic Matter %</label>
              <input value={labOM} onChange={(e) => setLabOM(e.target.value)} type="text" placeholder="e.g. 3.5" className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-700 dark:text-slate-200 min-h-[40px]" /></div>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={saveLabResults} variant="primary" size="sm" disabled={!labPH && !labN && !labP && !labK && !labOM}>💾 Save Results</Button>
            {labSaved && <span className="text-xs text-emerald-600 font-medium">✅ Saved!</span>}
          </div>
        </div>
      )}

      {/* Improvement Plan Tab */}
      {activeTab === 'plan' && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-xl p-4 sm:p-5 border border-amber-200 dark:border-amber-800 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm sm:text-base font-semibold text-amber-700 dark:text-amber-400">📈 Soil Improvement Plan</h3>
            <button onClick={generatePlan} disabled={planLoading}
              className="text-xs px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50 transition-colors min-h-[32px]">
              {planLoading ? '⏳ Generating...' : plan ? '🔄 Regenerate' : '✨ Generate Plan'}
            </button>
          </div>
          {plan ? (
            <div className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">{plan}</div>
          ) : (
            <div className="text-center py-6 space-y-2">
              <span className="text-3xl block">🌱</span>
              <p className="text-xs text-slate-500 dark:text-slate-400">{profiles.length > 0 ? `Generate an AI improvement plan based on your ${profiles.length} soil records.` : 'Complete a soil test first (Photo, DIY, or Lab) to get a personalized plan.'}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
