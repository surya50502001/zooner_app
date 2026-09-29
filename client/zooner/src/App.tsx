import { useState, useEffect } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { Navbar } from './components/Navbar';
import { PublicLandingPage } from './pages/PublicLandingPage';
import { CustomerAppPage } from './pages/CustomerAppPage';
import { VendorDashboardPage } from './pages/VendorDashboardPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { LocationModal } from './components/LocationModal';
import { SignInModal } from './components/SignInModal';
import { ExperienceSwitcherModal, getUserCapabilities } from './components/ExperienceSwitcher';
import { ModeTransitionOverlay } from './components/ModeTransitionOverlay';
import { Capacitor } from '@capacitor/core';
import type { LocationArea } from './types';
import { detectUserLocation } from './services/locationService';

const DEFAULT_LOCATION: LocationArea = {
  id: 'loc-live',
  name: 'Current Location',
  city: 'Coimbatore',
  storesCount: 0,
  activeRequests: 0,
  lat: 11.0168,
  lng: 76.9558
};

export type AppRoute = 'marketing' | 'customer' | 'vendor' | 'admin';

export function AppContent() {
  const [userProfile, setUserProfile] = useState<any>(() => {
    try {
      const stored = localStorage.getItem('zooner_user_profile');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  // Sync user profile state
  useEffect(() => {
    const handleStorage = () => {
      try {
        const stored = localStorage.getItem('zooner_user_profile');
        setUserProfile(stored ? JSON.parse(stored) : null);
      } catch {
        setUserProfile(null);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const caps = getUserCapabilities(userProfile);

  const [currentRoute, setCurrentRoute] = useState<AppRoute>(() => {
    if (Capacitor.isNativePlatform()) return 'customer';
    const hash = window.location.hash.toLowerCase();
    const path = window.location.pathname.toLowerCase();
    if (hash.includes('admin') || path.includes('/admin')) {
      return 'admin';
    }
    if (hash.includes('vendor') || hash.includes('merchant') || hash.includes('register-store') || path.includes('/vendor') || path.includes('/merchant')) {
      return 'vendor';
    }
    if (hash.includes('app') || hash.includes('customer') || path.includes('/app')) {
      return 'customer';
    }
    const savedMode = localStorage.getItem('zooner_active_mode');
    if (savedMode === 'vendor') return 'vendor';
    if (savedMode === 'customer') return 'customer';
    return 'marketing';
  });

  // Mode Transition Animation State
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionSource, setTransitionSource] = useState<AppRoute>('customer');
  const [transitionTarget, setTransitionTarget] = useState<AppRoute>('vendor');

  const [currentLocation, setCurrentLocation] = useState<LocationArea>(DEFAULT_LOCATION);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [isSignInModalOpen, setIsSignInModalOpen] = useState(false);
  const [isExperienceSwitcherOpen, setIsExperienceSwitcherOpen] = useState(false);
  const [signInRoleHint, setSignInRoleHint] = useState<'C' | 'V' | 'VC'>('C');

  // Auto-detect real-time location with multi-tier fallback on startup
  useEffect(() => {
    let isMounted = true;
    detectUserLocation({ enableReverseGeocode: true })
      .then((loc) => {
        if (!isMounted) return;
        setCurrentLocation({
          id: loc.isEstimated ? 'ip-location' : 'live-gps',
          name: loc.displayName || loc.area || 'Current Location',
          city: loc.city || 'Coimbatore',
          storesCount: 0,
          activeRequests: 0,
          lat: loc.lat,
          lng: loc.lng
        });
      })
      .catch(() => {
        // Keeps default location
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // Sync with browser hash changes for back/forward navigation
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.toLowerCase();
      const path = window.location.pathname.toLowerCase();
      if (hash.includes('admin') || path.includes('/admin')) {
        setCurrentRoute('admin');
      } else if (hash.includes('register-store') || hash.includes('registerstore') || hash.includes('vendor') || hash.includes('merchant') || path.includes('/vendor') || path.includes('/merchant')) {
        setCurrentRoute('vendor');
      } else if (hash.includes('login') || hash.includes('signin') || hash.includes('register')) {
        setIsSignInModalOpen(true);
      } else if (hash.includes('app') || hash.includes('customer') || path.includes('/app')) {
        setCurrentRoute('customer');
      } else {
        setCurrentRoute('marketing');
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigateTo = (route: AppRoute, skipAnimation: boolean = false) => {
    if (route === currentRoute) return;

    if (skipAnimation || route === 'marketing') {
      setCurrentRoute(route);
      if (route === 'admin') {
        window.location.hash = '#admin';
      } else if (route === 'vendor') {
        window.location.hash = '#merchant';
        localStorage.setItem('zooner_active_mode', 'vendor');
      } else if (route === 'marketing') {
        window.location.hash = '#home';
      } else {
        window.location.hash = '#app';
        localStorage.setItem('zooner_active_mode', 'customer');
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Trigger seamless 400ms context transition
    setTransitionSource(currentRoute);
    setTransitionTarget(route);
    setIsTransitioning(true);

    // Midway swap: flip the route underneath the smooth blur overlay
    setTimeout(() => {
      setCurrentRoute(route);
      if (route === 'admin') {
        window.location.hash = '#admin';
      } else if (route === 'vendor') {
        window.location.hash = '#merchant';
        localStorage.setItem('zooner_active_mode', 'vendor');
      } else {
        window.location.hash = '#app';
        localStorage.setItem('zooner_active_mode', 'customer');
      }
      window.scrollTo({ top: 0 });
    }, 180);

    // Reveal target experience
    setTimeout(() => {
      setIsTransitioning(false);
    }, 420);
  };

  const handleSwitchToVendor = () => {
    navigateTo('vendor');
  };

  return (
    <>
      {/* ── SEAMLESS MODE TRANSITION OVERLAY ── */}
      <ModeTransitionOverlay
        isTransitioning={isTransitioning}
        sourceMode={transitionSource}
        targetMode={transitionTarget}
        userName={userProfile?.name?.split(' ')[0] || 'Shopper'}
        storeName={userProfile?.shops?.[0]?.name || userProfile?.storeName || 'TechWorld'}
      />

      {/* ── EXPERIENCE 3: ADMIN DASHBOARD (Platform Control) ── */}
      {currentRoute === 'admin' && (
        <div className="min-h-screen bg-slate-950 text-white flex flex-col">
          <AdminDashboardPage
            onSwitchToCustomer={() => navigateTo('customer')}
            onSwitchToVendor={handleSwitchToVendor}
            onOpenExperienceSwitcher={() => setIsExperienceSwitcherOpen(true)}
            isMultiRole={caps.isMultiRole}
          />
        </div>
      )}

      {/* ── EXPERIENCE 2: STORE MODE (Individual Screen) ── */}
      {currentRoute === 'vendor' && (
        <div className="min-h-screen bg-[#F8F9FA] text-gray-900 flex flex-col selection:bg-[#007AFF] selection:text-white">
          <VendorDashboardPage
            onSwitchToCustomer={() => navigateTo('customer')}
            onNavigateToAdmin={() => navigateTo('admin')}
            onOpenExperienceSwitcher={() => setIsExperienceSwitcherOpen(true)}
            isMultiRole={true}
          />
          <SignInModal
            isOpen={isSignInModalOpen}
            onClose={() => setIsSignInModalOpen(false)}
            onSwitchToRetailer={() => navigateTo('vendor')}
            initialRole={signInRoleHint}
            onSuccessLogin={() => {
              navigateTo('customer');
            }}
          />
        </div>
      )}

      {/* ── EXPERIENCE 1B: SHOPPING MODE (Customer App / Discovery) ── */}
      {(Capacitor.isNativePlatform() || currentRoute === 'customer') && currentRoute !== 'admin' && currentRoute !== 'vendor' && currentRoute !== 'marketing' && (
        <div className="min-h-screen bg-[#F0F2F5] text-gray-950 flex flex-col items-center justify-start selection:bg-[#007AFF] selection:text-white sm:py-0">
          <div className="w-full max-w-[440px] min-h-screen bg-white sm:shadow-2xl sm:border-x sm:border-gray-100 flex flex-col relative">
            <CustomerAppPage
              currentLocation={currentLocation}
              onOpenLocationModal={() => setIsLocationModalOpen(true)}
              onNavigateToHome={() => navigateTo('marketing', true)}
              onNavigateToVendor={handleSwitchToVendor}
              onNavigateToAdmin={() => navigateTo('admin')}
              onOpenSignIn={(hint) => {
                setSignInRoleHint(hint || 'C');
                setIsSignInModalOpen(true);
              }}
              onOpenRetailerModal={() => navigateTo('vendor')}
              onOpenExperienceSwitcher={() => setIsExperienceSwitcherOpen(true)}
              isMultiRole={true}
            />
          </div>
          <LocationModal
            isOpen={isLocationModalOpen}
            onClose={() => setIsLocationModalOpen(false)}
            selectedLocation={currentLocation}
            onSelectLocation={(loc) => setCurrentLocation(loc)}
          />
          <SignInModal
            isOpen={isSignInModalOpen}
            onClose={() => setIsSignInModalOpen(false)}
            onSwitchToRetailer={() => navigateTo('vendor')}
            initialRole={signInRoleHint}
            onSuccessLogin={() => {
              navigateTo('customer');
            }}
          />
        </div>
      )}

      {/* ── EXPERIENCE 1A: PUBLIC MARKETING LANDING PAGE ── */}
      {currentRoute === 'marketing' && (
        <div className="min-h-screen bg-[#070A11] text-white flex flex-col selection:bg-white selection:text-black relative">
          <Navbar
            currentLocation={currentLocation}
            onOpenLocationModal={() => setIsLocationModalOpen(true)}
            onNavigateToVendor={handleSwitchToVendor}
            onLaunchCustomerApp={() => navigateTo('customer')}
            onOpenSignIn={() => setIsSignInModalOpen(true)}
          />

          <main className="flex-1">
            <PublicLandingPage
              currentLocation={currentLocation}
              onOpenLocationModal={() => setIsLocationModalOpen(true)}
              onLaunchCustomerApp={() => navigateTo('customer')}
              onNavigateToVendor={handleSwitchToVendor}
            />
          </main>

          <LocationModal
            isOpen={isLocationModalOpen}
            onClose={() => setIsLocationModalOpen(false)}
            selectedLocation={currentLocation}
            onSelectLocation={(loc) => setCurrentLocation(loc)}
          />

          <SignInModal
            isOpen={isSignInModalOpen}
            onClose={() => setIsSignInModalOpen(false)}
            onSwitchToRetailer={() => navigateTo('vendor')}
            initialRole={signInRoleHint}
            onSuccessLogin={() => {
              navigateTo('customer');
            }}
          />
        </div>
      )}

      {/* ── MODE SWITCHER MODAL (One Account, Two Modes) ── */}
      <ExperienceSwitcherModal
        isOpen={isExperienceSwitcherOpen}
        onClose={() => setIsExperienceSwitcherOpen(false)}
        currentExperience={currentRoute}
        onSelectExperience={(exp) => navigateTo(exp)}
        onOpenRetailerModal={() => navigateTo('vendor')}
        userProfile={userProfile}
      />
    </>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

export default App;
