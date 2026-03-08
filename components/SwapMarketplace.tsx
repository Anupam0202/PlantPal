import React, { useState, useMemo, useCallback } from 'react';
import { Button } from './common/Button';
import { getGardenPlants } from '../services/gardenService';
import type { LocationData } from '../types';

const SWAP_KEY = 'plantpal-swap-listings';

interface SwapListing {
  id: string; type: 'offer' | 'request'; plantName: string;
  offerType: 'seeds' | 'seedling' | 'cutting' | 'division' | 'fruit';
  quantity: number; notes: string; area: string; timestamp: string;
  userName: string; rating: number;
}

const readListings = (): SwapListing[] => { try { return JSON.parse(localStorage.getItem(SWAP_KEY) || '[]'); } catch { return []; } };
const writeListings = (l: SwapListing[]) => { try { localStorage.setItem(SWAP_KEY, JSON.stringify(l)); } catch {} };

// Demo community listings
const DEMO_LISTINGS: SwapListing[] = [
  { id: 'd1', type: 'offer', plantName: 'Rosemary', offerType: 'cutting', quantity: 5, notes: 'From my 4-year-old bush, very hardy and fragrant', area: 'Downtown', timestamp: new Date(Date.now() - 86400000).toISOString(), userName: 'GreenThumb', rating: 4.8 },
  { id: 'd2', type: 'offer', plantName: 'Tomato', offerType: 'seedling', quantity: 12, notes: 'Cherry tomato seedlings, started indoors. Very productive variety.', area: 'Garden Colony', timestamp: new Date(Date.now() - 172800000).toISOString(), userName: 'SeedSaver', rating: 4.5 },
  { id: 'd3', type: 'request', plantName: 'Tulsi (Holy Basil)', offerType: 'seedling', quantity: 2, notes: 'Looking for seedlings of the Krishna variety', area: 'University Quarter', timestamp: new Date(Date.now() - 43200000).toISOString(), userName: 'HerbLover', rating: 4.2 },
  { id: 'd4', type: 'offer', plantName: 'Lavender', offerType: 'seeds', quantity: 50, notes: 'English lavender seeds, collected last summer', area: 'Riverside', timestamp: new Date(Date.now() - 259200000).toISOString(), userName: 'FlowerPower', rating: 4.9 },
  { id: 'd5', type: 'offer', plantName: 'Sunflower', offerType: 'seeds', quantity: 30, notes: 'Giant variety, grew to 2.5m last year!', area: 'Old Town', timestamp: new Date(Date.now() - 345600000).toISOString(), userName: 'SunnyGardener', rating: 4.7 },
  { id: 'd6', type: 'request', plantName: 'Mint', offerType: 'cutting', quantity: 3, notes: 'Any variety welcome', area: 'Tech Park', timestamp: new Date(Date.now() - 3600000).toISOString(), userName: 'NewGardener', rating: 3.5 },
];

const OFFER_ICONS = { seeds: '🌰', seedling: '🌱', cutting: '✂️', division: '🪴', fruit: '🍅' };
const TYPE_COLORS = { offer: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400', request: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' };

interface Props { onBack: () => void; location: LocationData | null; }

export const SwapMarketplace: React.FC<Props> = ({ onBack, location }) => {
  const gardenPlants = useMemo(() => getGardenPlants().filter(p => p.status === 'active'), []);
  const [myListings, setMyListings] = useState<SwapListing[]>(() => readListings());
  const [tab, setTab] = useState<'browse' | 'my' | 'create'>('browse');
  const [filterType, setFilterType] = useState<'all' | 'offer' | 'request'>('all');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ type: 'offer' as 'offer' | 'request', plantName: '', offerType: 'seedling' as SwapListing['offerType'], quantity: 1, notes: '' });
  const [search, setSearch] = useState('');

  const allListings = useMemo(() => {
    const all = [...DEMO_LISTINGS, ...myListings];
    let filtered = filterType === 'all' ? all : all.filter(l => l.type === filterType);
    if (search) filtered = filtered.filter(l => l.plantName.toLowerCase().includes(search.toLowerCase()));
    return filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [myListings, filterType, search]);

  const matches = useMemo(() => {
    const gardenNames = gardenPlants.map(p => p.commonName.toLowerCase());
    return DEMO_LISTINGS.filter(l => l.type === 'offer' && gardenNames.some(n => l.plantName.toLowerCase().includes(n) || n.includes(l.plantName.toLowerCase())));
  }, [gardenPlants]);

  const createListing = useCallback(() => {
    if (!form.plantName.trim()) return;
    const listing: SwapListing = {
      id: `my-${Date.now()}`, ...form, area: location?.name || 'My Area',
      timestamp: new Date().toISOString(), userName: 'You', rating: 5,
    };
    const updated = [...myListings, listing];
    setMyListings(updated); writeListings(updated);
    setForm({ type: 'offer', plantName: '', offerType: 'seedling', quantity: 1, notes: '' });
    setCreating(false); setTab('my');
  }, [form, location, myListings]);

  const timeAgo = (ts: string) => {
    const d = (Date.now() - new Date(ts).getTime()) / 1000;
    if (d < 3600) return `${Math.round(d / 60)}m ago`;
    if (d < 86400) return `${Math.round(d / 3600)}h ago`;
    return `${Math.round(d / 86400)}d ago`;
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2"><span>🔄</span> Seed & Plant Swap</h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">Swap plants with nearby gardeners</p>
        </div>
        <Button onClick={onBack} variant="outline" size="sm">← Back</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { icon: '🌱', val: DEMO_LISTINGS.filter(l => l.type === 'offer').length + myListings.filter(l => l.type === 'offer').length, label: 'Offers' },
          { icon: '🔍', val: DEMO_LISTINGS.filter(l => l.type === 'request').length + myListings.filter(l => l.type === 'request').length, label: 'Requests' },
          { icon: '🤝', val: matches.length, label: 'Matches' },
        ].map(s => (
          <div key={s.label} className="p-3 rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 text-center">
            <p className="text-lg">{s.icon}</p>
            <p className="text-base font-bold text-slate-700 dark:text-slate-200">{s.val}</p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Smart Matches */}
      {matches.length > 0 && (
        <div className="bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 rounded-xl p-4 border border-amber-200 dark:border-amber-800 shadow-sm">
          <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-400 mb-2">✨ Matches for Your Garden</h3>
          {matches.map(m => (
            <div key={m.id} className="flex items-center gap-2 text-xs p-2 bg-white/60 dark:bg-slate-800/40 rounded-lg mb-1">
              <span>{OFFER_ICONS[m.offerType]}</span>
              <span className="flex-1 text-slate-700 dark:text-slate-200"><strong>{m.plantName}</strong> ({m.offerType}) from {m.userName}</span>
              <span className="text-[10px] text-amber-500">{m.area}</span>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-700/30 rounded-lg p-1">
        {([['browse', '🏪 Browse'], ['my', '📦 My Listings'], ['create', '➕ Create']] as const).map(([id, label]) => (
          <button key={id} onClick={() => { setTab(id); if (id === 'create') setCreating(true); }}
            className={`flex-1 text-xs py-2 rounded-md transition-all ${tab === id ? 'bg-white dark:bg-slate-800 shadow-sm font-semibold text-slate-700 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'browse' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search plants..."
              className="flex-1 text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200" />
            <div className="flex gap-1">
              {(['all', 'offer', 'request'] as const).map(f => (
                <button key={f} onClick={() => setFilterType(f)}
                  className={`text-[10px] px-2 py-1.5 rounded-lg border transition-all ${filterType === f ? 'bg-emerald-500 text-white border-emerald-500' : 'border-slate-200 dark:border-slate-700 text-slate-500'}`}>
                  {f === 'all' ? 'All' : f === 'offer' ? '🌿 Offers' : '🔍 Wants'}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {allListings.map(l => (
              <div key={l.id} className="bg-white dark:bg-slate-800 rounded-xl p-3 sm:p-4 border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start gap-2">
                  <span className="text-xl">{OFFER_ICONS[l.offerType]}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${TYPE_COLORS[l.type]}`}>
                        {l.type === 'offer' ? '📤 OFFER' : '📥 WANTED'}
                      </span>
                      <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{l.plantName}</span>
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 capitalize">{l.offerType} · Qty: {l.quantity}</p>
                    {l.notes && <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{l.notes}</p>}
                    <div className="flex items-center gap-2 mt-1.5 text-[10px] text-slate-400">
                      <span>👤 {l.userName}</span>
                      <span>⭐ {l.rating}</span>
                      <span>📍 {l.area}</span>
                      <span className="ml-auto">{timeAgo(l.timestamp)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Swap Events */}
          <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-xl p-4 border border-purple-200 dark:border-purple-800 shadow-sm">
            <h3 className="text-sm font-semibold text-purple-700 dark:text-purple-400 mb-2">🎉 Upcoming Swap Events</h3>
            <div className="p-3 rounded-lg bg-white/60 dark:bg-slate-800/40 border border-purple-100 dark:border-purple-800">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">🌿 Weekend Plant Swap at Community Park</p>
              <p className="text-[10px] text-slate-500 mt-0.5">This Saturday, 10am-1pm · 12 users RSVP'd</p>
              <button className="mt-2 text-[10px] px-3 py-1 rounded-lg bg-purple-500 text-white hover:bg-purple-600 transition-colors">✋ RSVP</button>
            </div>
          </div>
        </div>
      )}

      {tab === 'my' && (
        <div className="space-y-2">
          {myListings.length === 0 ? (
            <div className="text-center py-10 bg-slate-50 dark:bg-slate-800/50 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600">
              <span className="text-4xl block mb-3">📦</span>
              <p className="text-sm text-slate-500 dark:text-slate-400">No listings yet. Create your first offer or request!</p>
            </div>
          ) : myListings.map(l => (
            <div key={l.id} className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="text-xs">
                <span className={`inline-block text-[9px] px-1.5 py-0.5 rounded-full mb-0.5 ${TYPE_COLORS[l.type]}`}>
                  {l.type === 'offer' ? 'OFFER' : 'REQUEST'}
                </span>
                <span className="ml-1 font-semibold text-slate-700 dark:text-slate-200">{l.plantName}</span>
                <span className="text-slate-400 ml-1">× {l.quantity}</span>
              </div>
              <button onClick={() => { const u = myListings.filter(x => x.id !== l.id); setMyListings(u); writeListings(u); }}
                className="text-red-400 hover:text-red-600 text-xs">🗑️</button>
            </div>
          ))}
        </div>
      )}

      {(tab === 'create' || creating) && (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 sm:p-5 border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Create Listing</h3>
          <div className="flex gap-2">
            {(['offer', 'request'] as const).map(t => (
              <button key={t} onClick={() => setForm({ ...form, type: t })}
                className={`flex-1 text-xs py-2 rounded-lg border transition-all ${form.type === t ? (t === 'offer' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-blue-500 text-white border-blue-500') : 'border-slate-200 dark:border-slate-700 text-slate-500'}`}>
                {t === 'offer' ? '📤 I Have' : '📥 I Need'}
              </button>
            ))}
          </div>
          <input value={form.plantName} onChange={e => setForm({ ...form, plantName: e.target.value })} placeholder="Plant name"
            className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200" />
          <div className="grid grid-cols-5 gap-1">
            {(['seeds', 'seedling', 'cutting', 'division', 'fruit'] as const).map(t => (
              <button key={t} onClick={() => setForm({ ...form, offerType: t })}
                className={`text-center p-2 rounded-lg border text-[10px] transition-all ${form.offerType === t ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-700' : 'border-slate-200 dark:border-slate-700'}`}>
                <span className="block text-sm">{OFFER_ICONS[t]}</span>{t}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[10px] text-slate-500 dark:text-slate-400">Quantity</label>
              <input type="number" min={1} value={form.quantity} onChange={e => setForm({ ...form, quantity: Number(e.target.value) })}
                className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200" />
            </div>
          </div>
          <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Notes (condition, age, tips...)" rows={2}
            className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200" />
          <div className="flex gap-2">
            <button onClick={createListing} disabled={!form.plantName.trim()}
              className="flex-1 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold disabled:opacity-50 transition-colors">✅ Post Listing</button>
            <button onClick={() => { setCreating(false); setTab('browse'); }} className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-500">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};
