import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import QRCode from 'qrcode';
import { 
  Search, 
  MapPin, 
  Clock, 
  Radio, 
  Bookmark, 
  ArrowLeft,
  X, 
  Compass, 
  User, 
  ChevronRight, 
  ChevronDown, 
  Share2, 
  Bell, 
  Info, 
  LogOut, 
  CheckCircle2, 
  Loader2, 
  PackageOpen, 
  Shield, 
  Store,
  SlidersHorizontal,
  Heart,
  Home as HomeIcon,
  Sparkles,
  Smartphone,
  Laptop,
  Headphones,
  Shirt,
  ShoppingBag,
  Watch,
  LayoutGrid,
  RotateCcw
} from 'lucide-react';
import { 
  fetchCategories, 
  fetchShops, 
  searchProducts, 
  reserveInventoryHold, 
  releaseInventoryHold, 
  fetchMyActiveHolds, 
  syncUserProfile, 
  createLiveRequest, 
  ensureCustomerSession, 
  type ShopProfileDto 
} from '../services/api';
import { ExperienceHeaderPill } from '../components/ExperienceSwitcher';
import type { LocationArea, ProductSearchResult, StoreInventoryItem, CategoryDto } from '../types';

interface CustomerAppPageProps {
  currentLocation: LocationArea;
  onOpenLocationModal: () => void;
  onNavigateToHome: () => void;
  onNavigateToVendor?: () => void;
  onNavigateToAdmin?: () => void;
  onOpenSignIn: (roleHint?: 'C' | 'V' | 'VC') => void;
  onOpenRetailerModal?: () => void;
  onOpenExperienceSwitcher?: () => void;
  isMultiRole?: boolean;
}

type TabType = 'explore' | 'live-ask' | 'holds' | 'account';
type SearchTabType = 'products' | 'stores' | 'categories';
type PriceRangeFilter = 'all' | 'under1000' | '1000-5000' | '5000-20000' | 'above20000';
type SortByType = 'relevance' | 'price-asc' | 'price-desc' | 'nearby';

interface ActiveHold {
  id: string;
  holdId: string;
  storeId?: string;
  storeInventoryId?: string;
  productName: string;
  storeName: string;
  storeAddress: string;
  storePhone: string;
  price: number;
  status: 'active' | 'completed' | 'expired';
  reservedUntil: string;
  totalSeconds: number;
  qrCode: string;
}

// ── Format distance cleanly ──
function formatDistance(distKm?: number | null): string {
  if (distKm === undefined || distKm === null || isNaN(distKm)) return '';
  if (distKm < 1) {
    return `${Math.round(distKm * 1000)} m`;
  }
  return `${distKm.toFixed(1)} km`;
}

// ── Standard QR Code Generator Component ──
const StandardQRCode: React.FC<{ value: string; size?: number; className?: string }> = ({
  value,
  size = 140,
  className = ''
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current && value) {
      QRCode.toCanvas(
        canvasRef.current,
        value,
        {
          width: size,
          margin: 1,
          color: {
            dark: '#111827',
            light: '#ffffff'
          }
        },
        (err) => {
          if (err) {
            console.error('Error generating standard QR code:', err);
          }
        }
      );
    }
  }, [value, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className={`rounded-lg shadow-sm ${className}`}
    />
  );
};

// ── Category Icon Resolver ──
function getCategoryIcon(catName: string) {
  const name = catName.toLowerCase();
  if (name.includes('mobile') || name.includes('phone')) return Smartphone;
  if (name.includes('laptop') || name.includes('computer') || name.includes('tech')) return Laptop;
  if (name.includes('audio') || name.includes('headphone') || name.includes('earphone') || name.includes('sound')) return Headphones;
  if (name.includes('fashion') || name.includes('cloth') || name.includes('apparel') || name.includes('wear') || name.includes('footwear')) return Shirt;
  if (name.includes('home') || name.includes('decor') || name.includes('kitchen')) return HomeIcon;
  if (name.includes('beauty') || name.includes('cosmetic') || name.includes('wellness') || name.includes('care')) return Sparkles;
  if (name.includes('groc') || name.includes('food') || name.includes('essential')) return ShoppingBag;
  if (name.includes('watch') || name.includes('wearable')) return Watch;
  return LayoutGrid;
}

export const CustomerAppPage: React.FC<CustomerAppPageProps> = ({
  currentLocation,
  onOpenLocationModal,
  onNavigateToHome,
  onNavigateToVendor,
  onNavigateToAdmin,
  onOpenSignIn,
  onOpenRetailerModal,
  onOpenExperienceSwitcher,
  isMultiRole,
}) => {
  // Navigation & Screen States
  const [activeTab, setActiveTab] = useState<TabType>('explore');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [searchTab, setSearchTab] = useState<SearchTabType>('products');

  // Selected Store Details View
  const [selectedStore, setSelectedStore] = useState<ShopProfileDto | null>(null);
  const [storeActiveTab, setStoreActiveTab] = useState<'products' | 'about'>('products');

  // Selected Product Detail Modal / Sheet
  const [selectedProduct, setSelectedProduct] = useState<ProductSearchResult | null>(null);

  // Filter Sheet State
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  // Explore & Search Filters
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [radiusFilter, setRadiusFilter] = useState<'2 km' | '5 km' | '10 km' | '15 km'>('5 km');
  const [priceRangeFilter, setPriceRangeFilter] = useState<PriceRangeFilter>('all');
  const [inStockOnlyFilter, setInStockOnlyFilter] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<SortByType>('relevance');

  // Saved Wishlist Items State (Persisted locally)
  const [wishlistIds, setWishlistIds] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('zooner_wishlist_ids');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Real Database Data State
  const [dbCategories, setDbCategories] = useState<CategoryDto[]>([]);
  const [dbProducts, setDbProducts] = useState<ProductSearchResult[]>([]);
  const [dbShops, setDbShops] = useState<ShopProfileDto[]>([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
  const [isLoadingShops, setIsLoadingShops] = useState(false);

  // Live Ask Form State
  const [askProductName, setAskProductName] = useState('');
  const [askVariant, setAskVariant] = useState('');
  const [askCategory, setAskCategory] = useState<string>('');
  const [askRadius, setAskRadius] = useState<'2 km' | '5 km' | '10 km' | '15 km'>('5 km');
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [broadcastDone, setBroadcastDone] = useState(false);

  // Active Hold State
  const [activeHold, setActiveHold] = useState<ActiveHold | null>(() => {
    const saved = localStorage.getItem('zooner_active_primary_hold');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return null;
  });
  const [isReservingHold, setIsReservingHold] = useState(false);

  // User Profile
  const [userProfile, setUserProfile] = useState<{
    id?: string;
    name?: string;
    email?: string;
    role?: string;
    isVendor?: boolean;
    shops?: any[];
  } | null>(() => {
    const saved = localStorage.getItem('zooner_user_profile');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return null;
  });

  // Sync user profile & listen to storage events
  useEffect(() => {
    const handleStorage = () => {
      const saved = localStorage.getItem('zooner_user_profile');
      if (saved) {
        try { setUserProfile(JSON.parse(saved)); } catch {}
      } else {
        setUserProfile(null);
      }
    };
    window.addEventListener('storage', handleStorage);
    syncUserProfile().then(p => {
      if (p) setUserProfile(p);
      else if (!localStorage.getItem('zooner_token')) {
        ensureCustomerSession().catch(() => {});
      }
    });
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // Save wishlist items when changed
  useEffect(() => {
    try {
      localStorage.setItem('zooner_wishlist_ids', JSON.stringify(wishlistIds));
    } catch {}
  }, [wishlistIds]);

  const toggleWishlist = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setWishlistIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Numeric radius in kilometers
  const radiusKm = useMemo(() => {
    return parseInt(radiusFilter.replace(/[^0-9]/g, ''), 10) || 5;
  }, [radiusFilter]);

  // 250ms Search Debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load Real Categories from API
  useEffect(() => {
    let isMounted = true;
    async function loadCategories() {
      try {
        const cats = await fetchCategories();
        if (isMounted && cats) {
          setDbCategories(cats);
          if (cats.length > 0 && !askCategory) {
            setAskCategory(cats[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to load categories:', err);
      }
    }
    loadCategories();
    return () => { isMounted = false; };
  }, []);

  // Load Real Catalog Products from Backend
  const loadProducts = useCallback(async () => {
    setIsLoadingCatalog(true);
    try {
      const results = await searchProducts(
        debouncedQuery || undefined,
        selectedCategory === 'all' ? undefined : selectedCategory,
        currentLocation.lat,
        currentLocation.lng,
        radiusKm
      );
      setDbProducts(results || []);
    } catch (err) {
      console.error('Failed to load products from API:', err);
      setDbProducts([]);
    } finally {
      setIsLoadingCatalog(false);
    }
  }, [debouncedQuery, selectedCategory, currentLocation.lat, currentLocation.lng, radiusKm]);

  // Load Real Nearby Stores from Backend
  const loadShops = useCallback(async () => {
    setIsLoadingShops(true);
    try {
      const shops = await fetchShops(
        currentLocation.lat,
        currentLocation.lng,
        radiusKm,
        selectedCategory === 'all' ? undefined : selectedCategory
      );
      const visibleShops = (shops || []).filter(s => 
        s.isLiveEnabled !== false && s.isVerified !== false
      );
      setDbShops(visibleShops);
    } catch (err) {
      console.error('Failed to load shops from API:', err);
      setDbShops([]);
    } finally {
      setIsLoadingShops(false);
    }
  }, [currentLocation.lat, currentLocation.lng, radiusKm, selectedCategory]);

  useEffect(() => {
    loadProducts();
    loadShops();
  }, [loadProducts, loadShops]);

  // Sync active holds from backend
  useEffect(() => {
    const token = localStorage.getItem('zooner_token');
    if (token) {
      fetchMyActiveHolds().then(remoteHolds => {
        if (remoteHolds && remoteHolds.length > 0) {
          const first = remoteHolds[0];
          const expiresTime = new Date(first.expiresAtUtc).getTime();
          const remainingSec = Math.max(0, Math.floor((expiresTime - Date.now()) / 1000));
          const mapped: ActiveHold = {
            id: first.holdId,
            holdId: `#${first.holdCode}`,
            storeId: first.storeId,
            storeInventoryId: first.storeInventoryId,
            productName: first.productName,
            storeName: first.storeName,
            storeAddress: first.storeAddress,
            storePhone: first.storePhone,
            price: first.price,
            status: first.status.toLowerCase() === 'active' ? 'active' : 'expired',
            reservedUntil: new Date(first.expiresAtUtc).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            totalSeconds: remainingSec,
            qrCode: first.qrToken || `zooner:hold:${first.holdId}:${first.holdCode}`
          };
          setActiveHold(mapped);
          localStorage.setItem('zooner_active_primary_hold', JSON.stringify(mapped));
        }
      }).catch(() => {});
    }
  }, []);

  // Countdown timer for Hold
  useEffect(() => {
    if (!activeHold || activeHold.totalSeconds <= 0) return;
    const interval = setInterval(() => {
      setActiveHold(prev => {
        if (!prev) return null;
        if (prev.totalSeconds <= 1) {
          const expired: ActiveHold = { ...prev, totalSeconds: 0, status: 'expired' };
          localStorage.setItem('zooner_active_primary_hold', JSON.stringify(expired));
          return expired;
        }
        const updated = { ...prev, totalSeconds: prev.totalSeconds - 1 };
        localStorage.setItem('zooner_active_primary_hold', JSON.stringify(updated));
        return updated;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [activeHold]);

  // Real backend hold reservation
  const handleReserveProduct = async (prod: ProductSearchResult, storeInventory?: StoreInventoryItem) => {
    const store = storeInventory || (prod.carryingStores && prod.carryingStores.length > 0 ? prod.carryingStores[0] : null);
    if (!store || !store.storeId || !store.inventoryId) {
      alert('This product does not currently have verified store inventory nearby.');
      return;
    }

    setIsReservingHold(true);
    let token = localStorage.getItem('zooner_token');
    if (!token) {
      token = await ensureCustomerSession();
    }

    if (!token) {
      alert('Unable to connect to server. Please check your internet connection.');
      setIsReservingHold(false);
      return;
    }

    try {
      const res = await reserveInventoryHold(store.storeId, store.inventoryId, 1);
      if (res.success && res.hold) {
        const expiresTime = new Date(res.hold.expiresAtUtc).getTime();
        const remainingSec = Math.max(0, Math.floor((expiresTime - Date.now()) / 1000));
        const newHold: ActiveHold = {
          id: res.hold.holdId,
          holdId: `#${res.hold.holdCode}`,
          storeId: res.hold.storeId || store.storeId,
          storeInventoryId: res.hold.storeInventoryId || store.inventoryId,
          productName: res.hold.productName,
          storeName: res.hold.storeName,
          storeAddress: res.hold.storeAddress,
          storePhone: res.hold.storePhone,
          price: res.hold.price,
          status: 'active',
          reservedUntil: new Date(res.hold.expiresAtUtc).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          totalSeconds: remainingSec,
          qrCode: res.hold.qrToken || `zooner:hold:${res.hold.holdId}:${res.hold.holdCode}`
        };

        setActiveHold(newHold);
        localStorage.setItem('zooner_active_primary_hold', JSON.stringify(newHold));
        setSelectedStore(null);
        setSelectedProduct(null);
        setActiveTab('holds');
      } else {
        alert(res.error || 'Failed to reserve hold pass. Please check stock availability and try again.');
      }
    } catch (err: any) {
      console.error('Failed reserving inventory hold:', err);
      alert(err?.message || 'Unable to connect to server. Please try again.');
    } finally {
      setIsReservingHold(false);
    }
  };

  // Release / Cancel Active Hold
  const handleCancelHold = async () => {
    if (!activeHold) return;
    if (!window.confirm('Are you sure you want to release this 30-minute hold pass?')) return;

    if (activeHold.storeId && activeHold.storeInventoryId && activeHold.id) {
      try {
        await releaseInventoryHold(activeHold.storeId, activeHold.storeInventoryId, activeHold.id);
      } catch (err) {
        console.error('Error releasing hold pass:', err);
      }
    }
    setActiveHold(null);
    localStorage.removeItem('zooner_active_primary_hold');
  };

  // Broadcast Live Ask Request
  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!askProductName.trim()) return;

    setIsBroadcasting(true);
    let token = localStorage.getItem('zooner_token');
    if (!token) {
      token = await ensureCustomerSession();
    }

    if (!token) {
      alert('Unable to connect to server. Please check your internet connection.');
      setIsBroadcasting(false);
      return;
    }

    try {
      const radiusNumber = parseInt(askRadius.replace(/[^0-9]/g, ''), 10) || 5;
      const isGuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
      
      let categoryId = askCategory && isGuid(askCategory) ? askCategory : (dbCategories.find(c => isGuid(c.id))?.id || '');
      if (!categoryId) {
        const fetchedCats = await fetchCategories();
        categoryId = fetchedCats.find(c => isGuid(c.id))?.id || '';
      }

      if (!categoryId) {
        alert('Please choose a store category to broadcast your request.');
        return;
      }

      const requestText = askVariant.trim()
        ? `${askProductName.trim()} (${askVariant.trim()})`
        : askProductName.trim();

      const lat = currentLocation.lat;
      const lng = currentLocation.lng;

      if (!lat || !lng) {
        onOpenLocationModal();
        return;
      }

      await createLiveRequest({
        requestText,
        categoryId,
        latitude: lat,
        longitude: lng,
        searchRadiusKm: radiusNumber
      });

      setBroadcastDone(true);
      setTimeout(() => {
        setBroadcastDone(false);
        setAskProductName('');
        setAskVariant('');
      }, 4000);
    } catch (err) {
      console.error('Failed broadcasting request:', err);
    } finally {
      setIsBroadcasting(false);
    }
  };

  const formatTimer = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')} : ${String(secs).padStart(2, '0')}`;
  };

  // Filter & Sort Products
  const filteredAndSortedProducts = useMemo(() => {
    let list = [...dbProducts];

    // Price range filter
    if (priceRangeFilter !== 'all') {
      list = list.filter(p => {
        const price = p.lowestPrice || p.minPrice || 0;
        if (priceRangeFilter === 'under1000') return price <= 1000;
        if (priceRangeFilter === '1000-5000') return price > 1000 && price <= 5000;
        if (priceRangeFilter === '5000-20000') return price > 5000 && price <= 20000;
        if (priceRangeFilter === 'above20000') return price > 20000;
        return true;
      });
    }

    // Availability filter
    if (inStockOnlyFilter) {
      list = list.filter(p => {
        const stock = p.totalAvailableQuantity ?? (p.carryingStores?.[0]?.availableQuantity ?? 0);
        return stock > 0;
      });
    }

    // Sort By
    if (sortBy === 'price-asc') {
      list.sort((a, b) => (a.lowestPrice || a.minPrice || 0) - (b.lowestPrice || b.minPrice || 0));
    } else if (sortBy === 'price-desc') {
      list.sort((a, b) => (b.lowestPrice || b.minPrice || 0) - (a.lowestPrice || a.minPrice || 0));
    } else if (sortBy === 'nearby') {
      list.sort((a, b) => {
        const distA = a.carryingStores?.[0]?.distanceKm ?? 999;
        const distB = b.carryingStores?.[0]?.distanceKm ?? 999;
        return distA - distB;
      });
    }

    return list;
  }, [dbProducts, priceRangeFilter, inStockOnlyFilter, sortBy]);

  // Matching stores for search tab
  const matchingStores = useMemo(() => {
    if (!searchQuery.trim()) return dbShops;
    const q = searchQuery.toLowerCase().trim();
    return dbShops.filter(s => 
      s.name.toLowerCase().includes(q) || 
      (s.address && s.address.toLowerCase().includes(q)) ||
      (s.categoryName && s.categoryName.toLowerCase().includes(q))
    );
  }, [dbShops, searchQuery]);

  // Matching categories for search tab
  const matchingCategories = useMemo(() => {
    if (!searchQuery.trim()) return dbCategories;
    const q = searchQuery.toLowerCase().trim();
    return dbCategories.filter(c => 
      c.name.toLowerCase().includes(q) || 
      c.slug.toLowerCase().includes(q)
    );
  }, [dbCategories, searchQuery]);

  // Active filter count indicator
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedCategory !== 'all') count++;
    if (radiusFilter !== '5 km') count++;
    if (priceRangeFilter !== 'all') count++;
    if (inStockOnlyFilter) count++;
    if (sortBy !== 'relevance') count++;
    return count;
  }, [selectedCategory, radiusFilter, priceRangeFilter, inStockOnlyFilter, sortBy]);

  const resetFilters = () => {
    setSelectedCategory('all');
    setRadiusFilter('5 km');
    setPriceRangeFilter('all');
    setInStockOnlyFilter(false);
    setSortBy('relevance');
  };

  // Products belonging to the selected store
  const selectedStoreProducts = useMemo(() => {
    if (!selectedStore) return [];
    return dbProducts.filter(p => 
      p.carryingStores?.some(cs => cs.storeId === selectedStore.id)
    );
  }, [selectedStore, dbProducts]);

  return (
    <div className="flex-1 flex flex-col bg-white text-gray-900 font-sans pb-20 select-none min-h-screen">

      {/* ── MAIN CONTENT SCROLL AREA ── */}
      <div className="flex-1 flex flex-col overflow-y-auto no-scrollbar">

        {/* ══════════════════════════════════════════════════════════════════
            SCREEN: STORE DETAILS (Real Store from Database)
        ══════════════════════════════════════════════════════════════════ */}
        {selectedStore ? (
          <div className="animate-in fade-in duration-150">
            {/* Store Cover Banner */}
            <div className="relative h-44 sm:h-48 w-full bg-slate-900 overflow-hidden flex items-end p-5">
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/30" />

              {/* Floating Top Nav */}
              <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10">
                <button
                  type="button"
                  onClick={() => setSelectedStore(null)}
                  className="w-9 h-9 rounded-full bg-white text-gray-800 flex items-center justify-center shadow-md hover:bg-gray-100 transition cursor-pointer"
                  aria-label="Back"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (navigator.share) {
                        navigator.share({ title: selectedStore.name, url: window.location.href });
                      } else {
                        alert('Store link copied to clipboard!');
                      }
                    }}
                    className="w-9 h-9 rounded-full bg-white text-gray-800 flex items-center justify-center shadow-md hover:bg-gray-100 transition cursor-pointer"
                    aria-label="Share"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => toggleWishlist(selectedStore.id, e)}
                    className="w-9 h-9 rounded-full bg-white text-gray-800 flex items-center justify-center shadow-md hover:bg-gray-100 transition cursor-pointer"
                    aria-label="Bookmark"
                  >
                    <Bookmark className={`w-4 h-4 ${wishlistIds[selectedStore.id] ? 'fill-[#007AFF] text-[#007AFF]' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Title on Banner */}
              <div className="relative z-10 text-white">
                <h1 className="text-2xl font-bold tracking-tight drop-shadow-sm">{selectedStore.name}</h1>
              </div>
            </div>

            {/* Store Meta Card */}
            <div className="px-5 py-4 border-b border-gray-100 bg-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-gray-900 text-white font-bold text-lg flex items-center justify-center shrink-0">
                    {selectedStore.name.charAt(0)}
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-gray-950 flex items-center gap-1.5">
                      <span>{selectedStore.name}</span>
                      <CheckCircle2 className="w-4 h-4 text-[#34C759]" />
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[220px]">
                      {selectedStore.address || 'Verified physical retailer'}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  {selectedStore.distanceKm !== undefined && (
                    <div className="flex items-center justify-end gap-1 text-xs text-[#007AFF] font-semibold">
                      <MapPin className="w-3.5 h-3.5 text-[#007AFF]" />
                      {formatDistance(selectedStore.distanceKm)}
                    </div>
                  )}
                  <div className="text-xs text-[#34C759] font-bold mt-0.5">
                    Open Now
                  </div>
                </div>
              </div>
            </div>

            {/* Segmented Tabs: Products | About */}
            <div className="flex border-b border-gray-100 px-5 bg-white">
              <button
                type="button"
                onClick={() => setStoreActiveTab('products')}
                className={`py-3 px-4 text-xs font-semibold capitalize border-b-2 transition-all cursor-pointer ${
                  storeActiveTab === 'products'
                    ? 'border-[#007AFF] text-[#007AFF]'
                    : 'border-transparent text-gray-400 hover:text-gray-700'
                }`}
              >
                Products ({selectedStoreProducts.length})
              </button>
              <button
                type="button"
                onClick={() => setStoreActiveTab('about')}
                className={`py-3 px-4 text-xs font-semibold capitalize border-b-2 transition-all cursor-pointer ${
                  storeActiveTab === 'about'
                    ? 'border-[#007AFF] text-[#007AFF]'
                    : 'border-transparent text-gray-400 hover:text-gray-700'
                }`}
              >
                Store Details
              </button>
            </div>

            {/* Products Tab List */}
            {storeActiveTab === 'products' && (
              <div className="p-5 space-y-3">
                {selectedStoreProducts.length > 0 ? (
                  selectedStoreProducts.map((item) => {
                    const storeInv = item.carryingStores?.find(cs => cs.storeId === selectedStore.id);
                    const price = storeInv?.price || item.minPrice || item.lowestPrice || 0;
                    const stock = storeInv?.availableQuantity ?? item.totalAvailableQuantity ?? 1;
                    const inStock = stock > 0;

                    return (
                      <div
                        key={item.id}
                        onClick={() => setSelectedProduct(item)}
                        className="p-3.5 bg-white rounded-2xl border border-gray-200/80 shadow-xs flex items-center justify-between gap-3 hover:border-gray-300 transition cursor-pointer"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {item.imageUrl ? (
                            <div className="w-16 h-16 rounded-xl bg-gray-50 overflow-hidden shrink-0 flex items-center justify-center p-1 border border-gray-100">
                              <img
                                src={item.imageUrl}
                                alt={item.name}
                                className="w-full h-full object-contain"
                              />
                            </div>
                          ) : (
                            <div className="w-16 h-16 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 shrink-0 border border-gray-100">
                              <PackageOpen className="w-6 h-6 text-gray-300" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <h4 className="text-xs font-semibold text-gray-900 truncate">{item.name}</h4>
                            <div className="text-sm font-bold text-gray-950 mt-0.5">
                              {price > 0 ? `₹${price.toLocaleString('en-IN')}` : 'Price at store'}
                            </div>
                            <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full mt-1 ${
                              inStock ? 'bg-emerald-50 text-[#34C759]' : 'bg-gray-100 text-gray-500'
                            }`}>
                              {inStock ? (stock <= 2 ? `Only ${stock} left` : 'In stock') : 'Out of stock'}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={!inStock || isReservingHold}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleReserveProduct(item, storeInv);
                          }}
                          className="shrink-0 bg-[#007AFF] hover:bg-[#0071E3] active:scale-[0.98] disabled:bg-gray-200 disabled:text-gray-400 text-white px-3.5 py-2 rounded-xl text-xs font-semibold transition cursor-pointer shadow-xs flex items-center gap-1.5"
                        >
                          {isReservingHold ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Reserving...</span>
                            </>
                          ) : (
                            <span>Hold 30 min</span>
                          )}
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-12 text-center text-gray-400 space-y-2">
                    <PackageOpen className="w-9 h-9 mx-auto text-gray-300" />
                    <p className="text-xs font-medium text-gray-600">No products cataloged for this store yet.</p>
                    <p className="text-[11px] text-gray-400">You can broadcast a live request to ask this store directly.</p>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedStore(null);
                        setActiveTab('live-ask');
                      }}
                      className="mt-2 text-xs font-semibold text-[#007AFF] hover:underline cursor-pointer"
                    >
                      Ask store for product →
                    </button>
                  </div>
                )}
              </div>
            )}

            {storeActiveTab === 'about' && (
              <div className="p-5 text-xs text-gray-600 space-y-3">
                <div className="p-4 rounded-2xl bg-gray-50 space-y-2 text-gray-800 border border-gray-100">
                  <div><strong className="text-gray-950">Store Name:</strong> {selectedStore.name}</div>
                  <div><strong className="text-gray-950">Address:</strong> {selectedStore.address || 'Local Shop'}</div>
                  {selectedStore.phone && (
                    <div><strong className="text-gray-950">Phone:</strong> {selectedStore.phone}</div>
                  )}
                  <div><strong className="text-gray-950">Category:</strong> {selectedStore.categoryName || 'Retailer'}</div>
                  <div><strong className="text-gray-950">Status:</strong> Verified Physical Retailer</div>
                </div>
              </div>
            )}
          </div>
        ) : activeTab === 'explore' ? (

          /* ══════════════════════════════════════════════════════════════════
              SCREEN: CUSTOMER EXPLORE PAGE (CLEAN, MINIMAL, FAST SCANNING)
          ══════════════════════════════════════════════════════════════════ */
          <div className="animate-in fade-in duration-150 p-4 sm:p-5 space-y-5">
            
            {/* 1. TOP LOCATION BAR (Compact) */}
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={onOpenLocationModal}
                  className="flex items-center gap-1.5 text-xs font-bold text-gray-900 hover:text-[#007AFF] transition-colors cursor-pointer bg-gray-50 hover:bg-gray-100 border border-gray-200/80 rounded-full px-3 py-1.5 truncate shadow-2xs"
                >
                  <MapPin className="w-3.5 h-3.5 text-[#007AFF] shrink-0" />
                  <span className="truncate max-w-[140px] sm:max-w-[200px]">
                    {currentLocation.name ? currentLocation.name.split(',')[0] : (currentLocation.city || 'Coimbatore')}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                {isMultiRole && onOpenExperienceSwitcher && (
                  <ExperienceHeaderPill currentExperience="customer" onClick={onOpenExperienceSwitcher} />
                )}

                <button
                  type="button"
                  onClick={() => setIsNotificationsOpen(true)}
                  className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-full transition cursor-pointer"
                  aria-label="Notifications"
                >
                  <Bell className="w-5 h-5" />
                  {activeHold && activeHold.totalSeconds > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#34C759]" />
                  )}
                </button>
              </div>
            </div>

            {/* 2. SEARCH BAR & FILTER BUTTON */}
            <div className="relative flex items-center w-full gap-2">
              <div className="relative flex-1 flex items-center">
                <Search className="absolute left-3.5 h-4 w-4 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search products, brands, or stores…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-gray-100/90 border border-transparent rounded-2xl py-3 pl-10 pr-9 text-xs text-gray-900 placeholder-gray-400 focus:bg-white focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 outline-hidden transition-all shadow-2xs"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 p-1 text-gray-400 hover:text-gray-700 cursor-pointer"
                    aria-label="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Filter Button */}
              <button
                type="button"
                onClick={() => setIsFilterOpen(true)}
                className={`p-3 rounded-2xl border transition-all cursor-pointer relative shrink-0 shadow-2xs ${
                  activeFiltersCount > 0
                    ? 'bg-blue-50 border-[#007AFF] text-[#007AFF]'
                    : 'bg-gray-100/90 hover:bg-gray-200/80 border-transparent text-gray-700'
                }`}
                aria-label="Open filters"
                title="Filter & Sort"
              >
                <SlidersHorizontal className="w-4 h-4" />
                {activeFiltersCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#007AFF] text-white text-[9px] font-bold flex items-center justify-center">
                    {activeFiltersCount}
                  </span>
                )}
              </button>
            </div>

            {/* ── SEARCH RESULTS MODE (When user searches) ── */}
            {searchQuery.trim().length > 0 ? (
              <div className="space-y-4 pt-1">
                {/* Search Tabs: Products | Stores | Categories */}
                <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                  <button
                    type="button"
                    onClick={() => setSearchTab('products')}
                    className={`text-xs font-bold px-3 py-1.5 rounded-full transition-all cursor-pointer ${
                      searchTab === 'products'
                        ? 'bg-[#007AFF] text-white shadow-2xs'
                        : 'text-gray-500 hover:text-gray-900 bg-gray-50'
                    }`}
                  >
                    Products ({filteredAndSortedProducts.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSearchTab('stores')}
                    className={`text-xs font-bold px-3 py-1.5 rounded-full transition-all cursor-pointer ${
                      searchTab === 'stores'
                        ? 'bg-[#007AFF] text-white shadow-2xs'
                        : 'text-gray-500 hover:text-gray-900 bg-gray-50'
                    }`}
                  >
                    Stores ({matchingStores.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSearchTab('categories')}
                    className={`text-xs font-bold px-3 py-1.5 rounded-full transition-all cursor-pointer ${
                      searchTab === 'categories'
                        ? 'bg-[#007AFF] text-white shadow-2xs'
                        : 'text-gray-500 hover:text-gray-900 bg-gray-50'
                    }`}
                  >
                    Categories ({matchingCategories.length})
                  </button>
                </div>

                {/* Skeletons while searching */}
                {isLoadingCatalog ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((n) => (
                      <div key={n} className="p-3 bg-white rounded-2xl border border-gray-100 flex gap-3.5 animate-pulse">
                        <div className="w-18 h-18 bg-gray-100 rounded-xl shrink-0" />
                        <div className="flex-1 space-y-2 py-1">
                          <div className="h-3.5 bg-gray-100 rounded-md w-3/4" />
                          <div className="h-4 bg-gray-100 rounded-md w-1/3" />
                          <div className="h-3 bg-gray-100 rounded-md w-1/2" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : searchTab === 'products' ? (
                  /* Products Search Tab */
                  filteredAndSortedProducts.length > 0 ? (
                    <div className="space-y-3">
                      {filteredAndSortedProducts.map((prod) => {
                        const firstStore = prod.carryingStores?.[0];
                        const price = prod.lowestPrice || prod.minPrice || (firstStore ? firstStore.price : 0);
                        const stock = prod.totalAvailableQuantity ?? (firstStore ? firstStore.availableQuantity : 1);
                        const inStock = stock > 0;
                        const distanceText = firstStore?.distanceKm ? formatDistance(firstStore.distanceKm) : '';
                        const isLiked = Boolean(wishlistIds[prod.id]);

                        return (
                          <div
                            key={prod.id}
                            onClick={() => setSelectedProduct(prod)}
                            className="bg-white rounded-2xl border border-gray-200/80 p-3 shadow-xs flex gap-3.5 items-center relative hover:border-blue-300 transition cursor-pointer"
                          >
                            <div className="w-20 h-20 rounded-xl bg-gray-50 shrink-0 flex items-center justify-center overflow-hidden p-1.5 border border-gray-100">
                              {prod.imageUrl ? (
                                <img
                                  src={prod.imageUrl}
                                  alt={prod.name}
                                  className="w-full h-full object-contain"
                                />
                              ) : (
                                <PackageOpen className="w-7 h-7 text-gray-300" />
                              )}
                            </div>

                            <div className="flex-1 min-w-0 pr-7">
                              <h4 className="text-xs font-semibold text-gray-900 truncate">
                                {prod.name}
                              </h4>

                              {/* Wishlist Heart */}
                              <button
                                type="button"
                                onClick={(e) => toggleWishlist(prod.id, e)}
                                className="absolute top-3 right-3 text-gray-400 hover:text-rose-500 cursor-pointer p-1"
                                aria-label="Save to wishlist"
                              >
                                <Heart className={`w-4 h-4 ${isLiked ? 'fill-rose-500 text-rose-500' : ''}`} />
                              </button>

                              <div className="text-sm font-bold text-gray-950 mt-0.5">
                                {price > 0 ? `₹${price.toLocaleString('en-IN')}` : 'Check store'}
                              </div>

                              <div className="flex items-center gap-2 mt-1">
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                  inStock ? 'bg-emerald-50 text-[#34C759]' : 'bg-gray-100 text-gray-500'
                                }`}>
                                  {inStock ? (stock <= 2 ? `${stock} left` : 'In stock') : 'Out of stock'}
                                </span>
                                {distanceText && (
                                  <span className="text-[11px] font-medium text-gray-500 flex items-center gap-0.5">
                                    <MapPin className="w-3 h-3 text-[#007AFF]" />
                                    {distanceText}
                                  </span>
                                )}
                              </div>

                              {firstStore && (
                                <div className="text-[11px] text-gray-500 mt-1 truncate">
                                  {firstStore.storeName}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    /* Products Empty State */
                    <div className="py-12 px-4 text-center space-y-3 bg-gray-50/70 rounded-3xl border border-gray-100">
                      <PackageOpen className="w-10 h-10 mx-auto text-gray-300" />
                      <div>
                        <h4 className="text-sm font-bold text-gray-900">No products found</h4>
                        <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto">
                          Try another search or clear your active filters.
                        </p>
                      </div>
                      <div className="flex justify-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setSearchQuery('');
                            resetFilters();
                          }}
                          className="px-4 py-2 rounded-xl bg-[#007AFF] text-white text-xs font-semibold hover:bg-[#0071E3] cursor-pointer shadow-xs"
                        >
                          Clear Filters
                        </button>
                      </div>
                    </div>
                  )
                ) : searchTab === 'stores' ? (
                  /* Stores Search Tab */
                  matchingStores.length > 0 ? (
                    <div className="space-y-2.5">
                      {matchingStores.map((shop) => (
                        <div
                          key={shop.id}
                          onClick={() => setSelectedStore(shop)}
                          className="p-3.5 bg-white rounded-2xl border border-gray-200/80 shadow-xs flex items-center justify-between hover:border-blue-300 transition cursor-pointer"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-full bg-gray-900 text-white font-bold text-sm flex items-center justify-center shrink-0">
                              {shop.name.charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <h4 className="text-xs font-bold text-gray-900 truncate flex items-center gap-1">
                                <span>{shop.name}</span>
                                <CheckCircle2 className="w-3.5 h-3.5 text-[#34C759]" />
                              </h4>
                              <p className="text-[11px] text-gray-500 truncate mt-0.5">
                                {shop.address || 'Local Shop'}
                              </p>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            {shop.distanceKm !== undefined && (
                              <div className="text-xs font-semibold text-[#007AFF]">
                                {formatDistance(shop.distanceKm)}
                              </div>
                            )}
                            <span className="text-[10px] text-[#34C759] font-semibold">Open</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    /* Stores Empty State */
                    <div className="py-12 px-4 text-center space-y-3 bg-gray-50/70 rounded-3xl border border-gray-100">
                      <Store className="w-10 h-10 mx-auto text-gray-300" />
                      <div>
                        <h4 className="text-sm font-bold text-gray-900">No stores nearby</h4>
                        <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto">
                          We couldn't find any stores matching "{searchQuery}" in this area.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={onOpenLocationModal}
                        className="px-4 py-2 rounded-xl bg-[#007AFF] text-white text-xs font-semibold hover:bg-[#0071E3] cursor-pointer shadow-xs"
                      >
                        Change Location
                      </button>
                    </div>
                  )
                ) : (
                  /* Categories Search Tab */
                  matchingCategories.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2.5">
                      {matchingCategories.map((cat) => {
                        const Icon = getCategoryIcon(cat.name);
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => {
                              setSelectedCategory(cat.slug || cat.name);
                              setSearchTab('products');
                            }}
                            className="p-3 bg-white rounded-2xl border border-gray-200/80 hover:border-[#007AFF] flex items-center gap-3 text-left transition cursor-pointer shadow-xs"
                          >
                            <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#007AFF] flex items-center justify-center shrink-0">
                              <Icon className="w-5 h-5" />
                            </div>
                            <span className="text-xs font-bold text-gray-900 truncate">
                              {cat.name}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="py-8 text-center text-xs text-gray-400">
                      No categories found matching "{searchQuery}".
                    </div>
                  )
                )}
              </div>
            ) : (
              /* ── STANDARD EXPLORE VIEW (NO SEARCH TEXT) ── */
              <>
                {/* 3. CATEGORY HORIZONTAL SCROLLER */}
                <div>
                  <div className="flex items-center gap-3.5 overflow-x-auto no-scrollbar py-1 px-0.5">
                    {/* All Categories Chip */}
                    <button
                      type="button"
                      onClick={() => setSelectedCategory('all')}
                      className="flex flex-col items-center gap-1.5 shrink-0 cursor-pointer group"
                    >
                      <div className={`w-14 h-14 rounded-full flex items-center justify-center border transition-all ${
                        selectedCategory === 'all'
                          ? 'bg-[#007AFF] border-[#007AFF] text-white shadow-md shadow-blue-500/20'
                          : 'bg-gray-50 hover:bg-gray-100 border-gray-200/80 text-gray-700'
                      }`}>
                        <LayoutGrid className="w-6 h-6" />
                      </div>
                      <span className={`text-[11px] font-semibold transition-colors ${
                        selectedCategory === 'all' ? 'text-[#007AFF]' : 'text-gray-600'
                      }`}>
                        All
                      </span>
                    </button>

                    {/* Dynamic API Categories */}
                    {dbCategories.map((cat) => {
                      const Icon = getCategoryIcon(cat.name);
                      const isSelected = selectedCategory === cat.slug || selectedCategory === cat.name;

                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setSelectedCategory(isSelected ? 'all' : (cat.slug || cat.name))}
                          className="flex flex-col items-center gap-1.5 shrink-0 cursor-pointer group"
                        >
                          <div className={`w-14 h-14 rounded-full flex items-center justify-center border transition-all ${
                            isSelected
                              ? 'bg-[#007AFF] border-[#007AFF] text-white shadow-md shadow-blue-500/20'
                              : 'bg-gray-50 hover:bg-gray-100 border-gray-200/80 text-gray-700'
                          }`}>
                            <Icon className="w-6 h-6" />
                          </div>
                          <span className={`text-[11px] font-semibold max-w-[70px] truncate text-center transition-colors ${
                            isSelected ? 'text-[#007AFF]' : 'text-gray-600'
                          }`}>
                            {cat.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 4. DISCOVERY / PROMOTIONAL CARD */}
                <div className="rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 p-4 text-white shadow-md shadow-blue-600/10 flex items-center justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-200">
                      Local Discovery
                    </span>
                    <h3 className="text-sm font-bold text-white leading-tight">
                      Find what you need nearby
                    </h3>
                    <p className="text-[11px] text-blue-100/90 leading-snug">
                      Check real stock at local stores before you go.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const searchInput = document.querySelector('input[type="text"]') as HTMLInputElement;
                      if (searchInput) searchInput.focus();
                    }}
                    className="px-4 py-2 bg-white text-[#007AFF] hover:bg-blue-50 active:scale-[0.97] rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer shadow-xs"
                  >
                    Explore
                  </button>
                </div>

                {/* 5. NEARBY STORES SECTION */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-gray-950">Nearby Stores</h3>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('store');
                        setSearchTab('stores');
                      }}
                      className="text-xs font-bold text-[#007AFF] hover:underline cursor-pointer"
                    >
                      See all
                    </button>
                  </div>

                  {isLoadingShops ? (
                    /* Store Skeleton Loader */
                    <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
                      {[1, 2, 3].map((n) => (
                        <div key={n} className="w-36 h-36 bg-gray-100 rounded-2xl animate-pulse shrink-0 p-3 flex flex-col justify-between" />
                      ))}
                    </div>
                  ) : dbShops.length > 0 ? (
                    <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
                      {dbShops.map((shop) => (
                        <div
                          key={shop.id}
                          onClick={() => setSelectedStore(shop)}
                          className="w-40 sm:w-44 p-3 bg-white rounded-2xl border border-gray-200/80 shadow-xs flex flex-col justify-between hover:border-blue-300 transition cursor-pointer shrink-0"
                        >
                          <div>
                            <div className="w-10 h-10 rounded-xl bg-gray-900 text-white font-bold text-sm flex items-center justify-center mb-2.5">
                              {shop.name.charAt(0)}
                            </div>
                            <h4 className="text-xs font-bold text-gray-950 truncate flex items-center gap-1">
                              <span>{shop.name}</span>
                              <CheckCircle2 className="w-3 h-3 text-[#34C759] shrink-0" />
                            </h4>
                            <p className="text-[10px] text-gray-400 truncate mt-0.5">
                              {shop.categoryName || 'Retail Store'}
                            </p>
                          </div>

                          <div className="pt-2.5 border-t border-gray-100 flex items-center justify-between text-[11px]">
                            {shop.distanceKm !== undefined ? (
                              <span className="font-bold text-[#007AFF]">
                                {formatDistance(shop.distanceKm)}
                              </span>
                            ) : (
                              <span className="text-gray-400">Nearby</span>
                            )}
                            <span className="font-bold text-[#34C759]">Open</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    /* Nearby Stores Empty State */
                    <div className="p-4 bg-gray-50/80 rounded-2xl text-center space-y-2 border border-gray-100">
                      <p className="text-xs text-gray-600 font-medium">No stores nearby in this radius.</p>
                      <button
                        type="button"
                        onClick={onOpenLocationModal}
                        className="text-xs font-bold text-[#007AFF] hover:underline cursor-pointer"
                      >
                        Change Location →
                      </button>
                    </div>
                  )}
                </div>

                {/* 6. POPULAR / NEARBY PRODUCTS SECTION */}
                <div className="space-y-3 pt-1">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-gray-950">Popular near you</h3>
                    <button
                      type="button"
                      onClick={() => {
                        const searchInput = document.querySelector('input[type="text"]') as HTMLInputElement;
                        if (searchInput) searchInput.focus();
                      }}
                      className="text-xs font-bold text-[#007AFF] hover:underline cursor-pointer"
                    >
                      See all
                    </button>
                  </div>

                  {isLoadingCatalog ? (
                    /* Product Grid Skeleton Loader */
                    <div className="grid grid-cols-2 gap-3">
                      {[1, 2, 3, 4].map((n) => (
                        <div key={n} className="p-3 bg-white rounded-2xl border border-gray-100 space-y-2.5 animate-pulse">
                          <div className="w-full h-28 bg-gray-100 rounded-xl" />
                          <div className="h-3.5 bg-gray-100 rounded-md w-3/4" />
                          <div className="h-4 bg-gray-100 rounded-md w-1/2" />
                          <div className="h-3 bg-gray-100 rounded-md w-2/3" />
                        </div>
                      ))}
                    </div>
                  ) : filteredAndSortedProducts.length > 0 ? (
                    <div className="grid grid-cols-2 gap-3">
                      {filteredAndSortedProducts.map((prod) => {
                        const firstStore = prod.carryingStores?.[0];
                        const price = prod.lowestPrice || prod.minPrice || (firstStore ? firstStore.price : 0);
                        const stock = prod.totalAvailableQuantity ?? (firstStore ? firstStore.availableQuantity : 1);
                        const inStock = stock > 0;
                        const distanceText = firstStore?.distanceKm ? formatDistance(firstStore.distanceKm) : '';
                        const isLiked = Boolean(wishlistIds[prod.id]);

                        return (
                          <div
                            key={prod.id}
                            onClick={() => setSelectedProduct(prod)}
                            className="bg-white rounded-2xl border border-gray-200/80 p-3 shadow-xs flex flex-col justify-between relative hover:border-blue-300 transition cursor-pointer group"
                          >
                            {/* Wishlist Heart */}
                            <button
                              type="button"
                              onClick={(e) => toggleWishlist(prod.id, e)}
                              className="absolute top-2.5 right-2.5 z-10 p-1.5 rounded-full bg-white/90 text-gray-400 hover:text-rose-500 shadow-2xs transition cursor-pointer"
                              aria-label="Save to wishlist"
                            >
                              <Heart className={`w-3.5 h-3.5 ${isLiked ? 'fill-rose-500 text-rose-500' : ''}`} />
                            </button>

                            {/* Product Image */}
                            <div className="w-full h-28 rounded-xl bg-gray-50 flex items-center justify-center overflow-hidden p-2 mb-2 border border-gray-100">
                              {prod.imageUrl ? (
                                <img
                                  src={prod.imageUrl}
                                  alt={prod.name}
                                  className="w-full h-full object-contain group-hover:scale-105 transition-transform"
                                />
                              ) : (
                                <PackageOpen className="w-8 h-8 text-gray-300" />
                              )}
                            </div>

                            {/* Info */}
                            <div className="space-y-1">
                              <h4 className="text-xs font-semibold text-gray-900 truncate" title={prod.name}>
                                {prod.name}
                              </h4>

                              <div className="text-sm font-bold text-gray-950">
                                {price > 0 ? `₹${price.toLocaleString('en-IN')}` : 'Check store'}
                              </div>

                              <div className="flex items-center justify-between pt-1">
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
                                  inStock ? 'bg-emerald-50 text-[#34C759]' : 'bg-gray-100 text-gray-500'
                                }`}>
                                  {inStock ? (stock <= 2 ? `${stock} left` : 'In stock') : 'Out of stock'}
                                </span>

                                {distanceText && (
                                  <span className="text-[10px] font-medium text-gray-500 flex items-center gap-0.5">
                                    <MapPin className="w-2.5 h-2.5 text-[#007AFF]" />
                                    {distanceText}
                                  </span>
                                )}
                              </div>

                              {firstStore && (
                                <p className="text-[10px] text-gray-400 truncate pt-0.5">
                                  {firstStore.storeName}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    /* Products Empty State */
                    <div className="py-10 px-4 text-center bg-gray-50/70 rounded-2xl border border-gray-100 space-y-2.5">
                      <PackageOpen className="w-8 h-8 mx-auto text-gray-300" />
                      <h4 className="text-xs font-bold text-gray-900">No products found</h4>
                      <p className="text-[11px] text-gray-500 max-w-xs mx-auto">
                        Try clearing active category or price filters.
                      </p>
                      <button
                        type="button"
                        onClick={resetFilters}
                        className="px-3.5 py-1.5 rounded-xl bg-[#007AFF] text-white text-xs font-semibold hover:bg-[#0071E3] cursor-pointer"
                      >
                        Clear Filters
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}

          </div>
        ) : activeTab === 'live-ask' ? (

          /* ══════════════════════════════════════════════════════════════════
              SCREEN: LIVE ASK (BROADCAST DEMAND)
          ══════════════════════════════════════════════════════════════════ */
          <div className="animate-in fade-in duration-150 p-5 space-y-5">
            <div>
              <h2 className="text-2xl font-black text-gray-950 tracking-tight leading-tight">
                Can't find it?<br />Ask nearby stores.
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                Send a real-time request to local shopkeepers. They'll notify you if they have it.
              </p>
            </div>

            {broadcastDone && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-medium text-[#34C759] flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Broadcast dispatched! Verified stores in {askRadius} radius notified.</span>
              </div>
            )}

            <form onSubmit={handleBroadcast} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Product name or brand <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sony WH-1000XM5, iPhone 15, Amul Butter"
                  value={askProductName}
                  onChange={(e) => setAskProductName(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-xl py-2.5 px-3.5 text-xs text-gray-900 placeholder-gray-400 focus:border-[#007AFF] focus:ring-1 focus:ring-[#007AFF] outline-hidden shadow-2xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Variant / Size (optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 256GB, Black, Size UK 9"
                  value={askVariant}
                  onChange={(e) => setAskVariant(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-xl py-2.5 px-3.5 text-xs text-gray-900 placeholder-gray-400 focus:border-[#007AFF] focus:ring-1 focus:ring-[#007AFF] outline-hidden shadow-2xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Category
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {dbCategories.slice(0, 6).map((cat) => {
                    const isSelected = askCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setAskCategory(cat.id)}
                        className={`p-2.5 rounded-xl text-left border transition flex items-center gap-2 cursor-pointer ${
                          isSelected
                            ? 'bg-blue-50 border-[#007AFF] text-[#007AFF] ring-1 ring-[#007AFF]'
                            : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                        }`}
                      >
                        <span className="text-xs font-medium truncate">{cat.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Broadcast Radius
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(['2 km', '5 km', '10 km', '15 km'] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setAskRadius(r)}
                      className={`py-2 text-xs font-semibold rounded-xl border transition cursor-pointer ${
                        askRadius === r
                          ? 'bg-[#007AFF] text-white border-[#007AFF] shadow-2xs'
                          : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={isBroadcasting}
                className="w-full bg-[#007AFF] hover:bg-[#0071E3] disabled:bg-blue-300 text-white font-semibold py-3 rounded-xl text-xs transition cursor-pointer shadow-md flex items-center justify-center gap-2"
              >
                {isBroadcasting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Broadcasting to local stores...</span>
                  </>
                ) : (
                  <>
                    <Radio className="w-4 h-4" />
                    <span>Broadcast Request to Stores</span>
                  </>
                )}
              </button>
            </form>
          </div>
        ) : activeTab === 'holds' ? (

          /* ══════════════════════════════════════════════════════════════════
              SCREEN: MY HOLDS (ACTIVE 30-MIN HOLD PASS)
          ══════════════════════════════════════════════════════════════════ */
          <div className="animate-in fade-in duration-150 p-5 space-y-5">
            <div>
              <h2 className="text-2xl font-bold text-gray-950 tracking-tight">My Hold Passes</h2>
              <p className="text-xs text-gray-500 mt-1">
                Show your 6-digit code or QR pass at the billing counter to collect reserved items.
              </p>
            </div>

            {activeHold && activeHold.totalSeconds > 0 ? (
              <div className="bg-white rounded-3xl border border-gray-200/90 p-5 shadow-lg space-y-4 relative overflow-hidden">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#34C759] animate-ping" />
                    <span className="text-xs font-bold text-[#34C759]">Active Hold Pass</span>
                  </div>
                  <span className="font-mono font-black text-sm text-gray-900">{activeHold.holdId}</span>
                </div>

                <div className="space-y-1">
                  <h3 className="text-base font-bold text-gray-950">{activeHold.productName}</h3>
                  <p className="text-xs text-gray-500">{activeHold.storeName}</p>
                  <p className="text-[11px] text-gray-400">{activeHold.storeAddress}</p>
                  {activeHold.price > 0 && (
                    <div className="text-sm font-black text-gray-950 pt-1">
                      ₹{activeHold.price.toLocaleString('en-IN')}
                    </div>
                  )}
                </div>

                {/* Countdown Timer */}
                <div className="bg-blue-50/70 border border-blue-100 rounded-2xl p-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                    <Clock className="w-4 h-4 text-[#007AFF]" />
                    <span>Expires in:</span>
                  </div>
                  <span className="font-mono font-black text-lg text-[#007AFF]">
                    {formatTimer(activeHold.totalSeconds)}
                  </span>
                </div>

                {/* Counter QR Token */}
                <div className="p-4 bg-gray-50 rounded-2xl flex flex-col items-center justify-center space-y-2 border border-gray-100">
                  <StandardQRCode value={activeHold.qrCode} size={140} />
                  <p className="text-[10px] text-gray-400 font-mono">Token: {activeHold.holdId}</p>
                </div>

                <div className="space-y-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      const matchedShop = dbShops.find(s => s.name === activeHold.storeName || s.id === activeHold.storeId);
                      if (matchedShop) {
                        setSelectedStore(matchedShop);
                      } else {
                        alert(`Store: ${activeHold.storeAddress}\nPhone: ${activeHold.storePhone}`);
                      }
                    }}
                    className="w-full flex items-center justify-center gap-2 bg-[#007AFF] hover:bg-[#0071E3] text-white py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer shadow-xs"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    <span>View Store & Directions</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCancelHold}
                    className="w-full text-center text-xs text-red-500 hover:text-red-700 py-1.5 font-medium transition cursor-pointer"
                  >
                    Release Hold Pass
                  </button>
                </div>
              </div>
            ) : (
              <div className="py-16 text-center text-gray-400 space-y-3">
                <Clock className="w-12 h-12 mx-auto text-gray-300" />
                <div>
                  <h4 className="text-sm font-bold text-gray-700">No active hold passes</h4>
                  <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">
                    When you reserve products at nearby stores, your 30-minute hold pass and counter QR will appear here.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('explore')}
                  className="bg-[#007AFF] hover:bg-[#0071E3] text-white px-5 py-2.5 rounded-xl text-xs font-semibold cursor-pointer shadow-xs transition"
                >
                  Browse Products
                </button>
              </div>
            )}
          </div>
        ) : (

          /* ══════════════════════════════════════════════════════════════════
              SCREEN: ACCOUNT / PROFILE
          ══════════════════════════════════════════════════════════════════ */
          <div className="animate-in fade-in duration-150 p-5 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-950 tracking-tight">Account</h2>
              {isMultiRole && onOpenExperienceSwitcher && (
                <ExperienceHeaderPill currentExperience="customer" onClick={onOpenExperienceSwitcher} />
              )}
            </div>

            {/* Profile Card */}
            {userProfile && !userProfile.email?.includes('@guest.zooner.app') ? (
              <div className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-xs flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-900 font-bold text-lg flex items-center justify-center shrink-0">
                  {userProfile.name ? userProfile.name.charAt(0).toUpperCase() : 'U'}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-gray-950 truncate">
                    {userProfile.name || 'Account'}
                  </h3>
                  {userProfile.email && (
                    <p className="text-xs text-gray-500 truncate mt-0.5">
                      {userProfile.email}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-xs flex items-center justify-between gap-3.5">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-400 font-bold text-lg flex items-center justify-center shrink-0">
                    <User className="w-6 h-6 text-gray-400" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-gray-950 truncate">
                      Guest Shopper
                    </h3>
                    <p className="text-xs text-gray-500 truncate mt-0.5">
                      Browse stores & reserve items freely
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenSignIn('C')}
                  className="bg-[#007AFF] hover:bg-[#0071E3] text-white font-semibold text-xs px-3.5 py-2 rounded-xl transition cursor-pointer shrink-0"
                >
                  Sign In
                </button>
              </div>
            )}

            {/* Merchant Onboarding Prompt */}
            {!(userProfile?.isVendor || (userProfile?.shops && userProfile.shops.length > 0)) && (
              <div className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-xs">
                <div className="flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#007AFF] flex items-center justify-center shrink-0">
                    <Store className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-gray-950">Own a Physical Store?</h4>
                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                      List your physical shelves on Zooner to turn nearby local search into instant footfall. 0% commission.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        if (onOpenRetailerModal) onOpenRetailerModal();
                        else if (onNavigateToVendor) onNavigateToVendor();
                      }}
                      className="mt-3 w-full py-2.5 px-4 rounded-xl bg-[#007AFF] hover:bg-[#0071E3] text-white text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer shadow-xs"
                    >
                      <Store className="w-4 h-4" />
                      <span>Register Storefront →</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Menu List */}
            <div className="bg-white rounded-2xl border border-gray-200/80 divide-y divide-gray-100 overflow-hidden shadow-xs">
              <button
                type="button"
                onClick={() => onOpenSignIn('C')}
                className="w-full px-4 py-3.5 flex items-center justify-between text-xs text-gray-700 hover:bg-gray-50 transition cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <User className="w-4 h-4 text-gray-500" />
                  <span className="font-medium">{userProfile && !userProfile.email?.includes('@guest.zooner.app') ? 'Profile Details' : 'Sign In / Register'}</span>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </button>

              <button
                type="button"
                onClick={() => alert(`Saved items: ${Object.values(wishlistIds).filter(Boolean).length}`)}
                className="w-full px-4 py-3.5 flex items-center justify-between text-xs text-gray-700 hover:bg-gray-50 transition cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <Heart className="w-4 h-4 text-gray-500" />
                  <span className="font-medium">Wishlist</span>
                </div>
                <div className="flex items-center gap-1 text-gray-400">
                  <span>{Object.values(wishlistIds).filter(Boolean).length}</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </button>

              <button
                type="button"
                onClick={() => alert('Zooner v1.0 — Local Commerce Discovery Platform.')}
                className="w-full px-4 py-3.5 flex items-center justify-between text-xs text-gray-700 hover:bg-gray-50 transition cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <Info className="w-4 h-4 text-gray-500" />
                  <span className="font-medium">About Zooner</span>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </button>

              {onNavigateToAdmin && (
                <button
                  type="button"
                  onClick={onNavigateToAdmin}
                  className="w-full px-4 py-3.5 flex items-center justify-between text-xs text-gray-700 hover:bg-gray-50 transition cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <Shield className="w-4 h-4 text-purple-600" />
                    <span className="font-medium">Admin Portal</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </button>
              )}
            </div>

            {/* Sign Out Button */}
            {userProfile && !userProfile.email?.includes('@guest.zooner.app') && (
              <button
                type="button"
                onClick={() => {
                  localStorage.removeItem('zooner_token');
                  localStorage.removeItem('zooner_user_profile');
                  setUserProfile(null);
                  window.dispatchEvent(new Event('storage'));
                }}
                className="w-full flex items-center justify-center gap-2 text-xs font-semibold text-red-500 hover:text-red-700 py-3 transition cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          MODAL: PRODUCT DETAILS & HOLD RESERVATION (BOTTOM SHEET)
      ══════════════════════════════════════════════════════════════════ */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div 
            className="absolute inset-0"
            onClick={() => setSelectedProduct(null)}
          />
          <div className="relative w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl max-h-[85vh] overflow-y-auto space-y-4 z-10 animate-in slide-in-from-bottom duration-200 text-gray-900">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#007AFF]">
                  {selectedProduct.categoryName || 'Product Details'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProduct(null)}
                className="p-1.5 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Image & Main Info */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              <div className="w-full sm:w-32 h-36 rounded-2xl bg-gray-50 flex items-center justify-center overflow-hidden p-3 border border-gray-100 shrink-0">
                {selectedProduct.imageUrl ? (
                  <img
                    src={selectedProduct.imageUrl}
                    alt={selectedProduct.name}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <PackageOpen className="w-12 h-12 text-gray-300" />
                )}
              </div>

              <div className="space-y-1.5 flex-1 min-w-0">
                <h3 className="text-base font-bold text-gray-950 leading-snug">
                  {selectedProduct.name}
                </h3>
                {selectedProduct.brandName && (
                  <p className="text-xs text-gray-500 font-medium">
                    Brand: <span className="text-gray-800 font-semibold">{selectedProduct.brandName}</span>
                  </p>
                )}
                <div className="text-xl font-extrabold text-gray-950 pt-1">
                  ₹{(selectedProduct.lowestPrice || selectedProduct.minPrice || 0).toLocaleString('en-IN')}
                </div>
              </div>
            </div>

            {/* Carrying Stores Section */}
            <div className="space-y-2 pt-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Available at nearby stores
              </h4>

              {selectedProduct.carryingStores && selectedProduct.carryingStores.length > 0 ? (
                <div className="space-y-2">
                  {selectedProduct.carryingStores.map((cs) => (
                    <div
                      key={cs.inventoryId}
                      className="p-3 rounded-2xl border border-gray-200/80 bg-gray-50/50 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-gray-900 truncate flex items-center gap-1">
                          <span>{cs.storeName}</span>
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#34C759]" />
                        </div>
                        <p className="text-[11px] text-gray-500 truncate mt-0.5">
                          {cs.storeAddress || 'Local Address'}
                        </p>
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-600 font-medium">
                          {cs.distanceKm !== undefined && (
                            <span className="text-[#007AFF] font-semibold">{formatDistance(cs.distanceKm)} away</span>
                          )}
                          <span>•</span>
                          <span className="text-[#34C759] font-semibold">{cs.availableQuantity} in stock</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={isReservingHold || cs.availableQuantity <= 0}
                        onClick={() => handleReserveProduct(selectedProduct, cs)}
                        className="bg-[#007AFF] hover:bg-[#0071E3] disabled:bg-gray-200 disabled:text-gray-400 text-white px-3.5 py-2 rounded-xl text-xs font-bold shrink-0 transition cursor-pointer shadow-xs flex items-center gap-1.5"
                      >
                        {isReservingHold ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Reserving...</span>
                          </>
                        ) : (
                          <span>Hold 30 Min</span>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-gray-50 text-center text-xs text-gray-500">
                  Checking verified store inventories...
                </div>
              )}
            </div>

            {/* Primary Reserve Button */}
            <div className="pt-2">
              <button
                type="button"
                disabled={isReservingHold || (selectedProduct.totalAvailableQuantity ?? 0) <= 0}
                onClick={() => handleReserveProduct(selectedProduct)}
                className="w-full bg-[#007AFF] hover:bg-[#0071E3] disabled:bg-gray-200 disabled:text-gray-400 text-white py-3.5 rounded-2xl text-xs font-bold transition cursor-pointer shadow-md flex items-center justify-center gap-2"
              >
                {isReservingHold ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Reserving hold pass...</span>
                  </>
                ) : (
                  <>
                    <Clock className="w-4 h-4" />
                    <span>Reserve 30-Min Hold Pass</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          MODAL: FILTER & SORT (BOTTOM SHEET)
      ══════════════════════════════════════════════════════════════════ */}
      {isFilterOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div 
            className="absolute inset-0"
            onClick={() => setIsFilterOpen(false)}
          />
          <div className="relative w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl max-h-[85vh] overflow-y-auto space-y-5 z-10 animate-in slide-in-from-bottom duration-200 text-gray-900">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-950">Filter & Sort</h3>
              <button
                type="button"
                onClick={() => setIsFilterOpen(false)}
                className="p-1.5 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sort Options */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500">
                Sort By
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'relevance' as SortByType, label: 'Relevance' },
                  { id: 'nearby' as SortByType, label: 'Nearby (Distance)' },
                  { id: 'price-asc' as SortByType, label: 'Price: Low to High' },
                  { id: 'price-desc' as SortByType, label: 'Price: High to Low' },
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSortBy(s.id)}
                    className={`py-2 px-3 text-xs font-semibold rounded-xl border text-left transition cursor-pointer ${
                      sortBy === s.id
                        ? 'bg-blue-50 border-[#007AFF] text-[#007AFF]'
                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Distance Radius */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500">
                Search Radius
              </label>
              <div className="grid grid-cols-4 gap-2">
                {(['2 km', '5 km', '10 km', '15 km'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRadiusFilter(r)}
                    className={`py-2 text-xs font-semibold rounded-xl border transition cursor-pointer ${
                      radiusFilter === r
                        ? 'bg-[#007AFF] text-white border-[#007AFF]'
                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Price Range */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500">
                Price Range
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'all' as PriceRangeFilter, label: 'All Prices' },
                  { id: 'under1000' as PriceRangeFilter, label: 'Under ₹1,000' },
                  { id: '1000-5000' as PriceRangeFilter, label: '₹1,000 - ₹5,000' },
                  { id: '5000-20000' as PriceRangeFilter, label: '₹5,000 - ₹20,000' },
                  { id: 'above20000' as PriceRangeFilter, label: 'Above ₹20,000' },
                ].map((pr) => (
                  <button
                    key={pr.id}
                    type="button"
                    onClick={() => setPriceRangeFilter(pr.id)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition cursor-pointer ${
                      priceRangeFilter === pr.id
                        ? 'bg-blue-50 border-[#007AFF] text-[#007AFF]'
                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {pr.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Availability Toggle */}
            <div className="pt-1">
              <label className="flex items-center justify-between p-3 rounded-2xl bg-gray-50 border border-gray-200/80 cursor-pointer">
                <span className="text-xs font-bold text-gray-900">In Stock Only</span>
                <input
                  type="checkbox"
                  checked={inStockOnlyFilter}
                  onChange={(e) => setInStockOnlyFilter(e.target.value === 'true' || e.target.checked)}
                  className="w-4 h-4 accent-[#007AFF] cursor-pointer"
                />
              </label>
            </div>

            {/* Category Filter Pills */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500">
                Category
              </label>
              <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto">
                <button
                  type="button"
                  onClick={() => setSelectedCategory('all')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition cursor-pointer ${
                    selectedCategory === 'all'
                      ? 'bg-[#007AFF] text-white border-[#007AFF]'
                      : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  All Categories
                </button>
                {dbCategories.map((cat) => {
                  const isSelected = selectedCategory === cat.slug || selectedCategory === cat.name;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSelectedCategory(isSelected ? 'all' : (cat.slug || cat.name))}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition cursor-pointer ${
                        isSelected
                          ? 'bg-[#007AFF] text-white border-[#007AFF]'
                          : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {cat.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center gap-3 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={resetFilters}
                className="flex-1 py-3 px-4 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50 transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
              <button
                type="button"
                onClick={() => setIsFilterOpen(false)}
                className="flex-2 py-3 px-4 rounded-xl bg-[#007AFF] text-white text-xs font-bold hover:bg-[#0071E3] transition cursor-pointer shadow-xs"
              >
                Show Results
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          MODAL: NOTIFICATIONS (TOP BAR)
      ══════════════════════════════════════════════════════════════════ */}
      {isNotificationsOpen && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div 
            className="absolute inset-0"
            onClick={() => setIsNotificationsOpen(false)}
          />
          <div className="relative w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl space-y-4 z-10 mt-14 sm:mt-0 text-gray-900 border border-gray-100">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-sm font-bold text-gray-950 flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#007AFF]" />
                <span>Notifications</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsNotificationsOpen(false)}
                className="p-1 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-6 text-center text-gray-400 space-y-2">
              <Bell className="w-8 h-8 mx-auto text-gray-300" />
              <p className="text-xs font-semibold text-gray-700">No new notifications</p>
              <p className="text-[11px] text-gray-400 max-w-xs mx-auto">
                Real-time alerts regarding your 30-minute hold passes and store responses will appear here.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          7. BOTTOM NAVIGATION BAR (Home, Explore, Holds, Chats, Profile)
      ══════════════════════════════════════════════════════════════════ */}
      <div className="fixed bottom-0 left-0 right-0 max-w-[440px] mx-auto bg-white/90 backdrop-blur-xl border-t border-gray-200/70 flex items-center justify-around py-2.5 px-2 z-30 shadow-[0_-2px_12px_rgba(0,0,0,0.03)]">
        {/* Home */}
        <button
          type="button"
          onClick={() => {
            setSelectedStore(null);
            setSelectedProduct(null);
            onNavigateToHome();
          }}
          className="flex flex-col items-center gap-1 transition-all active:scale-[0.94] cursor-pointer text-gray-400 hover:text-gray-600"
        >
          <HomeIcon className="w-5 h-5" />
          <span className="text-[10px] font-medium">Home</span>
        </button>

        {/* Explore (Primary Active) */}
        <button
          type="button"
          onClick={() => {
            setSelectedStore(null);
            setSelectedProduct(null);
            setSearchQuery('');
            setActiveTab('explore');
          }}
          className={`flex flex-col items-center gap-1 transition-all active:scale-[0.94] cursor-pointer ${
            activeTab === 'explore' && !selectedStore
              ? 'text-[#007AFF] font-bold'
              : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          <Compass className="w-5 h-5" />
          <span className="text-[10px]">Explore</span>
        </button>

        {/* Holds */}
        <button
          type="button"
          onClick={() => {
            setSelectedStore(null);
            setSelectedProduct(null);
            setActiveTab('holds');
          }}
          className={`flex flex-col items-center gap-1 transition-all active:scale-[0.94] cursor-pointer relative ${
            activeTab === 'holds'
              ? 'text-[#007AFF] font-bold'
              : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          <Clock className="w-5 h-5" />
          <span className="text-[10px]">Holds</span>
          {activeHold && activeHold.totalSeconds > 0 && (
            <span className="absolute -top-0.5 right-1.5 w-2 h-2 rounded-full bg-[#34C759] animate-pulse" />
          )}
        </button>

        {/* Chats / Live Ask */}
        <button
          type="button"
          onClick={() => {
            setSelectedStore(null);
            setSelectedProduct(null);
            setActiveTab('live-ask');
          }}
          className={`flex flex-col items-center gap-1 transition-all active:scale-[0.94] cursor-pointer ${
            activeTab === 'live-ask'
              ? 'text-[#007AFF] font-bold'
              : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          <Radio className="w-5 h-5" />
          <span className="text-[10px]">Chats</span>
        </button>

        {/* Profile / Account */}
        <button
          type="button"
          onClick={() => {
            setSelectedStore(null);
            setSelectedProduct(null);
            setActiveTab('account');
          }}
          className={`flex flex-col items-center gap-1 transition-all active:scale-[0.94] cursor-pointer ${
            activeTab === 'account'
              ? 'text-[#007AFF] font-bold'
              : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          <User className="w-5 h-5" />
          <span className="text-[10px]">Profile</span>
        </button>
      </div>

    </div>
  );
};
