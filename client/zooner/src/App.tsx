import { useState, useEffect } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { Navbar } from './components/Navbar';
import { PublicLandingPage } from './pages/PublicLandingPage';
import { CustomerAppPage } from './pages/CustomerAppPage';
import { VendorDashboardPage } from './pages/VendorDashboardPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { LocationModal } from './components/LocationModal';
import { RetailerModal } from './components/RetailerModal';
import { SignInModal } from './components/SignInModal';
import { ExperienceSwitcherModal, getUserCapabilities } from './components/ExperienceSwitcher';
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
  const [currentRoute, setCurrentRoute] = useState<AppRoute>(() => {
    if (Capacitor.isNativePlatform()) return 'customer';
    const hash = window.location.hash.toLowerCase();
    const path = window.location.pathname.toLowerCase();
    if (hash.includes('admin') || path.includes('/admin')) {
      return 'admin';
    }
    if (hash.includes('vendor') || path.includes('/vendor')) return 'vendor';
    if (hash.includes('marketing') || path.includes('/marketing')) return 'marketing';
    return 'customer';
  });

  const [currentLocation, setCurrentLocation] = useState<LocationArea>(DEFAULT_LOCATION);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [isRetailerModalOpen, setIsRetailerModalOpen] = useState(false);
  const [isSignInModalOpen, setIsSignInModalOpen] = useState(false);
  const [isExperienceSwitcherOpen, setIsExperienceSwitcherOpen] = useState(false);
  const [signInRoleHint, setSignInRoleHint] = useState<'C' | 'V' | 'VC'>('C');

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
      } else if (hash.includes('register-store') || hash.includes('registerstore')) {
        setIsRetailerModalOpen(true);
      } else if (hash.includes('login') || hash.includes('signin') || hash.includes('register')) {
        setIsSignInModalOpen(true);
      } else if (hash.includes('vendor') || hash.includes('merchant') || path.includes('/vendor') || path.includes('/merchant')) {
        setCurrentRoute('vendor');
      } else if (hash.includes('marketing') || path.includes('/marketing')) {
        setCurrentRoute('marketing');
      } else {
        setCurrentRoute('customer');
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigateTo = (route: AppRoute) => {
    setCurrentRoute(route);
    if (route === 'admin') {
      window.location.hash = '#admin';
    } else if (route === 'vendor') {
      window.location.hash = '#merchant';
    } else if (route === 'marketing') {
      window.location.hash = '#marketing';
    } else {
      window.location.hash = '#app';
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
      {/* ── EXPERIENCE 3: ADMIN DASHBOARD (Platform Control) ── */}
      {currentRoute === 'admin' && (
        <div className="min-h-screen bg-slate-950 text-white flex flex-col">
          <AdminDashboardPage
            onSwitchToCustomer={() => navigateTo('customer')}
            onSwitchToVendor={() => navigateTo('vendor')}
            onOpenExperienceSwitcher={() => setIsExperienceSwitcherOpen(true)}
            isMultiRole={caps.isMultiRole}
          />
        </div>
      )}

      {/* ── EXPERIENCE 2: VENDOR DASHBOARD (Merchant OS) ── */}
      {currentRoute === 'vendor' && (
        <div className="min-h-screen bg-black text-white flex flex-col selection:bg-white selection:text-black">
          <VendorDashboardPage
            onSwitchToCustomer={() => navigateTo('customer')}
            onNavigateToAdmin={() => navigateTo('admin')}
            onOpenExperienceSwitcher={() => setIsExperienceSwitcherOpen(true)}
            isMultiRole={caps.isMultiRole}
          />
          <SignInModal
            isOpen={isSignInModalOpen}
            onClose={() => setIsSignInModalOpen(false)}
            onSwitchToRetailer={() => setIsRetailerModalOpen(true)}
            initialRole={signInRoleHint}
            onSuccessLogin={(role) => {
              if (role === 'Vendor') navigateTo('vendor');
              else navigateTo('customer');
            }}
          />
          <RetailerModal
            isOpen={isRetailerModalOpen}
            onClose={() => setIsRetailerModalOpen(false)}
            onSuccess={() => navigateTo('vendor')}
            onOpenSignIn={() => {
              setSignInRoleHint('V');
              setIsRetailerModalOpen(false);
              setIsSignInModalOpen(true);
            }}
          />
        </div>
      )}

      {/* ── EXPERIENCE 1B: CUSTOMER APPLICATION (Discovery & Shopping) ── */}
      {(Capacitor.isNativePlatform() || currentRoute === 'customer') && currentRoute !== 'admin' && currentRoute !== 'vendor' && currentRoute !== 'marketing' && (
        <div className="min-h-screen bg-[#F0F2F5] text-gray-950 flex flex-col items-center justify-start selection:bg-[#7C5CFF] selection:text-white sm:py-0">
          <div className="w-full max-w-[440px] min-h-screen bg-white sm:shadow-2xl sm:border-x sm:border-gray-100 flex flex-col relative">
            <CustomerAppPage
              currentLocation={currentLocation}
              onOpenLocationModal={() => setIsLocationModalOpen(true)}
              onNavigateToHome={() => navigateTo('marketing')}
              onOpenSignIn={(hint) => {
                setSignInRoleHint(hint || 'C');
                setIsSignInModalOpen(true);
              }}
              onOpenRetailerModal={() => setIsRetailerModalOpen(true)}
              onOpenExperienceSwitcher={() => setIsExperienceSwitcherOpen(true)}
              isMultiRole={caps.isMultiRole}
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
            onSwitchToRetailer={() => setIsRetailerModalOpen(true)}
            initialRole={signInRoleHint}
            onSuccessLogin={(role) => {
              if (role === 'Vendor') navigateTo('vendor');
              else navigateTo('customer');
            }}
          />
          <RetailerModal
            isOpen={isRetailerModalOpen}
            onClose={() => setIsRetailerModalOpen(false)}
            onSuccess={() => navigateTo('vendor')}
            onOpenSignIn={() => {
              setIsRetailerModalOpen(false);
              setIsSignInModalOpen(true);
            }}
          />
        </div>
      )}

      {/* ── EXPERIENCE 1A: ONE PUBLIC MARKETING LANDING PAGE (Optional Marketing Route) ── */}
      {currentRoute === 'marketing' && (
        <div className="min-h-screen bg-[#070A11] text-white flex flex-col selection:bg-white selection:text-black relative">
          <Navbar
            currentLocation={currentLocation}
            onOpenLocationModal={() => setIsLocationModalOpen(true)}
            onNavigateToVendor={() => navigateTo('vendor')}
            onLaunchCustomerApp={() => navigateTo('customer')}
            onOpenSignIn={() => setIsSignInModalOpen(true)}
          />

          <main className="flex-1">
            <PublicLandingPage
              currentLocation={currentLocation}
              onOpenLocationModal={() => setIsLocationModalOpen(true)}
              onLaunchCustomerApp={() => navigateTo('customer')}
              onNavigateToVendor={() => navigateTo('vendor')}
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
            onSwitchToRetailer={() => setIsRetailerModalOpen(true)}
            initialRole={signInRoleHint}
            onSuccessLogin={(role) => {
              if (role === 'Vendor') navigateTo('vendor');
              else navigateTo('customer');
            }}
          />

          <RetailerModal
            isOpen={isRetailerModalOpen}
            onClose={() => setIsRetailerModalOpen(false)}
            onSuccess={() => navigateTo('vendor')}
            onOpenSignIn={() => {
              setSignInRoleHint('V');
              setIsRetailerModalOpen(false);
              setIsSignInModalOpen(true);
            }}
          />
        </div>
      )}

      {/* ── MULTI-ROLE EXPERIENCE SWITCHER MODAL ── */}
      <ExperienceSwitcherModal
        isOpen={isExperienceSwitcherOpen}
        onClose={() => setIsExperienceSwitcherOpen(false)}
        currentExperience={currentRoute}
        onSelectExperience={(exp) => navigateTo(exp)}
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

