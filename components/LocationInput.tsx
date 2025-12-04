import React, { useState, useEffect } from 'react';
import type { LocationData } from '../types';
import { Button } from './common/Button';
import { TextInput } from './common/TextInput';
import { Loader } from './common/Loader';
import { LocationIcon, SparklesIcon } from '../constants';
import { getCurrentPosition, formatCoordinates, validateCoordinates } from '../services/geolocationService';
import { searchLocation, GeocodingResult } from '../services/weatherService';

interface LocationInputProps {
  onSubmit: (location: LocationData) => void;
}

export const LocationInput: React.FC<LocationInputProps> = ({ onSubmit }) => {
  const [mode, setMode] = useState<'auto' | 'manual' | 'search'>('auto');
  const [manualLocationName, setManualLocationName] = useState('');
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GeocodingResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingGeo, setIsLoadingGeo] = useState(false);
  const [latError, setLatError] = useState<string | null>(null);
  const [lonError, setLonError] = useState<string | null>(null);

  // Debounced search
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchLocation(searchQuery);
        setSearchResults(results);
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const handleGeoLocation = async () => {
    setIsLoadingGeo(true);
    setError(null);

    try {
      const position = await getCurrentPosition();
      onSubmit({
        latitude: position.latitude,
        longitude: position.longitude,
        name: "My Current Location",
      });
    } catch (err: any) {
      setError(err.message || "Could not fetch current location. Please try manual input.");
    } finally {
      setIsLoadingGeo(false);
    }
  };

  const handleSearchSelect = (result: GeocodingResult) => {
    onSubmit({
      latitude: result.latitude,
      longitude: result.longitude,
      name: `${result.name}${result.admin1 ? `, ${result.admin1}` : ''}, ${result.country}`,
      city: result.name,
      country: result.country,
    });
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLatError(null);
    setLonError(null);

    const validation = validateCoordinates(lat, lon);

    if (!validation.valid) {
      validation.errors.forEach(err => {
        if (err.toLowerCase().includes('latitude')) {
          setLatError(err);
        } else if (err.toLowerCase().includes('longitude')) {
          setLonError(err);
        }
      });
      return;
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lon);
    const locationName = manualLocationName.trim() || formatCoordinates(latitude, longitude);

    onSubmit({ latitude, longitude, name: locationName });
  };

  const ModeButton: React.FC<{
    active: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    label: string;
    description: string;
  }> = ({ active, onClick, icon, label, description }) => (
    <button
      type="button"
      onClick={onClick}
      className={`
        flex-1 p-4 rounded-xl border-2 transition-all duration-200
        ${active
          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 shadow-lg shadow-emerald-500/10'
          : 'border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-700 bg-white dark:bg-slate-800'
        }
      `}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 mx-auto transition-colors ${active ? 'bg-emerald-500 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>
        {icon}
      </div>
      <h4 className={`font-semibold mb-1 ${active ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-700 dark:text-slate-300'}`}>
        {label}
      </h4>
      <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>
    </button>
  );

  return (
    <div className="space-y-8">
      {/* Mode selection */}
      <div>
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-4 text-center">
          How would you like to set your location?
        </h3>
        <div className="grid grid-cols-3 gap-4">
          <ModeButton
            active={mode === 'auto'}
            onClick={() => setMode('auto')}
            icon={<LocationIcon className="w-5 h-5" />}
            label="Auto Detect"
            description="Use GPS"
          />
          <ModeButton
            active={mode === 'search'}
            onClick={() => setMode('search')}
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            }
            label="Search"
            description="Find by name"
          />
          <ModeButton
            active={mode === 'manual'}
            onClick={() => setMode('manual')}
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            }
            label="Manual"
            description="Enter coordinates"
          />
        </div>
      </div>

      {/* Auto-detect mode */}
      {mode === 'auto' && (
        <div className="text-center p-8 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 rounded-2xl border border-emerald-200 dark:border-emerald-800">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
            <LocationIcon className="w-8 h-8 text-white" />
          </div>
          <h4 className="text-xl font-bold text-emerald-800 dark:text-emerald-200 mb-2">
            Detect My Location
          </h4>
          <p className="text-emerald-600 dark:text-emerald-400 mb-6 max-w-sm mx-auto">
            Allow location access to automatically get your coordinates and local weather data.
          </p>
          <Button
            onClick={handleGeoLocation}
            variant="gradient"
            size="lg"
            isLoading={isLoadingGeo}
            icon={<SparklesIcon className="w-5 h-5" />}
            className="mx-auto"
          >
            {isLoadingGeo ? 'Detecting...' : 'Use My Location'}
          </Button>
        </div>
      )}

      {/* Search mode */}
      {mode === 'search' && (
        <div className="p-6 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-lg">
          <TextInput
            label="Search for a location"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="e.g., New York, Tokyo, London..."
            leftIcon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            }
            clearable
            onClear={() => {
              setSearchQuery('');
              setSearchResults([]);
            }}
          />

          {isSearching && (
            <div className="mt-4">
              <Loader size="sm" variant="dots" text="Searching..." />
            </div>
          )}

          {searchResults.length > 0 && (
            <div className="mt-4 space-y-2 max-h-64 overflow-y-auto">
              {searchResults.map((result, index) => (
                <button
                  key={`${result.latitude}-${result.longitude}-${index}`}
                  onClick={() => handleSearchSelect(result)}
                  className="w-full p-4 text-left rounded-xl border border-slate-200 dark:border-slate-700 hover:border-emerald-400 dark:hover:border-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-all duration-200 group"
                >
                  <div className="flex items-center">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center mr-3 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-900/50 transition-colors">
                      <LocationIcon className="w-5 h-5 text-slate-500 dark:text-slate-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h5 className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {result.name}
                      </h5>
                      <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
                        {result.admin1 && `${result.admin1}, `}{result.country}
                      </p>
                    </div>
                    <svg className="w-5 h-5 text-slate-400 group-hover:text-emerald-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          )}

          {searchQuery.length >= 2 && !isSearching && searchResults.length === 0 && (
            <p className="mt-4 text-center text-slate-500 dark:text-slate-400">
              No locations found. Try a different search term.
            </p>
          )}
        </div>
      )}

      {/* Manual mode */}
      {mode === 'manual' && (
        <form onSubmit={handleManualSubmit} className="p-6 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-lg">
          <div className="space-y-5">
            <TextInput
              label="Location Name (Optional)"
              value={manualLocationName}
              onChange={(e) => setManualLocationName(e.target.value)}
              placeholder="e.g., My Backyard Garden"
              helperText="Give your location a friendly name"
            />

            <div className="grid grid-cols-2 gap-4">
              <TextInput
                label="Latitude"
                type="number"
                step="any"
                value={lat}
                onChange={(e) => {
                  setLat(e.target.value);
                  setLatError(null);
                }}
                placeholder="e.g., 40.7128"
                required
                error={latError}
                helperText="Range: -90 to 90"
              />
              <TextInput
                label="Longitude"
                type="number"
                step="any"
                value={lon}
                onChange={(e) => {
                  setLon(e.target.value);
                  setLonError(null);
                }}
                placeholder="e.g., -74.0060"
                required
                error={lonError}
                helperText="Range: -180 to 180"
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              icon={<LocationIcon className="w-5 h-5" />}
            >
              Set Location & Continue
            </Button>
          </div>
        </form>
      )}

      {/* Error display */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-red-500 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <div>
              <p className="text-sm font-medium text-red-800 dark:text-red-200">{error}</p>
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                Try using the search or manual input options instead.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tips section */}
      <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
        <div className="flex items-start">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center mr-3 flex-shrink-0">
            <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <h5 className="font-medium text-slate-700 dark:text-slate-300 text-sm">Pro Tip</h5>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              For the most accurate plant recommendations, use your exact location. This helps us analyze local climate conditions and suggest plants that will thrive in your specific environment.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};