
import React, { useState } from 'react';
import type { LocationData }  from '../types';
import { Button } from './common/Button';
import { TextInput } from './common/TextInput';
import { getCurrentPosition } from '../services/geolocationService';

interface LocationInputProps {
  onSubmit: (location: LocationData) => void;
}

export const LocationInput: React.FC<LocationInputProps> = ({ onSubmit }) => {
  const [manualLocationName, setManualLocationName] = useState('');
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoadingGeo, setIsLoadingGeo] = useState(false);

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
    } catch (err) {
      let errorMessage = "Could not fetch current location. Please ensure location services are enabled and permissions are granted for this site, or enter your location manually.";
      if (err instanceof Error) {
        if (err.message.includes("User denied")) {
          errorMessage = "Location access was denied. Please enable location permissions for this site in your browser settings if you wish to use this feature, or enter your location manually.";
        } else {
           errorMessage = `Error fetching location: ${err.message}. Please try manual input.`;
        }
      }
      setError(errorMessage);
    } finally {
      setIsLoadingGeo(false);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lon);

    let errors: string[] = [];
    if (isNaN(latitude) || latitude < -90 || latitude > 90) {
        errors.push("Latitude must be a number between -90 and 90.");
    }
    if (isNaN(longitude) || longitude < -180 || longitude > 180) {
        errors.push("Longitude must be a number between -180 and 180.");
    }

    if(errors.length > 0) {
        setError(errors.join(" "));
        return;
    }
    
    const locationName = manualLocationName.trim() || `Coordinates: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;

    onSubmit({ latitude, longitude, name: locationName });
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="text-center p-4 sm:p-5 bg-white dark:bg-slate-700 rounded-xl border border-slate-200 dark:border-slate-600 shadow-lg">
        <h3 className="text-lg font-semibold text-emerald-700 dark:text-emerald-300 mb-3">Quick Start</h3>
        <Button 
          onClick={handleGeoLocation} 
          variant="primary" 
          size="lg"
          isLoading={isLoadingGeo} 
          className="w-full sm:w-auto sm:mx-auto shadow-md hover:shadow-lg"
          aria-label="Use my current location"
          icon={<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>}
        >
          {isLoadingGeo ? 'Fetching Location...' : 'Use My Current Location'}
        </Button>
        {isLoadingGeo && <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-2 animate-pulse">Fetching your precise location...</p>}
      </div>

      <div className="relative my-4">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <div className="w-full border-t border-slate-300 dark:border-slate-600" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-white dark:bg-slate-800 px-3 text-sm font-medium text-slate-500 dark:text-slate-400">Or Enter Manually</span>
        </div>
      </div>

      <div className="p-4 sm:p-5 border border-slate-200 dark:border-slate-600 rounded-xl shadow-lg bg-white dark:bg-slate-700">
        <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-4 text-center sm:text-left">Manual Location Input</h3>
        <form onSubmit={handleManualSubmit} className="space-y-5" aria-labelledby="manual-location-heading">
          <div id="manual-location-heading" className="sr-only">Manual Location Input Form</div>
          <TextInput
            label="Location Name / Address (Optional)"
            id="manualLocationName"
            value={manualLocationName}
            onChange={(e) => setManualLocationName(e.target.value)}
            placeholder="e.g., Downtown Park, My Backyard"
            tooltip="Provide a descriptive name (e.g., 'Community Garden Plot A')."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-5">
              <TextInput
              label="Latitude"
              id="latitude"
              type="number"
              step="any"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              placeholder="e.g., 40.7128"
              required
              aria-required="true"
              tooltip="Enter latitude (e.g., 40.7128). Range: -90 to 90."
              error={error && (error.includes("Latitude") || error.includes("coordinates")) ? error : undefined}
              />
              <TextInput
              label="Longitude"
              id="longitude"
              type="number"
              step="any"
              value={lon}
              onChange={(e) => setLon(e.target.value)}
              placeholder="e.g., -74.0060"
              required
              aria-required="true"
              tooltip="Enter longitude (e.g., -74.0060). Range: -180 to 180."
              error={error && (error.includes("Longitude") || error.includes("coordinates")) ? error : undefined}
              />
          </div>
          {error && (!error.includes("Latitude") && !error.includes("Longitude") && !error.includes("coordinates")) && 
            <p role="alert" className="mt-2 p-2.5 bg-red-50 dark:bg-red-800/30 border border-red-200 dark:border-red-600/30 text-red-700 dark:text-red-400 rounded-md text-sm shadow-sm">{error}</p>
          }
          <Button type="submit" variant="outline" size="lg" className="w-full !mt-6">
            Set Location & Continue
          </Button>
        </form>
      </div>
    </div>
  );
};
