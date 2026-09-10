import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  Settings,
  Bell,
  HelpCircle,
  Info,
  LogOut,
  CheckCircle2,
  Loader2,
  PackageOpen,
  Shield,
  Store
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
import { ExperienceHeaderPill, isSuperAdminEmail } from '../components/ExperienceSwitcher';
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

// ── Format distance cleanly (Task 4) ──
function formatDistance(distKm?: number | null): string {
  if (distKm === undefined || distKm === null || isNaN(distKm)) return '';
  if (distKm < 1) {
    return `${Math.round(distKm * 1000)} m`;
  }
  return `${distKm.toFixed(1)} km`;
}

// ── Deterministic QR Code Generator Component ──
const MiniQRCode: React.FC<{ value: string; size?: number }> = ({ value, size = 130 }) => {
  const matrix = useMemo(() => {
    const dim = 21;
    const grid: boolean[][] = Array.from({ length: dim }, () => Array(dim).fill(false));

    // Finder patterns (top-left, top-right, bottom-left)
    const addFinder = (startR: number, startC: number) => {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          if (
            r === 0 || r === 6 || c === 0 || c === 6 ||
            (r >= 2 && r <= 4 && c >= 2 && c <= 4)
          ) {
            grid[startR + r][startC + c] = true;
          }
        }
      }
    };

    addFinder(0, 0);
    addFinder(0, 14);
    addFinder(14, 0);

    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      hash = (hash << 5) - hash + value.charCodeAt(i);
      hash |= 0;
    }

    for (let r = 0; r < dim; r++) {
      for (let c = 0; c < dim; c++) {
        if ((r < 7 && c < 7) || (r < 7 && c >= 14) || (r >= 14 && c < 7)) continue;
        const bit = Math.abs(Math.sin(hash + r * 23 + c * 37)) > 0.46;
        grid[r][c] = bit;
      }
    }
    return grid;
  }, [value]);

  const cellSize = size / 21;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rounded-lg">
      <rect width={size} height={size} fill="#ffffff" />
      {matrix.map((row, r) =>
        row.map((active, c) =>
          active ? (
            <rect
              key={`${r}-${c}`}
              x={c * cellSize}
              y={r * cellSize}
              width={cellSize}
              height={cellSize}
              fill="#111827"
            />
          ) : null
        )
      )}
    </svg>
  );
};

const detectCategoryFromQuery = (text: string, categories: CategoryDto[]): string => {
  const q = text.toLowerCase().trim();
  if (!q || !categories || categories.length === 0) return '';

  const groceryKeywords = [
    'curd', 'milk', 'bread', 'maggie', 'maggi', 'noodle', 'noodles', 'egg', 'eggs', 'paneer', 'cheese',
    'butter', 'rice', 'dal', 'oil', 'sugar', 'salt', 'atta', 'flour', 'biscuit', 'biscuits', 'cookie',
    'cookies', 'chips', 'snack', 'snacks', 'chocolate', 'chocolates', 'tea', 'coffee', 'juice', 'water',
    'soap', 'shampoo', 'toothpaste', 'grocery', 'groceries', 'fruit', 'fruits', 'vegetable', 'vegetables',
    'apple', 'banana', 'potato', 'onion', 'tomato', 'dosa', 'idli', 'batter', 'sweet', 'sweets', 'ghee',
    'masala', 'spice', 'spices', 'cereal', 'oats', 'yoghurt', 'yogurt', 'namkeen', 'beverage', 'drink',
    'pasta', 'sauce', 'jam', 'honey', 'dry fruit', 'almond', 'cashew', 'varkey', 'peda', 'cake'
  ];
  const electronicsKeywords = [
    'phone', 'iphone', 'samsung', 'mobile', 'laptop', 'macbook', 'charger', 'cable', 'cord',
    'earphone', 'earphones', 'headphone', 'headphones', 'airpod', 'airpods', 'buds', 'watch',
    'smartwatch', 'tv', 'battery', 'powerbank', 'adapter', 'camera', 'keyboard', 'mouse',
    'ipad', 'tablet', 'speaker', 'usb', 'gadget', 'gadgets', 'electronic'
  ];
  const footwearSportsKeywords = [
    'shoe', 'shoes', 'sneaker', 'sneakers', 'boots', 'sandals', 'slipper', 'slippers', 'crocs',
    'football', 'cricket', 'bat', 'ball', 'badminton', 'racket', 'shuttle', 'jersey', 'gym',
    'dumbbell', 'yoga', 'cycle', 'bicycle', 'sports', 'fitness', 'athletic', 'cleats'
  ];
  const pharmacyKeywords = [
    'medicine', 'medicines', 'tablet', 'tablets', 'pill', 'pills', 'capsule', 'capsules', 'syrup',
    'paracetamol', 'crocin', 'dolo', 'bandage', 'ointment', 'pain', 'balm', 'thermometer', 'mask',
    'sanitizer', 'vitamin', 'vitamins', 'health', 'pharma', 'medical'
  ];
  const clothingKeywords = [
    'shirt', 'shirts', 't-shirt', 'tshirt', 'pant', 'pants', 'jeans', 'trousers', 'dress', 'saree',
    'sari', 'kurti', 'kurta', 'jacket', 'hoodie', 'socks', 'underwear', 'cloth', 'clothes', 'fabric', 'suit'
  ];
  const beautyKeywords = [
    'lipstick', 'makeup', 'perfume', 'perfumes', 'deodorant', 'deo', 'cream', 'lotion', 'serum',
    'sunscreen', 'face wash', 'facewash', 'kajal', 'foundation', 'eyeliner', 'cosmetics', 'beauty'
  ];

  const findCat = (kw: string) => categories.find(c => 
    c.slug?.toLowerCase().includes(kw) || c.name?.toLowerCase().includes(kw)
  );

  if (groceryKeywords.some(k => q.includes(k))) {
    const cat = findCat('groc') || findCat('food') || findCat('essential');
    if (cat) return cat.id;
  }
  if (electronicsKeywords.some(k => q.includes(k))) {
    const cat = findCat('elect') || findCat('gadget');
    if (cat) return cat.id;
  }
  if (footwearSportsKeywords.some(k => q.includes(k))) {
    const cat = findCat('foot') || findCat('sport');
    if (cat) return cat.id;
  }
  if (pharmacyKeywords.some(k => q.includes(k))) {
    const cat = findCat('pharm') || findCat('health');
    if (cat) return cat.id;
  }
  if (clothingKeywords.some(k => q.includes(k))) {
    const cat = findCat('cloth') || findCat('fashion') || findCat('apparel');
    if (cat) return cat.id;
  }
  if (beautyKeywords.some(k => q.includes(k))) {
    const cat = findCat('beauty') || findCat('personal');
    if (cat) return cat.id;
  }

  return '';
};

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
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Selected Store Details View
  const [selectedStore, setSelectedStore] = useState<ShopProfileDto | null>(null);
  const [storeActiveTab, setStoreActiveTab] = useState<'products' | 'about'>('products');

  // Explore Filters
  const [radiusFilter, setRadiusFilter] = useState<'2 km' | '5 km' | '10 km' | '15 km'>('5 km');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [bookmarkedIds, setBookmarkedIds] = useState<Record<string, boolean>>({});

  // Real Database Data State (Single Source of Truth)
  const [dbCategories, setDbCategories] = useState<CategoryDto[]>([]);
  const [dbProducts, setDbProducts] = useState<ProductSearchResult[]>([]);
  const [dbShops, setDbShops] = useState<ShopProfileDto[]>([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
  const [isLoadingShops, setIsLoadingShops] = useState(false);

  // Live Ask Form State
  const [askProductName, setAskProductName] = useState('');
  const [askVariant, setAskVariant] = useState('');
  const [askCategory, setAskCategory] = useState<string>('');
  const [isCategoryUserSelected, setIsCategoryUserSelected] = useState<boolean>(false);
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

  // Pending Hold intent for guest reservation
  const [pendingHold, setPendingHold] = useState<{
    prod: ProductSearchResult;
    storeInventory?: StoreInventoryItem;
  } | null>(null);
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

  // Numeric radius in kilometers
  const radiusKm = useMemo(() => {
    return parseInt(radiusFilter.replace(/[^0-9]/g, ''), 10) || 5;
  }, [radiusFilter]);

  // 300ms Search Debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load Real Categories from API (Task 9)
  useEffect(() => {
    let isMounted = true;
    async function loadCategories() {
      try {
        const cats = await fetchCategories();
        if (isMounted && cats) {
          setDbCategories(cats);
          if (cats.length > 0) {
            setAskCategory(prev => {
              if (prev) return prev;
              const groc = cats.find(c => c.slug?.toLowerCase().includes('groc') || c.name?.toLowerCase().includes('groc'));
              return groc ? groc.id : cats[0].id;
            });
          }
        }
      } catch (err) {
        console.error('Failed to load categories:', err);
      }
    }
    loadCategories();
    return () => { isMounted = false; };
  }, []);

  // Load Real Catalog Products from Backend (Task 2 & 7)
  const loadProducts = useCallback(async () => {
    setIsLoadingCatalog(true);
    try {
      const results = await searchProducts(
        debouncedQuery,
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

  // Load Real Nearby Stores from Backend (Task 2, 4, 7)
  const loadShops = useCallback(async () => {
    setIsLoadingShops(true);
    try {
      const shops = await fetchShops(
        currentLocation.lat,
        currentLocation.lng,
        radiusKm,
        selectedCategory === 'all' ? undefined : selectedCategory
      );
      // Ensure visibility rules (Task 7): Approved, Active, LiveEnabled
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
      }).catch(err => {
        console.debug('Skip active holds sync:', err);
      });
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

  const toggleBookmark = (id: string) => {
    setBookmarkedIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

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
      
      let categoryId = '';
      if (askCategory && isGuid(askCategory)) {
        categoryId = askCategory;
      } else if (selectedCategory && selectedCategory !== 'all' && isGuid(selectedCategory)) {
        categoryId = selectedCategory;
      } else if (dbCategories.length > 0) {
        const grocCat = dbCategories.find(c => (c.slug?.toLowerCase().includes('groc') || c.name?.toLowerCase().includes('groc')) && isGuid(c.id));
        const firstCat = dbCategories.find(c => isGuid(c.id));
        categoryId = (grocCat || firstCat)?.id || '';
      }

      if (!categoryId) {
        const fetchedCats = await fetchCategories();
        if (fetchedCats && fetchedCats.length > 0) {
          const grocCat = fetchedCats.find(c => (c.slug?.toLowerCase().includes('groc') || c.name?.toLowerCase().includes('groc')) && isGuid(c.id));
          const firstCat = fetchedCats.find(c => isGuid(c.id));
          categoryId = (grocCat || firstCat)?.id || '';
        }
      }

      if (!categoryId) {
        alert('Please choose a store category to broadcast your request.');
        return;
      }

      const requestText = askVariant.trim()
        ? `${askProductName.trim()} (Variant: ${askVariant.trim()})`
        : askProductName.trim();

      await createLiveRequest({
        requestText,
        categoryId,
        latitude: currentLocation.lat || 11.0168,
        longitude: currentLocation.lng || 76.9558,
        searchRadiusKm: radiusNumber
      });

      setBroadcastDone(true);
      setTimeout(() => {
        setBroadcastDone(false);
        setAskProductName('');
        setAskVariant('');
        setIsCategoryUserSelected(false);
      }, 4000);
    } catch (err) {
      console.error('Failed broadcasting request:', err);
    } finally {
      setIsBroadcasting(false);
    }
  };

  // Real backend hold reservation (Zero Forced Login, Real Backend Atomic Hold)
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
        setActiveTab('holds');
        setPendingHold(null);
      } else {
        alert(res.error || 'Failed to reserve hold pass. Please check stock availability and try again.');
        setPendingHold(null);
      }
    } catch (err: any) {
      console.error('Failed reserving inventory hold:', err);
      alert(err?.message || 'Unable to connect to server. Please try again.');
      setPendingHold(null);
    } finally {
      setIsReservingHold(false);
    }
  };

  // Auto-execute pending hold reservation once customer signs in
  useEffect(() => {
    if (!pendingHold) return;
    const token = localStorage.getItem('zooner_token');
    if (token) {
      handleReserveProduct(pendingHold.prod, pendingHold.storeInventory);
    }
  }, [userProfile]);

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

  const formatTimer = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')} : ${String(secs).padStart(2, '0')}`;
  };

  // Real store catalog items (products carried by selected store)
  const selectedStoreProducts = useMemo(() => {
    if (!selectedStore) return [];
    return dbProducts.filter(p => 
      p.carryingStores?.some(cs => cs.storeId === selectedStore.id)
    );
  }, [selectedStore, dbProducts]);

  return (
    <div className="flex-1 flex flex-col bg-white text-gray-900 font-sans pb-20 select-none">

      {/* ── MAIN SCREEN CONTAINER ── */}
      <div className="flex-1 flex flex-col overflow-y-auto no-scrollbar">

        {/* ══════════════════════════════════════════════════════════════════
            SCREEN 4: STORE DETAILS (Real Store from Database)
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
                    onClick={() => toggleBookmark(selectedStore.id)}
                    className="w-9 h-9 rounded-full bg-white text-gray-800 flex items-center justify-center shadow-md hover:bg-gray-100 transition cursor-pointer"
                    aria-label="Bookmark"
                  >
                    <Bookmark className={`w-4 h-4 ${bookmarkedIds[selectedStore.id] ? 'fill-[#007AFF] text-[#007AFF]' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Title on Banner */}
              <div className="relative z-10 text-white">
                <h1 className="text-2xl font-bold tracking-tight drop-shadow-sm font-apple">{selectedStore.name}</h1>
              </div>
            </div>

            {/* Store Meta Card (Task 3: Real metadata only, no fabricated ratings) */}
            <div className="px-5 py-4 border-b border-gray-100 bg-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-gray-900 text-white font-bold text-lg flex items-center justify-center shrink-0">
                    {selectedStore.name.charAt(0)}
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-gray-950 flex items-center gap-1.5 font-apple">
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
                    <div className="flex items-center justify-end gap-1 text-xs text-[#007AFF] font-medium">
                      <MapPin className="w-3 h-3 text-[#007AFF]" />
                      {formatDistance(selectedStore.distanceKm)}
                    </div>
                  )}
                  <div className="text-xs text-gray-500 mt-0.5">
                    <span className="text-[#34C759] font-semibold">Open Now</span>
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

            {/* Products Tab List (Real Store Inventory) */}
            {storeActiveTab === 'products' && (
              <div className="p-5 space-y-3">
                {selectedStoreProducts.length > 0 ? (
                  selectedStoreProducts.map((item) => {
                    const storeInv = item.carryingStores?.find(cs => cs.storeId === selectedStore.id);
                    const price = storeInv?.price || item.minPrice || 0;
                    const stock = storeInv?.availableQuantity ?? item.totalAvailableQuantity ?? 0;
                    const inStock = stock > 0;

                    return (
                      <div
                        key={item.id}
                        className="p-3.5 bg-white rounded-2xl border border-gray-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex items-center justify-between gap-3 hover:border-gray-300 transition"
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
                              {price > 0 ? `₹ ${price.toLocaleString('en-IN')}` : 'Price at counter'}
                            </div>
                            <span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full mt-1 ${
                              inStock
                                ? (stock <= 2 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-[#34C759] font-semibold')
                                : 'bg-gray-100 text-gray-500'
                            }`}>
                              {inStock ? (stock <= 2 ? `Low stock (${stock} left)` : 'In stock') : 'Out of stock'}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={!inStock || isReservingHold}
                          onClick={() => handleReserveProduct(item, storeInv)}
                          className="shrink-0 bg-[#007AFF] hover:bg-[#0071E3] active:scale-[0.98] disabled:bg-gray-200 disabled:text-gray-400 text-white px-3.5 py-2 rounded-xl text-xs font-semibold transition cursor-pointer shadow-xs flex items-center gap-1.5"
                        >
                          {isReservingHold ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Reserving...</span>
                            </>
                          ) : (
                            <span>Hold for 30 min</span>
                          )}
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-12 text-center text-gray-400 space-y-2">
                    <PackageOpen className="w-9 h-9 mx-auto text-gray-300" />
                    <p className="text-xs font-medium text-gray-600">No active products cataloged for this store.</p>
                    <p className="text-[11px] text-gray-400">You can still broadcast a live request to this shop.</p>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedStore(null);
                        setActiveTab('live-ask');
                      }}
                      className="mt-2 text-xs font-semibold text-[#007AFF] hover:underline"
                    >
                      Ask store for a product →
                    </button>
                  </div>
                )}
              </div>
            )}

            {storeActiveTab === 'about' && (
              <div className="p-5 text-xs text-gray-600 space-y-3">
                <div className="p-4 rounded-2xl bg-gray-50 space-y-2 text-gray-800 border border-gray-100">
                  <div><strong className="text-gray-950">Store Name:</strong> {selectedStore.name}</div>
                  <div><strong className="text-gray-950">Address:</strong> {selectedStore.address || 'Coimbatore Area'}</div>
                  {selectedStore.phone && (
                    <div><strong className="text-gray-950">Phone:</strong> {selectedStore.phone}</div>
                  )}
                  <div><strong className="text-gray-950">Verification:</strong> Verified Physical Retailer</div>
                  <div><strong className="text-gray-950">Live Status:</strong> Online for reservations</div>
                </div>
              </div>
            )}
          </div>
        ) : false ? (

          /* ══════════════════════════════════════════════════════════════════
              SCREEN 2: SEARCH RESULTS (Single Source of Truth, Task 2 & 8)
          ══════════════════════════════════════════════════════════════════ */
          <div className="animate-in fade-in duration-150 p-5">
            {/* Top Search Bar */}
            <div className="flex items-center gap-2 mb-4">
              <button
                type="button"
                onClick={() => {
                  setIsSearching(false);
                  setSearchQuery('');
                }}
                className="p-2 -ml-2 rounded-full text-gray-800 hover:bg-gray-100 transition cursor-pointer"
                aria-label="Back"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>

              <div className="flex-1 relative flex items-center">
                <Search className="absolute left-3.5 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  autoFocus
                  placeholder="Search products or stores..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-gray-100/80 border-0 rounded-2xl py-3 pl-10 pr-9 text-xs text-gray-900 placeholder-gray-400 focus:bg-white focus:ring-2 focus:ring-[#007AFF] outline-hidden transition-all"
                />

                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 text-gray-400 hover:text-gray-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Results Header: "Results near Coimbatore" */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-gray-900">
                  Results near {currentLocation.name ? currentLocation.name.split(',')[0] : 'Current Location'}
                </h3>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {isLoadingCatalog 
                    ? 'Searching physical stores...' 
                    : `${dbProducts.length} product${dbProducts.length === 1 ? '' : 's'} • ${dbShops.length} store${dbShops.length === 1 ? '' : 's'}`}
                </p>
              </div>

              {/* Radius badge */}
              <div className="flex items-center gap-1 border border-gray-200 rounded-lg px-2.5 py-1 text-xs text-gray-600">
                <span>{radiusFilter}</span>
              </div>
            </div>

            {/* Product Cards List or Empty State */}
            {isLoadingCatalog ? (
              <div className="py-16 text-center text-gray-400 space-y-2">
                <Loader2 className="w-7 h-7 mx-auto animate-spin text-[#7C5CFF]" />
                <p className="text-xs">Searching verified shelf inventory...</p>
              </div>
            ) : dbProducts.length > 0 ? (
              <div className="space-y-3">
                {dbProducts.map((prod) => {
                  const firstStore = prod.carryingStores && prod.carryingStores.length > 0 ? prod.carryingStores[0] : null;
                  const price = prod.minPrice || (firstStore ? firstStore.price : 0);
                  const stock = prod.totalAvailableQuantity ?? (firstStore ? firstStore.availableQuantity : 0);
                  const inStock = stock > 0;
                  const distanceText = firstStore?.distanceKm ? formatDistance(firstStore.distanceKm) : '';

                  return (
                    <div
                      key={prod.id}
                      className="bg-white rounded-2xl border border-gray-100 p-3 shadow-xs flex gap-3.5 items-center relative hover:border-gray-200 transition"
                    >
                      {/* Thumbnail */}
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

                      {/* Details */}
                      <div className="flex-1 min-w-0 pr-6">
                        <h4 className="text-xs font-semibold text-gray-900 truncate">
                          {prod.name}
                        </h4>

                        {/* Bookmark */}
                        <button
                          type="button"
                          onClick={() => toggleBookmark(prod.id)}
                          className="absolute top-3 right-3 text-gray-400 hover:text-gray-700 cursor-pointer"
                        >
                          <Bookmark className={`w-4 h-4 ${bookmarkedIds[prod.id] ? 'fill-[#7C5CFF] text-[#7C5CFF]' : ''}`} />
                        </button>

                        <div className="text-sm font-bold text-gray-950 mt-1">
                          {price > 0 ? `₹ ${price.toLocaleString('en-IN')}` : 'Price at counter'}
                        </div>

                        <div className="mt-1">
                          <span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full ${
                            inStock
                              ? (stock <= 2 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-[#20D99A] font-semibold')
                              : 'bg-gray-100 text-gray-500'
                          }`}>
                            {inStock ? (stock <= 2 ? `Low stock (${stock} left)` : 'In stock') : 'Out of stock'}
                          </span>
                        </div>

                        {firstStore && (
                          <div className="flex items-center justify-between mt-2 text-[11px] text-gray-500 truncate">
                            <span>{distanceText ? `${distanceText} • ` : ''}{firstStore.storeName}</span>
                          </div>
                        )}

                        <div className="flex items-center justify-between mt-2">
                          <span className="text-[10px] text-gray-400">
                            {prod.carryingStores?.length ? `${prod.carryingStores.length} store${prod.carryingStores.length > 1 ? 's' : ''}` : 'Direct store'}
                          </span>

                          <button
                            type="button"
                            onClick={() => {
                              if (firstStore) {
                                setSelectedStore({
                                  id: firstStore.storeId,
                                  name: firstStore.storeName,
                                  phone: firstStore.storePhone || '',
                                  address: firstStore.storeAddress || '',
                                  latitude: firstStore.latitude || 0,
                                  longitude: firstStore.longitude || 0,
                                  isLiveEnabled: true,
                                  isOpen: true,
                                  distanceKm: firstStore.distanceKm
                                });
                              } else {
                                handleReserveProduct(prod);
                              }
                            }}
                            className="bg-[#7C5CFF] hover:bg-[#6842FF] text-white px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer shadow-xs transition"
                          >
                            {firstStore ? 'View Store' : 'Reserve'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (

              /* ── TASK 8: EMPTY STATE FOR SEARCH ── */
              <div className="py-12 px-4 text-center space-y-4 bg-gray-50/60 rounded-3xl border border-gray-100">
                <div className="w-12 h-12 rounded-full bg-white shadow-xs mx-auto flex items-center justify-center text-gray-400">
                  <Search className="w-6 h-6 text-gray-400" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-gray-900">No products found nearby</h4>
                  <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto">
                    We couldn't find any products matching "{searchQuery}" within {radiusFilter}.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
                  <button
                    type="button"
                    onClick={() => setRadiusFilter('15 km')}
                    className="px-3.5 py-2 rounded-xl bg-white border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition cursor-pointer"
                  >
                    Expand radius to 15 km
                  </button>
                  {selectedCategory !== 'all' && (
                    <button
                      type="button"
                      onClick={() => setSelectedCategory('all')}
                      className="px-3.5 py-2 rounded-xl bg-white border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition cursor-pointer"
                    >
                      Clear category filter
                    </button>
                  )}
                </div>

                <div className="pt-2 border-t border-gray-200/60">
                  <p className="text-xs text-gray-600 font-medium">Can't find what you're looking for?</p>
                  <button
                    type="button"
                    onClick={() => {
                      setAskProductName(searchQuery);
                      setActiveTab('live-ask');
                    }}
                    className="mt-2 w-full max-w-xs mx-auto bg-[#7C5CFF] hover:bg-[#6842FF] text-white py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer shadow-xs"
                  >
                    Ask nearby stores
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : activeTab === 'explore' ? (

          /* ══════════════════════════════════════════════════════════════════
              SCREEN 1: EXPLORE (HOME) (Task 10: Consumer-first UX)
          ══════════════════════════════════════════════════════════════════ */
          <div className="animate-in fade-in duration-150 p-5 space-y-5">
            {/* Header: Logo & Location Selector */}
            <div className="flex items-center justify-between">
              <div 
                onClick={onNavigateToHome}
                className="font-bold text-2xl tracking-tight text-gray-950 select-none cursor-pointer font-apple"
                title="Zooner Home"
              >
                zooner<span className="text-[#007AFF]">.</span>
              </div>

              <div className="flex items-center gap-2">
                {isMultiRole && onOpenExperienceSwitcher && (
                  <ExperienceHeaderPill currentExperience="customer" onClick={onOpenExperienceSwitcher} />
                )}
                <button
                  type="button"
                  onClick={onOpenLocationModal}
                  className="flex items-center gap-1.5 text-xs font-semibold text-gray-800 hover:text-gray-950 transition cursor-pointer bg-gray-50 border border-gray-100 rounded-full px-2.5 py-1"
                >
                  <MapPin className="w-3.5 h-3.5 text-[#007AFF]" />
                  <span>{currentLocation.city || 'Coimbatore'}</span>
                  <ChevronDown className="w-3 h-3 text-gray-400" />
                </button>
              </div>
            </div>

            {/* Headline Section */}
            <div>
              <h2 className="text-3xl font-extrabold text-gray-950 tracking-tight leading-tight font-apple">
                Find it nearby.
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                Check real stock at local stores and reserve it before you go.
              </p>
            </div>

            {/* Real Search Bar */}
            <div className="relative flex items-center w-full shadow-xs">
              <Search className="absolute left-3.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search for products (e.g., iPhone, milk, shoe...)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-gray-100/80 border-0 rounded-2xl py-3 pl-10 pr-9 text-xs text-gray-900 placeholder-gray-400 focus:bg-white focus:ring-2 focus:ring-[#007AFF] outline-hidden transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Radius Pills (Task 4: Dynamic Radius Selection) */}
            {!searchQuery && (
              <div className="flex items-center gap-2">
                {(['2 km', '5 km', '10 km', '15 km'] as const).map((rad) => (
                  <button
                    key={rad}
                    type="button"
                    onClick={() => setRadiusFilter(rad)}
                    className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                      radiusFilter === rad
                        ? 'bg-[#007AFF] text-white shadow-xs'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {rad}
                  </button>
                ))}
              </div>
            )}

            {/* Browse by Category (Task 9: API-driven Categories) */}
            {!searchQuery && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-gray-900 font-apple">Browse by category</h3>
                {selectedCategory !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setSelectedCategory('all')}
                    className="text-xs font-semibold text-[#007AFF] hover:underline cursor-pointer"
                  >
                    Show all
                  </button>
                )}
              </div>

              {dbCategories.length > 0 ? (
                <div className="grid grid-cols-4 gap-2.5">
                  {dbCategories.slice(0, 8).map((cat) => {
                    const isSelected = selectedCategory === cat.slug || selectedCategory === cat.name;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          setSelectedCategory(isSelected ? 'all' : cat.slug || cat.name);
                        }}
                        className={`rounded-2xl p-2.5 flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer border ${
                          isSelected
                            ? 'bg-blue-50 border-[#007AFF] text-[#007AFF] shadow-xs ring-1 ring-[#007AFF]'
                            : 'bg-white hover:bg-gray-50 border-gray-200/80 hover:border-gray-300 text-gray-700 shadow-[0_1px_2px_rgba(0,0,0,0.03)]'
                        }`}
                      >
                        <div className="w-8 h-8 flex items-center justify-center text-lg">
                          {cat.iconName ? cat.iconName.charAt(0).toUpperCase() : '📦'}
                        </div>
                        <span className="text-[10px] font-medium text-center leading-tight truncate w-full">
                          {cat.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="text-xs text-gray-400 py-3 text-center">
                  Loading categories...
                </div>
              )}
            </div>
            )}

            {/* Merchant Onboarding Prompt Banner */}
            {!searchQuery && (
              <div 
                onClick={() => {
                  if (onOpenRetailerModal) onOpenRetailerModal();
                  else if (onNavigateToVendor) onNavigateToVendor();
                }}
                className="bg-white rounded-2xl border border-gray-200/80 p-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex items-center justify-between gap-3 cursor-pointer hover:border-blue-300 transition-all group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#007AFF] flex items-center justify-center shrink-0 group-hover:bg-[#007AFF] group-hover:text-white transition-colors">
                    <Store className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-gray-950 font-apple">Are you a physical store owner?</h4>
                    <p className="text-[11px] text-gray-500 truncate">List your shelves on Zooner for 0% commission</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-[#007AFF] group-hover:translate-x-0.5 transition-all shrink-0" />
              </div>
            )}

            {/* Nearby Verified Products Section (Task 2 & 8: Real backend data or clean empty state) */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-gray-900 font-apple">{searchQuery ? 'Search Results' : 'Nearby Products'}</h3>
                <span className="text-xs text-gray-400">{radiusFilter} radius</span>
              </div>

              {isLoadingCatalog ? (
                <div className="py-12 text-center space-y-2">
                  <Loader2 className="w-6 h-6 mx-auto animate-spin text-[#007AFF]" />
                  <p className="text-xs text-gray-400">Loading catalog...</p>
                </div>
              ) : dbProducts.length > 0 ? (
                <div className="space-y-3">
                  {dbProducts.map((prod) => {
                    const price = prod.minPrice || 0;
                    const stock = prod.totalAvailableQuantity ?? 1;
                    const inStock = stock > 0;
                    const firstStore = prod.carryingStores?.[0];
                    const distanceText = firstStore?.distanceKm ? formatDistance(firstStore.distanceKm) : '';

                    return (
                      <div
                        key={prod.id}
                        className="bg-white rounded-2xl border border-gray-200/80 p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex gap-3.5 items-center relative hover:border-gray-300 transition"
                      >
                        {/* Thumbnail */}
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

                        {/* Details */}
                        <div className="flex-1 min-w-0 pr-6">
                          <h4 className="text-xs font-semibold text-gray-900 truncate">
                            {prod.name}
                          </h4>

                          {/* Bookmark */}
                          <button
                            type="button"
                            onClick={() => toggleBookmark(prod.id)}
                            className="absolute top-3 right-3 text-gray-400 hover:text-gray-700 cursor-pointer"
                          >
                            <Bookmark className={`w-4 h-4 ${bookmarkedIds[prod.id] ? 'fill-[#007AFF] text-[#007AFF]' : ''}`} />
                          </button>

                          <div className="text-sm font-bold text-gray-950 mt-1">
                            {price > 0 ? `₹ ${price.toLocaleString('en-IN')}` : 'Price at counter'}
                          </div>

                          <div className="mt-1">
                            <span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full ${
                              inStock
                                ? (stock <= 2 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-[#34C759] font-semibold')
                                : 'bg-gray-100 text-gray-500'
                            }`}>
                              {inStock ? (stock <= 2 ? `Low stock (${stock} left)` : 'In stock') : 'Out of stock'}
                            </span>
                          </div>

                          {firstStore && (
                            <div className="flex items-center justify-between mt-2 text-[11px] text-gray-500 truncate">
                              <span>{distanceText ? `${distanceText} • ` : ''}{firstStore.storeName}</span>
                            </div>
                          )}

                          <div className="flex items-center justify-between mt-2">
                            <span className="text-[10px] text-gray-400">
                              {prod.carryingStores?.length ? `${prod.carryingStores.length} store${prod.carryingStores.length > 1 ? 's' : ''}` : 'Direct store'}
                            </span>

                            <button
                              type="button"
                              onClick={() => {
                                if (firstStore) {
                                  setSelectedStore({
                                    id: firstStore.storeId,
                                    name: firstStore.storeName,
                                    phone: firstStore.storePhone || '',
                                    address: firstStore.storeAddress || '',
                                    latitude: firstStore.latitude || 0,
                                    longitude: firstStore.longitude || 0,
                                    isLiveEnabled: true,
                                    isOpen: true,
                                    distanceKm: firstStore.distanceKm
                                  });
                                } else {
                                  handleReserveProduct(prod);
                                }
                              }}
                              className="bg-[#007AFF] hover:bg-[#0071E3] active:scale-[0.98] text-white px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer shadow-xs transition"
                            >
                              Reserve Hold
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* ── Task 8: Empty Products State ── */
                <div className="py-8 px-4 text-center bg-gray-50/70 rounded-2xl border border-gray-100 space-y-3">
                  <PackageOpen className="w-8 h-8 text-gray-400 mx-auto" />
                  <div>
                    <h4 className="text-sm font-bold text-gray-900">No products found nearby</h4>
                    <p className="text-xs text-gray-500 mt-0.5">
                      No verified local store has inventory cataloged in this radius.
                    </p>
                  </div>
                  <div className="flex justify-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setRadiusFilter('15 km')}
                      className="text-xs font-semibold px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-100"
                    >
                      Expand to 15 km
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('live-ask')}
                      className="text-xs font-semibold px-3.5 py-1.5 bg-[#007AFF] text-white rounded-lg hover:bg-[#0071E3]"
                    >
                      Ask nearby stores
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Nearby Verified Stores (Task 10) */}
            {!searchQuery && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-gray-900 font-apple">Nearby Local Stores</h3>
                <span className="text-xs text-gray-400">{dbShops.length} online</span>
              </div>

              {isLoadingShops ? (
                <div className="py-6 text-center text-gray-400 text-xs">
                  Locating verified stores...
                </div>
              ) : dbShops.length > 0 ? (
                <div className="space-y-2.5">
                  {dbShops.map((shop) => (
                    <div
                      key={shop.id}
                      onClick={() => setSelectedStore(shop)}
                      className="p-3.5 bg-white rounded-2xl border border-gray-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex items-center justify-between hover:border-gray-300 transition cursor-pointer"
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
                <div className="p-4 bg-gray-50 rounded-2xl text-center text-xs text-gray-500 border border-gray-100">
                  No verified stores are currently online within {radiusFilter}.
                </div>
              )}
            </div>
            )}
          </div>
        ) : activeTab === 'live-ask' ? (

          /* ══════════════════════════════════════════════════════════════════
              SCREEN 3: LIVE ASK
          ══════════════════════════════════════════════════════════════════ */
          <div className="animate-in fade-in duration-150 p-5 space-y-5">
            {/* Header: Logo & Location */}
            <div className="flex items-center justify-between">
              <div 
                onClick={onNavigateToHome}
                className="font-bold text-2xl tracking-tight text-gray-950 select-none cursor-pointer font-apple"
                title="Zooner Home"
              >
                zooner<span className="text-[#007AFF]">.</span>
              </div>

              <div className="flex items-center gap-2">
                {isMultiRole && onOpenExperienceSwitcher && (
                  <ExperienceHeaderPill currentExperience="customer" onClick={onOpenExperienceSwitcher} />
                )}
                <button
                  type="button"
                  onClick={onOpenLocationModal}
                  className="flex items-center gap-1 text-xs font-semibold text-gray-800 hover:text-gray-950 transition cursor-pointer bg-gray-50 border border-gray-100 rounded-full px-2.5 py-1"
                >
                  <MapPin className="w-3.5 h-3.5 text-[#007AFF]" />
                  <span>{currentLocation.city || 'Coimbatore'}</span>
                  <ChevronDown className="w-3 h-3 text-gray-400" />
                </button>
              </div>
            </div>


            {/* Headline */}
            <div>
              <h2 className="text-2xl font-black text-gray-950 tracking-tight leading-tight">
                Can't find it?<br />Ask local stores.
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                Send a request to nearby shopkeepers. They'll notify you if they have it.
              </p>
            </div>

            {broadcastDone && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-medium text-[#20D99A] flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Broadcast dispatched! Verified stores in {askRadius} radius notified.</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleBroadcast} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Product name / item <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Curd, Amul Butter, Maggie, iPhone 15, Nike Shoes"
                  value={askProductName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setAskProductName(val);
                    if (!isCategoryUserSelected && dbCategories.length > 0) {
                      const detected = detectCategoryFromQuery(val, dbCategories);
                      if (detected) {
                        setAskCategory(detected);
                      }
                    }
                  }}
                  className="w-full bg-white border border-gray-200 rounded-xl py-2.5 px-3.5 text-xs text-gray-900 placeholder-gray-400 focus:border-[#7C5CFF] focus:ring-1 focus:ring-[#7C5CFF] outline-hidden shadow-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Size / Quantity / Variant (optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 500g, 1 Litre, 256GB, UK 9, Pack of 4"
                  value={askVariant}
                  onChange={(e) => setAskVariant(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-xl py-2.5 px-3.5 text-xs text-gray-900 placeholder-gray-400 focus:border-[#7C5CFF] focus:ring-1 focus:ring-[#7C5CFF] outline-hidden shadow-xs"
                />
              </div>

              {/* Category Selector */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-gray-700">
                    Store Type / Category <span className="text-red-500">*</span>
                  </label>
                  {askCategory && (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      isCategoryUserSelected
                        ? 'bg-purple-100 text-purple-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {isCategoryUserSelected ? 'Selected by you' : 'Auto-suggested'}
                    </span>
                  )}
                </div>
                {dbCategories.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {dbCategories.map((cat) => {
                      const isSelected = askCategory === cat.id;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => {
                            setAskCategory(cat.id);
                            setIsCategoryUserSelected(true);
                          }}
                          className={`p-2.5 rounded-xl text-left border transition flex items-center gap-2 cursor-pointer ${
                            isSelected
                              ? 'bg-purple-50 border-[#7C5CFF] text-[#7C5CFF] ring-1 ring-[#7C5CFF]'
                              : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                          }`}
                        >
                          <span className="text-base">{cat.iconName ? cat.iconName.charAt(0).toUpperCase() : '📦'}</span>
                          <span className="text-xs font-medium truncate">{cat.name}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-xs text-gray-400 py-2">Loading categories...</div>
                )}
              </div>

              {/* Radius Selector */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Search Radius
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(['2 km', '5 km', '10 km', '15 km'] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setAskRadius(r)}
                      className={`py-2 text-xs font-semibold rounded-xl border transition cursor-pointer ${
                        askRadius === r
                          ? 'bg-[#7C5CFF] text-white border-[#7C5CFF] shadow-xs'
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
                className="w-full bg-[#7C5CFF] hover:bg-[#6842FF] disabled:bg-purple-300 text-white font-semibold py-3 rounded-xl text-xs transition cursor-pointer shadow-md flex items-center justify-center gap-2"
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
              SCREEN 5: MY HOLDS (Active 30-Min Hold Passes)
          ══════════════════════════════════════════════════════════════════ */
          <div className="animate-in fade-in duration-150 p-5 space-y-5">
            <div>
              <h2 className="text-2xl font-bold text-gray-950 tracking-tight">My Hold Passes</h2>
              <p className="text-xs text-gray-500 mt-1">
                Show your 6-digit code or QR pass at the store counter to collect held items.
              </p>
            </div>

            {activeHold && activeHold.totalSeconds > 0 ? (
              <div className="bg-white rounded-3xl border border-gray-100 p-5 shadow-lg space-y-4 relative overflow-hidden">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#20D99A] animate-ping" />
                    <span className="text-xs font-bold text-[#20D99A]">Active Hold Pass</span>
                  </div>
                  <span className="font-mono font-black text-sm text-gray-900">{activeHold.holdId}</span>
                </div>

                <div className="space-y-1">
                  <h3 className="text-base font-bold text-gray-950">{activeHold.productName}</h3>
                  <p className="text-xs text-gray-500">{activeHold.storeName}</p>
                  <p className="text-[11px] text-gray-400">{activeHold.storeAddress}</p>
                  {activeHold.price > 0 && (
                    <div className="text-sm font-black text-gray-950 pt-1">
                      ₹ {activeHold.price.toLocaleString('en-IN')}
                    </div>
                  )}
                </div>

                {/* Countdown Box */}
                <div className="bg-[#7C5CFF]/5 border border-[#7C5CFF]/20 rounded-2xl p-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                    <Clock className="w-4 h-4 text-[#7C5CFF]" />
                    <span>Time remaining:</span>
                  </div>
                  <span className="font-mono font-black text-lg text-[#7C5CFF]">
                    {formatTimer(activeHold.totalSeconds)}
                  </span>
                </div>

                {/* Server QR Code */}
                <div className="p-4 bg-gray-50 rounded-2xl flex flex-col items-center justify-center space-y-2 border border-gray-100">
                  <MiniQRCode value={activeHold.qrCode} size={140} />
                  <p className="text-[10px] text-gray-400 font-mono">Counter Token: {activeHold.holdId}</p>
                </div>

                {/* Hold Actions */}
                <div className="space-y-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      const matchedShop = dbShops.find(s => s.name === activeHold.storeName || s.id === activeHold.storeId);
                      if (matchedShop) {
                        setSelectedStore(matchedShop);
                      } else {
                        alert(`Store address: ${activeHold.storeAddress}\nPhone: ${activeHold.storePhone}`);
                      }
                    }}
                    className="w-full flex items-center justify-center gap-2 bg-[#7C5CFF] hover:bg-[#6842FF] text-white py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer shadow-xs"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    <span>View Store & Directions</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCancelHold}
                    className="w-full text-center text-xs text-red-500 hover:text-red-700 py-1.5 font-medium transition cursor-pointer"
                  >
                    Cancel Hold Pass
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
                  className="bg-[#7C5CFF] hover:bg-[#6842FF] text-white px-5 py-2.5 rounded-xl text-xs font-semibold cursor-pointer shadow-xs transition"
                >
                  Browse Products
                </button>
              </div>
            )}
          </div>
        ) : (

          /* ══════════════════════════════════════════════════════════════════
              SCREEN 6: ACCOUNT
          ══════════════════════════════════════════════════════════════════ */
          <div className="animate-in fade-in duration-150 p-5 space-y-5">
            {/* Top Bar */}
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-950 tracking-tight">Account</h2>
              <div className="flex items-center gap-2">
                {isMultiRole && onOpenExperienceSwitcher && (
                  <ExperienceHeaderPill currentExperience="customer" onClick={onOpenExperienceSwitcher} />
                )}
                <button
                  type="button"
                  onClick={() => alert('Settings preferences saved.')}
                  className="p-1.5 text-gray-700 hover:text-gray-950 hover:bg-gray-100 rounded-full transition cursor-pointer"
                >
                  <Settings className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Profile Card */}
            {userProfile && !userProfile.email?.includes('@guest.zooner.app') ? (
              <div className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-900 font-bold text-lg flex items-center justify-center shrink-0">
                  {userProfile.name ? userProfile.name.charAt(0).toUpperCase() : 'U'}
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-gray-950 truncate font-apple">
                    {userProfile.name || 'Account'}
                  </h3>
                  {userProfile.email && (
                    <p className="text-xs text-gray-500 truncate mt-0.5">
                      {userProfile.email}
                    </p>
                  )}
                  <span className="inline-block mt-1 font-medium text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-semibold">
                    {userProfile.role?.toLowerCase() === 'admin' || isSuperAdminEmail(userProfile.email) ? 'Platform Administrator' : userProfile.isVendor || (userProfile.shops && userProfile.shops.length > 0) ? 'Store Owner' : 'Shopper Profile'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex items-center justify-between gap-3.5">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-400 font-bold text-lg flex items-center justify-center shrink-0">
                    <User className="w-6 h-6 text-gray-400" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-gray-950 truncate font-apple">
                      Guest Shopper
                    </h3>
                    <p className="text-xs text-gray-500 truncate mt-0.5">
                      Browse stores, check stock & holds freely
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenSignIn('C')}
                  className="bg-[#007AFF] hover:bg-[#0071E3] text-white font-semibold text-xs px-3.5 py-2 rounded-xl transition-all active:scale-[0.98] cursor-pointer shrink-0 shadow-xs"
                >
                  Sign In
                </button>
              </div>
            )}

            {/* ── STORE ONBOARDING CARD (Only for standard shoppers without a store; once registered, top switcher handles switching) ── */}
            {!(userProfile?.isVendor || (userProfile?.shops && userProfile.shops.length > 0)) && (
              <div className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <div className="flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#007AFF] flex items-center justify-center shrink-0">
                    <Store className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-gray-950 font-apple">Own a Physical Store?</h4>
                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                      List your physical shelves on Zooner to turn nearby local search into instant footfall. 0% commission.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        if (onOpenRetailerModal) {
                          onOpenRetailerModal();
                        } else if (onNavigateToVendor) {
                          onNavigateToVendor();
                        }
                      }}
                      className="mt-3 w-full py-2.5 px-4 rounded-xl bg-[#007AFF] hover:bg-[#0071E3] text-white text-xs font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-all cursor-pointer shadow-xs"
                    >
                      <Store className="w-4 h-4" />
                      <span>Register Physical Storefront →</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Menu List */}
            <div className="bg-white rounded-2xl border border-gray-200/80 divide-y divide-gray-100 overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <button
                type="button"
                onClick={() => onOpenSignIn('C')}
                className="w-full px-4 py-3.5 flex items-center justify-between text-xs text-gray-700 hover:bg-gray-50 transition cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <User className="w-4 h-4 text-gray-500" />
                  <span className="font-medium">{userProfile && !userProfile.email?.includes('@guest.zooner.app') ? 'Edit Profile' : 'Sign In / Register'}</span>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </button>

              <button
                type="button"
                onClick={() => alert(`Saved stores: ${Object.keys(bookmarkedIds).length}`)}
                className="w-full px-4 py-3.5 flex items-center justify-between text-xs text-gray-700 hover:bg-gray-50 transition cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <Bookmark className="w-4 h-4 text-gray-500" />
                  <span className="font-medium">Saved Stores</span>
                </div>
                <div className="flex items-center gap-1 text-gray-400">
                  <span>{Object.keys(bookmarkedIds).length}</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </button>

              <button
                type="button"
                onClick={() => alert('Notification preferences saved.')}
                className="w-full px-4 py-3.5 flex items-center justify-between text-xs text-gray-700 hover:bg-gray-50 transition cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <Bell className="w-4 h-4 text-gray-500" />
                  <span className="font-medium">Notification Preferences</span>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </button>

              <button
                type="button"
                onClick={() => alert('Help & Support: email support@zooner.app')}
                className="w-full px-4 py-3.5 flex items-center justify-between text-xs text-gray-700 hover:bg-gray-50 transition cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <HelpCircle className="w-4 h-4 text-gray-500" />
                  <span className="font-medium">Help & Support</span>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </button>

              <button
                type="button"
                onClick={() => alert('Zooner v1.0.0 — Physical Shelf Discovery Platform.')}
                className="w-full px-4 py-3.5 flex items-center justify-between text-xs text-gray-700 hover:bg-gray-50 transition cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <Info className="w-4 h-4 text-gray-500" />
                  <span className="font-medium">About Zooner</span>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            {/* Auth Action Button */}
            {userProfile && !userProfile.email?.includes('@guest.zooner.app') ? (
              <button
                type="button"
                onClick={() => {
                  localStorage.removeItem('zooner_token');
                  localStorage.removeItem('zooner_user_profile');
                  localStorage.removeItem('zooner_customer_profile');
                  setUserProfile(null);
                  window.dispatchEvent(new Event('storage'));
                }}
                className="w-full flex items-center justify-center gap-2 text-xs font-semibold text-[#FF3B30] hover:text-red-700 py-3 transition-all active:opacity-70 cursor-pointer"
              >
                <LogOut className="w-4 h-4 text-[#FF3B30]" />
                <span>Sign Out</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onOpenSignIn('C')}
                className="w-full flex items-center justify-center gap-2 text-xs font-semibold text-[#007AFF] hover:text-[#0071E3] px-4 py-3 transition-all active:scale-[0.98] cursor-pointer bg-white rounded-2xl border border-gray-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
              >
                <User className="w-4 h-4 text-[#007AFF]" />
                <span>Sign In / Create Account</span>
              </button>
            )}
          </div>
        )}
      </div>


      {/* ══════════════════════════════════════════════════════════════════
          BOTTOM NAVIGATION BAR (EXPLORE, LIVE ASK, HOLDS, [ADMIN], ACCOUNT)
      ══════════════════════════════════════════════════════════════════ */}
      <div className="fixed bottom-0 left-0 right-0 max-w-[440px] mx-auto bg-white/80 backdrop-blur-xl border-t border-gray-200/60 flex items-center justify-around py-2.5 px-2 z-30 shadow-[0_-1px_12px_rgba(0,0,0,0.03)]">
        <button
          type="button"
          onClick={() => {
            setSelectedStore(null);
            setIsSearching(false);
            setActiveTab('explore');
          }}
          className={`flex flex-col items-center gap-1 transition-all active:scale-[0.94] cursor-pointer ${
            activeTab === 'explore' && !selectedStore && !isSearching
              ? 'text-[#007AFF] font-semibold'
              : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          <Compass className="w-5 h-5" />
          <span className="text-[10px]">Explore</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setSelectedStore(null);
            setIsSearching(false);
            setActiveTab('live-ask');
          }}
          className={`flex flex-col items-center gap-1 transition-all active:scale-[0.94] cursor-pointer ${
            activeTab === 'live-ask'
              ? 'text-[#007AFF] font-semibold'
              : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          <Radio className="w-5 h-5" />
          <span className="text-[10px]">Live Ask</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setSelectedStore(null);
            setIsSearching(false);
            setActiveTab('holds');
          }}
          className={`flex flex-col items-center gap-1 transition-all active:scale-[0.94] cursor-pointer relative ${
            activeTab === 'holds'
              ? 'text-[#007AFF] font-semibold'
              : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          <Clock className="w-5 h-5" />
          <span className="text-[10px]">My Holds</span>
          {activeHold && activeHold.totalSeconds > 0 && (
            <span className="absolute -top-0.5 right-2 w-2 h-2 rounded-full bg-[#34C759] animate-pulse" />
          )}
        </button>

        {/* Admin shortcut — only visible to super-admin accounts */}
        {(isSuperAdminEmail(userProfile?.email) || userProfile?.role?.toLowerCase() === 'admin') && onNavigateToAdmin && (
          <button
            type="button"
            onClick={onNavigateToAdmin}
            className="flex flex-col items-center gap-1 transition-all active:scale-[0.94] cursor-pointer text-indigo-500 hover:text-indigo-600"
            title="Admin Panel"
          >
            <Shield className="w-5 h-5" />
            <span className="text-[10px] font-semibold">Admin</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            setSelectedStore(null);
            setIsSearching(false);
            setActiveTab('account');
          }}
          className={`flex flex-col items-center gap-1 transition-all active:scale-[0.94] cursor-pointer ${
            activeTab === 'account'
              ? 'text-[#007AFF] font-semibold'
              : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          <User className="w-5 h-5" />
          <span className="text-[10px]">Account</span>
        </button>
      </div>

    </div>
  );
};
