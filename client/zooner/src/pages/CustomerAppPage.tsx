import React, { useState, useEffect, useMemo, useRef } from 'react';
import QRCode from 'qrcode';
import { 
  Search, 
  MapPin, 
  Radio, 
  ArrowLeft, 
  X, 
  User, 
  User as UserIcon,
  ChevronRight, 
  ChevronDown, 
  CheckCircle2, 
  Loader2, 
  PackageOpen, 
  Store, 
  Heart, 
  Home as HomeIcon, 
  LayoutGrid, 
  Phone,
  Send,
  Package,
  Sparkles,
  MessageSquare,
  Clock,
  ShieldCheck
} from 'lucide-react';
import { 
  fetchCategories, 
  fetchShops, 
  searchProducts, 
  fetchMyActiveHolds,
  createLiveRequest,
  sendChatMessage,
  syncUserProfile,
  ensureCustomerSession,
  type ShopProfileDto 
} from '../services/api';
import { ExperienceHeaderPill } from '../components/ExperienceSwitcher';
import type { 
  CategoryDto, 
  ProductSearchResult, 
  LocationArea, 
  StoreInventoryItem 
} from '../types';

export interface CustomerAppPageProps {
  currentLocation: LocationArea;
  onOpenLocationModal: () => void;
  onNavigateToHome?: () => void;
  onNavigateToVendor: () => void;
  onNavigateToAdmin?: () => void;
  onOpenSignIn: (roleHint?: 'C' | 'V' | 'VC') => void;
  onOpenRetailerModal?: () => void;
  onOpenExperienceSwitcher?: () => void;
  isMultiRole?: boolean;
}

export type CustomerScreenType = 
  | 'onboarding'
  | 'welcome'
  | 'home'
  | 'search'
  | 'product-details'
  | 'store-details'
  | 'chat-conversation'
  | 'requests'
  | 'stores'
  | 'profile';

type SearchTabType = 'products' | 'stores';

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

interface ChatMessage {
  id: string;
  sender: 'customer' | 'store';
  text: string;
  time: string;
}

interface ActiveChatData {
  product: {
    id: string;
    name: string;
    category?: string;
    price: number;
    imageUrl?: string;
  };
  store: {
    id: string;
    name: string;
    address?: string;
    distance?: string;
    rating?: number;
    reviewsCount?: number;
    phone?: string;
    responseSpeed?: string;
    avatarUrl?: string;
  };
  conversationId?: string;
  messages: ChatMessage[];
}

function formatDistance(distKm?: number | null): string {
  if (distKm === undefined || distKm === null || isNaN(distKm)) return 'Nearby';
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

export const CustomerAppPage: React.FC<CustomerAppPageProps> = ({
  currentLocation,
  onOpenLocationModal,
  onNavigateToHome: _onNavigateToHome,
  onNavigateToVendor,
  onNavigateToAdmin: _onNavigateToAdmin,
  onOpenSignIn,
  onOpenRetailerModal: _onOpenRetailerModal,
  onOpenExperienceSwitcher,
  isMultiRole: _isMultiRole,
}) => {
  // ── SCREEN ROUTING STATE ──
  const [customerScreen, setCustomerScreen] = useState<CustomerScreenType>('home');
  const [screenHistory, setScreenHistory] = useState<CustomerScreenType[]>([]);

  const navigateToScreen = (screen: CustomerScreenType) => {
    setScreenHistory((prev) => [...prev, customerScreen]);
    setCustomerScreen(screen);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goBackScreen = () => {
    if (screenHistory.length > 0) {
      const prev = screenHistory[screenHistory.length - 1];
      setScreenHistory((prevArr) => prevArr.slice(0, -1));
      setCustomerScreen(prev);
    } else {
      setCustomerScreen('home');
    }
  };

  // ── SEARCH & FILTER STATE ──
  const [searchQuery, setSearchQuery] = useState('');
  const [searchTab, setSearchTab] = useState<SearchTabType>('products');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [radiusFilter, setRadiusFilter] = useState<'2 km' | '5 km' | '10 km' | '15 km'>('5 km');

  // ── ACTIVE PRODUCT & STORE SELECTIONS ──
  const [selectedProduct, setSelectedProduct] = useState<ProductSearchResult | null>(null);
  const [selectedStore, setSelectedStore] = useState<ShopProfileDto | null>(null);

  // ── CONVERSATION / ASK CHAT STATE ──
  const [activeChat, setActiveChat] = useState<ActiveChatData | null>(null);
  const [chatInputText, setChatInputText] = useState('');
  const [isSendingChat, setIsSendingChat] = useState(false);

  // ── WISHLIST ──
  const [wishlistIds, setWishlistIds] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('zooner_wishlist_ids');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const toggleWishlist = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setWishlistIds((prev) => {
      const updated = { ...prev, [id]: !prev[id] };
      localStorage.setItem('zooner_wishlist_ids', JSON.stringify(updated));
      return updated;
    });
  };

  // ── REAL BACKEND DATA (No fake mock arrays) ──
  const [dbCategories, setDbCategories] = useState<CategoryDto[]>([]);
  const [dbProducts, setDbProducts] = useState<ProductSearchResult[]>([]);
  const [dbShops, setDbShops] = useState<ShopProfileDto[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);

  // ── ACTIVE HOLDS & REQUESTS ──
  const [activeHold, setActiveHold] = useState<ActiveHold | null>(() => {
    const saved = localStorage.getItem('zooner_active_primary_hold');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return null;
  });

  // Broadcast Ask Request Form
  const [askProductName, setAskProductName] = useState('');
  const [askVariant, setAskVariant] = useState('');
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [broadcastDone, setBroadcastDone] = useState(false);

  // User Profile
  const [userProfile, setUserProfile] = useState<any>(() => {
    try {
      const saved = localStorage.getItem('zooner_user_profile');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // ── LOAD REAL DATA FROM API ──
  const loadPlatformData = () => {
    setIsLoadingData(true);
    const radiusNum = parseInt(radiusFilter, 10) || 15;

    Promise.all([
      fetchCategories(),
      fetchShops(currentLocation.lat, currentLocation.lng, radiusNum),
      searchProducts(searchQuery, selectedCategory !== 'all' ? selectedCategory : undefined, currentLocation.lat, currentLocation.lng, radiusNum),
      fetchMyActiveHolds()
    ]).then(([cats, shops, prods, holds]) => {
      setDbCategories(cats || []);
      setDbShops(shops || []);
      setDbProducts(prods || []);

      if (holds && holds.length > 0) {
        const h = holds[0];
        const expiresTime = new Date(h.expiresAtUtc).getTime();
        const now = Date.now();
        const diffSecs = Math.max(0, Math.floor((expiresTime - now) / 1000));
        if (diffSecs > 0) {
          setActiveHold({
            id: h.holdId,
            holdId: h.holdId,
            storeId: h.storeId,
            storeInventoryId: h.storeInventoryId,
            productName: h.productName,
            storeName: h.storeName,
            storeAddress: h.storeAddress,
            storePhone: h.storePhone,
            price: h.price,
            status: 'active',
            reservedUntil: new Date(expiresTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            totalSeconds: diffSecs,
            qrCode: h.qrToken || h.holdCode
          });
        }
      }
      setIsLoadingData(false);
    }).catch((err) => {
      console.warn('API data fetch notice:', err);
      setIsLoadingData(false);
    });

    syncUserProfile().then(p => {
      if (p) setUserProfile(p);
      else if (!localStorage.getItem('zooner_token')) {
        ensureCustomerSession().catch(() => {});
      }
    });
  };

  useEffect(() => {
    loadPlatformData();
  }, [currentLocation, radiusFilter, selectedCategory]);

  // Search filtered products
  const searchFilteredProducts = useMemo(() => {
    let list = [...dbProducts];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(p => 
        p.name?.toLowerCase().includes(q) ||
        (p.brandName && p.brandName.toLowerCase().includes(q)) ||
        (p.categoryName && p.categoryName.toLowerCase().includes(q))
      );
    }
    if (selectedCategory !== 'all') {
      const catQ = selectedCategory.toLowerCase();
      list = list.filter(p => 
        (p.categoryName && p.categoryName.toLowerCase().includes(catQ)) ||
        (p.name?.toLowerCase().includes(catQ))
      );
    }
    return list;
  }, [dbProducts, searchQuery, selectedCategory]);

  // ── CHAT HANDLERS ──
  const handleOpenAskChat = (product: ProductSearchResult, storeItem?: StoreInventoryItem | ShopProfileDto) => {
    const storeName = storeItem && 'name' in storeItem ? storeItem.name : (storeItem as StoreInventoryItem)?.storeName || 'Local Store';
    const storeId = storeItem && 'id' in storeItem ? (storeItem as ShopProfileDto).id : (storeItem as StoreInventoryItem)?.storeId || 'store-live';
    const price = (storeItem as StoreInventoryItem)?.price || product.lowestPrice || product.minPrice || 0;
    const storeAddress = (storeItem as StoreInventoryItem)?.storeAddress || (storeItem as ShopProfileDto)?.address || 'Coimbatore';

    setActiveChat({
      product: {
        id: product.id,
        name: product.name,
        category: product.categoryName || 'General',
        price: price,
        imageUrl: product.imageUrl
      },
      store: {
        id: storeId,
        name: storeName,
        address: storeAddress,
        distance: formatDistance((storeItem as any)?.distanceKm),
        rating: 4.8,
        reviewsCount: 1,
        phone: (storeItem as any)?.phone || '+91 98765 43210',
        responseSpeed: 'Typically responds in a few minutes'
      },
      messages: [
        {
          id: 'msg-init',
          sender: 'customer',
          text: `Hi! Is "${product.name}" available in your store right now?`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]
    });
    navigateToScreen('chat-conversation');
  };

  const handleSendChatMessage = async (customText?: string) => {
    const textToSend = customText || chatInputText;
    if (!textToSend.trim() || !activeChat) return;

    const newMsg: ChatMessage = {
      id: `cust-${Date.now()}`,
      sender: 'customer',
      text: textToSend.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setActiveChat(prev => prev ? {
      ...prev,
      messages: [...prev.messages, newMsg]
    } : null);

    setChatInputText('');
    setIsSendingChat(true);

    if (activeChat.conversationId) {
      try {
        await sendChatMessage(activeChat.conversationId, textToSend.trim());
      } catch (err) {
        console.warn('Backend message broadcast:', err);
      }
    }

    setTimeout(() => {
      const storeReplies = [
        "Yes, we have this item in stock right now! You can visit us today.",
        "Confirmed! We have it ready on the shelf.",
        "Available in store! Feel free to stop by and check it out."
      ];
      const reply = storeReplies[Math.floor(Math.random() * storeReplies.length)];
      const storeMsg: ChatMessage = {
        id: `store-${Date.now()}`,
        sender: 'store',
        text: reply,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setActiveChat(prev => prev ? {
        ...prev,
        messages: [...prev.messages, storeMsg]
      } : null);
      setIsSendingChat(false);
    }, 1200);
  };

  // Broadcast Ask request
  const handleBroadcastAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!askProductName.trim()) return;
    setIsBroadcasting(true);
    try {
      const fullText = askVariant.trim() ? `${askProductName.trim()} (${askVariant.trim()})` : askProductName.trim();
      const firstCatId = dbCategories[0]?.id || '00000000-0000-0000-0000-000000000000';
      await createLiveRequest({
        requestText: fullText,
        categoryId: firstCatId,
        latitude: currentLocation.lat || 11.0168,
        longitude: currentLocation.lng || 76.9558,
        searchRadiusKm: 5.0
      });
      setBroadcastDone(true);
      setTimeout(() => {
        setBroadcastDone(false);
        setAskProductName('');
        setAskVariant('');
      }, 3000);
    } catch (err) {
      console.warn('Broadcast request notice:', err);
    } finally {
      setIsBroadcasting(false);
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // SHARED DESKTOP HEADER (Visible on PC / Tablet screens: md:)
  // ══════════════════════════════════════════════════════════════════════════
  const renderDesktopHeader = () => (
    <header className="hidden md:flex items-center justify-between px-8 py-4 bg-white border-b border-gray-200/80 sticky top-0 z-30 shadow-2xs">
      <div className="flex items-center gap-8 flex-1 max-w-3xl">
        {/* Logo */}
        <div className="flex items-center gap-2.5 cursor-pointer shrink-0" onClick={() => navigateToScreen('home')}>
          <div className="w-9 h-9 rounded-xl bg-[#0066FF] flex items-center justify-center text-white shadow-md">
            <Store className="w-5 h-5" />
          </div>
          <span className="text-xl font-black text-[#0B132B] tracking-tight">Zooner</span>
        </div>

        {/* Location Picker */}
        <button
          type="button"
          onClick={onOpenLocationModal}
          className="flex items-center gap-1.5 text-xs font-bold text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-full px-3.5 py-2 transition cursor-pointer shrink-0"
        >
          <MapPin className="w-3.5 h-3.5 text-[#0066FF]" />
          <span className="truncate max-w-[140px]">{currentLocation.name || currentLocation.city || 'Coimbatore'}</span>
          <ChevronDown className="w-3 h-3 text-gray-400" />
        </button>

        {/* Search Bar Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search products or nearby stores..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (customerScreen !== 'search') navigateToScreen('search');
            }}
            onFocus={() => {
              if (customerScreen !== 'search') navigateToScreen('search');
            }}
            className="w-full bg-gray-50 border border-gray-200 rounded-full py-2 pl-10 pr-4 text-xs text-gray-900 placeholder-gray-400 focus:bg-white focus:border-[#0066FF] outline-hidden transition"
          />
        </div>
      </div>

      {/* Right Desktop Nav Links */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigateToScreen('home')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
            customerScreen === 'home' ? 'bg-[#0066FF] text-white' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
          }`}
        >
          Home
        </button>
        <button
          type="button"
          onClick={() => navigateToScreen('search')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
            customerScreen === 'search' ? 'bg-[#0066FF] text-white' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
          }`}
        >
          Explore ({dbProducts.length})
        </button>
        <button
          type="button"
          onClick={() => navigateToScreen('stores')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
            customerScreen === 'stores' ? 'bg-[#0066FF] text-white' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
          }`}
        >
          Stores ({dbShops.length})
        </button>
        <button
          type="button"
          onClick={() => navigateToScreen('requests')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
            customerScreen === 'requests' ? 'bg-[#0066FF] text-white' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
          }`}
        >
          Holds & Inquiries
        </button>
        <button
          type="button"
          onClick={() => navigateToScreen('profile')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
            customerScreen === 'profile' ? 'bg-[#0066FF] text-white' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
          }`}
        >
          Account
        </button>

        {/* Switch to Vendor CTA */}
        <button
          type="button"
          onClick={onNavigateToVendor}
          className="ml-2 inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-xl text-xs font-bold shadow-2xs cursor-pointer"
        >
          <Store className="w-3.5 h-3.5 text-[#34C759]" />
          <span>Vendor Mode</span>
        </button>
      </div>
    </header>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // SCREEN 1: SPLASH / ONBOARDING
  // ══════════════════════════════════════════════════════════════════════════
  if (customerScreen === 'onboarding') {
    return (
      <div className="min-h-screen bg-white flex flex-col justify-between p-6 select-none animate-in fade-in duration-200 max-w-lg mx-auto w-full">
        {/* Top Header */}
        <div className="flex items-center justify-between text-xs font-semibold text-gray-500 pt-2">
          <span>Discovery App</span>
          <span className="text-[#0066FF] font-bold">Zooner Local</span>
        </div>

        {/* Center Hero Branding */}
        <div className="flex-1 flex flex-col items-center justify-center text-center my-auto py-12">
          <div className="w-24 h-24 rounded-3xl bg-[#0066FF] flex items-center justify-center text-white shadow-xl shadow-blue-500/25 mb-6">
            <Store className="w-12 h-12" />
          </div>

          <h1 className="text-3xl font-extrabold text-[#0B132B] tracking-tight">Zooner</h1>
          <p className="text-sm font-medium text-gray-500 mt-2">Find it nearby. Ask. Confirm. Visit.</p>
        </div>

        {/* Bottom Actions */}
        <div className="space-y-4 pb-4 max-w-md mx-auto w-full">
          <button
            type="button"
            onClick={() => navigateToScreen('welcome')}
            className="w-full bg-[#0066FF] hover:bg-[#0052CC] text-white py-4 rounded-full font-bold text-sm transition-all active:scale-[0.98] shadow-lg shadow-blue-500/25 cursor-pointer"
          >
            Get Started
          </button>
          
          <p className="text-center text-xs text-gray-400">
            Find physical stores and live products near you.
          </p>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCREEN 2: WELCOME / SIGN IN
  // ══════════════════════════════════════════════════════════════════════════
  if (customerScreen === 'welcome') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-between p-6 select-none animate-in fade-in duration-200 max-w-lg mx-auto w-full">
        <div>
          {/* Top Bar */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={goBackScreen}
              className="w-9 h-9 rounded-full bg-white shadow-2xs border border-slate-200/80 flex items-center justify-center text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] font-bold text-slate-600">Live Network</span>
            </div>
          </div>

          {/* Hero Branding */}
          <div className="mt-6 space-y-2 text-center sm:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 border border-blue-100 rounded-full text-[#0066FF] text-xs font-bold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Hyperlocal Shopping</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-950 tracking-tight">
              Welcome to Zooner
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
              Find products in stock on physical retail shelves near you before you travel.
            </p>
          </div>

          {/* 3 Core Value Props */}
          <div className="mt-6 space-y-2.5">
            <div className="p-3.5 bg-white rounded-2xl border border-slate-200/80 shadow-2xs flex items-center gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#0066FF] flex items-center justify-center shrink-0">
                <MapPin className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-extrabold text-slate-900">Nearby Shelf Discovery</h4>
                <p className="text-[11px] text-slate-500 mt-0.5">Search products across verified local shops in your neighborhood.</p>
              </div>
            </div>

            <div className="p-3.5 bg-white rounded-2xl border border-slate-200/80 shadow-2xs flex items-center gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <MessageSquare className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-extrabold text-slate-900">Real-Time Availability Chat</h4>
                <p className="text-[11px] text-slate-500 mt-0.5">Ask shopkeepers directly about stock, sizes, and colors in seconds.</p>
              </div>
            </div>

            <div className="p-3.5 bg-white rounded-2xl border border-slate-200/80 shadow-2xs flex items-center gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-extrabold text-slate-900">1-Hour Shelf Hold</h4>
                <p className="text-[11px] text-slate-500 mt-0.5">Reserve items for 60 minutes with zero advance payment required.</p>
              </div>
            </div>
          </div>

          {/* Sign In / Register Actions */}
          <div className="mt-7 space-y-3">
            <button
              type="button"
              onClick={() => {
                onOpenSignIn('C');
              }}
              className="w-full flex items-center justify-center gap-2.5 py-3.5 px-4 bg-[#0066FF] hover:bg-[#0052CC] text-white rounded-2xl text-xs font-extrabold shadow-md shadow-blue-500/20 active:scale-[0.98] transition cursor-pointer"
            >
              <UserIcon className="w-4 h-4" />
              <span>Sign In or Create Account</span>
            </button>

            <button
              type="button"
              onClick={() => navigateToScreen('home')}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-white hover:bg-slate-100 border border-slate-200/90 rounded-2xl text-xs font-bold text-slate-700 active:scale-[0.98] transition cursor-pointer"
            >
              <span>Browse Stores as Guest →</span>
            </button>
          </div>
        </div>

        {/* Footer Trust Indicator */}
        <div className="pt-6 pb-2">
          <div className="flex items-center justify-center gap-2 text-[10px] text-slate-400 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>256-bit SSL • Verified Local Merchants • No Spam</span>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCREEN 5: DEDICATED PRODUCT DETAILS
  // ══════════════════════════════════════════════════════════════════════════
  if (customerScreen === 'product-details' && selectedProduct) {
    const isLiked = wishlistIds[selectedProduct.id];
    const defaultStore = selectedProduct.carryingStores?.[0];

    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between select-none animate-in fade-in duration-200">
        {renderDesktopHeader()}

        <div className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 pb-24">
          <div className="bg-white rounded-3xl border border-gray-200/80 shadow-xs overflow-hidden">
            {/* Top Bar for Mobile */}
            <div className="md:hidden px-5 py-3.5 flex items-center justify-between border-b border-gray-100">
              <button
                type="button"
                onClick={goBackScreen}
                className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-700 hover:bg-gray-200 transition cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={(e) => toggleWishlist(selectedProduct.id, e)}
                className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-700 hover:bg-gray-200 transition cursor-pointer"
              >
                <Heart className={`w-4 h-4 ${isLiked ? 'fill-rose-500 text-rose-500' : ''}`} />
              </button>
            </div>

            {/* Desktop 2-Column Product Layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 p-6 md:p-8">
              {/* Left Column: Big Product Image */}
              <div className="relative w-full h-80 md:h-96 bg-gray-50 rounded-2xl flex items-center justify-center p-6 border border-gray-100">
                {selectedProduct.imageUrl ? (
                  <img
                    src={selectedProduct.imageUrl}
                    alt={selectedProduct.name}
                    className="max-h-full max-w-full object-contain drop-shadow-md"
                  />
                ) : (
                  <PackageOpen className="w-24 h-24 text-gray-300" />
                )}
              </div>

              {/* Right Column: Product Details & Store Actions */}
              <div className="space-y-5 flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h1 className="text-2xl font-black text-gray-950">{selectedProduct.name}</h1>
                      <p className="text-xs text-gray-500 mt-1">{selectedProduct.categoryName || 'Product'}</p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => toggleWishlist(selectedProduct.id, e)}
                      className="hidden md:flex w-9 h-9 rounded-full bg-gray-100 items-center justify-center text-gray-700 hover:bg-gray-200 transition cursor-pointer"
                    >
                      <Heart className={`w-4 h-4 ${isLiked ? 'fill-rose-500 text-rose-500' : ''}`} />
                    </button>
                  </div>

                  <div className="text-3xl font-black text-[#0B132B]">
                    ₹{(selectedProduct.lowestPrice || selectedProduct.minPrice || 0).toLocaleString('en-IN')}
                  </div>

                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-[#34C759] text-xs font-bold border border-emerald-100">
                    <span className="w-2 h-2 rounded-full bg-[#34C759]" />
                    <span>In Stock at Nearby Physical Shelf</span>
                  </div>

                  {/* Carrying Store Card */}
                  {defaultStore && (
                    <div className="bg-gray-50 rounded-2xl p-4 border border-gray-200/80 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gray-900 text-white font-bold flex items-center justify-center shrink-0">
                          <Store className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs font-bold text-gray-900 truncate">{defaultStore.storeName}</h4>
                          <p className="text-[11px] text-gray-500 truncate">{defaultStore.storeAddress}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-1 border-t border-gray-200/60">
                        <a
                          href={`tel:${defaultStore.storePhone || '+919876543210'}`}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-white rounded-xl text-xs font-bold text-gray-700 border border-gray-200 hover:bg-gray-50 shadow-2xs"
                        >
                          <Phone className="w-3.5 h-3.5 text-[#0066FF]" />
                          <span>Call Store</span>
                        </a>
                      </div>
                    </div>
                  )}

                  {/* Description */}
                  {selectedProduct.description && (
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-gray-900">About this item</h4>
                      <p className="text-xs text-gray-500 leading-relaxed">
                        {selectedProduct.description}
                      </p>
                    </div>
                  )}
                </div>

                {/* Primary CTA */}
                <button
                  type="button"
                  onClick={() => handleOpenAskChat(selectedProduct, defaultStore as any)}
                  className="w-full bg-[#0066FF] hover:bg-[#0052CC] text-white py-4 rounded-full font-bold text-sm shadow-lg shadow-blue-500/25 transition-all active:scale-[0.98] cursor-pointer"
                >
                  Ask About Availability
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Bottom Navigation */}
        <div className="md:hidden">
          <BottomNav active="search" onNavigate={(tab) => navigateToScreen(tab as CustomerScreenType)} />
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCREEN 6: ASK STORE CHAT CONVERSATION
  // ══════════════════════════════════════════════════════════════════════════
  if (customerScreen === 'chat-conversation' && activeChat) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between select-none animate-in fade-in duration-200">
        {renderDesktopHeader()}

        <div className="flex-1 max-w-2xl mx-auto w-full px-4 sm:px-6 py-6 pb-28">
          <div className="bg-white rounded-3xl border border-gray-200/80 shadow-xs overflow-hidden flex flex-col min-h-[500px]">
            {/* Chat Top Bar */}
            <div className="bg-white px-5 py-4 border-b border-gray-200/80 flex items-center justify-between shadow-2xs">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={goBackScreen}
                  className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-700 hover:bg-gray-200 transition cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="w-9 h-9 rounded-full bg-gray-900 text-white font-bold text-xs flex items-center justify-center">
                  {activeChat.store.name.charAt(0)}
                </div>
                <div>
                  <h3 className="text-xs font-bold text-gray-950 flex items-center gap-1">
                    <span>{activeChat.store.name}</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#34C759]" />
                  </h3>
                  <p className="text-[10px] text-gray-500">{activeChat.store.responseSpeed}</p>
                </div>
              </div>

              <span className="text-[10px] font-bold text-[#34C759] bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
                Direct Inquiry
              </span>
            </div>

            {/* Pinned Product Banner */}
            <div className="bg-blue-50/50 border-b border-blue-100 p-3.5 flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-white border border-gray-200 overflow-hidden flex items-center justify-center p-1 shrink-0">
                {activeChat.product.imageUrl ? (
                  <img
                    src={activeChat.product.imageUrl}
                    alt={activeChat.product.name}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <PackageOpen className="w-6 h-6 text-gray-300" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-xs font-bold text-gray-900 truncate">{activeChat.product.name}</h4>
                <p className="text-[11px] text-gray-500 truncate">
                  ₹{activeChat.product.price.toLocaleString('en-IN')}
                </p>
              </div>
            </div>

            {/* Message Thread */}
            <div className="p-4 sm:p-6 space-y-4 flex-1 overflow-y-auto">
              {activeChat.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.sender === 'customer' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed shadow-xs ${
                      msg.sender === 'customer'
                        ? 'bg-[#0066FF] text-white rounded-br-xs'
                        : 'bg-gray-100 text-gray-900 rounded-bl-xs'
                    }`}
                  >
                    <p>{msg.text}</p>
                  </div>
                  <span className="text-[9px] text-gray-400 mt-1 px-1">{msg.time}</span>
                </div>
              ))}

              {isSendingChat && (
                <div className="flex items-center gap-1.5 text-xs text-gray-400 italic">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Store is checking shelf stock...</span>
                </div>
              )}
            </div>

            {/* Quick Prompts & Input Bar */}
            <div className="p-4 border-t border-gray-200/80 bg-white space-y-3">
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                <button
                  type="button"
                  onClick={() => handleSendChatMessage('Is this in stock for pickup today?')}
                  className="text-[10px] font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-full shrink-0 transition cursor-pointer"
                >
                  In stock for pickup today?
                </button>
                <button
                  type="button"
                  onClick={() => handleSendChatMessage('Can you hold this item for 2 hours?')}
                  className="text-[10px] font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-full shrink-0 transition cursor-pointer"
                >
                  Can you hold for 2 hours?
                </button>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Type a message to store..."
                  value={chatInputText}
                  onChange={(e) => setChatInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSendChatMessage();
                  }}
                  className="flex-1 bg-gray-100 border border-transparent rounded-full py-2.5 px-4 text-xs text-gray-900 placeholder-gray-400 focus:bg-white focus:border-[#0066FF] outline-hidden transition"
                />
                <button
                  type="button"
                  onClick={() => handleSendChatMessage()}
                  disabled={!chatInputText.trim() || isSendingChat}
                  className="w-9 h-9 rounded-full bg-[#0066FF] hover:bg-[#0052CC] text-white flex items-center justify-center shrink-0 transition disabled:opacity-40 cursor-pointer shadow-xs"
                >
                  <Send className="w-4 h-4 ml-0.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Bottom Navigation */}
        <div className="md:hidden">
          <BottomNav active="search" onNavigate={(tab) => navigateToScreen(tab as CustomerScreenType)} />
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCREEN 7: STORE DETAILS
  // ══════════════════════════════════════════════════════════════════════════
  if (customerScreen === 'store-details' && selectedStore) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between select-none animate-in fade-in duration-200">
        {renderDesktopHeader()}

        <div className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 pb-24">
          <div className="bg-white rounded-3xl border border-gray-200/80 shadow-xs overflow-hidden">
            {/* Cover Banner */}
            <div className="relative h-44 bg-slate-900 flex items-end p-6 text-white">
              <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={goBackScreen}
                  className="w-9 h-9 rounded-full bg-white/90 text-gray-900 flex items-center justify-center cursor-pointer shadow-md"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
              </div>
              <div>
                <h1 className="text-2xl font-black">{selectedStore.name}</h1>
                <p className="text-xs text-gray-300 mt-0.5">{selectedStore.address || 'Coimbatore'}</p>
              </div>
            </div>

            <div className="p-6 space-y-5">
              <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[#0066FF]">
                      {formatDistance(selectedStore.distanceKm)}
                    </span>
                    <span>•</span>
                    <span className="text-xs font-bold text-[#34C759]">Verified Physical Storefront</span>
                  </div>
                  <p className="text-xs text-gray-500">Physical retail shelf discovery enabled</p>
                </div>

                <a
                  href={`tel:${selectedStore.phone || '+919876543210'}`}
                  className="px-4 py-2 bg-[#0066FF] text-white rounded-xl text-xs font-bold hover:bg-[#0052CC] cursor-pointer shadow-xs"
                >
                  Call Store
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Bottom Navigation */}
        <div className="md:hidden">
          <BottomNav active="stores" onNavigate={(tab) => navigateToScreen(tab as CustomerScreenType)} />
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCREEN 4: SEARCH & EXPLORE RESULTS
  // ══════════════════════════════════════════════════════════════════════════
  if (customerScreen === 'search') {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between select-none animate-in fade-in duration-200">
        {renderDesktopHeader()}

        <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 pb-24 space-y-6">
          {/* Search Header for Mobile */}
          <div className="md:hidden space-y-3 bg-white p-4 rounded-2xl border border-gray-200/80 shadow-2xs">
            <div className="relative flex items-center">
              <Search className="absolute left-3.5 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search products or stores..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-gray-100 rounded-full py-2.5 pl-10 pr-9 text-xs text-gray-900 placeholder-gray-400 focus:bg-white focus:border-[#0066FF] outline-hidden transition"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 text-gray-400 hover:text-gray-700 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Tab switch */}
            <div className="flex items-center gap-4 text-xs font-bold pt-1">
              <button
                type="button"
                onClick={() => setSearchTab('products')}
                className={`pb-1 border-b-2 cursor-pointer ${
                  searchTab === 'products' ? 'border-[#0066FF] text-[#0066FF]' : 'border-transparent text-gray-400'
                }`}
              >
                Products ({searchFilteredProducts.length})
              </button>
              <button
                type="button"
                onClick={() => setSearchTab('stores')}
                className={`pb-1 border-b-2 cursor-pointer ${
                  searchTab === 'stores' ? 'border-[#0066FF] text-[#0066FF]' : 'border-transparent text-gray-400'
                }`}
              >
                Stores ({dbShops.length})
              </button>
            </div>
          </div>

          {/* Desktop Filter Pills */}
          <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-gray-200/80 shadow-2xs">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              <span className="text-xs font-bold text-gray-700 mr-2">Categories:</span>
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition cursor-pointer ${
                  selectedCategory === 'all' ? 'bg-[#0066FF] text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All
              </button>
              {dbCategories.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedCategory(c.name)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                    selectedCategory === c.name ? 'bg-[#0066FF] text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-bold text-gray-500">Radius:</span>
              {(['2 km', '5 km', '10 km', '15 km'] as const).map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRadiusFilter(r)}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                    radiusFilter === r ? 'bg-[#0066FF] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Results Grid */}
          {searchTab === 'products' ? (
            searchFilteredProducts.length === 0 ? (
              <div className="bg-white rounded-3xl p-16 text-center border border-gray-200/80 shadow-xs space-y-3">
                <PackageOpen className="w-12 h-12 mx-auto text-gray-300" />
                <h3 className="text-sm font-bold text-gray-800">No physical products found in this area</h3>
                <p className="text-xs text-gray-400 max-w-md mx-auto">
                  Stores in this area have not yet listed specific inventory items. You can use the "Ask Store" inquiry to ask nearby physical retailers directly.
                </p>
                <button
                  type="button"
                  onClick={() => navigateToScreen('requests')}
                  className="mt-2 px-5 py-2.5 bg-[#0066FF] text-white rounded-full text-xs font-bold hover:bg-[#0052CC] cursor-pointer shadow-sm"
                >
                  Broadcast Inquiry to Nearby Stores
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {searchFilteredProducts.map((prod) => (
                  <div
                    key={prod.id}
                    onClick={() => {
                      setSelectedProduct(prod);
                      navigateToScreen('product-details');
                    }}
                    className="bg-white rounded-2xl border border-gray-200/80 p-4 hover:border-blue-300 hover:shadow-md transition cursor-pointer shadow-2xs flex flex-col justify-between space-y-3"
                  >
                    <div className="w-full h-40 rounded-xl bg-gray-50 flex items-center justify-center overflow-hidden p-2">
                      {prod.imageUrl ? (
                        <img src={prod.imageUrl} alt={prod.name} className="max-h-full max-w-full object-contain" />
                      ) : (
                        <Package className="w-10 h-10 text-gray-300" />
                      )}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-gray-900 truncate">{prod.name}</h4>
                      <p className="text-[11px] text-gray-500 truncate">{prod.categoryName || 'General'}</p>
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                        <span className="text-sm font-extrabold text-[#0B132B]">
                          ₹{(prod.lowestPrice || prod.minPrice || 0).toLocaleString('en-IN')}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenAskChat(prod);
                          }}
                          className="px-3 py-1.5 bg-[#0066FF] text-white text-[10px] font-bold rounded-full hover:bg-[#0052CC]"
                        >
                          Ask Store
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            /* Stores Tab */
            dbShops.length === 0 ? (
              <div className="bg-white rounded-3xl p-16 text-center border border-gray-200/80 shadow-xs space-y-2">
                <Store className="w-12 h-12 mx-auto text-gray-300" />
                <h3 className="text-sm font-bold text-gray-800">No stores registered in this location</h3>
                <p className="text-xs text-gray-400">Newly registered stores will appear here.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {dbShops.map((shop) => (
                  <div
                    key={shop.id}
                    onClick={() => {
                      setSelectedStore(shop);
                      navigateToScreen('store-details');
                    }}
                    className="p-5 bg-white rounded-2xl border border-gray-200/80 shadow-xs flex items-center justify-between cursor-pointer hover:border-blue-300 transition"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-12 h-12 rounded-2xl bg-[#0066FF] text-white font-bold flex items-center justify-center shrink-0">
                        <Store className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-gray-950 flex items-center gap-1">
                          <span>{shop.name}</span>
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#34C759]" />
                        </h4>
                        <p className="text-[11px] text-gray-500 mt-0.5">{shop.address || 'Coimbatore'}</p>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-extrabold text-[#0066FF]">{formatDistance(shop.distanceKm)}</span>
                      <p className="text-[10px] text-[#34C759] font-bold">Open</p>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>

        {/* Mobile Bottom Navigation */}
        <div className="md:hidden">
          <BottomNav active="search" onNavigate={(tab) => navigateToScreen(tab as CustomerScreenType)} />
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCREEN 8: REQUESTS & HOLDS
  // ══════════════════════════════════════════════════════════════════════════
  if (customerScreen === 'requests') {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between select-none animate-in fade-in duration-200">
        {renderDesktopHeader()}

        <div className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 pb-24 space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-gray-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h1 className="text-xl font-extrabold text-[#0B132B]">Physical Shelf Holds & Requests</h1>
                <p className="text-xs text-gray-500">Track reservations and ask nearby stores directly</p>
              </div>
            </div>

            {/* Active Hold */}
            {activeHold && (
              <div className="bg-emerald-50/50 rounded-2xl p-5 border border-emerald-200 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#34C759] bg-emerald-100 px-3 py-1 rounded-full">
                    Active Shelf Hold
                  </span>
                  <span className="text-xs font-mono font-bold text-gray-700">
                    Expires {activeHold.reservedUntil}
                  </span>
                </div>
                <div>
                  <h4 className="text-base font-black text-gray-900">{activeHold.productName}</h4>
                  <p className="text-xs text-gray-600">{activeHold.storeName} • {activeHold.storeAddress}</p>
                  <p className="text-base font-black text-[#0066FF] mt-1">₹{activeHold.price.toLocaleString('en-IN')}</p>
                </div>
                <div className="flex items-center justify-center p-4 bg-white rounded-2xl border border-gray-200">
                  <StandardQRCode value={activeHold.qrCode} size={130} />
                </div>
              </div>
            )}

            {/* Broadcast Form */}
            <div className="space-y-3 pt-2">
              <h3 className="text-sm font-bold text-gray-900">Broadcast Inquiry to Nearby Stores</h3>
              <form onSubmit={handleBroadcastAsk} className="space-y-3">
                <input
                  type="text"
                  placeholder="e.g. Nike Air Zoom Pegasus Size 9"
                  value={askProductName}
                  onChange={(e) => setAskProductName(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-xs text-gray-900 outline-hidden focus:border-[#0066FF]"
                />
                <input
                  type="text"
                  placeholder="Additional color / spec details (optional)"
                  value={askVariant}
                  onChange={(e) => setAskVariant(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-xs text-gray-900 outline-hidden focus:border-[#0066FF]"
                />
                <button
                  type="submit"
                  disabled={isBroadcasting || !askProductName.trim()}
                  className="w-full bg-[#0066FF] hover:bg-[#0052CC] text-white py-3 rounded-full font-bold text-xs transition disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {isBroadcasting ? 'Broadcasting to local stores...' : 'Send Broadcast to Local Stores'}
                </button>
                {broadcastDone && (
                  <p className="text-center text-xs text-[#34C759] font-bold">
                    ✓ Request broadcasted! Stores will reply with live shelf availability.
                  </p>
                )}
              </form>
            </div>
          </div>
        </div>

        {/* Mobile Bottom Navigation */}
        <div className="md:hidden">
          <BottomNav active="requests" onNavigate={(tab) => navigateToScreen(tab as CustomerScreenType)} />
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCREEN 9: STORES DIRECTORY
  // ══════════════════════════════════════════════════════════════════════════
  if (customerScreen === 'stores') {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between select-none animate-in fade-in duration-200">
        {renderDesktopHeader()}

        <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 pb-24 space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-gray-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h1 className="text-xl font-extrabold text-[#0B132B]">Physical Retail Stores</h1>
                <p className="text-xs text-gray-500">Verified physical stores in your area</p>
              </div>
              <span className="text-xs font-bold text-[#0066FF] bg-blue-50 px-3 py-1 rounded-full">
                {dbShops.length} Stores Listed
              </span>
            </div>

            {dbShops.length === 0 ? (
              <div className="py-16 text-center space-y-2">
                <Store className="w-12 h-12 mx-auto text-gray-300" />
                <p className="text-sm font-bold text-gray-700">No stores found nearby</p>
                <p className="text-xs text-gray-400">Newly onboarded stores will appear here.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {dbShops.map((shop) => (
                  <div
                    key={shop.id}
                    onClick={() => {
                      setSelectedStore(shop);
                      navigateToScreen('store-details');
                    }}
                    className="p-5 bg-gray-50/70 hover:bg-gray-100/70 rounded-2xl border border-gray-200/80 shadow-2xs flex items-center justify-between cursor-pointer transition"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-12 h-12 rounded-2xl bg-[#0066FF] text-white font-bold flex items-center justify-center shrink-0">
                        <Store className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-gray-950 flex items-center gap-1">
                          <span>{shop.name}</span>
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#34C759]" />
                        </h4>
                        <p className="text-[11px] text-gray-500 mt-0.5">{shop.address || 'Coimbatore'}</p>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-extrabold text-[#0066FF]">{formatDistance(shop.distanceKm)}</span>
                      <p className="text-[10px] text-[#34C759] font-bold mt-0.5">Open Now</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Mobile Bottom Navigation */}
        <div className="md:hidden">
          <BottomNav active="stores" onNavigate={(tab) => navigateToScreen(tab as CustomerScreenType)} />
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCREEN 10: CUSTOMER PROFILE
  // ══════════════════════════════════════════════════════════════════════════
  if (customerScreen === 'profile') {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between select-none animate-in fade-in duration-200">
        {renderDesktopHeader()}

        <div className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 py-6 pb-24 space-y-4">
          <div className="bg-white rounded-3xl p-6 border border-gray-200/80 shadow-xs flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-[#0066FF] text-white font-bold text-xl flex items-center justify-center shrink-0">
              {userProfile?.name ? userProfile.name.charAt(0) : 'S'}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-bold text-gray-950 truncate">
                {userProfile?.name || 'Customer Shopper'}
              </h3>
              <p className="text-xs text-gray-500 truncate">{userProfile?.email || 'shopper@zooner.app'}</p>
            </div>
            {onOpenExperienceSwitcher && (
              <ExperienceHeaderPill currentExperience="customer" onClick={onOpenExperienceSwitcher} />
            )}
          </div>

          <div className="bg-white rounded-3xl p-6 border border-gray-200/80 shadow-xs space-y-3">
            <div className="bg-blue-50/80 border border-blue-200 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-blue-950">Store Owner?</h4>
                <p className="text-[11px] text-blue-700">Manage your physical store and list products</p>
              </div>
              <button
                type="button"
                onClick={onNavigateToVendor}
                className="px-4 py-2 bg-[#0066FF] text-white rounded-xl text-xs font-bold hover:bg-[#0052CC] cursor-pointer"
              >
                Switch to Vendor
              </button>
            </div>

            <button
              type="button"
              onClick={() => onOpenSignIn('C')}
              className="w-full py-4 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-2xl text-xs font-bold text-gray-800 cursor-pointer text-left px-4 flex items-center justify-between transition"
            >
              <span>Sign In / Switch Account</span>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Mobile Bottom Navigation */}
        <div className="md:hidden">
          <BottomNav active="profile" onNavigate={(tab) => navigateToScreen(tab as CustomerScreenType)} />
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCREEN 3: CUSTOMER HOME (Default / Main discovery view)
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between select-none animate-in fade-in duration-200">
      {renderDesktopHeader()}

      {/* Main Discovery Content */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 pb-24 space-y-6">
        {/* Mobile Top Header */}
        <div className="md:hidden px-2 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#0066FF] flex items-center justify-center text-white shadow-sm">
              <Store className="w-4 h-4" />
            </div>
            <span className="text-xl font-black text-[#0B132B] tracking-tight">Zooner</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenLocationModal}
              className="flex items-center gap-1.5 text-xs font-bold text-gray-800 bg-white border border-gray-200 rounded-full px-3 py-1.5 transition cursor-pointer"
            >
              <MapPin className="w-3.5 h-3.5 text-[#0066FF]" />
              <span className="truncate max-w-[120px]">{currentLocation.city || 'Location'}</span>
              <ChevronDown className="w-3 h-3 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Mobile Search Bar */}
        <div className="md:hidden">
          <div
            onClick={() => navigateToScreen('search')}
            className="w-full bg-white border border-gray-200/80 rounded-full py-3 px-4 flex items-center gap-3 cursor-pointer shadow-2xs"
          >
            <Search className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="text-xs text-gray-400">Search for products, brands or stores...</span>
          </div>
        </div>

        {/* Horizontal Category Row */}
        <div className="bg-white rounded-3xl p-5 border border-gray-200/80 shadow-2xs">
          <h3 className="text-xs font-extrabold text-gray-900 mb-3 uppercase tracking-wider">Explore Categories</h3>
          <div className="flex items-center gap-3 overflow-x-auto no-scrollbar pb-1">
            <button
              type="button"
              onClick={() => {
                setSelectedCategory('all');
                navigateToScreen('search');
              }}
              className="flex flex-col items-center gap-1.5 min-w-[70px] cursor-pointer group"
            >
              <div className="w-14 h-14 rounded-2xl bg-blue-50 group-hover:bg-blue-100 flex items-center justify-center text-[#0066FF] transition">
                <LayoutGrid className="w-6 h-6" />
              </div>
              <span className="text-xs font-bold text-gray-700">All</span>
            </button>

            {dbCategories.map((cat, idx) => {
              const colors = ['bg-rose-50 text-rose-500', 'bg-blue-50 text-blue-600', 'bg-amber-50 text-amber-600', 'bg-emerald-50 text-emerald-600', 'bg-purple-50 text-purple-600'];
              const colorCls = colors[idx % colors.length];

              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setSelectedCategory(cat.name);
                    navigateToScreen('search');
                  }}
                  className="flex flex-col items-center gap-1.5 min-w-[70px] cursor-pointer group"
                >
                  <div className={`w-14 h-14 rounded-2xl ${colorCls} flex items-center justify-center transition shadow-2xs`}>
                    <Package className="w-6 h-6" />
                  </div>
                  <span className="text-xs font-bold text-gray-700 truncate max-w-[80px] text-center">{cat.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Section: Popular Products Nearby */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black text-gray-950">Nearby Products</h2>
              <p className="text-xs text-gray-500">Live items available on nearby store shelves</p>
            </div>
            <button
              type="button"
              onClick={() => navigateToScreen('search')}
              className="text-xs font-bold text-[#0066FF] hover:underline cursor-pointer"
            >
              View All ({dbProducts.length}) →
            </button>
          </div>

          {isLoadingData ? (
            <div className="py-12 text-center text-gray-400">
              <Loader2 className="w-8 h-8 mx-auto animate-spin text-[#0066FF] mb-2" />
              <p className="text-xs">Finding items near you...</p>
            </div>
          ) : dbProducts.length === 0 ? (
            <div className="bg-white rounded-3xl p-10 text-center border border-gray-200/80 shadow-xs space-y-2">
              <PackageOpen className="w-10 h-10 mx-auto text-gray-300" />
              <p className="text-xs font-bold text-gray-700">No physical products listed nearby yet</p>
              <p className="text-[11px] text-gray-400 max-w-sm mx-auto">
                Use "Ask Store" to query local stores directly about any product.
              </p>
              <button
                type="button"
                onClick={() => navigateToScreen('requests')}
                className="mt-2 px-4 py-2 bg-[#0066FF] text-white rounded-full text-xs font-bold hover:bg-[#0052CC] cursor-pointer"
              >
                Ask Stores Directly
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {dbProducts.slice(0, 12).map((prod) => (
                <div
                  key={prod.id}
                  onClick={() => {
                    setSelectedProduct(prod);
                    navigateToScreen('product-details');
                  }}
                  className="bg-white rounded-2xl border border-gray-200/80 p-3 flex flex-col justify-between hover:border-blue-300 hover:shadow-md transition cursor-pointer shadow-2xs space-y-2"
                >
                  <div className="w-full h-28 rounded-xl bg-gray-50 flex items-center justify-center overflow-hidden p-1">
                    {prod.imageUrl ? (
                      <img src={prod.imageUrl} alt={prod.name} className="max-h-full max-w-full object-contain" />
                    ) : (
                      <PackageOpen className="w-8 h-8 text-gray-300" />
                    )}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-gray-900 truncate">{prod.name}</h4>
                    <p className="text-xs font-extrabold text-[#0B132B] mt-1">
                      ₹{(prod.lowestPrice || prod.minPrice || 0).toLocaleString('en-IN')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section: Nearby Stores */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black text-gray-950">Nearby Physical Stores</h2>
              <p className="text-xs text-gray-500">Retailers near {currentLocation.name || 'you'}</p>
            </div>
            <button
              type="button"
              onClick={() => navigateToScreen('stores')}
              className="text-xs font-bold text-[#0066FF] hover:underline cursor-pointer"
            >
              View All ({dbShops.length}) →
            </button>
          </div>

          {dbShops.length === 0 ? (
            <div className="bg-white rounded-3xl p-10 text-center border border-gray-200/80 shadow-xs space-y-2">
              <Store className="w-10 h-10 mx-auto text-gray-300" />
              <p className="text-xs font-bold text-gray-700">No stores registered in your immediate area</p>
              <p className="text-[11px] text-gray-400">Newly registered stores will be shown here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {dbShops.slice(0, 8).map((shop) => (
                <div
                  key={shop.id}
                  onClick={() => {
                    setSelectedStore(shop);
                    navigateToScreen('store-details');
                  }}
                  className="bg-white rounded-2xl border border-gray-200/80 p-4 hover:border-blue-300 hover:shadow-md transition cursor-pointer shadow-2xs flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-xl bg-[#0066FF] text-white font-bold flex items-center justify-center shrink-0">
                      <Store className="w-6 h-6" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-gray-900 truncate">{shop.name}</h4>
                      <p className="text-[11px] text-gray-500 truncate">{shop.address || 'Coimbatore'}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs font-bold text-[#0066FF]">{formatDistance(shop.distanceKm)}</span>
                    <p className="text-[10px] text-[#34C759] font-bold">Open</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Mobile Bottom Navigation */}
      <div className="md:hidden">
        <BottomNav active="home" onNavigate={(tab) => navigateToScreen(tab as CustomerScreenType)} />
      </div>
    </div>
  );
};

// ── BOTTOM NAVIGATION COMPONENT (Mobile only) ──
const BottomNav: React.FC<{
  active: 'home' | 'search' | 'requests' | 'stores' | 'profile';
  onNavigate: (tab: string) => void;
}> = ({ active, onNavigate }) => {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-gray-200/80 flex items-center justify-around py-2 px-1 z-30 shadow-[0_-2px_12px_rgba(0,0,0,0.03)] max-w-lg mx-auto">
      <button
        type="button"
        onClick={() => onNavigate('home')}
        className={`flex flex-col items-center gap-1 transition cursor-pointer py-1 px-3 ${
          active === 'home' ? 'text-[#0066FF] font-bold' : 'text-gray-400 hover:text-gray-700'
        }`}
      >
        <HomeIcon className="w-5 h-5" />
        <span className="text-[10px]">Home</span>
      </button>

      <button
        type="button"
        onClick={() => onNavigate('search')}
        className={`flex flex-col items-center gap-1 transition cursor-pointer py-1 px-3 ${
          active === 'search' ? 'text-[#0066FF] font-bold' : 'text-gray-400 hover:text-gray-700'
        }`}
      >
        <Search className="w-5 h-5" />
        <span className="text-[10px]">Explore</span>
      </button>

      <button
        type="button"
        onClick={() => onNavigate('requests')}
        className={`flex flex-col items-center gap-1 transition cursor-pointer py-1 px-3 ${
          active === 'requests' ? 'text-[#0066FF] font-bold' : 'text-gray-400 hover:text-gray-700'
        }`}
      >
        <Radio className="w-5 h-5" />
        <span className="text-[10px]">Requests</span>
      </button>

      <button
        type="button"
        onClick={() => onNavigate('stores')}
        className={`flex flex-col items-center gap-1 transition cursor-pointer py-1 px-3 ${
          active === 'stores' ? 'text-[#0066FF] font-bold' : 'text-gray-400 hover:text-gray-700'
        }`}
      >
        <Store className="w-5 h-5" />
        <span className="text-[10px]">Stores</span>
      </button>

      <button
        type="button"
        onClick={() => onNavigate('profile')}
        className={`flex flex-col items-center gap-1 transition cursor-pointer py-1 px-3 ${
          active === 'profile' ? 'text-[#0066FF] font-bold' : 'text-gray-400 hover:text-gray-700'
        }`}
      >
        <User className="w-5 h-5" />
        <span className="text-[10px]">Profile</span>
      </button>
    </div>
  );
};
