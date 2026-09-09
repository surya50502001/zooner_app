import React from 'react';
import { X, MapPin, Navigation, Search } from 'lucide-react';
import type { LocationArea } from '../types';

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
  const [query, setQuery] = React.useState('');
  const [isLocating, setIsLocating] = React.useState(false);
  const [gpsError, setGpsError] = React.useState<string | null>(null);

  if (!isOpen) return null;

  const handleDetectGPS = () => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by your browser.');
      return;
    }

    setIsLocating(true);
    setGpsError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocating(false);
        const { latitude, longitude } = position.coords;
        onSelectLocation({
          id: 'live-gps',
          name: 'Current Location (GPS)',
          city: 'Coimbatore',
          storesCount: 0,
          activeRequests: 0,
          lat: latitude,
          lng: longitude
        });
        onClose();
      },
      (error) => {
        setIsLocating(false);
        setGpsError(error.message || 'Unable to retrieve your location.');
        // Fallback to default location area if permission denied
        onSelectLocation({
          id: 'default-coimbatore',
          name: 'Coimbatore',
          city: 'Coimbatore',
          storesCount: 0,
          activeRequests: 0,
          lat: 11.0168,
          lng: 76.9558
        });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const predefinedLocations: string[] = [
    'Coimbatore',
    'RS Puram',
    'Gandhipuram',
    'Race Course',
    'Peelamedu',
    'Saibaba Colony'
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

          {gpsError && (
            <div className="mb-4 p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-600 font-medium">
              {gpsError}
            </div>
          )}

          {/* Quick neighborhood tags */}
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-700 mb-2">
              Popular Local Areas
            </label>
            <div className="flex flex-wrap gap-2">
              {predefinedLocations.map((loc) => (
                <button
                  key={loc}
                  type="button"
                  onClick={() => {
                    onSelectLocation({
                      id: `loc-${loc.toLowerCase().replace(/\s+/g, '-')}`,
                      name: loc,
                      city: 'Coimbatore',
                      storesCount: 12,
                      activeRequests: 4,
                      lat: 11.0168,
                      lng: 76.9558
                    });
                    onClose();
                  }}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                    selectedLocation.name.toLowerCase().includes(loc.toLowerCase())
                      ? 'bg-[#7C5CFF] text-white border-[#7C5CFF]'
                      : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {loc}
                </button>
              ))}
            </div>
          </div>

          {/* Search / Custom Area Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (query.trim()) {
                onSelectLocation({
                  id: `custom-${Date.now()}`,
                  name: query.trim(),
                  city: 'Coimbatore',
                  storesCount: 0,
                  activeRequests: 0,
                  lat: 11.0168,
                  lng: 76.9558
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
                placeholder="Search other area..."
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
                <span>Set Area to "{query.trim()}"</span>
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};
