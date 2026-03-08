import React, { useState, useRef, useCallback } from 'react';
import { Button } from './common/Button';
import { analyzeImageWithAI, QuotaExceededError } from '../services/geminiService';
import type { HealthReport, HealthIssue, HealthRating, WeatherData, LocationData } from '../types';

const RATING_CONFIG: Record<HealthRating, { label: string; color: string; bg: string; emoji: string }> = {
  thriving: { label: 'Thriving', color: 'text-emerald-600', bg: 'bg-emerald-100 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-700', emoji: '🌿' },
  healthy: { label: 'Healthy', color: 'text-green-600', bg: 'bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700', emoji: '✅' },
  fair: { label: 'Fair', color: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700', emoji: '⚠️' },
  poor: { label: 'Poor', color: 'text-orange-600', bg: 'bg-orange-100 dark:bg-orange-900/30 border-orange-300 dark:border-orange-700', emoji: '🔶' },
  critical: { label: 'Critical', color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700', emoji: '🔴' },
};

const URGENCY_LABEL: Record<string, { text: string; class: string }> = {
  immediate: { text: 'Act Now', class: 'bg-red-100 dark:bg-red-900/30 text-red-600' },
  soon: { text: 'This Week', class: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600' },
  monitor: { text: 'Monitor', class: 'bg-slate-100 dark:bg-slate-700 text-slate-500' },
};

interface Props { onBack: () => void; location: LocationData | null; weatherData: WeatherData | null; onQuotaError?: (msg?: string) => void; envProfile?: import('../types').EnvironmentalProfile | null; }

export const PlantHealthScanner: React.FC<Props> = ({ onBack, location, weatherData, onQuotaError, envProfile }) => {
  const [imageData, setImageData] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>('image/jpeg');
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<HealthReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HealthReport[]>(() => {
    try { return JSON.parse(localStorage.getItem('plantpal-scan-history') || '[]'); } catch { return []; }
  });
  const [showHistory, setShowHistory] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) { setError('Please select an image file.'); return; }
    if (file.size > 10 * 1024 * 1024) { setError('Image must be under 10MB.'); return; }
    setError(null);
    setMimeType(file.type);
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      setImageData(base64);
      setReport(null);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const analyzeImage = useCallback(async () => {
    if (!imageData) return;
    setLoading(true);
    setError(null);
    try {
      const weatherContext = weatherData
        ? `Current local weather: ${weatherData.current.temperature_2m}°C, ${weatherData.current.relative_humidity_2m}% humidity, ${weatherData.current.weather_description || 'unknown conditions'}.`
        : '';
      const locationContext = location ? `Location: ${location.name || `${location.latitude.toFixed(2)}, ${location.longitude.toFixed(2)}`}.` : '';
      
      const envContext = [
        envProfile?.airQuality ? `AQI: ${envProfile.airQuality.aqi}, Ozone: ${envProfile.airQuality.ozone} µg/m³.` : '',
        envProfile?.soilGrids ? `Soil: ${envProfile.soilGrids.soilClass}, pH ${envProfile.soilGrids.ph.toFixed(1)}.` : '',
        envProfile?.soilConditions ? `Soil moisture: ${(envProfile.soilConditions.moisture0to7cm * 100).toFixed(0)}%.` : '',
      ].filter(Boolean).join(' ');

      const prompt = `You are an expert plant pathologist and botanist. Analyze this plant image and provide a health diagnosis.
${locationContext} ${weatherContext} ${envContext}

Respond in STRICT JSON format (no markdown, no code fences):
{
  "rating": "thriving|healthy|fair|poor|critical",
  "plantName": "identified species or null",
  "issues": [
    {"name": "Issue name", "confidence": "high|medium|low", "cause": "What caused it", "urgency": "immediate|soon|monitor"}
  ],
  "treatmentPlan": ["Step 1: ...", "Step 2: ..."],
  "preventionTips": ["Tip 1", "Tip 2"],
  "summary": "2-3 sentence overall assessment"
}

If the plant looks healthy, set rating to "thriving" or "healthy" with empty issues array and helpful care tips.
If you identify problems, list each as a separate issue with specific causes and actionable treatments.
Consider the weather context — high humidity suggests fungal risks, high heat suggests drought stress.`;

      const result = await analyzeImageWithAI(imageData, mimeType, prompt);
      // Parse JSON from response (strip any markdown fences)
      const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed: HealthReport = { ...JSON.parse(cleaned), analyzedAt: new Date().toISOString() };

      setReport(parsed);
      // Save to history
      const newHistory = [parsed, ...history].slice(0, 10);
      setHistory(newHistory);
      localStorage.setItem('plantpal-scan-history', JSON.stringify(newHistory));
    } catch (err) {
      if (err instanceof QuotaExceededError) { onQuotaError?.(err.message); }
      setError(err instanceof Error ? err.message : 'Failed to analyze image. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [imageData, mimeType, weatherData, location, history]);

  const clearScan = useCallback(() => {
    setImageData(null);
    setReport(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = '';
  }, []);

  const renderIssue = (issue: HealthIssue, i: number) => {
    const urg = URGENCY_LABEL[issue.urgency] || URGENCY_LABEL.monitor;
    return (
      <div key={i} className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{issue.name}</span>
          <div className="flex gap-1.5 flex-shrink-0">
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${urg.class}`}>{urg.text}</span>
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${issue.confidence === 'high' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600' : issue.confidence === 'medium' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'}`}>{issue.confidence} confidence</span>
          </div>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">{issue.cause}</p>
      </div>
    );
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2"><span>🩺</span> Plant Doctor</h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">Upload a photo for AI-powered plant health diagnosis</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowHistory(!showHistory)} className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors min-h-[32px]">📋 History ({history.length})</button>
          <Button onClick={onBack} variant="outline" size="sm">← Back</Button>
        </div>
      </div>

      {showHistory && history.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm space-y-2">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">📋 Scan History</h3>
          {history.map((h, i) => {
            const cfg = RATING_CONFIG[h.rating] || RATING_CONFIG.fair;
            return (
              <div key={i} className={`flex items-center justify-between p-2.5 rounded-lg border ${cfg.bg} cursor-pointer hover:shadow-sm transition-shadow`} onClick={() => { setReport(h); setShowHistory(false); }}>
                <div className="flex items-center gap-2 min-w-0">
                  <span>{cfg.emoji}</span>
                  <div className="min-w-0"><p className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">{h.plantName || 'Unknown plant'} — {cfg.label}</p><p className="text-[10px] text-slate-400">{new Date(h.analyzedAt).toLocaleDateString()}</p></div>
                </div>
                <span className="text-[10px] text-slate-400">{h.issues.length} issues</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Upload Area */}
      {!report && (
        <div
          className={`border-2 border-dashed rounded-xl p-6 sm:p-10 text-center transition-all ${imageData ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-900/10' : 'border-slate-300 dark:border-slate-600 hover:border-emerald-400 dark:hover:border-emerald-600 bg-slate-50 dark:bg-slate-800/50'}`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          {imageData ? (
            <div className="space-y-4">
              <img src={`data:${mimeType};base64,${imageData}`} alt="Selected plant" className="max-h-64 mx-auto rounded-lg shadow-md object-contain" />
              <div className="flex gap-2 justify-center flex-wrap">
                <Button onClick={analyzeImage} variant="primary" size="md" disabled={loading}>{loading ? '⏳ Analyzing...' : '🔍 Analyze Plant Health'}</Button>
                <Button onClick={clearScan} variant="outline" size="sm">✕ Clear</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <span className="text-5xl block">📷</span>
              <h3 className="text-base sm:text-lg font-semibold text-slate-700 dark:text-slate-200">Upload or Capture a Plant Photo</h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">Take a clear photo of a leaf, stem, fruit, or the whole plant. The AI will diagnose health issues and suggest treatments.</p>
              <div className="flex gap-3 justify-center flex-wrap">
                <label className="cursor-pointer inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium transition-colors min-h-[44px]">
                  📁 Upload Photo
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
                </label>
                <label className="cursor-pointer inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition-colors min-h-[44px]">
                  📸 Take Photo
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
                </label>
              </div>
              <p className="text-[11px] text-slate-400">Or drag and drop an image here · Max 10MB</p>
            </div>
          )}
        </div>
      )}

      {error && <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">{error}</div>}

      {loading && (
        <div className="text-center py-8 space-y-3">
          <div className="w-12 h-12 border-4 border-emerald-200 border-t-emerald-500 rounded-full animate-spin mx-auto" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Examining your plant... This may take a few seconds.</p>
        </div>
      )}

      {/* Health Report Card */}
      {report && !loading && (
        <div className="space-y-4 animate-fade-in">
          {/* Rating Banner */}
          {(() => {
            const cfg = RATING_CONFIG[report.rating] || RATING_CONFIG.fair;
            return (
              <div className={`p-4 sm:p-5 rounded-xl border-2 ${cfg.bg} text-center`}>
                <p className="text-3xl sm:text-4xl mb-1">{cfg.emoji}</p>
                <h3 className={`text-lg sm:text-xl font-bold ${cfg.color}`}>{cfg.label}</h3>
                {report.plantName && <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">🪴 Identified as: <strong>{report.plantName}</strong></p>}
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-2 max-w-lg mx-auto">{report.summary}</p>
              </div>
            );
          })()}

          {/* Issues */}
          {report.issues.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 sm:p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
              <h3 className="text-sm sm:text-base font-semibold text-slate-700 dark:text-slate-200 mb-3">🔎 Identified Issues ({report.issues.length})</h3>
              <div className="space-y-2">{report.issues.map(renderIssue)}</div>
            </div>
          )}

          {/* Treatment Plan */}
          {report.treatmentPlan.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 sm:p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
              <h3 className="text-sm sm:text-base font-semibold text-slate-700 dark:text-slate-200 mb-3">💊 Treatment Plan</h3>
              <ol className="space-y-2">{report.treatmentPlan.map((step, i) => (
                <li key={i} className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}</ol>
            </div>
          )}

          {/* Prevention Tips */}
          {report.preventionTips.length > 0 && (
            <div className="bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-xl p-4 sm:p-5 border border-blue-200 dark:border-blue-800 shadow-sm">
              <h3 className="text-sm sm:text-base font-semibold text-blue-700 dark:text-blue-400 mb-3">🛡️ Prevention Tips</h3>
              <ul className="space-y-1.5">{report.preventionTips.map((tip, i) => (
                <li key={i} className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 flex items-start gap-2">
                  <span className="text-blue-400 mt-0.5">→</span>
                  <span>{tip}</span>
                </li>
              ))}</ul>
            </div>
          )}

          <div className="flex gap-2 justify-center pt-2">
            <Button onClick={clearScan} variant="primary" size="md">🔄 Scan Another Plant</Button>
          </div>
          <p className="text-[10px] text-center text-slate-400">Scanned {new Date(report.analyzedAt).toLocaleString()} · AI diagnoses are advisory — consult an expert for serious issues</p>
        </div>
      )}
    </div>
  );
};
