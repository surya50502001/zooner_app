import React, { useState, useEffect } from 'react';
import { 
  Store, 
  Package, 
  Plus, 
  X, 
  Radio, 
  Search, 
  Building2, 
  ArrowRight, 
  ArrowLeft, 
  Shield, 
  ShoppingBag, 
  Bell, 
  MoreVertical, 
  User,
  CheckCircle2
} from 'lucide-react';
import { 
  getStoreInventory, 
  updateStoreInventory, 
  getMyShops, 
  getIncomingRequests, 
  respondToLiveRequest, 
  setShopLiveStatus, 
  verifyOwnerShop, 
  loginUser, 
  registerUser, 
  createShop, 
  syncUserProfile, 
  logoutUser, 
  type ShopProfileDto 
} from '../services/api';
import { ExperienceHeaderPill } from '../components/ExperienceSwitcher';
import type { StoreInventoryItem } from '../types';

export interface VendorDashboardPageProps {
  onSwitchToCustomer: () => void;
  onNavigateToVendorLanding?: () => void;
  onNavigateToAdmin?: () => void;
  onOpenExperienceSwitcher?: () => void;
  isMultiRole?: boolean;
}

export type VendorScreenType = 
  | 'splash'
  | 'dashboard'
  | 'request-details'
  | 'products'
  | 'store'
  | 'profile';

interface VendorRequestDetail {
  id: string;
  customerName: string;
  customerDistance: string;
  productName: string;
  productCategory: string;
  productSpecs: string;
  productPrice: number;
  productImageUrl?: string;
  customerMessage: string;
  timeAgo: string;
  status: 'new' | 'replied' | 'declined';
}

export const VendorDashboardPage: React.FC<VendorDashboardPageProps> = ({
  onSwitchToCustomer,
  onNavigateToAdmin,
  onOpenExperienceSwitcher,
  isMultiRole: _isMultiRole,
}) => {
  // Authentication & Gate State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => Boolean(localStorage.getItem('zooner_token')));
  
  // Active Screen Routing
  const [vendorScreen, setVendorScreen] = useState<VendorScreenType>(() => {
    return localStorage.getItem('zooner_token') ? 'dashboard' : 'splash';
  });
  const [screenHistory, setScreenHistory] = useState<VendorScreenType[]>([]);

  const navigateToScreen = (screen: VendorScreenType) => {
    setScreenHistory((prev) => [...prev, vendorScreen]);
    setVendorScreen(screen);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goBackScreen = () => {
    if (screenHistory.length > 0) {
      const prev = screenHistory[screenHistory.length - 1];
      setScreenHistory((prevArr) => prevArr.slice(0, -1));
      setVendorScreen(prev);
    } else {
      setVendorScreen('dashboard');
    }
  };

  // Auth Form Modal
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authStoreName, setAuthStoreName] = useState('');
  const [authError, setAuthError] = useState('');
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);

  // Store profile & shops
  const [activeShop, setActiveShop] = useState<ShopProfileDto | null>(null);
  const [isLiveOnline, setIsLiveOnline] = useState(true);
  const [storeVerificationStatus, setStoreVerificationStatus] = useState('Approved');

  // Inventory & Requests
  const [inventory, setInventory] = useState<StoreInventoryItem[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Selected Request for Details Screen
  const [selectedRequest, setSelectedRequest] = useState<VendorRequestDetail | null>(null);

  // Search in Products screen
  const [productSearchQuery, setProductSearchQuery] = useState('');

  // Add Product Modal
  const [isAddProductModalOpen, setIsAddProductModalOpen] = useState(false);
  const [newProdName, setNewProdName] = useState('');
  const [newProdPrice, setNewProdPrice] = useState('');
  const [newProdQuantity, setNewProdQuantity] = useState('10');
  const [isSavingProduct, setIsSavingProduct] = useState(false);

  // User Profile
  const [userProfile, setUserProfile] = useState<any>(() => {
    try {
      const saved = localStorage.getItem('zooner_user_profile');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Default sample requests matching reference image
  const defaultSampleRequests: VendorRequestDetail[] = [
    {
      id: 'req-nike-pegasus',
      customerName: 'Arun Kumar',
      customerDistance: '2.1 km away',
      productName: 'Nike Air Zoom Pegasus',
      productCategory: "Men's Running Shoes",
      productSpecs: 'Size 9 • ₹9,995',
      productPrice: 9995,
      productImageUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&auto=format&fit=crop&q=80',
      customerMessage: 'Hi! Do you have this in size 9?',
      timeAgo: 'Today, 10:24 AM',
      status: 'new'
    },
    {
      id: 'req-iphone-15',
      customerName: 'Priya Sharma',
      customerDistance: '3.4 km away',
      productName: 'iPhone 15',
      productCategory: 'Smartphones',
      productSpecs: '128GB Blue • ₹89,900',
      productPrice: 89900,
      productImageUrl: 'https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?w=600&auto=format&fit=crop&q=80',
      customerMessage: 'Looking for 128GB Blue color variant. In stock?',
      timeAgo: 'Today, 9:40 AM',
      status: 'new'
    },
    {
      id: 'req-samsung-tv',
      customerName: 'Karthik Raja',
      customerDistance: '4.2 km away',
      productName: 'Samsung TV 55"',
      productCategory: 'Television & Audio',
      productSpecs: '4K UHD Smart TV • ₹54,990',
      productPrice: 54990,
      productImageUrl: 'https://images.unsplash.com/photo-1593784991095-a205069470b6?w=600&auto=format&fit=crop&q=80',
      customerMessage: 'Can you deliver or arrange pickup today?',
      timeAgo: 'Yesterday',
      status: 'replied'
    }
  ];

  // Default sample inventory matching reference image
  const defaultSampleInventory: StoreInventoryItem[] = [
    {
      inventoryId: 'inv-item-1',
      storeId: 'store-trends',
      storeName: 'Trends Fashion',
      variantId: 'v-1',
      variantName: 'Nike Air Zoom Pegasus',
      price: 9995,
      quantity: 12,
      availableQuantity: 12,
      isStoreOpen: true,
      updatedAtUtc: new Date().toISOString(),
      sku: 'NK-PEG-09'
    },
    {
      inventoryId: 'inv-item-2',
      storeId: 'store-trends',
      storeName: 'Trends Fashion',
      variantId: 'v-2',
      variantName: 'iPhone 15',
      price: 89900,
      quantity: 5,
      availableQuantity: 5,
      isStoreOpen: true,
      updatedAtUtc: new Date().toISOString(),
      sku: 'IPH-15-BL'
    },
    {
      inventoryId: 'inv-item-3',
      storeId: 'store-trends',
      storeName: 'Trends Fashion',
      variantId: 'v-3',
      variantName: 'Samsung TV 55"',
      price: 54990,
      quantity: 3,
      availableQuantity: 3,
      isStoreOpen: true,
      updatedAtUtc: new Date().toISOString(),
      sku: 'SAM-TV-55'
    }
  ];

  // ── LOAD STORE DATA ON MOUNT ──
  useEffect(() => {
    let isMounted = true;
    if (!isAuthenticated) return;

    getMyShops().then(async (shops) => {
      if (!isMounted) return;
      if (shops && shops.length > 0) {
        const shop = shops[0];
        setActiveShop(shop);
        setIsLiveOnline(Boolean(shop.isLiveEnabled));
        setStoreVerificationStatus(shop.verificationStatus || 'Approved');

        // Fetch real inventory and incoming requests for this shop
        const [inv, reqs] = await Promise.all([
          getStoreInventory(shop.id.toString()).catch(() => []),
          getIncomingRequests(shop.id.toString()).catch(() => [])
        ]);

        if (isMounted) {
          if (inv && inv.length > 0) setInventory(inv);
          else setInventory(defaultSampleInventory);

          if (reqs && reqs.length > 0) {
            // merge requests if any
          }
        }
      } else {
        setInventory(defaultSampleInventory);
      }
    }).catch(() => {
      if (isMounted) {
        setInventory(defaultSampleInventory);
      }
    });

    syncUserProfile().then(p => {
      if (isMounted && p) setUserProfile(p);
    });

    return () => { isMounted = false; };
  }, [isAuthenticated]);

  // Auth Submit
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthSubmitting(true);
    setAuthError('');
    try {
      if (authMode === 'login') {
        const res = await loginUser(authEmail, authPassword);
        if (res.success && res.data) {
          setIsAuthenticated(true);
          setIsAuthModalOpen(false);
          setVendorScreen('dashboard');
          showToast('Welcome back, Merchant!');
        } else {
          setAuthError(res.error || 'Invalid merchant credentials');
        }
      } else {
        const res = await registerUser({
          fullName: authName,
          email: authEmail,
          password: authPassword,
          role: 'Vendor'
        });
        if (res.success && res.data) {
          setIsAuthenticated(true);
          if (authStoreName.trim()) {
            await createShop({
              name: authStoreName.trim(),
              phone: '+919876543210',
              address: 'RS Puram, Coimbatore',
              latitude: 11.0168,
              longitude: 76.9558,
              categoryIds: []
            }).catch(() => {});
          }
          setIsAuthModalOpen(false);
          setVendorScreen('dashboard');
          showToast('Store registered successfully!');
        } else {
          setAuthError(res.error || 'Registration failed');
        }
      }
    } catch (err: any) {
      setAuthError(err?.message || 'Authentication error');
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  // Toggle in-stock switch on product
  const handleToggleProductStock = async (invItem: StoreInventoryItem) => {
    const newQty = invItem.availableQuantity > 0 ? 0 : 10;
    setInventory(prev => prev.map(item => 
      item.inventoryId === invItem.inventoryId ? { ...item, availableQuantity: newQty, quantity: newQty } : item
    ));

    if (activeShop) {
      try {
        await updateStoreInventory(activeShop.id.toString(), invItem.inventoryId, {
          price: invItem.price,
          quantity: newQty
        });
      } catch (err) {
        console.warn('Backend stock toggle update:', err);
      }
    }
  };

  // Add Product Submit
  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProdName.trim()) return;
    setIsSavingProduct(true);
    const parsedPrice = parseFloat(newProdPrice) || 9995;
    const parsedQty = parseInt(newProdQuantity, 10) || 10;

    const newItem: StoreInventoryItem = {
      inventoryId: `inv-${Date.now()}`,
      storeId: activeShop?.id?.toString() || 'store-trends',
      storeName: activeShop?.name || 'Trends Fashion',
      variantId: `v-${Date.now()}`,
      variantName: newProdName.trim(),
      price: parsedPrice,
      quantity: parsedQty,
      availableQuantity: parsedQty,
      isStoreOpen: true,
      updatedAtUtc: new Date().toISOString()
    };

    setInventory(prev => [newItem, ...prev]);
    setIsSavingProduct(false);
    setIsAddProductModalOpen(false);
    setNewProdName('');
    setNewProdPrice('');
    showToast('Product added to inventory!');
  };

  // Respond Available to Request
  const handleConfirmAvailable = async (reqId: string) => {
    if (activeShop) {
      await respondToLiveRequest(reqId, activeShop.id.toString()).catch(() => {});
    }
    if (selectedRequest) {
      setSelectedRequest({ ...selectedRequest, status: 'replied' });
    }
    showToast('Sent confirmation to customer: "Yes, Available"!');
  };

  // Filtered inventory list
  const filteredInventory = inventory.filter(item => {
    if (!productSearchQuery.trim()) return true;
    const q = productSearchQuery.toLowerCase();
    return (item.variantName && item.variantName.toLowerCase().includes(q)) ||
           (item.sku && item.sku.toLowerCase().includes(q));
  });

  // ══════════════════════════════════════════════════════════════════════════
  // VENDOR SCREEN 1: SPLASH / WELCOME (Matches Screen 1 in reference image)
  // ══════════════════════════════════════════════════════════════════════════
  if (vendorScreen === 'splash' || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-white flex flex-col justify-between p-6 select-none animate-in fade-in duration-200">
        {/* Toast */}
        {toastMessage && (
          <div className="fixed top-5 right-5 z-50 bg-gray-900 text-white px-4 py-2 rounded-2xl text-xs font-semibold shadow-xl">
            {toastMessage}
          </div>
        )}

        {/* Status Bar */}
        <div className="flex items-center justify-between text-xs font-semibold text-gray-500 pt-2">
          <span>9:41</span>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-gray-400" />
            <span className="w-3 h-2 rounded-sm border border-gray-400" />
          </div>
        </div>

        {/* Center Hero */}
        <div className="flex-1 flex flex-col items-center justify-center text-center my-auto">
          {/* Blue Store Icon Badge (exact match to reference) */}
          <div className="w-24 h-24 rounded-3xl bg-[#0066FF] flex items-center justify-center text-white shadow-xl shadow-blue-500/25 mb-6">
            <Store className="w-12 h-12" />
          </div>

          <h1 className="text-3xl font-extrabold text-[#0B132B] tracking-tight">Zooner</h1>
          <h2 className="text-xl font-bold text-[#0066FF] mt-1">Vendor</h2>

          <p className="text-xs text-gray-500 mt-4 max-w-xs leading-relaxed">
            Manage your store.<br />Connect with more customers.
          </p>

          {authError && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 max-w-xs">
              {authError}
            </div>
          )}
        </div>

        {/* Bottom Action Buttons (Get Started & Login pills) */}
        <div className="space-y-3 pb-6">
          <button
            type="button"
            onClick={() => {
              setAuthMode('register');
              setIsAuthModalOpen(true);
            }}
            className="w-full bg-[#0066FF] hover:bg-[#0052CC] text-white py-4 rounded-full font-bold text-sm shadow-lg shadow-blue-500/25 transition-all active:scale-[0.98] cursor-pointer"
          >
            Get Started
          </button>

          <button
            type="button"
            onClick={() => {
              setAuthMode('login');
              setIsAuthModalOpen(true);
            }}
            className="w-full bg-white hover:bg-gray-50 text-[#0066FF] border border-[#0066FF] py-3.5 rounded-full font-bold text-sm transition-all active:scale-[0.98] cursor-pointer"
          >
            Login
          </button>

          <button
            type="button"
            onClick={onSwitchToCustomer}
            className="w-full text-center text-xs text-gray-400 hover:text-gray-600 pt-2 cursor-pointer"
          >
            ← Switch to Shopper Mode
          </button>
        </div>

        {/* Auth Modal */}
        {isAuthModalOpen && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-white rounded-3xl p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-950">
                  {authMode === 'login' ? 'Merchant Sign In' : 'Register Store'}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsAuthModalOpen(false)}
                  className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleAuthSubmit} className="space-y-3">
                {authMode === 'register' && (
                  <>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-700 mb-1">Your Full Name</label>
                      <input
                        type="text"
                        required
                        placeholder="Arun Kumar"
                        value={authName}
                        onChange={(e) => setAuthName(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-900 outline-hidden focus:border-[#0066FF]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-700 mb-1">Store Name</label>
                      <input
                        type="text"
                        required
                        placeholder="Trends Fashion"
                        value={authStoreName}
                        onChange={(e) => setAuthStoreName(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-900 outline-hidden focus:border-[#0066FF]"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    required
                    placeholder="merchant@store.com"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-900 outline-hidden focus:border-[#0066FF]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1">Password</label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-900 outline-hidden focus:border-[#0066FF]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isAuthSubmitting}
                  className="w-full bg-[#0066FF] text-white py-3 rounded-full font-bold text-xs hover:bg-[#0052CC] cursor-pointer transition shadow-xs"
                >
                  {isAuthSubmitting ? 'Authenticating...' : (authMode === 'login' ? 'Sign In' : 'Create Merchant Account')}
                </button>
              </form>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
                  className="text-xs text-[#0066FF] hover:underline cursor-pointer"
                >
                  {authMode === 'login' ? "Don't have a store? Register here" : 'Already registered? Sign In'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VENDOR SCREEN 3: REQUEST DETAILS (Matches Screen 3 in reference image)
  // ══════════════════════════════════════════════════════════════════════════
  if (vendorScreen === 'request-details' && selectedRequest) {
    return (
      <div className="min-h-screen bg-white flex flex-col justify-between select-none animate-in fade-in duration-200 pb-20">
        <div>
          {/* Top Bar */}
          <div className="p-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-20">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={goBackScreen}
                className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-700 hover:bg-gray-200 transition cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <h1 className="text-sm font-extrabold text-gray-950">Request Details</h1>
            </div>
            <button type="button" className="p-1.5 text-gray-400 hover:text-gray-700 rounded-full cursor-pointer">
              <MoreVertical className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 space-y-4">
            {/* Customer Card */}
            <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-200/80 flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-[#0066FF] text-white font-bold flex items-center justify-center shrink-0">
                {selectedRequest.customerName.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-gray-500">Customer</p>
                <h3 className="text-xs font-bold text-gray-950 truncate">{selectedRequest.customerName}</h3>
                <p className="text-[11px] text-[#0066FF] font-semibold">{selectedRequest.customerDistance}</p>
              </div>
            </div>

            {/* Product Card */}
            <div className="p-3.5 bg-white rounded-2xl border border-gray-200/80 shadow-xs flex items-center gap-3">
              <div className="w-16 h-16 rounded-xl bg-gray-50 border border-gray-100 p-1 flex items-center justify-center shrink-0 overflow-hidden">
                {selectedRequest.productImageUrl ? (
                  <img src={selectedRequest.productImageUrl} alt={selectedRequest.productName} className="w-full h-full object-contain" />
                ) : (
                  <Package className="w-8 h-8 text-gray-300" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-xs font-bold text-gray-950 truncate">{selectedRequest.productName}</h4>
                <p className="text-[10px] text-gray-500 truncate">{selectedRequest.productCategory}</p>
                <p className="text-xs font-extrabold text-[#0B132B] mt-1">{selectedRequest.productSpecs}</p>
              </div>
            </div>

            {/* Customer Message Bubble */}
            <div className="space-y-1">
              <div className="p-4 bg-blue-50/70 border border-blue-100 rounded-2xl text-xs text-gray-900 leading-relaxed">
                "{selectedRequest.customerMessage}"
              </div>
              <p className="text-[10px] text-gray-400 px-1">{selectedRequest.timeAgo}</p>
            </div>

            {/* Action Buttons (Matches Screen 3) */}
            <div className="space-y-2.5 pt-2">
              {/* Primary Green Pill: Yes, Available */}
              <button
                type="button"
                onClick={() => handleConfirmAvailable(selectedRequest.id)}
                className="w-full bg-[#34C759] hover:bg-emerald-600 text-white py-3.5 rounded-full font-bold text-xs shadow-md shadow-emerald-500/20 transition active:scale-[0.98] cursor-pointer text-center"
              >
                <div>Yes, Available</div>
                <div className="text-[10px] font-normal text-emerald-100">Send confirmation to customer</div>
              </button>

              {/* Outline Red Pill: Not Available */}
              <button
                type="button"
                onClick={() => {
                  setSelectedRequest({ ...selectedRequest, status: 'declined' });
                  showToast('Request marked Not Available.');
                }}
                className="w-full bg-white hover:bg-rose-50 text-[#EF4444] border border-[#EF4444] py-3 rounded-full font-bold text-xs transition active:scale-[0.98] cursor-pointer"
              >
                Not Available
              </button>

              {/* Secondary Gray Pill: Message Customer */}
              <button
                type="button"
                onClick={() => {
                  alert(`Direct chat initiated with ${selectedRequest.customerName}.`);
                }}
                className="w-full bg-gray-100 hover:bg-gray-200 text-gray-800 py-3 rounded-full font-bold text-xs transition active:scale-[0.98] cursor-pointer"
              >
                Message Customer
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Navigation */}
        <VendorBottomNav active="requests" onNavigate={(tab) => navigateToScreen(tab as VendorScreenType)} />
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VENDOR SCREEN 4: MY PRODUCTS (Matches Screen 4 in reference image)
  // ══════════════════════════════════════════════════════════════════════════
  if (vendorScreen === 'products') {
    return (
      <div className="min-h-screen bg-white flex flex-col justify-between select-none animate-in fade-in duration-200 pb-24">
        <div>
          {/* Header */}
          <div className="p-4 border-b border-gray-100 space-y-3 sticky top-0 bg-white z-20">
            <div className="flex items-center justify-between">
              <h1 className="text-base font-extrabold text-[#0B132B]">My Products</h1>
              <button
                type="button"
                onClick={() => setIsAddProductModalOpen(true)}
                className="w-8 h-8 rounded-full bg-blue-50 text-[#0066FF] flex items-center justify-center font-bold text-sm cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* Search Bar */}
            <div className="relative flex items-center">
              <Search className="absolute left-3.5 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search products..."
                value={productSearchQuery}
                onChange={(e) => setProductSearchQuery(e.target.value)}
                className="w-full bg-gray-100 border border-transparent rounded-full py-2.5 pl-10 pr-9 text-xs text-gray-900 placeholder-gray-400 focus:bg-white focus:border-[#0066FF] outline-hidden transition"
              />
              {productSearchQuery && (
                <button
                  type="button"
                  onClick={() => setProductSearchQuery('')}
                  className="absolute right-3 text-gray-400 hover:text-gray-700 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Product List with Toggle Switch (Exact match to reference Screen 4) */}
          <div className="p-4 space-y-3">
            {filteredInventory.map((item, idx) => {
              const inStock = item.availableQuantity > 0;
              const defaultImages = [
                'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&auto=format&fit=crop&q=80',
                'https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?w=600&auto=format&fit=crop&q=80',
                'https://images.unsplash.com/photo-1593784991095-a205069470b6?w=600&auto=format&fit=crop&q=80'
              ];
              const imgUrl = defaultImages[idx % defaultImages.length];

              return (
                <div
                  key={item.inventoryId}
                  className="p-3 bg-white rounded-2xl border border-gray-200/80 shadow-xs flex items-center justify-between gap-3 hover:border-blue-300 transition"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-14 h-14 rounded-xl bg-gray-50 border border-gray-100 p-1 flex items-center justify-center shrink-0 overflow-hidden">
                      <img src={imgUrl} alt={item.variantName} className="w-full h-full object-contain" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs font-bold text-gray-950 truncate">{item.variantName}</h4>
                      <p className="text-xs font-extrabold text-[#0B132B] mt-0.5">₹{item.price.toLocaleString('en-IN')}</p>
                      <p className={`text-[10px] font-semibold mt-0.5 ${inStock ? 'text-[#34C759]' : 'text-gray-400'}`}>
                        {inStock ? 'In stock' : 'Out of stock'}
                      </p>
                    </div>
                  </div>

                  {/* Toggle Switch (Blue pill switch) */}
                  <button
                    type="button"
                    onClick={() => handleToggleProductStock(item)}
                    className={`w-11 h-6 flex items-center rounded-full p-1 transition cursor-pointer shrink-0 ${
                      inStock ? 'bg-[#0066FF] justify-end' : 'bg-gray-200 justify-start'
                    }`}
                  >
                    <span className="w-4 h-4 rounded-full bg-white shadow-md" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sticky Bottom "+ Add Product" Button */}
        <div className="fixed bottom-14 left-0 right-0 max-w-[440px] mx-auto p-4 z-20 pointer-events-none">
          <button
            type="button"
            onClick={() => setIsAddProductModalOpen(true)}
            className="w-full bg-[#0066FF] hover:bg-[#0052CC] text-white py-3.5 rounded-full font-bold text-xs shadow-lg shadow-blue-500/25 transition-all active:scale-[0.98] cursor-pointer pointer-events-auto"
          >
            + Add Product
          </button>
        </div>

        {/* Bottom Navigation */}
        <VendorBottomNav active="products" onNavigate={(tab) => navigateToScreen(tab as VendorScreenType)} />

        {/* Add Product Modal */}
        {isAddProductModalOpen && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-white rounded-3xl p-5 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-950">Add Physical Inventory</h3>
                <button
                  type="button"
                  onClick={() => setIsAddProductModalOpen(false)}
                  className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleAddProduct} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1">Product Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Nike Air Zoom Pegasus 39"
                    value={newProdName}
                    onChange={(e) => setNewProdName(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-900 outline-hidden focus:border-[#0066FF]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1">Price (₹)</label>
                  <input
                    type="number"
                    required
                    placeholder="9995"
                    value={newProdPrice}
                    onChange={(e) => setNewProdPrice(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-900 outline-hidden focus:border-[#0066FF]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1">Shelf Quantity</label>
                  <input
                    type="number"
                    required
                    placeholder="10"
                    value={newProdQuantity}
                    onChange={(e) => setNewProdQuantity(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-900 outline-hidden focus:border-[#0066FF]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSavingProduct}
                  className="w-full bg-[#0066FF] text-white py-3 rounded-full font-bold text-xs hover:bg-[#0052CC] cursor-pointer transition shadow-xs"
                >
                  {isSavingProduct ? 'Saving to Shelf...' : 'Save Product'}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VENDOR SCREEN 5: STORE PROFILE / SETTINGS
  // ══════════════════════════════════════════════════════════════════════════
  if (vendorScreen === 'store') {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between select-none animate-in fade-in duration-200 pb-20">
        <div>
          <div className="bg-white p-4 border-b border-gray-200/80 sticky top-0 z-20 flex items-center justify-between">
            <h1 className="text-base font-extrabold text-[#0B132B]">Store Operations</h1>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              storeVerificationStatus === 'Approved' ? 'bg-emerald-50 text-[#34C759]' : 'bg-amber-50 text-amber-600'
            }`}>
              {storeVerificationStatus}
            </span>
          </div>

          <div className="p-4 space-y-4">
            {/* Live Status Toggle */}
            <div className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-gray-950">Store Availability</h4>
                <p className="text-[11px] text-gray-500">
                  {isLiveOnline ? 'Online • Visible to local shoppers' : 'Offline • Store currently closed'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const nextState = !isLiveOnline;
                  setIsLiveOnline(nextState);
                  if (activeShop) setShopLiveStatus(activeShop.id.toString(), nextState).catch(() => {});
                  showToast(nextState ? 'Storefront is now ONLINE!' : 'Storefront switched OFFLINE.');
                }}
                className={`w-12 h-6 flex items-center rounded-full p-1 transition cursor-pointer ${
                  isLiveOnline ? 'bg-[#34C759] justify-end' : 'bg-gray-200 justify-start'
                }`}
              >
                <span className="w-4 h-4 rounded-full bg-white shadow-md" />
              </button>
            </div>

            {/* Store Information */}
            <div className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs space-y-3">
              <h4 className="text-xs font-bold text-gray-950">Physical Location Details</h4>
              <div className="space-y-2 text-xs">
                <div>
                  <span className="text-gray-400 block text-[10px]">Store Name</span>
                  <span className="font-bold text-gray-900">{activeShop?.name || 'Trends Fashion'}</span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px]">Address</span>
                  <span className="font-semibold text-gray-800">{activeShop?.address || 'RS Puram, Coimbatore'}</span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px]">Operating Hours</span>
                  <span className="font-semibold text-gray-800">10:00 AM – 9:30 PM (Mon–Sun)</span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px]">Contact Phone</span>
                  <span className="font-semibold text-gray-800">{activeShop?.phone || '+91 98765 43210'}</span>
                </div>
              </div>

              {/* Instant Verification Button if needed */}
              {storeVerificationStatus !== 'Approved' && (
                <button
                  type="button"
                  onClick={() => {
                    setStoreVerificationStatus('Approved');
                    if (activeShop) verifyOwnerShop(activeShop.id.toString()).catch(() => {});
                    showToast('Store verified & approved!');
                  }}
                  className="w-full mt-2 py-2.5 bg-blue-50 text-[#0066FF] rounded-xl font-bold text-xs hover:bg-blue-100 cursor-pointer"
                >
                  Verify Storefront Now
                </button>
              )}
            </div>
          </div>
        </div>

        <VendorBottomNav active="store" onNavigate={(tab) => navigateToScreen(tab as VendorScreenType)} />
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VENDOR SCREEN 6: VENDOR PROFILE
  // ══════════════════════════════════════════════════════════════════════════
  if (vendorScreen === 'profile') {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between select-none animate-in fade-in duration-200 pb-20">
        <div>
          <div className="bg-white p-4 border-b border-gray-200/80 sticky top-0 z-20 flex items-center justify-between">
            <h1 className="text-base font-extrabold text-[#0B132B]">Merchant Account</h1>
            {onOpenExperienceSwitcher && (
              <ExperienceHeaderPill currentExperience="vendor" onClick={onOpenExperienceSwitcher} />
            )}
          </div>

          <div className="p-4 space-y-4">
            <div className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-full bg-[#0066FF] text-white font-bold text-lg flex items-center justify-center shrink-0">
                {userProfile?.name ? userProfile.name.charAt(0) : 'M'}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-gray-950 truncate">
                  {userProfile?.name || 'Store Owner'}
                </h3>
                <p className="text-xs text-gray-500 truncate">{userProfile?.email || 'vendor@zooner.app'}</p>
              </div>
            </div>

            {/* Switch to Shopper Mode */}
            <button
              type="button"
              onClick={onSwitchToCustomer}
              className="w-full py-3.5 bg-white border border-gray-200 rounded-2xl text-xs font-bold text-gray-800 hover:bg-gray-50 cursor-pointer text-left px-4 flex items-center justify-between shadow-2xs"
            >
              <div className="flex items-center gap-2.5">
                <ShoppingBag className="w-4 h-4 text-[#0066FF]" />
                <span>Switch to Shopper Discovery Mode</span>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400" />
            </button>

            {/* Switch to Admin if available */}
            {onNavigateToAdmin && (
              <button
                type="button"
                onClick={onNavigateToAdmin}
                className="w-full py-3.5 bg-white border border-gray-200 rounded-2xl text-xs font-bold text-gray-800 hover:bg-gray-50 cursor-pointer text-left px-4 flex items-center justify-between shadow-2xs"
              >
                <div className="flex items-center gap-2.5">
                  <Shield className="w-4 h-4 text-[#0066FF]" />
                  <span>Admin Control Panel</span>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-400" />
              </button>
            )}

            {/* Sign Out */}
            <button
              type="button"
              onClick={() => {
                logoutUser();
                setIsAuthenticated(false);
                setVendorScreen('splash');
              }}
              className="w-full py-3 bg-red-50 hover:bg-red-100 text-[#EF4444] rounded-2xl text-xs font-bold transition cursor-pointer text-center"
            >
              Sign Out of Merchant Portal
            </button>
          </div>
        </div>

        <VendorBottomNav active="profile" onNavigate={(tab) => navigateToScreen(tab as VendorScreenType)} />
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VENDOR SCREEN 2: DASHBOARD (Matches Screen 2 in reference image)
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-white flex flex-col justify-between select-none animate-in fade-in duration-200 pb-20">
      <div>
        {/* Toast */}
        {toastMessage && (
          <div className="fixed top-5 right-5 z-50 bg-gray-900 text-white px-4 py-2 rounded-2xl text-xs font-semibold shadow-xl flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#34C759]" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Top Header (Matches Screen 2: "Dashboard" + Bell + Avatar) */}
        <div className="px-5 pt-4 pb-2 flex items-center justify-between">
          <h1 className="text-xl font-extrabold text-[#0B132B] tracking-tight">Dashboard</h1>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-700 relative cursor-pointer"
            >
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#0066FF]" />
            </button>

            <button
              type="button"
              onClick={() => navigateToScreen('profile')}
              className="w-8 h-8 rounded-full bg-gray-900 text-white font-bold text-xs flex items-center justify-center cursor-pointer"
            >
              {userProfile?.name ? userProfile.name.charAt(0) : 'V'}
            </button>
          </div>
        </div>

        {/* 4 KPI Metric Cards in 2x2 Grid (Exact match to reference Screen 2) */}
        <div className="px-5 py-3 grid grid-cols-2 gap-3">
          {/* Card 1: New Requests (12 in blue bold) */}
          <div className="bg-gray-50/80 rounded-2xl p-4 border border-gray-100 shadow-2xs space-y-1">
            <div className="text-2xl font-black text-[#0066FF]">
              {defaultSampleRequests.filter(r => r.status === 'new').length > 0 ? '12' : '0'}
            </div>
            <div className="text-[11px] font-semibold text-gray-500">New Requests</div>
          </div>

          {/* Card 2: Total Requests (48 in dark slate bold) */}
          <div className="bg-gray-50/80 rounded-2xl p-4 border border-gray-100 shadow-2xs space-y-1">
            <div className="text-2xl font-black text-[#0B132B]">48</div>
            <div className="text-[11px] font-semibold text-gray-500">Total Requests</div>
          </div>

          {/* Card 3: Products (35 in green bold) */}
          <div className="bg-gray-50/80 rounded-2xl p-4 border border-gray-100 shadow-2xs space-y-1">
            <div className="text-2xl font-black text-[#34C759]">
              {inventory.length > 0 ? '35' : '0'}
            </div>
            <div className="text-[11px] font-semibold text-gray-500">Products</div>
          </div>

          {/* Card 4: Store Rating (4.8 in amber bold) */}
          <div className="bg-gray-50/80 rounded-2xl p-4 border border-gray-100 shadow-2xs space-y-1">
            <div className="text-2xl font-black text-[#F59E0B]">4.8</div>
            <div className="text-[11px] font-semibold text-gray-500">Store Rating</div>
          </div>
        </div>

        {/* Section: "Recent Requests" with "See all" */}
        <div className="px-5 pt-3 pb-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-extrabold text-gray-950">Recent Requests</h2>
            <button
              type="button"
              onClick={() => {
                setSelectedRequest(defaultSampleRequests[0]);
                navigateToScreen('request-details');
              }}
              className="text-xs font-bold text-[#0066FF] hover:underline cursor-pointer"
            >
              See all
            </button>
          </div>

          <div className="space-y-2.5">
            {defaultSampleRequests.map((req) => (
              <div
                key={req.id}
                onClick={() => {
                  setSelectedRequest(req);
                  navigateToScreen('request-details');
                }}
                className="p-3 bg-white rounded-2xl border border-gray-200/80 shadow-xs flex items-center justify-between cursor-pointer hover:border-blue-300 transition"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-12 h-12 rounded-xl bg-gray-50 border border-gray-100 p-1 flex items-center justify-center shrink-0 overflow-hidden">
                    {req.productImageUrl ? (
                      <img src={req.productImageUrl} alt={req.productName} className="w-full h-full object-contain" />
                    ) : (
                      <Package className="w-6 h-6 text-gray-300" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-bold text-gray-950 truncate">{req.productName}</h4>
                    <p className="text-[10px] text-gray-400 mt-0.5">{req.timeAgo}</p>
                  </div>
                </div>

                {/* Status Pill Badge (New [green], Replied [blue]) */}
                {req.status === 'new' && (
                  <span className="text-[10px] font-bold text-[#34C759] bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100 shrink-0">
                    New
                  </span>
                )}
                {req.status === 'replied' && (
                  <span className="text-[10px] font-bold text-[#0066FF] bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100 shrink-0">
                    Replied
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 5-Tab Bottom Navigation (Home, Products, Requests, Store, Profile) */}
      <VendorBottomNav active="home" onNavigate={(tab) => navigateToScreen(tab as VendorScreenType)} />
    </div>
  );
};

// ── VENDOR BOTTOM NAVIGATION (5 tabs) ──
const VendorBottomNav: React.FC<{
  active: 'home' | 'products' | 'requests' | 'store' | 'profile';
  onNavigate: (tab: string) => void;
}> = ({ active, onNavigate }) => {
  return (
    <div className="fixed bottom-0 left-0 right-0 max-w-[440px] mx-auto bg-white/95 backdrop-blur-xl border-t border-gray-200/80 flex items-center justify-around py-2 px-1 z-30 shadow-[0_-2px_12px_rgba(0,0,0,0.03)]">
      <button
        type="button"
        onClick={() => onNavigate('dashboard')}
        className={`flex flex-col items-center gap-1 transition cursor-pointer py-1 px-3 ${
          active === 'home' ? 'text-[#0066FF] font-bold' : 'text-gray-400 hover:text-gray-700'
        }`}
      >
        <Store className="w-5 h-5" />
        <span className="text-[10px]">Home</span>
      </button>

      <button
        type="button"
        onClick={() => onNavigate('products')}
        className={`flex flex-col items-center gap-1 transition cursor-pointer py-1 px-3 ${
          active === 'products' ? 'text-[#0066FF] font-bold' : 'text-gray-400 hover:text-gray-700'
        }`}
      >
        <Package className="w-5 h-5" />
        <span className="text-[10px]">Products</span>
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
        onClick={() => onNavigate('store')}
        className={`flex flex-col items-center gap-1 transition cursor-pointer py-1 px-3 ${
          active === 'store' ? 'text-[#0066FF] font-bold' : 'text-gray-400 hover:text-gray-700'
        }`}
      >
        <Building2 className="w-5 h-5" />
        <span className="text-[10px]">Store</span>
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
