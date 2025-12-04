export interface GeolocationResult {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp?: number;
}

export interface GeolocationError {
  code: 'PERMISSION_DENIED' | 'POSITION_UNAVAILABLE' | 'TIMEOUT' | 'NOT_SUPPORTED' | 'UNKNOWN';
  message: string;
}

// Check if geolocation is supported
export const isGeolocationSupported = (): boolean => {
  return 'geolocation' in navigator;
};

// Get current position with enhanced options
export const getCurrentPosition = (
  options?: PositionOptions
): Promise<GeolocationResult> => {
  return new Promise((resolve, reject) => {
    if (!isGeolocationSupported()) {
      reject({
        code: 'NOT_SUPPORTED',
        message: "Geolocation is not supported by your browser. Please enter your location manually."
      } as GeolocationError);
      return;
    }

    const defaultOptions: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
      ...options
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp
        });
      },
      (error) => {
        let geolocationError: GeolocationError;

        switch (error.code) {
          case error.PERMISSION_DENIED:
            geolocationError = {
              code: 'PERMISSION_DENIED',
              message: "Location access was denied. Please enable location permissions in your browser settings, or enter your location manually."
            };
            break;
          case error.POSITION_UNAVAILABLE:
            geolocationError = {
              code: 'POSITION_UNAVAILABLE',
              message: "Your location could not be determined. This may be due to network issues or device settings. Please try again or enter your location manually."
            };
            break;
          case error.TIMEOUT:
            geolocationError = {
              code: 'TIMEOUT',
              message: "Location request timed out. Please check your internet connection and try again, or enter your location manually."
            };
            break;
          default:
            geolocationError = {
              code: 'UNKNOWN',
              message: "An unknown error occurred while fetching your location. Please try again or enter your location manually."
            };
        }

        reject(geolocationError);
      },
      defaultOptions
    );
  });
};

// Watch position for continuous updates
export const watchPosition = (
  onSuccess: (result: GeolocationResult) => void,
  onError: (error: GeolocationError) => void,
  options?: PositionOptions
): number | null => {
  if (!isGeolocationSupported()) {
    onError({
      code: 'NOT_SUPPORTED',
      message: "Geolocation is not supported by your browser."
    });
    return null;
  }

  const defaultOptions: PositionOptions = {
    enableHighAccuracy: true,
    timeout: 15000,
    maximumAge: 10000,
    ...options
  };

  return navigator.geolocation.watchPosition(
    (position) => {
      onSuccess({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp
      });
    },
    (error) => {
      let geolocationError: GeolocationError;

      switch (error.code) {
        case error.PERMISSION_DENIED:
          geolocationError = { code: 'PERMISSION_DENIED', message: "Location access denied." };
          break;
        case error.POSITION_UNAVAILABLE:
          geolocationError = { code: 'POSITION_UNAVAILABLE', message: "Location unavailable." };
          break;
        case error.TIMEOUT:
          geolocationError = { code: 'TIMEOUT', message: "Location request timed out." };
          break;
        default:
          geolocationError = { code: 'UNKNOWN', message: "Unknown geolocation error." };
      }

      onError(geolocationError);
    },
    defaultOptions
  );
};

// Clear position watch
export const clearPositionWatch = (watchId: number): void => {
  if (isGeolocationSupported()) {
    navigator.geolocation.clearWatch(watchId);
  }
};

// Calculate distance between two coordinates (Haversine formula)
export const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  unit: 'km' | 'miles' = 'km'
): number => {
  const R = unit === 'km' ? 6371 : 3959; // Earth's radius
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const toRad = (deg: number): number => {
  return deg * (Math.PI / 180);
};

// Format coordinates for display
export const formatCoordinates = (
  latitude: number,
  longitude: number,
  precision: number = 4
): string => {
  const latDir = latitude >= 0 ? 'N' : 'S';
  const lonDir = longitude >= 0 ? 'E' : 'W';
  return `${Math.abs(latitude).toFixed(precision)}°${latDir}, ${Math.abs(longitude).toFixed(precision)}°${lonDir}`;
};

// Validate coordinates
export const validateCoordinates = (
  latitude: number | string,
  longitude: number | string
): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];

  const lat = typeof latitude === 'string' ? parseFloat(latitude) : latitude;
  const lon = typeof longitude === 'string' ? parseFloat(longitude) : longitude;

  if (isNaN(lat)) {
    errors.push("Latitude must be a valid number");
  } else if (lat < -90 || lat > 90) {
    errors.push("Latitude must be between -90 and 90 degrees");
  }

  if (isNaN(lon)) {
    errors.push("Longitude must be a valid number");
  } else if (lon < -180 || lon > 180) {
    errors.push("Longitude must be between -180 and 180 degrees");
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

// Get approximate location from IP (fallback)
export const getApproximateLocation = async (): Promise<GeolocationResult | null> => {
  try {
    const response = await fetch('https://ipapi.co/json/', {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    if (data.latitude && data.longitude) {
      return {
        latitude: data.latitude,
        longitude: data.longitude,
        accuracy: 10000 // IP-based location is not very accurate
      };
    }

    return null;
  } catch (error) {
    console.error('Failed to get approximate location:', error);
    return null;
  }
};