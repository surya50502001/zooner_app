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
  User,
  CheckCircle2,
  PackageOpen,
  Store as StoreIcon
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

  // Real Inventory & Requests from DB
  const [inventory, setInventory] = useState<StoreInventoryItem[]>([]);
  const [requests, setRequests] = useState<VendorRequestDetail[]>([]);
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

  // ── LOAD REAL STORE DATA ON MOUNT ──
  const loadVendorData = async () => {
    if (!isAuthenticated) return;
    try {
      const shops = await getMyShops();
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

        setInventory(inv || []);

        if (reqs && reqs.length > 0) {
          const mapped: VendorRequestDetail[] = reqs.map((r: any) => ({
            id: r.id || r.requestId || `req-${Date.now()}`,
            customerName: r.customerName || r.buyerName || 'Local Shopper',
            customerDistance: r.distanceKm ? `${r.distanceKm.toFixed(1)} km away` : 'Nearby',
            productName: r.productName || r.requestText || 'Availability Inquiry',
            productCategory: r.categoryName || 'General',
            productSpecs: r.specifications || (r.price ? `₹${r.price.toLocaleString('en-IN')}` : 'Inquiry'),
            productPrice: r.price || 0,
            productImageUrl: r.imageUrl,
            customerMessage: r.message || r.requestText || 'Is this item available in your store right now?',
            timeAgo: r.createdAtUtc ? new Date(r.createdAtUtc).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Today',
            status: (r.status?.toLowerCase() === 'replied' ? 'replied' : r.status?.toLowerCase() === 'declined' ? 'declined' : 'new') as any
          }));
          setRequests(mapped);
        } else {
          setRequests([]);
        }
      } else {
        setInventory([]);
        setRequests([]);
      }
    } catch {
      setInventory([]);
      setRequests([]);
    }

    syncUserProfile().then(p => {
      if (p) setUserProfile(p);
    });
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadVendorData().catch(() => {});
    }
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
    const parsedPrice = parseFloat(newProdPrice) || 0;
    const parsedQty = parseInt(newProdQuantity, 10) || 10;

    const newItem: StoreInventoryItem = {
      inventoryId: `inv-${Date.now()}`,
      storeId: activeShop?.id?.toString() || 'store-live',
      storeName: activeShop?.name || 'My Store',
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
    setRequests(prev => prev.map(r => r.id === reqId ? { ...r, status: 'replied' } : r));
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
  // SHARED DESKTOP HEADER (Visible on PC / Tablet screens: md:)
  // ══════════════════════════════════════════════════════════════════════════
  const renderDesktopHeader = () => (
    <div className="hidden md:flex items-center justify-between px-8 py-4 bg-white border-b border-gray-200/80 sticky top-0 z-30 shadow-2xs">
      <div className="flex items-center gap-8">
        {/* Logo */}
        <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => navigateToScreen('dashboard')}>
          <div className="w-9 h-9 rounded-xl bg-[#0066FF] flex items-center justify-center text-white shadow-md">
            <Store className="w-5 h-5" />
          </div>
          <div>
            <span className="text-lg font-black text-[#0B132B]">Zooner</span>
            <span className="ml-1.5 text-[10px] font-extrabold text-[#0066FF] bg-blue-50 px-2 py-0.5 rounded-full">
              Vendor Portal
            </span>
          </div>
        </div>

        {/* Desktop Nav Tabs */}
        <nav className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => navigateToScreen('dashboard')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              vendorScreen === 'dashboard' ? 'bg-[#0066FF] text-white shadow-xs' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            Dashboard
          </button>
          <button
            type="button"
            onClick={() => navigateToScreen('products')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              vendorScreen === 'products' ? 'bg-[#0066FF] text-white shadow-xs' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            My Products ({inventory.length})
          </button>
          <button
            type="button"
            onClick={() => {
              if (requests.length > 0) {
                setSelectedRequest(requests[0]);
                navigateToScreen('request-details');
              } else {
                navigateToScreen('dashboard');
                showToast('No active customer requests.');
              }
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              vendorScreen === 'request-details' ? 'bg-[#0066FF] text-white shadow-xs' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            Requests {requests.filter(r => r.status === 'new').length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[10px]">
                {requests.filter(r => r.status === 'new').length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => navigateToScreen('store')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              vendorScreen === 'store' ? 'bg-[#0066FF] text-white shadow-xs' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            Store Operations
          </button>
          <button
            type="button"
            onClick={() => navigateToScreen('profile')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              vendorScreen === 'profile' ? 'bg-[#0066FF] text-white shadow-xs' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            Account
          </button>
        </nav>
      </div>

      <div className="flex items-center gap-3">
        {/* Live Status Toggle */}
        <button
          type="button"
          onClick={() => {
            const next = !isLiveOnline;
            setIsLiveOnline(next);
            if (activeShop) setShopLiveStatus(activeShop.id.toString(), next).catch(() => {});
            showToast(next ? 'Store is Online!' : 'Store is Offline.');
          }}
          className="flex items-center gap-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 px-3 py-1.5 rounded-full text-xs transition cursor-pointer"
        >
          <span className={`w-2 h-2 rounded-full ${isLiveOnline ? 'bg-[#34C759] animate-pulse' : 'bg-gray-400'}`} />
          <span className="font-bold text-gray-700">{isLiveOnline ? 'Store Online' : 'Store Offline'}</span>
        </button>

        {/* Add Product CTA */}
        <button
          type="button"
          onClick={() => setIsAddProductModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0066FF] hover:bg-[#0052CC] text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>+ Add Product</span>
        </button>

        {/* Switch to Shopper Mode */}
        <button
          type="button"
          onClick={onSwitchToCustomer}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-xl text-xs font-bold shadow-2xs cursor-pointer"
        >
          <ShoppingBag className="w-3.5 h-3.5 text-[#0066FF]" />
          <span>Shopper App</span>
        </button>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // VENDOR SCREEN 1: SPLASH / WELCOME
  // ══════════════════════════════════════════════════════════════════════════
  if (vendorScreen === 'splash' || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-white flex flex-col justify-between p-6 select-none animate-in fade-in duration-200 max-w-lg mx-auto w-full">
        {/* Toast */}
        {toastMessage && (
          <div className="fixed top-5 right-5 z-50 bg-gray-900 text-white px-4 py-2 rounded-2xl text-xs font-semibold shadow-xl">
            {toastMessage}
          </div>
        )}

        {/* Status Bar */}
        <div className="flex items-center justify-between text-xs font-semibold text-gray-500 pt-2">
          <span>Merchant Portal</span>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-[11px] text-emerald-600 font-bold">Online</span>
          </div>
        </div>

        {/* Center Hero */}
        <div className="flex-1 flex flex-col items-center justify-center text-center my-auto py-12">
          <div className="w-24 h-24 rounded-3xl bg-[#0066FF] flex items-center justify-center text-white shadow-xl shadow-blue-500/25 mb-6">
            <Store className="w-12 h-12" />
          </div>

          <h1 className="text-3xl font-extrabold text-[#0B132B] tracking-tight">Zooner</h1>
          <h2 className="text-xl font-bold text-[#0066FF] mt-1">Vendor</h2>

          <p className="text-xs text-gray-500 mt-4 max-w-xs leading-relaxed">
            Manage your store.<br />Connect with nearby customers searching for products.
          </p>

          {authError && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 max-w-xs">
              {authError}
            </div>
          )}
        </div>

        {/* Bottom Action Buttons */}
        <div className="space-y-3 pb-6 max-w-md mx-auto w-full">
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
            className="w-full bg-gray-100 hover:bg-gray-200 text-gray-800 py-3.5 rounded-full font-bold text-sm transition-all active:scale-[0.98] cursor-pointer"
          >
            Login to Existing Store
          </button>
        </div>

        {/* Auth Modal */}
        {isAuthModalOpen && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-white rounded-3xl p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-extrabold text-[#0B132B]">
                  {authMode === 'login' ? 'Vendor Sign In' : 'Register Store'}
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
  // VENDOR SCREEN 3: REQUEST DETAILS
  // ══════════════════════════════════════════════════════════════════════════
  if (vendorScreen === 'request-details' && selectedRequest) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between select-none animate-in fade-in duration-200">
        {renderDesktopHeader()}

        <div className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 py-6 pb-24">
          <div className="bg-white rounded-3xl border border-gray-200/80 shadow-xs overflow-hidden">
            {/* Top Bar */}
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={goBackScreen}
                  className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-700 hover:bg-gray-200 transition cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <h1 className="text-sm font-extrabold text-gray-950">Customer Availability Inquiry</h1>
              </div>
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                selectedRequest.status === 'replied' ? 'bg-blue-50 text-[#0066FF] border-blue-100' : 'bg-emerald-50 text-[#34C759] border-emerald-100'
              }`}>
                {selectedRequest.status === 'replied' ? 'Replied' : 'Action Needed'}
              </span>
            </div>

            <div className="p-6 space-y-5">
              {/* Customer Card */}
              <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200/80 flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-full bg-[#0066FF] text-white font-bold flex items-center justify-center shrink-0 text-base">
                  {selectedRequest.customerName.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-gray-500">Customer</p>
                  <h3 className="text-sm font-bold text-gray-950 truncate">{selectedRequest.customerName}</h3>
                  <p className="text-xs text-[#0066FF] font-semibold">{selectedRequest.customerDistance}</p>
                </div>
              </div>

              {/* Product Card */}
              <div className="p-4 bg-white rounded-2xl border border-gray-200/80 shadow-xs flex items-center gap-4">
                <div className="w-16 h-16 rounded-xl bg-gray-50 border border-gray-100 p-1 flex items-center justify-center shrink-0 overflow-hidden">
                  {selectedRequest.productImageUrl ? (
                    <img src={selectedRequest.productImageUrl} alt={selectedRequest.productName} className="w-full h-full object-contain" />
                  ) : (
                    <Package className="w-8 h-8 text-gray-300" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-bold text-gray-950 truncate">{selectedRequest.productName}</h4>
                  <p className="text-[11px] text-gray-500 truncate">{selectedRequest.productCategory}</p>
                  <p className="text-xs font-extrabold text-[#0B132B] mt-1">{selectedRequest.productSpecs}</p>
                </div>
              </div>

              {/* Customer Message Bubble */}
              <div className="space-y-1">
                <div className="p-4 bg-blue-50/70 border border-blue-100 rounded-2xl text-xs text-gray-900 leading-relaxed font-medium">
                  "{selectedRequest.customerMessage}"
                </div>
                <p className="text-[10px] text-gray-400 px-1">{selectedRequest.timeAgo}</p>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => handleConfirmAvailable(selectedRequest.id)}
                  className="w-full bg-[#34C759] hover:bg-emerald-600 text-white py-3.5 rounded-full font-bold text-xs shadow-md shadow-emerald-500/20 transition active:scale-[0.98] cursor-pointer text-center"
                >
                  <div>Yes, Available in Store</div>
                  <div className="text-[10px] font-normal text-emerald-100">Send confirmation to customer to visit</div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedRequest({ ...selectedRequest, status: 'declined' });
                    setRequests(prev => prev.map(r => r.id === selectedRequest.id ? { ...r, status: 'declined' } : r));
                    showToast('Request marked Not Available.');
                  }}
                  className="w-full bg-white hover:bg-rose-50 text-[#EF4444] border border-[#EF4444] py-3 rounded-full font-bold text-xs transition active:scale-[0.98] cursor-pointer"
                >
                  Not Available
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Bottom Navigation */}
        <div className="md:hidden">
          <VendorBottomNav active="requests" onNavigate={(tab) => navigateToScreen(tab as VendorScreenType)} />
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VENDOR SCREEN 4: MY PRODUCTS (Inventory)
  // ══════════════════════════════════════════════════════════════════════════
  if (vendorScreen === 'products') {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between select-none animate-in fade-in duration-200">
        {renderDesktopHeader()}

        <div className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 pb-24">
          <div className="bg-white rounded-3xl border border-gray-200/80 shadow-xs p-6 space-y-5">
            {/* Header & Search */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
              <div>
                <h1 className="text-xl font-extrabold text-[#0B132B]">Store Inventory</h1>
                <p className="text-xs text-gray-500">Live products listed on your store's shelf</p>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-72">
                  <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search products..."
                    value={productSearchQuery}
                    onChange={(e) => setProductSearchQuery(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-full py-2 pl-10 pr-9 text-xs text-gray-900 placeholder-gray-400 focus:bg-white focus:border-[#0066FF] outline-hidden transition"
                  />
                  {productSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setProductSearchQuery('')}
                      className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-700 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setIsAddProductModalOpen(true)}
                  className="px-4 py-2 bg-[#0066FF] text-white rounded-xl text-xs font-bold hover:bg-[#0052CC] cursor-pointer shadow-xs whitespace-nowrap"
                >
                  + Add Product
                </button>
              </div>
            </div>

            {/* Product List */}
            {filteredInventory.length === 0 ? (
              <div className="py-16 text-center space-y-3">
                <PackageOpen className="w-12 h-12 mx-auto text-gray-300" />
                <p className="text-sm font-bold text-gray-700">No products listed in inventory yet</p>
                <p className="text-xs text-gray-400 max-w-sm mx-auto">
                  Add products to your store so local shoppers nearby can discover and ask for availability.
                </p>
                <button
                  type="button"
                  onClick={() => setIsAddProductModalOpen(true)}
                  className="mt-2 px-5 py-2.5 bg-[#0066FF] text-white rounded-full text-xs font-bold hover:bg-[#0052CC] cursor-pointer shadow-sm"
                >
                  + Add First Product
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {filteredInventory.map((item) => {
                  const inStock = item.availableQuantity > 0;
                  return (
                    <div
                      key={item.inventoryId}
                      className="p-3.5 bg-gray-50/70 rounded-2xl border border-gray-200/80 shadow-xs flex items-center justify-between gap-3 hover:border-blue-300 transition bg-white"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-12 h-12 rounded-xl bg-gray-50 border border-gray-100 p-1 flex items-center justify-center shrink-0 overflow-hidden">
                          <Package className="w-6 h-6 text-[#0066FF]" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-bold text-gray-950 truncate">{item.variantName}</h4>
                          <p className="text-xs font-extrabold text-[#0B132B] mt-0.5">
                            ₹{item.price.toLocaleString('en-IN')}
                          </p>
                          <p className={`text-[10px] font-semibold mt-0.5 ${inStock ? 'text-[#34C759]' : 'text-gray-400'}`}>
                            {inStock ? `In Stock (${item.availableQuantity})` : 'Out of stock'}
                          </p>
                        </div>
                      </div>

                      {/* Stock Toggle Switch */}
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
            )}
          </div>
        </div>

        {/* Mobile Bottom Navigation */}
        <div className="md:hidden">
          <VendorBottomNav active="products" onNavigate={(tab) => navigateToScreen(tab as VendorScreenType)} />
        </div>

        {/* Add Product Modal */}
        {isAddProductModalOpen && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white rounded-3xl p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <h3 className="text-base font-extrabold text-gray-950">Add Physical Shelf Item</h3>
                <button
                  type="button"
                  onClick={() => setIsAddProductModalOpen(false)}
                  className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleAddProduct} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Product Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Nike Air Zoom Pegasus 39"
                    value={newProdName}
                    onChange={(e) => setNewProdName(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs text-gray-900 outline-hidden focus:border-[#0066FF]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Price (₹) *</label>
                  <input
                    type="number"
                    required
                    placeholder="9995"
                    value={newProdPrice}
                    onChange={(e) => setNewProdPrice(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs text-gray-900 outline-hidden focus:border-[#0066FF]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Shelf Quantity</label>
                  <input
                    type="number"
                    required
                    placeholder="10"
                    value={newProdQuantity}
                    onChange={(e) => setNewProdQuantity(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs text-gray-900 outline-hidden focus:border-[#0066FF]"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSavingProduct}
                    className="w-full bg-[#0066FF] text-white py-3 rounded-full font-bold text-xs hover:bg-[#0052CC] cursor-pointer transition shadow-xs"
                  >
                    {isSavingProduct ? 'Saving to Shelf...' : 'Save Product'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VENDOR SCREEN 5: STORE OPERATIONS
  // ══════════════════════════════════════════════════════════════════════════
  if (vendorScreen === 'store') {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between select-none animate-in fade-in duration-200">
        {renderDesktopHeader()}

        <div className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 pb-24">
          <div className="space-y-4">
            <div className="bg-white rounded-3xl p-6 border border-gray-200/80 shadow-xs flex items-center justify-between">
              <div>
                <h1 className="text-xl font-extrabold text-[#0B132B]">Storefront Status</h1>
                <p className="text-xs text-gray-500 mt-0.5">Control live customer visibility</p>
              </div>
              <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                storeVerificationStatus === 'Approved' ? 'bg-emerald-50 text-[#34C759] border border-emerald-100' : 'bg-amber-50 text-amber-600 border border-amber-100'
              }`}>
                {storeVerificationStatus}
              </span>
            </div>

            {/* Live Status Toggle */}
            <div className="bg-white rounded-3xl p-6 border border-gray-200/80 shadow-xs flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-gray-950">Store Availability</h4>
                <p className="text-xs text-gray-500 mt-1">
                  {isLiveOnline ? 'Online • Visible to nearby shoppers in search results' : 'Offline • Store currently closed / hidden from search'}
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
                className={`w-14 h-7 flex items-center rounded-full p-1 transition cursor-pointer ${
                  isLiveOnline ? 'bg-[#34C759] justify-end' : 'bg-gray-200 justify-start'
                }`}
              >
                <span className="w-5 h-5 rounded-full bg-white shadow-md" />
              </button>
            </div>

            {/* Store Information */}
            <div className="bg-white rounded-3xl p-6 border border-gray-200/80 shadow-xs space-y-4">
              <h4 className="text-sm font-bold text-gray-950">Physical Store Profile</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-3 bg-gray-50 rounded-xl">
                  <span className="text-gray-400 block text-[10px] font-medium">Store Name</span>
                  <span className="font-bold text-gray-900 text-sm">{activeShop?.name || 'My Store'}</span>
                </div>
                <div className="p-3 bg-gray-50 rounded-xl">
                  <span className="text-gray-400 block text-[10px] font-medium">Address</span>
                  <span className="font-semibold text-gray-800">{activeShop?.address || 'Coimbatore'}</span>
                </div>
                <div className="p-3 bg-gray-50 rounded-xl">
                  <span className="text-gray-400 block text-[10px] font-medium">Contact Phone</span>
                  <span className="font-semibold text-gray-800">{activeShop?.phone || '+91 98765 43210'}</span>
                </div>
                <div className="p-3 bg-gray-50 rounded-xl">
                  <span className="text-gray-400 block text-[10px] font-medium">Total Products</span>
                  <span className="font-semibold text-gray-800">{inventory.length} items listed</span>
                </div>
              </div>

              {storeVerificationStatus !== 'Approved' && (
                <button
                  type="button"
                  onClick={() => {
                    setStoreVerificationStatus('Approved');
                    if (activeShop) verifyOwnerShop(activeShop.id.toString()).catch(() => {});
                    showToast('Store verified & approved!');
                  }}
                  className="w-full mt-2 py-3 bg-blue-50 text-[#0066FF] rounded-2xl font-bold text-xs hover:bg-blue-100 cursor-pointer"
                >
                  Verify Storefront Now
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Mobile Bottom Navigation */}
        <div className="md:hidden">
          <VendorBottomNav active="store" onNavigate={(tab) => navigateToScreen(tab as VendorScreenType)} />
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VENDOR SCREEN 6: VENDOR PROFILE / ACCOUNT
  // ══════════════════════════════════════════════════════════════════════════
  if (vendorScreen === 'profile') {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between select-none animate-in fade-in duration-200">
        {renderDesktopHeader()}

        <div className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 py-6 pb-24 space-y-4">
          <div className="bg-white rounded-3xl p-6 border border-gray-200/80 shadow-xs flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-[#0066FF] text-white font-bold text-xl flex items-center justify-center shrink-0">
              {userProfile?.name ? userProfile.name.charAt(0) : 'M'}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-bold text-gray-950 truncate">
                {userProfile?.name || 'Merchant Owner'}
              </h3>
              <p className="text-xs text-gray-500 truncate">{userProfile?.email || 'vendor@zooner.app'}</p>
            </div>
            {onOpenExperienceSwitcher && (
              <ExperienceHeaderPill currentExperience="vendor" onClick={onOpenExperienceSwitcher} />
            )}
          </div>

          <div className="bg-white rounded-3xl p-6 border border-gray-200/80 shadow-xs space-y-3">
            <button
              type="button"
              onClick={onSwitchToCustomer}
              className="w-full py-4 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-2xl text-xs font-bold text-gray-800 cursor-pointer text-left px-4 flex items-center justify-between transition"
            >
              <div className="flex items-center gap-3">
                <ShoppingBag className="w-4 h-4 text-[#0066FF]" />
                <span>Switch to Shopper Discovery Mode</span>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400" />
            </button>

            {onNavigateToAdmin && (
              <button
                type="button"
                onClick={onNavigateToAdmin}
                className="w-full py-4 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-2xl text-xs font-bold text-gray-800 cursor-pointer text-left px-4 flex items-center justify-between transition"
              >
                <div className="flex items-center gap-3">
                  <Shield className="w-4 h-4 text-[#0066FF]" />
                  <span>Admin Control Panel</span>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-400" />
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                logoutUser();
                setIsAuthenticated(false);
                setVendorScreen('splash');
              }}
              className="w-full py-3.5 bg-red-50 hover:bg-red-100 text-[#EF4444] rounded-2xl text-xs font-bold transition cursor-pointer text-center mt-2"
            >
              Sign Out of Merchant Portal
            </button>
          </div>
        </div>

        {/* Mobile Bottom Navigation */}
        <div className="md:hidden">
          <VendorBottomNav active="profile" onNavigate={(tab) => navigateToScreen(tab as VendorScreenType)} />
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VENDOR SCREEN 2: MAIN DASHBOARD
  // ══════════════════════════════════════════════════════════════════════════
  const newRequestsCount = requests.filter(r => r.status === 'new').length;
  const totalRequestsCount = requests.length;

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between select-none animate-in fade-in duration-200">
      {renderDesktopHeader()}

      {/* Main Responsive Content */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 pb-24 space-y-6">
        {/* Toast */}
        {toastMessage && (
          <div className="fixed top-5 right-5 z-50 bg-gray-900 text-white px-4 py-2 rounded-2xl text-xs font-semibold shadow-xl flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#34C759]" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Mobile Header Bar */}
        <div className="md:hidden flex items-center justify-between pb-1">
          <div>
            <h1 className="text-xl font-extrabold text-[#0B132B] tracking-tight">Vendor Dashboard</h1>
            <p className="text-xs text-gray-500">{activeShop?.name || 'Local Store'}</p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-700 relative cursor-pointer"
            >
              <Bell className="w-4 h-4" />
              {newRequestsCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#0066FF]" />
              )}
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

        {/* 4 KPI Metric Cards (Real DB values) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: New Requests */}
          <div className="bg-white rounded-2xl p-5 border border-gray-200/80 shadow-2xs space-y-1">
            <div className="text-2xl font-black text-[#0066FF]">{newRequestsCount}</div>
            <div className="text-xs font-semibold text-gray-500">New Requests</div>
          </div>

          {/* Card 2: Total Requests */}
          <div className="bg-white rounded-2xl p-5 border border-gray-200/80 shadow-2xs space-y-1">
            <div className="text-2xl font-black text-[#0B132B]">{totalRequestsCount}</div>
            <div className="text-xs font-semibold text-gray-500">Total Requests</div>
          </div>

          {/* Card 3: Products */}
          <div className="bg-white rounded-2xl p-5 border border-gray-200/80 shadow-2xs space-y-1">
            <div className="text-2xl font-black text-[#34C759]">{inventory.length}</div>
            <div className="text-xs font-semibold text-gray-500">Inventory Items</div>
          </div>

          {/* Card 4: Store Status */}
          <div className="bg-white rounded-2xl p-5 border border-gray-200/80 shadow-2xs space-y-1">
            <div className={`text-2xl font-black ${isLiveOnline ? 'text-[#34C759]' : 'text-gray-400'}`}>
              {isLiveOnline ? 'Online' : 'Offline'}
            </div>
            <div className="text-xs font-semibold text-gray-500">Store Status</div>
          </div>
        </div>

        {/* 2-Column Responsive Split for Desktop (Recent Requests & Inventory) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column: Recent Customer Inquiries */}
          <div className="bg-white rounded-3xl p-6 border border-gray-200/80 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h2 className="text-sm font-extrabold text-gray-950">Incoming Availability Requests</h2>
                <p className="text-[11px] text-gray-400">Nearby shoppers asking about items</p>
              </div>
              <span className="text-xs font-bold text-[#0066FF] bg-blue-50 px-2.5 py-1 rounded-full">
                {requests.length} Total
              </span>
            </div>

            {requests.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <Radio className="w-10 h-10 mx-auto text-gray-300" />
                <p className="text-xs font-bold text-gray-700">No customer requests yet</p>
                <p className="text-[11px] text-gray-400 max-w-xs mx-auto">
                  When nearby shoppers search for products in your category, their inquiries will appear here in real time.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {requests.slice(0, 5).map((req) => (
                  <div
                    key={req.id}
                    onClick={() => {
                      setSelectedRequest(req);
                      navigateToScreen('request-details');
                    }}
                    className="p-3.5 bg-gray-50/70 hover:bg-gray-100/70 rounded-2xl border border-gray-200/80 shadow-2xs flex items-center justify-between cursor-pointer transition"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-11 h-11 rounded-xl bg-white border border-gray-200 p-1 flex items-center justify-center shrink-0 overflow-hidden">
                        {req.productImageUrl ? (
                          <img src={req.productImageUrl} alt={req.productName} className="w-full h-full object-contain" />
                        ) : (
                          <Package className="w-5 h-5 text-gray-400" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-bold text-gray-950 truncate">{req.productName}</h4>
                        <p className="text-[10px] text-gray-400 mt-0.5">{req.customerName} • {req.timeAgo}</p>
                      </div>
                    </div>

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
            )}
          </div>

          {/* Right Column: Fast Inventory Overview */}
          <div className="bg-white rounded-3xl p-6 border border-gray-200/80 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h2 className="text-sm font-extrabold text-gray-950">Store Inventory Snapshot</h2>
                <p className="text-[11px] text-gray-400">{inventory.length} physical items listed</p>
              </div>
              <button
                type="button"
                onClick={() => navigateToScreen('products')}
                className="text-xs font-bold text-[#0066FF] hover:underline cursor-pointer"
              >
                Manage All →
              </button>
            </div>

            {inventory.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <PackageOpen className="w-10 h-10 mx-auto text-gray-300" />
                <p className="text-xs font-bold text-gray-700">No items listed yet</p>
                <p className="text-[11px] text-gray-400 max-w-xs mx-auto">
                  Click "+ Add Product" to add physical inventory items to your storefront.
                </p>
                <button
                  type="button"
                  onClick={() => setIsAddProductModalOpen(true)}
                  className="mt-2 px-4 py-2 bg-[#0066FF] text-white rounded-full text-xs font-bold hover:bg-[#0052CC] cursor-pointer shadow-xs"
                >
                  + Add Product
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {inventory.slice(0, 5).map((item) => (
                  <div
                    key={item.inventoryId}
                    className="p-3 bg-gray-50/70 rounded-2xl border border-gray-200/70 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-xl bg-white border border-gray-200 flex items-center justify-center shrink-0">
                        <Package className="w-5 h-5 text-[#0066FF]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-bold text-gray-950 truncate">{item.variantName}</h4>
                        <p className="text-[11px] font-extrabold text-gray-900 mt-0.5">
                          ₹{item.price.toLocaleString('en-IN')}
                        </p>
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      item.availableQuantity > 0 ? 'bg-emerald-50 text-[#34C759]' : 'bg-gray-100 text-gray-400'
                    }`}>
                      {item.availableQuantity > 0 ? `In Stock (${item.availableQuantity})` : 'Out of Stock'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Bottom Navigation (Hidden on desktop md:) */}
      <div className="md:hidden">
        <VendorBottomNav active="home" onNavigate={(tab) => navigateToScreen(tab as VendorScreenType)} />
      </div>

      {/* Add Product Modal */}
      {isAddProductModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-base font-extrabold text-gray-950">Add Product to Store</h3>
              <button
                type="button"
                onClick={() => setIsAddProductModalOpen(false)}
                className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddProduct} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Product Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Nike Air Zoom Pegasus"
                  value={newProdName}
                  onChange={(e) => setNewProdName(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs text-gray-900 outline-hidden focus:border-[#0066FF]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Price (₹) *</label>
                <input
                  type="number"
                  required
                  placeholder="9995"
                  value={newProdPrice}
                  onChange={(e) => setNewProdPrice(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs text-gray-900 outline-hidden focus:border-[#0066FF]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Shelf Quantity</label>
                <input
                  type="number"
                  required
                  placeholder="10"
                  value={newProdQuantity}
                  onChange={(e) => setNewProdQuantity(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs text-gray-900 outline-hidden focus:border-[#0066FF]"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSavingProduct}
                  className="w-full bg-[#0066FF] text-white py-3 rounded-full font-bold text-xs hover:bg-[#0052CC] cursor-pointer transition shadow-xs"
                >
                  {isSavingProduct ? 'Saving...' : 'Add to Inventory'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// ── VENDOR BOTTOM NAVIGATION (Mobile only) ──
const VendorBottomNav: React.FC<{
  active: 'home' | 'products' | 'requests' | 'store' | 'profile';
  onNavigate: (tab: string) => void;
}> = ({ active, onNavigate }) => {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-gray-200/80 flex items-center justify-around py-2 px-1 z-30 shadow-[0_-2px_12px_rgba(0,0,0,0.03)] max-w-lg mx-auto">
      <button
        type="button"
        onClick={() => onNavigate('dashboard')}
        className={`flex flex-col items-center gap-1 transition cursor-pointer py-1 px-3 ${
          active === 'home' ? 'text-[#0066FF] font-bold' : 'text-gray-400 hover:text-gray-700'
        }`}
      >
        <StoreIcon className="w-5 h-5" />
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
        onClick={() => onNavigate('request-details')}
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
