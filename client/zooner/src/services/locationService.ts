/**
 * Robust, resilient location service with multi-tier fallbacks:
 * 1. High-accuracy GPS (satellite/sensor)
 * 2. Standard accuracy GPS (Wi-Fi / Cellular triangulation)
 * 3. IP Geolocation API fallback (ensures location detection NEVER completely fails)
 * 4. Multi-provider reverse & forward geocoding (BigDataCloud + OpenStreetMap Nominatim)
 */

export interface DetectedLocation {
  lat: number;
  lng: number;
  accuracy?: number;
  city: string;
  area: string;
  formattedAddress: string;
  displayName: string;
  postcode?: string;
  source: 'gps-high' | 'gps-network' | 'ip' | 'default';
  isEstimated?: boolean;
}

const DEFAULT_FALLBACK_LOCATION: DetectedLocation = {
  lat: 11.0168,
  lng: 76.9558,
  city: 'Coimbatore',
  area: 'RS Puram',
  formattedAddress: 'RS Puram, Coimbatore, Tamil Nadu',
  displayName: 'RS Puram, Coimbatore',
  postcode: '641002',
  source: 'default',
  isEstimated: true
};

/**
 * Perform reverse geocoding from latitude & longitude to get human-readable address parts.
 * Uses BigDataCloud client API (CORS-friendly, no key required) with Nominatim fallback.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<{
  city: string;
  area: string;
  formattedAddress: string;
  displayName: string;
  postcode: string;
}> {
  // Provider 1: BigDataCloud (fast, browser-friendly, no rate-limiting blocks)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const city = data.city || data.locality || data.principalSubdivision || '';
      const area = data.locality || data.city || '';
      const state = data.principalSubdivision || '';
      const postcode = data.postcode || '';

      const addressParts: string[] = [];
      if (data.localityInfo?.informative) {
        for (const item of data.localityInfo.informative) {
          if (item.name && item.description?.includes('road') || item.description?.includes('street')) {
            addressParts.push(item.name);
          }
        }
      }
      if (area && !addressParts.includes(area)) addressParts.push(area);
      if (city && city !== area && !addressParts.includes(city)) addressParts.push(city);
      if (state && !addressParts.includes(state)) addressParts.push(state);
      if (postcode) addressParts.push(`PIN: ${postcode}`);

      const formattedAddress = addressParts.length > 0 ? addressParts.join(', ') : `${area || city}, ${state}`.trim();
      const displayName = [area, city].filter(Boolean).join(', ') || formattedAddress || `${lat.toFixed(4)}°, ${lng.toFixed(4)}°`;

      if (city || area || formattedAddress) {
        return {
          city: city || 'Current Location',
          area: area || city || 'Nearby',
          formattedAddress: formattedAddress || displayName,
          displayName: displayName || formattedAddress,
          postcode
        };
      }
    }
  } catch (err) {
    // Fall through to Provider 2
  }

  // Provider 2: OpenStreetMap Nominatim
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      {
        headers: { 'Accept-Language': 'en' },
        signal: controller.signal
      }
    );
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const addr = data.address || {};
      const neighborhood = addr.suburb || addr.neighbourhood || addr.residential || addr.commercial || addr.quarter || addr.city_district || '';
      const city = addr.city || addr.town || addr.municipality || addr.village || addr.county || addr.state_district || '';
      const state = addr.state || '';
      const postcode = addr.postcode || '';

      const streetParts = [
        addr.house_number,
        addr.building,
        addr.road || addr.pedestrian || addr.footway || addr.path,
        neighborhood,
        city,
        postcode ? `PIN: ${postcode}` : ''
      ].filter(Boolean);

      const detectedAddress = streetParts.length > 0
        ? streetParts.join(', ')
        : (data.display_name ? data.display_name.split(',').slice(0, 3).join(', ') : '');

      const area = neighborhood || city || state || '';
      const displayName = [neighborhood, city].filter(Boolean).join(', ') || detectedAddress;

      return {
        city: city || area || 'Current Location',
        area: area || city,
        formattedAddress: detectedAddress || displayName,
        displayName: displayName || detectedAddress,
        postcode
      };
    }
  } catch (err) {
    // Silent ignore
  }

  // Fallback if reverse geocoding is unavailable
  return {
    city: 'Current Location',
    area: 'Nearby',
    formattedAddress: `Coordinates: ${lat.toFixed(4)}°, ${lng.toFixed(4)}°`,
    displayName: `GPS (${lat.toFixed(4)}°, ${lng.toFixed(4)}°)`,
    postcode: ''
  };
}

/**
 * Fetch approximate user location via IP Geolocation APIs (never blocks or requires GPS hardware)
 */
export async function getIpLocation(): Promise<DetectedLocation | null> {
  // Try ipwho.is
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const res = await fetch('https://ipwho.is/', { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.success && data.latitude && data.longitude) {
        const city = data.city || 'Current Area';
        const region = data.region || '';
        const displayName = [city, region].filter(Boolean).join(', ');
        return {
          lat: data.latitude,
          lng: data.longitude,
          city,
          area: city,
          formattedAddress: `${displayName}, ${data.country || ''}`.trim(),
          displayName,
          postcode: data.postal || '',
          source: 'ip',
          isEstimated: true
        };
      }
    }
  } catch {}

  // Try ipapi.co
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const res = await fetch('https://ipapi.co/json/', { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.latitude && data.longitude) {
        const city = data.city || 'Current Area';
        const region = data.region || '';
        const displayName = [city, region].filter(Boolean).join(', ');
        return {
          lat: data.latitude,
          lng: data.longitude,
          city,
          area: city,
          formattedAddress: `${displayName}, ${data.country_name || ''}`.trim(),
          displayName,
          postcode: data.postal || '',
          source: 'ip',
          isEstimated: true
        };
      }
    }
  } catch {}

  return null;
}

export function formatGeolocationError(error: GeolocationPositionError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return 'Permission denied – please allow location access in your browser settings.';
    case error.POSITION_UNAVAILABLE:
      return 'Location unavailable – try again or enter your address manually.';
    case error.TIMEOUT:
      return 'Location request timed out – ensure you have a stable connection.';
    default:
      return 'Unable to detect location. Please try again.';
  }
}

/**
 * Robust primary detection function.
 * Attempts high-accuracy GPS -> standard accuracy GPS -> IP Geolocation -> Default.
 */
export async function detectUserLocation(options?: {
  enableReverseGeocode?: boolean;
  forceIpFallback?: boolean;
  highAccuracyTimeout?: number;
  networkTimeout?: number;
}): Promise<DetectedLocation> {
  const shouldReverseGeocode = options?.enableReverseGeocode !== false;
  const highTimeout = options?.highAccuracyTimeout ?? 6000;
  const networkTimeout = options?.networkTimeout ?? 8000;

  // If forced IP fallback, skip GPS attempts
  if (options?.forceIpFallback) {
    const ipResult = await getIpLocation();
    if (ipResult) {
      return ipResult;
    }
    return DEFAULT_FALLBACK_LOCATION;
  }

  // 1. Try Browser Geolocation API if available
  if (typeof navigator !== 'undefined' && navigator.geolocation) {
    // Attempt 1: High Accuracy GPS (Satellites & Sensors)
    try {
      const highAccuracyResult = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve(pos),
          (err) => reject(err),
          { enableHighAccuracy: true, timeout: highTimeout, maximumAge: 30000 }
        );
      });

      const { latitude, longitude, accuracy } = highAccuracyResult.coords;
      let geoInfo = {
        city: 'Current Location',
        area: 'Nearby',
        formattedAddress: `GPS (${latitude.toFixed(4)}°, ${longitude.toFixed(4)}°)`,
        displayName: `Current Location (${latitude.toFixed(4)}°, ${longitude.toFixed(4)}°)`,
        postcode: ''
      };

      if (shouldReverseGeocode) {
        geoInfo = await reverseGeocode(latitude, longitude);
      }

      return {
        lat: latitude,
        lng: longitude,
        accuracy: accuracy ? Math.round(accuracy) : undefined,
        city: geoInfo.city,
        area: geoInfo.area,
        formattedAddress: geoInfo.formattedAddress,
        displayName: geoInfo.displayName,
        postcode: geoInfo.postcode,
        source: 'gps-high',
        isEstimated: false
      };
    } catch (gpsError) {
      // Provide a friendly error if high accuracy fails
      const msg = (gpsError && (gpsError as GeolocationPositionError).code !== undefined)
        ? formatGeolocationError(gpsError as GeolocationPositionError)
        : 'High accuracy GPS failed.';
      // Continue to low accuracy fallback
    }

    // Attempt 2: Standard Accuracy (Wi-Fi / Cellular Triangulation - fast & works indoors)
    try {
      const lowAccuracyResult = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve(pos),
          (err) => reject(err),
          { enableHighAccuracy: false, timeout: networkTimeout, maximumAge: 300000 }
        );
      });

      const { latitude, longitude, accuracy } = lowAccuracyResult.coords;
      let geoInfo = {
        city: 'Current Location',
        area: 'Nearby',
        formattedAddress: `Network GPS (${latitude.toFixed(4)}°, ${longitude.toFixed(4)}°)`,
        displayName: `Current Location (${latitude.toFixed(4)}°, ${longitude.toFixed(4)}°)`,
        postcode: ''
      };

      if (shouldReverseGeocode) {
        geoInfo = await reverseGeocode(latitude, longitude);
      }

      return {
        lat: latitude,
        lng: longitude,
        accuracy: accuracy ? Math.round(accuracy) : undefined,
        city: geoInfo.city,
        area: geoInfo.area,
        formattedAddress: geoInfo.formattedAddress,
        displayName: geoInfo.displayName,
        postcode: geoInfo.postcode,
        source: 'gps-network',
        isEstimated: false
      };
    } catch (gpsError) {
      const msg = (gpsError && (gpsError as GeolocationPositionError).code !== undefined)
        ? formatGeolocationError(gpsError as GeolocationPositionError)
        : 'Standard accuracy GPS failed.';
      // Continue to IP fallback
    }
  }


  // 2. Browser GPS failed / permission denied / desktop browser without GPS -> Fallback to IP Geolocation
  const ipResult = await getIpLocation();
  if (ipResult) {
    return ipResult;
  }

  // 3. Complete fallback to default Coimbatore coordinates
  return DEFAULT_FALLBACK_LOCATION;
}

/**
 * Forward Geocoding: Look up coordinates for a typed address or location name.
 */
export async function forwardGeocode(query: string): Promise<{ lat: number; lng: number; displayName: string } | null> {
  if (!query || !query.trim()) return null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query.trim())}&limit=1&addressdetails=1`,
      {
        headers: { 'Accept-Language': 'en' },
        signal: controller.signal
      }
    );
    clearTimeout(timeoutId);

    if (res.ok) {
      const list = await res.json();
      if (Array.isArray(list) && list.length > 0) {
        const item = list[0];
        const lat = parseFloat(item.lat);
        const lng = parseFloat(item.lon);
        if (!isNaN(lat) && !isNaN(lng)) {
          return {
            lat,
            lng,
            displayName: item.display_name || query
          };
        }
      }
    }
  } catch {}

  return null;
}
