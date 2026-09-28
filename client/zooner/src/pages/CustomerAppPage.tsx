import React, { useState, useEffect, useMemo, useRef } from 'react';
import QRCode from 'qrcode';
import { 
  Search, 
  MapPin, 
  Clock, 
  X, 
  Compass, 
  User, 
  ChevronRight, 
  HelpCircle, 
  CheckCircle2, 
  Loader2, 
  Store, 
  MessageSquare, 
  Send, 
  Star, 
  Copy, 
  Check, 
  QrCode, 
  Phone, 
  SlidersHorizontal 
} from 'lucide-react';
import { 
  fetchCategories, 
  fetchShops, 
  searchProducts, 
  reserveInventoryHold, 
  releaseInventoryHold, 
  syncUserProfile, 
  ensureCustomerSession,
  type ShopProfileDto 
} from '../services/api';
import { ExperienceHeaderPill } from '../components/ExperienceSwitcher';
import type { LocationArea, ProductSearchResult, CategoryDto } from '../types';

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

export type CustomerTab = 'home' | 'search' | 'holds' | 'chat' | 'profile';

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
  image?: string;
}

interface ChatMessage {
  id: string;
  sender: 'store' | 'customer';
  text: string;
  time: string;
}

// Fallback Mock Data for realistic instant experience in Coimbatore
const MOCK_CATEGORIES = [
  { id: 'cat-elect', name: 'Electronics', icon: '⚡', slug: 'electronics' },
  { id: 'cat-fash', name: 'Fashion', icon: '👗', slug: 'fashion' },
  { id: 'cat-home', name: 'Home', icon: '🛋️', slug: 'home' },
  { id: 'cat-beauty', name: 'Beauty', icon: '💄', slug: 'beauty' },
  { id: 'cat-groc', name: 'Groceries', icon: '🍎', slug: 'groceries' },
  { id: 'cat-sports', name: 'Sports', icon: '👟', slug: 'sports' }
];

const MOCK_NEARBY_STORES: ShopProfileDto[] = [
  {
    id: 'store-techworld',
    name: 'TechWorld Coimbatore',
    address: '104, DB Road, RS Puram, Coimbatore',
    phone: '+91 98430 11223',
    latitude: 11.0168,
    longitude: 76.9558,
    isOpen: true,
    categoryName: 'Electronics & Gadgets',
    isVerified: true,
    isLiveEnabled: true,
    distanceKm: 0.5
  },
  {
    id: 'store-stylehub',
    name: 'StyleHub Premier',
    address: '45, Cross Cut Road, Gandhipuram, Coimbatore',
    phone: '+91 98432 99887',
    latitude: 11.0188,
    longitude: 76.9658,
    isOpen: true,
    categoryName: 'Fashion & Footwear',
    isVerified: true,
    isLiveEnabled: true,
    distanceKm: 1.2
  },
  {
    id: 'store-urbanliving',
    name: 'Urban Living Home',
    address: '88, Avinashi Road, Peelamedu, Coimbatore',
    phone: '+91 98421 55443',
    latitude: 11.0258,
    longitude: 76.9858,
    isOpen: true,
    categoryName: 'Home & Living',
    isVerified: true,
    isLiveEnabled: true,
    distanceKm: 2.0
  },
  {
    id: 'store-glowstudio',
    name: 'Glow Studio Beauty',
    address: '12, Race Course Road, Coimbatore',
    phone: '+91 97890 33221',
    latitude: 11.0128,
    longitude: 76.9758,
    isOpen: true,
    categoryName: 'Beauty & Cosmetics',
    isVerified: true,
    isLiveEnabled: true,
    distanceKm: 0.8
  }
];

const MOCK_PRODUCTS: ProductSearchResult[] = [
  {
    id: 'prod-iphone15',
    name: 'Apple iPhone 15 128GB Black',
    brandName: 'Apple',
    categoryName: 'Electronics',
    lowestPrice: 79500,
    minPrice: 79500,
    maxPrice: 79500,
    imageUrl: 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?auto=format&fit=crop&w=600&q=80',
    description: 'Dynamic Island, 48MP main camera, USB-C, Super Retina XDR display, A16 Bionic chip.',
    totalAvailableQuantity: 3,
    carryingStores: [
      {
        inventoryId: 'inv-ip15',
        storeId: 'store-techworld',
        storeName: 'TechWorld Coimbatore',
        storeAddress: 'DB Road, RS Puram, Coimbatore',
        storePhone: '+91 98430 11223',
        price: 79500,
        quantity: 3,
        availableQuantity: 3,
        distanceKm: 0.5,
        isStoreOpen: true,
        variantId: 'v-ip15',
        variantName: '128GB Black',
        updatedAtUtc: new Date().toISOString()
      }
    ]
  },
  {
    id: 'prod-airpodspro',
    name: 'Apple AirPods Pro (2nd Gen)',
    brandName: 'Apple',
    categoryName: 'Electronics',
    lowestPrice: 24900,
    minPrice: 24900,
    maxPrice: 24900,
    imageUrl: 'https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?auto=format&fit=crop&w=600&q=80',
    description: 'Active Noise Cancellation with Adaptive Audio, Transparency mode, MagSafe Case (USB-C).',
    totalAvailableQuantity: 5,
    carryingStores: [
      {
        inventoryId: 'inv-app',
        storeId: 'store-techworld',
        storeName: 'TechWorld Coimbatore',
        storeAddress: 'DB Road, RS Puram, Coimbatore',
        storePhone: '+91 98430 11223',
        price: 24900,
        quantity: 5,
        availableQuantity: 5,
        distanceKm: 0.5,
        isStoreOpen: true,
        variantId: 'v-app',
        variantName: 'White',
        updatedAtUtc: new Date().toISOString()
      }
    ]
  },
  {
    id: 'prod-macbookair',
    name: 'MacBook Air 13" M2 Chip (256GB)',
    brandName: 'Apple',
    categoryName: 'Electronics',
    lowestPrice: 99900,
    minPrice: 99900,
    maxPrice: 99900,
    imageUrl: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=600&q=80',
    description: 'Strikingly thin design, 13.6-inch Liquid Retina display, 18-hour battery life, 8GB unified memory.',
    totalAvailableQuantity: 2,
    carryingStores: [
      {
        inventoryId: 'inv-mba',
        storeId: 'store-techworld',
        storeName: 'TechWorld Coimbatore',
        storeAddress: 'DB Road, RS Puram, Coimbatore',
        storePhone: '+91 98430 11223',
        price: 99900,
        quantity: 2,
        availableQuantity: 2,
        distanceKm: 0.5,
        isStoreOpen: true,
        variantId: 'v-mba',
        variantName: 'Midnight 256GB',
        updatedAtUtc: new Date().toISOString()
      }
    ]
  },
  {
    id: 'prod-watch9',
    name: 'Apple Watch Series 9 GPS 45mm',
    brandName: 'Apple',
    categoryName: 'Electronics',
    lowestPrice: 41900,
    minPrice: 41900,
    maxPrice: 41900,
    imageUrl: 'https://images.unsplash.com/photo-1546868871-7041f2a55e12?auto=format&fit=crop&w=600&q=80',
    description: 'S9 SiP chip, Double tap gesture, brighter Always-On display, ECG and Blood Oxygen tracking.',
    totalAvailableQuantity: 4,
    carryingStores: [
      {
        inventoryId: 'inv-aw9',
        storeId: 'store-techworld',
        storeName: 'TechWorld Coimbatore',
        storeAddress: 'DB Road, RS Puram, Coimbatore',
        storePhone: '+91 98430 11223',
        price: 41900,
        quantity: 4,
        availableQuantity: 4,
        distanceKm: 0.5,
        isStoreOpen: true,
        variantId: 'v-aw9',
        variantName: 'Midnight Aluminum',
        updatedAtUtc: new Date().toISOString()
      }
    ]
  },
  {
    id: 'prod-sonyxm5',
    name: 'Sony WH-1000XM5 Wireless Headphones',
    brandName: 'Sony',
    categoryName: 'Electronics',
    lowestPrice: 26990,
    minPrice: 26990,
    maxPrice: 26990,
    imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80',
    description: 'Industry-leading noise cancellation with two processors and 8 microphones, 30-hour battery life.',
    totalAvailableQuantity: 3,
    carryingStores: [
      {
        inventoryId: 'inv-sony5',
        storeId: 'store-techworld',
        storeName: 'TechWorld Coimbatore',
        storeAddress: 'DB Road, RS Puram, Coimbatore',
        storePhone: '+91 98430 11223',
        price: 26990,
        quantity: 3,
        availableQuantity: 3,
        distanceKm: 0.5,
        isStoreOpen: true,
        variantId: 'v-xm5',
        variantName: 'Black',
        updatedAtUtc: new Date().toISOString()
      }
    ]
  },
  {
    id: 'prod-airmax',
    name: 'Nike Air Max 270 Sneakers',
    brandName: 'Nike',
    categoryName: 'Fashion',
    lowestPrice: 12995,
    minPrice: 12995,
    maxPrice: 12995,
    imageUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=600&q=80',
    description: 'Max Air 270 unit delivers unrivaled, all-day comfort with sleek, running-inspired design.',
    totalAvailableQuantity: 6,
    carryingStores: [
      {
        inventoryId: 'inv-am270',
        storeId: 'store-stylehub',
        storeName: 'StyleHub Premier',
        storeAddress: 'Cross Cut Road, Gandhipuram',
        storePhone: '+91 98432 99887',
        price: 12995,
        quantity: 6,
        availableQuantity: 6,
        distanceKm: 1.2,
        isStoreOpen: true,
        variantId: 'v-am270',
        variantName: 'Red/Black UK 9',
        updatedAtUtc: new Date().toISOString()
      }
    ]
  }
];

// Standard-Compliant QR Code Generator Component
const StandardQRCode: React.FC<{ value: string; size?: number; className?: string }> = ({
  value,
  size = 150,
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
            dark: '#0f172a',
            light: '#ffffff'
          }
        },
        (err) => {
          if (err) console.error('Error generating QR code:', err);
        }
      );
    }
  }, [value, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className={`rounded-xl shadow-sm ${className}`}
    />
  );
};

export const CustomerAppPage: React.FC<CustomerAppPageProps> = ({
  currentLocation,
  onOpenLocationModal,
  onNavigateToHome: _onNavigateToHome,
  onNavigateToVendor: _onNavigateToVendor,
  onNavigateToAdmin: _onNavigateToAdmin,
  onOpenSignIn,
  onOpenRetailerModal: _onOpenRetailerModal,
  onOpenExperienceSwitcher,
  isMultiRole: _isMultiRole,
}) => {
  // Navigation State
  const [activeTab, setActiveTab] = useState<CustomerTab>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [filterNearbyOnly, setFilterNearbyOnly] = useState(false);
  const [filterInStockOnly, setFilterInStockOnly] = useState(false);
  const [sortOrder, setSortOrder] = useState<'default' | 'price-asc' | 'price-desc'>('default');

  // Modals & Sub-Screens
  const [selectedProduct, setSelectedProduct] = useState<ProductSearchResult | null>(null);
  const [selectedStore, setSelectedStore] = useState<ShopProfileDto | null>(null);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Active Hold State
  const [activeHold, setActiveHold] = useState<ActiveHold | null>(() => {
    const saved = localStorage.getItem('zooner_active_primary_hold');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return {
      id: 'h-demo-1',
      holdId: 'H-7K3M9',
      productName: 'Apple iPhone 15 128GB Black',
      storeName: 'TechWorld Coimbatore',
      storeAddress: '104, DB Road, RS Puram, Coimbatore',
      storePhone: '+91 98430 11223',
      price: 79500,
      status: 'active',
      reservedUntil: '30 min window',
      totalSeconds: 1785, // 29m 45s
      qrCode: 'zooner:hold:h-demo-1:H-7K3M9',
      image: 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?auto=format&fit=crop&w=600&q=80'
    };
  });

  const [holdHistory] = useState<Array<{ id: string; holdId: string; productName: string; storeName: string; price: number; date: string; status: 'completed' | 'expired' }>>([
    { id: 'h-hist-1', holdId: 'H-4B2N8', productName: 'Apple AirPods Pro 2', storeName: 'TechWorld Coimbatore', price: 24900, date: 'Yesterday, 4:15 PM', status: 'completed' },
    { id: 'h-hist-2', holdId: 'H-9X1P4', productName: 'Nike Air Max 270', storeName: 'StyleHub Premier', price: 12995, date: '25 Sep 2026', status: 'completed' },
    { id: 'h-hist-3', holdId: 'H-3M7Q2', productName: 'Sony WH-1000XM5', storeName: 'TechWorld Coimbatore', price: 26990, date: '18 Sep 2026', status: 'expired' }
  ]);

  const [holdsSubTab, setHoldsSubTab] = useState<'active' | 'history'>('active');

  // Chat Messages State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { id: 'm1', sender: 'store', text: 'Hello! Thanks for reserving the iPhone 15 at TechWorld RS Puram.', time: '2:30 PM' },
    { id: 'm2', sender: 'store', text: 'Your 30-minute hold pass (H-7K3M9) is confirmed on shelf Counter 2.', time: '2:30 PM' },
    { id: 'm3', sender: 'customer', text: 'Hi! Can I come pick it up in about 15 minutes?', time: '2:32 PM' },
    { id: 'm4', sender: 'store', text: 'Yes, absolutely! Just show your QR code to our staff when you arrive.', time: '2:33 PM' }
  ]);
  const [chatInput, setChatInput] = useState('');

  // API Data
  const [dbCategories, setDbCategories] = useState<CategoryDto[]>([]);
  const [dbProducts, setDbProducts] = useState<ProductSearchResult[]>([]);
  const [dbShops, setDbShops] = useState<ShopProfileDto[]>([]);
  const [isReserving, setIsReserving] = useState(false);

  // User Profile
  const [userProfile, setUserProfile] = useState<any>(() => {
    try {
      const stored = localStorage.getItem('zooner_user_profile');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  // 300ms Search Debounce
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load Real Categories & Stores from API
  useEffect(() => {
    fetchCategories().then(cats => {
      if (cats && cats.length > 0) setDbCategories(cats);
    }).catch(() => {});

    fetchShops(currentLocation.lat, currentLocation.lng, 10).then(shops => {
      if (shops && shops.length > 0) setDbShops(shops);
    }).catch(() => {});

    searchProducts('', undefined, currentLocation.lat, currentLocation.lng, 10).then(prods => {
      if (prods && prods.length > 0) setDbProducts(prods);
    }).catch(() => {});

    syncUserProfile().then(p => {
      if (p) setUserProfile(p);
      else if (!localStorage.getItem('zooner_token')) {
        ensureCustomerSession().catch(() => {});
      }
    });
  }, [currentLocation]);

  // Active Hold Countdown Timer
  useEffect(() => {
    if (!activeHold || activeHold.totalSeconds <= 0 || activeHold.status !== 'active') return;
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

  // Unified Product List (Backend merged with Mock fallbacks)
  const displayProducts = useMemo(() => {
    const base = dbProducts.length > 0 ? dbProducts : MOCK_PRODUCTS;
    return base.filter(p => {
      const pDist = p.carryingStores?.[0]?.distanceKm ?? 0.5;
      const pStock = p.totalAvailableQuantity ?? p.carryingStores?.[0]?.availableQuantity ?? 3;

      if (debouncedQuery) {
        const matchName = p.name.toLowerCase().includes(debouncedQuery.toLowerCase());
        const matchBrand = p.brandName?.toLowerCase().includes(debouncedQuery.toLowerCase());
        const matchCat = p.categoryName?.toLowerCase().includes(debouncedQuery.toLowerCase());
        if (!matchName && !matchBrand && !matchCat) return false;
      }
      if (selectedCategory !== 'all') {
        const matchCat = p.categoryName?.toLowerCase() === selectedCategory.toLowerCase() ||
          p.categoryName?.toLowerCase().includes(selectedCategory.toLowerCase());
        if (!matchCat) return false;
      }
      if (filterNearbyOnly && pDist > 2) return false;
      if (filterInStockOnly && pStock <= 0) return false;
      return true;
    }).sort((a, b) => {
      const priceA = a.lowestPrice ?? a.minPrice ?? 0;
      const priceB = b.lowestPrice ?? b.minPrice ?? 0;
      if (sortOrder === 'price-asc') return priceA - priceB;
      if (sortOrder === 'price-desc') return priceB - priceA;
      return 0;
    });
  }, [dbProducts, debouncedQuery, selectedCategory, filterNearbyOnly, filterInStockOnly, sortOrder]);

  const displayShops = useMemo(() => {
    return dbShops.length > 0 ? dbShops : MOCK_NEARBY_STORES;
  }, [dbShops]);

  // Format Timer
  const formatTimer = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Reserve Hold Handler
  const handleReserve = async (prod: ProductSearchResult) => {
    setIsReserving(true);
    const store = prod.carryingStores && prod.carryingStores.length > 0 ? prod.carryingStores[0] : null;
    const prodPrice = prod.lowestPrice ?? prod.minPrice ?? store?.price ?? 79500;

    try {
      if (store?.storeId && store?.inventoryId) {
        const res = await reserveInventoryHold(store.storeId, store.inventoryId, 1);
        if (res.success && res.hold) {
          const expiresTime = new Date(res.hold.expiresAtUtc).getTime();
          const remainingSec = Math.max(0, Math.floor((expiresTime - Date.now()) / 1000));
          const newHold: ActiveHold = {
            id: res.hold.holdId,
            holdId: res.hold.holdCode || 'H-7K3M9',
            storeId: res.hold.storeId || store.storeId,
            storeInventoryId: res.hold.storeInventoryId || store.inventoryId,
            productName: res.hold.productName || prod.name,
            storeName: res.hold.storeName || store.storeName,
            storeAddress: res.hold.storeAddress || store.storeAddress || 'DB Road, RS Puram, Coimbatore',
            storePhone: res.hold.storePhone || store.storePhone || '+91 98430 11223',
            price: res.hold.price || prodPrice,
            status: 'active',
            reservedUntil: '30 min window',
            totalSeconds: remainingSec || 1800,
            qrCode: res.hold.qrToken || `zooner:hold:${res.hold.holdId}:${res.hold.holdCode}`,
            image: prod.imageUrl
          };
          setActiveHold(newHold);
          localStorage.setItem('zooner_active_primary_hold', JSON.stringify(newHold));
          setIsSuccessModalOpen(true);
          setSelectedProduct(null);
          setIsReserving(false);
          return;
        }
      }

      // Demo instant hold fallback
      const generatedCode = `H-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
      const mockHold: ActiveHold = {
        id: `hold-${Date.now()}`,
        holdId: generatedCode,
        productName: prod.name,
        storeName: store?.storeName || 'TechWorld Coimbatore',
        storeAddress: store?.storeAddress || '104, DB Road, RS Puram, Coimbatore',
        storePhone: store?.storePhone || '+91 98430 11223',
        price: prodPrice,
        status: 'active',
        reservedUntil: '30 min window',
        totalSeconds: 1800,
        qrCode: `zooner:hold:demo:${generatedCode}`,
        image: prod.imageUrl
      };
      setActiveHold(mockHold);
      localStorage.setItem('zooner_active_primary_hold', JSON.stringify(mockHold));
      setIsSuccessModalOpen(true);
      setSelectedProduct(null);
    } catch {
      const generatedCode = `H-7K3M9`;
      const mockHold: ActiveHold = {
        id: `hold-${Date.now()}`,
        holdId: generatedCode,
        productName: prod.name,
        storeName: 'TechWorld Coimbatore',
        storeAddress: '104, DB Road, RS Puram, Coimbatore',
        storePhone: '+91 98430 11223',
        price: prodPrice,
        status: 'active',
        reservedUntil: '30 min window',
        totalSeconds: 1800,
        qrCode: `zooner:hold:demo:${generatedCode}`,
        image: prod.imageUrl
      };
      setActiveHold(mockHold);
      localStorage.setItem('zooner_active_primary_hold', JSON.stringify(mockHold));
      setIsSuccessModalOpen(true);
      setSelectedProduct(null);
    } finally {
      setIsReserving(false);
    }
  };

  const handleCancelHold = async () => {
    if (!activeHold) return;
    if (activeHold.storeId && activeHold.storeInventoryId && activeHold.id) {
      try {
        await releaseInventoryHold(activeHold.storeId, activeHold.storeInventoryId, activeHold.id);
      } catch {}
    }
    setActiveHold(null);
    localStorage.removeItem('zooner_active_primary_hold');
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMsg: ChatMessage = {
      id: `m-${Date.now()}`,
      sender: 'customer',
      text: chatInput.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');

    // Auto store reply after 1.2s
    setTimeout(() => {
      const storeReply: ChatMessage = {
        id: `m-rep-${Date.now()}`,
        sender: 'store',
        text: 'Thanks for reaching out! Our store executive is ready at Counter 2 with your reserved item.',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setChatMessages(prev => [...prev, storeReply]);
    }, 1200);
  };

  return (
    <div className="flex-1 flex flex-col bg-[#F8FAFC] text-slate-900 font-sans pb-20 select-none min-h-screen">
      
      {/* ── TOP HEADER ── */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 py-3 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-[#315bd4] to-[#7C5CFF] text-white flex items-center justify-center font-black text-lg shadow-sm">
            z
          </div>
          <div>
            <div className="flex items-center gap-1 cursor-pointer" onClick={onOpenLocationModal}>
              <span className="text-xs font-bold text-slate-900">{currentLocation.name || 'Coimbatore'}</span>
              <MapPin className="w-3 h-3 text-[#7C5CFF]" />
            </div>
            <p className="text-[10px] text-emerald-600 font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              18 Verified Stores Nearby
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onOpenExperienceSwitcher && (
            <ExperienceHeaderPill
              currentExperience="customer"
              onClick={onOpenExperienceSwitcher}
            />
          )}

          <button
            type="button"
            onClick={() => setIsOnboardingOpen(true)}
            className="p-2 rounded-full hover:bg-slate-100 text-slate-600 transition cursor-pointer"
            title="How it works"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 text-xs font-bold hover:border-[#7C5CFF] transition cursor-pointer"
          >
            {userProfile?.name ? userProfile.name.charAt(0).toUpperCase() : 'U'}
          </button>
        </div>
      </header>

      {/* ── MAIN CONTENT ACCORDING TO ACTIVE TAB ── */}
      <main className="flex-1 flex flex-col">

        {/* ══════════════════════════════════════════════════════════════════
            TAB 1: HOME FEED (Search, Categories, Nearby Stores, Popular)
        ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'home' && (
          <div className="space-y-5 p-4 animate-in fade-in duration-200">
            {/* Search Bar Trigger */}
            <div 
              onClick={() => setActiveTab('search')}
              className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-3.5 flex items-center gap-3 shadow-xs cursor-pointer hover:border-[#7C5CFF] transition"
            >
              <Search className="w-4 h-4 text-[#7C5CFF]" />
              <span className="text-xs text-slate-400 font-medium">Search iPhone 15, sneakers, Sony headphones...</span>
            </div>

            {/* Active Hold Banner if present */}
            {activeHold && activeHold.totalSeconds > 0 && activeHold.status === 'active' && (
              <div 
                onClick={() => setActiveTab('holds')}
                className="bg-gradient-to-r from-emerald-950 via-slate-900 to-slate-950 text-white rounded-2xl p-4 border border-emerald-500/40 shadow-lg cursor-pointer flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    <Clock className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-400">Active Hold Pass</span>
                      <span className="text-[10px] font-mono bg-emerald-900/80 px-1.5 py-0.2 rounded text-emerald-200">{activeHold.holdId}</span>
                    </div>
                    <p className="text-xs font-bold text-white truncate max-w-[200px] mt-0.5">{activeHold.productName}</p>
                    <p className="text-[10px] text-slate-400">{activeHold.storeName}</p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-sm font-black font-mono text-emerald-400 tabular-nums">
                    {formatTimer(activeHold.totalSeconds)}
                  </span>
                  <span className="block text-[9px] text-slate-400">remaining</span>
                </div>
              </div>
            )}

            {/* Category Circles (Screen 4) */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="text-xs font-bold text-slate-900 tracking-wide uppercase">Categories</h3>
                <span className="text-[11px] text-[#7C5CFF] font-semibold cursor-pointer" onClick={() => setActiveTab('search')}>View all</span>
              </div>
              <div className="grid grid-cols-6 gap-2">
                {(dbCategories.length > 0 ? dbCategories.slice(0, 6) : MOCK_CATEGORIES).map((cat) => {
                  const isSelected = selectedCategory.toLowerCase() === (cat.slug || cat.name).toLowerCase();
                  return (
                    <button
                      key={cat.id}
                      onClick={() => {
                        setSelectedCategory(isSelected ? 'all' : (cat.slug || cat.name).toLowerCase());
                        setActiveTab('search');
                      }}
                      className="flex flex-col items-center gap-1.5 group cursor-pointer"
                    >
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-lg transition-all shadow-xs ${
                        isSelected 
                          ? 'bg-[#7C5CFF] text-white scale-105 shadow-md shadow-[#7C5CFF]/30' 
                          : 'bg-white border border-slate-200 text-slate-700 group-hover:border-[#7C5CFF]'
                      }`}>
                        {(cat as any).icon || '📦'}
                      </div>
                      <span className="text-[10px] font-semibold text-slate-600 truncate w-full text-center">
                        {cat.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Nearby Verified Stores Carousel */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="text-xs font-bold text-slate-900 tracking-wide uppercase">Nearby Verified Stores</h3>
                <span className="text-[10px] text-slate-400">{displayShops.length} stores near you</span>
              </div>

              <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
                {displayShops.map((shop) => (
                  <div
                    key={shop.id}
                    onClick={() => setSelectedStore(shop)}
                    className="min-w-[210px] bg-white border border-slate-200/90 rounded-2xl p-3 shadow-xs hover:border-[#7C5CFF] transition cursor-pointer shrink-0"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#7C5CFF] flex items-center justify-center font-bold text-xs">
                        <Store className="w-4 h-4" />
                      </div>
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                        Open
                      </span>
                    </div>

                    <h4 className="text-xs font-bold text-slate-900 mt-2 truncate">{shop.name}</h4>
                    <p className="text-[10px] text-slate-500 truncate mt-0.5">{shop.address}</p>

                    <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px]">
                      <span className="text-slate-600 font-medium">{shop.distanceKm ? `${shop.distanceKm} km` : '0.5 km'}</span>
                      <span className="text-[#7C5CFF] font-bold">View Shelf →</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Popular Near You / Shelf Stock Grid */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Popular Near You</h3>
                  <p className="text-[10px] text-slate-500">Live verified inventory ready for 30-min pickup</p>
                </div>
                <button 
                  onClick={() => setActiveTab('search')}
                  className="text-xs font-bold text-[#7C5CFF] hover:underline"
                >
                  See All
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {displayProducts.slice(0, 6).map((product) => {
                  const itemPrice = product.lowestPrice ?? product.minPrice ?? 0;
                  const itemStock = product.totalAvailableQuantity ?? product.carryingStores?.[0]?.availableQuantity ?? 3;
                  const itemDist = product.carryingStores?.[0]?.distanceKm ?? 0.5;

                  return (
                    <div
                      key={product.id}
                      className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs hover:shadow-md transition flex flex-col"
                    >
                      <div 
                        onClick={() => setSelectedProduct(product)}
                        className="relative h-32 w-full bg-slate-100 overflow-hidden cursor-pointer group"
                      >
                        <img
                          src={product.imageUrl || 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=600&q=80'}
                          alt={product.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        />
                        <div className="absolute top-2 left-2 bg-emerald-950/80 backdrop-blur-md text-emerald-400 text-[9px] font-bold px-2 py-0.5 rounded-full border border-emerald-700/50 flex items-center gap-1">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          {itemStock} in stock
                        </div>
                        <div className="absolute bottom-2 right-2 bg-black/70 backdrop-blur-md text-white text-[9px] font-semibold px-2 py-0.5 rounded-full">
                          {itemDist} km
                        </div>
                      </div>

                      <div className="p-3 flex-1 flex flex-col justify-between">
                        <div>
                          <span className="text-[9px] font-bold uppercase tracking-wider text-[#7C5CFF]">{product.brandName || 'Verified'}</span>
                          <h4 
                            onClick={() => setSelectedProduct(product)}
                            className="text-xs font-bold text-slate-900 line-clamp-2 mt-0.5 cursor-pointer hover:text-[#7C5CFF]"
                          >
                            {product.name}
                          </h4>
                          <p className="text-[10px] text-slate-400 mt-1 truncate">
                            {product.carryingStores?.[0]?.storeName || 'TechWorld Coimbatore'}
                          </p>
                        </div>

                        <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                          <span className="text-xs font-black text-slate-900">
                            ₹{itemPrice.toLocaleString('en-IN')}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleReserve(product)}
                            disabled={isReserving}
                            className="bg-[#7C5CFF] hover:bg-[#6846ed] text-white text-[10px] font-bold px-2.5 py-1.5 rounded-xl transition active:scale-95 cursor-pointer shadow-xs"
                          >
                            Hold 30m
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            TAB 2: SEARCH & FILTER (Screen 5)
        ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'search' && (
          <div className="p-4 space-y-4 animate-in fade-in duration-200">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products, brands, or nearby stores..."
                autoFocus
                className="w-full bg-white border border-slate-200 rounded-2xl pl-10 pr-10 py-3 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#7C5CFF] focus:ring-1 focus:ring-[#7C5CFF] shadow-xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Filter Pills */}
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 text-xs">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-3 py-1.5 rounded-full font-medium whitespace-nowrap cursor-pointer transition ${
                  selectedCategory === 'all'
                    ? 'bg-slate-900 text-white font-bold'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                All Items
              </button>
              <button
                onClick={() => setFilterNearbyOnly(!filterNearbyOnly)}
                className={`px-3 py-1.5 rounded-full font-medium whitespace-nowrap cursor-pointer transition flex items-center gap-1 ${
                  filterNearbyOnly
                    ? 'bg-[#7C5CFF] text-white font-bold'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <MapPin className="w-3 h-3" />
                Nearby &lt; 2 km
              </button>
              <button
                onClick={() => setFilterInStockOnly(!filterInStockOnly)}
                className={`px-3 py-1.5 rounded-full font-medium whitespace-nowrap cursor-pointer transition flex items-center gap-1 ${
                  filterInStockOnly
                    ? 'bg-emerald-600 text-white font-bold'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <CheckCircle2 className="w-3 h-3" />
                In Stock Only
              </button>
              <button
                onClick={() => setSortOrder(sortOrder === 'price-asc' ? 'price-desc' : 'price-asc')}
                className={`px-3 py-1.5 rounded-full font-medium whitespace-nowrap cursor-pointer transition flex items-center gap-1 ${
                  sortOrder !== 'default'
                    ? 'bg-indigo-600 text-white font-bold'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <SlidersHorizontal className="w-3 h-3" />
                {sortOrder === 'price-asc' ? 'Price: Low to High' : sortOrder === 'price-desc' ? 'Price: High to Low' : 'Sort by Price'}
              </button>
            </div>

            {/* Results Count */}
            <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
              <span>Found {displayProducts.length} verified items</span>
              <span>Showing stores in Coimbatore</span>
            </div>

            {/* Product List */}
            <div className="space-y-3">
              {displayProducts.map((product) => {
                const itemPrice = product.lowestPrice ?? product.minPrice ?? 0;
                const itemStock = product.totalAvailableQuantity ?? product.carryingStores?.[0]?.availableQuantity ?? 3;
                const itemDist = product.carryingStores?.[0]?.distanceKm ?? 0.5;

                return (
                  <div
                    key={product.id}
                    className="bg-white border border-slate-200 rounded-2xl p-3 shadow-xs hover:border-[#7C5CFF] transition flex gap-3.5"
                  >
                    <img
                      src={product.imageUrl || 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=600&q=80'}
                      alt={product.name}
                      onClick={() => setSelectedProduct(product)}
                      className="w-24 h-24 rounded-xl object-cover bg-slate-100 cursor-pointer shrink-0"
                    />

                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[10px] font-bold text-[#7C5CFF]">{product.brandName || 'Verified'}</span>
                          <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                            {itemStock} left
                          </span>
                        </div>
                        <h4 
                          onClick={() => setSelectedProduct(product)}
                          className="text-xs font-bold text-slate-900 line-clamp-1 mt-0.5 cursor-pointer hover:text-[#7C5CFF]"
                        >
                          {product.name}
                        </h4>
                        <p className="text-[10px] text-slate-500 mt-0.5 truncate">
                          {product.carryingStores?.[0]?.storeName || 'TechWorld Coimbatore'} • {itemDist} km
                        </p>
                      </div>

                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                        <span className="text-xs font-black text-slate-900">
                          ₹{itemPrice.toLocaleString('en-IN')}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedProduct(product)}
                            className="text-[10px] font-bold text-slate-600 hover:text-slate-900 px-2 py-1"
                          >
                            Details
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReserve(product)}
                            className="bg-[#7C5CFF] hover:bg-[#6846ed] text-white text-[10px] font-bold px-3 py-1.5 rounded-xl transition cursor-pointer shadow-xs"
                          >
                            Hold (30m)
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            TAB 3: MY HOLDS (Active Hold & History - Screen 8)
        ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'holds' && (
          <div className="p-4 space-y-4 animate-in fade-in duration-200">
            {/* Sub-tab pills */}
            <div className="bg-slate-200/80 p-1 rounded-2xl flex items-center text-xs font-bold">
              <button
                type="button"
                onClick={() => setHoldsSubTab('active')}
                className={`flex-1 py-2 rounded-xl transition cursor-pointer text-center ${
                  holdsSubTab === 'active' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Active Hold {activeHold && activeHold.totalSeconds > 0 ? '(1)' : '(0)'}
              </button>
              <button
                type="button"
                onClick={() => setHoldsSubTab('history')}
                className={`flex-1 py-2 rounded-xl transition cursor-pointer text-center ${
                  holdsSubTab === 'history' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Hold History ({holdHistory.length})
              </button>
            </div>

            {holdsSubTab === 'active' ? (
              activeHold && activeHold.totalSeconds > 0 ? (
                <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                        ● Reserved on Shelf
                      </span>
                      <h3 className="text-base font-black text-slate-900 mt-2 font-['Outfit']">{activeHold.productName}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">{activeHold.storeName}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-slate-400 block font-medium">Hold Price</span>
                      <span className="text-sm font-black text-slate-900">₹{activeHold.price.toLocaleString('en-IN')}</span>
                    </div>
                  </div>

                  {/* 30-min live countdown display */}
                  <div className="bg-slate-950 text-white rounded-2xl p-4 flex items-center justify-between shadow-inner">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                        <Clock className="w-5 h-5 animate-pulse" />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-bold">Time to Collect</span>
                        <div className="text-xl font-black font-mono text-emerald-400 tracking-wider tabular-nums">
                          {formatTimer(activeHold.totalSeconds)}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 block">Hold Code</span>
                      <div className="text-sm font-bold font-mono text-white bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                        {activeHold.holdId}
                      </div>
                    </div>
                  </div>

                  {/* Store Contact & Location */}
                  <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 space-y-2 text-xs">
                    <div className="flex items-start gap-2 text-slate-700">
                      <MapPin className="w-4 h-4 text-[#7C5CFF] shrink-0 mt-0.5" />
                      <span>{activeHold.storeAddress}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-700">
                      <Phone className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>{activeHold.storePhone}</span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setIsQrModalOpen(true)}
                      className="w-full bg-[#7C5CFF] hover:bg-[#6846ed] text-white py-3 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-[#7C5CFF]/20 active:scale-98 transition cursor-pointer"
                    >
                      <QrCode className="w-4 h-4" />
                      <span>Show QR Code to Cashier</span>
                    </button>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveTab('chat')}
                        className="flex-1 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 py-2.5 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-[#7C5CFF]" />
                        <span>Chat Store</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleCancelHold}
                        className="flex-1 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 py-2.5 rounded-2xl text-xs font-bold transition cursor-pointer"
                      >
                        Release Hold
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-16 px-4 bg-white rounded-3xl border border-slate-200/80">
                  <div className="w-14 h-14 rounded-2xl bg-blue-50 text-[#7C5CFF] flex items-center justify-center mx-auto mb-3">
                    <Clock className="w-7 h-7" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">No Active Hold Pass</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                    Search nearby products and tap "Hold 30m" to reserve an item in-store before walking in.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('home')}
                    className="mt-4 bg-[#7C5CFF] text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-xs"
                  >
                    Explore Products
                  </button>
                </div>
              )
            ) : (
              <div className="space-y-3">
                {holdHistory.map((item) => (
                  <div key={item.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded">
                          {item.holdId}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          item.status === 'completed' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {item.status === 'completed' ? 'Picked Up' : 'Expired'}
                        </span>
                      </div>
                      <h4 className="text-xs font-bold text-slate-900 mt-1">{item.productName}</h4>
                      <p className="text-[10px] text-slate-500">{item.storeName} • {item.date}</p>
                    </div>
                    <span className="text-xs font-bold text-slate-900">₹{item.price.toLocaleString('en-IN')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            TAB 4: CHAT WITH STORE (Screen 9)
        ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'chat' && (
          <div className="flex-1 flex flex-col bg-slate-50 min-h-[calc(100vh-140px)] animate-in fade-in duration-200">
            {/* Store Top Bar */}
            <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#7C5CFF] flex items-center justify-center font-bold">
                  <Store className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">TechWorld Coimbatore</h4>
                  <p className="text-[10px] text-emerald-600 font-medium flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Online now • Counter 2
                  </p>
                </div>
              </div>

              <a
                href="tel:+919843011223"
                className="p-2 rounded-full bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition"
                title="Call store"
              >
                <Phone className="w-4 h-4" />
              </a>
            </div>

            {/* Chat Thread */}
            <div className="flex-1 p-4 space-y-3 overflow-y-auto">
              <div className="text-center my-2">
                <span className="text-[10px] text-slate-400 bg-white px-2.5 py-1 rounded-full border border-slate-200">
                  Hold Pass #H-7K3M9 Connected
                </span>
              </div>

              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.sender === 'customer' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-xs ${
                      msg.sender === 'customer'
                        ? 'bg-[#7C5CFF] text-white rounded-br-xs shadow-xs'
                        : 'bg-white border border-slate-200 text-slate-900 rounded-bl-xs shadow-xs'
                    }`}
                  >
                    <p>{msg.text}</p>
                  </div>
                  <span className="text-[9px] text-slate-400 mt-1 px-1">{msg.time}</span>
                </div>
              ))}
            </div>

            {/* Quick Suggestion Chips */}
            <div className="px-4 py-2 flex gap-1.5 overflow-x-auto no-scrollbar">
              {["I'm on my way!", "Is parking available?", "Can someone else pick up?"].map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => {
                    setChatInput(chip);
                  }}
                  className="bg-white border border-slate-200 hover:border-[#7C5CFF] text-slate-600 hover:text-slate-900 text-[10px] font-medium px-2.5 py-1 rounded-full whitespace-nowrap transition cursor-pointer shadow-xs"
                >
                  {chip}
                </button>
              ))}
            </div>

            {/* Message Input Box */}
            <form onSubmit={handleSendMessage} className="p-3 bg-white border-t border-slate-200 flex items-center gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Type a message to TechWorld..."
                className="flex-1 bg-slate-100 border border-slate-200 rounded-full px-4 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-[#7C5CFF]"
              />
              <button
                type="submit"
                className="w-9 h-9 rounded-full bg-[#7C5CFF] text-white flex items-center justify-center shrink-0 hover:bg-[#6846ed] transition cursor-pointer"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            TAB 5: PROFILE & SETTINGS
        ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'profile' && (
          <div className="p-4 space-y-4 animate-in fade-in duration-200">
            {/* User Card */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#315bd4] to-[#7C5CFF] text-white flex items-center justify-center text-xl font-bold shadow-md">
                {userProfile?.name ? userProfile.name.charAt(0).toUpperCase() : 'Z'}
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-slate-900 font-['Outfit']">
                  {userProfile?.name || 'Zooner Shopper'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {userProfile?.email || 'shopper.coimbatore@zooner.app'}
                </p>
                <span className="inline-block mt-1.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                  Verified Local Buyer
                </span>
              </div>
            </div>

            {/* Menu List */}
            <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden shadow-xs text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('holds')}
                className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-slate-50 transition cursor-pointer"
              >
                <div className="flex items-center gap-3 text-slate-700">
                  <Clock className="w-4 h-4 text-[#7C5CFF]" />
                  <span className="font-semibold">My Reservations & Hold Passes</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => setIsOnboardingOpen(true)}
                className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-slate-50 transition cursor-pointer"
              >
                <div className="flex items-center gap-3 text-slate-700">
                  <HelpCircle className="w-4 h-4 text-slate-500" />
                  <span className="font-semibold">How Zooner 30-Min Holds Work</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={onOpenLocationModal}
                className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-slate-50 transition cursor-pointer"
              >
                <div className="flex items-center gap-3 text-slate-700">
                  <MapPin className="w-4 h-4 text-emerald-600" />
                  <span className="font-semibold">City & Search Radius ({currentLocation.name})</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            {/* Sign In / Switch account */}
            <button
              type="button"
              onClick={() => onOpenSignIn('C')}
              className="w-full bg-white border border-slate-200 hover:border-slate-300 text-slate-700 py-3 rounded-2xl text-xs font-bold transition cursor-pointer shadow-xs"
            >
              Sign In with Another Account
            </button>
          </div>
        )}
      </main>

      {/* ══════════════════════════════════════════════════════════════════
          SCREEN 6: PRODUCT DETAILS MODAL / SHEET
      ══════════════════════════════════════════════════════════════════ */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-md max-h-[90vh] rounded-t-3xl sm:rounded-3xl overflow-y-auto no-scrollbar shadow-2xl flex flex-col">
            {/* Header */}
            <div className="relative h-64 w-full bg-slate-100 overflow-hidden">
              <img
                src={selectedProduct.imageUrl || 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=600&q=80'}
                alt={selectedProduct.name}
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => setSelectedProduct(null)}
                className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="absolute top-4 left-4 bg-emerald-900/90 text-emerald-300 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5 border border-emerald-600/50 backdrop-blur-md">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Verified Shelf Stock
              </div>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#7C5CFF] uppercase tracking-wider">{selectedProduct.brandName || 'Verified'}</span>
                  <div className="flex items-center gap-1 text-xs text-amber-500 font-bold">
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    <span>4.8 (128 reviews)</span>
                  </div>
                </div>
                <h3 className="text-lg font-black text-slate-900 mt-1 font-['Outfit']">{selectedProduct.name}</h3>
                <div className="text-xl font-black text-slate-900 mt-1">
                  ₹{(selectedProduct.lowestPrice ?? selectedProduct.minPrice ?? 0).toLocaleString('en-IN')}
                </div>
              </div>

              {/* Store Details Card */}
              <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-3.5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Store className="w-4 h-4 text-[#7C5CFF]" />
                    <h4 className="text-xs font-bold text-slate-900">
                      {selectedProduct.carryingStores?.[0]?.storeName || 'TechWorld Coimbatore'}
                    </h4>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100/60 px-2 py-0.5 rounded-full">
                    {selectedProduct.totalAvailableQuantity || selectedProduct.carryingStores?.[0]?.availableQuantity || 3} units available
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1 pl-6">
                  {selectedProduct.carryingStores?.[0]?.storeAddress || '104, DB Road, RS Puram, Coimbatore'} • {selectedProduct.carryingStores?.[0]?.distanceKm ?? 0.5} km away
                </p>
                <p className="text-[10px] text-slate-400 mt-1 pl-6">
                  Operating Hours: 9:00 AM – 9:30 PM (Mon–Sun)
                </p>
              </div>

              {/* Description */}
              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">Key Features</h4>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  {selectedProduct.description || 'Verified authentic physical inventory. Hold pass guarantees this specific unit is removed from public shelf sale for 30 minutes.'}
                </p>
              </div>

              {/* Sticky Hold Action */}
              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedProduct(null);
                    setActiveTab('chat');
                  }}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-3.5 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <MessageSquare className="w-4 h-4 text-[#7C5CFF]" />
                  <span>Chat</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleReserve(selectedProduct)}
                  disabled={isReserving}
                  className="flex-1 bg-[#7C5CFF] hover:bg-[#6846ed] text-white py-3.5 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-[#7C5CFF]/30 active:scale-98 transition cursor-pointer"
                >
                  {isReserving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
                  <span>Hold Pass / Reserve (30 min)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── STORE DETAILS MODAL ── */}
      {selectedStore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                  ● Verified Storefront
                </span>
                <h3 className="text-base font-black text-slate-900 mt-2 font-['Outfit']">{selectedStore.name}</h3>
                <p className="text-xs text-slate-500">{selectedStore.categoryName || 'Retail Store'}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedStore(null)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 space-y-2 text-xs text-slate-600 border border-slate-100">
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-[#7C5CFF] shrink-0 mt-0.5" />
                <span>{selectedStore.address}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{selectedStore.phone}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500 shrink-0" />
                <span>9:00 AM – 9:30 PM (Mon–Sun)</span>
              </div>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedStore(null);
                  setActiveTab('chat');
                }}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-2xl text-xs font-bold transition cursor-pointer"
              >
                Chat with Store
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedStore(null);
                  setActiveTab('search');
                }}
                className="flex-1 bg-[#7C5CFF] hover:bg-[#6846ed] text-white py-3 rounded-2xl text-xs font-bold transition cursor-pointer shadow-md shadow-[#7C5CFF]/20"
              >
                Browse Shelf Stock
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SCREEN 7: RESERVATION SUCCESS MODAL
      ══════════════════════════════════════════════════════════════════ */}
      {isSuccessModalOpen && activeHold && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto ring-8 ring-emerald-50 animate-bounce">
              <Check className="w-8 h-8 stroke-[3]" />
            </div>

            <div>
              <h3 className="text-lg font-black text-slate-900 font-['Outfit']">Reserved Successfully!</h3>
              <p className="text-xs text-slate-500 mt-1">
                Your item is held for <strong>30 minutes</strong> at the store.
              </p>
            </div>

            {/* Product Summary */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 text-left flex items-center gap-3">
              <img
                src={activeHold.image || 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?auto=format&fit=crop&w=600&q=80'}
                alt=""
                className="w-12 h-12 rounded-xl object-cover"
              />
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-bold text-slate-900 truncate">{activeHold.productName}</h4>
                <p className="text-[10px] text-slate-500">{activeHold.storeName}</p>
                <p className="text-xs font-black text-[#7C5CFF] mt-0.5">₹{activeHold.price.toLocaleString('en-IN')}</p>
              </div>
            </div>

            {/* Hold Code Box */}
            <div className="bg-slate-950 text-white rounded-2xl p-3.5 flex items-center justify-between">
              <div>
                <span className="text-[9px] text-slate-400 uppercase font-bold block">Hold Code</span>
                <span className="text-base font-black font-mono text-emerald-400">{activeHold.holdId}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(activeHold.holdId);
                  setCopiedCode(true);
                  setTimeout(() => setCopiedCode(false), 2000);
                }}
                className="flex items-center gap-1 text-[11px] font-bold bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-xl transition cursor-pointer"
              >
                {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCode ? 'Copied' : 'Copy Code'}</span>
              </button>
            </div>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsSuccessModalOpen(false);
                  setIsQrModalOpen(true);
                }}
                className="w-full bg-[#7C5CFF] hover:bg-[#6846ed] text-white py-3 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-[#7C5CFF]/20 transition cursor-pointer"
              >
                <QrCode className="w-4 h-4" />
                <span>View QR Code</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsSuccessModalOpen(false);
                  setActiveTab('holds');
                }}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-2.5 rounded-2xl text-xs font-bold transition cursor-pointer"
              >
                Back to Home / Holds
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          QR CODE MODAL (Live Standard Canvas QR + 30-min timer)
      ══════════════════════════════════════════════════════════════════ */}
      {isQrModalOpen && activeHold && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl text-center space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="text-left">
                <h4 className="text-sm font-black text-slate-900 font-['Outfit']">Zooner Hold Pass</h4>
                <p className="text-[10px] text-slate-500">Show this QR to cashier at pickup</p>
              </div>
              <button
                type="button"
                onClick={() => setIsQrModalOpen(false)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-600 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-2 flex justify-center">
              <div className="p-3 bg-white border-2 border-slate-900 rounded-2xl shadow-md inline-block">
                <StandardQRCode value={activeHold.qrCode} size={180} />
              </div>
            </div>

            <div className="bg-slate-950 text-white rounded-2xl p-3 flex items-center justify-between">
              <div className="text-left">
                <span className="text-[9px] text-slate-400 uppercase font-bold block">Remaining Time</span>
                <span className="text-sm font-black font-mono text-emerald-400">{formatTimer(activeHold.totalSeconds)}</span>
              </div>
              <div className="text-right">
                <span className="text-[9px] text-slate-400 uppercase font-bold block">Hold Code</span>
                <span className="text-xs font-bold font-mono text-slate-200">{activeHold.holdId}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsQrModalOpen(false)}
              className="w-full bg-[#7C5CFF] text-white py-3 rounded-2xl text-xs font-bold transition"
            >
              Done / Close
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          ONBOARDING MODAL (Screen 2)
      ══════════════════════════════════════════════════════════════════ */}
      {isOnboardingOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-5">
            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#315bd4] to-[#7C5CFF] text-white flex items-center justify-center mx-auto text-xl font-bold shadow-md">
                z
              </div>
              <h3 className="text-lg font-black text-slate-900 font-['Outfit'] mt-2">Get what you need from nearby stores</h3>
              <p className="text-xs text-slate-500">Know shelf inventory before stepping out</p>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="w-8 h-8 rounded-xl bg-blue-100 text-[#7C5CFF] flex items-center justify-center shrink-0 font-bold">1</div>
                <div>
                  <h4 className="font-bold text-slate-900">Real-Time Shelf Stock</h4>
                  <p className="text-slate-500 mt-0.5">See actual available stock in Coimbatore physical retail shops.</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center shrink-0 font-bold">2</div>
                <div>
                  <h4 className="font-bold text-slate-900">30-Minute Hold Pass</h4>
                  <p className="text-slate-500 mt-0.5">Reserve items instantly for 30 minutes with zero prepayment.</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0 font-bold">3</div>
                <div>
                  <h4 className="font-bold text-slate-900">Walk in & Collect</h4>
                  <p className="text-slate-500 mt-0.5">Show your QR code to the cashier and pick up your order.</p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsOnboardingOpen(false)}
              className="w-full bg-[#7C5CFF] text-white py-3.5 rounded-2xl text-xs font-bold transition shadow-md shadow-[#7C5CFF]/25 cursor-pointer"
            >
              Get Started
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          5-TAB BOTTOM NAVIGATION BAR (Home, Search, Holds, Chat, Profile)
      ══════════════════════════════════════════════════════════════════ */}
      <nav 
        aria-label="Customer Navigation"
        className="fixed bottom-0 left-0 right-0 max-w-[440px] mx-auto bg-white/95 backdrop-blur-xl border-t border-slate-200/90 flex items-center justify-around py-2.5 px-2 z-30 shadow-[0_-4px_20px_rgba(0,0,0,0.04)]"
      >
        <button
          type="button"
          onClick={() => {
            setSelectedProduct(null);
            setSelectedStore(null);
            setActiveTab('home');
          }}
          className={`flex flex-col items-center gap-1 transition-all cursor-pointer ${
            activeTab === 'home' ? 'text-[#7C5CFF] font-bold scale-105' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <Compass className="w-5 h-5" />
          <span className="text-[10px]">Home</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setSelectedProduct(null);
            setSelectedStore(null);
            setActiveTab('search');
          }}
          className={`flex flex-col items-center gap-1 transition-all cursor-pointer ${
            activeTab === 'search' ? 'text-[#7C5CFF] font-bold scale-105' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <Search className="w-5 h-5" />
          <span className="text-[10px]">Search</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setSelectedProduct(null);
            setSelectedStore(null);
            setActiveTab('holds');
          }}
          className={`flex flex-col items-center gap-1 transition-all cursor-pointer relative ${
            activeTab === 'holds' ? 'text-[#7C5CFF] font-bold scale-105' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <Clock className="w-5 h-5" />
          <span className="text-[10px]">Holds</span>
          {activeHold && activeHold.totalSeconds > 0 && (
            <span className="absolute -top-1 right-2 w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setSelectedProduct(null);
            setSelectedStore(null);
            setActiveTab('chat');
          }}
          className={`flex flex-col items-center gap-1 transition-all cursor-pointer ${
            activeTab === 'chat' ? 'text-[#7C5CFF] font-bold scale-105' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <MessageSquare className="w-5 h-5" />
          <span className="text-[10px]">Chat</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setSelectedProduct(null);
            setSelectedStore(null);
            setActiveTab('profile');
          }}
          className={`flex flex-col items-center gap-1 transition-all cursor-pointer ${
            activeTab === 'profile' ? 'text-[#7C5CFF] font-bold scale-105' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <User className="w-5 h-5" />
          <span className="text-[10px]">Profile</span>
        </button>
      </nav>

    </div>
  );
};
