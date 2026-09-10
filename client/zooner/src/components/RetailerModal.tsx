import React, { useState, useEffect } from 'react';
import { X, Store, CheckCircle, ArrowRight, ShieldCheck, Upload, MapPin, Loader2, AlertCircle, LogIn, Navigation } from 'lucide-react';
import { createShop, fetchCategories, becomeVendor } from '../services/api';
import { detectUserLocation, formatGeolocationError } from '../services/locationService';

interface RetailerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  onOpenSignIn?: () => void;
}

export const RetailerModal: React.FC<RetailerModalProps> = ({ isOpen, onClose, onSuccess, onOpenSignIn }) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [storeName, setStoreName] = useState('');
  const [category, setCategory] = useState('Footwear & Sports');
  const [area, setArea] = useState('');
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [locationFeedback, setLocationFeedback] = useState<string | null>(null);
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isAuthenticated = Boolean(localStorage.getItem('zooner_token'));

  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      setLocationFeedback(null);
      try {
        const stored = localStorage.getItem('zooner_user_profile');
        if (stored) {
          const profile = JSON.parse(stored);
          if (profile.name && !ownerName) setOwnerName(profile.name);
          if (profile.email && !email) setEmail(profile.email);
          if (profile.phone && !phone) setPhone(profile.phone.replace(/^\+91\s*/, ''));
        }
      } catch {
        // ignore profile parse issues
      }
    }
  }, [isOpen]);

  const handleDetectLocation = async () => {
    setIsDetectingLocation(true);
    setErrorMessage(null);
    setLocationFeedback(null);

    try {
      const loc = await detectUserLocation({ enableReverseGeocode: true });
      setLatitude(loc.lat);
      setLongitude(loc.lng);

      if (loc.area) setArea(loc.area);
      if (loc.formattedAddress) setAddress(loc.formattedAddress);

      const sourceLabel = loc.source === 'gps-high' ? 'High Precision GPS' : loc.source === 'gps-network' ? 'Network GPS' : 'IP Geolocation';
      setLocationFeedback(
        `📍 Location pinned: ${loc.displayName} (${loc.lat.toFixed(4)}°, ${loc.lng.toFixed(4)}° · ${sourceLabel})`
      );
    } catch (err: any) {
      setErrorMessage('Unable to auto-detect location. Please enter your address manually.');
    } finally {
      setIsDetectingLocation(false);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const token = localStorage.getItem('zooner_token');
    if (!token) {
      setErrorMessage('Please sign in to your Zooner account before registering a store.');
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Upgrade current customer identity to have Vendor capability
      await becomeVendor();

      // 2. Fetch categories
      let categoryIds: string[] = [];
      const isGuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
      try {
        const cats = await fetchCategories();
        if (cats && cats.length > 0) {
          const matchedCat = cats.find(c => c.name.toLowerCase().includes(category.toLowerCase().split(' ')[0])) || cats[0];
          if (matchedCat && isGuid(matchedCat.id)) {
            categoryIds = [matchedCat.id];
          }
        }
      } catch {}

      // 3. Create shop on backend with detected GPS or fallback coordinates
      const finalLat = latitude ?? 11.0168;
      const finalLng = longitude ?? 76.9558;
      const combinedAddress = [address.trim(), area.trim()].filter(Boolean).join(', ') || 'Physical Storefront';

      const shop = await createShop({
        name: storeName.trim() || 'Partner Store',
        phone: phone.startsWith('+') ? phone.trim() : `+91 ${phone.trim()}`,
        address: combinedAddress,
        latitude: finalLat,
        longitude: finalLng,
        categoryIds
      });

      if (!shop) {
        setErrorMessage('Failed to create store. Please check your network connection and try again.');
        setIsSubmitting(false);
        return;
      }

      setSubmitted(true);
    } catch (err: any) {
      console.error('Retailer registration error:', err);
      setErrorMessage(err?.message || 'An error occurred while creating your store. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setSubmitted(false);
    setErrorMessage(null);
    setStep(1);
    onClose();
  };

  const handleOpenDashboard = () => {
    handleReset();
    if (onSuccess) {
      onSuccess();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-md transition-opacity"
        onClick={handleReset}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-xl overflow-hidden rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 shadow-2xl">
        {/* Header decoration bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-indigo-600 via-violet-500 to-blue-500" />

        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
              <Store className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white font-['Outfit']">Join Zooner as a Retailer</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Put your physical store on the local discovery map</p>
            </div>
          </div>
          <button
            onClick={handleReset}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 md:p-8">
          {submitted ? (
            <div className="py-8 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                <CheckCircle className="h-9 w-9" />
              </div>
              <h4 className="text-2xl font-bold text-slate-900 dark:text-white mb-2 font-['Outfit']">Store Registered!</h4>
              <p className="text-slate-600 dark:text-slate-300 text-sm max-w-sm mx-auto mb-6">
                Welcome, <span className="text-slate-900 dark:text-white font-bold">{storeName || 'Partner Store'}</span>. Your store is now active on the Zooner local discovery map.
              </p>
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 p-4 text-left mb-6 space-y-2 text-xs text-slate-600 dark:text-slate-300">
                <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold font-['Outfit']">
                  <ShieldCheck className="h-4 w-4" />
                  What happens next:
                </div>
                <div className="pl-6 space-y-1">
                  <p>1. Instant access to your Zooner Merchant mobile dashboard</p>
                  <p>2. Quick inventory sync or barcode scan upload</p>
                  <p>3. Start receiving nearby customer product requests immediately</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleReset}
                  className="w-1/2 rounded-xl border border-slate-300 dark:border-slate-700 py-3 text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Close
                </button>
                <button
                  onClick={handleOpenDashboard}
                  className="w-1/2 rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white hover:bg-indigo-500 transition-colors shadow-md shadow-indigo-600/20 cursor-pointer"
                >
                  Open Merchant OS →
                </button>
              </div>
            </div>
          ) : !isAuthenticated ? (
            <div className="py-6 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                <LogIn className="h-8 w-8" />
              </div>
              <h4 className="text-xl font-bold text-slate-900 dark:text-white mb-2 font-['Outfit']">
                Account Required
              </h4>
              <p className="text-slate-600 dark:text-slate-300 text-sm max-w-sm mx-auto mb-6">
                To link and manage a store on Zooner, please sign in or create an account first. Store ownership will be tied to your verified profile.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  type="button"
                  onClick={() => {
                    handleReset();
                    onOpenSignIn?.();
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white hover:bg-indigo-500 transition-colors shadow-md shadow-indigo-600/25 cursor-pointer"
                >
                  <LogIn className="h-4 w-4" />
                  Sign In / Register
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="rounded-xl border border-slate-300 dark:border-slate-700 px-6 py-3 text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {errorMessage && (
                <div className="flex items-start gap-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 p-3.5 text-xs text-rose-700 dark:text-rose-300">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div className="flex-1">{errorMessage}</div>
                </div>
              )}
              {step === 1 ? (
                <>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                      Store Name
                    </label>
                    <div className="relative">
                      <Store className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input
                        type="text"
                        required
                        value={storeName}
                        onChange={(e) => setStoreName(e.target.value)}
                        placeholder="e.g. Apex Footwear & Athleisure"
                        className="w-full rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 py-2.5 pl-10 pr-4 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:border-indigo-500 focus:outline-none shadow-sm"
                      />
                    </div>
                  </div>

                  {/* Auto-Detect Location Button */}
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={handleDetectLocation}
                      disabled={isDetectingLocation}
                      className="flex w-full items-center justify-between rounded-2xl bg-indigo-50/80 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800/80 p-3.5 text-left transition-all hover:bg-indigo-100/70 dark:hover:bg-indigo-900/40 cursor-pointer disabled:opacity-60 group shadow-sm"
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-600/30 shrink-0">
                          {isDetectingLocation ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : (
                            <Navigation className="h-5 w-5 group-hover:scale-110 transition-transform" />
                          )}
                          {latitude && longitude && (
                            <span className="absolute -top-1 -right-1 flex h-3 w-3">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                            </span>
                          )}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <span>{isDetectingLocation ? 'Pinpointing GPS Coordinates...' : 'Auto-Detect Store Location (GPS)'}</span>
                            {latitude && longitude && (
                              <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                                Verified GPS
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            {locationFeedback || 'Tap to automatically fill your neighborhood, address & GPS coordinates'}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 group-hover:translate-x-0.5 transition-transform shrink-0">
                        {isDetectingLocation ? 'Detecting...' : latitude ? 'Re-Detect' : 'Detect →'}
                      </span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                        Category
                      </label>
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="w-full rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 py-2.5 px-3.5 text-sm text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none shadow-sm"
                      >
                        <option value="Footwear & Sports">Footwear & Sports</option>
                        <option value="Men's & Women's Fashion">Men's & Women's Fashion</option>
                        <option value="Electronics & Mobile">Electronics & Mobile</option>
                        <option value="Home & Decor">Home & Decor</option>
                        <option value="Beauty & Wellness">Beauty & Wellness</option>
                        <option value="Artisan Groceries">Artisan Groceries</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                        Neighborhood / City
                      </label>
                      <div className="relative">
                        <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                          type="text"
                          required
                          value={area}
                          onChange={(e) => setArea(e.target.value)}
                          placeholder="e.g. Indiranagar, Bengaluru or RS Puram, Coimbatore"
                          className="w-full rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 py-2.5 pl-10 pr-4 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:border-indigo-500 focus:outline-none shadow-sm"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                      Physical Store Address
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Shop #, Street Name, Landmark (e.g. #42, 100ft Road, Near Metro)"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 py-2.5 px-4 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:border-indigo-500 focus:outline-none shadow-sm"
                    />
                  </div>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white hover:bg-indigo-500 transition-colors shadow-md shadow-indigo-600/25 cursor-pointer"
                    >
                      Continue to Store Contact <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                      Store Owner / Manager Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Ramesh Kumar"
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                      className="w-full rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 py-2.5 px-4 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:border-indigo-500 focus:outline-none shadow-sm"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                        WhatsApp / Contact Mobile
                      </label>
                      <input
                        type="tel"
                        required
                        placeholder="+91 98765 43210"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 py-2.5 px-4 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:border-indigo-500 focus:outline-none shadow-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                        Business Email
                      </label>
                      <input
                        type="email"
                        required
                        placeholder="store@apexfootwear.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 py-2.5 px-4 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:border-indigo-500 focus:outline-none shadow-sm"
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-4 text-center bg-slate-50 dark:bg-slate-800/40">
                    <Upload className="mx-auto h-6 w-6 text-slate-400 mb-1" />
                    <span className="text-xs text-slate-700 dark:text-slate-300 font-semibold">Storefront Photo or GST Certificate (Optional)</span>
                    <p className="text-[11px] text-slate-500">Accelerates verification badge by 3x</p>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="w-1/3 rounded-xl border border-slate-300 dark:border-slate-700 py-3 text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-2/3 flex items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-600/25 disabled:opacity-60 cursor-pointer"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Registering Store...</span>
                        </>
                      ) : (
                        <span>Launch Digital Storefront</span>
                      )}
                    </button>
                  </div>

                </>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
