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
import { Capacitor } from '@capacitor/core';
import type { LocationArea } from './types';

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
    if (hash.includes('admin') || path.includes('/admin')) return 'admin';
    if (hash.includes('vendor') || path.includes('/vendor')) return 'vendor';
    if (hash.includes('marketing') || path.includes('/marketing')) return 'marketing';
    return 'customer';
  });

  const [currentLocation, setCurrentLocation] = useState<LocationArea>(DEFAULT_LOCATION);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [isRetailerModalOpen, setIsRetailerModalOpen] = useState(false);
  const [isSignInModalOpen, setIsSignInModalOpen] = useState(false);
  const [signInRoleHint, setSignInRoleHint] = useState<'C' | 'V' | 'VC'>('C');

  // Auto-detect real-time browser GPS location on startup
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCurrentLocation(prev => ({
            ...prev,
            id: 'live-gps',
            name: 'Current Location (GPS)',
            lat: position.coords.latitude,
            lng: position.coords.longitude
          }));
        },
        () => {
          // Silent fallback to default Coimbatore location
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      );
    }
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
      } else if (hash.includes('vendor') || path.includes('/vendor')) {
        setCurrentRoute('vendor');
      } else if (hash.includes('app') || hash.includes('customer') || path.includes('/app')) {
        setCurrentRoute('customer');
      } else {
        setCurrentRoute(Capacitor.isNativePlatform() ? 'customer' : 'marketing');
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
      window.location.hash = '#vendor';
    } else if (route === 'customer') {
      window.location.hash = '#app';
    } else {
      window.location.hash = '#';
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ── EXPERIENCE 3: ADMIN DASHBOARD (Platform Control) ──
  if (currentRoute === 'admin') {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col">
        <AdminDashboardPage
          onSwitchToCustomer={() => navigateTo('customer')}
          onSwitchToVendor={() => navigateTo('vendor')}
        />
      </div>
    );
  }

  // ── EXPERIENCE 2: VENDOR DASHBOARD (Merchant OS) ──
  if (currentRoute === 'vendor') {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col selection:bg-white selection:text-black">
        <VendorDashboardPage
          onSwitchToCustomer={() => navigateTo('customer')}
          onNavigateToAdmin={() => navigateTo('admin')}
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
    );
  }

  // ── EXPERIENCE 1B: CUSTOMER APPLICATION (Discovery & Shopping) ──
  if (Capacitor.isNativePlatform() || currentRoute === 'customer') {
    return (
      <div className="min-h-screen bg-[#F0F2F5] text-gray-950 flex flex-col items-center justify-start selection:bg-[#00A859] selection:text-white sm:py-0">
        <div className="w-full max-w-[440px] min-h-screen bg-white sm:shadow-2xl sm:border-x sm:border-gray-100 flex flex-col relative">
          <CustomerAppPage
            currentLocation={currentLocation}
            onOpenLocationModal={() => setIsLocationModalOpen(true)}
            onNavigateToHome={() => navigateTo('marketing')}
            onNavigateToVendor={() => navigateTo('vendor')}
            onNavigateToAdmin={() => navigateTo('admin')}
            onOpenSignIn={(hint) => {
              setSignInRoleHint(hint || 'C');
              setIsSignInModalOpen(true);
            }}
            onOpenRetailerModal={() => setIsRetailerModalOpen(true)}
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
    );
  }

  // ── EXPERIENCE 1A: ONE PUBLIC MARKETING LANDING PAGE (Customer & Merchant Unified) ──
  return (
    <div className="min-h-screen bg-[#070A11] text-white flex flex-col selection:bg-white selection:text-black relative">
      <Navbar
        currentLocation={currentLocation}
        onOpenLocationModal={() => setIsLocationModalOpen(true)}
        onNavigateToVendor={() => setIsRetailerModalOpen(true)}
        onLaunchCustomerApp={() => navigateTo('customer')}
        onOpenSignIn={() => setIsSignInModalOpen(true)}
      />

      <main className="flex-1">
        <PublicLandingPage
          currentLocation={currentLocation}
          onOpenLocationModal={() => setIsLocationModalOpen(true)}
          onLaunchCustomerApp={() => navigateTo('customer')}
          onNavigateToVendor={() => setIsRetailerModalOpen(true)}
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

