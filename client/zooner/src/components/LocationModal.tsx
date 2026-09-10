import React, { useState } from 'react';
import { X, MapPin, Navigation, Search, Check } from 'lucide-react';
import type { LocationArea } from '../types';
import { detectUserLocation, forwardGeocode, formatGeolocationError } from '../services/locationService';

interface LocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedLocation: LocationArea;
  onSelectLocation: (location: LocationArea) => void;
}

export const LocationModal: React.FC<LocationModalProps> = ({
  isOpen,
  onClose,
  selectedLocation,
  onSelectLocation,
}) => {
  const [query, setQuery] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsSuccess, setGpsSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDetectGPS = async () => {
    setIsLocating(true);
    setGpsError(null);
    setGpsSuccess(null);

    try {
      const loc = await detectUserLocation({ enableReverseGeocode: true });
      const locationName = loc.displayName || loc.area || loc.city || 'Current Location';
      const cityName = loc.city || 'Current Location';

      onSelectLocation({
        id: loc.isEstimated ? 'ip-location' : 'live-gps',
        name: locationName,
        city: cityName,
        storesCount: 0,
        activeRequests: 0,
        lat: loc.lat,
        lng: loc.lng
      });

      setGpsSuccess(`Found: ${locationName} (${loc.lat.toFixed(4)}°, ${loc.lng.toFixed(4)}°)`);
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err: any) {
      const msg = err?.code !== undefined ? formatGeolocationError(err) : 'Unable to auto-detect location. Please enter your address manually.';
      setGpsError(msg);
    } finally {
      setIsLocating(false);
    }
  };

  const handleRetry = () => {
    setGpsError(null);
    handleDetectGPS();
  };

  const predefinedLocations: Array<{ name: string; city: string; lat: number; lng: number }> = [
    { name: 'RS Puram', city: 'Coimbatore', lat: 11.0088, lng: 76.9497 },
    { name: 'Gandhipuram', city: 'Coimbatore', lat: 11.0183, lng: 76.9644 },
    { name: 'Race Course', city: 'Coimbatore', lat: 11.0016, lng: 76.9744 },
    { name: 'Peelamedu', city: 'Coimbatore', lat: 11.0287, lng: 77.0125 },
    { name: 'Saibaba Colony', city: 'Coimbatore', lat: 11.0267, lng: 76.9458 },
    { name: 'Indiranagar', city: 'Bengaluru', lat: 12.9784, lng: 77.6408 },
    { name: 'Koramangala', city: 'Bengaluru', lat: 12.9352, lng: 77.6245 },
    { name: 'T. Nagar', city: 'Chennai', lat: 13.0418, lng: 77.2341 }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
      {/* Backdrop */}
      <div 
        className="absolute inset-0"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white border border-gray-100 shadow-2xl transition-all z-10 text-gray-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#7C5CFF]/10 text-[#7C5CFF]">
              <MapPin className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-950 font-['Inter']">Select Location</h3>
              <p className="text-xs text-gray-500">Discover stores and real stock nearby</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-900 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Quick GPS detect button */}
          <button
            onClick={handleDetectGPS}
            disabled={isLocating}
            className="mb-4 flex w-full items-center justify-between rounded-2xl bg-[#7C5CFF]/5 border border-[#7C5CFF]/20 px-4 py-3 text-left transition-all hover:bg-[#7C5CFF]/10 cursor-pointer disabled:opacity-50"
          >
            <div className="flex items-center gap-3">
              <div className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#7C5CFF] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-[#7C5CFF]"></span>
              </div>
              <div>
                <div className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                  <Navigation className={`h-3.5 w-3.5 text-[#7C5CFF] ${isLocating ? 'animate-spin' : ''}`} />
                  {isLocating ? 'Detecting your GPS position...' : 'Use Current Location (GPS)'}
                </div>
                <div className="text-xs text-gray-500">
                  {selectedLocation.lat && selectedLocation.lng
                    ? `Active (${selectedLocation.lat.toFixed(4)}°, ${selectedLocation.lng.toFixed(4)}°)`
                    : 'Auto-detect real-time GPS coordinates'}
                </div>
              </div>
            </div>
            <span className="text-xs font-semibold text-[#7C5CFF]">
              {isLocating ? 'Locating...' : 'Detect'}
            </span>
          </button>

          {gpsSuccess && (
            <div className="mb-4 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 font-medium flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-emerald-600" />
              <span>{gpsSuccess}</span>
            </div>
          )}

          {gpsError && (
            <div className="mb-4 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-700 font-medium">
              {gpsError}
            </div>
          )}
          {gpsError && (
            <button
              onClick={handleRetry}
              className="mt-2 w-full flex items-center justify-center rounded-md bg-[#7C5CFF]/10 text-[#7C5CFF] py-2 text-sm font-medium hover:bg-[#7C5CFF]/20"
            >Retry</button>
          )}

          {/* Quick neighborhood tags */}
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-700 mb-2">
              Popular Local Areas
            </label>
            <div className="flex flex-wrap gap-2">
              {predefinedLocations.map((loc) => (
                <button
                  key={loc.name}
                  type="button"
                  onClick={() => {
                    onSelectLocation({
                      id: `loc-${loc.name.toLowerCase().replace(/\s+/g, '-')}`,
                      name: `${loc.name}, ${loc.city}`,
                      city: loc.city,
                      storesCount: 12,
                      activeRequests: 4,
                      lat: loc.lat,
                      lng: loc.lng
                    });
                    onClose();
                  }}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                    selectedLocation.name.toLowerCase().includes(loc.name.toLowerCase())
                      ? 'bg-[#7C5CFF] text-white border-[#7C5CFF]'
                      : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {loc.name} ({loc.city.slice(0, 3)})
                </button>
              ))}
            </div>
          </div>

          {/* Search / Custom Area Input */}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (query.trim()) {
                const geo = await forwardGeocode(query.trim());
                onSelectLocation({
                  id: `custom-${Date.now()}`,
                  name: geo ? geo.displayName.split(',').slice(0, 2).join(', ') : query.trim(),
                  city: query.trim().split(',')[0],
                  storesCount: 0,
                  activeRequests: 0,
                  lat: geo ? geo.lat : (selectedLocation.lat || 11.0168),
                  lng: geo ? geo.lng : (selectedLocation.lng || 76.9558)
                });
                onClose();
              }
            }}
            className="space-y-3"
          >
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search any city or area (e.g., Koramangala, Delhi, Chennai)..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full rounded-xl bg-white border border-gray-200 py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 focus:border-[#7C5CFF] focus:outline-hidden focus:ring-1 focus:ring-[#7C5CFF]"
              />
            </div>

            {query.trim() && (
              <button
                type="submit"
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#7C5CFF] hover:bg-[#6847ed] text-white py-2.5 text-sm font-semibold shadow-xs transition-all cursor-pointer"
              >
                <MapPin className="h-4 w-4" />
                <span>Search & Set Location to "{query.trim()}"</span>
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};
