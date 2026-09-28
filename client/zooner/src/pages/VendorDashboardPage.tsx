import React, { useState, useEffect } from 'react';
import { 
  Store, 
  Package, 
  Clock, 
  BarChart3, 
  Plus, 
  X, 
  Search, 
  QrCode, 
  Phone, 
  Check, 
  TrendingUp, 
  Copy, 
  ShieldCheck, 
  User, 
  Power, 
  Sparkles, 
  LogOut 
} from 'lucide-react';
import { 
  loginUser 
} from '../services/api';
import { ExperienceHeaderPill } from '../components/ExperienceSwitcher';

interface VendorDashboardPageProps {
  onSwitchToCustomer: () => void;
  onNavigateToVendorLanding?: () => void;
  onNavigateToAdmin?: () => void;
  onOpenExperienceSwitcher?: () => void;
  isMultiRole?: boolean;
}

export type VendorTab = 'dashboard' | 'products' | 'holds' | 'analytics' | 'profile';

interface VendorProduct {
  id: string;
  name: string;
  category: string;
  price: number;
  stockCount: number;
  isInStock: boolean;
  imageUrl: string;
  sku: string;
}

interface VendorHold {
  id: string;
  holdCode: string;
  customerName: string;
  customerPhone: string;
  productName: string;
  price: number;
  createdAt: string;
  expiresInMinutes: number;
  totalSeconds: number;
  status: 'active' | 'completed' | 'cancelled';
}

const INITIAL_PRODUCTS: VendorProduct[] = [
  {
    id: 'vp-1',
    name: 'Apple iPhone 15 128GB Black',
    category: 'Electronics',
    price: 79500,
    stockCount: 3,
    isInStock: true,
    imageUrl: 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?auto=format&fit=crop&w=600&q=80',
    sku: 'SKU-IP15-BLK'
  },
  {
    id: 'vp-2',
    name: 'Apple AirPods Pro (2nd Gen)',
    category: 'Electronics',
    price: 24900,
    stockCount: 5,
    isInStock: true,
    imageUrl: 'https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?auto=format&fit=crop&w=600&q=80',
    sku: 'SKU-APP2-WHT'
  },
  {
    id: 'vp-3',
    name: 'MacBook Air 13" M2 Chip (256GB)',
    category: 'Electronics',
    price: 99900,
    stockCount: 2,
    isInStock: true,
    imageUrl: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=600&q=80',
    sku: 'SKU-MBA-M2'
  },
  {
    id: 'vp-4',
    name: 'Apple Watch Series 9 GPS 45mm',
    category: 'Electronics',
    price: 41900,
    stockCount: 4,
    isInStock: true,
    imageUrl: 'https://images.unsplash.com/photo-1546868871-7041f2a55e12?auto=format&fit=crop&w=600&q=80',
    sku: 'SKU-AW9-45'
  },
  {
    id: 'vp-5',
    name: 'Sony WH-1000XM5 Headphones',
    category: 'Electronics',
    price: 26990,
    stockCount: 3,
    isInStock: true,
    imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80',
    sku: 'SKU-SNY-XM5'
  },
  {
    id: 'vp-6',
    name: 'Samsung Galaxy S24 Ultra 256GB',
    category: 'Electronics',
    price: 129999,
    stockCount: 0,
    isInStock: false,
    imageUrl: 'https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?auto=format&fit=crop&w=600&q=80',
    sku: 'SKU-S24U-GRY'
  }
];

const INITIAL_HOLDS: VendorHold[] = [
  {
    id: 'vh-1',
    holdCode: 'H-7K3M9',
    customerName: 'John Doe',
    customerPhone: '+91 98765 43210',
    productName: 'Apple iPhone 15 128GB Black',
    price: 79500,
    createdAt: '12 mins ago',
    expiresInMinutes: 18,
    totalSeconds: 1080,
    status: 'active'
  },
  {
    id: 'vh-2',
    holdCode: 'H-4B2N8',
    customerName: 'Priya Sundaram',
    customerPhone: '+91 98432 11998',
    productName: 'Apple AirPods Pro (2nd Gen)',
    price: 24900,
    createdAt: '6 mins ago',
    expiresInMinutes: 24,
    totalSeconds: 1440,
    status: 'active'
  },
  {
    id: 'vh-3',
    holdCode: 'H-9X1P4',
    customerName: 'Karthik Raja',
    customerPhone: '+91 97890 55443',
    productName: 'Sony WH-1000XM5 Headphones',
    price: 26990,
    createdAt: '18 mins ago',
    expiresInMinutes: 12,
    totalSeconds: 720,
    status: 'active'
  },
  {
    id: 'vh-4',
    holdCode: 'H-3M7Q2',
    customerName: 'Anita Sharma',
    customerPhone: '+91 98421 88776',
    productName: 'MacBook Air 13" M2 Chip',
    price: 99900,
    createdAt: 'Yesterday',
    expiresInMinutes: 0,
    totalSeconds: 0,
    status: 'completed'
  },
  {
    id: 'vh-5',
    holdCode: 'H-8L5K1',
    customerName: 'Vignesh Kumar',
    customerPhone: '+91 98940 22334',
    productName: 'Apple Watch Series 9 GPS',
    price: 41900,
    createdAt: 'Yesterday',
    expiresInMinutes: 0,
    totalSeconds: 0,
    status: 'completed'
  }
];

export const VendorDashboardPage: React.FC<VendorDashboardPageProps> = ({
  onSwitchToCustomer: _onSwitchToCustomer,
  onNavigateToVendorLanding: _onNavigateToVendorLanding,
  onNavigateToAdmin: _onNavigateToAdmin,
  onOpenExperienceSwitcher,
  isMultiRole: _isMultiRole,
}) => {
  // Authentication & Demo Mode State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return Boolean(localStorage.getItem('zooner_token') || localStorage.getItem('zooner_vendor_demo'));
  });

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Active Navigation Tab
  const [activeTab, setActiveTab] = useState<VendorTab>('dashboard');
  const [isStoreOpen, setIsStoreOpen] = useState(true);

  // Store Inventory Products State
  const [products, setProducts] = useState<VendorProduct[]>(INITIAL_PRODUCTS);
  const [productSearch, setProductSearch] = useState('');
  const [selectedCategory] = useState('All');

  // Holds State
  const [holds, setHolds] = useState<VendorHold[]>(INITIAL_HOLDS);
  const [holdsFilter, setHoldsFilter] = useState<'active' | 'history'>('active');
  const [selectedHold, setSelectedHold] = useState<VendorHold | null>(null);

  // QR Scanner Modal State
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scanManualCode, setScanManualCode] = useState('');
  const [scanVerifiedSuccess, setScanVerifiedSuccess] = useState(false);
  const [scanErrorMessage, setScanErrorMessage] = useState('');

  // Add/Edit Product Modal State
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [newProdName, setNewProdName] = useState('');
  const [newProdCategory, setNewProdCategory] = useState('Electronics');
  const [newProdPrice, setNewProdPrice] = useState('');
  const [newProdStock, setNewProdStock] = useState('3');
  const [newProdDesc, setNewProdDesc] = useState('');

  // Store Profile State
  const storeInfo = {
    name: 'TechWorld Coimbatore',
    category: 'Electronics & Gadgets',
    phone: '+91 98430 11223',
    address: '104, DB Road, RS Puram, Coimbatore, Tamil Nadu 641002',
    hours: '9:00 AM – 9:30 PM (Mon–Sun)',
    isVerified: true
  };
  const [copiedCode, setCopiedCode] = useState(false);

  // Hold Timer Tick
  useEffect(() => {
    const interval = setInterval(() => {
      setHolds(prev => prev.map(h => {
        if (h.status !== 'active' || h.totalSeconds <= 0) return h;
        return {
          ...h,
          totalSeconds: h.totalSeconds - 1,
          expiresInMinutes: Math.ceil((h.totalSeconds - 1) / 60)
        };
      }));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTimer = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Toggle In-Stock Switch (Screen 3)
  const handleToggleStock = (prodId: string) => {
    setProducts(prev => prev.map(p => {
      if (p.id === prodId) {
        const nextState = !p.isInStock;
        return {
          ...p,
          isInStock: nextState,
          stockCount: nextState ? (p.stockCount > 0 ? p.stockCount : 3) : 0
        };
      }
      return p;
    }));
  };

  // Stock Quantity Stepper
  const handleStockCountChange = (prodId: string, delta: number) => {
    setProducts(prev => prev.map(p => {
      if (p.id === prodId) {
        const nextCount = Math.max(0, p.stockCount + delta);
        return {
          ...p,
          stockCount: nextCount,
          isInStock: nextCount > 0
        };
      }
      return p;
    }));
  };

  // Handle Scan QR / Manual Verify (Screen 6)
  const handleVerifyScan = (codeToVerify: string) => {
    setScanErrorMessage('');
    const matched = holds.find(h => h.holdCode.toLowerCase() === codeToVerify.trim().toLowerCase() && h.status === 'active');
    if (matched) {
      setScanVerifiedSuccess(true);
      setTimeout(() => {
        setScanVerifiedSuccess(false);
        setIsScannerOpen(false);
        setSelectedHold(matched);
      }, 1200);
    } else {
      setScanErrorMessage('No active hold found matching code ' + codeToVerify);
    }
  };

  // Complete / Pick Up Hold (Screen 7)
  const handleCompleteHold = (holdId: string) => {
    setHolds(prev => prev.map(h => h.id === holdId ? { ...h, status: 'completed' } : h));
    setSelectedHold(null);
    alert('Hold verified! Sale completed successfully.');
  };

  // Cancel Hold
  const handleCancelHold = (holdId: string) => {
    if (window.confirm('Are you sure you want to release this hold back to shelf inventory?')) {
      setHolds(prev => prev.map(h => h.id === holdId ? { ...h, status: 'cancelled' } : h));
      setSelectedHold(null);
    }
  };

  // Add Product Form Submit (Screen 4)
  const handleAddProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProdName.trim() || !newProdPrice) return;

    const newP: VendorProduct = {
      id: `vp-${Date.now()}`,
      name: newProdName.trim(),
      category: newProdCategory,
      price: parseFloat(newProdPrice) || 0,
      stockCount: parseInt(newProdStock, 10) || 1,
      isInStock: (parseInt(newProdStock, 10) || 1) > 0,
      imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80',
      sku: `SKU-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
    };

    setProducts(prev => [newP, ...prev]);
    setIsAddProductOpen(false);
    setNewProdName('');
    setNewProdPrice('');
    setNewProdStock('3');
    setNewProdDesc('');
    setActiveTab('products');
  };

  // Quick Demo Login
  const handleQuickDemoLogin = () => {
    localStorage.setItem('zooner_vendor_demo', 'true');
    setIsAuthenticated(true);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError('');
    try {
      const res = await loginUser(loginEmail, loginPassword);
      if (res.success && res.data?.accessToken) {
        localStorage.setItem('zooner_token', res.data.accessToken);
        if (res.data.user) localStorage.setItem('zooner_user_profile', JSON.stringify(res.data.user));
        setIsAuthenticated(true);
      } else {
        setLoginError(res.error || 'Invalid merchant credentials');
      }
    } catch {
      handleQuickDemoLogin();
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('zooner_token');
    localStorage.removeItem('zooner_vendor_demo');
    setIsAuthenticated(false);
  };

  // Filtered Products
  const filteredProducts = products.filter(p => {
    if (productSearch && !p.name.toLowerCase().includes(productSearch.toLowerCase())) return false;
    if (selectedCategory !== 'All' && p.category !== selectedCategory) return false;
    return true;
  });

  const activeHoldsList = holds.filter(h => h.status === 'active');
  const historyHoldsList = holds.filter(h => h.status !== 'active');

  // ══════════════════════════════════════════════════════════════════
  // SCREEN 1: VENDOR LOGIN & DEMO ACCESS
  // ══════════════════════════════════════════════════════════════════
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4 selection:bg-[#7C5CFF]">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-500 to-[#7C5CFF] text-white flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
              <Store className="w-7 h-7" />
            </div>
            <h2 className="text-2xl font-black tracking-tight font-['Outfit']">Zooner Merchant OS</h2>
            <p className="text-xs text-slate-400">Manage physical shelf stock, active holds, & QR pickup</p>
          </div>

          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Store Email</label>
              <input
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="techworld.cbe@zooner.app"
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Password</label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {loginError && (
              <p className="text-xs text-rose-400 bg-rose-950/40 p-2.5 rounded-xl border border-rose-800/50">{loginError}</p>
            )}

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 py-3.5 rounded-2xl text-xs font-bold transition shadow-lg shadow-emerald-500/20 cursor-pointer"
            >
              {isLoggingIn ? 'Signing in...' : 'Sign In to Store Dashboard'}
            </button>
          </form>

          <div className="pt-2 border-t border-slate-800 text-center space-y-3">
            <button
              type="button"
              onClick={handleQuickDemoLogin}
              className="w-full bg-slate-800 hover:bg-slate-750 border border-slate-700 text-white py-3 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span>Explore as TechWorld Coimbatore (1-Click Demo)</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans flex flex-col selection:bg-emerald-500 selection:text-black pb-20">
      
      {/* ── TOP MERCHANT HEADER ── */}
      <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center font-bold">
            <Store className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-xs font-bold text-white">{storeInfo.name}</h3>
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <p className="text-[10px] text-slate-400">RS Puram, Coimbatore • Merchant OS</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Live Open/Closed Toggle */}
          <button
            type="button"
            onClick={() => setIsStoreOpen(!isStoreOpen)}
            className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition flex items-center gap-1 cursor-pointer ${
              isStoreOpen
                ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-400'
                : 'bg-rose-950/80 border-rose-500/50 text-rose-400'
            }`}
          >
            <Power className="w-3 h-3" />
            <span>{isStoreOpen ? 'Store Open' : 'Closed'}</span>
          </button>

          {onOpenExperienceSwitcher && (
            <ExperienceHeaderPill
              currentExperience="vendor"
              onClick={onOpenExperienceSwitcher}
            />
          )}
        </div>
      </header>

      {/* ── MAIN CONTENT ACCORDING TO ACTIVE TAB ── */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 space-y-5">

        {/* ══════════════════════════════════════════════════════════════════
            TAB 1: STORE DASHBOARD (KPI Counters, Quick Actions, Recent Holds)
        ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'dashboard' && (
          <div className="space-y-5 animate-in fade-in duration-200">
            {/* 3 KPI Counter Cards (Screen 2) */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 shadow-sm">
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">Total Holds</span>
                <div className="text-xl font-black text-white mt-1 font-mono">12</div>
                <span className="text-[9px] text-emerald-400 font-bold mt-0.5 block">+18% today</span>
              </div>

              <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-3.5 shadow-sm ring-1 ring-emerald-500/20">
                <span className="text-[10px] text-emerald-400 font-semibold block uppercase">Active Holds</span>
                <div className="text-xl font-black text-emerald-400 mt-1 font-mono">{activeHoldsList.length}</div>
                <span className="text-[9px] text-slate-400 mt-0.5 block">Ready for pickup</span>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 shadow-sm">
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">In-Stock Items</span>
                <div className="text-xl font-black text-white mt-1 font-mono">
                  {products.filter(p => p.isInStock).length} / {products.length}
                </div>
                <span className="text-[9px] text-slate-400 mt-0.5 block">Live on Zooner</span>
              </div>
            </div>

            {/* Quick Action Buttons */}
            <div className="grid grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => setIsScannerOpen(true)}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 p-3 rounded-2xl text-xs font-bold flex flex-col items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/20 active:scale-98 transition cursor-pointer"
              >
                <QrCode className="w-5 h-5" />
                <span>Scan Customer QR</span>
              </button>

              <button
                type="button"
                onClick={() => setIsAddProductOpen(true)}
                className="bg-slate-900 hover:bg-slate-855 border border-slate-800 text-white p-3 rounded-2xl text-xs font-bold flex flex-col items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Plus className="w-5 h-5 text-[#7C5CFF]" />
                <span>+ Add Product</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('analytics')}
                className="bg-slate-900 hover:bg-slate-850 border border-slate-800 text-white p-3 rounded-2xl text-xs font-bold flex flex-col items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <TrendingUp className="w-5 h-5 text-indigo-400" />
                <span>Sales GMV (₹1.2L)</span>
              </button>
            </div>

            {/* Recent Active Holds Queue */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">Live Reservations Queue</h3>
                  <p className="text-[10px] text-slate-400">Customers holding shelf inventory right now</p>
                </div>
                <button 
                  onClick={() => setActiveTab('holds')}
                  className="text-xs font-bold text-emerald-400 hover:underline"
                >
                  View All ({holds.length})
                </button>
              </div>

              <div className="space-y-2.5">
                {activeHoldsList.map((hold) => (
                  <div
                    key={hold.id}
                    onClick={() => setSelectedHold(hold)}
                    className="bg-slate-950 border border-slate-800/90 rounded-2xl p-3.5 flex items-center justify-between hover:border-emerald-500/50 transition cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-emerald-950 border border-emerald-800 text-emerald-400 flex items-center justify-center">
                        <Clock className="w-4 h-4 animate-pulse" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white">{hold.customerName}</span>
                          <span className="text-[10px] font-mono font-bold bg-slate-800 text-emerald-400 px-1.5 py-0.2 rounded">
                            {hold.holdCode}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 truncate max-w-[200px] mt-0.5">{hold.productName}</p>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-black font-mono text-emerald-400 tabular-nums">
                        {formatTimer(hold.totalSeconds)}
                      </span>
                      <span className="block text-[9px] text-slate-500">₹{hold.price.toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            TAB 2: MANAGE PRODUCTS & IN-STOCK TOGGLES (Screen 3)
        ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'products' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Header & Add Button */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">Shelf Products</h3>
                <p className="text-[10px] text-slate-400">Toggle live availability on Zooner shelves</p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddProductOpen(true)}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-md shadow-emerald-500/20"
              >
                <Plus className="w-4 h-4" />
                <span>+ Add Product</span>
              </button>
            </div>

            {/* Search and Category Filter */}
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Search store inventory..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Product Items List */}
            <div className="space-y-3">
              {filteredProducts.map((prod) => (
                <div
                  key={prod.id}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between gap-3"
                >
                  <img
                    src={prod.imageUrl}
                    alt={prod.name}
                    className="w-16 h-16 rounded-xl object-cover bg-slate-950 shrink-0"
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-mono text-slate-400">{prod.sku}</span>
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                        prod.isInStock ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-slate-800 text-slate-500'
                      }`}>
                        {prod.isInStock ? 'In Stock' : 'Out of Stock'}
                      </span>
                    </div>

                    <h4 className="text-xs font-bold text-white truncate mt-0.5">{prod.name}</h4>
                    <p className="text-xs font-black text-white mt-1">₹{prod.price.toLocaleString('en-IN')}</p>
                  </div>

                  {/* Stock Controls & Live Switch */}
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {/* Real-time Toggle Switch (Screen 3) */}
                    <button
                      type="button"
                      onClick={() => handleToggleStock(prod.id)}
                      className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                        prod.isInStock ? 'bg-emerald-500' : 'bg-slate-800'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full bg-white transition-transform absolute top-0.5 ${
                        prod.isInStock ? 'left-6.5' : 'left-0.5'
                      }`} />
                    </button>

                    {/* Quantity Stepper */}
                    <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs">
                      <button
                        onClick={() => handleStockCountChange(prod.id, -1)}
                        className="text-slate-400 hover:text-white px-1 font-bold"
                      >
                        -
                      </button>
                      <span className="w-5 text-center font-bold font-mono text-white">{prod.stockCount}</span>
                      <button
                        onClick={() => handleStockCountChange(prod.id, 1)}
                        className="text-slate-400 hover:text-white px-1 font-bold"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            TAB 3: ACTIVE HOLDS QUEUE (Screen 5)
        ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'holds' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Filter Tabs */}
            <div className="bg-slate-900 p-1 rounded-2xl flex items-center text-xs font-bold border border-slate-800">
              <button
                type="button"
                onClick={() => setHoldsFilter('active')}
                className={`flex-1 py-2 rounded-xl transition cursor-pointer text-center ${
                  holdsFilter === 'active' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'
                }`}
              >
                Active Holds ({activeHoldsList.length})
              </button>
              <button
                type="button"
                onClick={() => setHoldsFilter('history')}
                className={`flex-1 py-2 rounded-xl transition cursor-pointer text-center ${
                  holdsFilter === 'history' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'
                }`}
              >
                Completed History ({historyHoldsList.length})
              </button>
            </div>

            <div className="space-y-3">
              {(holdsFilter === 'active' ? activeHoldsList : historyHoldsList).map((hold) => (
                <div
                  key={hold.id}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">{hold.customerName}</span>
                        <span className="text-[10px] font-mono font-bold bg-slate-800 text-emerald-400 px-2 py-0.5 rounded border border-slate-700">
                          {hold.holdCode}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                        <Phone className="w-3 h-3 text-emerald-400" />
                        <span>{hold.customerPhone}</span>
                      </p>
                      <h4 className="text-xs font-bold text-white mt-2">{hold.productName}</h4>
                      <p className="text-xs font-black text-white mt-0.5">₹{hold.price.toLocaleString('en-IN')}</p>
                    </div>

                    <div className="text-right">
                      {hold.status === 'active' ? (
                        <div>
                          <span className="text-[9px] text-slate-400 block uppercase font-bold">Remaining</span>
                          <span className="text-sm font-black font-mono text-emerald-400 tabular-nums">
                            {formatTimer(hold.totalSeconds)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[10px] font-bold text-slate-400 bg-slate-800 px-2 py-1 rounded-full">
                          {hold.status === 'completed' ? 'Picked Up' : 'Cancelled'}
                        </span>
                      )}
                    </div>
                  </div>

                  {hold.status === 'active' && (
                    <div className="pt-2 border-t border-slate-800/80 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedHold(hold)}
                        className="flex-1 bg-slate-800 hover:bg-slate-750 text-white py-2 rounded-xl text-xs font-bold transition cursor-pointer"
                      >
                        View Hold Details
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCompleteHold(hold.id)}
                        className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 py-2 rounded-xl text-xs font-bold transition cursor-pointer"
                      >
                        Mark Picked Up
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            TAB 4: STORE ANALYTICS (Screen 9)
        ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'analytics' && (
          <div className="space-y-5 animate-in fade-in duration-200">
            {/* Top Stat Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                <span className="text-[10px] text-slate-400 uppercase font-bold">Total Holds (30d)</span>
                <div className="text-xl font-black text-white mt-1 font-mono">152</div>
                <span className="text-[10px] text-emerald-400 font-semibold">+24% vs last month</span>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                <span className="text-[10px] text-slate-400 uppercase font-bold">Picked Up</span>
                <div className="text-xl font-black text-emerald-400 mt-1 font-mono">128</div>
                <span className="text-[10px] text-slate-400">84% conversion</span>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                <span className="text-[10px] text-slate-400 uppercase font-bold">Released/Expired</span>
                <div className="text-xl font-black text-rose-400 mt-1 font-mono">24</div>
                <span className="text-[10px] text-slate-400">16% drop-off</span>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                <span className="text-[10px] text-slate-400 uppercase font-bold">Gross Sales (GMV)</span>
                <div className="text-xl font-black text-white mt-1 font-mono">₹1.2L</div>
                <span className="text-[10px] text-emerald-400 font-semibold">Store footfall</span>
              </div>
            </div>

            {/* Sales GMV Trend Chart */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">Weekly Pickup Volume</h3>
                  <p className="text-[10px] text-slate-400">Verified store completions over last 7 days</p>
                </div>
                <span className="text-xs font-bold font-mono text-emerald-400">₹1,24,500</span>
              </div>

              {/* Chart Bars */}
              <div className="h-36 flex items-end justify-between gap-3 pt-4 px-2 border-b border-slate-800">
                {[
                  { day: 'Mon', count: 14, amt: '₹14K' },
                  { day: 'Tue', count: 18, amt: '₹18K' },
                  { day: 'Wed', count: 22, amt: '₹22K' },
                  { day: 'Thu', count: 16, amt: '₹16K' },
                  { day: 'Fri', count: 28, amt: '₹28K' },
                  { day: 'Sat', count: 34, amt: '₹34K' },
                  { day: 'Sun', count: 20, amt: '₹20K' }
                ].map((item, idx) => (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                    <span className="text-[9px] font-mono text-slate-400">{item.amt}</span>
                    <div 
                      style={{ height: `${(item.count / 35) * 100}%` }}
                      className="w-full max-w-[28px] bg-gradient-to-t from-emerald-600 to-emerald-400 rounded-t-lg transition-all"
                    />
                    <span className="text-[10px] font-bold text-slate-400 mt-1">{item.day}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Products */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-3">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">Top Reserved Items</h3>
              <div className="divide-y divide-slate-800 text-xs">
                <div className="py-2.5 flex items-center justify-between">
                  <span>1. Apple iPhone 15 128GB Black</span>
                  <span className="font-bold text-emerald-400 font-mono">42 Holds</span>
                </div>
                <div className="py-2.5 flex items-center justify-between">
                  <span>2. Apple AirPods Pro (2nd Gen)</span>
                  <span className="font-bold text-emerald-400 font-mono">38 Holds</span>
                </div>
                <div className="py-2.5 flex items-center justify-between">
                  <span>3. Sony WH-1000XM5 Headphones</span>
                  <span className="font-bold text-emerald-400 font-mono">26 Holds</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            TAB 5: STORE PROFILE & SETTINGS (Screen 8)
        ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'profile' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Store Information Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-500 to-[#7C5CFF] text-white flex items-center justify-center text-2xl font-bold shadow-md">
                  T
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-base font-bold text-white font-['Outfit']">{storeInfo.name}</h3>
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{storeInfo.category}</p>
                  <span className="inline-block mt-1 text-[10px] font-bold text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded-full border border-emerald-800">
                    Verified Storefront
                  </span>
                </div>
              </div>

              <div className="space-y-3 pt-3 border-t border-slate-800 text-xs">
                <div>
                  <label className="text-[10px] text-slate-500 font-bold uppercase block">Phone Number</label>
                  <p className="text-slate-200 font-medium mt-0.5">{storeInfo.phone}</p>
                </div>

                <div>
                  <label className="text-[10px] text-slate-500 font-bold uppercase block">Store Physical Address</label>
                  <p className="text-slate-200 font-medium mt-0.5">{storeInfo.address}</p>
                </div>

                <div>
                  <label className="text-[10px] text-slate-500 font-bold uppercase block">Operating Hours</label>
                  <p className="text-slate-200 font-medium mt-0.5">{storeInfo.hours}</p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="w-full bg-slate-900 hover:bg-slate-850 border border-slate-800 text-rose-400 py-3 rounded-2xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4 text-rose-400" />
              <span>Log Out of Merchant OS</span>
            </button>
          </div>
        )}
      </main>

      {/* ══════════════════════════════════════════════════════════════════
          SCREEN 6: SCAN QR (PICKUP VIEWFINDER MODAL)
      ══════════════════════════════════════════════════════════════════ */}
      {isScannerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-3xl p-6 shadow-2xl text-center space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="text-left">
                <h4 className="text-sm font-bold text-white">Scan Customer QR</h4>
                <p className="text-[10px] text-slate-400">Position customer's hold QR inside frame</p>
              </div>
              <button
                onClick={() => setIsScannerOpen(false)}
                className="p-1.5 rounded-full text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Viewfinder Camera Simulation */}
            <div className="relative w-64 h-64 mx-auto bg-black rounded-2xl overflow-hidden border-2 border-emerald-500/80 flex items-center justify-center">
              {/* Corner brackets */}
              <div className="absolute top-2 left-2 w-6 h-6 border-t-2 border-l-2 border-emerald-400" />
              <div className="absolute top-2 right-2 w-6 h-6 border-t-2 border-r-2 border-emerald-400" />
              <div className="absolute bottom-2 left-2 w-6 h-6 border-b-2 border-l-2 border-emerald-400" />
              <div className="absolute bottom-2 right-2 w-6 h-6 border-b-2 border-r-2 border-emerald-400" />

              {/* Animated Laser line */}
              <div className="absolute left-0 right-0 h-0.5 bg-emerald-400 shadow-[0_0_15px_#34d399] animate-pulse top-1/2" />

              <div className="text-center space-y-2 z-10">
                <QrCode className="w-12 h-12 text-emerald-400/80 mx-auto animate-pulse" />
                <span className="text-[10px] text-slate-400 block">Align QR code within box</span>
              </div>

              {scanVerifiedSuccess && (
                <div className="absolute inset-0 bg-emerald-950/95 flex flex-col items-center justify-center gap-2 animate-in zoom-in-95">
                  <Check className="w-12 h-12 text-emerald-400 stroke-[3]" />
                  <span className="text-xs font-bold text-white">QR Code Verified!</span>
                </div>
              )}
            </div>

            {/* Manual Code Input Fallback */}
            <div className="space-y-2 pt-2">
              <label className="text-[10px] text-slate-400 font-bold uppercase block text-left">
                Or enter 6-character Hold Code
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={scanManualCode}
                  onChange={(e) => setScanManualCode(e.target.value.toUpperCase())}
                  placeholder="e.g. H-7K3M9"
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 uppercase"
                />
                <button
                  type="button"
                  onClick={() => handleVerifyScan(scanManualCode)}
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  Verify
                </button>
              </div>

              {scanErrorMessage && (
                <p className="text-[10px] text-rose-400 text-left">{scanErrorMessage}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SCREEN 7: HOLD DETAILS MODAL (Mark Picked Up / Cancel)
      ══════════════════════════════════════════════════════════════════ */}
      {selectedHold && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div>
                <h4 className="text-sm font-bold text-white font-['Outfit']">Hold Pass Details</h4>
                <p className="text-[10px] text-slate-400">Customer in-store collection</p>
              </div>
              <button
                onClick={() => setSelectedHold(null)}
                className="p-1 rounded-full text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Hold Code Box */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between">
              <div>
                <span className="text-[9px] text-slate-400 uppercase font-bold block">Hold Code</span>
                <span className="text-base font-black font-mono text-emerald-400">{selectedHold.holdCode}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(selectedHold.holdCode);
                  setCopiedCode(true);
                  setTimeout(() => setCopiedCode(false), 2000);
                }}
                className="flex items-center gap-1 text-[10px] font-bold bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded-lg text-slate-200"
              >
                {copiedCode ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedCode ? 'Copied' : 'Copy'}</span>
              </button>
            </div>

            {/* Customer & Product Details */}
            <div className="bg-slate-950/60 rounded-2xl p-3.5 space-y-2 text-xs border border-slate-800/80">
              <div className="flex justify-between">
                <span className="text-slate-400">Customer:</span>
                <span className="font-bold text-white">{selectedHold.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Phone:</span>
                <span className="font-bold text-white">{selectedHold.customerPhone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Reserved Item:</span>
                <span className="font-bold text-white truncate max-w-[160px]">{selectedHold.productName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Price to Collect:</span>
                <span className="font-black text-emerald-400">₹{selectedHold.price.toLocaleString('en-IN')}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={() => handleCompleteHold(selectedHold.id)}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 py-3 rounded-2xl text-xs font-bold transition cursor-pointer shadow-lg shadow-emerald-500/20"
              >
                Mark as Picked Up / Complete Sale
              </button>

              <button
                type="button"
                onClick={() => handleCancelHold(selectedHold.id)}
                className="w-full bg-slate-800 hover:bg-rose-950/40 text-rose-400 border border-slate-700 py-2.5 rounded-2xl text-xs font-bold transition cursor-pointer"
              >
                Cancel / Release Hold to Shelf
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SCREEN 4: ADD / EDIT PRODUCT MODAL
      ══════════════════════════════════════════════════════════════════ */}
      {isAddProductOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h4 className="text-sm font-bold text-white font-['Outfit']">Add Product to Physical Shelf</h4>
              <button
                onClick={() => setIsAddProductOpen(false)}
                className="p-1 rounded-full text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddProduct} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Product Title</label>
                <input
                  type="text"
                  value={newProdName}
                  onChange={(e) => setNewProdName(e.target.value)}
                  placeholder="e.g. Apple iPhone 15 128GB Black"
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Category</label>
                  <select
                    value={newProdCategory}
                    onChange={(e) => setNewProdCategory(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Electronics">Electronics</option>
                    <option value="Fashion">Fashion & Footwear</option>
                    <option value="Home">Home & Living</option>
                    <option value="Beauty">Beauty & Cosmetics</option>
                    <option value="Groceries">Groceries</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Price (₹)</label>
                  <input
                    type="number"
                    value={newProdPrice}
                    onChange={(e) => setNewProdPrice(e.target.value)}
                    placeholder="79500"
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Initial Stock Count</label>
                <input
                  type="number"
                  value={newProdStock}
                  onChange={(e) => setNewProdStock(e.target.value)}
                  placeholder="3"
                  min="0"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Description / Shelf Location</label>
                <textarea
                  value={newProdDesc}
                  onChange={(e) => setNewProdDesc(e.target.value)}
                  placeholder="e.g. Counter 2 shelf A. Verified authentic warranty unit."
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddProductOpen(false)}
                  className="flex-1 bg-slate-800 hover:bg-slate-750 text-slate-300 py-3 rounded-xl font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 py-3 rounded-xl font-bold transition cursor-pointer shadow-md shadow-emerald-500/20"
                >
                  Save to Shelf
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          5-TAB BOTTOM NAVIGATION BAR (Dashboard, Products, Holds, Analytics, Profile)
      ══════════════════════════════════════════════════════════════════ */}
      <nav 
        aria-label="Vendor Navigation"
        className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-slate-900/95 backdrop-blur-xl border-t border-slate-800 flex items-center justify-around py-2.5 px-2 z-30 shadow-2xl"
      >
        <button
          type="button"
          onClick={() => setActiveTab('dashboard')}
          className={`flex flex-col items-center gap-1 transition cursor-pointer ${
            activeTab === 'dashboard' ? 'text-emerald-400 font-bold scale-105' : 'text-slate-400 hover:text-slate-300'
          }`}
        >
          <Store className="w-5 h-5" />
          <span className="text-[10px]">Dashboard</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('products')}
          className={`flex flex-col items-center gap-1 transition cursor-pointer ${
            activeTab === 'products' ? 'text-emerald-400 font-bold scale-105' : 'text-slate-400 hover:text-slate-300'
          }`}
        >
          <Package className="w-5 h-5" />
          <span className="text-[10px]">Products</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('holds')}
          className={`flex flex-col items-center gap-1 transition cursor-pointer relative ${
            activeTab === 'holds' ? 'text-emerald-400 font-bold scale-105' : 'text-slate-400 hover:text-slate-300'
          }`}
        >
          <Clock className="w-5 h-5" />
          <span className="text-[10px]">Holds</span>
          {activeHoldsList.length > 0 && (
            <span className="absolute -top-1 right-2 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('analytics')}
          className={`flex flex-col items-center gap-1 transition cursor-pointer ${
            activeTab === 'analytics' ? 'text-emerald-400 font-bold scale-105' : 'text-slate-400 hover:text-slate-300'
          }`}
        >
          <BarChart3 className="w-5 h-5" />
          <span className="text-[10px]">Analytics</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          className={`flex flex-col items-center gap-1 transition cursor-pointer ${
            activeTab === 'profile' ? 'text-emerald-400 font-bold scale-105' : 'text-slate-400 hover:text-slate-300'
          }`}
        >
          <User className="w-5 h-5" />
          <span className="text-[10px]">Profile</span>
        </button>
      </nav>

    </div>
  );
};
