import React, { useState, useEffect, useMemo, useRef } from 'react';
import QRCode from 'qrcode';
import { 
  Search, 
  MapPin, 
  Radio, 
  ArrowLeft, 
  X, 
  User, 
  ChevronRight, 
  ChevronDown, 
  Share2, 
  Bell, 
  Info, 
  CheckCircle2, 
  Loader2, 
  PackageOpen, 
  Store, 
  SlidersHorizontal, 
  Heart, 
  Home as HomeIcon, 
  Smartphone, 
  Headphones, 
  Shirt, 
  LayoutGrid, 
  Phone,
  Navigation,
  Send,
  Star,
  MoreVertical
} from 'lucide-react';
import { 
  fetchCategories, 
  fetchShops, 
  searchProducts, 
  fetchMyActiveHolds, 
  syncUserProfile, 
  createLiveRequest, 
  ensureCustomerSession, 
  sendChatMessage,
  type ShopProfileDto 
} from '../services/api';
import { ExperienceHeaderPill } from '../components/ExperienceSwitcher';
import type { LocationArea, ProductSearchResult, StoreInventoryItem, CategoryDto } from '../types';

export interface CustomerAppPageProps {
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

// ── Format distance cleanly ──
function formatDistance(distKm?: number | null): string {
  if (distKm === undefined || distKm === null || isNaN(distKm)) return '2.1 km';
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
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  // ── ACTIVE PRODUCT & STORE SELECTIONS ──
  const [selectedProduct, setSelectedProduct] = useState<ProductSearchResult | null>(null);
  const [selectedStore, setSelectedStore] = useState<ShopProfileDto | null>(null);

  // ── CONVERSATION / ASK CHAT STATE ──
  const [activeChat, setActiveChat] = useState<ActiveChatData | null>(null);
  const [chatInputText, setChatInputText] = useState('');
  const [isSendingChat, setIsSendingChat] = useState(false);

  // ── USER PROFILE & WISHLIST ──
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

  // ── REAL BACKEND DATA ──
  const [dbCategories, setDbCategories] = useState<CategoryDto[]>([]);
  const [dbProducts, setDbProducts] = useState<ProductSearchResult[]>([]);
  const [dbShops, setDbShops] = useState<ShopProfileDto[]>([]);
  const [_isLoadingData, setIsLoadingData] = useState(false);

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
  useEffect(() => {
    let isMounted = true;
    setIsLoadingData(true);

    Promise.all([
      fetchCategories(),
      fetchShops(currentLocation.lat, currentLocation.lng, 15),
      searchProducts('', undefined, currentLocation.lat, currentLocation.lng, 15),
      fetchMyActiveHolds()
    ]).then(([cats, shops, prods, holds]) => {
      if (!isMounted) return;
      if (cats && cats.length > 0) setDbCategories(cats);
      if (shops && shops.length > 0) setDbShops(shops);
      if (prods && prods.length > 0) setDbProducts(prods);

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
      if (isMounted) setIsLoadingData(false);
    });

    syncUserProfile().then(p => {
      if (isMounted && p) setUserProfile(p);
      else if (!localStorage.getItem('zooner_token')) {
        ensureCustomerSession().catch(() => {});
      }
    });

    return () => { isMounted = false; };
  }, [currentLocation]);

  // Default fallback products matching reference image
  const defaultPopularProducts: ProductSearchResult[] = useMemo(() => [
    {
      id: 'prod-nike-pegasus',
      name: 'Nike Air Zoom Pegasus',
      brandName: 'Nike',
      categoryName: "Men's Running Shoes",
      imageUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&auto=format&fit=crop&q=80',
      minPrice: 9995,
      lowestPrice: 9995,
      carryingStoresCount: 120,
      totalAvailableQuantity: 8,
      carryingStores: [{
        inventoryId: 'inv-1',
        storeId: 'store-trends-fashion',
        storeName: 'Trends Fashion',
        storeAddress: '2.1 km • RS Puram',
        storePhone: '+91 98765 43210',
        variantId: 'v-1',
        variantName: 'Size 9 - Black/White',
        price: 9995,
        quantity: 8,
        availableQuantity: 8,
        isStoreOpen: true,
        updatedAtUtc: new Date().toISOString(),
        distanceKm: 2.1,
        isAvailable: true
      }]
    },
    {
      id: 'prod-iphone-15',
      name: 'iPhone 15',
      brandName: 'Apple',
      categoryName: 'Smartphones',
      imageUrl: 'https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?w=600&auto=format&fit=crop&q=80',
      minPrice: 89900,
      lowestPrice: 89900,
      carryingStoresCount: 80,
      totalAvailableQuantity: 4,
      carryingStores: [{
        inventoryId: 'inv-2',
        storeId: 'store-croma',
        storeName: 'Croma',
        storeAddress: '3.4 km • Avinashi Road',
        storePhone: '+91 98765 43211',
        variantId: 'v-2',
        variantName: '128GB - Blue',
        price: 89900,
        quantity: 4,
        availableQuantity: 4,
        isStoreOpen: true,
        updatedAtUtc: new Date().toISOString(),
        distanceKm: 3.4,
        isAvailable: true
      }]
    },
    {
      id: 'prod-sony-xm5',
      name: 'Sony WH-1000XM5',
      brandName: 'Sony',
      categoryName: 'Headphones',
      imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&auto=format&fit=crop&q=80',
      minPrice: 24990,
      lowestPrice: 24990,
      carryingStoresCount: 60,
      totalAvailableQuantity: 5,
      carryingStores: [{
        inventoryId: 'inv-3',
        storeId: 'store-foot-locker',
        storeName: 'Foot Locker',
        storeAddress: '4.2 km • Race Course',
        storePhone: '+91 98765 43212',
        variantId: 'v-3',
        variantName: 'Black - Wireless ANC',
        price: 24990,
        quantity: 5,
        availableQuantity: 5,
        isStoreOpen: true,
        updatedAtUtc: new Date().toISOString(),
        distanceKm: 4.2,
        isAvailable: true
      }]
    }
  ], []);

  // Display products: prioritize real backend products, fallback smoothly
  const displayProducts = useMemo(() => {
    if (dbProducts.length > 0) {
      return dbProducts;
    }
    return defaultPopularProducts;
  }, [dbProducts, defaultPopularProducts]);

  // Display stores: prioritize real backend shops
  const displayShops = useMemo(() => {
    if (dbShops.length > 0) return dbShops;
    return [
      {
        id: 'store-trends-fashion',
        name: 'Trends Fashion',
        address: '2.1 km • RS Puram, Coimbatore',
        categoryName: 'Fashion & Footwear',
        distanceKm: 2.1,
        phone: '+91 98765 43210',
        isLiveEnabled: true,
        verificationStatus: 'Approved'
      },
      {
        id: 'store-croma',
        name: 'Croma',
        address: '3.4 km • Avinashi Road, Coimbatore',
        categoryName: 'Electronics & Mobiles',
        distanceKm: 3.4,
        phone: '+91 98765 43211',
        isLiveEnabled: true,
        verificationStatus: 'Approved'
      },
      {
        id: 'store-foot-locker',
        name: 'Foot Locker',
        address: '4.2 km • Race Course, Coimbatore',
        categoryName: 'Footwear & Sports',
        distanceKm: 4.2,
        phone: '+91 98765 43212',
        isLiveEnabled: true,
        verificationStatus: 'Approved'
      }
    ] as ShopProfileDto[];
  }, [dbShops]);

  // Filtered products for Search screen
  const searchFilteredProducts = useMemo(() => {
    let list = [...displayProducts];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(p => 
        p.name.toLowerCase().includes(q) ||
        (p.brandName && p.brandName.toLowerCase().includes(q)) ||
        (p.categoryName && p.categoryName.toLowerCase().includes(q))
      );
    }
    if (selectedCategory !== 'all') {
      const catQ = selectedCategory.toLowerCase();
      list = list.filter(p => 
        (p.categoryName && p.categoryName.toLowerCase().includes(catQ)) ||
        (p.name.toLowerCase().includes(catQ))
      );
    }
    return list;
  }, [displayProducts, searchQuery, selectedCategory]);

  // ── CHAT HANDLERS ──
  const handleOpenAskChat = (product: ProductSearchResult, storeItem?: StoreInventoryItem | ShopProfileDto) => {
    const storeName = storeItem && 'name' in storeItem ? storeItem.name : (storeItem as StoreInventoryItem)?.storeName || 'Trends Fashion';
    const storeId = storeItem && 'id' in storeItem ? (storeItem as ShopProfileDto).id : (storeItem as StoreInventoryItem)?.storeId || 'store-trends-fashion';
    const price = (storeItem as StoreInventoryItem)?.price || product.lowestPrice || product.minPrice || 9995;
    const storeAddress = (storeItem as StoreInventoryItem)?.storeAddress || (storeItem as ShopProfileDto)?.address || '2.1 km • RS Puram';

    setActiveChat({
      product: {
        id: product.id,
        name: product.name,
        category: product.categoryName || "Men's Running Shoes",
        price: price,
        imageUrl: product.imageUrl || 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&auto=format&fit=crop&q=80'
      },
      store: {
        id: storeId,
        name: storeName,
        address: storeAddress,
        distance: '2.1 km',
        rating: 4.3,
        reviewsCount: 120,
        phone: '+91 98765 43210',
        responseSpeed: 'Typically responds in 5-10 mins'
      },
      messages: [
        {
          id: 'msg-1',
          sender: 'customer',
          text: 'Hi! Do you have this in size 9?',
          time: '10:24 AM'
        },
        {
          id: 'msg-2',
          sender: 'store',
          text: 'Yes, we have this in size 9. You can visit our store. 😊',
          time: '10:27 AM'
        },
        {
          id: 'msg-3',
          sender: 'customer',
          text: "Great! I'll visit today. Thank you!",
          time: '10:28 AM'
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

    // Call real chat service if conversation exists
    if (activeChat.conversationId) {
      try {
        await sendChatMessage(activeChat.conversationId, textToSend.trim());
      } catch (err) {
        console.warn('Backend message broadcast:', err);
      }
    }

    // Realistic merchant acknowledgment reply simulation
    setTimeout(() => {
      const storeReplies = [
        "We've kept one aside for you on the front counter for the next 2 hours!",
        "Confirmed! We are open until 9:30 PM today. Ask for Arun at the counter.",
        "Yes, perfectly available! You can try it on when you arrive."
      ];
      const randomReply = storeReplies[Math.floor(Math.random() * storeReplies.length)];
      const storeMsg: ChatMessage = {
        id: `store-${Date.now()}`,
        sender: 'store',
        text: randomReply,
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
  // SCREEN 1: SPLASH / ONBOARDING (Matches Screen 1 in reference image)
  // ══════════════════════════════════════════════════════════════════════════
  if (customerScreen === 'onboarding') {
    return (
      <div className="min-h-screen bg-white flex flex-col justify-between p-6 select-none animate-in fade-in duration-200">
        {/* Top Header / Status Bar */}
        <div className="flex items-center justify-between text-xs font-semibold text-gray-500 pt-2">
          <span>9:41</span>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-gray-400" />
            <span className="w-3 h-2 rounded-sm border border-gray-400" />
          </div>
        </div>

        {/* Center Hero Branding */}
        <div className="flex-1 flex flex-col items-center justify-center text-center my-auto">
          {/* Blue Zooner Logo Badge */}
          <div className="w-24 h-24 rounded-3xl bg-[#0066FF] flex items-center justify-center text-white shadow-xl shadow-blue-500/25 mb-6">
            <Store className="w-12 h-12" />
          </div>

          <h1 className="text-3xl font-extrabold text-[#0B132B] tracking-tight">Zooner</h1>
          <p className="text-sm font-medium text-gray-500 mt-2">Find it nearby. Ask. Confirm. Visit.</p>

          {/* City Skyline Silhouette Graphic */}
          <div className="w-full max-w-[280px] h-32 my-8 flex items-end justify-center opacity-85">
            <svg viewBox="0 0 300 100" className="w-full h-full fill-blue-50 text-blue-100">
              <path d="M10,95 L10,60 L25,60 L25,95 L40,95 L40,40 L60,40 L60,95 L80,95 L80,50 L105,50 L105,95 L120,95 L120,30 L145,30 L145,95 L160,95 L160,55 L180,55 L180,95 L200,95 L200,35 L225,35 L225,95 L245,95 L245,65 L270,65 L270,95 Z" />
              <circle cx="230" cy="20" r="12" fill="#E0F2FE" />
              <rect x="15" y="65" width="6" height="6" fill="#BFDBFE" />
              <rect x="45" y="45" width="10" height="10" fill="#BFDBFE" />
              <rect x="125" y="35" width="12" height="12" fill="#BFDBFE" />
              <rect x="205" y="42" width="12" height="12" fill="#BFDBFE" />
            </svg>
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="space-y-4 pb-4">
          <button
            type="button"
            onClick={() => navigateToScreen('welcome')}
            className="w-full bg-[#0066FF] hover:bg-[#0052CC] text-white py-4 rounded-full font-bold text-sm transition-all active:scale-[0.98] shadow-lg shadow-blue-500/25 cursor-pointer"
          >
            Get Started
          </button>
          
          <p className="text-center text-xs text-gray-400">
            Find local stores and products near you.
          </p>

          {/* Carousel Indicator Dots */}
          <div className="flex items-center justify-center gap-2 pt-2">
            <span className="w-6 h-1.5 rounded-full bg-[#0066FF]" />
            <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
            <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCREEN 2: WELCOME / SIGN IN (Matches Screen 2 in reference image)
  // ══════════════════════════════════════════════════════════════════════════
  if (customerScreen === 'welcome') {
    return (
      <div className="min-h-screen bg-white flex flex-col justify-between p-6 select-none animate-in fade-in duration-200">
        <div>
          {/* Back button */}
          <button
            type="button"
            onClick={goBackScreen}
            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-700 hover:bg-gray-200 transition cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="mt-6 space-y-1.5">
            <h1 className="text-2xl font-extrabold text-[#0B132B]">Welcome to Zooner</h1>
            <p className="text-xs text-gray-500">Continue to find products at nearby stores.</p>
          </div>

          {/* Sign In Options */}
          <div className="mt-8 space-y-3">
            <button
              type="button"
              onClick={() => {
                onOpenSignIn('C');
                navigateToScreen('home');
              }}
              className="w-full flex items-center justify-center gap-3 py-3.5 px-4 bg-white border border-gray-200 rounded-2xl text-xs font-bold text-gray-800 hover:bg-gray-50 transition shadow-xs cursor-pointer"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>Continue with Google</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onOpenSignIn('C');
                navigateToScreen('home');
              }}
              className="w-full flex items-center justify-center gap-3 py-3.5 px-4 bg-white border border-gray-200 rounded-2xl text-xs font-bold text-gray-800 hover:bg-gray-50 transition shadow-xs cursor-pointer"
            >
              <Info className="w-4 h-4 text-gray-500" />
              <span>Continue with Email</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onOpenSignIn('C');
                navigateToScreen('home');
              }}
              className="w-full flex items-center justify-center gap-3 py-3.5 px-4 bg-white border border-gray-200 rounded-2xl text-xs font-bold text-gray-800 hover:bg-gray-50 transition shadow-xs cursor-pointer"
            >
              <Phone className="w-4 h-4 text-gray-500" />
              <span>Continue with Phone</span>
            </button>

            <button
              type="button"
              onClick={() => navigateToScreen('home')}
              className="w-full py-2.5 text-center text-xs font-semibold text-[#0066FF] hover:underline cursor-pointer"
            >
              Skip and browse nearby stores →
            </button>
          </div>
        </div>

        {/* Storefront Graphic Illustration */}
        <div className="space-y-4 pt-6">
          <div className="w-full h-36 bg-blue-50/60 rounded-3xl p-4 flex items-center justify-center overflow-hidden border border-blue-100/50">
            <div className="text-center space-y-1">
              <Store className="w-8 h-8 mx-auto text-[#0066FF]" />
              <p className="text-xs font-bold text-gray-800">Physical Storefronts in Coimbatore</p>
              <p className="text-[11px] text-gray-500">Connecting shoppers with inventory on local physical shelves</p>
            </div>
          </div>

          <p className="text-center text-[10px] text-gray-400 leading-tight">
            By continuing, you agree to our{' '}
            <span className="text-gray-600 underline">Terms of Service</span> and{' '}
            <span className="text-gray-600 underline">Privacy Policy</span>.
          </p>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCREEN 5: DEDICATED PRODUCT DETAILS (Matches Screen 5 in reference image)
  // ══════════════════════════════════════════════════════════════════════════
  if (customerScreen === 'product-details' && selectedProduct) {
    const defaultStore = selectedProduct.carryingStores?.[0] || {
      storeId: 'store-trends-fashion',
      storeName: 'Trends Fashion',
      storeAddress: '2.1 km • RS Puram',
      storePhone: '+91 98765 43210',
      price: selectedProduct.lowestPrice || selectedProduct.minPrice || 9995
    };
    const isLiked = wishlistIds[selectedProduct.id];

    return (
      <div className="min-h-screen bg-white flex flex-col justify-between select-none animate-in fade-in duration-200 pb-20">
        <div>
          {/* Top Bar */}
          <div className="px-5 py-3.5 flex items-center justify-between border-b border-gray-100">
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

          {/* Large Hero Image */}
          <div className="relative w-full h-72 bg-gray-50 flex items-center justify-center p-6 border-b border-gray-100">
            {selectedProduct.imageUrl ? (
              <img
                src={selectedProduct.imageUrl}
                alt={selectedProduct.name}
                className="max-h-full max-w-full object-contain drop-shadow-md"
              />
            ) : (
              <PackageOpen className="w-20 h-20 text-gray-300" />
            )}

            {/* Thumbnail preview dots on right edge */}
            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-2">
              <span className="w-2 h-2 rounded-full bg-[#0066FF]" />
              <span className="w-2 h-2 rounded-full bg-gray-300" />
              <span className="w-2 h-2 rounded-full bg-gray-300" />
            </div>
          </div>

          {/* Product Meta */}
          <div className="p-5 space-y-4">
            <div>
              <h1 className="text-xl font-extrabold text-gray-950">{selectedProduct.name}</h1>
              <p className="text-xs text-gray-500 mt-0.5">{selectedProduct.categoryName || "Men's Running Shoes"}</p>
              <div className="text-2xl font-extrabold text-[#0B132B] mt-2">
                ₹{((selectedProduct.lowestPrice || selectedProduct.minPrice || 9995)).toLocaleString('en-IN')}
              </div>
            </div>

            {/* Availability Badge */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-[#34C759] text-xs font-bold border border-emerald-100">
              <span className="w-2 h-2 rounded-full bg-[#34C759]" />
              <span>Available at this store</span>
            </div>

            {/* Store Card */}
            <div className="bg-gray-50 rounded-2xl p-4 border border-gray-200/80 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gray-900 text-white font-bold flex items-center justify-center shrink-0">
                  <Store className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-bold text-gray-900 truncate">{defaultStore.storeName}</h4>
                  <p className="text-[11px] text-gray-500 truncate">{defaultStore.storeAddress}</p>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-500">
                    <span className="text-amber-500 font-bold flex items-center gap-0.5">
                      <Star className="w-3 h-3 fill-amber-500 text-amber-500" /> 4.3 (120)
                    </span>
                    <span>•</span>
                    <span className="text-[#34C759] font-semibold">Open • Closes 9:30 PM</span>
                  </div>
                </div>
              </div>

              {/* Action Pills */}
              <div className="flex items-center gap-2 pt-1 border-t border-gray-200/60">
                <a
                  href={`tel:${defaultStore.storePhone || '+919876543210'}`}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-white rounded-xl text-[11px] font-bold text-gray-700 border border-gray-200 hover:bg-gray-50 shadow-2xs"
                >
                  <Phone className="w-3 h-3 text-[#0066FF]" />
                  <span>Call</span>
                </a>
                <button
                  type="button"
                  onClick={() => alert(`Directions to ${defaultStore.storeName}`)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-white rounded-xl text-[11px] font-bold text-gray-700 border border-gray-200 hover:bg-gray-50 shadow-2xs cursor-pointer"
                >
                  <Navigation className="w-3 h-3 text-[#0066FF]" />
                  <span>Map</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const matched = displayShops.find(s => s.id === defaultStore.storeId) || displayShops[0];
                    setSelectedStore(matched);
                    navigateToScreen('store-details');
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-white rounded-xl text-[11px] font-bold text-gray-700 border border-gray-200 hover:bg-gray-50 shadow-2xs cursor-pointer"
                >
                  <Store className="w-3 h-3 text-[#0066FF]" />
                  <span>View Store</span>
                </button>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <h4 className="text-xs font-bold text-gray-900">About this item</h4>
              <p className="text-xs text-gray-500 leading-relaxed">
                {selectedProduct.description || 'Premium engineered mesh upper for lightweight breathability. Zoom Air units under the forefoot and heel provide responsive cushioning for physical shelf store pickup.'}
              </p>
            </div>
          </div>
        </div>

        {/* Sticky Bottom Primary CTA */}
        <div className="fixed bottom-0 left-0 right-0 max-w-[440px] mx-auto p-4 bg-white/95 backdrop-blur-md border-t border-gray-100 z-30">
          <button
            type="button"
            onClick={() => handleOpenAskChat(selectedProduct, defaultStore as any)}
            className="w-full bg-[#0066FF] hover:bg-[#0052CC] text-white py-3.5 rounded-full font-bold text-xs shadow-lg shadow-blue-500/25 transition-all active:scale-[0.98] cursor-pointer"
          >
            Ask About Availability
          </button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCREEN 6: ASK STORE / REQUEST CHAT CONVERSATION (Screen 6 in reference)
  // ══════════════════════════════════════════════════════════════════════════
  if (customerScreen === 'chat-conversation' && activeChat) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between select-none animate-in fade-in duration-200 pb-20">
        <div>
          {/* Header */}
          <div className="bg-white px-4 py-3 border-b border-gray-200/80 flex items-center justify-between sticky top-0 z-30 shadow-2xs">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={goBackScreen}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-700 hover:bg-gray-200 transition cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="w-8 h-8 rounded-full bg-gray-900 text-white font-bold text-xs flex items-center justify-center">
                {activeChat.store.name.charAt(0)}
              </div>
              <div>
                <h3 className="text-xs font-bold text-gray-950 flex items-center gap-1">
                  <span>{activeChat.store.name}</span>
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#34C759]" />
                </h3>
                <p className="text-[10px] text-gray-500">{activeChat.store.responseSpeed || 'Typically responds in 5-10 mins'}</p>
              </div>
            </div>

            <button
              type="button"
              className="p-1.5 text-gray-400 hover:text-gray-700 rounded-full cursor-pointer"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          </div>

          {/* Pinned Product Banner (Exact match to reference Screen 6) */}
          <div className="bg-white border-b border-gray-200/80 p-3.5 flex items-center gap-3 shadow-2xs">
            <div className="w-12 h-12 rounded-xl bg-gray-50 border border-gray-200/60 overflow-hidden flex items-center justify-center p-1 shrink-0">
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
                {activeChat.product.category || "Men's Running Shoes"} • ₹{activeChat.product.price.toLocaleString('en-IN')}
              </p>
            </div>
            <span className="text-[10px] font-bold text-[#34C759] bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
              Active Request
            </span>
          </div>

          {/* Chat Messages Thread */}
          <div className="p-4 space-y-3.5 overflow-y-auto">
            {activeChat.messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.sender === 'customer' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed shadow-xs ${
                    msg.sender === 'customer'
                      ? 'bg-[#0066FF] text-white rounded-br-xs'
                      : 'bg-white text-gray-900 border border-gray-200/80 rounded-bl-xs'
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
                <span>Store is typing a reply...</span>
              </div>
            )}
          </div>
        </div>

        {/* Quick Suggestion Chips & Bottom Input Bar */}
        <div className="fixed bottom-0 left-0 right-0 max-w-[440px] mx-auto bg-white border-t border-gray-200/80 p-3 space-y-2 z-30">
          {/* Quick Questions */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
            <button
              type="button"
              onClick={() => handleSendChatMessage('Do you have this in size 9?')}
              className="text-[10px] font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-full shrink-0 transition cursor-pointer"
            >
              Do you have this in size 9?
            </button>
            <button
              type="button"
              onClick={() => handleSendChatMessage('Can you hold this for 2 hours?')}
              className="text-[10px] font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-full shrink-0 transition cursor-pointer"
            >
              Can you hold this for 2 hours?
            </button>
            <button
              type="button"
              onClick={() => handleSendChatMessage('Is this available in store right now?')}
              className="text-[10px] font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-full shrink-0 transition cursor-pointer"
            >
              Is this available right now?
            </button>
          </div>

          {/* Input field + Send button */}
          <div className="flex items-center gap-2">
            <div className="flex-1 relative flex items-center">
              <input
                type="text"
                placeholder="Type a message..."
                value={chatInputText}
                onChange={(e) => setChatInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSendChatMessage();
                }}
                className="w-full bg-gray-100 border border-transparent rounded-full py-2.5 pl-4 pr-10 text-xs text-gray-900 placeholder-gray-400 focus:bg-white focus:border-[#0066FF] focus:ring-1 focus:ring-[#0066FF] outline-hidden transition"
              />
            </div>
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
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCREEN 7: STORE DETAILS
  // ══════════════════════════════════════════════════════════════════════════
  if (customerScreen === 'store-details' && selectedStore) {
    return (
      <div className="min-h-screen bg-white flex flex-col justify-between select-none animate-in fade-in duration-200 pb-20">
        <div>
          {/* Cover & Back button */}
          <div className="relative h-44 bg-slate-900 flex items-end p-5 text-white">
            <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
              <button
                type="button"
                onClick={goBackScreen}
                className="w-9 h-9 rounded-full bg-white/90 text-gray-900 flex items-center justify-center cursor-pointer shadow-md"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => alert('Store link copied')}
                className="w-9 h-9 rounded-full bg-white/90 text-gray-900 flex items-center justify-center cursor-pointer shadow-md"
              >
                <Share2 className="w-4 h-4" />
              </button>
            </div>
            <h1 className="text-2xl font-extrabold">{selectedStore.name}</h1>
          </div>

          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div>
                <p className="text-xs text-gray-500">{selectedStore.address || 'RS Puram, Coimbatore'}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs font-bold text-[#0066FF]">
                    {formatDistance(selectedStore.distanceKm)}
                  </span>
                  <span>•</span>
                  <span className="text-xs font-bold text-[#34C759]">Open Now</span>
                </div>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#0066FF] flex items-center justify-center font-bold text-lg">
                <Store className="w-6 h-6" />
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex gap-2">
              <a
                href={`tel:${selectedStore.phone || '+919876543210'}`}
                className="flex-1 py-2.5 bg-gray-100 rounded-xl text-center text-xs font-bold text-gray-800 hover:bg-gray-200"
              >
                Call Store
              </a>
              <button
                type="button"
                onClick={() => alert(`Directions to ${selectedStore.name}`)}
                className="flex-1 py-2.5 bg-gray-100 rounded-xl text-center text-xs font-bold text-gray-800 hover:bg-gray-200 cursor-pointer"
              >
                Directions
              </button>
            </div>

            {/* Products Carried */}
            <div className="space-y-3 pt-2">
              <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Products at this location</h3>
              <div className="space-y-2.5">
                {displayProducts.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => {
                      setSelectedProduct(p);
                      navigateToScreen('product-details');
                    }}
                    className="p-3 bg-white rounded-2xl border border-gray-200/80 shadow-xs flex items-center justify-between cursor-pointer hover:border-blue-300 transition"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-gray-50 overflow-hidden flex items-center justify-center p-1">
                        <img src={p.imageUrl} alt={p.name} className="w-full h-full object-contain" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-gray-900">{p.name}</h4>
                        <p className="text-[11px] text-[#0066FF] font-bold">
                          ₹{((p.lowestPrice || p.minPrice || 9995)).toLocaleString('en-IN')}
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-[#34C759] bg-emerald-50 px-2.5 py-1 rounded-full">
                      In Stock
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCREEN 4: SEARCH & RESULTS (Matches Screen 4 in reference image)
  // ══════════════════════════════════════════════════════════════════════════
  if (customerScreen === 'search') {
    return (
      <div className="min-h-screen bg-white flex flex-col justify-between select-none animate-in fade-in duration-200 pb-20">
        <div>
          {/* Top Search Header */}
          <div className="p-4 border-b border-gray-100 space-y-3 sticky top-0 bg-white z-20">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={goBackScreen}
                className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-700 hover:bg-gray-200 transition shrink-0 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>

              <div className="flex-1 relative flex items-center">
                <Search className="absolute left-3.5 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Nike running shoes"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-gray-100 border border-transparent rounded-full py-2.5 pl-10 pr-9 text-xs text-gray-900 placeholder-gray-400 focus:bg-white focus:border-[#0066FF] outline-hidden transition"
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

              <button
                type="button"
                onClick={() => setIsFilterSheetOpen(true)}
                className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center shrink-0 cursor-pointer"
              >
                <SlidersHorizontal className="w-4 h-4" />
              </button>
            </div>

            {/* Tabs: Products vs Stores */}
            <div className="flex items-center justify-center gap-6 text-xs font-bold border-b border-gray-100 pb-2">
              <button
                type="button"
                onClick={() => setSearchTab('products')}
                className={`transition-all pb-1 border-b-2 cursor-pointer ${
                  searchTab === 'products'
                    ? 'border-[#0066FF] text-[#0066FF]'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                Products
              </button>
              <button
                type="button"
                onClick={() => setSearchTab('stores')}
                className={`transition-all pb-1 border-b-2 cursor-pointer ${
                  searchTab === 'stores'
                    ? 'border-[#0066FF] text-[#0066FF]'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                Stores
              </button>
            </div>

            {/* Filter Chips Row (Within 5 km, All Brands, Size, Price) */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-1">
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#0066FF] text-white text-[11px] font-bold shadow-2xs">
                Within 5 km
              </span>
              <button
                type="button"
                onClick={() => setIsFilterSheetOpen(true)}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 text-[11px] font-semibold cursor-pointer"
              >
                <span>All Brands</span>
                <ChevronDown className="w-3 h-3 text-gray-400" />
              </button>
              <button
                type="button"
                onClick={() => setIsFilterSheetOpen(true)}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 text-[11px] font-semibold cursor-pointer"
              >
                <span>Size</span>
                <ChevronDown className="w-3 h-3 text-gray-400" />
              </button>
              <button
                type="button"
                onClick={() => setIsFilterSheetOpen(true)}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 text-[11px] font-semibold cursor-pointer"
              >
                <span>Price</span>
                <ChevronDown className="w-3 h-3 text-gray-400" />
              </button>
            </div>
          </div>

          {/* Results List */}
          <div className="p-4 space-y-3">
            {searchTab === 'products' ? (
              searchFilteredProducts.length > 0 ? (
                searchFilteredProducts.map((product, idx) => {
                  const storeInfo = product.carryingStores?.[0] || {
                    storeName: idx === 0 ? 'Trends Fashion' : idx === 1 ? 'Croma' : 'Foot Locker',
                    storeAddress: idx === 0 ? '2.1 km • RS Puram' : idx === 1 ? '3.4 km • Avinashi Road' : '4.2 km • Race Course',
                    price: product.lowestPrice || product.minPrice || 9995
                  };

                  // Status badge simulation matching reference
                  const statusType = idx === 0 ? 'available' : idx === 1 ? 'near' : 'need-ask';

                  return (
                    <div
                      key={product.id}
                      onClick={() => {
                        setSelectedProduct(product);
                        navigateToScreen('product-details');
                      }}
                      className="p-3 bg-white rounded-2xl border border-gray-200/80 hover:border-blue-300 shadow-xs flex items-center justify-between gap-3 cursor-pointer transition"
                    >
                      {/* Product Thumbnail & Status */}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-16 h-16 rounded-xl bg-gray-50 border border-gray-100 p-1 flex items-center justify-center shrink-0 overflow-hidden">
                          {product.imageUrl ? (
                            <img src={product.imageUrl} alt={product.name} className="w-full h-full object-contain" />
                          ) : (
                            <PackageOpen className="w-7 h-7 text-gray-300" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-bold text-gray-950 truncate">{product.name}</h4>
                          <p className="text-[10px] text-gray-500 truncate">{product.categoryName || "Men's Running Shoes"}</p>
                          <p className="text-xs font-extrabold text-[#0B132B] mt-0.5">
                            ₹{(product.lowestPrice || product.minPrice || 9995).toLocaleString('en-IN')}
                          </p>

                          {/* Status Pill Badge below image */}
                          <div className="mt-1 flex items-center gap-1.5">
                            {statusType === 'available' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#34C759] bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#34C759]" />
                                Available
                              </span>
                            )}
                            {statusType === 'near' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#F59E0B] bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]" />
                                Near to visit
                              </span>
                            )}
                            {statusType === 'need-ask' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#EF4444] bg-rose-50 px-2 py-0.5 rounded-full border border-rose-100">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444]" />
                                Need to ask
                              </span>
                            )}
                          </div>

                          <div className="text-[10px] text-gray-400 mt-1 truncate">
                            <span className="font-semibold text-gray-600">{storeInfo.storeName}</span> • {storeInfo.storeAddress}
                          </div>
                        </div>
                      </div>

                      {/* Right "Ask Store" Blue Pill Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenAskChat(product, storeInfo as any);
                        }}
                        className="bg-[#0066FF] hover:bg-[#0052CC] text-white text-[11px] font-bold px-3.5 py-2 rounded-full shadow-2xs transition active:scale-[0.96] shrink-0 cursor-pointer"
                      >
                        Ask Store
                      </button>
                    </div>
                  );
                })
              ) : (
                <div className="py-12 text-center text-gray-400">
                  <PackageOpen className="w-10 h-10 mx-auto text-gray-300 mb-2" />
                  <p className="text-xs font-semibold">No products found matching "{searchQuery}"</p>
                </div>
              )
            ) : (
              /* Stores Tab */
              displayShops.map((shop) => (
                <div
                  key={shop.id}
                  onClick={() => {
                    setSelectedStore(shop);
                    navigateToScreen('store-details');
                  }}
                  className="p-3.5 bg-white rounded-2xl border border-gray-200/80 shadow-xs flex items-center justify-between cursor-pointer hover:border-blue-300 transition"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gray-900 text-white font-bold flex items-center justify-center shrink-0">
                      {shop.name.charAt(0)}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-gray-950 flex items-center gap-1">
                        <span>{shop.name}</span>
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#34C759]" />
                      </h4>
                      <p className="text-[11px] text-gray-500 mt-0.5">{shop.address}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold text-[#0066FF]">{formatDistance(shop.distanceKm)}</span>
                    <p className="text-[10px] text-[#34C759] font-bold">Open</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Bottom Navigation */}
        <BottomNav active="search" onNavigate={(tab) => navigateToScreen(tab as CustomerScreenType)} />
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCREEN 8: REQUESTS & HOLDS
  // ══════════════════════════════════════════════════════════════════════════
  if (customerScreen === 'requests') {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between select-none animate-in fade-in duration-200 pb-20">
        <div>
          {/* Header */}
          <div className="bg-white p-4 border-b border-gray-200/80 sticky top-0 z-20 flex items-center justify-between">
            <h1 className="text-base font-extrabold text-[#0B132B]">My Inquiries & Holds</h1>
            <span className="text-xs font-bold text-[#0066FF] bg-blue-50 px-2.5 py-1 rounded-full">
              Live Tracker
            </span>
          </div>

          <div className="p-4 space-y-4">
            {/* Active Hold Card if present */}
            {activeHold && (
              <div className="bg-white rounded-2xl p-4 border border-emerald-200 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-[#34C759] bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-100">
                    Active Physical Shelf Hold
                  </span>
                  <span className="text-xs font-mono font-bold text-gray-600">
                    Expires {activeHold.reservedUntil}
                  </span>
                </div>
                <div>
                  <h4 className="text-sm font-extrabold text-gray-900">{activeHold.productName}</h4>
                  <p className="text-xs text-gray-500">{activeHold.storeName} • {activeHold.storeAddress}</p>
                  <p className="text-sm font-extrabold text-[#0066FF] mt-1">₹{activeHold.price.toLocaleString('en-IN')}</p>
                </div>
                <div className="flex items-center justify-center p-3 bg-gray-50 rounded-xl">
                  <StandardQRCode value={activeHold.qrCode} size={110} />
                </div>
              </div>
            )}

            {/* Broadcast Form */}
            <div className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs space-y-3">
              <h3 className="text-xs font-bold text-gray-900">Broadcast Request to Nearby Physical Stores</h3>
              <form onSubmit={handleBroadcastAsk} className="space-y-2.5">
                <input
                  type="text"
                  placeholder="e.g. Nike Air Zoom Pegasus 9"
                  value={askProductName}
                  onChange={(e) => setAskProductName(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs text-gray-900 outline-hidden focus:border-[#0066FF]"
                />
                <input
                  type="text"
                  placeholder="Size / Color / Specification (optional)"
                  value={askVariant}
                  onChange={(e) => setAskVariant(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs text-gray-900 outline-hidden focus:border-[#0066FF]"
                />
                <button
                  type="submit"
                  disabled={isBroadcasting || !askProductName.trim()}
                  className="w-full bg-[#0066FF] hover:bg-[#0052CC] text-white py-2.5 rounded-xl font-bold text-xs transition disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {isBroadcasting ? 'Broadcasting to 15+ Stores...' : 'Broadcast to Local Stores'}
                </button>
                {broadcastDone && (
                  <p className="text-center text-[11px] text-[#34C759] font-bold">
                    ✓ Request broadcasted! Stores in your 5 km radius will reply shortly.
                  </p>
                )}
              </form>
            </div>
          </div>
        </div>

        <BottomNav active="requests" onNavigate={(tab) => navigateToScreen(tab as CustomerScreenType)} />
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCREEN 9: STORES DIRECTORY
  // ══════════════════════════════════════════════════════════════════════════
  if (customerScreen === 'stores') {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between select-none animate-in fade-in duration-200 pb-20">
        <div>
          <div className="bg-white p-4 border-b border-gray-200/80 sticky top-0 z-20 flex items-center justify-between">
            <h1 className="text-base font-extrabold text-[#0B132B]">Nearby Physical Stores</h1>
            <span className="text-xs font-semibold text-gray-500">Coimbatore (5 km)</span>
          </div>

          <div className="p-4 space-y-3">
            {displayShops.map((shop) => (
              <div
                key={shop.id}
                onClick={() => {
                  setSelectedStore(shop);
                  navigateToScreen('store-details');
                }}
                className="p-4 bg-white rounded-2xl border border-gray-200/80 shadow-xs flex items-center justify-between cursor-pointer hover:border-blue-300 transition"
              >
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-[#0066FF] text-white font-bold flex items-center justify-center shrink-0">
                    <Store className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-gray-950 flex items-center gap-1">
                      <span>{shop.name}</span>
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#34C759]" />
                    </h4>
                    <p className="text-[11px] text-gray-500 mt-0.5">{shop.address}</p>
                    <div className="flex items-center gap-1 mt-1 text-[10px] text-amber-500 font-bold">
                      <Star className="w-3 h-3 fill-amber-500" /> 4.3 (120 reviews)
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xs font-extrabold text-[#0066FF]">{formatDistance(shop.distanceKm)}</span>
                  <p className="text-[10px] text-[#34C759] font-bold mt-0.5">Open Now</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <BottomNav active="stores" onNavigate={(tab) => navigateToScreen(tab as CustomerScreenType)} />
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCREEN 10: CUSTOMER PROFILE
  // ══════════════════════════════════════════════════════════════════════════
  if (customerScreen === 'profile') {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between select-none animate-in fade-in duration-200 pb-20">
        <div>
          <div className="bg-white p-4 border-b border-gray-200/80 sticky top-0 z-20 flex items-center justify-between">
            <h1 className="text-base font-extrabold text-[#0B132B]">Account & Settings</h1>
            {onOpenExperienceSwitcher && (
              <ExperienceHeaderPill currentExperience="customer" onClick={onOpenExperienceSwitcher} />
            )}
          </div>

          <div className="p-4 space-y-4">
            {/* User Card */}
            <div className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-full bg-[#0066FF] text-white font-bold text-lg flex items-center justify-center shrink-0">
                {userProfile?.name ? userProfile.name.charAt(0) : 'S'}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-gray-950 truncate">
                  {userProfile?.name || 'Customer Shopper'}
                </h3>
                <p className="text-xs text-gray-500 truncate">{userProfile?.email || 'shopper@zooner.app'}</p>
              </div>
            </div>

            {/* Switch to Merchant Mode */}
            {onNavigateToVendor && (
              <div className="bg-blue-50/80 border border-blue-200 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-blue-950">Store Owner?</h4>
                  <p className="text-[11px] text-blue-700">Manage your physical store and inventory</p>
                </div>
                <button
                  type="button"
                  onClick={onNavigateToVendor}
                  className="px-3 py-1.5 bg-[#0066FF] text-white rounded-xl text-xs font-bold hover:bg-[#0052CC] cursor-pointer"
                >
                  Switch to Vendor
                </button>
              </div>
            )}

            {/* Test Onboarding Flow Button */}
            <button
              type="button"
              onClick={() => navigateToScreen('onboarding')}
              className="w-full py-3 bg-white border border-gray-200 rounded-2xl text-xs font-bold text-gray-700 hover:bg-gray-50 cursor-pointer text-left px-4 flex items-center justify-between"
            >
              <span>View App Onboarding / Splash</span>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </button>

            {/* Sign in or Log out */}
            <button
              type="button"
              onClick={() => onOpenSignIn('C')}
              className="w-full py-3 bg-white border border-gray-200 rounded-2xl text-xs font-bold text-[#0066FF] hover:bg-blue-50 cursor-pointer text-left px-4 flex items-center justify-between"
            >
              <span>Sign In / Switch Account</span>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </div>

        <BottomNav active="profile" onNavigate={(tab) => navigateToScreen(tab as CustomerScreenType)} />
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCREEN 3: CUSTOMER HOME (Default / Main screen in reference image)
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-white flex flex-col justify-between select-none animate-in fade-in duration-200 pb-20">
      <div>
        {/* Top Header (Matches Screen 3 in reference image) */}
        <div className="px-5 pt-3.5 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#0066FF] flex items-center justify-center text-white shadow-sm">
              <Store className="w-4 h-4" />
            </div>
            <span className="text-xl font-extrabold text-[#0B132B] tracking-tight">Zooner</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Location Pill */}
            <button
              type="button"
              onClick={onOpenLocationModal}
              className="flex items-center gap-1.5 text-xs font-bold text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-full px-3 py-1.5 transition cursor-pointer"
            >
              <MapPin className="w-3.5 h-3.5 text-[#0066FF]" />
              <span className="truncate max-w-[130px]">
                {currentLocation.city || 'Coimbatore'} Near you (5 km)
              </span>
              <ChevronDown className="w-3 h-3 text-gray-400" />
            </button>

            {/* Notification Bell */}
            <button
              type="button"
              onClick={() => setIsNotificationsOpen(true)}
              className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-700 relative cursor-pointer"
            >
              <Bell className="w-4 h-4" />
              {activeHold && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#34C759]" />
              )}
            </button>
          </div>
        </div>

        {/* Search Bar (Clicking opens Screen 4: Search & Results) */}
        <div className="px-5 py-2">
          <div
            onClick={() => navigateToScreen('search')}
            className="w-full bg-gray-100/90 hover:bg-gray-100 border border-transparent rounded-full py-3 px-4 flex items-center gap-3 cursor-pointer transition shadow-2xs"
          >
            <Search className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="text-xs text-gray-400">Search for products, brands or stores...</span>
          </div>
        </div>

        {/* Horizontal Category Icons / Cards */}
        <div className="px-5 py-3">
          <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
            {/* Fashion */}
            <button
              type="button"
              onClick={() => {
                setSelectedCategory('Fashion');
                navigateToScreen('search');
              }}
              className="flex flex-col items-center gap-1.5 min-w-[58px] cursor-pointer group"
            >
              <div className="w-12 h-12 rounded-2xl bg-rose-50 group-hover:bg-rose-100 flex items-center justify-center text-rose-500 transition">
                <Shirt className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-semibold text-gray-700">Fashion</span>
            </button>

            {/* Mobiles */}
            <button
              type="button"
              onClick={() => {
                setSelectedCategory('Mobiles');
                navigateToScreen('search');
              }}
              className="flex flex-col items-center gap-1.5 min-w-[58px] cursor-pointer group"
            >
              <div className="w-12 h-12 rounded-2xl bg-blue-50 group-hover:bg-blue-100 flex items-center justify-center text-[#0066FF] transition">
                <Smartphone className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-semibold text-gray-700">Mobiles</span>
            </button>

            {/* Electronics */}
            <button
              type="button"
              onClick={() => {
                setSelectedCategory('Electronics');
                navigateToScreen('search');
              }}
              className="flex flex-col items-center gap-1.5 min-w-[58px] cursor-pointer group"
            >
              <div className="w-12 h-12 rounded-2xl bg-cyan-50 group-hover:bg-cyan-100 flex items-center justify-center text-cyan-600 transition">
                <Headphones className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-semibold text-gray-700">Electronics</span>
            </button>

            {/* Home */}
            <button
              type="button"
              onClick={() => {
                setSelectedCategory('Home');
                navigateToScreen('search');
              }}
              className="flex flex-col items-center gap-1.5 min-w-[58px] cursor-pointer group"
            >
              <div className="w-12 h-12 rounded-2xl bg-amber-50 group-hover:bg-amber-100 flex items-center justify-center text-amber-600 transition">
                <HomeIcon className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-semibold text-gray-700">Home</span>
            </button>

            {/* More */}
            <button
              type="button"
              onClick={() => {
                setSelectedCategory('all');
                navigateToScreen('search');
              }}
              className="flex flex-col items-center gap-1.5 min-w-[58px] cursor-pointer group"
            >
              <div className="w-12 h-12 rounded-2xl bg-gray-100 group-hover:bg-gray-200 flex items-center justify-center text-gray-600 transition">
                <LayoutGrid className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-semibold text-gray-700">More</span>
            </button>
          </div>
        </div>

        {/* Section: Popular near you with "See all" */}
        <div className="px-5 pt-3 pb-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-extrabold text-gray-950">Popular near you</h2>
            <button
              type="button"
              onClick={() => navigateToScreen('search')}
              className="text-xs font-bold text-[#0066FF] hover:underline cursor-pointer"
            >
              See all
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            {displayProducts.slice(0, 3).map((prod) => (
              <div
                key={prod.id}
                onClick={() => {
                  setSelectedProduct(prod);
                  navigateToScreen('product-details');
                }}
                className="bg-white rounded-2xl border border-gray-200/80 p-2.5 flex flex-col justify-between hover:border-blue-300 transition cursor-pointer shadow-2xs"
              >
                <div className="w-full h-20 rounded-xl bg-gray-50 flex items-center justify-center overflow-hidden mb-2 p-1">
                  {prod.imageUrl ? (
                    <img src={prod.imageUrl} alt={prod.name} className="max-h-full max-w-full object-contain" />
                  ) : (
                    <PackageOpen className="w-6 h-6 text-gray-300" />
                  )}
                </div>
                <div>
                  <h4 className="text-[11px] font-bold text-gray-900 truncate">{prod.name}</h4>
                  <p className="text-[10px] text-gray-400 mt-0.5">{prod.carryingStoresCount || '120+'} stores</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Section: Nearby Stores with "See all" */}
        <div className="px-5 pt-4 pb-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-extrabold text-gray-950">Nearby Stores</h2>
            <button
              type="button"
              onClick={() => navigateToScreen('stores')}
              className="text-xs font-bold text-[#0066FF] hover:underline cursor-pointer"
            >
              See all
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {displayShops.slice(0, 2).map((shop) => (
              <div
                key={shop.id}
                onClick={() => {
                  setSelectedStore(shop);
                  navigateToScreen('store-details');
                }}
                className="bg-white rounded-2xl border border-gray-200/80 p-3 hover:border-blue-300 transition cursor-pointer shadow-2xs space-y-2"
              >
                <div className="w-full h-20 rounded-xl bg-gray-900 text-white font-bold flex items-center justify-center">
                  <Store className="w-8 h-8 text-white/90" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-gray-900 truncate">{shop.name}</h4>
                  <p className="text-[10px] text-gray-500 truncate">{shop.address || '2.1 km • RS Puram'}</p>
                  <div className="flex items-center gap-1 text-[10px] text-amber-500 font-bold mt-1">
                    <Star className="w-3 h-3 fill-amber-500" /> 4.3 (120)
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filter Modal */}
      {isFilterSheetOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center">
          <div className="w-full max-w-[440px] bg-white rounded-t-3xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-sm font-bold text-gray-950">Filters & Distance</h3>
              <button
                type="button"
                onClick={() => setIsFilterSheetOpen(false)}
                className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-2">Search Radius</label>
              <div className="flex gap-2">
                {(['2 km', '5 km', '10 km', '15 km'] as const).map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => { setRadiusFilter(r); setIsFilterSheetOpen(false); }}
                    className={`flex-1 py-2 text-xs font-bold rounded-xl border transition cursor-pointer ${
                      radiusFilter === r ? 'bg-[#0066FF] text-white border-[#0066FF]' : 'bg-gray-50 text-gray-700 border-gray-200'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Notifications Modal */}
      {isNotificationsOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center">
          <div className="w-full max-w-[440px] bg-white rounded-t-3xl p-5 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-sm font-bold text-gray-950">Notifications</h3>
              <button
                type="button"
                onClick={() => setIsNotificationsOpen(false)}
                className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-gray-500 py-2">
              All physical shelf holds and merchant responses are up to date.
            </p>
          </div>
        </div>
      )}

      {/* Bottom 5-Tab Navigation (Exact match to reference Screen 3) */}
      <BottomNav active="home" onNavigate={(tab) => navigateToScreen(tab as CustomerScreenType)} />
    </div>
  );
};

// ── BOTTOM NAVIGATION COMPONENT ──
const BottomNav: React.FC<{
  active: 'home' | 'search' | 'requests' | 'stores' | 'profile';
  onNavigate: (tab: string) => void;
}> = ({ active, onNavigate }) => {
  return (
    <div className="fixed bottom-0 left-0 right-0 max-w-[440px] mx-auto bg-white/95 backdrop-blur-xl border-t border-gray-200/80 flex items-center justify-around py-2 px-1 z-30 shadow-[0_-2px_12px_rgba(0,0,0,0.03)]">
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
        <span className="text-[10px]">Search</span>
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
